// Opciones de un selector de profesor: solo los activos, más el que ya
// está elegido aunque esté inactivo (para que un registro viejo siga
// mostrando su nombre). Elegir un inactivo nuevo lo rechaza la base de
// todos modos (migracion_profesor_activo.sql).
export function opcionesProfesores(profesores, actual) {
  return profesores
    .filter((p) => p.activo !== false || p.id === actual)
    .map((p) => ({ value: p.id, label: `${p.apellidos}, ${p.nombres}${p.activo === false ? ' (inactivo)' : ''}` }))
}
