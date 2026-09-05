import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatoLargo } from '../../lib/fechas'

export function BusquedaAsistenciaEvento() {
  const [termino, setTermino] = useState('')
  const [profesores, setProfesores] = useState([])
  const [seleccionado, setSeleccionado] = useState(null)
  const [historial, setHistorial] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const buscar = async () => {
    const q = termino.trim()
    if (!q) {
      setError('Ingresá una cédula o nombre.')
      return
    }
    setError('')
    setLoading(true)
    setSeleccionado(null)
    setHistorial(null)
    const { data, error: eErr } = await supabase
      .from('profesores')
      .select('id, nombres, apellidos, documento_identidad')
      .or(`documento_identidad.ilike.%${q}%,nombres.ilike.%${q}%,apellidos.ilike.%${q}%`)
      .order('apellidos')
      .limit(10)
    setLoading(false)
    if (eErr) {
      setError(eErr.message)
      return
    }
    setProfesores(data || [])
    if ((data || []).length === 1) verHistorial(data[0])
  }

  const verHistorial = async (p) => {
    setSeleccionado(p)
    setHistorial(null)
    const { data, error: eErr } = await supabase
      .from('evento_asistencia_registro')
      .select('fecha_hora, evento(nombre, fecha, grupo)')
      .eq('profesor_id', p.id)
      .order('fecha_hora', { ascending: false })
    if (eErr) {
      setError(eErr.message)
      return
    }
    setHistorial(data || [])
  }

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Búsqueda de Asistencia a Eventos</h1>
      </div>

      <div className="form-row" style={{ marginBottom: 20 }}>
        <label style={{ flex: '1 1 260px' }}>
          Documento o nombre
          <input
            value={termino}
            onChange={(e) => setTermino(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="Cédula o apellido..."
          />
        </label>
        <button type="button" className="btn btn-primary" onClick={buscar} disabled={loading}>
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {profesores.length > 1 && (
        <div className="data-table-wrap" style={{ marginBottom: 20 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Nombre</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {profesores.map((p) => (
                <tr key={p.id}>
                  <td>{p.documento_identidad}</td>
                  <td>
                    {p.apellidos}, {p.nombres}
                  </td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => verHistorial(p)}>
                      Ver historial
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {seleccionado && (
        <>
          <div className="section-label">
            <span>
              Historial — {seleccionado.apellidos}, {seleccionado.nombres}
            </span>
          </div>
          {historial === null && <p className="muted-text">Cargando...</p>}
          {historial && historial.length === 0 && <p className="muted-text">Sin asistencias registradas.</p>}
          {historial &&
            historial.map((h, i) => (
              <div className="stat-breakdown-row" key={i}>
                <span>
                  {h.evento?.nombre}{' '}
                  {h.evento?.grupo && (
                    <span className="badge badge-gold" style={{ marginLeft: 6 }}>
                      {h.evento.grupo}
                    </span>
                  )}
                </span>
                <span className="muted-text">
                  {formatoLargo(h.evento?.fecha)} · {new Date(h.fecha_hora).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
        </>
      )}
    </div>
  )
}
