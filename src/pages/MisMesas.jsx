import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { deISO, formatoLargo } from '../lib/fechas'

const TIPOS = {
  ORDINARIO: 'Ordinario',
  COMPLEMENTARIO: 'Complementario',
  REGULARIZACION: 'Regularización',
}

const diaSemana = (fecha) => {
  const dia = deISO(fecha).toLocaleDateString('es-PY', { weekday: 'long' })
  return dia.charAt(0).toUpperCase() + dia.slice(1)
}

// Agrupa las mesas por fecha conservando el orden en que llegan (ya
// vienen ordenadas por fecha y hora desde la función).
function agruparPorFecha(mesas) {
  const grupos = []
  for (const m of mesas) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.fecha === m.fecha) ultimo.mesas.push(m)
    else grupos.push({ fecha: m.fecha, mesas: [m] })
  }
  return grupos
}

// Página pública, sin sesión: el profesor llega por el enlace que se
// difunde en el canal de WhatsApp, escribe su cédula y ve las mesas en
// las que fue designado. Todo lo que se muestra sale de la función
// consulta_publica_mesas(), que es lo único que puede leer un visitante
// sin usuario; por eso acá no se consulta ninguna tabla directamente.
export function MisMesas() {
  const [cedula, setCedula] = useState('')
  const [consultando, setConsultando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState(null)

  const consultar = async (e) => {
    e.preventDefault()
    const valor = cedula.trim()
    if (!valor) return
    setError('')
    setResultado(null)
    setConsultando(true)
    const { data, error: eRpc } = await supabase.rpc('consulta_publica_mesas', { p_cedula: valor })
    setConsultando(false)
    if (eRpc) {
      setError('No se pudo hacer la consulta en este momento. Probá de nuevo en unos minutos.')
      return
    }
    setResultado(data)
  }

  const mesas = resultado?.mesas || []
  const grupos = agruparPorFecha(mesas)
  const comoPresidente = mesas.filter((m) => m.rol === 'PRESIDENTE').length
  const comoExaminador = mesas.filter((m) => m.rol === 'EXAMINADOR').length
  const enOtraCarrera = mesas.filter((m) => m.otra_carrera).length
  const hoy = new Date().toLocaleDateString('es-PY')

  return (
    <div className="mis-mesas">
      <header className="mis-mesas-encabezado">
        <div className="crest" style={{ background: 'var(--green-700)' }}>
          FCE
        </div>
        <p className="muted-text" style={{ margin: 0 }}>
          Universidad Nacional del Este · Facultad de Ciencias Económicas
        </p>
        <h1>Mesas examinadoras</h1>
        <p className="muted-text no-print">Escribí tu número de cédula para ver las mesas en las que fuiste designado.</p>
      </header>

      <form className="mis-mesas-form no-print" onSubmit={consultar}>
        <label htmlFor="mis-mesas-cedula">Cédula de identidad</label>
        <div className="mis-mesas-form-fila">
          <input
            id="mis-mesas-cedula"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ej.: 1234567"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={consultando}>
            {consultando ? 'Buscando...' : 'Consultar'}
          </button>
        </div>
      </form>

      {error && <p className="error-text">{error}</p>}

      {resultado && !resultado.encontrado && (
        <p className="mis-mesas-aviso">
          No encontramos un profesor con esa cédula. Revisá el número; si está bien escrito, consultá en Secretaría.
        </p>
      )}

      {/* Solo le llega a Dirección Académica con la sesión abierta: la
          función incluye los llamados sin aprobar para poder revisar
          cómo va a quedar antes de publicarlos. */}
      {resultado?.vista_previa && (
        <p className="mis-mesas-aviso no-print">
          <strong>Vista previa de Dirección Académica.</strong> Estás viendo también los llamados que todavía no están
          aprobados. Los profesores solo ven los aprobados.
        </p>
      )}

      {resultado?.encontrado && (
        <section>
          <div className="mis-mesas-profesor">
            <h2>{resultado.profesor}</h2>
            <p className="muted-text" style={{ margin: 0 }}>
              Designaciones vigentes al {hoy}. Pueden cambiar: volvé a consultar unos días antes de cada examen.
            </p>
          </div>

          {mesas.length === 0 ? (
            <p className="mis-mesas-aviso">
              Por ahora no tenés mesas designadas. Solo se muestran los llamados ya aprobados por Dirección Académica.
            </p>
          ) : (
            <>
              <div className="stat-grid" style={{ marginBottom: 16 }}>
                <div className="stat-card">
                  <div className="stat-value">{mesas.length}</div>
                  <div className="stat-label">Mesas en total</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{comoPresidente}</div>
                  <div className="stat-label">Como presidente</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{comoExaminador}</div>
                  <div className="stat-label">Como examinador</div>
                </div>
                {enOtraCarrera > 0 && (
                  <div className="stat-card">
                    <div className="stat-value">{enOtraCarrera}</div>
                    <div className="stat-label">En otra carrera</div>
                  </div>
                )}
              </div>

              {enOtraCarrera > 0 && (
                <p className="mis-mesas-aviso">
                  Desde este período las mesas se integran también con profesores de otras carreras. Las marcadas como
                  «Otra carrera» son de una carrera en la que no dictás clases.
                </p>
              )}

              <div className="form-actions no-print" style={{ marginBottom: 12 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
                  Descargar o imprimir (PDF)
                </button>
              </div>

              {grupos.map((g) => (
                <div key={g.fecha} className="mis-mesas-dia">
                  <h3>
                    {diaSemana(g.fecha)} {formatoLargo(g.fecha)}
                    {g.mesas.length > 1 && <span className="badge badge-muted">{g.mesas.length} mesas este día</span>}
                  </h3>
                  {g.mesas.map((m, i) => (
                    <article key={`${g.fecha}-${i}`} className="mis-mesas-item">
                      <div className="mis-mesas-item-titulo">
                        <strong>
                          {m.materia}
                          {m.optativa ? ' (Opt.)' : ''}
                        </strong>
                        <span className={`badge ${m.rol === 'PRESIDENTE' ? 'badge-gold' : 'badge-muted'}`}>
                          {m.rol === 'PRESIDENTE' ? 'Presidente' : 'Examinador'}
                        </span>
                        {m.otra_carrera && <span className="badge badge-success">Otra carrera</span>}
                      </div>
                      <dl>
                        <div>
                          <dt>Hora</dt>
                          <dd>{m.hora_inicio ? `${m.hora_inicio.slice(0, 5)} h` : 'A confirmar'}</dd>
                        </div>
                        <div>
                          <dt>Aula</dt>
                          <dd>{m.aula || 'A confirmar'}</dd>
                        </div>
                        <div>
                          <dt>Carrera</dt>
                          <dd>{m.carrera}</dd>
                        </div>
                        <div>
                          <dt>Sede</dt>
                          <dd>{m.sede}</dd>
                        </div>
                        <div>
                          <dt>Curso</dt>
                          <dd>
                            {m.curso_nivel}º · {m.seccion_grupo}
                          </dd>
                        </div>
                        <div>
                          <dt>Llamado</dt>
                          <dd>
                            {m.llamado} ({TIPOS[m.llamado_tipo] || m.llamado_tipo})
                          </dd>
                        </div>
                      </dl>
                      <p className="muted-text mis-mesas-integrantes">
                        Presidente: {m.presidente}
                        {m.examinadores?.length > 0 && ` · Examinadores: ${m.examinadores.join('; ')}`}
                      </p>
                    </article>
                  ))}
                </div>
              ))}
            </>
          )}
        </section>
      )}
    </div>
  )
}
