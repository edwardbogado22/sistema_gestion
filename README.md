# Sistema de Evaluación Docente — FCE UNE

Aplicación web del Programa de Evaluación y Acompañamiento Docente de la Facultad de Ciencias Económicas
(Universidad Nacional del Este). Construida con React 19 + Vite + Supabase, sobre un esquema de base de datos
**preexistente** (no generado por esta app).

## Modelo de evaluación

La "Foja de Desempeño" oficial de cada cátedra se arma con **17 criterios en 2 bloques**:

- **Criterios Institucionales** (6 ítems, 80%): 3 se calculan solos a partir de datos objetivos cargados por
  cátedra (asistencia a clases + cumplimiento de contenido → 30%; asistencia a mesas examinadoras → 10%;
  asistencia a reuniones → 10%) y los otros 3 se cargan a mano (planificación 20%, capacitaciones 5%,
  actividades de competencias 5%).
- **Indicadores de Valoración de Alumnos** (11 ítems, 2% cada uno = 22%): se carga una calificación 1-5 por
  ítem (encuesta a estudiantes) y el sistema la convierte a porcentaje de su peso.
- El total no se normaliza a 100% (queda en 102% como máximo posible); la clasificación final es
  Sobresaliente (≥90%), Satisfactorio (≥75%) o Requiere Plan de Mejora (si no).

Todo esto se define en `criterios_evaluacion` por `periodo_lectivo` y se administra desde
**Configuración → Criterios de Evaluación**.

## Roles

- **ADMIN** (Dirección Académica): control absoluto, acceso a todo el sistema.
- **SECRETARIO** (Secretaría de Carrera): solo ve las carreras y sedes que tenga asignadas en
  `usuario_alcance`. Puede cargar fechas de examen de sus materias; el resto es lectura.
- **DIRECTOR** (Dirección de Carrera): mismo mecanismo de alcance que el secretario (normalmente con
  `sede_id` null, para ver todas las sedes de su carrera), pero es de solo lectura — audita el estado de
  las cátedras, no carga fechas de examen ni disponibilidad de profesores
  (`supabase/migracion_rol_director.sql`).

El alcance es dato, no código: se administra desde **Configuración → Usuarios**. La restricción real está en
las políticas de RLS (`supabase/migracion_roles_alcance.sql`), no en el frontend — la `anon key` viaja en el
navegador, así que esconder botones no restringe nada.

## Mesas examinadoras

Módulo de fechas de examen y asistencia a mesas (`supabase/migracion_mesas_examinadoras.sql`):

1. El admin crea un **llamado** (Ordinario / Complementario / Regularización) con su rango de fechas.

   Los feriados **no** se cargan por llamado: viven en `dia_no_habil`, un calendario institucional
   permanente que se administra desde **Configuración → Días no hábiles** y vale para todos los llamados.
   Los de fecha fija (8 de diciembre, Virgen de Caacupé) se cargan una vez como recurrentes y aplican todos
   los años; los móviles (Semana Santa), con la fecha de cada año. Los domingos son un flag del llamado
   (`excluye_domingos`), no 52 filas. Cada llamado puede sumar bloqueos puntuales propios.
2. Las propuestas de los alumnos llegan a Secretaría en una **proforma firmada, en papel**; el secretario la
   transcribe al asignar la fecha. No hay cuentas de estudiante.
3. En Complementario y Regularización no hay proforma: `examen_distribuir()` reparte las materias entre los
   días hábiles evitando que un curso tenga dos exámenes el mismo día, que un profesor quede en dos mesas a
   la vez, y respetando `profesor_no_disponible`. El día no es fijo — se combina según carga horaria y
   disponibilidad de cada docente.
4. `examen_aprobar()` congela el horario y genera las mesas con su titular.
5. `recalcular_asistencia_mesas()` consolida la asistencia **por profesor** y escribe ese mismo resultado en
   todas sus cátedras, alimentando el criterio del 10% de la Foja de Desempeño sin carga manual.

El rango y los días bloqueados se validan en un trigger (`examen_fecha_validar`), no en React: la regla se
cumple aunque alguien llame la API REST directamente. El calendario de la UI es una comodidad, no la defensa.
`dia_bloqueado()` devuelve el motivo y no un booleano, para que el error diga "No se puede tomar examen el
08/12/2026: Día de la Virgen de Caacupé".

Si se agrega un feriado después de haber cargado fechas, `v_examen_fechas_invalidas` lista los exámenes que
quedaron en días bloqueados. No se borran solos: aparecen como aviso en Configuración → Días no hábiles.

Secretaría puede imprimir la **constancia de carga** con formato institucional desde el panel, para presentar
el resultado de su trabajo.

## Funcionalidades

- **Autenticación** con Supabase Auth (uso exclusivo de Dirección Académica, sin autoservicio docente).
- **Cátedras**: alta/edición de profesor + asignatura + sede + periodo + sección.
- **Cargar Indicadores**: por cátedra, carga de los datos objetivos, los criterios manuales y la encuesta de
  alumnos.
- **Foja de Desempeño**: reporte imprimible por cátedra, con el mismo formato del documento oficial.
- **Informes Consolidados**: rendimiento promedio por carrera, por sede y ranking de profesores.
- **Importar Datos**: carga masiva por CSV (asignaturas, profesores, cátedras, y los indicadores/criterios por
  cátedra), con plantillas descargables y validación previa fila por fila.
- **Configuración**: sedes, carreras, asignaturas, profesores y criterios de evaluación.

## Requisitos

- Node.js 18+
- El proyecto Supabase ya configurado (`.env`) con el esquema real de este dominio (`sedes`, `carreras`,
  `asignaturas`, `profesores`, `catedras`, `criterios_evaluacion`, `asistencia_clases`,
  `cumplimiento_contenido`, `asistencia_mesas_examinadoras`, `asistencia_reuniones`, y
  `evaluacion_criterio_catedra`).

## Base de datos

Este proyecto **no crea el esquema** (ya existe). `supabase/policies.sql` aplica lo que falta sobre ese esquema
real:

1. Políticas RLS de lectura/escritura para el rol `authenticated` (hoy solo hay 3 políticas de solo lectura;
   sin esto no se puede cargar ni editar nada).
2. Constraints únicas aditivas para poder hacer `upsert` por cátedra.
3. Altera `criterios_evaluacion` (agrega `grupo`, `orden`, `origen`; el `codigo` pasa de enum a texto) y carga
   los 17 criterios oficiales para el periodo `2026` (desactiva, sin borrar, los 5 indicadores viejos).
4. Crea la tabla `evaluacion_criterio_catedra` (guarda los criterios manuales y de encuesta por cátedra).
5. Crea la vista `v_evaluacion_docente_detalle` (reemplaza a `v_reporte_rendimiento_docente`), que resuelve el
   % obtenido de cada criterio por cátedra — el frontend arma subtotales/total/clasificación sobre esta vista.

Pasos:

1. Abrir el SQL Editor del proyecto Supabase.
2. Pegar y ejecutar todo el contenido de `supabase/policies.sql`.
3. Pegar y ejecutar todo el contenido de `supabase/migracion_asistencia_reuniones.sql` (crea `asistencia_reuniones`
   y convierte el criterio "Participación institucional" en % objetivo de asistencia a reuniones en vez de
   puntaje manual).
4. En **Authentication → Users**, crear (o ubicar) el usuario administrador.
5. Editar el paso 4 de `supabase/migracion_roles_alcance.sql` con el email de ese usuario y ejecutar el
   archivo completo. **Si el email no coincide con ninguno, el script aborta a propósito**: sin un ADMIN
   cargado, las políticas nuevas dejarían a todos afuera del sistema.
6. Ejecutar `supabase/migracion_mesas_examinadoras.sql` y después `supabase/migracion_dias_no_habiles.sql`.

## Self-hosted: probar o crear un nuevo proyecto en un servidor propio

Este repo se puede reusar para levantar instancias independientes (otra facultad,
otro periodo, un entorno de pruebas) sin depender de Supabase Cloud, usando
Supabase self-hosted (Docker) en cualquier servidor Linux. Cada instancia levanta
**su propio Postgres en un contenedor**, aislado de cualquier otro Postgres o
servicio que ya corra en ese servidor.

Scripts en `supabase/self-hosted/` (requieren Docker; se instala solo si falta):

```bash
# 1) Levantar el stack (Kong/Auth/PostgREST/Studio/Postgres propio)
./supabase/self-hosted/install.sh <nombre-carpeta> <ip-o-host> <puerto-http>
# Ejemplo: ./supabase/self-hosted/install.sh supabase-eval-docente 192.168.1.170 8001

# 2) Cargar el esquema completo de esta app
./supabase/self-hosted/apply-schema.sh <nombre-carpeta> supabase/schema.sql

# 3) Crear el usuario administrador
./supabase/self-hosted/create-admin.sh <nombre-carpeta> admin@ejemplo.com "contraseña"
```

Con eso, `<nombre-carpeta>/.env` ya tiene `SUPABASE_PUBLIC_URL` y `ANON_KEY` —
copiarlos a un `.env.local` en la raíz del proyecto React (Vite lo prioriza sobre
`.env`) para apuntar la app a esa instancia sin tocar la config de producción:

```env
VITE_SUPABASE_URL=http://<ip-o-host>:<puerto-http>
VITE_SUPABASE_ANON_KEY=<ANON_KEY del .env generado>
```

Si el servidor ya tiene otro Postgres nativo o corre otra app en el mismo puerto
(por ejemplo Nextcloud en 8080), `install.sh` avisa qué variables de `.env`
revisar antes de levantar el stack (`POSTGRES_PORT`, `POOLER_PROXY_PORT_TRANSACTION`)
para no pisar nada existente.

`supabase/schema.sql` reconstruye el esquema completo (12 tablas base + las
migraciones de este repo + la vista `v_evaluacion_docente_detalle`) de una sola
vez — no hace falta correr `policies.sql`, `carreras_sedes.sql`, etc. por
separado en una instalación nueva.

## Configuración del proyecto

1. Instalar dependencias: `npm install`
2. Crear el archivo `.env.local` con la anon key (ver `.env.example`):

```env
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

El cliente arma la URL de Supabase como `${window.location.origin}/supabase` — no hace falta
`VITE_SUPABASE_URL`. `npm run dev` proxea `/supabase` al dominio de Tailscale (ver `vite.config.js`), así que
funciona desde cualquier máquina, esté o no en la LAN de la facultad.

3. Iniciar en desarrollo: `npm run dev`

## Despliegue (server-fce)

En producción, `nginx` sirve el build y hace de proxy de `/supabase/` hacia el gateway real de Supabase — así
el mismo build funciona sin importar el dominio/IP desde el que entre cada usuario (ver
`src/lib/supabase.js` y el comentario en `vite.config.js`).

En el servidor (`server-fce`, `192.168.1.170`), carpeta `~/sistema-gestion` (clon de este repo):

```bash
cd ~/sistema-gestion
git pull
echo "VITE_SUPABASE_ANON_KEY=<anon key>" > .env.production.local   # solo la primera vez
npm run build
rsync -a --delete dist/ ~/eval-docente-fix/html/
sudo docker exec eval-docente-web nginx -s reload
```

El contenedor `eval-docente-web` (nginx:alpine, puerto 8002, el que Tailscale Funnel expone) está montado por
bind mount sobre `~/eval-docente-fix/html` y `~/eval-docente-fix/default.conf` — los nombres de carpeta no
coinciden con el del contenedor porque `eval-docente-fix` fue el fix del problema de IP privada y terminó
siendo el que quedó en pie. `rsync` actualiza los archivos al instante (sin rebuildear la imagen); el
`nginx -s reload` es solo para que nginx no sirva nada cacheado en memoria.

## Scripts

| Comando            | Descripción                   |
| ------------------- | ------------------------------ |
| `npm run dev`       | Servidor de desarrollo (Vite)  |
| `npm run build`     | Build de producción            |
| `npm run preview`   | Previsualizar el build         |
| `npm run lint`      | Lint de ESLint                 |

## Estructura

```
supabase/policies.sql                       RLS + constraints + ajustes de criterios_evaluacion + tabla y vista nuevas
supabase/migracion_asistencia_reuniones.sql Tabla asistencia_reuniones + criterio de reuniones pasa a % objetivo
supabase/migracion_roles_alcance.sql        Roles ADMIN/SECRETARIO, alcance por carrera+sede, RLS real
supabase/migracion_mesas_examinadoras.sql   Llamados, fechas de examen, mesas y recálculo del 10%
supabase/migracion_dias_no_habiles.sql      Calendario institucional de feriados (bloqueo permanente)

src/
  components/            Layout, PrivateRoute, BuscadorSelect, CalendarioRango
  contexts/               AuthContext (sesión, rol y alcance)
  lib/                    Cliente de Supabase, helpers de CSV y de fechas
  pages/
    Examenes/             Llamados (admin), PanelFechas (secretaría), ReporteCarga (imprimible)
    Home.jsx              Portal con los 6 módulos
    Catedras.jsx           CRUD de cátedras (alta, edición inline, baja)
    CargarIndicadores.jsx  Formulario de carga por cátedra (objetivos + manuales + encuesta)
    FojaDesempeno.jsx      Reporte imprimible por cátedra
    InformesConsolidados.jsx
    ImportarDatos.jsx      9 pestañas de importación CSV
    Configuracion/         Sedes, Carreras, Asignaturas (CRUD completo), Profesores (CRUD completo), Criterios
```
