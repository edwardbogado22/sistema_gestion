-- ============================================================
-- Choque de profesor entre carreras + seguimiento de carga
-- ============================================================
-- Requiere haber ejecutado antes migracion_mesas_examinadoras.sql y
-- migracion_examen_optativas.sql.
--
-- Dos cosas en este archivo:
--
--   1) Bug de alcance en el bloqueo de choque de profesor. La función
--      examen_fecha_validar() corría como el rol del secretario que
--      guarda, así que la subconsulta de choque quedaba filtrada por
--      la policy de examen_fecha (app_alcanza_catedra): un secretario
--      de la Carrera A no ve las filas de la Carrera B. Si el mismo
--      profesor dicta en dos carreras y cada secretario le carga
--      fecha por su lado, ninguno de los dos veía el choque. Se
--      soluciona corriendo la función como security definer, igual
--      que examen_aprobar/examen_distribuir: la subconsulta pasa a
--      ver todas las filas sin importar quién guarda, pero el INSERT/
--      UPDATE real lo sigue filtrando el with check de la policy, así
--      que un secretario sigue sin poder escribir fuera de su alcance.
--
--   2) Seguimiento de carga para Dirección Académica: quién cargó
--      cada fecha y cuándo, para poder revisar/probar el avance de
--      cada secretario sin tener que pedirle capturas.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================


-- ------------------------------------------------------------
-- 1) examen_fecha_validar(): mismo cuerpo, ahora security definer
-- ------------------------------------------------------------

create or replace function examen_fecha_validar()
returns trigger
language plpgsql security definer set search_path = public
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

  -- Choque de profesor: corre como security definer para que la
  -- detección no dependa del alcance RLS de quien está guardando (ver
  -- encabezado del archivo). Se acepta si la materia que se está
  -- cargando es optativa; si no lo es, se bloquea y se avisa con qué
  -- materia chocó para que el secretario corrija.
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


-- ------------------------------------------------------------
-- 2) v_examen_agenda: se agregan asignado_por y asignado_en al final
-- ------------------------------------------------------------
-- Al final porque CREATE OR REPLACE VIEW no permite insertar columnas
-- en el medio sin romper por posición a quien ya haga select('*').
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

  a.optativa,
  ef.asignado_por,
  ef.asignado_en
from examen_llamado l
join catedras c    on c.periodo_lectivo = l.periodo_lectivo and c.activo
join asignaturas a on a.id = c.asignatura_id
join carreras car  on car.id = a.carrera_id
join sedes s       on s.id = c.sede_id
join profesores p  on p.id = c.profesor_id
left join examen_fecha ef on ef.llamado_id = l.id and ef.catedra_id = c.id;

alter view v_examen_agenda set (security_invoker = on);


-- ------------------------------------------------------------
-- 3) v_examen_carga_secretario: progreso por llamado/carrera/sede,
--    con quién cargó y cuándo fue la última carga.
-- ------------------------------------------------------------
-- No se extiende v_examen_avance: esa vista tiene hoy una fila por
-- llamado/carrera/sede y Llamados.jsx suma sus totales con un reduce;
-- agregar asignado_por a su group by multiplicaría filas por
-- carrera/sede y rompería esa suma en silencio. Se separa en una
-- vista nueva en su lugar.
--
-- Seguridad: hereda RLS sin chequeo explícito de rol. v_examen_agenda
-- ya filtra por app_alcanza_catedra (un secretario solo ve su propio
-- alcance); el left join a usuarios_perfil solo resuelve el nombre de
-- otro usuario si quien consulta es admin (policy de usuarios_perfil:
-- cada uno lee su propio perfil, o todo si es admin), así que un
-- secretario que consulte esta vista por su cuenta no puede enumerar
-- nombres de otros secretarios.
-- ------------------------------------------------------------

create or replace view v_examen_carga_secretario as
select
  ag.llamado_id, ag.llamado, ag.llamado_estado,
  ag.carrera_id, ag.carrera,
  ag.sede_id, ag.sede,
  ag.asignado_por,
  coalesce(up.nombre_completo, 'Sin perfil registrado') as cargado_por,
  count(*)             as fechas_cargadas,
  max(ag.asignado_en)  as ultima_carga
from v_examen_agenda ag
left join usuarios_perfil up on up.user_id = ag.asignado_por
where ag.examen_fecha_id is not null
  and ag.fecha_estado <> 'ANULADA'
group by ag.llamado_id, ag.llamado, ag.llamado_estado,
         ag.carrera_id, ag.carrera, ag.sede_id, ag.sede,
         ag.asignado_por, up.nombre_completo;

alter view v_examen_carga_secretario set (security_invoker = on);

grant select on v_examen_carga_secretario to authenticated;


notify pgrst, 'reload schema';
