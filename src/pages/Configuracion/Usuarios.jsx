import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BuscadorSelect } from '../../components/BuscadorSelect'

// Crear usuarios en Supabase Auth exige la service_role key, que no puede
// vivir en el frontend. Por eso acá se administra rol y alcance de usuarios
// que ya existen: el alta se hace en Authentication → Users.
export function Usuarios() {
  const [perfiles, setPerfiles] = useState([])
  const [alcances, setAlcances] = useState([])
  const [carreras, setCarreras] = useState([])
  const [sedes, setSedes] = useState([])
  const [carrerasSedes, setCarrerasSedes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [nuevoAlcance, setNuevoAlcance] = useState({})

  const cargar = async () => {
    setLoading(true)
    const [p, a, c, s, cs] = await Promise.all([
      supabase.from('usuarios_perfil').select('*').order('nombre_completo'),
      supabase.from('usuario_alcance').select('id, user_id, carrera_id, sede_id'),
      supabase.from('carreras').select('id, nombre').order('nombre'),
      supabase.from('sedes').select('id, nombre').order('nombre'),
      supabase.from('carreras_sedes').select('carrera_id, sede_id'),
    ])
    const err = p.error || a.error || c.error || s.error || cs.error
    if (err) setError(err.message)
    setPerfiles(p.data || [])
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
    setOk(activo ? 'Usuario habilitado.' : 'Usuario deshabilitado.')
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

  if (loading) return <p className="muted-text">Cargando...</p>

  return (
    <div>
      <p className="muted-text">
        El alta de cuentas se hace en Supabase → Authentication → Users. Acá se define el rol y, para los
        secretarios, qué carreras y sedes pueden ver.
      </p>

      {error && <p className="error-text">{error}</p>}
      {ok && <p className="muted-text">{ok}</p>}

      {perfiles.length === 0 && <p className="muted-text">Todavía no hay perfiles cargados.</p>}

      {perfiles.map((p) => {
        const suyos = alcances.filter((a) => a.user_id === p.user_id)
        const draft = nuevoAlcance[p.user_id] || {}

        return (
          <div key={p.user_id} className="stat-card" style={{ marginBottom: 16, textAlign: 'left' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <strong style={{ flex: '1 1 220px' }}>{p.nombre_completo}</strong>

              <select value={p.rol} onChange={(e) => cambiarRol(p.user_id, e.target.value)}>
                <option value="ADMIN">Administrador</option>
                <option value="SECRETARIO">Secretario de Carrera</option>
              </select>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => cambiarActivo(p.user_id, !p.activo)}
              >
                {p.activo ? 'Deshabilitar' : 'Habilitar'}
              </button>

              <span className={`badge ${p.activo ? 'badge-success' : 'badge-muted'}`}>
                {p.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>

            {p.rol === 'SECRETARIO' && (
              <div style={{ marginTop: 12 }}>
                <div className="section-label">
                  <span>Alcance</span>
                </div>

                {suyos.length === 0 && (
                  <p className="error-text">Sin alcance asignado: no va a ver ninguna cátedra.</p>
                )}

                {suyos.map((a) => (
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
                      value={draft.carrera_id || ''}
                      onChange={(v) =>
                        setNuevoAlcance((prev) => ({ ...prev, [p.user_id]: { carrera_id: v, sede_id: '' } }))
                      }
                      placeholder="Carrera..."
                    />
                  </div>
                  <select
                    value={draft.sede_id || ''}
                    onChange={(e) =>
                      setNuevoAlcance((prev) => ({
                        ...prev,
                        [p.user_id]: { ...draft, sede_id: e.target.value },
                      }))
                    }
                  >
                    <option value="">Todas las sedes</option>
                    {sedesDe(draft.carrera_id).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-sm" onClick={() => agregarAlcance(p.user_id)}>
                    Agregar
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
