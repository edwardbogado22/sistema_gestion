import { useState } from 'react'
import { bloquesDe, trozosDe, videoIncrustable } from '../lib/manual'

// Un manual tal como lo ve el usuario: los videos arriba y el paso a paso
// abajo. Una marca [1:45] en el texto es un botón que lleva el video
// elegido a ese minuto (solo YouTube permite empezar en un segundo dado).
export function ManualContenido({ manual }) {
  const videos = (manual.videos || []).filter((v) => v?.url?.trim())
  const [actual, setActual] = useState(0)
  // `salto` cambia la key del iframe para recargarlo en el segundo pedido.
  const [salto, setSalto] = useState({ segundos: 0, n: 0 })

  const video = videos[Math.min(actual, videos.length - 1)]
  const incrustable = video ? videoIncrustable(video.url, salto.segundos, salto.n > 0) : null
  const admiteSalto = incrustable?.tipo === 'youtube'

  const elegirVideo = (i) => {
    setActual(i)
    setSalto({ segundos: 0, n: 0 })
  }

  const irA = (segundos) => setSalto((s) => ({ segundos, n: s.n + 1 }))

  const linea = (texto) =>
    trozosDe(texto).map((t, i) => {
      if (t.tipo === 'negrita') return <strong key={i}>{t.texto}</strong>
      if (t.tipo === 'tiempo') {
        return admiteSalto ? (
          <button key={i} type="button" className="manual-tiempo" onClick={() => irA(t.segundos)} title="Ver este paso en el video">
            ▶ {t.texto}
          </button>
        ) : (
          <span key={i} className="muted-text">
            ({t.texto})
          </span>
        )
      }
      return t.texto
    })

  return (
    <div className="manual-contenido">
      {manual.resumen && <p className="manual-resumen">{manual.resumen}</p>}

      {videos.length > 0 && (
        <div className="manual-videos">
          {videos.length > 1 && (
            <div className="manual-videos-lista">
              {videos.map((v, i) => (
                <button
                  key={i}
                  type="button"
                  className={`btn btn-sm ${i === actual ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => elegirVideo(i)}
                >
                  🎬 {v.titulo || `Video ${i + 1}`}
                </button>
              ))}
            </div>
          )}
          {incrustable ? (
            <div className="manual-video">
              <iframe
                key={`${actual}-${salto.n}`}
                src={incrustable.src}
                title={video.titulo || manual.titulo}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          ) : (
            <p>
              <a href={video.url} target="_blank" rel="noreferrer">
                🎬 {video.titulo || 'Ver el video'}
              </a>
            </p>
          )}
          {videos.length === 1 && video.titulo && <p className="muted-text manual-video-titulo">{video.titulo}</p>}
        </div>
      )}

      {bloquesDe(manual.contenido).map((b, i) => {
        if (b.tipo === 'subtitulo') return <h3 key={i}>{linea(b.texto)}</h3>
        if (b.tipo === 'pasos')
          return (
            <ol key={i} className="manual-pasos">
              {b.items.map((it, j) => (
                <li key={j}>{linea(it)}</li>
              ))}
            </ol>
          )
        if (b.tipo === 'vinetas')
          return (
            <ul key={i}>
              {b.items.map((it, j) => (
                <li key={j}>{linea(it)}</li>
              ))}
            </ul>
          )
        if (b.tipo === 'imagen') return <img key={i} className="manual-imagen" src={b.url} alt="" loading="lazy" />
        return <p key={i}>{linea(b.texto)}</p>
      })}
    </div>
  )
}
