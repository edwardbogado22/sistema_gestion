import { Link } from 'react-router-dom'
import { aISO, deISO, formatoCorto } from '../lib/fechas'
import { diasEntre, nombreLlamado, periodoDeExamenes } from '../lib/examenes'

const ESTADOS = {
  BORRADOR: { texto: 'En preparación', detalle: 'todavía no se abrió la carga de fechas' },
  ASIGNACION: { texto: 'Carga abierta', detalle: 'los profesores todavía no lo ven' },
  APROBADO: { texto: 'Publicado', detalle: 'los profesores ya ven sus mesas' },
  CERRADO: { texto: 'Cerrado', detalle: 'ya no admite cambios' },
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DIA = 24 * 60 * 60 * 1000

// Los llamados del período sobre una línea de tiempo, con la marca de hoy
// y la cuenta regresiva del llamado en foco. `avance` es el de ese
// llamado (v_examen_avance respeta el alcance: el secretario ve lo suyo).
export function CalendarioExamenes({ llamados, avance, rol }) {
  const hoy = aISO(new Date())
  const { foco, delPeriodo } = periodoDeExamenes(llamados, hoy)
  if (delPeriodo.length === 0) return null

  const desde = [hoy, ...delPeriodo.map((l) => l.fecha_inicio)].sort()[0]
  const hasta = [hoy, ...delPeriodo.map((l) => l.fecha_fin)].sort().at(-1)
  // margen a los costados para que nada quede pegado al borde
  const inicio = aISO(new Date(deISO(desde).getTime() - 6 * DIA))
  const total = diasEntre(inicio, hasta) + 8
  const pos = (iso) => `${(100 * diasEntre(inicio, iso)) / total}%`
  const ancho = (a, b) => `${(100 * (diasEntre(a, b) + 1)) / total}%`

  const meses = []
  const cursor = deISO(inicio)
  cursor.setDate(1)
  cursor.setMonth(cursor.getMonth() + 1)
  while (diasEntre(inicio, aISO(cursor)) < total) {
    meses.push({ iso: aISO(cursor), texto: MESES[cursor.getMonth()] })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  let titular
  if (!foco) titular = <>Los exámenes del período {delPeriodo[0].periodo_lectivo} terminaron</>
  else if (hoy < foco.fecha_inicio) {
    const n = diasEntre(hoy, foco.fecha_inicio)
    titular = (
      <>
        {n === 1 ? 'Falta' : 'Faltan'} <em>{n}</em> {n === 1 ? 'día' : 'días'} para el {nombreLlamado(foco)}
      </>
    )
  } else {
    const n = diasEntre(hoy, foco.fecha_fin)
    titular =
      n === 0 ? (
        <>Hoy termina el {nombreLlamado(foco)}</>
      ) : (
        <>
          {nombreLlamado(foco)} en curso: {n === 1 ? 'queda' : 'quedan'} <em>{n}</em> {n === 1 ? 'día' : 'días'}
        </>
      )
  }

  const estado = foco ? ESTADOS[foco.estado] : null
  const porcentaje = avance?.total ? Math.floor((100 * avance.con_fecha) / avance.total) : null
  const accion = foco && {
    to: `/examenes/${foco.id}`,
    texto: rol === 'SECRETARIO' && foco.estado === 'ASIGNACION' ? 'Cargar mis fechas' : 'Abrir panel de fechas',
  }

  return (
    <section className="periodo-panel" aria-labelledby="periodo-titular">
      <h2 id="periodo-titular" className="periodo-titular">
        {titular}
      </h2>
      {foco && (
        <p className="periodo-bajada">
          {nombreLlamado(foco)} {foco.periodo_lectivo}: del {formatoCorto(foco.fecha_inicio)} al{' '}
          {formatoCorto(foco.fecha_fin)}
        </p>
      )}

      <div
        className="periodo-linea"
        role="img"
        aria-label={delPeriodo
          .map((l) => `${nombreLlamado(l)} del ${formatoCorto(l.fecha_inicio)} al ${formatoCorto(l.fecha_fin)}`)
          .join(', ')}
      >
        <div className="periodo-linea-eje" />
        {meses.map((m) => (
          <span key={m.iso} className="periodo-mes" style={{ left: pos(m.iso) }}>
            {m.texto}
          </span>
        ))}
        {delPeriodo.map((l, i) => (
          <div key={l.id}>
            <div
              className={`periodo-tramo${l === foco ? ' foco' : ''}${l.fecha_fin < hoy ? ' pasado' : ''}`}
              style={{ left: pos(l.fecha_inicio), width: ancho(l.fecha_inicio, l.fecha_fin), '--orden': i }}
            />
            <span className="periodo-tramo-texto" style={{ left: pos(l.fecha_inicio), '--orden': i }}>
              <strong>{nombreLlamado(l)}</strong>
              {formatoCorto(l.fecha_inicio)} al {formatoCorto(l.fecha_fin)}
            </span>
          </div>
        ))}
        <div className="periodo-hoy" style={{ left: pos(hoy) }}>
          <span>Hoy</span>
        </div>
      </div>

      <ul className="periodo-leyenda">
        {delPeriodo.map((l) => (
          <li key={l.id} className={l === foco ? 'foco' : ''}>
            <strong>{nombreLlamado(l)}</strong>
            <span>
              {formatoCorto(l.fecha_inicio)} al {formatoCorto(l.fecha_fin)}
            </span>
          </li>
        ))}
      </ul>

      {foco && (
        <div className="periodo-estado">
          <div className="periodo-dato">
            <b>{avance ? avance.con_fecha : '—'}</b>
            <small>{rol === 'SECRETARIO' ? 'de tus mesas con fecha' : 'mesas con fecha'}</small>
          </div>
          <div className="periodo-dato">
            <b>{porcentaje === null ? '—' : `${porcentaje}%`}</b>
            <small>de las materias con fecha</small>
          </div>
          <div className="periodo-dato">
            <b>{estado?.texto || foco.estado}</b>
            <small>{estado?.detalle}</small>
          </div>
          <Link to={accion.to} className="periodo-accion">
            {accion.texto}
          </Link>
        </div>
      )}
    </section>
  )
}
