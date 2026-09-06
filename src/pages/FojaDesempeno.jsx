import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function clasificar(total) {
  if (total >= 90) return 'Sobresaliente'
  if (total >= 75) return 'Satisfactorio'
  return 'Requiere Plan de Mejora'
}

export function FojaDesempeno() {
  const { catedraId } = useParams()
  const [filas, setFilas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    supabase
      .rpc('v_evaluacion_docente_ver', { p_catedra_id: catedraId })
      .order('grupo')
      .order('orden')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setFilas(data)
        setLoading(false)
      })
  }, [catedraId])

  if (loading) {
    return (
      <div className="page-padding">
        <p>Cargando...</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="page-padding">
        <p className="error-text">{error}</p>
      </div>
    )
  }
  if (filas.length === 0) {
    return (
      <div className="page-padding">
        <p className="muted-text">
          No hay resultados para mostrar: puede que no haya criterios activos configurados para el periodo de esta
          cátedra (revisá Configuración → Criterios de Evaluación), o que no tengas acceso a verla.
        </p>
      </div>
    )
  }

  const encabezado = filas[0]
  const institucionales = filas.filter((f) => f.grupo === 'INSTITUCIONAL')
  const alumnos = filas.filter((f) => f.grupo === 'ALUMNOS')
  const subtotalInstPond = institucionales.reduce((a, f) => a + Number(f.ponderacion), 0)
  const subtotalInstObt = institucionales.reduce((a, f) => a + Number(f.obtenido_porcentaje), 0)
  const subtotalAluPond = alumnos.reduce((a, f) => a + Number(f.ponderacion), 0)
  const subtotalAluObt = alumnos.reduce((a, f) => a + Number(f.obtenido_porcentaje), 0)
  const total = Math.round((subtotalInstObt + subtotalAluObt) * 100) / 100

  return (
    <div className="page-padding foja-desempeno">
      <div className="form-actions no-print" style={{ marginBottom: '1rem' }}>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>

      <div className="foja-card">
        <div className="foja-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <img src="/escudo-une.png" alt="Escudo UNE" className="foja-escudo" />
          <div>
            <p className="eyebrow" style={{ color: 'var(--gold)' }}>
              Universidad Nacional del Este
            </p>
            <h2 style={{ margin: '2px 0' }}>Facultad de Ciencias Económicas</h2>
            <p className="muted-text" style={{ margin: 0 }}>
              Dirección Académica
            </p>
            <p className="muted-text" style={{ fontSize: 12, margin: '4px 0 0' }}>
              Avda. Universidad Nacional del Este y Avda. Paraguay - Km 8 Acaray - Campus Universitario - Ciudad del
              Este - Paraguay
            </p>
          </div>
        </div>

        <h3 style={{ textAlign: 'center', margin: '18px 0 4px' }}>
          Programa de Evaluación y Acompañamiento Docente — Foja de Desempeño
        </h3>
        <p style={{ textAlign: 'center', margin: '0 0 18px' }} className="muted-text">
          Periodo Lectivo {encabezado.periodo_lectivo}
        </p>

        <table className="foja-datos">
          <tbody>
            <tr>
              <td>
                <strong>Carrera:</strong> {encabezado.carrera}
              </td>
              <td>
                <strong>Sede:</strong> {encabezado.sede}
              </td>
            </tr>
            <tr>
              <td>
                <strong>Materia:</strong> {encabezado.asignatura}
              </td>
              <td>
                <strong>Curso:</strong> {encabezado.curso_nivel}
              </td>
            </tr>
            <tr>
              <td>
                <strong>Profesor:</strong> {encabezado.profesor_completo}
              </td>
              <td>
                <strong>Sección:</strong> {encabezado.seccion_grupo}
              </td>
            </tr>
          </tbody>
        </table>

        <table className="data-table foja-tabla">
          <thead>
            <tr>
              <th style={{ width: 40 }}>N°</th>
              <th>CRITERIOS INSTITUCIONALES EVALUADOS</th>
              <th style={{ width: 100 }}>PONDERACIÓN</th>
              <th style={{ width: 100 }}>OBTENIDO</th>
            </tr>
          </thead>
          <tbody>
            {institucionales.map((f) => (
              <tr key={f.criterio_id}>
                <td>{f.orden}</td>
                <td>{f.criterio_descripcion || f.criterio_nombre}</td>
                <td>{f.ponderacion}%</td>
                <td>{f.obtenido_porcentaje}%</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 600 }}>
              <td colSpan={2}>PORCENTAJE OBTENIDO (Sub Total)</td>
              <td>{subtotalInstPond}%</td>
              <td>{Math.round(subtotalInstObt * 100) / 100}%</td>
            </tr>
          </tbody>
        </table>

        <table className="data-table foja-tabla" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>N°</th>
              <th>INDICADORES DE LA VALORACIÓN DE ALUMNOS</th>
              <th style={{ width: 100 }}>PONDERACIÓN</th>
              <th style={{ width: 100 }}>OBTENIDO</th>
            </tr>
          </thead>
          <tbody>
            {alumnos.map((f) => (
              <tr key={f.criterio_id}>
                <td>{f.orden}</td>
                <td>{f.criterio_descripcion || f.criterio_nombre}</td>
                <td>{f.ponderacion}%</td>
                <td>{f.obtenido_porcentaje}%</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 600 }}>
              <td colSpan={2}>PORCENTAJE OBTENIDO (Sub Total)</td>
              <td>{subtotalAluPond}%</td>
              <td>{Math.round(subtotalAluObt * 100) / 100}%</td>
            </tr>
          </tbody>
        </table>

        <table className="data-table foja-tabla" style={{ marginTop: 16 }}>
          <tbody>
            <tr style={{ fontWeight: 700 }}>
              <td>PORCENTAJE TOTAL OBTENIDO</td>
              <td style={{ width: 140, textAlign: 'right' }}>{total}%</td>
            </tr>
            <tr style={{ fontWeight: 700 }}>
              <td>RANGO ESTIMADO</td>
              <td style={{ width: 140, textAlign: 'right' }}>{clasificar(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
