-- ============================================================
-- Actividades extraordinarias del kiosco de contenido programático
-- ============================================================
-- migracion_contenido_programatico.sql solo deja marcar subtemas del
-- catálogo oficial (el temario que carga Dirección Académica). Edward
-- pidió poder registrar también actividades que no están en ese
-- temario pero que igual son contenido dictado: exámenes parciales,
-- retroalimentaciones de una unidad puntual, o algo excepcional sin
-- tipo fijo.
--
-- A diferencia de contenido_subtema (catálogo oficial compartido por
-- asignatura), estas actividades no tienen catálogo: cada cátedra
-- registra las suyas directamente, con un tipo fijo (examen_parcial /
-- retroalimentacion) o libre (otro, con descripción obligatoria).
--
-- A propósito NO alimentan cumplimiento_contenido ni su trigger: no
-- afectan el % de cumplimiento del temario (que sigue siendo
-- subtemas/unidades oficiales), y tampoco están sujetas al tope de
-- ritmo de migracion_contenido_ritmo_carga.sql (no es "avance de
-- temario", es un registro de que ocurrió un evento puntual). Quedan
-- como constancia visible en el reporte de contenido programático.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

create table if not exists catedra_contenido_actividad_extra (
  id uuid primary key default gen_random_uuid(),
  catedra_id uuid not null references catedras(id) on delete cascade,
  unidad_id uuid references contenido_unidad(id) on delete cascade,
  tipo text not null check (tipo in ('examen_parcial', 'retroalimentacion', 'otro')),
  descripcion text,
  marcado_en timestamptz not null default now(),
  registrado_por uuid references auth.users(id),
  constraint catedra_contenido_actividad_extra_descripcion_otro
    check (tipo <> 'otro' or (descripcion is not null and btrim(descripcion) <> ''))
);

create index if not exists catedra_contenido_actividad_extra_catedra_idx
  on catedra_contenido_actividad_extra (catedra_id);
create index if not exists catedra_contenido_actividad_extra_unidad_idx
  on catedra_contenido_actividad_extra (unidad_id);

grant select, insert, update, delete on catedra_contenido_actividad_extra to authenticated;

alter table catedra_contenido_actividad_extra enable row level security;

drop policy if exists catedra_contenido_actividad_extra_alcance on catedra_contenido_actividad_extra;

-- Mismo criterio que catedra_contenido_avance: lectura y escritura
-- acotadas al alcance de la cátedra, escritura además requiere rol
-- con permiso de carga.
create policy catedra_contenido_actividad_extra_alcance on catedra_contenido_actividad_extra
  for all to authenticated
  using (app_alcanza_catedra(catedra_id))
  with check (app_alcanza_catedra(catedra_id) and app_rol_escribe());

select registrar_migracion('migracion_contenido_actividad_extraordinaria.sql');

notify pgrst, 'reload schema';
