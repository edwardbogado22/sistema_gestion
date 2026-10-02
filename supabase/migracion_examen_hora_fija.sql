-- ============================================================
-- Hora fija para los exámenes (19:00)
-- ============================================================
-- Todos los exámenes se toman siempre a las 19:00. El aula no es un
-- dato que gestione el sistema: la define el presidente de mesa el
-- día del examen y puede variar según el curso, así que no se carga
-- en ningún lado. No hace falta una pantalla para cargar la hora:
-- alcanza con que la fila nazca con el valor correcto, así los
-- reportes impresos (ReporteCarga, ReporteMesas) la muestran sin que
-- nadie la tenga que tipear.
--
-- El backfill de abajo no toca "fecha", pero trg_examen_fecha_validar
-- revalida la fila entera en cualquier UPDATE (rango, día no hábil,
-- estado del llamado). Mesas cargadas antes de que existiera alguna
-- regla (p.ej. sábados excluidos, migracion_excluir_sabados.sql)
-- quedan rechazadas al tocarlas aunque la fecha no cambie. Por eso el
-- trigger se desactiva solo para ese UPDATE puntual, dentro de la
-- misma transacción.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

begin;

alter table examen_fecha
  alter column hora_inicio set default '19:00';

alter table examen_fecha disable trigger trg_examen_fecha_validar;

update examen_fecha
   set hora_inicio = '19:00'
 where hora_inicio is null;

alter table examen_fecha enable trigger trg_examen_fecha_validar;

select registrar_migracion('migracion_examen_hora_fija.sql');

commit;
