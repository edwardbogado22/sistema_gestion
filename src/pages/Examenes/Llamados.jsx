import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatoLargo } from '../../lib/fechas'

const TIPOS = [
  { value: 'ORDINARIO', label: 'Ordinario' },
  { value: 'COMPLEMENTARIO', label: 'Complementario' },
  { value: 'REGULARIZACION', label: 'Regularización' },
]

const ESTADOS = {
  BORRADOR: 'Borrador',
  ASIGNACION: 'Asignación abierta',
  APROBADO: 'Aprobado',
  CERRADO: 'Cerrado',
}

const vacio = {
  periodo_lectivo: String(new Date().getFullYear()),
  tipo: 'ORDINARIO',
  nombre: '',
  fecha_inicio: '',
  fecha_fin: '',
  asigna_rol: 'SECRETARIO',
}

export function Llamados() {
  const { esAdmin } = useAuth()
  const [llamados, setLlamados] = useState([])
  const [excepciones, setExcepciones] = useState([])
  const [avance, setAvance] = useState([])
  const [form, setForm] = useState(vacio)
  const [nuevaExcepcion, setNuevaExcepcion] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const cargar = async () => {
    setLoading(true)
    const [l, e, a] = await Promise.all([
      supabase.from('examen_llamado').select('*').order('fecha_inicio', { ascending: false }),
      supabase.from('examen_llamado_excepcion').select('*').order('fecha'),
      supabase.from('v_examen_avance').select('*'),
    ])
    const err = l.error || e.error || a.error
    if (err) setError(err.message)
    setLlamados(l.data || [])
    setExcepciones(e.data || [])
    setAvance(a.data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const crear = async (ev) => {
    ev.preventDefault()
    setError('')
    setOk('')
    if (form.fecha_fin < form.fecha_inicio) return setError('La fecha de fin no puede ser anterior a la de inicio.')
    const { error } = await supabase.from('examen_llamado').insert(form)
    if (error) return setError(error.message)
    setForm(vacio)
    setOk('Llamado creado. Cargá los días no hábiles y después abrí la asignación.')
    cargar()
  }

  const cambiarEstado = async (id, estado) => {
    setError('')
    setOk('')
    const { error } = await supabase
      .from('examen_llamado')
      .update({ estado, actualizado_en: new Date().toISOString() })
      .eq('id', id)
    if (error) return setError(error.message)
    setOk(`Llamado en estado: ${ESTADOS[estado]}.`)
    cargar()
  }

  const aprobar = async (id) => {
    setError('')
    setOk('')
    const { data, error } = await supabase.rpc('examen_aprobar', { p_llamado: id })
    if (error) return setError(error.message)
    setOk(`Llamado aprobado. Se generaron ${data} mesas con su titular.`)
    cargar()
  }

  const reabrir = async (id) => {
    setError('')
    setOk('')
    const { error } = await supabase.rpc('examen_reabrir', { p_llamado: id })
    if (error) return setError(error.message)
    setOk('Llamado reabierto para corregir.')
    cargar()
  }

  const distribuir = async (id, sobrescribir) => {
    setError('')
    setOk('')
    const { data, error } = await supabase.rpc('examen_distribuir', {
      p_llamado: id,
      p_sobrescribir: sobrescribir,
    })
    if (error) return setError(error.message)
    setOk(`Se asignaron ${data} fechas. Revisalas antes de aprobar.`)
    cargar()
  }

  const agregarExcepcion = async (llamadoId) => {
    const draft = nuevaExcepcion[llamadoId] || {}
    if (!draft.fecha) return setError('Elegí una fecha.')
    setError('')
    setOk('')
    const { error } = await supabase
      .from('examen_llamado_excepcion')
      .insert({ llamado_id: llamadoId, fecha: draft.fecha, motivo: draft.motivo || null })
    if (error) return setError(error.message)
    setNuevaExcepcion((p) => ({ ...p, [llamadoId]: {} }))
    cargar()
  }

  const quitarExcepcion = async (id) => {
    const { error } = await supabase.from('examen_llamado_excepcion').delete().eq('id', id)
    if (error) return setError(error.message)
    cargar()
  }

  if (loading) return <p className="muted-text">Cargando...</p>

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Llamados a examen</h1>
        <p>
          {esAdmin
            ? 'Definí el rango de fechas y los días no hábiles. Ninguna fecha de examen va a poder caer fuera de lo que se configure acá.'
            : 'Elegí el llamado sobre el que vas a cargar las fechas de tus materias.'}
        </p>
      </div>

      {error && <p className="error-text">{error}</p>}
      {ok && <p className="muted-text">{ok}</p>}

      {esAdmin && (
      <form onSubmit={crear} className="stat-card" style={{ textAlign: 'left', marginBottom: 24 }}>
        <div className="section-label">
          <span>Nuevo llamado</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label>
            Periodo lectivo
            <input
              value={form.periodo_lectivo}
              onChange={(e) => setForm({ ...form, periodo_lectivo: e.target.value })}
              required
              style={{ width: 100 }}
            />
          </label>
          <label>
            Tipo
            <select
              value={form.tipo}
              onChange={(e) =>
                setForm({
                  ...form,
                  tipo: e.target.value,
                  // En Complementario y Regularización no hay proforma:
                  // las fechas las distribuye la administración.
                  asigna_rol: e.target.value === 'ORDINARIO' ? 'SECRETARIO' : 'ADMIN',
                })
              }
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: '1 1 220px' }}>
            Nombre
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ordinario · Final 2026"
              required
            />
          </label>
          <label>
            Desde
            <input
              type="date"
              value={form.fecha_inicio}
              onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
              required
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={form.fecha_fin}
              onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
              required
            />
          </label>
          <label>
            Carga las fechas
            <select value={form.asigna_rol} onChange={(e) => setForm({ ...form, asigna_rol: e.target.value })}>
              <option value="SECRETARIO">Secretaría de Carrera</option>
              <option value="ADMIN">Dirección Académica</option>
            </select>
          </label>
          <button type="submit" className="btn btn-primary">
            Crear
          </button>
        </div>
      </form>
      )}

      {llamados.length === 0 && <p className="muted-text">Todavía no hay llamados creados.</p>}

      {llamados.map((l) => {
        const exc = excepciones.filter((e) => e.llamado_id === l.id)
        const av = avance.filter((a) => a.llamado_id === l.id)
        const total = av.reduce((s, a) => s + Number(a.total), 0)
        const conFecha = av.reduce((s, a) => s + Number(a.con_fecha), 0)
        const draft = nuevaExcepcion[l.id] || {}

        return (
          <div key={l.id} className="stat-card" style={{ textAlign: 'left', marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <strong style={{ flex: '1 1 240px' }}>{l.nombre}</strong>
              <span className="badge badge-muted">{TIPOS.find((t) => t.value === l.tipo)?.label}</span>
              <span className="badge badge-gold">
                {formatoLargo(l.fecha_inicio)} a {formatoLargo(l.fecha_fin)}
              </span>
              <span className={`badge ${l.estado === 'APROBADO' ? 'badge-success' : 'badge-muted'}`}>
                {ESTADOS[l.estado]}
              </span>
              <span className="badge badge-muted">
                {conFecha} de {total} con fecha
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <Link to={`/examenes/${l.id}`} className="btn btn-sm">
                Abrir panel de fechas
              </Link>

              {esAdmin && l.estado === 'BORRADOR' && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => cambiarEstado(l.id, 'ASIGNACION')}>
                  Abrir asignación
                </button>
              )}

              {esAdmin && l.estado === 'ASIGNACION' && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => distribuir(l.id, false)}>
                    Distribuir las que faltan
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => distribuir(l.id, true)}>
                    Redistribuir todo
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => aprobar(l.id)}>
                    Aprobar llamado
                  </button>
                </>
              )}

              {esAdmin && l.estado === 'APROBADO' && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => reabrir(l.id)}>
                  Reabrir para corregir
                </button>
              )}
            </div>

            {esAdmin && (
            <div style={{ marginTop: 14 }}>
              <div className="section-label">
                <span>Días no hábiles</span>
              </div>
              {exc.length === 0 && <p className="muted-text">Sin días excluidos. Acordate de los domingos y feriados.</p>}
              {exc.map((e) => (
                <div className="stat-breakdown-row" key={e.id}>
                  <span>
                    {formatoLargo(e.fecha)}
                    {e.motivo ? ` · ${e.motivo}` : ''}
                  </span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => quitarExcepcion(e.id)}>
                    Quitar
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <input
                  type="date"
                  min={l.fecha_inicio}
                  max={l.fecha_fin}
                  value={draft.fecha || ''}
                  onChange={(e) => setNuevaExcepcion((p) => ({ ...p, [l.id]: { ...draft, fecha: e.target.value } }))}
                />
                <input
                  placeholder="Motivo (feriado, domingo...)"
                  value={draft.motivo || ''}
                  onChange={(e) => setNuevaExcepcion((p) => ({ ...p, [l.id]: { ...draft, motivo: e.target.value } }))}
                />
                <button type="button" className="btn btn-sm" onClick={() => agregarExcepcion(l.id)}>
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
