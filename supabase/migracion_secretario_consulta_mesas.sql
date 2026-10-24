-- ============================================================
-- Mesas por profesor también para el Secretario de Carrera
-- ============================================================
-- La pantalla /examenes/consulta-profesor era solo de Dirección
-- Académica. Se abre a SECRETARIO para que pueda informar a los
-- profesores, pero con la agenda COMPLETA del profesor: las policies
-- de examen_fecha y mesa_integrante le dejan ver solo su carrera/sede,
-- y un profesor suele ser examinador en otras carreras. Por eso la
-- consulta pasa a esta función security definer en vez de leer
-- v_examen_agenda y mesa_integrante directo.
--
-- No expone nada nuevo: es lo mismo que el profesor ve en /mis-mesas
-- (consulta_publica_mesas, migracion_mis_mesas_llamado_vigente.sql) —
-- solo el llamado vigente: el APROBADO o CERRADO que todavía no terminó
-- y termina primero, sin mesas anuladas. Así el secretario informa lo
-- mismo que el profesor ve. ADMIN y SECRETARIA_ACADEMICA siguen viendo
-- todos los llamados del período, igual que antes.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

create or replace function consulta_mesas_profesor(p_profesor uuid, p_periodo text)
returns table (
  examen_fecha_id uuid,
  fecha           date,
  llamado         text,
  llamado_tipo    text,
  carrera         text,
  sede            text,
  curso_nivel     int,
  seccion_grupo   text,
  materia         text,
  optativa        boolean,
  rol             text
)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_todo boolean := app_lee_todo();
  -- fecha_fin del llamado vigente, mismo criterio que /mis-mesas.
  v_fin_vigente date;
begin
  if not (v_todo or app_rol() = 'SECRETARIO') then
    raise exception 'No tenés permiso para consultar mesas por profesor.';
  end if;

  select min(l.fecha_fin)
    into v_fin_vigente
    from examen_llamado l
   where l.estado in ('APROBADO', 'CERRADO')
     and l.fecha_fin >= current_date;

  return query
  with mesas as (
    select ef.id as examen_fecha_id, ef.fecha,
           l.nombre::text as llamado, l.tipo::text as llamado_tipo,
           car.nombre::text as carrera, s.nombre::text as sede,
           a.curso_nivel, c.seccion_grupo::text as seccion_grupo,
           a.nombre::text as materia, a.optativa,
           c.profesor_id as presidente_id
      from examen_llamado l
      join catedras c      on c.periodo_lectivo = l.periodo_lectivo and c.activo and not c.exento_examen
      join examen_fecha ef on ef.llamado_id = l.id and ef.catedra_id = c.id
      join asignaturas a   on a.id = c.asignatura_id
      join carreras car    on car.id = a.carrera_id
      join sedes s         on s.id = c.sede_id
     where l.periodo_lectivo = p_periodo
       and ef.fecha is not null
       and (v_todo or (l.estado in ('APROBADO', 'CERRADO')
                       and l.fecha_fin = v_fin_vigente
                       and ef.estado <> 'ANULADA'))
  )
  select m.examen_fecha_id, m.fecha, m.llamado, m.llamado_tipo, m.carrera, m.sede,
         m.curso_nivel, m.seccion_grupo, m.materia, m.optativa, 'Presidente'::text
    from mesas m
   where m.presidente_id = p_profesor
  union all
  select m.examen_fecha_id, m.fecha, m.llamado, m.llamado_tipo, m.carrera, m.sede,
         m.curso_nivel, m.seccion_grupo, m.materia, m.optativa, 'Examinador'::text
    from mesas m
   where exists (select 1 from mesa_integrante mi
                  where mi.examen_fecha_id = m.examen_fecha_id
                    and mi.profesor_id = p_profesor
                    and mi.rol_mesa = 'VOCAL');
end $$;

revoke execute on function consulta_mesas_profesor(uuid, text) from anon, public;
grant execute on function consulta_mesas_profesor(uuid, text) to authenticated;

select registrar_migracion('migracion_secretario_consulta_mesas.sql');

notify pgrst, 'reload schema';
