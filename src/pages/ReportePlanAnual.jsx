import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatoLargo } from '../lib/fechas'

const hoy = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/**
 * Constancia de las entregas de Plan Anual registradas, para que
 * Secretaría presente el resultado de su trabajo con formato
 * institucional. Reusa las clases de impresión de la Foja de Desempeño,
 * mismo patrón que ReporteCarga.jsx.
 */
export function ReportePlanAnual() {
  const { perfil } = useAuth()
  const [catedras, setCatedras] = useState([])
  const [entregas, setEntregas] = useState({})
  const [periodo, setPeriodo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase
        .from('catedras')
        .select(
          'id, periodo_lectivo, seccion_grupo, profesores(nombres, apellidos), asignaturas(nombre, carreras(nombre)), sedes(nombre)',
        )
        .eq('activo', true)
        .order('periodo_lectivo', { ascending: false }),
      supabase.from('plan_anual_entrega').select('*'),
    ]).then(([c, pa]) => {
      const err = c.error || pa.error
      if (err) setError(err.message)
      setCatedras(c.data || [])
      const mapa = {}
      for (const row of pa.data || []) mapa[row.catedra_id] = row
      setEntregas(mapa)
      const periodos = [...new Set((c.data || []).map((x) => x.periodo_lectivo))].sort().reverse()
      if (periodos.length) setPeriodo(periodos[0])
      setLoading(false)
    })
  }, [])

  const periodos = useMemo(
    () => [...new Set(catedras.map((c) => c.periodo_lectivo))].sort().reverse(),
    [catedras],
  )

  // Un bloque por carrera y sede: es la unidad que firma el secretario
  const bloques = useMemo(() => {
    const filas = catedras.filter((c) => c.periodo_lectivo === periodo)
    const mapa = new Map()
    for (const c of filas) {
      const carrera = c.asignaturas?.carreras?.nombre || '—'
      const sede = c.sedes?.nombre || '—'
      const clave = `${carrera}||${sede}`
      if (!mapa.has(clave)) mapa.set(clave, { carrera, sede, filas: [] })
      mapa.get(clave).filas.push(c)
    }
    for (const b of mapa.values()) {
      b.filas.sort(
        (a, c) =>
          (a.profesores?.apellidos || '').localeCompare(c.profesores?.apellidos || '') ||
          (a.asignaturas?.nombre || '').localeCompare(c.asignaturas?.nombre || ''),
      )
    }
    return [...mapa.values()].sort((a, b) => a.carrera.localeCompare(b.carrera) || a.sede.localeCompare(b.sede))
  }, [catedras, periodo])

  if (loading) return <p className="page-padding muted-text">Cargando...</p>
  if (error) return <p className="page-padding error-text">{error}</p>

  return (
    <div className="page-padding foja-desempeno">
      <div className="form-row no-print" style={{ marginBottom: '1rem', alignItems: 'flex-end' }}>
        <label style={{ maxWidth: 160 }}>
          Período
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {periodos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Imprimir
          </button>
        </div>
      </div>

      {bloques.length === 0 && (
        <p className="muted-text no-print">No hay cátedras activas para ese período dentro de tu alcance.</p>
      )}

      {bloques.map((b) => {
        const entregadas = b.filas.filter((c) => !!entregas[c.id]?.fecha_entrega).length
        return (
          <div className="foja-card" key={`${b.carrera}-${b.sede}`} style={{ marginBottom: 24 }}>
            <div
              className="foja-header"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}
            >
              <img src="/escudo-une.png" alt="Escudo UNE" className="foja-escudo" />
              <div>
                <p className="eyebrow" style={{ color: 'var(--gold)' }}>
                  Universidad Nacional del Este
                </p>
                <h2 style={{ margin: '2px 0' }}>Facultad de Ciencias Económicas</h2>
                <p className="muted-text" style={{ margin: 0 }}>
                  Secretaría de Carrera
                </p>
                <p className="muted-text" style={{ fontSize: 12, margin: '4px 0 0' }}>
                  Avda. Universidad Nacional del Este y Avda. Paraguay - Km 8 Acaray - Campus Universitario - Ciudad
                  del Este - Paraguay
                </p>
              </div>
            </div>

            <h3 style={{ textAlign: 'center', margin: '18px 0 4px' }}>
              Plan Anual de Clases — Constancia de Entregas
            </h3>
            <p style={{ textAlign: 'center', margin: '0 0 18px' }} className="muted-text">
              Periodo Lectivo {periodo}
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
                    <strong>Entregados:</strong> {entregadas} de {b.filas.length}
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
                  <th>PROFESOR</th>
                  <th>MATERIA</th>
                  <th style={{ width: 70 }}>SEC.</th>
                  <th style={{ width: 110 }}>FECHA ENTREGA</th>
                  <th>OBSERVACIONES</th>
                </tr>
              </thead>
              <tbody>
                {b.filas.map((c, i) => {
                  const e = entregas[c.id]
                  return (
                    <tr key={c.id}>
                      <td>{i + 1}</td>
                      <td>
                        {c.profesores?.apellidos}, {c.profesores?.nombres}
                      </td>
                      <td>{c.asignaturas?.nombre}</td>
                      <td>{c.seccion_grupo}</td>
                      <td>{e?.fecha_entrega ? formatoLargo(e.fecha_entrega) : 'Pendiente'}</td>
                      <td>{e?.observaciones || '—'}</td>
                    </tr>
                  )
                })}
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
        )
      })}
    </div>
  )
}
