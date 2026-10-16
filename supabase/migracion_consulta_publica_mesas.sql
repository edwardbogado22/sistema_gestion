-- ============================================================
-- Consulta pública de mesas examinadoras por cédula (/mis-mesas)
-- ============================================================
-- El profesor entra sin iniciar sesión, escribe su cédula y ve las
-- mesas en las que participa (como presidente o examinador) en los
-- llamados ya publicados. La función se creó directo en la base junto
-- con MisMesas.jsx y no había quedado en el repo; este archivo la
-- versiona tal cual, sin el aula: el sistema no la carga (cada curso
-- rinde en su propia aula) y la pantalla ya no la muestra.
--
-- security definer porque anon no tiene acceso a ninguna tabla
-- (migracion_seguridad_anon.sql). Devuelve solo nombres y datos de las
-- mesas, nunca la cédula. Sin sesión muestra solo llamados APROBADO o
-- CERRADO; Dirección Académica con sesión ve también los demás, para
-- revisar antes de publicar.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

create or replace function consulta_publica_mesas(p_cedula text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_digitos  text := regexp_replace(coalesce(p_cedula, ''), '[^0-9]', '', 'g');
  v_prof_id  uuid;
  v_nombre   text;
  v_mesas    jsonb;
  -- Dirección Académica con sesión abierta ve también los llamados
  -- sin aprobar, para revisar antes de publicar. Sin sesión da false.
  v_previa   boolean := app_es_admin();
begin
  if length(v_digitos) < 5 then
    return jsonb_build_object('encontrado', false);
  end if;

  select p.id, concat_ws(', ', p.apellidos, p.nombres)
    into v_prof_id, v_nombre
    from profesores p
   where regexp_replace(p.documento_identidad, '[^0-9]', '', 'g') = v_digitos
   limit 1;

  if v_prof_id is null then
    return jsonb_build_object('encontrado', false);
  end if;

  with mesas as (
    select
      ef.id            as examen_fecha_id,
      ef.fecha,
      ef.hora_inicio,
      l.nombre         as llamado,
      l.tipo           as llamado_tipo,
      l.periodo_lectivo,
      car.id           as carrera_id,
      car.nombre       as carrera,
      s.nombre         as sede,
      a.nombre         as materia,
      a.curso_nivel,
      a.optativa,
      c.seccion_grupo,
      c.profesor_id    as presidente_id,
      concat_ws(', ', tit.apellidos, tit.nombres) as presidente
    from examen_llamado l
    join examen_fecha ef on ef.llamado_id = l.id and ef.estado <> 'ANULADA'
    join catedras c      on c.id = ef.catedra_id and c.activo and not c.exento_examen
    join asignaturas a   on a.id = c.asignatura_id
    join carreras car    on car.id = a.carrera_id
    join sedes s         on s.id = c.sede_id
    join profesores tit  on tit.id = c.profesor_id
    where (v_previa or l.estado in ('APROBADO', 'CERRADO'))
      and l.fecha_fin >= current_date - 7
  ),
  participaciones as (
    select
      m.fecha,
      m.hora_inicio,
      m.llamado,
      m.llamado_tipo,
      m.carrera,
      m.sede,
      m.materia,
      m.curso_nivel,
      m.optativa,
      m.seccion_grupo,
      m.presidente,
      r.rol,
      (
        select coalesce(
                 jsonb_agg(concat_ws(', ', v.apellidos, v.nombres) order by v.apellidos, v.nombres),
                 '[]'::jsonb
               )
          from mesa_integrante mi
          join profesores v on v.id = mi.profesor_id
         where mi.examen_fecha_id = m.examen_fecha_id
           and mi.rol_mesa = 'VOCAL'
      ) as examinadores,
      (
        r.rol = 'EXAMINADOR'
        and not exists (
          select 1
            from catedras c2
            join asignaturas a2 on a2.id = c2.asignatura_id
           where c2.profesor_id = v_prof_id
             and c2.activo
             and c2.periodo_lectivo = m.periodo_lectivo
             and a2.carrera_id = m.carrera_id
        )
      ) as otra_carrera
    from mesas m
    cross join lateral (
      select 'PRESIDENTE' as rol
       where m.presidente_id = v_prof_id
      union all
      select 'EXAMINADOR' as rol
       where exists (
               select 1 from mesa_integrante mi
                where mi.examen_fecha_id = m.examen_fecha_id
                  and mi.profesor_id = v_prof_id
                  and mi.rol_mesa = 'VOCAL'
             )
    ) r
  )
  select coalesce(
           jsonb_agg(to_jsonb(x) order by x.fecha, x.hora_inicio nulls last, x.materia),
           '[]'::jsonb
         )
    into v_mesas
    from participaciones x;

  return jsonb_build_object(
    'encontrado', true,
    'vista_previa', v_previa,
    'profesor', v_nombre,
    'mesas', v_mesas
  );
end $$;

grant execute on function consulta_publica_mesas(text) to anon, authenticated;

select registrar_migracion('migracion_consulta_publica_mesas.sql');

notify pgrst, 'reload schema';
