import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

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
  tope: null,
  guardando: false,
})

function pct(marcados, total) {
  if (!total) return 0
  return Math.round((marcados / total) * 10000) / 100
}

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
      .select('subtema_id')
      .eq('catedra_id', catedra.id)

    const { data: tope } = await supabase.rpc('contenido_tope_subtemas', { p_catedra_id: catedra.id })

    const marcadosIniciales = new Set((avance || []).map((a) => a.subtema_id))
    setEstado((s) => ({
      ...s,
      unidades: unidadesOrdenadas,
      marcados: marcadosIniciales,
      marcadosOriginal: marcadosIniciales,
      tope: tope ?? null,
    }))
    setStep(unidadesOrdenadas.length === 0 ? 'sin-catalogo' : 'contenido')
  }

  const toggleSubtema = (subtemaId) => {
    setEstado((s) => {
      const marcados = new Set(s.marcados)
      if (marcados.has(subtemaId)) {
        marcados.delete(subtemaId)
      } else {
        if (s.tope != null && marcados.size >= s.tope) return s
        marcados.add(subtemaId)
      }
      return { ...s, marcados }
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
      const { error: eIns } = await supabase
        .from('catedra_contenido_avance')
        .insert(aAgregar.map((subtema_id) => ({ catedra_id: catedraId, subtema_id })))
      if (eIns) {
        setEstado((s) => ({ ...s, guardando: false, error: eIns.message }))
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

                {estado.unidades.map((u) => (
                  <div key={u.id} style={{ marginBottom: '1.25rem' }}>
                    <h4 style={{ marginBottom: 6 }}>
                      Unidad {u.numero} — {u.nombre}
                    </h4>
                    {u.contenido_subtema.map((st) => {
                      const marcado = estado.marcados.has(st.id)
                      const bloqueado = !marcado && estado.tope != null && totalMarcados >= estado.tope
                      return (
                        <label
                          key={st.id}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            padding: '4px 0',
                            opacity: bloqueado ? 0.5 : 1,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={marcado}
                            disabled={bloqueado}
                            onChange={() => toggleSubtema(st.id)}
                            style={{ marginTop: 4 }}
                          />
                          {st.descripcion}
                        </label>
                      )
                    })}
                  </div>
                ))}

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
