import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const empty = { codigo: '', nombre: '', carrera_id: '', curso_nivel: '', horas_totales_programadas: '', optativa: false }

export function Asignaturas() {
  const [asignaturas, setAsignaturas] = useState([])
  const [carreras, setCarreras] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState(empty)

  const cargar = async () => {
    setLoading(true)
    const [{ data: a, error: e1 }, { data: c, error: e2 }] = await Promise.all([
      supabase.from('asignaturas').select('*, carreras(nombre)').order('nombre'),
      supabase.from('carreras').select('*').order('nombre'),
    ])
    if (e1 || e2) setError((e1 || e2).message)
    setAsignaturas(a || [])
    setCarreras(c || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.from('asignaturas').insert({
      codigo: form.codigo,
      nombre: form.nombre,
      carrera_id: form.carrera_id,
      curso_nivel: Number(form.curso_nivel),
      horas_totales_programadas: form.horas_totales_programadas ? Number(form.horas_totales_programadas) : 0,
      optativa: form.optativa,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setForm(empty)
    cargar()
  }

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar esta asignatura?')) return
    const { error } = await supabase.from('asignaturas').delete().eq('id', id)
    if (error) {
      alert('No se pudo eliminar (probablemente tiene cátedras asociadas).')
      return
    }
    cargar()
  }

  const empezarEdicion = (a) => {
    setEditId(a.id)
    setEditForm({
      codigo: a.codigo,
      nombre: a.nombre,
      carrera_id: a.carrera_id,
      curso_nivel: a.curso_nivel,
      horas_totales_programadas: a.horas_totales_programadas ?? '',
      optativa: a.optativa ?? false,
    })
  }

  const guardarEdicion = async (id) => {
    const { error } = await supabase
      .from('asignaturas')
      .update({
        codigo: editForm.codigo,
        nombre: editForm.nombre,
        carrera_id: editForm.carrera_id,
        curso_nivel: Number(editForm.curso_nivel),
        horas_totales_programadas: editForm.horas_totales_programadas ? Number(editForm.horas_totales_programadas) : 0,
        optativa: editForm.optativa,
      })
      .eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    setEditId(null)
    cargar()
  }

  if (loading) return <p>Cargando...</p>

  return (
    <div>
      <form className="form-card" onSubmit={handleSubmit} style={{ marginBottom: '1.5rem' }}>
        <div className="form-grid">
          <label>
            Código
            <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} required />
          </label>
          <label>
            Nombre
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          </label>
          <label>
            Carrera
            <select
              value={form.carrera_id}
              onChange={(e) => setForm({ ...form, carrera_id: e.target.value })}
              required
            >
              <option value="">Seleccionar...</option>
              {carreras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Curso / Nivel
            <input
              type="number"
              min="1"
              value={form.curso_nivel}
              onChange={(e) => setForm({ ...form, curso_nivel: e.target.value })}
              required
            />
          </label>
          <label>
            Horas totales programadas
            <input
              type="number"
              min="0"
              value={form.horas_totales_programadas}
              onChange={(e) => setForm({ ...form, horas_totales_programadas: e.target.value })}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: 'row' }}>
            <input
              type="checkbox"
              checked={form.optativa}
              onChange={(e) => setForm({ ...form, optativa: e.target.checked })}
            />
            Optativa
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : '+ Nueva asignatura'}
          </button>
        </div>
      </form>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Carrera</th>
              <th>Curso</th>
              <th>Hs. programadas</th>
              <th>Optativa</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {asignaturas.map((a) => (
              <tr key={a.id}>
                {editId === a.id ? (
                  <>
                    <td>
                      <input
                        value={editForm.codigo}
                        onChange={(e) => setEditForm({ ...editForm, codigo: e.target.value })}
                        style={{ width: 90 }}
                      />
                    </td>
                    <td>
                      <input value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} />
                    </td>
                    <td>
                      <select
                        value={editForm.carrera_id}
                        onChange={(e) => setEditForm({ ...editForm, carrera_id: e.target.value })}
                      >
                        {carreras.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={editForm.curso_nivel}
                        onChange={(e) => setEditForm({ ...editForm, curso_nivel: e.target.value })}
                        style={{ width: 60 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={editForm.horas_totales_programadas}
                        onChange={(e) => setEditForm({ ...editForm, horas_totales_programadas: e.target.value })}
                        style={{ width: 80 }}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={editForm.optativa}
                        onChange={(e) => setEditForm({ ...editForm, optativa: e.target.checked })}
                      />
                    </td>
                    <td>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => guardarEdicion(a.id)}>
                        Guardar
                      </button>{' '}
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditId(null)}>
                        Cancelar
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{a.codigo}</td>
                    <td>{a.nombre}</td>
                    <td>{a.carreras?.nombre}</td>
                    <td>{a.curso_nivel}</td>
                    <td>{a.horas_totales_programadas}</td>
                    <td>{a.optativa ? 'Sí' : 'No'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => empezarEdicion(a)}>
                        Editar
                      </button>{' '}
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => eliminar(a.id)}>
                        Eliminar
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {asignaturas.length === 0 && (
              <tr>
                <td colSpan={7}>No hay asignaturas cargadas.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
