import { Link, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

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
      <div className="stat-grid">
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

const CARDS = [
  {
    section: 'Cátedras y evaluación',
    to: '/catedras',
    icon: '📋',
    titulo: 'Cátedras',
    desc: 'Alta, edición y listado de cátedras (profesor + asignatura + sede + periodo).',
  },
  {
    section: 'Cátedras y evaluación',
    to: '/catedras',
    icon: '📊',
    titulo: 'Cargar Indicadores',
    desc: 'Asistencia, cumplimiento de contenido, criterios institucionales y encuesta de alumnos por cátedra.',
    destacada: true,
  },
  {
    section: 'Cátedras y evaluación',
    to: '/catedras',
    icon: '🧾',
    titulo: 'Foja de Desempeño',
    desc: 'Generar e imprimir la foja de desempeño oficial de una cátedra.',
  },
  {
    section: 'Mesas examinadoras',
    to: '/examenes',
    icon: '🗓️',
    titulo: 'Fechas de Exámenes',
    desc: 'Llamados, rango de fechas habilitado y asignación de la fecha de examen por materia.',
    destacada: true,
  },
  {
    section: 'Mesas examinadoras',
    to: '/examenes/seguimiento',
    icon: '📈',
    titulo: 'Seguimiento de Carga',
    desc: 'Progreso de carga de fechas por secretario, carrera y sede, para revisar cómo va Secretaría.',
    soloAdmin: true,
  },
  {
    section: 'Asistencia a Clases',
    to: '/asistencia',
    icon: '🗓️',
    titulo: 'Registrar Asistencia',
    desc: 'Carga diaria de asistencia a clases por carrera y sede, con suplencias.',
    destacada: true,
  },
  {
    section: 'Asistencia a Clases',
    to: '/asistencia/reporte',
    icon: '📊',
    titulo: 'Reporte de Asistencia',
    desc: 'Efectividad por docente en un rango de fechas, exportable e imprimible.',
  },
  {
    section: 'Asistencia a Clases',
    to: '/asistencia/reemplazos',
    icon: '🔄',
    titulo: 'Reemplazos',
    desc: 'Clases donde el titular faltó y otro profesor cubrió su lugar.',
  },
  {
    section: 'Asistencia a Eventos',
    to: '/eventos',
    icon: '🪪',
    titulo: 'Registrar Asistencia',
    desc: 'Check-in por documento de identidad a reuniones docentes y capacitaciones.',
    destacada: true,
    soloAdmin: true,
  },
  {
    section: 'Asistencia a Eventos',
    to: '/eventos/gestion',
    icon: '📅',
    titulo: 'Gestión de Eventos',
    desc: 'Crear, editar y activar/desactivar eventos. Agrupalos para que contar asistencia a cualquiera cuente como presente.',
    soloAdmin: true,
  },
  {
    section: 'Asistencia a Eventos',
    to: '/eventos/busqueda',
    icon: '🔍',
    titulo: 'Búsqueda',
    desc: 'Buscar un docente por documento o nombre y ver su historial de asistencia a eventos.',
    soloAdmin: true,
  },
  {
    section: 'Asistencia a Eventos',
    to: '/eventos/reporte',
    icon: '📊',
    titulo: 'Reporte de Asistencia',
    desc: 'Matriz de asistencia por evento o grupo de eventos, exportable e imprimible.',
    soloAdmin: true,
  },
  {
    section: 'Plan Anual de Clases',
    to: '/plan-anual',
    icon: '📘',
    titulo: 'Registrar Entregas',
    desc: 'Registro por cátedra de la entrega del plan anual. Aporta al 20% de "Planificación y documentación" en la Foja de Desempeño.',
    destacada: true,
  },
  {
    section: 'Análisis',
    to: '/informes',
    icon: '📈',
    titulo: 'Informes Consolidados',
    desc: 'Rendimiento promedio por carrera, por sede y ranking de profesores.',
  },
  {
    section: 'Gestión',
    to: '/importar',
    icon: '📥',
    titulo: 'Importar Datos',
    desc: 'Carga masiva por CSV de asignaturas, profesores, cátedras e indicadores.',
    soloAdmin: true,
  },
  {
    section: 'Gestión',
    to: '/configuracion',
    icon: '⚙️',
    titulo: 'Configuración',
    desc: 'Sedes, carreras, asignaturas, profesores, criterios de evaluación y usuarios.',
    soloAdmin: true,
  },
]

export function Home() {
  const { esAdmin, esAsistente } = useAuth()

  // El asistente solo hace check-in de eventos, normalmente desde el
  // celular en la puerta: directo a la pantalla que necesita, sin
  // pasar por un menú que no puede usar para nada más.
  if (esAsistente) return <Navigate to="/eventos" replace />

  const visibles = CARDS.filter((c) => esAdmin || !c.soloAdmin)
  const secciones = [...new Set(visibles.map((c) => c.section))].map((section) => ({
    section,
    cards: visibles.filter((c) => c.section === section),
  }))

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
        {secciones.map(({ section, cards }) => (
          <div key={section}>
            <div className="section-label">
              <span>{section}</span>
            </div>
            <div className="menu-grid">
              {cards.map((c) => (
                <Link key={c.titulo} to={c.to} className={`menu-card${c.destacada ? ' destacada' : ''}`}>
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
