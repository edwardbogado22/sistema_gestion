import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { GENERAL, PANTALLAS, videoIncrustable } from '../../lib/manual'
import { ManualContenido } from '../../components/ManualContenido'

const EJEMPLO = `## Antes de empezar
El llamado tiene que estar en **Asignación abierta**.

## Paso a paso
1. Entrá a Mesas → Llamados y fechas de examen. [0:05]
2. Elegí el llamado y tocá **Cargar fechas**. [0:20]
3. Para cada materia, elegí el día en el calendario. [0:45]

## Errores comunes
- "Choca con otra mesa del profesor": elegí otro día.`

const vacio = (pantalla) => ({
  pantalla: pantalla || GENERAL,
  titulo: '',
  resumen: '',
  contenido: '',
  videos: [],
  orden: 0,
  publicado: false,
})

// Pantallas agrupadas por área para el <select>.
const areasPantallas = PANTALLAS.reduce((acc, p) => {
  const grupo = acc.find((g) => g.area === p.area)
  if (grupo) grupo.items.push(p)
  else acc.push({ area: p.area, items: [p] })
  return acc
}, [])

// Alta y edición de un manual (solo Dirección Académica). La vista previa
// usa el mismo componente que ve el usuario.
export function EditarManual() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [form, setForm] = useState(() => vacio(searchParams.get('pantalla')))
  const [loading, setLoading] = useState(Boolean(id))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    if (!id) return
    supabase
      .from('manual')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (e || !data) setError(e?.message || 'No se encontró el manual.')
        else
          setForm({
            pantalla: data.pantalla,
            titulo: data.titulo,
            resumen: data.resumen || '',
            contenido: data.contenido,
            videos: data.videos || [],
            orden: data.orden,
            publicado: data.publicado,
          })
        setLoading(false)
      })
  }, [id])

  const set = (campo, valor) => {
    setAviso('')
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  const setVideo = (i, campo, valor) =>
    set(
      'videos',
      form.videos.map((v, j) => (j === i ? { ...v, [campo]: valor } : v)),
    )

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    setGuardando(true)
    const fila = {
      pantalla: form.pantalla,
      titulo: form.titulo.trim(),
      resumen: form.resumen.trim() || null,
      contenido: form.contenido,
      videos: form.videos
        .map((v) => ({ titulo: (v.titulo || '').trim(), url: (v.url || '').trim() }))
        .filter((v) => v.url),
      orden: Number(form.orden) || 0,
      publicado: form.publicado,
      actualizado_en: new Date().toISOString(),
      actualizado_por: user.id,
    }
    const { data, error: eGuardar } = id
      ? await supabase.from('manual').update(fila).eq('id', id).select('id').single()
      : await supabase.from('manual').insert(fila).select('id').single()
    setGuardando(false)
    if (eGuardar) {
      setError(eGuardar.message)
      return
    }
    if (!id) navigate(`/ayuda/${data.id}/editar`, { replace: true })
    setAviso(form.publicado ? 'Guardado y publicado.' : 'Guardado como borrador.')
  }

  const eliminar = async () => {
    if (!window.confirm(`¿Eliminar el manual "${form.titulo}"? No se puede deshacer.`)) return
    const { error: eBorrar } = await supabase.from('manual').delete().eq('id', id)
    if (eBorrar) {
      setError(eBorrar.message)
      return
    }
    navigate('/ayuda')
  }

  if (loading) return <p className="page-padding muted-text">Cargando...</p>

  return (
    <div className="page-padding">
      <p style={{ margin: '0 0 12px' }}>
        <Link to="/ayuda">← Centro de ayuda</Link>
        {id && (
          <>
            {' · '}
            <Link to={`/ayuda/${id}`}>Ver como usuario</Link>
          </>
        )}
      </p>
      <div className="page-header">
        <h1>{id ? 'Editar manual' : 'Nuevo manual'}</h1>
        <p>Lo ven solo los usuarios que tienen esa pantalla en su menú, y solo cuando está publicado.</p>
      </div>

      <div className="manual-editor">
        <form onSubmit={guardar} className="form-card">
          <div className="form-grid">
            <label>
              Pantalla
              <select value={form.pantalla} onChange={(e) => set('pantalla', e.target.value)}>
                {areasPantallas.map((g) => (
                  <optgroup key={g.area} label={g.area}>
                    {g.items.map((p) => (
                      <option key={p.to} value={p.to}>
                        {p.titulo}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              Orden en la lista
              <input type="number" value={form.orden} onChange={(e) => set('orden', e.target.value)} />
            </label>
          </div>

          <div className="form-grid manual-campo-ancho">
            <label>
              Título
              <input
                value={form.titulo}
                onChange={(e) => set('titulo', e.target.value)}
                placeholder="Cómo cargar las fechas de examen"
                required
              />
            </label>
            <label>
              Resumen (una línea)
              <input
                value={form.resumen}
                onChange={(e) => set('resumen', e.target.value)}
                placeholder="Para qué sirve y cuándo se usa"
              />
            </label>
          </div>

          <h3 className="manual-editor-seccion">Videos</h3>
          <p className="muted-text manual-editor-ayuda">
            Enlace de YouTube (puede ser «No listado») o de Google Drive (compartido con «Cualquier persona con el enlace»).
          </p>
          {form.videos.map((v, i) => {
            const reconocido = v.url?.trim() ? videoIncrustable(v.url) : null
            return (
              <div key={i} className="form-row manual-video-fila">
                <input
                  value={v.titulo || ''}
                  onChange={(e) => setVideo(i, 'titulo', e.target.value)}
                  placeholder="Título del video"
                  style={{ flex: '1 1 160px' }}
                />
                <input
                  value={v.url || ''}
                  onChange={(e) => setVideo(i, 'url', e.target.value)}
                  placeholder="https://youtu.be/..."
                  style={{ flex: '2 1 240px' }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    set(
                      'videos',
                      form.videos.filter((_, j) => j !== i),
                    )
                  }
                >
                  Quitar
                </button>
                {v.url?.trim() && !reconocido && (
                  <span className="muted-text manual-editor-ayuda">
                    No es de YouTube ni de Drive: se va a mostrar como enlace.
                  </span>
                )}
              </div>
            )
          })}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => set('videos', [...form.videos, { titulo: '', url: '' }])}
          >
            + Agregar video
          </button>

          <h3 className="manual-editor-seccion">Contenido</h3>
          <details className="manual-editor-ayuda">
            <summary>Cómo dar formato</summary>
            <ul>
              <li>
                <code>## Título</code> para un subtítulo
              </li>
              <li>
                <code>1. Paso</code> para pasos numerados, <code>- Ítem</code> para viñetas
              </li>
              <li>
                <code>**texto**</code> para <strong>negrita</strong>
              </li>
              <li>
                <code>[1:45]</code> en un paso: botón que lleva el video a ese minuto (solo YouTube)
              </li>
              <li>Una línea con solo la dirección de una imagen (.png, .jpg, .gif) la muestra</li>
              <li>Una línea vacía separa párrafos</li>
            </ul>
            {!form.contenido && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => set('contenido', EJEMPLO)}>
                Usar un ejemplo
              </button>
            )}
          </details>
          <textarea
            className="manual-editor-texto"
            value={form.contenido}
            onChange={(e) => set('contenido', e.target.value)}
            rows={18}
          />

          <label className="manual-publicado">
            <input type="checkbox" checked={form.publicado} onChange={(e) => set('publicado', e.target.checked)} />
            Publicado (si no, queda como borrador y solo lo ve Dirección Académica)
          </label>

          {error && <p className="error-text">{error}</p>}
          {aviso && <p className="manual-aviso-ok">{aviso}</p>}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
            {id && (
              <button type="button" className="btn btn-danger" onClick={eliminar}>
                Eliminar
              </button>
            )}
          </div>
        </form>

        <div className="form-card manual-card manual-vista-previa">
          <p className="manual-eyebrow">Vista previa</p>
          <h2>{form.titulo || 'Sin título'}</h2>
          <ManualContenido manual={form} />
        </div>
      </div>
    </div>
  )
}
