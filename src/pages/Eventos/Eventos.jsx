import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatoLargo } from '../../lib/fechas'

const empty = { nombre: '', fecha: '', grupo: '' }

export function Eventos() {
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const cargar = () => {
    setLoading(true)
    supabase
      .from('evento')
      .select('*')
      .order('fecha', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setEventos(data || [])
        setLoading(false)
      })
  }

  useEffect(cargar, [])

  const grupos = useMemo(() => [...new Set(eventos.map((e) => e.grupo).filter(Boolean))].sort(), [eventos])

  const crear = async (ev) => {
    ev.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.from('evento').insert({
      nombre: form.nombre.trim(),
      fecha: form.fecha,
      grupo: form.grupo.trim() || null,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setForm(empty)
    cargar()
  }

  const toggleActivo = async (e) => {
    const { error } = await supabase.from('evento').update({ activo: !e.activo }).eq('id', e.id)
    if (error) {
      setError(error.message)
      return
    }
    cargar()
  }

  const empezarEdicion = (e) => {
    setEditId(e.id)
    setEditForm({ nombre: e.nombre, fecha: e.fecha, grupo: e.grupo || '' })
  }

  const guardarEdicion = async (id) => {
    const { error } = await supabase
      .from('evento')
      .update({
        nombre: editForm.nombre.trim(),
        fecha: editForm.fecha,
        grupo: editForm.grupo.trim() || null,
      })
      .eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    setEditId(null)
    cargar()
  }

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Gestión de Eventos</h1>
        <p>Reuniones docentes y capacitaciones. Eventos con el mismo grupo cuentan como "asistió a cualquiera" en los reportes.</p>
      </div>

      <form onSubmit={crear} className="form-card" style={{ marginBottom: '1.5rem' }}>
        <div className="form-grid">
          <label>
            Nombre
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Reunión docente — 1er trimestre"
              required
            />
          </label>
          <label>
            Fecha
            <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
          </label>
          <label>
            Grupo (opcional)
            <input
              value={form.grupo}
              onChange={(e) => setForm({ ...form, grupo: e.target.value })}
              placeholder="Reunión docente 2026"
              list="grupos-existentes"
            />
            <datalist id="grupos-existentes">
              {grupos.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : '+ Nuevo evento'}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="muted-text">Cargando...</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Fecha</th>
                <th>Grupo</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.id}>
                  {editId === e.id ? (
                    <>
                      <td>
                        <input value={editForm.nombre} onChange={(ev) => setEditForm({ ...editForm, nombre: ev.target.value })} />
                      </td>
                      <td>
                        <input
                          type="date"
                          value={editForm.fecha}
                          onChange={(ev) => setEditForm({ ...editForm, fecha: ev.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          value={editForm.grupo}
                          onChange={(ev) => setEditForm({ ...editForm, grupo: ev.target.value })}
                          list="grupos-existentes"
                        />
                      </td>
                      <td>
                        {e.activo ? <span className="badge badge-success">Activo</span> : <span className="badge badge-muted">Inactivo</span>}
                      </td>
                      <td>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => guardarEdicion(e.id)}>
                          Guardar
                        </button>{' '}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditId(null)}>
                          Cancelar
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{e.nombre}</td>
                      <td>{formatoLargo(e.fecha)}</td>
                      <td>{e.grupo ? <span className="badge badge-gold">{e.grupo}</span> : <span className="muted-text">—</span>}</td>
                      <td>
                        {e.activo ? <span className="badge badge-success">Activo</span> : <span className="badge badge-muted">Inactivo</span>}
                      </td>
                      <td>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => empezarEdicion(e)}>
                          Editar
                        </button>{' '}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleActivo(e)}>
                          {e.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {eventos.length === 0 && (
                <tr>
                  <td colSpan={5}>No hay eventos cargados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
