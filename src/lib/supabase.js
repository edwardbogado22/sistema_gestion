import { createClient } from '@supabase/supabase-js'

// Relativo al origen desde el que se sirve la app (LAN, Tailscale, lo que sea):
// nginx (o el proxy del server de desarrollo) redirige /supabase al gateway real.
// Así el mismo build funciona sin importar por qué dominio/IP entre cada usuario.
const supabaseUrl = `${window.location.origin}/supabase`
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Por defecto, supabase-js serializa el acceso a la sesión con
    // navigator.locks para coordinar pestañas. Es una app de una sola
    // pestaña por usuario, y en desarrollo (recargas seguidas de Vite)
    // ese lock puede quedar tomado y nunca liberarse, dejando cualquier
    // getSession() colgado para siempre (pantalla de "Cargando..." sin
    // salida). Se reemplaza por un lock que no bloquea nada.
    lock: async (_name, _acquireTimeout, fn) => fn(),
  },
})