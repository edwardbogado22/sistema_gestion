-- ============================================================
-- Diagnóstico y corrección retroactiva de `origen`
-- ============================================================
-- migracion_origen_examen_fecha.sql agregó la columna `origen` con
-- default 'MANUAL', así que las filas que ya existían antes de correr
-- esa migración -- incluidas las que salieron de "Distribuir fechas"
-- en llamados anteriores -- quedaron marcadas como MANUAL aunque en
-- realidad sean propuestas automáticas nunca confirmadas.
--
-- Este script NO se autorregistra en schema_migrations: es una
-- corrección de datos puntual, se corre a mano, se revisa el
-- resultado del paso 1 antes de decidir si hace falta el paso 2, y no
-- hace falta repetirlo en otra base que arranque limpia.
-- ============================================================


-- ------------------------------------------------------------
-- Paso 1) Mirar: candidatas a "distribución automática no revisada".
-- La huella de examen_distribuir() es un grupo de filas del mismo
-- llamado, cargadas por la misma persona (el admin), en el mismo
-- segundo o muy cerca -- una carga manual real de un secretario nunca
-- entra decenas de filas en el mismo instante.
-- ------------------------------------------------------------

select
  ef.llamado_id,
  ll.nombre as llamado,
  ef.asignado_por,
  date_trunc('second', ef.asignado_en) as momento,
  count(*) as filas
from examen_fecha ef
join examen_llamado ll on ll.id = ef.llamado_id
where ef.origen = 'MANUAL'
  and ef.estado = 'ASIGNADA'
group by 1, 2, 3, 4
having count(*) > 3  -- ajustar el umbral si hace falta
order by filas desc, momento desc;


-- ------------------------------------------------------------
-- Paso 2) Corregir: una vez identificado el llamado_id y el momento
-- exacto (o el rango) del paso 1, marcar esas filas como AUTO. No
-- las borra -- solo corrige la etiqueta, para que el trigger y el
-- botón "Purgar propuestas sin confirmar" las traten como lo que son.
--
-- Completar los valores entre <> antes de correr.
-- ------------------------------------------------------------

-- update examen_fecha
--    set origen = 'AUTO'
--  where llamado_id = '<uuid del llamado>'
--    and asignado_por = '<uuid del admin>'
--    and estado = 'ASIGNADA'
--    and asignado_en between '<momento> - interval ''2 seconds'''
--                         and '<momento> + interval ''2 seconds''';
