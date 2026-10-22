-- ============================================================
-- Avisos críticos del Security Advisor de Supabase
-- ============================================================
-- 1) "Security Definer View" en v_evaluacion_docente_detalle.
--    migracion_roles_alcance.sql le puso security_invoker = on, pero
--    las migraciones posteriores la recrearon con CREATE OR REPLACE
--    VIEW y eso le borró la opción: la vista volvió a correr con los
--    permisos de su dueño, salteando la RLS del que consulta.
--    No hay uso directo desde la app: la Foja e Informes Consolidados
--    leen por v_evaluacion_docente_ver(), que es security definer y
--    filtra por rol, así que siguen viendo lo mismo.
--    OJO: si se vuelve a recrear la vista, repetir este ALTER al final.
--
-- 2) "RLS Disabled in Public" en configuracion_importacion_csv.
--    Tabla del diseño original que ninguna pantalla usa. Sin RLS,
--    cualquier usuario con sesión podía leerla y modificarla. Queda
--    solo para el administrador.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

alter view v_evaluacion_docente_detalle set (security_invoker = on);

alter table configuracion_importacion_csv enable row level security;

drop policy if exists configuracion_importacion_csv_admin on configuracion_importacion_csv;
create policy configuracion_importacion_csv_admin on configuracion_importacion_csv
  for all to authenticated using (app_es_admin()) with check (app_es_admin());

-- Control: tiene que devolver security_invoker=on y rls = true
select 'v_evaluacion_docente_detalle' as objeto, array_to_string(c.reloptions, ', ') as opciones, null::boolean as rls
  from pg_class c where c.relname = 'v_evaluacion_docente_detalle'
union all
select 'configuracion_importacion_csv', null, c.relrowsecurity
  from pg_class c where c.relname = 'configuracion_importacion_csv';

select registrar_migracion('migracion_seguridad_lints.sql');

notify pgrst, 'reload schema';
