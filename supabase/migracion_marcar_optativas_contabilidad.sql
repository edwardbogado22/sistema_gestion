-- ============================================================
-- Marcar las optativas de Contabilidad 4º
-- ============================================================
-- Según el plan de estudios, en Contabilidad 4º la "Optativa I" se
-- elige entre Administración de Recursos Humanos e Informática
-- Aplicada. La importación por CSV no traía la columna optativa, así
-- que ambas quedaron como obligatorias y el trigger de choque de
-- profesor las bloqueaba como tales.
--
-- Solo toca Contabilidad 4º: Administración de Recursos Humanos en
-- Administración 2º sigue siendo obligatoria.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

update asignaturas a
   set optativa = true,
       actualizado_en = now()
  from carreras car
 where car.id = a.carrera_id
   and car.nombre = 'CONTABILIDAD'
   and a.curso_nivel = 4
   and upper(translate(a.nombre, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))
       in ('ADMINISTRACION DE RECURSOS HUMANOS', 'INFORMATICA APLICADA');

-- Verificación: deben aparecer las dos con optativa = true
select a.codigo, a.nombre, car.nombre as carrera, a.curso_nivel, a.optativa
  from asignaturas a join carreras car on car.id = a.carrera_id
 where a.optativa
 order by car.nombre, a.curso_nivel, a.nombre;

select registrar_migracion('migracion_marcar_optativas_contabilidad.sql');
