import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchTodo } from '../lib/paginar'
import { useAuth } from '../contexts/AuthContext'
import { aISO, formatoLargo } from '../lib/fechas'

const HOY = aISO(new Date())

const sinFiltro = { sede_id: '', carrera_id: '', curso_nivel: '', seccion: '', estado: '', busqueda: '' }

// Filtros que dependen del anterior: al cambiar uno se limpian los de
// abajo, para no quedar con un curso o sección que ya no está en la lista.
const CASCADA = ['sede_id', 'carrera_id', 'curso_nivel', 'seccion']

// Valores únicos de un campo como opciones de <select>, ordenadas por etiqueta
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

export function PlanAnual() {
  const { puedeEscribir } = useAuth()
  const [catedras, setCatedras] = useState([])
  const [entregas, setEntregas] = useState({})
  const [cambios, setCambios] = useState({})
  const [filtro, setFiltro] = useState(sinFiltro)
  const [filtroPeriodo, setFiltroPeriodo] = useState(null) // null: todavía no se eligió, se usa el más reciente
  const [loading, setLoading] = useState(true)
  const [guardandoId, setGuardandoId] = useState(null)
  const [error, setError] = useState('')

  const cargar = async () => {
    setLoading(true)
    setError('')
    // Las cátedras activas de todos los períodos ya pasan las 1000 filas
    // que PostgREST devuelve por defecto: sin paginar, las que quedaban
    // afuera ni aparecían en la lista.
    const [{ data: c, error: e1 }, { data: pa, error: e2 }] = await Promise.all([
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
      fetchTodo((desde, hasta) => supabase.from('plan_anual_entrega').select('*').order('catedra_id').range(desde, hasta)),
    ])
    const err = e1 || e2
    if (err) setError(err.message)
    setCatedras(c || [])
    const mapa = {}
    for (const row of pa || []) mapa[row.catedra_id] = row
    setEntregas(mapa)
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const periodos = useMemo(() => [...new Set(catedras.map((c) => c.periodo_lectivo))].sort().reverse(), [catedras])
  const periodo = filtroPeriodo ?? periodos[0] ?? ''

  // Las opciones de cada filtro salen de lo que queda con los filtros de
  // arriba ya aplicados (período → sede → carrera → curso), así no se
  // ofrecen combinaciones que no existen.
  const opciones = useMemo(() => {
    const delPeriodo = catedras.filter((c) => !periodo || c.periodo_lectivo === periodo)
    const deSede = delPeriodo.filter((c) => !filtro.sede_id || c.sede_id === filtro.sede_id)
    const deCarrera = deSede.filter((c) => !filtro.carrera_id || c.asignaturas?.carrera_id === filtro.carrera_id)
    const deCurso = deCarrera.filter((c) => !filtro.curso_nivel || String(c.asignaturas?.curso_nivel) === filtro.curso_nivel)
    return {
      sedes: opcionesDe(delPeriodo, (c) => c.sede_id, (c) => c.sedes?.nombre || ''),
      carreras: opcionesDe(deSede, (c) => c.asignaturas?.carrera_id, (c) => c.asignaturas?.carreras?.nombre || ''),
      cursos: opcionesDe(deCarrera, (c) => c.asignaturas?.curso_nivel, (c) => `${c.asignaturas?.curso_nivel}º`),
      secciones: opcionesDe(deCurso, (c) => c.seccion_grupo?.toUpperCase(), (c) => c.seccion_grupo?.toUpperCase() || ''),
    }
  }, [catedras, periodo, filtro.sede_id, filtro.carrera_id, filtro.curso_nivel])

  // Sin el filtro de estado: de acá salen los contadores de los chips,
  // que tienen que mostrar cuántas hay de cada lado sin importar cuál se eligió.
  const sinEstado = useMemo(() => {
    const q = filtro.busqueda.trim().toLowerCase()
    return catedras
      .filter((c) => {
        if (periodo && c.periodo_lectivo !== periodo) return false
        if (filtro.sede_id && c.sede_id !== filtro.sede_id) return false
        if (filtro.carrera_id && c.asignaturas?.carrera_id !== filtro.carrera_id) return false
        if (filtro.curso_nivel && String(c.asignaturas?.curso_nivel) !== filtro.curso_nivel) return false
        if (filtro.seccion && c.seccion_grupo?.toUpperCase() !== filtro.seccion) return false
        if (!q) return true
        return [c.profesores?.nombres, c.profesores?.apellidos, c.asignaturas?.nombre, c.asignaturas?.carreras?.nombre, c.sedes?.nombre].some(
          (v) => v?.toLowerCase().includes(q),
        )
      })
      .sort(
        (a, b) =>
          (a.sedes?.nombre || '').localeCompare(b.sedes?.nombre || '') ||
          (a.asignaturas?.carreras?.nombre || '').localeCompare(b.asignaturas?.carreras?.nombre || '') ||
          (a.asignaturas?.curso_nivel ?? 0) - (b.asignaturas?.curso_nivel ?? 0) ||
          (a.seccion_grupo || '').localeCompare(b.seccion_grupo || '') ||
          (a.asignaturas?.nombre || '').localeCompare(b.asignaturas?.nombre || ''),
      )
  }, [catedras, periodo, filtro.sede_id, filtro.carrera_id, filtro.curso_nivel, filtro.seccion, filtro.busqueda])

  const totalEntregadas = sinEstado.filter((c) => entregas[c.id]?.fecha_entrega).length
  const totalPendientes = sinEstado.length - totalEntregadas
  const porcentaje = sinEstado.length ? Math.round((totalEntregadas / sinEstado.length) * 100) : 0

  const filtradas = useMemo(
    () =>
      sinEstado.filter((c) => {
        const entregada = !!entregas[c.id]?.fecha_entrega
        if (filtro.estado === 'entregado') return entregada
        if (filtro.estado === 'pendiente') return !entregada
        return true
      }),
    [sinEstado, entregas, filtro.estado],
  )

  const setFiltroCampo = (campo, valor) => {
    setFiltro((f) => {
      const nuevo = { ...f, [campo]: valor }
      const i = CASCADA.indexOf(campo)
      if (i >= 0) for (const dep of CASCADA.slice(i + 1)) nuevo[dep] = ''
      return nuevo
    })
  }

  const valorDe = (id, campo) => {
    if (cambios[id]?.[campo] !== undefined) return cambios[id][campo]
    if (campo === 'fecha_entrega') return entregas[id]?.fecha_entrega ?? HOY
    return entregas[id]?.[campo] ?? ''
  }

  const setCambio = (id, campo, valor) => {
    setCambios((c) => ({
      ...c,
      [id]: { fecha_entrega: valorDe(id, 'fecha_entrega'), observaciones: valorDe(id, 'observaciones'), ...c[id], [campo]: valor },
    }))
  }

  // Sin fecha guardada: se muestra hoy como sugerencia, no como entrega real —
  // "Entregado" solo si ya hay una fecha guardada en la base.
  const yaEntregado = (id) => !!entregas[id]?.fecha_entrega

  const guardar = async (id) => {
    setGuardandoId(id)
    setError('')
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error: eErr } = await supabase.from('plan_anual_entrega').upsert(
      {
        catedra_id: id,
        fecha_entrega: valorDe(id, 'fecha_entrega') || null,
        observaciones: valorDe(id, 'observaciones') || null,
        registrado_por: user?.id,
      },
      { onConflict: 'catedra_id' },
    )
    setGuardandoId(null)
    if (eErr) {
      setError(eErr.message)
      return
    }
    setCambios((c) => {
      const nuevo = { ...c }
      delete nuevo[id]
      return nuevo
    })
    cargar()
  }

  if (loading) return <p className="page-padding muted-text">Cargando...</p>

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Plan Anual de Clases</h1>
        <p>Registro de entrega del plan anual por cátedra. Aporta al 20% de "Planificación y documentación" en la Foja de Desempeño.</p>
      </div>

      <div className="form-actions" style={{ marginTop: 0, marginBottom: '1.5rem' }}>
        <Link to="/plan-anual/reporte" className="btn btn-secondary">
          Ver constancia imprimible
        </Link>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="form-row" style={{ marginBottom: 8, alignItems: 'center' }}>
        <select
          value={periodo}
          onChange={(e) => {
            setFiltroPeriodo(e.target.value)
            setFiltroCampo('sede_id', '')
          }}
          aria-label="Período"
        >
          <option value="">Todos los períodos</option>
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
        <select value={filtro.curso_nivel} onChange={(e) => setFiltroCampo('curso_nivel', e.target.value)} aria-label="Curso">
          <option value="">Todos los cursos</option>
          {opciones.cursos.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={filtro.seccion} onChange={(e) => setFiltroCampo('seccion', e.target.value)} aria-label="Sección">
          <option value="">Todas las secciones</option>
          {opciones.secciones.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          value={filtro.busqueda}
          onChange={(e) => setFiltroCampo('busqueda', e.target.value)}
          placeholder="Profesor, materia, carrera o sede..."
          style={{ minWidth: 220 }}
          aria-label="Buscar"
        />
        <button type="button" className="chip" onClick={() => setFiltro(sinFiltro)}>
          Limpiar filtros
        </button>
      </div>
      <div className="plan-anual-resumen">
        {[
          ['', `Todas · ${sinEstado.length}`],
          ['pendiente', `Pendientes · ${totalPendientes}`],
          ['entregado', `Entregadas · ${totalEntregadas}`],
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
        <div className="plan-anual-progreso" title={`${totalEntregadas} de ${sinEstado.length} entregadas`}>
          <div className="plan-anual-progreso-barra">
            <span style={{ width: `${porcentaje}%` }} />
          </div>
          <span>{porcentaje}% entregado</span>
        </div>
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Estado</th>
              <th>Profesor</th>
              <th>Asignatura</th>
              <th>Carrera</th>
              <th>Curso</th>
              <th>Sede</th>
              <th>Período</th>
              <th style={{ width: 160 }}>Fecha de entrega</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((c) => (
              <tr key={c.id} className={yaEntregado(c.id) ? 'fila-entregada' : undefined}>
                <td>
                  {yaEntregado(c.id) ? (
                    <span className="badge badge-success" style={{ whiteSpace: 'nowrap' }}>
                      ✓ {formatoLargo(entregas[c.id].fecha_entrega)}
                    </span>
                  ) : (
                    <span className="badge badge-muted">Pendiente</span>
                  )}
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
                <td>{c.periodo_lectivo}</td>
                <td>
                  <input
                    type="date"
                    value={valorDe(c.id, 'fecha_entrega')}
                    disabled={!puedeEscribir}
                    onChange={(e) => setCambio(c.id, 'fecha_entrega', e.target.value)}
                    className={!yaEntregado(c.id) && cambios[c.id]?.fecha_entrega === undefined ? 'fecha-sugerida' : undefined}
                    title={yaEntregado(c.id) ? undefined : 'Sugerencia: todavía no se guardó'}
                    style={{ marginBottom: 6 }}
                  />
                  {puedeEscribir && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={guardandoId === c.id}
                      onClick={() => guardar(c.id)}
                      style={{ display: 'block', width: '100%' }}
                    >
                      {guardandoId === c.id ? 'Guardando...' : 'Guardar'}
                    </button>
                  )}
                </td>
                <td>
                  <input
                    value={valorDe(c.id, 'observaciones') || ''}
                    disabled={!puedeEscribir}
                    placeholder="Opcional"
                    style={{ minWidth: 160 }}
                    onChange={(e) => setCambio(c.id, 'observaciones', e.target.value)}
                  />
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={9}>Ninguna cátedra coincide con los filtros.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
