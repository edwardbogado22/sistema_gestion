-- ============================================================
-- Horario de clases: carga horaria por día y horas dictadas
-- ============================================================
-- Secretaría arma el horario como una grilla: filas = curso y sección,
-- columnas = días de la semana, y en cada celda profesor, materia y
-- carga horaria. Casi todo eso ya existe:
--   - curso y sección  -> asignaturas.curso_nivel, catedras.seccion_grupo
--   - profesor/materia -> la cátedra
--   - día de la semana -> catedra_horario (migracion_asistencia_clases_diaria.sql)
-- Lo único que faltaba es la CARGA HORARIA: cuántas horas cátedra se
-- dictan esa materia ese día. Se agrega como columna de catedra_horario
-- (una fila por cátedra y día, así que cada día puede tener distinta
-- carga). En blanco = todavía no cargada.
--
-- Con eso, horario_horas_dictadas() estima las horas dictadas por
-- cátedra en un rango de fechas, cruzando el horario con el registro
-- diario de asistencia (asistencia_clase_registro):
--   - esperadas  = días de clase del horario en el rango, menos días no
--                  hábiles (misma regla que el informe gerencial),
--                  multiplicados por las horas de ese día;
--   - dictadas   = las de los días con el titular PRESENTE;
--   - suplente   = ausente, pero con suplente cargado (la clase se dio);
--   - ausentes / justificadas sin suplente, y días sin registro.
-- La asistencia se marca por profesor+carrera+sede+día, así que si un
-- profesor da dos materias el mismo día, la misma marca vale para las
-- dos (mismo criterio que el resto del sistema).
--
-- No cambia nada de lo existente: la asistencia, el informe gerencial y
-- la distribución de exámenes siguen leyendo solo dia_semana.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Carga horaria del día
-- ------------------------------------------------------------
-- Horas cátedra (no reloj). Tope de 12 por día solo para atajar un
-- error de tipeo; la policy catedra_horario_alcance ya existente deja
-- al secretario cargarla en las cátedras de su alcance.

alter table catedra_horario add column if not exists horas smallint;

alter table catedra_horario drop constraint if exists catedra_horario_horas_check;
alter table catedra_horario add constraint catedra_horario_horas_check
  check (horas is null or horas between 1 and 12);

comment on column catedra_horario.horas is
  'Horas cátedra que se dicta la materia ese día. Null = sin cargar.';


-- ------------------------------------------------------------
-- 2) Horas dictadas por cátedra en un rango
-- ------------------------------------------------------------
-- security definer + chequeo de alcance una vez por carrera y sede,
-- igual que informe_asistencia_carrera_sede(): evita la RLS fila por
-- fila y los días no hábiles se arman una sola vez por sede.

create or replace function horario_horas_dictadas(
  p_desde   date,
  p_hasta   date,
  p_carrera uuid default null,
  p_sede    uuid default null,
  p_periodo text default null
)
returns table (
  catedra_id         uuid,
  carrera_id         uuid,
  carrera            text,
  sede_id            uuid,
  sede               text,
  curso_nivel        int,
  seccion_grupo      text,
  materia            text,
  profesor_id        uuid,
  profesor           text,
  horas_programa     int,
  horas_semana       int,
  dias_sin_horas     int,
  clases_esperadas   bigint,
  clases_dictadas    bigint,
  horas_esperadas    bigint,
  horas_dictadas     bigint,
  horas_suplente     bigint,
  horas_ausente      bigint,
  horas_justificadas bigint,
  horas_sin_registro bigint
)
language sql stable security definer set search_path = public
as $$
  with dias as (
    select d::date as fecha, extract(dow from d)::smallint as dow
      from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') as d
  ),
  hor as (
    select c.id as catedra_id, c.profesor_id, a.carrera_id, c.sede_id, ch.dia_semana, ch.horas
      from catedras c
      join asignaturas a      on a.id = c.asignatura_id
      join catedra_horario ch on ch.catedra_id = c.id
     where c.activo
       and (p_carrera is null or a.carrera_id = p_carrera)
       and (p_sede    is null or c.sede_id    = p_sede)
       and (p_periodo is null or c.periodo_lectivo = p_periodo)
       and (app_lee_todo() or app_alcanza_carrera(a.carrera_id, c.sede_id))
  ),
  bloqueados as (
    select distinct s.sede_id, d.fecha
      from (select distinct sede_id from hor) s
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
    select h.catedra_id, h.profesor_id, h.carrera_id, h.sede_id, d.fecha,
           coalesce(h.horas, 0) as horas
      from hor h
      join dias d on d.dow = h.dia_semana
     where not exists (select 1 from bloqueados b where b.sede_id = h.sede_id and b.fecha = d.fecha)
  ),
  agg as (
    select e.catedra_id,
           count(*)                                                    as clases_esperadas,
           count(*) filter (where acr.estado = 'PRESENTE')             as clases_dictadas,
           coalesce(sum(e.horas), 0)                                   as horas_esperadas,
           coalesce(sum(e.horas) filter (where acr.estado = 'PRESENTE'), 0) as horas_dictadas,
           coalesce(sum(e.horas) filter (where acr.estado <> 'PRESENTE'
                                           and acr.profesor_suplente_id is not null), 0) as horas_suplente,
           coalesce(sum(e.horas) filter (where acr.estado = 'AUSENTE'
                                           and acr.profesor_suplente_id is null), 0) as horas_ausente,
           coalesce(sum(e.horas) filter (where acr.estado = 'AUSENTE_JUSTIFICADO'
                                           and acr.profesor_suplente_id is null), 0) as horas_justificadas,
           coalesce(sum(e.horas) filter (where acr.id is null), 0)      as horas_sin_registro
      from esperadas e
      left join asistencia_clase_registro acr
        on acr.fecha = e.fecha and acr.profesor_id = e.profesor_id
       and acr.carrera_id = e.carrera_id and acr.sede_id = e.sede_id
     group by e.catedra_id
  )
  select c.id, a.carrera_id, car.nombre::text, c.sede_id, s.nombre::text,
         a.curso_nivel, c.seccion_grupo::text, a.nombre::text,
         c.profesor_id, (p.apellidos || ', ' || p.nombres)::text,
         a.horas_totales_programadas,
         hs.horas_semana, hs.dias_sin_horas,
         g.clases_esperadas, g.clases_dictadas,
         g.horas_esperadas, g.horas_dictadas, g.horas_suplente,
         g.horas_ausente, g.horas_justificadas, g.horas_sin_registro
    from agg g
    join catedras c    on c.id = g.catedra_id
    join asignaturas a on a.id = c.asignatura_id
    join carreras car  on car.id = a.carrera_id
    join sedes s       on s.id = c.sede_id
    join profesores p  on p.id = c.profesor_id
    cross join lateral (
      select coalesce(sum(ch.horas), 0)::int             as horas_semana,
             (count(*) filter (where ch.horas is null))::int as dias_sin_horas
        from catedra_horario ch
       where ch.catedra_id = c.id
    ) hs
   order by car.nombre, s.nombre, a.curso_nivel, c.seccion_grupo, a.nombre
$$;

revoke execute on function horario_horas_dictadas(date, date, uuid, uuid, text) from anon, public;
grant execute on function horario_horas_dictadas(date, date, uuid, uuid, text) to authenticated;


select registrar_migracion('migracion_horario_clases.sql');

notify pgrst, 'reload schema';
