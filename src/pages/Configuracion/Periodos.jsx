import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatoLargo } from '../../lib/fechas'

const empty = { nombre: '', anio: new Date().getFullYear(), etiqueta_periodo_lectivo: '', fecha_inicio: '', fecha_fin: '' }

export function Periodos() {
  const [periodos, setPeriodos] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const cargar = () => {
    setLoading(true)
    supabase
      .from('periodo_academico')
      .select('*')
      .order('fecha_inicio', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setPeriodos(data)
        setLoading(false)
      })
  }

  useEffect(cargar, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.from('periodo_academico').insert({
      nombre: form.nombre,
      anio: Number(form.anio),
      etiqueta_periodo_lectivo: form.etiqueta_periodo_lectivo.trim(),
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setForm({ ...empty, anio: form.anio })
    cargar()
  }

  // Solo puede haber un período activo: primero se desactiva el
  // vigente (si hay), después se activa el elegido.
  const activar = async (id) => {
    setError('')
    const { error: e1 } = await supabase.from('periodo_academico').update({ activo: false }).eq('activo', true)
    if (e1) {
      setError(e1.message)
      return
    }
    const { error: e2 } = await supabase.from('periodo_academico').update({ activo: true }).eq('id', id)
    if (e2) {
      setError(e2.message)
      return
    }
    cargar()
  }

  const desactivarTodos = async () => {
    if (!confirm('¿Desactivar todos los períodos? El registro de asistencia a clases queda bloqueado hasta activar uno nuevo.'))
      return
    const { error } = await supabase.from('periodo_academico').update({ activo: false }).eq('activo', true)
    if (error) {
      setError(error.message)
      return
    }
    cargar()
  }

  const eliminar = async (p) => {
    if (p.activo) {
      alert('No se puede eliminar el período activo. Desactivalo primero.')
      return
    }
    if (!confirm(`¿Eliminar el período "${p.nombre} ${p.anio}"?`)) return
    const { error } = await supabase.from('periodo_academico').delete().eq('id', p.id)
    if (error) {
      alert(error.message)
      return
    }
    cargar()
  }

  return (
    <div>
      <p className="muted-text">
        Solo el período marcado como activo permite registrar asistencia a clases día a día. La etiqueta debe
        coincidir con el valor de "Periodo lectivo" que usan las cátedras de ese período (por ejemplo "2026").
      </p>

      <form className="form-card" onSubmit={handleSubmit} style={{ marginBottom: '1.5rem' }}>
        <div className="form-grid">
          <label>
            Nombre
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Año Lectivo"
              required
            />
          </label>
          <label>
            Año
            <input
              type="number"
              value={form.anio}
              onChange={(e) => setForm({ ...form, anio: e.target.value })}
              required
            />
          </label>
          <label>
            Etiqueta periodo_lectivo (cátedras)
            <input
              value={form.etiqueta_periodo_lectivo}
              onChange={(e) => setForm({ ...form, etiqueta_periodo_lectivo: e.target.value })}
              placeholder="2026"
              required
            />
          </label>
          <label>
            Inicio
            <input
              type="date"
              value={form.fecha_inicio}
              onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
              required
            />
          </label>
          <label>
            Fin
            <input
              type="date"
              value={form.fecha_fin}
              onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
              required
            />
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : '+ Nuevo período'}
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
                <th>Nombre</th>
                <th>Etiqueta</th>
                <th>Rango</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.nombre} {p.anio}
                  </td>
                  <td>{p.etiqueta_periodo_lectivo}</td>
                  <td>
                    {formatoLargo(p.fecha_inicio)} al {formatoLargo(p.fecha_fin)}
                  </td>
                  <td>{p.activo ? <span className="badge badge-success">Activo</span> : 'Inactivo'}</td>
                  <td>
                    {!p.activo && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => activar(p.id)}>
                        Activar
                      </button>
                    )}{' '}
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => eliminar(p)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {periodos.length === 0 && (
                <tr>
                  <td colSpan={5}>No hay períodos cargados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {periodos.some((p) => p.activo) && (
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={desactivarTodos}>
            Desactivar todos los períodos
          </button>
        </div>
      )}
    </div>
  )
}
