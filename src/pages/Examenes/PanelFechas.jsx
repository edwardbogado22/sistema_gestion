import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { BuscadorSelect } from '../../components/BuscadorSelect'
import { CalendarioRango } from '../../components/CalendarioRango'
import { formatoLargo } from '../../lib/fechas'
import { descargarFilas } from '../../lib/csv'

const sinFiltro = {
  carrera_id: '',
  sede_id: '',
  curso_nivel: '',
  seccion_grupo: '',
  asignatura_id: '',
  profesor_id: '',
  soloSinFecha: false,
}

export function PanelFechas() {
  const { llamadoId } = useParams()
  const { puedeEscribir } = useAuth()
  const [filas, setFilas] = useState([])
  const [bloqueados, setBloqueados] = useState([])
  const [conflictos, setConflictos] = useState([])
  const [noDisponible, setNoDisponible] = useState([])
  const [ocupadoProfesor, setOcupadoProfesor] = useState([])
  const [filtro, setFiltro] = useState(sinFiltro)
  const [cambios, setCambios] = useState({})
  const [filaEstado, setFilaEstado] = useState({})
  const [filaError, setFilaError] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const tokenPorFila = useRef({})
  const draftKey = `examen-fechas-draft-${llamadoId}`

  const cargar = async () => {
    setLoading(true)
    // dias_bloqueados_llamado expande los feriados recurrentes al año
    // que corresponde y suma los domingos y las excepciones puntuales.
    const [ag, exc, con, nd, ocup] = await Promise.all([
      supabase.from('v_examen_agenda').select('*').eq('llamado_id', llamadoId),
      supabase.rpc('dias_bloqueados_llamado', { p_llamado: llamadoId }),
      supabase.from('v_examen_conflictos').select('*').eq('llamado_id', llamadoId),
      supabase.from('profesor_no_disponible').select('profesor_id, fecha').eq('llamado_id', llamadoId),
      supabase.rpc('examen_fechas_profesor_llamado', { p_llamado: llamadoId }),
    ])
    const err = ag.error || exc.error || con.error || nd.error || ocup.error
    if (err) setError(err.message)
    setFilas(ag.data || [])
    setBloqueados(exc.data || [])
    setConflictos(con.data || [])
    setNoDisponible(nd.data || [])
    setOcupadoProfesor(ocup.data || [])
    setLoading(false)
  }

  const refrescarAuxiliares = async () => {
    const [con, ocup] = await Promise.all([
      supabase.from('v_examen_conflictos').select('*').eq('llamado_id', llamadoId),
      supabase.rpc('examen_fechas_profesor_llamado', { p_llamado: llamadoId }),
    ])
    if (!con.error) setConflictos(con.data || [])
    if (!ocup.error) setOcupadoProfesor(ocup.data || [])
  }

  // El trigger puede borrar en silencio la propuesta AUTO de OTRA
  // cátedra del mismo profesor al aceptar una carga manual en choque
  // (ver migracion_origen_examen_fecha.sql). Esa otra fila sigue
  // visible en esta pantalla con su fecha vieja hasta que se
  // refresque puntualmente al profesor afectado.
  const refrescarProfesor = async (profesorId) => {
    const { data, error } = await supabase
      .from('v_examen_agenda')
      .select('catedra_id, fecha, examen_fecha_id')
      .eq('llamado_id', llamadoId)
      .eq('profesor_id', profesorId)
    if (error || !data) return
    setFilas((fs) =>
      fs.map((f) => {
        const actual = data.find((d) => d.catedra_id === f.catedra_id)
        return actual ? { ...f, fecha: actual.fecha, examen_fecha_id: actual.examen_fecha_id } : f
      }),
    )
  }

  // Guarda una sola fila apenas se elige la fecha, en vez de acumular
  // todo en un lote: un choque de profesor en una materia ya no bloquea
  // ni hace perder las demás fechas que el secretario ya cargó.
  const guardarFila = async (catedraId, fecha) => {
    const token = (tokenPorFila.current[catedraId] || 0) + 1
    tokenPorFila.current[catedraId] = token
    const esVigente = () => tokenPorFila.current[catedraId] === token

    setFilaEstado((s) => ({ ...s, [catedraId]: 'guardando' }))
    setFilaError((s) => {
      const n = { ...s }
      delete n[catedraId]
      return n
    })

    const fila = filas.find((f) => f.catedra_id === catedraId)
    let resultado

    if (!fecha) {
      resultado = fila?.examen_fecha_id
        ? await supabase.from('examen_fecha').delete().eq('id', fila.examen_fecha_id)
        : { error: null }
    } else {
      // El trigger de la base valida rango, día hábil, estado del
      // llamado y choque de profesor; si algo no cumple, el mensaje de
      // Postgres se muestra tal cual junto a esa fila.
      resultado = await supabase
        .from('examen_fecha')
        .upsert(
          { llamado_id: llamadoId, catedra_id: catedraId, fecha, origen: 'MANUAL' },
          { onConflict: 'llamado_id,catedra_id' },
        )
        .select('id, fecha')
        .single()
    }

    if (!esVigente()) return // se eligió otra fecha para esta fila mientras esta se guardaba

    if (resultado.error) {
      setFilaEstado((s) => ({ ...s, [catedraId]: 'error' }))
      setFilaError((s) => ({ ...s, [catedraId]: resultado.error.message }))
      return
    }

    setFilas((fs) =>
      fs.map((f) =>
        f.catedra_id === catedraId
          ? { ...f, fecha: resultado.data?.fecha ?? null, examen_fecha_id: resultado.data?.id ?? null }
          : f,
      ),
    )
    setCambios((c) => {
      const n = { ...c }
      delete n[catedraId]
      return n
    })
    setFilaEstado((s) => ({ ...s, [catedraId]: 'guardado' }))
    setTimeout(() => {
      if (!esVigente()) return
      setFilaEstado((s) => {
        const n = { ...s }
        if (n[catedraId] === 'guardado') delete n[catedraId]
        return n
      })
    }, 2000)

    refrescarAuxiliares()
    if (fecha && fila?.profesor_id) refrescarProfesor(fila.profesor_id)
  }

  const elegirFecha = (catedraId, fecha) => {
    setCambios((c) => ({ ...c, [catedraId]: fecha }))
    guardarFila(catedraId, fecha)
  }

  const reintentarPendientes = () => {
    for (const [catedraId, fecha] of Object.entries(cambios)) guardarFila(catedraId, fecha)
  }

  useEffect(() => {
    cargar().then(() => {
      // Si quedó un cambio sin confirmar por un error o un cierre
      // abrupto de la pestaña, se reintenta guardar solo automáticamente.
      let draft
      try {
        draft = JSON.parse(localStorage.getItem(draftKey) || '{}')
      } catch {
        draft = {}
      }
      const entradas = Object.entries(draft)
      if (entradas.length === 0) return
      setCambios(draft)
      for (const [catedraId, fecha] of entradas) guardarFila(catedraId, fecha)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llamadoId])

  const llamado = filas[0]

  // Opciones de filtro derivadas de lo que el usuario efectivamente ve
  const opciones = useMemo(() => {
    const unico = (clave, etiqueta) => {
      const mapa = new Map()
      for (const f of filas) if (f[clave]) mapa.set(f[clave], etiqueta(f))
      return [...mapa].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
    }
    return {
      carreras: unico('carrera_id', (f) => f.carrera),
      sedes: unico('sede_id', (f) => f.sede),
      asignaturas: unico('asignatura_id', (f) => f.materia),
      profesores: unico('profesor_id', (f) => f.profesor),
      cursos: [...new Set(filas.map((f) => f.curso_nivel))].sort((a, b) => a - b),
      secciones: [...new Set(filas.map((f) => f.seccion_grupo))].sort(),
    }
  }, [filas])

  const visibles = useMemo(() => {
    return filas
      .filter((f) => {
        if (filtro.carrera_id && f.carrera_id !== filtro.carrera_id) return false
        if (filtro.sede_id && f.sede_id !== filtro.sede_id) return false
        if (filtro.curso_nivel && String(f.curso_nivel) !== filtro.curso_nivel) return false
        if (filtro.seccion_grupo && f.seccion_grupo !== filtro.seccion_grupo) return false
        if (filtro.asignatura_id && f.asignatura_id !== filtro.asignatura_id) return false
        if (filtro.profesor_id && f.profesor_id !== filtro.profesor_id) return false
        if (filtro.soloSinFecha && (cambios[f.catedra_id] ?? f.fecha)) return false
        return true
      })
      .sort(
        (a, b) =>
          a.carrera.localeCompare(b.carrera) ||
          a.curso_nivel - b.curso_nivel ||
          a.seccion_grupo.localeCompare(b.seccion_grupo) ||
          a.materia.localeCompare(b.materia),
      )
  }, [filas, filtro, cambios])

  // Fecha efectiva de una fila: el cambio pendiente si lo hay, si no la guardada
  const fechaDe = (f) => (f.catedra_id in cambios ? cambios[f.catedra_id] : f.fecha || '')

  // Carga por día para el curso/sección de esa fila, para marcar el calendario
  const cargaDelCurso = (fila) => {
    const conteo = {}
    for (const f of filas) {
      if (f.catedra_id === fila.catedra_id) continue
      if (f.carrera_id !== fila.carrera_id || f.sede_id !== fila.sede_id) continue
      if (f.curso_nivel !== fila.curso_nivel || f.seccion_grupo !== fila.seccion_grupo) continue
      const fecha = fechaDe(f)
      if (fecha) conteo[fecha] = (conteo[fecha] || 0) + 1
    }
    return conteo
  }

  // Días bloqueados: feriados y domingos del llamado, días en que ese
  // profesor no está disponible, y fechas donde ya tiene otra mesa
  // CONFIRMADA (en cualquier carrera, no solo la que ve este
  // secretario) — salvo que la materia de esta fila sea optativa, que
  // es la misma excepción que aplica el trigger al guardar. Las
  // propuestas automáticas (origen AUTO) no bloquean: se muestran como
  // aviso en avisosDe() y ceden el lugar si el secretario elige esa
  // fecha (misma regla que aplica el trigger al guardar).
  const excepcionesDe = (fila) => {
    const motivos = {}
    for (const b of bloqueados) motivos[b.fecha] = b.motivo
    for (const n of noDisponible) {
      if (n.profesor_id === fila.profesor_id) motivos[n.fecha] = 'El profesor no está disponible'
    }
    if (!fila.optativa) {
      for (const o of ocupadoProfesor) {
        if (o.profesor_id === fila.profesor_id && o.catedra_id !== fila.catedra_id && o.origen !== 'AUTO') {
          motivos[o.fecha] = motivos[o.fecha] || `El profesor ya tiene una mesa asignada: ${o.materia}`
        }
      }
    }
    return motivos
  }

  const avisosDe = (fila) => {
    const avisos = {}
    if (!fila.optativa) {
      for (const o of ocupadoProfesor) {
        if (o.profesor_id === fila.profesor_id && o.catedra_id !== fila.catedra_id && o.origen === 'AUTO') {
          avisos[o.fecha] = `Propuesta automática sin confirmar: ${o.materia}. Se libera si elegís esta fecha.`
        }
      }
    }
    return avisos
  }

  const conflictoDe = (fila) => {
    const fecha = fechaDe(fila)
    if (!fecha) return null
    return conflictos.find((c) => c.profesor_id === fila.profesor_id && c.fecha === fecha) || null
  }

  const pendientes = Object.keys(cambios).length
  const conError = Object.keys(filaError).length

  // Persiste en localStorage lo que todavía no se confirmó en el
  // servidor (en vuelo o en error), para no perderlo ante un cierre de
  // pestaña o un reintento fallido. Se limpia solo cuando no queda nada
  // pendiente.
  useEffect(() => {
    if (pendientes === 0) {
      localStorage.removeItem(draftKey)
    } else {
      localStorage.setItem(draftKey, JSON.stringify(cambios))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cambios, draftKey])

  const exportar = () => {
    descargarFilas(
      `horario-${llamado?.llamado || 'examenes'}.csv`,
      visibles.map((f) => ({
        catedra_id: f.catedra_id,
        sede: f.sede,
        carrera: f.carrera,
        curso: f.curso_nivel,
        seccion: f.seccion_grupo,
        codigo_materia: f.codigo_materia,
        materia: f.materia,
        documento: f.documento_identidad,
        profesor: f.profesor,
        fecha: fechaDe(f),
        hora: f.hora_inicio || '',
        aula: f.aula || '',
      })),
    )
  }

  if (loading) return <p className="page-padding muted-text">Cargando...</p>
  if (error && filas.length === 0) return <p className="page-padding error-text">{error}</p>
  if (!llamado) {
    return (
      <div className="page-padding">
        <p className="muted-text">
          No hay cátedras activas para el periodo de este llamado, o no tenés ninguna carrera asignada.
        </p>
      </div>
    )
  }

  const abierto = llamado.llamado_estado === 'ASIGNACION'
  const editable = abierto && puedeEscribir
  const totalConFecha = filas.filter((f) => fechaDe(f)).length

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>{llamado.llamado}</h1>
        <p>
          Rango {formatoLargo(llamado.fecha_inicio)} a {formatoLargo(llamado.fecha_fin)} ·{' '}
          {totalConFecha} de {filas.length} con fecha
          {conflictos.length > 0 && ` · ${conflictos.length} choque(s) de profesor`}
        </p>
      </div>

      {!abierto && (
        <p className="error-text">
          Este llamado está en estado {llamado.llamado_estado} y no admite cambios. Dirección Académica puede
          reabrirlo desde Llamados a examen.
        </p>
      )}
      {abierto && !puedeEscribir && (
        <p className="muted-text">Tu rol es de auditoría: podés ver el estado pero no cargar fechas.</p>
      )}
      {error && <p className="error-text">{error}</p>}

      <div className="form-row" style={{ marginBottom: 16, alignItems: 'center' }}>
        {opciones.carreras.length > 1 && (
          <select value={filtro.carrera_id} onChange={(e) => setFiltro({ ...filtro, carrera_id: e.target.value })}>
            <option value="">Todas las carreras</option>
            {opciones.carreras.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}

        <select value={filtro.sede_id} onChange={(e) => setFiltro({ ...filtro, sede_id: e.target.value })}>
          <option value="">Todas las sedes</option>
          {opciones.sedes.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select value={filtro.curso_nivel} onChange={(e) => setFiltro({ ...filtro, curso_nivel: e.target.value })}>
          <option value="">Todos los cursos</option>
          {opciones.cursos.map((c) => (
            <option key={c} value={String(c)}>
              {c}º
            </option>
          ))}
        </select>

        <select
          value={filtro.seccion_grupo}
          onChange={(e) => setFiltro({ ...filtro, seccion_grupo: e.target.value })}
        >
          <option value="">Todas las secciones</option>
          {opciones.secciones.map((s) => (
            <option key={s} value={s}>
              Sección {s}
            </option>
          ))}
        </select>

        <div style={{ minWidth: 200 }}>
          <BuscadorSelect
            opciones={opciones.asignaturas}
            value={filtro.asignatura_id}
            onChange={(v) => setFiltro({ ...filtro, asignatura_id: v })}
            placeholder="Materia..."
          />
        </div>

        <div style={{ minWidth: 200 }}>
          <BuscadorSelect
            opciones={opciones.profesores}
            value={filtro.profesor_id}
            onChange={(v) => setFiltro({ ...filtro, profesor_id: v })}
            placeholder="Profesor..."
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={filtro.soloSinFecha}
            onChange={(e) => setFiltro({ ...filtro, soloSinFecha: e.target.checked })}
          />
          Solo sin fecha
        </label>

        <button type="button" className="chip" onClick={() => setFiltro(sinFiltro)}>
          Limpiar filtros
        </button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Materia</th>
            <th>Curso / Sec.</th>
            <th>Profesor</th>
            <th style={{ width: 150 }}>Fecha</th>
            <th style={{ width: 110 }}>Hora</th>
            <th style={{ width: 110 }}>Aula</th>
          </tr>
        </thead>
        <tbody>
          {visibles.length === 0 && (
            <tr>
              <td colSpan={6} className="muted-text">
                No hay materias que coincidan con los filtros.
              </td>
            </tr>
          )}
          {visibles.map((f) => {
            const choque = conflictoDe(f)
            return (
              <tr key={f.catedra_id}>
                <td>
                  <strong>{f.materia}</strong>
                  <div className="muted-text" style={{ fontSize: 12 }}>
                    {f.codigo_materia} · {f.carrera} · {f.sede}
                  </div>
                </td>
                <td>
                  {f.curso_nivel}º · {f.seccion_grupo}
                </td>
                <td>
                  {f.profesor}
                  {choque && f.optativa && (
                    <div className="muted-text" style={{ fontSize: 12 }}>
                      Choque permitido (materia optativa): {choque.materias}
                    </div>
                  )}
                  {choque && !f.optativa && (
                    <div className="error-text" style={{ fontSize: 12 }}>
                      Choque: {choque.materias}. No es optativa, se bloqueará al guardar.
                    </div>
                  )}
                </td>
                <td>
                  <CalendarioRango
                    value={fechaDe(f)}
                    onChange={(v) => elegirFecha(f.catedra_id, v)}
                    min={llamado.fecha_inicio}
                    max={llamado.fecha_fin}
                    excepciones={excepcionesDe(f)}
                    avisos={avisosDe(f)}
                    carga={cargaDelCurso(f)}
                    disabled={!editable || filaEstado[f.catedra_id] === 'guardando'}
                  />
                  {filaEstado[f.catedra_id] === 'guardando' && (
                    <div className="muted-text" style={{ fontSize: 12 }}>
                      Guardando...
                    </div>
                  )}
                  {filaEstado[f.catedra_id] === 'guardado' && (
                    <div className="muted-text" style={{ fontSize: 12, color: 'var(--success)' }}>
                      Guardado ✓
                    </div>
                  )}
                  {filaEstado[f.catedra_id] === 'error' && (
                    <div className="error-text" style={{ fontSize: 12 }}>
                      {filaError[f.catedra_id]}{' '}
                      <button
                        type="button"
                        className="chip"
                        onClick={() => guardarFila(f.catedra_id, cambios[f.catedra_id])}
                      >
                        Reintentar
                      </button>
                    </div>
                  )}
                </td>
                <td>{f.hora_inicio || '—'}</td>
                <td>{f.aula || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="form-actions form-actions-sticky">
        <button type="button" className="btn btn-secondary" onClick={exportar}>
          Descargar CSV
        </button>
        <Link to={`/examenes/${llamadoId}/reporte`} className="btn btn-secondary">
          Reporte para imprimir
        </Link>
        <div style={{ flex: 1 }} />
        {pendientes === 0 && <span className="muted-text">Cada fecha se guarda sola al elegirla.</span>}
        {conError > 0 && (
          <span className="error-text">
            {conError} fila(s) con error sin confirmar
          </span>
        )}
        {pendientes > conError && pendientes > 0 && (
          <span className="muted-text">{pendientes - conError} guardando...</span>
        )}
        {conError > 0 && (
          <button type="button" className="btn btn-primary" disabled={!editable} onClick={reintentarPendientes}>
            Reintentar {conError} pendiente(s)
          </button>
        )}
      </div>
    </div>
  )
}
