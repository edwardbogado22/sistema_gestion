// Escala de la encuesta a alumnos: cada ítem se responde con un nivel de 1 a
// 3 y lo que se carga por cátedra es el promedio de esos niveles. Puntúa
// igual que el sistema de evaluación docente desde 2021: nivel 1 = 0 % del
// peso del ítem, nivel 2 = 50 %, nivel 3 = 100 %.
export const NIVEL_MIN = 1
export const NIVEL_MAX = 3

export function obtenidoEncuesta(nivel, pesoPorcentaje) {
  const fraccion = (Number(nivel) - NIVEL_MIN) / (NIVEL_MAX - NIVEL_MIN)
  return Math.round(fraccion * Number(pesoPorcentaje) * 100) / 100
}
