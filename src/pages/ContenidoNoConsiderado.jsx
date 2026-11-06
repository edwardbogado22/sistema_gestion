import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchTodo } from '../lib/paginar'
import { useAuth } from '../contexts/AuthContext'
import { formatoLargo } from '../lib/fechas'

// Peso de "Desarrollo pedagógico de las clases" en la foja
const PESO = 30
const MOTIVO_SUGERIDO = 'Justificación aceptada: falla de la plataforma de contenido programático'

const sinFiltro = { sede_id: '', carrera_id: '', estado: '', contenidoMenor: '', busqueda: '' }

const opcionesDe = (filas, valor, etiqueta) => {
  const mapa = new Map()
  for (const f of filas) {
    const v = valor(f)
    if (v != null && v !== '') mapa.set(String(v), etiqueta(f))
  }
  return [...mapa]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }))
}

const num = (v) => (v == null ? null : Number(v))
const pct = (v) => (v == null ? '—' : `${Number(v).toLocaleString('es-PY', { maximumFractionDigits: 1 })} %`)
const pts = (v) => v.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Puntaje de "Desarrollo pedagógico" (sobre 30), igual que la vista de la foja
const desarrollo = (asis, cont, considera) =>
  considera ? (((asis ?? 0) + (cont ?? 0)) / 2) * (PESO / 100) : (asis ?? 0) * (PESO / 100)

/**
 * Cátedras que no consideran el desarrollo de contenido programático en
 * la foja: con una justificación aceptada (p. ej. la falla de la
 * plataforma en 2025), "Desarrollo pedagógico" se calcula solo con la
 * asistencia a clases. Ver supabase/migracion_contenido_no_considerado.sql.
 */
export function ContenidoNoConsiderado() {
  const { esAdmin } = useAuth()
  const [catedras, setCatedras] = useState([])
  const [asistencia, setAsistencia] = useState({})
  const [contenido, setContenido] = useState({})
  const [noConsidera, setNoConsidera] = useState({})
  const [motivos, setMotivos] = useState({}) // motivo en edición por cátedra (al destildar)
  const [filtro, setFiltro] = useState(sinFiltro)
  const [filtroPeriodo, setFiltroPeriodo] = useState(null)
  const [motivoLote, setMotivoLote] = useState(MOTIVO_SUGERIDO)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const cargar = async () => {
    setError('')
    const res = await Promise.all([
      fetchTodo((desde, hasta) =>
        supabase
          .from('catedras')
          .select(
            'id, periodo_lectivo, seccion_grupo, sede_id, profesores(nombres, apellidos), asignaturas(nombre, curso_nivel, carrera_id, carreras(nombre)), sedes(nombre)',
          )
          .eq('activo', true)
          .order('id')
          .range(desde, hasta),
      ),
      fetchTodo((desde, hasta) =>
        supabase.from('asistencia_clases').select('catedra_id, porcentaje_asistencia').order('id').range(desde, hasta),
      ),
      fetchTodo((desde, hasta) =>
        supabase
          .from('cumplimiento_contenido')
          .select('catedra_id, unidades_programadas, unidades_desarrolladas, porcentaje_cumplimiento')
          .order('id')
          .range(desde, hasta),
      ),
      fetchTodo((desde, hasta) =>
        supabase
          .from('contenido_no_considerado')
          .select('catedra_id, motivo, registrado_en')
          .order('catedra_id')
          .range(desde, hasta),
      ),
    ])
    const err = res.find((r) => r.error)?.error
    if (err) setError(err.message)
    const [c, a, cc, nc] = res.map((r) => r.data || [])
    setCatedras(c)
    setAsistencia(Object.fromEntries(a.map((r) => [r.catedra_id, r])))
    setContenido(Object.fromEntries(cc.map((r) => [r.catedra_id, r])))
    setNoConsidera(Object.fromEntries(nc.map((r) => [r.catedra_id, r])))
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const periodos = useMemo(() => [...new Set(catedras.map((c) => c.periodo_lectivo))].sort().reverse(), [catedras])
  const periodo = filtroPeriodo ?? periodos[0] ?? ''

  const delPeriodo = useMemo(() => catedras.filter((c) => c.periodo_lectivo === periodo), [catedras, periodo])
  const opciones = useMemo(() => {
    const deSede = delPeriodo.filter((c) => !filtro.sede_id || c.sede_id === filtro.sede_id)
    return {
      sedes: opcionesDe(delPeriodo, (c) => c.sede_id, (c) => c.sedes?.nombre || ''),
      carreras: opcionesDe(deSede, (c) => c.asignaturas?.carrera_id, (c) => c.asignaturas?.carreras?.nombre || ''),
    }
  }, [delPeriodo, filtro.sede_id])

  const filas = useMemo(() => {
    const q = filtro.busqueda.trim().toLowerCase()
    const menor = filtro.contenidoMenor === '' ? null : Number(filtro.contenidoMenor)
    return delPeriodo
      .map((c) => {
        const asis = num(asistencia[c.id]?.porcentaje_asistencia)
        const cont = num(contenido[c.id]?.porcentaje_cumplimiento)
        const considera = !noConsidera[c.id]
        return { c, asis, cont, considera }
      })
      .filter(({ c, cont, considera }) => {
        if (filtro.sede_id && c.sede_id !== filtro.sede_id) return false
        if (filtro.carrera_id && c.asignaturas?.carrera_id !== filtro.carrera_id) return false
        if (filtro.estado === 'no' && considera) return false
        if (filtro.estado === 'si' && !considera) return false
        if (menor != null && (cont ?? 0) >= menor) return false
        if (!q) return true
        return [c.profesores?.nombres, c.profesores?.apellidos, c.asignaturas?.nombre].some((v) =>
          v?.toLowerCase().includes(q),
        )
      })
      .sort(
        (a, b) =>
          (a.c.profesores?.apellidos || '').localeCompare(b.c.profesores?.apellidos || '') ||
          (a.c.asignaturas?.nombre || '').localeCompare(b.c.asignaturas?.nombre || ''),
      )
  }, [delPeriodo, asistencia, contenido, noConsidera, filtro])

  const totalNoConsidera = delPeriodo.filter((c) => noConsidera[c.id]).length

  const setFiltroCampo = (campo, valor) =>
    setFiltro((f) => ({ ...f, [campo]: valor, ...(campo === 'sede_id' ? { carrera_id: '' } : {}) }))

  const marcar = async (ids, motivo) => {
    const { error: e } = await supabase
      .from('contenido_no_considerado')
      .upsert(
        ids.map((id) => ({ catedra_id: id, motivo })),
        { onConflict: 'catedra_id' },
      )
    return e
  }

  const noConsiderar = async (id) => {
    const motivo = (motivos[id] ?? '').trim()
    if (!motivo) {
      setError('Escribí el motivo de la justificación antes de guardar.')
      return
    }
    setGuardando(id)
    setError('')
    const e = await marcar([id], motivo)
    setGuardando(null)
    if (e) return setError(e.message)
    setMotivos((m) => {
      const n = { ...m }
      delete n[id]
      return n
    })
    cargar()
  }

  const volverAConsiderar = async (id) => {
    setGuardando(id)
    setError('')
    const { error: e } = await supabase.from('contenido_no_considerado').delete().eq('catedra_id', id)
    setGuardando(null)
    if (e) return setError(e.message)
    cargar()
  }

  const alCambiarCasilla = (id, considera) => {
    if (considera) {
      if (noConsidera[id]) volverAConsiderar(id)
      else
        setMotivos((m) => {
          const n = { ...m }
          delete n[id]
          return n
        })
    } else {
      setMotivos((m) => ({ ...m, [id]: MOTIVO_SUGERIDO }))
    }
  }

  const pendientesLote = filas.filter((f) => f.considera).map((f) => f.c.id)
  const aplicarLote = async () => {
    const motivo = motivoLote.trim()
    if (!motivo) return setError('Escribí el motivo de la justificación.')
    setGuardando('lote')
    setError('')
    const e = await marcar(pendientesLote, motivo)
    setGuardando(null)
    if (e) return setError(e.message)
    setAviso(`${pendientesLote.length} cátedras pasaron a no considerar el desarrollo de contenido.`)
    cargar()
  }

  if (loading) return <p className="page-padding muted-text">Cargando...</p>

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Desarrollo de contenido en la foja</h1>
        <p>
          Con una justificación aceptada, la cátedra no considera el desarrollo de contenido programático: "Desarrollo
          pedagógico de las clases" ({PESO}%) se calcula solo con la asistencia a clases. Los registros de contenido no
          se modifican y se puede volver a considerar en cualquier momento.
        </p>
      </div>

      {error && <p className="error-text">{error}</p>}
      {aviso && <p className="success-text">{aviso}</p>}

      <div className="form-row" style={{ marginBottom: 8, alignItems: 'center' }}>
        <select
          value={periodo}
          onChange={(e) => {
            setFiltroPeriodo(e.target.value)
            setFiltroCampo('sede_id', '')
          }}
          aria-label="Período"
        >
          {periodos.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={filtro.sede_id} onChange={(e) => setFiltroCampo('sede_id', e.target.value)} aria-label="Sede">
          <option value="">Todas las sedes</option>
          {opciones.sedes.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={filtro.carrera_id} onChange={(e) => setFiltroCampo('carrera_id', e.target.value)} aria-label="Carrera">
          <option value="">Todas las carreras</option>
          {opciones.carreras.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filtro.contenidoMenor}
          onChange={(e) => setFiltroCampo('contenidoMenor', e.target.value)}
          aria-label="Contenido"
        >
          <option value="">Cualquier % de contenido</option>
          {[30, 50, 60, 70].map((v) => (
            <option key={v} value={v}>
              Contenido menor a {v} %
            </option>
          ))}
        </select>
        <input
          value={filtro.busqueda}
          onChange={(e) => setFiltroCampo('busqueda', e.target.value)}
          placeholder="Profesor o materia..."
          style={{ minWidth: 200 }}
          aria-label="Buscar"
        />
        <button type="button" className="chip" onClick={() => setFiltro(sinFiltro)}>
          Limpiar filtros
        </button>
      </div>

      <div className="plan-anual-resumen">
        {[
          ['', `Todas · ${delPeriodo.length}`],
          ['no', `No considera contenido · ${totalNoConsidera}`],
          ['si', `Considera contenido · ${delPeriodo.length - totalNoConsidera}`],
        ].map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            className={`chip${filtro.estado === valor ? ' activo' : ''}`}
            aria-pressed={filtro.estado === valor}
            onClick={() => setFiltroCampo('estado', valor)}
          >
            {texto}
          </button>
        ))}
      </div>

      {esAdmin && pendientesLote.length > 0 && (filtro.contenidoMenor || filtro.busqueda || filtro.carrera_id) && (
        <div className="form-row" style={{ margin: '12px 0', alignItems: 'center' }}>
          <input
            value={motivoLote}
            onChange={(e) => setMotivoLote(e.target.value)}
            style={{ minWidth: 380 }}
            aria-label="Motivo para todas las filtradas"
          />
          <button type="button" className="btn btn-secondary" disabled={guardando === 'lote'} onClick={aplicarLote}>
            {guardando === 'lote' ? 'Guardando...' : `No considerar contenido en las ${pendientesLote.length} filtradas`}
          </button>
        </div>
      )}

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 90 }}>Considera contenido</th>
              <th>Profesor</th>
              <th>Asignatura</th>
              <th>Carrera</th>
              <th>Curso</th>
              <th>Sede</th>
              <th>Asistencia</th>
              <th>Contenido</th>
              <th title={`Puntaje sobre ${PESO}`}>Desarrollo pedagógico</th>
              <th>Justificación</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ c, asis, cont, considera }) => {
              const editando = motivos[c.id] !== undefined
              const tildada = considera && !editando
              const cc = contenido[c.id]
              const conContenido = desarrollo(asis, cont, true)
              const soloAsistencia = desarrollo(asis, cont, false)
              return (
                <tr key={c.id}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={tildada}
                      disabled={!esAdmin || guardando === c.id}
                      onChange={(e) => alCambiarCasilla(c.id, e.target.checked)}
                      aria-label="Considera desarrollo de contenido"
                    />
                  </td>
                  <td>
                    {c.profesores?.apellidos}, {c.profesores?.nombres}
                  </td>
                  <td>{c.asignaturas?.nombre}</td>
                  <td>{c.asignaturas?.carreras?.nombre}</td>
                  <td>
                    {c.asignaturas?.curso_nivel}º {c.seccion_grupo}
                  </td>
                  <td>{c.sedes?.nombre}</td>
                  <td>{pct(asis)}</td>
                  <td>
                    {pct(cont)}
                    {cc && (
                      <span className="muted-text" style={{ display: 'block', fontSize: 12 }}>
                        {cc.unidades_desarrolladas}/{cc.unidades_programadas} unid.
                      </span>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {considera ? (
                      <>
                        <strong>{pts(conContenido)}</strong>
                        {soloAsistencia > conContenido && (
                          <span className="muted-text" style={{ display: 'block', fontSize: 12 }}>
                            sin contenido: {pts(soloAsistencia)}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <strong>{pts(soloAsistencia)}</strong>
                        <span className="muted-text" style={{ display: 'block', fontSize: 12 }}>
                          antes: {pts(conContenido)}
                        </span>
                      </>
                    )}
                  </td>
                  <td>
                    {editando ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          value={motivos[c.id]}
                          onChange={(e) => setMotivos((m) => ({ ...m, [c.id]: e.target.value }))}
                          style={{ minWidth: 240 }}
                          aria-label="Motivo"
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={guardando === c.id}
                          onClick={() => noConsiderar(c.id)}
                        >
                          {guardando === c.id ? 'Guardando...' : 'Guardar'}
                        </button>
                      </div>
                    ) : noConsidera[c.id] ? (
                      <>
                        {noConsidera[c.id].motivo}
                        <span className="muted-text" style={{ display: 'block', fontSize: 12 }}>
                          {formatoLargo(noConsidera[c.id].registrado_en.slice(0, 10))}
                        </span>
                      </>
                    ) : (
                      <span className="muted-text">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {filas.length === 0 && (
              <tr>
                <td colSpan={10}>Ninguna cátedra coincide con los filtros.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
