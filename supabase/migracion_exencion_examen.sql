-- ============================================================
-- Exención de cátedras del período normal de exámenes
-- ============================================================
-- Hay cátedras que nunca van a tener una fecha en el período normal
-- de exámenes finales: el Trabajo Final de Grado se resuelve con la
-- conformación de un tribunal aparte, y algunas materias optativas
-- quedan sin alumnos ni recursantes en un período puntual. Hasta
-- ahora esas cátedras se quedaban para siempre en "sin fecha" en
-- v_examen_agenda, inflando el conteo de pendientes en el panel y en
-- el seguimiento de carga — y peor, examen_aprobar() cuenta las filas
-- de v_examen_agenda sin fecha y aborta la aprobación del llamado si
-- hay alguna, así que un llamado con una cátedra de Trabajo Final de
-- Grado nunca se podía aprobar.
--
-- Se agrega una marca por cátedra (no por asignatura: una materia
-- optativa puede tener alumnos un período y ninguno el siguiente) y
-- se excluye de v_examen_agenda, que es la vista de la que dependen
-- el panel, los reportes, el seguimiento de carga y examen_aprobar().
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Marca en catedras
-- ------------------------------------------------------------

alter table catedras add column if not exists exento_examen boolean not null default false;
alter table catedras add column if not exists exento_motivo text;


-- ------------------------------------------------------------
-- 2) v_examen_agenda excluye las cátedras exentas
-- ------------------------------------------------------------
-- Mismo cuerpo que la versión de migracion_choque_cruzado_y_panel_admin.sql,
-- solo se agrega el where del final.

create or replace view v_examen_agenda as
select
  l.id            as llamado_id,
  l.nombre        as llamado,
  l.tipo          as llamado_tipo,
  l.estado        as llamado_estado,
  l.fecha_inicio,
  l.fecha_fin,
  l.asigna_rol,

  c.id            as catedra_id,
  c.periodo_lectivo,
  c.seccion_grupo,

  s.id            as sede_id,
  s.nombre        as sede,
  car.id          as carrera_id,
  car.nombre      as carrera,

  a.id            as asignatura_id,
  a.codigo        as codigo_materia,
  a.nombre        as materia,
  a.curso_nivel,

  p.id            as profesor_id,
  p.documento_identidad,
  (p.apellidos || ', ' || p.nombres) as profesor,

  ef.id           as examen_fecha_id,
  ef.fecha,
  ef.hora_inicio,
  ef.aula,
  ef.fecha_proforma,
  ef.proforma_referencia,
  ef.observacion,
  ef.estado       as fecha_estado,

  a.optativa,
  ef.asignado_por,
  ef.asignado_en
from examen_llamado l
join catedras c    on c.periodo_lectivo = l.periodo_lectivo and c.activo
join asignaturas a on a.id = c.asignatura_id
join carreras car  on car.id = a.carrera_id
join sedes s       on s.id = c.sede_id
join profesores p  on p.id = c.profesor_id
left join examen_fecha ef on ef.llamado_id = l.id and ef.catedra_id = c.id
where not c.exento_examen;

alter view v_examen_agenda set (security_invoker = on);

select registrar_migracion('migracion_exencion_examen.sql');
