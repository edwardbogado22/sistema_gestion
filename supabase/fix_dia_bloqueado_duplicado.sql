-- ============================================================
-- Fix: dia_bloqueado quedó con dos firmas después de
-- migracion_excluir_sabados.sql
-- ============================================================
-- migracion_asistencia_clases_diaria.sql ya había reemplazado
-- dia_bloqueado(fecha, llamado) por una versión de 3 argumentos
-- (fecha, llamado, sede) para poder filtrar feriados por filial en
-- dia_no_habil.sede_id, y había hecho el drop explícito de la vieja
-- de 2 argumentos para evitar justo este problema.
--
-- migracion_excluir_sabados.sql no tenía ese contexto (se escribió
-- mirando solo la versión vieja de migracion_dias_no_habiles.sql) y
-- volvió a crear la firma de 2 argumentos con "create or replace":
-- como el tipo de argumentos no coincide con la de 3, Postgres no
-- reemplazó nada, sumó una función más, y quedaron dos que pueden
-- resolver una llamada de 2 argumentos (la de 3 tiene p_sede con
-- default null) -> "is not unique".
--
-- Este fix borra la de 2 argumentos que sobra y deja una única
-- versión de 3 argumentos que combina TODO: el filtro por sede de
-- dia_no_habil, el choque cruzado por optativas (no aplica acá), y
-- ahora también el sábado.
-- ============================================================

drop function if exists dia_bloqueado(date, uuid);

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

-- Por si el cache de esquema de PostgREST (self-hosted) no se refrescó solo:
notify pgrst, 'reload schema';
