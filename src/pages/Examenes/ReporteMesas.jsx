import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatoLargo } from '../../lib/fechas'
import { diaSemana } from '../../lib/vocalesExamen'
import { fetchTodo } from '../../lib/paginar'

const TIPOS = {
  ORDINARIO: 'Ordinario',
  COMPLEMENTARIO: 'Complementario',
  REGULARIZACION: 'Regularización',
}

const hora = (h) => (h ? h.slice(0, 5) : '—')

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

  // El filtro viaja por la URL para poder llegar ya aplicado desde
  // Asignación de Vocales ("Reporte para imprimir" ahí abajo manda el
  // mismo sede/carrera/curso que se tenía filtrado) — así se imprime
  // solo esa sede sin tener que recortar el PDF después.
  const [params, setParams] = useSearchParams()
  const sedeFiltro = params.get('sede') || ''
  const carreraFiltro = params.get('carrera') || ''
  const cursoFiltro = params.get('curso') || ''

  const setFiltro = (clave, valor) => {
    const next = new URLSearchParams(params)
    if (valor) next.set(clave, valor)
    else next.delete(clave)
    setParams(next, { replace: true })
  }

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

      // mesa_integrante puede superar las 1000 filas que PostgREST devuelve
      // por defecto — sin paginar, el reporte mostraría "sin asignar" en
      // vocales que en realidad sí están cargados.
      const { data: integrantes, error: eInt } = await fetchTodo((desde, hasta) =>
        supabase
          .from('mesa_integrante')
          .select('examen_fecha_id, rol_mesa, profesores(nombres, apellidos), examen_fecha!inner(llamado_id)')
          .eq('examen_fecha.llamado_id', llamadoId)
          .eq('rol_mesa', 'VOCAL')
          .order('id')
          .range(desde, hasta),
      )
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
          diaExamen: a.fecha ? diaSemana(a.fecha) : '',
        })),
      )
      setLoading(false)
    })()
  }, [llamadoId])

  const opciones = useMemo(() => {
    const unico = (clave, etiqueta) => {
      const mapa = new Map()
      for (const f of filas) if (f[clave]) mapa.set(f[clave], etiqueta(f))
      return [...mapa].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
    }
    return {
      sedes: unico('sede_id', (f) => f.sede),
      carreras: unico('carrera_id', (f) => f.carrera),
      cursos: [...new Set(filas.map((f) => f.curso_nivel))].sort((a, b) => a - b),
    }
  }, [filas])

  const filasFiltradas = useMemo(() => {
    return filas.filter((f) => {
      if (sedeFiltro && f.sede_id !== sedeFiltro) return false
      if (carreraFiltro && f.carrera_id !== carreraFiltro) return false
      if (cursoFiltro && String(f.curso_nivel) !== cursoFiltro) return false
      return true
    })
  }, [filas, sedeFiltro, carreraFiltro, cursoFiltro])

  // La publicación es por sede → carrera → período lectivo (así se arma
  // cada bloque/hoja), no por carrera primero.
  const bloques = useMemo(() => {
    const mapa = new Map()
    for (const f of filasFiltradas) {
      const clave = `${f.sede}||${f.carrera}||${f.periodo_lectivo}`
      if (!mapa.has(clave)) {
        mapa.set(clave, { sede: f.sede, carrera: f.carrera, periodo_lectivo: f.periodo_lectivo, filas: [] })
      }
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
    return [...mapa.values()].sort(
      (a, b) =>
        a.sede.localeCompare(b.sede) ||
        a.carrera.localeCompare(b.carrera) ||
        a.periodo_lectivo.localeCompare(b.periodo_lectivo),
    )
  }, [filasFiltradas])

  if (loading) return <p className="page-padding muted-text">Cargando...</p>
  if (error) return <p className="page-padding error-text">{error}</p>
  if (filas.length === 0) {
    return <p className="page-padding muted-text">Este llamado no tiene mesas con fecha asignada.</p>
  }

  const enc = filas[0]
  const hayFiltro = sedeFiltro || carreraFiltro || cursoFiltro

  return (
    <div className="page-padding foja-desempeno rm-page">
      {/* Este reporte se imprime aparte (ruta propia), así que el @page de
          acá abajo no afecta a Foja de Desempeño ni a Reporte de Carga,
          que comparten .foja-card pero no esta hoja. */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0.8cm; }
          .rm-card { max-width: none !important; }
          .rm-tabla th, .rm-tabla td { padding: 3px 4px !important; font-size: 8.5px !important; }
          .rm-tabla th { font-size: 8px !important; }
          /* cada sede/carrera arranca en hoja aparte — así no quedan
             pegadas entre sí y se puede imprimir una sola sede sin tener
             que recortar nada. La primera no lleva salto, para no dejar
             una hoja en blanco adelante. */
          .rm-card + .rm-card { break-before: page; page-break-before: always; }
          .rm-tabla-wrap { overflow: visible !important; }
        }
        /* En pantalla esta tabla tiene más columnas que el resto de los
           reportes (incluye los dos examinadores): el ancho angosto
           estándar (.page-padding, 1100px) la obligaba a scrollear casi
           siempre. Se ensancha solo esta pantalla, no afecta a Foja de
           Desempeño ni a Reporte de Carga que comparten .page-padding. */
        .rm-page { max-width: 1450px; }
        .rm-card { max-width: 1400px; }
        /* en pantalla (no al imprimir) la tabla es más ancha que la
           tarjeta — nombres largos de presidente/examinadores en una sola
           línea — así que entra en scroll horizontal acá en vez de
           salirse del borde sin forma de leerla. */
        .rm-tabla-wrap { overflow-x: auto; }
        .rm-titulo { margin: 0; line-height: 1.25; }
        .rm-titulo .uni { font-size: 1.05em; }
        .rm-titulo .fac { font-size: 1.05em; }
      `}</style>

      <div className="form-row no-print" style={{ marginBottom: '1rem', alignItems: 'flex-end' }}>
        <label>
          Sede
          <select value={sedeFiltro} onChange={(e) => setFiltro('sede', e.target.value)} style={{ display: 'block', minWidth: 200 }}>
            <option value="">Todas las sedes</option>
            {opciones.sedes.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Carrera
          <select value={carreraFiltro} onChange={(e) => setFiltro('carrera', e.target.value)} style={{ display: 'block', minWidth: 180 }}>
            <option value="">Todas las carreras</option>
            {opciones.carreras.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Curso
          <select value={cursoFiltro} onChange={(e) => setFiltro('curso', e.target.value)} style={{ display: 'block', minWidth: 120 }}>
            <option value="">Todos los cursos</option>
            {opciones.cursos.map((c) => (
              <option key={c} value={String(c)}>
                {c}º
              </option>
            ))}
          </select>
        </label>
        {hayFiltro && (
          <button type="button" className="chip" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            Quitar filtros
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>

      {hayFiltro && bloques.length === 0 && (
        <p className="no-print muted-text">Ninguna mesa coincide con el filtro elegido.</p>
      )}

      {bloques.map((b) => (
        <div className="foja-card rm-card" key={`${b.sede}-${b.carrera}-${b.periodo_lectivo}`} style={{ marginBottom: 24 }}>
          <div className="foja-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <img src="/escudo-une.png" alt="Escudo UNE" className="foja-escudo" />
            <div>
              <p className="rm-titulo uni" style={{ fontWeight: 700 }}>
                Universidad Nacional del Este
              </p>
              <h2 className="rm-titulo fac" style={{ margin: 0, fontWeight: 700 }}>
                Facultad de Ciencias Económicas
              </h2>
              <p className="muted-text" style={{ margin: '4px 0 0' }}>
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
            {enc.llamado}
          </p>

          <table className="foja-datos">
            <tbody>
              <tr>
                <td>
                  <strong>Sede:</strong> {b.sede}
                </td>
                <td>
                  <strong>Carrera:</strong> {b.carrera}
                </td>
                <td>
                  <strong>Período Lectivo:</strong> {b.periodo_lectivo}
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Total de mesas:</strong> {b.filas.length}
                </td>
                <td colSpan={2}>
                  <strong>Emitido:</strong> {hoy()}
                </td>
              </tr>
              <tr className="no-print">
                <td colSpan={3}>
                  <strong>Responsable:</strong> {perfil?.nombre_completo || '—'}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="rm-tabla-wrap">
            <table className="data-table foja-tabla rm-tabla">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>N°</th>
                  <th style={{ width: 75 }}>DÍA</th>
                  <th style={{ width: 75 }}>FECHA</th>
                  <th style={{ width: 45 }}>Curso</th>
                  <th style={{ width: 40 }}>Secc.</th>
                  <th style={{ width: 45 }}>hora</th>
                  <th>MATERIA</th>
                  <th style={{ whiteSpace: 'nowrap' }}>PRESIDENTE</th>
                  <th style={{ whiteSpace: 'nowrap' }}>EXAMINADOR N° 1</th>
                  <th style={{ whiteSpace: 'nowrap' }}>EXAMINADOR N° 2</th>
                </tr>
              </thead>
              <tbody>
                {b.filas.map((f, i) => (
                  <tr key={f.catedra_id}>
                    <td>{i + 1}</td>
                    <td>{f.diaExamen}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatoLargo(f.fecha)}</td>
                    <td>{f.curso_nivel}º</td>
                    <td>{f.seccion_grupo}</td>
                    <td>{hora(f.hora_inicio)}</td>
                    <td>
                      {f.materia}
                      {f.optativa ? ' (Opt.)' : ''}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{f.profesor}</td>
                    <td className={f.vocal1 ? '' : 'error-text'} style={{ whiteSpace: 'nowrap' }}>
                      {f.vocal1 || '— sin asignar —'}
                    </td>
                    <td className={f.vocal2 ? '' : 'error-text'} style={{ whiteSpace: 'nowrap' }}>
                      {f.vocal2 || '— sin asignar —'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
