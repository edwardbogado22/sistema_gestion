// Mapa único de la aplicación: de acá salen el menú de la barra superior
// y las tarjetas del inicio, para que una pantalla nueva aparezca en los
// dos lados con solo agregarla una vez.
//
// `roles` es solo para no ofrecer pantallas que no van a funcionar: la
// restricción real sigue estando en las rutas de App.jsx y en las policies
// de RLS, y tiene que coincidir con lo que diga acá.
const GESTION = ['ADMIN', 'SECRETARIO', 'DIRECTOR']
const ADMIN = ['ADMIN']
const ADMIN_ASISTENTE = ['ADMIN', 'ASISTENTE']
const ADMIN_DIRECTOR = ['ADMIN', 'DIRECTOR']

export const AREAS = [
  {
    id: 'catedras',
    titulo: 'Cátedras y evaluación',
    corto: 'Cátedras',
    // Pantallas que se abren desde una cátedra puntual y no tienen entrada
    // propia en el menú, pero pertenecen a esta área.
    prefijos: ['/indicadores', '/foja', '/contenido'],
    items: [
      {
        to: '/catedras',
        icon: '📋',
        titulo: 'Cátedras',
        desc: 'Listado, alta y edición. Desde cada cátedra se cargan los indicadores, se ve el contenido dictado y se imprime la foja de desempeño.',
        destacada: true,
      },
      {
        to: '/plan-anual',
        icon: '📘',
        titulo: 'Plan Anual de Clases',
        desc: 'Registro por cátedra de la entrega del plan anual. Aporta al 20% de "Planificación y documentación" en la Foja de Desempeño.',
      },
      {
        to: '/plan-anual/reporte',
        icon: '📄',
        titulo: 'Constancia de Plan Anual',
        desc: 'Entregas registradas por carrera y sede, con formato institucional para evidenciar el trabajo de Secretaría.',
      },
      {
        to: '/contenido/kiosco',
        icon: '🖥️',
        titulo: 'Kiosco de Contenido Programático',
        desc: 'El profesor se identifica por cédula y tilda los subtemas dictados. Alimenta el % de cumplimiento de contenido.',
      },
    ],
  },
  {
    id: 'asistencia',
    titulo: 'Asistencia a clases',
    corto: 'Asistencia',
    items: [
      {
        to: '/asistencia',
        icon: '🗓️',
        titulo: 'Carga diaria de asistencia',
        desc: 'Carga diaria de asistencia a clases por carrera y sede, con suplencias.',
        destacada: true,
      },
      {
        to: '/asistencia/reporte',
        icon: '📊',
        titulo: 'Reporte de asistencia a clases',
        desc: 'Efectividad por docente en un rango de fechas, exportable e imprimible.',
      },
      {
        to: '/asistencia/reemplazos',
        icon: '🔄',
        titulo: 'Reemplazos',
        desc: 'Clases donde el titular faltó y otro profesor cubrió su lugar.',
      },
    ],
  },
  {
    id: 'mesas',
    titulo: 'Mesas examinadoras',
    corto: 'Mesas',
    items: [
      {
        to: '/examenes',
        icon: '🗓️',
        titulo: 'Llamados y fechas de examen',
        desc: 'Llamados, rango de fechas habilitado y fecha de examen por materia. Desde cada llamado: vocales, reporte y asistencia a mesas.',
        destacada: true,
      },
      {
        to: '/examenes/seguimiento',
        icon: '📈',
        titulo: 'Seguimiento de carga',
        desc: 'Progreso de carga de fechas por secretario, carrera y sede, para revisar cómo va Secretaría.',
        roles: ADMIN,
      },
    ],
  },
  {
    id: 'eventos',
    titulo: 'Eventos y capacitaciones',
    corto: 'Eventos',
    items: [
      {
        to: '/eventos',
        icon: '🪪',
        titulo: 'Check-in de evento',
        desc: 'Check-in por documento de identidad a reuniones docentes y capacitaciones.',
        destacada: true,
        roles: ADMIN_ASISTENTE,
      },
      {
        to: '/eventos/mis-registros',
        icon: '🧾',
        titulo: 'Mis registros',
        desc: 'Últimos check-in que registraste vos. Podés deshacer uno si te equivocaste.',
        roles: ADMIN_ASISTENTE,
      },
      {
        to: '/eventos/gestion',
        icon: '📅',
        titulo: 'Gestión de eventos',
        desc: 'Crear, editar y activar/desactivar eventos. Agrupalos para que contar asistencia a cualquiera cuente como presente.',
        roles: ADMIN,
      },
      {
        to: '/eventos/reporte',
        icon: '📊',
        titulo: 'Reporte de asistencia a eventos',
        desc: 'Matriz de asistencia por evento o grupo de eventos, exportable e imprimible.',
        roles: ADMIN,
      },
      {
        to: '/eventos/capacitaciones',
        icon: '🎓',
        titulo: 'Resultados de capacitación',
        desc: 'Aprobado o participación parcial por profesor, una vez sale la resolución del examen.',
        roles: ADMIN,
      },
    ],
  },
  {
    id: 'consultas',
    titulo: 'Consultas e informes',
    corto: 'Consultas',
    items: [
      {
        to: '/examenes/consulta-profesor',
        icon: '🔎',
        titulo: 'Mesas por profesor',
        desc: 'Buscar un profesor por cédula o nombre y ver todas las mesas examinadoras en las que participa en el año.',
        destacada: true,
        roles: ADMIN,
      },
      {
        to: '/examenes/actas-firmas',
        icon: '✍️',
        titulo: 'Actas a firmar',
        desc: 'Buscar un profesor por nombre o cédula y ver cada acta de examen que tiene que firmar, con número y fecha. Se marca la firma y se imprime el listado.',
        roles: GESTION,
      },
      {
        to: '/eventos/busqueda',
        icon: '🔍',
        titulo: 'Eventos por profesor',
        desc: 'Buscar un docente por documento o nombre y ver su historial de asistencia a eventos.',
        roles: ADMIN,
      },
      {
        to: '/informes',
        icon: '📈',
        titulo: 'Informes consolidados',
        desc: 'Rendimiento promedio por carrera, por sede y ranking de profesores.',
        roles: ADMIN_DIRECTOR,
      },
    ],
  },
  {
    id: 'administracion',
    titulo: 'Administración',
    corto: 'Administración',
    items: [
      {
        to: '/importar',
        icon: '📥',
        titulo: 'Importar datos',
        desc: 'Carga masiva por CSV de asignaturas, profesores, cátedras e indicadores.',
        roles: ADMIN,
      },
      {
        to: '/configuracion',
        icon: '⚙️',
        titulo: 'Configuración',
        desc: 'Sedes, carreras, asignaturas, profesores, criterios de evaluación y usuarios.',
        roles: ADMIN,
      },
    ],
  },
]

// Áreas con al menos una pantalla disponible para el rol; las que quedan
// vacías directamente no se muestran.
export function areasVisibles(rol) {
  return AREAS.map((area) => ({
    ...area,
    items: area.items.filter((item) => (item.roles || GESTION).includes(rol)),
  })).filter((area) => area.items.length > 0)
}

const coincide = (pathname, prefijo) => pathname === prefijo || pathname.startsWith(`${prefijo}/`)

// Pantalla del menú que corresponde a la ruta actual: gana el prefijo más
// largo, así /examenes/consulta-profesor no se confunde con /examenes.
export function itemActivo(pathname) {
  let mejor = null
  for (const area of AREAS) {
    for (const item of area.items) {
      if (coincide(pathname, item.to) && (!mejor || item.to.length > mejor.to.length)) mejor = item
    }
  }
  return mejor
}

export function areaActiva(pathname) {
  const item = itemActivo(pathname)
  const porItem = item && AREAS.find((area) => area.items.includes(item))
  const porPrefijo = AREAS.find((area) => (area.prefijos || []).some((p) => coincide(pathname, p)))
  // /contenido/kiosco es item propio; /contenido/reporte/:id solo matchea
  // por prefijo. En ambos casos el área es la misma.
  return (porItem || porPrefijo)?.id ?? null
}
