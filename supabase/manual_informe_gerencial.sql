-- ============================================================
-- Manual: Informe gerencial (cómo se calcula cada indicador)
-- ============================================================
-- Explica, para Decanato, Direcciones de Carrera y Dirección
-- Académica, de dónde sale cada número del informe gerencial
-- (src/lib/informeGerencial.js, informe_asistencia_carrera_sede()).
-- Entra como BORRADOR: Dirección Académica lo revisa en /ayuda y lo
-- publica. Se puede correr más de una vez sin duplicarlo.
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

insert into manual (pantalla, titulo, resumen, contenido, orden, publicado)
select '/informes/gerencial',
       'Informe gerencial: cómo se calcula cada indicador',
       'De dónde sale cada número, qué se cuenta, sobre qué se divide y por qué puede diferir de otros cálculos.',
$m$## Para qué sirve
El informe muestra el estado de situación de la Facultad en un período: cuántos profesores están en actividad, cómo se dictan y se registran las clases, cómo se cumplen las mesas examinadoras y qué rendimiento tienen los profesores según la Foja de Desempeño.

Todos los números se calculan en el momento con los datos del sistema: no hay nada cargado a mano en el informe.

## Quién ve qué
- **Decanato, Dirección Académica y Secretaría de Dirección Académica**: toda la Facultad.
- **Director de Carrera**: solo su carrera y sede. Los totales son los de su alcance.

## Los filtros
- **Período**: el período académico. Define qué cátedras, llamados de examen y fojas entran.
- **Asistencia desde / hasta**: el rango de fechas de la asistencia a clases. Por defecto va del inicio del período hasta **ayer** (el día de hoy todavía se está cargando y bajaría la carga sin motivo).
- **Carrera** y **Sede**: acotan todo el informe a esa carrera o sede.

Todos los indicadores se recalculan con los filtros elegidos.

## Estados (colores)
- Sin marca, o **✓ Bien**: 80 % o más.
- **! Atención**: de 60 % a 79,9 %.
- **✕ Crítico**: menos de 60 %.

Son los mismos umbrales del Reporte de asistencia a clases. En la tabla por carrera y sede solo se marca lo que pide atención, para que resalte.

## 1. Profesores activos con materias
**Qué cuenta:** profesores distintos que tienen **al menos una cátedra activa** en el período elegido.

- Cada profesor se cuenta **una sola vez** en el total, aunque dicte varias materias o en varias carreras.
- En la tabla por carrera y sede, un profesor que dicta en dos carreras aparece en las dos filas; por eso la suma de las filas puede ser mayor que el total.
- **Cátedras** es la cantidad de cátedras activas del período.

## 2. Asistencia a clases
**Qué mide:** de las clases que se registraron, cuántas dio el profesor.

**Fórmula:** presentes ÷ (registradas − ausencias justificadas) × 100

**Cómo se arma, paso a paso:**
1. **Clases esperadas**: para cada profesor, en cada carrera y sede, se toman los **días de clase** de sus cátedras activas (los que figuran en Cátedras → Días de clase) y se recorren todas las fechas del rango. Cada fecha que cae en uno de esos días es una clase esperada.
2. Se descuentan los **días no hábiles** (feriados y asuetos de Configuración → Días no hábiles, generales o de esa sede).
3. Si un profesor tiene **dos materias el mismo día** en la misma carrera y sede, cuenta como **una** clase: la asistencia se registra por profesor y por día.
4. **Clases registradas**: de esas clases esperadas, las que tienen cargado Presente, Ausente o Ausente justificado.
5. Las **ausencias justificadas** no cuentan ni a favor ni en contra: se restan del total sobre el que se divide.

**Ejemplo:** un profesor con 20 clases esperadas, de las que se registraron 16: 13 presente, 2 ausente y 1 justificada. Asistencia = 13 ÷ (16 − 1) = 13 ÷ 15 = **86,7 %**.

**Importante:** un día **sin cargar no es una falta**. Si la Secretaría no registró un día, ese día no baja la asistencia: baja la **carga** (indicador 3). En el Reporte de asistencia a clases, en cambio, un día sin cargar cuenta como ausencia; por eso los dos números pueden diferir.

Las clases registradas **fuera de horario** (recuperaciones, clases virtuales en otro día) no se suman en este indicador, porque no son clases esperadas.

## 3. Carga de asistencia
**Qué mide:** cuánto de lo que había que registrar se registró. Es un indicador del trabajo de carga, no del profesor.

**Fórmula:** clases registradas ÷ clases esperadas × 100

**Ejemplo:** con 20 clases esperadas y 16 registradas, la carga es **80 %**.

Una carga baja en una carrera o sede puede deberse a dos cosas: días que no se cargaron, o cátedras que **no tienen sus días de clase** cargados en Cátedras (si no tienen días, no generan clases esperadas y tampoco aparecen en la carga diaria).

## Períodos con datos importados
Los períodos anteriores al registro diario (por ejemplo **2025**) se cargaron con Importar datos, ya **resumidos por cátedra**. Si el período no tiene ningún registro diario, el informe usa esos datos y lo indica en pantalla:
- **Asistencia a clases** = suma de horas dictadas ÷ suma de horas programadas × 100 (pesa más la cátedra con más horas). Si una cátedra no tiene horas cargadas, se usa su porcentaje.
- **Carga de asistencia**: sin dato ("—"), porque sin registro diario no se puede saber qué faltó cargar.
- **Mesas**: suma de mesas asistidas ÷ suma de mesas convocadas × 100, sin el detalle por llamado.

## 4. Asistencia a mesas examinadoras
**Qué mide:** de los integrantes de las mesas que ya se tomaron, cuántos asistieron.

**Fórmula:** integrantes que asistieron ÷ integrantes con la asistencia registrada × 100

**Cómo se arma:**
1. Se toman las mesas de **todos los llamados del período** (Ordinario, Complementario, Regularización) que tienen fecha y no están anuladas.
2. Solo cuentan las mesas **ya tomadas**: fecha hasta hoy. Una mesa futura no puede tener asistencia.
3. Los **integrantes** de cada mesa son el **presidente** (titular de la cátedra) y sus **vocales**.
4. Se cuentan los integrantes con la asistencia registrada (Sí o No) y, de ellos, los que asistieron.

**Ejemplo:** 10 mesas tomadas con presidente y 2 vocales = 30 integrantes. Se registró la asistencia de 27; asistieron 25. Asistencia = 25 ÷ 27 = **92,6 %**. La **asistencia registrada** es 27 ÷ 30 = **90 %** y se muestra en la tarjeta de cada llamado.

Igual que en las clases, un integrante **sin registrar no es una ausencia**: baja la asistencia registrada, no la asistencia.

## 5. Rendimiento institucional (Foja de Desempeño)
**Qué mide:** el resultado de la Foja de Desempeño en los criterios que registra el propio sistema.

**La valoración de alumnos (encuesta) queda fuera** porque no se genera en el sistema. Por eso los criterios que entran suman **80 puntos** (Resolución 054/2021): planificación y documentación, desarrollo pedagógico, participación institucional, capacitaciones, asistencia a exámenes finales y actividades de desarrollo de competencias.

**Cómo se arma, paso a paso:**
1. Para cada cátedra activa del período se suman los puntos obtenidos en esos criterios, calculados igual que en la foja.
2. Se divide por la suma de sus pesos y se pasa a porcentaje: **puntos obtenidos ÷ 80 × 100**.
3. El **promedio** es el promedio simple de todas las cátedras: cada cátedra cuenta una vez. Un profesor con tres cátedras pesa tres veces.
4. Por **carrera** y por **sede**: el promedio de sus cátedras.
5. Por **profesor**: el promedio de sus cátedras.

**Ejemplo:** una cátedra con 18 de 20 en planificación, 21 de 30 en desarrollo pedagógico, 8 de 10 en participación, 5 de 5 en capacitaciones, 6 de 10 en exámenes y 0 de 5 en competencias suma 58 de 80. Rendimiento = 58 ÷ 80 × 100 = **72,5 %**.

**Por qué no coincide con la foja impresa:** la foja suma también la encuesta de alumnos (sobre 100) y, cuando una cátedra no tiene encuesta, usa el promedio de su carrera y sede. El informe mide solo lo que gestiona la Facultad con el sistema.

**Por qué puede diferir de otro cálculo propio:** revisá estas tres cosas:
- si se incluyó la encuesta de alumnos (el informe no la incluye);
- si se promedió **por cátedra** (como el informe) o **por profesor**;
- si se tomaron solo las **cátedras activas** del período (como el informe).

## Cátedras por escala valorativa
Cada cátedra se ubica en la escala de la foja según su rendimiento institucional, redondeado al entero a favor del profesor:
- **Excelente**: 91 % o más.
- **Muy bueno**: de 80 % a 90 %.
- **Bueno**: de 70 % a 79 %.
- **Necesita mejorar**: de 60 % a 69 %.
- **No cumple**: menos de 60 %.

Como la encuesta no entra, la ubicación puede no coincidir con la de la foja impresa.

## Dónde se pierden puntos
Para cada criterio institucional: el **promedio de puntos obtenidos** sobre su **peso**. Por ejemplo, "Planificación y documentación: 14,2 de 20" quiere decir que en promedio las cátedras obtienen 14,2 de los 20 puntos posibles. Muestra qué criterio baja más el rendimiento de la Facultad.

## Rendimiento por profesor
La lista ordena a los profesores por su rendimiento institucional promedio, de menor a mayor por defecto, para ver primero a quienes necesitan acompañamiento. Muestra las carreras y sedes donde dicta, sus cátedras, el promedio y la escala. Se puede buscar por nombre y ordenar de mayor a menor.

## Descargar e imprimir
- **Descargar CSV** en la tabla por carrera y sede y en la lista de profesores: los mismos números, para Excel.
- **Imprimir**: el informe completo, con el pie del Departamento de Tecnología. La lista de profesores imprime los que se están viendo (los primeros 25, o todos si se tocó "Ver los … profesores").$m$,
       0,
       false
where not exists (
  select 1 from manual m
   where m.pantalla = '/informes/gerencial'
     and m.titulo = 'Informe gerencial: cómo se calcula cada indicador'
);

select registrar_migracion('manual_informe_gerencial.sql');
