-- ============================================================
-- Manuales de uso: Secretaría de Carrera (primera tanda)
-- ============================================================
-- Carga en la tabla `manual` (migracion_manual_usuario.sql) los
-- manuales de las pantallas que usa el Secretario de Carrera, escritos
-- a partir del funcionamiento real de cada pantalla. Entran como
-- BORRADOR: Dirección Académica los revisa en /ayuda, les agrega los
-- videos y los publica desde el editor.
--
-- Se puede correr más de una vez: un manual que ya existe (misma
-- pantalla y título) no se duplica ni se pisa.
--
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

insert into manual (pantalla, titulo, resumen, contenido, orden, publicado)
select v.pantalla, v.titulo, v.resumen, v.contenido, v.orden, false
from (values

-- ------------------------------------------------------------
('general', 'Primeros pasos: Secretaría de Carrera',
 'Cómo ingresar, cómo está organizado el menú y qué podés ver y hacer con tu usuario.',
$m$## Para qué sirve el sistema
Todo lo que se registra en el sistema durante el año (asistencia a clases, plan anual, mesas de examen, reuniones, capacitaciones y la encuesta a alumnos) termina en la **Foja de Desempeño** de cada profesor. Por eso es importante cargar todo a tiempo y con cuidado.

## Ingresar
1. Abrí el sistema en el navegador (Chrome o Edge).
2. Escribí tu **Email** y tu **Contraseña**, y tocá **Ingresar**.
3. Si aparece "Error al iniciar sesión", revisá el email y la contraseña. Si no la recordás, pedí que te la restablezcan en Dirección Académica.
4. Si después de ingresar aparece **"Sin rol asignado"**, tu usuario todavía no está habilitado: avisá a Dirección Académica.

## Qué ves con tu usuario
- Solo ves las **carreras y sedes a tu cargo**. En pantallas anchas aparecen arriba a la derecha, junto a tu nombre.
- Si algo de tu carrera no aparece, no lo cargues de nuevo: avisá a Dirección Académica para revisar tu alcance.

## El menú
La barra verde de arriba tiene el menú por áreas. Tocá un área para ver sus pantallas:
- **Cátedras**: Cátedras, Plan Anual de Clases y su constancia, y el Kiosco de Contenido Programático.
- **Asistencia**: la carga diaria de asistencia a clases, el reporte y los reemplazos.
- **Mesas**: llamados y fechas de examen.
- **Consultas**: Mesas por profesor y Actas a firmar.
- **Ayuda**: el Centro de ayuda con todos los manuales.

En el celular, el menú se abre con el botón **☰ Menú**.

## Ayuda en cada pantalla
El botón **?** de la barra superior abre el manual de la pantalla en la que estás, sin salir de lo que estabas haciendo. En el **Centro de ayuda** están todos los manuales, con buscador.

## Salir
Tocá **Cerrar sesión** al terminar, sobre todo si usás una computadora compartida.$m$, 0),

-- ------------------------------------------------------------
('/asistencia', 'Cargar la asistencia diaria a clases',
 'Registrar quién dio clase cada día, quién faltó y quién lo cubrió. Es la tarea de todos los días.',
$m$## Para qué sirve
La asistencia a clases es parte del **30 % de "Desarrollo pedagógico"** de la Foja de Desempeño. Se registra **por profesor y por día**: si un profesor tiene dos materias el mismo día en tu carrera, aparece una sola vez con sus materias al lado.

## Antes de empezar
- Tiene que haber un **período académico activo**. Si la pantalla dice "No hay ningún período académico activo", avisá a Dirección Académica.
- La lista de profesores del día sale de los **días de clase** de cada cátedra. Si un profesor no aparece el día que le toca, revisá sus días en **Cátedras** (ver el manual de esa pantalla).

## Paso a paso
1. Entrá a **Asistencia → Carga diaria de asistencia**.
2. Si tenés más de una carrera o sede, elegí **Carrera — Sede**. Si tenés una sola, ya aparece elegida.
3. Elegí la **Fecha**. Solo se pueden elegir días dentro del período activo.
4. Tocá **Consultar**. Aparecen los profesores que tienen clase ese día.
5. Si casi todos vinieron, tocá **Todos presentes** y después cambiá solo a los que faltaron. (También existe **Todos ausentes**, para un día sin clases por algún motivo.)
6. Para cada profesor elegí el **Estado**: Presente, Ausente o Aus. Justificado.
7. Si faltó y otro profesor dio la clase, completá **Suplente / cobertura** ("¿Quién cubrió?") buscando por nombre.
8. Tocá **Guardar asistencia**. Tiene que aparecer "Se guardaron N registro(s)".

**Importante:** nada se guarda hasta tocar **Guardar asistencia**. Abajo se ve "N cambio(s) sin guardar"; si salís de la pantalla antes de guardar, esos cambios se pierden.

## Clases fuera de horario
Si un profesor recuperó una clase o dio clase virtual un día que no le toca:
1. Después de **Consultar**, usá **Agregar profesor fuera de horario** y buscalo por nombre.
2. Aparece en la lista con la marca **Fuera de horario**. Cargá su estado como a los demás.
3. Si lo agregaste por error, tocá **Quitar** antes de guardar.

Solo se pueden agregar profesores que tienen una cátedra en esa carrera y sede.

## Días sin clases
Si la fecha es feriado o día no hábil, aparece "No se puede registrar asistencia el …" con el motivo. Ese día no se carga nada.

## Corregir un día ya cargado
1. Elegí la misma carrera, sede y fecha, y tocá **Consultar**: aparece lo que ya se guardó.
2. Cambiá el estado o el suplente y tocá **Guardar asistencia**. Lo nuevo reemplaza lo anterior.

Un registro ya guardado no se puede volver a "Pendiente": cambialo al estado correcto. Si hay que borrarlo, pedilo a Dirección Académica.

## Dónde se ve lo cargado
- **Asistencia → Reporte de asistencia a clases**: la efectividad de cada docente en un rango de fechas.
- **Asistencia → Reemplazos**: las clases en que faltó el titular y quién lo cubrió.$m$, 0),

-- ------------------------------------------------------------
('/examenes/actas-firmas', 'Actas a firmar',
 'Ubicar cada acta de examen que un profesor tiene que firmar y marcar la firma.',
$m$## Para qué sirve
Muestra, por profesor, cada **acta de examen** que tiene que firmar en un llamado: como **Presidente** (titular de la cátedra) o como **Examinador** (vocal). Con el número de acta y la fecha del examen la ubicás rápido en el archivo, y a medida que el profesor firma, la marcás.

Ves solo las actas de tus carreras y sedes.

## Paso a paso: cuando viene un profesor a firmar
1. Entrá a **Consultas → Actas a firmar**.
2. En **Llamado**, elegí el llamado. Por defecto aparece el más reciente.
3. En **Profesor**, buscalo por **nombre o cédula**.
4. Aparece su lista de actas ordenada por número: **N° Acta**, fecha, sede, carrera, curso, materia y su **Rol** en esa mesa.
5. A medida que firma cada acta, tildá **Firmó**. Se guarda en el momento, no hace falta otro botón.
6. Si tildaste una por error, destildala.

## Qué muestra la lista
- **Mostrar** permite ver **Solo pendientes** (lo que viene elegido), **Todas** o **Solo firmadas**. Con "Solo pendientes", el acta que tildás desaparece de la lista: así queda a la vista solo lo que falta.
- Arriba se ven tres cifras: **Firmas pendientes**, **Firmadas** y **Firmas en total**, para el profesor y los filtros elegidos.
- Si tenés más de una sede o carrera, aparecen los filtros **Sede** y **Carrera**.
- Si un profesor es presidente y examinador en la misma mesa, aparece dos veces, pero firma **una sola vez**: al tildar una, se tildan las dos.

## Actas "sin N°"
Si un acta aparece con **sin N°** en rojo, todavía no fue numerada. Arriba se indica cuántas son. La numeración la hace Dirección Académica: avisá antes de entregarla.

## Imprimir
Tocá **Imprimir** para sacar el listado:
- Con un profesor elegido: su listado, para entregárselo o tenerlo a mano mientras firma.
- Con **Todos los profesores**: el listado completo del llamado, un bloque por profesor.

En la hoja impresa cada acta lleva ✓ si ya está firmada o ☐ si falta.$m$, 0),

-- ------------------------------------------------------------
('/examenes', 'Cargar las fechas de examen',
 'Elegir la fecha de examen de cada materia de tu carrera en un llamado abierto.',
$m$## Para qué sirve
En cada llamado (Ordinario, Complementario, Regularización) cada materia necesita una fecha de examen. En el **Ordinario** las fechas las carga la Secretaría de Carrera; en Complementario y Regularización normalmente las distribuye Dirección Académica.

## Abrir el llamado
1. Entrá a **Mesas → Llamados y fechas de examen**.
2. Cada llamado muestra su tipo, el rango de fechas, el **estado** y cuántas materias ya tienen fecha ("N de M con fecha").
3. Tocá **Abrir panel de fechas** en el llamado que corresponde.

Solo se pueden cargar fechas cuando el llamado está en **Asignación abierta**. Si está en Borrador, Aprobado o Cerrado, el panel aparece en modo consulta con un aviso en rojo. Para corregir un llamado ya aprobado hay que pedirle a Dirección Académica que lo reabra.

## El panel de fechas
Arriba se ve el rango del llamado y cuántas materias tienen fecha. Usá los filtros para trabajar por partes:
- **Sede**, **Curso**, **Sección**, **Materia** y **Profesor** (y **Carrera** si tenés más de una).
- **Solo sin fecha**: muestra solo lo que falta. Es la forma más rápida de completar.
- **Limpiar filtros** vuelve a mostrar todo.

## Elegir una fecha
1. En la fila de la materia, tocá el botón de **Fecha** ("Sin fecha ▾").
2. Se abre un calendario con el rango del llamado. Pasá de mes con ‹ y ›.
3. Tocá el día. **Se guarda solo**: debajo aparece "Guardando..." y después "Guardado ✓".
4. Para sacar una fecha, abrí el calendario y tocá **Quitar fecha**.

## Cómo leer el calendario
- **Días rayados en gris**: no se pueden elegir. Pasá el mouse por encima para ver el motivo: feriado o día no hábil, "El profesor no está disponible", o "El profesor ya tiene una mesa asignada" (en el Ordinario un profesor no puede tener dos mesas el mismo día).
- **Rayita roja debajo del número**: ese día ya hay otro examen del **mismo curso y sección**. Se puede elegir, pero conviene no juntar dos finales el mismo día.
- **Punto dorado arriba del número**: hay una propuesta automática, sin confirmar, para otra materia del mismo profesor. Si elegís ese día, la propuesta se libera.
- En **Complementario y Regularización**, cada materia solo puede rendirse el **día de la semana en que se dicta**. Si todos los días aparecen bloqueados con "La materia no tiene horario cargado", hay que cargar sus días de clase en **Cátedras**.

## Materias optativas
Las optativas de un mismo curso y sección se rinden **el mismo día**: al elegir la fecha de una, se aplica a todas. Lo indica la nota "Optativa: misma fecha que …". En las optativas se permite que el profesor tenga otra mesa ese día.

## Si algo falla
- Si una fecha no se puede guardar, el motivo aparece en rojo debajo de esa fila, con el botón **Reintentar**.
- Abajo se indica cuántas filas quedaron con error y está el botón **Reintentar N pendiente(s)**.
- Si se cerró la pestaña con fechas sin confirmar, al volver a abrir el panel se reintentan solas.
- "Choque: … No es optativa, se bloqueará al guardar" avisa que el profesor ya tiene otra mesa ese día: elegí otra fecha.

## Descargar e imprimir
- **Descargar CSV**: la lista de lo que estás viendo, para Excel.
- **Reporte para imprimir**: el horario de exámenes en formato para firmar y archivar.

## Después de cargar
Cuando Dirección Académica **aprueba** el llamado, cada profesor ve sus mesas en la consulta pública de Mis mesas. Hora y aula se muestran como información: no se cargan en esta pantalla.$m$, 0),

-- ------------------------------------------------------------
('/examenes/consulta-profesor', 'Consultar las mesas de un profesor',
 'Responderle a un profesor en qué mesas está y cuándo, en todas las carreras.',
$m$## Para qué sirve
Cuando un profesor pregunta cuándo le toca, esta pantalla muestra **todas sus mesas** del llamado vigente: como **Presidente** (titular de la cátedra) o como **Examinador**, en **todas las carreras y sedes**, no solo las tuyas.

## Paso a paso
1. Entrá a **Consultas → Mesas por profesor**.
2. Elegí el **Período Lectivo**.
3. En **Profesor**, buscalo por nombre o cédula.
4. Tocá **Consultar**.
5. Arriba aparecen las cifras: **Mesas en total**, **Como presidente** y **Como examinador**. Debajo, cada mesa con fecha, llamado, carrera, sede, curso, materia y rol.
6. Con **Descargar CSV** te llevás la lista para enviarla o imprimirla.

## Qué llamados se ven
Se muestra **solo el llamado vigente ya aprobado**, lo mismo que el profesor ve en Mis mesas. Mientras un llamado no está aprobado, sus fechas todavía pueden cambiar y no se muestran. Si aparece "Este profesor no tiene mesas en el llamado vigente", puede ser que no tenga mesas o que el llamado todavía no esté aprobado.

## El profesor también puede consultar solo
Cada profesor puede ver sus mesas sin usuario, en la página **Mis mesas** (la dirección del sistema terminada en /mis-mesas), escribiendo su número de cédula. Conviene recordárselo.$m$, 0),

-- ------------------------------------------------------------
('/plan-anual', 'Registrar la entrega del Plan Anual de Clases',
 'Marcar qué cátedras entregaron su plan anual y cuándo.',
$m$## Para qué sirve
La entrega del **Plan Anual de Clases** es el **20 % de "Planificación y documentación"** de la Foja de Desempeño. Acá se registra, cátedra por cátedra, la fecha en que el profesor lo entregó.

## Paso a paso
1. Entrá a **Cátedras → Plan Anual de Clases**.
2. Por defecto se muestra el período más reciente. Afiná con los filtros: **Sede**, **Carrera**, **Curso**, **Sección** y **Estado** (Pendientes o Entregados). También podés buscar por profesor, materia, carrera o sede.
3. Ubicá la cátedra. En **Fecha de entrega** aparece la fecha de hoy como sugerencia: cambiala si lo entregó otro día.
4. Si hace falta, escribí una **Observación** (por ejemplo, "entregó incompleto").
5. Tocá **Guardar** en esa fila. El estado pasa a **Entregado**.

La fecha que aparece antes de guardar es solo una sugerencia: la cátedra figura como **Pendiente** hasta que tocás **Guardar**.

Los filtros van en cadena: al cambiar la sede se limpian la carrera, el curso y la sección, para no quedar con combinaciones que no existen. **Limpiar filtros** los borra todos.

## Cuánto falta
Debajo de los filtros se ve el resumen de lo que estás mirando: cuántas cátedras hay, cuántas entregaron y cuántas están pendientes. Con **Estado: Pendientes** ves solo las que faltan.

## Constancia
**Ver constancia imprimible** genera la constancia de entregas por carrera y sede, con formato institucional, para firmar y archivar.$m$, 0),

-- ------------------------------------------------------------
('/catedras', 'Cátedras: cambiar el profesor y los días de clase',
 'Mantener al día quién dicta cada cátedra y qué días, para la asistencia y los exámenes.',
$m$## Para qué sirve
Cada cátedra es una materia en una sede y sección, con su profesor. Como Secretaría de Carrera podés:
- Cambiar el **profesor** (por ejemplo, cuando entra un reemplazante).
- Cargar los **días de clase**.
- Ver los indicadores y el reporte de contenido dictado.

Los **días de clase** son importantes: de ellos sale la lista de profesores de cada día en la **carga de asistencia**, y en Complementario y Regularización cada materia solo puede rendirse el día en que se dicta.

## Buscar una cátedra
Entrá a **Cátedras → Cátedras**. Usá **Buscar** (profesor, materia, carrera o sede) y los filtros **Periodo**, **Sede**, **Carrera**, **Curso** y **Sección**. La columna **Días** muestra los días de clase cargados; un guion (—) quiere decir que no tiene días cargados.

## Cambiar el profesor o los días de clase
1. Tocá **Editar** en la cátedra.
2. En **Profesor**, buscá al nuevo profesor por nombre.
3. En **Días de clase**, marcá los días (Lun a Vie). Tocá un día de nuevo para desmarcarlo.
4. Tocá **Guardar**, o **Cancelar** para no cambiar nada.

Antes de guardar, revisá que el profesor nuevo sea el correcto: desde ese momento, la asistencia, las mesas y la foja de esa cátedra quedan a su nombre.

## Otros botones
- **Indicadores**: los indicadores de la cátedra que se cargan a mano. Los carga Dirección Académica.
- **Reporte contenido**: el avance del contenido programático dictado.
- **Eliminar**: borra la cátedra **y sus indicadores cargados**. Pide confirmación y no se puede deshacer: usalo solo si la cátedra se creó por error.

Para crear cátedras nuevas, cambiar la materia, la sede o la sección, o marcar una cátedra como exenta de exámenes, pedilo a Dirección Académica.$m$, 0)

) as v(pantalla, titulo, resumen, contenido, orden)
where not exists (
  select 1 from manual m where m.pantalla = v.pantalla and m.titulo = v.titulo
);

select registrar_migracion('manuales_secretaria_carrera.sql');
