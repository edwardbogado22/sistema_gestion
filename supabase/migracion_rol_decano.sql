-- ============================================================
-- Rol DECANO: consulta de toda la facultad para el informe gerencial
-- ============================================================
-- El Decanato ve toda la facultad en modo consulta, igual que la
-- Secretaría de Dirección Académica: informe gerencial, foja, reportes
-- de asistencia, mesas y eventos. No carga ni modifica nada
-- (app_rol_escribe() sigue siendo solo ADMIN y SECRETARIO).
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================


-- 1) Nuevo valor de rol
alter table usuarios_perfil drop constraint usuarios_perfil_rol_check;
alter table usuarios_perfil add constraint usuarios_perfil_rol_check
  check (rol in ('ADMIN', 'SECRETARIO', 'DIRECTOR', 'ASISTENTE', 'SECRETARIA_ACADEMICA', 'DECANO'));


-- 2) Lectura de toda la facultad: las policies *_lee_todo, la foja
--    (v_evaluacion_docente_ver), las actas y la consulta de mesas ya
--    preguntan por app_lee_todo().
create or replace function app_lee_todo()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(app_rol() in ('ADMIN', 'SECRETARIA_ACADEMICA', 'DECANO'), false)
$$;

revoke execute on function app_lee_todo() from anon, public;
grant execute on function app_lee_todo() to authenticated;


-- 3) Una policy de lectura por tabla, también para las tablas creadas
--    después de migracion_rol_secretaria_academica.sql (mismo bucle).
do $$
declare
  t record;
  nombre text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    nombre := format('%s_lee_todo', t.relname);
    execute format('drop policy if exists %I on public.%I', nombre, t.relname);
    execute format('create policy %I on public.%I for select to authenticated using (app_lee_todo())', nombre, t.relname);
  end loop;
end $$;


-- 4) admin_alta_perfil: DECANO entre los roles asignables
--    (mismo cuerpo que migracion_rol_secretaria_academica.sql)
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

  if p_rol not in ('ADMIN', 'SECRETARIO', 'DIRECTOR', 'ASISTENTE', 'SECRETARIA_ACADEMICA', 'DECANO') then
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


select registrar_migracion('migracion_rol_decano.sql');

notify pgrst, 'reload schema';
