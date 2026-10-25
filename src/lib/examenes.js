// Llamados de examen: el período en curso, el llamado en foco y el
// avance de carga. Lo usan el calendario de Llamados y el Inicio.
import { deISO } from './fechas'

const TIPOS = {
  ORDINARIO: 'Ordinario',
  COMPLEMENTARIO: 'Complementario',
  REGULARIZACION: 'Regularización',
}

const DIA = 24 * 60 * 60 * 1000

export const diasEntre = (desde, hasta) => Math.round((deISO(hasta) - deISO(desde)) / DIA)
export const nombreLlamado = (l) => TIPOS[l.tipo] || l.nombre

// Llamado en foco: el primero que todavía no terminó. Período: el de ese
// llamado; si ya terminaron todos, el del último llamado.
export function periodoDeExamenes(llamados, hoy) {
  const ordenados = [...llamados].sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))
  const foco = ordenados.find((l) => l.fecha_fin >= hoy) || null
  const periodo = foco?.periodo_lectivo ?? ordenados.at(-1)?.periodo_lectivo
  return { foco, delPeriodo: ordenados.filter((l) => l.periodo_lectivo === periodo) }
}

// Suma v_examen_avance (una fila por carrera y sede) por llamado.
export function avancePorLlamado(filas) {
  const mapa = new Map()
  for (const a of filas || []) {
    const acc = mapa.get(a.llamado_id) || { total: 0, con_fecha: 0, sin_fecha: 0 }
    acc.total += Number(a.total)
    acc.con_fecha += Number(a.con_fecha)
    acc.sin_fecha += Number(a.sin_fecha)
    mapa.set(a.llamado_id, acc)
  }
  return mapa
}
