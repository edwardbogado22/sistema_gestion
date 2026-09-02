-- ============================================================
-- Rol DIRECTOR: auditoría de carrera, sin escritura
-- ============================================================
-- Hasta ahora solo existían ADMIN y SECRETARIO (migracion_roles_alcance.sql).
-- Se agrega DIRECTOR (Dirección de Carrera): usa el mismo mecanismo de
-- alcance por carrera/sede que el secretario (usuario_alcance, con
-- sede_id null para "todas las sedes de esa carrera" — el director
-- audita la carrera completa, no una sede puntual), pero es de solo
-- lectura. Cargar fechas de examen y disponibilidad de profesores
-- sigue siendo tarea de SECRETARIO/ADMIN.
--
-- Ejecutar completo en el SQL Editor de Supabase, después de
-- migracion_roles_alcance.sql y migracion_mesas_examinadoras.sql.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Nuevo valor de rol
-- ------------------------------------------------------------

alter table usuarios_perfil drop constraint usuarios_perfil_rol_check;
alter table usuarios_perfil add constraint usuarios_perfil_rol_check
  check (rol in ('ADMIN', 'SECRETARIO', 'DIRECTOR'));


-- ------------------------------------------------------------
-- 2) ¿Este usuario puede escribir dentro de su alcance, o solo
--    auditarlo? DIRECTOR queda afuera a propósito.
-- ------------------------------------------------------------

create or replace function app_rol_escribe()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(app_rol() in ('ADMIN', 'SECRETARIO'), false)
$$;

revoke execute on function app_rol_escribe() from anon, public;
grant execute on function app_rol_escribe() to authenticated;


-- ------------------------------------------------------------
-- 3) examen_fecha: lectura para todo el alcance (incluye DIRECTOR),
--    escritura solo ADMIN/SECRETARIO
-- ------------------------------------------------------------
-- app_alcanza_catedra ya devuelve true para el admin.

drop policy if exists examen_fecha_alcance on examen_fecha;

create policy examen_fecha_lee on examen_fecha
  for select to authenticated using (app_alcanza_catedra(catedra_id));

create policy examen_fecha_escribe on examen_fecha
  for all to authenticated
  using (app_alcanza_catedra(catedra_id) and app_rol_escribe())
  with check (app_alcanza_catedra(catedra_id) and app_rol_escribe());


-- ------------------------------------------------------------
-- 4) profesor_no_disponible: misma idea
-- ------------------------------------------------------------

drop policy if exists profesor_no_disponible_alcance on profesor_no_disponible;

create policy profesor_no_disponible_lee on profesor_no_disponible
  for select to authenticated using (
    app_es_admin() or exists (
      select 1 from catedras c
       where c.profesor_id = profesor_no_disponible.profesor_id
         and app_alcanza_catedra(c.id))
  );

create policy profesor_no_disponible_escribe on profesor_no_disponible
  for all to authenticated
  using (
    app_rol_escribe() and (
      app_es_admin() or exists (
        select 1 from catedras c
         where c.profesor_id = profesor_no_disponible.profesor_id
           and app_alcanza_catedra(c.id))
    )
  )
  with check (
    app_rol_escribe() and (
      app_es_admin() or exists (
        select 1 from catedras c
         where c.profesor_id = profesor_no_disponible.profesor_id
           and app_alcanza_catedra(c.id))
    )
  );


-- ------------------------------------------------------------
-- 5) Alta de un director (plantilla, ejecutar aparte)
-- ------------------------------------------------------------
-- 1. Crear el usuario en Authentication → Users (o usar uno existente).
-- 2. Ejecutar esto con su email y su carrera. sede_id queda null a
--    propósito: el director ve todas las sedes de esa carrera.
--
--   insert into usuarios_perfil (user_id, rol, nombre_completo)
--   select id, 'DIRECTOR', 'Apellido, Nombre'
--     from auth.users where email = 'director@fceune.edu.py'
--   on conflict (user_id) do update
--      set rol = 'DIRECTOR', activo = true, actualizado_en = now();
--
--   insert into usuario_alcance (user_id, carrera_id, sede_id)
--   select u.id, c.id, null
--     from auth.users u, carreras c
--    where u.email = 'director@fceune.edu.py'
--      and c.nombre = 'CONTABILIDAD'
--   on conflict do nothing;
-- ------------------------------------------------------------


notify pgrst, 'reload schema';
