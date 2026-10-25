// Cálculos del informe gerencial. Funciones puras: reciben las filas tal
// como vienen de la base y devuelven los agregados por carrera y sede. Todas
// las fuentes se cruzan por el nombre de carrera y de sede, porque la vista
// de la foja (v_evaluacion_docente_detalle) no trae los ids.
import { clasificar, ESCALA } from './foja'

export const clave = (carrera, sede) => `${carrera}|${sede}`

// porcentaje entero o null si no hay base (no es 0: "sin datos" no es "mal")
export const pct = (parte, total) => (total > 0 ? (100 * parte) / total : null)

// Umbrales de estado, los mismos del Reporte de asistencia: 80 y 60.
export function estadoDe(valor) {
  if (valor == null) return null
  if (valor >= 80) return 'bien'
  if (valor >= 60) return 'atencion'
  return 'critico'
}

function fila(mapa, carrera, sede) {
  const k = clave(carrera, sede)
  if (!mapa.has(k)) mapa.set(k, { clave: k, carrera, sede })
  return mapa.get(k)
}

// Cátedras activas del período: profesores distintos y cátedras.
export function resumirCatedras(catedras) {
  const mapa = new Map()
  const profesores = new Set()
  for (const c of catedras) {
    const carrera = c.asignaturas?.carreras?.nombre || 'Sin carrera'
    const sede = c.sedes?.nombre || 'Sin sede'
    const f = fila(mapa, carrera, sede)
    f.catedras = (f.catedras || 0) + 1
    f.profesores = f.profesores || new Set()
    if (c.profesor_id) {
      f.profesores.add(c.profesor_id)
      profesores.add(c.profesor_id)
    }
  }
  return { porClave: mapa, profesores: profesores.size, catedras: catedras.length }
}

// reporte_asistencia_clases: una fila por profesor, carrera y sede.
// Carga = días registrados sobre días esperados por horario.
// Asistencia = presentes sobre lo registrado, sin contar los justificados
// (un día sin cargar no es una falta).
export function resumirAsistencia(filas) {
  const mapa = new Map()
  const total = { esperadas: 0, registradas: 0, presentes: 0, justificados: 0 }
  for (const r of filas) {
    const f = fila(mapa, r.carrera, r.sede)
    const esperadas = Number(r.esperadas) || 0
    const presentes = Number(r.presentes) || 0
    const justificados = Number(r.justificados) || 0
    const registradas = presentes + (Number(r.ausentes) || 0) + justificados
    for (const [campo, valor] of [['esperadas', esperadas], ['registradas', registradas], ['presentes', presentes], ['justificados', justificados]]) {
      f[campo] = (f[campo] || 0) + valor
      total[campo] += valor
    }
  }
  const indicadores = (x) => ({
    carga: pct(x.registradas, x.esperadas),
    asistencia: pct(x.presentes, x.registradas - x.justificados),
  })
  for (const f of mapa.values()) Object.assign(f, indicadores(f))
  return { porClave: mapa, total: { ...total, ...indicadores(total) } }
}

// Mesas examinadoras: integrantes de cada mesa = el titular de la cátedra
// (presidente) más sus vocales. Solo cuentan las mesas que ya se tomaron
// (fecha hasta hoy). Registro = integrantes con asistencia cargada;
// asistencia = asistieron sobre lo registrado.
export function resumirMesas(agenda, integrantes, llamados, hoy) {
  const porMesa = new Map()
  for (const i of integrantes) {
    if (!porMesa.has(i.examen_fecha_id)) porMesa.set(i.examen_fecha_id, [])
    porMesa.get(i.examen_fecha_id).push(i)
  }

  const vacio = () => ({ mesas: 0, tomadas: 0, esperados: 0, registrados: 0, asistieron: 0 })
  const porLlamado = new Map(llamados.map((l) => [l.id, { llamado: l, ...vacio() }]))
  const porClave = new Map()
  const total = vacio()

  for (const m of agenda) {
    if (m.fecha_estado === 'ANULADA') continue
    const destinos = [porLlamado.get(m.llamado_id), fila(porClave, m.carrera, m.sede), total].filter(Boolean)
    for (const d of destinos) {
      for (const campo of Object.keys(vacio())) d[campo] = d[campo] || 0
      d.mesas += 1
    }
    if (m.fecha > hoy) continue

    // un integrante por profesor: el titular siempre, aunque todavía no
    // tenga fila en mesa_integrante (se crea al registrar su asistencia)
    const miembros = new Map([[m.profesor_id, null]])
    for (const i of porMesa.get(m.examen_fecha_id) || []) {
      if (i.rol_mesa === 'VOCAL' || i.profesor_id === m.profesor_id) miembros.set(i.profesor_id, i.asistio ?? null)
    }
    for (const d of destinos) {
      d.tomadas += 1
      for (const asistio of miembros.values()) {
        d.esperados += 1
        if (asistio !== null) d.registrados += 1
        if (asistio === true) d.asistieron += 1
      }
    }
  }

  const indicadores = (x) => ({ registro: pct(x.registrados, x.esperados), asistencia: pct(x.asistieron, x.registrados) })
  for (const d of [...porLlamado.values(), ...porClave.values()]) Object.assign(d, indicadores(d))
  return {
    porLlamado: [...porLlamado.values()].sort((a, b) => a.llamado.fecha_inicio.localeCompare(b.llamado.fecha_inicio)),
    porClave,
    total: { ...total, ...indicadores(total) },
  }
}

const promedio = (valores) => (valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null)

// Foja: total por cátedra (suma de lo obtenido en cada criterio) y sus
// promedios por carrera y sede, por profesor, por criterio y por escala.
export function resumirRendimiento(detalle, idsActivas) {
  const catedras = new Map()
  const criterios = new Map()
  for (const f of detalle) {
    if (idsActivas && !idsActivas.has(f.catedra_id)) continue
    if (!catedras.has(f.catedra_id)) {
      catedras.set(f.catedra_id, {
        catedra_id: f.catedra_id,
        carrera: f.carrera,
        sede: f.sede,
        profesor_id: f.profesor_id,
        profesor: f.profesor_completo,
        total: 0,
      })
    }
    catedras.get(f.catedra_id).total += Number(f.obtenido_porcentaje) || 0

    const grupo = f.grupo === 'ALUMNOS' ? 'ALUMNOS' : f.criterio_id
    if (!criterios.has(grupo)) {
      criterios.set(grupo, {
        nombre: f.grupo === 'ALUMNOS' ? 'Valoración de alumnos' : f.criterio_nombre,
        orden: f.grupo === 'ALUMNOS' ? 99 : f.orden,
        peso: 0,
        pesos: new Set(),
        obtenido: 0,
        catedras: new Set(),
      })
    }
    const c = criterios.get(grupo)
    if (!c.pesos.has(f.criterio_id)) {
      c.pesos.add(f.criterio_id)
      c.peso += Number(f.ponderacion) || 0
    }
    c.obtenido += Number(f.obtenido_porcentaje) || 0
    c.catedras.add(f.catedra_id)
  }

  const lista = [...catedras.values()]
  const agrupar = (pick, extra = () => ({})) => {
    const mapa = new Map()
    for (const c of lista) {
      const k = pick(c)
      if (!mapa.has(k)) mapa.set(k, { clave: k, totales: [], ...extra(c) })
      mapa.get(k).totales.push(c.total)
    }
    return new Map([...mapa].map(([k, v]) => [k, { ...v, catedras: v.totales.length, promedio: promedio(v.totales) }]))
  }

  const porProfesor = agrupar(
    (c) => c.profesor_id,
    (c) => ({ profesor: c.profesor, carreras: new Set(), sedes: new Set() }),
  )
  for (const c of lista) {
    porProfesor.get(c.profesor_id).carreras.add(c.carrera)
    porProfesor.get(c.profesor_id).sedes.add(c.sede)
  }

  const escala = ESCALA.map((e) => ({ nombre: e.nombre, catedras: 0 }))
  for (const c of lista) escala.find((e) => e.nombre === clasificar(c.total)).catedras += 1

  return {
    catedras: lista.length,
    promedio: promedio(lista.map((c) => c.total)),
    porClave: agrupar((c) => clave(c.carrera, c.sede), (c) => ({ carrera: c.carrera, sede: c.sede })),
    porCarrera: agrupar((c) => c.carrera, (c) => ({ nombre: c.carrera })),
    porSede: agrupar((c) => c.sede, (c) => ({ nombre: c.sede })),
    porProfesor,
    escala,
    criterios: [...criterios.values()]
      .map((c) => ({ nombre: c.nombre, orden: c.orden, peso: c.peso, obtenido: c.catedras.size ? c.obtenido / c.catedras.size : 0 }))
      .sort((a, b) => a.orden - b.orden),
  }
}
