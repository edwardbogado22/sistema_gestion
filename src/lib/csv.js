import Papa from 'papaparse'

export function normalizar(valor) {
  return (valor || '').toString().trim().toLowerCase().normalize('NFC')
}

export function parseArchivo(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => resolve(results.data),
      error: reject,
    })
  })
}

function descargar(nombreArchivo, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  a.click()
  URL.revokeObjectURL(url)
}

// Plantilla vacía: recibe los nombres de columna, no filas de datos.
export function descargarCSV(nombreArchivo, columnas, filaEjemplo) {
  descargar(nombreArchivo, Papa.unparse(filaEjemplo ? [columnas, filaEjemplo] : [columnas]))
}

// Exportación de datos: array de objetos, los encabezados salen de las claves.
export function descargarFilas(nombreArchivo, filas) {
  descargar(nombreArchivo, Papa.unparse(filas))
}
