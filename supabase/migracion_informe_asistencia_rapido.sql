-- ============================================================
-- Informe gerencial: asistencia a clases por carrera y sede, rápida
-- ============================================================
-- El informe pedía reporte_asistencia_clases() para el período entero y
-- la base lo cortaba con "canceling statement due to statement timeout":
-- esa función llama a dia_bloqueado() una vez por cada día, cada día de
-- clase y cada cátedra (cientos de miles de llamadas en un año), y además
-- pasa por la RLS fila por fila.
--
-- Esta versión calcula lo mismo, con la misma regla:
--   - días esperados = días de clase del horario (catedra_horario) de cada
--     profesor en cada carrera y sede, menos los días no hábiles
--     (dia_no_habil, globales o de esa sede, fecha puntual o mes+día);
--   - registrados / presentes / ausentes / justificados, de
--     asistencia_clase_registro;
-- pero arma los días no hábiles UNA vez por sede y devuelve el total por
-- carrera y sede (no por profesor), que es lo que usa el informe.
--
-- security definer para no evaluar la RLS fila por fila; el alcance se
-- aplica igual, una vez por carrera y sede: Dirección Académica, la
-- Secretaría de Dirección Académica y el Decanato ven todo; el director y
-- el secretario, solo lo suyo.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

create or replace function informe_asistencia_carrera_sede(p_desde date, p_hasta date)
returns table (
  carrera_id   uuid,
  carrera      text,
  sede_id      uuid,
  sede         text,
  esperadas    bigint,
  presentes    bigint,
  ausentes     bigint,
  justificados bigint
)
language sql stable security definer set search_path = public
as $$
  with dias as (
    select d::date as fecha, extract(dow from d)::smallint as dow
      from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') as d
  ),
  -- profesor, carrera, sede y día de la semana en que da clase
  horario as (
    select distinct c.profesor_id, a.carrera_id, c.sede_id, ch.dia_semana
      from catedras c
      join asignaturas a      on a.id = c.asignatura_id
      join catedra_horario ch on ch.catedra_id = c.id
     where c.activo
  ),
  combos as (
    select distinct h.carrera_id, h.sede_id
      from horario h
     where app_lee_todo() or app_alcanza_carrera(h.carrera_id, h.sede_id)
  ),
  -- días no hábiles de cada sede dentro del rango (misma regla que
  -- dia_bloqueado() con p_llamado null)
  bloqueados as (
    select distinct s.sede_id, d.fecha
      from (select distinct sede_id from combos) s
      cross join dias d
     where exists (
             select 1
               from dia_no_habil n
              where n.activo
                and (n.sede_id is null or n.sede_id = s.sede_id)
                and (n.fecha = d.fecha
                     or (n.mes = extract(month from d.fecha)::smallint
                         and n.dia = extract(day from d.fecha)::smallint))
           )
  ),
  esperadas as (
    select distinct h.profesor_id, h.carrera_id, h.sede_id, d.fecha
      from horario h
      join combos co on co.carrera_id = h.carrera_id and co.sede_id = h.sede_id
      join dias d    on d.dow = h.dia_semana
     where not exists (select 1 from bloqueados b where b.sede_id = h.sede_id and b.fecha = d.fecha)
  )
  select
    e.carrera_id, car.nombre::text,
    e.sede_id, s.nombre::text,
    count(*),
    count(*) filter (where acr.estado = 'PRESENTE'),
    count(*) filter (where acr.estado = 'AUSENTE'),
    count(*) filter (where acr.estado = 'AUSENTE_JUSTIFICADO')
    from esperadas e
    join carreras car on car.id = e.carrera_id
    join sedes s      on s.id = e.sede_id
    left join asistencia_clase_registro acr
      on acr.fecha = e.fecha and acr.profesor_id = e.profesor_id
     and acr.carrera_id = e.carrera_id and acr.sede_id = e.sede_id
   group by e.carrera_id, car.nombre, e.sede_id, s.nombre
   order by car.nombre, s.nombre
$$;

revoke execute on function informe_asistencia_carrera_sede(date, date) from anon, public;
grant execute on function informe_asistencia_carrera_sede(date, date) to authenticated;

select registrar_migracion('migracion_informe_asistencia_rapido.sql');

notify pgrst, 'reload schema';
