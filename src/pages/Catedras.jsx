import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BuscadorSelect } from '../components/BuscadorSelect'

const empty = {
  profesor_id: '',
  carrera_id: '',
  asignatura_id: '',
  sede_id: '',
  periodo_lectivo: '',
  seccion_grupo: 'A',
}

export function Catedras() {
  const [profesores, setProfesores] = useState([])
  const [carreras, setCarreras] = useState([])
  const [carrerasSedes, setCarrerasSedes] = useState([])
  const [asignaturas, setAsignaturas] = useState([])
  const [sedes, setSedes] = useState([])
  const [catedras, setCatedras] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(empty)
  const [filtroPeriodo, setFiltroPeriodo] = useState('')
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const cargarBase = async () => {
    const [p, c, a, s, cs] = await Promise.all([
      supabase.from('profesores').select('*').order('apellidos'),
      supabase.from('carreras').select('*').order('nombre'),
      supabase.from('asignaturas').select('*').order('nombre'),
      supabase.from('sedes').select('*').order('nombre'),
      supabase.from('carreras_sedes').select('carrera_id, sede_id'),
    ])
    const err = p.error || c.error || a.error || s.error || cs.error
    if (err) setError(err.message)
    setProfesores(p.data || [])
    setCarreras(c.data || [])
    setAsignaturas(a.data || [])
    setSedes(s.data || [])
    setCarrerasSedes(cs.data || [])
  }

  const cargarCatedras = async () => {
    setLoading(true)
    let query = supabase
      .from('catedras')
      .select(
        'id, periodo_lectivo, seccion_grupo, activo, profesor_id, asignatura_id, sede_id, profesores(nombres, apellidos), asignaturas(nombre, carreras(nombre)), sedes(nombre)',
      )
      .order('periodo_lectivo', { ascending: false })
    if (filtroPeriodo) query = query.eq('periodo_lectivo', filtroPeriodo)
    const { data, error } = await query
    if (error) setError(error.message)
    else setCatedras(data)
    setLoading(false)
  }

  useEffect(() => {
    cargarBase()
  }, [])

  useEffect(() => {
    cargarCatedras()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroPeriodo])

  const carrerasFiltradas = useMemo(() => {
    if (!form.sede_id) return carreras
    // si carreras_sedes todavía no fue poblada, no ocultamos nada para no bloquear la carga
    if (carrerasSedes.length === 0) return carreras
    const idsPermitidos = new Set(
      carrerasSedes.filter((cs) => cs.sede_id === form.sede_id).map((cs) => cs.carrera_id),
    )
    return carreras.filter((c) => idsPermitidos.has(c.id))
  }, [carreras, carrerasSedes, form.sede_id])

  const asignaturasFiltradas = useMemo(
    () => asignaturas.filter((a) => !form.carrera_id || a.carrera_id === form.carrera_id),
    [asignaturas, form.carrera_id],
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setOk('')
    const { error } = await supabase.from('catedras').insert({
      profesor_id: form.profesor_id,
      asignatura_id: form.asignatura_id,
      sede_id: form.sede_id,
      periodo_lectivo: form.periodo_lectivo.trim(),
      seccion_grupo: form.seccion_grupo || 'A',
    })
    setSaving(false)
    if (error) {
      setError(
        error.code === '23505' ? 'Ya existe una cátedra igual (mismo profesor, asignatura y periodo).' : error.message,
      )
      return
    }
    setOk('Cátedra creada.')
    setForm((f) => ({ ...f, asignatura_id: '', profesor_id: '' }))
    cargarCatedras()
  }

  const empezarEdicion = (c) => {
    setEditId(c.id)
    setEditForm({
      profesor_id: c.profesor_id,
      asignatura_id: c.asignatura_id,
      sede_id: c.sede_id,
      seccion_grupo: c.seccion_grupo,
      activo: c.activo,
    })
  }

  const guardarEdicion = async (id) => {
    const { error } = await supabase.from('catedras').update(editForm).eq('id', id)
    if (error) {
      alert(error.code === '23505' ? 'Ya existe esa combinación.' : error.message)
      return
    }
    setEditId(null)
    cargarCatedras()
  }

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar esta cátedra? También se pierden sus indicadores cargados.')) return
    const { error } = await supabase.from('catedras').delete().eq('id', id)
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    cargarCatedras()
  }

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Cátedras</h1>
      </div>

      <form className="form-card" onSubmit={handleSubmit} style={{ marginBottom: '2rem' }}>
        <div className="form-grid">
          <label>
            Periodo lectivo
            <input
              value={form.periodo_lectivo}
              onChange={(e) => setForm({ ...form, periodo_lectivo: e.target.value })}
              placeholder="2026"
              list="periodos-existentes"
              required
            />
            <datalist id="periodos-existentes">
              {[...new Set(catedras.map((c) => c.periodo_lectivo))].map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label>
            Sede
            <select
              value={form.sede_id}
              onChange={(e) => setForm({ ...form, sede_id: e.target.value, carrera_id: '', asignatura_id: '' })}
              required
            >
              <option value="">Seleccionar...</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Carrera
            <select
              value={form.carrera_id}
              onChange={(e) => setForm({ ...form, carrera_id: e.target.value, asignatura_id: '' })}
              disabled={!form.sede_id}
            >
              <option value="">{form.sede_id ? 'Todas' : 'Elegí una sede primero'}</option>
              {carrerasFiltradas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Asignatura
            <BuscadorSelect
              opciones={asignaturasFiltradas.map((a) => ({ value: a.id, label: a.nombre }))}
              value={form.asignatura_id}
              onChange={(id) => setForm({ ...form, asignatura_id: id })}
              placeholder="Buscar asignatura..."
              required
            />
          </label>
          <label>
            Profesor
            <BuscadorSelect
              opciones={profesores.map((p) => ({ value: p.id, label: `${p.apellidos}, ${p.nombres}` }))}
              value={form.profesor_id}
              onChange={(id) => setForm({ ...form, profesor_id: id })}
              placeholder="Buscar profesor..."
              required
            />
          </label>
          <label>
            Sección / Grupo
            <input
              value={form.seccion_grupo}
              onChange={(e) => setForm({ ...form, seccion_grupo: e.target.value })}
            />
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        {ok && <p className="success-text">{ok}</p>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : '+ Crear cátedra'}
          </button>
        </div>
      </form>

      <div className="form-grid" style={{ maxWidth: 260, marginBottom: '1rem' }}>
        <label>
          Filtrar por periodo
          <input
            value={filtroPeriodo}
            onChange={(e) => setFiltroPeriodo(e.target.value)}
            placeholder="Todos"
            list="periodos-existentes"
          />
        </label>
      </div>

      {loading ? (
        <p>Cargando...</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Profesor</th>
                <th>Asignatura</th>
                <th>Carrera</th>
                <th>Sede</th>
                <th>Sección</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {catedras.map((c) => (
                <tr key={c.id}>
                  <td>{c.periodo_lectivo}</td>
                  {editId === c.id ? (
                    <>
                      <td style={{ minWidth: 200 }}>
                        <BuscadorSelect
                          opciones={profesores.map((p) => ({ value: p.id, label: `${p.apellidos}, ${p.nombres}` }))}
                          value={editForm.profesor_id}
                          onChange={(id) => setEditForm({ ...editForm, profesor_id: id })}
                          placeholder="Buscar profesor..."
                        />
                      </td>
                      <td style={{ minWidth: 200 }}>
                        <BuscadorSelect
                          opciones={asignaturas.map((a) => ({ value: a.id, label: a.nombre }))}
                          value={editForm.asignatura_id}
                          onChange={(id) => setEditForm({ ...editForm, asignatura_id: id })}
                          placeholder="Buscar asignatura..."
                        />
                      </td>
                      <td>—</td>
                      <td>
                        <select
                          value={editForm.sede_id}
                          onChange={(e) => setEditForm({ ...editForm, sede_id: e.target.value })}
                        >
                          {sedes.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nombre}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={editForm.seccion_grupo}
                          onChange={(e) => setEditForm({ ...editForm, seccion_grupo: e.target.value })}
                          style={{ width: 60 }}
                        />
                      </td>
                      <td>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => guardarEdicion(c.id)}>
                          Guardar
                        </button>{' '}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditId(null)}>
                          Cancelar
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        {c.profesores?.apellidos}, {c.profesores?.nombres}
                      </td>
                      <td>{c.asignaturas?.nombre}</td>
                      <td>{c.asignaturas?.carreras?.nombre}</td>
                      <td>{c.sedes?.nombre}</td>
                      <td>{c.seccion_grupo}</td>
                      <td>
                        <Link to={`/indicadores/${c.id}`} className="btn btn-secondary btn-sm">
                          Indicadores
                        </Link>{' '}
                        <Link to={`/foja/${c.id}`} className="btn btn-secondary btn-sm">
                          Foja
                        </Link>{' '}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => empezarEdicion(c)}>
                          Editar
                        </button>{' '}
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => eliminar(c.id)}>
                          Eliminar
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {catedras.length === 0 && (
                <tr>
                  <td colSpan={7}>No hay cátedras cargadas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
