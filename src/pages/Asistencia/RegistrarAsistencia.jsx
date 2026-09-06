import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { BuscadorSelect } from '../../components/BuscadorSelect'
import { deISO, formatoLargo } from '../../lib/fechas'

const ESTADOS = [
  { value: '', label: '— Pendiente —' },
  { value: 'PRESENTE', label: '✅ Presente' },
  { value: 'AUSENTE', label: '❌ Ausente' },
  { value: 'AUSENTE_JUSTIFICADO', label: '📋 Aus. Justificado' },
]

export function RegistrarAsistencia() {
  const { puedeEscribir } = useAuth()
  const [catedras, setCatedras] = useState([])
  const [horario, setHorario] = useState([])
  const [profesores, setProfesores] = useState([])
  const [periodo, setPeriodo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [comboId, setComboId] = useState('')
  const [fecha, setFecha] = useState('')
  const [consultado, setConsultado] = useState(false)
  const [bloqueoMotivo, setBloqueoMotivo] = useState('')
  const [registros, setRegistros] = useState({}) // profesor_id -> { estado, profesor_suplente_id }
  const [cambios, setCambios] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState('')

  const cargarBase = async () => {
    setLoading(true)
    const [c, h, p, per] = await Promise.all([
      supabase.from('catedras').select('sede_id, sedes(nombre), asignaturas(carrera_id, carreras(nombre))').eq('activo', true),
      supabase.from('v_catedra_horario').select('*'),
      supabase.from('profesores').select('id, documento_identidad, nombres, apellidos').eq('confirmado', true).order('apellidos'),
      supabase.from('periodo_academico').select('*').eq('activo', true).maybeSingle(),
    ])
    const err = c.error || h.error || p.error || per.error
    if (err) setError(err.message)
    setCatedras(c.data || [])
    setHorario(h.data || [])
    setProfesores(p.data || [])
    setPeriodo(per.data || null)
    setLoading(false)
  }

  useEffect(() => {
    cargarBase()
  }, [])

  // Carrera+sede a las que el usuario tiene acceso: se sacan de las
  // cátedras (la RLS de catedras_lee ya las acota al alcance de cada
  // uno), no del horario — así el combo no queda vacío solo porque
  // todavía no se cargó ningún horario semanal.
  const combos = useMemo(() => {
    const mapa = new Map()
    for (const c of catedras) {
      const carreraId = c.asignaturas?.carrera_id
      const sedeId = c.sede_id
      if (!carreraId || !sedeId) continue
      const key = `${carreraId}|${sedeId}`
      if (!mapa.has(key)) {
        mapa.set(key, { carrera_id: carreraId, sede_id: sedeId, label: `${c.asignaturas.carreras?.nombre} — ${c.sedes?.nombre}` })
      }
    }
    return [...mapa.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [catedras])

  // Si solo tiene una carrera/sede a su alcance, no tiene sentido
  // pedirle que la elija: se autoselecciona. Si tiene varias, elige.
  useEffect(() => {
    if (combos.length === 1 && !comboId) setComboId(`${combos[0].carrera_id}|${combos[0].sede_id}`)
  }, [combos, comboId])

  const combo = combos.find((c) => `${c.carrera_id}|${c.sede_id}` === comboId) || null

  const opcionesSuplente = useMemo(
    () => profesores.map((p) => ({ value: p.id, label: `${p.apellidos}, ${p.nombres}` })),
    [profesores],
  )

  const consultar = async () => {
    if (!combo) {
      setError('Seleccioná una carrera — sede.')
      return
    }
    if (!fecha) {
      setError('Seleccioná una fecha.')
      return
    }
    setError('')
    setOk('')
    setConsultado(false)
    setBloqueoMotivo('')

    const { data: motivo, error: eBloqueo } = await supabase.rpc('dia_bloqueado', {
      p_fecha: fecha,
      p_llamado: null,
      p_sede: combo.sede_id,
    })
    if (eBloqueo) {
      setError(eBloqueo.message)
      return
    }
    if (motivo) {
      setBloqueoMotivo(motivo)
      setConsultado(true)
      setRegistros({})
      return
    }

    const { data, error: eReg } = await supabase
      .from('asistencia_clase_registro')
      .select('profesor_id, estado, profesor_suplente_id')
      .eq('fecha', fecha)
      .eq('carrera_id', combo.carrera_id)
      .eq('sede_id', combo.sede_id)
    if (eReg) {
      setError(eReg.message)
      return
    }
    const mapa = {}
    for (const r of data) mapa[r.profesor_id] = { estado: r.estado, profesor_suplente_id: r.profesor_suplente_id || '' }
    setRegistros(mapa)
    setCambios({})
    setConsultado(true)
  }

  // Profesores con clase ese día para el combo elegido, agrupando las
  // materias de un mismo profesor (la asistencia es por profesor, no
  // por materia: ver migracion_asistencia_clases_diaria.sql).
  const profesoresDelDia = useMemo(() => {
    if (!combo || !fecha) return []
    const diaSemana = deISO(fecha).getDay()
    const mapa = new Map()
    for (const h of horario) {
      if (h.carrera_id !== combo.carrera_id || h.sede_id !== combo.sede_id) continue
      if (h.dia_semana !== diaSemana) continue
      if (!mapa.has(h.profesor_id)) {
        mapa.set(h.profesor_id, { profesor_id: h.profesor_id, profesor: h.profesor, documento: h.documento_identidad, materias: [] })
      }
      mapa.get(h.profesor_id).materias.push(h.materia)
    }
    return [...mapa.values()].sort((a, b) => a.profesor.localeCompare(b.profesor))
  }, [horario, combo, fecha])

  const estadoDe = (profesorId) => (profesorId in cambios ? cambios[profesorId].estado : registros[profesorId]?.estado || '')
  const suplenteDe = (profesorId) =>
    profesorId in cambios ? cambios[profesorId].profesor_suplente_id : registros[profesorId]?.profesor_suplente_id || ''

  const setCambio = (profesorId, patch) => {
    setCambios((c) => ({
      ...c,
      [profesorId]: { estado: estadoDe(profesorId), profesor_suplente_id: suplenteDe(profesorId), ...patch },
    }))
  }

  const marcarTodos = (estado) => {
    const nuevos = {}
    for (const p of profesoresDelDia) nuevos[p.profesor_id] = { estado, profesor_suplente_id: suplenteDe(p.profesor_id) }
    setCambios((c) => ({ ...c, ...nuevos }))
  }

  const pendientes = Object.keys(cambios).length

  const guardar = async () => {
    if (!combo) return
    setGuardando(true)
    setError('')
    setOk('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const filas = Object.entries(cambios)
      .filter(([, v]) => v.estado)
      .map(([profesorId, v]) => ({
        fecha,
        profesor_id: profesorId,
        carrera_id: combo.carrera_id,
        sede_id: combo.sede_id,
        estado: v.estado,
        profesor_suplente_id:
          v.profesor_suplente_id && (v.estado === 'AUSENTE' || v.estado === 'AUSENTE_JUSTIFICADO') ? v.profesor_suplente_id : null,
        registrado_por: user?.id,
      }))

    if (!filas.length) {
      setGuardando(false)
      setError('No hay cambios para guardar.')
      return
    }

    const { error } = await supabase
      .from('asistencia_clase_registro')
      .upsert(filas, { onConflict: 'fecha,profesor_id,carrera_id,sede_id' })
    setGuardando(false)
    if (error) {
      setError(error.message)
      return
    }
    setOk(`Se guardaron ${filas.length} registro(s).`)
    setCambios({})
    consultar()
  }

  if (loading) return <p className="page-padding muted-text">Cargando...</p>

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Registrar Asistencia a Clases</h1>
        {periodo ? (
          <p>
            Período activo: {periodo.nombre} {periodo.anio} ({formatoLargo(periodo.fecha_inicio)} al{' '}
            {formatoLargo(periodo.fecha_fin)})
          </p>
        ) : (
          <p className="error-text">No hay ningún período académico activo. Pedile al admin que active uno en Configuración.</p>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}
      {ok && <p className="muted-text">{ok}</p>}

      {combos.length === 0 ? (
        <p className="muted-text">No tenés ninguna cátedra activa asignada.</p>
      ) : (
        <div className="form-row" style={{ marginBottom: 16 }}>
          {combos.length === 1 ? (
            <p style={{ margin: 0 }}>
              <strong>{combos[0].label}</strong>
            </p>
          ) : (
            <label>
              Carrera — Sede
              <select value={comboId} onChange={(e) => setComboId(e.target.value)} style={{ display: 'block', minWidth: 260 }}>
                <option value="">Seleccionar...</option>
                {combos.map((c) => (
                  <option key={`${c.carrera_id}|${c.sede_id}`} value={`${c.carrera_id}|${c.sede_id}`}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Fecha
            <input
              type="date"
              value={fecha}
              min={periodo?.fecha_inicio}
              max={periodo?.fecha_fin}
              disabled={!periodo}
              onChange={(e) => setFecha(e.target.value)}
              style={{ display: 'block' }}
            />
          </label>
          <button type="button" className="btn btn-primary" onClick={consultar} disabled={!periodo}>
            Consultar
          </button>
        </div>
      )}

      {consultado && bloqueoMotivo && (
        <p className="error-text">
          No se puede registrar asistencia el {formatoLargo(fecha)}: {bloqueoMotivo}.
        </p>
      )}

      {consultado && !bloqueoMotivo && profesoresDelDia.length === 0 && (
        <p className="muted-text">Ningún profesor tiene clase este día en esa carrera/sede (según el horario cargado).</p>
      )}

      {consultado && !bloqueoMotivo && profesoresDelDia.length > 0 && (
        <>
          {puedeEscribir && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => marcarTodos('PRESENTE')}>
                Todos presentes
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => marcarTodos('AUSENTE')}>
                Todos ausentes
              </button>
            </div>
          )}
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Profesor</th>
                  <th>Materia(s)</th>
                  <th>Estado</th>
                  <th>Suplente / cobertura</th>
                </tr>
              </thead>
              <tbody>
                {profesoresDelDia.map((p) => {
                  const estado = estadoDe(p.profesor_id)
                  const esAusencia = estado === 'AUSENTE' || estado === 'AUSENTE_JUSTIFICADO'
                  return (
                    <tr key={p.profesor_id}>
                      <td>{p.profesor}</td>
                      <td className="muted-text" style={{ fontSize: 12 }}>
                        {p.materias.join(' · ')}
                      </td>
                      <td>
                        <select
                          value={estado}
                          disabled={!puedeEscribir}
                          onChange={(e) => setCambio(p.profesor_id, { estado: e.target.value })}
                        >
                          {ESTADOS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ minWidth: 220 }}>
                        {esAusencia && (
                          <BuscadorSelect
                            opciones={opcionesSuplente.filter((o) => o.value !== p.profesor_id)}
                            value={suplenteDe(p.profesor_id)}
                            onChange={(v) => setCambio(p.profesor_id, { profesor_suplente_id: v })}
                            placeholder="¿Quién cubrió?"
                            disabled={!puedeEscribir}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {puedeEscribir && (
            <div className="form-actions" style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
              {pendientes > 0 && <span className="muted-text">{pendientes} cambio(s) sin guardar</span>}
              <button type="button" className="btn btn-primary" disabled={pendientes === 0 || guardando} onClick={guardar}>
                {guardando ? 'Guardando...' : 'Guardar asistencia'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
