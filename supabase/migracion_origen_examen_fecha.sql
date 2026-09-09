-- ============================================================
-- Origen de la fecha (MANUAL / AUTO): purga previa de propuestas
-- automáticas contra el choque de profesor
-- ============================================================
-- Problema reportado: "Distribuir fechas" (examen_distribuir) inserta
-- filas en examen_fecha con estado ASIGNADA, idéntico al de una carga
-- manual. El trigger de choque de profesor (examen_fecha_validar) no
-- distingue una cosa de la otra: si un secretario carga a mano la
-- fecha real de un profesor y esa fecha coincide con una propuesta
-- automática de OTRA cátedra (a veces de otra carrera, invisible por
-- RLS para ese secretario), el trigger bloquea el guardado con "el
-- profesor ya tiene una mesa asignada" — cuando en realidad esa mesa
-- nunca la confirmó nadie, es solo el resultado de un reparto
-- automático.
--
-- Se agrega una columna `origen` (MANUAL | AUTO) para poder
-- distinguir ambos casos:
--   - examen_distribuir() marca sus filas como AUTO.
--   - El panel (PanelFechas.jsx) manda MANUAL explícito en cada
--     guardado, tanto al insertar como al corregir una fecha que
--     antes era AUTO.
--
-- Con eso, examen_fecha_validar() purga la propuesta AUTO en choque
-- en vez de bloquear: la carga real de un secretario siempre le gana
-- a una propuesta que nadie revisó. Un choque entre dos filas MANUAL
-- se sigue bloqueando exactamente como antes.
--
-- De paso, "Redistribuir todo" dejaba de ser seguro: sobrescribía
-- CUALQUIER fila en estado ASIGNADA, incluida la carga manual de los
-- secretarios. Ahora solo reemplaza sus propias propuestas (origen
-- AUTO); el trabajo manual queda intacto pase lo que pase con ese
-- botón.
--
-- Se agrega también examen_purgar_propuestas() para que el admin
-- pueda vaciar a mano las propuestas automáticas de un llamado (o de
-- una carrera puntual) sin esperar a que choquen contra algo.
--
-- Ejecutar completo en el SQL Editor de Supabase, después de
-- migracion_fix_choque_profesor_y_alerta_previa.sql y
-- migracion_exencion_examen.sql (la vista v_examen_agenda que se
-- reemplaza acá parte de esa versión; si esa migración todavía no se
-- corrió en esta base, correrla primero).
-- ============================================================


-- ------------------------------------------------------------
-- 1) Columna origen
-- ------------------------------------------------------------

alter table examen_fecha add column if not exists origen text not null default 'MANUAL'
  check (origen in ('MANUAL', 'AUTO'));


-- ------------------------------------------------------------
-- 2) examen_fecha_validar(): mismo cuerpo que
--    migracion_fix_choque_profesor_y_alerta_previa.sql, con la purga
--    de la propuesta AUTO en vez de bloquear cuando la carga nueva es
--    MANUAL.
-- ------------------------------------------------------------

create or replace function examen_fecha_validar()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_ll        examen_llamado%rowtype;
  v_motivo    text;
  v_optativa  boolean;
  v_materia   text;
  v_choque    record;
begin
  select * into v_ll from examen_llamado where id = new.llamado_id;

  if v_ll.estado <> 'ASIGNACION' then
    raise exception 'El llamado "%" no está abierto para cargar fechas (estado: %).',
      v_ll.nombre, v_ll.estado;
  end if;

  if new.fecha < v_ll.fecha_inicio or new.fecha > v_ll.fecha_fin then
    raise exception 'La fecha % está fuera del rango permitido para "%" (% a %).',
      to_char(new.fecha, 'DD/MM/YYYY'), v_ll.nombre,
      to_char(v_ll.fecha_inicio, 'DD/MM/YYYY'), to_char(v_ll.fecha_fin, 'DD/MM/YYYY');
  end if;

  v_motivo := dia_bloqueado(new.fecha, new.llamado_id);
  if v_motivo is not null then
    raise exception 'No se puede tomar examen el %: %.',
      to_char(new.fecha, 'DD/MM/YYYY'), v_motivo;
  end if;

  -- Solo el admin carga fechas en los llamados marcados como suyos
  if v_ll.asigna_rol = 'ADMIN' and not app_es_admin() then
    raise exception 'Las fechas de "%" las asigna Dirección Académica.', v_ll.nombre;
  end if;

  -- Choque de profesor: corre como security definer para que la
  -- detección no dependa del alcance RLS de quien está guardando. Se
  -- acepta si la materia que se está cargando es optativa; si no lo
  -- es, se revisa contra qué chocó.
  select a.optativa, a.nombre into v_optativa, v_materia
    from catedras c
    join asignaturas a on a.id = c.asignatura_id
   where c.id = new.catedra_id;

  if not coalesce(v_optativa, false) then
    select ef2.id, ef2.fecha, ef2.origen, a2.nombre as materia_choque
      into v_choque
      from examen_fecha ef2
      join catedras c2  on c2.id = ef2.catedra_id
      join asignaturas a2 on a2.id = c2.asignatura_id
      join catedras c1  on c1.id = new.catedra_id
     where ef2.llamado_id = new.llamado_id
       and ef2.fecha = new.fecha
       and ef2.catedra_id <> new.catedra_id
       and ef2.estado <> 'ANULADA'
       and c2.profesor_id = c1.profesor_id
     limit 1;

    if found then
      if v_choque.origen = 'AUTO' and coalesce(new.origen, 'MANUAL') = 'MANUAL' then
        -- Nadie confirmó esa propuesta: cede el lugar a la carga real.
        delete from examen_fecha where id = v_choque.id;
      else
        raise exception
          'El profesor ya tiene asignada la mesa de "%" el %. Como "%" no es una materia optativa, no se puede duplicar: modificá la propuesta.',
          v_choque.materia_choque, to_char(new.fecha, 'DD/MM/YYYY'), v_materia;
      end if;
    end if;
  end if;

  -- Rastro de quién cargó la fecha, sin depender de que el cliente lo mande
  new.asignado_por := coalesce(new.asignado_por, auth.uid());

  return new;
end $$;

drop trigger if exists trg_examen_fecha_validar on examen_fecha;
create trigger trg_examen_fecha_validar
  before insert or update on examen_fecha
  for each row execute function examen_fecha_validar();


-- ------------------------------------------------------------
-- 3) examen_distribuir(): mismo cuerpo que
--    migracion_dias_no_habiles.sql, marcando origen = 'AUTO' y
--    limitando el "sobrescribir" a sus propias propuestas.
-- ------------------------------------------------------------

create or replace function examen_distribuir(p_llamado uuid, p_sobrescribir boolean default false)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_ll        examen_llamado%rowtype;
  r           record;
  v_fecha     date;
  v_asignadas int := 0;
begin
  if not app_es_admin() then
    raise exception 'Solo Dirección Académica puede distribuir fechas automáticamente.';
  end if;

  select * into v_ll from examen_llamado where id = p_llamado;
  if v_ll.id is null then
    raise exception 'El llamado no existe.';
  end if;
  if v_ll.estado <> 'ASIGNACION' then
    raise exception 'El llamado "%" no está abierto para cargar fechas (estado: %).',
      v_ll.nombre, v_ll.estado;
  end if;

  if p_sobrescribir then
    -- Solo se pisan las propuestas automáticas propias: la carga
    -- manual de los secretarios nunca se toca desde este botón.
    delete from examen_fecha where llamado_id = p_llamado and estado = 'ASIGNADA' and origen = 'AUTO';
  end if;

  for r in
    select ag.catedra_id, ag.profesor_id, ag.carrera_id, ag.sede_id,
           ag.curso_nivel, ag.seccion_grupo
      from v_examen_agenda ag
     where ag.llamado_id = p_llamado and ag.fecha is null
     order by ag.carrera, ag.curso_nivel, ag.seccion_grupo, ag.materia
  loop
    select d.dia::date into v_fecha
      from generate_series(v_ll.fecha_inicio::timestamp,
                           v_ll.fecha_fin::timestamp,
                           interval '1 day') as d(dia)
     where dia_bloqueado(d.dia::date, p_llamado) is null
       and not exists (
             select 1 from v_examen_agenda x
              where x.llamado_id = p_llamado and x.fecha = d.dia::date
                and x.carrera_id = r.carrera_id and x.sede_id = r.sede_id
                and x.curso_nivel = r.curso_nivel
                and x.seccion_grupo = r.seccion_grupo)
       and not exists (
             select 1 from v_examen_agenda x
              where x.llamado_id = p_llamado and x.fecha = d.dia::date
                and x.profesor_id = r.profesor_id)
       and not exists (
             select 1 from profesor_no_disponible nd
              where nd.llamado_id = p_llamado
                and nd.profesor_id = r.profesor_id
                and nd.fecha = d.dia::date)
     order by (select count(*) from v_examen_agenda y
                where y.llamado_id = p_llamado and y.fecha = d.dia::date),
              d.dia
     limit 1;

    if v_fecha is not null then
      insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen, asignado_por)
      values (p_llamado, r.catedra_id, v_fecha, 'ASIGNADA', 'AUTO', auth.uid());
      v_asignadas := v_asignadas + 1;
    end if;
  end loop;

  return v_asignadas;
end $$;


-- ------------------------------------------------------------
-- 4) v_examen_agenda: mismo cuerpo que migracion_exencion_examen.sql,
--    con origen agregado al final (misma convención: nunca insertar
--    columnas en el medio, rompe por posición a quien haga select('*')).
-- ------------------------------------------------------------

create or replace view v_examen_agenda as
select
  l.id            as llamado_id,
  l.nombre        as llamado,
  l.tipo          as llamado_tipo,
  l.estado        as llamado_estado,
  l.fecha_inicio,
  l.fecha_fin,
  l.asigna_rol,

  c.id            as catedra_id,
  c.periodo_lectivo,
  c.seccion_grupo,

  s.id            as sede_id,
  s.nombre        as sede,
  car.id          as carrera_id,
  car.nombre      as carrera,

  a.id            as asignatura_id,
  a.codigo        as codigo_materia,
  a.nombre        as materia,
  a.curso_nivel,

  p.id            as profesor_id,
  p.documento_identidad,
  (p.apellidos || ', ' || p.nombres) as profesor,

  ef.id           as examen_fecha_id,
  ef.fecha,
  ef.hora_inicio,
  ef.aula,
  ef.fecha_proforma,
  ef.proforma_referencia,
  ef.observacion,
  ef.estado       as fecha_estado,

  a.optativa,
  ef.asignado_por,
  ef.asignado_en,
  ef.origen
from examen_llamado l
join catedras c    on c.periodo_lectivo = l.periodo_lectivo and c.activo
join asignaturas a on a.id = c.asignatura_id
join carreras car  on car.id = a.carrera_id
join sedes s       on s.id = c.sede_id
join profesores p  on p.id = c.profesor_id
left join examen_fecha ef on ef.llamado_id = l.id and ef.catedra_id = c.id
where not c.exento_examen;

alter view v_examen_agenda set (security_invoker = on);


-- ------------------------------------------------------------
-- 5) examen_fechas_profesor_llamado(): agrega origen, para que el
--    panel distinga una propuesta automática (no bloquea, se avisa)
--    de una carga real (bloquea, como siempre).
-- ------------------------------------------------------------

drop function if exists examen_fechas_profesor_llamado(uuid);

create function examen_fechas_profesor_llamado(p_llamado uuid)
returns table (profesor_id uuid, catedra_id uuid, fecha date, materia text, optativa boolean, origen text)
language sql stable security definer set search_path = public
as $$
  select c.profesor_id, ef.catedra_id, ef.fecha, a.nombre, a.optativa, ef.origen
    from examen_fecha ef
    join catedras c    on c.id = ef.catedra_id
    join asignaturas a on a.id = c.asignatura_id
   where ef.llamado_id = p_llamado
     and ef.estado <> 'ANULADA'
$$;

revoke execute on function examen_fechas_profesor_llamado(uuid) from anon, public;
grant execute on function examen_fechas_profesor_llamado(uuid) to authenticated;


-- ------------------------------------------------------------
-- 6) examen_purgar_propuestas(): para que el admin limpie a mano las
--    propuestas automáticas de un llamado (opcionalmente de una sola
--    carrera), sin esperar a que choquen contra una carga real.
-- ------------------------------------------------------------

create or replace function examen_purgar_propuestas(p_llamado uuid, p_carrera_id uuid default null)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_borradas int;
begin
  if not app_es_admin() then
    raise exception 'Solo Dirección Académica puede purgar propuestas automáticas.';
  end if;

  with candidatas as (
    select ef.id
      from examen_fecha ef
      join catedras c    on c.id = ef.catedra_id
      join asignaturas a on a.id = c.asignatura_id
     where ef.llamado_id = p_llamado
       and ef.origen = 'AUTO'
       and ef.estado = 'ASIGNADA'
       and (p_carrera_id is null or a.carrera_id = p_carrera_id)
  )
  delete from examen_fecha where id in (select id from candidatas);
  get diagnostics v_borradas = row_count;
  return v_borradas;
end $$;

revoke execute on function examen_purgar_propuestas(uuid, uuid) from anon, public;
grant execute on function examen_purgar_propuestas(uuid, uuid) to authenticated;

select registrar_migracion('migracion_origen_examen_fecha.sql');
