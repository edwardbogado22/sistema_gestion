import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatoLargo } from '../../lib/fechas'
import { descargarFilas } from '../../lib/csv'
import { RangoFechasPeriodo } from '../../components/RangoFechasPeriodo'

const hoy = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function badgePorcentaje(pct) {
  if (pct == null) return <span className="muted-text">—</span>
  const clase = pct >= 80 ? 'badge-success' : pct >= 60 ? 'badge-gold' : 'badge-muted'
  return <span className={`badge ${clase}`}>{pct}%</span>
}

export function ReporteAsistencia() {
  const { perfil } = useAuth()
  const [carreras, setCarreras] = useState([])
  const [sedes, setSedes] = useState([])
  const [periodos, setPeriodos] = useState([])
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [filtroCarrera, setFiltroCarrera] = useState('')
  const [filtroSede, setFiltroSede] = useState('')
  const [resultados, setResultados] = useState(null)
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

  const generar = async () => {
    if (!desde || !hasta) {
      setError('Indicá el rango de fechas del corte.')
      return
    }
    setLoading(true)
    setError('')
    const { data, error } = await supabase.rpc('reporte_asistencia_clases', {
      p_desde: desde,
      p_hasta: hasta,
      p_carrera: filtroCarrera || null,
      p_sede: filtroSede || null,
      p_profesor: null,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setResultados(data || [])
  }

  const exportarCSV = () => {
    if (!resultados?.length) return
    descargarFilas(
      `asistencia-clases_${desde}_al_${hasta}.csv`,
      resultados.map((r) => ({
        profesor: r.profesor,
        carrera: r.carrera,
        sede: r.sede,
        clases_esperadas: r.esperadas,
        presentes: r.presentes,
        ausentes: r.ausentes,
        ausentes_justificados: r.justificados,
        efectividad_pct: r.porcentaje,
      })),
    )
  }

  const promedio = resultados?.length
    ? (resultados.reduce((a, r) => a + Number(r.porcentaje || 0), 0) / resultados.length).toFixed(1)
    : null

  return (
    <div className="page-padding">
      <div className="page-header no-print">
        <h1>Reporte de Asistencia a Clases</h1>
      </div>

      <div className="form-card no-print" style={{ marginBottom: 20 }}>
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
          <button type="button" className="btn btn-primary" onClick={generar} disabled={loading}>
            {loading ? 'Generando...' : 'Generar reporte'}
          </button>
          {resultados?.length > 0 && (
            <>
              <button type="button" className="btn btn-secondary" onClick={exportarCSV}>
                Descargar CSV
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
                Imprimir
              </button>
            </>
          )}
        </div>
      </div>

      {resultados && resultados.length === 0 && <p className="muted-text">No hay datos para ese rango/filtros.</p>}

      {resultados && resultados.length > 0 && (
        <div className="foja-card">
          <div className="foja-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <img src="/escudo-une.png" alt="Escudo UNE" className="foja-escudo" />
            <div>
              <p className="eyebrow" style={{ color: 'var(--gold)' }}>
                Universidad Nacional del Este
              </p>
              <h2 style={{ margin: '2px 0' }}>Facultad de Ciencias Económicas</h2>
              <p className="muted-text" style={{ margin: 0 }}>
                Reporte de Efectividad Docente — Asistencia a Clases
              </p>
            </div>
          </div>

          <table className="foja-datos">
            <tbody>
              <tr>
                <td>
                  <strong>Corte:</strong> {formatoLargo(desde)} al {formatoLargo(hasta)}
                </td>
                <td>
                  <strong>Docentes:</strong> {resultados.length}
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Emitido:</strong> {hoy()}
                </td>
                <td>
                  <strong>Promedio de efectividad:</strong> {promedio}%
                </td>
              </tr>
              <tr className="no-print">
                <td colSpan={2}>
                  <strong>Responsable:</strong> {perfil?.nombre_completo || '—'}
                </td>
              </tr>
            </tbody>
          </table>

          <table className="data-table foja-tabla">
            <thead>
              <tr>
                <th>Docente</th>
                <th>Carrera</th>
                <th>Sede</th>
                <th>Esperadas</th>
                <th>Presentes</th>
                <th>Ausentes</th>
                <th>Justificadas</th>
                <th>Efectividad</th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((r, i) => (
                <tr key={`${r.profesor_id}-${r.carrera_id}-${r.sede_id}-${i}`}>
                  <td>{r.profesor}</td>
                  <td>{r.carrera}</td>
                  <td>{r.sede}</td>
                  <td style={{ textAlign: 'center' }}>{r.esperadas}</td>
                  <td style={{ textAlign: 'center' }}>{r.presentes}</td>
                  <td style={{ textAlign: 'center' }}>{r.ausentes}</td>
                  <td style={{ textAlign: 'center' }}>{r.justificados}</td>
                  <td>{badgePorcentaje(r.porcentaje)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
