-- ============================================================
-- Excluir sábados del calendario de exámenes
-- ============================================================
-- La facultad no tiene clases los sábados. dia_bloqueado() ya excluía
-- los domingos por defecto (excluye_domingos en examen_llamado, desde
-- migracion_dias_no_habiles.sql) pero nunca hizo lo mismo con los
-- sábados: nada impedía que una distribución automática o una carga
-- manual cayera en sábado.
--
-- Mismo mecanismo que domingos: columna en examen_llamado, default
-- true, para no perder la posibilidad de que alguna filial excepcional
-- sí tome examen en sábado.
--
-- IMPORTANTE: dia_bloqueado() ya no es la de 2 argumentos de
-- migracion_dias_no_habiles.sql — migracion_asistencia_clases_diaria.sql
-- la reemplazó por una de 3 (fecha, llamado, sede) para poder filtrar
-- feriados por filial. Esta migración tiene que partir de ESA versión
-- y sumarle el sábado, no de la vieja: recrear la de 2 argumentos deja
-- dos funciones que pueden resolver la misma llamada y Postgres tira
-- "function dia_bloqueado(date, uuid) is not unique".
--
-- Si "Ordinario 2026" (o cualquier otro llamado ya cargado) tiene
-- fechas ya asignadas en sábado, esta migración NO las borra sola:
-- v_examen_fechas_invalidas (de migracion_asistencia_clases_diaria.sql)
-- las va a mostrar como inválidas para que Dirección Académica decida
-- qué hacer, igual que con cualquier otro feriado agregado después de
-- cargar fechas.
--
-- Ejecutar completo en el SQL Editor de Supabase, después de
-- migracion_asistencia_clases_diaria.sql.
-- ============================================================


alter table examen_llamado
  add column if not exists excluye_sabados boolean not null default true;


create or replace function dia_bloqueado(p_fecha date, p_llamado uuid default null, p_sede uuid default null)
returns text
language sql stable security definer set search_path = public
as $$
  select motivo from (
    -- calendario institucional permanente, global o de una sede puntual
    select motivo, 1 as prioridad
      from dia_no_habil
     where activo
       and (sede_id is null or sede_id = p_sede)
       and (fecha = p_fecha
            or (mes = extract(month from p_fecha)::smallint
                and dia = extract(day from p_fecha)::smallint))

    union all

    -- domingos, si el llamado los excluye
    select 'Domingo', 2
      from examen_llamado l
     where l.id = p_llamado
       and l.excluye_domingos
       and extract(dow from p_fecha) = 0

    union all

    -- sábados, si el llamado los excluye (no hay clases los sábados)
    select 'Sábado', 2
      from examen_llamado l
     where l.id = p_llamado
       and l.excluye_sabados
       and extract(dow from p_fecha) = 6

    union all

    -- excepción puntual de este llamado
    select coalesce(motivo, 'Día no hábil de este llamado'), 3
      from examen_llamado_excepcion
     where llamado_id = p_llamado and fecha = p_fecha
  ) x
  order by prioridad
  limit 1
$$;

grant execute on function dia_bloqueado(date, uuid, uuid) to authenticated;
revoke execute on function dia_bloqueado(date, uuid, uuid) from anon, public;

select registrar_migracion('migracion_excluir_sabados.sql');
