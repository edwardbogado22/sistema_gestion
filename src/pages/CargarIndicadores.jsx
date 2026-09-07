import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatoLargo } from '../lib/fechas'

function pct(dividendo, divisor) {
  const d = Number(dividendo)
  const v = Number(divisor)
  if (!v) return null
  return Math.round((d / v) * 10000) / 100
}

const hoy = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function CargarIndicadores() {
  const { catedraId } = useParams()
  const { perfil } = useAuth()
  const [catedra, setCatedra] = useState(null)
  const [criterios, setCriterios] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [clases, setClases] = useState({ horas_programadas: '', horas_dictadas: '' })
  const [contenido, setContenido] = useState({ unidades_programadas: '', unidades_desarrolladas: '' })
  const [manualValores, setManualValores] = useState({})
  const [alumnosValores, setAlumnosValores] = useState({})
  const [totalEncuestados, setTotalEncuestados] = useState('')
  const [planAnual, setPlanAnual] = useState(null)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const { data: c, error: e1 } = await supabase
        .from('catedras')
        .select('id, periodo_lectivo, seccion_grupo, profesores(nombres, apellidos), asignaturas(nombre, carreras(nombre)), sedes(nombre)')
        .eq('id', catedraId)
        .single()
      if (e1) {
        setError(e1.message)
        setLoading(false)
        return
      }
      setCatedra(c)

      const [{ data: cr }, { data: ac }, { data: cc }, { data: pae }, { data: ecc }] = await Promise.all([
        supabase.from('criterios_evaluacion').select('*').eq('periodo_lectivo', c.periodo_lectivo).eq('activo', true).order('orden'),
        supabase.from('asistencia_clases').select('*').eq('catedra_id', catedraId).maybeSingle(),
        supabase.from('cumplimiento_contenido').select('*').eq('catedra_id', catedraId).maybeSingle(),
        supabase.from('plan_anual_entrega').select('*').eq('catedra_id', catedraId).maybeSingle(),
        supabase.from('evaluacion_criterio_catedra').select('*').eq('catedra_id', catedraId),
      ])

      setCriterios(cr || [])
      if (ac) setClases({ horas_programadas: ac.horas_programadas, horas_dictadas: ac.horas_dictadas })
      if (cc) setContenido({ unidades_programadas: cc.unidades_programadas, unidades_desarrolladas: cc.unidades_desarrolladas })
      setPlanAnual(pae || null)

      const manual = {}
      const alumnos = {}
      let encuestados = ''
      ;(ecc || []).forEach((row) => {
        const criterio = (cr || []).find((x) => x.id === row.criterio_id)
        if (!criterio) return
        if (criterio.origen === 'ENCUESTA_ALUMNOS') {
          alumnos[row.criterio_id] = row.valor_ingresado
          if (row.total_encuestados != null) encuestados = row.total_encuestados
        } else {
          manual[row.criterio_id] = row.valor_ingresado
        }
      })
      setManualValores(manual)
      setAlumnosValores(alumnos)
      setTotalEncuestados(encuestados)
      setLoading(false)
    })()
  }, [catedraId])

  const institucionalesManual = criterios.filter((c) => c.grupo === 'INSTITUCIONAL' && c.origen === 'MANUAL')
  const alumnosItems = criterios.filter((c) => c.grupo === 'ALUMNOS')
  const criterioClases = criterios.find((c) => c.origen === 'OBJETIVO_CLASES_CONTENIDO')
  const criterioMesas = criterios.find((c) => c.origen === 'OBJETIVO_MESAS_EXAMINADORAS')
  const criterioReuniones = criterios.find((c) => c.origen === 'OBJETIVO_REUNIONES')
  const criterioPlanAnual = criterios.find((c) => c.origen === 'OBJETIVO_PLAN_ANUAL')
  const criterioCapacitaciones = criterios.find((c) => c.origen === 'OBJETIVO_CAPACITACIONES')

  const pctClases = pct(clases.horas_dictadas, clases.horas_programadas)
  const pctContenido = pct(contenido.unidades_desarrolladas, contenido.unidades_programadas)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setOk('')

    if (clases.horas_programadas !== '' && clases.horas_dictadas !== '') {
      const { error } = await supabase.from('asistencia_clases').upsert(
        {
          catedra_id: catedraId,
          horas_programadas: Number(clases.horas_programadas),
          horas_dictadas: Number(clases.horas_dictadas),
          porcentaje_asistencia: pctClases,
        },
        { onConflict: 'catedra_id' },
      )
      if (error) {
        setSaving(false)
        setError(error.message)
        return
      }
    }

    if (contenido.unidades_programadas !== '' && contenido.unidades_desarrolladas !== '') {
      const { error } = await supabase.from('cumplimiento_contenido').upsert(
        {
          catedra_id: catedraId,
          unidades_programadas: Number(contenido.unidades_programadas),
          unidades_desarrolladas: Number(contenido.unidades_desarrolladas),
          porcentaje_cumplimiento: pctContenido,
        },
        { onConflict: 'catedra_id' },
      )
      if (error) {
        setSaving(false)
        setError(error.message)
        return
      }
    }

    const filasManual = institucionalesManual
      .filter((c) => manualValores[c.id] !== undefined && manualValores[c.id] !== '')
      .map((c) => ({
        catedra_id: catedraId,
        criterio_id: c.id,
        valor_ingresado: Number(manualValores[c.id]),
        total_encuestados: null,
        obtenido_porcentaje: Number(manualValores[c.id]),
      }))

    const filasAlumnos = alumnosItems
      .filter((c) => alumnosValores[c.id] !== undefined && alumnosValores[c.id] !== '')
      .map((c) => ({
        catedra_id: catedraId,
        criterio_id: c.id,
        valor_ingresado: Number(alumnosValores[c.id]),
        total_encuestados: totalEncuestados ? Number(totalEncuestados) : null,
        obtenido_porcentaje: Math.round((Number(alumnosValores[c.id]) / 5) * Number(c.peso_porcentaje) * 100) / 100,
      }))

    const filas = [...filasManual, ...filasAlumnos]
    if (filas.length > 0) {
      const { error } = await supabase.from('evaluacion_criterio_catedra').upsert(filas, { onConflict: 'catedra_id,criterio_id' })
      if (error) {
        setSaving(false)
        setError(error.message)
        return
      }
    }

    setSaving(false)
    setOk('Indicadores guardados.')
  }

  if (loading) {
    return (
      <div className="page-padding">
        <p>Cargando...</p>
      </div>
    )
  }

  return (
    <div className="page-padding">
      <div className="page-header no-print">
        <div>
          <h1>Cargar Indicadores</h1>
          <p>
            {catedra?.profesores?.apellidos}, {catedra?.profesores?.nombres} — {catedra?.asignaturas?.nombre} ·{' '}
            {catedra?.asignaturas?.carreras?.nombre} · {catedra?.sedes?.nombre} · Periodo {catedra?.periodo_lectivo} ·
            Sección {catedra?.seccion_grupo}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            Imprimir constancia de carga
          </button>
          <Link to={`/foja/${catedraId}`} className="btn btn-secondary">
            Ver Foja de Desempeño
          </Link>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="no-print">
        <div className="form-card" style={{ marginBottom: '1.5rem' }}>
          <h3>Datos objetivos</h3>
          <div className="form-grid">
            <label>
              Horas programadas (clases)
              <input
                type="number"
                min="0"
                value={clases.horas_programadas}
                onChange={(e) => setClases({ ...clases, horas_programadas: e.target.value })}
              />
            </label>
            <label>
              Horas dictadas
              <input
                type="number"
                min="0"
                value={clases.horas_dictadas}
                onChange={(e) => setClases({ ...clases, horas_dictadas: e.target.value })}
              />
            </label>
            <div className="muted-text full-width">
              % asistencia a clases: {pctClases ?? '—'}%
              {criterioClases && <> · aporta a &quot;{criterioClases.nombre}&quot; ({criterioClases.peso_porcentaje}%)</>}
            </div>

            <label>
              Unidades programadas (contenido)
              <input
                type="number"
                min="0"
                value={contenido.unidades_programadas}
                onChange={(e) => setContenido({ ...contenido, unidades_programadas: e.target.value })}
              />
            </label>
            <label>
              Unidades desarrolladas
              <input
                type="number"
                min="0"
                value={contenido.unidades_desarrolladas}
                onChange={(e) => setContenido({ ...contenido, unidades_desarrolladas: e.target.value })}
              />
            </label>
            <div className="muted-text full-width">% cumplimiento de contenido: {pctContenido ?? '—'}%</div>

            {criterioMesas && (
              <div className="muted-text full-width">
                Asistencia a mesas examinadoras: se calcula automáticamente desde Asignación de Vocales y Asistencia a
                Mesas (Exámenes) · aporta a &quot;{criterioMesas.nombre}&quot; ({criterioMesas.peso_porcentaje}%)
              </div>
            )}

            {criterioReuniones && (
              <div className="muted-text full-width">
                Participación institucional: se calcula automáticamente desde el check-in de Asistencia a Eventos ·
                aporta a &quot;{criterioReuniones.nombre}&quot; ({criterioReuniones.peso_porcentaje}%)
              </div>
            )}

            {criterioCapacitaciones && (
              <div className="muted-text full-width">
                Capacitaciones: se calcula automáticamente desde el check-in de Asistencia a Eventos · aporta a &quot;
                {criterioCapacitaciones.nombre}&quot; ({criterioCapacitaciones.peso_porcentaje}%)
              </div>
            )}

            {criterioPlanAnual && (
              <div className="muted-text full-width">
                Plan anual:{' '}
                {planAnual?.fecha_entrega ? (
                  <span className="badge badge-success">Entregado el {formatoLargo(planAnual.fecha_entrega)}</span>
                ) : (
                  <span className="badge badge-muted">Pendiente</span>
                )}{' '}
                · aporta a &quot;{criterioPlanAnual.nombre}&quot; ({criterioPlanAnual.peso_porcentaje}%) ·{' '}
                <Link to="/plan-anual">Registrar en Plan Anual de Clases</Link>
              </div>
            )}
          </div>
        </div>

        <div className="form-card" style={{ marginBottom: '1.5rem' }}>
          <h3>Criterios institucionales (carga manual)</h3>
          <div className="form-grid">
            {institucionalesManual.map((c) => (
              <label key={c.id}>
                {c.nombre} <span className="muted-text">(0–{c.peso_porcentaje}%)</span>
                <input
                  type="number"
                  min="0"
                  max={c.peso_porcentaje}
                  step="0.01"
                  value={manualValores[c.id] ?? ''}
                  onChange={(e) => setManualValores({ ...manualValores, [c.id]: e.target.value })}
                />
              </label>
            ))}
            {institucionalesManual.length === 0 && <p className="muted-text">No hay criterios manuales activos.</p>}
          </div>
        </div>

        <div className="form-card">
          <h3>Valoración de alumnos (encuesta)</h3>
          <div className="form-grid" style={{ marginBottom: '1rem' }}>
            <label>
              Cantidad de estudiantes encuestados
              <input
                type="number"
                min="0"
                value={totalEncuestados}
                onChange={(e) => setTotalEncuestados(e.target.value)}
              />
            </label>
          </div>
          <div className="form-grid">
            {alumnosItems.map((c) => (
              <label key={c.id}>
                {c.nombre} <span className="muted-text">(1–5, pesa {c.peso_porcentaje}%)</span>
                <input
                  type="number"
                  min="1"
                  max="5"
                  step="0.01"
                  value={alumnosValores[c.id] ?? ''}
                  onChange={(e) => setAlumnosValores({ ...alumnosValores, [c.id]: e.target.value })}
                />
              </label>
            ))}
            {alumnosItems.length === 0 && <p className="muted-text">No hay ítems de encuesta activos.</p>}
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}
        {ok && <p className="success-text">{ok}</p>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar indicadores'}
          </button>
        </div>
      </form>

      <div className="foja-card">
        <div className="foja-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <img src="/escudo-une.png" alt="Escudo UNE" className="foja-escudo" />
          <div>
            <p className="eyebrow" style={{ color: 'var(--gold)' }}>
              Universidad Nacional del Este
            </p>
            <h2 style={{ margin: '2px 0' }}>Facultad de Ciencias Económicas</h2>
            <p className="muted-text" style={{ margin: 0 }}>
              Constancia de Carga de Indicadores — Secretaría de Carrera
            </p>
          </div>
        </div>

        <table className="foja-datos">
          <tbody>
            <tr>
              <td>
                <strong>Carrera:</strong> {catedra?.asignaturas?.carreras?.nombre}
              </td>
              <td>
                <strong>Sede:</strong> {catedra?.sedes?.nombre}
              </td>
            </tr>
            <tr>
              <td>
                <strong>Materia:</strong> {catedra?.asignaturas?.nombre}
              </td>
              <td>
                <strong>Sección:</strong> {catedra?.seccion_grupo}
              </td>
            </tr>
            <tr>
              <td>
                <strong>Profesor:</strong> {catedra?.profesores?.apellidos}, {catedra?.profesores?.nombres}
              </td>
              <td>
                <strong>Periodo:</strong> {catedra?.periodo_lectivo}
              </td>
            </tr>
            <tr className="no-print">
              <td colSpan={2}>
                <strong>Responsable:</strong> {perfil?.nombre_completo || '—'}
              </td>
            </tr>
            <tr>
              <td colSpan={2}>
                <strong>Emitido:</strong> {hoy()}
              </td>
            </tr>
          </tbody>
        </table>

        <table className="data-table foja-tabla">
          <thead>
            <tr>
              <th>Dato cargado</th>
              <th style={{ width: 140 }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Horas programadas / dictadas</td>
              <td>
                {clases.horas_programadas || '—'} / {clases.horas_dictadas || '—'}
              </td>
            </tr>
            <tr>
              <td>Unidades programadas / desarrolladas</td>
              <td>
                {contenido.unidades_programadas || '—'} / {contenido.unidades_desarrolladas || '—'}
              </td>
            </tr>
            <tr>
              <td>Plan anual</td>
              <td>{planAnual?.fecha_entrega ? `Entregado el ${formatoLargo(planAnual.fecha_entrega)}` : 'Pendiente'}</td>
            </tr>
            {institucionalesManual.map((c) => (
              <tr key={c.id}>
                <td>{c.nombre}</td>
                <td>{manualValores[c.id] ?? '—'}</td>
              </tr>
            ))}
            <tr>
              <td>Cantidad de estudiantes encuestados</td>
              <td>{totalEncuestados || '—'}</td>
            </tr>
            {alumnosItems.map((c) => (
              <tr key={c.id}>
                <td>{c.nombre}</td>
                <td>{alumnosValores[c.id] ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
