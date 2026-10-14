// PostgREST corta cualquier select en 1000 filas por defecto (db.max_rows),
// sin avisar: un .select() que vuelve exactamente 1000 filas probablemente
// está truncado, no es casualidad. mesa_integrante ya superó esa marca acá
// (2 vocales × >500 mesas), y una página que confía en ese fetch completo
// (para saber quién ya es vocal, o para imprimir el reporte final) termina
// tratando filas reales como si no existieran.
//
// `construir(desde, hasta)` arma la query de cero en cada vuelta (no se
// puede reusar un query builder de supabase-js ya resuelto) con `.range()`
// aplicado; se seguimos pidiendo páginas de `pageSize` hasta que vuelva una
// más corta.
//
// La query TIENE que llevar un .order() sobre una columna única (el id):
// cada página es un select aparte y, sin orden explícito, Postgres puede
// devolver las filas en otro orden en cada uno. Ahí una misma fila sale en
// dos páginas y otra no sale en ninguna — mesas completas que aparecen sin
// vocales, o con el mismo vocal dos veces.
export async function fetchTodo(construir, pageSize = 1000) {
  let desde = 0
  let todas = []
  for (;;) {
    const { data, error } = await construir(desde, desde + pageSize - 1)
    if (error) return { data: null, error }
    todas = todas.concat(data || [])
    if (!data || data.length < pageSize) break
    desde += pageSize
  }
  return { data: todas, error: null }
}
