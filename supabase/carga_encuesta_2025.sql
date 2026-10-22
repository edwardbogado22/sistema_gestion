-- ============================================================
-- Carga de la encuesta a alumnos 2025 (Resolución CSU N° 054/2021)
-- ============================================================
-- Reemplaza la encuesta 2025 cargada por los datos del sistema de
-- evaluación de la facultad (10 indicadores, cuestionario 2025), con la
-- fórmula de la resolución: Siempre = 2, A veces = 1, Nunca = 0, sumado
-- y dividido por los encuestados (nivel 1 a 3 → 0 % a 100 % del peso).
--
-- ORDEN (no saltear pasos):
--   0) migracion_encuesta_resolucion_054.sql  (deja los 10 indicadores)
--   1) PASO 1 de este archivo                 (borra la encuesta 2025 vieja)
--   2) Importar Datos → Encuesta alumnos      (planilla/encuesta/encuesta_alumnos_2025.csv)
--   3) PASO 3 de este archivo                 (completa las cátedras sin encuesta)
--   4) PASO 4 de este archivo                 (controles)
--
-- El PASO 1 va comentado: el archivo completo se puede ejecutar sin
-- borrar nada (corre el PASO 3 y los controles del PASO 4).
-- ============================================================


-- ------------------------------------------------------------
-- PASO 1 — Borrar la encuesta 2025 cargada hasta ahora
-- ------------------------------------------------------------
-- Va comentado a propósito: este archivo se puede ejecutar completo
-- (pasos 3 y 4) sin borrar nada. Para el PASO 1, copiar SOLO estas
-- líneas sin los "--" y ejecutarlas antes de importar el CSV.
--
-- delete from evaluacion_criterio_catedra ecc
--  using criterios_evaluacion cr
--  where cr.id = ecc.criterio_id
--    and cr.origen = 'ENCUESTA_ALUMNOS'
--    and cr.periodo_lectivo = '2025';


-- ------------------------------------------------------------
-- PASO 3 — Completar las cátedras 2025 sin encuesta
-- ------------------------------------------------------------
-- Correr DESPUÉS de importar el CSV. Cada indicador que falte se
-- completa con el promedio de las cátedras que sí tienen encuesta en
-- la misma carrera y sede. Se marcan con total_encuestados = 0 para
-- poder distinguirlas de las encuestas reales.

insert into evaluacion_criterio_catedra (catedra_id, criterio_id, valor_ingresado, total_encuestados, obtenido_porcentaje)
select c.id, cr.id, prom.valor, 0, prom.obtenido
  from catedras c
  join asignaturas a on a.id = c.asignatura_id
  join criterios_evaluacion cr
    on cr.periodo_lectivo = c.periodo_lectivo and cr.origen = 'ENCUESTA_ALUMNOS' and cr.activo
  join lateral (
    select round(avg(e.valor_ingresado), 4)      as valor,
           round(avg(e.obtenido_porcentaje), 2)  as obtenido
      from evaluacion_criterio_catedra e
      join catedras c2    on c2.id = e.catedra_id
      join asignaturas a2 on a2.id = c2.asignatura_id
     where e.criterio_id = cr.id
       and e.total_encuestados > 0
       and c2.sede_id = c.sede_id
       and a2.carrera_id = a.carrera_id
  ) prom on prom.valor is not null
 where c.periodo_lectivo = '2025'
   and c.activo
   and not exists (select 1 from evaluacion_criterio_catedra x
                    where x.catedra_id = c.id and x.criterio_id = cr.id);


-- ------------------------------------------------------------
-- PASO 4 — Controles (solo lectura)
-- ------------------------------------------------------------

-- 4.a) Cuántas cátedras quedaron con encuesta real, con promedio o sin nada
select s.nombre as sede, car.nombre as carrera,
       count(distinct c.id) filter (where exists (select 1 from evaluacion_criterio_catedra e join criterios_evaluacion cr on cr.id = e.criterio_id
                                                   where e.catedra_id = c.id and cr.origen = 'ENCUESTA_ALUMNOS' and e.total_encuestados > 0)) as con_encuesta,
       count(distinct c.id) filter (where exists (select 1 from evaluacion_criterio_catedra e join criterios_evaluacion cr on cr.id = e.criterio_id
                                                   where e.catedra_id = c.id and cr.origen = 'ENCUESTA_ALUMNOS' and e.total_encuestados = 0)) as con_promedio,
       count(distinct c.id) filter (where not exists (select 1 from evaluacion_criterio_catedra e join criterios_evaluacion cr on cr.id = e.criterio_id
                                                       where e.catedra_id = c.id and cr.origen = 'ENCUESTA_ALUMNOS')) as sin_encuesta,
       count(distinct c.id) as total
  from catedras c
  join asignaturas a on a.id = c.asignatura_id
  join carreras car  on car.id = a.carrera_id
  join sedes s       on s.id = c.sede_id
 where c.periodo_lectivo = '2025' and c.activo
 group by s.nombre, car.nombre
 order by s.nombre, car.nombre;

-- 4.b) Ninguna foja 2025 puede pasar de 100 % ni sumar ponderaciones distintas de 100
select sede, carrera, asignatura, seccion_grupo, profesor_completo,
       sum(ponderacion) as ponderaciones, sum(obtenido_porcentaje) as total
  from v_evaluacion_docente_detalle
 where periodo_lectivo = '2025'
 group by catedra_id, sede, carrera, asignatura, seccion_grupo, profesor_completo
having sum(ponderacion) <> 100 or sum(obtenido_porcentaje) > 100;
