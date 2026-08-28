-- ============================================================
-- Sistema de Evaluación Docente - FCE UNE
-- Corrección de datos: la tabla `carreras` tenía 9 filas
-- (una por combinación carrera+sede, con sufijos .STR/.CDE/.JLM/.ITA
-- y un typo "ADMINSITRACIÓN.CDE") en vez de las 3 carreras puras
-- que espera el resto de la app + la tabla `carreras_sedes`.
-- La tabla `sedes` tenía nombres sin el prefijo oficial
-- ("SANTA RITA" en vez de "Filial Santa Rita", etc.).
--
-- Seguro de correr una sola vez. Verificado antes de escribir esto:
-- las 126 asignaturas ya cargadas se reparten así:
--   45 -> ADMINISTRACIÓN.STR (f4f86653-c7ba-4a50-b54f-19eb7083ac55)
--   40 -> CONTABILIDAD.CDE   (53041e41-efa9-4ba7-b350-520538ef6a3c)
--   41 -> ECONOMÍA.CDE       (b46c82a2-a000-49f4-aaa2-61f43bcc8ba0)
-- Las otras 6 carreras no las usa ninguna asignatura.
-- ============================================================

-- 1) Vaciar carreras_sedes (2 filas parciales con nombres viejos)
delete from carreras_sedes;

-- 2) Renombrar las 3 carreras que sí usan las asignaturas cargadas
update carreras set nombre = 'ADMINISTRACIÓN' where id = 'f4f86653-c7ba-4a50-b54f-19eb7083ac55';
update carreras set nombre = 'CONTABILIDAD'   where id = '53041e41-efa9-4ba7-b350-520538ef6a3c';
update carreras set nombre = 'ECONOMÍA'       where id = 'b46c82a2-a000-49f4-aaa2-61f43bcc8ba0';

-- 3) Borrar las 6 carreras duplicadas sin uso
delete from carreras where id in (
  '5f889845-c78e-4f94-a5de-26ed126c7e2a', -- ADMINSITRACIÓN.CDE (typo)
  '0ce38e9f-7820-4ba5-b531-19b26a52a53d', -- CONTABILIDAD.ITA
  'c675840f-d86a-4fd2-8bf5-794727b83136', -- CONTABILIDAD.STR
  '0062fdb1-b2ac-4bf2-a797-4ba64aef421a', -- CONTABILIDAD.JLM
  '22b7968c-791d-45d3-90b6-0335cdd8e17e', -- ECONOMÍA.STR
  '069b840a-92e8-4b68-987d-a27b772dc06d'  -- ADMINISTRACIÓN.JLM
);

-- 4) Renombrar las 4 sedes a la convención oficial (planilla / README)
update sedes set nombre = 'Sede Central'                    where id = 'b37f50f6-57c8-4f9c-881b-ead2a0fd075d';
update sedes set nombre = 'Filial Santa Rita'                where id = '861d028f-9e13-4f65-9948-b17341d02760';
update sedes set nombre = 'Filial Juan León Mallorquín'      where id = 'f2439b00-bf45-4895-bb5c-d0500a01ddfd';
update sedes set nombre = 'Filial Itakyry'                   where id = '3a6b107f-3963-4d22-b773-9bfbeec95a7e';

-- 5) Recargar el cruce real carrera x sede con los nombres ya corregidos
insert into carreras_sedes (carrera_id, sede_id)
select c.id, s.id
from carreras c
join sedes s on true
where
  (c.nombre = 'ADMINISTRACIÓN' and s.nombre in ('Sede Central', 'Filial Santa Rita', 'Filial Juan León Mallorquín'))
  or (c.nombre = 'CONTABILIDAD' and s.nombre in ('Sede Central', 'Filial Santa Rita', 'Filial Juan León Mallorquín', 'Filial Itakyry'))
  or (c.nombre = 'ECONOMÍA' and s.nombre in ('Sede Central', 'Filial Santa Rita'))
on conflict (carrera_id, sede_id) do nothing;

-- Verificación rápida
select nombre from carreras order by nombre;
select nombre from sedes order by nombre;
select count(*) as vinculos_carrera_sede from carreras_sedes;
