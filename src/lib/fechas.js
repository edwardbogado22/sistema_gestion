// Se trabaja siempre con 'YYYY-MM-DD' y fechas locales armadas a mano.
// new Date('2026-06-18') se interpreta como UTC y en Paraguay cae un día
// antes; de ahí que no se use en ningún lado.

export const aISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const deISO = (s) => {
  const [a, m, d] = s.split('-').map(Number)
  return new Date(a, m - 1, d)
}

export const formatoCorto = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '')

export const formatoLargo = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '')
