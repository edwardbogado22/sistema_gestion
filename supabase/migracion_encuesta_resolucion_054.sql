-- ============================================================
-- Encuesta a alumnos según la Resolución CSU N° 054/2021
-- ============================================================
-- La resolución fija 10 indicadores de valoración de los estudiantes,
-- 2 % cada uno (20 % en total). El sistema tenía 11: "Puntualidad" y
-- "Entrega de resultados en tiempo" no están en la resolución (ya se
-- evalúan en los criterios institucionales 1 y 2) y faltaba "Demuestra
-- un trato amable y respetuoso". Con 11 × 2 % las ponderaciones sumaban
-- 102 % y había fojas por encima de 100 %.
--
-- Deja los indicadores con el orden y el texto de la resolución, que
-- es lo que imprime la foja. Los dos indicadores de más se desactivan
-- (no se borran: sus datos quedan, pero ya no cuentan).
--
-- IMPORTANTE: aplicar junto con la carga de la encuesta 2025 que trae
-- "trato amable"; sin esos datos ese indicador queda en 0 %.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

begin;

update criterios_evaluacion
   set activo = false
 where origen = 'ENCUESTA_ALUMNOS'
   and codigo in ('ALU_PUNTUALIDAD', 'ALU_ENTREGA_NOTAS')
   and periodo_lectivo in ('2025', '2026');

-- Orden y texto de la resolución para los 9 que ya existen
update criterios_evaluacion cr
   set orden = v.orden, descripcion = v.descripcion
  from (values
    ('ALU_DOMINIO_CONTENIDO',       1, 'Demuestra conocer a profundidad el contenido de la asignatura.'),
    ('ALU_RESPUESTA_PRECISION',     2, 'Responde con precisión las preguntas o aclaraciones solicitadas por los estudiantes.'),
    ('ALU_PROGRAMA_CLARO',          3, 'Da a conocer el programa de la asignatura: objetivos, contenidos, metodología y sistema de evaluación de forma clara.'),
    ('ALU_DESARROLLO_PROGRAMA',     4, 'Desarrolla sus clases conforme al programa de estudios aprobado.'),
    ('ALU_METODOLOGIA',             5, 'La metodología de enseñanza empleada facilita el aprendizaje (Exposición, simulacro, debate, reflexión, análisis, panel, mesa redonda, etc.).'),
    ('ALU_USO_TIC',                 6, 'Emplea adecuadamente las tecnologías de la información y de la comunicación para apoyar el proceso de enseñanza aprendizaje (plataformas virtuales, bibliotecas virtuales, internet, simuladores, etc.).'),
    ('ALU_EVALUACION_CONTENIDOS',   7, 'Evalúa de acuerdo a los contenidos desarrollados.'),
    ('ALU_REVISION_CALIFICACIONES', 8, 'Analiza con los estudiantes los resultados de las evaluaciones, justifica las calificaciones y es capaz de revisarlas si hay errores.'),
    ('ALU_APERTURA_CONSULTAS',      9, 'Demuestra apertura e interés en las consultas, comentarios u opiniones, y analiza con los estudiantes.')
  ) as v(codigo, orden, descripcion)
 where cr.codigo = v.codigo
   and cr.origen = 'ENCUESTA_ALUMNOS'
   and cr.periodo_lectivo in ('2025', '2026');

-- Indicador 10, que faltaba
insert into criterios_evaluacion (codigo, nombre, descripcion, peso_porcentaje, periodo_lectivo, activo, grupo, orden, origen)
select 'ALU_TRATO_AMABLE', 'Trato amable y respetuoso', 'Demuestra un trato amable y respetuoso.',
       2, p.periodo, true, 'ALUMNOS', 10, 'ENCUESTA_ALUMNOS'
  from (values ('2025'), ('2026')) as p(periodo)
 where not exists (select 1 from criterios_evaluacion x
                    where x.codigo = 'ALU_TRATO_AMABLE' and x.periodo_lectivo = p.periodo);

-- Control: cada período tiene que sumar exactamente 100 %
do $$
declare r record;
begin
  for r in select periodo_lectivo, sum(peso_porcentaje) as total
             from criterios_evaluacion
            where activo and periodo_lectivo in ('2025', '2026')
            group by periodo_lectivo
  loop
    if r.total <> 100 then
      raise exception 'Las ponderaciones de % suman % %%, no 100 %%.', r.periodo_lectivo, r.total;
    end if;
  end loop;
end $$;

select registrar_migracion('migracion_encuesta_resolucion_054.sql');

commit;
