import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const MINIMO = 2

// Complementario y Regularización: las fechas se distribuyen según el día
// de clase de cada materia (examen_distribuir). Este panel muestra cuántos
// días hábiles hay de cada día de la semana en el rango, permite
// extenderlo hasta tener al menos dos de cada uno (un feriado se cubre con
// el próximo día igual) y lista las materias que quedaron sin fecha con el
// motivo, para resolverlas a mano. Se monta con una key que cambia con el
// rango, los bloqueos y el avance, así se recarga solo.
export function PanelHorarioLlamado({ llamado, puedeEditar, onCambio, setError, setOk }) {
  const [dias, setDias] = useState([])
  const [sinFecha, setSinFecha] = useState(null)
  const [verSinFecha, setVerSinFecha] = useState(false)
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    supabase.rpc('examen_llamado_dias_semana', { p_llamado: llamado.id }).then(({ data, error }) => {
      if (error) setError(error.message)
      else setDias(data || [])
    })
    supabase.rpc('examen_sin_fecha_motivo', { p_llamado: llamado.id }).then(({ data, error }) => {
      if (!error) setSinFecha(data || [])
    })
  }, [llamado.id, setError])

  const faltan = dias.filter((d) => d.habiles < MINIMO)

  const completar = async () => {
    setError('')
    setOk('')
    setTrabajando(true)
    const { data, error } = await supabase.rpc('examen_llamado_completar_dias', { p_llamado: llamado.id, p_minimo: MINIMO })
    setTrabajando(false)
    if (error) return setError(error.message)
    setOk(`El rango ahora termina el ${data.split('-').reverse().join('/')}: hay al menos ${MINIMO} días hábiles de cada día de la semana.`)
    onCambio()
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="section-label">
        <span>Días de clase disponibles en el rango</span>
      </div>
      <p className="muted-text" style={{ fontSize: 12, marginTop: 0 }}>
        Cada materia rinde solo el día de la semana en que se dicta. Hacen falta al menos {MINIMO} días hábiles de cada
        uno: si un feriado quita alguno, se extiende el rango hasta el próximo día igual.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {dias.map((d) => (
          <span
            key={d.dia_semana}
            className={`badge ${d.habiles >= MINIMO ? 'badge-success' : ''}`}
            style={d.habiles >= MINIMO ? undefined : { background: 'var(--danger-soft)', color: 'var(--danger)' }}
            title={d.fechas || 'Ninguno'}
          >
            {d.nombre}: {d.habiles} {d.fechas ? `(${d.fechas})` : ''}
          </span>
        ))}
      </div>
      {faltan.length > 0 && (
        <div className="form-row" style={{ marginTop: 10, alignItems: 'center' }}>
          <span className="error-text" style={{ fontSize: 13 }}>
            Falta{faltan.length > 1 ? 'n' : ''} {faltan.map((d) => d.nombre).join(', ')}.
          </span>
          {puedeEditar && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={trabajando} onClick={completar}>
              {trabajando ? 'Ajustando...' : `Extender el rango hasta tener ${MINIMO} de cada día`}
            </button>
          )}
        </div>
      )}

      {sinFecha && sinFecha.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="chip" onClick={() => setVerSinFecha((v) => !v)}>
            {verSinFecha ? 'Ocultar' : 'Ver'} {sinFecha.length} materia(s) sin fecha y el motivo
          </button>
          {verSinFecha && (
            <div className="data-table-wrap" style={{ marginTop: 8 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sede</th>
                    <th>Carrera</th>
                    <th>Curso</th>
                    <th>Materia</th>
                    <th>Profesor</th>
                    <th>Días de clase</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {sinFecha.map((m, i) => (
                    <tr key={i}>
                      <td>{m.sede}</td>
                      <td>{m.carrera}</td>
                      <td>
                        {m.curso_nivel}º · {m.seccion_grupo}
                      </td>
                      <td>{m.materia}</td>
                      <td>{m.profesor}</td>
                      <td>{m.dias_de_clase || '—'}</td>
                      <td className="error-text">{m.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
