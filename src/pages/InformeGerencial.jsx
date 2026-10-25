import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fetchTodo } from '../lib/paginar'
import { aISO, formatoCorto, formatoLargo } from '../lib/fechas'
import { descargarFilas } from '../lib/csv'
import { clasificar } from '../lib/foja'
import { estadoDe, pct, resumirAsistencia, resumirCatedras, resumirMesas, resumirRendimiento } from '../lib/informeGerencial'

const ESTADOS = {
  bien: { icono: '✓', texto: 'Bien' },
  atencion: { icono: '!', texto: 'Atención' },
  critico: { icono: '✕', texto: 'Crítico' },
}

const fmt = (n, dec = 0) =>
  n == null ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtPct = (n) => (n == null ? '—' : `${fmt(n, n >= 99.95 || n === 0 ? 0 : 1)}%`)

// En las tablas (sinBien) solo se marca lo que pide atención: así resalta.
function Estado({ valor, conTexto, sinBien }) {
  const e = estadoDe(valor)
  if (!e || (sinBien && e === 'bien')) return null
  return (
    <span className={`ig-estado ig-estado-${e}`} title={ESTADOS[e].texto}>
      <span className="ig-estado-icono" aria-hidden="true">
        {ESTADOS[e].icono}
      </span>
      {conTexto ? ESTADOS[e].texto : <span className="sr-only">{ESTADOS[e].texto}</span>}
    </span>
  )
}

// Barra de avance de un porcentaje: el relleno en el verde institucional
// sobre un riel del mismo verde más claro; el valor va siempre escrito.
function Medidor({ valor, detalle }) {
  return (
    <div className="ig-medidor" title={detalle}>
      <div className="ig-medidor-riel">
        {valor != null && <span style={{ width: `${Math.min(100, Math.max(0, valor))}%` }} />}
      </div>
      <span className="ig-medidor-valor">{fmtPct(valor)}</span>
      <Estado valor={valor} sinBien />
    </div>
  )
}

function Indicador({ titulo, valor, esPct = true, detalle }) {
  return (
    <div className="ig-indicador">
      <span className="ig-indicador-titulo">{titulo}</span>
      <span className="ig-indicador-valor">{esPct ? fmtPct(valor) : fmt(valor)}</span>
      <span className="ig-indicador-detalle">
        {esPct && <Estado valor={valor} conTexto />} {detalle}
      </span>
    </div>
  )
}

// Barras horizontales de una sola serie (sin leyenda: el título dice qué es)
function Barras({ filas, max = 100 }) {
  return (
    <div className="ig-barras">
      {filas.map((f) => (
        <div key={f.nombre} className="ig-barra" title={`${f.nombre}: ${fmtPct(f.valor)}${f.detalle ? ` (${f.detalle})` : ''}`}>
          <span className="ig-barra-nombre">{f.nombre}</span>
          <span className="ig-barra-riel">
            <span style={{ width: `${Math.min(100, (100 * (f.valor || 0)) / max)}%` }} />
          </span>
          <span className="ig-barra-valor">{fmtPct(f.valor)}</span>
        </div>
      ))}
    </div>
  )
}

const ayer = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return aISO(d)
}

export function InformeGerencial() {
  const { rol, alcance } = useAuth()
  const [periodos, setPeriodos] = useState([])
  const [periodoId, setPeriodoId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [carrera, setCarrera] = useState('')
  const [sede, setSede] = useState('')
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState('')
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState('asc')
  const [verTodos, setVerTodos] = useState(false)

  // la asistencia se mide hasta ayer: hoy todavía se está cargando
  const elegir = (p) => {
    setPeriodoId(p.id)
    setDesde(p.fecha_inicio)
    setHasta([p.fecha_fin, ayer()].sort()[0])
  }

  useEffect(() => {
    supabase
      .from('periodo_academico')
      .select('*')
      .order('fecha_inicio', { ascending: false })
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        const lista = data || []
        setPeriodos(lista)
        const elegido = lista.find((p) => p.activo) || lista[0]
        if (elegido) elegir(elegido)
      })
  }, [])

  const periodo = periodos.find((p) => p.id === periodoId) || null
  const etiqueta = periodo?.etiqueta_periodo_lectivo

  useEffect(() => {
    if (!etiqueta || !desde || !hasta) return
    let activo = true
    ;(async () => {
      setError('')
      setCargando('Leyendo cátedras y asistencia...')
      const hoy = aISO(new Date())
      const [catedras, asistencia, llamados, foja] = await Promise.all([
        fetchTodo((d, h) =>
          supabase
            .from('catedras')
            .select('id, profesor_id, sedes(nombre), asignaturas(carreras(nombre))')
            .eq('periodo_lectivo', etiqueta)
            .eq('activo', true)
            .order('id')
            .range(d, h),
        ),
        desde <= hasta
          ? // ya sumado por carrera y sede en la base (migracion_informe_asistencia_rapido.sql):
            // reporte_asistencia_clases() para un período entero supera el tiempo límite
            supabase.rpc('informe_asistencia_carrera_sede', { p_desde: desde, p_hasta: hasta })
          : Promise.resolve({ data: [] }),
        supabase.from('examen_llamado').select('*').eq('periodo_lectivo', etiqueta).order('fecha_inicio'),
        fetchTodo((d, h) =>
          supabase.rpc('v_evaluacion_docente_ver', { p_periodo_lectivo: etiqueta }).order('catedra_id').order('criterio_id').range(d, h),
        ),
      ])
      if (!activo) return
      setCargando('Leyendo mesas examinadoras...')
      const ids = (llamados.data || []).map((l) => l.id)
      const [agenda, integrantes] = ids.length
        ? await Promise.all([
            fetchTodo((d, h) =>
              supabase
                .from('v_examen_agenda')
                .select('examen_fecha_id, llamado_id, profesor_id, carrera, sede, fecha, fecha_estado')
                .in('llamado_id', ids)
                .not('fecha', 'is', null)
                .order('examen_fecha_id')
                .range(d, h),
            ),
            fetchTodo((d, h) =>
              supabase
                .from('mesa_integrante')
                .select('id, examen_fecha_id, profesor_id, rol_mesa, asistio, examen_fecha!inner(llamado_id)')
                .in('examen_fecha.llamado_id', ids)
                .order('id')
                .range(d, h),
            ),
          ])
        : [{ data: [] }, { data: [] }]
      if (!activo) return

      // cada fuente por separado: si una falla, el resto del informe se ve igual
      const errores = [
        ['Cátedras', catedras.error],
        ['Asistencia a clases', asistencia.error],
        ['Llamados', llamados.error],
        ['Foja de desempeño', foja.error],
        ['Mesas examinadoras', agenda.error || integrantes.error],
      ]
        .filter(([, e]) => e)
        .map(([fuente, e]) => `${fuente}: ${e.message}`)
      setError(errores.join(' · '))
      setDatos({
        hoy,
        catedras: catedras.data || [],
        asistencia: asistencia.data || [],
        llamados: llamados.data || [],
        agenda: agenda.data || [],
        integrantes: integrantes.data || [],
        foja: foja.data || [],
      })
      setCargando('')
    })()
    return () => {
      activo = false
    }
  }, [etiqueta, desde, hasta])

  // Opciones de carrera y sede: las que aparecen en las cátedras del período
  const opciones = useMemo(() => {
    const carreras = new Set()
    const sedes = new Set()
    for (const c of datos?.catedras || []) {
      carreras.add(c.asignaturas?.carreras?.nombre)
      sedes.add(c.sedes?.nombre)
    }
    const ordenar = (s) => [...s].filter(Boolean).sort((a, b) => a.localeCompare(b))
    return { carreras: ordenar(carreras), sedes: ordenar(sedes) }
  }, [datos])

  const informe = useMemo(() => {
    if (!datos) return null
    const pasa = (car, sed) => (!carrera || car === carrera) && (!sede || sed === sede)
    const catedras = datos.catedras.filter((c) => pasa(c.asignaturas?.carreras?.nombre, c.sedes?.nombre))
    const activas = new Set(catedras.map((c) => c.id))
    return {
      catedras: resumirCatedras(catedras),
      asistencia: resumirAsistencia(datos.asistencia.filter((r) => pasa(r.carrera, r.sede))),
      mesas: resumirMesas(
        datos.agenda.filter((m) => pasa(m.carrera, m.sede)),
        datos.integrantes,
        datos.llamados,
        datos.hoy,
      ),
      rendimiento: resumirRendimiento(datos.foja, activas),
    }
  }, [datos, carrera, sede])

  // una fila por carrera y sede con todo lo que aparece en alguna fuente
  const matriz = useMemo(() => {
    if (!informe) return []
    const claves = new Set([
      ...informe.catedras.porClave.keys(),
      ...informe.asistencia.porClave.keys(),
      ...informe.mesas.porClave.keys(),
      ...informe.rendimiento.porClave.keys(),
    ])
    return [...claves]
      .map((k) => {
        const [car, sed] = k.split('|')
        const c = informe.catedras.porClave.get(k)
        const a = informe.asistencia.porClave.get(k)
        const m = informe.mesas.porClave.get(k)
        const r = informe.rendimiento.porClave.get(k)
        return {
          clave: k,
          carrera: car,
          sede: sed,
          profesores: c?.profesores?.size ?? 0,
          catedras: c?.catedras ?? 0,
          asistencia: a?.asistencia ?? null,
          carga: a?.carga ?? null,
          asistenciaDetalle: a ? `${fmt(a.registradas)} de ${fmt(a.esperadas)} clases registradas` : '',
          mesas: m?.asistencia ?? null,
          mesasDetalle: m ? `${fmt(m.asistieron)} de ${fmt(m.registrados)} con asistencia registrada, en ${fmt(m.tomadas)} mesas tomadas` : '',
          rendimiento: r?.promedio ?? null,
        }
      })
      .filter((f) => (!carrera || f.carrera === carrera) && (!sede || f.sede === sede))
      .sort((a, b) => a.carrera.localeCompare(b.carrera) || a.sede.localeCompare(b.sede))
  }, [informe, carrera, sede])

  const profesores = useMemo(() => {
    if (!informe) return []
    const q = busqueda
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
    return [...informe.rendimiento.porProfesor.values()]
      .filter((p) => !q || p.profesor.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q))
      .sort((a, b) => (orden === 'asc' ? a.promedio - b.promedio : b.promedio - a.promedio) || a.profesor.localeCompare(b.profesor))
  }, [informe, busqueda, orden])

  const exportarMatriz = () =>
    descargarFilas(
      `informe-gerencial-${etiqueta}.csv`,
      matriz.map((f) => ({
        carrera: f.carrera,
        sede: f.sede,
        profesores: f.profesores,
        catedras: f.catedras,
        asistencia_clases_pct: f.asistencia?.toFixed(1) ?? '',
        carga_asistencia_pct: f.carga?.toFixed(1) ?? '',
        asistencia_mesas_pct: f.mesas?.toFixed(1) ?? '',
        rendimiento_institucional_pct: f.rendimiento?.toFixed(1) ?? '',
      })),
    )

  const exportarProfesores = () =>
    descargarFilas(
      `rendimiento-profesores-${etiqueta}.csv`,
      profesores.map((p) => ({
        profesor: p.profesor,
        carreras: [...p.carreras].join(' / '),
        sedes: [...p.sedes].join(' / '),
        catedras: p.catedras,
        rendimiento_institucional_pct: p.promedio.toFixed(1),
        escala: clasificar(p.promedio),
      })),
    )

  const t = informe
  const totalEscala = t ? t.rendimiento.escala.reduce((s, e) => s + e.catedras, 0) : 0
  const alcanceTexto =
    rol === 'DIRECTOR' && alcance.length
      ? alcance.map((a) => `${a.carreras?.nombre ?? ''}${a.sedes?.nombre ? `, ${a.sedes.nombre}` : ''}`).join('; ')
      : null

  return (
    <div className="page-padding ig">
      <div className="page-header">
        <div>
          <h1>Informe gerencial</h1>
          <p>
            Estado de situación {alcanceTexto ? `de ${alcanceTexto}` : 'de la Facultad'}
            {etiqueta ? `, período ${etiqueta}` : ''}. Emitido el {formatoLargo(aISO(new Date()))}.
          </p>
        </div>
        <button type="button" className="btn btn-secondary no-print" onClick={() => window.print()} disabled={!t}>
          Imprimir
        </button>
      </div>

      <div className="ig-filtros no-print">
        <label>
          Período
          <select
            value={periodoId}
            onChange={(e) => {
              const p = periodos.find((x) => x.id === e.target.value)
              if (p) elegir(p)
            }}
          >
            {periodos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} {p.anio}
              </option>
            ))}
          </select>
        </label>
        <label>
          Asistencia desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label>
          hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        {opciones.carreras.length > 1 && (
          <label>
            Carrera
            <select value={carrera} onChange={(e) => setCarrera(e.target.value)}>
              <option value="">Todas</option>
              {opciones.carreras.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
        {opciones.sedes.length > 1 && (
          <label>
            Sede
            <select value={sede} onChange={(e) => setSede(e.target.value)}>
              <option value="">Todas</option>
              {opciones.sedes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}
      {cargando && <p className="muted-text">{cargando} Puede tardar unos segundos.</p>}

      {t && (
        <div className={cargando ? 'ig-actualizando' : ''}>
          <section className="ig-indicadores" aria-label="Indicadores principales">
            <Indicador
              titulo="Profesores activos con materias"
              valor={t.catedras.profesores}
              esPct={false}
              detalle={`en ${fmt(t.catedras.catedras)} cátedras activas`}
            />
            <Indicador
              titulo="Asistencia a clases"
              valor={t.asistencia.total.asistencia}
              detalle={`presentes sobre lo registrado, del ${formatoCorto(desde)} al ${formatoCorto(hasta)}`}
            />
            <Indicador
              titulo="Carga de asistencia"
              valor={t.asistencia.total.carga}
              detalle={`${fmt(t.asistencia.total.registradas)} de ${fmt(t.asistencia.total.esperadas)} clases registradas`}
            />
            <Indicador
              titulo="Asistencia a mesas examinadoras"
              valor={t.mesas.total.asistencia}
              detalle={
                t.mesas.total.tomadas
                  ? `en ${fmt(t.mesas.total.tomadas)} mesas ya tomadas del período`
                  : 'todavía no se tomaron mesas en el período'
              }
            />
            <Indicador
              titulo="Rendimiento institucional (foja)"
              valor={t.rendimiento.promedio}
              detalle={`criterios institucionales, en ${fmt(t.rendimiento.catedras)} cátedras`}
            />
          </section>

          <section className="ig-seccion" aria-labelledby="ig-matriz">
            <div className="ig-seccion-cabecera">
              <h2 id="ig-matriz">Estado por carrera y sede</h2>
              <button type="button" className="btn btn-secondary btn-sm no-print" onClick={exportarMatriz} disabled={!matriz.length}>
                Descargar CSV
              </button>
            </div>
            <p className="ig-nota">
              <Estado valor={70} conTexto /> 60 a 79 % <Estado valor={10} conTexto /> menos de 60 %. Sin marca: 80 %
              o más. La asistencia a clases se mide sobre lo registrado; la carga
              muestra cuánto de lo esperado por horario se registró.
            </p>
            {matriz.length === 0 ? (
              <p className="muted-text">No hay datos para el período y los filtros elegidos.</p>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table ig-tabla">
                  <thead>
                    <tr>
                      <th>Carrera</th>
                      <th>Sede</th>
                      <th className="ig-num">Profesores</th>
                      <th className="ig-num">Cátedras</th>
                      <th>Asistencia a clases</th>
                      <th>Carga de asistencia</th>
                      <th>Asistencia a mesas</th>
                      <th>Rendimiento institucional</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matriz.map((f) => (
                      <tr key={f.clave}>
                        <td>{f.carrera}</td>
                        <td>{f.sede}</td>
                        <td className="ig-num">{fmt(f.profesores)}</td>
                        <td className="ig-num">{fmt(f.catedras)}</td>
                        <td>
                          <Medidor valor={f.asistencia} detalle={f.asistenciaDetalle} />
                        </td>
                        <td>
                          <Medidor valor={f.carga} detalle={f.asistenciaDetalle} />
                        </td>
                        <td>
                          <Medidor valor={f.mesas} detalle={f.mesasDetalle} />
                        </td>
                        <td>
                          <Medidor valor={f.rendimiento} detalle={f.rendimiento != null ? clasificar(f.rendimiento) : ''} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Total</td>
                      <td className="ig-num">{fmt(t.catedras.profesores)}</td>
                      <td className="ig-num">{fmt(t.catedras.catedras)}</td>
                      <td>
                        <Medidor valor={t.asistencia.total.asistencia} />
                      </td>
                      <td>
                        <Medidor valor={t.asistencia.total.carga} />
                      </td>
                      <td>
                        <Medidor valor={t.mesas.total.asistencia} />
                      </td>
                      <td>
                        <Medidor valor={t.rendimiento.promedio} />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="ig-nota">
              Los profesores se cuentan una vez por carrera y sede; el total no repite a quien dicta en varias.
            </p>
          </section>

          <section className="ig-seccion" aria-labelledby="ig-mesas">
            <h2 id="ig-mesas">Mesas examinadoras del período</h2>
            {t.mesas.porLlamado.length === 0 ? (
              <p className="muted-text">No hay llamados de examen en este período.</p>
            ) : (
              <div className="ig-llamados">
                {t.mesas.porLlamado.map((l) => (
                  <div key={l.llamado.id} className="ig-llamado">
                    <h3>{l.llamado.nombre}</h3>
                    <p className="ig-nota">
                      Del {formatoCorto(l.llamado.fecha_inicio)} al {formatoCorto(l.llamado.fecha_fin)}. {fmt(l.mesas)} mesas,{' '}
                      {fmt(l.tomadas)} ya tomadas.
                    </p>
                    {l.tomadas === 0 ? (
                      <p className="muted-text">Todavía no se tomaron mesas de este llamado.</p>
                    ) : (
                      <dl>
                        <div>
                          <dt>Asistencia de los integrantes</dt>
                          <dd>
                            <Medidor valor={l.asistencia} detalle={`${fmt(l.asistieron)} de ${fmt(l.registrados)}`} />
                          </dd>
                        </div>
                        <div>
                          <dt>Asistencia registrada</dt>
                          <dd>
                            <Medidor valor={l.registro} detalle={`${fmt(l.registrados)} de ${fmt(l.esperados)} integrantes`} />
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="ig-seccion" aria-labelledby="ig-rendimiento">
            <h2 id="ig-rendimiento">Rendimiento según la Foja de Desempeño</h2>
            <p className="ig-nota">
              Solo los criterios institucionales que registra el sistema: la valoración de alumnos (encuesta) queda fuera.
              El porcentaje es lo obtenido sobre el peso de esos criterios.
            </p>
            {t.rendimiento.catedras === 0 ? (
              <p className="muted-text">Todavía no hay fojas calculadas para este período.</p>
            ) : (
              <>
                <div className="ig-columnas">
                  <div>
                    <h3>Promedio por carrera</h3>
                    <Barras
                      filas={[...t.rendimiento.porCarrera.values()]
                        .sort((a, b) => b.promedio - a.promedio)
                        .map((c) => ({ nombre: c.nombre, valor: c.promedio, detalle: `${c.catedras} cátedras` }))}
                    />
                  </div>
                  <div>
                    <h3>Promedio por sede</h3>
                    <Barras
                      filas={[...t.rendimiento.porSede.values()]
                        .sort((a, b) => b.promedio - a.promedio)
                        .map((c) => ({ nombre: c.nombre, valor: c.promedio, detalle: `${c.catedras} cátedras` }))}
                    />
                  </div>
                </div>

                <h3>Cátedras por escala valorativa (sobre los criterios institucionales)</h3>
                <div className="ig-escala" role="img" aria-label={t.rendimiento.escala.map((e) => `${e.nombre}: ${e.catedras}`).join(', ')}>
                  {[...t.rendimiento.escala].reverse().map((e, i) =>
                    e.catedras ? (
                      <span
                        key={e.nombre}
                        className={`ig-escala-tramo ig-paso-${i + 1}`}
                        style={{ flexGrow: e.catedras }}
                        title={`${e.nombre}: ${e.catedras} cátedras (${fmtPct(pct(e.catedras, totalEscala))})`}
                      />
                    ) : null,
                  )}
                </div>
                <ul className="ig-escala-leyenda">
                  {[...t.rendimiento.escala].reverse().map((e, i) => (
                    <li key={e.nombre}>
                      <span className={`ig-muestra ig-paso-${i + 1}`} aria-hidden="true" />
                      {e.nombre}: <strong>{fmt(e.catedras)}</strong> ({fmtPct(pct(e.catedras, totalEscala))})
                    </li>
                  ))}
                </ul>

                <h3>Dónde se pierden puntos</h3>
                <p className="ig-nota">Promedio obtenido en cada criterio sobre su peso en la foja.</p>
                <div className="ig-barras">
                  {t.rendimiento.criterios.map((c) => (
                    <div key={c.nombre} className="ig-barra" title={`${c.nombre}: ${fmt(c.obtenido, 1)} de ${fmt(c.peso)} puntos`}>
                      <span className="ig-barra-nombre">{c.nombre}</span>
                      <span className="ig-barra-riel">
                        <span style={{ width: `${Math.min(100, (100 * c.obtenido) / (c.peso || 1))}%` }} />
                      </span>
                      <span className="ig-barra-valor">
                        {fmt(c.obtenido, 1)} de {fmt(c.peso)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="ig-seccion-cabecera">
                  <h3>Rendimiento por profesor</h3>
                  <button type="button" className="btn btn-secondary btn-sm no-print" onClick={exportarProfesores}>
                    Descargar CSV
                  </button>
                </div>
                <div className="form-row no-print" style={{ marginBottom: 10 }}>
                  <input
                    type="search"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar profesor..."
                    style={{ flex: '1 1 240px', maxWidth: 360 }}
                  />
                  <select value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Orden">
                    <option value="asc">Menor rendimiento primero</option>
                    <option value="desc">Mayor rendimiento primero</option>
                  </select>
                </div>
                <div className="data-table-wrap">
                  <table className="data-table ig-tabla">
                    <thead>
                      <tr>
                        <th>Profesor</th>
                        <th>Carrera</th>
                        <th>Sede</th>
                        <th className="ig-num">Cátedras</th>
                        <th>Promedio</th>
                        <th>Escala</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(verTodos ? profesores : profesores.slice(0, 25)).map((p) => (
                        <tr key={p.clave}>
                          <td>{p.profesor}</td>
                          <td>{[...p.carreras].join(' / ')}</td>
                          <td>{[...p.sedes].join(' / ')}</td>
                          <td className="ig-num">{p.catedras}</td>
                          <td>
                            <Medidor valor={p.promedio} />
                          </td>
                          <td>{clasificar(p.promedio)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {profesores.length > 25 && (
                  <button type="button" className="btn btn-secondary btn-sm no-print" style={{ marginTop: 10 }} onClick={() => setVerTodos((v) => !v)}>
                    {verTodos ? 'Mostrar los primeros 25' : `Ver los ${profesores.length} profesores`}
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
