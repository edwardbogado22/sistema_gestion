import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

const ORIGEN_LABEL = {
  MANUAL: 'Manual',
  OBJETIVO_CLASES_CONTENIDO: 'Objetivo (asistencia + contenido)',
  OBJETIVO_MESAS_EXAMINADORAS: 'Objetivo (mesas examinadoras)',
  OBJETIVO_REUNIONES: 'Objetivo (asistencia a reuniones)',
  ENCUESTA_ALUMNOS: 'Encuesta a alumnos',
}

export function Criterios() {
  const [criterios, setCriterios] = useState([])
  const [periodos, setPeriodos] = useState([])
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const cargar = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('criterios_evaluacion').select('*').order('periodo_lectivo', { ascending: false }).order('grupo').order('orden')
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setCriterios(data)
    const distintos = [...new Set(data.map((c) => c.periodo_lectivo))]
    setPeriodos(distintos)
    setPeriodoSeleccionado((prev) => prev || distintos[0] || '')
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const delPeriodo = useMemo(
    () => criterios.filter((c) => c.periodo_lectivo === periodoSeleccionado),
    [criterios, periodoSeleccionado],
  )
  const institucionales = delPeriodo.filter((c) => c.grupo === 'INSTITUCIONAL')
  const alumnos = delPeriodo.filter((c) => c.grupo === 'ALUMNOS')

  const sumar = (lista) => lista.filter((c) => c.activo).reduce((acc, c) => acc + Number(c.peso_porcentaje), 0)

  const actualizarCampo = (id, campo, valor) => {
    setCriterios((prev) => prev.map((c) => (c.id === id ? { ...c, [campo]: valor } : c)))
  }

  const guardarCambios = async () => {
    setSaving(true)
    setError('')
    setOk('')
    for (const c of delPeriodo) {
      const { error } = await supabase
        .from('criterios_evaluacion')
        .update({ nombre: c.nombre, descripcion: c.descripcion, peso_porcentaje: Number(c.peso_porcentaje), activo: c.activo })
        .eq('id', c.id)
      if (error) {
        setSaving(false)
        setError(error.message)
        return
      }
    }
    setSaving(false)
    setOk('Cambios guardados.')
  }

  const crearNuevoPeriodo = async () => {
    const nuevo = window.prompt('Nombre del nuevo periodo lectivo (ej. 2027):')
    if (!nuevo || !nuevo.trim()) return
    if (periodos.includes(nuevo.trim())) {
      alert('Ese periodo ya existe.')
      return
    }
    setSaving(true)
    setError('')
    const filas = delPeriodo.map((c) => ({
      codigo: c.codigo,
      nombre: c.nombre,
      descripcion: c.descripcion,
      peso_porcentaje: c.peso_porcentaje,
      periodo_lectivo: nuevo.trim(),
      activo: c.activo,
      grupo: c.grupo,
      orden: c.orden,
      origen: c.origen,
    }))
    const { error } = await supabase.from('criterios_evaluacion').insert(filas)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setPeriodoSeleccionado(nuevo.trim())
    cargar()
  }

  if (loading) return <p>Cargando...</p>

  return (
    <div>
      <div className="form-grid" style={{ maxWidth: 420, marginBottom: '1rem' }}>
        <label>
          Periodo lectivo
          <select value={periodoSeleccionado} onChange={(e) => setPeriodoSeleccionado(e.target.value)}>
            {periodos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-actions" style={{ marginBottom: '1.5rem' }}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={guardarCambios}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button type="button" className="btn btn-secondary" disabled={saving} onClick={crearNuevoPeriodo}>
          Crear periodo nuevo (duplicar estos criterios)
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {ok && <p className="success-text">{ok}</p>}

      <h3>
        Criterios Institucionales <span className="muted-text">(suma activos: {sumar(institucionales)}% de 80%)</span>
      </h3>
      <TablaCriterios lista={institucionales} onChange={actualizarCampo} />

      <h3 style={{ marginTop: '2rem' }}>
        Indicadores de Valoración de Alumnos <span className="muted-text">(suma activos: {sumar(alumnos)}% de 22%)</span>
      </h3>
      <TablaCriterios lista={alumnos} onChange={actualizarCampo} />
    </div>
  )
}

function TablaCriterios({ lista, onChange }) {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>N°</th>
            <th>Criterio</th>
            <th style={{ width: 110 }}>Ponderación</th>
            <th>Origen</th>
            <th style={{ width: 80 }}>Activo</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((c) => (
            <tr key={c.id}>
              <td>{c.orden}</td>
              <td>
                <input
                  value={c.nombre}
                  onChange={(e) => onChange(c.id, 'nombre', e.target.value)}
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}
                />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={c.peso_porcentaje}
                  onChange={(e) => onChange(c.id, 'peso_porcentaje', e.target.value)}
                  style={{ width: 80, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}
                />
                %
              </td>
              <td>
                <span className="badge badge-gold">{ORIGEN_LABEL[c.origen] || c.origen}</span>
              </td>
              <td>
                <input type="checkbox" checked={c.activo} onChange={(e) => onChange(c.id, 'activo', e.target.checked)} />
              </td>
            </tr>
          ))}
          {lista.length === 0 && (
            <tr>
              <td colSpan={5}>Sin criterios en este bloque.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
