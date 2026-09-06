import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function PlanAnual() {
  const { puedeEscribir } = useAuth()
  const [catedras, setCatedras] = useState([])
  const [entregas, setEntregas] = useState({})
  const [cambios, setCambios] = useState({})
  const [busqueda, setBusqueda] = useState('')
  const [filtroPeriodo, setFiltroPeriodo] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardandoId, setGuardandoId] = useState(null)
  const [error, setError] = useState('')

  const cargar = async () => {
    setLoading(true)
    setError('')
    const [{ data: c, error: e1 }, { data: pa, error: e2 }] = await Promise.all([
      supabase
        .from('catedras')
        .select(
          'id, periodo_lectivo, seccion_grupo, profesores(nombres, apellidos), asignaturas(nombre, carreras(nombre)), sedes(nombre)',
        )
        .eq('activo', true)
        .order('periodo_lectivo', { ascending: false }),
      supabase.from('plan_anual_entrega').select('*'),
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

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return catedras.filter((c) => {
      if (filtroPeriodo && c.periodo_lectivo !== filtroPeriodo) return false
      if (!q) return true
      return [c.profesores?.nombres, c.profesores?.apellidos, c.asignaturas?.nombre, c.asignaturas?.carreras?.nombre, c.sedes?.nombre].some(
        (v) => v?.toLowerCase().includes(q),
      )
    })
  }, [catedras, busqueda, filtroPeriodo])

  const valorDe = (id, campo) => {
    if (cambios[id]?.[campo] !== undefined) return cambios[id][campo]
    return entregas[id]?.[campo] ?? ''
  }

  const setCambio = (id, campo, valor) => {
    setCambios((c) => ({
      ...c,
      [id]: { fecha_entrega: valorDe(id, 'fecha_entrega'), observaciones: valorDe(id, 'observaciones'), ...c[id], [campo]: valor },
    }))
  }

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

      {error && <p className="error-text">{error}</p>}

      <div className="form-row" style={{ marginBottom: 16 }}>
        <label style={{ flex: '1 1 260px' }}>
          Buscar
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Profesor, materia, carrera o sede..."
          />
        </label>
        <label style={{ maxWidth: 160 }}>
          Periodo
          <select value={filtroPeriodo} onChange={(e) => setFiltroPeriodo(e.target.value)}>
            <option value="">Todos</option>
            {periodos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Profesor</th>
              <th>Asignatura</th>
              <th>Carrera</th>
              <th>Sede</th>
              <th>Período</th>
              <th>Fecha de entrega</th>
              <th>Observaciones</th>
              <th>Estado</th>
              {puedeEscribir && <th></th>}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((c) => {
              const fecha = valorDe(c.id, 'fecha_entrega')
              const hayCambio = cambios[c.id] !== undefined
              return (
                <tr key={c.id}>
                  <td>
                    {c.profesores?.apellidos}, {c.profesores?.nombres}
                  </td>
                  <td>{c.asignaturas?.nombre}</td>
                  <td>{c.asignaturas?.carreras?.nombre}</td>
                  <td>{c.sedes?.nombre}</td>
                  <td>{c.periodo_lectivo}</td>
                  <td>
                    <input
                      type="date"
                      value={fecha || ''}
                      disabled={!puedeEscribir}
                      onChange={(e) => setCambio(c.id, 'fecha_entrega', e.target.value)}
                    />
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
                  <td>
                    {fecha ? <span className="badge badge-success">Entregado</span> : <span className="badge badge-muted">Pendiente</span>}
                  </td>
                  {puedeEscribir && (
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!hayCambio || guardandoId === c.id}
                        onClick={() => guardar(c.id)}
                      >
                        {guardandoId === c.id ? 'Guardando...' : 'Guardar'}
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={puedeEscribir ? 9 : 8}>Ninguna cátedra coincide con la búsqueda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
