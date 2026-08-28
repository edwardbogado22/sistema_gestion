import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatoLargo } from '../../lib/fechas'

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const vacio = { motivo: '', ambito: 'INSTITUCIONAL', tipo: 'RECURRENTE', mes: '12', dia: '8', fecha: '' }

export function DiasNoHabiles() {
  const [dias, setDias] = useState([])
  const [invalidas, setInvalidas] = useState([])
  const [form, setForm] = useState(vacio)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const cargar = async () => {
    setLoading(true)
    const [d, i] = await Promise.all([
      supabase.from('dia_no_habil').select('*').order('mes').order('dia').order('fecha'),
      supabase.from('v_examen_fechas_invalidas').select('*'),
    ])
    if (d.error) setError(d.error.message)
    setDias(d.data || [])
    // La vista puede no existir todavía si falta correr la migración
    setInvalidas(i.error ? [] : i.data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const { recurrentes, puntuales } = useMemo(
    () => ({
      recurrentes: dias.filter((d) => d.mes != null),
      puntuales: dias.filter((d) => d.fecha != null),
    }),
    [dias],
  )

  const agregar = async (ev) => {
    ev.preventDefault()
    setError('')
    setOk('')
    const base = { motivo: form.motivo, ambito: form.ambito }
    const fila =
      form.tipo === 'RECURRENTE'
        ? { ...base, mes: Number(form.mes), dia: Number(form.dia) }
        : { ...base, fecha: form.fecha }

    const { error } = await supabase.from('dia_no_habil').insert(fila)
    if (error) return setError(error.message)
    setForm({ ...vacio, tipo: form.tipo })
    setOk('Día agregado. Ningún examen va a poder caer ahí.')
    cargar()
  }

  const alternar = async (d) => {
    const { error } = await supabase.from('dia_no_habil').update({ activo: !d.activo }).eq('id', d.id)
    if (error) return setError(error.message)
    cargar()
  }

  const quitar = async (id) => {
    const { error } = await supabase.from('dia_no_habil').delete().eq('id', id)
    if (error) return setError(error.message)
    cargar()
  }

  if (loading) return <p className="muted-text">Cargando...</p>

  const Fila = ({ d, etiqueta }) => (
    <div className="stat-breakdown-row">
      <span style={{ opacity: d.activo ? 1 : 0.5 }}>
        <strong>{etiqueta}</strong> · {d.motivo}
        {d.ambito === 'INSTITUCIONAL' && ' (institucional)'}
        {!d.activo && ' — desactivado'}
      </span>
      <span style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => alternar(d)}>
          {d.activo ? 'Desactivar' : 'Activar'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => quitar(d.id)}>
          Quitar
        </button>
      </span>
    </div>
  )

  return (
    <div>
      <p className="muted-text">
        Ninguna fecha de examen puede caer en estos días, en ningún llamado. Los feriados de fecha fija se
        cargan como recurrentes y valen todos los años; los móviles, como Semana Santa, se cargan con la fecha
        de cada año.
      </p>

      {error && <p className="error-text">{error}</p>}
      {ok && <p className="muted-text">{ok}</p>}

      {invalidas.length > 0 && (
        <div className="stat-card" style={{ textAlign: 'left', marginBottom: 16 }}>
          <p className="error-text">
            <strong>Hay {invalidas.length} examen(es) cargado(s) en días que ahora están bloqueados.</strong> Se
            agregó un día no hábil después de haberlos asignado; hay que reubicarlos desde el panel de fechas.
          </p>
          {invalidas.map((v) => (
            <div className="stat-breakdown-row" key={v.examen_fecha_id}>
              <span>
                {formatoLargo(v.fecha)} · {v.materia} ({v.carrera}, {v.curso_nivel}º {v.seccion_grupo}) ·{' '}
                {v.profesor}
              </span>
              <span className="badge badge-muted">{v.motivo}</span>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={agregar} className="stat-card" style={{ textAlign: 'left', marginBottom: 20 }}>
        <div className="section-label">
          <span>Agregar día no hábil</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label>
            Tipo
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="RECURRENTE">Fecha fija (todos los años)</option>
              <option value="PUNTUAL">Fecha concreta (un año)</option>
            </select>
          </label>

          {form.tipo === 'RECURRENTE' ? (
            <>
              <label>
                Día
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={form.dia}
                  onChange={(e) => setForm({ ...form, dia: e.target.value })}
                  required
                  style={{ width: 70 }}
                />
              </label>
              <label>
                Mes
                <select value={form.mes} onChange={(e) => setForm({ ...form, mes: e.target.value })}>
                  {MESES.map((m, i) => (
                    <option key={m} value={String(i + 1)}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label>
              Fecha
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                required
              />
            </label>
          )}

          <label style={{ flex: '1 1 240px' }}>
            Motivo
            <input
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              placeholder="Día de la Virgen de Caacupé"
              required
            />
          </label>

          <label>
            Ámbito
            <select value={form.ambito} onChange={(e) => setForm({ ...form, ambito: e.target.value })}>
              <option value="NACIONAL">Feriado nacional</option>
              <option value="INSTITUCIONAL">Institucional</option>
            </select>
          </label>

          <button type="submit" className="btn btn-primary">
            Agregar
          </button>
        </div>
      </form>

      <div className="section-label">
        <span>Fecha fija · todos los años</span>
      </div>
      {recurrentes.length === 0 && <p className="muted-text">Sin feriados fijos cargados.</p>}
      {recurrentes.map((d) => (
        <Fila key={d.id} d={d} etiqueta={`${d.dia} de ${MESES[d.mes - 1]}`} />
      ))}

      <div className="section-label" style={{ marginTop: 18 }}>
        <span>Fechas concretas</span>
      </div>
      {puntuales.length === 0 && (
        <p className="muted-text">Sin fechas puntuales. Acordate de cargar Semana Santa de cada año.</p>
      )}
      {puntuales.map((d) => (
        <Fila key={d.id} d={d} etiqueta={formatoLargo(d.fecha)} />
      ))}
    </div>
  )
}
