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

export function descargarCSV(nombreArchivo, columnas, filaEjemplo) {
  const csv = Papa.unparse(filaEjemplo ? [columnas, filaEjemplo] : [columnas])
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  a.click()
  URL.revokeObjectURL(url)
}
