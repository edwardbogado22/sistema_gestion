-- ============================================================
-- Complementario y Regularización: fechas según el horario de clases
-- ============================================================
-- En estos llamados no hay propuesta de los alumnos: Dirección
-- Académica distribuye con "Distribuir fechas". Reglas acordadas:
--
--   1) El examen de una materia cae SOLO en el día de la semana en que
--      esa materia se dicta (catedra_horario): así el titular está en
--      la sede ese día, igual que los vocales (mismas reglas que el
--      Ordinario).
--   2) Nunca dos exámenes del mismo curso y sección el mismo día.
--   3) Complementario: el rango tiene que tener al menos DOS días
--      hábiles de cada día de la semana (dos lunes, dos martes ...).
--      Si un feriado o día no hábil le quita uno, se extiende la fecha
--      de fin hasta el próximo día igual.
--   4) Lo que no entra queda sin fecha, con el motivo, para asignarlo
--      a mano.
--
-- El Ordinario no cambia: examen_distribuir() se comporta como antes
-- para ese tipo de llamado.
--
-- Requiere migracion_origen_examen_fecha.sql y
-- migracion_excluir_sabados.sql. Ejecutar completo en el SQL Editor.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Días hábiles por día de la semana dentro del rango
-- ------------------------------------------------------------

create or replace function examen_llamado_dias_semana(p_llamado uuid)
returns table (dia_semana int, nombre text, habiles int, fechas text)
language sql stable security definer set search_path = public
as $$
  select dw.n,
         (array['Lunes','Martes','Miércoles','Jueves','Viernes'])[dw.n],
         count(d.dia)::int,
         string_agg(to_char(d.dia, 'DD/MM'), ', ' order by d.dia)
    from generate_series(1, 5) as dw(n)
    join examen_llamado l on l.id = p_llamado
    left join lateral (
      select g::date as dia
        from generate_series(l.fecha_inicio::timestamp, l.fecha_fin::timestamp, interval '1 day') g
       where extract(dow from g) = dw.n
         and dia_bloqueado(g::date, p_llamado) is null
    ) d on true
   group by dw.n
   order by dw.n
$$;

revoke execute on function examen_llamado_dias_semana(uuid) from anon, public;
grant execute on function examen_llamado_dias_semana(uuid) to authenticated;


-- ------------------------------------------------------------
-- 2) Extender la fecha de fin hasta tener N días hábiles de cada día
-- ------------------------------------------------------------
-- Solo agranda el rango (nunca lo achica). Devuelve la fecha de fin
-- resultante.

create or replace function examen_llamado_completar_dias(p_llamado uuid, p_minimo int default 2)
returns date
language plpgsql security definer set search_path = public
as $$
declare
  v_ll   examen_llamado%rowtype;
  v_fin  date;
  v_falta boolean;
  v_vueltas int := 0;
begin
  if not app_es_admin() then
    raise exception 'Solo Dirección Académica puede modificar el rango del llamado.';
  end if;

  select * into v_ll from examen_llamado where id = p_llamado;
  if v_ll.id is null then
    raise exception 'El llamado no existe.';
  end if;

  v_fin := v_ll.fecha_fin;
  loop
    select bool_or(cnt < p_minimo) into v_falta
      from (
        select dw.n,
               (select count(*) from generate_series(v_ll.fecha_inicio::timestamp, v_fin::timestamp, interval '1 day') g
                 where extract(dow from g) = dw.n
                   and dia_bloqueado(g::date, p_llamado) is null) as cnt
          from generate_series(1, 5) as dw(n)
      ) x;
    exit when not v_falta;
    v_vueltas := v_vueltas + 1;
    if v_vueltas > 90 then
      raise exception 'No se encontraron % días hábiles de cada día de la semana en los 90 días siguientes: revisá los días no hábiles cargados.', p_minimo;
    end if;
    v_fin := v_fin + 1;
  end loop;

  if v_fin <> v_ll.fecha_fin then
    update examen_llamado set fecha_fin = v_fin, actualizado_en = now() where id = p_llamado;
  end if;
  return v_fin;
end $$;

revoke execute on function examen_llamado_completar_dias(uuid, int) from anon, public;
grant execute on function examen_llamado_completar_dias(uuid, int) to authenticated;


-- ------------------------------------------------------------
-- 3) examen_distribuir(): mismo cuerpo que
--    migracion_origen_examen_fecha.sql, más la regla del día de clase
--    para COMPLEMENTARIO y REGULARIZACION.
-- ------------------------------------------------------------

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
-- 4) Materias que quedaron sin fecha y por qué
-- ------------------------------------------------------------

create or replace function examen_sin_fecha_motivo(p_llamado uuid)
returns table (sede text, carrera text, curso_nivel int, seccion_grupo text, materia text,
               profesor text, dias_de_clase text, motivo text)
language sql stable security definer set search_path = public
as $$
  select ag.sede::text, ag.carrera::text, ag.curso_nivel, ag.seccion_grupo::text, ag.materia::text,
         ag.profesor::text,
         hor.dias,
         case
           when hor.dias is null then 'La materia no tiene horario cargado'
           when pos.posibles = 0 then 'Su día de clase no cae en el rango del llamado (o es feriado)'
           else 'Sus días posibles ya tienen examen de ese curso, o el profesor ya tiene otra mesa ese día'
         end
    from v_examen_agenda ag
    left join lateral (
      select string_agg(case h.dia_semana when 1 then 'Lunes' when 2 then 'Martes' when 3 then 'Miércoles'
                                          when 4 then 'Jueves' when 5 then 'Viernes' end, ', ' order by h.dia_semana) as dias
        from catedra_horario h where h.catedra_id = ag.catedra_id
    ) hor on true
    left join lateral (
      select count(*) as posibles
        from generate_series(ag.fecha_inicio::timestamp, ag.fecha_fin::timestamp, interval '1 day') g
       where dia_bloqueado(g::date, p_llamado, ag.sede_id) is null
         and extract(dow from g) in (select h.dia_semana from catedra_horario h where h.catedra_id = ag.catedra_id)
    ) pos on true
   where ag.llamado_id = p_llamado
     and ag.fecha is null
     and app_alcanza_catedra(ag.catedra_id)
   order by ag.sede, ag.carrera, ag.curso_nivel, ag.seccion_grupo, ag.materia
$$;

revoke execute on function examen_sin_fecha_motivo(uuid) from anon, public;
grant execute on function examen_sin_fecha_motivo(uuid) to authenticated;


select registrar_migracion('migracion_distribuir_por_horario.sql');

notify pgrst, 'reload schema';
