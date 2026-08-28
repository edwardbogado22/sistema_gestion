import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const ESCALA_MAX = 102

function agrupar(catedras, pick) {
  const mapa = new Map()
  catedras.forEach((c) => {
    const key = pick(c)
    if (!key) return
    const actual = mapa.get(key) || { nombre: key, suma: 0, cantidad: 0 }
    actual.suma += c.total
    actual.cantidad += 1
    mapa.set(key, actual)
  })
  return [...mapa.values()]
    .map((v) => ({ nombre: v.nombre, promedio: v.suma / v.cantidad, cantidad: v.cantidad }))
    .sort((a, b) => b.promedio - a.promedio)
}

function Ranking({ titulo, filas }) {
  return (
    <div className="form-card" style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ marginBottom: 14 }}>{titulo}</h3>
      {filas.length === 0 ? (
        <p className="muted-text">Sin datos para este periodo.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filas.map((f) => (
            <div key={f.nombre} className="score-bar">
              <span style={{ minWidth: 220, fontSize: 13 }}>
                {f.nombre} <span className="muted-text">({f.cantidad})</span>
              </span>
              <div className="score-bar-track">
                <div
                  className="score-bar-fill"
                  style={{ width: `${Math.min(100, (f.promedio / ESCALA_MAX) * 100)}%` }}
                />
              </div>
              <span className="score-bar-value">{f.promedio.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function InformesConsolidados() {
  const [periodos, setPeriodos] = useState([])
  const [periodo, setPeriodo] = useState('')
  const [detalle, setDetalle] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingDatos, setLoadingDatos] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('catedras')
      .select('periodo_lectivo')
      .then(({ data }) => {
        const distintos = [...new Set((data || []).map((c) => c.periodo_lectivo))].sort().reverse()
        setPeriodos(distintos)
        setPeriodo(distintos[0] || '')
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!periodo) {
      setDetalle([])
      return
    }
    setLoadingDatos(true)
    supabase
      .from('v_evaluacion_docente_detalle')
      .select('*')
      .eq('periodo_lectivo', periodo)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setDetalle(data || [])
        setLoadingDatos(false)
      })
  }, [periodo])

  const porCatedra = useMemo(() => {
    const mapa = new Map()
    detalle.forEach((f) => {
      const actual = mapa.get(f.catedra_id) || {
        catedra_id: f.catedra_id,
        carrera: f.carrera,
        sede: f.sede,
        profesor: f.profesor_completo,
        total: 0,
      }
      actual.total += Number(f.obtenido_porcentaje)
      mapa.set(f.catedra_id, actual)
    })
    return [...mapa.values()]
  }, [detalle])

  const porCarrera = useMemo(() => agrupar(porCatedra, (c) => c.carrera), [porCatedra])
  const porSede = useMemo(() => agrupar(porCatedra, (c) => c.sede), [porCatedra])
  const porProfesor = useMemo(() => agrupar(porCatedra, (c) => c.profesor), [porCatedra])

  if (loading) {
    return (
      <div className="page-padding">
        <p>Cargando...</p>
      </div>
    )
  }

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Informes Consolidados</h1>
      </div>

      <div className="form-grid" style={{ maxWidth: 320, marginBottom: '1.5rem' }}>
        <label>
          Periodo lectivo
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            <option value="">Seleccionar...</option>
            {periodos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="error-text">{error}</p>}

      {loadingDatos ? (
        <p>Cargando datos...</p>
      ) : !periodo ? (
        <p className="muted-text">Elegí un periodo lectivo para ver los informes.</p>
      ) : (
        <>
          <Ranking titulo="Promedio por carrera" filas={porCarrera} />
          <Ranking titulo="Promedio por sede" filas={porSede} />
          <Ranking titulo="Ranking de profesores" filas={porProfesor} />
        </>
      )}
    </div>
  )
}
