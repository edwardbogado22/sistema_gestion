-- ============================================================
-- Auditoría de guardados del kiosco de contenido programático
-- ============================================================
-- catedra_contenido_avance guarda el ESTADO actual (qué subtemas están
-- marcados) — cada "Guardar y terminar" del kiosco borra e inserta de
-- nuevo, así que no queda rastro de guardados anteriores ni de quién
-- los hizo. Edward pidió poder auditar cuándo y en qué momento se
-- realizó cada carga.
--
-- Esta tabla es un log append-only (no tiene policy de update/delete,
-- así que RLS lo bloquea): una fila por cada vez que se presiona
-- "Guardar y terminar" en el kiosco, con cuántos subtemas quedaron
-- marcados en ese momento y qué usuario logueado (secretaría/admin)
-- lo hizo.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

create table if not exists catedra_contenido_avance_historial (
  id uuid primary key default gen_random_uuid(),
  catedra_id uuid not null references catedras(id) on delete cascade,
  registrado_por uuid references auth.users(id),
  subtemas_marcados int not null,
  registrado_en timestamptz not null default now()
);

create index if not exists catedra_contenido_avance_historial_catedra_idx
  on catedra_contenido_avance_historial (catedra_id);

grant select, insert on catedra_contenido_avance_historial to authenticated;

alter table catedra_contenido_avance_historial enable row level security;

drop policy if exists catedra_contenido_avance_historial_lee on catedra_contenido_avance_historial;
drop policy if exists catedra_contenido_avance_historial_inserta on catedra_contenido_avance_historial;

create policy catedra_contenido_avance_historial_lee on catedra_contenido_avance_historial
  for select to authenticated using (app_alcanza_catedra(catedra_id));

create policy catedra_contenido_avance_historial_inserta on catedra_contenido_avance_historial
  for insert to authenticated with check (app_alcanza_catedra(catedra_id) and app_rol_escribe());

select registrar_migracion('migracion_contenido_auditoria.sql');

notify pgrst, 'reload schema';
