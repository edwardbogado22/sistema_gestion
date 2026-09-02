import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BuscadorSelect } from '../../components/BuscadorSelect'

const ROLES = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'SECRETARIO', label: 'Secretario de Carrera' },
  { value: 'DIRECTOR', label: 'Director de Carrera' },
]

// Crear la cuenta de acceso (email + contraseña) exige la service_role key,
// que no puede vivir en el frontend: eso se sigue haciendo en Supabase →
// Authentication → Users. Pero la lista de acá trae TODAS esas cuentas
// (admin_listar_perfiles) aunque todavía no tengan rol asignado, para que
// una cuenta recién creada no "desaparezca": aparece como pendiente y desde
// acá mismo se le asigna rol, alcance, o se la bloquea.
export function Usuarios() {
  const [funcionarios, setFuncionarios] = useState([])
  const [alcances, setAlcances] = useState([])
  const [carreras, setCarreras] = useState([])
  const [sedes, setSedes] = useState([])
  const [carrerasSedes, setCarrerasSedes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [nuevoAlcance, setNuevoAlcance] = useState({})
  const [alcanceAbierto, setAlcanceAbierto] = useState({})
  const [altaDraft, setAltaDraft] = useState({})
  const [dandoAlta, setDandoAlta] = useState('')

  const cargar = async () => {
    setLoading(true)
    const [f, a, c, s, cs] = await Promise.all([
      supabase.rpc('admin_listar_perfiles'),
      supabase.from('usuario_alcance').select('id, user_id, carrera_id, sede_id'),
      supabase.from('carreras').select('id, nombre').order('nombre'),
      supabase.from('sedes').select('id, nombre').order('nombre'),
      supabase.from('carreras_sedes').select('carrera_id, sede_id'),
    ])
    const err = f.error || a.error || c.error || s.error || cs.error
    if (err) setError(err.message)
    setFuncionarios(f.data || [])
    setAlcances(a.data || [])
    setCarreras(c.data || [])
    setSedes(s.data || [])
    setCarrerasSedes(cs.data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const nombrePor = useMemo(() => {
    const carrera = Object.fromEntries(carreras.map((c) => [c.id, c.nombre]))
    const sede = Object.fromEntries(sedes.map((s) => [s.id, s.nombre]))
    return { carrera, sede }
  }, [carreras, sedes])

  const asignarPerfil = async (userId) => {
    const funcionario = funcionarios.find((f) => f.user_id === userId)
    const draft = altaDraft[userId] || {}
    const nombre = (draft.nombre ?? '').trim()
    const rol = draft.rol || 'SECRETARIO'
    if (!nombre) return setError('Escribí el nombre completo antes de asignar el rol.')
    setError('')
    setOk('')
    setDandoAlta(userId)
    const { error } = await supabase.rpc('admin_alta_perfil', {
      p_email: funcionario.email,
      p_nombre: nombre,
      p_rol: rol,
    })
    setDandoAlta('')
    if (error) return setError(error.message)
    setAltaDraft((prev) => ({ ...prev, [userId]: undefined }))
    setOk(`Rol asignado a ${nombre}.`)
    cargar()
  }

  const cambiarRol = async (userId, rol) => {
    setError('')
    setOk('')
    const { error } = await supabase.from('usuarios_perfil').update({ rol, actualizado_en: new Date().toISOString() }).eq('user_id', userId)
    if (error) return setError(error.message)
    setOk('Rol actualizado.')
    cargar()
  }

  const cambiarActivo = async (userId, activo) => {
    setError('')
    setOk('')
    const { error } = await supabase.from('usuarios_perfil').update({ activo, actualizado_en: new Date().toISOString() }).eq('user_id', userId)
    if (error) return setError(error.message)
    setOk(activo ? 'Acceso habilitado.' : 'Acceso bloqueado.')
    cargar()
  }

  const agregarAlcance = async (userId) => {
    const draft = nuevoAlcance[userId] || {}
    if (!draft.carrera_id) return setError('Elegí una carrera.')
    setError('')
    setOk('')
    const { error } = await supabase.from('usuario_alcance').insert({
      user_id: userId,
      carrera_id: draft.carrera_id,
      sede_id: draft.sede_id || null,
    })
    if (error) return setError(error.message)
    setNuevoAlcance((prev) => ({ ...prev, [userId]: {} }))
    setOk('Alcance agregado.')
    cargar()
  }

  const quitarAlcance = async (id) => {
    setError('')
    setOk('')
    const { error } = await supabase.from('usuario_alcance').delete().eq('id', id)
    if (error) return setError(error.message)
    setOk('Alcance quitado.')
    cargar()
  }

  // Solo las sedes donde efectivamente se dicta la carrera elegida
  const sedesDe = (carreraId) => {
    if (!carreraId) return sedes
    const ids = carrerasSedes.filter((cs) => cs.carrera_id === carreraId).map((cs) => cs.sede_id)
    return ids.length ? sedes.filter((s) => ids.includes(s.id)) : sedes
  }

  const resumenAlcance = (userId) => {
    const suyos = alcances.filter((a) => a.user_id === userId)
    if (suyos.length === 0) return null
    return suyos
      .map((a) => `${nombrePor.carrera[a.carrera_id] || '—'} · ${a.sede_id ? nombrePor.sede[a.sede_id] : 'todas las sedes'}`)
      .join('  |  ')
  }

  if (loading) return <p className="muted-text">Cargando...</p>

  return (
    <div>
      <p className="muted-text">
        El alta de la cuenta de acceso (email y contraseña) se hace en Supabase → Authentication → Users. En
        cuanto existe, aparece acá abajo — con rol asignado o pendiente — para definir su rol y, para
        secretarios y directores, qué carreras y sedes pueden ver.
      </p>

      {error && <p className="error-text">{error}</p>}
      {ok && <p className="muted-text">{ok}</p>}

      {funcionarios.length === 0 && (
        <p className="muted-text">Todavía no hay ninguna cuenta creada en Authentication → Users.</p>
      )}

      {funcionarios.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Funcionario</th>
              <th>Email</th>
              <th style={{ width: 190 }}>Rol</th>
              <th>Alcance</th>
              <th style={{ width: 110 }}>Estado</th>
              <th style={{ width: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {funcionarios.map((f) => {
              const tienePerfil = !!f.rol
              const conAlcance = f.rol === 'SECRETARIO' || f.rol === 'DIRECTOR'
              const abierto = !!alcanceAbierto[f.user_id]
              const draftAlta = altaDraft[f.user_id] || {}
              const draftAlcance = nuevoAlcance[f.user_id] || {}
              const resumen = conAlcance ? resumenAlcance(f.user_id) : null

              return (
                <Fragment key={f.user_id}>
                  <tr>
                    <td>{f.nombre_completo || <span className="muted-text">—</span>}</td>
                    <td>{f.email}</td>
                    <td>
                      {tienePerfil ? (
                        <select value={f.rol} onChange={(e) => cambiarRol(f.user_id, e.target.value)}>
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="badge badge-muted">Sin rol asignado</span>
                      )}
                    </td>
                    <td>
                      {!conAlcance && <span className="muted-text">—</span>}
                      {conAlcance && !resumen && <span className="error-text">Sin alcance: no ve nada</span>}
                      {conAlcance && resumen && <span style={{ fontSize: 13 }}>{resumen}</span>}
                    </td>
                    <td>
                      {tienePerfil ? (
                        <span className={`badge ${f.activo ? 'badge-success' : 'badge-muted'}`}>
                          {f.activo ? 'Activo' : 'Bloqueado'}
                        </span>
                      ) : (
                        <span className="muted-text">—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {tienePerfil && conAlcance && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setAlcanceAbierto((prev) => ({ ...prev, [f.user_id]: !abierto }))}
                          >
                            {abierto ? 'Cerrar alcance' : 'Alcance'}
                          </button>
                        )}
                        {tienePerfil && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => cambiarActivo(f.user_id, !f.activo)}
                          >
                            {f.activo ? 'Bloquear' : 'Habilitar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {!tienePerfil && (
                    <tr key={`${f.user_id}-alta`}>
                      <td colSpan={6} style={{ background: 'var(--color-bg-soft, rgba(0,0,0,0.03))' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '6px 0' }}>
                          <input
                            type="text"
                            placeholder="Nombre completo"
                            value={draftAlta.nombre ?? ''}
                            onChange={(e) =>
                              setAltaDraft((prev) => ({ ...prev, [f.user_id]: { ...draftAlta, nombre: e.target.value } }))
                            }
                            style={{ flex: '1 1 220px' }}
                          />
                          <select
                            value={draftAlta.rol || 'SECRETARIO'}
                            onChange={(e) =>
                              setAltaDraft((prev) => ({ ...prev, [f.user_id]: { ...draftAlta, rol: e.target.value } }))
                            }
                          >
                            {ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={dandoAlta === f.user_id}
                            onClick={() => asignarPerfil(f.user_id)}
                          >
                            {dandoAlta === f.user_id ? 'Asignando...' : 'Asignar rol'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {tienePerfil && conAlcance && abierto && (
                    <tr key={`${f.user_id}-alcance`}>
                      <td colSpan={6} style={{ background: 'var(--color-bg-soft, rgba(0,0,0,0.03))' }}>
                        <div style={{ padding: '8px 0' }}>
                          {alcances
                            .filter((a) => a.user_id === f.user_id)
                            .map((a) => (
                              <div className="stat-breakdown-row" key={a.id}>
                                <span>
                                  {nombrePor.carrera[a.carrera_id] || '—'}
                                  {' · '}
                                  {a.sede_id ? nombrePor.sede[a.sede_id] : 'Todas las sedes'}
                                </span>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => quitarAlcance(a.id)}>
                                  Quitar
                                </button>
                              </div>
                            ))}

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                            <div style={{ flex: '1 1 220px' }}>
                              <BuscadorSelect
                                opciones={carreras.map((c) => ({ value: c.id, label: c.nombre }))}
                                value={draftAlcance.carrera_id || ''}
                                onChange={(v) =>
                                  setNuevoAlcance((prev) => ({ ...prev, [f.user_id]: { carrera_id: v, sede_id: '' } }))
                                }
                                placeholder="Carrera..."
                              />
                            </div>
                            <select
                              value={draftAlcance.sede_id || ''}
                              onChange={(e) =>
                                setNuevoAlcance((prev) => ({
                                  ...prev,
                                  [f.user_id]: { ...draftAlcance, sede_id: e.target.value },
                                }))
                              }
                            >
                              <option value="">Todas las sedes</option>
                              {sedesDe(draftAlcance.carrera_id).map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.nombre}
                                </option>
                              ))}
                            </select>
                            <button type="button" className="btn btn-sm" onClick={() => agregarAlcance(f.user_id)}>
                              Agregar
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
