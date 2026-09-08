-- ============================================================
-- Fix: asistencia_clase_registro no chequeaba el rol
-- ============================================================
-- migracion_asistencia_clases_diaria.sql creó esta tabla con una sola
-- policy "for all" que solo valida app_alcanza_carrera(carrera_id,
-- sede_id) — es anterior a que existiera app_rol_escribe() (agregada
-- después, en migracion_rol_director.sql, y ya usada por examen_fecha
-- y plan_anual_entrega). Resultado: un DIRECTOR, que tiene alcance
-- asignado igual que un SECRETARIO pero debería ser de solo lectura,
-- podía marcar asistencia llamando directo a la API aunque la UI le
-- oculte el botón (RegistrarAsistencia.jsx ya gatea con puedeEscribir,
-- pero eso no protege nada del lado del servidor).
--
-- Mismo patrón que migracion_rol_director.sql: se separa la policy
-- "for all" en una de lectura (alcance solo) y otra de escritura
-- (alcance + app_rol_escribe()).
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

drop policy if exists asistencia_clase_registro_alcance on asistencia_clase_registro;

create policy asistencia_clase_registro_lee on asistencia_clase_registro
  for select to authenticated
  using (app_alcanza_carrera(carrera_id, sede_id));

create policy asistencia_clase_registro_escribe on asistencia_clase_registro
  for all to authenticated
  using (app_alcanza_carrera(carrera_id, sede_id) and app_rol_escribe())
  with check (app_alcanza_carrera(carrera_id, sede_id) and app_rol_escribe());

select registrar_migracion('migracion_fix_rls_asistencia_clase_registro.sql');
