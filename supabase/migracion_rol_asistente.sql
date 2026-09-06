-- ============================================================
-- Rol ASISTENTE: check-in de Asistencia a Eventos desde el celular
-- ============================================================
-- Personal de puerta que solo necesita registrar asistencia a eventos
-- (buscar por documento y marcar presente), sin acceso a ningún otro
-- módulo del sistema ni a la gestión/reportes de Eventos (eso sigue
-- siendo exclusivo de ADMIN).
--
-- Cuando este rol carga un profesor nuevo en la fila de ingreso
-- (documento no encontrado), esa alta queda marcada como pendiente de
-- confirmación (profesores.confirmado = false) hasta que Dirección
-- Académica la coteje contra los datos oficiales de la universidad y
-- la confirme desde Configuración → Profesores. Evita que una carga
-- apurada en la puerta genere duplicados o datos mal escritos en la
-- base real de docentes.
--
-- Requiere haber corrido antes migracion_rol_director.sql (usa
-- app_rol()) y migracion_asistencia_eventos.sql (tabla
-- evento_asistencia_registro) y migracion_alta_funcionarios.sql
-- (admin_alta_perfil, que se reemplaza acá).
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Nuevo valor de rol
-- ------------------------------------------------------------

alter table usuarios_perfil drop constraint usuarios_perfil_rol_check;
alter table usuarios_perfil add constraint usuarios_perfil_rol_check
  check (rol in ('ADMIN', 'SECRETARIO', 'DIRECTOR', 'ASISTENTE'));


-- ------------------------------------------------------------
-- 2) ¿Puede registrar asistencia a eventos? (ADMIN o ASISTENTE)
-- ------------------------------------------------------------

create or replace function app_puede_registrar_eventos()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(app_rol() in ('ADMIN', 'ASISTENTE'), false)
$$;

revoke execute on function app_puede_registrar_eventos() from anon, public;
grant execute on function app_puede_registrar_eventos() to authenticated;


-- ------------------------------------------------------------
-- 3) profesores: marca de alta rápida pendiente de cotejar
-- ------------------------------------------------------------

alter table profesores add column if not exists confirmado boolean not null default true;


-- ------------------------------------------------------------
-- 4) evento_asistencia_registro: separar policy de escritura
--    (antes era una sola "for all" solo-admin; ahora el insert lo
--    puede hacer también el asistente, pero editar/borrar sigue
--    siendo solo admin)
-- ------------------------------------------------------------

drop policy if exists evento_asistencia_registro_admin on evento_asistencia_registro;

create policy evento_asistencia_registro_insert on evento_asistencia_registro
  for insert to authenticated with check (app_puede_registrar_eventos());

create policy evento_asistencia_registro_admin_write on evento_asistencia_registro
  for update to authenticated using (app_es_admin()) with check (app_es_admin());

create policy evento_asistencia_registro_admin_delete on evento_asistencia_registro
  for delete to authenticated using (app_es_admin());


-- ------------------------------------------------------------
-- 5) admin_alta_perfil: sumar ASISTENTE a los roles asignables
--    (mismo cuerpo que migracion_alta_funcionarios.sql, un solo
--    cambio en la validación de p_rol)
-- ------------------------------------------------------------

create or replace function admin_alta_perfil(p_email text, p_nombre text, p_rol text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not app_es_admin() then
    raise exception 'Solo Dirección Académica puede dar de alta funcionarios.';
  end if;

  if p_rol not in ('ADMIN', 'SECRETARIO', 'DIRECTOR', 'ASISTENTE') then
    raise exception 'Rol inválido: %', p_rol;
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre completo es obligatorio.';
  end if;

  select id into v_user_id from auth.users where email = btrim(lower(p_email));

  if v_user_id is null then
    raise exception
      'No existe ninguna cuenta con el email %. Creala primero en Supabase → Authentication → Users.', p_email;
  end if;

  insert into usuarios_perfil (user_id, rol, nombre_completo)
  values (v_user_id, p_rol, btrim(p_nombre))
  on conflict (user_id) do update
     set rol = excluded.rol,
         nombre_completo = excluded.nombre_completo,
         activo = true,
         actualizado_en = now();

  return v_user_id;
end;
$$;

revoke execute on function admin_alta_perfil(text, text, text) from anon, public;
grant execute on function admin_alta_perfil(text, text, text) to authenticated;


notify pgrst, 'reload schema';
