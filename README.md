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
4. En **Authentication → Users**, crear (o ubicar) el usuario administrador — no requiere ninguna fila extra en
   ninguna tabla de roles, alcanza con estar autenticado.

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
2. Crear el archivo `.env` (ver `.env.example`):

```env
VITE_SUPABASE_URL=tu-url-de-supabase
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

3. Iniciar en desarrollo: `npm run dev`

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

src/
  components/            Layout, PrivateRoute
  contexts/               AuthContext (sesión, sin roles — uso exclusivo admin)
  lib/                    Cliente de Supabase, helpers de CSV
  pages/
    Home.jsx              Portal con los 6 módulos
    Catedras.jsx           CRUD de cátedras (alta, edición inline, baja)
    CargarIndicadores.jsx  Formulario de carga por cátedra (objetivos + manuales + encuesta)
    FojaDesempeno.jsx      Reporte imprimible por cátedra
    InformesConsolidados.jsx
    ImportarDatos.jsx      9 pestañas de importación CSV
    Configuracion/         Sedes, Carreras, Asignaturas (CRUD completo), Profesores (CRUD completo), Criterios
```
