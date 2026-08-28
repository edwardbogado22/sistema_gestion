-- ============================================================
-- Sistema de Evaluación Docente - FCE UNE
-- Migración additiva: una carrera puede dictarse en varias sedes.
-- El esquema preexistente (tabla carreras) solo admite una sede
-- por carrera vía carreras.sede_id, pero el listado real
-- (Docentes-2026-Abril) muestra que no es así, por ejemplo:
--   Contabilidad se dicta en las 4 sedes, Administración en 3,
--   Economía en 2. Esta tabla nueva no reemplaza carreras.sede_id
--   (se deja como está, sin uso para filtrar), solo agrega el
--   vínculo real N a N.
--
-- Cómo aplicar: pegar y ejecutar TODO este archivo en Supabase
-- Dashboard > SQL Editor. Seguro de correr más de una vez (usa
-- "if not exists" y "on conflict do nothing").
-- ============================================================

create table if not exists carreras_sedes (
  id uuid primary key default gen_random_uuid(),
  carrera_id uuid not null references carreras(id) on delete cascade,
  sede_id uuid not null references sedes(id) on delete cascade,
  unique (carrera_id, sede_id)
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on carreras_sedes to authenticated;

alter table carreras_sedes enable row level security;

drop policy if exists carreras_sedes_rw on carreras_sedes;
create policy carreras_sedes_rw on carreras_sedes for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- Carga inicial según el cruce real Sede x Carrera del listado
-- Docentes-2026-Abril. Si los nombres de carreras/sedes en tu
-- base son distintos a estos, ajustá el texto antes de correr.
-- ------------------------------------------------------------

insert into carreras_sedes (carrera_id, sede_id)
select c.id, s.id
from carreras c
join sedes s on true
where
  (c.nombre = 'ADMINISTRACIÓN' and s.nombre in ('Sede Central', 'Filial Santa Rita', 'Filial Juan León Mallorquín'))
  or (c.nombre = 'CONTABILIDAD' and s.nombre in ('Sede Central', 'Filial Santa Rita', 'Filial Juan León Mallorquín', 'Filial Itakyry'))
  or (c.nombre = 'ECONOMÍA' and s.nombre in ('Sede Central', 'Filial Santa Rita'))
on conflict (carrera_id, sede_id) do nothing;
