-- ============================================================
-- Restaurar la vista completa de evaluación (deshace un error mío)
-- ============================================================
-- migracion_fix_vista_evaluacion_reuniones.sql (corrida hoy) reaplicó
-- la vista v_evaluacion_docente_detalle usando la versión vieja de
-- schema.sql, que NO tiene las ramas OBJETIVO_PLAN_ANUAL ni
-- OBJETIVO_CAPACITACIONES agregadas después por
-- migracion_eventos_criterios.sql (ya corrida en la base el
-- 2026-09-07, antes de esta sesión). Esa vista vieja también calcula
-- "Participación institucional" leyendo asistencia_reuniones en vez
-- del sistema de evento/evento_asistencia_registro con agrupamiento
-- por "grupo" que ya estaba implementado.
--
-- Efecto real detectado: "Planificación y documentación pedagógica"
-- (20%) empezó a dar 0% para cátedras con plan anual sí entregado
-- (ej. plan_anual_entrega de Daysi Soledad Unzain Saldívar,
-- CONTABILIDAD I, con fecha_entrega real).
--
-- Esta migración vuelve a aplicar exactamente la vista de
-- migracion_eventos_criterios.sql (la versión correcta y más
-- reciente), sin cambiar nada de su lógica.
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
      round(case when reun.convocadas > 0 then reun.asistidas::numeric / reun.convocadas else 0 end
            * cr.peso_porcentaje, 2)
    when 'OBJETIVO_PLAN_ANUAL' then
      round((case when pae.fecha_entrega is not null then 100 else 0 end) * cr.peso_porcentaje / 100, 2)
    when 'OBJETIVO_CAPACITACIONES' then
      round(coalesce(cap.promedio_pct, 0) * cr.peso_porcentaje / 100, 2)
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
left join plan_anual_entrega pae on pae.catedra_id = c.id
left join evaluacion_criterio_catedra ecc on ecc.catedra_id = c.id and ecc.criterio_id = cr.id
left join lateral (
  select
    count(distinct coalesce(e.grupo, e.id::text)) as convocadas,
    count(distinct case when ear.id is not null then coalesce(e.grupo, e.id::text) end) as asistidas
  from evento e
  join periodo_academico pa2 on e.fecha between pa2.fecha_inicio and pa2.fecha_fin
  left join evento_asistencia_registro ear on ear.evento_id = e.id and ear.profesor_id = p.id
  where e.tipo = 'REUNION' and e.activo = true and pa2.etiqueta_periodo_lectivo = c.periodo_lectivo
) reun on true
left join lateral (
  select avg(x.puntaje) as promedio_pct
  from (
    select
      case
        when bool_and(e.tipo = 'CAPACITACION_NO_EVALUADA')
          then case when bool_or(ear.id is not null) then 100 else 0 end
        else coalesce(max(cres.porcentaje_obtenido), 0)
      end as puntaje
    from evento e
    join periodo_academico pa3 on e.fecha between pa3.fecha_inicio and pa3.fecha_fin
    left join evento_asistencia_registro ear on ear.evento_id = e.id and ear.profesor_id = p.id
    left join capacitacion_resultado cres
      on cres.profesor_id = p.id
     and cres.clave_capacitacion = coalesce(e.grupo, e.id::text)
     and cres.periodo_lectivo = c.periodo_lectivo
    where e.tipo in ('CAPACITACION_EVALUADA', 'CAPACITACION_NO_EVALUADA')
      and e.activo = true and pa3.etiqueta_periodo_lectivo = c.periodo_lectivo
    group by coalesce(e.grupo, e.id::text)
  ) x
) cap on true
where cr.activo = true and cr.periodo_lectivo = c.periodo_lectivo;

select registrar_migracion('migracion_restaurar_vista_eventos.sql');

notify pgrst, 'reload schema';
