-- ============================================================
-- Restringir el resultado final de evaluación a ADMIN/DIRECTOR
-- ============================================================
-- El Secretario de Carrera sigue cargando indicadores día a día, pero
-- deja de poder ver el resultado final (% obtenido y clasificación):
-- eso queda solo para Dirección Académica (todas las carreras) y
-- Director de Carrera (la suya). Restringir solo la ruta del frontend
-- no alcanza — el Secretario podría seguir leyendo la vista pegándole
-- directo a la API REST — así que se restringe también acá.
--
-- v_evaluacion_docente_detalle la usan hoy FojaDesempeno.jsx e
-- InformesConsolidados.jsx; ningún otro archivo depende de ella. Se
-- deja de exponer la vista directo a "authenticated" y se la envuelve
-- en una función security definer, mismo patrón que
-- admin_listar_perfiles()/admin_alta_perfil() en
-- migracion_alta_funcionarios.sql.
--
-- Requiere haber corrido antes migracion_roles_alcance.sql (usa
-- app_es_admin(), app_rol(), app_alcanza_catedra()) y
-- migracion_rol_director.sql (rol DIRECTOR).
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

create or replace function v_evaluacion_docente_ver(p_catedra_id uuid default null, p_periodo_lectivo text default null)
returns setof v_evaluacion_docente_detalle
language sql stable security definer set search_path = public
as $$
  select * from v_evaluacion_docente_detalle
  where (app_es_admin() or (app_rol() = 'DIRECTOR' and app_alcanza_catedra(catedra_id)))
    and (p_catedra_id is null or catedra_id = p_catedra_id)
    and (p_periodo_lectivo is null or periodo_lectivo = p_periodo_lectivo)
$$;

revoke execute on function v_evaluacion_docente_ver(uuid, text) from anon, public;
grant execute on function v_evaluacion_docente_ver(uuid, text) to authenticated;

-- La vista ya no se consulta directo desde el frontend: todo pasa por
-- la función de arriba, que filtra por rol antes de devolver filas.
revoke select on v_evaluacion_docente_detalle from authenticated;

notify pgrst, 'reload schema';
