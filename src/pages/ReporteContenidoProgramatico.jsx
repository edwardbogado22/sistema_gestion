import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const formatoFechaHora = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const fecha = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${fecha} ${hora}`
}

export function ReporteContenidoProgramatico() {
  const { catedraId } = useParams()
  const [catedra, setCatedra] = useState(null)
  const [linea, setLinea] = useState([])
  const [guardados, setGuardados] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    ;(async () => {
      setLoading(true)
      setError('')

      const { data: c, error: eC } = await supabase
        .from('catedras')
        .select(
          'id, seccion_grupo, periodo_lectivo, profesores(nombres, apellidos, documento_identidad), asignaturas(id, nombre, codigo, carreras(nombre)), sedes(nombre)',
        )
        .eq('id', catedraId)
        .maybeSingle()
      if (!activo) return
      if (eC || !c) {
        setError('No se encontró la cátedra.')
        setLoading(false)
        return
      }
      setCatedra(c)

      const { data: avance } = await supabase
        .from('catedra_contenido_avance')
        .select('marcado_en, contenido_subtema(numero, descripcion, contenido_unidad(numero, nombre))')
        .eq('catedra_id', catedraId)
        .order('marcado_en', { ascending: true })
      if (!activo) return
      setLinea(avance || [])

      const { data: historial } = await supabase
        .from('catedra_contenido_avance_historial')
        .select('registrado_en, registrado_por, subtemas_marcados')
        .eq('catedra_id', catedraId)
        .order('registrado_en', { ascending: true })
      if (!activo) return

      const idsUsuarios = [...new Set((historial || []).map((h) => h.registrado_por).filter(Boolean))]
      let nombrePorUsuario = {}
      if (idsUsuarios.length > 0) {
        const { data: perfiles } = await supabase
          .from('usuarios_perfil')
          .select('user_id, nombre_completo')
          .in('user_id', idsUsuarios)
        nombrePorUsuario = Object.fromEntries((perfiles || []).map((p) => [p.user_id, p.nombre_completo]))
      }
      setGuardados((historial || []).map((h) => ({ ...h, nombre: nombrePorUsuario[h.registrado_por] || 'Usuario eliminado' })))

      setLoading(false)
    })()
    return () => {
      activo = false
    }
  }, [catedraId])

  if (loading) return <div className="page-padding">Cargando...</div>
  if (error) return <div className="page-padding error-text">{error}</div>

  const profesor = `${catedra.profesores.nombres} ${catedra.profesores.apellidos}`

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Reporte de carga de contenido programático</h1>
        <p>
          <Link to="/catedras">← Volver a Cátedras</Link>
        </p>
      </div>

      <div className="form-card" style={{ marginBottom: '1.5rem' }}>
        <div className="form-grid">
          <div>
            <strong>Materia:</strong> {catedra.asignaturas.nombre} ({catedra.asignaturas.codigo})
          </div>
          <div>
            <strong>Carrera:</strong> {catedra.asignaturas.carreras?.nombre}
          </div>
          <div>
            <strong>Sede:</strong> {catedra.sedes?.nombre}
          </div>
          <div>
            <strong>Sección:</strong> {catedra.seccion_grupo} · <strong>Período:</strong> {catedra.periodo_lectivo}
          </div>
          <div>
            <strong>Docente responsable:</strong> {profesor} (C.I. {catedra.profesores.documento_identidad})
          </div>
        </div>
      </div>

      <div className="form-card" style={{ marginBottom: '1.5rem' }}>
        <h3>Orden cronológico de carga</h3>
        <p className="muted-text">
          El profesor puede avanzar en el orden que prefiera dentro del temario; acá se ve el orden real en que se
          fue marcando cada subtema, no el orden del temario.
        </p>
        {linea.length === 0 ? (
          <p className="muted-text">Todavía no se marcó ningún subtema para esta cátedra.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Unidad</th>
                  <th>Subtema</th>
                </tr>
              </thead>
              <tbody>
                {linea.map((l, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatoFechaHora(l.marcado_en)}</td>
                    <td>
                      {l.contenido_subtema.contenido_unidad.numero} — {l.contenido_subtema.contenido_unidad.nombre}
                    </td>
                    <td>
                      {l.contenido_subtema.numero}. {l.contenido_subtema.descripcion}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="form-card">
        <h3>Historial de guardados</h3>
        <p className="muted-text">Cada vez que se presionó "Guardar y terminar" en el kiosco, con quién lo hizo.</p>
        {guardados.length === 0 ? (
          <p className="muted-text">Todavía no se registró ningún guardado.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Registrado por</th>
                  <th>Subtemas marcados en ese momento</th>
                </tr>
              </thead>
              <tbody>
                {guardados.map((g, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatoFechaHora(g.registrado_en)}</td>
                    <td>{g.nombre}</td>
                    <td>{g.subtemas_marcados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
