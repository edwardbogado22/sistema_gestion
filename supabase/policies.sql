-- ============================================================
-- Sistema de Evaluación Docente - FCE UNE
-- Migración sobre el esquema REAL ya existente en Supabase
-- (proyecto xdvhfxgubtmjbljfoknc). NO crea las 12 tablas
-- originales (ya existen) — solo:
--   1) políticas RLS de lectura/escritura para el rol authenticated
--   2) constraints únicas aditivas (tablas vacías, sin riesgo)
--   3) altera criterios_evaluacion para el modelo oficial de 17 ítems
--      (Foja de Desempeño: Programa de Evaluación y Acompañamiento
--      Docente) en vez de los 5 indicadores macro que tenía antes
--   4) tabla nueva evaluacion_criterio_catedra
--   5) vista nueva v_evaluacion_docente_detalle
--
-- Cómo aplicar: pegar y ejecutar TODO este archivo en
-- Supabase Dashboard > SQL Editor. Seguro de correr una sola vez;
-- la base está vacía salvo los 5 criterios_evaluacion viejos.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Sacar la vista vieja (depende de criterios_evaluacion.codigo,
--    hay que sacarla antes de poder cambiar el tipo de esa columna)
-- ------------------------------------------------------------

drop view if exists v_reporte_rendimiento_docente;

-- ------------------------------------------------------------
-- 2) Alterar criterios_evaluacion para el modelo de 17 ítems
-- ------------------------------------------------------------

alter table criterios_evaluacion alter column codigo type text;

alter table criterios_evaluacion
  add column if not exists grupo text check (grupo in ('INSTITUCIONAL', 'ALUMNOS')),
  add column if not exists orden int,
  add column if not exists origen text check (
    origen in ('MANUAL', 'OBJETIVO_CLASES_CONTENIDO', 'OBJETIVO_MESAS_EXAMINADORAS', 'ENCUESTA_ALUMNOS')
  );

-- desactivar (no borrar) las 5 filas del modelo viejo
update criterios_evaluacion set activo = false;

-- 17 filas oficiales - Foja de Desempeño, periodo 2026
insert into criterios_evaluacion (codigo, nombre, descripcion, peso_porcentaje, periodo_lectivo, activo, grupo, orden, origen)
values
  ('PLANIFICACION_DOCUMENTACION',
   'Planificación y documentación pedagógica',
   'Presenta la planificación y documentaciones pedagógicas administrativas en el formato y tiempo establecido.',
   20, '2026', true, 'INSTITUCIONAL', 1, 'MANUAL'),
  ('DESARROLLO_PEDAGOGICO',
   'Desarrollo pedagógico de las clases',
   'Cumple con el desarrollo pedagógico de las clases en atención al calendario académico, el estatuto y demás reglamentaciones vigentes en su carácter docente.',
   30, '2026', true, 'INSTITUCIONAL', 2, 'OBJETIVO_CLASES_CONTENIDO'),
  ('PARTICIPACION_INSTITUCIONAL',
   'Participación institucional',
   'Participa de actividades vinculadas a la institución (reuniones académicas, claustro docente y otros)',
   10, '2026', true, 'INSTITUCIONAL', 3, 'MANUAL'),
  ('CAPACITACIONES',
   'Capacitaciones y formación continua',
   'Participa de capacitaciones y reuniones de formación continua.',
   5, '2026', true, 'INSTITUCIONAL', 4, 'MANUAL'),
  ('ASISTENCIA_EXAMENES_FINALES',
   'Asistencia a exámenes finales',
   'Asiste a los exámenes finales para los cuales ha sido designado.',
   10, '2026', true, 'INSTITUCIONAL', 5, 'OBJETIVO_MESAS_EXAMINADORAS'),
  ('ACTIVIDADES_COMPETENCIAS',
   'Actividades de desarrollo de competencias',
   'Realiza actividades académicas tendientes al desarrollo de las competencias programadas.',
   5, '2026', true, 'INSTITUCIONAL', 6, 'MANUAL'),
  ('ALU_PUNTUALIDAD',
   'Puntualidad',
   'El/la profesor/a cumple con el horario establecido para las actividades académicas',
   2, '2026', true, 'ALUMNOS', 1, 'ENCUESTA_ALUMNOS'),
  ('ALU_ENTREGA_NOTAS',
   'Entrega de resultados en tiempo',
   'El/la profesor/a entrega en tiempo el resultado de las evaluaciones',
   2, '2026', true, 'ALUMNOS', 2, 'ENCUESTA_ALUMNOS'),
  ('ALU_DOMINIO_CONTENIDO',
   'Dominio del contenido',
   'El/la profesor/a demuestra conocer a profundidad el contenido de la asignatura',
   2, '2026', true, 'ALUMNOS', 3, 'ENCUESTA_ALUMNOS'),
  ('ALU_RESPUESTA_PRECISION',
   'Precisión al responder consultas',
   'El/la profesor/a responde con precisión las preguntas o aclaraciones solicitadas por los estudiantes',
   2, '2026', true, 'ALUMNOS', 4, 'ENCUESTA_ALUMNOS'),
  ('ALU_PROGRAMA_CLARO',
   'Claridad del programa de la asignatura',
   'El/la profesor/a da a conocer el programa de la asignatura: objetivos, contenidos, metodología y sistema de evaluación de forma clara',
   2, '2026', true, 'ALUMNOS', 5, 'ENCUESTA_ALUMNOS'),
  ('ALU_DESARROLLO_PROGRAMA',
   'Desarrollo conforme al programa aprobado',
   'El/la profesor/a desarrolla sus clases conforme al programa de estudios aprobado por el Consejo Directivo',
   2, '2026', true, 'ALUMNOS', 6, 'ENCUESTA_ALUMNOS'),
  ('ALU_METODOLOGIA',
   'Metodología de enseñanza',
   'La metodología de enseñanza empleada facilita el aprendizaje (Exposición, simulacro, debate, reflexión, análisis, panel, mesa redonda, etc.)',
   2, '2026', true, 'ALUMNOS', 7, 'ENCUESTA_ALUMNOS'),
  ('ALU_USO_TIC',
   'Uso de TIC',
   'El/la profesor/a emplea adecuadamente las TIC para apoyar al proceso de enseñanza aprendizaje (plataformas virtuales, bibliotecas virtuales, internet, simuladores, etc.)',
   2, '2026', true, 'ALUMNOS', 8, 'ENCUESTA_ALUMNOS'),
  ('ALU_EVALUACION_CONTENIDOS',
   'Evaluación acorde a contenidos',
   'El/la profesor/a evalúa de acuerdo a los contenidos desarrollados',
   2, '2026', true, 'ALUMNOS', 9, 'ENCUESTA_ALUMNOS'),
  ('ALU_APERTURA_CONSULTAS',
   'Apertura a consultas',
   'El/la profesor/a demuestra apertura e interés en las consultas, comentarios u opiniones, y analiza con los estudiantes',
   2, '2026', true, 'ALUMNOS', 10, 'ENCUESTA_ALUMNOS'),
  ('ALU_REVISION_CALIFICACIONES',
   'Revisión de calificaciones',
   'El/la profesor/a analiza con los estudiantes los resultados de las evaluaciones, justifica las calificaciones, y es capaz de revisarlas si hay errores',
   2, '2026', true, 'ALUMNOS', 11, 'ENCUESTA_ALUMNOS');

-- ------------------------------------------------------------
-- 3) Constraints aditivas (tablas vacías, sin riesgo) — habilitan
--    upsert(catedra_id) desde el cliente
-- ------------------------------------------------------------

alter table asistencia_clases add constraint asistencia_clases_catedra_id_key unique (catedra_id);
alter table cumplimiento_contenido add constraint cumplimiento_contenido_catedra_id_key unique (catedra_id);
alter table asistencia_mesas_examinadoras add constraint asistencia_mesas_examinadoras_catedra_id_key unique (catedra_id);

-- ------------------------------------------------------------
-- 4) Tabla nueva: resultado de criterios MANUAL y ENCUESTA_ALUMNOS
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
-- 5) Grants a nivel de tabla + RLS: acceso total para authenticated
--    en todas las tablas reales. El esquema preexistente solo tenía
--    GRANT de SELECT para authenticated en algunas tablas — sin el
--    GRANT de INSERT/UPDATE/DELETE, las policies de RLS de abajo no
--    alcanzan (Postgres exige el permiso de tabla ANTES de evaluar
--    RLS; sin esto da "permission denied for table X", no un error
--    de RLS). Único rol = admin.
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
  asistencia_eventos
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

create policy sedes_rw on sedes for all to authenticated using (true) with check (true);
create policy carreras_rw on carreras for all to authenticated using (true) with check (true);
create policy asignaturas_rw on asignaturas for all to authenticated using (true) with check (true);

-- profesores y catedras ya tienen policy de SELECT ("Lectura autenticados ..."); se agregan las de escritura
create policy profesores_write on profesores for insert to authenticated with check (true);
create policy profesores_update on profesores for update to authenticated using (true) with check (true);
create policy profesores_delete on profesores for delete to authenticated using (true);

create policy catedras_write on catedras for insert to authenticated with check (true);
create policy catedras_update on catedras for update to authenticated using (true) with check (true);
create policy catedras_delete on catedras for delete to authenticated using (true);

-- criterios_evaluacion ya tenía policy de SELECT; se agregan las de escritura
create policy criterios_write on criterios_evaluacion for insert to authenticated with check (true);
create policy criterios_update on criterios_evaluacion for update to authenticated using (true) with check (true);
create policy criterios_delete on criterios_evaluacion for delete to authenticated using (true);

create policy asistencia_clases_rw on asistencia_clases for all to authenticated using (true) with check (true);
create policy cumplimiento_contenido_rw on cumplimiento_contenido for all to authenticated using (true) with check (true);
create policy asistencia_mesas_examinadoras_rw on asistencia_mesas_examinadoras for all to authenticated using (true) with check (true);
create policy evaluacion_criterio_catedra_rw on evaluacion_criterio_catedra for all to authenticated using (true) with check (true);

-- se dejan con RLS activado pero sin uso en la app (no participan del modelo de 17 criterios)
create policy evaluacion_estudiantes_rw on evaluacion_estudiantes for all to authenticated using (true) with check (true);
create policy asistencia_eventos_rw on asistencia_eventos for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- 6) Vista nueva: una fila por (cátedra, criterio activo del
--    periodo de esa cátedra), con el % obtenido ya resuelto
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
left join evaluacion_criterio_catedra ecc on ecc.catedra_id = c.id and ecc.criterio_id = cr.id
where cr.activo = true and cr.periodo_lectivo = c.periodo_lectivo;
