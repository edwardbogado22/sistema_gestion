-- ============================================================
-- Módulo de Mesas Examinadoras
-- ============================================================
-- Requiere haber ejecutado antes migracion_roles_alcance.sql.
--
-- Flujo que implementa:
--   1. El admin crea un LLAMADO con su rango de fechas y los días
--      no hábiles (feriados, domingos).
--   2. Las propuestas de los alumnos llegan a Secretaría en una
--      proforma firmada, en papel. El secretario la transcribe al
--      asignar la fecha; queda el rastro en fecha_proforma.
--   3. En Complementario y Regularización no hay proforma: la
--      administración distribuye las materias en los días
--      disponibles (examen_distribuir).
--   4. El admin aprueba el llamado, se congelan las fechas y se
--      generan las mesas.
--   5. Cargada la asistencia, se recalcula el criterio del 10% de
--      la Foja de Desempeño.
--
-- Nota sobre el vocabulario: "periodo_lectivo" en el esquema es el
-- AÑO ('2026'). Ordinario / Complementario / Regularización son el
-- TIPO de llamado, y hay varios por año. No mezclarlos.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Llamados y rango de fechas
-- ------------------------------------------------------------

create table if not exists examen_llamado (
  id              uuid primary key default gen_random_uuid(),
  periodo_lectivo varchar(10) not null,
  tipo            text not null check (tipo in ('ORDINARIO', 'COMPLEMENTARIO', 'REGULARIZACION')),
  nombre          text not null,

  -- el rango estricto: ninguna fecha puede caer fuera de acá
  fecha_inicio    date not null,
  fecha_fin       date not null,

  -- quién carga las fechas en este llamado. En Complementario y
  -- Regularización no hay proforma de alumnos y distribuye el admin.
  asigna_rol      text not null default 'SECRETARIO'
                  check (asigna_rol in ('SECRETARIO', 'ADMIN')),

  estado          text not null default 'BORRADOR'
                  check (estado in ('BORRADOR', 'ASIGNACION', 'APROBADO', 'CERRADO')),

  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  check (fecha_fin >= fecha_inicio),
  unique (periodo_lectivo, tipo, nombre)
);

-- Días dentro del rango que igual quedan bloqueados. Es lo que hace
-- usable el calendario: sin esto el secretario puede poner un examen
-- un domingo o un feriado.
create table if not exists examen_llamado_excepcion (
  id         uuid primary key default gen_random_uuid(),
  llamado_id uuid not null references examen_llamado(id) on delete cascade,
  fecha      date not null,
  motivo     text,
  unique (llamado_id, fecha)
);


-- ------------------------------------------------------------
-- 2) Fecha asignada por cátedra
-- ------------------------------------------------------------
-- La fila existe solo cuando hay fecha asignada; "sin fecha" es la
-- ausencia de fila, que el panel resuelve con un left join.
--
-- unique (llamado_id, catedra_id) es el invariante central: una
-- cátedra tiene exactamente una fecha por llamado. Sin esa constraint,
-- dos secretarios trabajando en paralelo generan duplicados silenciosos.
-- ------------------------------------------------------------

create table if not exists examen_fecha (
  id           uuid primary key default gen_random_uuid(),
  llamado_id   uuid not null references examen_llamado(id) on delete cascade,
  catedra_id   uuid not null references catedras(id) on delete cascade,

  fecha        date not null,
  hora_inicio  time,
  aula         text,

  -- rastro de la proforma en papel firmada por el delegado y el curso
  fecha_proforma      date,
  proforma_recibida_en date,
  proforma_referencia  text,

  observacion  text,
  estado       text not null default 'ASIGNADA'
               check (estado in ('ASIGNADA', 'APROBADA', 'ANULADA')),

  asignado_por uuid references auth.users(id),
  asignado_en  timestamptz not null default now(),
  aprobado_por uuid references auth.users(id),
  aprobado_en  timestamptz,

  unique (llamado_id, catedra_id)
);

create index if not exists examen_fecha_llamado_idx on examen_fecha (llamado_id, fecha);
create index if not exists examen_fecha_catedra_idx on examen_fecha (catedra_id);


-- ------------------------------------------------------------
-- 3) Integrantes de la mesa
-- ------------------------------------------------------------
-- Un profesor puede ser vocal de mesas de materias que no dicta; por
-- eso la asistencia se cuenta por profesor y no por cátedra (ver el
-- recálculo en el punto 8).
-- ------------------------------------------------------------

create table if not exists mesa_integrante (
  id              uuid primary key default gen_random_uuid(),
  examen_fecha_id uuid not null references examen_fecha(id) on delete cascade,
  profesor_id     uuid not null references profesores(id) on delete cascade,
  rol_mesa        text not null default 'TITULAR'
                  check (rol_mesa in ('PRESIDENTE', 'TITULAR', 'VOCAL')),
  asistio         boolean,                   -- null = todavía sin registrar
  registrado_en   timestamptz,
  registrado_por  uuid references auth.users(id),
  unique (examen_fecha_id, profesor_id)
);

create index if not exists mesa_integrante_profesor_idx on mesa_integrante (profesor_id);


-- Días en que un profesor no puede integrar mesa dentro de este
-- llamado. El día del examen no es fijo: se combina según la carga
-- horaria y la disponibilidad de cada profesor, así que la
-- distribución automática necesita saber qué días descartar.
create table if not exists profesor_no_disponible (
  id          uuid primary key default gen_random_uuid(),
  llamado_id  uuid not null references examen_llamado(id) on delete cascade,
  profesor_id uuid not null references profesores(id) on delete cascade,
  fecha       date not null,
  motivo      text,
  creado_en   timestamptz not null default now(),
  unique (llamado_id, profesor_id, fecha)
);

create index if not exists profesor_no_disponible_idx
  on profesor_no_disponible (llamado_id, profesor_id);


-- ------------------------------------------------------------
-- 4) Validación del rango: va en un trigger, no en el frontend
-- ------------------------------------------------------------
-- Un CHECK no puede consultar otra tabla, así que el rango se valida
-- acá. Con esto la regla se cumple aunque alguien llame la API REST
-- directamente; el calendario de la UI pasa a ser una comodidad y no
-- la defensa. Los mensajes están redactados para mostrarse tal cual
-- al usuario.
-- ------------------------------------------------------------

create or replace function examen_fecha_validar()
returns trigger
language plpgsql
as $$
declare
  v_ll examen_llamado%rowtype;
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

  -- Rastro de quién cargó la fecha, sin depender de que el cliente lo mande
  new.asignado_por := coalesce(new.asignado_por, auth.uid());

  return new;
end $$;

drop trigger if exists trg_examen_fecha_validar on examen_fecha;
create trigger trg_examen_fecha_validar
  before insert or update on examen_fecha
  for each row execute function examen_fecha_validar();


-- ------------------------------------------------------------
-- 5) Vistas
-- ------------------------------------------------------------
-- security_invoker = on en todas: sin eso corren con los permisos de
-- su dueño y le devuelven a un secretario los datos de toda la
-- facultad, salteando las policies de las tablas que consultan.
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
  ef.estado       as fecha_estado
from examen_llamado l
join catedras c    on c.periodo_lectivo = l.periodo_lectivo and c.activo
join asignaturas a on a.id = c.asignatura_id
join carreras car  on car.id = a.carrera_id
join sedes s       on s.id = c.sede_id
join profesores p  on p.id = c.profesor_id
left join examen_fecha ef on ef.llamado_id = l.id and ef.catedra_id = c.id;

alter view v_examen_agenda set (security_invoker = on);


-- Avance por llamado, carrera y sede: alimenta el encabezado del panel
create or replace view v_examen_avance as
select
  llamado_id, llamado, carrera_id, carrera, sede_id, sede,
  count(*)                                as total,
  count(fecha)                            as con_fecha,
  count(*) - count(fecha)                 as sin_fecha,
  round(100.0 * count(fecha) / nullif(count(*), 0), 1) as porcentaje
from v_examen_agenda
group by llamado_id, llamado, carrera_id, carrera, sede_id, sede;

alter view v_examen_avance set (security_invoker = on);


-- Profesor con más de una mesa el mismo día.
-- Se advierte, no se bloquea: el secretario de una carrera no puede
-- ver las cátedras de otra por RLS, así que un choque entre carreras
-- le daría un error opaco sobre datos que no puede ni inspeccionar.
create or replace view v_examen_conflictos as
select
  llamado_id, profesor_id, profesor, fecha,
  count(*)                                        as mesas,
  string_agg(materia, ' / ' order by materia)     as materias
from v_examen_agenda
where fecha is not null
group by llamado_id, profesor_id, profesor, fecha
having count(*) > 1;

alter view v_examen_conflictos set (security_invoker = on);


-- Carga por día y por curso: alimenta las marcas del calendario, para
-- que el secretario no apile tres finales del mismo curso en un día.
create or replace view v_examen_carga_dia as
select
  llamado_id, carrera_id, sede_id, curso_nivel, seccion_grupo, fecha,
  count(*)                                    as examenes,
  string_agg(materia, ', ' order by materia)  as materias
from v_examen_agenda
where fecha is not null
group by llamado_id, carrera_id, sede_id, curso_nivel, seccion_grupo, fecha;

alter view v_examen_carga_dia set (security_invoker = on);


-- ------------------------------------------------------------
-- 6) Distribución automática
-- ------------------------------------------------------------
-- Para Complementario y Regularización, donde no hay proforma y solo
-- se cuenta con el rango: reparte las materias sin fecha entre los
-- días hábiles, evitando que un mismo curso/sección tenga dos
-- exámenes el mismo día y que un profesor quede en dos mesas a la vez,
-- y equilibrando la cantidad de mesas por jornada.
--
-- Es una propuesta, no una decisión final: deja todo en estado
-- ASIGNADA y el admin puede corregir cualquier fila antes de aprobar.
--
-- El día no es fijo: se combina según la carga horaria y la
-- disponibilidad de cada profesor. Por eso el reparto es libre dentro
-- del rango y lo único que descarta días es profesor_no_disponible,
-- que es donde se cargan las restricciones reales de cada docente.
-- ------------------------------------------------------------

create or replace function examen_distribuir(p_llamado uuid, p_sobrescribir boolean default false)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_ll        examen_llamado%rowtype;
  r           record;
  v_fecha     date;
  v_asignadas int := 0;
begin
  if not app_es_admin() then
    raise exception 'Solo Dirección Académica puede distribuir fechas automáticamente.';
  end if;

  select * into v_ll from examen_llamado where id = p_llamado;
  if v_ll.id is null then
    raise exception 'El llamado no existe.';
  end if;
  if v_ll.estado <> 'ASIGNACION' then
    raise exception 'El llamado "%" no está abierto para cargar fechas (estado: %).',
      v_ll.nombre, v_ll.estado;
  end if;

  if p_sobrescribir then
    delete from examen_fecha where llamado_id = p_llamado and estado = 'ASIGNADA';
  end if;

  for r in
    select ag.catedra_id, ag.profesor_id, ag.carrera_id, ag.sede_id,
           ag.curso_nivel, ag.seccion_grupo
      from v_examen_agenda ag
     where ag.llamado_id = p_llamado and ag.fecha is null
     order by ag.carrera, ag.curso_nivel, ag.seccion_grupo, ag.materia
  loop
    -- El día hábil menos cargado que no genere choque
    select d.dia::date into v_fecha
      from generate_series(v_ll.fecha_inicio::timestamp,
                           v_ll.fecha_fin::timestamp,
                           interval '1 day') as d(dia)
     where not exists (
             select 1 from examen_llamado_excepcion e
              where e.llamado_id = p_llamado and e.fecha = d.dia::date)
       and not exists (
             select 1 from v_examen_agenda x
              where x.llamado_id = p_llamado and x.fecha = d.dia::date
                and x.carrera_id = r.carrera_id and x.sede_id = r.sede_id
                and x.curso_nivel = r.curso_nivel
                and x.seccion_grupo = r.seccion_grupo)
       and not exists (
             select 1 from v_examen_agenda x
              where x.llamado_id = p_llamado and x.fecha = d.dia::date
                and x.profesor_id = r.profesor_id)
       and not exists (
             select 1 from profesor_no_disponible nd
              where nd.llamado_id = p_llamado
                and nd.profesor_id = r.profesor_id
                and nd.fecha = d.dia::date)
     order by (select count(*) from v_examen_agenda y
                where y.llamado_id = p_llamado and y.fecha = d.dia::date),
              d.dia
     limit 1;

    if v_fecha is not null then
      insert into examen_fecha (llamado_id, catedra_id, fecha, estado, asignado_por)
      values (p_llamado, r.catedra_id, v_fecha, 'ASIGNADA', auth.uid());
      v_asignadas := v_asignadas + 1;
    end if;
  end loop;

  return v_asignadas;
end $$;


-- ------------------------------------------------------------
-- 7) Aprobación y generación de mesas
-- ------------------------------------------------------------

create or replace function examen_aprobar(p_llamado uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_ll     examen_llamado%rowtype;
  v_faltan int;
  v_mesas  int;
begin
  if not app_es_admin() then
    raise exception 'Solo Dirección Académica puede aprobar un llamado.';
  end if;

  select * into v_ll from examen_llamado where id = p_llamado;
  if v_ll.estado <> 'ASIGNACION' then
    raise exception 'El llamado "%" no está en etapa de asignación (estado: %).',
      v_ll.nombre, v_ll.estado;
  end if;

  select count(*) into v_faltan
    from v_examen_agenda where llamado_id = p_llamado and fecha is null;
  if v_faltan > 0 then
    raise exception 'Faltan % cátedras sin fecha asignada. No se puede aprobar el llamado.', v_faltan;
  end if;

  update examen_fecha
     set estado = 'APROBADA', aprobado_por = auth.uid(), aprobado_en = now()
   where llamado_id = p_llamado and estado = 'ASIGNADA';

  update examen_llamado
     set estado = 'APROBADO', actualizado_en = now()
   where id = p_llamado;

  -- El titular de cada mesa es el profesor de la cátedra. Los vocales,
  -- si los hubiera, se agregan después sobre mesa_integrante.
  insert into mesa_integrante (examen_fecha_id, profesor_id, rol_mesa)
  select ef.id, c.profesor_id, 'TITULAR'
    from examen_fecha ef
    join catedras c on c.id = ef.catedra_id
   where ef.llamado_id = p_llamado and ef.estado = 'APROBADA'
  on conflict (examen_fecha_id, profesor_id) do nothing;

  get diagnostics v_mesas = row_count;
  return v_mesas;
end $$;


-- Reabrir un llamado aprobado para corregir. Vuelve las fechas a
-- ASIGNADA; las mesas ya generadas se conservan.
create or replace function examen_reabrir(p_llamado uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not app_es_admin() then
    raise exception 'Solo Dirección Académica puede reabrir un llamado.';
  end if;

  update examen_llamado set estado = 'ASIGNACION', actualizado_en = now()
   where id = p_llamado;

  update examen_fecha set estado = 'ASIGNADA', aprobado_por = null, aprobado_en = null
   where llamado_id = p_llamado and estado = 'APROBADA';
end $$;


-- ------------------------------------------------------------
-- 8) Recálculo del criterio de asistencia a mesas
-- ------------------------------------------------------------
-- La asistencia a mesas es un hecho DEL PROFESOR: puede ser vocal en
-- mesas de materias que no dicta. Se consolida por profesor y período,
-- y ese mismo resultado se escribe en todas las cátedras de las que es
-- titular. Así v_evaluacion_docente_detalle sigue funcionando sin
-- tocarla (lee asistencia_mesas_examinadoras por catedra_id).
-- ------------------------------------------------------------

create or replace function recalcular_asistencia_mesas(p_periodo varchar)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_filas int;
begin
  if not app_es_admin() then
    raise exception 'Solo Dirección Académica puede recalcular la asistencia a mesas.';
  end if;

  with agg as (
    select mi.profesor_id,
           count(*)                                as convocadas,
           count(*) filter (where mi.asistio)      as asistidas
      from mesa_integrante mi
      join examen_fecha ef   on ef.id = mi.examen_fecha_id
      join examen_llamado l  on l.id = ef.llamado_id
     where l.periodo_lectivo = p_periodo
       and ef.estado = 'APROBADA'
     group by mi.profesor_id
  )
  insert into asistencia_mesas_examinadoras
    (catedra_id, mesas_convocadas, mesas_asistidas, porcentaje_asistencia)
  select c.id, a.convocadas, a.asistidas,
         round(100.0 * a.asistidas / nullif(a.convocadas, 0), 2)
    from agg a
    join catedras c on c.profesor_id = a.profesor_id
                   and c.periodo_lectivo = p_periodo
                   and c.activo
  on conflict (catedra_id) do update
     set mesas_convocadas     = excluded.mesas_convocadas,
         mesas_asistidas      = excluded.mesas_asistidas,
         porcentaje_asistencia = excluded.porcentaje_asistencia;

  get diagnostics v_filas = row_count;
  return v_filas;
end $$;


-- ------------------------------------------------------------
-- 9) Permisos y RLS
-- ------------------------------------------------------------

grant select, insert, update, delete on
  examen_llamado, examen_llamado_excepcion, examen_fecha, mesa_integrante,
  profesor_no_disponible
to authenticated;

grant select on
  v_examen_agenda, v_examen_avance, v_examen_conflictos, v_examen_carga_dia
to authenticated;

grant execute on function examen_distribuir(uuid, boolean)      to authenticated;
grant execute on function examen_aprobar(uuid)                  to authenticated;
grant execute on function examen_reabrir(uuid)                  to authenticated;
grant execute on function recalcular_asistencia_mesas(varchar)  to authenticated;

revoke execute on function examen_distribuir(uuid, boolean)     from anon, public;
revoke execute on function examen_aprobar(uuid)                 from anon, public;
revoke execute on function examen_reabrir(uuid)                 from anon, public;
revoke execute on function recalcular_asistencia_mesas(varchar) from anon, public;

alter table examen_llamado           enable row level security;
alter table examen_llamado_excepcion enable row level security;
alter table examen_fecha             enable row level security;
alter table mesa_integrante          enable row level security;
alter table profesor_no_disponible   enable row level security;

do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
     where schemaname = 'public'
       and tablename in ('examen_llamado', 'examen_llamado_excepcion',
                         'examen_fecha', 'mesa_integrante',
                         'profesor_no_disponible')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Los llamados los ve todo el mundo (el secretario los necesita para
-- elegir sobre cuál trabajar); los administra solo el admin.
create policy examen_llamado_lee on examen_llamado
  for select to authenticated using (true);
create policy examen_llamado_admin on examen_llamado
  for all to authenticated using (app_es_admin()) with check (app_es_admin());

create policy examen_excepcion_lee on examen_llamado_excepcion
  for select to authenticated using (true);
create policy examen_excepcion_admin on examen_llamado_excepcion
  for all to authenticated using (app_es_admin()) with check (app_es_admin());

-- Acá sí escribe el secretario, pero solo dentro de su alcance.
-- app_alcanza_catedra ya devuelve true para el admin.
create policy examen_fecha_alcance on examen_fecha
  for all to authenticated
  using (app_alcanza_catedra(catedra_id))
  with check (app_alcanza_catedra(catedra_id));

create policy mesa_integrante_lee on mesa_integrante
  for select to authenticated using (
    exists (select 1 from examen_fecha ef
             where ef.id = mesa_integrante.examen_fecha_id
               and app_alcanza_catedra(ef.catedra_id))
  );
create policy mesa_integrante_admin on mesa_integrante
  for all to authenticated using (app_es_admin()) with check (app_es_admin());

-- El secretario carga la disponibilidad de los profesores de su
-- alcance: es quien recibe el pedido del docente.
create policy profesor_no_disponible_alcance on profesor_no_disponible
  for all to authenticated
  using (
    app_es_admin() or exists (
      select 1 from catedras c
       where c.profesor_id = profesor_no_disponible.profesor_id
         and app_alcanza_catedra(c.id))
  )
  with check (
    app_es_admin() or exists (
      select 1 from catedras c
       where c.profesor_id = profesor_no_disponible.profesor_id
         and app_alcanza_catedra(c.id))
  );


notify pgrst, 'reload schema';
