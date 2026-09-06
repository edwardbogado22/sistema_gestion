-- ============================================================
-- Registro de entrega del Plan Anual de Clases
-- ============================================================
-- Automatiza el criterio institucional "Planificación y documentación
-- pedagógica" (PLANIFICACION_DOCUMENTACION, 20%), que hasta ahora se
-- cargaba a mano en Cargar Indicadores. Mismo patrón que
-- migracion_asistencia_reuniones.sql (que hizo lo mismo con
-- "Participación institucional"): se agrega una tabla objetivo por
-- cátedra y se reasigna el origen del criterio.
--
-- Entregado (con fecha) = 100% del peso del criterio; sin fecha = 0%.
-- No hay penalización por entrega tardía: la fecha queda visible para
-- que secretaría la juzgue a simple vista.
--
-- Requiere haber corrido antes migracion_asistencia_reuniones.sql (la
-- vista v_evaluacion_docente_detalle que se recrea acá parte de esa
-- versión) y migracion_rol_director.sql (usa app_rol_escribe()).
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabla de entregas, una fila por cátedra
-- ------------------------------------------------------------

create table if not exists plan_anual_entrega (
  id              uuid primary key default gen_random_uuid(),
  catedra_id      uuid not null references catedras(id) on delete cascade,
  fecha_entrega   date,
  observaciones   text,
  registrado_por  uuid references auth.users(id),
  actualizado_en  timestamptz not null default now(),

  unique (catedra_id)
);

grant select, insert, update, delete on plan_anual_entrega to authenticated;
alter table plan_anual_entrega enable row level security;

drop policy if exists plan_anual_entrega_lee     on plan_anual_entrega;
drop policy if exists plan_anual_entrega_escribe on plan_anual_entrega;

-- Lectura: todo el alcance, incluye DIRECTOR (auditoría de solo lectura).
create policy plan_anual_entrega_lee on plan_anual_entrega
  for select to authenticated using (app_alcanza_catedra(catedra_id));

-- Escritura: solo ADMIN/SECRETARIO dentro de su alcance. DIRECTOR queda afuera.
create policy plan_anual_entrega_escribe on plan_anual_entrega
  for all to authenticated
  using (app_alcanza_catedra(catedra_id) and app_rol_escribe())
  with check (app_alcanza_catedra(catedra_id) and app_rol_escribe());


-- ------------------------------------------------------------
-- 2) Habilitar el nuevo origen y reasignar el criterio existente
-- ------------------------------------------------------------

alter table criterios_evaluacion drop constraint if exists criterios_evaluacion_origen_check;
alter table criterios_evaluacion add constraint criterios_evaluacion_origen_check check (
  origen in ('MANUAL', 'OBJETIVO_CLASES_CONTENIDO', 'OBJETIVO_MESAS_EXAMINADORAS', 'OBJETIVO_REUNIONES', 'OBJETIVO_PLAN_ANUAL', 'ENCUESTA_ALUMNOS')
);

update criterios_evaluacion
set origen = 'OBJETIVO_PLAN_ANUAL'
where codigo = 'PLANIFICACION_DOCUMENTACION';


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
    when 'OBJETIVO_PLAN_ANUAL' then
      round((case when pae.fecha_entrega is not null then 100 else 0 end) * cr.peso_porcentaje / 100, 2)
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
left join plan_anual_entrega pae on pae.catedra_id = c.id
left join evaluacion_criterio_catedra ecc on ecc.catedra_id = c.id and ecc.criterio_id = cr.id
where cr.activo = true and cr.periodo_lectivo = c.periodo_lectivo;

-- El GRANT sobre esta vista ya existe (fix_grant_vista_evaluacion.sql) y
-- sobrevive al "create or replace view" de arriba; no hace falta repetirlo.

notify pgrst, 'reload schema';
