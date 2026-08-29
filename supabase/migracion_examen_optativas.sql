-- ============================================================
-- Bloqueo de choque de profesor por materia no optativa
-- ============================================================
-- Requiere haber ejecutado antes migracion_mesas_examinadoras.sql.
--
-- Hasta acá, v_examen_conflictos solo advertía cuando un profesor
-- quedaba con dos mesas el mismo día: nunca bloqueaba, porque un
-- secretario de una carrera no puede ver las cátedras de otra (RLS)
-- y un choque entre carreras le daría un error opaco sobre datos que
-- no puede ni inspeccionar.
--
-- Regla nueva: el choque se sigue aceptando si la materia que se está
-- cargando es optativa (la definición operativa de "optativa" acá es
-- "puedo pedirle al secretario que la reprograme sin romper nada");
-- si NO es optativa, se bloquea al guardar y el mensaje le dice al
-- secretario con qué materia chocó, para que corrija la propuesta.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Marca de asignatura optativa
-- ------------------------------------------------------------

alter table asignaturas add column if not exists optativa boolean not null default false;


-- ------------------------------------------------------------
-- 2) v_examen_agenda expone el flag para que el panel lo muestre
--    antes de que el secretario intente guardar.
-- ------------------------------------------------------------

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

  -- al final: CREATE OR REPLACE VIEW no permite insertar columnas en
  -- el medio, solo agregar al final (o rompe cualquier vista/cliente
  -- que ya dependa de esta por posición).
  a.optativa
from examen_llamado l
join catedras c    on c.periodo_lectivo = l.periodo_lectivo and c.activo
join asignaturas a on a.id = c.asignatura_id
join carreras car  on car.id = a.carrera_id
join sedes s       on s.id = c.sede_id
join profesores p  on p.id = c.profesor_id
left join examen_fecha ef on ef.llamado_id = l.id and ef.catedra_id = c.id;

alter view v_examen_agenda set (security_invoker = on);


-- ------------------------------------------------------------
-- 3) Trigger: bloquea el choque cuando la materia no es optativa
-- ------------------------------------------------------------
-- Se reemplaza la función completa (no solo se agrega el bloque
-- nuevo) para que quede como una sola definición y no dos migraciones
-- parcheándose entre sí.
-- ------------------------------------------------------------

create or replace function examen_fecha_validar()
returns trigger
language plpgsql
as $$
declare
  v_ll        examen_llamado%rowtype;
  v_optativa  boolean;
  v_materia   text;
  v_choque    record;
begin
  select * into v_ll from examen_llamado where id = new.llamado_id;

  if v_ll.estado <> 'ASIGNACION' then
    raise exception 'El llamado "%" no está abierto para cargar fechas (estado: %).',
      v_ll.nombre, v_ll.estado;
  end if;

  if new.fecha < v_ll.fecha_inicio or new.fecha > v_ll.fecha_fin then
    raise exception 'La fecha % está fuera del rango permitido para "%" (% a %).',
      to_char(new.fecha, 'DD/MM/YYYY'), v_ll.nombre,
      to_char(v_ll.fecha_inicio, 'DD/MM/YYYY'), to_char(v_ll.fecha_fin, 'DD/MM/YYYY');
  end if;

  if exists (select 1 from examen_llamado_excepcion
              where llamado_id = new.llamado_id and fecha = new.fecha) then
    raise exception 'El % es un día no hábil para exámenes en este llamado.',
      to_char(new.fecha, 'DD/MM/YYYY');
  end if;

  -- Solo el admin carga fechas en los llamados marcados como suyos
  if v_ll.asigna_rol = 'ADMIN' and not app_es_admin() then
    raise exception 'Las fechas de "%" las asigna Dirección Académica.', v_ll.nombre;
  end if;

  -- Choque de profesor: se acepta si la materia que se está cargando
  -- es optativa; si no lo es, se bloquea y se avisa con qué materia
  -- chocó para que el secretario corrija la propuesta.
  select a.optativa, a.nombre into v_optativa, v_materia
    from catedras c
    join asignaturas a on a.id = c.asignatura_id
   where c.id = new.catedra_id;

  if not coalesce(v_optativa, false) then
    select ef2.fecha, a2.nombre as materia_choque
      into v_choque
      from examen_fecha ef2
      join catedras c2  on c2.id = ef2.catedra_id
      join asignaturas a2 on a2.id = c2.asignatura_id
      join catedras c1  on c1.id = new.catedra_id
     where ef2.llamado_id = new.llamado_id
       and ef2.fecha = new.fecha
       and ef2.catedra_id <> new.catedra_id
       and ef2.estado <> 'ANULADA'
       and c2.profesor_id = c1.profesor_id
     limit 1;

    if found then
      raise exception
        'El profesor ya tiene asignada la mesa de "%" el %. Como "%" no es una materia optativa, no se puede duplicar: modificá la propuesta.',
        v_choque.materia_choque, to_char(new.fecha, 'DD/MM/YYYY'), v_materia;
    end if;
  end if;

  -- Rastro de quién cargó la fecha, sin depender de que el cliente lo mande
  new.asignado_por := coalesce(new.asignado_por, auth.uid());

  return new;
end $$;

drop trigger if exists trg_examen_fecha_validar on examen_fecha;
create trigger trg_examen_fecha_validar
  before insert or update on examen_fecha
  for each row execute function examen_fecha_validar();


notify pgrst, 'reload schema';
