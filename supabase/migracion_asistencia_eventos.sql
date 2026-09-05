-- ============================================================
-- Asistencia a Eventos (reuniones docentes, capacitaciones)
-- ============================================================
-- Reemplaza el Google Apps Script separado "Asistencia FCE" que
-- llevaba su propio registro de profesores duplicado. Acá se usa la
-- tabla profesores real: un docente jubilado/nuevo se da de alta una
-- sola vez y sirve para Cátedras, Asistencia a Clases y Eventos.
--
-- Los eventos son institucionales (no llevan carrera/sede): cualquier
-- autenticado puede consultarlos, solo ADMIN los gestiona (crear,
-- editar, activar/desactivar, registrar asistencia). Requiere haber
-- corrido migracion_roles_alcance.sql (usa app_es_admin()).
--
-- El campo "grupo" es texto libre: eventos con el mismo grupo cuentan
-- como "asistió a cualquiera de estos" en los reportes (para
-- reuniones con fecha de recuperación).
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

create table if not exists evento (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  fecha      date not null,
  grupo      text,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

grant select, insert, update, delete on evento to authenticated;
alter table evento enable row level security;

drop policy if exists evento_lee  on evento;
drop policy if exists evento_admin on evento;

create policy evento_lee on evento
  for select to authenticated using (true);
create policy evento_admin on evento
  for all to authenticated using (app_es_admin()) with check (app_es_admin());


create table if not exists evento_asistencia_registro (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references evento(id) on delete cascade,
  profesor_id     uuid not null references profesores(id) on delete cascade,
  fecha_hora      timestamptz not null default now(),
  registrado_por  uuid references auth.users(id),

  unique (evento_id, profesor_id)
);

create index if not exists evento_asistencia_registro_evento_idx
  on evento_asistencia_registro (evento_id);
create index if not exists evento_asistencia_registro_profesor_idx
  on evento_asistencia_registro (profesor_id);

grant select, insert, update, delete on evento_asistencia_registro to authenticated;
alter table evento_asistencia_registro enable row level security;

drop policy if exists evento_asistencia_registro_lee  on evento_asistencia_registro;
drop policy if exists evento_asistencia_registro_admin on evento_asistencia_registro;

create policy evento_asistencia_registro_lee on evento_asistencia_registro
  for select to authenticated using (true);
create policy evento_asistencia_registro_admin on evento_asistencia_registro
  for all to authenticated using (app_es_admin()) with check (app_es_admin());


notify pgrst, 'reload schema';
