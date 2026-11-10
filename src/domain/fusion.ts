import type { Entrega, PrestamoEquipo, Resguardo } from './types'

type Registro = { actualizado?: string }

/**
 * Decide si una versión entrante (de otro equipo o del servidor) reemplaza a la
 * local. Debe coincidir con `ganaEntrante` de nube/Codigo.gs.
 */
export function ganaEntrante(tabla: string, actual: unknown, entrante: unknown): boolean {
  if (tabla === 'entregas') {
    return !((actual as Entrega).estado === 'anulada' && (entrante as Entrega).estado !== 'anulada')
  }
  if (tabla === 'resguardos') {
    const va = (actual as Resguardo).ver ?? 0
    const ve = (entrante as Resguardo).ver ?? 0
    if (ve !== va) return ve > va
    return !((actual as Resguardo).estatus !== 'ACTIVO' && (entrante as Resguardo).estatus === 'ACTIVO')
  }
  if (tabla === 'prestamosEquipo') {
    const va = (actual as PrestamoEquipo).ver ?? 0
    const ve = (entrante as PrestamoEquipo).ver ?? 0
    if (ve !== va) return ve > va
    return !((actual as PrestamoEquipo).estatus !== 'ACTIVO' && (entrante as PrestamoEquipo).estatus === 'ACTIVO')
  }
  const a = (actual as Registro).actualizado
  const e = (entrante as Registro).actualizado
  if (a && e) return e >= a
  return true
}
