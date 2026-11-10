// Tendencia de consumo de EPP: a partir de las entregas registradas calcula el consumo por
// semana (o mes), el promedio y los escenarios, y proyecta hasta cuándo alcanzan las
// existencias o cuánto material falta para llegar a una fecha. Todo es cálculo puro
// (sin base de datos) para poder verificarlo con pruebas.
import type { Entrega, Material, Movimiento } from './types'
import { SIN_TALLA } from './types'

export type UnidadPeriodo = 'semana' | 'mes'
export type Escenario = 'bajo' | 'promedio' | 'alto'

export const NOMBRE_ESCENARIO: Record<Escenario, string> = {
  bajo: 'Escenario bajo',
  promedio: 'Consumo promedio',
  alto: 'Escenario conservador',
}
export const AYUDA_ESCENARIO: Record<Escenario, string> = {
  bajo: 'Periodo de menor consumo',
  promedio: 'Promedio del periodo analizado',
  alto: 'Periodo de mayor consumo',
}

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
export const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// ---------------- Fechas (siempre en UTC sobre 'AAAA-MM-DD' para no depender del huso) ----------------
const aFecha = (f: string) => new Date(`${f}T00:00:00Z`)
const aTexto = (d: Date) => d.toISOString().slice(0, 10)
export const sumarDias = (f: string, n: number) => {
  const d = aFecha(f)
  d.setUTCDate(d.getUTCDate() + n)
  return aTexto(d)
}

/** Semana ISO (lunes a domingo; la semana 1 es la que tiene el primer jueves del año). */
export function semanaISO(f: string): { anio: number; semana: number; lunes: string } {
  const d = aFecha(f)
  const dia = (d.getUTCDay() + 6) % 7 // 0 = lunes
  const lunes = sumarDias(f, -dia)
  const jueves = aFecha(sumarDias(lunes, 3))
  const anio = jueves.getUTCFullYear()
  const primero = Date.UTC(anio, 0, 1)
  const semana = Math.floor((jueves.getTime() - primero) / 86400000 / 7) + 1
  return { anio, semana, lunes }
}

export interface Periodo {
  clave: string
  etiqueta: string // «SEM 37» o «SEP 26»
  largo: string // «Semana 37 de 2026» o «septiembre de 2026»
  inicio: string
  fin: string
}

export function periodoDe(f: string, u: UnidadPeriodo): Periodo {
  if (u === 'semana') {
    const s = semanaISO(f)
    const sem = String(s.semana).padStart(2, '0')
    return { clave: `${s.anio}-S${sem}`, etiqueta: `SEM ${sem}`, largo: `Semana ${sem} de ${s.anio}`, inicio: s.lunes, fin: sumarDias(s.lunes, 6) }
  }
  const [a, m] = f.split('-').map(Number)
  const inicio = `${a}-${String(m).padStart(2, '0')}-01`
  const fin = aTexto(new Date(Date.UTC(a, m, 0)))
  return { clave: inicio.slice(0, 7), etiqueta: `${MESES[m - 1]} ${String(a).slice(2)}`, largo: `${MESES_LARGOS[m - 1]} de ${a}`, inicio, fin }
}

export const siguientePeriodo = (p: Periodo, u: UnidadPeriodo) => periodoDe(sumarDias(p.fin, 1), u)

/** Periodos completos que cubren del día `desde` al día `hasta`. */
export function periodosEntre(desde: string, hasta: string, u: UnidadPeriodo): Periodo[] {
  const lista: Periodo[] = []
  if (desde > hasta) return lista
  let p = periodoDe(desde, u)
  while (p.inicio <= hasta && lista.length < 520) {
    lista.push(p)
    p = siguientePeriodo(p, u)
  }
  return lista
}

// ---------------- Consumo histórico ----------------
export interface FilaConsumo {
  periodo: Periodo
  cantidad: number
  /** Entregas (solicitudes atendidas) del periodo, con o sin este material. */
  solicitudes: number
  /** Entregas del periodo que incluyeron este material. */
  conMaterial: number
  /** Folios de las entregas que incluyeron el material (para verificarlo en Historial). */
  folios: { folio: string; fecha: string; nombre: string; cantidad: number }[]
}

/** Las líneas que cuentan como consumo: entregas vigentes, sin préstamos (esos regresan). */
function cantidadMaterial(e: Entrega, materialId: string): number {
  return e.lineas.filter((l) => l.materialId === materialId && !l.esPrestamo).reduce((s, l) => s + l.cantidad, 0)
}

export function consumoPorPeriodo(entregas: Entrega[], materialId: string, periodos: Periodo[]): FilaConsumo[] {
  const filas = periodos.map<FilaConsumo>((p) => ({ periodo: p, cantidad: 0, solicitudes: 0, conMaterial: 0, folios: [] }))
  if (!filas.length) return filas
  const desde = periodos[0].inicio
  const hasta = periodos[periodos.length - 1].fin
  for (const e of entregas) {
    if (e.estado !== 'registrada' || e.fecha < desde || e.fecha > hasta) continue
    const i = periodos.findIndex((p) => e.fecha >= p.inicio && e.fecha <= p.fin)
    if (i < 0) continue
    const f = filas[i]
    f.solicitudes++
    const c = cantidadMaterial(e, materialId)
    if (c > 0) {
      f.cantidad += c
      f.conMaterial++
      f.folios.push({ folio: e.folio, fecha: e.fecha, nombre: e.nombre, cantidad: c })
    }
  }
  filas.forEach((f) => f.folios.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)))
  return filas
}

/** Existencia total del material (todas las tallas) en las ubicaciones indicadas. */
export function existenciaTotal(movs: Movimiento[], materialId: string, ubicaciones: string[]): number {
  const ok = new Set(ubicaciones)
  return movs.reduce((s, m) => (m.materialId === materialId && ok.has(m.ubicacionId) ? s + m.cantidad : s), 0)
}

// ---------------- Análisis y proyección ----------------
export interface ConfigMaterial {
  materialId: string
  /** Pedido por llegar que se suma a las existencias (como «Almacén 300 + Pedido 2000»). */
  pedido: number
  /** Si se indica, reemplaza la existencia que tiene la app. */
  existenciaManual?: number | null
}

export interface FilaProyeccion {
  periodo: Periodo
  /** Existencia al iniciar el periodo. */
  existencia: number
  consumo: number
  /** Porcentaje consumido acumulado al terminar el periodo (0 a 100). */
  acumulado: number
}

export interface ResultadoEscenario {
  consumo: number // por periodo
  /** Periodos que alcanza la existencia (con decimales). Infinity si el consumo es 0. */
  cobertura: number
  /** Último periodo en el que todavía hay material al iniciar. null si no se agota. */
  agotamiento: Periodo | null
  filas: FilaProyeccion[]
  /** Material necesario para llegar a la fecha objetivo y lo que falta (0 si alcanza). */
  necesario?: number
  faltante?: number
  sobrante?: number
}

export interface AnalisisMaterial {
  material: Pick<Material, 'id' | 'nombre'>
  unidad: UnidadPeriodo
  historico: FilaConsumo[]
  total: number
  solicitudes: number
  conMaterial: number
  sinMaterial: number
  pctSinMaterial: number
  almacen: number
  pedido: number
  existencia: number
  pctConsumo: number
  porTalla: { varianteId: string; etiqueta: string; cantidad: number; pct: number }[]
  escenarios: Record<Escenario, ResultadoEscenario>
  inicioProyeccion: Periodo
  objetivo?: Periodo
  /** El consumo va subiendo o bajando (pendiente por periodo de la recta de mínimos cuadrados). */
  pendiente: number
}

const redondear = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d

export function proyectar(existencia: number, consumo: number, inicio: Periodo, u: UnidadPeriodo, objetivo?: Periodo, maxPeriodos = 156): ResultadoEscenario {
  const filas: FilaProyeccion[] = []
  let p = inicio
  let agotamiento: Periodo | null = null
  // Se proyecta hasta el primer periodo en negativo (como en el formato de ejemplo) o hasta la fecha objetivo
  for (let i = 0; i < maxPeriodos; i++) {
    const ex = existencia - consumo * i
    const consumido = Math.min(existencia, consumo * (i + 1))
    filas.push({ periodo: p, existencia: Math.round(ex), consumo, acumulado: existencia > 0 ? Math.min(100, (consumido / existencia) * 100) : 100 })
    if (ex > 0) agotamiento = p
    const pasoObjetivo = !objetivo || p.clave >= objetivo.clave
    // Sin consumo no se agota: se muestran 12 periodos (o hasta la fecha objetivo)
    const fin = consumo > 0 ? ex < 0 : i >= 11
    if (fin && pasoObjetivo) break
    p = siguientePeriodo(p, u)
  }
  if (consumo <= 0) agotamiento = null
  const r: ResultadoEscenario = { consumo, cobertura: consumo > 0 ? existencia / consumo : Infinity, agotamiento, filas }
  if (objetivo) {
    const n = periodosEntre(inicio.inicio, objetivo.fin, u).length
    r.necesario = Math.ceil(consumo * n)
    r.faltante = Math.max(0, r.necesario - existencia)
    r.sobrante = Math.max(0, existencia - r.necesario)
  }
  return r
}

export interface OpcionesAnalisis {
  entregas: Entrega[]
  movimientos: Movimiento[]
  ubicaciones: string[]
  material: Pick<Material, 'id' | 'nombre' | 'variantes'>
  config: ConfigMaterial
  desde: string
  hasta: string
  unidad: UnidadPeriodo
  /** Fecha hasta la que se quiere llegar (opcional). */
  fechaObjetivo?: string
  /** Hoy (para no proyectar desde un periodo que ya pasó). */
  hoy: string
}

export function analizarMaterial(o: OpcionesAnalisis): AnalisisMaterial {
  const periodos = periodosEntre(o.desde, o.hasta, o.unidad)
  const historico = consumoPorPeriodo(o.entregas, o.material.id, periodos)
  const total = historico.reduce((s, f) => s + f.cantidad, 0)
  const solicitudes = historico.reduce((s, f) => s + f.solicitudes, 0)
  const conMaterial = historico.reduce((s, f) => s + f.conMaterial, 0)
  const almacen = o.config.existenciaManual ?? existenciaTotal(o.movimientos, o.material.id, o.ubicaciones)
  const existencia = Math.max(0, almacen + (o.config.pedido || 0))
  const n = historico.length || 1
  const cantidades = historico.map((f) => f.cantidad)
  const consumos: Record<Escenario, number> = {
    bajo: cantidades.length ? Math.min(...cantidades) : 0,
    promedio: Math.round(total / n),
    alto: cantidades.length ? Math.max(...cantidades) : 0,
  }
  // La proyección empieza en el periodo siguiente al analizado, o en el actual si ese ya pasó
  const ultimo = periodos.length ? periodos[periodos.length - 1] : periodoDe(o.hasta, o.unidad)
  const sig = siguientePeriodo(ultimo, o.unidad)
  const actual = periodoDe(o.hoy, o.unidad)
  const inicioProyeccion = sig.clave >= actual.clave ? sig : actual
  const objetivo = o.fechaObjetivo ? periodoDe(o.fechaObjetivo, o.unidad) : undefined
  const objetivoValido = objetivo && objetivo.clave >= inicioProyeccion.clave ? objetivo : undefined
  const escenarios = {} as Record<Escenario, ResultadoEscenario>
  for (const e of ['bajo', 'promedio', 'alto'] as Escenario[]) escenarios[e] = proyectar(existencia, consumos[e], inicioProyeccion, o.unidad, objetivoValido)

  const tallas = new Map<string, number>()
  for (const e of o.entregas) {
    if (e.estado !== 'registrada' || !periodos.length || e.fecha < periodos[0].inicio || e.fecha > ultimo.fin) continue
    for (const l of e.lineas) if (l.materialId === o.material.id && !l.esPrestamo) tallas.set(l.varianteId, (tallas.get(l.varianteId) ?? 0) + l.cantidad)
  }
  const etiquetaTalla = (v: string) => (v === SIN_TALLA ? 'Sin talla' : (o.material.variantes.find((x) => x.id === v)?.etiqueta ?? v))
  const orden = (v: string) => {
    const i = o.material.variantes.findIndex((x) => x.id === v)
    return i < 0 ? 999 : i
  }
  const porTalla = [...tallas.entries()]
    .sort((a, b) => orden(a[0]) - orden(b[0]))
    .map(([varianteId, cantidad]) => ({ varianteId, etiqueta: etiquetaTalla(varianteId), cantidad, pct: total ? redondear((cantidad / total) * 100) : 0 }))

  // Pendiente de la recta de mínimos cuadrados (cuánto sube o baja el consumo por periodo)
  let pendiente = 0
  if (cantidades.length > 1) {
    const xm = (cantidades.length - 1) / 2
    const ym = total / cantidades.length
    let num = 0
    let den = 0
    cantidades.forEach((y, x) => {
      num += (x - xm) * (y - ym)
      den += (x - xm) ** 2
    })
    pendiente = den ? redondear(num / den) : 0
  }

  return {
    material: { id: o.material.id, nombre: o.material.nombre },
    unidad: o.unidad,
    historico,
    total,
    solicitudes,
    conMaterial,
    sinMaterial: solicitudes - conMaterial,
    pctSinMaterial: solicitudes ? Math.round(((solicitudes - conMaterial) / solicitudes) * 100) : 0,
    almacen,
    pedido: o.config.pedido || 0,
    existencia,
    pctConsumo: existencia ? Math.round((consumos.promedio / existencia) * 100) : 0,
    porTalla,
    escenarios,
    inicioProyeccion,
    objetivo: objetivoValido,
    pendiente,
  }
}

// ---------------- Textos ----------------
export const miles = (n: number) => Math.round(n).toLocaleString('es-MX')
export const unidadTexto = (u: UnidadPeriodo, n = 2) => (u === 'semana' ? (n === 1 ? 'semana' : 'semanas') : n === 1 ? 'mes' : 'meses')
export const porUnidad = (u: UnidadPeriodo) => (u === 'semana' ? 'por semana' : 'por mes')

export function fechaLarga(f: string): string {
  const [a, m, d] = f.split('-').map(Number)
  return `${d} de ${MESES_LARGOS[m - 1]} de ${a}`
}

/** «la Semana 03 del 2027» / «enero de 2027». */
export function cuandoTexto(p: Periodo, u: UnidadPeriodo): string {
  if (u === 'semana') {
    const [a, s] = p.clave.split('-S')
    return `la Semana ${s} del ${a}`
  }
  return p.largo
}

export function coberturaTexto(r: ResultadoEscenario, u: UnidadPeriodo): string {
  if (!isFinite(r.cobertura)) return 'sin consumo registrado'
  const v = Math.round(r.cobertura * 10) / 10
  return `${v.toLocaleString('es-MX')} ${unidadTexto(u, v)}`
}

/** Conclusión principal, en el mismo estilo del reporte de ejemplo. */
export function conclusion(a: AnalisisMaterial, unidadMaterial: string): string {
  const p = a.escenarios.promedio
  const base = `De acuerdo a este consumo promedio (${miles(p.consumo)} ${unidadMaterial} ${porUnidad(a.unidad)}), los ${miles(a.existencia)} ${unidadMaterial} de ${a.material.nombre.toLowerCase()}`
  let t = p.agotamiento ? `${base} alcanzarían hasta ${cuandoTexto(p.agotamiento, a.unidad)} aproximadamente.` : `${base} no se agotarían con el consumo registrado.`
  if (a.objetivo && p.faltante !== undefined) {
    t += p.faltante > 0
      ? ` Para llegar a ${cuandoTexto(a.objetivo, a.unidad)} se necesitan ${miles(p.necesario!)} ${unidadMaterial}: hacen falta ${miles(p.faltante)}.`
      : ` Para llegar a ${cuandoTexto(a.objetivo, a.unidad)} se necesitan ${miles(p.necesario!)} ${unidadMaterial}: alcanza y sobran ${miles(p.sobrante!)}.`
  }
  return t
}
