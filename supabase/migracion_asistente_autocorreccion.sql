-- ============================================================
-- Autocorrección del rol Asistente en Asistencia a Eventos
-- ============================================================
-- El Asistente (personal de puerta que hace check-in por celular) no
-- tenía forma de corregir un registro cargado por error (persona
-- equivocada, doble carga) sin depender de Admin. Ahora puede borrar
-- sus propios registros (registrado_por = él); los de otros usuarios
-- siguen protegidos, y el borrado de terceros sigue siendo exclusivo
-- de ADMIN.
--
-- La lectura de evento_asistencia_registro ya es abierta a cualquier
-- autenticado (evento_asistencia_registro_lee, using (true), en
-- migracion_asistencia_eventos.sql), así que no hace falta tocar esa
-- policy: con la pantalla "Mis Registros" alcanza.
--
-- Requiere haber corrido antes migracion_rol_asistente.sql (define
-- app_rol() = 'ASISTENTE' y la policy que se reemplaza acá).
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

drop policy if exists evento_asistencia_registro_admin_delete on evento_asistencia_registro;

create policy evento_asistencia_registro_delete on evento_asistencia_registro
  for delete to authenticated
  using (app_es_admin() or (app_rol() = 'ASISTENTE' and registrado_por = auth.uid()));

notify pgrst, 'reload schema';
