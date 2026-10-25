import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { areaActiva, areasVisibles, itemActivo } from '../lib/navegacion'
import { PanelAyuda } from './PanelAyuda'

export function Layout({ children }) {
  const { user, perfil, rol, esAdmin, esSecretario, esDirector, esAsistente, alcance, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Id del área desplegada (escritorio) y panel completo abierto (celular).
  const [abierta, setAbierta] = useState(null)
  const [panelAbierto, setPanelAbierto] = useState(false)
  const [ayudaAbierta, setAyudaAbierta] = useState(false)
  const navRef = useRef(null)

  const areas = areasVisibles(rol)
  const areaActual = areaActiva(location.pathname)
  const itemActual = itemActivo(location.pathname)

  const cerrarMenu = () => {
    setAbierta(null)
    setPanelAbierto(false)
  }

  useEffect(() => {
    function onClickFuera(e) {
      if (navRef.current && !navRef.current.contains(e.target)) cerrarMenu()
    }
    function onTecla(e) {
      if (e.key === 'Escape') cerrarMenu()
    }
    document.addEventListener('mousedown', onClickFuera)
    document.addEventListener('keydown', onTecla)
    return () => {
      document.removeEventListener('mousedown', onClickFuera)
      document.removeEventListener('keydown', onTecla)
    }
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const textoAlcance =
    alcance.length === 0
      ? 'Sin alcance asignado'
      : alcance.map((a) => `${a.carreras?.nombre ?? '—'} · ${a.sedes?.nombre ?? 'todas las sedes'}`).join('  |  ')

  return (
    <div className="app-layout">
      <nav className="nav-bar" ref={navRef}>
        <Link to="/" className="nav-title" style={{ color: '#fff', textDecoration: 'none' }} onClick={cerrarMenu}>
          Sistema de Gestión Académico
        </Link>
        {areas.length > 0 && (
          <>
            <button
              type="button"
              className="nav-toggle"
              aria-expanded={panelAbierto}
              aria-controls="nav-menu"
              onClick={() => setPanelAbierto((v) => !v)}
            >
              ☰ Menú
            </button>
            <div id="nav-menu" className={`nav-menu${panelAbierto ? ' abierto' : ''}`}>
              {/* Para el asistente el inicio redirige al check-in, que ya tiene en su menú. */}
              {!esAsistente && (
                <Link to="/" className={`nav-link${location.pathname === '/' ? ' active' : ''}`} onClick={cerrarMenu}>
                  Inicio
                </Link>
              )}
              {areas.map((area) => (
                <div key={area.id} className={`nav-area${abierta === area.id ? ' abierta' : ''}`}>
                  <button
                    type="button"
                    className={`nav-link nav-area-boton${areaActual === area.id ? ' active' : ''}`}
                    aria-expanded={abierta === area.id}
                    onClick={() => setAbierta((actual) => (actual === area.id ? null : area.id))}
                  >
                    {area.corto}
                    <span className="nav-area-flecha" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  <div className="nav-area-lista">
                    {area.items.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={`nav-area-item${itemActual === item ? ' active' : ''}`}
                        onClick={cerrarMenu}
                      >
                        <span aria-hidden="true">{item.icon}</span>
                        {item.titulo}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="nav-spacer" />
        {user && (
          <>
            {(esSecretario || esDirector) && (
              <span className="nav-user nav-alcance" title={`Carreras y sedes a tu cargo: ${textoAlcance}`}>
                {textoAlcance}
              </span>
            )}
            <button
              type="button"
              className="nav-ayuda"
              onClick={() => setAyudaAbierta(true)}
              title="Ayuda de esta pantalla"
              aria-label="Ayuda de esta pantalla"
            >
              ?
            </button>
            <span className="nav-user">{perfil?.nombre_completo || user.email}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </>
        )}
      </nav>
      <main className="app-main">{children}</main>
      {ayudaAbierta && <PanelAyuda item={itemActual} esAdmin={esAdmin} onCerrar={() => setAyudaAbierta(false)} />}
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
