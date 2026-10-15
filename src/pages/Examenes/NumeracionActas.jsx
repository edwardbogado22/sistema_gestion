import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fetchTodo } from '../../lib/paginar'

const claveBloque = (b) => `${b.sede_id}|${b.carrera_id}`

/**
 * Numeración de actas de un llamado. Dirección Académica indica el primer
 * número y el orden de sede/carrera; acta_numerar() asigna el correlativo
 * en el orden del Reporte de Mesas (curso, sección, fecha, materia) dentro
 * de cada sede/carrera. Ese número es el que va adelante de cada mesa en
 * el reporte y el que la Secretaría usa para ubicar el acta a firmar.
 */
export function NumeracionActas() {
  const { llamadoId } = useParams()
  const [llamado, setLlamado] = useState(null)
  const [mesas, setMesas] = useState([])
  const [actas, setActas] = useState(new Map())
  const [secuencia, setSecuencia] = useState([])
  const [agregar, setAgregar] = useState('')
  const [inicio, setInicio] = useState('')
  const [loading, setLoading] = useState(true)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const cargar = useCallback(async () => {
    const [{ data: ll, error: eLl }, { data: agenda, error: eAg }, { data: nums, error: eNum }] = await Promise.all([
      supabase.from('examen_llamado').select('id, nombre, estado').eq('id', llamadoId).single(),
      fetchTodo((desde, hasta) =>
        supabase
          .from('v_examen_agenda')
          .select('examen_fecha_id, sede_id, sede, carrera_id, carrera, fecha_estado')
          .eq('llamado_id', llamadoId)
          .not('fecha', 'is', null)
          .order('catedra_id')
          .range(desde, hasta),
      ),
      fetchTodo((desde, hasta) =>
        supabase
          .from('examen_acta')
          .select('examen_fecha_id, numero')
          .eq('llamado_id', llamadoId)
          .order('examen_fecha_id')
          .range(desde, hasta),
      ),
    ])
    const err = eLl || eAg || eNum
    if (err) {
      setError(err.message)
      return
    }
    setLlamado(ll)
    setMesas((agenda || []).filter((m) => m.fecha_estado !== 'ANULADA'))
    setActas(new Map((nums || []).map((n) => [n.examen_fecha_id, n.numero])))
  }, [llamadoId])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      await cargar()
      setLoading(false)
    })()
  }, [cargar])

  // Una fila por sede/carrera con cuántas mesas tiene y qué rango de
  // números ya le tocó.
  const bloques = useMemo(() => {
    const mapa = new Map()
    for (const m of mesas) {
      const k = claveBloque(m)
      if (!mapa.has(k)) {
        mapa.set(k, { sede_id: m.sede_id, carrera_id: m.carrera_id, sede: m.sede, carrera: m.carrera, mesas: 0, numeros: [] })
      }
      const b = mapa.get(k)
      b.mesas++
      const n = actas.get(m.examen_fecha_id)
      if (n != null) b.numeros.push(n)
    }
    return [...mapa.values()]
      .map((b) => ({
        ...b,
        numeradas: b.numeros.length,
        desde: b.numeros.length ? Math.min(...b.numeros) : null,
        hasta: b.numeros.length ? Math.max(...b.numeros) : null,
      }))
      .sort((a, b) => a.sede.localeCompare(b.sede) || a.carrera.localeCompare(b.carrera))
  }, [mesas, actas])

  const maxNumero = useMemo(() => Math.max(0, ...actas.values()), [actas])

  // Sugerir el número siguiente al último asignado, sin pisar lo que el
  // usuario ya haya escrito.
  useEffect(() => {
    if (!loading && inicio === '') setInicio(String(maxNumero + 1))
  }, [loading, maxNumero, inicio])

  const enSecuencia = new Set(secuencia.map(claveBloque))
  const disponibles = bloques.filter((b) => !enSecuencia.has(claveBloque(b)))

  const vistaPrevia = useMemo(() => {
    const filas = []
    let n = Number(inicio) || 0
    for (const s of secuencia) {
      const b = bloques.find((x) => claveBloque(x) === claveBloque(s))
      filas.push({ ...b, desde: n, hasta: n + (b?.mesas || 0) - 1 })
      n += b?.mesas || 0
    }
    return filas
  }, [secuencia, bloques, inicio])

  const agregarBloque = (k) => {
    const b = bloques.find((x) => claveBloque(x) === k)
    if (b) setSecuencia([...secuencia, { sede_id: b.sede_id, carrera_id: b.carrera_id }])
    setAgregar('')
  }

  const mover = (i, delta) => {
    const j = i + delta
    if (j < 0 || j >= secuencia.length) return
    const next = [...secuencia]
    ;[next[i], next[j]] = [next[j], next[i]]
    setSecuencia(next)
  }

  const numerar = async () => {
    setError('')
    setOk('')
    const desde = Number(inicio)
    if (!Number.isInteger(desde) || desde < 1) {
      setError('Indicá un número inicial válido.')
      return
    }
    if (secuencia.length === 0) {
      setError('Agregá al menos una sede/carrera a la secuencia.')
      return
    }
    const yaNumeradas = vistaPrevia.filter((b) => b.numeradas > 0)
    if (
      yaNumeradas.length > 0 &&
      !confirm(
        `${yaNumeradas.map((b) => `${b.sede} · ${b.carrera}`).join(', ')} ya ${yaNumeradas.length > 1 ? 'tienen' : 'tiene'} actas numeradas. Se van a renumerar. ¿Continuar?`,
      )
    )
      return

    setTrabajando(true)
    const { data, error: err } = await supabase.rpc('acta_numerar', {
      p_llamado: llamadoId,
      p_inicio: desde,
      p_bloques: secuencia,
    })
    setTrabajando(false)
    if (err) {
      setError(err.message)
      return
    }
    setOk(`Actas numeradas del N° ${desde} al N° ${data}.`)
    setSecuencia([])
    setInicio(String(data + 1))
    await cargar()
  }

  const quitar = async (b) => {
    if (!confirm(`¿Quitar la numeración de ${b.sede} · ${b.carrera} (${b.numeradas} actas)?`)) return
    setError('')
    setOk('')
    const { error: err } = await supabase.rpc('acta_quitar_numeracion', {
      p_llamado: llamadoId,
      p_sede: b.sede_id,
      p_carrera: b.carrera_id,
    })
    if (err) {
      setError(err.message)
      return
    }
    setOk(`Se quitó la numeración de ${b.sede} · ${b.carrera}.`)
    await cargar()
  }

  if (loading) return <p className="page-padding muted-text">Cargando...</p>

  const totalMesas = mesas.length
  const totalNumeradas = mesas.filter((m) => actas.has(m.examen_fecha_id)).length

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Numeración de actas</h1>
        <p>
          {llamado?.nombre} — {totalNumeradas} de {totalMesas} mesas con número de acta. Indicá el primer número y el
          orden de sede/carrera en que sigue la secuencia; dentro de cada una se numera en el orden del reporte de mesas
          (curso, sección, fecha, materia).
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to={`/examenes/${llamadoId}/mesas-reporte`} className="btn btn-secondary btn-sm">
            Reporte de mesas
          </Link>
          <Link to={`/examenes/actas-firmas?llamado=${llamadoId}`} className="btn btn-secondary btn-sm">
            Actas por profesor
          </Link>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {ok && <p className="muted-text">{ok}</p>}

      <div className="stat-card" style={{ textAlign: 'left', marginBottom: 24 }}>
        <div className="section-label">
          <span>Nueva numeración</span>
        </div>
        <div className="form-row" style={{ alignItems: 'flex-end' }}>
          <label>
            Primer número
            <input
              type="number"
              min={1}
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              style={{ display: 'block', width: 120 }}
            />
          </label>
          <label style={{ minWidth: 280 }}>
            Agregar sede/carrera a la secuencia
            <select value={agregar} onChange={(e) => agregarBloque(e.target.value)} style={{ display: 'block' }}>
              <option value="">Seleccionar...</option>
              {disponibles.map((b) => (
                <option key={claveBloque(b)} value={claveBloque(b)}>
                  {b.sede} · {b.carrera} ({b.mesas} mesas)
                </option>
              ))}
            </select>
          </label>
        </div>

        {vistaPrevia.length > 0 && (
          <div className="data-table-wrap" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>Orden</th>
                  <th>Sede</th>
                  <th>Carrera</th>
                  <th>Mesas</th>
                  <th>Actas</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vistaPrevia.map((b, i) => (
                  <tr key={claveBloque(b)}>
                    <td>{i + 1}</td>
                    <td>{b.sede}</td>
                    <td>{b.carrera}</td>
                    <td>{b.mesas}</td>
                    <td>
                      N° {b.desde} a N° {b.hasta}
                      {b.numeradas > 0 && <div className="muted-text" style={{ fontSize: 12 }}>Se renumera</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={i === 0} onClick={() => mover(i, -1)}>
                        ↑
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={i === vistaPrevia.length - 1}
                        onClick={() => mover(i, 1)}
                      >
                        ↓
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSecuencia(secuencia.filter((_, k) => k !== i))}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="form-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-primary" disabled={trabajando || secuencia.length === 0} onClick={numerar}>
            {trabajando ? 'Numerando...' : 'Numerar actas'}
          </button>
        </div>
      </div>

      <div className="section-label">
        <span>Estado por sede y carrera</span>
      </div>
      {bloques.length === 0 ? (
        <p className="muted-text">Este llamado todavía no tiene mesas con fecha asignada.</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sede</th>
                <th>Carrera</th>
                <th>Mesas</th>
                <th>Numeradas</th>
                <th>Actas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bloques.map((b) => (
                <tr key={claveBloque(b)}>
                  <td>{b.sede}</td>
                  <td>{b.carrera}</td>
                  <td>{b.mesas}</td>
                  <td>
                    <span className={`badge ${b.numeradas === b.mesas ? 'badge-success' : 'badge-muted'}`}>
                      {b.numeradas} de {b.mesas}
                    </span>
                  </td>
                  <td>{b.desde != null ? `N° ${b.desde} a N° ${b.hasta}` : '—'}</td>
                  <td>
                    {b.numeradas > 0 && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => quitar(b)}>
                        Quitar numeración
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
