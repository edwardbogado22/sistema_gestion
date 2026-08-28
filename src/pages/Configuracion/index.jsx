import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { to: 'sedes', label: 'Sedes' },
  { to: 'carreras', label: 'Carreras' },
  { to: 'asignaturas', label: 'Asignaturas' },
  { to: 'profesores', label: 'Profesores' },
  { to: 'criterios', label: 'Criterios de Evaluación' },
]

export function Configuracion() {
  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Configuración</h1>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
