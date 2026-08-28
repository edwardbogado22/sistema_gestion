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

        <Route path="/informes" element={<PrivateRoute>{withLayout(<InformesConsolidados />)}</PrivateRoute>} />
        <Route path="/importar" element={<PrivateRoute>{withLayout(<ImportarDatos />)}</PrivateRoute>} />

        <Route path="/configuracion" element={<PrivateRoute>{withLayout(<Configuracion />)}</PrivateRoute>}>
          <Route index element={<Navigate to="sedes" replace />} />
          <Route path="sedes" element={<Sedes />} />
          <Route path="carreras" element={<Carreras />} />
          <Route path="asignaturas" element={<Asignaturas />} />
          <Route path="profesores" element={<Profesores />} />
          <Route path="criterios" element={<Criterios />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
