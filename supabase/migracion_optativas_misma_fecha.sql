-- ============================================================
-- Optativas del mismo curso y sección: siempre la misma fecha
-- ============================================================
-- Regla de Dirección Académica: las materias optativas de un mismo
-- curso y sección (misma carrera y sede) se toman SIEMPRE el mismo día.
-- Cada alumno rinde solo la optativa que eligió, así que comparten la
-- fecha en lugar de ocupar días distintos del curso.
--
-- examen_distribuir() trataba a las optativas como dos exámenes del
-- mismo curso y por eso las separaba a propósito ("nunca dos exámenes
-- del mismo curso y sección el mismo día"), y en Complementario y
-- Regularización cada una buscaba su propio día de clase.
--
-- Ahora el grupo de optativas se distribuye como una sola mesa:
--   - si alguna optativa del grupo ya tiene fecha, las demás toman esa;
--   - si ninguna tiene, se elige un día válido para todo el grupo
--     (día hábil, sin otro examen del curso fuera del grupo, sin
--     profesor no disponible y, en el Ordinario, sin que un profesor
--     del grupo presida otra mesa ese día);
--   - en Complementario/Regularización se prefiere el día en que dan
--     clase más profesores del grupo (alcanza con uno).
--
-- La sección se compara sin distinguir mayúsculas (hay "UNICA" y
-- "unica" en la base).
--
-- Mismo cuerpo que migracion_complementario_sin_tope.sql para todo lo
-- demás. Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

create or replace function examen_distribuir(p_llamado uuid, p_sobrescribir boolean default false)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_ll          examen_llamado%rowtype;
  v_por_horario boolean;
  r             record;
  v_grupo       uuid[];
  v_fecha       date;
  v_asignadas   int := 0;
  v_n           int;
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
           ag.curso_nivel, ag.seccion_grupo, coalesce(ag.optativa, false) as optativa
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
    -- Una optativa del grupo ya ubicada en esta misma vuelta arrastra a esta
    if exists (select 1 from examen_fecha x where x.llamado_id = p_llamado and x.catedra_id = r.catedra_id) then
      continue;
    end if;

    -- El grupo: todas las optativas del mismo curso/sección, o la cátedra sola
    if r.optativa then
      select array_agg(ag.catedra_id) into v_grupo
        from v_examen_agenda ag
       where ag.llamado_id = p_llamado and coalesce(ag.optativa, false)
         and ag.carrera_id = r.carrera_id and ag.sede_id = r.sede_id
         and ag.curso_nivel = r.curso_nivel
         and upper(ag.seccion_grupo) = upper(r.seccion_grupo);
    else
      v_grupo := array[r.catedra_id];
    end if;

    -- Si otra optativa del grupo ya tiene fecha, se toma esa
    v_fecha := null;
    if r.optativa then
      select x.fecha into v_fecha
        from examen_fecha x
       where x.llamado_id = p_llamado and x.catedra_id = any(v_grupo) and x.estado <> 'ANULADA'
       order by x.fecha
       limit 1;
    end if;

    if v_fecha is null then
      select d.dia::date into v_fecha
        from generate_series(v_ll.fecha_inicio::timestamp,
                             v_ll.fecha_fin::timestamp,
                             interval '1 day') as d(dia)
       where dia_bloqueado(d.dia::date, p_llamado, r.sede_id) is null
         -- Complementario/Regularización: día de clase de al menos un
         -- profesor del grupo
         and (not v_por_horario
              or exists (select 1 from catedra_horario h
                          where h.catedra_id = any(v_grupo)
                            and h.dia_semana = extract(dow from d.dia)))
         -- nunca dos exámenes del mismo curso y sección el mismo día
         -- (las optativas del propio grupo no cuentan: van juntas)
         and not exists (
               select 1 from examen_fecha x
                 join catedras cx    on cx.id = x.catedra_id and cx.activo and not cx.exento_examen
                 join asignaturas ax on ax.id = cx.asignatura_id
                where x.llamado_id = p_llamado and x.fecha = d.dia::date and x.estado <> 'ANULADA'
                  and ax.carrera_id = r.carrera_id and cx.sede_id = r.sede_id
                  and ax.curso_nivel = r.curso_nivel
                  and upper(cx.seccion_grupo) = upper(r.seccion_grupo)
                  and not (x.catedra_id = any(v_grupo)))
         -- Ordinario: ningún profesor del grupo preside otra mesa ese día.
         -- Complementario y Regularización: sin tope.
         and (v_por_horario or not exists (
               select 1 from examen_fecha x
                 join catedras cx on cx.id = x.catedra_id and cx.activo
                 join catedras cg on cg.id = any(v_grupo)
                where x.llamado_id = p_llamado and x.fecha = d.dia::date and x.estado <> 'ANULADA'
                  and cx.profesor_id = cg.profesor_id
                  and not (x.catedra_id = any(v_grupo))))
         and not exists (
               select 1 from profesor_no_disponible nd
                 join catedras cg on cg.id = any(v_grupo)
                where nd.llamado_id = p_llamado
                  and nd.profesor_id = cg.profesor_id
                  and nd.fecha = d.dia::date)
       order by
         -- con horario: primero el día en que dan clase más profesores del grupo
         case when v_por_horario then
           -(select count(distinct h.catedra_id) from catedra_horario h
              where h.catedra_id = any(v_grupo) and h.dia_semana = extract(dow from d.dia))
         else 0 end,
         (select count(*) from examen_fecha y
           where y.llamado_id = p_llamado and y.fecha = d.dia::date and y.estado <> 'ANULADA'),
         d.dia
       limit 1;
    end if;

    if v_fecha is not null then
      insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen, asignado_por)
      select p_llamado, g.id, v_fecha, 'ASIGNADA', 'AUTO', auth.uid()
        from unnest(v_grupo) as g(id)
       where not exists (select 1 from examen_fecha x where x.llamado_id = p_llamado and x.catedra_id = g.id);
      get diagnostics v_n = row_count;
      v_asignadas := v_asignadas + v_n;
    end if;
  end loop;

  return v_asignadas;
end $$;


select registrar_migracion('migracion_optativas_misma_fecha.sql');

notify pgrst, 'reload schema';
