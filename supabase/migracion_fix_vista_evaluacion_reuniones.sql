-- ============================================================
-- Fix: v_evaluacion_docente_detalle no reflejaba asistencia_reuniones
-- ============================================================
-- Al cargar la asistencia a reuniones docentes 2026 (100% para quien
-- asistió a cualquiera de los 4 días de la misma reunión repetida por
-- sede), "Participación institucional" seguía dando 0% para todos en
-- la Foja/vista, a pesar de que asistencia_reuniones.porcentaje_asistencia
-- tenía el dato correcto.
--
-- schema.sql (reconstrucción del 2026-08-27) documenta la vista con una
-- rama CASE para OBJETIVO_REUNIONES que sí usa asistencia_reuniones,
-- pero varias veces esta sesión se confirmó que ese archivo no siempre
-- coincide con lo que hay realmente corrido en la base (columnas
-- generadas no documentadas, etc.). Esta migración vuelve a aplicar la
-- vista completa (create or replace) para garantizar que la rama
-- OBJETIVO_REUNIONES (y de paso OBJETIVO_MESAS_EXAMINADORAS y
-- OBJETIVO_CLASES_CONTENIDO) queden como corresponde. Si ya estaban
-- bien, este script no cambia nada.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

create or replace view v_evaluacion_docente_detalle as
select
  c.id as catedra_id,
  c.periodo_lectivo,
  c.seccion_grupo,
  s.nombre as sede,
  car.nombre as carrera,
  asig.nombre as asignatura,
  asig.curso_nivel,
  p.id as profesor_id,
  p.documento_identidad,
  (p.nombres || ' ' || p.apellidos) as profesor_completo,
  cr.id as criterio_id,
  cr.grupo,
  cr.orden,
  cr.nombre as criterio_nombre,
  cr.descripcion as criterio_descripcion,
  cr.peso_porcentaje as ponderacion,
  cr.origen,
  case cr.origen
    when 'OBJETIVO_CLASES_CONTENIDO' then
      round(((coalesce(ac.porcentaje_asistencia, 0) + coalesce(cc.porcentaje_cumplimiento, 0)) / 2)
            * cr.peso_porcentaje / 100, 2)
    when 'OBJETIVO_MESAS_EXAMINADORAS' then
      round(coalesce(ame.porcentaje_asistencia, 0) * cr.peso_porcentaje / 100, 2)
    when 'OBJETIVO_REUNIONES' then
      round(coalesce(ar.porcentaje_asistencia, 0) * cr.peso_porcentaje / 100, 2)
    else
      coalesce(ecc.obtenido_porcentaje, 0)
  end as obtenido_porcentaje
from catedras c
join profesores p on p.id = c.profesor_id
join asignaturas asig on asig.id = c.asignatura_id
join carreras car on car.id = asig.carrera_id
join sedes s on s.id = c.sede_id
cross join criterios_evaluacion cr
left join asistencia_clases ac on ac.catedra_id = c.id
left join cumplimiento_contenido cc on cc.catedra_id = c.id
left join asistencia_mesas_examinadoras ame on ame.catedra_id = c.id
left join asistencia_reuniones ar on ar.catedra_id = c.id
left join evaluacion_criterio_catedra ecc on ecc.catedra_id = c.id and ecc.criterio_id = cr.id
where cr.activo = true and cr.periodo_lectivo = c.periodo_lectivo;

grant select on v_evaluacion_docente_detalle to authenticated;

select registrar_migracion('migracion_fix_vista_evaluacion_reuniones.sql');

notify pgrst, 'reload schema';
