-- ============================================================
-- Fix: recalcular_asistencia_mesas() vs. columna generada
-- ============================================================
-- recalcular_asistencia_mesas() (migracion_mesas_examinadoras.sql)
-- nunca funcionó en esta base: intenta escribir explícitamente
-- asistencia_mesas_examinadoras.porcentaje_asistencia, pero en algún
-- momento esa columna quedó como generada (GENERATED ALWAYS AS ...
-- STORED) fuera de las migraciones versionadas acá, y Postgres
-- rechaza cualquier insert/update que intente asignarle un valor:
-- "cannot insert a non-DEFAULT value into column
-- \"porcentaje_asistencia\"".
--
-- No hace falta calcularlo a mano: si es una columna generada, la
-- base la recalcula sola a partir de mesas_convocadas/mesas_asistidas
-- apenas se insertan/actualizan esas dos.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

create or replace function recalcular_asistencia_mesas(p_periodo varchar)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_filas int;
begin
  if not app_es_admin() then
    raise exception 'Solo Dirección Académica puede recalcular la asistencia a mesas.';
  end if;

  with agg as (
    select mi.profesor_id,
           count(*)                                as convocadas,
           count(*) filter (where mi.asistio)      as asistidas
      from mesa_integrante mi
      join examen_fecha ef   on ef.id = mi.examen_fecha_id
      join examen_llamado l  on l.id = ef.llamado_id
     where l.periodo_lectivo = p_periodo
       and ef.estado = 'APROBADA'
     group by mi.profesor_id
  )
  insert into asistencia_mesas_examinadoras
    (catedra_id, mesas_convocadas, mesas_asistidas)
  select c.id, a.convocadas, a.asistidas
    from agg a
    join catedras c on c.profesor_id = a.profesor_id
                   and c.periodo_lectivo = p_periodo
                   and c.activo
  on conflict (catedra_id) do update
     set mesas_convocadas = excluded.mesas_convocadas,
         mesas_asistidas  = excluded.mesas_asistidas;

  get diagnostics v_filas = row_count;
  return v_filas;
end $$;

notify pgrst, 'reload schema';
