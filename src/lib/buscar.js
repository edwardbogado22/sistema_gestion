// Compara ignorando el orden de las palabras: "Celmira Pacheco" debe encontrar
// a alguien guardado como "Pacheco, Celmira" (apellido primero).
export function coincideTexto(query, texto) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const t = (texto || '').toLowerCase()
  return q.split(/\s+/).every((palabra) => t.includes(palabra))
}
