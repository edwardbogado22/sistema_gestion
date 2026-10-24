// Manual de usuario: a qué pantallas puede pertenecer un manual, cómo se
// incrusta un video y cómo se interpreta el texto del contenido. La tabla
// es `manual` (migracion_manual_usuario.sql).
import { AREAS, areasVisibles } from './navegacion'

// Manuales que no son de una pantalla puntual (primeros pasos, etc.): los
// ve cualquiera con sesión.
export const GENERAL = 'general'

const ITEM_GENERAL = { to: GENERAL, icon: '📘', titulo: 'Primeros pasos y temas generales', area: 'General' }

const conArea = (areas) =>
  areas.flatMap((area) => area.items.map((item) => ({ to: item.to, icon: item.icon, titulo: item.titulo, area: area.titulo })))

// Todas las pantallas del menú, para elegir a cuál pertenece un manual.
export const PANTALLAS = [ITEM_GENERAL, ...conArea(AREAS)]

// Pantallas que el rol tiene en su menú: un manual solo se le muestra si
// es de una de estas (o general). Mismo criterio que el menú.
export function pantallasDelRol(rol) {
  return [ITEM_GENERAL, ...conArea(areasVisibles(rol))]
}

export const pantallaDe = (to) => PANTALLAS.find((p) => p.to === to)

// Para el buscador: sin mayúsculas ni tildes ("asignación" = "asignacion").
export const paraBuscar = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

// "1:45" → 105, "1:02:03" → 3723. null si no es un tiempo.
export function aSegundos(texto) {
  const partes = String(texto).trim().split(':')
  if (partes.length < 2 || partes.length > 3 || partes.some((p) => !/^\d+$/.test(p))) return null
  return partes.reduce((total, p) => total * 60 + Number(p), 0)
}

// URL que se puede poner en un <iframe>, o null si el enlace no es de un
// servicio conocido (en ese caso se muestra como enlace común).
// YouTube admite empezar en un segundo dado; Drive no.
export function videoIncrustable(url, inicio = 0, reproducir = false) {
  let u
  try {
    u = new URL(String(url).trim())
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\.|^m\./, '')

  let idYoutube = null
  if (host === 'youtu.be') idYoutube = u.pathname.slice(1)
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') idYoutube = u.searchParams.get('v')
    else {
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([^/]+)/)
      if (m) idYoutube = m[2]
    }
  }
  if (idYoutube && /^[\w-]{6,}$/.test(idYoutube)) {
    const params = new URLSearchParams({ rel: '0' })
    if (inicio > 0) params.set('start', String(inicio))
    if (reproducir) params.set('autoplay', '1')
    return { tipo: 'youtube', src: `https://www.youtube-nocookie.com/embed/${idYoutube}?${params}` }
  }

  if (host === 'drive.google.com') {
    const m = u.pathname.match(/\/file\/d\/([^/]+)/)
    const id = m ? m[1] : u.searchParams.get('id')
    if (id) return { tipo: 'drive', src: `https://drive.google.com/file/d/${id}/preview` }
  }

  return null
}

const ES_IMAGEN = /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i

// Convierte el texto del manual en bloques: subtítulos ("## "), pasos
// numerados ("1. "), viñetas ("- "), imágenes (una línea que es solo la
// URL de una imagen) y párrafos. Las líneas seguidas del mismo tipo de
// lista forman una sola lista.
export function bloquesDe(contenido) {
  const bloques = []
  let parrafo = []
  const cerrarParrafo = () => {
    if (parrafo.length) bloques.push({ tipo: 'parrafo', texto: parrafo.join(' ') })
    parrafo = []
  }
  const agregarALista = (tipo, texto) => {
    const ultimo = bloques[bloques.length - 1]
    if (ultimo && ultimo.tipo === tipo) ultimo.items.push(texto)
    else bloques.push({ tipo, items: [texto] })
  }

  for (const cruda of String(contenido || '').split(/\r?\n/)) {
    const linea = cruda.trim()
    let m
    if (!linea) cerrarParrafo()
    else if ((m = linea.match(/^#{2,3}\s+(.*)$/))) {
      cerrarParrafo()
      bloques.push({ tipo: 'subtitulo', texto: m[1] })
    } else if ((m = linea.match(/^\d+[.)]\s+(.*)$/))) {
      cerrarParrafo()
      agregarALista('pasos', m[1])
    } else if ((m = linea.match(/^[-*•]\s+(.*)$/))) {
      cerrarParrafo()
      agregarALista('vinetas', m[1])
    } else if (ES_IMAGEN.test(linea)) {
      cerrarParrafo()
      bloques.push({ tipo: 'imagen', url: linea })
    } else parrafo.push(linea)
  }
  cerrarParrafo()
  return bloques
}

// Parte una línea en trozos de texto, **negrita** y marcas de tiempo [1:45].
export function trozosDe(texto) {
  const trozos = []
  const re = /\*\*(.+?)\*\*|\[(\d{1,2}(?::\d{2}){1,2})\]/g
  let desde = 0
  let m
  while ((m = re.exec(texto))) {
    if (m.index > desde) trozos.push({ tipo: 'texto', texto: texto.slice(desde, m.index) })
    if (m[1] !== undefined) trozos.push({ tipo: 'negrita', texto: m[1] })
    else trozos.push({ tipo: 'tiempo', texto: m[2], segundos: aSegundos(m[2]) })
    desde = re.lastIndex
  }
  if (desde < texto.length) trozos.push({ tipo: 'texto', texto: texto.slice(desde) })
  return trozos
}
