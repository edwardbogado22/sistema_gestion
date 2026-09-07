-- ============================================================
-- Unicidad de documento de identidad en profesores
-- ============================================================
-- Nada impedía cargar dos veces al mismo profesor con el mismo
-- documento_identidad. Pasó en producción: un alta desde
-- Configuración → Profesores se quedó colgada en "Guardando...",
-- se reintentó, y las dos inserciones se guardaron como filas
-- separadas (misma persona, dos UUID distintos) porque no había
-- ninguna restricción que lo evitara.
--
-- Esta migración agrega un índice único sobre documento_identidad.
-- A partir de acá, un segundo alta con el mismo documento devuelve
-- el error de Postgres 23505 en vez de duplicar — el mismo código
-- de error que ya maneja Catedras.jsx para cátedras repetidas, así
-- que alcanza con que la UI de Profesores muestre un mensaje claro
-- para ese caso (pendiente, no forma parte de esta migración).
--
-- Verificado antes de escribir esto: sin duplicados existentes en
-- producción (314 profesores, 314 documentos distintos), así que el
-- índice se crea sin conflictos.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

create unique index if not exists profesores_documento_identidad_key
  on profesores (documento_identidad);

select registrar_migracion('migracion_unicidad_documento_profesor.sql');
