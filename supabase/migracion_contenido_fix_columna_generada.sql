-- ============================================================
-- Fix: porcentaje_cumplimiento / porcentaje_asistencia son
-- columnas GENERADAS en la base real (calculadas por Postgres a
-- partir de unidades_programadas/desarrolladas u
-- horas_programadas/dictadas), pero el código las trataba como
-- columnas normales y las escribía explícitamente.
--
-- Postgres rechaza cualquier insert/update que fije un valor en
-- una columna GENERATED ALWAYS, sin importar el rol o si viene de
-- un trigger security definer. Esto rompía:
--   - El trigger contenido_recalcular_cumplimiento() (kiosco).
--   - La carga manual en Cargar Indicadores (asistencia_clases y
--     cumplimiento_contenido).
--   - Las 4 pestañas de Importar Datos que usan
--     ImportarIndicadorObjetivo (asistencia_clases,
--     cumplimiento_contenido, asistencia_mesas_examinadoras,
--     asistencia_reuniones).
--
-- Esta migración corrige solo el trigger (la parte en SQL). Los
-- otros 4 puntos son código de frontend, corregidos en el mismo
-- commit (ImportarDatos.jsx, CargarIndicadores.jsx): dejan de
-- mandar la columna de porcentaje y confían en que Postgres la
-- calcule sola.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

create or replace function contenido_recalcular_cumplimiento()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_catedra_id uuid := coalesce(new.catedra_id, old.catedra_id);
  v_asignatura_id uuid;
  v_total_unidades int;
  v_unidades_completas int;
begin
  select asignatura_id into v_asignatura_id from catedras where id = v_catedra_id;

  select count(*) into v_total_unidades
    from contenido_unidad
   where asignatura_id = v_asignatura_id;

  -- Unidad "desarrollada" = tiene al menos un subtema y todos están marcados.
  select count(*) into v_unidades_completas
    from contenido_unidad cu
   where cu.asignatura_id = v_asignatura_id
     and exists (select 1 from contenido_subtema cs where cs.unidad_id = cu.id)
     and not exists (
       select 1
         from contenido_subtema cs
        where cs.unidad_id = cu.id
          and not exists (
            select 1 from catedra_contenido_avance cca
             where cca.catedra_id = v_catedra_id and cca.subtema_id = cs.id
          )
     );

  -- porcentaje_cumplimiento es columna generada: no se fija acá,
  -- Postgres la calcula sola a partir de estas dos columnas.
  insert into cumplimiento_contenido (catedra_id, unidades_programadas, unidades_desarrolladas)
  values (v_catedra_id, v_total_unidades, v_unidades_completas)
  on conflict (catedra_id) do update
     set unidades_programadas = excluded.unidades_programadas,
         unidades_desarrolladas = excluded.unidades_desarrolladas;

  return coalesce(new, old);
end;
$$;

select registrar_migracion('migracion_contenido_fix_columna_generada.sql');

notify pgrst, 'reload schema';
