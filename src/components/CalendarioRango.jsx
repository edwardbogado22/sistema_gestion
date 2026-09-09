import { useEffect, useMemo, useRef, useState } from 'react'
import { aISO, deISO, formatoCorto, formatoLargo } from '../lib/fechas'

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/**
 * Calendario acotado a un rango. Solo deja elegir días entre min y max
 * que no estén bloqueados; `excepciones` es un mapa fecha → motivo, que
 * se muestra al pasar el mouse ("Día de la Virgen de Caacupé"). `carga`
 * marca los días que ya tienen exámenes del mismo curso, para no apilar
 * finales en una jornada. `avisos` marca días con una propuesta
 * automática sin confirmar para ese profesor: se muestran pero NO se
 * bloquean, porque al elegirlos la propuesta cede el lugar.
 */
export function CalendarioRango({ value, onChange, min, max, excepciones = {}, avisos = {}, carga = {}, disabled }) {
  const [abierto, setAbierto] = useState(false)
  const [mesVisible, setMesVisible] = useState(null)
  const ref = useRef(null)

  const excluidas = useMemo(() => new Set(Object.keys(excepciones)), [excepciones])

  useEffect(() => {
    function onClickFuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  }, [])

  // Al abrir, mostrar el mes de la fecha elegida o el del inicio del rango
  useEffect(() => {
    if (!abierto) return
    const base = deISO(value || min)
    setMesVisible(new Date(base.getFullYear(), base.getMonth(), 1))
  }, [abierto, value, min])

  const celdas = useMemo(() => {
    if (!mesVisible) return []
    const anio = mesVisible.getFullYear()
    const mes = mesVisible.getMonth()
    const primero = new Date(anio, mes, 1)
    // getDay(): 0 = domingo. La grilla arranca en lunes.
    const offset = (primero.getDay() + 6) % 7
    const cantidad = new Date(anio, mes + 1, 0).getDate()

    const items = []
    for (let i = 0; i < offset; i++) items.push(null)
    for (let d = 1; d <= cantidad; d++) items.push(new Date(anio, mes, d))
    return items
  }, [mesVisible])

  const puedeIrA = (delta) => {
    if (!mesVisible) return false
    const destino = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + delta, 1)
    const finMes = new Date(destino.getFullYear(), destino.getMonth() + 1, 0)
    return aISO(finMes) >= min && aISO(destino) <= max
  }

  const mover = (delta) => {
    if (!puedeIrA(delta)) return
    setMesVisible((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  }

  const estadoDe = (iso) => {
    if (iso < min || iso > max) return 'fuera'
    if (excluidas.has(iso)) return 'excluido'
    return 'habil'
  }

  const elegir = (iso) => {
    if (estadoDe(iso) !== 'habil') return
    onChange(iso)
    setAbierto(false)
  }

  return (
    <div className="calendario-rango" ref={ref}>
      <button
        type="button"
        className={`calendario-disparador${value ? '' : ' vacio'}`}
        disabled={disabled}
        onClick={() => setAbierto((a) => !a)}
      >
        {value ? formatoCorto(value) : 'Sin fecha'}
        <span aria-hidden="true"> ▾</span>
      </button>

      {abierto && mesVisible && (
        <div className="calendario-popover">
          <div className="calendario-encabezado">
            <button
              type="button"
              onClick={() => mover(-1)}
              disabled={!puedeIrA(-1)}
              aria-label="Mes anterior"
            >
              ‹
            </button>
            <span>
              {MESES[mesVisible.getMonth()]} {mesVisible.getFullYear()}
            </span>
            <button type="button" onClick={() => mover(1)} disabled={!puedeIrA(1)} aria-label="Mes siguiente">
              ›
            </button>
          </div>

          <div className="calendario-grilla">
            {DIAS.map((d, i) => (
              <div key={i} className="calendario-dow">
                {d}
              </div>
            ))}
            {celdas.map((fecha, i) => {
              if (!fecha) return <div key={`v${i}`} />
              const iso = aISO(fecha)
              const estado = estadoDe(iso)
              const ocupados = carga[iso] || 0
              const aviso = avisos[iso]
              const titulo =
                estado === 'excluido'
                  ? excepciones[iso]
                  : [aviso, ocupados > 0 ? `${ocupados} examen(es) de este curso ese día` : null]
                      .filter(Boolean)
                      .join(' · ') || undefined
              return (
                <button
                  key={iso}
                  type="button"
                  className={[
                    'calendario-dia',
                    estado,
                    iso === value ? 'elegido' : '',
                    ocupados > 0 ? 'cargado' : '',
                    aviso ? 'propuesta' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={estado !== 'habil'}
                  title={titulo}
                  onClick={() => elegir(iso)}
                >
                  {fecha.getDate()}
                </button>
              )
            })}
          </div>

          <div className="calendario-pie">
            <span>
              Rango: {formatoLargo(min)} a {formatoLargo(max)}
            </span>
            {value && (
              <button type="button" className="calendario-limpiar" onClick={() => { onChange(''); setAbierto(false) }}>
                Quitar fecha
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
