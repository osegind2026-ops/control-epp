// Modelo de datos de la app. Todos los registros llevan un `id` único para poder
// combinarse entre equipos (y, en la Fase 2, sincronizarse con Google Sheets).

/**
 * consumible: se entrega y no regresa (lentes, guantes, arnés de casco, barbiquejo).
 * resguardo: queda a cargo del trabajador a largo plazo; máximo uno por trabajador (casco, faja).
 * prestamo: equipo caro y limitado que debe devolverse pronto (arnés de cuerpo completo, línea de vida).
 */
export type TipoMaterial = 'consumible' | 'resguardo' | 'prestamo'

export interface Variante {
  id: string // p. ej. 'G', '8', 'MED'
  etiqueta: string // texto visible
  color?: string // color de referencia (guantes Hyflex)
  activo: boolean
}

/** Clave de variante para materiales sin tallas. */
export const SIN_TALLA = ''

export interface Material {
  id: string
  nombre: string
  categoriaId: string
  tipo: TipoMaterial
  variantes: Variante[] // vacío = sin tallas
  stockMin: Record<string, number> // por variante ('' si no tiene tallas)
  fotoId?: string
  icono?: string // ilustración de respaldo cuando no hay foto
  orden: number
  activo: boolean
  columnaExcel?: string // columna del CSV del libro maestro (compatibilidad)
  /** Préstamo: días para devolverlo (0 = el mismo día). */
  plazoDias?: number
  actualizado: string
}

export interface Categoria {
  id: string
  nombre: string
  orden: number
}

export interface Foto {
  id: string
  dataUrl: string
}

export interface KitLinea {
  materialId: string
  cantidad: number
  /** Si se indica, la línea solo aplica a trabajadores de estas áreas. */
  areas?: string[]
  /** Solo se agrega si el kit también entrega este material (p. ej. barbiquejo con el casco). */
  conMaterial?: string
}

export interface Kit {
  id: string
  nombre: string
  descripcion?: string
  lineas: KitLinea[]
  orden: number
  activo: boolean
  actualizado: string
}

export interface Ubicacion {
  id: string
  nombre: string
  esDespacho: boolean
  orden: number
  activo: boolean
}

export type TipoTrabajador = 'planta' | 'eventual'

export interface Supervisor {
  nombre: string
  rpe: string
  extension: string
}

export interface Trabajador {
  rpe: string
  nombre: string
  area: string
  puesto: string
  casillero: string
  tipo: TipoTrabajador
  vigencia?: string // fecha fin de contrato (eventuales)
  tallas: Record<string, string> // materialId → varianteId usada la última vez
  supervisor?: Supervisor // último supervisor registrado en un préstamo
  activo: boolean
  alta: string
  altaPor?: string
  actualizado: string
}

export interface Usuario {
  id: string
  nombre: string
  esAdmin: boolean
  pinHash: string
  salt: string
  activo: boolean
  creado: string
  actualizado?: string
}

export type TipoMotivo = 'entrega' | 'devolucion' | 'ajuste' | 'anulacion' | 'entrada'

export interface Motivo {
  id: string
  tipo: TipoMotivo
  texto: string
  orden: number
  activo: boolean
  /** Entrega de resguardo: qué pasa con el resguardo activo previo del mismo material. */
  cierraPrevio?: 'reingresa' | 'baja'
  /** Devolución: el material vuelve a existencias. */
  reingresa?: boolean
}

export interface LineaEntrega {
  materialId: string
  varianteId: string
  cantidad: number
  esResguardo: boolean
  esPrestamo?: boolean
  motivoId?: string
}

export interface DatosPrestamo {
  supervisor: Supervisor
  vence: string // fecha límite de devolución (YYYY-MM-DD)
}

export interface Anulacion {
  ts: string
  usuarioId: string
  usuarioNombre: string
  motivoId: string
  nota: string
}

export interface Entrega {
  id: string
  folio: string
  ts: string
  fecha: string
  hora: string
  rpe: string
  nombre: string
  area: string
  usuarioId: string
  usuarioNombre: string
  equipo: string
  ubicacionId: string
  lineas: LineaEntrega[]
  observaciones: string
  estado: 'registrada' | 'anulada'
  anulacion?: Anulacion
  prestamo?: DatosPrestamo
}

export type TipoMovimiento = 'INICIAL' | 'ENTRADA' | 'SALIDA' | 'DEVOLUCION' | 'AJUSTE' | 'TRASPASO' | 'ANULACION'

export interface Movimiento {
  id: string
  ts: string
  tipo: TipoMovimiento
  materialId: string
  varianteId: string
  ubicacionId: string
  cantidad: number // positivo entra, negativo sale
  ref: string // folio, folio SI, orden de compra…
  motivo: string
  nota: string
  usuarioId: string
  usuarioNombre: string
  equipo: string
  grupo?: string // agrupa movimientos de una misma operación (entrega, traspaso)
}

export interface CierreResguardo {
  ts: string
  fecha: string
  motivo: string
  reingresa: boolean
  usuarioId: string
  usuarioNombre: string
  ref: string
}

export interface Resguardo {
  id: string
  entregaId: string
  folioSI: string
  rpe: string
  nombre: string
  area: string
  materialId: string
  varianteId: string
  cantidad: number
  fechaEntrega: string
  estatus: 'ACTIVO' | 'CERRADO' | 'ANULADO'
  cierre?: CierreResguardo
  /** undefined = resguardo (registros anteriores). */
  tipo?: 'resguardo' | 'prestamo'
  vence?: string
  supervisor?: Supervisor
  /** Sube con cada cambio de estatus; decide qué versión gana al sincronizar. */
  ver?: number
}

export interface Dispositivo {
  id: string
  codigo: string
  nombre: string
}

export interface Sesion {
  usuarioId: string
  usuarioNombre: string
  esAdmin: boolean
}
