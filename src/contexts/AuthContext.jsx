import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

// A veces supabase-js se queda esperando para siempre en getSession() (ver
// el comentario en lib/supabase.js) incluso con el lock desactivado — sin
// este timeout, eso deja al usuario viendo "Cargando..." sin salida posible
// más que cerrar la pestaña. Con el timeout, en vez de colgarse se muestra
// un botón para reintentar.
const conTimeout = (promesa, ms = 10000) =>
  Promise.race([promesa, new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))])

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [alcance, setAlcance] = useState([])
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState(false)

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

  const cargarSesionInicial = useCallback(() => {
    setLoading(true)
    setSessionError(false)
    let activo = true

    conTimeout(supabase.auth.getSession())
      .then(async ({ data: { session } }) => {
        if (!activo) return
        setUser(session?.user ?? null)
        await conTimeout(cargarPerfil(session?.user ?? null))
      })
      .catch((err) => {
        if (!activo) return
        if (err?.message === 'TIMEOUT') {
          // No sabemos si hay sesión o no — mejor no asumir que el usuario
          // se deslogueó y perder lo que tenía cargado; se le ofrece
          // reintentar en vez de mandarlo a "Sin rol asignado" o /login.
          setSessionError(true)
        } else {
          setUser(null)
          setPerfil(null)
          setAlcance([])
        }
      })
      .finally(() => {
        if (activo) setLoading(false)
      })

    return () => {
      activo = false
    }
  }, [cargarPerfil])

  useEffect(() => {
    const limpiar = cargarSesionInicial()

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
      limpiar()
      listener?.subscription.unsubscribe()
    }
  }, [cargarSesionInicial, cargarPerfil])

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
      value={{
        user,
        perfil,
        rol,
        esAdmin,
        esSecretario,
        esDirector,
        esAsistente,
        puedeEscribir,
        alcance,
        loading,
        sessionError,
        reintentar: cargarSesionInicial,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
