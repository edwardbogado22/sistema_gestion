-- ============================================================
-- Fix: examen_fecha_validar() había perdido el bloqueo de choque
-- de profesor + alerta previa en el calendario
-- ============================================================
-- examen_fecha_validar() se fue reescribiendo en tres migraciones
-- distintas, cada una agregando algo, pero cada `create or replace
-- function` reemplaza el cuerpo entero — no se combinan:
--
--   migracion_mesas_examinadoras.sql        versión base
--   migracion_examen_optativas.sql          + bloqueo de choque de
--                                              profesor (permitido si
--                                              la materia es optativa)
--   migracion_choque_cruzado_y_panel_admin.sql
--                                            + security definer, para
--                                              que el choque se detecte
--                                              aunque las dos cátedras
--                                              sean de carreras distintas
--   migracion_dias_no_habiles.sql           reescribió la función para
--                                              sumar el calendario de
--                                              días no hábiles, pero se
--                                              basó en la versión de
--                                              mesas_examinadoras.sql
--                                              (su encabezado solo dice
--                                              "ejecutar después de
--                                              migracion_mesas_examinadoras.sql") —
--                                              sin darse cuenta de que
--                                              perdía por completo el
--                                              bloqueo de choque y el
--                                              security definer de las
--                                              dos migraciones anteriores.
--
-- Si esta última es la que quedó corriendo en producción, dos
-- secretarios de carreras distintas pueden cargarle al mismo profesor
-- dos mesas el mismo día sin que nadie se entere hasta que sea tarde.
-- Esta migración vuelve a unir las dos ramas en una sola versión
-- definitiva.
--
-- Además, hasta ahora el choque solo se veía DESPUÉS de guardar (el
-- error de Postgres al hacer upsert), y si guardaba varias fechas
-- juntas, una sola en choque tiraba abajo el lote completo. Se agrega
-- examen_fechas_profesor_llamado(): con qué otras fechas ya choca cada
-- profesor en el llamado, sin depender del alcance de quien pregunta
-- (mismo motivo que el choque del trigger), para que el panel bloquee
-- esas fechas en el calendario ANTES de que el secretario las elija.
--
-- Ejecutar completo en el SQL Editor de Supabase, después de
-- migracion_dias_no_habiles.sql y migracion_choque_cruzado_y_panel_admin.sql.
-- ============================================================


-- ------------------------------------------------------------
-- 1) examen_fecha_validar(): calendario de días no hábiles +
--    choque de profesor (con excepción de optativas), unificados,
--    corriendo como security definer.
-- ------------------------------------------------------------

create or replace function examen_fecha_validar()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_ll        examen_llamado%rowtype;
  v_motivo    text;
  v_optativa  boolean;
  v_materia   text;
  v_choque    record;
begin
  select * into v_ll from examen_llamado where id = new.llamado_id;

  if v_ll.estado <> 'ASIGNACION' then
    raise exception 'El llamado "%" no está abierto para cargar fechas (estado: %).',
      v_ll.nombre, v_ll.estado;
  end if;

  if new.fecha < v_ll.fecha_inicio or new.fecha > v_ll.fecha_fin then
    raise exception 'La fecha % está fuera del rango permitido para "%" (% a %).',
      to_char(new.fecha, 'DD/MM/YYYY'), v_ll.nombre,
      to_char(v_ll.fecha_inicio, 'DD/MM/YYYY'), to_char(v_ll.fecha_fin, 'DD/MM/YYYY');
  end if;

  v_motivo := dia_bloqueado(new.fecha, new.llamado_id);
  if v_motivo is not null then
    raise exception 'No se puede tomar examen el %: %.',
      to_char(new.fecha, 'DD/MM/YYYY'), v_motivo;
  end if;

  -- Solo el admin carga fechas en los llamados marcados como suyos
  if v_ll.asigna_rol = 'ADMIN' and not app_es_admin() then
    raise exception 'Las fechas de "%" las asigna Dirección Académica.', v_ll.nombre;
  end if;

  -- Choque de profesor: corre como security definer para que la
  -- detección no dependa del alcance RLS de quien está guardando. Se
  -- acepta si la materia que se está cargando es optativa; si no lo
  -- es, se bloquea y se avisa con qué materia chocó.
  select a.optativa, a.nombre into v_optativa, v_materia
    from catedras c
    join asignaturas a on a.id = c.asignatura_id
   where c.id = new.catedra_id;

  if not coalesce(v_optativa, false) then
    select ef2.fecha, a2.nombre as materia_choque
      into v_choque
      from examen_fecha ef2
      join catedras c2  on c2.id = ef2.catedra_id
      join asignaturas a2 on a2.id = c2.asignatura_id
      join catedras c1  on c1.id = new.catedra_id
     where ef2.llamado_id = new.llamado_id
       and ef2.fecha = new.fecha
       and ef2.catedra_id <> new.catedra_id
       and ef2.estado <> 'ANULADA'
       and c2.profesor_id = c1.profesor_id
     limit 1;

    if found then
      raise exception
        'El profesor ya tiene asignada la mesa de "%" el %. Como "%" no es una materia optativa, no se puede duplicar: modificá la propuesta.',
        v_choque.materia_choque, to_char(new.fecha, 'DD/MM/YYYY'), v_materia;
    end if;
  end if;

  -- Rastro de quién cargó la fecha, sin depender de que el cliente lo mande
  new.asignado_por := coalesce(new.asignado_por, auth.uid());

  return new;
end $$;

drop trigger if exists trg_examen_fecha_validar on examen_fecha;
create trigger trg_examen_fecha_validar
  before insert or update on examen_fecha
  for each row execute function examen_fecha_validar();


-- ------------------------------------------------------------
-- 2) Alerta previa: fechas donde cada profesor ya tiene una mesa
--    en este llamado, sin importar la carrera de quien pregunta.
-- ------------------------------------------------------------
-- El panel la usa para bloquear esas fechas en el calendario antes de
-- que el secretario las elija, en vez de que se entere recién al
-- guardar (y de que un choque tire abajo todo un lote de cambios).

create or replace function examen_fechas_profesor_llamado(p_llamado uuid)
returns table (profesor_id uuid, catedra_id uuid, fecha date, materia text, optativa boolean)
language sql stable security definer set search_path = public
as $$
  select c.profesor_id, ef.catedra_id, ef.fecha, a.nombre, a.optativa
    from examen_fecha ef
    join catedras c    on c.id = ef.catedra_id
    join asignaturas a on a.id = c.asignatura_id
   where ef.llamado_id = p_llamado
     and ef.estado <> 'ANULADA'
$$;

revoke execute on function examen_fechas_profesor_llamado(uuid) from anon, public;
grant execute on function examen_fechas_profesor_llamado(uuid) to authenticated;

select registrar_migracion('migracion_fix_choque_profesor_y_alerta_previa.sql');
