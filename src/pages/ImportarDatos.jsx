import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { normalizar, parseArchivo, descargarCSV } from '../lib/csv'

const TABS = [
  { key: 'asignaturas', label: 'Asignaturas' },
  { key: 'profesores', label: 'Profesores' },
  { key: 'catedras', label: 'Cátedras' },
  { key: 'clases', label: 'Asistencia Clases' },
  { key: 'contenido', label: 'Cumplimiento Contenido' },
  { key: 'mesas', label: 'Mesas Examinadoras' },
  { key: 'reuniones', label: 'Asistencia Reuniones' },
  { key: 'manual', label: 'Criterios Manuales' },
  { key: 'alumnos', label: 'Encuesta Alumnos' },
]

function AyudaPlantilla({ columnas, nombreArchivo, ejemplo }) {
  return (
    <div
      className="muted-text"
      style={{ marginBottom: '1rem', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
    >
      <span>
        Columnas esperadas: <code>{columnas.join(', ')}</code>
      </span>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => descargarCSV(nombreArchivo, columnas, ejemplo)}
      >
        Descargar plantilla
      </button>
    </div>
  )
}

function TablaPreview({ filas, columnas }) {
  return (
    <div className="data-table-wrap" style={{ marginTop: '1rem' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            {columnas.map((c) => (
              <th key={c}>{c}</th>
            ))}
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              {columnas.map((c) => (
                <td key={c}>{f.row[c] ?? ''}</td>
              ))}
              <td>
                {f.estado === 'ok' ? (
                  <span className="badge badge-success">OK</span>
                ) : (
                  <span className="error-text" style={{ fontSize: 12 }}>
                    {f.mensaje}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ResumenImportacion({ resumen }) {
  if (!resumen) return null
  return (
    <p className={resumen.error ? 'error-text' : 'success-text'} style={{ marginTop: '1rem' }}>
      {resumen.ok} fila(s) importadas correctamente
      {resumen.duplicados != null ? `, ${resumen.duplicados} ya existían` : ''}, {resumen.error} con error.
    </p>
  )
}

function useCatedrasLookup() {
  const [catedras, setCatedras] = useState(null)
  useEffect(() => {
    supabase
      .from('catedras')
      .select('id, periodo_lectivo, profesores(documento_identidad), asignaturas(nombre, carreras(nombre)), sedes(nombre)')
      .then(({ data }) => setCatedras(data || []))
  }, [])
  return catedras
}

function resolverCatedra(catedras, row) {
  return (catedras || []).find(
    (c) =>
      normalizar(c.profesores?.documento_identidad) === normalizar(row.docente_documento) &&
      normalizar(c.asignaturas?.nombre) === normalizar(row.asignatura) &&
      normalizar(c.asignaturas?.carreras?.nombre) === normalizar(row.carrera) &&
      normalizar(c.sedes?.nombre) === normalizar(row.sede) &&
      normalizar(c.periodo_lectivo) === normalizar(row.periodo),
  )
}

function ImportarAsignaturas() {
  const [carreras, setCarreras] = useState([])
  const [filas, setFilas] = useState([])
  const [importando, setImportando] = useState(false)
  const [resumen, setResumen] = useState(null)
  const columnas = ['codigo', 'nombre', 'carrera', 'curso_nivel', 'horas_totales_programadas']

  useEffect(() => {
    supabase
      .from('carreras')
      .select('*')
      .then(({ data }) => setCarreras(data || []))
  }, [])

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const data = await parseArchivo(file)
    setResumen(null)
    setFilas(
      data.map((row) => {
        if (!row.nombre?.trim()) return { row, estado: 'error', mensaje: 'Falta nombre' }
        const carrera = carreras.find((c) => normalizar(c.nombre) === normalizar(row.carrera))
        if (!carrera) return { row, estado: 'error', mensaje: `Carrera "${row.carrera}" no existe` }
        return { row, estado: 'ok', mensaje: '', carreraId: carrera.id }
      }),
    )
  }

  const confirmar = async () => {
    setImportando(true)
    let ok = 0
    let error = 0
    for (const f of filas) {
      if (f.estado !== 'ok') {
        error++
        continue
      }
      const { error: err } = await supabase.from('asignaturas').insert({
        codigo: f.row.codigo,
        nombre: f.row.nombre.trim(),
        carrera_id: f.carreraId,
        curso_nivel: Number(f.row.curso_nivel) || 1,
        horas_totales_programadas: f.row.horas_totales_programadas ? Number(f.row.horas_totales_programadas) : 0,
      })
      if (err) error++
      else ok++
    }
    setImportando(false)
    setResumen({ ok, error })
  }

  return (
    <div>
      <AyudaPlantilla
        columnas={columnas}
        nombreArchivo="asignaturas_plantilla.csv"
        ejemplo={['ECO101', 'Cuentas Nacionales', 'Economía', '4', '64']}
      />
      <input type="file" accept=".csv" onChange={handleFile} />
      {filas.length > 0 && (
        <>
          <TablaPreview filas={filas} columnas={columnas} />
          <div className="form-actions">
            <button type="button" className="btn btn-primary" disabled={importando} onClick={confirmar}>
              {importando
                ? 'Importando...'
                : `Confirmar importación (${filas.filter((f) => f.estado === 'ok').length} filas válidas)`}
            </button>
          </div>
        </>
      )}
      <ResumenImportacion resumen={resumen} />
    </div>
  )
}

function ImportarProfesores() {
  const [filas, setFilas] = useState([])
  const [importando, setImportando] = useState(false)
  const [resumen, setResumen] = useState(null)
  const columnas = ['documento_identidad', 'nombres', 'apellidos', 'email', 'telefono']

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const data = await parseArchivo(file)
    setResumen(null)
    setFilas(
      data.map((row) => {
        if (!row.documento_identidad?.trim() || !row.nombres?.trim() || !row.apellidos?.trim()) {
          return { row, estado: 'error', mensaje: 'Faltan datos obligatorios' }
        }
        return { row, estado: 'ok', mensaje: '' }
      }),
    )
  }

  const confirmar = async () => {
    setImportando(true)
    let ok = 0
    let error = 0
    for (const f of filas) {
      if (f.estado !== 'ok') {
        error++
        continue
      }
      const { error: err } = await supabase.from('profesores').upsert(
        {
          documento_identidad: f.row.documento_identidad.trim(),
          nombres: f.row.nombres.trim(),
          apellidos: f.row.apellidos.trim(),
          email: f.row.email || null,
          telefono: f.row.telefono || null,
        },
        { onConflict: 'documento_identidad' },
      )
      if (err) error++
      else ok++
    }
    setImportando(false)
    setResumen({ ok, error })
  }

  return (
    <div>
      <AyudaPlantilla
        columnas={columnas}
        nombreArchivo="profesores_plantilla.csv"
        ejemplo={['1234567', 'Anibal Amado', 'Nunes', 'anibal@fceune.edu.py', '0985123456']}
      />
      <input type="file" accept=".csv" onChange={handleFile} />
      {filas.length > 0 && (
        <>
          <TablaPreview filas={filas} columnas={columnas} />
          <div className="form-actions">
            <button type="button" className="btn btn-primary" disabled={importando} onClick={confirmar}>
              {importando
                ? 'Importando...'
                : `Confirmar importación (${filas.filter((f) => f.estado === 'ok').length} filas válidas)`}
            </button>
          </div>
        </>
      )}
      <ResumenImportacion resumen={resumen} />
    </div>
  )
}

function ImportarCatedras() {
  const [profesores, setProfesores] = useState([])
  const [asignaturas, setAsignaturas] = useState([])
  const [sedes, setSedes] = useState([])
  const [filas, setFilas] = useState([])
  const [importando, setImportando] = useState(false)
  const [resumen, setResumen] = useState(null)
  const columnas = ['docente_documento', 'asignatura', 'carrera', 'sede', 'periodo', 'seccion_grupo']

  useEffect(() => {
    Promise.all([
      supabase.from('profesores').select('*'),
      supabase.from('asignaturas').select('*, carreras(nombre)'),
      supabase.from('sedes').select('*'),
    ]).then(([p, a, s]) => {
      setProfesores(p.data || [])
      setAsignaturas(a.data || [])
      setSedes(s.data || [])
    })
  }, [])

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const data = await parseArchivo(file)
    setResumen(null)
    setFilas(
      data.map((row) => {
        const profesor = profesores.find((p) => normalizar(p.documento_identidad) === normalizar(row.docente_documento))
        if (!profesor) return { row, estado: 'error', mensaje: `Profesor con documento "${row.docente_documento}" no existe` }
        const asignatura = asignaturas.find(
          (a) => normalizar(a.nombre) === normalizar(row.asignatura) && normalizar(a.carreras?.nombre) === normalizar(row.carrera),
        )
        if (!asignatura) return { row, estado: 'error', mensaje: `Asignatura "${row.asignatura}" (${row.carrera}) no existe` }
        const sede = sedes.find((s) => normalizar(s.nombre) === normalizar(row.sede))
        if (!sede) return { row, estado: 'error', mensaje: `Sede "${row.sede}" no existe` }
        if (!row.periodo?.trim()) return { row, estado: 'error', mensaje: 'Falta periodo' }
        return {
          row,
          estado: 'ok',
          mensaje: '',
          payload: {
            profesor_id: profesor.id,
            asignatura_id: asignatura.id,
            sede_id: sede.id,
            periodo_lectivo: row.periodo.trim(),
            seccion_grupo: row.seccion_grupo || 'A',
          },
        }
      }),
    )
  }

  const confirmar = async () => {
    setImportando(true)
    let ok = 0
    let error = 0
    let duplicados = 0
    for (const f of filas) {
      if (f.estado !== 'ok') {
        error++
        continue
      }
      const { error: err } = await supabase.from('catedras').insert(f.payload)
      if (err) {
        if (err.code === '23505') duplicados++
        else error++
      } else ok++
    }
    setImportando(false)
    setResumen({ ok, error, duplicados })
  }

  return (
    <div>
      <AyudaPlantilla
        columnas={columnas}
        nombreArchivo="catedras_plantilla.csv"
        ejemplo={['1234567', 'Cuentas Nacionales', 'Economía', 'Sede Central', '2026', 'A']}
      />
      <input type="file" accept=".csv" onChange={handleFile} />
      {filas.length > 0 && (
        <>
          <TablaPreview filas={filas} columnas={columnas} />
          <div className="form-actions">
            <button type="button" className="btn btn-primary" disabled={importando} onClick={confirmar}>
              {importando
                ? 'Importando...'
                : `Confirmar importación (${filas.filter((f) => f.estado === 'ok').length} filas válidas)`}
            </button>
          </div>
        </>
      )}
      <ResumenImportacion resumen={resumen} />
    </div>
  )
}

function ImportarIndicadorObjetivo({ tabla, columnasExtra, columnaPorcentaje, calcularPorcentaje, ejemploExtra, nombreArchivo }) {
  const catedras = useCatedrasLookup()
  const [filas, setFilas] = useState([])
  const [importando, setImportando] = useState(false)
  const [resumen, setResumen] = useState(null)
  const columnasBase = ['docente_documento', 'asignatura', 'carrera', 'sede', 'periodo']
  const columnas = [...columnasBase, ...columnasExtra]

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const data = await parseArchivo(file)
    setResumen(null)
    setFilas(
      data.map((row) => {
        const catedra = resolverCatedra(catedras, row)
        if (!catedra) return { row, estado: 'error', mensaje: 'No existe esa cátedra (docente/asignatura/carrera/sede/periodo).' }
        for (const col of columnasExtra) {
          if (row[col] === undefined || row[col] === '') return { row, estado: 'error', mensaje: `Falta "${col}"` }
        }
        return { row, estado: 'ok', mensaje: '', catedraId: catedra.id }
      }),
    )
  }

  const confirmar = async () => {
    setImportando(true)
    let ok = 0
    let error = 0
    for (const f of filas) {
      if (f.estado !== 'ok') {
        error++
        continue
      }
      const payload = { catedra_id: f.catedraId }
      columnasExtra.forEach((col) => {
        payload[col] = Number(f.row[col])
      })
      payload[columnaPorcentaje] = calcularPorcentaje(f.row)
      const { error: err } = await supabase.from(tabla).upsert(payload, { onConflict: 'catedra_id' })
      if (err) error++
      else ok++
    }
    setImportando(false)
    setResumen({ ok, error })
  }

  if (!catedras) return <p>Cargando cátedras...</p>

  return (
    <div>
      <AyudaPlantilla columnas={columnas} nombreArchivo={nombreArchivo} ejemplo={[...['1234567', 'Cuentas Nacionales', 'Economía', 'Sede Central', '2026'], ...ejemploExtra]} />
      <input type="file" accept=".csv" onChange={handleFile} />
      {filas.length > 0 && (
        <>
          <TablaPreview filas={filas} columnas={columnas} />
          <div className="form-actions">
            <button type="button" className="btn btn-primary" disabled={importando} onClick={confirmar}>
              {importando
                ? 'Importando...'
                : `Confirmar importación (${filas.filter((f) => f.estado === 'ok').length} filas válidas)`}
            </button>
          </div>
        </>
      )}
      <ResumenImportacion resumen={resumen} />
    </div>
  )
}

function ImportarClases() {
  return (
    <ImportarIndicadorObjetivo
      tabla="asistencia_clases"
      nombreArchivo="asistencia_clases_plantilla.csv"
      columnasExtra={['horas_programadas', 'horas_dictadas']}
      columnaPorcentaje="porcentaje_asistencia"
      calcularPorcentaje={(row) => Math.round((Number(row.horas_dictadas) / Number(row.horas_programadas)) * 10000) / 100}
      ejemploExtra={['64', '60']}
    />
  )
}

function ImportarContenido() {
  return (
    <ImportarIndicadorObjetivo
      tabla="cumplimiento_contenido"
      nombreArchivo="cumplimiento_contenido_plantilla.csv"
      columnasExtra={['unidades_programadas', 'unidades_desarrolladas']}
      columnaPorcentaje="porcentaje_cumplimiento"
      calcularPorcentaje={(row) => Math.round((Number(row.unidades_desarrolladas) / Number(row.unidades_programadas)) * 10000) / 100}
      ejemploExtra={['5', '5']}
    />
  )
}

function ImportarMesas() {
  return (
    <ImportarIndicadorObjetivo
      tabla="asistencia_mesas_examinadoras"
      nombreArchivo="mesas_examinadoras_plantilla.csv"
      columnasExtra={['mesas_convocadas', 'mesas_asistidas']}
      columnaPorcentaje="porcentaje_asistencia"
      calcularPorcentaje={(row) => Math.round((Number(row.mesas_asistidas) / Number(row.mesas_convocadas)) * 10000) / 100}
      ejemploExtra={['3', '3']}
    />
  )
}

function ImportarReuniones() {
  return (
    <ImportarIndicadorObjetivo
      tabla="asistencia_reuniones"
      nombreArchivo="asistencia_reuniones_plantilla.csv"
      columnasExtra={['reuniones_convocadas', 'reuniones_asistidas']}
      columnaPorcentaje="porcentaje_asistencia"
      calcularPorcentaje={(row) => Math.round((Number(row.reuniones_asistidas) / Number(row.reuniones_convocadas)) * 10000) / 100}
      ejemploExtra={['4', '4']}
    />
  )
}

function ImportarCriterioCatedra({ origenEsperado, columnaValor, labelValor, min, max, nombreArchivo, calcularObtenido }) {
  const catedras = useCatedrasLookup()
  const [criterios, setCriterios] = useState([])
  const [filas, setFilas] = useState([])
  const [importando, setImportando] = useState(false)
  const [resumen, setResumen] = useState(null)
  const columnasBase = ['docente_documento', 'asignatura', 'carrera', 'sede', 'periodo', 'criterio_codigo']
  const columnas = origenEsperado === 'ENCUESTA_ALUMNOS' ? [...columnasBase, columnaValor, 'total_encuestados'] : [...columnasBase, columnaValor]

  useEffect(() => {
    supabase
      .from('criterios_evaluacion')
      .select('*')
      .eq('origen', origenEsperado)
      .then(({ data }) => setCriterios(data || []))
  }, [origenEsperado])

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const data = await parseArchivo(file)
    setResumen(null)
    setFilas(
      data.map((row) => {
        const catedra = resolverCatedra(catedras, row)
        if (!catedra) return { row, estado: 'error', mensaje: 'No existe esa cátedra (docente/asignatura/carrera/sede/periodo).' }
        const criterio = criterios.find(
          (c) => normalizar(c.codigo) === normalizar(row.criterio_codigo) && normalizar(c.periodo_lectivo) === normalizar(row.periodo),
        )
        if (!criterio) return { row, estado: 'error', mensaje: `Criterio "${row.criterio_codigo}" no existe para el periodo ${row.periodo}` }
        const valor = Number(row[columnaValor])
        if (Number.isNaN(valor) || valor < min || valor > max) {
          return { row, estado: 'error', mensaje: `${labelValor} inválido (${min}-${max})` }
        }
        return {
          row,
          estado: 'ok',
          mensaje: '',
          payload: {
            catedra_id: catedra.id,
            criterio_id: criterio.id,
            valor_ingresado: valor,
            total_encuestados: row.total_encuestados ? Number(row.total_encuestados) : null,
            obtenido_porcentaje: calcularObtenido(valor, criterio),
          },
        }
      }),
    )
  }

  const confirmar = async () => {
    setImportando(true)
    let ok = 0
    let error = 0
    for (const f of filas) {
      if (f.estado !== 'ok') {
        error++
        continue
      }
      const { error: err } = await supabase
        .from('evaluacion_criterio_catedra')
        .upsert(f.payload, { onConflict: 'catedra_id,criterio_id' })
      if (err) error++
      else ok++
    }
    setImportando(false)
    setResumen({ ok, error })
  }

  if (!catedras) return <p>Cargando cátedras...</p>

  return (
    <div>
      <p className="muted-text" style={{ marginBottom: '0.5rem' }}>
        <code>criterio_codigo</code> es el código del criterio (ver Configuración → Criterios de Evaluación).
      </p>
      <AyudaPlantilla
        columnas={columnas}
        nombreArchivo={nombreArchivo}
        ejemplo={
          origenEsperado === 'ENCUESTA_ALUMNOS'
            ? ['1234567', 'Cuentas Nacionales', 'Economía', 'Sede Central', '2026', 'ALU_PUNTUALIDAD', '4.5', '30']
            : ['1234567', 'Cuentas Nacionales', 'Economía', 'Sede Central', '2026', 'PLANIFICACION_DOCUMENTACION', '18']
        }
      />
      <input type="file" accept=".csv" onChange={handleFile} />
      {filas.length > 0 && (
        <>
          <TablaPreview filas={filas} columnas={columnas} />
          <div className="form-actions">
            <button type="button" className="btn btn-primary" disabled={importando} onClick={confirmar}>
              {importando
                ? 'Importando...'
                : `Confirmar importación (${filas.filter((f) => f.estado === 'ok').length} filas válidas)`}
            </button>
          </div>
        </>
      )}
      <ResumenImportacion resumen={resumen} />
    </div>
  )
}

function ImportarManual() {
  return (
    <ImportarCriterioCatedra
      origenEsperado="MANUAL"
      columnaValor="valor_obtenido"
      labelValor="% obtenido"
      min={0}
      max={100}
      nombreArchivo="criterios_manuales_plantilla.csv"
      calcularObtenido={(valor) => valor}
    />
  )
}

function ImportarAlumnos() {
  return (
    <ImportarCriterioCatedra
      origenEsperado="ENCUESTA_ALUMNOS"
      columnaValor="calificacion"
      labelValor="Calificación"
      min={1}
      max={5}
      nombreArchivo="encuesta_alumnos_plantilla.csv"
      calcularObtenido={(valor, criterio) => Math.round((valor / 5) * Number(criterio.peso_porcentaje) * 100) / 100}
    />
  )
}

export function ImportarDatos() {
  const [tab, setTab] = useState('asignaturas')

  return (
    <div className="page-padding">
      <div className="page-header">
        <h1>Importar Datos</h1>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tab${tab === t.key ? ' active' : ''}`}
            style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'asignaturas' && <ImportarAsignaturas />}
      {tab === 'profesores' && <ImportarProfesores />}
      {tab === 'catedras' && <ImportarCatedras />}
      {tab === 'clases' && <ImportarClases />}
      {tab === 'contenido' && <ImportarContenido />}
      {tab === 'mesas' && <ImportarMesas />}
      {tab === 'reuniones' && <ImportarReuniones />}
      {tab === 'manual' && <ImportarManual />}
      {tab === 'alumnos' && <ImportarAlumnos />}
    </div>
  )
}
