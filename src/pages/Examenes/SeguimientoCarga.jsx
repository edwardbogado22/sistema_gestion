import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

const TIPOS = {
  ORDINARIO: 'Ordinario',
  COMPLEMENTARIO: 'Complementario',
  REGULARIZACION: 'Regularización',
}

const formatoFechaHora = (ts) =>
  ts ? new Date(ts).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export function SeguimientoCarga() {
  const [llamados, setLlamados] = useState([])
  const [avance, setAvance] = useState([])
  const [carga, setCarga] = useState([])
  const [llamadoId, setLlamadoId] = useState('')
  const [carreraId, setCarreraId] = useState('')
  const [sedeId, setSedeId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const cargar = async () => {
      setLoading(true)
      const [l, av, cs] = await Promise.all([
        supabase.from('examen_llamado').select('*').order('fecha_inicio', { ascending: false }),
        supabase.from('v_examen_avance').select('*'),
        supabase.from('v_examen_carga_secretario').select('*'),
      ])
      const err = l.error || av.error || cs.error
      if (err) setError(err.message)
      setLlamados(l.data || [])
      setAvance(av.data || [])
      setCarga(cs.data || [])
      if (!llamadoId && l.data?.length) {
        const enAsignacion = l.data.find((x) => x.estado === 'ASIGNACION')
        setLlamadoId((enAsignacion || l.data[0]).id)
      }
      setLoading(false)
    }
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const llamado = llamados.find((l) => l.id === llamadoId)

  const avanceLlamado = useMemo(() => avance.filter((a) => a.llamado_id === llamadoId), [avance, llamadoId])
  const cargaLlamadoCompleta = useMemo(
    () => carga.filter((c) => c.llamado_id === llamadoId).sort((a, b) => a.carrera.localeCompare(b.carrera) || a.sede.localeCompare(b.sede)),
    [carga, llamadoId],
  )

  // Opciones de carrera/sede derivadas de lo que efectivamente aparece
  // en este llamado (mismo criterio que el filtro de Fechas de Exámenes).
  const opciones = useMemo(() => {
    const unico = (lista, clave, etiquetaClave) => {
      const mapa = new Map()
      for (const x of lista) if (x[clave]) mapa.set(x[clave], x[etiquetaClave])
      return [...mapa].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
    }
    return {
      carreras: unico(avanceLlamado, 'carrera_id', 'carrera'),
      sedes: unico(avanceLlamado, 'sede_id', 'sede'),
    }
  }, [avanceLlamado])

  const avanceFiltrado = useMemo(
    () =>
      avanceLlamado.filter(
        (a) => (!carreraId || a.carrera_id === carreraId) && (!sedeId || a.sede_id === sedeId),
      ),
    [avanceLlamado, carreraId, sedeId],
  )

  const totalPorCarreraSede = useMemo(() => {
    const mapa = new Map()
    for (const a of avanceLlamado) mapa.set(`${a.carrera_id}-${a.sede_id}`, Number(a.total))
    return mapa
  }, [avanceLlamado])

  const cargaLlamado = useMemo(
    () =>
      cargaLlamadoCompleta.filter(
        (c) => (!carreraId || c.carrera_id === carreraId) && (!sedeId || c.sede_id === sedeId),
      ),
    [cargaLlamadoCompleta, carreraId, sedeId],
  )

  const totales = useMemo(
    () =>
      avanceFiltrado.reduce(
        (acc, a) => ({
          total: acc.total + Number(a.total),
          conFecha: acc.conFecha + Number(a.con_fecha),
          sinFecha: acc.sinFecha + Number(a.sin_fecha),
        }),
        { total: 0, conFecha: 0, sinFecha: 0 },
      ),
    [avanceFiltrado],
  )
  const porcentaje = totales.total ? Math.round((1000 * totales.conFecha) / totales.total) / 10 : 0

  // Carrera/sede de este llamado sin ninguna carga registrada todavía
  const sinActividad = useMemo(
    () =>
      avanceFiltrado.filter(
        (a) => Number(a.total) > 0 && !cargaLlamado.some((c) => c.carrera_id === a.carrera_id && c.sede_id === a.sede_id),
      ),
    [avanceFiltrado, cargaLlamado],
  )

  if (loading) return <p className="page-padding muted-text">Cargando...</p>
  if (error) return <p className="page-padding error-text">{error}</p>

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Seguimiento de carga</h1>
        <p>Progreso de carga de fechas de examen por secretario, carrera y sede.</p>
      </div>

      {llamados.length === 0 && <p className="muted-text">Todavía no hay llamados creados.</p>}

      {llamados.length > 0 && (
        <>
          <div className="form-row" style={{ marginBottom: 16, alignItems: 'center' }}>
            <label>
              Llamado
              <select value={llamadoId} onChange={(e) => setLlamadoId(e.target.value)}>
                {llamados.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre} ({TIPOS[l.tipo] || l.tipo} · {l.periodo_lectivo})
                  </option>
                ))}
              </select>
            </label>
            {llamado && <span className="badge badge-muted">Estado: {llamado.estado}</span>}

            <select value={carreraId} onChange={(e) => setCarreraId(e.target.value)}>
              <option value="">Todas las carreras</option>
              {opciones.carreras.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <select value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
              <option value="">Todas las sedes</option>
              {opciones.sedes.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="stat-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-value">{totales.total}</div>
              <div className="stat-label">Cátedras totales</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{totales.conFecha}</div>
              <div className="stat-label">Con fecha cargada</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{totales.sinFecha}</div>
              <div className="stat-label">Sin fecha</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{porcentaje}%</div>
              <div className="stat-label">Avance</div>
            </div>
          </div>

          {sinActividad.length > 0 && (
            <div className="stat-card" style={{ textAlign: 'left', marginBottom: 16 }}>
              <div className="section-label">
                <span>Sin ninguna carga todavía</span>
              </div>
              {sinActividad.map((a) => (
                <div className="stat-breakdown-row" key={`${a.carrera_id}-${a.sede_id}`}>
                  <span>
                    {a.carrera} · {a.sede}
                  </span>
                  <span className="badge badge-muted">{a.total} materia(s) sin fecha</span>
                </div>
              ))}
            </div>
          )}

          <table className="data-table">
            <thead>
              <tr>
                <th>Carrera</th>
                <th>Sede</th>
                <th>Secretario</th>
                <th>Fechas cargadas</th>
                <th>Última carga</th>
              </tr>
            </thead>
            <tbody>
              {cargaLlamado.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted-text">
                    Todavía no hay fechas cargadas en este llamado.
                  </td>
                </tr>
              )}
              {cargaLlamado.map((c) => {
                const total = totalPorCarreraSede.get(`${c.carrera_id}-${c.sede_id}`)
                return (
                  <tr key={`${c.carrera_id}-${c.sede_id}-${c.asignado_por}`}>
                    <td>{c.carrera}</td>
                    <td>{c.sede}</td>
                    <td>{c.cargado_por}</td>
                    <td>
                      {c.fechas_cargadas}
                      {total != null ? ` de ${total}` : ''}
                    </td>
                    <td>{formatoFechaHora(c.ultima_carga)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
