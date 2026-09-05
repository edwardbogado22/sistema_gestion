export function RangoFechasPeriodo({ desde, hasta, onDesde, onHasta, periodos = [] }) {
  const cargarPeriodo = (p) => {
    onDesde(p.fecha_inicio)
    onHasta(p.fecha_fin)
  }

  return (
    <div>
      <div className="rango-fechas">
        <label className="rango-fechas-campo">
          Desde
          <input type="date" value={desde} onChange={(e) => onDesde(e.target.value)} />
        </label>
        <span className="rango-fechas-flecha" aria-hidden="true">
          →
        </span>
        <label className="rango-fechas-campo">
          Hasta
          <input type="date" value={hasta} onChange={(e) => onHasta(e.target.value)} />
        </label>
      </div>

      {periodos.length > 0 && (
        <div className="rango-fechas-chips">
          <span className="muted-text">Cargar rango de un período:</span>
          {periodos.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chip${p.activo ? ' activo' : ''}`}
              onClick={() => cargarPeriodo(p)}
            >
              {p.nombre} {p.anio}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
