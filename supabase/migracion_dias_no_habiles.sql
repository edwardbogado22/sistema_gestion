-- ============================================================
-- Calendario institucional de días no hábiles
-- ============================================================
-- Corrige un problema del diseño anterior: examen_llamado_excepcion
-- es POR LLAMADO, así que un feriado nacional había que volver a
-- cargarlo cada vez. Si alguien se olvidaba una sola vez, el bloqueo
-- desaparecía sin aviso y quedaba habilitado, por ejemplo, un 8 de
-- diciembre.
--
-- Ahora hay dos niveles y ninguna fecha de examen puede caer en
-- ninguno de los dos:
--   dia_no_habil              permanente, vale para todos los llamados
--   examen_llamado_excepcion  puntual, solo para ese llamado
--
-- Los feriados de fecha fija (8 de diciembre) se cargan como
-- recurrentes con mes+día y valen todos los años sin volver a
-- tocarlos. Los de fecha móvil (Semana Santa) se cargan con la fecha
-- concreta de cada año.
--
-- Ejecutar después de migracion_mesas_examinadoras.sql.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Tabla
-- ------------------------------------------------------------

create table if not exists dia_no_habil (
  id        uuid primary key default gen_random_uuid(),
  motivo    text not null,
  ambito    text not null default 'NACIONAL'
            check (ambito in ('NACIONAL', 'INSTITUCIONAL')),

  -- Una de dos: fecha concreta (feriado móvil o evento de un año
  -- puntual) o mes+día (feriado fijo, vale todos los años).
  fecha     date,
  mes       smallint check (mes between 1 and 12),
  dia       smallint check (dia between 1 and 31),

  activo    boolean not null default true,
  creado_en timestamptz not null default now(),

  check (
    (fecha is not null and mes is null and dia is null) or
    (fecha is null and mes is not null and dia is not null)
  )
);

create unique index if not exists dia_no_habil_fecha_idx
  on dia_no_habil (fecha) where fecha is not null;
create unique index if not exists dia_no_habil_recurrente_idx
  on dia_no_habil (mes, dia) where mes is not null;


-- Los domingos no se cargan como 52 filas por año: es una regla del
-- llamado. Se deja configurable porque alguna filial podría tomar
-- exámenes en fin de semana.
alter table examen_llamado
  add column if not exists excluye_domingos boolean not null default true;


-- ------------------------------------------------------------
-- 2) Feriados nacionales del Paraguay (fecha fija)
-- ------------------------------------------------------------
-- Los móviles (Semana Santa) hay que cargarlos por año desde
-- Configuración → Días no hábiles.
-- ------------------------------------------------------------

insert into dia_no_habil (motivo, ambito, mes, dia) values
  ('Año Nuevo',                              'NACIONAL',  1,  1),
  ('Día de los Héroes',                      'NACIONAL',  3,  1),
  ('Día del Trabajador',                     'NACIONAL',  5,  1),
  ('Día de la Independencia Nacional',       'NACIONAL',  5, 14),
  ('Día de la Independencia Nacional',       'NACIONAL',  5, 15),
  ('Paz del Chaco',                          'NACIONAL',  6, 12),
  ('Fundación de Asunción',                  'NACIONAL',  8, 15),
  ('Victoria de Boquerón',                   'NACIONAL',  9, 29),
  ('Día de la Virgen de Caacupé',            'NACIONAL', 12,  8),
  ('Navidad',                                'NACIONAL', 12, 25)
on conflict (mes, dia) do nothing;


-- ------------------------------------------------------------
-- 3) ¿Por qué está bloqueada esta fecha?
-- ------------------------------------------------------------
-- Devuelve el motivo, o null si el día es hábil. Que devuelva el
-- texto y no un booleano es lo que permite decirle al usuario "el
-- 08/12/2026 es Día de la Virgen de Caacupé" en vez de un genérico
-- "fecha inválida".
-- ------------------------------------------------------------

create or replace function dia_bloqueado(p_fecha date, p_llamado uuid default null)
returns text
language sql stable security definer set search_path = public
as $$
  select motivo from (
    -- calendario institucional permanente
    select motivo, 1 as prioridad
      from dia_no_habil
     where activo
       and (fecha = p_fecha
            or (mes = extract(month from p_fecha)::smallint
                and dia = extract(day from p_fecha)::smallint))

    union all

    -- domingos, si el llamado los excluye
    select 'Domingo', 2
      from examen_llamado l
     where l.id = p_llamado
       and l.excluye_domingos
       and extract(dow from p_fecha) = 0

    union all

    -- excepción puntual de este llamado
    select coalesce(motivo, 'Día no hábil de este llamado'), 3
      from examen_llamado_excepcion
     where llamado_id = p_llamado and fecha = p_fecha
  ) x
  order by prioridad
  limit 1
$$;


-- Todos los días bloqueados dentro del rango de un llamado, con los
-- recurrentes ya expandidos al año que corresponde. Es lo que consume
-- el calendario del panel.
create or replace function dias_bloqueados_llamado(p_llamado uuid)
returns table (fecha date, motivo text)
language sql stable security definer set search_path = public
as $$
  select d.dia::date, dia_bloqueado(d.dia::date, p_llamado)
    from examen_llamado l
    cross join lateral generate_series(
      l.fecha_inicio::timestamp, l.fecha_fin::timestamp, interval '1 day'
    ) as d(dia)
   where l.id = p_llamado
     and dia_bloqueado(d.dia::date, p_llamado) is not null
$$;


-- ------------------------------------------------------------
-- 4) El trigger pasa a consultar el calendario completo
-- ------------------------------------------------------------
-- Reemplaza la versión de migracion_mesas_examinadoras.sql, que solo
-- miraba examen_llamado_excepcion.
-- ------------------------------------------------------------

create or replace function examen_fecha_validar()
returns trigger
language plpgsql
as $$
declare
  v_ll      examen_llamado%rowtype;
  v_motivo  text;
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

  if v_ll.asigna_rol = 'ADMIN' and not app_es_admin() then
    raise exception 'Las fechas de "%" las asigna Dirección Académica.', v_ll.nombre;
  end if;

  new.asignado_por := coalesce(new.asignado_por, auth.uid());

  return new;
end $$;


-- ------------------------------------------------------------
-- 5) La distribución automática también respeta el calendario
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
    delete from examen_fecha where llamado_id = p_llamado and estado = 'ASIGNADA';
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
      insert into examen_fecha (llamado_id, catedra_id, fecha, estado, asignado_por)
      values (p_llamado, r.catedra_id, v_fecha, 'ASIGNADA', auth.uid());
      v_asignadas := v_asignadas + 1;
    end if;
  end loop;

  return v_asignadas;
end $$;


-- ------------------------------------------------------------
-- 6) Limpieza de fechas ya cargadas que hoy quedarían bloqueadas
-- ------------------------------------------------------------
-- Si se agrega un feriado después de haber cargado fechas, las que
-- caen ahí quedan inconsistentes. Esto las señala; no las borra solo,
-- para que alguien decida.
-- ------------------------------------------------------------

create or replace view v_examen_fechas_invalidas as
select
  ef.id as examen_fecha_id,
  ag.llamado_id, ag.llamado, ag.carrera, ag.sede,
  ag.curso_nivel, ag.seccion_grupo, ag.materia, ag.profesor,
  ef.fecha,
  dia_bloqueado(ef.fecha, ef.llamado_id) as motivo
from examen_fecha ef
join v_examen_agenda ag on ag.catedra_id = ef.catedra_id and ag.llamado_id = ef.llamado_id
where dia_bloqueado(ef.fecha, ef.llamado_id) is not null;

alter view v_examen_fechas_invalidas set (security_invoker = on);


-- ------------------------------------------------------------
-- 7) Permisos y RLS
-- ------------------------------------------------------------

grant select, insert, update, delete on dia_no_habil to authenticated;
grant select on v_examen_fechas_invalidas to authenticated;
grant execute on function dia_bloqueado(date, uuid)      to authenticated;
grant execute on function dias_bloqueados_llamado(uuid)  to authenticated;
revoke execute on function dia_bloqueado(date, uuid)     from anon, public;
revoke execute on function dias_bloqueados_llamado(uuid) from anon, public;

alter table dia_no_habil enable row level security;

drop policy if exists dia_no_habil_lee   on dia_no_habil;
drop policy if exists dia_no_habil_admin on dia_no_habil;

-- Todos lo leen (el calendario del secretario lo necesita para
-- deshabilitar días); solo el admin lo edita.
create policy dia_no_habil_lee on dia_no_habil
  for select to authenticated using (true);
create policy dia_no_habil_admin on dia_no_habil
  for all to authenticated using (app_es_admin()) with check (app_es_admin());


notify pgrst, 'reload schema';
