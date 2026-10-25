import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { coincideTexto } from '../../lib/buscar'
import { formatoLargo } from '../../lib/fechas'

const empty = { documento_identidad: '', nombres: '', apellidos: '', email: '', telefono: '' }

export function Profesores() {
  // Configuración → Profesores es de Dirección Académica; la Secretaría de
  // Dirección Académica entra por /profesores solo a consultar el padrón.
  const { esAdmin } = useAuth()
  const soloLectura = !esAdmin
  const [profesores, setProfesores] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState(empty)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('activos')
  const [aviso, setAviso] = useState('')

  const profesoresFiltrados = useMemo(
    () =>
      profesores.filter(
        (p) =>
          (filtroEstado === 'todos' || (filtroEstado === 'activos') === (p.activo !== false)) &&
          coincideTexto(busqueda, `${p.documento_identidad} ${p.nombres} ${p.apellidos}`),
      ),
    [profesores, busqueda, filtroEstado],
  )

  const inactivos = useMemo(() => profesores.filter((p) => p.activo === false).length, [profesores])

  // Inactivar o reactivar (solo ADMIN, lo valida la base): el profesor
  // queda en el padrón con su histórico, pero no se puede asignar a
  // cátedras, suplencias ni mesas hasta reactivarlo.
  const cambiarEstado = async (ids, activo, motivo) => {
    setAviso('')
    setError('')
    const { data, error: e } = await supabase.rpc('profesores_cambiar_estado', {
      p_ids: ids,
      p_activo: activo,
      p_motivo: motivo || null,
    })
    if (e) {
      setError(e.message)
      return null
    }
    const omitidos = data?.omitidos || []
    setAviso(
      `${data.cambiados} profesor(es) ${activo ? 'reactivado(s)' : 'inactivado(s)'}.` +
        (omitidos.length
          ? ` No se inactivó a ${omitidos.length} porque tiene(n) una cátedra activa en ${data.periodo}: ${omitidos.join('; ')}.`
          : ''),
    )
    cargar()
    return data
  }

  const inactivar = (p) => {
    const motivo = window.prompt(
      `Inactivar a ${p.apellidos}, ${p.nombres}.\n\nMotivo (opcional, por ejemplo "jubilado" o "sin carga horaria"):`,
      '',
    )
    if (motivo === null) return
    cambiarEstado([p.id], false, motivo)
  }

  const pendientes = useMemo(() => profesores.filter((p) => p.confirmado === false), [profesores])

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
      setError(error.code === '23505' ? 'Ya existe un profesor con ese documento de identidad.' : error.message)
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

  const confirmarPendiente = async (id) => {
    const { error } = await supabase.from('profesores').update({ confirmado: true }).eq('id', id)
    if (error) {
      alert(error.message)
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
        alert(error.code === '23505' ? 'Ya existe un profesor con ese documento de identidad.' : error.message)
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
      {soloLectura ? (
        <div className="page-header">
          <h1>Profesores</h1>
          <p>Padrón de profesores de la facultad (solo consulta).</p>
        </div>
      ) : (
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
      )}

      {!soloLectura && <SinCatedra onInactivar={cambiarEstado} />}

      {aviso && <p className="success-text">{aviso}</p>}
      {error && soloLectura && <p className="error-text">{error}</p>}

      {loading ? (
        <p>Cargando...</p>
      ) : (
        <>
          {pendientes.length > 0 && (
            <p className="error-text">
              Hay {pendientes.length} profesor(es) cargado(s) rápido desde Asistencia a Eventos, pendientes de
              confirmar contra los datos oficiales de la universidad.
            </p>
          )}
          <div className="form-row" style={{ marginBottom: '0.75rem' }}>
            <input
              type="text"
              placeholder="Buscar por documento, nombre o apellido..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ maxWidth: 340, flex: '1 1 240px' }}
            />
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} aria-label="Estado">
              <option value="activos">Activos ({profesores.length - inactivos})</option>
              <option value="inactivos">Inactivos ({inactivos})</option>
              <option value="todos">Todos ({profesores.length})</option>
            </select>
          </div>
          <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Nombres</th>
                <th>Apellidos</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Estado</th>
                {!soloLectura && <th>Acciones</th>}
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
                        {p.confirmado === false ? (
                          <span className="badge badge-gold">Pendiente</span>
                        ) : (
                          <span className="badge badge-success">Confirmado</span>
                        )}
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
                        {p.activo === false ? (
                          <span
                            className="badge badge-muted"
                            title={p.inactivo_desde ? `Inactivo desde el ${formatoLargo(p.inactivo_desde.slice(0, 10))}` : 'Inactivo'}
                          >
                            Inactivo
                          </span>
                        ) : p.confirmado === false ? (
                          <span className="badge badge-gold">Pendiente</span>
                        ) : (
                          <span className="badge badge-success">Activo</span>
                        )}
                        {p.activo === false && p.inactivo_motivo && (
                          <div className="muted-text" style={{ fontSize: 12 }}>
                            {p.inactivo_motivo}
                          </div>
                        )}
                      </td>
                      {!soloLectura && (
                        <td>
                          {p.confirmado === false && (
                            <>
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => confirmarPendiente(p.id)}>
                                Confirmar
                              </button>{' '}
                            </>
                          )}
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => empezarEdicion(p)}>
                            Editar
                          </button>{' '}
                          {p.activo === false ? (
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => cambiarEstado([p.id], true)}>
                              Reactivar
                            </button>
                          ) : (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => inactivar(p)}>
                              Inactivar
                            </button>
                          )}{' '}
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => eliminar(p.id)}>
                            Eliminar
                          </button>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              ))}
              {profesoresFiltrados.length === 0 && (
                <tr>
                  <td colSpan={soloLectura ? 6 : 7}>
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

// Profesores activos sin cátedra activa en un período, para inactivarlos
// juntos. Arrancan destildados los que ese año igual participaron (vocal
// de mesa, suplente o asistencia a eventos), para no inactivarlos por error.
function SinCatedra({ onInactivar }) {
  const [abierto, setAbierto] = useState(false)
  const [periodo, setPeriodo] = useState('')
  const [filas, setFilas] = useState(null)
  const [elegidos, setElegidos] = useState(new Set())
  const [motivo, setMotivo] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!abierto || periodo) return
    supabase.rpc('periodo_lectivo_en_curso').then(({ data }) => setPeriodo(data || String(new Date().getFullYear())))
  }, [abierto, periodo])

  const buscar = async () => {
    setError('')
    setTrabajando(true)
    const { data, error: e } = await supabase.rpc('profesores_sin_catedra', { p_periodo: periodo })
    setTrabajando(false)
    if (e) {
      setError(e.message)
      return
    }
    setFilas(data || [])
    setElegidos(new Set((data || []).filter((f) => !f.vocal_en_mesas && !f.suplente && !f.asistio_eventos).map((f) => f.profesor_id)))
    setMotivo(`Sin cátedra en ${periodo}`)
  }

  const alternar = (id) =>
    setElegidos((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const inactivar = async () => {
    if (!window.confirm(`¿Inactivar ${elegidos.size} profesor(es)? Se pueden reactivar en cualquier momento.`)) return
    setTrabajando(true)
    const r = await onInactivar([...elegidos], false, motivo)
    setTrabajando(false)
    if (r) buscar()
  }

  const si = (v) => (v ? <span className="badge badge-gold">Sí</span> : <span className="muted-text">—</span>)

  if (!abierto) {
    return (
      <div className="form-actions" style={{ marginTop: 0, marginBottom: '1rem' }}>
        <button type="button" className="btn btn-secondary" onClick={() => setAbierto(true)}>
          Profesores sin cátedra en el período…
        </button>
      </div>
    )
  }

  return (
    <div className="form-card" style={{ marginBottom: '1.5rem', maxWidth: 'none' }}>
      <h3 style={{ marginBottom: 6 }}>Profesores activos sin cátedra</h3>
      <p className="muted-text" style={{ marginTop: 0 }}>
        Al inactivarlos siguen en el padrón con todo su histórico, pero no se los puede asignar a cátedras, suplencias ni
        mesas hasta reactivarlos. Arrancan destildados los que ese año fueron vocales, suplentes o fueron a eventos.
      </p>
      <div className="form-row" style={{ marginBottom: 12 }}>
        <label>
          Período lectivo
          <input value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ width: 110 }} />
        </label>
        <button type="button" className="btn btn-primary" onClick={buscar} disabled={!periodo || trabajando}>
          {trabajando ? 'Buscando...' : 'Buscar'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setAbierto(false)}>
          Cerrar
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}

      {filas && filas.length === 0 && <p className="muted-text">Todos los profesores activos tienen cátedra en {periodo}.</p>}

      {filas && filas.length > 0 && (
        <>
          <div className="form-row" style={{ marginBottom: 10 }}>
            <span>
              <strong>{filas.length}</strong> sin cátedra en {periodo}, <strong>{elegidos.size}</strong> elegidos.
            </span>
            <button type="button" className="chip" onClick={() => setElegidos(new Set(filas.map((f) => f.profesor_id)))}>
              Elegir todos
            </button>
            <button type="button" className="chip" onClick={() => setElegidos(new Set())}>
              Ninguno
            </button>
          </div>
          <div className="data-table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Documento</th>
                  <th>Profesor</th>
                  <th>Último período con cátedra</th>
                  <th>Vocal en mesas</th>
                  <th>Suplente</th>
                  <th>Fue a eventos</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.profesor_id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={elegidos.has(f.profesor_id)}
                        onChange={() => alternar(f.profesor_id)}
                        aria-label={`Elegir a ${f.profesor}`}
                      />
                    </td>
                    <td>{f.documento_identidad}</td>
                    <td>{f.profesor}</td>
                    <td>{f.ultimo_periodo_con_catedra || 'Nunca tuvo'}</td>
                    <td>{si(f.vocal_en_mesas)}</td>
                    <td>{si(f.suplente)}</td>
                    <td>{si(f.asistio_eventos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-row" style={{ marginTop: 12 }}>
            <label style={{ flex: '1 1 260px' }}>
              Motivo
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Sin cátedra en 2026" />
            </label>
            <button type="button" className="btn btn-danger" disabled={elegidos.size === 0 || trabajando} onClick={inactivar}>
              Inactivar {elegidos.size} seleccionado(s)
            </button>
          </div>
        </>
      )}
    </div>
  )
}
