import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function PrivateRoute({ children, roles }) {
  const { user, perfil, rol, loading } = useAuth()

  if (loading) return <div className="page-padding">Cargando...</div>
  if (!user) return <Navigate to="/login" />

  // Autenticado pero sin perfil: el usuario existe en Supabase Auth y
  // nadie le asignó rol todavía. Con las policies nuevas no va a poder
  // leer nada, así que conviene decirlo en vez de mostrar pantallas vacías.
  if (!perfil) {
    return (
      <div className="page-padding">
        <div className="page-header">
          <h1>Sin rol asignado</h1>
          <p>Pedile a Dirección Académica que te habilite desde Configuración → Usuarios.</p>
        </div>
      </div>
    )
  }

  if (roles && !roles.includes(rol)) {
    return (
      <div className="page-padding">
        <div className="page-header">
          <h1>Sección no disponible</h1>
          <p>Tu rol ({rol}) no tiene acceso a esta sección.</p>
        </div>
      </div>
    )
  }

  return children
}
