import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const empty = { codigo: '', nombre: '' }

export function Sedes() {
  const [sedes, setSedes] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const cargar = () => {
    setLoading(true)
    supabase
      .from('sedes')
      .select('*')
      .order('nombre')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setSedes(data)
        setLoading(false)
      })
  }

  useEffect(cargar, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.from('sedes').insert({ codigo: form.codigo, nombre: form.nombre })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setForm(empty)
    cargar()
  }

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar esta sede?')) return
    const { error } = await supabase.from('sedes').delete().eq('id', id)
    if (error) {
      alert('No se pudo eliminar (probablemente tiene carreras o cátedras asociadas).')
      return
    }
    cargar()
  }

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
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : '+ Nueva sede'}
          </button>
        </div>
      </form>

      {loading ? (
        <p>Cargando...</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sedes.map((s) => (
                <tr key={s.id}>
                  <td>{s.codigo}</td>
                  <td>{s.nombre}</td>
                  <td>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => eliminar(s.id)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {sedes.length === 0 && (
                <tr>
                  <td colSpan={3}>No hay sedes cargadas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
