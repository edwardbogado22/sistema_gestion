import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const empty = { codigo: '', nombre: '', sede_id: '' }

export function Carreras() {
  const [carreras, setCarreras] = useState([])
  const [sedes, setSedes] = useState([])
  const [carrerasSedes, setCarrerasSedes] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(empty)
  const [sedesSeleccionadas, setSedesSeleccionadas] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editandoId, setEditandoId] = useState(null)

  const cargar = async () => {
    setLoading(true)
    const [{ data: c, error: e1 }, { data: s, error: e2 }, { data: cs, error: e3 }] = await Promise.all([
      supabase.from('carreras').select('*, sedes(nombre)').order('nombre'),
      supabase.from('sedes').select('*').order('nombre'),
      supabase.from('carreras_sedes').select('carrera_id, sede_id, sedes(nombre)'),
    ])
    if (e1 || e2 || e3) setError((e1 || e2 || e3).message)
    setCarreras(c || [])
    setSedes(s || [])
    setCarrerasSedes(cs || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const sedesDe = (carreraId) => carrerasSedes.filter((cs) => cs.carrera_id === carreraId)

  const toggleSede = (sedeId) => {
    setSedesSeleccionadas((prev) => (prev.includes(sedeId) ? prev.filter((id) => id !== sedeId) : [...prev, sedeId]))
  }

  const sincronizarSedes = async (carreraId) => {
    const { error: delErr } = await supabase.from('carreras_sedes').delete().eq('carrera_id', carreraId)
    if (delErr) return delErr
    if (sedesSeleccionadas.length === 0) return null
    const filas = sedesSeleccionadas.map((sedeId) => ({ carrera_id: carreraId, sede_id: sedeId }))
    const { error: insErr } = await supabase.from('carreras_sedes').insert(filas)
    return insErr || null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = { codigo: form.codigo, nombre: form.nombre, sede_id: form.sede_id }
    const { data, error } = editandoId
      ? await supabase.from('carreras').update(payload).eq('id', editandoId).select().single()
      : await supabase.from('carreras').insert(payload).select().single()
    if (error) {
      setSaving(false)
      setError(error.message)
      return
    }
    const errSedes = await sincronizarSedes(data.id)
    setSaving(false)
    if (errSedes) {
      setError(errSedes.message)
      return
    }
    setForm(empty)
    setSedesSeleccionadas([])
    setEditandoId(null)
    cargar()
  }

  const editar = (carrera) => {
    setEditandoId(carrera.id)
    setForm({ codigo: carrera.codigo, nombre: carrera.nombre, sede_id: carrera.sede_id })
    setSedesSeleccionadas(sedesDe(carrera.id).map((cs) => cs.sede_id))
    setError('')
  }

  const cancelarEdicion = () => {
    setEditandoId(null)
    setForm(empty)
    setSedesSeleccionadas([])
    setError('')
  }

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar esta carrera?')) return
    const { error } = await supabase.from('carreras').delete().eq('id', id)
    if (error) {
      alert('No se pudo eliminar (probablemente tiene asignaturas asociadas).')
      return
    }
    if (editandoId === id) cancelarEdicion()
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
          <label className="full-width">
            Sede principal
            <select value={form.sede_id} onChange={(e) => setForm({ ...form, sede_id: e.target.value })} required>
              <option value="">Seleccionar...</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="full-width">
            Sedes donde se dicta
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', paddingTop: 4 }}>
              {sedes.map((s) => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, color: 'var(--ink)' }}>
                  <input
                    type="checkbox"
                    checked={sedesSeleccionadas.includes(s.id)}
                    onChange={() => toggleSede(s.id)}
                    style={{ width: 'auto' }}
                  />
                  {s.nombre}
                </label>
              ))}
            </div>
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : editandoId ? 'Guardar cambios' : '+ Nueva carrera'}
          </button>
          {editandoId && (
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={cancelarEdicion}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Sede principal</th>
              <th>Se dicta en</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {carreras.map((c) => (
              <tr key={c.id}>
                <td>{c.codigo}</td>
                <td>{c.nombre}</td>
                <td>{c.sedes?.nombre}</td>
                <td>
                  {sedesDe(c.id).length > 0
                    ? sedesDe(c.id)
                        .map((cs) => cs.sedes?.nombre)
                        .join(', ')
                    : <span className="muted-text">Sin sedes asignadas</span>}
                </td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => editar(c)}>
                    Editar
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => eliminar(c.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {carreras.length === 0 && (
              <tr>
                <td colSpan={5}>No hay carreras cargadas.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
