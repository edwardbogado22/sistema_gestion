import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { pantallaDe } from '../../lib/manual'
import { formatoLargo } from '../../lib/fechas'
import { ManualContenido } from '../../components/ManualContenido'

export function VerManual() {
  const { id } = useParams()
  const { esAdmin } = useAuth()
  const [manual, setManual] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('manual')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        else setManual(data)
        setLoading(false)
      })
  }, [id])

  if (loading) return <p className="page-padding muted-text">Cargando...</p>

  if (error || !manual) {
    return (
      <div className="page-padding">
        <p className="error-text">{error || 'Este manual no existe o todavía no está publicado.'}</p>
        <Link to="/ayuda">← Volver al centro de ayuda</Link>
      </div>
    )
  }

  const pantalla = pantallaDe(manual.pantalla)

  return (
    <div className="page-padding">
      <p className="no-print" style={{ margin: '0 0 12px' }}>
        <Link to="/ayuda">← Centro de ayuda</Link>
      </p>
      <div className="page-header">
        <h1>{manual.titulo}</h1>
        <p>
          {pantalla && pantalla.to !== 'general' ? (
            <>
              Pantalla:{' '}
              <Link to={pantalla.to}>
                {pantalla.icon} {pantalla.titulo}
              </Link>
              {' · '}
            </>
          ) : null}
          Actualizado el {formatoLargo(manual.actualizado_en?.slice(0, 10))}
          {!manual.publicado && (
            <>
              {' '}
              <span className="badge badge-muted">Borrador</span>
            </>
          )}
        </p>
      </div>

      <div className="form-actions no-print" style={{ marginBottom: 16 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
          Imprimir o guardar PDF
        </button>
        {esAdmin && (
          <Link to={`/ayuda/${manual.id}/editar`} className="btn btn-secondary btn-sm">
            Editar
          </Link>
        )}
      </div>

      <div className="form-card manual-card">
        <ManualContenido manual={manual} />
      </div>
    </div>
  )
}
