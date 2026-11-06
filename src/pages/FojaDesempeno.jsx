import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
// Escala valorativa definida por Dirección Académica. El total se
// redondea al entero antes de clasificar, a favor del profesor (decisión
// de la Directora Académica): 90,5% cuenta como 91% (Excelente) y 59,5%
// como 60% (Necesita mejorar). La comparte el informe gerencial.
import { clasificar } from '../lib/foja'

export function FojaDesempeno() {
  const { catedraId } = useParams()
  const navigate = useNavigate()
  const [filas, setFilas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [impresiones, setImpresiones] = useState([])
  // Justificación aceptada: "Desarrollo pedagógico" sin contenido programático
  const [sinContenido, setSinContenido] = useState(null)

  useEffect(() => {
    setLoading(true)
    supabase
      .rpc('v_evaluacion_docente_ver', { p_catedra_id: catedraId })
      .order('grupo')
      .order('orden')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setFilas(data)
        setLoading(false)
      })
  }, [catedraId])

  useEffect(() => {
    supabase
      .from('contenido_no_considerado')
      .select('motivo')
      .eq('catedra_id', catedraId)
      .maybeSingle()
      .then(({ data }) => setSinContenido(data))
  }, [catedraId])

  useEffect(() => {
    supabase
      .from('foja_impresion')
      .select('id, impreso_en')
      .eq('catedra_id', catedraId)
      .order('impreso_en', { ascending: false })
      .then(({ data }) => setImpresiones(data || []))
  }, [catedraId])

  // Cada impresión queda registrada para el informe de Emisión de fojas.
  //
  // El botón Imprimir guarda el registro y ESPERA la respuesta antes de
  // abrir el diálogo. Antes solo se registraba en "beforeprint": mientras
  // el diálogo está abierto Chrome frena la página, el pedido salía recién
  // al cerrarlo, y como la foja se abre en una pestaña nueva y se cierra
  // apenas se imprime, el registro se perdía sin que nadie lo viera.
  //
  // "beforeprint" queda para Ctrl+P. El botón también lo dispara: dentro
  // de los segundos siguientes no se registra dos veces.
  // Si el registro falla, la impresión sigue, pero se avisa en pantalla.
  const ultimoRegistro = useRef(0)
  const [avisoRegistro, setAvisoRegistro] = useState('')
  const [registrando, setRegistrando] = useState(false)

  const registrar = useCallback(async () => {
    const e = filas[0]
    if (!e || Date.now() - ultimoRegistro.current < 10000) return
    ultimoRegistro.current = Date.now()
    const { data, error: eReg } = await supabase
      .from('foja_impresion')
      .insert({ catedra_id: e.catedra_id, profesor_id: e.profesor_id, periodo_lectivo: e.periodo_lectivo })
      .select('id, impreso_en')
      .single()
    if (eReg) {
      ultimoRegistro.current = 0
      setAvisoRegistro(`No se pudo registrar esta impresión en Emisión de fojas: ${eReg.message}`)
    } else {
      setAvisoRegistro('')
      setImpresiones((prev) => [data, ...prev])
    }
  }, [filas])

  useEffect(() => {
    window.addEventListener('beforeprint', registrar)
    return () => window.removeEventListener('beforeprint', registrar)
  }, [registrar])

  const imprimir = async () => {
    setRegistrando(true)
    await registrar()
    setRegistrando(false)
    window.print()
  }

  if (loading) {
    return (
      <div className="page-padding">
        <p>Cargando...</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="page-padding">
        <p className="error-text">{error}</p>
      </div>
    )
  }
  if (filas.length === 0) {
    return (
      <div className="page-padding">
        <p className="muted-text">
          No hay resultados para mostrar: puede que no haya criterios activos configurados para el periodo de esta
          cátedra (revisá Configuración → Criterios de Evaluación), o que no tengas acceso a verla.
        </p>
      </div>
    )
  }

  const encabezado = filas[0]
  const institucionales = filas.filter((f) => f.grupo === 'INSTITUCIONAL')
  const alumnos = filas.filter((f) => f.grupo === 'ALUMNOS')
  const subtotalInstPond = institucionales.reduce((a, f) => a + Number(f.ponderacion), 0)
  const subtotalInstObt = institucionales.reduce((a, f) => a + Number(f.obtenido_porcentaje), 0)
  const subtotalAluPond = alumnos.reduce((a, f) => a + Number(f.ponderacion), 0)
  const subtotalAluObt = alumnos.reduce((a, f) => a + Number(f.obtenido_porcentaje), 0)
  const total = Math.round((subtotalInstObt + subtotalAluObt) * 100) / 100

  // Abierta en una pestaña nueva (desde Cátedras / Emisión de fojas) la
  // pestaña no tiene historial: se cierra y queda la lista filtrada que
  // estaba atrás. Abierta en la misma pestaña, vuelve a la pantalla
  // anterior.
  const volver = () => {
    if (window.history.length <= 1) window.close()
    else navigate(-1)
  }

  return (
    <div className="page-padding foja-desempeno">
      <div className="form-actions no-print" style={{ marginBottom: '1rem', alignItems: 'center' }}>
        <button type="button" className="btn btn-secondary" onClick={volver}>
          ← Volver a la lista
        </button>
        <button type="button" className="btn btn-primary" onClick={imprimir} disabled={registrando}>
          {registrando ? 'Registrando...' : 'Imprimir'}
        </button>
        <span className="muted-text">
          {impresiones.length === 0
            ? 'Esta foja todavía no se imprimió.'
            : `Impresa ${impresiones.length} ${impresiones.length === 1 ? 'vez' : 'veces'} · última el ${new Date(
                impresiones[0].impreso_en,
              ).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })}`}
        </span>
      </div>
      {avisoRegistro && <p className="error-text no-print">{avisoRegistro}</p>}

      <div className="foja-card">
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
            <p className="muted-text" style={{ fontSize: 12, margin: '4px 0 0' }}>
              Avda. Universidad Nacional del Este y Avda. Paraguay - Km 8 Acaray - Campus Universitario - Ciudad del
              Este - Paraguay
            </p>
          </div>
        </div>

        <h3 style={{ textAlign: 'center', margin: '18px 0 4px' }}>
          Programa de Evaluación y Acompañamiento Docente — Foja de Desempeño
        </h3>
        <p style={{ textAlign: 'center', margin: '0 0 18px' }} className="muted-text">
          Periodo Lectivo {encabezado.periodo_lectivo}
        </p>

        <table className="foja-datos">
          <tbody>
            <tr>
              <td>
                <strong>Carrera:</strong> {encabezado.carrera}
              </td>
              <td>
                <strong>Sede:</strong> {encabezado.sede}
              </td>
            </tr>
            <tr>
              <td>
                <strong>Materia:</strong> {encabezado.asignatura}
              </td>
              <td>
                <strong>Curso:</strong> {encabezado.curso_nivel}
              </td>
            </tr>
            <tr>
              <td>
                <strong>Profesor:</strong> {encabezado.profesor_completo}
              </td>
              <td>
                <strong>Sección:</strong> {encabezado.seccion_grupo}
              </td>
            </tr>
          </tbody>
        </table>

        <table className="data-table foja-tabla">
          <thead>
            <tr>
              <th style={{ width: 40 }}>N°</th>
              <th>CRITERIOS INSTITUCIONALES EVALUADOS</th>
              <th style={{ width: 100 }}>PONDERACIÓN</th>
              <th style={{ width: 100 }}>OBTENIDO</th>
            </tr>
          </thead>
          <tbody>
            {institucionales.map((f) => (
              <tr key={f.criterio_id}>
                <td>{f.orden}</td>
                <td>
                  {f.criterio_descripcion || f.criterio_nombre}
                  {sinContenido && f.origen === 'OBJETIVO_CLASES_CONTENIDO' && ' (*)'}
                </td>
                <td>{f.ponderacion}%</td>
                <td>{f.obtenido_porcentaje}%</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 600 }}>
              <td colSpan={2}>PORCENTAJE OBTENIDO (Sub Total)</td>
              <td>{subtotalInstPond}%</td>
              <td>{Math.round(subtotalInstObt * 100) / 100}%</td>
            </tr>
          </tbody>
        </table>

        {sinContenido && (
          <p className="muted-text" style={{ fontSize: 11, margin: '4px 0 0' }}>
            (*) Calculado solo con la asistencia a clases, sin el desarrollo de contenido programático:{' '}
            {sinContenido.motivo}.
          </p>
        )}

        <table className="data-table foja-tabla" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>N°</th>
              <th>INDICADORES DE LA VALORACIÓN DE ALUMNOS</th>
              <th style={{ width: 100 }}>PONDERACIÓN</th>
              <th style={{ width: 100 }}>OBTENIDO</th>
            </tr>
          </thead>
          <tbody>
            {alumnos.map((f) => (
              <tr key={f.criterio_id}>
                <td>{f.orden}</td>
                <td>{f.criterio_descripcion || f.criterio_nombre}</td>
                <td>{f.ponderacion}%</td>
                <td>{f.obtenido_porcentaje}%</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 600 }}>
              <td colSpan={2}>PORCENTAJE OBTENIDO (Sub Total)</td>
              <td>{subtotalAluPond}%</td>
              <td>{Math.round(subtotalAluObt * 100) / 100}%</td>
            </tr>
          </tbody>
        </table>

        <table className="data-table foja-tabla" style={{ marginTop: 16 }}>
          <tbody>
            <tr style={{ fontWeight: 700 }}>
              <td>PORCENTAJE TOTAL OBTENIDO</td>
              <td style={{ width: 140, textAlign: 'right' }}>{total}%</td>
            </tr>
            <tr style={{ fontWeight: 700 }}>
              <td>RANGO ESTIMADO</td>
              <td style={{ width: 140, textAlign: 'right' }}>{clasificar(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
