import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatoLargo } from '../../lib/fechas'

export function RegistrarAsistenciaEvento() {
  const [eventos, setEventos] = useState([])
  const [eventoId, setEventoId] = useState('')
  const [documento, setDocumento] = useState('')
  const [profesor, setProfesor] = useState(null)
  const [buscado, setBuscado] = useState(false)
  const [yaRegistrado, setYaRegistrado] = useState(null)
  const [nombres, setNombres] = useState('')
  const [apellidos, setApellidos] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [historial, setHistorial] = useState([])

  useEffect(() => {
    supabase
      .from('evento')
      .select('*')
      .order('fecha', { ascending: false })
      .then(({ data }) => setEventos(data || []))
  }, [])

  const eventosActivos = eventos.filter((e) => e.activo)
  const evento = eventos.find((e) => e.id === eventoId)

  const limpiar = () => {
    setDocumento('')
    setProfesor(null)
    setBuscado(false)
    setYaRegistrado(null)
    setNombres('')
    setApellidos('')
    setError('')
  }

  const buscar = async () => {
    if (!documento.trim()) {
      setError('Ingresá el número de documento.')
      return
    }
    setError('')
    setOk('')
    setLoading(true)
    const { data, error: eErr } = await supabase
      .from('profesores')
      .select('id, nombres, apellidos')
      .eq('documento_identidad', documento.trim())
      .maybeSingle()
    if (eErr) {
      setLoading(false)
      setError(eErr.message)
      return
    }
    setBuscado(true)
    if (data) {
      setProfesor(data)
      const { data: reg } = await supabase
        .from('evento_asistencia_registro')
        .select('fecha_hora')
        .eq('evento_id', eventoId)
        .eq('profesor_id', data.id)
        .maybeSingle()
      setYaRegistrado(reg || null)
    } else {
      setProfesor(null)
    }
    setLoading(false)
  }

  const confirmar = async () => {
    setLoading(true)
    setError('')
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error: eErr } = await supabase.from('evento_asistencia_registro').insert({
      evento_id: eventoId,
      profesor_id: profesor.id,
      registrado_por: user?.id,
    })
    setLoading(false)
    if (eErr) {
      setError(eErr.message)
      return
    }
    setOk(`Asistencia registrada: ${profesor.apellidos}, ${profesor.nombres}`)
    setHistorial((h) =>
      [{ nombre: `${profesor.apellidos}, ${profesor.nombres}`, evento: evento?.nombre, nuevo: false }, ...h].slice(0, 8),
    )
    limpiar()
  }

  const registrarNuevo = async () => {
    if (!nombres.trim() || !apellidos.trim()) {
      setError('Completá nombres y apellidos.')
      return
    }
    setLoading(true)
    setError('')
    const { data: nuevo, error: eIns } = await supabase
      .from('profesores')
      .insert({ documento_identidad: documento.trim(), nombres: nombres.trim(), apellidos: apellidos.trim() })
      .select('id, nombres, apellidos')
      .single()
    if (eIns) {
      setLoading(false)
      setError(eIns.message)
      return
    }
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error: eReg } = await supabase.from('evento_asistencia_registro').insert({
      evento_id: eventoId,
      profesor_id: nuevo.id,
      registrado_por: user?.id,
    })
    setLoading(false)
    if (eReg) {
      setError(eReg.message)
      return
    }
    setOk(`Profesor creado y asistencia registrada: ${nuevo.apellidos}, ${nuevo.nombres}`)
    setHistorial((h) => [{ nombre: `${nuevo.apellidos}, ${nuevo.nombres}`, evento: evento?.nombre, nuevo: true }, ...h].slice(0, 8))
    limpiar()
  }

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Registrar Asistencia a Eventos</h1>
      </div>

      <div className="form-row" style={{ marginBottom: 20 }}>
        <label style={{ minWidth: 280 }}>
          Evento activo
          <select
            value={eventoId}
            onChange={(e) => {
              setEventoId(e.target.value)
              limpiar()
            }}
          >
            <option value="">Seleccionar...</option>
            {eventosActivos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre} ({formatoLargo(e.fecha)})
              </option>
            ))}
          </select>
        </label>
      </div>

      {eventosActivos.length === 0 && (
        <p className="muted-text">No hay eventos activos. Creá uno en Gestión de Eventos.</p>
      )}

      {eventoId && (
        <div className="form-card" style={{ maxWidth: 480 }}>
          <div className="form-grid">
            <label>
              Documento de identidad
              <input
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscar()}
                placeholder="Cédula"
                autoFocus
              />
            </label>
          </div>

          {buscado && profesor && yaRegistrado && (
            <p className="muted-text">
              ⚠️ Ya estaba registrado: {new Date(yaRegistrado.fecha_hora).toLocaleString('es-PY')}
            </p>
          )}
          {buscado && profesor && !yaRegistrado && (
            <p className="success-text">
              ✅ Profesor encontrado: {profesor.apellidos}, {profesor.nombres}
            </p>
          )}
          {buscado && !profesor && (
            <>
              <p className="error-text">Profesor no encontrado. Completá el nombre para registrarlo.</p>
              <div className="form-grid">
                <label>
                  Nombres
                  <input value={nombres} onChange={(e) => setNombres(e.target.value)} />
                </label>
                <label>
                  Apellidos
                  <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} />
                </label>
              </div>
            </>
          )}

          {error && <p className="error-text">{error}</p>}
          {ok && <p className="success-text">{ok}</p>}

          <div className="form-actions">
            {!buscado && (
              <button type="button" className="btn btn-primary" onClick={buscar} disabled={loading}>
                {loading ? 'Buscando...' : 'Buscar y Registrar'}
              </button>
            )}
            {buscado && profesor && !yaRegistrado && (
              <button type="button" className="btn btn-primary" onClick={confirmar} disabled={loading}>
                {loading ? 'Guardando...' : 'Confirmar asistencia'}
              </button>
            )}
            {buscado && !profesor && (
              <button type="button" className="btn btn-primary" onClick={registrarNuevo} disabled={loading}>
                {loading ? 'Guardando...' : 'Registrar nuevo profesor'}
              </button>
            )}
            {buscado && (
              <button type="button" className="btn btn-secondary" onClick={limpiar}>
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {historial.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="section-label">
            <span>Actividad de esta sesión</span>
          </div>
          {historial.map((h, i) => (
            <div className="stat-breakdown-row" key={i}>
              <span>
                {h.nombre} · {h.evento}
              </span>
              <span className={`badge ${h.nuevo ? 'badge-gold' : 'badge-success'}`}>{h.nuevo ? 'Nuevo' : 'Registrado'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
