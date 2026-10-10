-- ============================================================
-- Fecha real de clase en el avance de contenido programático
-- ============================================================
-- catedra_contenido_avance solo tenía marcado_en (timestamptz,
-- autocompletado al guardar) — registra CUÁNDO se tildó el checkbox
-- en el sistema, no QUÉ DÍA se dictó ese contenido. Eso obligaba al
-- profesor a cargar su materia el mismo día de la clase: si hubo un
-- corte de luz y no pudo entrar al kiosco, o si dio una clase virtual
-- un día no habitual, no había forma de dejar constancia del día real.
--
-- Esta migración agrega fecha_clase (date), editable desde el kiosco,
-- independiente de marcado_en (que se sigue completando solo, como
-- auditoría de cuándo se guardó cada carga).
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

alter table catedra_contenido_avance
  add column if not exists fecha_clase date not null default current_date;

select registrar_migracion('migracion_contenido_fecha_clase.sql');

notify pgrst, 'reload schema';
