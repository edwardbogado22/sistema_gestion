-- ============================================================
-- Datos: optativas del mismo curso y sección en la misma fecha
-- (Complementario 2026 y Regularización 2026)
-- ============================================================
-- Corrige las fechas automáticas (AUTO) que la distribución anterior
-- había separado. En cada grupo se deja una de las fechas que ya tenía
-- alguna de sus optativas, el día en que dan clase los profesores del
-- grupo y sin otro examen del curso ese día. Los vocales ya asignados
-- se conservan (se mueve la fecha, no se borra la mesa).
--
-- Estos llamados los asigna Dirección Académica: el trigger exige un
-- usuario ADMIN, así que la transacción se identifica como el usuario
-- "Dirección Académica" solo mientras corre.
--
-- Correr DESPUÉS de migracion_optativas_misma_fecha.sql.
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

begin;

select set_config('request.jwt.claims',
  '{"sub":"e68ae29d-d573-4161-8d87-1b89a3ba3d41","role":"authenticated"}', true);


-- Complementario 2026
-- SOCIOLOGÍA: sin fecha -> 2027-02-12
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('1708e46b-b99d-41a6-ab38-a567851c29d0', 'a5c5ea59-6dad-4bee-930d-b562c85608d2', '2027-02-12', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- POLÍTICA FISCAL: 2027-02-16 -> 2027-02-02
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('1708e46b-b99d-41a6-ab38-a567851c29d0', 'b3350397-ca16-4562-9532-b41ac1e776e1', '2027-02-02', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- PYMES Y EMPRESAS FAMILIARES: sin fecha -> 2027-02-17
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('1708e46b-b99d-41a6-ab38-a567851c29d0', '9ef5a8c6-1e9e-425a-86fa-f4ddac89381b', '2027-02-17', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- INFORMÁTICA APLICADA: sin fecha -> 2027-02-11
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('1708e46b-b99d-41a6-ab38-a567851c29d0', 'd4a5b48c-0185-4995-a4e3-81320344a246', '2027-02-11', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- MERCADO DE CAPITALES: 2027-02-08 -> 2027-02-01
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('1708e46b-b99d-41a6-ab38-a567851c29d0', '287c6275-1c82-420d-9957-25e2ecb913c0', '2027-02-01', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- INFORMÁTICA APLICADA: sin fecha -> 2027-02-04
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('1708e46b-b99d-41a6-ab38-a567851c29d0', 'd9d8f4ee-58ed-479d-b8f5-24c0fe744001', '2027-02-04', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- EMPRENDIMIENTO EMPRESARIAL: 2027-02-12 -> 2027-02-05
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('1708e46b-b99d-41a6-ab38-a567851c29d0', '3e8be7ee-ab02-49de-9064-7cb675889910', '2027-02-05', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- MARKETING: 2027-02-16 -> 2027-02-02
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('1708e46b-b99d-41a6-ab38-a567851c29d0', '65dc5830-c163-4e98-a2d4-2cb3f0047b75', '2027-02-02', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- IDIOMA EXTRANJERO (INGLÉS): 2027-02-16 -> 2027-02-09
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('1708e46b-b99d-41a6-ab38-a567851c29d0', '34105e63-b4c1-4411-b41b-ce66ae83bf8f', '2027-02-09', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- ADMINISTRACIÓN AGRÍCOLA Y GANADERA: 2027-02-17 -> 2027-02-10
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('1708e46b-b99d-41a6-ab38-a567851c29d0', '487c85db-7473-402b-9650-e0af1f836acc', '2027-02-10', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- PYMES Y EMPRESAS FAMILIARES: sin fecha -> 2027-02-17
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('1708e46b-b99d-41a6-ab38-a567851c29d0', '5f75a923-6957-49e3-9378-ee2d3ea720c2', '2027-02-17', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- MERCADO DE CAPITALES: 2027-02-15 -> 2027-02-08
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('1708e46b-b99d-41a6-ab38-a567851c29d0', 'feb0e4ab-549b-430e-853e-240c06cd19ee', '2027-02-08', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;

-- Regularización 2026
-- SOCIOLOGÍA: sin fecha -> 2027-03-05
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('2b233b70-70f5-47a5-91e5-26143e62c46c', 'a5c5ea59-6dad-4bee-930d-b562c85608d2', '2027-03-05', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- POLÍTICA FISCAL: 2027-03-02 -> 2027-02-23
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('2b233b70-70f5-47a5-91e5-26143e62c46c', 'b3350397-ca16-4562-9532-b41ac1e776e1', '2027-02-23', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- PYMES Y EMPRESAS FAMILIARES: sin fecha -> 2027-03-03
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('2b233b70-70f5-47a5-91e5-26143e62c46c', '9ef5a8c6-1e9e-425a-86fa-f4ddac89381b', '2027-03-03', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- INFORMÁTICA APLICADA: sin fecha -> 2027-03-04
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('2b233b70-70f5-47a5-91e5-26143e62c46c', 'd4a5b48c-0185-4995-a4e3-81320344a246', '2027-03-04', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- MERCADO DE CAPITALES: sin fecha -> 2027-02-22
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('2b233b70-70f5-47a5-91e5-26143e62c46c', '287c6275-1c82-420d-9957-25e2ecb913c0', '2027-02-22', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- INFORMÁTICA APLICADA: sin fecha -> 2027-02-25
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('2b233b70-70f5-47a5-91e5-26143e62c46c', 'd9d8f4ee-58ed-479d-b8f5-24c0fe744001', '2027-02-25', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- FILOSOFÍA DE LA ECONOMÍA: 2027-03-05 -> 2027-02-26
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('2b233b70-70f5-47a5-91e5-26143e62c46c', '856c35e3-38cc-4e43-b3ab-2674ea71ca5e', '2027-02-26', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- MERCADO DE CAPITALES: sin fecha -> 2027-02-23
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('2b233b70-70f5-47a5-91e5-26143e62c46c', '97f174b6-6a6b-4cb3-83e3-36994df1e110', '2027-02-23', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- SOCIOLOGÍA: sin fecha -> 2027-02-23
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('2b233b70-70f5-47a5-91e5-26143e62c46c', '92768a87-83d5-4171-8f4d-d1f560c840cf', '2027-02-23', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- ADMINISTRACIÓN AGRÍCOLA Y GANADERA: 2027-03-03 -> 2027-02-24
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('2b233b70-70f5-47a5-91e5-26143e62c46c', '487c85db-7473-402b-9650-e0af1f836acc', '2027-02-24', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- PYMES Y EMPRESAS FAMILIARES: sin fecha -> 2027-03-03
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('2b233b70-70f5-47a5-91e5-26143e62c46c', '5f75a923-6957-49e3-9378-ee2d3ea720c2', '2027-03-03', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;
-- MERCADO DE CAPITALES: sin fecha -> 2027-03-08
insert into examen_fecha (llamado_id, catedra_id, fecha, estado, origen)
values ('2b233b70-70f5-47a5-91e5-26143e62c46c', 'feb0e4ab-549b-430e-853e-240c06cd19ee', '2027-03-08', 'ASIGNADA', 'AUTO')
on conflict (llamado_id, catedra_id) do update set fecha = excluded.fecha;

commit;

-- Control: grupos de optativas con fechas distintas o sin fecha (debe dar 0 filas)
select ag.llamado, ag.sede, ag.carrera, ag.curso_nivel, upper(ag.seccion_grupo) as seccion,
       string_agg(concat_ws(' ', ag.materia, coalesce(ag.fecha::text, 'SIN FECHA')), ' | ') as optativas
  from v_examen_agenda ag
 where ag.llamado_id in ('1708e46b-b99d-41a6-ab38-a567851c29d0', '2b233b70-70f5-47a5-91e5-26143e62c46c')
   and ag.optativa
 group by ag.llamado, ag.sede, ag.carrera, ag.curso_nivel, upper(ag.seccion_grupo)
having count(*) > 1 and (count(distinct ag.fecha) > 1 or count(ag.fecha) < count(*));
