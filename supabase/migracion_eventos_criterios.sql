-- ============================================================
-- Automatizar puntos 3 y 4 de la Foja desde Asistencia a Eventos
-- ============================================================
-- Punto 3 "Participación institucional" (10%, origen OBJETIVO_REUNIONES)
-- y punto 4 "Capacitaciones y formación continua" (5%, origen MANUAL)
-- dejan de depender de carga manual y pasan a calcularse desde el
-- check-in real de "evento" / "evento_asistencia_registro".
--
-- Reglas de negocio (definidas por Dirección Académica):
--   - Cada evento se etiqueta con un tipo: REUNION, CAPACITACION_EVALUADA
--     o CAPACITACION_NO_EVALUADA.
--   - Eventos con el mismo "grupo" (ej. fecha original + recuperación)
--     cuentan como UNA sola convocatoria: alcanza con asistir a uno.
--     Eventos sueltos (sin grupo) cuentan cada uno por separado.
--   - Punto 3 = (convocatorias de reunión con asistencia / convocatorias
--     totales del período) x 10%.
--   - Punto 4, por cada capacitación convocada en el período:
--       * no evaluada -> mismo criterio que una reunión (asistió=100%,
--         no asistió=0%).
--       * evaluada -> resultado cargado a mano por Dirección Académica
--         una vez sale la resolución del examen: aprobado=100%,
--         participación parcial=el % que se determine, sin registro=0%.
--     El % final es el PROMEDIO SIMPLE de todas las capacitaciones
--     (evaluadas y no evaluadas) convocadas en el período.
--   - Un evento solo cuenta si su fecha cae dentro de un
--     periodo_academico cargado (mismo criterio que ya usa
--     migracion_asistencia_clases_diaria.sql); si no hay período
--     configurado para esa fecha, el evento queda excluido en
--     silencio del cálculo.
--
-- No se borra nada: asistencia_reuniones y las filas históricas de
-- evaluacion_criterio_catedra para el criterio CAPACITACIONES quedan
-- en la base, la vista simplemente deja de leerlas.
--
-- Requiere haber corrido antes migracion_plan_anual.sql (vista base
-- actual) y migracion_asistencia_clases_diaria.sql (tabla
-- periodo_academico).
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1) evento: tipo (reunión / capacitación evaluada / no evaluada)
-- ------------------------------------------------------------

alter table evento add column if not exists tipo text not null default 'REUNION';
alter table evento drop constraint if exists evento_tipo_check;
alter table evento add constraint evento_tipo_check
  check (tipo in ('REUNION', 'CAPACITACION_EVALUADA', 'CAPACITACION_NO_EVALUADA'));

-- ------------------------------------------------------------
-- 2) capacitacion_resultado: resultado cargado a mano tras la
--    resolución de una capacitación evaluada
-- ------------------------------------------------------------

create table if not exists capacitacion_resultado (
  id                  uuid primary key default gen_random_uuid(),
  profesor_id         uuid not null references profesores(id) on delete cascade,
  clave_capacitacion  text not null,
  periodo_lectivo     varchar(10) not null,
  aprobado            boolean not null,
  porcentaje_obtenido numeric not null check (porcentaje_obtenido between 0 and 100),
  nota                numeric,
  resolucion          text,
  registrado_por      uuid references auth.users(id),
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),

  unique (profesor_id, clave_capacitacion, periodo_lectivo)
);

grant select, insert, update, delete on capacitacion_resultado to authenticated;
alter table capacitacion_resultado enable row level security;

drop policy if exists capacitacion_resultado_lee  on capacitacion_resultado;
drop policy if exists capacitacion_resultado_admin on capacitacion_resultado;

create policy capacitacion_resultado_lee on capacitacion_resultado
  for select to authenticated using (true);
create policy capacitacion_resultado_admin on capacitacion_resultado
  for all to authenticated using (app_es_admin()) with check (app_es_admin());

-- ------------------------------------------------------------
-- 3) criterios_evaluacion: nuevo origen + reasignar CAPACITACIONES
-- ------------------------------------------------------------

alter table criterios_evaluacion drop constraint if exists criterios_evaluacion_origen_check;
alter table criterios_evaluacion add constraint criterios_evaluacion_origen_check check (
  origen in ('MANUAL', 'OBJETIVO_CLASES_CONTENIDO', 'OBJETIVO_MESAS_EXAMINADORAS', 'OBJETIVO_REUNIONES',
             'OBJETIVO_PLAN_ANUAL', 'OBJETIVO_CAPACITACIONES', 'ENCUESTA_ALUMNOS')
);

update criterios_evaluacion
set origen = 'OBJETIVO_CAPACITACIONES'
where codigo = 'CAPACITACIONES';

-- Saneamiento: en algunas instalaciones el criterio "Participación
-- institucional" quedó con origen MANUAL porque
-- migracion_asistencia_reuniones.sql nunca llegó a correrse. Sin este
-- update, el join de reuniones de más abajo no se usa nunca.
update criterios_evaluacion
set origen = 'OBJETIVO_REUNIONES'
where codigo = 'PARTICIPACION_INSTITUCIONAL' and origen <> 'OBJETIVO_REUNIONES';

-- ------------------------------------------------------------
-- 4) Vista: reuniones y capacitaciones calculadas desde eventos
-- ------------------------------------------------------------

create or replace view v_evaluacion_docente_detalle as
select
  c.id as catedra_id,
  c.periodo_lectivo,
  c.seccion_grupo,
  s.nombre as sede,
  car.nombre as carrera,
  asig.nombre as asignatura,
  asig.curso_nivel,
  p.id as profesor_id,
  p.documento_identidad,
  (p.nombres || ' ' || p.apellidos) as profesor_completo,
  cr.id as criterio_id,
  cr.grupo,
  cr.orden,
  cr.nombre as criterio_nombre,
  cr.descripcion as criterio_descripcion,
  cr.peso_porcentaje as ponderacion,
  cr.origen,
  case cr.origen
    when 'OBJETIVO_CLASES_CONTENIDO' then
      round(((coalesce(ac.porcentaje_asistencia, 0) + coalesce(cc.porcentaje_cumplimiento, 0)) / 2)
            * cr.peso_porcentaje / 100, 2)
    when 'OBJETIVO_MESAS_EXAMINADORAS' then
      round(coalesce(ame.porcentaje_asistencia, 0) * cr.peso_porcentaje / 100, 2)
    when 'OBJETIVO_REUNIONES' then
      round(case when reun.convocadas > 0 then reun.asistidas::numeric / reun.convocadas else 0 end
            * cr.peso_porcentaje, 2)
    when 'OBJETIVO_PLAN_ANUAL' then
      round((case when pae.fecha_entrega is not null then 100 else 0 end) * cr.peso_porcentaje / 100, 2)
    when 'OBJETIVO_CAPACITACIONES' then
      round(coalesce(cap.promedio_pct, 0) * cr.peso_porcentaje / 100, 2)
    else
      coalesce(ecc.obtenido_porcentaje, 0)
  end as obtenido_porcentaje
from catedras c
join profesores p on p.id = c.profesor_id
join asignaturas asig on asig.id = c.asignatura_id
join carreras car on car.id = asig.carrera_id
join sedes s on s.id = c.sede_id
cross join criterios_evaluacion cr
left join asistencia_clases ac on ac.catedra_id = c.id
left join cumplimiento_contenido cc on cc.catedra_id = c.id
left join asistencia_mesas_examinadoras ame on ame.catedra_id = c.id
left join plan_anual_entrega pae on pae.catedra_id = c.id
left join evaluacion_criterio_catedra ecc on ecc.catedra_id = c.id and ecc.criterio_id = cr.id
left join lateral (
  select
    count(distinct coalesce(e.grupo, e.id::text)) as convocadas,
    count(distinct case when ear.id is not null then coalesce(e.grupo, e.id::text) end) as asistidas
  from evento e
  join periodo_academico pa2 on e.fecha between pa2.fecha_inicio and pa2.fecha_fin
  left join evento_asistencia_registro ear on ear.evento_id = e.id and ear.profesor_id = p.id
  where e.tipo = 'REUNION' and e.activo = true and pa2.etiqueta_periodo_lectivo = c.periodo_lectivo
) reun on true
left join lateral (
  select avg(x.puntaje) as promedio_pct
  from (
    select
      case
        when bool_and(e.tipo = 'CAPACITACION_NO_EVALUADA')
          then case when bool_or(ear.id is not null) then 100 else 0 end
        else coalesce(max(cres.porcentaje_obtenido), 0)
      end as puntaje
    from evento e
    join periodo_academico pa3 on e.fecha between pa3.fecha_inicio and pa3.fecha_fin
    left join evento_asistencia_registro ear on ear.evento_id = e.id and ear.profesor_id = p.id
    left join capacitacion_resultado cres
      on cres.profesor_id = p.id
     and cres.clave_capacitacion = coalesce(e.grupo, e.id::text)
     and cres.periodo_lectivo = c.periodo_lectivo
    where e.tipo in ('CAPACITACION_EVALUADA', 'CAPACITACION_NO_EVALUADA')
      and e.activo = true and pa3.etiqueta_periodo_lectivo = c.periodo_lectivo
    group by coalesce(e.grupo, e.id::text)
  ) x
) cap on true
where cr.activo = true and cr.periodo_lectivo = c.periodo_lectivo;

-- El GRANT/REVOKE sobre esta vista (migracion_restringir_evaluacion.sql)
-- sobrevive al "create or replace view" de arriba; no hace falta repetirlo.

notify pgrst, 'reload schema';
