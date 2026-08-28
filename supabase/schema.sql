-- ============================================================
-- Sistema de Evaluación Docente - FCE UNE
-- Esquema completo (12 tablas originales + migraciones aplicadas +
-- vista de reporte). Reconstruido en 2026-08-27 a partir de:
--   - documento OpenAPI de PostgREST del proyecto Cloud original
--     (xdvhfxgubtmjbljfoknc), consultado con la service_role key
--   - policies.sql, carreras_sedes.sql, fix_carreras_sedes.sql,
--     fix_grant_vista_evaluacion.sql, migracion_asistencia_reuniones.sql
--
-- Este archivo aplica directamente el estado FINAL del esquema (no
-- repite el historial de alters intermedios del proyecto original).
-- Usarlo para levantar una instancia nueva desde cero (self-hosted
-- o un proyecto Supabase Cloud nuevo): pegar y ejecutar todo en el
-- SQL Editor, o vía `psql -f schema.sql` / `docker exec -i <db> psql ...`.
-- Después de este archivo NO hace falta correr policies.sql,
-- carreras_sedes.sql, fix_carreras_sedes.sql, fix_grant_vista_evaluacion.sql
-- ni migracion_asistencia_reuniones.sql: ya están todos incorporados acá.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tablas base
-- ------------------------------------------------------------

create table sedes (
  id uuid primary key default gen_random_uuid(),
  codigo varchar(20) not null,
  nombre varchar(150) not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table carreras (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes(id),
  codigo varchar(20) not null,
  nombre varchar(150) not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table asignaturas (
  id uuid primary key default gen_random_uuid(),
  carrera_id uuid not null references carreras(id),
  codigo varchar(20) not null,
  nombre varchar(150) not null,
  curso_nivel int not null,
  horas_totales_programadas int not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table profesores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  documento_identidad varchar(30) not null,
  nombres varchar(100) not null,
  apellidos varchar(100) not null,
  email varchar(150),
  telefono varchar(30),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table catedras (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references profesores(id),
  asignatura_id uuid not null references asignaturas(id),
  sede_id uuid not null references sedes(id),
  periodo_lectivo varchar(10) not null,
  seccion_grupo varchar(20) not null default 'A',
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table criterios_evaluacion (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nombre varchar(100) not null,
  descripcion text,
  peso_porcentaje numeric not null,
  periodo_lectivo varchar(10) not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  grupo text check (grupo in ('INSTITUCIONAL', 'ALUMNOS')),
  orden int,
  origen text check (
    origen in ('MANUAL', 'OBJETIVO_CLASES_CONTENIDO', 'OBJETIVO_MESAS_EXAMINADORAS', 'OBJETIVO_REUNIONES', 'ENCUESTA_ALUMNOS')
  )
);

create table asistencia_clases (
  id uuid primary key default gen_random_uuid(),
  catedra_id uuid not null references catedras(id) unique,
  horas_programadas int not null,
  horas_dictadas int not null,
  porcentaje_asistencia numeric,
  fecha_cierre date default current_date,
  creado_en timestamptz not null default now()
);

create table cumplimiento_contenido (
  id uuid primary key default gen_random_uuid(),
  catedra_id uuid not null references catedras(id) unique,
  unidades_programadas int not null,
  unidades_desarrolladas int not null,
  porcentaje_cumplimiento numeric,
  creado_en timestamptz not null default now()
);

create table asistencia_mesas_examinadoras (
  id uuid primary key default gen_random_uuid(),
  catedra_id uuid not null references catedras(id) unique,
  mesas_convocadas int not null default 0,
  mesas_asistidas int not null default 0,
  porcentaje_asistencia numeric,
  creado_en timestamptz not null default now()
);

create table evaluacion_estudiantes (
  id uuid primary key default gen_random_uuid(),
  catedra_id uuid not null references catedras(id),
  total_encuestados int not null default 0,
  promedio_puntaje numeric not null,
  creado_en timestamptz not null default now()
);

create table asistencia_eventos (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references profesores(id),
  periodo_lectivo varchar(10) not null,
  eventos_convocados int not null default 0,
  eventos_asistidos int not null default 0,
  porcentaje_asistencia numeric,
  creado_en timestamptz not null default now()
);

create table configuracion_importacion_csv (
  id uuid primary key default gen_random_uuid(),
  tabla_destino varchar(100) not null,
  columna_csv varchar(100) not null,
  columna_bd varchar(100) not null,
  tipo_dato varchar(50) not null default 'text',
  es_requerido boolean not null default false,
  creado_en timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2) Tabla nueva: resultado de criterios MANUAL y ENCUESTA_ALUMNOS
--    por cátedra (los OBJETIVO se calculan al vuelo en la vista)
-- ------------------------------------------------------------

create table evaluacion_criterio_catedra (
  id uuid primary key default gen_random_uuid(),
  catedra_id uuid not null references catedras(id) on delete cascade,
  criterio_id uuid not null references criterios_evaluacion(id) on delete restrict,
  valor_ingresado numeric not null,
  total_encuestados int,
  obtenido_porcentaje numeric not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (catedra_id, criterio_id)
);

-- ------------------------------------------------------------
-- 3) Carreras x Sedes (N a N real)
-- ------------------------------------------------------------

create table carreras_sedes (
  id uuid primary key default gen_random_uuid(),
  carrera_id uuid not null references carreras(id) on delete cascade,
  sede_id uuid not null references sedes(id) on delete cascade,
  unique (carrera_id, sede_id)
);

-- ------------------------------------------------------------
-- 4) Asistencia a reuniones (% objetivo por cátedra)
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

-- ------------------------------------------------------------
-- 5) 17 criterios oficiales - Foja de Desempeño, periodo 2026
-- ------------------------------------------------------------

insert into criterios_evaluacion (codigo, nombre, descripcion, peso_porcentaje, periodo_lectivo, activo, grupo, orden, origen)
values
  ('PLANIFICACION_DOCUMENTACION', 'Planificación y documentación pedagógica',
   'Presenta la planificación y documentaciones pedagógicas administrativas en el formato y tiempo establecido.',
   20, '2026', true, 'INSTITUCIONAL', 1, 'MANUAL'),
  ('DESARROLLO_PEDAGOGICO', 'Desarrollo pedagógico de las clases',
   'Cumple con el desarrollo pedagógico de las clases en atención al calendario académico, el estatuto y demás reglamentaciones vigentes en su carácter docente.',
   30, '2026', true, 'INSTITUCIONAL', 2, 'OBJETIVO_CLASES_CONTENIDO'),
  ('PARTICIPACION_INSTITUCIONAL', 'Participación institucional',
   'Asiste a las reuniones institucionales convocadas (reuniones académicas, claustro docente y otros), medido como % de reuniones asistidas sobre las convocadas.',
   10, '2026', true, 'INSTITUCIONAL', 3, 'OBJETIVO_REUNIONES'),
  ('CAPACITACIONES', 'Capacitaciones y formación continua',
   'Participa de capacitaciones y reuniones de formación continua.',
   5, '2026', true, 'INSTITUCIONAL', 4, 'MANUAL'),
  ('ASISTENCIA_EXAMENES_FINALES', 'Asistencia a exámenes finales',
   'Asiste a los exámenes finales para los cuales ha sido designado.',
   10, '2026', true, 'INSTITUCIONAL', 5, 'OBJETIVO_MESAS_EXAMINADORAS'),
  ('ACTIVIDADES_COMPETENCIAS', 'Actividades de desarrollo de competencias',
   'Realiza actividades académicas tendientes al desarrollo de las competencias programadas.',
   5, '2026', true, 'INSTITUCIONAL', 6, 'MANUAL'),
  ('ALU_PUNTUALIDAD', 'Puntualidad',
   'El/la profesor/a cumple con el horario establecido para las actividades académicas',
   2, '2026', true, 'ALUMNOS', 1, 'ENCUESTA_ALUMNOS'),
  ('ALU_ENTREGA_NOTAS', 'Entrega de resultados en tiempo',
   'El/la profesor/a entrega en tiempo el resultado de las evaluaciones',
   2, '2026', true, 'ALUMNOS', 2, 'ENCUESTA_ALUMNOS'),
  ('ALU_DOMINIO_CONTENIDO', 'Dominio del contenido',
   'El/la profesor/a demuestra conocer a profundidad el contenido de la asignatura',
   2, '2026', true, 'ALUMNOS', 3, 'ENCUESTA_ALUMNOS'),
  ('ALU_RESPUESTA_PRECISION', 'Precisión al responder consultas',
   'El/la profesor/a responde con precisión las preguntas o aclaraciones solicitadas por los estudiantes',
   2, '2026', true, 'ALUMNOS', 4, 'ENCUESTA_ALUMNOS'),
  ('ALU_PROGRAMA_CLARO', 'Claridad del programa de la asignatura',
   'El/la profesor/a da a conocer el programa de la asignatura: objetivos, contenidos, metodología y sistema de evaluación de forma clara',
   2, '2026', true, 'ALUMNOS', 5, 'ENCUESTA_ALUMNOS'),
  ('ALU_DESARROLLO_PROGRAMA', 'Desarrollo conforme al programa aprobado',
   'El/la profesor/a desarrolla sus clases conforme al programa de estudios aprobado por el Consejo Directivo',
   2, '2026', true, 'ALUMNOS', 6, 'ENCUESTA_ALUMNOS'),
  ('ALU_METODOLOGIA', 'Metodología de enseñanza',
   'La metodología de enseñanza empleada facilita el aprendizaje (Exposición, simulacro, debate, reflexión, análisis, panel, mesa redonda, etc.)',
   2, '2026', true, 'ALUMNOS', 7, 'ENCUESTA_ALUMNOS'),
  ('ALU_USO_TIC', 'Uso de TIC',
   'El/la profesor/a emplea adecuadamente las TIC para apoyar al proceso de enseñanza aprendizaje (plataformas virtuales, bibliotecas virtuales, internet, simuladores, etc.)',
   2, '2026', true, 'ALUMNOS', 8, 'ENCUESTA_ALUMNOS'),
  ('ALU_EVALUACION_CONTENIDOS', 'Evaluación acorde a contenidos',
   'El/la profesor/a evalúa de acuerdo a los contenidos desarrollados',
   2, '2026', true, 'ALUMNOS', 9, 'ENCUESTA_ALUMNOS'),
  ('ALU_APERTURA_CONSULTAS', 'Apertura a consultas',
   'El/la profesor/a demuestra apertura e interés en las consultas, comentarios u opiniones, y analiza con los estudiantes',
   2, '2026', true, 'ALUMNOS', 10, 'ENCUESTA_ALUMNOS'),
  ('ALU_REVISION_CALIFICACIONES', 'Revisión de calificaciones',
   'El/la profesor/a analiza con los estudiantes los resultados de las evaluaciones, justifica las calificaciones, y es capaz de revisarlas si hay errores',
   2, '2026', true, 'ALUMNOS', 11, 'ENCUESTA_ALUMNOS');

-- ------------------------------------------------------------
-- 6) Grants + RLS: acceso total para authenticated. Único rol = admin.
-- ------------------------------------------------------------

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  sedes,
  carreras,
  asignaturas,
  profesores,
  catedras,
  criterios_evaluacion,
  asistencia_clases,
  cumplimiento_contenido,
  asistencia_mesas_examinadoras,
  evaluacion_criterio_catedra,
  evaluacion_estudiantes,
  asistencia_eventos,
  carreras_sedes,
  asistencia_reuniones,
  configuracion_importacion_csv
to authenticated;

alter table sedes enable row level security;
alter table carreras enable row level security;
alter table asignaturas enable row level security;
alter table profesores enable row level security;
alter table catedras enable row level security;
alter table criterios_evaluacion enable row level security;
alter table asistencia_clases enable row level security;
alter table cumplimiento_contenido enable row level security;
alter table asistencia_mesas_examinadoras enable row level security;
alter table evaluacion_criterio_catedra enable row level security;
alter table evaluacion_estudiantes enable row level security;
alter table asistencia_eventos enable row level security;
alter table carreras_sedes enable row level security;
alter table asistencia_reuniones enable row level security;

create policy sedes_rw on sedes for all to authenticated using (true) with check (true);
create policy carreras_rw on carreras for all to authenticated using (true) with check (true);
create policy asignaturas_rw on asignaturas for all to authenticated using (true) with check (true);
create policy profesores_rw on profesores for all to authenticated using (true) with check (true);
create policy catedras_rw on catedras for all to authenticated using (true) with check (true);
create policy criterios_rw on criterios_evaluacion for all to authenticated using (true) with check (true);
create policy asistencia_clases_rw on asistencia_clases for all to authenticated using (true) with check (true);
create policy cumplimiento_contenido_rw on cumplimiento_contenido for all to authenticated using (true) with check (true);
create policy asistencia_mesas_examinadoras_rw on asistencia_mesas_examinadoras for all to authenticated using (true) with check (true);
create policy evaluacion_criterio_catedra_rw on evaluacion_criterio_catedra for all to authenticated using (true) with check (true);
create policy evaluacion_estudiantes_rw on evaluacion_estudiantes for all to authenticated using (true) with check (true);
create policy asistencia_eventos_rw on asistencia_eventos for all to authenticated using (true) with check (true);
create policy carreras_sedes_rw on carreras_sedes for all to authenticated using (true) with check (true);
create policy asistencia_reuniones_rw on asistencia_reuniones for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- 7) Vista: una fila por (cátedra, criterio activo del periodo),
--    con el % obtenido ya resuelto
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

grant select on v_evaluacion_docente_detalle to authenticated;

notify pgrst, 'reload schema';
