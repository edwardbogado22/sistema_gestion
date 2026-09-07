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
  dias_semana: [],
}

// value = extract(dow from fecha) de Postgres. Solo lunes a viernes:
// en la facultad no se dictan clases sábado ni domingo.
const DIAS_SEMANA = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
]

function SelectorDias({ seleccionados, onChange }) {
  const toggle = (dia) => {
    onChange(seleccionados.includes(dia) ? seleccionados.filter((d) => d !== dia) : [...seleccionados, dia])
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {DIAS_SEMANA.map((d) => (
        <button
          key={d.value}
          type="button"
          className={`chip${seleccionados.includes(d.value) ? ' activo' : ''}`}
          onClick={() => toggle(d.value)}
        >
          {d.label}
        </button>
      ))}
    </div>
  )
}

async function sincronizarHorario(catedraId, dias) {
  const { error: eDel } = await supabase.from('catedra_horario').delete().eq('catedra_id', catedraId)
  if (eDel) return eDel
  if (!dias.length) return null
  const { error: eIns } = await supabase
    .from('catedra_horario')
    .insert(dias.map((dia_semana) => ({ catedra_id: catedraId, dia_semana })))
  return eIns
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
  const [busqueda, setBusqueda] = useState('')
  const [filtroSede, setFiltroSede] = useState('')
  const [filtroCarrera, setFiltroCarrera] = useState('')
  const [filtroCurso, setFiltroCurso] = useState('')
  const [filtroSeccion, setFiltroSeccion] = useState('')
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const cargarBase = async () => {
    const [p, c, a, s, cs] = await Promise.all([
      supabase.from('profesores').select('*').eq('confirmado', true).order('apellidos'),
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
        'id, periodo_lectivo, seccion_grupo, activo, profesor_id, asignatura_id, sede_id, profesores(nombres, apellidos), asignaturas(nombre, curso_nivel, carrera_id, carreras(nombre)), sedes(nombre), catedra_horario(dia_semana)',
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

  const opcionesFiltro = useMemo(
    () => ({
      cursos: [...new Set(catedras.map((c) => c.asignaturas?.curso_nivel).filter((v) => v != null))].sort(
        (a, b) => a - b,
      ),
      secciones: [...new Set(catedras.map((c) => c.seccion_grupo).filter(Boolean))].sort(),
    }),
    [catedras],
  )

  const catedrasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return catedras.filter((c) => {
      if (filtroSede && c.sede_id !== filtroSede) return false
      if (filtroCarrera && c.asignaturas?.carrera_id !== filtroCarrera) return false
      if (filtroCurso && String(c.asignaturas?.curso_nivel) !== filtroCurso) return false
      if (filtroSeccion && c.seccion_grupo !== filtroSeccion) return false
      if (q) {
        return [
          c.profesores?.nombres,
          c.profesores?.apellidos,
          c.asignaturas?.nombre,
          c.asignaturas?.carreras?.nombre,
          c.sedes?.nombre,
          c.seccion_grupo,
        ].some((campo) => campo?.toLowerCase().includes(q))
      }
      return true
    })
  }, [catedras, busqueda, filtroSede, filtroCarrera, filtroCurso, filtroSeccion])

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
    const { data, error } = await supabase
      .from('catedras')
      .insert({
        profesor_id: form.profesor_id,
        asignatura_id: form.asignatura_id,
        sede_id: form.sede_id,
        periodo_lectivo: form.periodo_lectivo.trim(),
        seccion_grupo: form.seccion_grupo || 'A',
      })
      .select('id')
      .single()
    if (error) {
      setSaving(false)
      setError(
        error.code === '23505' ? 'Ya existe una cátedra igual (mismo profesor, asignatura y periodo).' : error.message,
      )
      return
    }
    const eHorario = form.dias_semana.length ? await sincronizarHorario(data.id, form.dias_semana) : null
    setSaving(false)
    if (eHorario) {
      setError('La cátedra se creó, pero no se pudo guardar el horario: ' + eHorario.message)
      cargarCatedras()
      return
    }
    setOk('Cátedra creada.')
    setForm((f) => ({ ...f, asignatura_id: '', profesor_id: '', dias_semana: [] }))
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
      dias_semana: (c.catedra_horario || []).map((h) => h.dia_semana),
    })
  }

  const guardarEdicion = async (id) => {
    const { dias_semana, ...campos } = editForm
    const { error } = await supabase.from('catedras').update(campos).eq('id', id)
    if (error) {
      alert(error.code === '23505' ? 'Ya existe esa combinación.' : error.message)
      return
    }
    const eHorario = await sincronizarHorario(id, dias_semana || [])
    if (eHorario) {
      alert('Se guardó la cátedra, pero no se pudo actualizar el horario: ' + eHorario.message)
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
          <label>
            Días de clase
            <SelectorDias seleccionados={form.dias_semana} onChange={(dias) => setForm({ ...form, dias_semana: dias })} />
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

      <div className="form-row" style={{ marginBottom: '0.75rem' }}>
        <label style={{ flex: '1 1 260px' }}>
          Buscar
          <input
            type="text"
            placeholder="Profesor, materia, carrera o sede..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
        <label style={{ maxWidth: 140 }}>
          Periodo
          <input
            value={filtroPeriodo}
            onChange={(e) => setFiltroPeriodo(e.target.value)}
            placeholder="Todos"
            list="periodos-existentes"
          />
        </label>
        <label style={{ maxWidth: 180 }}>
          Sede
          <select value={filtroSede} onChange={(e) => setFiltroSede(e.target.value)}>
            <option value="">Todas</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label style={{ maxWidth: 180 }}>
          Carrera
          <select value={filtroCarrera} onChange={(e) => setFiltroCarrera(e.target.value)}>
            <option value="">Todas</option>
            {carreras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label style={{ maxWidth: 120 }}>
          Curso
          <select value={filtroCurso} onChange={(e) => setFiltroCurso(e.target.value)}>
            <option value="">Todos</option>
            {opcionesFiltro.cursos.map((c) => (
              <option key={c} value={String(c)}>
                {c}º
              </option>
            ))}
          </select>
        </label>
        <label style={{ maxWidth: 120 }}>
          Sección
          <select value={filtroSeccion} onChange={(e) => setFiltroSeccion(e.target.value)}>
            <option value="">Todas</option>
            {opcionesFiltro.secciones.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {(filtroSede || filtroCarrera || filtroCurso || filtroSeccion) && (
          <button
            type="button"
            className="chip"
            onClick={() => {
              setFiltroSede('')
              setFiltroCarrera('')
              setFiltroCurso('')
              setFiltroSeccion('')
            }}
          >
            Limpiar filtros
          </button>
        )}
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
                <th>Días</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {catedrasFiltradas.map((c) => (
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
                      <td style={{ minWidth: 180 }}>
                        <SelectorDias
                          seleccionados={editForm.dias_semana || []}
                          onChange={(dias) => setEditForm({ ...editForm, dias_semana: dias })}
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
                      <td className="muted-text" style={{ fontSize: 12 }}>
                        {(c.catedra_horario || []).length
                          ? DIAS_SEMANA.filter((d) => c.catedra_horario.some((h) => h.dia_semana === d.value))
                              .map((d) => d.label)
                              .join(', ')
                          : '—'}
                      </td>
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
              {catedrasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={8}>{catedras.length === 0 ? 'No hay cátedras cargadas.' : 'Ninguna cátedra coincide con la búsqueda.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
