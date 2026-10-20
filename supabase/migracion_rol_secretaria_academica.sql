-- ============================================================
-- Rol SECRETARIA_ACADEMICA: Secretaría de Dirección Académica
-- ============================================================
-- Consulta e impresión de toda la facultad, sin cargar ni modificar
-- datos: profesores, cátedras, fojas de desempeño y todos los reportes
-- para informes (asistencia a clases, eventos, capacitaciones, mesas
-- examinadoras, actas, plan anual, contenido, consolidados).
--
-- Además se registra cada impresión de foja (de cualquier usuario)
-- para el informe de emisión de evaluaciones.
--
-- Cómo se da la lectura: a cada tabla con RLS se le SUMA una policy de
-- solo select (app_lee_todo()). Las policies existentes no se tocan y
-- las de escritura siguen exigiendo app_es_admin() / app_rol_escribe(),
-- que este rol no cumple. No se modifican app_alcanza_catedra ni
-- app_alcanza_carrera porque también protegen escrituras.
--
-- Sin el operador || a propósito (se corrompe al copiar el SQL por
-- chat): se usa concat_ws / format.
--
-- Requiere migracion_rol_asistente.sql (admin_alta_perfil vigente) y
-- migracion_restringir_evaluacion.sql y migracion_actas_examen.sql.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Nuevo valor de rol
-- ------------------------------------------------------------

alter table usuarios_perfil drop constraint usuarios_perfil_rol_check;
alter table usuarios_perfil add constraint usuarios_perfil_rol_check
  check (rol in ('ADMIN', 'SECRETARIO', 'DIRECTOR', 'ASISTENTE', 'SECRETARIA_ACADEMICA'));


-- ------------------------------------------------------------
-- 2) ¿Puede leer toda la facultad? (ADMIN o SECRETARIA_ACADEMICA)
-- ------------------------------------------------------------

create or replace function app_lee_todo()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(app_rol() in ('ADMIN', 'SECRETARIA_ACADEMICA'), false)
$$;

revoke execute on function app_lee_todo() from anon, public;
grant execute on function app_lee_todo() to authenticated;


-- ------------------------------------------------------------
-- 3) Registro de impresión de fojas
-- ------------------------------------------------------------
-- profesor_id y periodo_lectivo se guardan al imprimir: si después se
-- cambia el profesor de la cátedra, el registro sigue diciendo a quién
-- se le emitió la foja.

create table if not exists foja_impresion (
  id              uuid primary key default gen_random_uuid(),
  catedra_id      uuid not null references catedras(id) on delete cascade,
  profesor_id     uuid not null references profesores(id) on delete cascade,
  periodo_lectivo text not null,
  impreso_por     uuid not null default auth.uid() references auth.users(id),
  impreso_en      timestamptz not null default now()
);

create index if not exists foja_impresion_catedra_idx on foja_impresion (catedra_id);
create index if not exists foja_impresion_periodo_idx on foja_impresion (periodo_lectivo);

alter table foja_impresion enable row level security;

-- Registra quien puede ver la foja (los mismos que v_evaluacion_docente_ver),
-- y siempre a su propio nombre.
drop policy if exists foja_impresion_registra on foja_impresion;
create policy foja_impresion_registra on foja_impresion
  for insert to authenticated
  with check (
    impreso_por = auth.uid()
    and (app_lee_todo() or (app_rol() = 'DIRECTOR' and app_alcanza_catedra(catedra_id)))
  );

drop policy if exists foja_impresion_lee on foja_impresion;
create policy foja_impresion_lee on foja_impresion
  for select to authenticated
  using (app_lee_todo() or impreso_por = auth.uid());

revoke all on foja_impresion from anon;
grant select, insert on foja_impresion to authenticated;


-- ------------------------------------------------------------
-- 4) Lectura de toda la facultad: una policy de select por tabla
-- ------------------------------------------------------------
-- Recorre todas las tablas de public con RLS activada (incluida
-- foja_impresion, que ya la tiene arriba y no pasa nada por repetir).

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


-- ------------------------------------------------------------
-- 5) Foja de desempeño: mismo cuerpo que
--    migracion_restringir_evaluacion.sql, sumando app_lee_todo()
-- ------------------------------------------------------------

create or replace function v_evaluacion_docente_ver(p_catedra_id uuid default null, p_periodo_lectivo text default null)
returns setof v_evaluacion_docente_detalle
language sql stable security definer set search_path = public
as $$
  select * from v_evaluacion_docente_detalle
  where (app_lee_todo() or (app_rol() = 'DIRECTOR' and app_alcanza_catedra(catedra_id)))
    and (p_catedra_id is null or catedra_id = p_catedra_id)
    and (p_periodo_lectivo is null or periodo_lectivo = p_periodo_lectivo)
$$;
revoke execute on function v_evaluacion_docente_ver(uuid, text) from anon, public;
grant execute on function v_evaluacion_docente_ver(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- 6) Actas a firmar: mismo cuerpo que migracion_actas_examen.sql,
--    con el alcance ampliado a app_lee_todo() y concat_ws en vez de ||
-- ------------------------------------------------------------

create or replace function actas_firmas(p_llamado uuid)
returns table (
  examen_fecha_id    uuid,
  numero_acta        int,
  fecha              date,
  sede_id            uuid,
  sede               text,
  carrera_id         uuid,
  carrera            text,
  curso_nivel        int,
  seccion_grupo      text,
  materia            text,
  profesor_id        uuid,
  documento_identidad text,
  profesor           text,
  rol                text,
  firmado_en         timestamptz
)
language sql stable security definer set search_path = public
as $$
  with mesas as (
    select ef.id as examen_fecha_id, ef.fecha, c.id as catedra_id,
           c.profesor_id as presidente_id, c.seccion_grupo::text as seccion_grupo,
           s.id as sede_id, s.nombre::text as sede,
           car.id as carrera_id, car.nombre::text as carrera,
           a.curso_nivel, a.nombre::text as materia
      from examen_fecha ef
      join catedras c     on c.id = ef.catedra_id and c.activo and not c.exento_examen
      join asignaturas a  on a.id = c.asignatura_id
      join carreras car   on car.id = a.carrera_id
      join sedes s        on s.id = c.sede_id
     where ef.llamado_id = p_llamado
       and ef.estado <> 'ANULADA'
       and (app_lee_todo() or app_alcanza_catedra(c.id))
  ),
  firmantes as (
    select m.examen_fecha_id, m.presidente_id as profesor_id, 'PRESIDENTE'::text as rol
      from mesas m
    union all
    select mi.examen_fecha_id, mi.profesor_id, 'VOCAL'::text
      from mesa_integrante mi
      join mesas m on m.examen_fecha_id = mi.examen_fecha_id
     where mi.rol_mesa = 'VOCAL'
  )
  select m.examen_fecha_id, ea.numero, m.fecha,
         m.sede_id, m.sede, m.carrera_id, m.carrera,
         m.curso_nivel, m.seccion_grupo, m.materia,
         p.id, p.documento_identidad::text,
         concat_ws(', ', p.apellidos, p.nombres)::text,
         f.rol, af.firmado_en
    from firmantes f
    join mesas m        on m.examen_fecha_id = f.examen_fecha_id
    join profesores p   on p.id = f.profesor_id
    left join examen_acta ea on ea.examen_fecha_id = m.examen_fecha_id
    left join acta_firma af  on af.examen_fecha_id = m.examen_fecha_id
                            and af.profesor_id = f.profesor_id
   order by p.apellidos, p.nombres, ea.numero nulls last, m.fecha, m.examen_fecha_id
$$;

revoke execute on function actas_firmas(uuid) from anon, public;
grant execute on function actas_firmas(uuid) to authenticated;


-- ------------------------------------------------------------
-- 7) admin_alta_perfil: sumar SECRETARIA_ACADEMICA a los roles
--    asignables (mismo cuerpo que migracion_rol_asistente.sql)
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

  if p_rol not in ('ADMIN', 'SECRETARIO', 'DIRECTOR', 'ASISTENTE', 'SECRETARIA_ACADEMICA') then
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


select registrar_migracion('migracion_rol_secretaria_academica.sql');

notify pgrst, 'reload schema';
