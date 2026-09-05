import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatoLargo } from '../../lib/fechas'
import { descargarFilas } from '../../lib/csv'

export function ReporteEventos() {
  const [eventos, setEventos] = useState([])
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [registros, setRegistros] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('evento')
      .select('*')
      .order('fecha', { ascending: false })
      .then(({ data }) => {
        const eventosData = data || []
        setEventos(eventosData)
        setSeleccionados(new Set(eventosData.map((e) => e.id)))
      })
  }, [])

  // Agrupa por "grupo": eventos sin grupo quedan cada uno en su propia columna.
  const grupos = useMemo(() => {
    const mapa = new Map()
    for (const e of eventos) {
      const key = e.grupo || `__solo_${e.id}`
      if (!mapa.has(key)) mapa.set(key, { nombre: e.grupo || e.nombre, esGrupo: !!e.grupo, eventos: [] })
      mapa.get(key).eventos.push(e)
    }
    return [...mapa.values()]
  }, [eventos])

  const toggle = (id) => {
    setSeleccionados((s) => {
      const nuevo = new Set(s)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

  const toggleGrupo = (grupo, marcar) => {
    setSeleccionados((s) => {
      const nuevo = new Set(s)
      for (const e of grupo.eventos) {
        if (marcar) nuevo.add(e.id)
        else nuevo.delete(e.id)
      }
      return nuevo
    })
  }

  const generar = async () => {
    if (seleccionados.size === 0) {
      setError('Seleccioná al menos un evento.')
      return
    }
    setError('')
    setLoading(true)
    const { data, error: eErr } = await supabase
      .from('evento_asistencia_registro')
      .select('fecha_hora, evento_id, profesores(id, nombres, apellidos, documento_identidad)')
      .in('evento_id', [...seleccionados])
    setLoading(false)
    if (eErr) {
      setError(eErr.message)
      return
    }
    setRegistros(data || [])
  }

  const exportarCSV = () => {
    if (!registros?.length) return
    descargarFilas(
      `asistencia-eventos_${new Date().toISOString().slice(0, 10)}.csv`,
      registros.map((r) => ({
        documento: r.profesores?.documento_identidad,
        profesor: `${r.profesores?.apellidos}, ${r.profesores?.nombres}`,
        evento: eventos.find((e) => e.id === r.evento_id)?.nombre,
        fecha_hora: r.fecha_hora,
      })),
    )
  }

  // Matriz: docentes en filas, columnas = grupos/eventos-sueltos seleccionados con al menos un registro cargado.
  const columnas = grupos.filter((g) => g.eventos.some((e) => seleccionados.has(e.id)))
  const matriz = useMemo(() => {
    if (!registros) return []
    const porProfesor = new Map()
    for (const r of registros) {
      const p = r.profesores
      if (!p) continue
      if (!porProfesor.has(p.id)) porProfesor.set(p.id, { profesor: p, eventosAsistidos: new Set() })
      porProfesor.get(p.id).eventosAsistidos.add(r.evento_id)
    }
    return [...porProfesor.values()]
      .map((f) => ({
        ...f,
        presenciaPorColumna: columnas.map((col) => col.eventos.some((e) => f.eventosAsistidos.has(e.id))),
      }))
      .sort((a, b) => a.profesor.apellidos.localeCompare(b.profesor.apellidos))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registros, columnas.length])

  return (
    <div className="page-padding">
      <div className="page-header no-print">
        <h1>Reporte de Asistencia a Eventos</h1>
      </div>

      <div className="form-card no-print" style={{ marginBottom: 20 }}>
        <p className="muted-text" style={{ margin: '0 0 8px' }}>
          Eventos a incluir
        </p>
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 12,
            maxHeight: 280,
            overflowY: 'auto',
            background: 'var(--canvas)',
          }}
        >
          {grupos.map((g) => (
            <div key={g.nombre} style={{ marginBottom: 8 }}>
              {g.esGrupo && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span className="badge badge-gold">
                    {g.nombre} ({g.eventos.length})
                  </span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="chip" onClick={() => toggleGrupo(g, true)}>
                      Todo
                    </button>
                    <button type="button" className="chip" onClick={() => toggleGrupo(g, false)}>
                      Nada
                    </button>
                  </span>
                </div>
              )}
              {g.eventos.map((e) => (
                <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: g.esGrupo ? 16 : 0, marginBottom: 2 }}>
                  <input type="checkbox" checked={seleccionados.has(e.id)} onChange={() => toggle(e.id)} />
                  {e.nombre} <span className="muted-text">— {formatoLargo(e.fecha)}</span>
                  {!e.activo && <span className="badge badge-muted">Inactivo</span>}
                </label>
              ))}
            </div>
          ))}
          {grupos.length === 0 && <p className="muted-text">No hay eventos cargados.</p>}
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={generar} disabled={loading}>
            {loading ? 'Generando...' : 'Generar reporte'}
          </button>
          {registros?.length > 0 && (
            <>
              <button type="button" className="btn btn-secondary" onClick={exportarCSV}>
                Descargar CSV
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
                Imprimir matriz
              </button>
            </>
          )}
        </div>
      </div>

      {registros && registros.length === 0 && <p className="muted-text">No hay registros para los eventos seleccionados.</p>}

      {registros && registros.length > 0 && (
        <div className="foja-card">
          <div className="foja-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <img src="/escudo-une.png" alt="Escudo UNE" className="foja-escudo" />
            <div>
              <p className="eyebrow" style={{ color: 'var(--gold)' }}>
                Universidad Nacional del Este
              </p>
              <h2 style={{ margin: '2px 0' }}>Facultad de Ciencias Económicas</h2>
              <p className="muted-text" style={{ margin: 0 }}>
                Matriz de Asistencia a Eventos
              </p>
            </div>
          </div>

          <table className="foja-datos">
            <tbody>
              <tr>
                <td>
                  <strong>Eventos incluidos:</strong> {columnas.length}
                </td>
                <td>
                  <strong>Docentes:</strong> {matriz.length}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="data-table-wrap">
            <table className="data-table foja-tabla">
              <thead>
                <tr>
                  <th>Docente</th>
                  <th>Documento</th>
                  {columnas.map((c) => (
                    <th key={c.nombre}>{c.nombre}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {matriz.map((f) => (
                  <tr key={f.profesor.id}>
                    <td>
                      {f.profesor.apellidos}, {f.profesor.nombres}
                    </td>
                    <td>{f.profesor.documento_identidad}</td>
                    {f.presenciaPorColumna.map((presente, i) => (
                      <td key={i} style={{ textAlign: 'center' }}>
                        {presente ? '✓' : ''}
                      </td>
                    ))}
                    <td style={{ textAlign: 'center' }}>
                      {f.presenciaPorColumna.filter(Boolean).length}/{columnas.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
