-- ============================================================
-- Registro diario de asistencia a clases
-- ============================================================
-- Reemplaza, hacia adelante, el sistema aparte en Google Apps Script
-- que usaba Secretaría para marcar día a día si cada profesor dio
-- clase. Requiere haber ejecutado antes migracion_roles_alcance.sql
-- y migracion_dias_no_habiles.sql.
--
-- Flujo que implementa:
--   1. El admin define un PERÍODO ACADÉMICO con fechas de inicio/fin
--      (a diferencia de catedras.periodo_lectivo, que es solo una
--      etiqueta de texto sin fechas) y lo marca activo.
--   2. Cada cátedra tiene un HORARIO SEMANAL (catedra_horario): en
--      qué día(s) de la semana se dicta.
--   3. Secretaría, dentro de su alcance de carrera/sede, registra día
--      a día si el profesor dio clase, con suplente si faltó. La
--      marca es por PROFESOR, no por materia: si un docente da dos
--      materias el mismo día comparten un solo estado (mismo criterio
--      que ya usa mesa_integrante/recalcular_asistencia_mesas en
--      migracion_mesas_examinadoras.sql).
--   4. Un trigger recalcula asistencia_clases automáticamente por
--      cada cátedra activa del profesor, sin carga manual — mismo
--      patrón que recalcular_asistencia_mesas(), pero disparado por
--      cada cambio en vez de un recálculo manual por período.
--
-- dia_no_habil (definida en migracion_dias_no_habiles.sql) gana
-- alcance opcional por sede acá: "sede en blanco" sigue siendo un
-- feriado general, y el flujo de exámenes (que no pasa sede) queda
-- exactamente igual que antes.
--
-- Nota: la carga manual/CSV vieja de asistencia_clases (Cargar
-- Indicadores, Importar Datos) NO se toca. Sigue escribiendo a la
-- misma tabla; conviven mientras no se usen para el mismo período.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================


-- ------------------------------------------------------------
-- 1) dia_no_habil: alcance opcional por sede
-- ------------------------------------------------------------

alter table dia_no_habil add column if not exists sede_id uuid references sedes(id);

drop index if exists dia_no_habil_fecha_idx;
drop index if exists dia_no_habil_recurrente_idx;

-- Antes: una fila por fecha (o por mes+día). Ahora: una fila "todas
-- las sedes" por fecha, más como mucho una fila por fecha+sede.
create unique index if not exists dia_no_habil_fecha_global_idx
  on dia_no_habil (fecha) where fecha is not null and sede_id is null;
create unique index if not exists dia_no_habil_fecha_sede_idx
  on dia_no_habil (fecha, sede_id) where fecha is not null and sede_id is not null;
create unique index if not exists dia_no_habil_recurrente_global_idx
  on dia_no_habil (mes, dia) where mes is not null and sede_id is null;
create unique index if not exists dia_no_habil_recurrente_sede_idx
  on dia_no_habil (mes, dia, sede_id) where mes is not null and sede_id is not null;

-- dia_bloqueado gana p_sede (default null = comportamiento idéntico
-- al de antes: ninguna fila con sede propia bloquea). El flujo de
-- exámenes sigue llamando con 2 argumentos, así que no cambia en
-- nada; solo el registro de asistencia a clases pasa la sede.
--
-- v_examen_fechas_invalidas (vista) y dias_bloqueados_llamado
-- (función "language sql", a diferencia de las plpgsql de este
-- archivo, se parsea al crearse y por eso SÍ queda con una
-- dependencia dura) apuntan a la firma vieja de 2 argumentos. Hay
-- que tirarlas abajo antes de reemplazar la función y volver a
-- crearlas después — con la firma nueva por default, sin cambiar
-- nada de su comportamiento.
drop view if exists v_examen_fechas_invalidas;
drop function if exists dias_bloqueados_llamado(uuid);
drop function if exists dia_bloqueado(date, uuid);

create or replace function dia_bloqueado(p_fecha date, p_llamado uuid default null, p_sede uuid default null)
returns text
language sql stable security definer set search_path = public
as $$
  select motivo from (
    select motivo, 1 as prioridad
      from dia_no_habil
     where activo
       and (sede_id is null or sede_id = p_sede)
       and (fecha = p_fecha
            or (mes = extract(month from p_fecha)::smallint
                and dia = extract(day from p_fecha)::smallint))

    union all

    select 'Domingo', 2
      from examen_llamado l
     where l.id = p_llamado
       and l.excluye_domingos
       and extract(dow from p_fecha) = 0

    union all

    select coalesce(motivo, 'Día no hábil de este llamado'), 3
      from examen_llamado_excepcion
     where llamado_id = p_llamado and fecha = p_fecha
  ) x
  order by prioridad
  limit 1
$$;

grant execute on function dia_bloqueado(date, uuid, uuid) to authenticated;
revoke execute on function dia_bloqueado(date, uuid, uuid) from anon, public;

-- Se recrean tal cual estaban (mismas definiciones de
-- migracion_dias_no_habiles.sql); las llamadas de 2 argumentos ahora
-- resuelven contra la función nueva.
create or replace function dias_bloqueados_llamado(p_llamado uuid)
returns table (fecha date, motivo text)
language sql stable security definer set search_path = public
as $$
  select d.dia::date, dia_bloqueado(d.dia::date, p_llamado)
    from examen_llamado l
    cross join lateral generate_series(
      l.fecha_inicio::timestamp, l.fecha_fin::timestamp, interval '1 day'
    ) as d(dia)
   where l.id = p_llamado
     and dia_bloqueado(d.dia::date, p_llamado) is not null
$$;

grant execute on function dias_bloqueados_llamado(uuid) to authenticated;
revoke execute on function dias_bloqueados_llamado(uuid) from anon, public;

create or replace view v_examen_fechas_invalidas as
select
  ef.id as examen_fecha_id,
  ag.llamado_id, ag.llamado, ag.carrera, ag.sede,
  ag.curso_nivel, ag.seccion_grupo, ag.materia, ag.profesor,
  ef.fecha,
  dia_bloqueado(ef.fecha, ef.llamado_id) as motivo
from examen_fecha ef
join v_examen_agenda ag on ag.catedra_id = ef.catedra_id and ag.llamado_id = ef.llamado_id
where dia_bloqueado(ef.fecha, ef.llamado_id) is not null;

alter view v_examen_fechas_invalidas set (security_invoker = on);
grant select on v_examen_fechas_invalidas to authenticated;


-- ------------------------------------------------------------
-- 2) Período académico (fechas reales, a diferencia de la
--    etiqueta de texto catedras.periodo_lectivo)
-- ------------------------------------------------------------
-- Solo puede haber un período activo a la vez: acota qué fechas se
-- pueden registrar. etiqueta_periodo_lectivo debe calzar con el
-- valor de catedras.periodo_lectivo de las cátedras de ese período
-- (lo carga el admin al crearlo). Para activar uno nuevo, primero
-- hay que desactivar el vigente (dos updates separados) — el índice
-- único parcial no permite dos filas activas a la vez.
-- ------------------------------------------------------------

create table if not exists periodo_academico (
  id                       uuid primary key default gen_random_uuid(),
  nombre                   text not null,
  anio                     int not null,
  etiqueta_periodo_lectivo varchar(10) not null,
  fecha_inicio             date not null,
  fecha_fin                date not null,
  activo                   boolean not null default false,
  creado_en                timestamptz not null default now(),

  check (fecha_fin >= fecha_inicio)
);

create unique index if not exists periodo_academico_activo_idx
  on periodo_academico (activo) where activo;

grant select, insert, update, delete on periodo_academico to authenticated;
alter table periodo_academico enable row level security;

drop policy if exists periodo_academico_lee   on periodo_academico;
drop policy if exists periodo_academico_admin on periodo_academico;

create policy periodo_academico_lee on periodo_academico
  for select to authenticated using (true);
create policy periodo_academico_admin on periodo_academico
  for all to authenticated using (app_es_admin()) with check (app_es_admin());


-- ------------------------------------------------------------
-- 3) Horario semanal de la cátedra
-- ------------------------------------------------------------
-- No existía ningún concepto de "qué día de la semana se dicta esta
-- cátedra". dia_semana sigue la convención de Postgres
-- (extract(dow from fecha)); acotado a 1-5 (lunes a viernes) porque
-- en la facultad no se dictan clases sábado ni domingo.
-- ------------------------------------------------------------

create table if not exists catedra_horario (
  id         uuid primary key default gen_random_uuid(),
  catedra_id uuid not null references catedras(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 1 and 5),
  unique (catedra_id, dia_semana)
);

-- Por si esta migración ya se había corrido con el rango viejo
-- (0-6): se achica a 1-5 sin tocar el resto de la tabla.
alter table catedra_horario drop constraint if exists catedra_horario_dia_semana_check;
alter table catedra_horario add constraint catedra_horario_dia_semana_check check (dia_semana between 1 and 5);

create index if not exists catedra_horario_catedra_idx on catedra_horario (catedra_id);

grant select, insert, update, delete on catedra_horario to authenticated;
alter table catedra_horario enable row level security;

drop policy if exists catedra_horario_alcance on catedra_horario;

-- Mismo criterio que examen_fecha: el secretario administra el
-- horario de las cátedras de su alcance; el admin, todas.
create policy catedra_horario_alcance on catedra_horario
  for all to authenticated
  using (app_alcanza_catedra(catedra_id))
  with check (app_alcanza_catedra(catedra_id));

-- Vista de lectura para la pantalla de registro: mismo criterio que
-- v_examen_agenda (pre-armar los joins en SQL en vez de anidar
-- filtros en el cliente). security_invoker hace que respete la RLS
-- de catedra_horario/catedras de abajo.
create or replace view v_catedra_horario as
select
  ch.catedra_id, ch.dia_semana,
  c.profesor_id, c.sede_id, c.periodo_lectivo, c.seccion_grupo,
  p.documento_identidad, (p.apellidos || ', ' || p.nombres) as profesor,
  a.id as asignatura_id, a.nombre as materia, a.carrera_id,
  car.nombre as carrera, s.nombre as sede
from catedra_horario ch
join catedras c    on c.id = ch.catedra_id and c.activo
join profesores p  on p.id = c.profesor_id
join asignaturas a on a.id = c.asignatura_id
join carreras car  on car.id = a.carrera_id
join sedes s       on s.id = c.sede_id;

alter view v_catedra_horario set (security_invoker = on);
grant select on v_catedra_horario to authenticated;


-- ------------------------------------------------------------
-- 4) Registro diario de asistencia
-- ------------------------------------------------------------
-- La marca es por profesor+carrera+sede+fecha, no por cátedra (ver
-- nota al inicio del archivo).
-- ------------------------------------------------------------

create table if not exists asistencia_clase_registro (
  id                   uuid primary key default gen_random_uuid(),
  fecha                date not null,
  profesor_id          uuid not null references profesores(id) on delete cascade,
  carrera_id           uuid not null references carreras(id) on delete cascade,
  sede_id              uuid not null references sedes(id) on delete cascade,
  estado               text not null check (estado in ('PRESENTE', 'AUSENTE', 'AUSENTE_JUSTIFICADO')),
  profesor_suplente_id uuid references profesores(id),
  registrado_por       uuid references auth.users(id),
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),

  unique (fecha, profesor_id, carrera_id, sede_id)
);

create index if not exists asistencia_clase_registro_profesor_idx
  on asistencia_clase_registro (profesor_id, carrera_id, sede_id);
create index if not exists asistencia_clase_registro_fecha_idx
  on asistencia_clase_registro (fecha);

grant select, insert, update, delete on asistencia_clase_registro to authenticated;
alter table asistencia_clase_registro enable row level security;

drop policy if exists asistencia_clase_registro_alcance on asistencia_clase_registro;

create policy asistencia_clase_registro_alcance on asistencia_clase_registro
  for all to authenticated
  using (app_alcanza_carrera(carrera_id, sede_id))
  with check (app_alcanza_carrera(carrera_id, sede_id));


-- ------------------------------------------------------------
-- 5) Recálculo automático de asistencia_clases
-- ------------------------------------------------------------
-- Mismo criterio que recalcular_asistencia_mesas(): se agrupa por
-- profesor y se expande a todas sus cátedras activas del período (un
-- profesor puede dar más de una materia en la misma carrera/sede).
-- A diferencia de aquella, acá no es un RPC manual gateado a ADMIN:
-- corre disparada por trigger en cada alta/baja/cambio del registro
-- diario, así que no lleva el chequeo interno de app_es_admin() (lo
-- invoca el trigger, no el usuario). Por eso se revoca el EXECUTE
-- directo: solo es alcanzable a través del trigger, nunca por RPC.
-- ------------------------------------------------------------

create or replace function recalcular_asistencia_clases(
  p_profesor uuid, p_carrera uuid, p_sede uuid, p_fecha date
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_periodo      periodo_academico%rowtype;
  r              record;
  v_esperadas    int;
  v_presentes    int;
  v_justificados int;
begin
  select * into v_periodo
    from periodo_academico
   where p_fecha between fecha_inicio and fecha_fin
   limit 1;

  -- Fecha fuera de cualquier período académico con fechas cargadas:
  -- no hay nada que recalcular (p.ej. datos de prueba o históricos
  -- previos a este módulo).
  if v_periodo.id is null then
    return;
  end if;

  for r in
    select c.id as catedra_id
      from catedras c
      join asignaturas a on a.id = c.asignatura_id
     where c.profesor_id = p_profesor
       and c.sede_id = p_sede
       and a.carrera_id = p_carrera
       and c.periodo_lectivo = v_periodo.etiqueta_periodo_lectivo
       and c.activo
  loop
    select count(*) into v_esperadas
      from generate_series(v_periodo.fecha_inicio::timestamp, v_periodo.fecha_fin::timestamp, interval '1 day') as d(dia)
     where exists (
             select 1 from catedra_horario ch
              where ch.catedra_id = r.catedra_id
                and ch.dia_semana = extract(dow from d.dia)::smallint)
       and dia_bloqueado(d.dia::date, null, p_sede) is null;

    select
        count(*) filter (where acr.estado = 'PRESENTE'),
        count(*) filter (where acr.estado = 'AUSENTE_JUSTIFICADO')
      into v_presentes, v_justificados
      from generate_series(v_periodo.fecha_inicio::timestamp, v_periodo.fecha_fin::timestamp, interval '1 day') as d(dia)
      join asistencia_clase_registro acr
        on acr.fecha = d.dia::date
       and acr.profesor_id = p_profesor
       and acr.carrera_id  = p_carrera
       and acr.sede_id     = p_sede
     where exists (
             select 1 from catedra_horario ch
              where ch.catedra_id = r.catedra_id
                and ch.dia_semana = extract(dow from d.dia)::smallint)
       and dia_bloqueado(d.dia::date, null, p_sede) is null;

    insert into asistencia_clases (catedra_id, horas_programadas, horas_dictadas, porcentaje_asistencia)
    values (
      r.catedra_id,
      v_esperadas,
      v_presentes,
      round(100.0 * v_presentes / nullif(v_esperadas - v_justificados, 0), 2)
    )
    on conflict (catedra_id) do update
       set horas_programadas     = excluded.horas_programadas,
           horas_dictadas        = excluded.horas_dictadas,
           porcentaje_asistencia = excluded.porcentaje_asistencia;
  end loop;
end $$;

revoke execute on function recalcular_asistencia_clases(uuid, uuid, uuid, date) from anon, public;

create or replace function trg_asistencia_clase_registro_recalcular()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform recalcular_asistencia_clases(old.profesor_id, old.carrera_id, old.sede_id, old.fecha);
    return old;
  end if;

  perform recalcular_asistencia_clases(new.profesor_id, new.carrera_id, new.sede_id, new.fecha);

  -- Si un update cambia la clave (raro, pero posible), recalcular
  -- también el lado viejo para no dejar un sobrante.
  if tg_op = 'UPDATE' and (old.profesor_id, old.carrera_id, old.sede_id, old.fecha)
                       is distinct from (new.profesor_id, new.carrera_id, new.sede_id, new.fecha) then
    perform recalcular_asistencia_clases(old.profesor_id, old.carrera_id, old.sede_id, old.fecha);
  end if;

  return new;
end $$;

drop trigger if exists trg_asistencia_clase_registro_recalc on asistencia_clase_registro;
create trigger trg_asistencia_clase_registro_recalc
  after insert or update or delete on asistencia_clase_registro
  for each row execute function trg_asistencia_clase_registro_recalcular();


-- ------------------------------------------------------------
-- 6) Reporte de efectividad y reemplazos
-- ------------------------------------------------------------
-- security invoker (no definer): corre con el alcance del usuario
-- que llama, así que un secretario solo ve su carrera/sede vía la
-- RLS de asistencia_clase_registro, sin necesidad de filtrar acá.
-- ------------------------------------------------------------

create or replace function reporte_asistencia_clases(
  p_desde date, p_hasta date,
  p_carrera uuid default null, p_sede uuid default null, p_profesor uuid default null
)
returns table (
  profesor_id  uuid,
  profesor     text,
  carrera_id   uuid,
  carrera      text,
  sede_id      uuid,
  sede         text,
  esperadas    bigint,
  presentes    bigint,
  ausentes     bigint,
  justificados bigint,
  porcentaje   numeric
)
language sql stable security invoker set search_path = public
as $$
  with combos as (
    select distinct c.profesor_id, a.carrera_id, c.sede_id
      from catedras c
      join asignaturas a on a.id = c.asignatura_id
     where c.activo
       and (p_carrera  is null or a.carrera_id  = p_carrera)
       and (p_sede     is null or c.sede_id     = p_sede)
       and (p_profesor is null or c.profesor_id = p_profesor)
  ),
  fechas_esperadas as (
    select combo.profesor_id, combo.carrera_id, combo.sede_id, d.dia::date as fecha
      from combos combo
      join catedras c    on c.profesor_id = combo.profesor_id and c.sede_id = combo.sede_id and c.activo
      join asignaturas a on a.id = c.asignatura_id and a.carrera_id = combo.carrera_id
      join catedra_horario ch on ch.catedra_id = c.id
      cross join lateral generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') as d(dia)
     where extract(dow from d.dia)::smallint = ch.dia_semana
       and dia_bloqueado(d.dia::date, null, combo.sede_id) is null
     group by combo.profesor_id, combo.carrera_id, combo.sede_id, d.dia
  )
  select
    fe.profesor_id, (p.apellidos || ', ' || p.nombres),
    fe.carrera_id, car.nombre,
    fe.sede_id, s.nombre,
    count(*),
    count(*) filter (where acr.estado = 'PRESENTE'),
    count(*) filter (where acr.estado = 'AUSENTE'),
    count(*) filter (where acr.estado = 'AUSENTE_JUSTIFICADO'),
    round(100.0 * count(*) filter (where acr.estado = 'PRESENTE')
          / nullif(count(*) - count(*) filter (where acr.estado = 'AUSENTE_JUSTIFICADO'), 0), 2)
    from fechas_esperadas fe
    join profesores p  on p.id = fe.profesor_id
    join carreras car  on car.id = fe.carrera_id
    join sedes s       on s.id = fe.sede_id
    left join asistencia_clase_registro acr
      on acr.fecha = fe.fecha and acr.profesor_id = fe.profesor_id
     and acr.carrera_id = fe.carrera_id and acr.sede_id = fe.sede_id
   group by fe.profesor_id, p.apellidos, p.nombres, fe.carrera_id, car.nombre, fe.sede_id, s.nombre
  having count(*) > 0
   order by car.nombre, s.nombre, p.apellidos
$$;

grant execute on function reporte_asistencia_clases(date, date, uuid, uuid, uuid) to authenticated;
revoke execute on function reporte_asistencia_clases(date, date, uuid, uuid, uuid) from anon, public;

-- Reemplazos: clases donde el titular faltó y otro profesor cubrió.
create or replace view v_asistencia_reemplazos as
select
  acr.id,
  acr.fecha, acr.estado,
  acr.profesor_id as titular_id, (pt.apellidos || ', ' || pt.nombres) as titular,
  acr.profesor_suplente_id as suplente_id, (ps.apellidos || ', ' || ps.nombres) as suplente,
  acr.carrera_id, car.nombre as carrera,
  acr.sede_id, s.nombre as sede
from asistencia_clase_registro acr
join profesores pt on pt.id = acr.profesor_id
left join profesores ps on ps.id = acr.profesor_suplente_id
join carreras car on car.id = acr.carrera_id
join sedes s on s.id = acr.sede_id
where acr.profesor_suplente_id is not null;

alter view v_asistencia_reemplazos set (security_invoker = on);
grant select on v_asistencia_reemplazos to authenticated;


notify pgrst, 'reload schema';
