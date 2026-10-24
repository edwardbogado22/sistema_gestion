-- ============================================================
-- Manual de usuario dentro del sistema (/ayuda y botón "?")
-- ============================================================
-- Cada manual pertenece a una pantalla del menú (la ruta `to` de
-- src/lib/navegacion.js, p. ej. '/examenes') o a 'general' (primeros
-- pasos, para todos). La app muestra a cada usuario solo los manuales
-- de las pantallas a las que tiene acceso; acá no se filtra por rol
-- porque el contenido no es sensible y los roles de cada pantalla
-- viven en el frontend.
--
-- contenido es texto con un formato mínimo que interpreta la app
-- (pasos "1.", viñetas "-", subtítulos "##", **negrita**, [1:45] para
-- saltar el video a ese minuto, una línea con la URL de una imagen).
-- videos: [{ "titulo": "...", "url": "https://youtu.be/..." }].
--
-- Lo leen todos los usuarios con sesión si está publicado; los
-- borradores y la edición son solo de Dirección Académica (ADMIN).
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

create table if not exists manual (
  id              uuid primary key default gen_random_uuid(),
  pantalla        text not null,
  titulo          text not null,
  resumen         text,
  contenido       text not null default '',
  videos          jsonb not null default '[]'::jsonb,
  orden           int not null default 0,
  publicado       boolean not null default false,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid default auth.uid() references auth.users(id)
);

create index if not exists manual_pantalla_idx on manual (pantalla, orden);

alter table manual enable row level security;

drop policy if exists manual_lee on manual;
create policy manual_lee on manual
  for select to authenticated using (publicado or app_es_admin());

drop policy if exists manual_admin on manual;
create policy manual_admin on manual
  for all to authenticated using (app_es_admin()) with check (app_es_admin());

revoke all on manual from anon;
grant select, insert, update, delete on manual to authenticated;

select registrar_migracion('migracion_manual_usuario.sql');

notify pgrst, 'reload schema';
