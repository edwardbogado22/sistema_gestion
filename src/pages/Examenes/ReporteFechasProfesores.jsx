import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fetchTodo } from '../../lib/paginar'
import { formatoLargo } from '../../lib/fechas'
import { descargarFilas } from '../../lib/csv'
import { diaSemana, diaSemanaNumero } from '../../lib/vocalesExamen'

const TIPOS = {
  ORDINARIO: 'Ordinario',
  COMPLEMENTARIO: 'Complementario',
  REGULARIZACION: 'Regularización',
}

// Cada mesa la integran el titular y dos vocales
const POR_MESA = 3

const hoy = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// Mismo orden que la numeración de actas: carrera y, dentro, Sede Central
// primero y después las filiales.
const ordenBloque = (a, b) =>
  a.carrera.localeCompare(b.carrera) ||
  (a.sede === 'Sede Central' ? 0 : 1) - (b.sede === 'Sede Central' ? 0 : 1) ||
  a.sede.localeCompare(b.sede)

/**
 * Fechas de examen por carrera y sede, con cuántos exámenes hay cada día
 * y cuántos profesores están disponibles para integrar las mesas. Sirve
 * para justificar la convocatoria de profesores y el reparto de mesas.
 *
 * Plantel de una carrera en una sede: los profesores que presiden alguna
 * mesa de esa carrera ahí en el llamado. De cada uno se mira, para cada
 * fecha, por qué va a la sede ese día:
 *   - del día: tiene clase en esa carrera ese día de la semana, o preside
 *     una mesa de esa carrera ese día;
 *   - adicional: no le toca por esa carrera, pero ese día va a la sede por
 *     otra carrera (clase o mesa);
 *   - si no va a la sede ese día, no se cuenta.
 * Quien cargó ese día como no disponible no se cuenta.
 */
export function ReporteFechasProfesores() {
  const { llamadoId } = useParams()
  const [llamado, setLlamado] = useState(null)
  const [mesas, setMesas] = useState([])
  const [vocales, setVocales] = useState(new Map())
  const [presencia, setPresencia] = useState(new Set())
  const [noDisponible, setNoDisponible] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError('')
      const { data: ll, error: eLl } = await supabase.from('examen_llamado').select('*').eq('id', llamadoId).single()
      if (eLl) {
        setError(eLl.message)
        setLoading(false)
        return
      }
      setLlamado(ll)

      const [ag, integ, hor, nd] = await Promise.all([
        fetchTodo((desde, hasta) =>
          supabase
            .from('v_examen_agenda')
            .select('examen_fecha_id, sede_id, sede, carrera_id, carrera, fecha, profesor_id, fecha_estado')
            .eq('llamado_id', llamadoId)
            .not('fecha', 'is', null)
            .order('catedra_id')
            .range(desde, hasta),
        ),
        fetchTodo((desde, hasta) =>
          supabase
            .from('mesa_integrante')
            .select('examen_fecha_id, profesor_id, examen_fecha!inner(llamado_id)')
            .eq('examen_fecha.llamado_id', llamadoId)
            .order('id')
            .range(desde, hasta),
        ),
        fetchTodo((desde, hasta) =>
          supabase
            .from('v_catedra_horario')
            .select('profesor_id, sede_id, carrera_id, dia_semana')
            .eq('periodo_lectivo', ll.periodo_lectivo)
            .order('catedra_id')
            .order('dia_semana')
            .range(desde, hasta),
        ),
        fetchTodo((desde, hasta) =>
          supabase
            .from('profesor_no_disponible')
            .select('profesor_id, fecha')
            .eq('llamado_id', llamadoId)
            .order('id')
            .range(desde, hasta),
        ),
      ])
      const err = ag.error || integ.error || hor.error || nd.error
      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }

      setMesas(ag.data.filter((m) => m.fecha_estado !== 'ANULADA'))

      const porMesa = new Map()
      for (const i of integ.data) {
        if (!porMesa.has(i.examen_fecha_id)) porMesa.set(i.examen_fecha_id, new Set())
        porMesa.get(i.examen_fecha_id).add(i.profesor_id)
      }
      setVocales(porMesa)

      // Claves `${profesor}|${sede}|${carrera}|${dia_semana}`
      setPresencia(new Set(hor.data.map((h) => `${h.profesor_id}|${h.sede_id}|${h.carrera_id}|${h.dia_semana}`)))
      setNoDisponible(new Set(nd.data.map((n) => `${n.profesor_id}|${n.fecha}`)))
      setLoading(false)
    })()
  }, [llamadoId])

  const bloques = useMemo(() => {
    // Quién va a cada sede cada día y por qué carrera, por horario de
    // clases o por presidir una mesa ese día.
    const porCarrera = new Set() // `${profesor}|${sede}|${carrera}|${dia_semana}` o `...|${fecha}`
    const porSede = new Set() // `${profesor}|${sede}|${dia_semana}` o `...|${fecha}`
    for (const k of presencia) {
      porCarrera.add(k)
      const [p, s, , d] = k.split('|')
      porSede.add(`${p}|${s}|${d}`)
    }
    for (const m of mesas) {
      porCarrera.add(`${m.profesor_id}|${m.sede_id}|${m.carrera_id}|${m.fecha}`)
      porSede.add(`${m.profesor_id}|${m.sede_id}|${m.fecha}`)
    }

    const mapa = new Map()
    for (const m of mesas) {
      const k = `${m.sede_id}|${m.carrera_id}`
      if (!mapa.has(k)) {
        mapa.set(k, { sede_id: m.sede_id, sede: m.sede, carrera_id: m.carrera_id, carrera: m.carrera, plantel: new Set(), mesas: [] })
      }
      const b = mapa.get(k)
      b.plantel.add(m.profesor_id)
      b.mesas.push(m)
    }
    return [...mapa.values()]
      .map((b) => {
        const porFecha = new Map()
        for (const m of b.mesas) {
          if (!porFecha.has(m.fecha)) porFecha.set(m.fecha, [])
          porFecha.get(m.fecha).push(m)
        }
        const dias = [...porFecha]
          .sort(([x], [y]) => x.localeCompare(y))
          .map(([fecha, ms]) => {
            const dow = diaSemanaNumero(fecha)
            const convocados = new Set()
            for (const m of ms) {
              convocados.add(m.profesor_id)
              for (const v of vocales.get(m.examen_fecha_id) || []) convocados.add(v)
            }
            let disponibles = 0
            let adicionales = 0
            for (const p of b.plantel) {
              if (noDisponible.has(`${p}|${fecha}`)) continue
              const base = `${p}|${b.sede_id}`
              if (porCarrera.has(`${base}|${b.carrera_id}|${dow}`) || porCarrera.has(`${base}|${b.carrera_id}|${fecha}`)) {
                disponibles++
              } else if (porSede.has(`${base}|${dow}`) || porSede.has(`${base}|${fecha}`)) {
                adicionales++
              }
            }
            return {
              fecha,
              dia: diaSemana(fecha),
              examenes: ms.length,
              lugares: ms.length * POR_MESA,
              convocados: convocados.size,
              disponibles,
              adicionales,
            }
          })
        const examenes = b.mesas.length
        return {
          ...b,
          dias,
          examenes,
          plantelTotal: b.plantel.size,
          maxDia: Math.max(...dias.map((d) => d.examenes)),
          promedio: examenes / dias.length,
        }
      })
      .sort(ordenBloque)
  }, [mesas, vocales, presencia, noDisponible])

  // La misma información, agrupada por fecha: una fila por carrera y sede
  // que toma examen ese día.
  const porFecha = useMemo(() => {
    const mapa = new Map()
    for (const b of bloques) {
      for (const d of b.dias) {
        if (!mapa.has(d.fecha)) mapa.set(d.fecha, { fecha: d.fecha, dia: d.dia, examenes: 0, filas: [] })
        const f = mapa.get(d.fecha)
        f.examenes += d.examenes
        f.filas.push({ ...d, carrera: b.carrera, sede: b.sede, plantel: b.plantelTotal })
      }
    }
    return [...mapa.values()].sort((x, y) => x.fecha.localeCompare(y.fecha))
  }, [bloques])

  const exportar = () => {
    descargarFilas(
      `fechas-y-profesores-${llamado?.nombre || 'llamado'}.csv`,
      porFecha.flatMap((f) =>
        f.filas.map((r) => ({
          fecha: formatoLargo(f.fecha),
          dia: f.dia,
          carrera: r.carrera,
          sede: r.sede,
          examenes: r.examenes,
          lugares_en_mesas: r.lugares,
          total_profesores_de_la_carrera: r.plantel,
          disponibles_de_la_carrera: r.disponibles,
          adicionales_por_otra_carrera: r.adicionales,
        })),
      ),
    )
  }

  if (loading) return <p className="page-padding muted-text">Cargando...</p>
  if (error) return <p className="page-padding error-text">{error}</p>
  if (bloques.length === 0) {
    return <p className="page-padding muted-text">Este llamado todavía no tiene mesas con fecha.</p>
  }

  const total = bloques.reduce(
    (t, b) => ({ examenes: t.examenes + b.examenes, dias: t.dias + b.dias.length }),
    { examenes: 0, dias: 0 },
  )

  return (
    <div className="page-padding foja-desempeno">
      <div className="form-actions no-print" style={{ marginBottom: '1rem', display: 'flex', gap: 8 }}>
        <Link to="/examenes" className="btn btn-secondary">
          Volver
        </Link>
        <button type="button" className="btn btn-secondary" onClick={exportar}>
          Descargar CSV
        </button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>

      <div className="foja-card" style={{ marginBottom: 24 }}>
        <div className="foja-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <img src="/escudo-une.png" alt="Escudo UNE" className="foja-escudo" />
          <div>
            <p className="eyebrow" style={{ color: 'var(--gold)' }}>
              Universidad Nacional del Este
            </p>
            <h2 style={{ margin: '2px 0' }}>Facultad de Ciencias Económicas</h2>
            <p className="muted-text" style={{ margin: 0 }}>
              Dirección Académica
            </p>
          </div>
        </div>

        <h3 style={{ textAlign: 'center', margin: '18px 0 4px' }}>
          Fechas de examen y profesores disponibles — Llamado {TIPOS[llamado.tipo] || llamado.tipo}
        </h3>
        <p style={{ textAlign: 'center', margin: '0 0 18px' }} className="muted-text">
          {llamado.nombre} · Del {formatoLargo(llamado.fecha_inicio)} al {formatoLargo(llamado.fecha_fin)} · Emitido{' '}
          {hoy()}
        </p>

        <table className="data-table foja-tabla">
          <thead>
            <tr>
              <th>CARRERA</th>
              <th>SEDE</th>
              <th style={{ textAlign: 'right' }}>DÍAS DE EXAMEN</th>
              <th style={{ textAlign: 'right' }}>EXÁMENES</th>
              <th style={{ textAlign: 'right' }}>PROMEDIO POR DÍA</th>
              <th style={{ textAlign: 'right' }}>MÁXIMO EN UN DÍA</th>
              <th style={{ textAlign: 'right' }}>PROFESORES DEL PLANTEL</th>
            </tr>
          </thead>
          <tbody>
            {bloques.map((b) => (
              <tr key={`${b.sede_id}-${b.carrera}`}>
                <td>{b.carrera}</td>
                <td>{b.sede}</td>
                <td style={{ textAlign: 'right' }}>{b.dias.length}</td>
                <td style={{ textAlign: 'right' }}>{b.examenes}</td>
                <td style={{ textAlign: 'right' }}>{b.promedio.toFixed(1).replace('.', ',')}</td>
                <td style={{ textAlign: 'right' }}>{b.maxDia}</td>
                <td style={{ textAlign: 'right' }}>{b.plantelTotal}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={2}>
                <strong>Total</strong>
              </td>
              <td style={{ textAlign: 'right' }}>
                <strong>{total.dias}</strong>
              </td>
              <td style={{ textAlign: 'right' }}>
                <strong>{total.examenes}</strong>
              </td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>

        <p className="muted-text" style={{ fontSize: 12, marginTop: 12 }}>
          Cada mesa la integran {POR_MESA} profesores: el titular de la cátedra y dos vocales. <strong>Plantel</strong>:
          profesores que presiden alguna mesa de esa carrera en esa sede en este llamado; de ellos salen los vocales.{' '}
          <strong>Disponibles de la carrera</strong>: profesores del plantel que ese día de la semana tienen clase en
          esa carrera y sede, o presiden ese día una mesa de esa carrera. <strong>Por otra carrera</strong>: profesores
          del plantel que ese día no tienen clase en esa carrera, pero asisten a la sede por otra carrera (clase o
          mesa); pueden sumarse para completar las mesas. No se cuenta a quienes marcaron ese día como no
          disponible.{' '}
          <strong>Total de profesores de la carrera</strong>: el plantel de esa carrera en esa sede.
        </p>
      </div>

      {porFecha.map((f) => (
        <div className="foja-card" key={f.fecha} style={{ marginBottom: 16, breakInside: 'avoid' }}>
          <h4 style={{ margin: '0 0 8px' }}>
            {f.dia} {formatoLargo(f.fecha)}
          </h4>
          <table className="data-table foja-tabla">
            <thead>
              <tr>
                <th>CARRERA</th>
                <th>SEDE</th>
                <th style={{ textAlign: 'right' }}>EXÁMENES</th>
                <th style={{ textAlign: 'right' }}>LUGARES EN MESAS</th>
                <th style={{ textAlign: 'right' }}>TOTAL DE PROFESORES DE LA CARRERA</th>
                <th style={{ textAlign: 'right' }}>DISPONIBLES DE LA CARRERA</th>
                <th style={{ textAlign: 'right' }}>DISPONIBLES POR OTRA CARRERA</th>
              </tr>
            </thead>
            <tbody>
              {f.filas.map((r) => (
                <tr key={`${r.sede}-${r.carrera}`}>
                  <td>{r.carrera}</td>
                  <td>{r.sede}</td>
                  <td style={{ textAlign: 'right' }}>{r.examenes}</td>
                  <td style={{ textAlign: 'right' }}>{r.lugares}</td>
                  <td style={{ textAlign: 'right' }}>{r.plantel}</td>
                  <td style={{ textAlign: 'right' }}>{r.disponibles}</td>
                  <td style={{ textAlign: 'right' }}>{r.adicionales}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2}>
                  <strong>Total del día</strong>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <strong>{f.examenes}</strong>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <strong>{f.examenes * POR_MESA}</strong>
                </td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
