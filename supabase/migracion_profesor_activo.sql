-- ============================================================
-- Profesores activos e inactivos
-- ============================================================
-- Un profesor que ya no dicta (sin cátedra en el período) se marca como
-- inactivo en lugar de borrarlo: sigue en el padrón, con todo su
-- histórico (fojas, asistencia, mesas, eventos), y Dirección Académica lo
-- reactiva cuando se reincorpora.
--
-- Mientras está inactivo, la base NO deja asignarlo de nuevo (no depende
-- de que la pantalla lo oculte):
--   - como profesor de una cátedra (alta, cambio de profesor, importación);
--   - como suplente en la asistencia a clases;
--   - como vocal de una mesa examinadora.
-- Lo ya registrado no se toca: corregir la asistencia de una mesa vieja
-- o un día ya cargado sigue funcionando.
--
-- Solo ADMIN cambia el estado (profesores_cambiar_estado). No se puede
-- inactivar a quien tiene una cátedra activa en el período en curso.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================


-- 1) Estado y quién lo cambió
alter table profesores add column if not exists activo boolean not null default true;
alter table profesores add column if not exists inactivo_desde timestamptz;
alter table profesores add column if not exists inactivo_por uuid references auth.users(id);
alter table profesores add column if not exists inactivo_motivo text;

create index if not exists profesores_activo_idx on profesores (activo);


-- 2) Bloqueo en la base
create or replace function profesor_exigir_activo(p_profesor uuid, p_para text)
returns void
language plpgsql stable security definer set search_path = public
as $$
declare
  v_nombre text;
begin
  select concat_ws(', ', apellidos, nombres) into v_nombre
    from profesores where id = p_profesor and not activo;
  if v_nombre is not null then
    raise exception 'El profesor % está inactivo y no puede asignarse %. Dirección Académica puede reactivarlo desde Configuración → Profesores.',
      v_nombre, p_para;
  end if;
end $$;

create or replace function trg_catedra_profesor_activo()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.profesor_id is not null
     and (tg_op = 'INSERT' or new.profesor_id is distinct from old.profesor_id) then
    perform profesor_exigir_activo(new.profesor_id, 'a una cátedra');
  end if;
  return new;
end $$;

drop trigger if exists trg_catedra_profesor_activo on catedras;
create trigger trg_catedra_profesor_activo
  before insert or update of profesor_id on catedras
  for each row execute function trg_catedra_profesor_activo();

create or replace function trg_asistencia_suplente_activo()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.profesor_suplente_id is not null
     and (tg_op = 'INSERT' or new.profesor_suplente_id is distinct from old.profesor_suplente_id) then
    perform profesor_exigir_activo(new.profesor_suplente_id, 'como suplente');
  end if;
  return new;
end $$;

drop trigger if exists trg_asistencia_suplente_activo on asistencia_clase_registro;
create trigger trg_asistencia_suplente_activo
  before insert or update of profesor_suplente_id on asistencia_clase_registro
  for each row execute function trg_asistencia_suplente_activo();

-- Solo vocales: el titular se agrega a mesa_integrante recién al
-- registrar su asistencia, también en mesas de llamados ya pasados.
create or replace function trg_mesa_vocal_activo()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.rol_mesa = 'VOCAL'
     and (tg_op = 'INSERT' or new.profesor_id is distinct from old.profesor_id or new.rol_mesa is distinct from old.rol_mesa) then
    perform profesor_exigir_activo(new.profesor_id, 'como vocal de una mesa');
  end if;
  return new;
end $$;

drop trigger if exists trg_mesa_vocal_activo on mesa_integrante;
create trigger trg_mesa_vocal_activo
  before insert or update of profesor_id, rol_mesa on mesa_integrante
  for each row execute function trg_mesa_vocal_activo();


-- 3) Período "en curso" para las reglas de abajo: el período académico
--    activo, o si no hay, el último período con cátedras.
create or replace function periodo_lectivo_en_curso()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select etiqueta_periodo_lectivo from periodo_academico where activo limit 1),
    (select max(periodo_lectivo) from catedras)
  )
$$;

revoke execute on function periodo_lectivo_en_curso() from anon, public;
grant execute on function periodo_lectivo_en_curso() to authenticated;


-- 4) Cambiar el estado (solo ADMIN). Devuelve cuántos cambió y a quiénes
--    no pudo inactivar porque tienen una cátedra activa en el período.
create or replace function profesores_cambiar_estado(p_ids uuid[], p_activo boolean, p_motivo text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_periodo text := periodo_lectivo_en_curso();
  v_omitidos jsonb;
  v_cambiados int;
begin
  if not app_es_admin() then
    raise exception 'Solo Dirección Académica puede activar o inactivar profesores.';
  end if;

  if p_activo then
    update profesores
       set activo = true, inactivo_desde = null, inactivo_por = null, inactivo_motivo = null, actualizado_en = now()
     where id = any (p_ids) and not activo;
    get diagnostics v_cambiados = row_count;
    return jsonb_build_object('cambiados', v_cambiados, 'omitidos', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(concat_ws(', ', p.apellidos, p.nombres) order by p.apellidos, p.nombres), '[]'::jsonb)
    into v_omitidos
    from profesores p
   where p.id = any (p_ids)
     and exists (select 1 from catedras c
                  where c.profesor_id = p.id and c.activo and c.periodo_lectivo = v_periodo);

  update profesores p
     set activo = false,
         inactivo_desde = now(),
         inactivo_por = auth.uid(),
         inactivo_motivo = nullif(btrim(p_motivo), ''),
         actualizado_en = now()
   where p.id = any (p_ids)
     and p.activo
     and not exists (select 1 from catedras c
                      where c.profesor_id = p.id and c.activo and c.periodo_lectivo = v_periodo);
  get diagnostics v_cambiados = row_count;

  return jsonb_build_object('cambiados', v_cambiados, 'omitidos', v_omitidos, 'periodo', v_periodo);
end $$;

revoke execute on function profesores_cambiar_estado(uuid[], boolean, text) from anon, public;
grant execute on function profesores_cambiar_estado(uuid[], boolean, text) to authenticated;


-- 5) Profesores activos sin cátedra activa en un período, con lo que hizo
--    ese año, para decidir a quién inactivar (solo ADMIN).
create or replace function profesores_sin_catedra(p_periodo text)
returns table (
  profesor_id                uuid,
  documento_identidad        text,
  profesor                   text,
  ultimo_periodo_con_catedra text,
  vocal_en_mesas             boolean,
  suplente                   boolean,
  asistio_eventos            boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not app_es_admin() then
    raise exception 'Solo Dirección Académica puede consultar este listado.';
  end if;

  return query
  select
    p.id,
    p.documento_identidad::text,
    concat_ws(', ', p.apellidos, p.nombres)::text,
    (select max(c.periodo_lectivo)::text from catedras c where c.profesor_id = p.id),
    exists (select 1 from mesa_integrante mi
              join examen_fecha ef on ef.id = mi.examen_fecha_id
              join examen_llamado l on l.id = ef.llamado_id
             where mi.profesor_id = p.id and mi.rol_mesa = 'VOCAL' and l.periodo_lectivo = p_periodo),
    exists (select 1 from asistencia_clase_registro r
             where r.profesor_suplente_id = p.id
               and extract(year from r.fecha)::text = p_periodo),
    exists (select 1 from evento_asistencia_registro e
              join evento ev on ev.id = e.evento_id
             where e.profesor_id = p.id
               and extract(year from ev.fecha)::text = p_periodo)
  from profesores p
  where p.activo
    and not exists (select 1 from catedras c
                     where c.profesor_id = p.id and c.activo and c.periodo_lectivo = p_periodo)
  order by p.apellidos, p.nombres;
end $$;

revoke execute on function profesores_sin_catedra(text) from anon, public;
grant execute on function profesores_sin_catedra(text) to authenticated;


select registrar_migracion('migracion_profesor_activo.sql');

notify pgrst, 'reload schema';
