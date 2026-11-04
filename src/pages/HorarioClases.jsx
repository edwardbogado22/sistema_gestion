import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { aISO, formatoLargo } from '../lib/fechas'
import { descargarFilas } from '../lib/csv'
import { RangoFechasPeriodo } from '../components/RangoFechasPeriodo'

// value = extract(dow from fecha) de Postgres, igual que catedra_horario.
const DIAS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
]

const SELECT_CATEDRAS =
  'id, periodo_lectivo, seccion_grupo, profesor_id, sede_id, sedes(nombre), profesores(nombres, apellidos), ' +
  'asignaturas(nombre, curso_nivel, carrera_id, carreras(nombre)), catedra_horario(id, dia_semana, horas)'

const nombreProfesor = (c) => (c.profesores ? `${c.profesores.apellidos}, ${c.profesores.nombres}` : '—')
const clave = (c) => `${c.asignaturas?.carrera_id}|${c.sede_id}`

// Se guarda al salir del campo (o con Enter). Se monta con key = valor
// guardado, así que si cambia desde afuera vuelve a arrancar de ahí.
function HorasInput({ valor, onGuardar, disabled }) {
  const [texto, setTexto] = useState(valor ?? '')
  const guardar = () => {
    const limpio = String(texto).trim()
    const nuevo = limpio === '' ? null : Number(limpio)
    if (nuevo !== null && (!Number.isInteger(nuevo) || nuevo < 1 || nuevo > 12)) {
      setTexto(valor ?? '')
      onGuardar(undefined, 'La carga horaria tiene que ser un número entero entre 1 y 12.')
      return
    }
    if (nuevo !== (valor ?? null)) onGuardar(nuevo)
  }
  return (
    <input
      className="horario-horas-input"
      type="number"
      min={1}
      max={12}
      inputMode="numeric"
      value={texto}
      disabled={disabled}
      placeholder="—"
      aria-label="Horas cátedra"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

export function HorarioClases() {
  const { puedeEscribir } = useAuth()
  const [vista, setVista] = useState('horario')
  const [catedras, setCatedras] = useState([])
  const [periodos, setPeriodos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [periodoLectivo, setPeriodoLectivo] = useState('')
  const [comboId, setComboId] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('catedras').select(SELECT_CATEDRAS).eq('activo', true),
      supabase.from('periodo_academico').select('*').order('fecha_inicio', { ascending: false }),
    ]).then(([c, per]) => {
      const err = c.error || per.error
      if (err) setError(err.message)
      const lista = c.data || []
      setCatedras(lista)
      setPeriodos(per.data || [])
      const etiquetas = [...new Set(lista.map((x) => x.periodo_lectivo))].sort().reverse()
      const activo = (per.data || []).find((p) => p.activo)?.etiqueta_periodo_lectivo
      setPeriodoLectivo(etiquetas.includes(activo) ? activo : etiquetas[0] || '')
      setLoading(false)
    })
  }, [])

  const etiquetas = useMemo(() => [...new Set(catedras.map((c) => c.periodo_lectivo))].sort().reverse(), [catedras])

  const delPeriodo = useMemo(
    () => catedras.filter((c) => c.periodo_lectivo === periodoLectivo),
    [catedras, periodoLectivo],
  )

  // Carrera y sede: salen de las cátedras, que la RLS ya acota al alcance
  // de cada uno (mismo criterio que la carga diaria de asistencia).
  const combos = useMemo(() => {
    const mapa = new Map()
    for (const c of delPeriodo) {
      if (!c.asignaturas?.carrera_id || mapa.has(clave(c))) continue
      mapa.set(clave(c), {
        id: clave(c),
        carrera_id: c.asignaturas.carrera_id,
        sede_id: c.sede_id,
        label: `${c.asignaturas.carreras?.nombre} — ${c.sedes?.nombre}`,
      })
    }
    return [...mapa.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [delPeriodo])

  const combo = combos.find((c) => c.id === comboId) || (combos.length === 1 ? combos[0] : null)

  const delCombo = useMemo(() => (combo ? delPeriodo.filter((c) => clave(c) === combo.id) : []), [delPeriodo, combo])

  if (loading) return <p className="page-padding muted-text">Cargando...</p>

  return (
    <div className="page-padding horario">
      <div className="page-header">
        <h1>Horario de clases</h1>
        <p className="no-print">
          Grilla por curso y sección con la carga horaria de cada materia. Con la asistencia diaria, estima las horas
          dictadas por asignatura.
        </p>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="form-row no-print" style={{ marginBottom: 16 }}>
        <label>
          Período lectivo
          <select value={periodoLectivo} onChange={(e) => setPeriodoLectivo(e.target.value)} style={{ display: 'block' }}>
            {etiquetas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        {combos.length > 1 && (
          <label>
            Carrera — Sede
            <select value={combo?.id || ''} onChange={(e) => setComboId(e.target.value)} style={{ display: 'block', minWidth: 280 }}>
              <option value="">Seleccionar...</option>
              {combos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {combos.length === 0 && <p className="muted-text">No hay cátedras activas a tu alcance en este período.</p>}

      {combo && (
        <>
          <div className="tabs no-print">
            <button type="button" className={`tab${vista === 'horario' ? ' active' : ''}`} onClick={() => setVista('horario')}>
              Horario
            </button>
            <button type="button" className={`tab${vista === 'horas' ? ' active' : ''}`} onClick={() => setVista('horas')}>
              Horas dictadas
            </button>
          </div>

          {vista === 'horario' ? (
            <GrillaHorario
              combo={combo}
              periodoLectivo={periodoLectivo}
              catedras={delCombo}
              editable={puedeEscribir}
              setCatedras={setCatedras}
              setError={setError}
            />
          ) : (
            <HorasDictadas combo={combo} periodoLectivo={periodoLectivo} periodos={periodos} />
          )}
        </>
      )}
    </div>
  )
}

function GrillaHorario({ combo, periodoLectivo, catedras, editable, setCatedras, setError }) {
  // Filas: curso y sección. Celdas: las cátedras de esa fila que tienen
  // ese día en su horario.
  const filas = useMemo(() => {
    const mapa = new Map()
    for (const c of catedras) {
      const curso = c.asignaturas?.curso_nivel
      const k = `${curso}|${c.seccion_grupo}`
      if (!mapa.has(k)) mapa.set(k, { key: k, curso, seccion: c.seccion_grupo, catedras: [] })
      mapa.get(k).catedras.push(c)
    }
    for (const f of mapa.values()) f.catedras.sort((a, b) => a.asignaturas.nombre.localeCompare(b.asignaturas.nombre))
    return [...mapa.values()].sort((a, b) => a.curso - b.curso || String(a.seccion).localeCompare(String(b.seccion)))
  }, [catedras])

  const resumen = useMemo(() => {
    let horas = 0
    let sinHoras = 0
    let sinDia = 0
    for (const c of catedras) {
      const h = c.catedra_horario || []
      if (!h.length) sinDia++
      for (const x of h) {
        if (x.horas) horas += x.horas
        else sinHoras++
      }
    }
    return { horas, sinHoras, sinDia }
  }, [catedras])

  const cambiarLocal = (catedraId, fn) =>
    setCatedras((cs) => cs.map((c) => (c.id === catedraId ? { ...c, catedra_horario: fn(c.catedra_horario || []) } : c)))

  const agregar = async (catedraId, dia) => {
    setError('')
    const { data, error } = await supabase
      .from('catedra_horario')
      .insert({ catedra_id: catedraId, dia_semana: dia })
      .select('id, dia_semana, horas')
      .single()
    if (error) return setError(error.message)
    cambiarLocal(catedraId, (h) => [...h, data])
  }

  const quitar = async (catedraId, h) => {
    setError('')
    const { error } = await supabase.from('catedra_horario').delete().eq('id', h.id)
    if (error) return setError(error.message)
    cambiarLocal(catedraId, (lista) => lista.filter((x) => x.id !== h.id))
  }

  const guardarHoras = async (catedraId, h, horas, aviso) => {
    if (aviso) return setError(aviso)
    setError('')
    const { error } = await supabase.from('catedra_horario').update({ horas }).eq('id', h.id)
    if (error) return setError(error.message)
    cambiarLocal(catedraId, (lista) => lista.map((x) => (x.id === h.id ? { ...x, horas } : x)))
  }

  return (
    <>
      <div className="horario-resumen no-print">
        <span>
          <strong>{resumen.horas}</strong> horas cátedra por semana
        </span>
        {resumen.sinHoras > 0 && <span className="badge badge-gold">{resumen.sinHoras} clase(s) sin carga horaria</span>}
        {resumen.sinDia > 0 && <span className="badge badge-muted">{resumen.sinDia} materia(s) sin día asignado</span>}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>

      <div className="horario-imprimible">
        <p className="horario-titulo">
          <strong>{combo.label}</strong> · Período {periodoLectivo}
        </p>
        <div className="data-table-wrap">
          <table className="horario-grilla">
            <thead>
              <tr>
                <th>Curso</th>
                {DIAS.map((d) => (
                  <th key={d.value}>{d.label}</th>
                ))}
                <th className="horario-total">h/sem</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const sinDia = f.catedras.filter((c) => !(c.catedra_horario || []).length)
                const total = f.catedras.reduce(
                  (s, c) => s + (c.catedra_horario || []).reduce((t, h) => t + (h.horas || 0), 0),
                  0,
                )
                return (
                  <tr key={f.key}>
                    <th scope="row" className="horario-curso">
                      {f.curso}° {f.seccion}
                      {sinDia.length > 0 && (
                        <span className="horario-sin-dia no-print" title={sinDia.map((c) => c.asignaturas.nombre).join('\n')}>
                          {sinDia.length} sin día
                        </span>
                      )}
                    </th>
                    {DIAS.map((d) => {
                      const enDia = f.catedras
                        .map((c) => ({ c, h: (c.catedra_horario || []).find((x) => x.dia_semana === d.value) }))
                        .filter((x) => x.h)
                      const disponibles = f.catedras.filter(
                        (c) => !(c.catedra_horario || []).some((x) => x.dia_semana === d.value),
                      )
                      return (
                        <td key={d.value}>
                          {enDia.map(({ c, h }) => (
                            <div key={h.id} className={`horario-clase${h.horas ? '' : ' sin-horas'}`}>
                              <span className="horario-materia">{c.asignaturas.nombre}</span>
                              <span className="horario-profesor">{nombreProfesor(c)}</span>
                              <span className="horario-pie">
                                {editable ? (
                                  <>
                                    <HorasInput
                                      key={`${h.id}-${h.horas}`}
                                      valor={h.horas}
                                      onGuardar={(v, aviso) => guardarHoras(c.id, h, v, aviso)}
                                    />
                                    <span className="horario-horas-impresa">{h.horas ?? '—'}</span>
                                    <span className="muted-text">h</span>
                                    <button
                                      type="button"
                                      className="horario-quitar no-print"
                                      title={`Quitar ${c.asignaturas.nombre} del ${d.label.toLowerCase()}`}
                                      onClick={() => quitar(c.id, h)}
                                    >
                                      ×
                                    </button>
                                  </>
                                ) : (
                                  <span>{h.horas ? `${h.horas} h` : '— h'}</span>
                                )}
                              </span>
                            </div>
                          ))}
                          {editable && disponibles.length > 0 && (
                            <select
                              className="horario-agregar no-print"
                              value=""
                              aria-label={`Agregar materia el ${d.label.toLowerCase()} a ${f.curso}° ${f.seccion}`}
                              onChange={(e) => e.target.value && agregar(e.target.value, d.value)}
                            >
                              <option value="">+ materia</option>
                              {disponibles.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.asignaturas.nombre} — {nombreProfesor(c)}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      )
                    })}
                    <td className="horario-total">{total || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted-text no-print" style={{ fontSize: 13, marginTop: 10 }}>
        Las horas son horas cátedra de ese día. Los días también se pueden marcar desde Cátedras; la carga horaria se
        conserva.
      </p>
    </>
  )
}

const pct = (a, b) => (b > 0 ? Math.round((1000 * a) / b) / 10 : null)

function HorasDictadas({ combo, periodoLectivo, periodos }) {
  const inicial = useMemo(() => {
    const activo = periodos.find((p) => p.activo)
    if (!activo) return { desde: '', hasta: '' }
    const hoy = aISO(new Date())
    return { desde: activo.fecha_inicio, hasta: hoy < activo.fecha_fin ? hoy : activo.fecha_fin }
  }, [periodos])
  const [desde, setDesde] = useState(inicial.desde)
  const [hasta, setHasta] = useState(inicial.hasta)
  const [filas, setFilas] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  const calcular = async () => {
    if (!desde || !hasta) return setError('Indicá el rango de fechas.')
    setCargando(true)
    setError('')
    const { data, error } = await supabase.rpc('horario_horas_dictadas', {
      p_desde: desde,
      p_hasta: hasta,
      p_carrera: combo.carrera_id,
      p_sede: combo.sede_id,
      p_periodo: periodoLectivo,
    })
    setCargando(false)
    if (error) return setError(error.message)
    setFilas(data)
  }

  const totales = useMemo(() => {
    const t = { esperadas: 0, dictadas: 0, suplente: 0, ausente: 0, justificadas: 0, sinRegistro: 0, sinHoras: 0 }
    for (const f of filas || []) {
      t.esperadas += f.horas_esperadas
      t.dictadas += f.horas_dictadas
      t.suplente += f.horas_suplente
      t.ausente += f.horas_ausente
      t.justificadas += f.horas_justificadas
      t.sinRegistro += f.horas_sin_registro
      if (f.dias_sin_horas > 0) t.sinHoras++
    }
    return t
  }, [filas])

  const exportar = () =>
    descargarFilas(
      `horas_dictadas_${desde}_${hasta}.csv`,
      filas.map((f) => ({
        Curso: f.curso_nivel,
        Sección: f.seccion_grupo,
        Materia: f.materia,
        Profesor: f.profesor,
        'Horas por semana': f.horas_semana,
        'Días sin carga horaria': f.dias_sin_horas,
        'Clases esperadas': f.clases_esperadas,
        'Clases dictadas': f.clases_dictadas,
        'Horas esperadas': f.horas_esperadas,
        'Horas dictadas (titular)': f.horas_dictadas,
        'Horas por suplente': f.horas_suplente,
        'Horas ausente': f.horas_ausente,
        'Horas justificadas': f.horas_justificadas,
        'Horas sin registro': f.horas_sin_registro,
        'Horas del programa': f.horas_programa || '',
        'Cumplimiento %': pct(f.horas_dictadas + f.horas_suplente, f.horas_esperadas) ?? '',
      })),
    )

  return (
    <>
      <div className="form-card no-print">
        <RangoFechasPeriodo desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} periodos={periodos} />
        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={calcular} disabled={cargando}>
            {cargando ? 'Calculando...' : 'Calcular horas'}
          </button>
          {filas?.length > 0 && (
            <>
              <button type="button" className="btn btn-secondary" onClick={exportar}>
                Descargar CSV
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
                Imprimir
              </button>
            </>
          )}
        </div>
      </div>

      {filas && filas.length === 0 && (
        <p className="muted-text">Ninguna materia tiene días de clase cargados en ese rango.</p>
      )}

      {filas && filas.length > 0 && (
        <>
          <p className="horario-titulo">
            <strong>{combo.label}</strong> · Período {periodoLectivo} · del {formatoLargo(desde)} al {formatoLargo(hasta)}
          </p>
          <div className="horario-resumen">
            <span>
              <strong>{totales.dictadas + totales.suplente}</strong> de <strong>{totales.esperadas}</strong> horas
              cátedra dictadas ({pct(totales.dictadas + totales.suplente, totales.esperadas) ?? '—'}%)
            </span>
            {totales.suplente > 0 && <span className="muted-text">{totales.suplente} por suplente</span>}
            {totales.sinRegistro > 0 && (
              <span className="badge badge-muted">{totales.sinRegistro} h sin asistencia registrada</span>
            )}
          </div>
          {totales.sinHoras > 0 && (
            <p className="horario-aviso">
              {totales.sinHoras} materia(s) tienen días sin carga horaria: esas clases cuentan 0 horas. Cargalas en la
              pestaña Horario.
            </p>
          )}
          <div className="data-table-wrap">
            <table className="data-table horario-tabla-horas">
              <thead>
                <tr>
                  <th>Curso</th>
                  <th>Materia</th>
                  <th>Profesor</th>
                  <th title="Horas cátedra por semana según el horario">h/sem</th>
                  <th title="Días de clase en el rango, sin feriados ni días no hábiles">Clases</th>
                  <th>Esperadas</th>
                  <th>Dictadas</th>
                  <th>Suplente</th>
                  <th>Ausente</th>
                  <th>Justif.</th>
                  <th>Sin registro</th>
                  <th title="Horas totales cargadas en la asignatura (Configuración)">Programa</th>
                  <th>Cumplimiento</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const p = pct(f.horas_dictadas + f.horas_suplente, f.horas_esperadas)
                  return (
                    <tr key={f.catedra_id}>
                      <td>
                        {f.curso_nivel}° {f.seccion_grupo}
                      </td>
                      <td>
                        {f.materia}
                        {f.dias_sin_horas > 0 && (
                          <span className="badge badge-gold" style={{ marginLeft: 6 }}>
                            sin carga horaria
                          </span>
                        )}
                      </td>
                      <td>{f.profesor}</td>
                      <td>{f.horas_semana || '—'}</td>
                      <td>
                        {f.clases_dictadas}/{f.clases_esperadas}
                      </td>
                      <td>{f.horas_esperadas}</td>
                      <td>{f.horas_dictadas}</td>
                      <td>{f.horas_suplente || ''}</td>
                      <td>{f.horas_ausente || ''}</td>
                      <td>{f.horas_justificadas || ''}</td>
                      <td>{f.horas_sin_registro || ''}</td>
                      <td>{f.horas_programa || '—'}</td>
                      <td>{p == null ? '—' : `${p}%`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="muted-text" style={{ fontSize: 13, marginTop: 10 }}>
            Cumplimiento = (dictadas + suplente) / esperadas. La asistencia se marca por profesor y día: si un profesor da
            dos materias el mismo día, la marca vale para las dos.
          </p>
        </>
      )}
    </>
  )
}
