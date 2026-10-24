import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { GENERAL } from '../lib/manual'
import { ManualContenido } from './ManualContenido'

// Panel lateral del botón "?": los manuales de la pantalla en la que está
// el usuario (en el inicio, los generales). Si hay uno solo se abre
// directo; si hay varios, se elige de la lista.
export function PanelAyuda({ item, esAdmin, onCerrar }) {
  const pantalla = item?.to || GENERAL
  const [manuales, setManuales] = useState(null)
  const [elegido, setElegido] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('manual')
      .select('*')
      .eq('pantalla', pantalla)
      .order('orden')
      .order('titulo')
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        const lista = data || []
        setManuales(lista)
        setElegido(lista.length === 1 ? lista[0] : null)
      })
  }, [pantalla])

  useEffect(() => {
    const onTecla = (e) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', onTecla)
    return () => document.removeEventListener('keydown', onTecla)
  }, [onCerrar])

  return (
    <div className="panel-ayuda-fondo no-print" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <aside className="panel-ayuda" role="dialog" aria-label="Ayuda de esta pantalla">
        <div className="panel-ayuda-cabecera">
          <div>
            <p className="manual-eyebrow">Ayuda</p>
            <strong>{elegido ? elegido.titulo : item ? item.titulo : 'Primeros pasos'}</strong>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCerrar} aria-label="Cerrar ayuda">
            ✕
          </button>
        </div>

        <div className="panel-ayuda-cuerpo">
          {error && <p className="error-text">{error}</p>}
          {manuales === null && <p className="muted-text">Cargando...</p>}

          {manuales?.length === 0 && (
            <p className="muted-text">Todavía no hay un manual para esta pantalla.</p>
          )}

          {elegido ? (
            <>
              {manuales.length > 1 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setElegido(null)}>
                  ← Otros manuales de esta pantalla
                </button>
              )}
              {!elegido.publicado && <span className="badge badge-muted">Borrador</span>}
              <ManualContenido key={elegido.id} manual={elegido} />
            </>
          ) : (
            manuales?.length > 1 && (
              <div className="ayuda-lista">
                {manuales.map((m) => (
                  <button key={m.id} type="button" className="ayuda-item ayuda-item-boton" onClick={() => setElegido(m)}>
                    <span className="ayuda-item-titulo">{m.titulo}</span>
                    {m.videos?.length > 0 && <span className="badge badge-gold">🎬 Video</span>}
                    {!m.publicado && <span className="badge badge-muted">Borrador</span>}
                    {m.resumen && <span className="muted-text">{m.resumen}</span>}
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        <div className="panel-ayuda-pie">
          {elegido && (
            <Link to={`/ayuda/${elegido.id}`} onClick={onCerrar}>
              Abrir en pantalla completa
            </Link>
          )}
          <Link to="/ayuda" onClick={onCerrar}>
            Centro de ayuda
          </Link>
          {esAdmin && (
            <Link to={`/ayuda/nuevo?pantalla=${encodeURIComponent(pantalla)}`} onClick={onCerrar}>
              + Manual para esta pantalla
            </Link>
          )}
        </div>
      </aside>
    </div>
  )
}
