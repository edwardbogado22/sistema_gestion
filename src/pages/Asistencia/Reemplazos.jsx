import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatoLargo } from '../../lib/fechas'
import { RangoFechasPeriodo } from '../../components/RangoFechasPeriodo'

export function Reemplazos() {
  const [carreras, setCarreras] = useState([])
  const [sedes, setSedes] = useState([])
  const [periodos, setPeriodos] = useState([])
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [filtroCarrera, setFiltroCarrera] = useState('')
  const [filtroSede, setFiltroSede] = useState('')
  const [filas, setFilas] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('carreras').select('id, nombre').order('nombre'),
      supabase.from('sedes').select('id, nombre').order('nombre'),
      supabase.from('periodo_academico').select('*').order('fecha_inicio', { ascending: false }),
    ]).then(([c, s, per]) => {
      setCarreras(c.data || [])
      setSedes(s.data || [])
      setPeriodos(per.data || [])
      const activo = (per.data || []).find((p) => p.activo)
      if (activo) {
        setDesde(activo.fecha_inicio)
        setHasta(activo.fecha_fin)
      }
    })
  }, [])

  const consultar = async () => {
    if (!desde || !hasta) {
      setError('Indicá el rango de fechas.')
      return
    }
    setLoading(true)
    setError('')
    let query = supabase
      .from('v_asistencia_reemplazos')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
    if (filtroCarrera) query = query.eq('carrera_id', filtroCarrera)
    if (filtroSede) query = query.eq('sede_id', filtroSede)
    const { data, error } = await query
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setFilas(data || [])
  }

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Reemplazos / Coberturas</h1>
        <p className="muted-text">Clases en las que el docente titular faltó y otro profesor cubrió su lugar.</p>
      </div>

      <div className="form-card" style={{ marginBottom: 20 }}>
        <RangoFechasPeriodo desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} periodos={periodos} />
        <div className="form-grid" style={{ marginTop: 16 }}>
          <label>
            Carrera
            <select value={filtroCarrera} onChange={(e) => setFiltroCarrera(e.target.value)}>
              <option value="">Todas</option>
              {carreras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sede
            <select value={filtroSede} onChange={(e) => setFiltroSede(e.target.value)}>
              <option value="">Todas</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={consultar} disabled={loading}>
            {loading ? 'Consultando...' : 'Consultar'}
          </button>
        </div>
      </div>

      {filas && filas.length === 0 && <p className="muted-text">No hay reemplazos registrados en ese rango.</p>}

      {filas && filas.length > 0 && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Docente titular</th>
                <th>Estado</th>
                <th>Cubierto por</th>
                <th>Carrera</th>
                <th>Sede</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td>{formatoLargo(f.fecha)}</td>
                  <td>{f.titular}</td>
                  <td>
                    <span className={`badge ${f.estado === 'AUSENTE_JUSTIFICADO' ? 'badge-gold' : 'badge-muted'}`}>
                      {f.estado === 'AUSENTE_JUSTIFICADO' ? 'Aus. Justificado' : 'Ausente'}
                    </span>
                  </td>
                  <td>{f.suplente || '—'}</td>
                  <td>{f.carrera}</td>
                  <td>{f.sede}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
