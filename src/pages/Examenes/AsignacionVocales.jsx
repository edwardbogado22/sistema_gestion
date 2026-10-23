import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fetchTodo } from '../../lib/paginar'
import { aISO, deISO, formatoLargo } from '../../lib/fechas'
import { descargarFilas } from '../../lib/csv'
import { construirContexto, candidatos, estado, vocalesFueraDeCriterio, motivosConflicto, asignarAuto, equilibrarCarga, calcularRebalanceo, diaSemana } from '../../lib/vocalesExamen'

const sinFiltro = { sede_id: '', carrera_id: '', curso_nivel: '', estado: '', busqueda: '' }

const nombreProfesor = (p) => (p ? `${p.apellidos}, ${p.nombres}` : null)

// Todos los vocales de una mesa, en orden: los dos de las columnas y, si
// los hay, los que sobran.
const vocalesDe = (f) =>
  [
    f.vocal1_id && { id: f.vocal1_id, nombre: f.vocal1_nombre },
    f.vocal2_id && { id: f.vocal2_id, nombre: f.vocal2_nombre },
    ...(f.extras || []),
  ].filter(Boolean)

export function AsignacionVocales() {
  const { llamadoId } = useParams()
  const [llamado, setLlamado] = useState(null)
  const [filas, setFilas] = useState([])
  const [filasOriginales, setFilasOriginales] = useState([])
  const [fechasHabilesPorDia, setFechasHabilesPorDia] = useState(new Map())
  const [presencia, setPresencia] = useState(new Map())
  const [filtro, setFiltro] = useState(sinFiltro)
  const [editando, setEditando] = useState(null) // { idx, campo }
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [rebalanceo, setRebalanceo] = useState(null) // { propuestas, base, final }
  const [seleccionadas, setSeleccionadas] = useState(new Set())
  const [rebalanceando, setRebalanceando] = useState(false)

  const cargar = async () => {
    setLoading(true)
    setError('')

    const { data: ll, error: eLl } = await supabase.from('examen_llamado').select('*').eq('id', llamadoId).single()
    if (eLl) {
      setError(eLl.message)
      setLoading(false)
      return
    }
    setLlamado(ll)

    const [{ data: agenda, error: eAg }, { data: bloqueados, error: eBl }, { data: horarios, error: eHo }] = await Promise.all([
      supabase.from('v_examen_agenda').select('*').eq('llamado_id', llamadoId).not('fecha', 'is', null),
      supabase.rpc('dias_bloqueados_llamado', { p_llamado: llamadoId }),
      supabase.from('v_catedra_horario').select('profesor_id, sede_id, dia_semana').eq('periodo_lectivo', ll.periodo_lectivo),
    ])
    const err = eAg || eBl || eHo
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    const presenciaMapa = new Map()
    for (const h of horarios || []) {
      if (!presenciaMapa.has(h.profesor_id)) presenciaMapa.set(h.profesor_id, new Map())
      const porSede = presenciaMapa.get(h.profesor_id)
      if (!porSede.has(h.sede_id)) porSede.set(h.sede_id, new Set())
      porSede.get(h.sede_id).add(h.dia_semana)
    }
    setPresencia(presenciaMapa)

    // mesa_integrante puede superar las 1000 filas que PostgREST devuelve
    // por defecto (2 vocales × cientos de mesas) — sin paginar, esto
    // "olvida" vocales ya asignados y Asignar automáticamente intenta
    // duplicarlos.
    const { data: integrantes, error: eInt } = await fetchTodo((desde, hasta) =>
      supabase
        .from('mesa_integrante')
        .select('examen_fecha_id, profesor_id, rol_mesa, profesores(nombres, apellidos), examen_fecha!inner(llamado_id)')
        .eq('examen_fecha.llamado_id', llamadoId)
        .eq('rol_mesa', 'VOCAL')
        .order('id')
        .range(desde, hasta),
    )
    if (eInt) {
      setError(eInt.message)
      setLoading(false)
      return
    }

    const vocalesPorFecha = new Map()
    for (const it of integrantes || []) {
      if (!vocalesPorFecha.has(it.examen_fecha_id)) vocalesPorFecha.set(it.examen_fecha_id, [])
      vocalesPorFecha.get(it.examen_fecha_id).push(it)
    }

    const nuevasFilas = (agenda || []).map((a) => {
      const vocales = vocalesPorFecha.get(a.examen_fecha_id) || []
      return {
        catedra_id: a.catedra_id,
        examen_fecha_id: a.examen_fecha_id,
        fecha: a.fecha,
        sede_id: a.sede_id,
        sede: a.sede,
        carrera_id: a.carrera_id,
        carrera: a.carrera,
        curso_nivel: a.curso_nivel,
        seccion_grupo: a.seccion_grupo,
        materia: a.materia,
        optativa: a.optativa,
        titular_id: a.profesor_id,
        titular_nombre: a.profesor,
        vocal1_id: vocales[0]?.profesor_id || null,
        vocal1_nombre: vocales[0] ? nombreProfesor(vocales[0].profesores) : null,
        vocal2_id: vocales[1]?.profesor_id || null,
        vocal2_nombre: vocales[1] ? nombreProfesor(vocales[1].profesores) : null,
        // Una mesa lleva dos vocales, pero la base no lo impide. Si hay
        // más se cargan igual: esconderlos dejaría vocales designados que
        // nadie ve acá y sí aparecen en el reporte y en /mis-mesas.
        extras: vocales.slice(2).map((v) => ({ id: v.profesor_id, nombre: nombreProfesor(v.profesores) })),
      }
    })
    nuevasFilas.sort(
      (a, b) =>
        a.carrera.localeCompare(b.carrera) ||
        a.curso_nivel - b.curso_nivel ||
        a.seccion_grupo.localeCompare(b.seccion_grupo) ||
        a.materia.localeCompare(b.materia),
    )

    setFilas(nuevasFilas)
    setFilasOriginales(nuevasFilas.map((f) => ({ ...f })))

    const bloqueadas = new Set((bloqueados || []).map((b) => b.fecha))
    setFechasHabilesPorDia(construirFechasHabiles(ll.fecha_inicio, ll.fecha_fin, bloqueadas))

    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llamadoId])

  // Complementario y Regularización: sin tope de mesas por profesor y día
  const opcionesCtx = useMemo(() => ({ sinTopeDiario: !!llamado && llamado.tipo !== 'ORDINARIO' }), [llamado])
  const ctx = useMemo(() => construirContexto(filas, presencia, opcionesCtx), [filas, presencia, opcionesCtx])

  const opciones = useMemo(() => {
    const unico = (clave, etiquetaClave) => {
      const mapa = new Map()
      for (const f of filas) if (f[clave]) mapa.set(f[clave], f[etiquetaClave])
      return [...mapa].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
    }
    return {
      sedes: unico('sede_id', 'sede'),
      carreras: unico('carrera_id', 'carrera'),
      cursos: [...new Set(filas.map((f) => f.curso_nivel))].sort((a, b) => a - b),
    }
  }, [filas])

  const visibles = useMemo(() => {
    const q = filtro.busqueda.trim().toLowerCase()
    return filas
      .map((f, idx) => ({ f, idx }))
      .filter(({ f, idx }) => {
        if (filtro.sede_id && f.sede_id !== filtro.sede_id) return false
        if (filtro.carrera_id && f.carrera_id !== filtro.carrera_id) return false
        if (filtro.curso_nivel && String(f.curso_nivel) !== filtro.curso_nivel) return false
        if (filtro.estado && estado(filas, idx, ctx) !== filtro.estado) return false
        if (q) {
          const blob = [f.materia, f.titular_nombre, f.vocal1_nombre, f.vocal2_nombre].join(' ').toLowerCase()
          if (!blob.includes(q)) return false
        }
        return true
      })
  }, [filas, filtro, ctx])

  const pendientes = useMemo(() => {
    let n = 0
    for (let i = 0; i < filas.length; i++) {
      if (
        filas[i].vocal1_id !== filasOriginales[i]?.vocal1_id ||
        filas[i].vocal2_id !== filasOriginales[i]?.vocal2_id ||
        filas[i].extras.length !== filasOriginales[i]?.extras.length
      )
        n++
    }
    return n
  }, [filas, filasOriginales])

  const stats = useMemo(() => {
    let ok_ = 0,
      warn = 0,
      err = 0
    for (let i = 0; i < filas.length; i++) {
      const e = estado(filas, i, ctx)
      if (e === 'ok') ok_++
      else if (e === 'warn') warn++
      else err++
    }
    return { total: filas.length, ok: ok_, warn, err }
  }, [filas, ctx])

  // Le pasa el mismo sede/carrera/curso que se tiene filtrado acá al
  // reporte para imprimir, para no tener que repetirlo ni recortar el
  // PDF después con otro programa.
  const reporteQuery = useMemo(() => {
    const q = new URLSearchParams()
    if (filtro.sede_id) q.set('sede', filtro.sede_id)
    if (filtro.carrera_id) q.set('carrera', filtro.carrera_id)
    if (filtro.curso_nivel) q.set('curso', filtro.curso_nivel)
    const s = q.toString()
    return s ? `?${s}` : ''
  }, [filtro])

  const asignar = () => {
    setFilas(asignarAuto(filas, presencia, opcionesCtx))
    setOk('')
    setError('')
  }

  const equilibrar = () => {
    const r = equilibrarCarga(filas, presencia, opcionesCtx)
    setError('')
    if (r.cambios === 0) {
      setOk('La carga ya está pareja: no hay ningún pase posible que respete las reglas de convocatoria.')
      return
    }
    setFilas(r.filas)
    setOk(
      `Se proponen ${r.cambios} cambio(s) de examinador: el más cargado pasa de ${r.antes.max} a ${r.despues.max} mesas, ` +
        `y las examinaciones se reparten entre ${r.despues.profesores} profesores (antes ${r.antes.profesores}). ` +
        'Revisá la tabla y tocá "Guardar cambios" para confirmarlos ' +
        '(o recargá la página para descartarlos).',
    )
  }

  const setVocal = (idx, campo, profesorId) => {
    const base = campo.replace(/_id$/, '')
    setFilas((fs) => {
      const nuevas = [...fs]
      nuevas[idx] = {
        ...nuevas[idx],
        [campo]: profesorId || null,
        [`${base}_nombre`]: profesorId ? ctx.nombrePorId.get(profesorId) : null,
      }
      return nuevas
    })
    setEditando(null)
  }

  // Saca un vocal de una mesa que tiene de más. Los que quedan se
  // reacomodan: los dos primeros pasan a ser Vocal 1 y Vocal 2, así se
  // puede quitar cualquiera y no solo los que cayeron como sobrantes.
  const quitarVocal = (idx, profesorId) => {
    setFilas((fs) => {
      const f = fs[idx]
      const quedan = vocalesDe(f).filter((v) => v.id !== profesorId)
      const nuevas = [...fs]
      nuevas[idx] = {
        ...f,
        vocal1_id: quedan[0]?.id || null,
        vocal1_nombre: quedan[0]?.nombre || null,
        vocal2_id: quedan[1]?.id || null,
        vocal2_nombre: quedan[1]?.nombre || null,
        extras: quedan.slice(2),
      }
      return nuevas
    })
    setEditando(null)
  }

  const guardar = async () => {
    setGuardando(true)
    setError('')
    setOk('')

    const inserts = []
    const deletes = []
    for (let i = 0; i < filas.length; i++) {
      const actual = new Set(vocalesDe(filas[i]).map((v) => v.id))
      const original = new Set(filasOriginales[i] ? vocalesDe(filasOriginales[i]).map((v) => v.id) : [])
      for (const id of actual) if (!original.has(id)) inserts.push({ examen_fecha_id: filas[i].examen_fecha_id, profesor_id: id, rol_mesa: 'VOCAL' })
      for (const id of original) if (!actual.has(id)) deletes.push({ examen_fecha_id: filas[i].examen_fecha_id, profesor_id: id })
    }

    if (inserts.length) {
      const { error: eIns } = await supabase.from('mesa_integrante').insert(inserts)
      if (eIns) {
        setError(eIns.message)
        setGuardando(false)
        return
      }
    }
    if (deletes.length) {
      const resultados = await Promise.all(
        deletes.map((d) =>
          supabase.from('mesa_integrante').delete().eq('examen_fecha_id', d.examen_fecha_id).eq('profesor_id', d.profesor_id),
        ),
      )
      const eDel = resultados.find((r) => r.error)
      if (eDel) {
        setError(eDel.error.message)
        setGuardando(false)
        return
      }
    }

    setOk(`Se guardaron ${inserts.length + deletes.length} cambio(s).`)
    setGuardando(false)
    cargar()
  }

  const exportarCSV = () => {
    descargarFilas(
      `vocales-${llamado?.nombre || 'llamado'}.csv`,
      filas.map((f, idx) => ({
        fecha: f.fecha,
        dia: diaSemana(f.fecha),
        sede: f.sede,
        carrera: f.carrera,
        curso: f.curso_nivel,
        seccion: f.seccion_grupo,
        materia: f.materia,
        presidente: f.titular_nombre,
        vocal1: f.vocal1_nombre || '',
        vocal2: f.vocal2_nombre || '',
        vocales_de_mas: f.extras.map((v) => v.nombre).join(' / '),
        estado: estado(filas, idx, ctx),
      })),
    )
  }

  const abrirRebalanceo = () => {
    setRebalanceando(true)
    setTimeout(() => {
      const r = calcularRebalanceo(filas, fechasHabilesPorDia, presencia, opcionesCtx)
      setRebalanceo(r)
      setSeleccionadas(new Set(r.propuestas.map((_, i) => i)))
      setRebalanceando(false)
    }, 30)
  }

  const aplicarRebalanceo = async () => {
    if (!rebalanceo) return
    setGuardando(true)
    setError('')
    const aplicar = rebalanceo.propuestas.filter((_, i) => seleccionadas.has(i))
    const fallos = []
    for (const p of aplicar) {
      for (const catedraId of p.catedraIds) {
        const { error: eUp } = await supabase
          .from('examen_fecha')
          .upsert({ llamado_id: llamadoId, catedra_id: catedraId, fecha: p.destino }, { onConflict: 'llamado_id,catedra_id' })
        if (eUp) fallos.push(`${p.etiqueta}: ${eUp.message}`)
      }
    }
    setGuardando(false)
    setRebalanceo(null)
    if (fallos.length) {
      setError(`Algunos movimientos no se pudieron aplicar:\n${fallos.join('\n')}`)
    } else {
      setOk(`${aplicar.length} movimiento(s) aplicado(s). Revisá y volvé a asignar vocales.`)
    }
    cargar()
  }

  if (loading) return <p className="page-padding muted-text">Cargando...</p>
  if (error && filas.length === 0) return <p className="page-padding error-text">{error}</p>

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Asignación de Vocales</h1>
        <p>
          {llamado?.nombre} · {llamado?.periodo_lectivo} · Estado: {llamado?.estado}
        </p>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Mesas</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.ok}</div>
          <div className="stat-label">Completas</div>
        </div>
        {/* tocar la tarjeta filtra la tabla por ese estado (y de nuevo lo quita) */}
        <button
          type="button"
          className="stat-card"
          style={{ cursor: 'pointer', textAlign: 'left', font: 'inherit', outline: filtro.estado === 'warn' ? '2px solid var(--gold)' : undefined }}
          onClick={() => setFiltro({ ...filtro, estado: filtro.estado === 'warn' ? '' : 'warn' })}
        >
          <div className="stat-value">{stats.warn}</div>
          <div className="stat-label">Incompletas · ver</div>
        </button>
        <button
          type="button"
          className="stat-card"
          style={{ cursor: 'pointer', textAlign: 'left', font: 'inherit', outline: filtro.estado === 'err' ? '2px solid var(--danger)' : undefined }}
          onClick={() => setFiltro({ ...filtro, estado: filtro.estado === 'err' ? '' : 'err' })}
        >
          <div className="stat-value">{stats.err}</div>
          <div className="stat-label">Conflictos · ver</div>
        </button>
      </div>

      <div className="form-row" style={{ marginBottom: 16, alignItems: 'center' }}>
        <select value={filtro.sede_id} onChange={(e) => setFiltro({ ...filtro, sede_id: e.target.value })}>
          <option value="">Todas las sedes</option>
          {opciones.sedes.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={filtro.carrera_id} onChange={(e) => setFiltro({ ...filtro, carrera_id: e.target.value })}>
          <option value="">Todas las carreras</option>
          {opciones.carreras.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={filtro.curso_nivel} onChange={(e) => setFiltro({ ...filtro, curso_nivel: e.target.value })}>
          <option value="">Todos los cursos</option>
          {opciones.cursos.map((c) => (
            <option key={c} value={String(c)}>
              {c}º
            </option>
          ))}
        </select>
        <select value={filtro.estado} onChange={(e) => setFiltro({ ...filtro, estado: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="err">Con conflicto</option>
          <option value="warn">Incompletas</option>
          <option value="ok">Completas</option>
        </select>
        <input
          value={filtro.busqueda}
          onChange={(e) => setFiltro({ ...filtro, busqueda: e.target.value })}
          placeholder="Materia o profesor..."
          style={{ minWidth: 200 }}
        />
        <button type="button" className="chip" onClick={() => setFiltro(sinFiltro)}>
          Limpiar filtros
        </button>
      </div>

      {error && <p className="error-text" style={{ whiteSpace: 'pre-line' }}>{error}</p>}
      {ok && <p className="muted-text">{ok}</p>}

      <div className="form-actions" style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" onClick={asignar}>
          Asignar automáticamente
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={equilibrar}
          title="Pasa mesas de los examinadores más cargados a otros del plantel que vienen ese día a la sede"
        >
          Equilibrar carga
        </button>
        <button type="button" className="btn btn-secondary" onClick={exportarCSV}>
          Descargar CSV
        </button>
        <Link to={`/examenes/${llamadoId}/mesas-reporte${reporteQuery}`} className="btn btn-secondary">
          Reporte para imprimir
        </Link>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={llamado?.estado !== 'ASIGNACION' || rebalanceando}
          onClick={abrirRebalanceo}
          title={llamado?.estado !== 'ASIGNACION' ? 'Solo con el llamado en asignación (reabrilo si hace falta)' : ''}
        >
          {rebalanceando ? 'Calculando...' : 'Rebalancear fechas'}
        </button>
        <div style={{ flex: 1 }} />
        {pendientes > 0 && <span className="muted-text">{pendientes} cambio(s) sin guardar</span>}
        <button type="button" className="btn btn-primary" disabled={pendientes === 0 || guardando} onClick={guardar}>
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Día</th>
            <th>Sede</th>
            <th>Carrera</th>
            <th>Curso/Sec</th>
            <th>Materia</th>
            <th>Presidente</th>
            <th style={{ width: 180 }}>Vocal 1</th>
            <th style={{ width: 180 }}>Vocal 2</th>
            <th style={{ width: 90 }}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {visibles.length === 0 && (
            <tr>
              <td colSpan={10} className="muted-text">
                No hay mesas que coincidan con los filtros.
              </td>
            </tr>
          )}
          {visibles.map(({ f, idx }) => {
            const e = estado(filas, idx, ctx)
            const fuera = e === 'err' ? vocalesFueraDeCriterio(filas, idx, ctx) : []
            const motivos = e === 'err' ? motivosConflicto(filas, idx, ctx) : []
            return (
              <Fragment key={f.catedra_id}>
              <tr>
                <td>{formatoLargo(f.fecha)}</td>
                <td>{diaSemana(f.fecha)}</td>
                <td>{f.sede}</td>
                <td>{f.carrera}</td>
                <td>
                  {f.curso_nivel}º · {f.seccion_grupo}
                </td>
                <td>
                  {f.materia}
                  {f.optativa && <span className="badge badge-gold" style={{ marginLeft: 6 }}>Optativa</span>}
                </td>
                <td>{f.titular_nombre}</td>
                <CeldaVocal
                  fila={f}
                  idx={idx}
                  campo="vocal1_id"
                  editando={editando}
                  setEditando={setEditando}
                  filas={filas}
                  ctx={ctx}
                  onElegir={setVocal}
                />
                <CeldaVocal
                  fila={f}
                  idx={idx}
                  campo="vocal2_id"
                  editando={editando}
                  setEditando={setEditando}
                  filas={filas}
                  ctx={ctx}
                  onElegir={setVocal}
                />
                <td>
                  {e === 'ok' && <span className="badge badge-success">Completa</span>}
                  {e === 'warn' && <span className="badge badge-gold">Incompleta</span>}
                  {e === 'err' && (
                    <span
                      className="badge"
                      style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                    >
                      {f.extras.length > 0
                        ? 'Sobran vocales'
                        : fuera.some((v) => !v.plantel)
                          ? 'Fuera del plantel'
                          : fuera.length > 0
                            ? 'Sin clase ese día'
                            : 'Conflicto'}
                    </span>
                  )}
                  {motivos.map((m) => (
                    <div key={m} className="error-text" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.35 }}>
                      {m}
                    </div>
                  ))}
                </td>
              </tr>
              {f.extras.length > 0 && (
                <tr>
                  <td colSpan={10} style={{ background: 'var(--danger-soft)' }}>
                    Esta mesa tiene {vocalesDe(f).length} vocales guardados y lleva 2. Quitá {f.extras.length === 1 ? 'el que sobra' : `los ${f.extras.length} que sobran`} y guardá:{' '}
                    {vocalesDe(f).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="chip"
                        style={{ marginLeft: 6 }}
                        onClick={() => quitarVocal(idx, v.id)}
                        title="Quitar de esta mesa"
                      >
                        {v.nombre} ✕
                      </button>
                    ))}
                  </td>
                </tr>
              )}
              </Fragment>
            )
          })}
        </tbody>
      </table>

      {rebalanceo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 24,
          }}
        >
          <div className="form-card" style={{ maxWidth: 720, maxHeight: '85vh', overflow: 'auto', width: '100%' }}>
            <h3>Rebalanceo de fechas</h3>
            {rebalanceo.propuestas.length === 0 ? (
              <p className="muted-text">
                No se encontró ningún movimiento que destrabe mesas incompletas o con conflicto.
              </p>
            ) : (
              <>
                <p className="muted-text">
                  Mesas completables: {rebalanceo.base} → {rebalanceo.final} (+{rebalanceo.final - rebalanceo.base})
                </p>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Grupo</th>
                      <th>Día</th>
                      <th>De</th>
                      <th>A</th>
                      <th>Mejora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rebalanceo.propuestas.map((p, i) => (
                      <tr key={i}>
                        <td>
                          <input
                            type="checkbox"
                            checked={seleccionadas.has(i)}
                            onChange={(e) =>
                              setSeleccionadas((s) => {
                                const n = new Set(s)
                                if (e.target.checked) n.add(i)
                                else n.delete(i)
                                return n
                              })
                            }
                          />
                        </td>
                        <td>{p.etiqueta}</td>
                        <td>{p.dia}</td>
                        <td>{formatoLargo(p.origen)}</td>
                        <td>{formatoLargo(p.destino)}</td>
                        <td>+{p.delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setRebalanceo(null)}>
                Cancelar
              </button>
              {rebalanceo.propuestas.length > 0 && (
                <button type="button" className="btn btn-primary" disabled={guardando || seleccionadas.size === 0} onClick={aplicarRebalanceo}>
                  {guardando ? 'Aplicando...' : `Aplicar seleccionados (${seleccionadas.size})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CeldaVocal({ fila, idx, campo, editando, setEditando, filas, ctx, onElegir }) {
  const base = campo.replace(/_id$/, '')
  const abierto = editando?.idx === idx && editando?.campo === campo
  const valorId = fila[campo]
  const valorNombre = fila[`${base}_nombre`]

  if (!abierto) {
    return (
      <td
        style={{ cursor: 'pointer' }}
        onClick={() => setEditando({ idx, campo })}
        title="Clic para cambiar"
      >
        {valorNombre || <span className="muted-text">— asignar —</span>}
      </td>
    )
  }

  const otroCampo = campo === 'vocal1_id' ? 'vocal2_id' : 'vocal1_id'
  const excluir = new Set([fila.titular_id])
  if (fila[otroCampo]) excluir.add(fila[otroCampo])
  const cand = candidatos(filas, idx, excluir, ctx)
  // Menos cargado primero; a igual carga, por nombre.
  const veces = (id) => ctx.vecesVocal.get(id) || 0
  const porCarga = (ids) => [...ids].sort((a, b) => veces(a) - veces(b))
  const etiquetaCandidato = (id) => `${ctx.nombrePorId.get(id)} · ${veces(id)} ${veces(id) === 1 ? 'mesa' : 'mesas'} como examinador`

  return (
    <td>
      <select
        autoFocus
        value={valorId || ''}
        onChange={(e) => onElegir(idx, campo, e.target.value || null)}
        onBlur={() => setEditando(null)}
      >
        <option value="">— sin asignar —</option>
        {cand.optCluster.length > 0 && (
          <optgroup label={`Optativas del cluster (${cand.optCluster.length})`}>
            {porCarga(cand.optCluster).map((id) => (
              <option key={id} value={id}>
                {etiquetaCandidato(id)}
              </option>
            ))}
          </optgroup>
        )}
        {cand.presente.length > 0 && (
          <optgroup label={`Tiene clase ese día (${cand.presente.length})`}>
            {porCarga(cand.presente).map((id) => (
              <option key={id} value={id}>
                {etiquetaCandidato(id)}
              </option>
            ))}
          </optgroup>
        )}
        {valorId && !cand.todos.includes(valorId) && (
          <optgroup label="Actual (fuera de reglas)">
            <option value={valorId}>{valorNombre}</option>
          </optgroup>
        )}
      </select>
    </td>
  )
}

function construirFechasHabiles(fechaInicio, fechaFin, bloqueadas) {
  const mapa = new Map()
  let d = deISO(fechaInicio)
  const fin = deISO(fechaFin)
  while (d <= fin) {
    const iso = aISO(d)
    if (!bloqueadas.has(iso)) {
      const dia = diaSemana(iso)
      if (!mapa.has(dia)) mapa.set(dia, [])
      mapa.get(dia).push(iso)
    }
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  }
  return mapa
}
