import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { PrivateRoute } from './components/PrivateRoute'
import { Layout } from './components/Layout'

const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })))
const Home = lazy(() => import('./pages/Home').then((m) => ({ default: m.Home })))
const Catedras = lazy(() => import('./pages/Catedras').then((m) => ({ default: m.Catedras })))
const CargarIndicadores = lazy(() => import('./pages/CargarIndicadores').then((m) => ({ default: m.CargarIndicadores })))
const FojaDesempeno = lazy(() => import('./pages/FojaDesempeno').then((m) => ({ default: m.FojaDesempeno })))
const InformesConsolidados = lazy(() =>
  import('./pages/InformesConsolidados').then((m) => ({ default: m.InformesConsolidados })),
)
const ImportarDatos = lazy(() => import('./pages/ImportarDatos').then((m) => ({ default: m.ImportarDatos })))
const Configuracion = lazy(() => import('./pages/Configuracion').then((m) => ({ default: m.Configuracion })))
const Sedes = lazy(() => import('./pages/Configuracion/Sedes').then((m) => ({ default: m.Sedes })))
const Carreras = lazy(() => import('./pages/Configuracion/Carreras').then((m) => ({ default: m.Carreras })))
const Asignaturas = lazy(() => import('./pages/Configuracion/Asignaturas').then((m) => ({ default: m.Asignaturas })))
const Profesores = lazy(() => import('./pages/Configuracion/Profesores').then((m) => ({ default: m.Profesores })))
const Criterios = lazy(() => import('./pages/Configuracion/Criterios').then((m) => ({ default: m.Criterios })))
const Usuarios = lazy(() => import('./pages/Configuracion/Usuarios').then((m) => ({ default: m.Usuarios })))
const Migraciones = lazy(() => import('./pages/Configuracion/Migraciones').then((m) => ({ default: m.Migraciones })))
const DiasNoHabiles = lazy(() =>
  import('./pages/Configuracion/DiasNoHabiles').then((m) => ({ default: m.DiasNoHabiles })),
)
const Llamados = lazy(() => import('./pages/Examenes/Llamados').then((m) => ({ default: m.Llamados })))
const PanelFechas = lazy(() => import('./pages/Examenes/PanelFechas').then((m) => ({ default: m.PanelFechas })))
const ReporteCarga = lazy(() => import('./pages/Examenes/ReporteCarga').then((m) => ({ default: m.ReporteCarga })))
const SeguimientoCarga = lazy(() =>
  import('./pages/Examenes/SeguimientoCarga').then((m) => ({ default: m.SeguimientoCarga })),
)
const AsignacionVocales = lazy(() =>
  import('./pages/Examenes/AsignacionVocales').then((m) => ({ default: m.AsignacionVocales })),
)
const ReporteMesas = lazy(() => import('./pages/Examenes/ReporteMesas').then((m) => ({ default: m.ReporteMesas })))
const CargaProfesores = lazy(() =>
  import('./pages/Examenes/CargaProfesores').then((m) => ({ default: m.CargaProfesores })),
)
const AsistenciaMesas = lazy(() =>
  import('./pages/Examenes/AsistenciaMesas').then((m) => ({ default: m.AsistenciaMesas })),
)
const ConsultaProfesor = lazy(() =>
  import('./pages/Examenes/ConsultaProfesor').then((m) => ({ default: m.ConsultaProfesor })),
)
const NumeracionActas = lazy(() =>
  import('./pages/Examenes/NumeracionActas').then((m) => ({ default: m.NumeracionActas })),
)
const ActasFirmas = lazy(() => import('./pages/Examenes/ActasFirmas').then((m) => ({ default: m.ActasFirmas })))
const Periodos = lazy(() => import('./pages/Configuracion/Periodos').then((m) => ({ default: m.Periodos })))
const RegistrarAsistencia = lazy(() =>
  import('./pages/Asistencia/RegistrarAsistencia').then((m) => ({ default: m.RegistrarAsistencia })),
)
const ReporteAsistencia = lazy(() =>
  import('./pages/Asistencia/ReporteAsistencia').then((m) => ({ default: m.ReporteAsistencia })),
)
const Reemplazos = lazy(() => import('./pages/Asistencia/Reemplazos').then((m) => ({ default: m.Reemplazos })))
const RegistrarAsistenciaEvento = lazy(() =>
  import('./pages/Eventos/RegistrarAsistenciaEvento').then((m) => ({ default: m.RegistrarAsistenciaEvento })),
)
const Eventos = lazy(() => import('./pages/Eventos/Eventos').then((m) => ({ default: m.Eventos })))
const BusquedaAsistenciaEvento = lazy(() =>
  import('./pages/Eventos/BusquedaAsistenciaEvento').then((m) => ({ default: m.BusquedaAsistenciaEvento })),
)
const ReporteEventos = lazy(() => import('./pages/Eventos/ReporteEventos').then((m) => ({ default: m.ReporteEventos })))
const CapacitacionResultados = lazy(() =>
  import('./pages/Eventos/CapacitacionResultados').then((m) => ({ default: m.CapacitacionResultados })),
)
const MisRegistrosEvento = lazy(() =>
  import('./pages/Eventos/MisRegistrosEvento').then((m) => ({ default: m.MisRegistrosEvento })),
)
const PlanAnual = lazy(() => import('./pages/PlanAnual').then((m) => ({ default: m.PlanAnual })))
const ContenidoKiosco = lazy(() => import('./pages/ContenidoKiosco').then((m) => ({ default: m.ContenidoKiosco })))
const ReporteContenidoProgramatico = lazy(() =>
  import('./pages/ReporteContenidoProgramatico').then((m) => ({ default: m.ReporteContenidoProgramatico })),
)
const MisMesas = lazy(() => import('./pages/MisMesas').then((m) => ({ default: m.MisMesas })))
const ReportePlanAnual = lazy(() =>
  import('./pages/ReportePlanAnual').then((m) => ({ default: m.ReportePlanAnual })),
)
const EmisionFojas = lazy(() => import('./pages/EmisionFojas').then((m) => ({ default: m.EmisionFojas })))

// Secciones exclusivas de Dirección Académica. La restricción real está en
// las policies de RLS; esto evita ofrecer pantallas que no van a funcionar.
const ADMIN = ['ADMIN']
const ADMIN_ASISTENTE = ['ADMIN', 'ASISTENTE']
const GESTION = ['ADMIN', 'SECRETARIO', 'DIRECTOR']
// Secretaría de Dirección Académica: consulta, impresión y reportes.
const SA = 'SECRETARIA_ACADEMICA'
const REPORTES = ['ADMIN', SA]
const REPORTES_DIRECTOR = ['ADMIN', 'DIRECTOR', SA]
const GESTION_SA = [...GESTION, SA]

function withLayout(element) {
  return <Layout>{element}</Layout>
}

function App() {
  return (
    <Suspense fallback={<div className="page-padding">Cargando...</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Pública a propósito: los profesores entran sin usuario desde el enlace del canal. */}
        <Route path="/mis-mesas" element={<MisMesas />} />

        <Route path="/" element={<PrivateRoute>{withLayout(<Home />)}</PrivateRoute>} />

        <Route path="/catedras" element={<PrivateRoute>{withLayout(<Catedras />)}</PrivateRoute>} />
        <Route
          path="/indicadores/:catedraId"
          element={<PrivateRoute>{withLayout(<CargarIndicadores />)}</PrivateRoute>}
        />
        <Route
          path="/foja/:catedraId"
          element={<PrivateRoute roles={REPORTES_DIRECTOR}>{withLayout(<FojaDesempeno />)}</PrivateRoute>}
        />

        <Route path="/examenes" element={<PrivateRoute>{withLayout(<Llamados />)}</PrivateRoute>} />
        <Route
          path="/examenes/seguimiento"
          element={<PrivateRoute roles={REPORTES}>{withLayout(<SeguimientoCarga />)}</PrivateRoute>}
        />
        <Route
          path="/examenes/consulta-profesor"
          element={<PrivateRoute roles={REPORTES}>{withLayout(<ConsultaProfesor />)}</PrivateRoute>}
        />
        <Route
          path="/examenes/actas-firmas"
          element={<PrivateRoute roles={GESTION_SA}>{withLayout(<ActasFirmas />)}</PrivateRoute>}
        />
        <Route path="/examenes/:llamadoId" element={<PrivateRoute>{withLayout(<PanelFechas />)}</PrivateRoute>} />
        <Route
          path="/examenes/:llamadoId/reporte"
          element={<PrivateRoute>{withLayout(<ReporteCarga />)}</PrivateRoute>}
        />
        <Route
          path="/examenes/:llamadoId/vocales"
          element={<PrivateRoute roles={ADMIN}>{withLayout(<AsignacionVocales />)}</PrivateRoute>}
        />
        <Route
          path="/examenes/:llamadoId/mesas-reporte"
          element={<PrivateRoute roles={REPORTES}>{withLayout(<ReporteMesas />)}</PrivateRoute>}
        />
        <Route
          path="/examenes/:llamadoId/carga-profesores"
          element={<PrivateRoute roles={REPORTES}>{withLayout(<CargaProfesores />)}</PrivateRoute>}
        />
        <Route
          path="/examenes/:llamadoId/actas"
          element={<PrivateRoute roles={ADMIN}>{withLayout(<NumeracionActas />)}</PrivateRoute>}
        />
        <Route
          path="/examenes/:llamadoId/asistencia-mesas"
          element={<PrivateRoute roles={REPORTES}>{withLayout(<AsistenciaMesas />)}</PrivateRoute>}
        />

        <Route path="/asistencia" element={<PrivateRoute>{withLayout(<RegistrarAsistencia />)}</PrivateRoute>} />
        <Route
          path="/asistencia/reporte"
          element={<PrivateRoute>{withLayout(<ReporteAsistencia />)}</PrivateRoute>}
        />
        <Route
          path="/asistencia/reemplazos"
          element={<PrivateRoute>{withLayout(<Reemplazos />)}</PrivateRoute>}
        />

        <Route
          path="/eventos"
          element={<PrivateRoute roles={ADMIN_ASISTENTE}>{withLayout(<RegistrarAsistenciaEvento />)}</PrivateRoute>}
        />
        <Route path="/eventos/gestion" element={<PrivateRoute roles={ADMIN}>{withLayout(<Eventos />)}</PrivateRoute>} />
        <Route
          path="/eventos/busqueda"
          element={<PrivateRoute roles={REPORTES}>{withLayout(<BusquedaAsistenciaEvento />)}</PrivateRoute>}
        />
        <Route
          path="/eventos/reporte"
          element={<PrivateRoute roles={REPORTES}>{withLayout(<ReporteEventos />)}</PrivateRoute>}
        />
        <Route
          path="/eventos/capacitaciones"
          element={<PrivateRoute roles={REPORTES}>{withLayout(<CapacitacionResultados />)}</PrivateRoute>}
        />
        <Route
          path="/eventos/mis-registros"
          element={<PrivateRoute roles={ADMIN_ASISTENTE}>{withLayout(<MisRegistrosEvento />)}</PrivateRoute>}
        />

        <Route path="/plan-anual" element={<PrivateRoute>{withLayout(<PlanAnual />)}</PrivateRoute>} />
        <Route
          path="/plan-anual/reporte"
          element={<PrivateRoute>{withLayout(<ReportePlanAnual />)}</PrivateRoute>}
        />

        <Route path="/contenido/kiosco" element={<PrivateRoute><ContenidoKiosco /></PrivateRoute>} />
        <Route
          path="/contenido/reporte/:catedraId"
          element={<PrivateRoute>{withLayout(<ReporteContenidoProgramatico />)}</PrivateRoute>}
        />

        <Route
          path="/informes"
          element={<PrivateRoute roles={REPORTES_DIRECTOR}>{withLayout(<InformesConsolidados />)}</PrivateRoute>}
        />
        <Route
          path="/fojas/emision"
          element={<PrivateRoute roles={REPORTES}>{withLayout(<EmisionFojas />)}</PrivateRoute>}
        />
        <Route
          path="/profesores"
          element={<PrivateRoute roles={[SA]}>{withLayout(<Profesores />)}</PrivateRoute>}
        />
        <Route
          path="/importar"
          element={<PrivateRoute roles={ADMIN}>{withLayout(<ImportarDatos />)}</PrivateRoute>}
        />

        <Route
          path="/configuracion"
          element={<PrivateRoute roles={ADMIN}>{withLayout(<Configuracion />)}</PrivateRoute>}
        >
          <Route index element={<Navigate to="sedes" replace />} />
          <Route path="sedes" element={<Sedes />} />
          <Route path="carreras" element={<Carreras />} />
          <Route path="asignaturas" element={<Asignaturas />} />
          <Route path="profesores" element={<Profesores />} />
          <Route path="criterios" element={<Criterios />} />
          <Route path="dias-no-habiles" element={<DiasNoHabiles />} />
          <Route path="periodos" element={<Periodos />} />
          <Route path="usuarios" element={<Usuarios />} />
          <Route path="migraciones" element={<Migraciones />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
