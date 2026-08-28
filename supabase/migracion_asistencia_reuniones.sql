-- ============================================================
-- Migración: asistencia a reuniones como % calculado (objetivo)
-- en vez de puntaje manual dentro de "Participación institucional".
--
-- Se aplica DESPUÉS de policies.sql (asume que ese archivo ya corrió:
-- existen criterios_evaluacion con columnas grupo/orden/origen y el
-- modelo de 17 ítems del periodo 2026, y existe la vista
-- v_evaluacion_docente_detalle).
--
-- Cómo aplicar: pegar y ejecutar TODO este archivo en
-- Supabase Dashboard > SQL Editor. Seguro de correr una sola vez.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabla nueva: asistencia a reuniones convocadas/asistidas
--    por cátedra (mismo patrón que asistencia_clases / mesas)
-- ------------------------------------------------------------

create table asistencia_reuniones (
  id uuid primary key default gen_random_uuid(),
  catedra_id uuid not null references catedras(id) on delete cascade,
  reuniones_convocadas int not null,
  reuniones_asistidas int not null,
  porcentaje_asistencia numeric not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (catedra_id)
);

grant select, insert, update, delete on asistencia_reuniones to authenticated;
alter table asistencia_reuniones enable row level security;
create policy asistencia_reuniones_rw on asistencia_reuniones for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- 2) Habilitar el nuevo origen y reasignar el criterio existente
--    "Participación institucional" (10%, INSTITUCIONAL, orden 3)
--    de carga manual a % objetivo por cátedra.
-- ------------------------------------------------------------

alter table criterios_evaluacion drop constraint if exists criterios_evaluacion_origen_check;
alter table criterios_evaluacion add constraint criterios_evaluacion_origen_check check (
  origen in ('MANUAL', 'OBJETIVO_CLASES_CONTENIDO', 'OBJETIVO_MESAS_EXAMINADORAS', 'OBJETIVO_REUNIONES', 'ENCUESTA_ALUMNOS')
);

update criterios_evaluacion
set origen = 'OBJETIVO_REUNIONES',
    descripcion = 'Asiste a las reuniones institucionales convocadas (reuniones académicas, claustro docente y otros), medido como % de reuniones asistidas sobre las convocadas.'
where codigo = 'PARTICIPACION_INSTITUCIONAL';

-- ------------------------------------------------------------
-- 3) Vista: agregar el cálculo del nuevo origen
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
      round(coalesce(ar.porcentaje_asistencia, 0) * cr.peso_porcentaje / 100, 2)
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
left join asistencia_reuniones ar on ar.catedra_id = c.id
left join evaluacion_criterio_catedra ecc on ecc.catedra_id = c.id and ecc.criterio_id = cr.id
where cr.activo = true and cr.periodo_lectivo = c.periodo_lectivo;
