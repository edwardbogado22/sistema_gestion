-- ============================================================
-- Manual "Cátedras" de la Secretaría de Carrera: corrección
-- ============================================================
-- manuales_secretaria_carrera.sql decía que el secretario carga los
-- indicadores manuales desde el botón Indicadores, pero
-- evaluacion_criterio_catedra solo la escribe Dirección Académica.
-- Corrige esa línea en el manual ya cargado (si todavía no se editó a
-- mano desde /ayuda; si se editó, no cambia nada).
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

update manual
   set contenido = replace(
         contenido,
         '- **Indicadores**: la carga de los indicadores de la cátedra que se hacen a mano.',
         '- **Indicadores**: los indicadores de la cátedra que se cargan a mano. Los carga Dirección Académica.'
       ),
       actualizado_en = now()
 where pantalla = '/catedras'
   and titulo = 'Cátedras: cambiar el profesor y los días de clase'
   and contenido like '%que se hacen a mano.%';

select registrar_migracion('fix_manual_catedras_indicadores.sql');
