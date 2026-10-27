-- ============================================================
-- Consulta: profesores con rendimiento crítico
-- ============================================================
-- Solo lectura. Ejecutar en el SQL Editor de Supabase.
--
-- Crítico = total de la foja menor a 60 (redondeado a favor del
-- profesor), que en la escala de la Resolución 054/2021 es "No cumple".
-- Se toman solo cátedras activas del período.
--
-- Para cambiar el período o el umbral, editar la primera línea (params).
-- Para ver todas las cátedras con su total, cambiar el último "where".
-- ============================================================

with params as (
  select '2025'::text as periodo, 60::numeric as umbral
),
foja as (
  select d.catedra_id,
         d.profesor_id,
         d.documento_identidad,
         d.profesor_completo,
         d.carrera,
         d.sede,
         d.curso_nivel,
         d.seccion_grupo,
         d.asignatura,
         round(sum(d.obtenido_porcentaje::numeric), 1)                                       as total_foja,
         round(sum(d.obtenido_porcentaje::numeric) filter (where d.grupo = 'INSTITUCIONAL'), 1) as institucional,
         round(sum(d.obtenido_porcentaje::numeric) filter (where d.grupo = 'ALUMNOS'), 1)       as alumnos,
         string_agg(
           case when d.ponderacion::numeric > 0 and d.obtenido_porcentaje::numeric < 0.6 * d.ponderacion::numeric
                then concat_ws(' ', d.criterio_nombre, concat(round(d.obtenido_porcentaje::numeric, 1), '/', d.ponderacion))
           end, '; ' order by d.orden) as criterios_bajos
    from v_evaluacion_docente_detalle d
    join catedras c on c.id = d.catedra_id and c.activo
    join params p on d.periodo_lectivo = p.periodo
   group by d.catedra_id, d.profesor_id, d.documento_identidad, d.profesor_completo,
            d.carrera, d.sede, d.curso_nivel, d.seccion_grupo, d.asignatura
)
select f.profesor_completo                         as profesor,
       f.documento_identidad                       as ci,
       f.carrera,
       f.sede,
       concat(f.curso_nivel, 'º', f.seccion_grupo) as curso,
       f.asignatura,
       f.total_foja,
       f.institucional,
       f.alumnos,
       f.criterios_bajos
  from foja f, params p
 where round(f.total_foja) < p.umbral
 order by f.total_foja, f.profesor_completo;


-- ------------------------------------------------------------
-- Resumen por profesor (promedio de sus cátedras del período).
-- Seleccionar desde acá hasta el final y ejecutar aparte.
-- ------------------------------------------------------------
with params as (
  select '2025'::text as periodo, 60::numeric as umbral
),
foja as (
  select d.catedra_id, d.profesor_id, d.documento_identidad, d.profesor_completo,
         sum(d.obtenido_porcentaje::numeric) as total_foja
    from v_evaluacion_docente_detalle d
    join catedras c on c.id = d.catedra_id and c.activo
    join params p on d.periodo_lectivo = p.periodo
   group by d.catedra_id, d.profesor_id, d.documento_identidad, d.profesor_completo
)
select f.profesor_completo                                          as profesor,
       f.documento_identidad                                        as ci,
       count(*)                                                     as catedras,
       count(*) filter (where round(f.total_foja) < p.umbral)       as catedras_criticas,
       round(avg(f.total_foja), 1)                                  as promedio_foja,
       round(min(f.total_foja), 1)                                  as peor_foja
  from foja f, params p
 group by f.profesor_completo, f.documento_identidad, p.umbral
having round(avg(f.total_foja)) < p.umbral
 order by promedio_foja, profesor;
