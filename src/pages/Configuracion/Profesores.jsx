import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

const empty = { documento_identidad: '', nombres: '', apellidos: '', email: '', telefono: '' }

export function Profesores() {
  const [profesores, setProfesores] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState(empty)
  const [busqueda, setBusqueda] = useState('')

  const profesoresFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return profesores
    return profesores.filter((p) =>
      [p.documento_identidad, p.nombres, p.apellidos].some((campo) => campo?.toLowerCase().includes(q))
    )
  }, [profesores, busqueda])

  const cargar = () => {
    setLoading(true)
    supabase
      .from('profesores')
      .select('*')
      .order('apellidos')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setProfesores(data)
        setLoading(false)
      })
  }

  useEffect(cargar, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.from('profesores').insert({
      documento_identidad: form.documento_identidad,
      nombres: form.nombres,
      apellidos: form.apellidos,
      email: form.email || null,
      telefono: form.telefono || null,
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
    if (!confirm('¿Eliminar este profesor?')) return
    const { error } = await supabase.from('profesores').delete().eq('id', id)
    if (error) {
      alert('No se pudo eliminar (probablemente tiene cátedras asociadas).')
      return
    }
    cargar()
  }

  const empezarEdicion = (p) => {
    setEditId(p.id)
    setEditForm({
      documento_identidad: p.documento_identidad,
      nombres: p.nombres,
      apellidos: p.apellidos,
      email: p.email || '',
      telefono: p.telefono || '',
    })
  }

  const guardarEdicion = async (id) => {
    try {
      const { error } = await supabase
        .from('profesores')
        .update({
          documento_identidad: editForm.documento_identidad,
          nombres: editForm.nombres,
          apellidos: editForm.apellidos,
          email: editForm.email || null,
          telefono: editForm.telefono || null,
        })
        .eq('id', id)
      if (error) {
        alert(error.message)
        return
      }
      setEditId(null)
      cargar()
    } catch (e) {
      alert('No se pudo guardar: ' + e.message)
    }
  }

  return (
    <div>
      <form className="form-card" onSubmit={handleSubmit} style={{ marginBottom: '1.5rem' }}>
        <div className="form-grid">
          <label>
            Documento de identidad
            <input
              value={form.documento_identidad}
              onChange={(e) => setForm({ ...form, documento_identidad: e.target.value })}
              required
            />
          </label>
          <label>
            Nombres
            <input value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value })} required />
          </label>
          <label>
            Apellidos
            <input
              value={form.apellidos}
              onChange={(e) => setForm({ ...form, apellidos: e.target.value })}
              required
            />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>
            Teléfono
            <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : '+ Nuevo profesor'}
          </button>
        </div>
      </form>

      {loading ? (
        <p>Cargando...</p>
      ) : (
        <>
          <input
            type="text"
            placeholder="Buscar por documento, nombre o apellido..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ marginBottom: '0.75rem', maxWidth: 340 }}
          />
          <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Nombres</th>
                <th>Apellidos</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {profesoresFiltrados.map((p) => (
                <tr key={p.id}>
                  {editId === p.id ? (
                    <>
                      <td>
                        <input
                          value={editForm.documento_identidad}
                          onChange={(e) => setEditForm({ ...editForm, documento_identidad: e.target.value })}
                          style={{ width: 110 }}
                        />
                      </td>
                      <td>
                        <input
                          value={editForm.nombres}
                          onChange={(e) => setEditForm({ ...editForm, nombres: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          value={editForm.apellidos}
                          onChange={(e) => setEditForm({ ...editForm, apellidos: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          value={editForm.telefono}
                          onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })}
                          style={{ width: 110 }}
                        />
                      </td>
                      <td>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => guardarEdicion(p.id)}>
                          Guardar
                        </button>{' '}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditId(null)}>
                          Cancelar
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{p.documento_identidad}</td>
                      <td>{p.nombres}</td>
                      <td>{p.apellidos}</td>
                      <td>{p.email || '—'}</td>
                      <td>{p.telefono || '—'}</td>
                      <td>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => empezarEdicion(p)}>
                          Editar
                        </button>{' '}
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => eliminar(p.id)}>
                          Eliminar
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {profesoresFiltrados.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    {profesores.length === 0 ? 'No hay profesores cargados.' : 'Ningún profesor coincide con la búsqueda.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  )
}
