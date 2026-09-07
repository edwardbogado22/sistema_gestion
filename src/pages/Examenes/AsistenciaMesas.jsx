import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatoLargo } from '../../lib/fechas'

const ROL_LABEL = { TITULAR: 'Presidente', VOCAL: 'Vocal', PRESIDENTE: 'Presidente' }

const nombreProfesor = (p) => (p ? `${p.apellidos}, ${p.nombres}` : '')

export function AsistenciaMesas() {
  const { llamadoId } = useParams()
  const [llamado, setLlamado] = useState(null)
  const [filas, setFilas] = useState([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [recalculando, setRecalculando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

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

    const { data: agenda, error: eAg } = await supabase
      .from('v_examen_agenda')
      .select('*')
      .eq('llamado_id', llamadoId)
      .not('fecha', 'is', null)
    if (eAg) {
      setError(eAg.message)
      setLoading(false)
      return
    }

    const { data: integrantes, error: eInt } = await supabase
      .from('mesa_integrante')
      .select('id, examen_fecha_id, profesor_id, rol_mesa, asistio, profesores(nombres, apellidos), examen_fecha!inner(llamado_id)')
      .eq('examen_fecha.llamado_id', llamadoId)
    if (eInt) {
      setError(eInt.message)
      setLoading(false)
      return
    }

    const porFecha = new Map()
    for (const it of integrantes || []) {
      if (!porFecha.has(it.examen_fecha_id)) porFecha.set(it.examen_fecha_id, [])
      porFecha.get(it.examen_fecha_id).push({
        id: it.id,
        profesor_id: it.profesor_id,
        nombre: nombreProfesor(it.profesores),
        rol_mesa: it.rol_mesa,
        asistio: it.asistio,
      })
    }

    const nuevas = (agenda || []).map((a) => {
      const integ = [...(porFecha.get(a.examen_fecha_id) || [])]
      const tieneTitular = integ.some((i) => i.profesor_id === a.profesor_id)
      if (!tieneTitular) {
        integ.unshift({ id: null, profesor_id: a.profesor_id, nombre: a.profesor, rol_mesa: 'TITULAR', asistio: null })
      }
      integ.sort((x, y) => (x.rol_mesa === 'VOCAL') - (y.rol_mesa === 'VOCAL'))
      return {
        examen_fecha_id: a.examen_fecha_id,
        catedra_id: a.catedra_id,
        fecha: a.fecha,
        materia: a.materia,
        curso_nivel: a.curso_nivel,
        seccion_grupo: a.seccion_grupo,
        carrera: a.carrera,
        sede: a.sede,
        integrantes: integ,
      }
    })
    nuevas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.materia.localeCompare(b.materia))

    setFilas(nuevas)
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llamadoId])

  const pendientes = useMemo(
    () => filas.reduce((n, f) => n + f.integrantes.filter((i) => i._cambiado).length, 0),
    [filas],
  )

  const setAsistio = (examenFechaId, profesorId, valor) => {
    setFilas((fs) =>
      fs.map((f) =>
        f.examen_fecha_id !== examenFechaId
          ? f
          : {
              ...f,
              integrantes: f.integrantes.map((i) =>
                i.profesor_id !== profesorId ? i : { ...i, asistio: valor, _cambiado: true },
              ),
            },
      ),
    )
  }

  const guardar = async () => {
    setGuardando(true)
    setError('')
    setOk('')
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const aInsertar = []
    const aActualizar = []
    for (const f of filas) {
      for (const i of f.integrantes) {
        if (!i._cambiado) continue
        if (i.id === null) {
          aInsertar.push({
            examen_fecha_id: f.examen_fecha_id,
            profesor_id: i.profesor_id,
            rol_mesa: i.rol_mesa,
            asistio: i.asistio,
            registrado_por: user?.id,
            registrado_en: new Date().toISOString(),
          })
        } else {
          aActualizar.push({ id: i.id, asistio: i.asistio })
        }
      }
    }

    if (aInsertar.length) {
      const { error: eIns } = await supabase
        .from('mesa_integrante')
        .upsert(aInsertar, { onConflict: 'examen_fecha_id,profesor_id' })
      if (eIns) {
        setError(eIns.message)
        setGuardando(false)
        return
      }
    }
    if (aActualizar.length) {
      const resultados = await Promise.all(
        aActualizar.map((a) =>
          supabase
            .from('mesa_integrante')
            .update({ asistio: a.asistio, registrado_por: user?.id, registrado_en: new Date().toISOString() })
            .eq('id', a.id),
        ),
      )
      const eUp = resultados.find((r) => r.error)
      if (eUp) {
        setError(eUp.error.message)
        setGuardando(false)
        return
      }
    }

    setOk(`Se guardaron ${aInsertar.length + aActualizar.length} registro(s) de asistencia.`)
    setGuardando(false)
    cargar()
  }

  const recalcular = async () => {
    setRecalculando(true)
    setError('')
    setOk('')
    const { data, error: eRpc } = await supabase.rpc('recalcular_asistencia_mesas', { p_periodo: llamado.periodo_lectivo })
    setRecalculando(false)
    if (eRpc) {
      setError(eRpc.message)
      return
    }
    setOk(`Punto 5 de la Foja recalculado para ${data} cátedra(s) del periodo ${llamado.periodo_lectivo}.`)
  }

  if (loading) return <p className="page-padding muted-text">Cargando...</p>
  if (error && filas.length === 0) return <p className="page-padding error-text">{error}</p>

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Asistencia a Mesas Examinadoras</h1>
        <p>
          {llamado?.nombre} · Periodo {llamado?.periodo_lectivo}
        </p>
      </div>

      {error && <p className="error-text">{error}</p>}
      {ok && <p className="muted-text">{ok}</p>}

      <div className="form-actions" style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" disabled={pendientes === 0 || guardando} onClick={guardar}>
          {guardando ? 'Guardando...' : `Guardar asistencia (${pendientes})`}
        </button>
        <button type="button" className="btn btn-secondary" disabled={recalculando} onClick={recalcular}>
          {recalculando ? 'Recalculando...' : 'Recalcular asistencia en la Foja'}
        </button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Materia</th>
            <th>Carrera / Sede</th>
            <th>Profesor</th>
            <th>Rol</th>
            <th style={{ width: 160 }}>Asistió</th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr>
              <td colSpan={6} className="muted-text">
                Este llamado no tiene mesas con fecha asignada.
              </td>
            </tr>
          )}
          {filas.map((f) =>
            f.integrantes.map((i, k) => (
              <tr key={`${f.examen_fecha_id}-${i.profesor_id}`}>
                {k === 0 && (
                  <>
                    <td rowSpan={f.integrantes.length}>{formatoLargo(f.fecha)}</td>
                    <td rowSpan={f.integrantes.length}>
                      {f.curso_nivel}º {f.seccion_grupo} — {f.materia}
                    </td>
                    <td rowSpan={f.integrantes.length}>
                      {f.carrera} / {f.sede}
                    </td>
                  </>
                )}
                <td>{i.nombre}</td>
                <td>{ROL_LABEL[i.rol_mesa] || i.rol_mesa}</td>
                <td>
                  <select
                    value={i.asistio === null || i.asistio === undefined ? '' : i.asistio ? 'si' : 'no'}
                    onChange={(e) =>
                      setAsistio(f.examen_fecha_id, i.profesor_id, e.target.value === '' ? null : e.target.value === 'si')
                    }
                  >
                    <option value="">Sin registrar</option>
                    <option value="si">Sí asistió</option>
                    <option value="no">No asistió</option>
                  </select>
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  )
}
