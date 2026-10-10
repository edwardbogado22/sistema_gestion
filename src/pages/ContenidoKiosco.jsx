import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { aISO } from '../lib/fechas'

const vacio = () => ({
  cedula: '',
  buscando: false,
  error: '',
  profesor: null,
  catedras: [],
  catedraSel: null,
  unidades: [],
  marcados: new Set(),
  marcadosOriginal: new Set(),
  fechaSeleccionada: aISO(new Date()),
  fechas: new Map(), // subtema_id -> 'YYYY-MM-DD', el día que efectivamente se dictó
  fechasOriginal: new Map(),
  tope: null,
  guardando: false,
  actividadesExtra: [],
  nuevaActividad: { tipo: 'examen_parcial', unidad_id: '', descripcion: '' },
  guardandoActividad: false,
})

function pct(marcados, total) {
  if (!total) return 0
  return Math.round((marcados / total) * 10000) / 100
}

const TIPOS_ACTIVIDAD_EXTRA = [
  { valor: 'examen_parcial', etiqueta: 'Examen parcial' },
  { valor: 'retroalimentacion', etiqueta: 'Retroalimentación' },
  { valor: 'otro', etiqueta: 'Otra (especificar)' },
]

const etiquetaTipoActividad = (tipo) =>
  TIPOS_ACTIVIDAD_EXTRA.find((t) => t.valor === tipo)?.etiqueta || tipo

export function ContenidoKiosco() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('cedula')
  const [estado, setEstado] = useState(vacio())

  const reiniciar = () => {
    setEstado(vacio())
    setStep('cedula')
  }

  const salir = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const buscarProfesor = async (e) => {
    e.preventDefault()
    const cedula = estado.cedula.trim()
    if (!cedula) return
    setEstado((s) => ({ ...s, buscando: true, error: '' }))

    const { data: periodo, error: eP } = await supabase
      .from('periodo_academico')
      .select('etiqueta_periodo_lectivo')
      .eq('activo', true)
      .maybeSingle()
    if (eP || !periodo) {
      setEstado((s) => ({ ...s, buscando: false, error: 'No hay un período académico activo configurado.' }))
      return
    }

    const { data: profesor } = await supabase
      .from('profesores')
      .select('id, nombres, apellidos')
      .eq('documento_identidad', cedula)
      .maybeSingle()
    if (!profesor) {
      setEstado((s) => ({ ...s, buscando: false, error: 'No se encontró ningún profesor con esa cédula.' }))
      return
    }

    const { data: catedras } = await supabase
      .from('catedras')
      .select('id, seccion_grupo, asignaturas(id, nombre, carreras(nombre)), sedes(nombre)')
      .eq('profesor_id', profesor.id)
      .eq('periodo_lectivo', periodo.etiqueta_periodo_lectivo)
      .eq('activo', true)

    if (!catedras || catedras.length === 0) {
      setEstado((s) => ({
        ...s,
        buscando: false,
        error: 'Este profesor no tiene cátedras activas en el período actual (o no corresponden a esta sede).',
      }))
      return
    }

    setEstado((s) => ({ ...s, buscando: false, error: '', profesor, catedras }))
    setStep('catedra')
  }

  const elegirCatedra = async (catedra) => {
    setEstado((s) => ({ ...s, catedraSel: catedra }))

    const { data: unidades } = await supabase
      .from('contenido_unidad')
      .select('id, numero, nombre, contenido_subtema(id, numero, descripcion)')
      .eq('asignatura_id', catedra.asignaturas.id)
      .order('numero')

    const unidadesOrdenadas = (unidades || []).map((u) => ({
      ...u,
      contenido_subtema: [...(u.contenido_subtema || [])].sort((a, b) => a.numero - b.numero),
    }))

    const { data: avance } = await supabase
      .from('catedra_contenido_avance')
      .select('subtema_id, fecha_clase')
      .eq('catedra_id', catedra.id)

    const { data: tope } = await supabase.rpc('contenido_tope_subtemas', { p_catedra_id: catedra.id })

    const { data: actividadesExtra } = await supabase
      .from('catedra_contenido_actividad_extra')
      .select('id, tipo, descripcion, marcado_en, unidad_id, contenido_unidad(numero, nombre)')
      .eq('catedra_id', catedra.id)
      .order('marcado_en')

    const marcadosIniciales = new Set((avance || []).map((a) => a.subtema_id))
    const fechasIniciales = new Map((avance || []).map((a) => [a.subtema_id, a.fecha_clase]))
    setEstado((s) => ({
      ...s,
      unidades: unidadesOrdenadas,
      marcados: marcadosIniciales,
      marcadosOriginal: marcadosIniciales,
      fechas: new Map(fechasIniciales),
      fechasOriginal: fechasIniciales,
      tope: tope ?? null,
      actividadesExtra: actividadesExtra || [],
    }))
    setStep(unidadesOrdenadas.length === 0 ? 'sin-catalogo' : 'contenido')
  }

  const agregarActividadExtra = async (e) => {
    e.preventDefault()
    const { tipo, unidad_id, descripcion } = estado.nuevaActividad
    if (tipo === 'otro' && !descripcion.trim()) {
      setEstado((s) => ({ ...s, error: 'Describí de qué se trata la actividad.' }))
      return
    }
    setEstado((s) => ({ ...s, guardandoActividad: true, error: '' }))

    const { data, error } = await supabase
      .from('catedra_contenido_actividad_extra')
      .insert({
        catedra_id: estado.catedraSel.id,
        unidad_id: unidad_id || null,
        tipo,
        descripcion: descripcion.trim() || null,
        registrado_por: user?.id ?? null,
      })
      .select('id, tipo, descripcion, marcado_en, unidad_id, contenido_unidad(numero, nombre)')
      .single()

    if (error) {
      setEstado((s) => ({ ...s, guardandoActividad: false, error: error.message }))
      return
    }

    setEstado((s) => ({
      ...s,
      guardandoActividad: false,
      actividadesExtra: [...s.actividadesExtra, data],
      nuevaActividad: { tipo: 'examen_parcial', unidad_id: '', descripcion: '' },
    }))
  }

  const quitarActividadExtra = async (id) => {
    const { error } = await supabase.from('catedra_contenido_actividad_extra').delete().eq('id', id)
    if (error) {
      setEstado((s) => ({ ...s, error: error.message }))
      return
    }
    setEstado((s) => ({ ...s, actividadesExtra: s.actividadesExtra.filter((a) => a.id !== id) }))
  }

  const toggleSubtema = (subtemaId) => {
    setEstado((s) => {
      const marcados = new Set(s.marcados)
      const fechas = new Map(s.fechas)
      if (marcados.has(subtemaId)) {
        marcados.delete(subtemaId)
        fechas.delete(subtemaId)
      } else {
        if (s.tope != null && marcados.size >= s.tope) return s
        marcados.add(subtemaId)
        fechas.set(subtemaId, s.fechaSeleccionada)
      }
      return { ...s, marcados, fechas }
    })
  }

  const cambiarFechaSubtema = (subtemaId, fecha) => {
    setEstado((s) => {
      const fechas = new Map(s.fechas)
      fechas.set(subtemaId, fecha)
      return { ...s, fechas }
    })
  }

  const guardar = async () => {
    setEstado((s) => ({ ...s, guardando: true }))
    const catedraId = estado.catedraSel.id
    const ids = [...estado.marcados]

    // Diff contra lo que ya estaba guardado (no borrar todo e insertar de
    // nuevo): así el marcado_en de los subtemas que ya estaban tildados
    // no se pisa, y queda el orden cronológico real de cuándo se marcó
    // cada uno a lo largo de varias sesiones de carga.
    const aQuitar = [...estado.marcadosOriginal].filter((id) => !estado.marcados.has(id))
    const aAgregar = ids.filter((id) => !estado.marcadosOriginal.has(id))

    if (aQuitar.length > 0) {
      const { error: eDel } = await supabase
        .from('catedra_contenido_avance')
        .delete()
        .eq('catedra_id', catedraId)
        .in('subtema_id', aQuitar)
      if (eDel) {
        setEstado((s) => ({ ...s, guardando: false, error: eDel.message }))
        return
      }
    }
    if (aAgregar.length > 0) {
      const { error: eIns } = await supabase.from('catedra_contenido_avance').insert(
        aAgregar.map((subtema_id) => ({
          catedra_id: catedraId,
          subtema_id,
          fecha_clase: estado.fechas.get(subtema_id) || aISO(new Date()),
        })),
      )
      if (eIns) {
        setEstado((s) => ({ ...s, guardando: false, error: eIns.message }))
        return
      }
    }

    // Subtemas que ya estaban marcados pero cuya fecha se corrigió ahora
    // (p. ej. se había cargado con la fecha de hoy y en realidad fue una
    // clase virtual de un día anterior).
    const aCorregirFecha = [...estado.marcadosOriginal].filter(
      (id) => estado.marcados.has(id) && estado.fechas.get(id) && estado.fechas.get(id) !== estado.fechasOriginal.get(id),
    )
    for (const subtemaId of aCorregirFecha) {
      const { error: eUpd } = await supabase
        .from('catedra_contenido_avance')
        .update({ fecha_clase: estado.fechas.get(subtemaId) })
        .eq('catedra_id', catedraId)
        .eq('subtema_id', subtemaId)
      if (eUpd) {
        setEstado((s) => ({ ...s, guardando: false, error: eUpd.message }))
        return
      }
    }

    // Registro de auditoría: queda constancia de cuándo y bajo qué sesión
    // logueada se guardó, sin pisar guardados anteriores.
    await supabase.from('catedra_contenido_avance_historial').insert({
      catedra_id: catedraId,
      registrado_por: user?.id ?? null,
      subtemas_marcados: ids.length,
    })

    setEstado((s) => ({ ...s, guardando: false }))
    setStep('gracias')
  }

  const totalSubtemas = estado.unidades.reduce((acc, u) => acc + u.contenido_subtema.length, 0)
  const totalMarcados = estado.unidades.reduce(
    (acc, u) => acc + u.contenido_subtema.filter((st) => estado.marcados.has(st.id)).length,
    0,
  )

  return (
    <div className="app-layout">
      <div className="topbar" />
      <nav className="nav-bar" style={{ justifyContent: 'space-between' }}>
        <span className="nav-title" style={{ color: '#fff' }}>
          Kiosco de Contenido Programático
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={salir}>
          Salir
        </button>
      </nav>

      <main className="app-main">
        <div className="page-padding" style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ maxWidth: 640, width: '100%' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
              <img src="/escudo-une.png" alt="Escudo UNE" className="foja-escudo" style={{ margin: '0 auto 10px' }} />
              <p className="eyebrow" style={{ color: 'var(--gold)', margin: 0 }}>
                Universidad Nacional del Este
              </p>
              <h2 style={{ margin: '2px 0' }}>Facultad de Ciencias Económicas</h2>
              <p className="muted-text" style={{ margin: 0 }}>
                Kiosco de Contenido Programático
              </p>
            </div>

            {step === 'cedula' && (
              <div className="form-card">
                <h3>¿Quién sos?</h3>
                <p className="muted-text">Ingresá tu número de cédula para ver las materias que tenés a cargo.</p>
                <form onSubmit={buscarProfesor}>
                  <label>
                    Cédula
                    <input
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      value={estado.cedula}
                      onChange={(e) => setEstado((s) => ({ ...s, cedula: e.target.value }))}
                      style={{ fontSize: '1.4rem', padding: '0.6rem' }}
                    />
                  </label>
                  {estado.error && <p className="error-text">{estado.error}</p>}
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary" disabled={estado.buscando}>
                      {estado.buscando ? 'Buscando...' : 'Continuar'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {step === 'catedra' && (
              <div className="form-card">
                <h3>
                  Hola, {estado.profesor.nombres} {estado.profesor.apellidos} — elegí tu materia
                </h3>
                <div className="form-grid">
                  {estado.catedras.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="btn btn-secondary"
                      style={{ textAlign: 'left' }}
                      onClick={() => elegirCatedra(c)}
                    >
                      {c.asignaturas.nombre} · {c.asignaturas.carreras?.nombre} · {c.sedes?.nombre} · Sección{' '}
                      {c.seccion_grupo}
                    </button>
                  ))}
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={reiniciar}>
                    No soy yo, volver
                  </button>
                </div>
              </div>
            )}

            {step === 'sin-catalogo' && (
              <div className="form-card">
                <p>
                  La materia <strong>{estado.catedraSel.asignaturas.nombre}</strong> todavía no tiene el temario
                  cargado en el sistema. Pedile a Dirección Académica que lo complete, o cargá el cumplimiento como
                  antes desde Cargar Indicadores.
                </p>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setStep('catedra')}>
                    Volver
                  </button>
                </div>
              </div>
            )}

            {step === 'contenido' && (
              <div className="form-card">
                <h3>{estado.catedraSel.asignaturas.nombre}</h3>
                <p className="muted-text">
                  Tildá los subtemas que efectivamente dictaste. {totalMarcados} de {totalSubtemas} subtemas ·{' '}
                  {pct(totalMarcados, totalSubtemas)}% de cumplimiento.
                </p>
                {estado.tope != null && (
                  <p className={totalMarcados >= estado.tope ? 'error-text' : 'muted-text'}>
                    Por ahora podés tener marcados hasta {estado.tope} subtema(s), según las clases ya registradas
                    como dictadas. Si te falta registrar una clase, pedile a secretaría que la cargue en Asistencia a
                    Clases para poder seguir marcando.
                  </p>
                )}

                <label style={{ display: 'block', marginBottom: '1rem' }}>
                  Fecha de la clase que estás cargando
                  <input
                    type="date"
                    value={estado.fechaSeleccionada}
                    max={aISO(new Date())}
                    onChange={(e) => setEstado((s) => ({ ...s, fechaSeleccionada: e.target.value }))}
                    style={{ display: 'block' }}
                  />
                  <span className="muted-text" style={{ fontSize: 12 }}>
                    Si recuperaste una clase por un corte de luz o diste clase virtual otro día, cambiá esta fecha
                    antes de tildar ese contenido. Podés tildar varios días en la misma visita: cambiá la fecha entre
                    tanda y tanda.
                  </span>
                </label>

                {estado.unidades.map((u) => (
                  <div key={u.id} style={{ marginBottom: '1.25rem' }}>
                    <h4 style={{ marginBottom: 6 }}>
                      Unidad {u.numero} — {u.nombre}
                    </h4>
                    {u.contenido_subtema.map((st) => {
                      const marcado = estado.marcados.has(st.id)
                      const bloqueado = !marcado && estado.tope != null && totalMarcados >= estado.tope
                      return (
                        <div
                          key={st.id}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            padding: '4px 0',
                            opacity: bloqueado ? 0.5 : 1,
                          }}
                        >
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1 }}>
                            <input
                              type="checkbox"
                              checked={marcado}
                              disabled={bloqueado}
                              onChange={() => toggleSubtema(st.id)}
                              style={{ marginTop: 4 }}
                            />
                            {st.descripcion}
                          </label>
                          {marcado && (
                            <input
                              type="date"
                              value={estado.fechas.get(st.id) || estado.fechaSeleccionada}
                              max={aISO(new Date())}
                              onChange={(e) => cambiarFechaSubtema(st.id, e.target.value)}
                              style={{ fontSize: 12 }}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}

                <hr style={{ margin: '1.5rem 0', border: 'none', borderTop: '1px solid var(--border-color, #ddd)' }} />

                <h4 style={{ marginBottom: 4 }}>Actividades extraordinarias</h4>
                <p className="muted-text">
                  Examen parcial, retroalimentación de una unidad, u otra actividad puntual que no forma parte del
                  temario. No afectan el % de cumplimiento ni el tope de ritmo, quedan registradas aparte.
                </p>

                {estado.actividadesExtra.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, marginBottom: '0.75rem' }}>
                    {estado.actividadesExtra.map((a) => (
                      <li
                        key={a.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '4px 0',
                        }}
                      >
                        <span>
                          <strong>{etiquetaTipoActividad(a.tipo)}</strong>
                          {a.contenido_unidad && ` · Unidad ${a.contenido_unidad.numero} — ${a.contenido_unidad.nombre}`}
                          {a.descripcion && `: ${a.descripcion}`}
                        </span>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => quitarActividadExtra(a.id)}>
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <form onSubmit={agregarActividadExtra} className="form-grid" style={{ marginBottom: '0.5rem' }}>
                  <label>
                    Tipo
                    <select
                      value={estado.nuevaActividad.tipo}
                      onChange={(e) =>
                        setEstado((s) => ({ ...s, nuevaActividad: { ...s.nuevaActividad, tipo: e.target.value } }))
                      }
                    >
                      {TIPOS_ACTIVIDAD_EXTRA.map((t) => (
                        <option key={t.valor} value={t.valor}>
                          {t.etiqueta}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Unidad relacionada (opcional)
                    <select
                      value={estado.nuevaActividad.unidad_id}
                      onChange={(e) =>
                        setEstado((s) => ({
                          ...s,
                          nuevaActividad: { ...s.nuevaActividad, unidad_id: e.target.value },
                        }))
                      }
                    >
                      <option value="">Sin unidad específica</option>
                      {estado.unidades.map((u) => (
                        <option key={u.id} value={u.id}>
                          Unidad {u.numero} — {u.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  {estado.nuevaActividad.tipo === 'otro' && (
                    <label>
                      Descripción
                      <input
                        type="text"
                        value={estado.nuevaActividad.descripcion}
                        onChange={(e) =>
                          setEstado((s) => ({
                            ...s,
                            nuevaActividad: { ...s.nuevaActividad, descripcion: e.target.value },
                          }))
                        }
                      />
                    </label>
                  )}
                  <div className="form-actions">
                    <button type="submit" className="btn btn-secondary" disabled={estado.guardandoActividad}>
                      {estado.guardandoActividad ? 'Agregando...' : 'Agregar actividad'}
                    </button>
                  </div>
                </form>

                {estado.error && <p className="error-text">{estado.error}</p>}
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setStep('catedra')}>
                    Volver
                  </button>
                  <button type="button" className="btn btn-primary" disabled={estado.guardando} onClick={guardar}>
                    {estado.guardando ? 'Guardando...' : 'Guardar y terminar'}
                  </button>
                </div>
              </div>
            )}

            {step === 'gracias' && (
              <div className="form-card" style={{ textAlign: 'center' }}>
                <h3>¡Listo, gracias {estado.profesor.nombres}!</h3>
                <p className="muted-text">Tu carga de contenido quedó registrada.</p>
                <div className="form-actions" style={{ justifyContent: 'center' }}>
                  <button type="button" className="btn btn-primary" onClick={reiniciar}>
                    Cargar otro profesor
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="footer">
        <div>
          <strong>Universidad Nacional del Este</strong> · Facultad de Ciencias Económicas
        </div>
        <div className="small">
          Avda. Universidad Nacional del Este y Avda. Paraguay - Km 8 Acaray, Ciudad del Este, Paraguay
        </div>
      </footer>
    </div>
  )
}
