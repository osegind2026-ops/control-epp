import { db } from '../db/db'
import type { CondicionRegreso, Equipo, PrestamoEquipo, Trabajador } from '../domain/types'
import { fechaLocal, horaLocal, nuevoId } from '../lib/util'
import { avisarCambioLocal } from './nube'
import { ErrorNegocio } from './servicios'
import * as S from './store'

// Equipos a resguardo de la oficina (explosímetros, higrómetros, detectores…):
// catálogo propio y bitácora digital de salidas y regresos. Sustituye al formato
// «Bitácora de entrega y recepción de equipos de seguridad industrial».

export const CONDICIONES: Record<CondicionRegreso, string> = {
  bueno: 'Buen estado',
  detalle: 'Con detalle',
  danado: 'Dañado / no funciona',
}

export const ESTADOS: Record<Equipo['estado'], string> = {
  operativo: 'Operativo',
  revision: 'En revisión',
  baja: 'Baja',
}

/** Fecha y hora local en formato YYYY-MM-DDTHH:mm (como un campo datetime-local). */
export function ahoraLocal(d = new Date()): string {
  return `${fechaLocal(d)}T${horaLocal(d)}`
}

export function prestamoVencido(p: Pick<PrestamoEquipo, 'estatus' | 'vence'>, ahora = ahoraLocal()): boolean {
  return p.estatus === 'ACTIVO' && !!p.vence && p.vence < ahora
}

/** Días que faltan para la calibración (negativo = vencida); null si no aplica. */
export function diasCalibracion(e: Pick<Equipo, 'calibracion'>, hoy = fechaLocal()): number | null {
  if (!e.calibracion) return null
  return Math.round((new Date(e.calibracion + 'T12:00').getTime() - new Date(hoy + 'T12:00').getTime()) / 86400000)
}

export type Disponibilidad = 'disponible' | 'prestado' | 'revision' | 'calibracion' | 'baja'

export function disponibilidad(e: Equipo, activos: PrestamoEquipo[], hoy = fechaLocal()): Disponibilidad {
  if (!e.activo || e.estado === 'baja') return 'baja'
  if (activos.some((p) => p.equipoId === e.id)) return 'prestado'
  if (e.estado === 'revision') return 'revision'
  const dc = diasCalibracion(e, hoy)
  if (dc !== null && dc < 0) return 'calibracion'
  return 'disponible'
}

export const TEXTO_DISPONIBILIDAD: Record<Disponibilidad, string> = {
  disponible: 'Disponible',
  prestado: 'Prestado',
  revision: 'En revisión',
  calibracion: 'Calibración vencida',
  baja: 'Baja',
}

export function siguienteFolioEquipo(codigoDispositivo: string, existentes: string[]): string {
  const pref = `EQ-${codigoDispositivo}-`
  const n = existentes.filter((f) => f.startsWith(pref)).reduce((mx, f) => Math.max(mx, parseInt(f.slice(pref.length), 10) || 0), 0)
  return pref + String(n + 1).padStart(4, '0')
}

function actor() {
  const sesion = S.sesion.value
  const equipo = S.dispositivo.value
  if (!sesion) throw new ErrorNegocio('Inicie sesión con su PIN.')
  if (!equipo) throw new ErrorNegocio('Configure el equipo antes de registrar.')
  return { sesion, dispositivo: equipo }
}

// ---------- Catálogo ----------

export async function guardarEquipo(datos: Omit<Equipo, 'id' | 'actualizado'> & { id?: string }): Promise<Equipo> {
  const { sesion } = actor()
  if (sesion.rol !== 'admin' && sesion.rol !== 'almacen') throw new ErrorNegocio('Solo un encargado de almacén o un administrador puede editar el catálogo de equipos.')
  const codigo = datos.codigo.trim().toUpperCase()
  if (!codigo) throw new ErrorNegocio('Escriba el código del equipo.')
  if (!datos.nombre.trim()) throw new ErrorNegocio('Escriba qué equipo es (por ejemplo, Explosímetro).')
  const repetido = S.equipos.value.find((e) => e.codigo.toUpperCase() === codigo && e.id !== datos.id)
  if (repetido) throw new ErrorNegocio(`El código ${codigo} ya es de otro equipo (${repetido.nombre}).`)
  const eq: Equipo = {
    ...datos,
    id: datos.id ?? nuevoId('EQ'),
    codigo,
    nombre: datos.nombre.trim(),
    marca: datos.marca.trim(),
    modelo: datos.modelo.trim(),
    serie: datos.serie.trim(),
    notas: datos.notas.trim(),
    accesorios: datos.accesorios.map((a) => a.trim()).filter(Boolean),
    calibracion: datos.calibracion || undefined,
    actualizado: new Date().toISOString(),
  }
  await db.equipos.put(eq)
  await S.recargar('equipos')
  avisarCambioLocal()
  return eq
}

// ---------- Préstamo y regreso ----------

export interface DatosSalida {
  equipoId: string
  trabajador: Pick<Trabajador, 'rpe' | 'nombre' | 'area'>
  contacto: string
  uso: string
  vence: string // YYYY-MM-DDTHH:mm
  accesorios: string[]
  bitacora: boolean
  observaciones: string
}

export async function prestarEquipo(d: DatosSalida): Promise<PrestamoEquipo> {
  const { sesion, dispositivo } = actor()
  const eq = S.equipos.value.find((e) => e.id === d.equipoId)
  if (!eq) throw new ErrorNegocio('Elija el equipo.')
  const estado = disponibilidad(eq, S.prestamosEquipoActivos.value)
  if (estado === 'prestado') {
    const p = S.prestamosEquipoActivos.value.find((x) => x.equipoId === eq.id)
    throw new ErrorNegocio(`${eq.codigo} ya está prestado a ${p?.nombre ?? 'otra persona'}. Registre primero su regreso.`)
  }
  if (estado !== 'disponible') throw new ErrorNegocio(`${eq.codigo} no se puede prestar: ${TEXTO_DISPONIBILIDAD[estado].toLowerCase()}.`)
  if (!d.trabajador.rpe) throw new ErrorNegocio('Indique quién recibe el equipo.')
  if (!d.contacto.trim()) throw new ErrorNegocio('Anote una extensión o teléfono para localizar a quien lo lleva.')
  if (!d.vence) throw new ErrorNegocio('Indique cuándo debe regresar el equipo.')
  const ahora = new Date()
  if (d.vence <= ahoraLocal(ahora)) throw new ErrorNegocio('La fecha de regreso debe ser posterior a ahora.')
  const p: PrestamoEquipo = {
    id: nuevoId('PE'),
    folio: siguienteFolioEquipo(dispositivo.codigo, S.prestamosEquipo.value.map((x) => x.folio)),
    equipoId: eq.id,
    equipoCodigo: eq.codigo,
    equipoNombre: [eq.nombre, eq.marca, eq.modelo].filter(Boolean).join(' '),
    rpe: d.trabajador.rpe,
    nombre: d.trabajador.nombre,
    area: d.trabajador.area,
    contacto: d.contacto.trim(),
    uso: d.uso.trim(),
    ts: ahora.toISOString(),
    usuarioId: sesion.usuarioId,
    usuarioNombre: sesion.usuarioNombre,
    equipo: dispositivo.codigo,
    vence: d.vence,
    accesorios: d.accesorios,
    bitacora: d.bitacora,
    observaciones: d.observaciones.trim(),
    estatus: 'ACTIVO',
    ver: 1,
    actualizado: ahora.toISOString(),
  }
  await db.prestamosEquipo.add(p)
  await S.recargar('prestamosEquipo')
  avisarCambioLocal()
  return p
}

export interface DatosRegreso {
  prestamoId: string
  devolvio: Pick<Trabajador, 'rpe' | 'nombre'>
  condicion: CondicionRegreso
  accesorios: string[]
  bitacora: boolean
  comentarios: string
}

export async function registrarRegreso(d: DatosRegreso): Promise<void> {
  const { sesion } = actor()
  const p = S.prestamosEquipo.value.find((x) => x.id === d.prestamoId)
  if (!p || p.estatus !== 'ACTIVO') throw new ErrorNegocio('Ese préstamo ya no está activo.')
  const faltan = p.accesorios.filter((a) => !d.accesorios.includes(a))
  const conDetalle = d.condicion !== 'bueno' || faltan.length > 0 || (p.bitacora && !d.bitacora)
  if (conDetalle && !d.comentarios.trim()) throw new ErrorNegocio('Describa el detalle, el daño o lo que falta.')
  const ahora = new Date().toISOString()
  const actualizado: PrestamoEquipo = {
    ...p,
    estatus: 'DEVUELTO',
    regreso: {
      ts: ahora,
      devolvioRpe: d.devolvio.rpe,
      devolvioNombre: d.devolvio.nombre,
      usuarioId: sesion.usuarioId,
      usuarioNombre: sesion.usuarioNombre,
      condicion: d.condicion,
      accesorios: d.accesorios,
      bitacora: d.bitacora,
      comentarios: d.comentarios.trim(),
    },
    ver: p.ver + 1,
    actualizado: ahora,
  }
  const eq = S.equipos.value.find((e) => e.id === p.equipoId)
  await db.transaction('rw', [db.prestamosEquipo, db.equipos], async () => {
    await db.prestamosEquipo.put(actualizado)
    // Un equipo dañado no se vuelve a prestar hasta que alguien lo revise
    if (eq && d.condicion === 'danado' && eq.estado === 'operativo') await db.equipos.put({ ...eq, estado: 'revision', actualizado: ahora })
  })
  await S.recargar('prestamosEquipo', 'equipos')
  avisarCambioLocal()
}

/** Corrige una salida registrada por error (no borra: queda en la bitácora como anulada). */
export async function anularPrestamoEquipo(prestamoId: string, motivo: string): Promise<void> {
  const { sesion } = actor()
  const p = S.prestamosEquipo.value.find((x) => x.id === prestamoId)
  if (!p || p.estatus !== 'ACTIVO') throw new ErrorNegocio('Ese préstamo ya no está activo.')
  if (!motivo.trim()) throw new ErrorNegocio('Escriba el motivo de la anulación.')
  const ahora = new Date().toISOString()
  await db.prestamosEquipo.put({
    ...p,
    estatus: 'ANULADO',
    observaciones: [p.observaciones, `ANULADO por ${sesion.usuarioNombre}: ${motivo.trim()}`].filter(Boolean).join(' · '),
    ver: p.ver + 1,
    actualizado: ahora,
  })
  await S.recargar('prestamosEquipo')
  avisarCambioLocal()
}
