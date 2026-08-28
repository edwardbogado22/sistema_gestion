import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, Navigate } from 'react-router-dom'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login, user } = useAuth()
  const navigate = useNavigate()

  if (user) return <Navigate to="/" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError('Error al iniciar sesión: ' + err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="login-container">
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div className="crest" style={{ background: 'var(--green-700)', margin: '0 auto 14px' }}>
          FCE
        </div>
        <h2 style={{ marginBottom: 4 }}>Sistema de Evaluación Docente</h2>
        <p className="muted-text">Universidad Nacional del Este</p>
      </div>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
