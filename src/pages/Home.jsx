import { Link, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { areasVisibles } from '../lib/navegacion'

function useResumen() {
  const [resumen, setResumen] = useState(null)

  useEffect(() => {
    let activo = true

    async function cargar() {
      const [profesores, asignaturas, catedras, catedrasCarrera, catedrasSede] = await Promise.all([
        supabase.from('profesores').select('*', { count: 'exact', head: true }),
        supabase.from('asignaturas').select('*', { count: 'exact', head: true }),
        supabase.from('catedras').select('*', { count: 'exact', head: true }),
        supabase.from('catedras').select('asignaturas(carreras(nombre))'),
        supabase.from('catedras').select('sedes(nombre)'),
      ])

      if (!activo) return

      const contarPor = (filas, obtenerNombre) => {
        const conteo = {}
        for (const fila of filas || []) {
          const nombre = obtenerNombre(fila) || 'Sin dato'
          conteo[nombre] = (conteo[nombre] || 0) + 1
        }
        return Object.entries(conteo).sort((a, b) => b[1] - a[1])
      }

      setResumen({
        profesores: profesores.count || 0,
        asignaturas: asignaturas.count || 0,
        catedras: catedras.count || 0,
        porCarrera: contarPor(catedrasCarrera.data, (c) => c.asignaturas?.carreras?.nombre),
        porSede: contarPor(catedrasSede.data, (c) => c.sedes?.nombre),
      })
    }

    cargar()
    return () => {
      activo = false
    }
  }, [])

  return resumen
}

function PanelResumen() {
  const resumen = useResumen()

  return (
    <div className="container">
      <div className="stat-grid stat-grid-hero">
        <div className="stat-card">
          <div className="stat-value">{resumen ? resumen.profesores : '—'}</div>
          <div className="stat-label">Profesores</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{resumen ? resumen.asignaturas : '—'}</div>
          <div className="stat-label">Asignaturas</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{resumen ? resumen.catedras : '—'}</div>
          <div className="stat-label">Cátedras cargadas</div>
        </div>
        <div className="stat-card stat-card-breakdown">
          <div className="stat-label">Cátedras por carrera</div>
          {resumen && resumen.porCarrera.length === 0 && <p className="muted-text">Sin datos aún</p>}
          {resumen?.porCarrera.map(([nombre, cantidad]) => (
            <div className="stat-breakdown-row" key={nombre}>
              <span>{nombre}</span>
              <span className="badge badge-gold">{cantidad}</span>
            </div>
          ))}
        </div>
        <div className="stat-card stat-card-breakdown">
          <div className="stat-label">Cátedras por sede</div>
          {resumen && resumen.porSede.length === 0 && <p className="muted-text">Sin datos aún</p>}
          {resumen?.porSede.map(([nombre, cantidad]) => (
            <div className="stat-breakdown-row" key={nombre}>
              <span>{nombre}</span>
              <span className="badge badge-gold">{cantidad}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function Home() {
  const { rol, esAsistente } = useAuth()

  // El asistente solo hace check-in de eventos, normalmente desde el
  // celular en la puerta: directo a la pantalla que necesita, sin
  // pasar por un menú que no puede usar para nada más.
  if (esAsistente) return <Navigate to="/eventos" replace />

  const secciones = areasVisibles(rol)

  return (
    <>
      <header className="hero">
        <div className="crest">FCE</div>
        <p className="eyebrow">Universidad Nacional del Este</p>
        <h1>Sistema de Evaluación Docente</h1>
        <p className="sub">Facultad de Ciencias Económicas · Dirección Académica</p>
      </header>

      <PanelResumen />

      <div className="container">
        {secciones.map(({ id, titulo, items }) => (
          <div key={id}>
            <div className="section-label">
              <span>{titulo}</span>
            </div>
            <div className="menu-grid">
              {items.map((c) => (
                <Link key={c.to} to={c.to} className={`menu-card${c.destacada ? ' destacada' : ''}`}>
                  <div className="icon">{c.icon}</div>
                  <h3>{c.titulo}</h3>
                  <p>{c.desc}</p>
                  <div className="accent" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
