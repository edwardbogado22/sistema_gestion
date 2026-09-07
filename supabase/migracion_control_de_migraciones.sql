-- ============================================================
-- Control de migraciones
-- ============================================================
-- Hasta ahora no había forma de saber con certeza qué migraciones ya
-- se corrieron en esta base: 21 archivos sueltos en supabase/, cada
-- uno pegado a mano en el SQL Editor, confiando en la memoria. Dos
-- veces esta sesión eso salió mal en silencio: un criterio que debía
-- quedar en OBJETIVO_REUNIONES seguía en MANUAL porque esa migración
-- nunca se corrió, y recalcular_asistencia_mesas() estuvo rota desde
-- que se creó porque una columna se volvió generada por fuera de
-- cualquier migración versionada acá.
--
-- Esta migración agrega una tabla que registra qué migración se
-- corrió y cuándo, más una función para que las migraciones futuras
-- se registren solas al final. No reemplaza un migration runner de
-- verdad, pero con esto alcanza para responder "¿esto ya se corrió?"
-- sin adivinar.
--
-- CONVENCIÓN A PARTIR DE ACÁ: toda migración nueva termina con
--   select registrar_migracion('nombre_del_archivo.sql');
-- (ver el final de este mismo archivo como ejemplo). Si un archivo
-- ya se registró antes, la llamada no hace nada (on conflict do
-- nothing) — correr una migración dos veces por error no rompe el
-- registro, aunque sí puede romper el resto del script si no es
-- idempotente por su cuenta (mismo cuidado de siempre).
--
-- Ejecutar completo en el SQL Editor de Supabase. Es la primera
-- migración de este archivo de control, así que se ejecuta una sola
-- vez; después, cada migración nueva se autorregistra.
-- ============================================================

create table if not exists schema_migrations (
  id           bigint generated always as identity primary key,
  nombre       text not null unique,
  aplicada_en  timestamptz not null default now(),
  notas        text
);

grant select on schema_migrations to authenticated;
alter table schema_migrations enable row level security;

drop policy if exists schema_migrations_lee  on schema_migrations;
drop policy if exists schema_migrations_admin on schema_migrations;

create policy schema_migrations_lee on schema_migrations
  for select to authenticated using (true);
create policy schema_migrations_admin on schema_migrations
  for all to authenticated using (app_es_admin()) with check (app_es_admin());


create or replace function registrar_migracion(p_nombre text, p_notas text default null)
returns void
language plpgsql
as $$
begin
  insert into schema_migrations (nombre, notas)
  values (p_nombre, p_notas)
  on conflict (nombre) do nothing;
end;
$$;

grant execute on function registrar_migracion(text, text) to authenticated;
revoke execute on function registrar_migracion(text, text) from anon, public;


-- ------------------------------------------------------------
-- Baseline retroactivo: los 21 archivos que ya existían en el repo
-- al momento de crear esta tabla (2026-09-07), en orden aproximado
-- de dependencia — NO es el orden histórico real en el que se
-- corrieron, que no quedó registrado en ningún lado. Se cargan todos
-- con la misma fecha para que quede claro que es una foto de arranque,
-- no un historial reconstruido.
-- ------------------------------------------------------------

insert into schema_migrations (nombre, notas) values
  ('schema.sql',                                    'baseline retroactivo, orden aproximado'),
  ('policies.sql',                                   'baseline retroactivo, orden aproximado'),
  ('carreras_sedes.sql',                              'baseline retroactivo, orden aproximado'),
  ('fix_carreras_sedes.sql',                          'baseline retroactivo, orden aproximado'),
  ('fix_grant_vista_evaluacion.sql',                  'baseline retroactivo, orden aproximado'),
  ('migracion_roles_alcance.sql',                     'baseline retroactivo, orden aproximado'),
  ('migracion_rol_director.sql',                      'baseline retroactivo, orden aproximado'),
  ('migracion_alta_funcionarios.sql',                 'baseline retroactivo, orden aproximado'),
  ('migracion_dias_no_habiles.sql',                   'baseline retroactivo, orden aproximado'),
  ('migracion_asistencia_clases_diaria.sql',          'baseline retroactivo, orden aproximado'),
  ('migracion_asistencia_reuniones.sql',              'baseline retroactivo, orden aproximado'),
  ('migracion_asistencia_eventos.sql',                'baseline retroactivo, orden aproximado'),
  ('migracion_rol_asistente.sql',                     'baseline retroactivo, orden aproximado'),
  ('migracion_asistente_autocorreccion.sql',          'baseline retroactivo, orden aproximado'),
  ('migracion_plan_anual.sql',                        'baseline retroactivo, orden aproximado'),
  ('migracion_restringir_evaluacion.sql',             'baseline retroactivo, orden aproximado'),
  ('migracion_eventos_criterios.sql',                 'baseline retroactivo, orden aproximado'),
  ('migracion_mesas_examinadoras.sql',                'baseline retroactivo, orden aproximado'),
  ('migracion_examen_optativas.sql',                  'baseline retroactivo, orden aproximado'),
  ('migracion_choque_cruzado_y_panel_admin.sql',      'baseline retroactivo, orden aproximado'),
  ('migracion_fix_recalcular_asistencia_mesas.sql',   'baseline retroactivo, orden aproximado')
on conflict (nombre) do nothing;

select registrar_migracion('migracion_control_de_migraciones.sql');

notify pgrst, 'reload schema';
