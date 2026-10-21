-- ============================================================
-- Diagnóstico de mesas examinadoras (solo lectura)
-- ============================================================
-- Tres consultas independientes para revisar el estado real de los
-- vocales en la base, sin pasar por la pantalla de Asignar vocales.
-- No modifican nada. Ejecutar de a una: seleccionar el bloque y Run.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Conteo por llamado: completas, incompletas y con vocales de más
-- ------------------------------------------------------------
-- con_mas_de_dos > 0 significa que se guardó una asignación encima de
-- vocales que la pantalla no estaba viendo.

select
  l.nombre,
  l.estado,
  count(*)                                as mesas,
  count(*) filter (where v.n = 2)         as completas,
  count(*) filter (where v.n < 2)         as incompletas,
  count(*) filter (where v.n > 2)         as con_mas_de_dos
from examen_llamado l
join examen_fecha ef on ef.llamado_id = l.id
join catedras c on c.id = ef.catedra_id and c.activo and not c.exento_examen
cross join lateral (
  select count(*) as n
    from mesa_integrante mi
   where mi.examen_fecha_id = ef.id
     and mi.rol_mesa = 'VOCAL'
) v
group by l.id, l.nombre, l.estado, l.fecha_inicio
order by l.fecha_inicio;


-- ------------------------------------------------------------
-- 2) Conflictos: qué vocal, en qué mesa y con cuál choca
-- ------------------------------------------------------------
-- Ya descuenta la excepción de las optativas del mismo curso, igual
-- que la pantalla.

select
  'Preside otra mesa ese dia' as problema,
  l.nombre                    as llamado,
  ef.fecha,
  s.nombre                    as sede,
  a.nombre                    as mesa,
  concat_ws(', ', v.apellidos, v.nombres) as vocal,
  s2.nombre                   as sede_donde_preside,
  a2.nombre                   as mesa_que_preside
from mesa_integrante mi
join examen_fecha ef   on ef.id = mi.examen_fecha_id
join examen_llamado l  on l.id = ef.llamado_id
join catedras c        on c.id = ef.catedra_id
join asignaturas a     on a.id = c.asignatura_id
join sedes s           on s.id = c.sede_id
join profesores v      on v.id = mi.profesor_id
join examen_fecha ef2  on ef2.llamado_id = ef.llamado_id
                      and ef2.fecha = ef.fecha
                      and ef2.id <> ef.id
join catedras c2       on c2.id = ef2.catedra_id
                      and c2.profesor_id = mi.profesor_id
                      and c2.activo
                      and not c2.exento_examen
join asignaturas a2    on a2.id = c2.asignatura_id
join sedes s2          on s2.id = c2.sede_id
where mi.rol_mesa = 'VOCAL'
  and not (
    a.optativa and a2.optativa
    and c.sede_id = c2.sede_id
    and a.carrera_id = a2.carrera_id
    and a.curso_nivel = a2.curso_nivel
    and c.seccion_grupo = c2.seccion_grupo
  )

union all

select
  'Es presidente y vocal de la misma mesa',
  l.nombre,
  ef.fecha,
  s.nombre,
  a.nombre,
  concat_ws(', ', v.apellidos, v.nombres),
  s.nombre,
  a.nombre
from mesa_integrante mi
join examen_fecha ef   on ef.id = mi.examen_fecha_id
join examen_llamado l  on l.id = ef.llamado_id
join catedras c        on c.id = ef.catedra_id
join asignaturas a     on a.id = c.asignatura_id
join sedes s           on s.id = c.sede_id
join profesores v      on v.id = mi.profesor_id
where mi.rol_mesa = 'VOCAL'
  and c.profesor_id = mi.profesor_id

order by 2, 3;


-- ------------------------------------------------------------
-- 3) Detalle de las mesas con más de dos vocales (si la 1 dio > 0)
-- ------------------------------------------------------------

select
  l.nombre                    as llamado,
  ef.fecha,
  s.nombre                    as sede,
  car.nombre                  as carrera,
  a.curso_nivel,
  c.seccion_grupo,
  a.nombre                    as mesa,
  count(*)                    as vocales,
  string_agg(concat_ws(', ', v.apellidos, v.nombres), ' / ' order by mi.id) as quienes
from mesa_integrante mi
join examen_fecha ef   on ef.id = mi.examen_fecha_id
join examen_llamado l  on l.id = ef.llamado_id
join catedras c        on c.id = ef.catedra_id
join asignaturas a     on a.id = c.asignatura_id
join carreras car      on car.id = a.carrera_id
join sedes s           on s.id = c.sede_id
join profesores v      on v.id = mi.profesor_id
where mi.rol_mesa = 'VOCAL'
group by l.nombre, ef.id, ef.fecha, s.nombre, car.nombre, a.curso_nivel, c.seccion_grupo, a.nombre
having count(*) > 2
order by ef.fecha, s.nombre, a.nombre;


-- ------------------------------------------------------------
-- 4) En las mesas con más de dos vocales, quién pudo haber entrado
--    por la asignación automática
-- ------------------------------------------------------------
-- "Asignar automáticamente" solo elige entre quienes presiden alguna
-- mesa de esa misma carrera y sede en el llamado. Un vocal con
-- pudo_ser_automatico = false fue puesto a mano, seguro. Uno con true
-- pudo entrar por cualquiera de las dos vías.

select
  ef.fecha,
  s.nombre                    as sede,
  a.nombre                    as mesa,
  concat_ws(', ', v.apellidos, v.nombres) as vocal,
  exists (
    select 1
      from examen_fecha ef3
      join catedras c3    on c3.id = ef3.catedra_id and c3.activo and not c3.exento_examen
      join asignaturas a3 on a3.id = c3.asignatura_id
     where ef3.llamado_id = ef.llamado_id
       and c3.profesor_id = mi.profesor_id
       and c3.sede_id = c.sede_id
       and a3.carrera_id = a.carrera_id
  )                           as pudo_ser_automatico
from mesa_integrante mi
join examen_fecha ef   on ef.id = mi.examen_fecha_id
join catedras c        on c.id = ef.catedra_id
join asignaturas a     on a.id = c.asignatura_id
join sedes s           on s.id = c.sede_id
join profesores v      on v.id = mi.profesor_id
where mi.rol_mesa = 'VOCAL'
  and (
    select count(*) from mesa_integrante m2
     where m2.examen_fecha_id = ef.id and m2.rol_mesa = 'VOCAL'
  ) > 2
order by ef.fecha, s.nombre, a.nombre, 5, 4;
