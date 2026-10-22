import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchTodo } from '../lib/paginar'
import { descargarFilas } from '../lib/csv'
import { coincideTexto } from '../lib/buscar'

const sinFiltro = { sede_id: '', carrera_id: '', curso_nivel: '', estado: '', busqueda: '' }

const fechaHora = (iso) => new Date(iso).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })
const nombreProfesor = (p) => (p ? `${p.apellidos}, ${p.nombres}` : '—')

// Informe de emisión de fojas de desempeño: qué fojas se imprimieron, a qué
// profesor, cuántas veces y quién las emitió. Los registros salen de
// foja_impresion, que se completa solo cada vez que alguien imprime una
// foja desde /foja/:catedraId.
export function EmisionFojas() {
  const [catedras, setCatedras] = useState([])
  const [impresiones, setImpresiones] = useState([])
  const [usuarios, setUsuarios] = useState(new Map())
  const [periodos, setPeriodos] = useState([])
  const [periodo, setPeriodo] = useState('')
  const [vista, setVista] = useState('catedras') // 'catedras' | 'historial'
  const [filtro, setFiltro] = useState(sinFiltro)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchTodo((desde, hasta) => supabase.from('catedras').select('id, periodo_lectivo').order('id').range(desde, hasta)).then(
      ({ data, error: e }) => {
        if (e) return setError(e.message)
        const ps = [...new Set((data || []).map((c) => c.periodo_lectivo))].sort().reverse()
        setPeriodos(ps)
        setPeriodo(ps[0] || '')
      },
    )
    supabase
      .from('usuarios_perfil')
      .select('user_id, nombre_completo')
      .then(({ data }) => setUsuarios(new Map((data || []).map((u) => [u.user_id, u.nombre_completo]))))
  }, [])

  useEffect(() => {
    if (!periodo) return
    setLoading(true)
    setError('')
    Promise.all([
      fetchTodo((desde, hasta) =>
        supabase
          .from('catedras')
          .select(
            'id, seccion_grupo, sede_id, profesores(id, documento_identidad, nombres, apellidos), asignaturas(nombre, curso_nivel, carrera_id, carreras(nombre)), sedes(nombre)',
          )
          .eq('periodo_lectivo', periodo)
          .eq('activo', true)
          .order('id')
          .range(desde, hasta),
      ),
      fetchTodo((desde, hasta) =>
        supabase
          .from('foja_impresion')
          .select('id, catedra_id, profesor_id, impreso_por, impreso_en, profesores(documento_identidad, nombres, apellidos)')
          .eq('periodo_lectivo', periodo)
          .order('id')
          .range(desde, hasta),
      ),
    ]).then(([{ data: c, error: e1 }, { data: imp, error: e2 }]) => {
      const err = e1 || e2
      if (err) setError(err.message)
      setCatedras(c || [])
      setImpresiones((imp || []).sort((a, b) => b.impreso_en.localeCompare(a.impreso_en)))
      setLoading(false)
    })
  }, [periodo])

  const porCatedra = useMemo(() => {
    const mapa = new Map()
    for (const i of impresiones) {
      if (!mapa.has(i.catedra_id)) mapa.set(i.catedra_id, [])
      mapa.get(i.catedra_id).push(i) // ya vienen de la más reciente a la más vieja
    }
    return mapa
  }, [impresiones])

  const catedraPorId = useMemo(() => new Map(catedras.map((c) => [c.id, c])), [catedras])

  const opciones = useMemo(() => {
    const unico = (valor, etiqueta) => {
      const m = new Map()
      for (const c of catedras) {
        const v = valor(c)
        if (v != null && v !== '') m.set(String(v), etiqueta(c))
      }
      return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }))
    }
    return {
      sedes: unico((c) => c.sede_id, (c) => c.sedes?.nombre || ''),
      carreras: unico((c) => c.asignaturas?.carrera_id, (c) => c.asignaturas?.carreras?.nombre || ''),
      cursos: unico((c) => c.asignaturas?.curso_nivel, (c) => `${c.asignaturas?.curso_nivel}º`),
    }
  }, [catedras])

  const pasaFiltroCatedra = (c) => {
    if (!c) return false
    if (filtro.sede_id && c.sede_id !== filtro.sede_id) return false
    if (filtro.carrera_id && c.asignaturas?.carrera_id !== filtro.carrera_id) return false
    if (filtro.curso_nivel && String(c.asignaturas?.curso_nivel) !== filtro.curso_nivel) return false
    return true
  }

  const filasCatedras = useMemo(
    () =>
      catedras
        .filter((c) => {
          if (!pasaFiltroCatedra(c)) return false
          const emitida = porCatedra.has(c.id)
          if (filtro.estado === 'emitida' && !emitida) return false
          if (filtro.estado === 'pendiente' && emitida) return false
          return coincideTexto(
            filtro.busqueda,
            `${c.profesores?.documento_identidad} ${c.profesores?.nombres} ${c.profesores?.apellidos} ${c.asignaturas?.nombre}`,
          )
        })
        .sort(
          (a, b) =>
            (a.profesores?.apellidos || '').localeCompare(b.profesores?.apellidos || '') ||
            (a.profesores?.nombres || '').localeCompare(b.profesores?.nombres || '') ||
            (a.asignaturas?.nombre || '').localeCompare(b.asignaturas?.nombre || ''),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catedras, porCatedra, filtro],
  )

  const filasHistorial = useMemo(
    () =>
      impresiones.filter((i) => {
        const c = catedraPorId.get(i.catedra_id)
        if (!pasaFiltroCatedra(c)) return false
        return coincideTexto(
          filtro.busqueda,
          `${i.profesores?.documento_identidad} ${i.profesores?.nombres} ${i.profesores?.apellidos} ${c?.asignaturas?.nombre} ${usuarios.get(i.impreso_por) || ''}`,
        )
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [impresiones, catedraPorId, filtro, usuarios],
  )

  const emitidas = filasCatedras.filter((c) => porCatedra.has(c.id)).length
  const profesoresEmitidos = new Set(filasCatedras.filter((c) => porCatedra.has(c.id)).map((c) => c.profesores?.id)).size

  const exportarCSV = () => {
    if (vista === 'catedras') {
      descargarFilas(
        `emision-fojas-${periodo}.csv`,
        filasCatedras.map((c) => {
          const imp = porCatedra.get(c.id) || []
          return {
            periodo,
            documento: c.profesores?.documento_identidad || '',
            profesor: nombreProfesor(c.profesores),
            materia: c.asignaturas?.nombre || '',
            carrera: c.asignaturas?.carreras?.nombre || '',
            curso: c.asignaturas?.curso_nivel ?? '',
            seccion: c.seccion_grupo || '',
            sede: c.sedes?.nombre || '',
            estado: imp.length ? 'EMITIDA' : 'PENDIENTE',
            impresiones: imp.length,
            ultima_impresion: imp[0] ? fechaHora(imp[0].impreso_en) : '',
            emitida_por: imp[0] ? usuarios.get(imp[0].impreso_por) || '' : '',
          }
        }),
      )
    } else {
      descargarFilas(
        `historial-impresion-fojas-${periodo}.csv`,
        filasHistorial.map((i) => {
          const c = catedraPorId.get(i.catedra_id)
          return {
            fecha_hora: fechaHora(i.impreso_en),
            emitida_por: usuarios.get(i.impreso_por) || '',
            documento: i.profesores?.documento_identidad || '',
            profesor: nombreProfesor(i.profesores),
            materia: c?.asignaturas?.nombre || '',
            carrera: c?.asignaturas?.carreras?.nombre || '',
            curso: c?.asignaturas?.curso_nivel ?? '',
            seccion: c?.seccion_grupo || '',
            sede: c?.sedes?.nombre || '',
          }
        }),
      )
    }
  }

  return (
    <div className="page-padding foja-desempeno">
      <div className="page-header no-print">
        <h1>Emisión de fojas</h1>
        <p>
          Cada vez que se imprime una foja de desempeño queda registrado a qué profesor se le emitió, cuándo y quién la
          imprimió.
        </p>
      </div>

      {error && <p className="error-text no-print">{error}</p>}

      <div className="form-row no-print" style={{ marginBottom: 8, alignItems: 'center' }}>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Período">
          {periodos.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={filtro.sede_id} onChange={(e) => setFiltro({ ...filtro, sede_id: e.target.value })} aria-label="Sede">
          <option value="">Todas las sedes</option>
          {opciones.sedes.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filtro.carrera_id}
          onChange={(e) => setFiltro({ ...filtro, carrera_id: e.target.value })}
          aria-label="Carrera"
        >
          <option value="">Todas las carreras</option>
          {opciones.carreras.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filtro.curso_nivel}
          onChange={(e) => setFiltro({ ...filtro, curso_nivel: e.target.value })}
          aria-label="Curso"
        >
          <option value="">Todos los cursos</option>
          {opciones.cursos.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {vista === 'catedras' && (
          <select value={filtro.estado} onChange={(e) => setFiltro({ ...filtro, estado: e.target.value })} aria-label="Estado">
            <option value="">Emitidas y pendientes</option>
            <option value="emitida">Emitidas</option>
            <option value="pendiente">Pendientes</option>
          </select>
        )}
        <input
          value={filtro.busqueda}
          onChange={(e) => setFiltro({ ...filtro, busqueda: e.target.value })}
          placeholder="Profesor, cédula o materia..."
          style={{ minWidth: 220 }}
          aria-label="Buscar"
        />
        <button type="button" className="chip" onClick={() => setFiltro(sinFiltro)}>
          Limpiar filtros
        </button>
      </div>

      <div className="form-row no-print" style={{ marginBottom: 16, alignItems: 'center' }}>
        <div className="tabs" style={{ margin: 0 }}>
          <button type="button" className={`tab${vista === 'catedras' ? ' active' : ''}`} onClick={() => setVista('catedras')}>
            Por cátedra
          </button>
          <button
            type="button"
            className={`tab${vista === 'historial' ? ' active' : ''}`}
            onClick={() => setVista('historial')}
          >
            Historial de impresiones
          </button>
        </div>
        <button type="button" className="btn btn-secondary" onClick={exportarCSV} disabled={loading}>
          Exportar CSV
        </button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={loading}>
          Imprimir informe
        </button>
      </div>

      {loading ? (
        <p className="muted-text">Cargando...</p>
      ) : (
        <div className="foja-card" style={{ maxWidth: 'none' }}>
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
            {vista === 'catedras' ? 'Informe de emisión de fojas de desempeño' : 'Historial de impresión de fojas de desempeño'}
          </h3>
          <p style={{ textAlign: 'center', margin: '0 0 18px' }} className="muted-text">
            Periodo Lectivo {periodo}
            {vista === 'catedras'
              ? ` · ${filasCatedras.length} cátedra(s) · ${emitidas} emitida(s) · ${filasCatedras.length - emitidas} pendiente(s) · ${profesoresEmitidos} profesor(es) con foja emitida`
              : ` · ${filasHistorial.length} impresión(es)`}
          </p>

          <div className="data-table-wrap">
            {vista === 'catedras' ? (
              <table className="data-table foja-tabla">
                <thead>
                  <tr>
                    <th>Profesor</th>
                    <th>Cédula</th>
                    <th>Materia</th>
                    <th>Carrera</th>
                    <th>Curso</th>
                    <th>Sede</th>
                    <th>Estado</th>
                    <th>Veces</th>
                    <th>Última impresión</th>
                    <th>Emitida por</th>
                    <th className="no-print"></th>
                  </tr>
                </thead>
                <tbody>
                  {filasCatedras.map((c) => {
                    const imp = porCatedra.get(c.id) || []
                    return (
                      <tr key={c.id}>
                        <td>{nombreProfesor(c.profesores)}</td>
                        <td>{c.profesores?.documento_identidad}</td>
                        <td>{c.asignaturas?.nombre}</td>
                        <td>{c.asignaturas?.carreras?.nombre}</td>
                        <td>
                          {c.asignaturas?.curso_nivel}º {c.seccion_grupo}
                        </td>
                        <td>{c.sedes?.nombre}</td>
                        <td>
                          {imp.length ? (
                            <span className="badge badge-success">Emitida</span>
                          ) : (
                            <span className="badge badge-muted">Pendiente</span>
                          )}
                        </td>
                        <td>{imp.length || '—'}</td>
                        <td>{imp[0] ? fechaHora(imp[0].impreso_en) : '—'}</td>
                        <td>{imp[0] ? usuarios.get(imp[0].impreso_por) || '—' : '—'}</td>
                        <td className="no-print">
                          {/* pestaña nueva: la lista filtrada queda abierta para seguir imprimiendo */}
                          <Link to={`/foja/${c.id}`} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">
                            Ver foja
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                  {filasCatedras.length === 0 && (
                    <tr>
                      <td colSpan={11} className="muted-text">
                        Ninguna cátedra coincide con los filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="data-table foja-tabla">
                <thead>
                  <tr>
                    <th>Fecha y hora</th>
                    <th>Emitida por</th>
                    <th>Profesor</th>
                    <th>Cédula</th>
                    <th>Materia</th>
                    <th>Carrera</th>
                    <th>Curso</th>
                    <th>Sede</th>
                  </tr>
                </thead>
                <tbody>
                  {filasHistorial.map((i) => {
                    const c = catedraPorId.get(i.catedra_id)
                    return (
                      <tr key={i.id}>
                        <td>{fechaHora(i.impreso_en)}</td>
                        <td>{usuarios.get(i.impreso_por) || '—'}</td>
                        <td>{nombreProfesor(i.profesores)}</td>
                        <td>{i.profesores?.documento_identidad}</td>
                        <td>{c?.asignaturas?.nombre || '—'}</td>
                        <td>{c?.asignaturas?.carreras?.nombre || '—'}</td>
                        <td>{c ? `${c.asignaturas?.curso_nivel}º ${c.seccion_grupo}` : '—'}</td>
                        <td>{c?.sedes?.nombre || '—'}</td>
                      </tr>
                    )
                  })}
                  {filasHistorial.length === 0 && (
                    <tr>
                      <td colSpan={8} className="muted-text">
                        Todavía no se imprimió ninguna foja con estos filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
