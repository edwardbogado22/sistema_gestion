-- ============================================================
-- Desarrollo de contenido programático: considerar o no por cátedra
-- ============================================================
-- En 2025 la plataforma de contenido programático falló un tiempo y
-- varios profesores dejaron de cargar lo que dictaban; presentaron su
-- justificación y fue aceptada. Para esas cátedras, "Desarrollo
-- pedagógico de las clases" (30%) deja de promediar asistencia y
-- contenido y se calcula solo con la asistencia a clases — mismo
-- criterio que las ausencias justificadas: no cuentan ni a favor ni en
-- contra.
--
-- Una fila en contenido_no_considerado = la cátedra NO considera el
-- desarrollo de contenido. Los registros originales de contenido no se
-- tocan: sacar la fila vuelve al cálculo normal.
--
-- La vista parte de migracion_capacitaciones_maximo.sql; el único
-- cambio es la rama OBJETIVO_CLASES_CONTENIDO y el join nuevo.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabla: cátedras que no consideran el desarrollo de contenido
-- ------------------------------------------------------------

create table if not exists contenido_no_considerado (
  catedra_id      uuid primary key references catedras(id) on delete cascade,
  motivo          text not null check (length(trim(motivo)) > 0),
  registrado_por  uuid references auth.users(id) default auth.uid(),
  registrado_en   timestamptz not null default now()
);

grant select, insert, update, delete on contenido_no_considerado to authenticated;
alter table contenido_no_considerado enable row level security;

drop policy if exists contenido_no_considerado_lee      on contenido_no_considerado;
drop policy if exists contenido_no_considerado_lee_todo on contenido_no_considerado;
drop policy if exists contenido_no_considerado_escribe  on contenido_no_considerado;

-- Lectura: quien ve la cátedra, y toda la facultad para quien lee todo
-- (Secretaría de Dirección Académica, Decanato)
create policy contenido_no_considerado_lee on contenido_no_considerado
  for select to authenticated using (app_alcanza_catedra(catedra_id));

create policy contenido_no_considerado_lee_todo on contenido_no_considerado
  for select to authenticated using (app_lee_todo());

-- Escritura: solo ADMIN (Dirección Académica acepta las justificaciones)
create policy contenido_no_considerado_escribe on contenido_no_considerado
  for all to authenticated
  using (app_rol() = 'ADMIN')
  with check (app_rol() = 'ADMIN');


-- ------------------------------------------------------------
-- 2) Vista de la foja
-- ------------------------------------------------------------

create or replace view v_evaluacion_docente_detalle as
select
  c.id as catedra_id,
  c.periodo_lectivo,
  c.seccion_grupo,
  s.nombre as sede,
  car.nombre as carrera,
  asig.nombre as asignatura,
  asig.curso_nivel,
  p.id as profesor_id,
  p.documento_identidad,
  concat_ws(' ', p.nombres, p.apellidos) as profesor_completo,
  cr.id as criterio_id,
  cr.grupo,
  cr.orden,
  cr.nombre as criterio_nombre,
  cr.descripcion as criterio_descripcion,
  cr.peso_porcentaje as ponderacion,
  cr.origen,
  case cr.origen
    when 'OBJETIVO_CLASES_CONTENIDO' then
      case
        -- justificación aceptada: solo asistencia a clases
        when cnc.catedra_id is not null then
          round(coalesce(ac.porcentaje_asistencia, 0) * cr.peso_porcentaje / 100, 2)
        else
          round(((coalesce(ac.porcentaje_asistencia, 0) + coalesce(cc.porcentaje_cumplimiento, 0)) / 2)
                * cr.peso_porcentaje / 100, 2)
      end
    when 'OBJETIVO_MESAS_EXAMINADORAS' then
      round(coalesce(ame.porcentaje_asistencia, 0) * cr.peso_porcentaje / 100, 2)
    when 'OBJETIVO_REUNIONES' then
      round(case when reun.convocadas > 0 then reun.asistidas::numeric / reun.convocadas else 0 end
            * cr.peso_porcentaje, 2)
    when 'OBJETIVO_PLAN_ANUAL' then
      round((case when pae.fecha_entrega is not null then 100 else 0 end) * cr.peso_porcentaje / 100, 2)
    when 'OBJETIVO_CAPACITACIONES' then
      round(coalesce(cap.mejor_pct, 0) * cr.peso_porcentaje / 100, 2)
    else
      coalesce(ecc.obtenido_porcentaje, 0)
  end as obtenido_porcentaje
from catedras c
join profesores p on p.id = c.profesor_id
join asignaturas asig on asig.id = c.asignatura_id
join carreras car on car.id = asig.carrera_id
join sedes s on s.id = c.sede_id
cross join criterios_evaluacion cr
left join asistencia_clases ac on ac.catedra_id = c.id
left join cumplimiento_contenido cc on cc.catedra_id = c.id
left join contenido_no_considerado cnc on cnc.catedra_id = c.id
left join asistencia_mesas_examinadoras ame on ame.catedra_id = c.id
left join plan_anual_entrega pae on pae.catedra_id = c.id
left join evaluacion_criterio_catedra ecc on ecc.catedra_id = c.id and ecc.criterio_id = cr.id
left join lateral (
  select
    count(distinct coalesce(e.grupo, e.id::text)) as convocadas,
    count(distinct case when ear.id is not null then coalesce(e.grupo, e.id::text) end) as asistidas
  from evento e
  join periodo_academico pa2 on e.fecha between pa2.fecha_inicio and pa2.fecha_fin
  left join evento_asistencia_registro ear on ear.evento_id = e.id and ear.profesor_id = p.id
  where e.tipo = 'REUNION' and e.activo = true and pa2.etiqueta_periodo_lectivo = c.periodo_lectivo
) reun on true
left join lateral (
  select max(x.pct) as mejor_pct
  from (
    select
      case
        when bool_and(e.tipo = 'CAPACITACION_NO_EVALUADA')
          then count(ear.id)::numeric / count(*) * 100
        else coalesce(max(cres.porcentaje_obtenido), 0)
      end as pct
    from evento e
    join periodo_academico pa3 on e.fecha between pa3.fecha_inicio and pa3.fecha_fin
    left join evento_asistencia_registro ear on ear.evento_id = e.id and ear.profesor_id = p.id
    left join capacitacion_resultado cres
      on cres.profesor_id = p.id
     and cres.clave_capacitacion = coalesce(e.grupo, e.id::text)
     and cres.periodo_lectivo = c.periodo_lectivo
    where e.tipo in ('CAPACITACION_EVALUADA', 'CAPACITACION_NO_EVALUADA')
      and e.activo = true and pa3.etiqueta_periodo_lectivo = c.periodo_lectivo
    group by coalesce(e.grupo, e.id::text)
  ) x
) cap on true
where cr.activo = true and cr.periodo_lectivo = c.periodo_lectivo;

select registrar_migracion('migracion_contenido_no_considerado.sql');

notify pgrst, 'reload schema';
