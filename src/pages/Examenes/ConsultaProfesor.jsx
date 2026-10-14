import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BuscadorSelect } from '../../components/BuscadorSelect'
import { fetchTodo } from '../../lib/paginar'
import { formatoLargo } from '../../lib/fechas'
import { descargarFilas } from '../../lib/csv'

const TIPOS = {
  ORDINARIO: 'Ordinario',
  COMPLEMENTARIO: 'Complementario',
  REGULARIZACION: 'Regularización',
}

const nombreProfesor = (p) => (p ? `${p.apellidos}, ${p.nombres}` : '')

// Todas las mesas de un profesor en un período lectivo completo, sumando
// TODOS los llamados de ese año (Ordinario, Complementario,
// Regularización) y los dos roles posibles: presidente (titular de la
// cátedra) o examinador (vocal). No se filtra por alcance de carrera/sede
// a propósito: un profesor suele dar clase en más de una carrera, y acá
// se busca su agenda completa — por eso esta pantalla es solo para
// Dirección Académica.
export function ConsultaProfesor() {
  const [periodos, setPeriodos] = useState([])
  const [periodo, setPeriodo] = useState('')
  const [profesores, setProfesores] = useState([])
  const [profesorId, setProfesorId] = useState('')
  const [agenda, setAgenda] = useState([])
  const [loading, setLoading] = useState(true)
  const [consultando, setConsultando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const [{ data: llamados, error: eLl }, { data: profs, error: eProf }] = await Promise.all([
        supabase.from('examen_llamado').select('periodo_lectivo').order('periodo_lectivo', { ascending: false }),
        supabase.from('profesores').select('id, documento_identidad, nombres, apellidos').order('apellidos'),
      ])
      if (eLl || eProf) {
        setError((eLl || eProf).message)
        setLoading(false)
        return
      }
      setPeriodos([...new Set((llamados || []).map((l) => l.periodo_lectivo))])
      setProfesores(profs || [])
      setLoading(false)
    })()
  }, [])

  const opcionesProfesor = useMemo(
    () => profesores.map((p) => ({ value: p.id, label: `${p.apellidos}, ${p.nombres} (${p.documento_identidad})` })),
    [profesores],
  )

  const profesor = profesores.find((p) => p.id === profesorId) || null

  const consultar = async () => {
    if (!periodo || !profesorId) {
      setError('Elegí período y profesor.')
      return
    }
    setError('')
    setConsultando(true)
    setAgenda([])

    const { data: llamados, error: eLl } = await supabase
      .from('examen_llamado')
      .select('id')
      .eq('periodo_lectivo', periodo)
    if (eLl) {
      setError(eLl.message)
      setConsultando(false)
      return
    }
    const llamadoIds = (llamados || []).map((l) => l.id)
    if (llamadoIds.length === 0) {
      setConsultando(false)
      return
    }

    const { data: agendaDatos, error: eAg } = await supabase
      .from('v_examen_agenda')
      .select('*')
      .in('llamado_id', llamadoIds)
      .not('fecha', 'is', null)
    if (eAg) {
      setError(eAg.message)
      setConsultando(false)
      return
    }

    // mesa_integrante puede superar las 1000 filas que PostgREST devuelve
    // por defecto en períodos grandes — se pagina igual que en
    // AsignacionVocales/ReporteMesas.
    const { data: integrantes, error: eInt } = await fetchTodo((desde, hasta) =>
      supabase
        .from('mesa_integrante')
        .select('examen_fecha_id, profesor_id, rol_mesa, profesores(nombres, apellidos), examen_fecha!inner(llamado_id)')
        .in('examen_fecha.llamado_id', llamadoIds)
        .eq('rol_mesa', 'VOCAL')
        .order('id')
        .range(desde, hasta),
    )
    if (eInt) {
      setError(eInt.message)
      setConsultando(false)
      return
    }

    const vocalesPorFecha = new Map()
    for (const it of integrantes || []) {
      if (!vocalesPorFecha.has(it.examen_fecha_id)) vocalesPorFecha.set(it.examen_fecha_id, [])
      vocalesPorFecha.get(it.examen_fecha_id).push(it)
    }

    const participaciones = []
    for (const a of agendaDatos || []) {
      const vocales = vocalesPorFecha.get(a.examen_fecha_id) || []
      if (a.profesor_id === profesorId) {
        participaciones.push({ ...a, rol: 'Presidente' })
      }
      const comoVocal = vocales.find((v) => v.profesor_id === profesorId)
      if (comoVocal) {
        participaciones.push({ ...a, rol: 'Examinador' })
      }
    }
    participaciones.sort((x, y) => (x.fecha || '').localeCompare(y.fecha || '') || x.materia.localeCompare(y.materia))

    setAgenda(participaciones)
    setConsultando(false)
  }

  const resumen = useMemo(() => {
    const presidente = agenda.filter((a) => a.rol === 'Presidente').length
    const examinador = agenda.filter((a) => a.rol === 'Examinador').length
    return { total: agenda.length, presidente, examinador }
  }, [agenda])

  const exportar = () => {
    descargarFilas(
      `mesas-${profesor ? profesor.apellidos : 'profesor'}-${periodo}.csv`,
      agenda.map((a) => ({
        fecha: a.fecha,
        llamado: a.llamado,
        tipo: TIPOS[a.llamado_tipo] || a.llamado_tipo,
        carrera: a.carrera,
        sede: a.sede,
        curso: a.curso_nivel,
        seccion: a.seccion_grupo,
        materia: a.materia,
        rol: a.rol,
      })),
    )
  }

  if (loading) return <p className="page-padding muted-text">Cargando...</p>

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Consultar mesas por profesor</h1>
        <p>
          Todas las mesas examinadoras en las que un profesor participa dentro de un período lectivo — ya sea como
          presidente (titular de la cátedra) o como examinador (vocal), sumando todos los llamados de ese año.
        </p>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="form-row" style={{ marginBottom: 16, alignItems: 'flex-end' }}>
        <label>
          Período Lectivo
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ display: 'block', minWidth: 140 }}>
            <option value="">Seleccionar...</option>
            {periodos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label style={{ minWidth: 280 }}>
          Profesor
          <BuscadorSelect opciones={opcionesProfesor} value={profesorId} onChange={setProfesorId} placeholder="Buscar por nombre o cédula..." />
        </label>
        <button type="button" className="btn btn-primary" disabled={consultando} onClick={consultar}>
          {consultando ? 'Buscando...' : 'Consultar'}
        </button>
      </div>

      {agenda.length > 0 && (
        <>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-value">{resumen.total}</div>
              <div className="stat-label">Mesas en total</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{resumen.presidente}</div>
              <div className="stat-label">Como presidente</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{resumen.examinador}</div>
              <div className="stat-label">Como examinador</div>
            </div>
          </div>

          <div className="form-actions" style={{ marginBottom: 12 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportar}>
              Descargar CSV
            </button>
          </div>

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Llamado</th>
                  <th>Carrera</th>
                  <th>Sede</th>
                  <th>Curso/Sec</th>
                  <th>Materia</th>
                  <th>Rol</th>
                </tr>
              </thead>
              <tbody>
                {agenda.map((a) => (
                  <tr key={`${a.examen_fecha_id}-${a.rol}`}>
                    <td>{formatoLargo(a.fecha)}</td>
                    <td>
                      {a.llamado}
                      <div className="muted-text" style={{ fontSize: 12 }}>
                        {TIPOS[a.llamado_tipo] || a.llamado_tipo}
                      </div>
                    </td>
                    <td>{a.carrera}</td>
                    <td>{a.sede}</td>
                    <td>
                      {a.curso_nivel}º · {a.seccion_grupo}
                    </td>
                    <td>
                      {a.materia}
                      {a.optativa ? ' (Opt.)' : ''}
                    </td>
                    <td>
                      <span className={`badge ${a.rol === 'Presidente' ? 'badge-gold' : 'badge-muted'}`}>{a.rol}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {consultando === false && periodo && profesorId && agenda.length === 0 && !error && (
        <p className="muted-text">Este profesor no tiene mesas con fecha asignada en el período {periodo}.</p>
      )}
    </div>
  )
}
