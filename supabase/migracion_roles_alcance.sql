-- ============================================================
-- Roles de aplicación y alcance por carrera/sede
-- ============================================================
-- Hasta ahora el sistema no tenía roles: TODAS las políticas eran
-- "for all to authenticated using (true) with check (true)", o sea
-- que cualquier usuario logueado podía leer y escribir todo. Como la
-- anon key viaja en el frontend, esconder botones en React no
-- restringe nada; la restricción real tiene que estar acá.
--
-- Esta migración introduce dos roles:
--   ADMIN       Dirección Académica. Acceso total, como hasta hoy.
--   SECRETARIO  Secretaría de Carrera. Solo ve los datos de las
--               carreras/sedes que tenga asignadas, y de momento
--               en modo lectura: la escritura la va a habilitar el
--               módulo de mesas examinadoras sobre sus propias
--               tablas (migración siguiente).
--
-- IMPORTANTE: antes de ejecutar, completar el email del paso 4.
-- Si no queda ningún ADMIN cargado, el paso 5 aborta la transacción
-- a propósito para no dejarte afuera del sistema.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Tablas de rol y alcance
-- ------------------------------------------------------------

create table if not exists usuarios_perfil (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  rol             text not null check (rol in ('ADMIN', 'SECRETARIO')),
  nombre_completo text not null,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

-- Alcance del secretario. Varias filas por usuario = cubre varias
-- carreras. sede_id null = todas las sedes donde se dicta esa carrera
-- (escape hatch; lo normal es cargar la sede).
create table if not exists usuario_alcance (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  carrera_id uuid not null references carreras(id) on delete cascade,
  sede_id    uuid references sedes(id) on delete cascade,
  creado_en  timestamptz not null default now(),
  unique (user_id, carrera_id, sede_id)
);

create index if not exists usuario_alcance_user_idx on usuario_alcance (user_id);


-- ------------------------------------------------------------
-- 2) Funciones de alcance
-- ------------------------------------------------------------
-- security definer + search_path fijo por dos motivos:
--   a) evitan la recursión infinita de RLS (la policy de
--      usuarios_perfil llama a app_es_admin(), que lee
--      usuarios_perfil);
--   b) impiden el secuestro de esquema.
-- ------------------------------------------------------------

create or replace function app_rol()
returns text
language sql stable security definer set search_path = public
as $$
  select rol from usuarios_perfil where user_id = auth.uid() and activo
$$;

create or replace function app_es_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(app_rol() = 'ADMIN', false)
$$;

-- ¿El usuario actual alcanza esta carrera (opcionalmente en esta sede)?
-- p_sede null = la pregunta no discrimina por sede.
create or replace function app_alcanza_carrera(p_carrera uuid, p_sede uuid default null)
returns boolean
language sql stable security definer set search_path = public
as $$
  select app_es_admin() or exists (
    select 1
      from usuario_alcance ua
     where ua.user_id = auth.uid()
       and ua.carrera_id = p_carrera
       and (ua.sede_id is null or p_sede is null or ua.sede_id = p_sede)
  )
$$;

-- ¿El usuario actual alcanza esta cátedra?
-- La carrera sale de la asignatura; la sede, de la propia cátedra.
create or replace function app_alcanza_catedra(p_catedra uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select app_es_admin() or exists (
    select 1
      from catedras c
      join asignaturas a       on a.id = c.asignatura_id
      join usuario_alcance ua  on ua.carrera_id = a.carrera_id
     where c.id = p_catedra
       and ua.user_id = auth.uid()
       and (ua.sede_id is null or ua.sede_id = c.sede_id)
  )
$$;

revoke execute on function app_rol()                        from anon, public;
revoke execute on function app_es_admin()                   from anon, public;
revoke execute on function app_alcanza_carrera(uuid, uuid)  from anon, public;
revoke execute on function app_alcanza_catedra(uuid)        from anon, public;

grant execute on function app_rol()                        to authenticated;
grant execute on function app_es_admin()                   to authenticated;
grant execute on function app_alcanza_carrera(uuid, uuid)  to authenticated;
grant execute on function app_alcanza_catedra(uuid)        to authenticated;


-- ------------------------------------------------------------
-- 3) RLS de las tablas nuevas
-- ------------------------------------------------------------

grant select, insert, update, delete on usuarios_perfil, usuario_alcance to authenticated;

alter table usuarios_perfil enable row level security;
alter table usuario_alcance enable row level security;

drop policy if exists usuarios_perfil_propio on usuarios_perfil;
drop policy if exists usuarios_perfil_admin  on usuarios_perfil;
drop policy if exists usuario_alcance_propio on usuario_alcance;
drop policy if exists usuario_alcance_admin  on usuario_alcance;

-- Cada uno lee su propio perfil (lo necesita el login para saber su rol)
create policy usuarios_perfil_propio on usuarios_perfil
  for select to authenticated using (user_id = auth.uid());

-- Solo el admin administra perfiles
create policy usuarios_perfil_admin on usuarios_perfil
  for all to authenticated using (app_es_admin()) with check (app_es_admin());

create policy usuario_alcance_propio on usuario_alcance
  for select to authenticated using (user_id = auth.uid());

create policy usuario_alcance_admin on usuario_alcance
  for all to authenticated using (app_es_admin()) with check (app_es_admin());


-- ------------------------------------------------------------
-- 4) >>> CARGAR EL ADMIN ANTES DE SEGUIR <<<
-- ------------------------------------------------------------
-- Reemplazar el email por el del usuario administrador que ya existe
-- en Authentication → Users. Si el email no coincide con ninguno, no
-- inserta nada y el paso 5 aborta toda la migración.
-- ------------------------------------------------------------

insert into usuarios_perfil (user_id, rol, nombre_completo)
select id, 'ADMIN', 'Dirección Académica'
  from auth.users
 where email = 'CAMBIAR-POR-TU-EMAIL@fceune.edu.py'
on conflict (user_id) do update
   set rol = 'ADMIN', activo = true, actualizado_en = now();


-- ------------------------------------------------------------
-- 5) Red de seguridad contra el bloqueo
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from usuarios_perfil where rol = 'ADMIN' and activo) then
    raise exception
      'ABORTADO: no hay ningún ADMIN activo en usuarios_perfil. Corregí el email del paso 4 y volvé a ejecutar; si no, las políticas del paso 6 te dejarían sin acceso.';
  end if;
end $$;


-- ------------------------------------------------------------
-- 6) Reemplazo de las políticas abiertas
-- ------------------------------------------------------------
-- Se borran por catálogo y no por nombre: la base real acumuló
-- políticas de tres orígenes distintos (el esquema preexistente con
-- nombres tipo "Lectura autenticados ...", schema.sql con los *_rw y
-- policies.sql con los *_write/_update/_delete). Borrar por nombre
-- dejaría políticas huérfanas que siguen abriendo el acceso, porque
-- en Postgres las policies de un mismo comando se combinan con OR:
-- basta una sola using(true) sobreviviente para anular todo esto.
-- ------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in (
         'sedes', 'carreras', 'carreras_sedes', 'asignaturas', 'profesores',
         'catedras', 'criterios_evaluacion', 'asistencia_clases',
         'cumplimiento_contenido', 'asistencia_mesas_examinadoras',
         'asistencia_reuniones', 'evaluacion_criterio_catedra',
         'evaluacion_estudiantes', 'asistencia_eventos'
       )
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;


-- --- 6.a) Catálogos de referencia -----------------------------
-- Lectura para todos los autenticados: el secretario los necesita
-- para dibujar los filtros y las etiquetas. No son datos sensibles.
-- Escritura solo ADMIN.

create policy sedes_lee on sedes
  for select to authenticated using (true);
create policy sedes_admin on sedes
  for all to authenticated using (app_es_admin()) with check (app_es_admin());

create policy carreras_lee on carreras
  for select to authenticated using (true);
create policy carreras_admin on carreras
  for all to authenticated using (app_es_admin()) with check (app_es_admin());

create policy carreras_sedes_lee on carreras_sedes
  for select to authenticated using (true);
create policy carreras_sedes_admin on carreras_sedes
  for all to authenticated using (app_es_admin()) with check (app_es_admin());

create policy criterios_lee on criterios_evaluacion
  for select to authenticated using (true);
create policy criterios_admin on criterios_evaluacion
  for all to authenticated using (app_es_admin()) with check (app_es_admin());


-- --- 6.b) Asignaturas: acotadas por carrera -------------------

create policy asignaturas_lee on asignaturas
  for select to authenticated using (app_alcanza_carrera(carrera_id));
create policy asignaturas_admin on asignaturas
  for all to authenticated using (app_es_admin()) with check (app_es_admin());


-- --- 6.c) Cátedras: acotadas por carrera + sede ---------------
-- El secretario las ve pero no las modifica: dar de alta cátedras
-- sigue siendo de Dirección Académica.

create policy catedras_lee on catedras
  for select to authenticated using (app_alcanza_catedra(id));
create policy catedras_admin on catedras
  for all to authenticated using (app_es_admin()) with check (app_es_admin());


-- --- 6.d) Profesores: solo los que dictan en su alcance -------
-- La tabla tiene documento_identidad, nombres y apellidos: es el
-- dato personal más sensible del sistema. El secretario ve solo a
-- los profesores con cátedra dentro de su alcance.

create policy profesores_lee on profesores
  for select to authenticated using (
    app_es_admin() or exists (
      select 1 from catedras c
       where c.profesor_id = profesores.id
         and app_alcanza_catedra(c.id)
    )
  );
create policy profesores_admin on profesores
  for all to authenticated using (app_es_admin()) with check (app_es_admin());


-- --- 6.e) Datos de evaluación: solo ADMIN ---------------------
-- Son el insumo de la Foja de Desempeño y los carga Dirección
-- Académica. El secretario no interviene en este circuito.
-- (asistencia_mesas_examinadoras la va a escribir la función de
-- recálculo del módulo de mesas, que corre como security definer.)

create policy asistencia_clases_admin on asistencia_clases
  for all to authenticated using (app_es_admin()) with check (app_es_admin());
create policy cumplimiento_contenido_admin on cumplimiento_contenido
  for all to authenticated using (app_es_admin()) with check (app_es_admin());
create policy asistencia_mesas_admin on asistencia_mesas_examinadoras
  for all to authenticated using (app_es_admin()) with check (app_es_admin());
create policy asistencia_reuniones_admin on asistencia_reuniones
  for all to authenticated using (app_es_admin()) with check (app_es_admin());
create policy evaluacion_criterio_catedra_admin on evaluacion_criterio_catedra
  for all to authenticated using (app_es_admin()) with check (app_es_admin());
create policy evaluacion_estudiantes_admin on evaluacion_estudiantes
  for all to authenticated using (app_es_admin()) with check (app_es_admin());
create policy asistencia_eventos_admin on asistencia_eventos
  for all to authenticated using (app_es_admin()) with check (app_es_admin());


-- ------------------------------------------------------------
-- 7) La vista tiene que respetar RLS
-- ------------------------------------------------------------
-- Sin esto, todo lo anterior tiene una filtración: una vista corre
-- por defecto con los permisos de su dueño, así que
-- v_evaluacion_docente_detalle le devolvería a un secretario la
-- evaluación de TODA la facultad, salteando las policies de las
-- tablas que consulta. security_invoker la hace evaluar con el
-- usuario que la llama. (Requiere PostgreSQL 15+.)
-- ------------------------------------------------------------

alter view v_evaluacion_docente_detalle set (security_invoker = on);


-- ------------------------------------------------------------
-- 8) Alta de un secretario (plantilla, ejecutar aparte)
-- ------------------------------------------------------------
-- 1. Crear el usuario en Authentication → Users.
-- 2. Ejecutar esto con su email y sus carreras/sedes.
--
--   insert into usuarios_perfil (user_id, rol, nombre_completo)
--   select id, 'SECRETARIO', 'Apellido, Nombre'
--     from auth.users where email = 'secretario@fceune.edu.py'
--   on conflict (user_id) do update
--      set rol = 'SECRETARIO', activo = true, actualizado_en = now();
--
--   insert into usuario_alcance (user_id, carrera_id, sede_id)
--   select u.id, c.id, s.id
--     from auth.users u, carreras c, sedes s
--    where u.email = 'secretario@fceune.edu.py'
--      and c.nombre = 'CONTABILIDAD'
--      and s.nombre = 'Sede Central'
--   on conflict do nothing;
-- ------------------------------------------------------------


notify pgrst, 'reload schema';
