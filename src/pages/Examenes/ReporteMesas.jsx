import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

// Se imprimen dos copias: una va a cada carrera para su aprobación y la
// otra, firmada solo por el Decanato, se publica (pedido de Secretaría
// General).
const COPIAS = {
  carrera: { label: 'Copia para la carrera (aprobación)', firmas: ['Secretaría de Carrera', 'Coordinación de Carrera'] },
  publicacion: { label: 'Copia para publicación', firmas: ['Decanato'] },
}

// Alto útil de una hoja A4 apaisada con margen de 0.8cm (21cm - 1.6cm a
// 96 px por pulgada), con un resto de seguridad por redondeos del navegador.
const ALTO_HOJA = Math.floor((19.4 / 2.54) * 96) - 18
// Ancho útil de la misma hoja: la tabla se mide con este ancho para que
// las materias largas envuelvan igual que en el papel.
const ANCHO_HOJA = Math.floor((28.1 / 2.54) * 96)

// Reparte las filas de un bloque en hojas a partir de las alturas medidas.
// La numeración "Hoja n de X" es por sede y carrera, por eso se pagina acá
// y no con los contadores de página del navegador (que son de todo el
// documento). Las firmas nunca quedan solas en una hoja: si no entran, la
// última fila pasa con ellas.
function paginar(m) {
  const hojas = [[]]
  let libre = ALTO_HOJA - m.primera - m.thead
  m.filas.forEach((h, i) => {
    if (h > libre && hojas[hojas.length - 1].length) {
      hojas.push([])
      libre = ALTO_HOJA - m.continuacion - m.thead
    }
    hojas[hojas.length - 1].push(i)
    libre -= h
  })
  if (libre < m.firmas) {
    const ultima = hojas[hojas.length - 1]
    hojas.push(ultima.length > 1 ? [ultima.pop()] : [])
  }
  return hojas
}

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
  // El horario también se publica antes de oficializar las actas: sin el
  // número, la primera columna vuelve a ser el orden 1, 2, 3...
  const [mostrarActas, setMostrarActas] = useState(true)
  const [copia, setCopia] = useState('carrera')

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

      // Número de acta (Numeración de actas). Si el llamado todavía no se
      // numeró, la columna N° sigue siendo el orden dentro de la hoja.
      const { data: actas, error: eActas } = await fetchTodo((desde, hasta) =>
        supabase
          .from('examen_acta')
          .select('examen_fecha_id, numero')
          .eq('llamado_id', llamadoId)
          .order('examen_fecha_id')
          .range(desde, hasta),
      )
      if (eActas) {
        setError(eActas.message)
        setLoading(false)
        return
      }
      const actaPorFecha = new Map((actas || []).map((a) => [a.examen_fecha_id, a.numero]))

      setFilas(
        (agenda || []).map((a) => ({
          ...a,
          vocal1: vocalesPorFecha.get(a.examen_fecha_id)?.[0] || '',
          vocal2: vocalesPorFecha.get(a.examen_fecha_id)?.[1] || '',
          numeroActa: actaPorFecha.get(a.examen_fecha_id) ?? null,
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
          (a.numeroActa ?? Infinity) - (c.numeroActa ?? Infinity) ||
          a.curso_nivel - c.curso_nivel ||
          a.seccion_grupo.localeCompare(c.seccion_grupo, 'es', { sensitivity: 'base' }) ||
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

  // Alturas medidas de cada bloque (ver Medidor): con ellas se arman las hojas
  const [medidas, setMedidas] = useState({})
  const hojasPorBloque = useMemo(() => {
    const r = {}
    for (const b of bloques) {
      const m = medidas[claveBloque(b)]
      r[claveBloque(b)] = m && m.filas.length === b.filas.length ? paginar(m) : [b.filas.map((_, i) => i)]
    }
    return r
  }, [bloques, medidas])

  const enc = filas[0]
  const tieneActas = filas.some((f) => f.numeroActa != null)
  const hayActas = tieneActas && mostrarActas
  const firmas = COPIAS[copia].firmas

  if (loading) return <p className="page-padding muted-text">Cargando...</p>
  if (error) return <p className="page-padding error-text">{error}</p>
  if (filas.length === 0) {
    return <p className="page-padding muted-text">Este llamado no tiene mesas con fecha asignada.</p>
  }

  const hayFiltro = sedeFiltro || carreraFiltro || cursoFiltro
  const comun = { enc, hayActas, firmas, responsable: perfil?.nombre_completo }

  return (
    <div className="page-padding foja-desempeno rm-page">
      {/* Este reporte se imprime aparte (ruta propia), así que el @page de
          acá abajo no afecta a Foja de Desempeño ni a Reporte de Carga,
          que comparten .foja-card pero no esta hoja. */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0.8cm; }
          .rm-card { max-width: none !important; margin: 0 !important; }
          /* cada hoja va en su propia página: la paginación ya está hecha
             (ver paginar). La primera no lleva salto, para no dejar una
             hoja en blanco adelante. */
          .rm-card + .rm-card { break-before: page; page-break-before: always; }
          .rm-tabla-wrap { overflow: visible !important; }
        }
        /* En pantalla esta tabla tiene más columnas que el resto de los
           reportes (incluye los dos examinadores): se ensancha solo esta
           pantalla, no afecta a Foja de Desempeño ni a Reporte de Carga
           que comparten .page-padding. */
        .rm-page { max-width: 1450px; }
        .rm-card { max-width: 1400px; }
        .rm-tabla-wrap { overflow-x: auto; }
        .rm-titulo { margin: 0; line-height: 1.25; }
        .rm-titulo.uni, .rm-titulo.fac { font-size: 1.05em; }
        /* Medidas de impresión también en pantalla: así lo que se mide en
           Medidor es lo mismo que sale en el papel. Repiten los valores
           del print de index.css (los que llevan !important allá ganan
           igual al imprimir). */
        .rm-hoja .foja-escudo { width: 70px; height: 70px; }
        .rm-hoja .foja-header { padding-bottom: 10px; }
        .rm-hoja h2 { font-size: 18px; margin: 2px 0; }
        .rm-hoja h3 { font-size: 14px; margin: 10px 0 3px; text-align: center; }
        .rm-hoja .rm-sub { margin: 0 0 10px; font-size: 12px; text-align: center; }
        .rm-hoja .muted-text { font-size: 11px; line-height: 1.3; }
        .rm-hoja .foja-datos { font-size: 12px; margin-bottom: 10px; }
        .rm-hoja .foja-datos td { padding: 4px 8px; }
        .rm-hoja .rm-tabla { margin-top: 10px; }
        .rm-hoja .rm-tabla th, .rm-hoja .rm-tabla td { padding: 3px 4px !important; font-size: 8.5px !important; line-height: 1.3; }
        .rm-hoja .rm-tabla th { font-size: 8px !important; }
        .rm-hoja .rm-firmas { margin-top: 40px; margin-bottom: 0; }
        .rm-hoja .rm-firmas td { border-top: 1px solid #000; padding-top: 6px; text-align: center; }
        .rm-hoja .rm-firmas td.rm-hueco { border-top: none; }
        .rm-cont { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: baseline; font-size: 11px; border-bottom: 2px solid var(--gold); padding-bottom: 6px; }
        .rm-cont .rm-hoja-num { margin-left: auto; font-weight: 600; }
        .rm-medidor { position: absolute; left: -99999px; top: 0; width: ${ANCHO_HOJA}px; visibility: hidden; }
        .rm-medidor .foja-card { padding: 0; border: none; box-shadow: none; max-width: none; margin: 0; }
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
        <label>
          Firmas
          <select value={copia} onChange={(e) => setCopia(e.target.value)} style={{ display: 'block', minWidth: 220 }}>
            {Object.entries(COPIAS).map(([k, c]) => (
              <option key={k} value={k}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {tieneActas && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={mostrarActas} onChange={(e) => setMostrarActas(e.target.checked)} />
            Mostrar N° de acta
          </label>
        )}
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>

      {hayFiltro && bloques.length === 0 && (
        <p className="no-print muted-text">Ninguna mesa coincide con el filtro elegido.</p>
      )}

      {bloques.map((b) => {
        const hojas = hojasPorBloque[claveBloque(b)]
        return hojas.map((indices, n) => (
          <Hoja key={`${claveBloque(b)}-${n}`} {...comun} b={b} indices={indices} numero={n + 1} total={hojas.length} />
        ))
      })}

      <Medidor bloques={bloques} enc={enc} hayActas={hayActas} firmas={firmas} onMedir={setMedidas} />
    </div>
  )
}

const claveBloque = (b) => `${b.sede}||${b.carrera}||${b.periodo_lectivo}`

// Encabezado completo de la primera hoja de cada sede-carrera
function EncabezadoPrincipal({ enc, b, numero, total, responsable }) {
  return (
    <>
      <div className="foja-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <img src="/escudo-une.png" alt="Escudo UNE" className="foja-escudo" />
        <div>
          <p className="rm-titulo uni" style={{ fontWeight: 700 }}>
            Universidad Nacional del Este
          </p>
          <h2 className="rm-titulo fac" style={{ fontWeight: 700 }}>
            Facultad de Ciencias Económicas
          </h2>
          <p className="muted-text rm-titulo">Dirección Académica</p>
          <p className="muted-text rm-titulo">
            Avda. Universidad Nacional del Este y Avda. Paraguay - Km 8 Acaray - Campus Universitario - Ciudad del Este -
            Paraguay
          </p>
        </div>
      </div>

      <h3>Mesas Examinadoras — Llamado {TIPOS[enc.llamado_tipo] || enc.llamado_tipo}</h3>
      <p className="muted-text rm-sub">{enc.llamado}</p>

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
            <td>
              <strong>Emitido:</strong> {hoy()}
            </td>
            <td>
              <strong>
                Hoja {numero} de {total}
              </strong>
            </td>
          </tr>
          <tr className="no-print">
            <td colSpan={3}>
              <strong>Responsable:</strong> {responsable || '—'}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  )
}

// Descripción breve de las hojas siguientes (pedido de Secretaría
// General): cada hoja suelta dice de qué período, sede, carrera y llamado es
function EncabezadoContinuacion({ enc, b, numero, total }) {
  return (
    <div className="rm-cont">
      <strong>Mesas Examinadoras — Llamado {TIPOS[enc.llamado_tipo] || enc.llamado_tipo}</strong>
      <span>{enc.llamado}</span>
      <span>
        <strong>Período Lectivo:</strong> {b.periodo_lectivo}
      </span>
      <span>
        <strong>Sede:</strong> {b.sede}
      </span>
      <span>
        <strong>Carrera:</strong> {b.carrera}
      </span>
      <span className="rm-hoja-num">
        Hoja {numero} de {total}
      </span>
    </div>
  )
}

function TablaMesas({ b, indices, hayActas }) {
  return (
    <div className="rm-tabla-wrap">
      <table className="data-table foja-tabla rm-tabla">
        <thead>
          <tr>
            <th style={{ width: hayActas ? 48 : 28 }}>{hayActas ? 'N° Acta' : 'N°'}</th>
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
          {indices.map((i) => {
            const f = b.filas[i]
            return (
              <tr key={f.catedra_id}>
                <td>{hayActas ? (f.numeroActa ?? <span className="error-text">—</span>) : i + 1}</td>
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
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Firmas({ firmas }) {
  return (
    <table className="foja-datos rm-firmas">
      <tbody>
        <tr>
          {firmas.length === 1 ? (
            <>
              <td className="rm-hueco" style={{ width: '33%' }} />
              <td>{firmas[0]}</td>
              <td className="rm-hueco" style={{ width: '33%' }} />
            </>
          ) : (
            firmas.map((x, i) => (
              <Fragment key={x}>
                {i > 0 && <td className="rm-hueco" style={{ width: 60 }} />}
                <td>{x}</td>
              </Fragment>
            ))
          )}
        </tr>
      </tbody>
    </table>
  )
}

function Hoja({ b, indices, numero, total, enc, hayActas, firmas, responsable }) {
  return (
    <div className="foja-card rm-card rm-hoja" style={{ marginBottom: 24 }}>
      {numero === 1 ? (
        <EncabezadoPrincipal enc={enc} b={b} numero={numero} total={total} responsable={responsable} />
      ) : (
        <EncabezadoContinuacion enc={enc} b={b} numero={numero} total={total} />
      )}
      {indices.length > 0 && <TablaMesas b={b} indices={indices} hayActas={hayActas} />}
      {numero === total && <Firmas firmas={firmas} />}
    </div>
  )
}

// Dibuja cada bloque fuera de la vista, con el ancho del papel, y mide el
// alto de los encabezados, de cada fila y de las firmas para paginar.
function Medidor({ bloques, enc, hayActas, firmas, onMedir }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    let vivo = true
    const medir = () => {
      if (!vivo || !ref.current) return
      const top = (x) => x.getBoundingClientRect().top
      const bottom = (x) => x.getBoundingClientRect().bottom
      const alto = (x) => x.getBoundingClientRect().height
      const r = {}
      for (const el of ref.current.querySelectorAll('[data-bloque]')) {
        const [prim, cont] = el.children
        const tabla = prim.querySelector('table.rm-tabla')
        const tablaCont = cont.querySelector('table.rm-tabla')
        r[el.dataset.bloque] = {
          primera: top(tabla) - top(prim),
          continuacion: top(tablaCont) - top(cont),
          thead: alto(tabla.tHead),
          filas: [...tabla.tBodies[0].rows].map(alto),
          // incluye el margen de arriba de las firmas
          firmas: bottom(prim.querySelector('.rm-firmas')) - bottom(tabla),
        }
      }
      onMedir(r)
    }
    // Con la letra todavía cargando las filas miden distinto
    document.fonts.ready.then(medir)
    return () => {
      vivo = false
    }
  }, [bloques, enc, hayActas, firmas, onMedir])

  if (!enc) return null
  return (
    <div ref={ref} className="rm-medidor no-print" aria-hidden="true">
      {bloques.map((b) => (
        <div key={claveBloque(b)} data-bloque={claveBloque(b)}>
          <Hoja enc={enc} hayActas={hayActas} firmas={firmas} b={b} indices={b.filas.map((_, i) => i)} numero={1} total={1} />
          <div className="foja-card rm-hoja">
            <EncabezadoContinuacion enc={enc} b={b} numero={2} total={2} />
            <TablaMesas b={b} indices={[]} hayActas={hayActas} />
          </div>
        </div>
      ))}
    </div>
  )
}
