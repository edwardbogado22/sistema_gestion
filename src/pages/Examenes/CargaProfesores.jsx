import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fetchTodo } from '../../lib/paginar'
import { formatoLargo } from '../../lib/fechas'
import { diaSemana } from '../../lib/vocalesExamen'
import { descargarFilas } from '../../lib/csv'
import { coincideTexto } from '../../lib/buscar'

const ORDENES = {
  total: { label: 'Total de mesas', fn: (a, b) => b.total - a.total || b.examinaciones - a.examinaciones },
  examinaciones: { label: 'Examinaciones', fn: (a, b) => b.examinaciones - a.examinaciones || b.total - a.total },
  maxDia: { label: 'Más mesas en un día', fn: (a, b) => b.maxDia - a.maxDia || b.total - a.total },
  nombre: { label: 'Nombre', fn: () => 0 },
}

/**
 * Carga de mesas por profesor en un llamado: cuántas preside (titular de
 * la cátedra) y en cuántas es examinador (vocal), en cuántos días y cuál
 * es su día más cargado. Sirve para revisar el reparto antes de aprobar y
 * para entregarlo a Dirección Académica. Los filtros de sede/carrera
 * cuentan solo las mesas de esa sede/carrera.
 */
export function CargaProfesores() {
  const { llamadoId } = useParams()
  const [llamado, setLlamado] = useState(null)
  const [mesas, setMesas] = useState([])
  const [vocales, setVocales] = useState([])
  const [sede, setSede] = useState('')
  const [carrera, setCarrera] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState('total')
  const [abierto, setAbierto] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const [{ data: ll, error: eLl }, { data: ag, error: eAg }, { data: voc, error: eVoc }] = await Promise.all([
        supabase.from('examen_llamado').select('id, nombre, tipo').eq('id', llamadoId).single(),
        fetchTodo((desde, hasta) =>
          supabase
            .from('v_examen_agenda')
            .select('examen_fecha_id, fecha, fecha_estado, sede_id, sede, carrera_id, carrera, curso_nivel, seccion_grupo, materia, profesor_id, profesor, documento_identidad')
            .eq('llamado_id', llamadoId)
            .not('fecha', 'is', null)
            .order('catedra_id')
            .range(desde, hasta),
        ),
        fetchTodo((desde, hasta) =>
          supabase
            .from('mesa_integrante')
            .select('id, examen_fecha_id, profesor_id, profesores(nombres, apellidos, documento_identidad), examen_fecha!inner(llamado_id)')
            .eq('examen_fecha.llamado_id', llamadoId)
            .eq('rol_mesa', 'VOCAL')
            .order('id')
            .range(desde, hasta),
        ),
      ])
      const err = eLl || eAg || eVoc
      if (err) setError(err.message)
      setLlamado(ll)
      setMesas((ag || []).filter((m) => m.fecha_estado !== 'ANULADA'))
      setVocales(voc || [])
      setLoading(false)
    })()
  }, [llamadoId])

  const opciones = useMemo(() => {
    const lista = (clave, etiqueta) =>
      [...new Map(mesas.map((m) => [m[clave], m[etiqueta]])).entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label))
    return { sedes: lista('sede_id', 'sede'), carreras: lista('carrera_id', 'carrera') }
  }, [mesas])

  // Una fila por profesor, con todas sus participaciones (presidente o
  // examinador) en las mesas que pasan el filtro de sede/carrera.
  const profesores = useMemo(() => {
    const visibles = mesas.filter((m) => (!sede || m.sede_id === sede) && (!carrera || m.carrera_id === carrera))
    const mesaPorId = new Map(visibles.map((m) => [m.examen_fecha_id, m]))
    const porProf = new Map()
    const sumar = (id, nombre, cedula, mesa, rol) => {
      if (!porProf.has(id)) porProf.set(id, { id, nombre, cedula, participaciones: [] })
      porProf.get(id).participaciones.push({ ...mesa, rol })
    }
    for (const m of visibles) sumar(m.profesor_id, m.profesor, m.documento_identidad, m, 'Presidente')
    for (const v of vocales) {
      const m = mesaPorId.get(v.examen_fecha_id)
      if (!m) continue
      const p = v.profesores
      sumar(v.profesor_id, p ? `${p.apellidos}, ${p.nombres}` : '—', p?.documento_identidad, m, 'Examinador')
    }
    return [...porProf.values()].map((p) => {
      const porDia = new Map()
      for (const x of p.participaciones) porDia.set(x.fecha, (porDia.get(x.fecha) || 0) + 1)
      const [diaMax, maxDia] = [...porDia.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
      p.participaciones.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.materia.localeCompare(b.materia))
      return {
        ...p,
        presidencias: p.participaciones.filter((x) => x.rol === 'Presidente').length,
        examinaciones: p.participaciones.filter((x) => x.rol === 'Examinador').length,
        total: p.participaciones.length,
        dias: porDia.size,
        // Días que tiene que venir como examinador (vocal), aparte de los
        // que viene solo a presidir sus propias mesas.
        diasExaminador: new Set(p.participaciones.filter((x) => x.rol === 'Examinador').map((x) => x.fecha)).size,
        maxDia,
        diaMax,
      }
    })
  }, [mesas, vocales, sede, carrera])

  const lista = useMemo(() => {
    const filtrados = profesores.filter((p) => coincideTexto(busqueda, `${p.nombre} ${p.cedula || ''}`))
    return filtrados.sort((a, b) => ORDENES[orden].fn(a, b) || a.nombre.localeCompare(b.nombre))
  }, [profesores, busqueda, orden])

  const resumen = useMemo(() => {
    const totales = profesores.map((p) => p.total)
    const exam = profesores.map((p) => p.examinaciones)
    return {
      profesores: profesores.length,
      maxTotal: totales.length ? Math.max(...totales) : 0,
      promedioExam: exam.length ? Math.round((exam.reduce((s, n) => s + n, 0) / exam.length) * 10) / 10 : 0,
      maxDia: profesores.length ? Math.max(...profesores.map((p) => p.maxDia)) : 0,
    }
  }, [profesores])

  const exportar = () => {
    descargarFilas(
      `carga-profesores-${llamado?.nombre || 'llamado'}.csv`,
      lista.map((p) => ({
        profesor: p.nombre,
        cedula: p.cedula || '',
        presidencias: p.presidencias,
        examinaciones: p.examinaciones,
        total_mesas: p.total,
        dias_como_examinador: p.diasExaminador,
        dias_en_total: p.dias,
        max_en_un_dia: p.maxDia,
        dia_mas_cargado: p.diaMax,
      })),
    )
  }

  if (loading) return <p className="page-padding muted-text">Cargando...</p>

  return (
    <div className="page-padding">
      <div className="page-header">
        <div>
          <h1>Carga por profesor</h1>
          <p>
            {llamado?.nombre} — mesas que preside cada profesor (titular de la cátedra) y en las que es examinador.
            Tocá un profesor para ver el detalle.
          </p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to={`/examenes/${llamadoId}/vocales`} className="btn btn-secondary btn-sm">
            Asignar vocales
          </Link>
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportar} disabled={lista.length === 0}>
            Descargar CSV
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
            Imprimir
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-value">{resumen.profesores}</div>
          <div className="stat-label">Profesores con mesas</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{resumen.promedioExam}</div>
          <div className="stat-label">Examinaciones promedio</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{resumen.maxTotal}</div>
          <div className="stat-label">Máximo de mesas</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{resumen.maxDia}</div>
          <div className="stat-label">Máximo en un día</div>
        </div>
      </div>

      <div className="form-row no-print" style={{ marginBottom: 16, alignItems: 'flex-end' }}>
        <label>
          Sede
          <select value={sede} onChange={(e) => setSede(e.target.value)} style={{ display: 'block', minWidth: 180 }}>
            <option value="">Todas</option>
            {opciones.sedes.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Carrera
          <select value={carrera} onChange={(e) => setCarrera(e.target.value)} style={{ display: 'block', minWidth: 160 }}>
            <option value="">Todas</option>
            {opciones.carreras.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: '1 1 220px' }}>
          Buscar profesor
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o cédula..." />
        </label>
        <label>
          Ordenar por
          <select value={orden} onChange={(e) => setOrden(e.target.value)} style={{ display: 'block' }}>
            {Object.entries(ORDENES).map(([k, o]) => (
              <option key={k} value={k}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Profesor</th>
              <th style={{ width: 100 }}>Presidencias</th>
              <th style={{ width: 110 }}>Examinaciones</th>
              <th style={{ width: 80 }}>Total</th>
              <th style={{ width: 110 }}>Días como examinador</th>
              <th style={{ width: 80 }}>Días en total</th>
              <th style={{ width: 170 }}>Día más cargado</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={7} className="muted-text">
                  {mesas.length === 0 ? 'Este llamado todavía no tiene mesas con fecha.' : 'Ningún profesor coincide con el filtro.'}
                </td>
              </tr>
            )}
            {lista.map((p) => (
              <Fragment key={p.id}>
                <tr style={{ cursor: 'pointer' }} onClick={() => setAbierto(abierto === p.id ? null : p.id)}>
                  <td>
                    {abierto === p.id ? '▾' : '▸'} {p.nombre}
                    {p.cedula && <div className="muted-text" style={{ fontSize: 12 }}>C.I. {p.cedula}</div>}
                  </td>
                  <td>{p.presidencias}</td>
                  <td>{p.examinaciones}</td>
                  <td>
                    <strong>{p.total}</strong>
                  </td>
                  <td>{p.diasExaminador || '—'}</td>
                  <td>{p.dias}</td>
                  <td>
                    {p.maxDia} · {diaSemana(p.diaMax)} {formatoLargo(p.diaMax)}
                  </td>
                </tr>
                {abierto === p.id && (
                  <tr>
                    <td colSpan={7} style={{ background: 'var(--canvas)' }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th style={{ width: 150 }}>Fecha</th>
                            <th style={{ width: 100 }}>Rol</th>
                            <th>Sede</th>
                            <th>Carrera</th>
                            <th style={{ width: 80 }}>Curso</th>
                            <th>Materia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.participaciones.map((x, i) => (
                            <tr key={i}>
                              <td>
                                {diaSemana(x.fecha)} {formatoLargo(x.fecha)}
                              </td>
                              <td>
                                <span className={`badge ${x.rol === 'Presidente' ? 'badge-gold' : 'badge-muted'}`}>{x.rol}</span>
                              </td>
                              <td>{x.sede}</td>
                              <td>{x.carrera}</td>
                              <td>
                                {x.curso_nivel}º · {x.seccion_grupo}
                              </td>
                              <td>{x.materia}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
