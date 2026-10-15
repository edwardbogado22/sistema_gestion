import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { BuscadorSelect } from '../../components/BuscadorSelect'
import { fetchTodo } from '../../lib/paginar'
import { formatoLargo } from '../../lib/fechas'

const ROLES = { PRESIDENTE: 'Presidente', VOCAL: 'Examinador' }

const MOSTRAR = [
  { value: 'pendientes', label: 'Solo pendientes' },
  { value: 'todas', label: 'Todas' },
  { value: 'firmadas', label: 'Solo firmadas' },
]

const ordenActa = (a, b) =>
  (a.numero_acta ?? Infinity) - (b.numero_acta ?? Infinity) || (a.fecha || '').localeCompare(b.fecha || '')

/**
 * Actas que cada profesor tiene que firmar en un llamado: como presidente
 * (titular de la cátedra) o como examinador (vocal). La Secretaría busca
 * al profesor por nombre o cédula, ve el número de acta y la fecha del
 * examen para ubicarla, y tilda cada una a medida que la firma.
 *
 * actas_firmas() ya filtra por el alcance de carrera/sede del usuario, así
 * que cada secretario ve solo las actas de lo suyo.
 */
export function ActasFirmas() {
  const { puedeEscribir } = useAuth()
  const [params, setParams] = useSearchParams()
  const llamadoId = params.get('llamado') || ''
  const [llamados, setLlamados] = useState([])
  const [filas, setFilas] = useState([])
  const [profesorId, setProfesorId] = useState('')
  const [sede, setSede] = useState('')
  const [carrera, setCarrera] = useState('')
  const [mostrar, setMostrar] = useState('pendientes')
  const [loading, setLoading] = useState(true)
  const [consultando, setConsultando] = useState(false)
  const [guardando, setGuardando] = useState(new Set())
  const [error, setError] = useState('')

  const setLlamado = useCallback(
    (id) => {
      const next = new URLSearchParams(params)
      if (id) next.set('llamado', id)
      else next.delete('llamado')
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  useEffect(() => {
    ;(async () => {
      const { data, error: err } = await supabase
        .from('examen_llamado')
        .select('id, nombre, periodo_lectivo, fecha_inicio')
        .order('fecha_inicio', { ascending: false })
      if (err) setError(err.message)
      setLlamados(data || [])
      if (!llamadoId && data?.length) setLlamado(data[0].id)
      setLoading(false)
    })()
    // Solo al entrar: el llamado elegido después lo maneja el select.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!llamadoId) return
    ;(async () => {
      setConsultando(true)
      setError('')
      const { data, error: err } = await fetchTodo((desde, hasta) =>
        supabase
          .rpc('actas_firmas', { p_llamado: llamadoId })
          .order('examen_fecha_id')
          .order('profesor_id')
          .order('rol')
          .range(desde, hasta),
      )
      if (err) setError(err.message)
      setFilas(data || [])
      setProfesorId('')
      setSede('')
      setCarrera('')
      setConsultando(false)
    })()
  }, [llamadoId])

  const opciones = useMemo(() => {
    const profs = new Map()
    const sedes = new Map()
    const carreras = new Map()
    for (const f of filas) {
      profs.set(f.profesor_id, `${f.profesor} (${f.documento_identidad})`)
      sedes.set(f.sede_id, f.sede)
      carreras.set(f.carrera_id, f.carrera)
    }
    const lista = (m) => [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
    return { profesores: lista(profs), sedes: lista(sedes), carreras: lista(carreras) }
  }, [filas])

  const filtradas = useMemo(
    () =>
      filas.filter((f) => {
        if (profesorId && f.profesor_id !== profesorId) return false
        if (sede && f.sede_id !== sede) return false
        if (carrera && f.carrera_id !== carrera) return false
        if (mostrar === 'pendientes' && f.firmado_en) return false
        if (mostrar === 'firmadas' && !f.firmado_en) return false
        return true
      }),
    [filas, profesorId, sede, carrera, mostrar],
  )

  // Un bloque por profesor (es lo que se imprime y se le entrega), con
  // sus actas en el orden en que están archivadas.
  const grupos = useMemo(() => {
    const mapa = new Map()
    for (const f of filtradas) {
      if (!mapa.has(f.profesor_id)) {
        mapa.set(f.profesor_id, { profesor_id: f.profesor_id, profesor: f.profesor, documento: f.documento_identidad, actas: [] })
      }
      mapa.get(f.profesor_id).actas.push(f)
    }
    const lista = [...mapa.values()]
    for (const g of lista) g.actas.sort(ordenActa)
    return lista.sort((a, b) => a.profesor.localeCompare(b.profesor))
  }, [filtradas])

  const resumen = useMemo(() => {
    const base = filas.filter(
      (f) => (!profesorId || f.profesor_id === profesorId) && (!sede || f.sede_id === sede) && (!carrera || f.carrera_id === carrera),
    )
    const firmadas = base.filter((f) => f.firmado_en).length
    return {
      total: base.length,
      firmadas,
      pendientes: base.length - firmadas,
      sinNumero: new Set(base.filter((f) => f.numero_acta == null).map((f) => f.examen_fecha_id)).size,
    }
  }, [filas, profesorId, sede, carrera])

  const claveFila = (f) => `${f.examen_fecha_id}|${f.profesor_id}`

  const alternarFirma = async (f) => {
    const k = claveFila(f)
    setGuardando((s) => new Set(s).add(k))
    setError('')
    const { error: err } = f.firmado_en
      ? await supabase.from('acta_firma').delete().eq('examen_fecha_id', f.examen_fecha_id).eq('profesor_id', f.profesor_id)
      : await supabase.from('acta_firma').insert({ examen_fecha_id: f.examen_fecha_id, profesor_id: f.profesor_id })
    if (err) {
      setError(err.message)
    } else {
      const firmado = f.firmado_en ? null : new Date().toISOString()
      // La misma persona puede figurar dos veces en una mesa (presidente y
      // examinador): la firma es una sola por acta y profesor.
      setFilas((prev) => prev.map((x) => (claveFila(x) === k ? { ...x, firmado_en: firmado } : x)))
    }
    setGuardando((s) => {
      const n = new Set(s)
      n.delete(k)
      return n
    })
  }

  if (loading) return <p className="page-padding muted-text">Cargando...</p>

  const llamado = llamados.find((l) => l.id === llamadoId)

  return (
    <div className="page-padding af-page">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 1cm; }
          .af-grupo { break-inside: avoid; page-break-inside: avoid; }
          .af-tabla th, .af-tabla td { padding: 3px 5px !important; font-size: 10px !important; }
        }
        .af-solo-print { display: none; }
        @media print { .af-solo-print { display: revert !important; } }
        .af-grupo { margin-bottom: 24px; }
        .af-grupo h3 { margin: 0 0 6px; }
      `}</style>

      <div className="page-header no-print">
        <h1>Actas a firmar por profesor</h1>
        <p>
          Buscá al profesor por nombre o cédula para ver cada acta que tiene que firmar, con el número y la fecha del
          examen para ubicarla. Tildá la firma a medida que la completa. Sin profesor elegido, se listan todos (para
          imprimir el listado completo).
        </p>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="form-row no-print" style={{ marginBottom: 16, alignItems: 'flex-end' }}>
        <label>
          Llamado
          <select value={llamadoId} onChange={(e) => setLlamado(e.target.value)} style={{ display: 'block', minWidth: 220 }}>
            {llamados.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        </label>
        <label style={{ minWidth: 300 }}>
          Profesor
          <BuscadorSelect
            opciones={[{ value: '', label: 'Todos los profesores' }, ...opciones.profesores]}
            value={profesorId}
            onChange={setProfesorId}
            placeholder="Buscar por nombre o cédula..."
          />
        </label>
        {opciones.sedes.length > 1 && (
          <label>
            Sede
            <select value={sede} onChange={(e) => setSede(e.target.value)} style={{ display: 'block', minWidth: 180 }}>
              <option value="">Todas</option>
              {opciones.sedes.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {opciones.carreras.length > 1 && (
          <label>
            Carrera
            <select value={carrera} onChange={(e) => setCarrera(e.target.value)} style={{ display: 'block', minWidth: 160 }}>
              <option value="">Todas</option>
              {opciones.carreras.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Mostrar
          <select value={mostrar} onChange={(e) => setMostrar(e.target.value)} style={{ display: 'block' }}>
            {MOSTRAR.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary" disabled={grupos.length === 0} onClick={() => window.print()}>
          Imprimir
        </button>
      </div>

      {consultando ? (
        <p className="muted-text">Buscando...</p>
      ) : (
        <>
          <div className="stat-grid no-print" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-value">{resumen.pendientes}</div>
              <div className="stat-label">Firmas pendientes</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{resumen.firmadas}</div>
              <div className="stat-label">Firmadas</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{resumen.total}</div>
              <div className="stat-label">Firmas en total</div>
            </div>
          </div>

          {resumen.sinNumero > 0 && (
            <p className="error-text no-print">
              {resumen.sinNumero} acta{resumen.sinNumero > 1 ? 's' : ''} todavía sin número: Dirección Académica tiene
              que numerarlas.
            </p>
          )}

          <h2 className="af-solo-print" style={{ margin: '0 0 12px' }}>
            Actas a firmar — {llamado?.nombre}
          </h2>

          {grupos.length === 0 && (
            <p className="muted-text">
              {filas.length === 0 ? 'Este llamado no tiene mesas con fecha en tu alcance.' : 'No hay actas para mostrar con este filtro.'}
            </p>
          )}

          {grupos.map((g) => (
            <div key={g.profesor_id} className="af-grupo">
              <h3>
                {g.profesor} <span className="muted-text" style={{ fontWeight: 400 }}>· C.I. {g.documento}</span>
              </h3>
              <div className="data-table-wrap">
                <table className="data-table af-tabla">
                  <thead>
                    <tr>
                      <th style={{ width: 80 }}>N° Acta</th>
                      <th style={{ width: 110 }}>Fecha</th>
                      <th>Sede</th>
                      <th>Carrera</th>
                      <th style={{ width: 70 }}>Curso</th>
                      <th>Materia</th>
                      <th style={{ width: 90 }}>Rol</th>
                      <th style={{ width: 90 }}>Firmó</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.actas.map((f) => {
                      const k = claveFila(f)
                      return (
                        <tr key={`${k}|${f.rol}`}>
                          <td>
                            {f.numero_acta != null ? <strong>{f.numero_acta}</strong> : <span className="error-text">sin N°</span>}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatoLargo(f.fecha)}</td>
                          <td>{f.sede}</td>
                          <td>{f.carrera}</td>
                          <td>
                            {f.curso_nivel}º · {f.seccion_grupo}
                          </td>
                          <td>{f.materia}</td>
                          <td>{ROLES[f.rol] || f.rol}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {puedeEscribir ? (
                              <label className="no-print" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!f.firmado_en}
                                  disabled={guardando.has(k)}
                                  onChange={() => alternarFirma(f)}
                                />
                                {f.firmado_en ? 'Sí' : 'No'}
                              </label>
                            ) : (
                              <span className="no-print">{f.firmado_en ? 'Sí' : 'No'}</span>
                            )}
                            <span className="af-solo-print">{f.firmado_en ? '✓' : '☐'}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
