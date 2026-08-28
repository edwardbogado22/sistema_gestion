-- ============================================================
-- Sistema de Evaluación Docente - FCE UNE
-- Corrección: "permission denied for view v_evaluacion_docente_detalle"
--
-- policies.sql otorgó GRANT select/insert/update/delete sobre las
-- tablas base (catedras, asignaturas, etc.) pero nunca sobre la
-- vista v_evaluacion_docente_detalle en sí. En Postgres una vista
-- no hereda los permisos de sus tablas base: el rol que la consulta
-- necesita GRANT explícito sobre la vista, aunque tenga acceso a
-- todas las tablas de las que depende.
--
-- Seguro de correr una sola vez (o repetidas veces, es idempotente).
-- ============================================================

grant select on v_evaluacion_docente_detalle to authenticated;

-- PostgREST (la capa que usa supabase-js) cachea los permisos y el
-- esquema en memoria; sin este NOTIFY puede seguir devolviendo
-- "permission denied" un rato después del GRANT de arriba aunque
-- ya haya quedado bien aplicado en Postgres.
notify pgrst, 'reload schema';
