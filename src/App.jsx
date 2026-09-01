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
const DiasNoHabiles = lazy(() =>
  import('./pages/Configuracion/DiasNoHabiles').then((m) => ({ default: m.DiasNoHabiles })),
)
const Llamados = lazy(() => import('./pages/Examenes/Llamados').then((m) => ({ default: m.Llamados })))
const PanelFechas = lazy(() => import('./pages/Examenes/PanelFechas').then((m) => ({ default: m.PanelFechas })))
const ReporteCarga = lazy(() => import('./pages/Examenes/ReporteCarga').then((m) => ({ default: m.ReporteCarga })))
const SeguimientoCarga = lazy(() =>
  import('./pages/Examenes/SeguimientoCarga').then((m) => ({ default: m.SeguimientoCarga })),
)

// Secciones exclusivas de Dirección Académica. La restricción real está en
// las policies de RLS; esto evita ofrecer pantallas que no van a funcionar.
const ADMIN = ['ADMIN']

function withLayout(element) {
  return <Layout>{element}</Layout>
}

function App() {
  return (
    <Suspense fallback={<div className="page-padding">Cargando...</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<PrivateRoute>{withLayout(<Home />)}</PrivateRoute>} />

        <Route path="/catedras" element={<PrivateRoute>{withLayout(<Catedras />)}</PrivateRoute>} />
        <Route
          path="/indicadores/:catedraId"
          element={<PrivateRoute>{withLayout(<CargarIndicadores />)}</PrivateRoute>}
        />
        <Route path="/foja/:catedraId" element={<PrivateRoute>{withLayout(<FojaDesempeno />)}</PrivateRoute>} />

        <Route path="/examenes" element={<PrivateRoute>{withLayout(<Llamados />)}</PrivateRoute>} />
        <Route
          path="/examenes/seguimiento"
          element={<PrivateRoute roles={ADMIN}>{withLayout(<SeguimientoCarga />)}</PrivateRoute>}
        />
        <Route path="/examenes/:llamadoId" element={<PrivateRoute>{withLayout(<PanelFechas />)}</PrivateRoute>} />
        <Route
          path="/examenes/:llamadoId/reporte"
          element={<PrivateRoute>{withLayout(<ReporteCarga />)}</PrivateRoute>}
        />

        <Route path="/informes" element={<PrivateRoute>{withLayout(<InformesConsolidados />)}</PrivateRoute>} />
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
          <Route path="usuarios" element={<Usuarios />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
