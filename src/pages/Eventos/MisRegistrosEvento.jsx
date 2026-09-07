import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatoLargo } from '../../lib/fechas'

export function MisRegistrosEvento() {
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [borrandoId, setBorrandoId] = useState(null)

  const cargar = async () => {
    setLoading(true)
    setError('')
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data, error: eErr } = await supabase
      .from('evento_asistencia_registro')
      .select('id, fecha_hora, evento(nombre, fecha), profesores(nombres, apellidos, documento_identidad)')
      .eq('registrado_por', user?.id)
      .order('fecha_hora', { ascending: false })
      .limit(100)
    if (eErr) setError(eErr.message)
    else setRegistros(data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const deshacer = async (id) => {
    if (!confirm('¿Eliminar este registro? El profesor va a quedar sin asistencia marcada en ese evento.')) return
    setBorrandoId(id)
    const { error: eErr } = await supabase.from('evento_asistencia_registro').delete().eq('id', id)
    setBorrandoId(null)
    if (eErr) {
      setError(eErr.message)
      return
    }
    setRegistros((r) => r.filter((x) => x.id !== id))
  }

  return (
    <div className="page-padding">
      <div className="page-header">
        <div>
          <h1>Mis Registros</h1>
          <p>Últimos 100 check-ins que registraste vos. Podés deshacer uno si te equivocaste.</p>
        </div>
        <Link to="/eventos" className="btn btn-secondary">
          Volver a Registrar
        </Link>
      </div>

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p className="muted-text">Cargando...</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Profesor</th>
                <th>Documento</th>
                <th>Evento</th>
                <th>Fecha del evento</th>
                <th>Registrado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.profesores?.apellidos}, {r.profesores?.nombres}
                  </td>
                  <td>{r.profesores?.documento_identidad}</td>
                  <td>{r.evento?.nombre}</td>
                  <td>{formatoLargo(r.evento?.fecha)}</td>
                  <td>{new Date(r.fecha_hora).toLocaleString('es-PY')}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={borrandoId === r.id}
                      onClick={() => deshacer(r.id)}
                    >
                      {borrandoId === r.id ? 'Eliminando...' : 'Deshacer'}
                    </button>
                  </td>
                </tr>
              ))}
              {registros.length === 0 && (
                <tr>
                  <td colSpan={6}>Todavía no registraste ninguna asistencia.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
