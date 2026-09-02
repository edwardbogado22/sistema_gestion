import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function Layout({ children }) {
  const { user, perfil, esSecretario, esDirector, alcance, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="app-layout">
      <div className="topbar" />
      <nav className="nav-bar">
        <Link to="/" className="nav-title" style={{ color: '#fff', textDecoration: 'none' }}>
          Sistema de Evaluación Docente
        </Link>
        {location.pathname !== '/' && (
          <Link to="/" className="nav-link nav-home">
            ← Inicio
          </Link>
        )}
        <div className="nav-spacer" />
        {user && (
          <>
            {(esSecretario || esDirector) && (
              <span className="nav-user" title="Carreras y sedes a tu cargo">
                {alcance.length === 0
                  ? 'Sin alcance asignado'
                  : alcance
                      .map((a) => `${a.carreras?.nombre ?? '—'} · ${a.sedes?.nombre ?? 'todas las sedes'}`)
                      .join('  |  ')}
              </span>
            )}
            <span className="nav-user">{perfil?.nombre_completo || user.email}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </>
        )}
      </nav>
      <main className="app-main">{children}</main>
      <footer className="footer">
        <div>
          <strong>Universidad Nacional del Este</strong> · Facultad de Ciencias Económicas
        </div>
        <div className="small">
          Avda. Universidad Nacional del Este y Avda. Paraguay - Km 8 Acaray, Ciudad del Este, Paraguay
        </div>
      </footer>
    </div>
  )
}
