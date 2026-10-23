import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatoLargo } from '../../lib/fechas'
import { descargarFilas } from '../../lib/csv'
import { fetchTodo } from '../../lib/paginar'

const TIPOS = [
  { value: 'REUNION', label: 'Reunión / Claustro' },
  { value: 'CAPACITACION_EVALUADA', label: 'Capacitación evaluada' },
  { value: 'CAPACITACION_NO_EVALUADA', label: 'Capacitación no evaluada' },
]

const anioDe = (e) => String(e.fecha || '').slice(0, 4)

const normalizar = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function ReporteEventos() {
  const [eventos, setEventos] = useState([])
  const [registros, setRegistros] = useState(null)
  const [conCatedra, setConCatedra] = useState(null)
  const [anio, setAnio] = useState('')
  const [tipo, setTipo] = useState('')
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [agrupar, setAgrupar] = useState(true)
  const [incluirAusentes, setIncluirAusentes] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState('')

  // Eventos y asistencias se traen una sola vez (son pocos miles de filas):
  // los filtros y la selección se recalculan en el momento, sin volver a
  // consultar. Las asistencias superan las 1000 filas: paginar.
  useEffect(() => {
    ;(async () => {
      const [{ data: ev, error: e1 }, { data: regs, error: e2 }] = await Promise.all([
        supabase.from('evento').select('*').order('fecha', { ascending: false }),
        fetchTodo((desde, hasta) =>
          supabase
            .from('evento_asistencia_registro')
            .select('id, fecha_hora, evento_id, profesores(id, nombres, apellidos, documento_identidad)')
            .order('id')
            .range(desde, hasta),
        ),
      ])
      if (e1 || e2) {
        setError((e1 || e2).message)
        return
      }
      const lista = ev || []
      setEventos(lista)
      setRegistros(regs || [])
      const ultimo = lista.map(anioDe).sort().pop() || ''
      setAnio(ultimo)
      setSeleccionados(new Set(lista.filter((e) => anioDe(e) === ultimo).map((e) => e.id)))
    })()
  }, [])

  // Docentes con alguna cátedra activa, para listar también a quienes no
  // asistieron a nada. Solo se piden si se marca la opción.
  useEffect(() => {
    if (!incluirAusentes || conCatedra) return
    ;(async () => {
      const { data, error: eErr } = await fetchTodo((desde, hasta) =>
        supabase
          .from('catedras')
          .select('id, profesores(id, nombres, apellidos, documento_identidad)')
          .eq('activo', true)
          .order('id')
          .range(desde, hasta),
      )
      if (eErr) {
        setError(eErr.message)
        return
      }
      const mapa = new Map()
      for (const c of data || []) if (c.profesores) mapa.set(c.profesores.id, c.profesores)
      setConCatedra([...mapa.values()])
    })()
  }, [incluirAusentes, conCatedra])

  const anios = useMemo(() => [...new Set(eventos.map(anioDe))].sort().reverse(), [eventos])

  const visibles = useMemo(
    () => eventos.filter((e) => (!anio || anioDe(e) === anio) && (!tipo || e.tipo === tipo)),
    [eventos, anio, tipo],
  )

  // Al cambiar año o tipo se marcan todos los eventos que quedan a la vista.
  const cambiarFiltro = (nuevoAnio, nuevoTipo) => {
    setAnio(nuevoAnio)
    setTipo(nuevoTipo)
    setSeleccionados(
      new Set(eventos.filter((e) => (!nuevoAnio || anioDe(e) === nuevoAnio) && (!nuevoTipo || e.tipo === nuevoTipo)).map((e) => e.id)),
    )
  }

  // Lista de la izquierda: agrupada por "grupo" para marcar/desmarcar juntos.
  const gruposLista = useMemo(() => {
    const mapa = new Map()
    for (const e of visibles) {
      const key = e.grupo || `__solo_${e.id}`
      if (!mapa.has(key)) mapa.set(key, { key, nombre: e.grupo || e.nombre, esGrupo: !!e.grupo, eventos: [] })
      mapa.get(key).eventos.push(e)
    }
    return [...mapa.values()]
  }, [visibles])

  const marcar = (ids, valor) => {
    setSeleccionados((s) => {
      const nuevo = new Set(s)
      for (const id of ids) {
        if (valor) nuevo.add(id)
        else nuevo.delete(id)
      }
      return nuevo
    })
  }

  // Columnas del reporte, en orden cronológico. Con "agrupar", los eventos
  // de un mismo grupo cuentan como uno: asistir a cualquiera es presente
  // (reuniones con fecha de recuperación).
  const columnas = useMemo(() => {
    const elegidos = visibles.filter((e) => seleccionados.has(e.id)).sort((a, b) => a.fecha.localeCompare(b.fecha))
    const mapa = new Map()
    for (const e of elegidos) {
      const key = agrupar && e.grupo ? `g:${anioDe(e)}:${e.grupo}` : e.id
      if (!mapa.has(key)) mapa.set(key, { key, nombre: agrupar && e.grupo ? e.grupo : e.nombre, anio: anioDe(e), eventos: [] })
      mapa.get(key).eventos.push(e)
    }
    return [...mapa.values()]
  }, [visibles, seleccionados, agrupar])

  const aniosColumnas = useMemo(() => [...new Set(columnas.map((c) => c.anio))].sort(), [columnas])

  const filas = useMemo(() => {
    if (!registros) return []
    const idsElegidos = new Set(columnas.flatMap((c) => c.eventos.map((e) => e.id)))
    const porProfesor = new Map()
    const agregar = (p) => {
      if (!porProfesor.has(p.id)) porProfesor.set(p.id, { profesor: p, asistidos: new Map() })
      return porProfesor.get(p.id)
    }
    for (const r of registros) {
      if (!r.profesores || !idsElegidos.has(r.evento_id)) continue
      agregar(r.profesores).asistidos.set(r.evento_id, r.fecha_hora)
    }
    if (incluirAusentes) for (const p of conCatedra || []) agregar(p)

    return [...porProfesor.values()]
      .map((f) => {
        const presencia = columnas.map((c) => c.eventos.some((e) => f.asistidos.has(e.id)))
        const porAnio = aniosColumnas.map((a) => {
          const idx = columnas.map((c, i) => (c.anio === a ? i : -1)).filter((i) => i >= 0)
          return { anio: a, asistio: idx.filter((i) => presencia[i]).length, de: idx.length }
        })
        const asistio = presencia.filter(Boolean).length
        return { ...f, presencia, porAnio, asistio }
      })
      .sort((a, b) =>
        `${a.profesor.apellidos} ${a.profesor.nombres}`.localeCompare(`${b.profesor.apellidos} ${b.profesor.nombres}`, 'es'),
      )
  }, [registros, columnas, aniosColumnas, incluirAusentes, conCatedra])

  const filasVisibles = useMemo(() => {
    const q = normalizar(busqueda.trim())
    if (!q) return filas
    return filas.filter(
      (f) =>
        normalizar(`${f.profesor.apellidos} ${f.profesor.nombres}`).includes(q) ||
        String(f.profesor.documento_identidad || '').includes(q),
    )
  }, [filas, busqueda])

  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)

  const exportarCSV = () => {
    if (!filasVisibles.length) return
    descargarFilas(
      `asistencia-eventos_${anio || 'todos'}_${new Date().toISOString().slice(0, 10)}.csv`,
      filasVisibles.map((f) => {
        const fila = {
          documento: f.profesor.documento_identidad,
          profesor: `${f.profesor.apellidos}, ${f.profesor.nombres}`,
        }
        columnas.forEach((c, i) => {
          fila[`${c.anio} ${c.nombre}`] = f.presencia[i] ? 'SI' : 'NO'
        })
        if (aniosColumnas.length > 1) for (const a of f.porAnio) fila[`asistencias_${a.anio}`] = `${a.asistio}/${a.de}`
        fila.asistencias = `${f.asistio}/${columnas.length}`
        fila.porcentaje = pct(f.asistio, columnas.length)
        return fila
      }),
    )
  }

  const tipoLabel = TIPOS.find((t) => t.value === tipo)?.label

  return (
    <div className="page-padding">
      <div className="page-header no-print">
        <h1>Reporte de Asistencia a Eventos</h1>
      </div>

      <div className="form-card no-print" style={{ marginBottom: 20 }}>
        <div className="form-row">
          <label>
            Año
            <select value={anio} onChange={(e) => cambiarFiltro(e.target.value, tipo)}>
              <option value="">Todos los años</option>
              {anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo de evento
            <select value={tipo} onChange={(e) => cambiarFiltro(anio, e.target.value)}>
              <option value="">Todos los tipos</option>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 8px' }}>
          <span className="muted-text">
            Eventos a incluir ({visibles.filter((e) => seleccionados.has(e.id)).length} de {visibles.length})
          </span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="chip" onClick={() => marcar(visibles.map((e) => e.id), true)}>
              Todos
            </button>
            <button type="button" className="chip" onClick={() => marcar(visibles.map((e) => e.id), false)}>
              Ninguno
            </button>
          </span>
        </div>
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
          {gruposLista.map((g) => (
            <div key={g.key} style={{ marginBottom: 8 }}>
              {g.esGrupo && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span className="badge badge-gold">
                    {g.nombre} ({g.eventos.length})
                  </span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="chip" onClick={() => marcar(g.eventos.map((e) => e.id), true)}>
                      Todo
                    </button>
                    <button type="button" className="chip" onClick={() => marcar(g.eventos.map((e) => e.id), false)}>
                      Nada
                    </button>
                  </span>
                </div>
              )}
              {g.eventos.map((e) => (
                <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: g.esGrupo ? 16 : 0, marginBottom: 2 }}>
                  <input type="checkbox" checked={seleccionados.has(e.id)} onChange={() => marcar([e.id], !seleccionados.has(e.id))} />
                  {e.nombre} <span className="muted-text">— {formatoLargo(e.fecha)}</span>
                  {!e.activo && <span className="badge badge-muted">Inactivo</span>}
                </label>
              ))}
            </div>
          ))}
          {eventos.length > 0 && gruposLista.length === 0 && <p className="muted-text">No hay eventos con esos filtros.</p>}
          {eventos.length === 0 && !error && <p className="muted-text">Cargando eventos...</p>}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} />
            Contar los eventos de un mismo grupo como uno solo
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={incluirAusentes} onChange={(e) => setIncluirAusentes(e.target.checked)} />
            Incluir docentes con cátedra activa que no asistieron
          </label>
        </div>

        <div className="form-row" style={{ marginTop: 12 }}>
          <label style={{ flex: '1 1 260px' }}>
            Buscar profesor
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Apellido, nombre o cédula..." />
          </label>
        </div>

        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={exportarCSV} disabled={!filasVisibles.length}>
            Descargar CSV
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()} disabled={!filasVisibles.length}>
            Imprimir
          </button>
        </div>
      </div>

      {registros && columnas.length === 0 && <p className="muted-text">Seleccioná al menos un evento.</p>}
      {registros && columnas.length > 0 && filasVisibles.length === 0 && (
        <p className="muted-text">No hay docentes que coincidan con la selección.</p>
      )}

      {registros && columnas.length > 0 && filasVisibles.length > 0 && (
        <div className="foja-card">
          <div className="foja-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <img src="/escudo-une.png" alt="Escudo UNE" className="foja-escudo" />
            <div>
              <p className="eyebrow" style={{ color: 'var(--gold)' }}>
                Universidad Nacional del Este
              </p>
              <h2 style={{ margin: '2px 0' }}>Facultad de Ciencias Económicas</h2>
              <p className="muted-text" style={{ margin: 0 }}>
                Asistencia a Eventos por Profesor{anio ? ` — ${anio}` : ''}
                {tipoLabel ? ` — ${tipoLabel}` : ''}
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
                  <strong>Docentes:</strong> {filasVisibles.length}
                </td>
                <td>
                  <strong>Con asistencia completa:</strong> {filasVisibles.filter((f) => f.asistio === columnas.length).length}
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
                    <th key={c.key} title={c.eventos.map((e) => `${e.nombre} (${formatoLargo(e.fecha)})`).join('\n')}>
                      {c.nombre}
                      <div className="muted-text" style={{ fontWeight: 'normal', fontSize: '0.8em' }}>
                        {c.eventos.length > 1 ? `${c.eventos.length} fechas · ${c.anio}` : formatoLargo(c.eventos[0].fecha)}
                      </div>
                    </th>
                  ))}
                  {aniosColumnas.length > 1 && aniosColumnas.map((a) => <th key={a}>Total {a}</th>)}
                  <th>Total</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {filasVisibles.map((f) => (
                  <tr key={f.profesor.id}>
                    <td>
                      {f.profesor.apellidos}, {f.profesor.nombres}
                    </td>
                    <td>{f.profesor.documento_identidad}</td>
                    {f.presencia.map((presente, i) => (
                      <td key={columnas[i].key} style={{ textAlign: 'center' }}>
                        {presente ? '✓' : ''}
                      </td>
                    ))}
                    {aniosColumnas.length > 1 &&
                      f.porAnio.map((a) => (
                        <td key={a.anio} style={{ textAlign: 'center' }}>
                          {a.asistio}/{a.de}
                        </td>
                      ))}
                    <td style={{ textAlign: 'center' }}>
                      {f.asistio}/{columnas.length}
                    </td>
                    <td style={{ textAlign: 'center' }}>{pct(f.asistio, columnas.length)} %</td>
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
