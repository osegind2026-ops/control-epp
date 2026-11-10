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
  /** Foto incluida con la app (carpeta public/catalogo) si no se ha tomado una propia. */
  imagen?: string
  /** Descripción o ficha técnica breve (No. de material SAP, norma, color…). */
  descripcion?: string
  icono?: string // ilustración de respaldo cuando no hay foto
  orden: number
  activo: boolean
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

/**
 * permanente: personal de base (su RPE empieza con 9). temporal y eventual: el resto.
 * 'planta' es el nombre anterior de «permanente» (registros viejos).
 */
export type TipoTrabajador = 'permanente' | 'temporal' | 'eventual' | 'planta'

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
  gafete?: string // número impreso en el gafete
  tipo: TipoTrabajador
  /** Un administrador o encargado de almacén corrigió el tipo a mano: no se recalcula por el RPE. */
  tipoManual?: boolean
  vigencia?: string // fecha fin de contrato (eventuales)
  tallas: Record<string, string> // materialId → varianteId usada la última vez
  supervisor?: Supervisor // último supervisor registrado en un préstamo
  activo: boolean
  alta: string
  altaPor?: string
  actualizado: string
}

/**
 * admin: todo, incluidos usuarios, catálogo y motivos.
 * almacen: despacho, préstamos y además entradas, traspasos, ajustes y conteos.
 * despachador: despacho, devoluciones y préstamos; consulta existencias.
 */
export type Rol = 'admin' | 'almacen' | 'despachador'

export interface Usuario {
  id: string
  nombre: string
  /** Se conserva por compatibilidad con equipos anteriores: true = rol admin. */
  esAdmin: boolean
  rol?: Rol
  /** PIN temporal puesto por un administrador: se pide cambiarlo al entrar. */
  debeCambiarPin?: boolean
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
  /** Se entregó material que la persona ya había recibido varias veces hace poco. */
  recurrencia?: Recurrencia
  /**
   * Solo en capturas posteriores (entrega de un día anterior registrada después para
   * cuadrar el inventario): momento real en que se capturó. `fecha` y `ts` llevan el día de la entrega.
   */
  capturada?: string
  /** Cambio de EPP contaminado, respaldado con el formato en papel de ese folio. */
  contaminado?: EppContaminado
}

export interface EppContaminado {
  /** Folio impreso del formato (U1-SI-2026-003). */
  folio: string
  /** Materiales de la entrega que se cambiaron por contaminación. */
  materiales: string[]
  /** Datos opcionales copiados del formato. */
  actividad?: string
  supervisor?: string
  hora?: string
  vistoBueno?: string
}

export interface Recurrencia {
  /** Materiales de esta entrega que resultaron recurrentes. */
  materiales: string[]
  /** Comentario del despachador sobre el motivo. */
  nota: string
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
  /** Fotos del equipo devuelto (ids de la tabla fotos), sobre todo si regresó con daño. */
  fotos?: string[]
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
  rol: Rol
  /** El usuario entró con un PIN temporal y debe elegir uno propio antes de continuar. */
  debeCambiarPin?: boolean
}

// ---------- Equipos a resguardo (explosímetros, higrómetros…) ----------

export type EstadoEquipo = 'operativo' | 'revision' | 'baja'

export interface Equipo {
  id: string
  codigo: string // código interno o de inventario (el que se escanea)
  nombre: string // tipo de equipo: Explosímetro, Higrómetro…
  marca: string
  modelo: string
  serie: string
  /** Lo que sale con el equipo y se revisa al regreso. */
  accesorios: string[]
  llevaBitacora: boolean
  /** Próxima calibración (YYYY-MM-DD). Sin fecha = no requiere. */
  calibracion?: string
  estado: EstadoEquipo
  notas: string
  fotoId?: string
  activo: boolean
  actualizado: string
}

export type CondicionRegreso = 'bueno' | 'detalle' | 'danado'

/** Quién de Seguridad Industrial atendió el movimiento (instantánea: sobrevive a cambios en la lista). */
export interface RefSI {
  id: string
  nombre: string
  /** Nombre corto con que aparecía el botón. */
  corto?: string
}

/** Función del integrante en el préstamo de equipos: el equipo se presta a un técnico y lo entrega un supervisor. */
export type RolSI = 'tecnico' | 'supervisor' | 'ambos'

/** Turno 1 = nocturno (19:00 a 07:00); Turno 2 = diurno (07:00 a 19:00). */
export type TurnoSI = 'T1' | 'T2'

/** Integrante de Seguridad Industrial que aparece como botón al prestar, recibir o transferir equipos. */
export interface PersonalSI {
  id: string
  /** RPE del trabajador en el padrón (de ahí salen el nombre completo y el área). */
  rpe?: string
  nombre: string
  /** Nombre corto del botón (configurable por el administrador). */
  corto: string
  /** Sin valor = ambos (así quedaron los botones creados antes de existir los roles). */
  rol?: RolSI
  /** Turno en que trabaja; sin valor = sale en los dos turnos. */
  turno?: TurnoSI
  /** Usuario de la app al que corresponde: queda preseleccionado cuando ese usuario tiene la sesión abierta. */
  usuarioId?: string
  activo: boolean
  actualizado: string
}

export type TipoObsEquipo = 'ok' | 'detalle' | 'dano'

/** Opción rápida para anotar la condición de un equipo al entregarlo o recibirlo. */
export interface ObsEquipo {
  id: string
  texto: string
  tipo: TipoObsEquipo
  activo: boolean
  actualizado: string
}

/** Observación elegida en un movimiento. */
export interface ObsElegida {
  texto: string
  tipo: TipoObsEquipo
}

/** Ajuste compartido entre todos los equipos de la oficina (p. ej. horas para alertar un equipo sin devolver). */
export interface Ajuste {
  id: string
  valor: unknown
  actualizado: string
}

export interface RegresoEquipo {
  ts: string
  /** Cierre del préstamo: devolución a la oficina o paso directo a otra persona. */
  tipo?: 'devolucion' | 'transferencia'
  /** Quién de Seguridad Industrial lo recibió o registró la transferencia. */
  recibioSI?: RefSI
  /** Observaciones rápidas elegidas al cerrar el préstamo. */
  obsRapidas?: string[]
  /** En una transferencia: id del préstamo nuevo a nombre de quien lo recibe. */
  siguienteId?: string
  /** Si se corrigió la hora: momento real de la captura. */
  capturada?: string
  devolvioRpe: string
  devolvioNombre: string
  usuarioId: string // revisó
  usuarioNombre: string
  condicion: CondicionRegreso
  accesorios: string[] // los que regresaron
  bitacora: boolean
  comentarios: string
  /** Fotos del equipo al regresar (ids de la tabla fotos), sobre todo si regresó con daño. */
  fotos?: string[]
}

export interface EdicionRegistro {
  ts: string
  usuarioNombre: string
  /** Qué cambió, en texto («Actividad: A → B»). */
  cambios: string
}

export interface PrestamoEquipo {
  id: string
  folio: string
  equipoId: string
  equipoCodigo: string
  equipoNombre: string
  rpe: string // recibió
  nombre: string
  area: string
  contacto: string // extensión o teléfono para localizarlo
  uso: string // trabajo o lugar donde se usará
  ts: string // salida
  usuarioId: string // entregó
  usuarioNombre: string
  equipo: string // código del dispositivo
  vence: string // YYYY-MM-DDTHH:mm (hora local)
  accesorios: string[]
  bitacora: boolean
  observaciones: string
  estatus: 'ACTIVO' | 'DEVUELTO' | 'ANULADO'
  regreso?: RegresoEquipo
  /** Quién de Seguridad Industrial entregó el equipo. */
  entregoSI?: RefSI
  /** Observaciones rápidas elegidas al entregar y su gravedad más alta. */
  obsRapidas?: string[]
  condicionSalida?: CondicionRegreso
  /** Fotos del equipo al entregarlo (ids de la tabla fotos), p. ej. de un daño previo. */
  fotos?: string[]
  /** En una transferencia: id del préstamo anterior de este mismo equipo. */
  origenId?: string
  /** Si se corrigió la hora de salida: momento real de la captura. */
  capturada?: string
  /** Correcciones hechas por un administrador desde la bitácora. */
  ediciones?: EdicionRegistro[]
  ver: number
  actualizado: string
}
