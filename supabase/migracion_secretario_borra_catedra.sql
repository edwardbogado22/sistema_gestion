-- ============================================================
-- Permitir que el secretario borre cátedras de su alcance
-- ============================================================
-- Hasta ahora borrar una cátedra era exclusivo de Dirección
-- Académica (policy catedras_admin, requiere app_es_admin()). Al
-- cargar el período 2025 para Evaluación Docente, la planilla
-- original traía también auxiliares junto a los titulares: algunas
-- materias van a quedar con una cátedra de más (la del auxiliar, que
-- no corresponde evaluar como cátedra aparte) y el secretario de cada
-- carrera es quien sabe con certeza cuál es cuál — no Dirección
-- Académica ni quien carga los datos.
--
-- catedras_admin sigue existiendo tal cual (Dirección Académica
-- conserva alta/edición). Esto agrega SOLO el borrado, acotado al
-- alcance del secretario (misma función app_alcanza_catedra que ya
-- filtra qué cátedras puede VER), a través de una función en vez de
-- una policy de RLS directa:
--
--   asistencia_clases, cumplimiento_contenido y
--   asistencia_mesas_examinadoras son ADMIN-only para escritura
--   (asistencia_clases_admin, etc. en migracion_roles_alcance.sql) —
--   si la cátedra ya tiene indicadores cargados, un DELETE directo
--   del secretario sobre "catedras" fallaría al intentar la cascada
--   hacia esas tablas (RLS se sigue evaluando en la fila borrada por
--   cascada, no solo en la tabla de origen).
--
-- catedra_eliminar() corre como security definer: valida el alcance
-- y el rol, y de ahí en más limpia todo lo que cuelga de esa cátedra
-- a mano (evaluacion_criterio_catedra y catedra_horario ya tenían
-- "on delete cascade" — se repite el delete acá igual, no hace nada
-- si ya no queda nada). examen_fecha, mesa_integrante y
-- asistencia_reuniones también tienen cascada propia hacia catedras,
-- así que se resuelven solas al borrar la fila final.
-- ============================================================

create or replace function catedra_eliminar(p_catedra_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not app_alcanza_catedra(p_catedra_id) then
    raise exception 'No tenés acceso a esta cátedra.';
  end if;
  if not app_rol_escribe() then
    raise exception 'Tu rol no tiene permiso para borrar cátedras.';
  end if;

  delete from evaluacion_criterio_catedra    where catedra_id = p_catedra_id;
  delete from evaluacion_estudiantes         where catedra_id = p_catedra_id;
  delete from asistencia_clases              where catedra_id = p_catedra_id;
  delete from cumplimiento_contenido         where catedra_id = p_catedra_id;
  delete from asistencia_mesas_examinadoras  where catedra_id = p_catedra_id;
  delete from asistencia_reuniones           where catedra_id = p_catedra_id;
  delete from catedra_horario                where catedra_id = p_catedra_id;

  delete from catedras where id = p_catedra_id;
end $$;

revoke execute on function catedra_eliminar(uuid) from anon, public;
grant execute on function catedra_eliminar(uuid) to authenticated;

select registrar_migracion('migracion_secretario_borra_catedra.sql');

notify pgrst, 'reload schema';
