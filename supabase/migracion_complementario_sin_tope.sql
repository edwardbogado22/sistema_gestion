-- ============================================================
-- Complementario y Regularización: sin tope de mesas por profesor y día
-- ============================================================
-- Con pocas fechas no alcanzaba para cubrir las mesas: en estos dos
-- llamados un profesor que va ese día a la sede puede integrar todas
-- las mesas que hagan falta ese día (como presidente o examinador).
-- El Ordinario no cambia: el profesor sigue sin poder presidir dos
-- mesas el mismo día (salvo optativas, como antes).
--
--   1) examen_fecha_validar(): el control de choque de profesor queda
--      solo para el Ordinario. Resto del cuerpo igual que en
--      migracion_origen_examen_fecha.sql.
--   2) examen_distribuir(): mismo cuerpo que
--      migracion_distribuir_por_horario.sql, sin el control de
--      profesor en Complementario/Regularización, y más rápido: consulta
--      examen_fecha directo en vez de la vista v_examen_agenda por cada
--      día probado.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

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

  -- Complementario y Regularización: un profesor que va ese día a la
  -- sede puede tener todas las mesas que hagan falta (sin tope).
  if v_ll.tipo = 'ORDINARIO' and not coalesce(v_optativa, false) then
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


create or replace function examen_distribuir(p_llamado uuid, p_sobrescribir boolean default false)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_ll        examen_llamado%rowtype;
  v_por_horario boolean;
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

  v_por_horario := v_ll.tipo in ('COMPLEMENTARIO', 'REGULARIZACION');

  if p_sobrescribir then
    -- Solo se pisan las propuestas automáticas propias: la carga
    -- manual nunca se toca desde este botón.
    delete from examen_fecha where llamado_id = p_llamado and estado = 'ASIGNADA' and origen = 'AUTO';
  end if;

  for r in
    select ag.catedra_id, ag.profesor_id, ag.carrera_id, ag.sede_id,
           ag.curso_nivel, ag.seccion_grupo
      from v_examen_agenda ag
     where ag.llamado_id = p_llamado and ag.fecha is null
     -- con horario: primero las materias con menos días posibles, que
     -- son las que más cuesta ubicar
     order by case when v_por_horario then
                (select count(*) from generate_series(v_ll.fecha_inicio::timestamp, v_ll.fecha_fin::timestamp, interval '1 day') g
                  where extract(dow from g) in (select h.dia_semana from catedra_horario h where h.catedra_id = ag.catedra_id))
              else 0 end,
              ag.carrera, ag.curso_nivel, ag.seccion_grupo, ag.materia
  loop
    select d.dia::date into v_fecha
      from generate_series(v_ll.fecha_inicio::timestamp,
                           v_ll.fecha_fin::timestamp,
                           interval '1 day') as d(dia)
     where dia_bloqueado(d.dia::date, p_llamado, r.sede_id) is null
       and (not v_por_horario
            or extract(dow from d.dia) in (select h.dia_semana from catedra_horario h
                                            where h.catedra_id = r.catedra_id))
       -- nunca dos exámenes del mismo curso y sección el mismo día
       and not exists (
             select 1 from examen_fecha x
               join catedras cx    on cx.id = x.catedra_id and cx.activo and not cx.exento_examen
               join asignaturas ax on ax.id = cx.asignatura_id
              where x.llamado_id = p_llamado and x.fecha = d.dia::date and x.estado <> 'ANULADA'
                and ax.carrera_id = r.carrera_id and cx.sede_id = r.sede_id
                and ax.curso_nivel = r.curso_nivel
                and cx.seccion_grupo = r.seccion_grupo)
       -- Ordinario: el profesor no preside dos mesas el mismo día.
       -- Complementario y Regularización: sin tope.
       and (v_por_horario or not exists (
             select 1 from examen_fecha x
               join catedras cx on cx.id = x.catedra_id and cx.activo
              where x.llamado_id = p_llamado and x.fecha = d.dia::date and x.estado <> 'ANULADA'
                and cx.profesor_id = r.profesor_id))
       and not exists (
             select 1 from profesor_no_disponible nd
              where nd.llamado_id = p_llamado
                and nd.profesor_id = r.profesor_id
                and nd.fecha = d.dia::date)
     order by (select count(*) from examen_fecha y
                where y.llamado_id = p_llamado and y.fecha = d.dia::date and y.estado <> 'ANULADA'),
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



select registrar_migracion('migracion_complementario_sin_tope.sql');

notify pgrst, 'reload schema';
