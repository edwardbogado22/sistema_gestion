import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatoLargo } from '../../lib/fechas'

const TIPOS = {
  ORDINARIO: 'Ordinario',
  COMPLEMENTARIO: 'Complementario',
  REGULARIZACION: 'Regularización',
}

const hoy = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const nombreProfesor = (p) => (p ? `${p.apellidos}, ${p.nombres}` : '')

/**
 * Planilla imprimible de mesas examinadoras: Presidente + Vocal 1 + Vocal 2
 * por materia, agrupadas por carrera y sede. Mismo patrón que ReporteCarga.jsx.
 */
export function ReporteMesas() {
  const { llamadoId } = useParams()
  const { perfil } = useAuth()
  const [filas, setFilas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const { data: agenda, error: eAg } = await supabase
        .from('v_examen_agenda')
        .select('*')
        .eq('llamado_id', llamadoId)
        .not('fecha', 'is', null)
      if (eAg) {
        setError(eAg.message)
        setLoading(false)
        return
      }

      const { data: integrantes, error: eInt } = await supabase
        .from('mesa_integrante')
        .select('examen_fecha_id, rol_mesa, profesores(nombres, apellidos), examen_fecha!inner(llamado_id)')
        .eq('examen_fecha.llamado_id', llamadoId)
        .eq('rol_mesa', 'VOCAL')
      if (eInt) {
        setError(eInt.message)
        setLoading(false)
        return
      }

      const vocalesPorFecha = new Map()
      for (const it of integrantes || []) {
        if (!vocalesPorFecha.has(it.examen_fecha_id)) vocalesPorFecha.set(it.examen_fecha_id, [])
        vocalesPorFecha.get(it.examen_fecha_id).push(nombreProfesor(it.profesores))
      }

      setFilas(
        (agenda || []).map((a) => ({
          ...a,
          vocal1: vocalesPorFecha.get(a.examen_fecha_id)?.[0] || '',
          vocal2: vocalesPorFecha.get(a.examen_fecha_id)?.[1] || '',
        })),
      )
      setLoading(false)
    })()
  }, [llamadoId])

  const bloques = useMemo(() => {
    const mapa = new Map()
    for (const f of filas) {
      const clave = `${f.carrera}||${f.sede}`
      if (!mapa.has(clave)) mapa.set(clave, { carrera: f.carrera, sede: f.sede, filas: [] })
      mapa.get(clave).filas.push(f)
    }
    for (const b of mapa.values()) {
      b.filas.sort(
        (a, c) =>
          a.curso_nivel - c.curso_nivel ||
          a.seccion_grupo.localeCompare(c.seccion_grupo) ||
          (a.fecha || '9999').localeCompare(c.fecha || '9999') ||
          a.materia.localeCompare(c.materia),
      )
    }
    return [...mapa.values()].sort((a, b) => a.carrera.localeCompare(b.carrera) || a.sede.localeCompare(b.sede))
  }, [filas])

  if (loading) return <p className="page-padding muted-text">Cargando...</p>
  if (error) return <p className="page-padding error-text">{error}</p>
  if (filas.length === 0) {
    return <p className="page-padding muted-text">Este llamado no tiene mesas con fecha asignada.</p>
  }

  const enc = filas[0]

  return (
    <div className="page-padding foja-desempeno">
      <div className="form-actions no-print" style={{ marginBottom: '1rem' }}>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>

      {bloques.map((b) => (
        <div className="foja-card" key={`${b.carrera}-${b.sede}`} style={{ marginBottom: 24 }}>
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
            Mesas Examinadoras — Llamado {TIPOS[enc.llamado_tipo] || enc.llamado_tipo}
          </h3>
          <p style={{ textAlign: 'center', margin: '0 0 18px' }} className="muted-text">
            {enc.llamado} · Periodo Lectivo {enc.periodo_lectivo}
          </p>

          <table className="foja-datos">
            <tbody>
              <tr>
                <td>
                  <strong>Carrera:</strong> {b.carrera}
                </td>
                <td>
                  <strong>Sede:</strong> {b.sede}
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Total de mesas:</strong> {b.filas.length}
                </td>
                <td>
                  <strong>Emitido:</strong> {hoy()}
                </td>
              </tr>
              <tr className="no-print">
                <td colSpan={2}>
                  <strong>Responsable:</strong> {perfil?.nombre_completo || '—'}
                </td>
              </tr>
            </tbody>
          </table>

          <table className="data-table foja-tabla">
            <thead>
              <tr>
                <th style={{ width: 40 }}>N°</th>
                <th style={{ width: 70 }}>CURSO</th>
                <th style={{ width: 60 }}>SEC.</th>
                <th>MATERIA</th>
                <th style={{ width: 90 }}>FECHA</th>
                <th>PRESIDENTE</th>
                <th>VOCAL 1</th>
                <th>VOCAL 2</th>
              </tr>
            </thead>
            <tbody>
              {b.filas.map((f, i) => (
                <tr key={f.catedra_id}>
                  <td>{i + 1}</td>
                  <td>{f.curso_nivel}º</td>
                  <td>{f.seccion_grupo}</td>
                  <td>
                    {f.materia}
                    {f.optativa ? ' (Opt.)' : ''}
                  </td>
                  <td>{formatoLargo(f.fecha)}</td>
                  <td>{f.profesor}</td>
                  <td className={f.vocal1 ? '' : 'error-text'}>{f.vocal1 || '— sin asignar —'}</td>
                  <td className={f.vocal2 ? '' : 'error-text'}>{f.vocal2 || '— sin asignar —'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="foja-datos" style={{ marginTop: 48 }}>
            <tbody>
              <tr>
                <td style={{ textAlign: 'center', borderTop: '1px solid #000', paddingTop: 6 }}>
                  Secretaría de Carrera
                </td>
                <td style={{ width: 60 }} />
                <td style={{ textAlign: 'center', borderTop: '1px solid #000', paddingTop: 6 }}>
                  Dirección Académica
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
