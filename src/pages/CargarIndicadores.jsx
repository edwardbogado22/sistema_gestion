import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatoLargo } from '../lib/fechas'

function pct(dividendo, divisor) {
  const d = Number(dividendo)
  const v = Number(divisor)
  if (!v) return null
  return Math.round((d / v) * 10000) / 100
}

export function CargarIndicadores() {
  const { catedraId } = useParams()
  const [catedra, setCatedra] = useState(null)
  const [criterios, setCriterios] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [clases, setClases] = useState({ horas_programadas: '', horas_dictadas: '' })
  const [contenido, setContenido] = useState({ unidades_programadas: '', unidades_desarrolladas: '' })
  const [mesas, setMesas] = useState({ mesas_convocadas: '', mesas_asistidas: '' })
  const [reuniones, setReuniones] = useState({ reuniones_convocadas: '', reuniones_asistidas: '' })
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

      const [{ data: cr }, { data: ac }, { data: cc }, { data: ame }, { data: ar }, { data: pae }, { data: ecc }] = await Promise.all([
        supabase.from('criterios_evaluacion').select('*').eq('periodo_lectivo', c.periodo_lectivo).eq('activo', true).order('orden'),
        supabase.from('asistencia_clases').select('*').eq('catedra_id', catedraId).maybeSingle(),
        supabase.from('cumplimiento_contenido').select('*').eq('catedra_id', catedraId).maybeSingle(),
        supabase.from('asistencia_mesas_examinadoras').select('*').eq('catedra_id', catedraId).maybeSingle(),
        supabase.from('asistencia_reuniones').select('*').eq('catedra_id', catedraId).maybeSingle(),
        supabase.from('plan_anual_entrega').select('*').eq('catedra_id', catedraId).maybeSingle(),
        supabase.from('evaluacion_criterio_catedra').select('*').eq('catedra_id', catedraId),
      ])

      setCriterios(cr || [])
      if (ac) setClases({ horas_programadas: ac.horas_programadas, horas_dictadas: ac.horas_dictadas })
      if (cc) setContenido({ unidades_programadas: cc.unidades_programadas, unidades_desarrolladas: cc.unidades_desarrolladas })
      if (ame) setMesas({ mesas_convocadas: ame.mesas_convocadas, mesas_asistidas: ame.mesas_asistidas })
      if (ar) setReuniones({ reuniones_convocadas: ar.reuniones_convocadas, reuniones_asistidas: ar.reuniones_asistidas })
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

  const pctClases = pct(clases.horas_dictadas, clases.horas_programadas)
  const pctContenido = pct(contenido.unidades_desarrolladas, contenido.unidades_programadas)
  const pctMesas = pct(mesas.mesas_asistidas, mesas.mesas_convocadas)
  const pctReuniones = pct(reuniones.reuniones_asistidas, reuniones.reuniones_convocadas)

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

    if (mesas.mesas_convocadas !== '' && mesas.mesas_asistidas !== '') {
      const { error } = await supabase.from('asistencia_mesas_examinadoras').upsert(
        {
          catedra_id: catedraId,
          mesas_convocadas: Number(mesas.mesas_convocadas),
          mesas_asistidas: Number(mesas.mesas_asistidas),
          porcentaje_asistencia: pctMesas,
        },
        { onConflict: 'catedra_id' },
      )
      if (error) {
        setSaving(false)
        setError(error.message)
        return
      }
    }

    if (reuniones.reuniones_convocadas !== '' && reuniones.reuniones_asistidas !== '') {
      const { error } = await supabase.from('asistencia_reuniones').upsert(
        {
          catedra_id: catedraId,
          reuniones_convocadas: Number(reuniones.reuniones_convocadas),
          reuniones_asistidas: Number(reuniones.reuniones_asistidas),
          porcentaje_asistencia: pctReuniones,
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
      <div className="page-header">
        <div>
          <h1>Cargar Indicadores</h1>
          <p>
            {catedra?.profesores?.apellidos}, {catedra?.profesores?.nombres} — {catedra?.asignaturas?.nombre} ·{' '}
            {catedra?.asignaturas?.carreras?.nombre} · {catedra?.sedes?.nombre} · Periodo {catedra?.periodo_lectivo} ·
            Sección {catedra?.seccion_grupo}
          </p>
        </div>
        <Link to={`/foja/${catedraId}`} className="btn btn-secondary">
          Ver Foja de Desempeño
        </Link>
      </div>

      <form onSubmit={handleSubmit}>
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

            <label>
              Mesas examinadoras convocadas
              <input
                type="number"
                min="0"
                value={mesas.mesas_convocadas}
                onChange={(e) => setMesas({ ...mesas, mesas_convocadas: e.target.value })}
              />
            </label>
            <label>
              Mesas examinadoras asistidas
              <input
                type="number"
                min="0"
                value={mesas.mesas_asistidas}
                onChange={(e) => setMesas({ ...mesas, mesas_asistidas: e.target.value })}
              />
            </label>
            <div className="muted-text full-width">
              % asistencia a mesas: {pctMesas ?? '—'}%
              {criterioMesas && <> · aporta a &quot;{criterioMesas.nombre}&quot; ({criterioMesas.peso_porcentaje}%)</>}
            </div>

            <label>
              Reuniones convocadas
              <input
                type="number"
                min="0"
                value={reuniones.reuniones_convocadas}
                onChange={(e) => setReuniones({ ...reuniones, reuniones_convocadas: e.target.value })}
              />
            </label>
            <label>
              Reuniones asistidas
              <input
                type="number"
                min="0"
                value={reuniones.reuniones_asistidas}
                onChange={(e) => setReuniones({ ...reuniones, reuniones_asistidas: e.target.value })}
              />
            </label>
            <div className="muted-text full-width">
              % asistencia a reuniones: {pctReuniones ?? '—'}%
              {criterioReuniones && (
                <> · aporta a &quot;{criterioReuniones.nombre}&quot; ({criterioReuniones.peso_porcentaje}%)</>
              )}
            </div>

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
    </div>
  )
}
