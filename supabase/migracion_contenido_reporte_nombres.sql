-- ============================================================
-- Permitir leer nombre de usuario en el reporte de contenido
-- ============================================================
-- catedra_contenido_avance_historial guarda quién hizo cada guardado
-- (registrado_por), pero usuarios_perfil solo dejaba leer el propio
-- perfil (o todos, si sos ADMIN) — un secretario no podía ver el
-- nombre de otra secretaria/admin en el reporte de "Historial de
-- guardados" de contenido programático.
--
-- nombre_completo y rol no son datos sensibles (es directorio interno
-- de personal, ya visible en otras pantallas de alcance), así que se
-- habilita lectura general para cualquier usuario logueado con rol
-- activo. Sigue sin poder escribir/editar perfiles ajenos.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

drop policy if exists usuarios_perfil_lee_todos on usuarios_perfil;

create policy usuarios_perfil_lee_todos on usuarios_perfil
  for select to authenticated using (true);

select registrar_migracion('migracion_contenido_reporte_nombres.sql');

notify pgrst, 'reload schema';
