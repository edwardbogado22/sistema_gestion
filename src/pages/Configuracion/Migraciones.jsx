import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const formatoFechaHora = (ts) =>
  ts ? new Date(ts).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export function Migraciones() {
  const [filas, setFilas] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('schema_migrations')
      .select('*')
      .order('aplicada_en', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setFilas(data || [])
        setLoading(false)
      })
  }, [])

  const q = busqueda.trim().toLowerCase()
  const visibles = q ? filas.filter((f) => f.nombre.toLowerCase().includes(q) || f.notas?.toLowerCase().includes(q)) : filas

  if (loading) return <p className="muted-text">Cargando...</p>
  if (error) return <p className="error-text">{error}</p>

  return (
    <div>
      <p className="muted-text" style={{ margin: '0 0 12px' }}>
        Migraciones SQL aplicadas a esta base — {filas.length} en total. Cada migración nueva se registra sola al
        correrla en el SQL Editor de Supabase.
      </p>

      <div className="form-row" style={{ marginBottom: 16 }}>
        <label style={{ flex: '1 1 260px' }}>
          Buscar
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre de archivo o nota..." />
        </label>
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Archivo</th>
              <th style={{ width: 180 }}>Aplicada</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.id}>
                <td>
                  <code>{f.nombre}</code>
                </td>
                <td>{formatoFechaHora(f.aplicada_en)}</td>
                <td className="muted-text">{f.notas || '—'}</td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={3} className="muted-text">
                  Ninguna migración coincide con la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
