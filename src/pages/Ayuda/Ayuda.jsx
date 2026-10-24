import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { paraBuscar, pantallasDelRol } from '../../lib/manual'
import { formatoLargo } from '../../lib/fechas'

// Centro de ayuda: los manuales de las pantallas que el usuario tiene en
// su menú, agrupados por área y pantalla, con buscador. Dirección
// Académica ve además los borradores y puede crear y editar.
export function Ayuda() {
  const { rol, esAdmin } = useAuth()
  const [manuales, setManuales] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    supabase
      .from('manual')
      .select('*')
      .order('orden')
      .order('titulo')
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        else setManuales(data || [])
        setLoading(false)
      })
  }, [])

  const grupos = useMemo(() => {
    const termino = paraBuscar(busqueda.trim())
    const coincide = (m) =>
      !termino || paraBuscar(`${m.titulo} ${m.resumen || ''} ${m.contenido}`).includes(termino)

    const porArea = new Map()
    for (const p of pantallasDelRol(rol)) {
      const deLaPantalla = manuales.filter((m) => m.pantalla === p.to && coincide(m))
      if (deLaPantalla.length === 0) continue
      if (!porArea.has(p.area)) porArea.set(p.area, [])
      porArea.get(p.area).push({ pantalla: p, manuales: deLaPantalla })
    }
    return [...porArea.entries()]
  }, [manuales, busqueda, rol])

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Centro de ayuda</h1>
        <p>
          Manuales y videos de cómo usar cada pantalla del sistema. También podés abrir la ayuda de la pantalla en la que
          estás con el botón <strong>?</strong> de la barra superior.
        </p>
      </div>

      <div className="form-row" style={{ marginBottom: 20 }}>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar: cargar fecha, vocales, reemplazo..."
          style={{ flex: '1 1 280px', maxWidth: 480 }}
        />
        {esAdmin && (
          <Link to="/ayuda/nuevo" className="btn btn-primary">
            + Nuevo manual
          </Link>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted-text">Cargando...</p>}

      {!loading && grupos.length === 0 && (
        <p className="muted-text">
          {busqueda ? 'Ningún manual coincide con la búsqueda.' : 'Todavía no hay manuales publicados.'}
        </p>
      )}

      {grupos.map(([area, pantallas]) => (
        <section key={area} className="ayuda-area">
          <h2>{area}</h2>
          {pantallas.map(({ pantalla, manuales: lista }) => (
            <div key={pantalla.to} className="ayuda-pantalla">
              <h3>
                <span aria-hidden="true">{pantalla.icon}</span> {pantalla.titulo}
              </h3>
              <div className="ayuda-lista">
                {lista.map((m) => (
                  <div key={m.id} className="ayuda-item">
                    <Link to={`/ayuda/${m.id}`} className="ayuda-item-titulo">
                      {m.titulo}
                    </Link>
                    {m.videos?.length > 0 && <span className="badge badge-gold">🎬 Video</span>}
                    {!m.publicado && <span className="badge badge-muted">Borrador</span>}
                    {m.resumen && <p className="muted-text">{m.resumen}</p>}
                    {esAdmin && (
                      <div className="ayuda-item-admin">
                        <span className="muted-text">Actualizado el {formatoLargo(m.actualizado_en?.slice(0, 10))}</span>
                        <Link to={`/ayuda/${m.id}/editar`} className="btn btn-secondary btn-sm">
                          Editar
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
