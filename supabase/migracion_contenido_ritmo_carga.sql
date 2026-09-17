-- ============================================================
-- Tope de carga de contenido según el ritmo real de clases dictadas
-- ============================================================
-- migracion_contenido_programatico.sql dejó marcar cualquier cantidad
-- de subtemas en una sola visita al kiosco, sin relación con cuántas
-- clases se dieron de verdad — un profesor podía tildar el 100% del
-- temario el primer día, lo cual no tiene sentido y desvirtúa la
-- medición.
--
-- Esta migración limita, para las cátedras que SÍ usan el registro
-- diario de asistencia (asistencia_clase_registro, de
-- migracion_asistencia_clases_diaria.sql), cuántos subtemas se pueden
-- tener marcados en un momento dado:
--
--   tope = techo(clases_dictadas / clases_totales_del_período × total_subtemas)
--
-- clases_dictadas / clases_totales ya está calculado en
-- asistencia_clases (horas_dictadas / horas_programadas), recalculado
-- automáticamente cada vez que secretaría registra un día. Como ese
-- cociente crece solo cuando de verdad se registra una clase como
-- dictada, esto resuelve las dos cosas pedidas con la misma regla:
--   - No se puede cargar de golpe más contenido del que el ritmo real
--     de clases justifica, sin importar cuántas veces se visite el
--     kiosco.
--   - Si una clase anterior no se había registrado, apenas secretaría
--     la registre (ese día o después) el tope sube solo y el profesor
--     puede ponerse al día de una vez — no hace falta una ventana de
--     gracia aparte.
--
-- Cátedras que NO usan el registro diario (sin ninguna fila propia en
-- asistencia_clase_registro: siguen con carga manual/CSV de
-- asistencia_clases) quedan SIN tope por ahora, a propósito — no hay
-- una fecha real contra la cual medir el ritmo, y esos números suelen
-- cargarse como una foto final, no día a día.
--
-- ADMIN siempre puede saltarse el tope (correcciones puntuales).
--
-- Requiere haber corrido migracion_contenido_programatico.sql y
-- migracion_asistencia_clases_diaria.sql.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Cuántos subtemas puede tener marcados esta cátedra ahora mismo
-- ------------------------------------------------------------
-- security definer: asistencia_clases es de escritura ADMIN-only
-- (asistencia_clases_admin, en migracion_roles_alcance.sql) y ni
-- siquiera admite SELECT para SECRETARIO/DIRECTOR; esta función
-- necesita leerla igual para calcular el ritmo real.

create or replace function contenido_tope_subtemas(p_catedra_id uuid)
returns int
language plpgsql stable security definer set search_path = public
as $$
declare
  v_profesor_id   uuid;
  v_carrera_id    uuid;
  v_sede_id       uuid;
  v_asignatura_id uuid;
  v_total_subtemas int;
  v_horas_prog    int;
  v_horas_dict    int;
  v_tiene_registro boolean;
begin
  select c.profesor_id, c.sede_id, a.carrera_id, a.id
    into v_profesor_id, v_sede_id, v_carrera_id, v_asignatura_id
    from catedras c
    join asignaturas a on a.id = c.asignatura_id
   where c.id = p_catedra_id;

  select exists (
    select 1 from asistencia_clase_registro
     where profesor_id = v_profesor_id and carrera_id = v_carrera_id and sede_id = v_sede_id
  ) into v_tiene_registro;

  -- Sin registro diario para esta cátedra: no hay ritmo real contra
  -- qué medir. Sin tope, a propósito (ver cabecera del archivo).
  if not v_tiene_registro then
    return null;
  end if;

  select horas_programadas, horas_dictadas
    into v_horas_prog, v_horas_dict
    from asistencia_clases
   where catedra_id = p_catedra_id;

  if v_horas_prog is null or v_horas_prog = 0 then
    return null;
  end if;

  select count(*) into v_total_subtemas
    from contenido_subtema cs
    join contenido_unidad cu on cu.id = cs.unidad_id
   where cu.asignatura_id = v_asignatura_id;

  return ceil(least(1.0, v_horas_dict::numeric / v_horas_prog) * v_total_subtemas);
end;
$$;

revoke execute on function contenido_tope_subtemas(uuid) from anon, public;
grant execute on function contenido_tope_subtemas(uuid) to authenticated;


-- ------------------------------------------------------------
-- 2) Validación al marcar subtemas
-- ------------------------------------------------------------
-- AFTER INSERT por fila: para cuando se inserta la fila que hace que
-- el total marcado de la cátedra supere el tope, revienta y aborta
-- toda la transacción (el kiosco borra todo y reinserta de una, así
-- que la operación completa se cancela junto con esta fila).

create or replace function contenido_validar_ritmo()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_tope     int;
  v_marcados int;
begin
  if app_es_admin() then
    return new;
  end if;

  v_tope := contenido_tope_subtemas(new.catedra_id);
  if v_tope is null then
    return new;
  end if;

  select count(*) into v_marcados
    from catedra_contenido_avance
   where catedra_id = new.catedra_id;

  if v_marcados > v_tope then
    raise exception
      'Por ahora podés tener marcados hasta % subtema(s), según las clases ya registradas como dictadas. Pedile a secretaría que registre las clases pendientes en Asistencia a Clases para poder cargar más.',
      v_tope;
  end if;

  return new;
end;
$$;

drop trigger if exists catedra_contenido_avance_valida_ritmo on catedra_contenido_avance;
create trigger catedra_contenido_avance_valida_ritmo
  after insert on catedra_contenido_avance
  for each row execute function contenido_validar_ritmo();


select registrar_migracion('migracion_contenido_ritmo_carga.sql');

notify pgrst, 'reload schema';
