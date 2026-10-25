import { Link, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { AREAS, areasVisibles } from '../lib/navegacion'
import { aISO, deISO, formatoCorto } from '../lib/fechas'
import { fetchTodo } from '../lib/paginar'
import { avancePorLlamado, diasEntre, nombreLlamado, periodoDeExamenes } from '../lib/examenes'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const SA = 'SECRETARIA_ACADEMICA'

// Pantallas que cada perfil usa todos los días, en orden de importancia.
// Las dos primeras (diario) van destacadas. Solo se muestran las que el
// rol tiene en su menú (lib/navegacion.js).
const ACCESOS = {
  SECRETARIO: ['/asistencia', '/examenes/actas-firmas', '/examenes', '/examenes/consulta-profesor', '/plan-anual', '/ayuda'],
  ADMIN: ['/examenes', '/asistencia', '/catedras', '/eventos', '/fojas/emision', '/ayuda'],
  DIRECTOR: ['/catedras', '/asistencia/reporte', '/examenes', '/informes', '/plan-anual/reporte', '/ayuda'],
  [SA]: ['/catedras', '/fojas/emision', '/examenes/actas-firmas', '/examenes/consulta-profesor', '/asistencia/reporte', '/ayuda'],
}
const DIARIOS = { SECRETARIO: 2, ADMIN: 1, DIRECTOR: 0, [SA]: 0 }

const itemDe = (to) => AREAS.flatMap((a) => a.items).find((i) => i.to === to)

// "Bogado, Edward" o "Edward Bogado" → "Edward"
function primerNombre(perfil, user) {
  const completo = perfil?.nombre_completo?.trim()
  if (!completo) return user?.email?.split('@')[0] || ''
  const nombres = completo.includes(',') ? completo.split(',')[1] : completo
  return nombres.trim().split(/\s+/)[0]
}

function saludo() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

// Todo lo que muestra el Inicio, en una sola carga. Cada consulta respeta
// el alcance del usuario (RLS): el secretario ve lo de su carrera y sede.
function useInicio(rol) {
  const [datos, setDatos] = useState(null)

  useEffect(() => {
    let activo = true
    const hoy = aISO(new Date())
    const leeEvaluacion = rol === 'ADMIN' || rol === SA
    const esSecretario = rol === 'SECRETARIO'

    ;(async () => {
      const { data: periodoActivo } = await supabase.from('periodo_academico').select('*').eq('activo', true).maybeSingle()
      const periodo = periodoActivo?.etiqueta_periodo_lectivo || String(new Date().getFullYear())
      const anio = periodoActivo?.anio || Number(periodo) || new Date().getFullYear()
      const desdeAnio = `${anio}-01-01`
      const hastaAnio = `${anio}-12-31`

      const [criterios, catedras, plan, ultimaAsistencia, eventos, capacitaciones, llamados, avance, cifras, desglose, borradores] =
        await Promise.all([
          supabase.from('criterios_evaluacion').select('id, codigo, nombre, peso_porcentaje, grupo, orden, origen').eq('periodo_lectivo', periodo).eq('activo', true).order('orden'),
          supabase.from('catedras').select('*', { count: 'exact', head: true }).eq('periodo_lectivo', periodo).eq('activo', true),
          supabase
            .from('plan_anual_entrega')
            .select('catedra_id, catedras!inner(periodo_lectivo, activo)', { count: 'exact', head: true })
            .not('fecha_entrega', 'is', null)
            .eq('catedras.periodo_lectivo', periodo)
            .eq('catedras.activo', true),
          supabase.from('asistencia_clase_registro').select('fecha').order('fecha', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('evento').select('id, nombre, fecha, tipo').eq('activo', true).gte('fecha', desdeAnio).lte('fecha', hastaAnio).order('fecha'),
          supabase.from('capacitacion_resultado').select('clave_capacitacion').eq('periodo_lectivo', periodo),
          supabase.from('examen_llamado').select('*').order('fecha_inicio'),
          supabase.from('v_examen_avance').select('llamado_id, total, con_fecha, sin_fecha'),
          Promise.all([
            supabase.from('profesores').select('*', { count: 'exact', head: true }),
            supabase.from('asignaturas').select('*', { count: 'exact', head: true }),
          ]),
          fetchTodo((desde, hasta) =>
            supabase
              .from('catedras')
              .select('id, asignaturas(carreras(nombre)), sedes(nombre)')
              .eq('periodo_lectivo', periodo)
              .eq('activo', true)
              .order('id')
              .range(desde, hasta),
          ),
          rol === 'ADMIN'
            ? supabase.from('manual').select('*', { count: 'exact', head: true }).eq('publicado', false)
            : Promise.resolve({ count: 0 }),
        ])

      // Indicadores cargados a mano y encuesta: solo los lee Dirección
      // Académica (evaluacion_criterio_catedra), el resto ve "—".
      const manuales = (criterios.data || []).filter((c) => c.grupo === 'INSTITUCIONAL' && c.origen === 'MANUAL')
      const alumno = (criterios.data || []).find((c) => c.grupo === 'ALUMNOS')
      const contarEvaluacion = (criterioId) =>
        supabase
          .from('evaluacion_criterio_catedra')
          .select('id, catedras!inner(periodo_lectivo)', { count: 'exact', head: true })
          .eq('criterio_id', criterioId)
          .eq('catedras.periodo_lectivo', periodo)
      const evaluacion = new Map()
      if (leeEvaluacion) {
        const ids = [...manuales.map((c) => c.id), ...(alumno ? [alumno.id] : [])]
        const res = await Promise.all(ids.map(contarEvaluacion))
        ids.forEach((id, i) => evaluacion.set(id, res[i].count ?? 0))
      }

      // Lo del día del secretario: clases de hoy sin asistencia cargada y
      // firmas pendientes del último llamado (mismo que abre Actas a firmar).
      let clasesSinCargar = null
      let firmasPendientes = null
      if (esSecretario) {
        const dow = deISO(hoy).getDay()
        const [horario, registros] = await Promise.all([
          fetchTodo((desde, hasta) =>
            supabase
              .from('v_catedra_horario')
              .select('catedra_id, dia_semana, profesor_id, carrera_id, sede_id')
              .eq('dia_semana', dow)
              .order('catedra_id')
              .range(desde, hasta),
          ),
          supabase.from('asistencia_clase_registro').select('profesor_id, carrera_id, sede_id').eq('fecha', hoy),
        ])
        const cargados = new Set((registros.data || []).map((r) => `${r.profesor_id}|${r.carrera_id}|${r.sede_id}`))
        const delDia = new Set((horario.data || []).map((h) => `${h.profesor_id}|${h.carrera_id}|${h.sede_id}`))
        const sede = horario.data?.[0]?.sede_id
        const { data: bloqueo } = delDia.size
          ? await supabase.rpc('dia_bloqueado', { p_fecha: hoy, p_llamado: null, p_sede: sede })
          : { data: null }
        clasesSinCargar = bloqueo ? { bloqueo } : { cantidad: [...delDia].filter((k) => !cargados.has(k)).length, hayClases: delDia.size > 0 }

        const ultimo = [...(llamados.data || [])].sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio))[0]
        if (ultimo) {
          const { data: actas } = await fetchTodo((desde, hasta) =>
            supabase
              .rpc('actas_firmas', { p_llamado: ultimo.id })
              .order('examen_fecha_id')
              .order('profesor_id')
              .order('rol')
              .range(desde, hasta),
          )
          // presidente y examinador en la misma mesa firman una sola vez
          const pendientes = new Set((actas || []).filter((a) => !a.firmado_en).map((a) => `${a.examen_fecha_id}|${a.profesor_id}`))
          firmasPendientes = pendientes.size
        }
      }

      if (!activo) return

      const contarPor = (obtenerNombre) => {
        const conteo = {}
        for (const c of desglose.data || []) {
          const nombre = obtenerNombre(c) || 'Sin dato'
          conteo[nombre] = (conteo[nombre] || 0) + 1
        }
        return Object.entries(conteo).sort((a, b) => b[1] - a[1])
      }

      setDatos({
        hoy,
        periodo,
        anio,
        criterios: criterios.data || [],
        totalCatedras: catedras.count || 0,
        planEntregado: plan.count || 0,
        ultimaAsistencia: ultimaAsistencia.data?.fecha || null,
        eventos: eventos.data || [],
        capacitacionesConResultado: new Set((capacitaciones.data || []).map((c) => c.clave_capacitacion)).size,
        llamados: llamados.data || [],
        avancePorLlamado: avancePorLlamado(avance.data),
        evaluacion,
        leeEvaluacion,
        clasesSinCargar,
        firmasPendientes,
        borradores: borradores.count || 0,
        cifras: {
          profesores: cifras[0].count || 0,
          asignaturas: cifras[1].count || 0,
          catedras: catedras.count || 0,
          porCarrera: contarPor((c) => c.asignaturas?.carreras?.nombre),
          porSede: contarPor((c) => c.sedes?.nombre),
        },
      })
    })()
    return () => {
      activo = false
    }
  }, [rol])

  return datos
}

// Estado de un criterio de la foja, según de dónde sale su dato.
function moduloDe(criterio, d, examenes) {
  const n = d.totalCatedras
  const deTotal = (x, texto) => ({ dato: `${x} de ${n}`, detalle: texto, avance: n ? x / n : 0, atento: n > 0 && x / n < 0.5 })
  const sinAcceso = { dato: '—', detalle: 'lo carga Dirección Académica', avance: null }
  const reuniones = d.eventos.filter((e) => e.tipo === 'REUNION')
  const capacitaciones = d.eventos.filter((e) => e.tipo?.startsWith('CAPACITACION'))

  switch (criterio.origen) {
    case 'OBJETIVO_PLAN_ANUAL':
      return { ...deTotal(d.planEntregado, 'cátedras entregaron el Plan Anual'), to: '/plan-anual' }
    case 'OBJETIVO_CLASES_CONTENIDO':
      return {
        dato: d.ultimaAsistencia ? `Al ${formatoCorto(d.ultimaAsistencia)}` : 'Sin cargar',
        detalle: 'última asistencia a clases cargada; también cuenta el contenido dictado',
        avance: null,
        atento: !d.ultimaAsistencia,
        to: '/asistencia',
      }
    case 'OBJETIVO_REUNIONES': {
      const hechas = reuniones.filter((e) => e.fecha <= d.hoy).length
      return {
        dato: plural(hechas, 'realizada', 'realizadas'),
        detalle: `reuniones de ${d.anio}${reuniones.length > hechas ? `; ${reuniones.length - hechas} próxima(s)` : ''}`,
        avance: null,
        to: '/eventos/reporte',
      }
    }
    case 'OBJETIVO_CAPACITACIONES':
      return {
        dato: plural(capacitaciones.length, 'capacitación', 'capacitaciones'),
        detalle: `en ${d.anio}; ${d.capacitacionesConResultado} con resultados cargados`,
        avance: null,
        to: '/eventos/capacitaciones',
      }
    case 'OBJETIVO_MESAS_EXAMINADORAS': {
      const { foco, avance } = examenes
      if (!foco) return { dato: 'Sin llamado', detalle: 'no hay llamados pendientes', avance: null, to: '/examenes' }
      const dias = foco.fecha_inicio > d.hoy ? diasEntre(d.hoy, foco.fecha_inicio) : null
      const pct = avance?.total ? avance.con_fecha / avance.total : null
      return {
        dato: dias !== null ? `${nombreLlamado(foco)} en ${plural(dias, 'día', 'días')}` : `${nombreLlamado(foco)} en curso`,
        detalle: avance ? `${avance.con_fecha} mesas con fecha (${Math.floor((pct || 0) * 100)} %)` : 'mesas de examen',
        avance: pct,
        to: '/examenes',
      }
    }
    case 'MANUAL':
      return d.leeEvaluacion
        ? { ...deTotal(d.evaluacion.get(criterio.id) ?? 0, 'cátedras con el indicador cargado'), to: '/catedras' }
        : { ...sinAcceso, to: '/catedras' }
    default:
      return { dato: '—', detalle: '', avance: null }
  }
}

// La foja como suma de sus criterios (Resolución 054/2021): un tramo por
// criterio institucional y uno para la valoración de alumnos, cada uno
// del ancho de su peso, con la línea de avance de carga.
function PanelFoja({ d, examenes, rol }) {
  const institucionales = d.criterios.filter((c) => c.grupo === 'INSTITUCIONAL')
  const alumnos = d.criterios.filter((c) => c.grupo === 'ALUMNOS')
  if (institucionales.length === 0) return null

  const pesoAlumnos = alumnos.reduce((s, c) => s + Number(c.peso_porcentaje), 0)
  const conEncuesta = alumnos.length && d.leeEvaluacion ? (d.evaluacion.get(alumnos[0].id) ?? 0) : null
  const modulos = [
    ...institucionales.map((c) => ({ id: c.id, nombre: c.nombre, peso: Number(c.peso_porcentaje), ...moduloDe(c, d, examenes) })),
    ...(alumnos.length
      ? [
          {
            id: 'alumnos',
            nombre: 'Valoración de alumnos',
            peso: pesoAlumnos,
            ...(conEncuesta === null
              ? { dato: '—', detalle: 'encuesta: la carga Dirección Académica', avance: null }
              : {
                  dato: conEncuesta ? `${conEncuesta} de ${d.totalCatedras}` : 'Sin cargar',
                  detalle: conEncuesta ? 'cátedras con la encuesta cargada' : `encuesta ${d.periodo} pendiente; se usa el promedio hasta cargarla`,
                  avance: d.totalCatedras ? conEncuesta / d.totalCatedras : 0,
                  atento: !conEncuesta,
                }),
          },
        ]
      : []),
  ]

  // el enlace solo si el rol tiene esa pantalla en su menú
  const permitido = (to) => to && areasVisibles(rol).some((a) => a.items.some((i) => i.to === to))

  return (
    <section className="inicio-foja-panel" aria-labelledby="inicio-foja-titulo">
      <div className="inicio-foja-panel-cabecera">
        <h2 id="inicio-foja-titulo">La Foja de Desempeño se construye con todo lo que registra el sistema</h2>
        <p>Criterios de la Resolución 054/2021 para {d.periodo}. La línea dorada es el avance de carga.</p>
      </div>

      <div className="inicio-foja-barra">
        {modulos.map((m, i) => {
          const contenido = (
            <>
              <span className="inicio-foja-num">{i + 1}</span>
              <span className="inicio-foja-peso">{m.peso}%</span>
              {m.avance !== null && <span className="inicio-foja-relleno" style={{ width: `${Math.round(m.avance * 100)}%` }} />}
            </>
          )
          const props = {
            className: `inicio-foja-tramo${m.peso <= 5 ? ' angosto' : ''}`,
            style: { flexGrow: m.peso, '--i': i },
            title: `${m.nombre}: ${m.peso} % de la foja`,
          }
          return permitido(m.to) ? (
            <Link key={m.id} to={m.to} {...props}>
              {contenido}
            </Link>
          ) : (
            <div key={m.id} {...props}>
              {contenido}
            </div>
          )
        })}
      </div>

      <div className="inicio-foja-modulos">
        {modulos.map((m, i) => {
          const contenido = (
            <>
              <span className="inicio-foja-modulo-cab">
                <span className="inicio-foja-modulo-n">{i + 1}</span>
                <strong>{m.nombre}</strong>
              </span>
              <span className="inicio-foja-modulo-dato">{m.dato}</span>
              <small>{m.detalle}</small>
            </>
          )
          const clase = `inicio-foja-modulo${m.atento ? ' atento' : ''}`
          return permitido(m.to) ? (
            <Link key={m.id} to={m.to} className={clase}>
              {contenido}
            </Link>
          ) : (
            <div key={m.id} className={clase}>
              {contenido}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Accesos({ d, rol, examenes, alcance }) {
  const lista = (ACCESOS[rol] || []).map(itemDe).filter((it) => it && areasVisibles(rol).some((a) => a.items.includes(it)))
  const diarios = DIARIOS[rol] ?? 0
  const { foco, avance } = examenes
  const hoy = deISO(d.hoy)

  // texto y contador propios de cada pantalla
  const detalle = {
    '/asistencia': () => {
      const c = d.clasesSinCargar
      return {
        titulo: rol === 'SECRETARIO' ? 'Cargar la asistencia de hoy' : null,
        desc: `Clases del ${DIAS[hoy.getDay()]} ${formatoCorto(d.hoy)}, con suplencias.`,
        chip: !c ? null : c.bloqueo ? `Hoy: ${c.bloqueo}` : c.hayClases ? (c.cantidad ? `${plural(c.cantidad, 'profesor', 'profesores')} sin cargar` : 'Hoy ya está cargado') : 'Hoy no hay clases',
      }
    },
    '/examenes/actas-firmas': () => ({
      desc: 'Buscá al profesor y marcá cada acta firmada.',
      chip: d.firmasPendientes ? `${plural(d.firmasPendientes, 'firma pendiente', 'firmas pendientes')}` : null,
    }),
    '/examenes': () => ({
      titulo: rol === 'SECRETARIO' ? 'Fechas de examen' : null,
      desc: foco ? `${foco.nombre}: fecha de cada materia, vocales y actas.` : null,
      chip: foco?.estado === 'ASIGNACION' && avance?.sin_fecha ? `${plural(avance.sin_fecha, 'materia', 'materias')} sin fecha` : null,
    }),
    '/plan-anual': () => {
      const faltan = d.totalCatedras - d.planEntregado
      return {
        desc: 'Registrar la entrega del plan de cada cátedra.',
        chip: faltan > 0 ? `${plural(faltan, 'pendiente', 'pendientes')}` : null,
      }
    },
    '/examenes/consulta-profesor': () => ({ desc: 'Para responderle a un profesor cuándo le toca.' }),
    '/catedras': () => ({ desc: 'Profesor, días de clase, indicadores y foja de cada cátedra.' }),
    '/ayuda': () => ({
      desc: 'Manuales y videos de cada pantalla.',
      chip: rol === 'ADMIN' && d.borradores ? `${plural(d.borradores, 'manual', 'manuales')} en borrador` : null }),
  }

  const textoAlcance = alcance.length
    ? alcance.map((a) => `${a.carreras?.nombre ?? ''}${a.sedes?.nombre ? `, ${a.sedes.nombre}` : ''}`).join('; ')
    : ''

  return (
    <>
      <p className="inicio-accesos-titulo">
        Tu trabajo de todos los días{textoAlcance && rol !== 'ADMIN' && rol !== SA ? `: ${textoAlcance}` : ''}
      </p>
      <div className="inicio-accesos">
        {lista.map((it, i) => {
          const extra = detalle[it.to]?.() || {}
          return (
            <Link key={it.to} to={it.to} className={`inicio-acceso${i < diarios ? ' diario' : ''}`}>
              <span className="inicio-acceso-icono" aria-hidden="true">
                {it.icon}
              </span>
              <strong>{extra.titulo || it.titulo}</strong>
              <span className="inicio-acceso-desc">{extra.desc || it.desc}</span>
              {extra.chip && <span className="inicio-acceso-chip">{extra.chip}</span>}
            </Link>
          )
        })}
      </div>
    </>
  )
}

function Pendientes({ d, rol, examenes }) {
  const items = []
  const { foco, avance } = examenes
  const escribe = rol === 'ADMIN' || rol === 'SECRETARIO'
  const faltanPlan = d.totalCatedras - d.planEntregado

  if (foco?.estado === 'ASIGNACION' && avance?.sin_fecha > 0)
    items.push({
      modulo: 'Exámenes',
      titulo: `${rol === 'SECRETARIO' ? 'Te faltan' : 'Faltan'} ${plural(avance.sin_fecha, 'materia', 'materias')} sin fecha`,
      texto: `En el ${foco.nombre}, que empieza el ${formatoCorto(foco.fecha_inicio)}.`,
      to: rol === 'ADMIN' || rol === SA ? '/examenes/seguimiento' : `/examenes/${foco.id}`,
      enlace: rol === 'ADMIN' || rol === SA ? 'Ver el seguimiento' : 'Abrir el panel de fechas',
    })

  if (rol === 'ADMIN' && foco?.estado === 'ASIGNACION' && avance?.total > 0 && avance.sin_fecha === 0)
    items.push({
      modulo: 'Exámenes',
      titulo: `El ${foco.nombre} está listo para aprobar`,
      texto: 'Todas las materias tienen fecha. Al aprobarlo, profesores y secretarios ven sus mesas.',
      to: '/examenes',
      enlace: 'Ir a Llamados',
    })

  if (faltanPlan > 0 && d.totalCatedras > 0)
    items.push({
      modulo: 'Planificación',
      titulo: `${plural(faltanPlan, 'cátedra', 'cátedras')} sin Plan Anual`,
      texto: 'Es el 20 % de la foja de esos profesores.',
      to: escribe ? '/plan-anual' : '/plan-anual/reporte',
      enlace: escribe ? 'Registrar entregas' : 'Ver la constancia',
    })

  if (rol === 'SECRETARIO' && d.firmasPendientes)
    items.push({
      modulo: 'Actas',
      titulo: `${plural(d.firmasPendientes, 'firma pendiente', 'firmas pendientes')} de actas`,
      texto: 'Del último llamado, en tus carreras y sedes.',
      to: '/examenes/actas-firmas',
      enlace: 'Abrir Actas a firmar',
    })

  const alumnos = d.criterios.find((c) => c.grupo === 'ALUMNOS')
  if (rol === 'ADMIN' && alumnos && !d.evaluacion.get(alumnos.id))
    items.push({
      modulo: 'Alumnos',
      titulo: `Cargar la encuesta ${d.periodo}`,
      texto: 'Hasta entonces la foja usa el promedio de cada carrera y sede.',
      to: '/importar',
      enlace: 'Ir a Importar datos',
    })

  if (rol === 'ADMIN' && d.borradores > 0)
    items.push({
      modulo: 'Ayuda',
      titulo: `${plural(d.borradores, 'manual', 'manuales')} en borrador`,
      texto: 'Los usuarios no los ven hasta que se publiquen.',
      to: '/ayuda',
      enlace: 'Abrir el Centro de ayuda',
    })

  return (
    <section aria-labelledby="inicio-pendientes">
      <h2 id="inicio-pendientes" className="inicio-seccion">
        Pendientes
      </h2>
      {items.length === 0 ? (
        <p className="muted-text">Nada pendiente por ahora.</p>
      ) : (
        <ul className="inicio-pendientes">
          {items.map((it) => (
            <li key={it.titulo}>
              <span className="inicio-marca">{it.modulo}</span>
              <strong>{it.titulo}</strong>
              <p>{it.texto}</p>
              <Link to={it.to}>{it.enlace}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Próximas fechas: reuniones y capacitaciones, y el inicio o el fin de
// cada llamado de examen.
function ProximasFechas({ d }) {
  const fechas = [
    ...d.eventos
      .filter((e) => e.fecha >= d.hoy)
      .map((e) => ({ fecha: e.fecha, titulo: e.nombre, detalle: e.tipo === 'REUNION' ? 'Participación institucional' : 'Capacitación' })),
    ...d.llamados.flatMap((l) => [
      ...(l.fecha_inicio >= d.hoy ? [{ fecha: l.fecha_inicio, titulo: `Empieza el ${nombreLlamado(l)}`, detalle: `Hasta el ${formatoCorto(l.fecha_fin)}` }] : []),
      ...(l.fecha_inicio < d.hoy && l.fecha_fin >= d.hoy ? [{ fecha: l.fecha_fin, titulo: `Termina el ${nombreLlamado(l)}`, detalle: 'Mesas examinadoras' }] : []),
    ]),
  ]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .slice(0, 5)

  if (fechas.length === 0) return null

  return (
    <section aria-labelledby="inicio-proximas">
      <h2 id="inicio-proximas" className="inicio-seccion">
        Próximas fechas
      </h2>
      <ol className="inicio-proximas">
        {fechas.map((f) => (
          <li key={`${f.fecha}-${f.titulo}`}>
            <div className="inicio-proximas-dia">
              {formatoCorto(f.fecha)}
              <small>{DIAS[deISO(f.fecha).getDay()]}</small>
            </div>
            <div>
              <strong>{f.titulo}</strong>
              <span>{f.detalle}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function Home() {
  const { user, perfil, rol, esAsistente, alcance } = useAuth()
  const d = useInicio(rol)

  // El asistente solo hace check-in de eventos, normalmente desde el
  // celular en la puerta: directo a la pantalla que necesita, sin
  // pasar por un menú que no puede usar para nada más.
  if (esAsistente) return <Navigate to="/eventos" replace />

  const secciones = areasVisibles(rol)
  const fechaLarga = new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const examenes = (() => {
    if (!d) return { foco: null, avance: null }
    const { foco } = periodoDeExamenes(d.llamados, d.hoy)
    return { foco, avance: foco ? d.avancePorLlamado.get(foco.id) : null }
  })()

  return (
    <>
      <header className="inicio-cabecera">
        <div className="inicio-ancho">
          <p className="inicio-saludo">
            {saludo()}, {primerNombre(perfil, user)}.{' '}
            <span>{fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1)}.</span>
          </p>
          <h1 className="inicio-titulo">
            Sistema de Gestión Académico <em>{d?.anio ?? ''}</em>
          </h1>
          <p className="inicio-institucion">Facultad de Ciencias Económicas, Universidad Nacional del Este</p>

          {d ? (
            <Accesos d={d} rol={rol} examenes={examenes} alcance={alcance} />
          ) : (
            <p className="inicio-cargando">Cargando...</p>
          )}
        </div>
      </header>

      <div className="inicio-ancho">{d && <PanelFoja d={d} examenes={examenes} rol={rol} />}</div>

      <div className="inicio-ancho inicio-cuerpo">
        <div className="inicio-columna">
          {d && <Pendientes d={d} rol={rol} examenes={examenes} />}
          {d && <ProximasFechas d={d} />}

          <section aria-labelledby="inicio-cifras">
            <h2 id="inicio-cifras" className="inicio-seccion">
              La facultad en cifras
            </h2>
            <div className="inicio-cifras-fila">
              <span>
                <b>{d ? d.cifras.profesores : '—'}</b> profesores
              </span>
              <span>
                <b>{d ? d.cifras.asignaturas : '—'}</b> asignaturas
              </span>
              <span>
                <b>{d ? d.cifras.catedras : '—'}</b> cátedras {d?.periodo}
              </span>
            </div>
            {[
              ['Cátedras por carrera', d?.cifras.porCarrera],
              ['Cátedras por sede', d?.cifras.porSede],
            ].map(
              ([titulo, filas]) =>
                filas?.length > 0 && (
                  <table key={titulo} className="inicio-desglose">
                    <caption>{titulo}</caption>
                    <tbody>
                      {filas.map(([nombre, cantidad]) => (
                        <tr key={nombre}>
                          <td>{nombre}</td>
                          <td>{cantidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
            )}
          </section>
        </div>

        <section aria-labelledby="inicio-indice">
          <h2 id="inicio-indice" className="inicio-seccion">
            Todas las pantallas
          </h2>
          <div className="inicio-indice">
            {secciones.map(({ id, titulo, items }) => (
              <div key={id} className="inicio-grupo">
                <h3>{titulo}</h3>
                {items.map((c) => (
                  <Link key={c.to} to={c.to} className={c.destacada ? 'principal' : ''}>
                    <strong>{c.titulo}</strong>
                    <span>{c.desc}</span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
