-- ============================================================
-- Numeración de actas de examen y control de firmas
-- ============================================================
-- Requiere haber ejecutado antes migracion_mesas_examinadoras.sql,
-- migracion_roles_alcance.sql y migracion_rol_director.sql.
--
-- Cada mesa examinadora (una fila de examen_fecha) tiene un acta. El
-- número de acta es el correlativo que va adelante de cada mesa en el
-- Reporte de Mesas. Lo asigna Dirección Académica: indica el primer
-- número y el orden de sede/carrera, y el sistema numera en el mismo
-- orden en que se imprime el reporte (curso, sección, fecha, materia).
--
-- Cada acta la firman el presidente (titular de la cátedra) y los dos
-- examinadores (vocales). La Secretaría de Carrera busca al profesor
-- y tilda cada acta a medida que la firma.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Número de acta por mesa
-- ------------------------------------------------------------
-- Va en una tabla aparte y no como columna de examen_fecha a propósito:
-- trg_examen_fecha_validar revalida la fila entera en cada UPDATE y
-- exige el llamado en ASIGNACION, pero las actas se numeran con el
-- llamado ya aprobado.
-- ------------------------------------------------------------

create table if not exists examen_acta (
  examen_fecha_id uuid primary key references examen_fecha(id) on delete cascade,
  llamado_id      uuid not null references examen_llamado(id) on delete cascade,
  numero          int  not null check (numero > 0),
  asignado_por    uuid references auth.users(id) default auth.uid(),
  asignado_en     timestamptz not null default now(),
  unique (llamado_id, numero)
);


-- ------------------------------------------------------------
-- 2) Firmas: la fila existe cuando el profesor ya firmó esa acta
-- ------------------------------------------------------------

create table if not exists acta_firma (
  examen_fecha_id uuid not null references examen_fecha(id) on delete cascade,
  profesor_id     uuid not null references profesores(id) on delete cascade,
  firmado_en      timestamptz not null default now(),
  registrado_por  uuid references auth.users(id) default auth.uid(),
  primary key (examen_fecha_id, profesor_id)
);


-- ------------------------------------------------------------
-- 3) RLS
-- ------------------------------------------------------------
-- examen_acta: la leen todos los que alcanzan la cátedra; solo el admin
-- escribe (y en la práctica lo hace por acta_numerar()).
-- acta_firma: la marca la Secretaría de Carrera dentro de su alcance.
-- DIRECTOR la ve pero no escribe (app_rol_escribe).
-- ------------------------------------------------------------

alter table examen_acta enable row level security;
alter table acta_firma  enable row level security;

drop policy if exists examen_acta_lee   on examen_acta;
drop policy if exists examen_acta_admin on examen_acta;
create policy examen_acta_lee on examen_acta
  for select to authenticated using (
    exists (select 1 from examen_fecha ef
             where ef.id = examen_acta.examen_fecha_id
               and app_alcanza_catedra(ef.catedra_id))
  );
create policy examen_acta_admin on examen_acta
  for all to authenticated using (app_es_admin()) with check (app_es_admin());

drop policy if exists acta_firma_lee      on acta_firma;
drop policy if exists acta_firma_escribe  on acta_firma;
drop policy if exists acta_firma_borra    on acta_firma;
create policy acta_firma_lee on acta_firma
  for select to authenticated using (
    exists (select 1 from examen_fecha ef
             where ef.id = acta_firma.examen_fecha_id
               and app_alcanza_catedra(ef.catedra_id))
  );
create policy acta_firma_escribe on acta_firma
  for insert to authenticated with check (
    app_rol_escribe() and exists (
      select 1 from examen_fecha ef
       where ef.id = acta_firma.examen_fecha_id
         and app_alcanza_catedra(ef.catedra_id))
  );
create policy acta_firma_borra on acta_firma
  for delete to authenticated using (
    app_rol_escribe() and exists (
      select 1 from examen_fecha ef
       where ef.id = acta_firma.examen_fecha_id
         and app_alcanza_catedra(ef.catedra_id))
  );


-- ------------------------------------------------------------
-- 4) acta_numerar(): numeración correlativa automática
-- ------------------------------------------------------------
-- p_bloques es la secuencia de sede/carrera en el orden en que tiene
-- que seguir la numeración:
--   [{"sede_id": "...", "carrera_id": "..."}, ...]
-- Dentro de cada bloque se numera en el orden del Reporte de Mesas
-- (curso, sección, fecha, materia). Si los bloques ya tenían números,
-- se renumeran. Devuelve el último número asignado.
-- ------------------------------------------------------------

create or replace function acta_numerar(p_llamado uuid, p_inicio int, p_bloques jsonb)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_ids     uuid[];
  v_fin     int;
  v_choque  record;
begin
  if not app_es_admin() then
    raise exception 'Solo Dirección Académica puede numerar las actas.';
  end if;
  if p_inicio is null or p_inicio < 1 then
    raise exception 'Indicá un número inicial mayor que cero.';
  end if;
  if p_bloques is null or jsonb_array_length(p_bloques) = 0 then
    raise exception 'Elegí al menos una sede/carrera para numerar.';
  end if;

  -- Mesas a numerar, en orden: primero el orden de los bloques, después
  -- el del reporte dentro de cada bloque.
  select array_agg(ef.id order by b.orden, a.curso_nivel, c.seccion_grupo,
                                  ef.fecha, a.nombre, ef.id)
    into v_ids
    from jsonb_array_elements(p_bloques) with ordinality as b(bloque, orden)
    join catedras c      on c.sede_id = (b.bloque->>'sede_id')::uuid
                        and c.activo and not c.exento_examen
    join asignaturas a   on a.id = c.asignatura_id
                        and a.carrera_id = (b.bloque->>'carrera_id')::uuid
    join examen_fecha ef on ef.catedra_id = c.id
   where ef.llamado_id = p_llamado
     and ef.estado <> 'ANULADA';

  if v_ids is null then
    raise exception 'Las sedes/carreras elegidas no tienen mesas con fecha en este llamado.';
  end if;

  v_fin := p_inicio + cardinality(v_ids) - 1;

  -- Los números nuevos no pueden pisar actas de otras sedes/carreras
  select ea.numero, s.nombre as sede, car.nombre as carrera into v_choque
    from examen_acta ea
    join examen_fecha ef on ef.id = ea.examen_fecha_id
    join catedras c      on c.id = ef.catedra_id
    join asignaturas a   on a.id = c.asignatura_id
    join carreras car    on car.id = a.carrera_id
    join sedes s         on s.id = c.sede_id
   where ea.llamado_id = p_llamado
     and not (ea.examen_fecha_id = any (v_ids))
     and ea.numero between p_inicio and v_fin
   order by ea.numero
   limit 1;

  if found then
    raise exception 'El acta N° % ya está asignada a % · %. Elegí otro número inicial o quitá antes esa numeración.',
      v_choque.numero, v_choque.sede, v_choque.carrera;
  end if;

  delete from examen_acta where examen_fecha_id = any (v_ids);

  insert into examen_acta (examen_fecha_id, llamado_id, numero)
  select t.id, p_llamado, p_inicio + t.pos::int - 1
    from unnest(v_ids) with ordinality as t(id, pos);

  return v_fin;
end $$;

revoke execute on function acta_numerar(uuid, int, jsonb) from anon, public;
grant execute on function acta_numerar(uuid, int, jsonb) to authenticated;


-- ------------------------------------------------------------
-- 5) acta_quitar_numeracion(): borra los números de una sede/carrera
-- ------------------------------------------------------------

create or replace function acta_quitar_numeracion(p_llamado uuid, p_sede uuid, p_carrera uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_borradas int;
begin
  if not app_es_admin() then
    raise exception 'Solo Dirección Académica puede modificar la numeración de actas.';
  end if;

  delete from examen_acta ea
   using examen_fecha ef, catedras c, asignaturas a
   where ef.id = ea.examen_fecha_id
     and c.id = ef.catedra_id
     and a.id = c.asignatura_id
     and ea.llamado_id = p_llamado
     and c.sede_id = p_sede
     and a.carrera_id = p_carrera;

  get diagnostics v_borradas = row_count;
  return v_borradas;
end $$;

revoke execute on function acta_quitar_numeracion(uuid, uuid, uuid) from anon, public;
grant execute on function acta_quitar_numeracion(uuid, uuid, uuid) to authenticated;


-- ------------------------------------------------------------
-- 6) actas_firmas(): una fila por (acta, profesor que la firma)
-- ------------------------------------------------------------
-- security definer porque un vocal puede ser profesor de otra carrera:
-- con la RLS de profesores, el secretario lo vería sin nombre. El
-- alcance se sigue respetando con app_alcanza_catedra.
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
       and app_alcanza_catedra(c.id)
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
         (p.apellidos || ', ' || p.nombres)::text,
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


select registrar_migracion('migracion_actas_examen.sql');

notify pgrst, 'reload schema';
