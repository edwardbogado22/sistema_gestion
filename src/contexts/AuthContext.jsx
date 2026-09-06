import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [alcance, setAlcance] = useState([])
  const [loading, setLoading] = useState(true)

  // El perfil define el rol y, si es secretario, las carreras/sedes que
  // puede ver. Las policies de RLS ya lo restringen del lado de la base;
  // esto es para no ofrecerle pantallas que no va a poder usar.
  const cargarPerfil = useCallback(async (sesionUser) => {
    if (!sesionUser) {
      setPerfil(null)
      setAlcance([])
      return
    }

    const [p, a] = await Promise.all([
      supabase.from('usuarios_perfil').select('rol, nombre_completo, activo').eq('user_id', sesionUser.id).maybeSingle(),
      supabase.from('usuario_alcance').select('carrera_id, sede_id, carreras(nombre), sedes(nombre)'),
    ])

    setPerfil(p.data?.activo ? p.data : null)
    setAlcance(a.data || [])
  }, [])

  useEffect(() => {
    let activo = true

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!activo) return
        setUser(session?.user ?? null)
        await cargarPerfil(session?.user ?? null)
      })
      .catch(() => {
        if (activo) {
          setUser(null)
          setPerfil(null)
          setAlcance([])
        }
      })
      .finally(() => {
        if (activo) setLoading(false)
      })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      try {
        await cargarPerfil(session?.user ?? null)
      } catch {
        setPerfil(null)
        setAlcance([])
      }
    })

    return () => {
      activo = false
      listener?.subscription.unsubscribe()
    }
  }, [cargarPerfil])

  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const logout = async () => {
    await supabase.auth.signOut()
  }

  const rol = perfil?.rol ?? null
  const esAdmin = rol === 'ADMIN'
  const esSecretario = rol === 'SECRETARIO'
  const esDirector = rol === 'DIRECTOR'
  const esAsistente = rol === 'ASISTENTE'
  // DIRECTOR audita: mismo alcance por carrera/sede que el secretario,
  // pero sin permiso de carga (la RLS es la que realmente lo impide).
  const puedeEscribir = esAdmin || esSecretario

  return (
    <AuthContext.Provider
      value={{ user, perfil, rol, esAdmin, esSecretario, esDirector, esAsistente, puedeEscribir, alcance, loading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
