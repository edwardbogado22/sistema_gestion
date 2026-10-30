import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// Cierre de sesión por inactividad: en una PC compartida una sesión
// abierta deja a cualquiera usar la cuenta de otro. A los 19 minutos sin
// mouse ni teclado se avisa, y a los 20 se cierra.
const LIMITE_MS = 20 * 60 * 1000
const AVISO_MS = 60 * 1000
// La última actividad se comparte entre pestañas por localStorage: quien
// trabaja en una pestaña no pierde la sesión por otra que quedó quieta.
const CLAVE = 'ultima-actividad'
// Directo a supabase y no el logout del contexto: ese cambia de identidad
// en cada render del AuthProvider (p. ej. al renovar el token) y
// reiniciaría el contador.
const salir = () => supabase.auth.signOut()

const EVENTOS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel']

// El kiosco queda abierto durante toda la jornada de carga.
const SIN_CIERRE = ['/contenido/kiosco']

const leer = () => {
  try {
    return Number(localStorage.getItem(CLAVE)) || 0
  } catch {
    return 0
  }
}

const marcar = (t) => {
  try {
    localStorage.setItem(CLAVE, String(t))
  } catch {
    // Sin localStorage (navegación privada) cuenta solo esta pestaña
  }
}

export function CierreInactividad() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [restante, setRestante] = useState(null) // ms hasta el cierre mientras se muestra el aviso
  const ultima = useRef(0)
  const activo = !!user && !SIN_CIERRE.some((r) => pathname.startsWith(r))

  useEffect(() => {
    if (!activo) {
      setRestante(null)
      return
    }
    ultima.current = Date.now()
    marcar(ultima.current)

    let escrito = 0
    const alActuar = () => {
      const ahora = Date.now()
      ultima.current = ahora
      // No escribir en cada movimiento del mouse
      if (ahora - escrito > 5000) {
        escrito = ahora
        marcar(ahora)
      }
    }
    EVENTOS.forEach((e) => window.addEventListener(e, alActuar, { passive: true }))

    const revisar = () => {
      const ultimaVez = Math.max(ultima.current, leer())
      const falta = LIMITE_MS - (Date.now() - ultimaVez)
      if (falta <= 0) {
        setRestante(null)
        salir()
      } else if (falta <= AVISO_MS) {
        setRestante(falta)
      } else {
        setRestante(null)
      }
    }
    const intervalo = setInterval(revisar, 1000)

    return () => {
      EVENTOS.forEach((e) => window.removeEventListener(e, alActuar))
      clearInterval(intervalo)
    }
  }, [activo])

  if (!activo || restante == null) return null

  const seguir = () => {
    ultima.current = Date.now()
    marcar(ultima.current)
    setRestante(null)
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby="cierre-titulo"
      className="no-print"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: '100%',
          background: 'var(--card)',
          color: 'var(--ink)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-lg)',
          padding: 24,
        }}
      >
        <h3 id="cierre-titulo" style={{ marginTop: 0 }}>
          ¿Seguís ahí?
        </h3>
        <p>
          Por seguridad, tu sesión se cerrará en <strong>{Math.ceil(restante / 1000)} segundos</strong> por inactividad.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={salir}>
            Cerrar sesión
          </button>
          <button type="button" className="btn btn-primary" onClick={seguir} autoFocus>
            Seguir conectado
          </button>
        </div>
      </div>
    </div>
  )
}
