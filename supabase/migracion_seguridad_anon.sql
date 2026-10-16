-- ============================================================
-- Cerrar el acceso anónimo a tablas y vistas
-- ============================================================
-- La app está publicada en internet (Tailscale Funnel) y la anon key
-- viaja en el frontend, así que cualquiera puede consultar la API REST
-- sin iniciar sesión. Las tablas están protegidas por RLS, pero una
-- vista sin security_invoker corre con los permisos de su dueño y se
-- saltea la RLS: v_evaluacion_docente_detalle quedó legible para anon
-- (nombre, cédula y % de evaluación de todos los profesores) porque
-- migracion_restringir_evaluacion.sql le quitó el SELECT a
-- authenticated pero no a anon.
--
-- Ninguna pantalla lee tablas sin sesión: la única consulta pública es
-- /mis-mesas, que usa la función consulta_publica_mesas(). Por eso se
-- le quita a anon todo privilegio sobre tablas y vistas de public, y
-- también para las que se creen de acá en adelante. Los permisos de
-- EXECUTE sobre funciones no cambian.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- La vista de evaluación tampoco tiene que ser legible por PUBLIC
-- (anon y authenticated la heredan): se accede solo por
-- v_evaluacion_docente_ver(), que filtra por rol.
revoke all on v_evaluacion_docente_detalle from public;

select registrar_migracion('migracion_seguridad_anon.sql');

notify pgrst, 'reload schema';
