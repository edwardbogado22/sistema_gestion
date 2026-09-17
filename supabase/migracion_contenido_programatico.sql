-- ============================================================
-- Catálogo de contenido programático (unidades + subtemas) y
-- carga por checkboxes desde el kiosco de sede
-- ============================================================
-- Hasta ahora cumplimiento_contenido se cargaba a mano tipeando dos
-- números ("unidades programadas" / "unidades desarrolladas") en
-- Cargar Indicadores — sin ningún catálogo real de qué contenido
-- tiene cada materia. Esta migración agrega:
--
--   1) contenido_unidad / contenido_subtema: catálogo del temario
--      oficial por asignatura (lo carga Dirección Académica, vía
--      una pestaña nueva en el importador de CSV).
--   2) catedra_contenido_avance: qué subtemas marcó como dictados
--      cada cátedra. La escribe el kiosco de sede (secretaría/admin
--      logueados, el profesor solo se identifica por cédula para
--      elegir su materia — no es una vía de escritura nueva, sigue
--      protegida por app_alcanza_catedra + app_rol_escribe como todo
--      lo demás).
--   3) Un trigger que recalcula cumplimiento_contenido automáticamente
--      a partir del avance marcado, así el resto del sistema (la vista
--      v_evaluacion_docente_detalle, la Foja, Cargar Indicadores para
--      las materias que todavía no tienen catálogo) no cambia: sigue
--      leyendo cumplimiento_contenido igual que siempre.
--
-- Mientras una asignatura no tenga catálogo cargado, el trigger nunca
-- se dispara (no hay subtemas a los que apuntar) y cumplimiento_contenido
-- sigue editable a mano como hasta hoy: los dos modos conviven a
-- propósito durante la carga gradual del catálogo.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Catálogo: unidades y subtemas por asignatura
-- ------------------------------------------------------------

create table if not exists contenido_unidad (
  id uuid primary key default gen_random_uuid(),
  asignatura_id uuid not null references asignaturas(id) on delete cascade,
  numero int not null,
  nombre text not null,
  creado_en timestamptz not null default now(),
  unique (asignatura_id, numero)
);

create table if not exists contenido_subtema (
  id uuid primary key default gen_random_uuid(),
  unidad_id uuid not null references contenido_unidad(id) on delete cascade,
  numero int not null,
  descripcion text not null,
  creado_en timestamptz not null default now(),
  unique (unidad_id, numero)
);

create index if not exists contenido_unidad_asignatura_idx on contenido_unidad (asignatura_id);
create index if not exists contenido_subtema_unidad_idx on contenido_subtema (unidad_id);


-- ------------------------------------------------------------
-- 2) Avance por cátedra: qué subtemas se marcaron como dictados
-- ------------------------------------------------------------
-- Una fila nueva de catedras por período (ver catedras.periodo_lectivo)
-- ya acota el avance al período correspondiente: no hace falta
-- columna de período acá.

create table if not exists catedra_contenido_avance (
  id uuid primary key default gen_random_uuid(),
  catedra_id uuid not null references catedras(id) on delete cascade,
  subtema_id uuid not null references contenido_subtema(id) on delete cascade,
  marcado_en timestamptz not null default now(),
  unique (catedra_id, subtema_id)
);

create index if not exists catedra_contenido_avance_catedra_idx on catedra_contenido_avance (catedra_id);


-- ------------------------------------------------------------
-- 3) RLS
-- ------------------------------------------------------------

grant select, insert, update, delete on contenido_unidad, contenido_subtema, catedra_contenido_avance to authenticated;

alter table contenido_unidad enable row level security;
alter table contenido_subtema enable row level security;
alter table catedra_contenido_avance enable row level security;

drop policy if exists contenido_unidad_lee on contenido_unidad;
drop policy if exists contenido_unidad_admin on contenido_unidad;
drop policy if exists contenido_subtema_lee on contenido_subtema;
drop policy if exists contenido_subtema_admin on contenido_subtema;
drop policy if exists catedra_contenido_avance_alcance on catedra_contenido_avance;

-- Catálogo: lectura para todo autenticado (lo necesita el kiosco y
-- Cargar Indicadores para dibujar los checkboxes), escritura solo
-- ADMIN (Dirección Académica es quien procesa el temario oficial).
create policy contenido_unidad_lee on contenido_unidad
  for select to authenticated using (true);
create policy contenido_unidad_admin on contenido_unidad
  for all to authenticated using (app_es_admin()) with check (app_es_admin());

create policy contenido_subtema_lee on contenido_subtema
  for select to authenticated using (true);
create policy contenido_subtema_admin on contenido_subtema
  for all to authenticated using (app_es_admin()) with check (app_es_admin());

-- Avance: mismo criterio que catedra_horario / plan_anual_entrega —
-- lectura y escritura acotadas al alcance de la cátedra, escritura
-- además requiere rol con permiso de carga.
create policy catedra_contenido_avance_alcance on catedra_contenido_avance
  for all to authenticated
  using (app_alcanza_catedra(catedra_id))
  with check (app_alcanza_catedra(catedra_id) and app_rol_escribe());


-- ------------------------------------------------------------
-- 4) Recalcular cumplimiento_contenido automáticamente
-- ------------------------------------------------------------
-- security definer porque cumplimiento_contenido solo admite
-- escritura de ADMIN (cumplimiento_contenido_admin, en
-- migracion_roles_alcance.sql): el mismo truco que catedra_editar_profesor
-- para que el secretario, al marcar avance dentro de su alcance,
-- pueda disparar el upsert aunque no tenga permiso directo sobre esa
-- tabla.

create or replace function contenido_recalcular_cumplimiento()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_catedra_id uuid := coalesce(new.catedra_id, old.catedra_id);
  v_asignatura_id uuid;
  v_total_unidades int;
  v_unidades_completas int;
  v_total_subtemas int;
  v_marcados int;
  v_pct numeric;
begin
  select asignatura_id into v_asignatura_id from catedras where id = v_catedra_id;

  select count(*) into v_total_unidades
    from contenido_unidad
   where asignatura_id = v_asignatura_id;

  select count(*) into v_total_subtemas
    from contenido_subtema cs
    join contenido_unidad cu on cu.id = cs.unidad_id
   where cu.asignatura_id = v_asignatura_id;

  select count(*) into v_marcados
    from catedra_contenido_avance cca
    join contenido_subtema cs on cs.id = cca.subtema_id
    join contenido_unidad cu on cu.id = cs.unidad_id
   where cca.catedra_id = v_catedra_id
     and cu.asignatura_id = v_asignatura_id;

  -- Unidad "desarrollada" = tiene al menos un subtema y todos están marcados.
  select count(*) into v_unidades_completas
    from contenido_unidad cu
   where cu.asignatura_id = v_asignatura_id
     and exists (select 1 from contenido_subtema cs where cs.unidad_id = cu.id)
     and not exists (
       select 1
         from contenido_subtema cs
        where cs.unidad_id = cu.id
          and not exists (
            select 1 from catedra_contenido_avance cca
             where cca.catedra_id = v_catedra_id and cca.subtema_id = cs.id
          )
     );

  v_pct := case when v_total_subtemas > 0 then round(v_marcados::numeric / v_total_subtemas * 100, 2) else 0 end;

  insert into cumplimiento_contenido (catedra_id, unidades_programadas, unidades_desarrolladas, porcentaje_cumplimiento)
  values (v_catedra_id, v_total_unidades, v_unidades_completas, v_pct)
  on conflict (catedra_id) do update
     set unidades_programadas = excluded.unidades_programadas,
         unidades_desarrolladas = excluded.unidades_desarrolladas,
         porcentaje_cumplimiento = excluded.porcentaje_cumplimiento;

  return coalesce(new, old);
end;
$$;

drop trigger if exists catedra_contenido_avance_recalcula on catedra_contenido_avance;
create trigger catedra_contenido_avance_recalcula
  after insert or delete on catedra_contenido_avance
  for each row execute function contenido_recalcular_cumplimiento();


select registrar_migracion('migracion_contenido_programatico.sql');

notify pgrst, 'reload schema';
