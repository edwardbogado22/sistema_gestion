import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatoLargo } from '../../lib/fechas'

export function CapacitacionResultados() {
  const [eventos, setEventos] = useState([])
  const [periodos, setPeriodos] = useState([])
  const [claveSeleccionada, setClaveSeleccionada] = useState('')
  const [filas, setFilas] = useState({})
  const [loading, setLoading] = useState(true)
  const [cargandoFilas, setCargandoFilas] = useState(false)
  const [guardandoId, setGuardandoId] = useState(null)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [resultadosBusqueda, setResultadosBusqueda] = useState([])

  useEffect(() => {
    ;(async () => {
      const [{ data: ev }, { data: pa }] = await Promise.all([
        supabase.from('evento').select('*').eq('tipo', 'CAPACITACION_EVALUADA').order('fecha', { ascending: false }),
        supabase.from('periodo_academico').select('etiqueta_periodo_lectivo, fecha_inicio, fecha_fin'),
      ])
      setEventos(ev || [])
      setPeriodos(pa || [])
      setLoading(false)
    })()
  }, [])

  const grupos = useMemo(() => {
    const mapa = new Map()
    for (const e of eventos) {
      const clave = e.grupo || e.id
      if (!mapa.has(clave)) mapa.set(clave, { clave, nombre: e.grupo || e.nombre, eventos: [] })
      mapa.get(clave).eventos.push(e)
    }
    return [...mapa.values()].sort(
      (a, b) => Math.max(...b.eventos.map((e) => new Date(e.fecha).getTime())) - Math.max(...a.eventos.map((e) => new Date(e.fecha).getTime())),
    )
  }, [eventos])

  const grupoSel = grupos.find((g) => g.clave === claveSeleccionada)

  const periodoDe = (fecha) => periodos.find((p) => fecha >= p.fecha_inicio && fecha <= p.fecha_fin)?.etiqueta_periodo_lectivo || null

  const periodoLectivo = grupoSel ? periodoDe(grupoSel.eventos[0].fecha) : null

  useEffect(() => {
    if (!grupoSel) {
      setFilas({})
      return
    }
    ;(async () => {
      setCargandoFilas(true)
      setError('')
      const eventoIds = grupoSel.eventos.map((e) => e.id)
      const [{ data: asistencias, error: e1 }, { data: resultados, error: e2 }] = await Promise.all([
        supabase
          .from('evento_asistencia_registro')
          .select('profesor_id, profesores(id, nombres, apellidos, documento_identidad)')
          .in('evento_id', eventoIds),
        periodoLectivo
          ? supabase.from('capacitacion_resultado').select('*').eq('clave_capacitacion', grupoSel.clave).eq('periodo_lectivo', periodoLectivo)
          : Promise.resolve({ data: [] }),
      ])
      const err = e1 || e2
      if (err) {
        setError(err.message)
        setCargandoFilas(false)
        return
      }

      const nuevas = {}
      for (const a of asistencias || []) {
        if (!a.profesores) continue
        nuevas[a.profesor_id] = { profesor: a.profesores, aprobado: false, porcentaje: '', nota: '', resolucion: '', existente: false }
      }
      for (const r of resultados || []) {
        nuevas[r.profesor_id] = {
          ...(nuevas[r.profesor_id] || {}),
          aprobado: r.aprobado,
          porcentaje: r.aprobado ? '' : String(r.porcentaje_obtenido),
          nota: r.nota != null ? String(r.nota) : '',
          resolucion: r.resolucion || '',
          existente: true,
        }
      }
      setFilas(nuevas)
      setCargandoFilas(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveSeleccionada, periodoLectivo])

  const buscarProfesor = async () => {
    const q = busqueda.trim()
    if (!q) return
    const { data } = await supabase
      .from('profesores')
      .select('id, nombres, apellidos, documento_identidad')
      .or(`documento_identidad.ilike.%${q}%,nombres.ilike.%${q}%,apellidos.ilike.%${q}%`)
      .order('apellidos')
      .limit(10)
    setResultadosBusqueda(data || [])
  }

  const agregarProfesor = (p) => {
    setFilas((f) => ({
      ...f,
      [p.id]: f[p.id] || { profesor: p, aprobado: false, porcentaje: '', nota: '', resolucion: '', existente: false },
    }))
    setBusqueda('')
    setResultadosBusqueda([])
  }

  const setCampo = (profesorId, campo, valor) => {
    setFilas((f) => ({ ...f, [profesorId]: { ...f[profesorId], [campo]: valor } }))
  }

  const guardar = async (profesorId) => {
    const fila = filas[profesorId]
    if (!periodoLectivo) {
      setError('No se pudo determinar el período lectivo de esta capacitación (revisá Configuración → Períodos).')
      return
    }
    setGuardandoId(profesorId)
    setError('')
    const porcentaje = fila.aprobado ? 100 : Number(fila.porcentaje || 0)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error: eErr } = await supabase.from('capacitacion_resultado').upsert(
      {
        profesor_id: profesorId,
        clave_capacitacion: grupoSel.clave,
        periodo_lectivo: periodoLectivo,
        aprobado: fila.aprobado,
        porcentaje_obtenido: porcentaje,
        nota: fila.nota !== '' ? Number(fila.nota) : null,
        resolucion: fila.resolucion || null,
        registrado_por: user?.id,
      },
      { onConflict: 'profesor_id,clave_capacitacion,periodo_lectivo' },
    )
    setGuardandoId(null)
    if (eErr) {
      setError(eErr.message)
      return
    }
    setFilas((f) => ({ ...f, [profesorId]: { ...f[profesorId], existente: true } }))
  }

  if (loading) return <p className="page-padding muted-text">Cargando...</p>

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Cargar Resultados de Capacitación</h1>
        <p>Aprobado = puntaje pleno. Participación parcial = el % que determine Dirección Académica según la resolución.</p>
      </div>

      <div className="form-row" style={{ marginBottom: 20 }}>
        <label style={{ minWidth: 320 }}>
          Capacitación evaluada
          <select value={claveSeleccionada} onChange={(e) => setClaveSeleccionada(e.target.value)}>
            <option value="">Seleccionar...</option>
            {grupos.map((g) => (
              <option key={g.clave} value={g.clave}>
                {g.nombre} ({g.eventos.length} sesión{g.eventos.length > 1 ? 'es' : ''})
              </option>
            ))}
          </select>
        </label>
      </div>

      {grupos.length === 0 && (
        <p className="muted-text">
          No hay capacitaciones evaluadas cargadas. Marcá un evento como "Capacitación evaluada" en Gestión de Eventos.
        </p>
      )}

      {grupoSel && !periodoLectivo && (
        <p className="error-text">
          Esta capacitación no cae dentro de ningún período lectivo configurado — no se puede guardar el resultado hasta
          que exista un período con esa fecha.
        </p>
      )}

      {grupoSel && (
        <>
          <div className="form-row" style={{ marginBottom: 20 }}>
            <label style={{ flex: '1 1 260px' }}>
              Agregar profesor manualmente (documento o nombre)
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscarProfesor()}
                placeholder="Para sumar a alguien que no aparece en la lista..."
              />
            </label>
            <button type="button" className="btn btn-secondary" onClick={buscarProfesor}>
              Buscar
            </button>
          </div>

          {resultadosBusqueda.length > 0 && (
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
                  {resultadosBusqueda.map((p) => (
                    <tr key={p.id}>
                      <td>{p.documento_identidad}</td>
                      <td>
                        {p.apellidos}, {p.nombres}
                      </td>
                      <td>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => agregarProfesor(p)}>
                          Agregar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error && <p className="error-text">{error}</p>}

          {cargandoFilas ? (
            <p className="muted-text">Cargando...</p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Profesor</th>
                    <th>Documento</th>
                    <th style={{ width: 90 }}>Aprobado</th>
                    <th style={{ width: 120 }}>% participación</th>
                    <th style={{ width: 100 }}>Nota</th>
                    <th>Resolución</th>
                    <th style={{ width: 90 }}>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(filas).map(([profesorId, fila]) => (
                    <tr key={profesorId}>
                      <td>
                        {fila.profesor.apellidos}, {fila.profesor.nombres}
                      </td>
                      <td>{fila.profesor.documento_identidad}</td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={fila.aprobado}
                          onChange={(e) => setCampo(profesorId, 'aprobado', e.target.checked)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          disabled={fila.aprobado}
                          value={fila.aprobado ? '100' : fila.porcentaje}
                          onChange={(e) => setCampo(profesorId, 'porcentaje', e.target.value)}
                        />
                      </td>
                      <td>
                        <input type="number" step="0.01" value={fila.nota} onChange={(e) => setCampo(profesorId, 'nota', e.target.value)} />
                      </td>
                      <td>
                        <input
                          value={fila.resolucion}
                          onChange={(e) => setCampo(profesorId, 'resolucion', e.target.value)}
                          placeholder="N° de resolución (opcional)"
                        />
                      </td>
                      <td>
                        {fila.existente ? (
                          <span className="badge badge-success">Guardado</span>
                        ) : (
                          <span className="badge badge-muted">Sin cargar</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={guardandoId === profesorId}
                          onClick={() => guardar(profesorId)}
                        >
                          {guardandoId === profesorId ? 'Guardando...' : 'Guardar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {Object.keys(filas).length === 0 && (
                    <tr>
                      <td colSpan={8}>Nadie asistió a ninguna sesión todavía. Usá el buscador para agregar manualmente.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <p className="muted-text" style={{ marginTop: 12 }}>
            Sesiones: {grupoSel.eventos.map((e) => formatoLargo(e.fecha)).join(', ')} · Período: {periodoLectivo || '—'}
          </p>
        </>
      )}
    </div>
  )
}
