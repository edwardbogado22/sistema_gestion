import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatoLargo } from '../../lib/fechas'
import { PanelHorarioLlamado } from './PanelHorarioLlamado'
import { CalendarioExamenes } from '../../components/CalendarioExamenes'
import { avancePorLlamado, periodoDeExamenes } from '../../lib/examenes'
import { aISO } from '../../lib/fechas'

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
  const { rol, esAdmin, esSecretariaAcademica } = useAuth()
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

  // Redistribuir y Purgar borran cada fecha AUTO en estado ASIGNADA
  // (aunque ya esté impresa o publicada) y con ella sus vocales, que se
  // van en cascada. El 13/10/2026 un Redistribuir corrió 68 mesas del
  // Ordinario ya repartidas: se cuenta lo que se pierde para avisarlo
  // antes. Devuelve null si el conteo falló (el error ya quedó a la vista).
  const contarPropuestas = async (id) => {
    const [{ count: mesas, error: eMesas }, { count: vocales, error: eVoc }] = await Promise.all([
      supabase
        .from('examen_fecha')
        .select('id', { count: 'exact', head: true })
        .eq('llamado_id', id)
        .eq('estado', 'ASIGNADA')
        .eq('origen', 'AUTO'),
      supabase
        .from('mesa_integrante')
        .select('id, examen_fecha!inner(llamado_id, estado, origen)', { count: 'exact', head: true })
        .eq('examen_fecha.llamado_id', id)
        .eq('examen_fecha.estado', 'ASIGNADA')
        .eq('examen_fecha.origen', 'AUTO')
        .eq('rol_mesa', 'VOCAL'),
    ])
    if (eMesas || eVoc) {
      setError((eMesas || eVoc).message)
      return null
    }
    return { mesas, vocales }
  }

  const avisoPropuestas = (accion, { mesas, vocales }) =>
    `${accion} ${mesas} mesa(s) con fecha automática` +
    (vocales > 0 ? ` y borrar sus ${vocales} vocal(es) asignado(s)` : '') +
    '.\n\nSi esas fechas ya se imprimieron o publicaron, van a dejar de coincidir. ' +
    'Las fechas cargadas a mano no se tocan.\n\n¿Continuar?'

  const distribuir = async (id, sobrescribir) => {
    setError('')
    setOk('')
    if (sobrescribir) {
      const c = await contarPropuestas(id)
      if (!c) return
      if (c.mesas > 0 && !confirm(avisoPropuestas('Redistribuir todo va a mover a días nuevos', c))) return
    }
    const { data, error } = await supabase.rpc('examen_distribuir', {
      p_llamado: id,
      p_sobrescribir: sobrescribir,
    })
    if (error) return setError(error.message)
    const ll = llamados.find((x) => x.id === id)
    setOk(
      `Se asignaron ${data} fechas. Revisalas antes de aprobar.` +
        (ll && ll.tipo !== 'ORDINARIO' ? ' Las materias que no entraron figuran abajo, en "materias sin fecha", con el motivo.' : ''),
    )
    cargar()
  }

  const purgarPropuestas = async (id) => {
    setError('')
    setOk('')
    const c = await contarPropuestas(id)
    if (!c) return
    if (c.mesas > 0 && !confirm(avisoPropuestas('Purgar va a dejar sin fecha', c))) return
    const { data, error } = await supabase.rpc('examen_purgar_propuestas', { p_llamado: id })
    if (error) return setError(error.message)
    setOk(`Se quitaron ${data} propuesta(s) automática(s) sin confirmar.`)
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
        {esAdmin && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to="/examenes/seguimiento" className="btn btn-secondary btn-sm">
              Ver seguimiento de carga por secretario
            </Link>
            <Link to="/examenes/consulta-profesor" className="btn btn-secondary btn-sm">
              Consultar mesas por profesor
            </Link>
            <Link to="/examenes/actas-firmas" className="btn btn-secondary btn-sm">
              Actas a firmar
            </Link>
          </div>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}
      {ok && <p className="muted-text">{ok}</p>}

      <CalendarioExamenes
        llamados={llamados}
        avance={avancePorLlamado(avance).get(periodoDeExamenes(llamados, aISO(new Date())).foco?.id)}
        rol={rol}
      />

      {esAdmin && (
      <form onSubmit={crear} className="stat-card" style={{ textAlign: 'left', marginBottom: 24 }}>
        <div className="section-label">
          <span>Nuevo llamado</span>
        </div>
        <div className="form-row">
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

              {esAdmin && (
                <Link to={`/examenes/${l.id}/vocales`} className="btn btn-secondary btn-sm">
                  Asignar vocales
                </Link>
              )}
              {(esAdmin || esSecretariaAcademica) && (
                <Link to={`/examenes/${l.id}/mesas-reporte`} className="btn btn-secondary btn-sm">
                  Reporte de mesas
                </Link>
              )}
              {(esAdmin || esSecretariaAcademica) && (
                <Link to={`/examenes/${l.id}/carga-profesores`} className="btn btn-secondary btn-sm">
                  Carga por profesor
                </Link>
              )}
              {esAdmin && (
                <Link to={`/examenes/${l.id}/actas`} className="btn btn-secondary btn-sm">
                  Numerar actas
                </Link>
              )}
              {(esAdmin || esSecretariaAcademica) && (
                <Link to={`/examenes/${l.id}/asistencia-mesas`} className="btn btn-secondary btn-sm">
                  Asistencia a mesas
                </Link>
              )}

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
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => purgarPropuestas(l.id)}>
                    Purgar propuestas sin confirmar
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

            {esAdmin && l.tipo !== 'ORDINARIO' && (
              <PanelHorarioLlamado
                key={`${l.id}|${l.fecha_fin}|${exc.length}|${conFecha}`}
                llamado={l}
                puedeEditar={l.estado !== 'CERRADO'}
                onCambio={cargar}
                setError={setError}
                setOk={setOk}
              />
            )}

            {esAdmin && (
            <div style={{ marginTop: 14 }}>
              <div className="section-label">
                <span>Días bloqueados solo en este llamado</span>
              </div>
              <p className="muted-text" style={{ fontSize: 12 }}>
                Los feriados y los domingos ya están bloqueados para todos los llamados desde Configuración →
                Días no hábiles. Acá van los casos puntuales de este llamado.
              </p>
              {exc.length === 0 && <p className="muted-text">Sin bloqueos puntuales.</p>}
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
              <div className="form-row" style={{ marginTop: 10 }}>
                <label>
                  Fecha
                  <input
                    type="date"
                    min={l.fecha_inicio}
                    max={l.fecha_fin}
                    value={draft.fecha || ''}
                    onChange={(e) => setNuevaExcepcion((p) => ({ ...p, [l.id]: { ...draft, fecha: e.target.value } }))}
                  />
                </label>
                <label style={{ flex: '1 1 220px' }}>
                  Motivo
                  <input
                    placeholder="Feriado, domingo..."
                    value={draft.motivo || ''}
                    onChange={(e) => setNuevaExcepcion((p) => ({ ...p, [l.id]: { ...draft, motivo: e.target.value } }))}
                  />
                </label>
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
