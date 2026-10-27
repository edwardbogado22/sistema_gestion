-- ============================================================
-- Orden de actas: sección sin distinguir mayúsculas + renumeración
-- del Ordinario 2026
-- ============================================================
-- Regla de Dirección Académica: los horarios de examen salen por curso,
-- sección y fecha, y de ese orden sale la correlatividad de las actas.
--
-- Había cátedras 2026 con sección "unica" y otras con "UNICA" en un
-- mismo curso. acta_numerar() las ordenaba como dos secciones distintas
-- y numeraba primero todas las "unica" y después las "UNICA", aunque
-- las fechas fueran mezcladas. Además, en Itakyry B y Economía Santa
-- Rita se cambiaron fechas después de numerar, y 11 cátedras de
-- Economía Santa Rita (3º y 4º) se desactivaron con su acta ya puesta.
--
--   1) Las secciones se guardan siempre en mayúsculas (trigger) y se
--      corrigen las 30 cátedras con "unica".
--   2) acta_numerar() compara la sección en mayúsculas.
--   3) Se renumera todo el Ordinario 2026 desde el N° 30835, con el
--      mismo orden de sedes/carreras que tenía. Autorizado por el
--      usuario el 2026-10-26: todavía no se oficializó ninguna acta.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================


-- 1) Sección siempre en mayúsculas
create or replace function trg_catedra_seccion_mayusculas()
returns trigger
language plpgsql
as $$
begin
  new.seccion_grupo := upper(btrim(new.seccion_grupo));
  return new;
end $$;

drop trigger if exists trg_catedra_seccion_mayusculas on catedras;
create trigger trg_catedra_seccion_mayusculas
  before insert or update of seccion_grupo on catedras
  for each row execute function trg_catedra_seccion_mayusculas();

update catedras
   set seccion_grupo = upper(btrim(seccion_grupo))
 where seccion_grupo is distinct from upper(btrim(seccion_grupo));


-- 2) acta_numerar(): igual que en migracion_actas_examen.sql, con la
--    sección comparada en mayúsculas
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
  -- el del reporte dentro de cada bloque (curso, sección, fecha, materia).
  select array_agg(ef.id order by b.orden, a.curso_nivel, upper(c.seccion_grupo),
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


-- 3) Renumerar el Ordinario 2026 completo desde el 30835, en el mismo
--    orden de sedes/carreras. acta_numerar exige ADMIN: se toma la
--    identidad de Dirección Académica solo dentro de esta transacción.
do $$
declare
  v_llamado uuid := '702fcac3-d277-4b6d-a39b-ee1ae06c173c';
  v_fin     int;
begin
  perform set_config('request.jwt.claims',
                     '{"sub":"e68ae29d-d573-4161-8d87-1b89a3ba3d41","role":"authenticated"}', true);

  -- Se borran todas las del llamado (también las de las cátedras ya
  -- desactivadas, que si no ocupan números).
  delete from examen_acta where llamado_id = v_llamado;

  v_fin := acta_numerar(v_llamado, 30835, '[
    {"sede_id":"b37f50f6-57c8-4f9c-881b-ead2a0fd075d","carrera_id":"f4f86653-c7ba-4a50-b54f-19eb7083ac55"},
    {"sede_id":"f2439b00-bf45-4895-bb5c-d0500a01ddfd","carrera_id":"f4f86653-c7ba-4a50-b54f-19eb7083ac55"},
    {"sede_id":"861d028f-9e13-4f65-9948-b17341d02760","carrera_id":"f4f86653-c7ba-4a50-b54f-19eb7083ac55"},
    {"sede_id":"b37f50f6-57c8-4f9c-881b-ead2a0fd075d","carrera_id":"53041e41-efa9-4ba7-b350-520538ef6a3c"},
    {"sede_id":"f2439b00-bf45-4895-bb5c-d0500a01ddfd","carrera_id":"53041e41-efa9-4ba7-b350-520538ef6a3c"},
    {"sede_id":"861d028f-9e13-4f65-9948-b17341d02760","carrera_id":"53041e41-efa9-4ba7-b350-520538ef6a3c"},
    {"sede_id":"3a6b107f-3963-4d22-b773-9bfbeec95a7e","carrera_id":"53041e41-efa9-4ba7-b350-520538ef6a3c"},
    {"sede_id":"9afefc97-c66d-4ffe-a43e-8fe9cec4a604","carrera_id":"53041e41-efa9-4ba7-b350-520538ef6a3c"},
    {"sede_id":"b37f50f6-57c8-4f9c-881b-ead2a0fd075d","carrera_id":"b46c82a2-a000-49f4-aaa2-61f43bcc8ba0"},
    {"sede_id":"861d028f-9e13-4f65-9948-b17341d02760","carrera_id":"b46c82a2-a000-49f4-aaa2-61f43bcc8ba0"}
  ]'::jsonb);

  raise notice 'Ordinario 2026 renumerado: N° 30835 al N° %', v_fin;
end $$;


select registrar_migracion('migracion_orden_actas_seccion.sql');

notify pgrst, 'reload schema';


-- Control: rango de actas por sede/carrera (tiene que dar 10 filas
-- correlativas, empezando en 30835)
select car.nombre as carrera, s.nombre as sede,
       count(*) as actas, min(ea.numero) as desde, max(ea.numero) as hasta
  from examen_acta ea
  join examen_fecha ef on ef.id = ea.examen_fecha_id
  join catedras c      on c.id = ef.catedra_id
  join asignaturas a   on a.id = c.asignatura_id
  join carreras car    on car.id = a.carrera_id
  join sedes s         on s.id = c.sede_id
 where ea.llamado_id = '702fcac3-d277-4b6d-a39b-ee1ae06c173c'
 group by car.nombre, s.nombre
 order by min(ea.numero);
