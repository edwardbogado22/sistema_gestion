import { createClient } from '@supabase/supabase-js'

// Relativo al origen desde el que se sirve la app (LAN, Tailscale, lo que sea):
// nginx (o el proxy del server de desarrollo) redirige /supabase al gateway real.
// Así el mismo build funciona sin importar por qué dominio/IP entre cada usuario.
const supabaseUrl = `${window.location.origin}/supabase`
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)