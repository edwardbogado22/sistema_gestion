-- ============================================================
-- Gestión práctica de funcionarios desde la app (sin tocar SQL)
-- ============================================================
-- Crear la cuenta de acceso (email + contraseña) sigue siendo un paso
-- manual en Supabase → Authentication → Users: hacerlo desde el
-- frontend exigiría la service_role key, que no puede viajar al
-- navegador (ver comentario al inicio de Usuarios.jsx).
--
-- Pero antes de esta migración, una cuenta recién creada no aparecía
-- en Configuración → Usuarios hasta que alguien insertara a mano su
-- fila en usuarios_perfil desde el SQL Editor — de ahí la confusión
-- de "agregué el usuario y no aparece en el listado". Estas dos
-- funciones resuelven eso:
--
--   admin_listar_perfiles()  Trae TODAS las cuentas de
--                            Authentication → Users, con su perfil si
--                            ya tiene uno (left join). Las que no
--                            tienen perfil llegan con rol null, así
--                            la pantalla las puede listar como
--                            "Sin rol asignado" en vez de no mostrarlas.
--   admin_alta_perfil(...)   Crea o actualiza el perfil de una cuenta
--                            existente, buscándola por email.
--
-- security definer + chequeo manual de app_es_admin(): ambas corren
-- con privilegios elevados (necesitan leer auth.users, que no es
-- accesible por RLS normal) y por lo tanto NO pasan por las políticas
-- de usuarios_perfil. Si no validaran el rol acá adentro, cualquier
-- autenticado podría llamarlas — admin_alta_perfil incluso podría
-- usarse para autoasignarse ADMIN.
--
-- Ejecutar en el SQL Editor de Supabase, después de
-- migracion_roles_alcance.sql y migracion_rol_director.sql.
-- ============================================================


create or replace function admin_listar_perfiles()
returns table (
  user_id         uuid,
  email           text,
  nombre_completo text,
  rol             text,
  activo          boolean,
  creado_en       timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    u.email,
    up.nombre_completo,
    up.rol,
    up.activo,
    coalesce(up.creado_en, u.created_at)
    from auth.users u
    left join usuarios_perfil up on up.user_id = u.id
   where app_es_admin()
   order by (up.rol is null) desc, up.nombre_completo nulls last, u.email
$$;

revoke execute on function admin_listar_perfiles() from anon, public;
grant execute on function admin_listar_perfiles() to authenticated;


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

  if p_rol not in ('ADMIN', 'SECRETARIO', 'DIRECTOR') then
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
