-- ============================================================
-- Permitir que el secretario cambie el profesor de una cátedra
-- de su alcance
-- ============================================================
-- El horario (catedra_horario) ya lo puede editar el secretario
-- directamente: la policy catedra_horario_alcance (creada en
-- migracion_asistencia_clases_diaria.sql) solo exige
-- app_alcanza_catedra(catedra_id), sin restringir por rol.
--
-- Lo que falta es reasignar el profesor de la cátedra en sí:
-- la tabla catedras solo tiene catedras_lee (select) y
-- catedras_admin (insert/update/delete, requiere app_es_admin())
-- para el resto de los roles. Igual que con
-- migracion_secretario_borra_catedra.sql, en vez de abrir una
-- policy de UPDATE directa sobre toda la fila (que dejaría tocar
-- asignatura/sede/período y sacar la cátedra de su propio
-- alcance), se agrega una función security definer bien acotada:
-- solo puede cambiar profesor_id, y solo dentro de su alcance.
-- ============================================================

create or replace function catedra_editar_profesor(p_catedra_id uuid, p_profesor_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not app_alcanza_catedra(p_catedra_id) then
    raise exception 'No tenés acceso a esta cátedra.';
  end if;
  if not app_rol_escribe() then
    raise exception 'Tu rol no tiene permiso para editar cátedras.';
  end if;

  update catedras set profesor_id = p_profesor_id where id = p_catedra_id;
end $$;

revoke execute on function catedra_editar_profesor(uuid, uuid) from anon, public;
grant execute on function catedra_editar_profesor(uuid, uuid) to authenticated;

select registrar_migracion('migracion_secretario_edita_profesor_catedra.sql');

notify pgrst, 'reload schema';
