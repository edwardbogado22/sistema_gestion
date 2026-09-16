-- ============================================================
-- Permitir que el secretario vea el directorio completo de
-- profesores confirmados (para elegir reemplazante en cátedras)
-- ============================================================
-- profesores_lee (migracion_roles_alcance.sql) solo dejaba ver a
-- un secretario los profesores que YA tienen una cátedra dentro
-- de su alcance. Eso rompe la edición agregada en
-- migracion_secretario_edita_profesor_catedra.sql: para poner un
-- reemplazante, el profesor nuevo por definición todavía no tiene
-- cátedra en el alcance del secretario, así que ni aparecía en el
-- selector.
--
-- Se amplía la policy para que cualquier rol con permiso de
-- escritura (app_rol_escribe(): ADMIN o SECRETARIO) vea el
-- directorio completo de profesores confirmados. DIRECTOR (solo
-- auditoría, no reasigna cátedras) sigue viendo únicamente a los
-- profesores dentro de su alcance, como antes.
-- ============================================================

drop policy if exists profesores_lee on profesores;

create policy profesores_lee on profesores
  for select to authenticated using (
    app_rol_escribe() or exists (
      select 1 from catedras c
       where c.profesor_id = profesores.id
         and app_alcanza_catedra(c.id)
    )
  );

select registrar_migracion('migracion_secretario_ve_profesores.sql');

notify pgrst, 'reload schema';
