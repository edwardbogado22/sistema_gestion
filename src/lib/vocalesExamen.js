import { deISO } from './fechas'

// Puerto del algoritmo de asignación de vocales del "Asignador de
// Examinadores" (Google Apps Script) al modelo de datos de este sistema.
//
// Una "fila" es una cátedra con fecha de examen asignada dentro de un
// llamado: { catedra_id, examen_fecha_id, fecha, sede_id, sede,
// carrera_id, carrera, curso_nivel, seccion_grupo, materia, optativa,
// titular_id, titular_nombre, vocal1_id, vocal1_nombre, vocal2_id,
// vocal2_nombre }.
//
// Los candidatos a vocal salen de los TITULARES de otras filas del mismo
// llamado (no de cualquier profesor del sistema) — mismo criterio que el
// original: solo se recluta entre quienes ya presiden alguna mesa. Además
// deben ser de la misma sede y carrera que la mesa (si no, no forman
// parte del plantel que se está convocando ahí) y, siempre que haya datos
// de horario, se prioriza a quien ese día ya tiene clase en esa sede —
// para no convocar a alguien un día que no está en la institución.

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export function diaSemana(fechaISO) {
  return DIAS[deISO(fechaISO).getDay()]
}

// 0 (domingo) a 6 (sábado), igual convención que extract(dow) de Postgres
// — así calza directo con catedra_horario.dia_semana.
export function diaSemanaNumero(fechaISO) {
  return deISO(fechaISO).getDay()
}

export function claveCluster(f) {
  return [f.sede_id, f.carrera_id, f.curso_nivel, f.seccion_grupo].join('|')
}

const esOptativa = (f) => !!f.optativa

// `presencia`: Map<profesorId, Map<sedeId, Set<diaSemanaNumero>>> — de
// dónde y qué días tiene clase cada profesor (catedra_horario). Opcional:
// sin datos, el algoritmo cae al respaldo más débil (mismo día de semana
// que otra mesa propia).
export function construirContexto(filas, presencia) {
  const ocupado = new Map() // profesorId -> Set(fecha) en que preside una mesa
  const clusterOpt = new Map() // claveCluster -> Set(profesorId) que preside una optativa de ese cluster
  const nombrePorId = new Map()
  for (const f of filas) {
    if (!f.titular_id) continue
    nombrePorId.set(f.titular_id, f.titular_nombre)
    if (!ocupado.has(f.titular_id)) ocupado.set(f.titular_id, new Set())
    ocupado.get(f.titular_id).add(f.fecha)
    if (esOptativa(f)) {
      const k = claveCluster(f)
      if (!clusterOpt.has(k)) clusterOpt.set(k, new Set())
      clusterOpt.get(k).add(f.titular_id)
    }
    if (f.vocal1_id) nombrePorId.set(f.vocal1_id, f.vocal1_nombre)
    if (f.vocal2_id) nombrePorId.set(f.vocal2_id, f.vocal2_nombre)
  }
  return { ocupado, clusterOpt, nombrePorId, presencia: presencia || new Map() }
}

// Candidatos a vocal para la fila i, excluyendo los ids en `excluir`.
// Tiers, de mejor a peor:
//   0 optCluster — co-presidentes de una optativa del mismo cluster y fecha (excepción al choque)
//   1 presente   — tiene clase regular ese día de semana en esa sede (catedra_horario)
//   2 mismoDia   — sin dato de horario, pero tiene otra mesa un día de semana igual (respaldo débil)
export function candidatos(filas, i, excluir, ctx) {
  const f = filas[i]
  const soyOpt = esOptativa(f)
  const kCluster = soyOpt ? claveCluster(f) : null
  const diaNum = diaSemanaNumero(f.fecha)
  const diaTxt = diaSemana(f.fecha)

  const mejorTier = new Map() // profesorId -> 0 | 1 | 2 (menor = mejor)

  for (const o of filas) {
    const prof = o.titular_id
    if (!prof || prof === f.titular_id || excluir.has(prof)) continue
    if (o.sede_id !== f.sede_id || o.carrera_id !== f.carrera_id) continue

    let tier = null
    if (soyOpt && esOptativa(o) && o.fecha === f.fecha && claveCluster(o) === kCluster) {
      tier = 0
    } else {
      if (ctx.ocupado.has(prof) && ctx.ocupado.get(prof).has(f.fecha)) continue // choque: ya preside otra mesa ese día
      if (ctx.presencia.get(prof)?.get(f.sede_id)?.has(diaNum)) tier = 1
      else if (diaSemana(o.fecha) === diaTxt) tier = 2
    }
    if (tier === null) continue
    if (!mejorTier.has(prof) || mejorTier.get(prof) > tier) mejorTier.set(prof, tier)
  }

  const p0 = [],
    p1 = [],
    p2 = []
  for (const [prof, tier] of mejorTier) {
    if (tier === 0) p0.push(prof)
    else if (tier === 1) p1.push(prof)
    else p2.push(prof)
  }

  const porNombre = (a, b) => (ctx.nombrePorId.get(a) || '').localeCompare(ctx.nombrePorId.get(b) || '')
  p0.sort(porNombre)
  p1.sort(porNombre)
  p2.sort(porNombre)

  return { optCluster: p0, presente: p1, mismoDia: p2, todos: [...p0, ...p1, ...p2] }
}

// 'ok' | 'warn' | 'err' para la fila i.
export function estado(filas, i, ctx) {
  const f = filas[i]
  const nombres = [f.titular_id, f.vocal1_id, f.vocal2_id].filter(Boolean)
  const vistos = new Set()
  for (const n of nombres) {
    if (vistos.has(n)) return 'err'
    vistos.add(n)
  }

  const soyOpt = esOptativa(f)
  const kCluster = soyOpt ? claveCluster(f) : null
  for (const ex of [f.vocal1_id, f.vocal2_id]) {
    if (!ex) continue
    if (ctx.ocupado.has(ex) && ctx.ocupado.get(ex).has(f.fecha)) {
      const permitido = soyOpt && ctx.clusterOpt.has(kCluster) && ctx.clusterOpt.get(kCluster).has(ex)
      if (!permitido) return 'err'
    }
  }

  return f.vocal1_id && f.vocal2_id ? 'ok' : 'warn'
}

function puedeCompletarse(filas, i, ctx) {
  const f = filas[i]
  if (f.vocal1_id && f.vocal2_id) return true
  const excl = new Set([f.titular_id])
  const c = candidatos(filas, i, excl, ctx).todos
  const faltan = (f.vocal1_id ? 0 : 1) + (f.vocal2_id ? 0 : 1)
  return c.length >= faltan
}

function contarCompletables(filas, ctx) {
  let ok = 0
  for (let i = 0; i < filas.length; i++) if (puedeCompletarse(filas, i, ctx)) ok++
  return ok
}

// Completa vocal1/vocal2 vacíos balanceando por cantidad de veces que cada
// profesor ya es vocal (no cuenta las veces que preside). Devuelve un
// array nuevo, no muta `filas`.
export function asignarAuto(filas, presencia) {
  const ctx = construirContexto(filas, presencia)
  const conteo = new Map()
  for (const f of filas) {
    if (f.vocal1_id) conteo.set(f.vocal1_id, (conteo.get(f.vocal1_id) || 0) + 1)
    if (f.vocal2_id) conteo.set(f.vocal2_id, (conteo.get(f.vocal2_id) || 0) + 1)
  }

  const nuevas = filas.map((f) => ({ ...f }))
  for (let i = 0; i < nuevas.length; i++) {
    const f = nuevas[i]
    if (!f.titular_id || (f.vocal1_id && f.vocal2_id)) continue
    const excl = new Set([f.titular_id])
    if (f.vocal1_id) excl.add(f.vocal1_id)
    if (f.vocal2_id) excl.add(f.vocal2_id)

    const cand = candidatos(nuevas, i, excl, ctx).todos.slice()
    cand.sort((a, b) => (conteo.get(a) || 0) - (conteo.get(b) || 0))

    if (!f.vocal1_id && cand.length) {
      f.vocal1_id = cand.shift()
      f.vocal1_nombre = ctx.nombrePorId.get(f.vocal1_id)
      conteo.set(f.vocal1_id, (conteo.get(f.vocal1_id) || 0) + 1)
    }
    if (!f.vocal2_id) {
      const c2 = cand.filter((p) => p !== f.vocal1_id)
      if (c2.length) {
        f.vocal2_id = c2[0]
        f.vocal2_nombre = ctx.nombrePorId.get(f.vocal2_id)
        conteo.set(f.vocal2_id, (conteo.get(f.vocal2_id) || 0) + 1)
      }
    }
  }
  return nuevas
}

// Grupos movibles de un día de la semana: cada mesa simple es su propio
// grupo; las optativas del mismo cluster/fecha se mueven juntas.
function gruposMovibles(filas, dia) {
  const grupos = new Map()
  const orden = []
  filas.forEach((f, idx) => {
    if (diaSemana(f.fecha) !== dia) return
    const clave = esOptativa(f) ? 'OPT|' + claveCluster(f) + '|' + f.fecha : 'MESA|' + idx
    if (!grupos.has(clave)) {
      grupos.set(clave, { clave, idxs: [] })
      orden.push(clave)
    }
    grupos.get(clave).idxs.push(idx)
  })
  return orden.map((k) => grupos.get(k))
}

function describirPropuesta(m, filas) {
  const f0 = filas[m.grupo.idxs[0]]
  const esOpt = esOptativa(f0)
  const etiqueta = esOpt
    ? `Optativas ${f0.curso_nivel}º ${f0.seccion_grupo} — ${f0.sede}/${f0.carrera} (${m.grupo.idxs.length} materia${m.grupo.idxs.length > 1 ? 's' : ''})`
    : `${f0.materia} — ${f0.titular_nombre}`
  return {
    idxs: m.grupo.idxs.slice(),
    catedraIds: m.grupo.idxs.map((idx) => filas[idx].catedra_id),
    origen: m.origen,
    destino: m.destino,
    dia: diaSemana(f0.fecha),
    delta: m.delta,
    etiqueta,
  }
}

// Busca mover grupos de mesas a otra fecha del mismo día de la semana
// (dentro de `fechasHabilesPorDia`, Map<diaSemana, string[] fechasISO>)
// para aumentar la cantidad de mesas completables. Búsqueda voraz, no
// muta `filasOriginal`.
export function calcularRebalanceo(filasOriginal, fechasHabilesPorDia, presencia) {
  const filas = filasOriginal.map((f) => ({ ...f }))
  const ctxBase = construirContexto(filas, presencia)
  const baseGlobal = contarCompletables(filas, ctxBase)

  const dias = new Set(filas.map((f) => diaSemana(f.fecha)))
  const propuestas = []

  for (const dia of dias) {
    const fechas = fechasHabilesPorDia.get(dia) || []
    if (fechas.length < 2) continue

    let mejora = true
    let guardia = 0
    while (mejora && guardia < 40) {
      guardia++
      mejora = false
      const grupos = gruposMovibles(filas, dia)
      const ctx = construirContexto(filas, presencia)
      const base = contarCompletables(filas, ctx)
      let mejor = null

      for (const g of grupos) {
        const fechaActual = filas[g.idxs[0]].fecha
        for (const destino of fechas) {
          if (destino === fechaActual) continue
          const previo = g.idxs.map((idx) => filas[idx].fecha)
          g.idxs.forEach((idx) => {
            filas[idx] = { ...filas[idx], fecha: destino }
          })
          const ctxProbado = construirContexto(filas, presencia)
          const ahora = contarCompletables(filas, ctxProbado)
          g.idxs.forEach((idx, k) => {
            filas[idx] = { ...filas[idx], fecha: previo[k] }
          })
          const delta = ahora - base
          if (delta > 0 && (!mejor || delta > mejor.delta)) {
            mejor = { grupo: g, origen: fechaActual, destino, delta }
          }
        }
      }

      if (mejor) {
        mejor.grupo.idxs.forEach((idx) => {
          filas[idx] = { ...filas[idx], fecha: mejor.destino }
        })
        propuestas.push(describirPropuesta(mejor, filas))
        mejora = true
      }
    }
  }

  // Se revierten los movimientos: son propuestas, no decisiones. El
  // componente decide cuáles aplicar de verdad contra examen_fecha.
  for (let i = propuestas.length - 1; i >= 0; i--) {
    const p = propuestas[i]
    p.idxs.forEach((idx) => {
      filas[idx] = { ...filas[idx], fecha: p.origen }
    })
  }

  const final = baseGlobal + propuestas.reduce((a, p) => a + p.delta, 0)
  return { propuestas, base: baseGlobal, final }
}
