import { useEffect, useMemo, useRef, useState } from 'react'
import { coincideTexto } from '../lib/buscar'

export function BuscadorSelect({ opciones, value, onChange, placeholder = 'Escribí para buscar...', required, disabled }) {
  const [query, setQuery] = useState('')
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)

  const seleccionada = opciones.find((o) => o.value === value)

  useEffect(() => {
    function onClickFuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  }, [])

  const filtradas = useMemo(() => opciones.filter((o) => coincideTexto(query, o.label)), [opciones, query])

  return (
    <div className="buscador-select" ref={ref}>
      <input
        type="text"
        value={abierto ? query : seleccionada?.label || ''}
        placeholder={disabled ? placeholder : opciones.length === 0 ? 'Sin opciones disponibles' : placeholder}
        disabled={disabled}
        onFocus={() => {
          setAbierto(true)
          setQuery('')
        }}
        onChange={(e) => setQuery(e.target.value)}
        required={required && !value}
      />
      {value && !disabled && (
        <button
          type="button"
          className="buscador-select-clear"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange('')
            setQuery('')
          }}
          aria-label="Limpiar selección"
        >
          ×
        </button>
      )}
      {abierto && !disabled && (
        <div className="buscador-select-lista">
          {filtradas.length === 0 && <div className="buscador-select-vacio">Sin resultados</div>}
          {filtradas.slice(0, 200).map((o) => (
            <div
              key={o.value}
              className={`buscador-select-opcion${o.value === value ? ' seleccionada' : ''}`}
              onMouseDown={() => {
                onChange(o.value)
                setAbierto(false)
                setQuery('')
              }}
            >
              {o.label}
            </div>
          ))}
          {filtradas.length > 200 && <div className="buscador-select-vacio">Mostrando 200 de {filtradas.length}, seguí escribiendo para acotar</div>}
        </div>
      )}
    </div>
  )
}
