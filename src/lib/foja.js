// Escala valorativa de la Foja de Desempeño (Resolución 054/2021): el total
// se redondea al entero a favor del profesor antes de clasificar.
export const ESCALA = [
  { desde: 91, nombre: 'Excelente' },
  { desde: 80, nombre: 'Muy bueno' },
  { desde: 70, nombre: 'Bueno' },
  { desde: 60, nombre: 'Necesita mejorar' },
  { desde: -Infinity, nombre: 'No cumple' },
]

export function clasificar(total) {
  const t = Math.round(total)
  return ESCALA.find((e) => t >= e.desde).nombre
}
