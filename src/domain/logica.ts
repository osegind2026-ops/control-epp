import type { Entrega, Kit, Material, Movimiento, Resguardo, Trabajador } from './types'
import { SIN_TALLA } from './types'
import { normalizar } from '../lib/util'

// ---------------- Existencias ----------------

export const claveStock = (materialId: string, varianteId: string, ubicacionId: string) =>
  `${materialId}|${varianteId}|${ubicacionId}`

/** Existencia por material + variante + ubicación, calculada a partir del kardex. */
export function calcularExistencias(movs: Movimiento[]): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const mv of movs) {
    const k = claveStock(mv.materialId, mv.varianteId, mv.ubicacionId)
    mapa.set(k, (mapa.get(k) ?? 0) + mv.cantidad)
  }
  return mapa
}

export function existencia(
  mapa: Map<string, number>,
  materialId: string,
  varianteId: string,
  ubicacionId?: string,
  ubicaciones?: string[],
): number {
  if (ubicacionId) return mapa.get(claveStock(materialId, varianteId, ubicacionId)) ?? 0
  return (ubicaciones ?? []).reduce((s, u) => s + (mapa.get(claveStock(materialId, varianteId, u)) ?? 0), 0)
}

/** Variantes vigentes de un material; un material sin tallas tiene una sola variante vacía. */
export function variantesDe(m: Material): string[] {
  const activas = m.variantes.filter((v) => v.activo)
  return activas.length ? activas.map((v) => v.id) : [SIN_TALLA]
}

export function tieneTallas(m: Material): boolean {
  return m.variantes.some((v) => v.activo)
}

export type NivelStock = 0 | 1 | 2 | 3 // 0 óptimo · 1 reorden · 2 crítico · 3 agotado

export function nivelStock(cantidad: number, minimo: number): NivelStock {
  if (cantidad <= 0) return 3
  if (cantidad <= Math.floor(minimo / 2)) return 2
  if (cantidad <= minimo) return 1
  return 0
}

export const ETIQUETA_NIVEL = ['Óptimo', 'Reorden', 'Crítico', 'Agotado'] as const

// ---------------- Folios ----------------

export const prefijoFolio = (codigo: string) => `CFE-${codigo}-`

export function siguienteFolio(codigo: string, contador: number, foliosExistentes: string[]): number {
  const pref = prefijoFolio(codigo)
  const maxExistente = foliosExistentes
    .filter((f) => f.startsWith(pref))
    .reduce((mx, f) => Math.max(mx, parseInt(f.slice(pref.length), 10) || 0), 0)
  return Math.max(contador, maxExistente) + 1
}

export function formatoFolio(codigo: string, n: number): string {
  return prefijoFolio(codigo) + String(n).padStart(4, '0')
}

export function formatoFolioSI(codigo: string, n: number, anio: number): string {
  return `SI-${anio}-${codigo}-${String(n).padStart(4, '0')}`
}

// ---------------- RPE ----------------

/**
 * Busca al trabajador por RPE. Las credenciales traen un dígito verificador al
 * final (p. ej. «ZQ9X72» → «ZQ9X7»), así que si no hay coincidencia exacta se
 * prueba con los primeros 5 caracteres.
 */
export function resolverRpe(entrada: string, existe: (rpe: string) => boolean): string {
  const limpio = entrada.trim().toUpperCase().replace(/\s+/g, '')
  if (!limpio) return ''
  if (existe(limpio)) return limpio
  // El código del gafete trae el RPE (5 caracteres) y al final un dígito verificador
  if (/^[A-Z0-9]{6,}$/.test(limpio)) return limpio.slice(0, 5)
  return limpio
}

/**
 * Revisa lo que envió un escáner (USB o Bluetooth). El código del gafete trae exactamente
 * 6 letras o números (RPE + dígito); si llegan caracteres raros o faltan, la lectura se
 * perdió en el camino (p. ej. el escáner está en modo «Alt + teclado numérico») y no se
 * debe usar: podría dar de alta un RPE equivocado.
 */
export function lecturaEscanerValida(codigo: string): boolean {
  return /^[A-Z0-9]{6}$/.test(codigo.trim().toUpperCase())
}

/** RPE a partir de lo escaneado o tecleado: solo letras y números, máximo 5 caracteres. */
export function rpeDeCodigo(codigo: string): string {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
}

// ---------------- Tipo de trabajador ----------------

export type TipoNormal = 'permanente' | 'temporal' | 'eventual'

export const TIPOS_TRABAJADOR: Record<TipoNormal, string> = { permanente: 'Permanente', temporal: 'Temporal', eventual: 'Eventual' }

/** Regla de la oficina: los RPE que empiezan con 9 son permanentes; el resto, eventuales (salvo corrección). */
export function tipoPorRpe(rpe: string): TipoNormal {
  return rpe.trim().startsWith('9') ? 'permanente' : 'eventual'
}

/** Tipo del trabajador con el nombre actual ('planta' era el nombre anterior de permanente). */
export function tipoDe(t: Pick<Trabajador, 'tipo'>): TipoNormal {
  return t.tipo === 'planta' || t.tipo === 'permanente' ? 'permanente' : t.tipo === 'temporal' ? 'temporal' : 'eventual'
}

// ---------------- Entregas anteriores y recurrencia ----------------

export interface EntregaPrevia {
  entrega: Entrega
  cantidad: number
}

/** Entregas vigentes en las que esta persona recibió ese material, de la más reciente a la más antigua. */
export function entregasPrevias(entregas: Entrega[], rpe: string, materialId: string, limite = 50): EntregaPrevia[] {
  const r: EntregaPrevia[] = []
  for (let i = entregas.length - 1; i >= 0 && r.length < limite; i--) {
    const e = entregas[i]
    if (e.rpe !== rpe || e.estado !== 'registrada') continue
    const cantidad = e.lineas.filter((l) => l.materialId === materialId).reduce((s, l) => s + l.cantidad, 0)
    if (cantidad > 0) r.push({ entrega: e, cantidad })
  }
  return r.sort((a, b) => (a.entrega.ts < b.entrega.ts ? 1 : -1))
}

/** Se avisa cuando ya recibió ese material `veces` o más en los últimos `dias`. */
export const REGLA_RECURRENCIA = { dias: 30, veces: 2 }

export interface MaterialRecurrente {
  materialId: string
  previas: EntregaPrevia[] // dentro de la ventana de días
}

/** Materiales del ticket que la persona ya recibió de forma recurrente. `hoy` en formato YYYY-MM-DD. */
export function materialesRecurrentes(entregas: Entrega[], rpe: string, materialIds: string[], hoy: string, regla = REGLA_RECURRENCIA): MaterialRecurrente[] {
  const desde = sumarDias(hoy, -regla.dias)
  const r: MaterialRecurrente[] = []
  for (const materialId of new Set(materialIds)) {
    // Solo cuentan las entregas de la ventana anterior a ese día (importa al capturar días pasados)
    const previas = entregasPrevias(entregas, rpe, materialId).filter((p) => p.entrega.fecha >= desde && p.entrega.fecha <= hoy)
    if (previas.length >= regla.veces) r.push({ materialId, previas })
  }
  return r
}

export function buscarTrabajadores(lista: Trabajador[], texto: string, limite = 8): Trabajador[] {
  const q = normalizar(texto)
  if (q.length < 2) return []
  const rpeQ = texto.trim().toUpperCase()
  const porRpe = lista.filter((t) => t.rpe.startsWith(rpeQ))
  const palabras = q.split(/\s+/)
  const porNombre = lista.filter((t) => !t.rpe.startsWith(rpeQ) && palabras.every((p) => normalizar(t.nombre).includes(p)))
  return [...porRpe, ...porNombre].filter((t) => t.activo).slice(0, limite)
}

// ---------------- Kits ----------------

export interface LineaPropuesta {
  materialId: string
  cantidad: number
}

export interface ResultadoKit {
  lineas: LineaPropuesta[]
  omitidas: { materialId: string; razon: string }[]
}

/**
 * Aplica un kit a un trabajador: filtra las líneas por área y omite el equipo
 * de resguardo que el trabajador ya tiene activo (p. ej. si ya tiene casco).
 */
export function aplicarKit(
  kit: Kit,
  trabajador: Pick<Trabajador, 'area'>,
  resguardosActivos: Pick<Resguardo, 'materialId'>[],
  materiales: Map<string, Material>,
): ResultadoKit {
  const lineas: LineaPropuesta[] = []
  const omitidas: ResultadoKit['omitidas'] = []
  const area = normalizar(trabajador.area)
  for (const l of kit.lineas) {
    const m = materiales.get(l.materialId)
    if (!m || !m.activo) continue
    if (l.areas && l.areas.length && !l.areas.some((a) => normalizar(a) === area)) continue
    if (m.tipo !== 'consumible' && resguardosActivos.some((r) => r.materialId === l.materialId)) {
      omitidas.push({ materialId: l.materialId, razon: 'ya lo tiene en resguardo' })
      continue
    }
    lineas.push({ materialId: l.materialId, cantidad: l.cantidad })
  }
  // Complementos (barbiquejo, arnés de casco) solo si va el material al que acompañan
  const incluidos = new Set(lineas.map((l) => l.materialId))
  const acompanan = new Map(kit.lineas.filter((l) => l.conMaterial).map((l) => [l.materialId, l.conMaterial!]))
  return { lineas: lineas.filter((l) => !acompanan.has(l.materialId) || incluidos.has(acompanan.get(l.materialId)!)), omitidas }
}

// ---------------- Consumo frecuente ----------------

/** Materiales más entregados (para la pestaña «Más pedidos»). */
export function masPedidos(
  lineas: { materialId: string; cantidad: number }[],
  respaldo: string[],
  limite = 8,
): string[] {
  const conteo = new Map<string, number>()
  for (const l of lineas) conteo.set(l.materialId, (conteo.get(l.materialId) ?? 0) + l.cantidad)
  const ordenados = [...conteo.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  const resultado = [...ordenados]
  for (const id of respaldo) if (!resultado.includes(id)) resultado.push(id)
  return resultado.slice(0, limite)
}

// ---------------- Préstamos ----------------

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Préstamos activos cuya fecha límite ya pasó (o vence hoy, si se pide). */
export function prestamosVencidos<T extends Pick<Resguardo, 'tipo' | 'estatus' | 'vence'>>(lista: T[], hoy: string, incluirHoy = false): T[] {
  return lista.filter((r) => r.tipo === 'prestamo' && r.estatus === 'ACTIVO' && !!r.vence && (incluirHoy ? r.vence <= hoy : r.vence < hoy))
}
