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
  /** Existencia en almacén al iniciar el periodo según el kardex (null si no hay movimientos). */
  existInicio?: number | null
  /** Días del periodo en que el almacén amaneció sin existencia. */
  diasSinExistencia?: number
  /**
   * Sin existencia buena parte del periodo (al menos la cuarta parte de los días): lo entregado
   * no refleja lo que se necesitaba, por eso no cuenta para el promedio ni los escenarios.
   */
  sinExistencia?: boolean
}

/** Las líneas que cuentan como consumo: entregas vigentes, sin préstamos (esos regresan). */
function cantidadMaterial(e: Entrega, materialId: string, tallas?: Set<string>): number {
  return e.lineas.filter((l) => l.materialId === materialId && !l.esPrestamo && (!tallas || tallas.has(l.varianteId))).reduce((s, l) => s + l.cantidad, 0)
}

/** `variantes`: solo esas tallas (vacío o sin indicar = todas). */
export function consumoPorPeriodo(entregas: Entrega[], materialId: string, periodos: Periodo[], variantes?: string[]): FilaConsumo[] {
  const tallas = variantes?.length ? new Set(variantes) : undefined
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
    const c = cantidadMaterial(e, materialId, tallas)
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
export function existenciaTotal(movs: Movimiento[], materialId: string, ubicaciones: string[], variantes?: string[]): number {
  const ok = new Set(ubicaciones)
  const tallas = variantes?.length ? new Set(variantes) : undefined
  return movs.reduce((s, m) => (m.materialId === materialId && ok.has(m.ubicacionId) && (!tallas || tallas.has(m.varianteId)) ? s + m.cantidad : s), 0)
}

export interface Disponibilidad {
  existInicio: number | null
  dias: number
  sinExistencia: boolean
}

/**
 * Días de cada periodo en que el almacén amaneció sin existencia, según el kardex. Antes del
 * primer movimiento no se sabe la existencia y no se cuenta; tampoco cuando el kardex marca
 * existencia negativa (entregas sin entrada registrada). `limite`: no contar días futuros.
 */
export function disponibilidadPorPeriodo(movs: Movimiento[], materialId: string, ubicaciones: string[], periodos: Periodo[], variantes?: string[], limite?: string): Disponibilidad[] {
  const ok = new Set(ubicaciones)
  const tallas = variantes?.length ? new Set(variantes) : undefined
  const lista = movs
    .filter((m) => m.materialId === materialId && ok.has(m.ubicacionId) && (!tallas || tallas.has(m.varianteId)))
    .map((m) => ({ f: fechaDeTs(m.ts), c: m.cantidad }))
    .sort((a, b) => (a.f < b.f ? -1 : a.f > b.f ? 1 : 0))
  if (!lista.length) return periodos.map(() => ({ existInicio: null, dias: 0, sinExistencia: false }))
  const primero = lista[0].f
  let j = 0
  let ex = 0
  const avanzar = (d: string) => {
    while (j < lista.length && lista[j].f < d) ex += lista[j++].c
  }
  return periodos.map((p) => {
    avanzar(p.inicio)
    const existInicio = p.inicio > primero ? Math.round(ex) : null
    let dias = 0
    let contados = 0
    for (let d = p.inicio; d <= p.fin && (!limite || d <= limite); d = sumarDias(d, 1)) {
      avanzar(d)
      contados++
      if (d > primero && Math.abs(ex) < 1e-9) dias++
    }
    return { existInicio, dias, sinExistencia: dias > 0 && dias >= Math.max(1, Math.ceil(contados * 0.25)) }
  })
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
  /** No hay con qué estimar el consumo: el material no tuvo existencia en todo el periodo. */
  sinDato?: boolean
  /** Material necesario para llegar a la fecha objetivo y lo que falta (0 si alcanza). */
  necesario?: number
  faltante?: number
  sobrante?: number
}

export interface AnalisisMaterial {
  /** Identifica el análisis: material y, si aplica, las tallas analizadas ('carnaza' o 'carnaza|G'). */
  clave: string
  material: Pick<Material, 'id' | 'nombre'>
  /** Nombre para mostrar: «Guante de Carnaza» o «Guante de Carnaza – Talla G». */
  nombre: string
  /** Tallas analizadas cuando no son todas las del material. */
  talla?: { ids: string[]; etiqueta: string }
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
  /** Periodos sin existencia en almacén (no cuentan para el promedio si así se configuró). */
  periodosSinExistencia: number
  /** Periodos con los que se calcularon el promedio y los escenarios. */
  periodosMedidos: number
  /** No hubo existencia en todo el periodo: no se sabe cuánto se consume. */
  demandaNoMedida: boolean
  /** Tallas que estuvieron sin existencia (análisis de varias tallas juntas). */
  tallasSinExistencia: { etiqueta: string; periodos: number }[]
}

/** «No se agota» o «Sin dato» (si no se pudo medir el consumo). */
export const sinFin = (r: ResultadoEscenario) => (r.sinDato ? 'Sin dato' : 'No se agota')

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
  /** Solo estas tallas (sin indicar = todas). */
  variantes?: string[]
  /** No contar para el promedio los periodos sin existencia en almacén (por omisión, sí). */
  excluirSinExistencia?: boolean
}

export const claveSujeto = (materialId: string, variantes?: string[]) => (variantes?.length ? `${materialId}|${[...variantes].sort().join(',')}` : materialId)

/** «Talla G» / «Tallas M y G» / undefined si son todas. */
export function etiquetaTallas(material: Pick<Material, 'variantes'>, variantes?: string[]): string | undefined {
  if (!variantes?.length) return undefined
  const activas = material.variantes.filter((v) => v.activo).map((v) => v.id)
  if (activas.length && activas.every((v) => variantes.includes(v)) && variantes.length === activas.length) return undefined
  const et = material.variantes.filter((v) => variantes.includes(v.id)).map((v) => v.etiqueta)
  if (et.length === 1) return `Talla ${et[0]}`
  return `Tallas ${et.slice(0, -1).join(', ')} y ${et[et.length - 1]}`
}

export function analizarMaterial(o: OpcionesAnalisis): AnalisisMaterial {
  const periodos = periodosEntre(o.desde, o.hasta, o.unidad)
  const variantes = o.variantes?.length ? o.variantes : undefined
  const historico = consumoPorPeriodo(o.entregas, o.material.id, periodos, variantes)
  const disp = disponibilidadPorPeriodo(o.movimientos, o.material.id, o.ubicaciones, periodos, variantes, o.hoy)
  historico.forEach((f, i) => {
    f.existInicio = disp[i].existInicio
    f.diasSinExistencia = disp[i].dias
    f.sinExistencia = disp[i].sinExistencia
  })
  const excluir = o.excluirSinExistencia !== false
  const medidos = excluir ? historico.filter((f) => !f.sinExistencia) : historico
  const periodosSinExistencia = historico.filter((f) => f.sinExistencia).length
  const demandaNoMedida = excluir && !medidos.length && periodosSinExistencia > 0
  const total = historico.reduce((s, f) => s + f.cantidad, 0)
  const solicitudes = historico.reduce((s, f) => s + f.solicitudes, 0)
  const conMaterial = historico.reduce((s, f) => s + f.conMaterial, 0)
  const almacen = o.config.existenciaManual ?? existenciaTotal(o.movimientos, o.material.id, o.ubicaciones, variantes)
  const existencia = Math.max(0, almacen + (o.config.pedido || 0))
  const n = medidos.length || 1
  const cantidades = medidos.map((f) => f.cantidad)
  const totalMedido = cantidades.reduce((s, v) => s + v, 0)
  const consumos: Record<Escenario, number> = {
    bajo: cantidades.length ? Math.min(...cantidades) : 0,
    promedio: Math.round(totalMedido / n),
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
  for (const e of ['bajo', 'promedio', 'alto'] as Escenario[]) {
    escenarios[e] = proyectar(existencia, consumos[e], inicioProyeccion, o.unidad, objetivoValido)
    if (demandaNoMedida) Object.assign(escenarios[e], { sinDato: true, cobertura: NaN, necesario: undefined, faltante: undefined, sobrante: undefined })
  }

  const tallas = new Map<string, number>()
  for (const e of o.entregas) {
    if (e.estado !== 'registrada' || !periodos.length || e.fecha < periodos[0].inicio || e.fecha > ultimo.fin) continue
    for (const l of e.lineas) if (l.materialId === o.material.id && !l.esPrestamo && (!variantes || variantes.includes(l.varianteId))) tallas.set(l.varianteId, (tallas.get(l.varianteId) ?? 0) + l.cantidad)
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
    const ym = totalMedido / cantidades.length
    let num = 0
    let den = 0
    cantidades.forEach((y, x) => {
      num += (x - xm) * (y - ym)
      den += (x - xm) ** 2
    })
    pendiente = den ? redondear(num / den) : 0
  }

  // Tallas sin existencia dentro de un análisis de varias tallas juntas
  const tallasSinExistencia: { etiqueta: string; periodos: number }[] = []
  const ids = (variantes ?? o.material.variantes.filter((v) => v.activo).map((v) => v.id)).filter((v) => v !== SIN_TALLA)
  if (ids.length > 1)
    for (const v of ids) {
      const k = disponibilidadPorPeriodo(o.movimientos, o.material.id, o.ubicaciones, periodos, [v], o.hoy).filter((d) => d.sinExistencia).length
      if (k) tallasSinExistencia.push({ etiqueta: etiquetaTalla(v), periodos: k })
    }

  const etiqueta = etiquetaTallas(o.material, variantes)
  return {
    clave: claveSujeto(o.material.id, etiqueta ? variantes : undefined),
    material: { id: o.material.id, nombre: o.material.nombre },
    nombre: etiqueta ? `${o.material.nombre} – ${etiqueta}` : o.material.nombre,
    talla: etiqueta && variantes ? { ids: variantes, etiqueta } : undefined,
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
    periodosSinExistencia,
    periodosMedidos: medidos.length,
    demandaNoMedida,
    tallasSinExistencia,
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
  if (r.sinDato) return 'sin dato (no hubo existencia)'
  if (!isFinite(r.cobertura)) return 'sin consumo registrado'
  const v = Math.round(r.cobertura * 10) / 10
  return `${v.toLocaleString('es-MX')} ${unidadTexto(u, v)}`
}

/** Conclusión principal, en el mismo estilo del reporte de ejemplo. */
/** Aviso de las semanas sin existencia: en ellas no se entregó porque no había, no porque no se usara. */
export function notaDisponibilidad(a: AnalisisMaterial): string {
  const u = a.unidad
  const n = a.historico.length
  let t = ''
  if (a.demandaNoMedida)
    t = `Durante todo el periodo analizado no hubo existencia de ${nombreEnTexto(a.nombre)} en almacén, por eso casi no hay entregas: no significa que no se use. No se puede estimar su consumo con estos datos; conviene revisar las solicitudes que no se pudieron surtir.`
  else if (a.periodosSinExistencia)
    t = `${a.periodosSinExistencia} de ${n} ${unidadTexto(u, n)} el almacén estuvo sin existencia${a.periodosSinExistencia === 1 ? '' : ' (marcadas en la tabla)'}; en ellas no se pudo entregar, por lo que no se tomaron en cuenta y el consumo se calculó con las ${a.periodosMedidos} ${unidadTexto(u, a.periodosMedidos)} con material disponible.`
  if (a.tallasSinExistencia.length) {
    const l = a.tallasSinExistencia.map((x) => `${x.etiqueta} (${x.periodos} ${unidadTexto(u, x.periodos)})`)
    t += `${t ? ' ' : ''}${l.length === 1 ? 'La talla' : 'Las tallas'} ${l.slice(0, -1).join(', ')}${l.length > 1 ? ' y ' : ''}${l[l.length - 1]} ${l.length === 1 ? 'estuvo' : 'estuvieron'} sin existencia: su consumo real puede ser mayor al registrado.`
  }
  return t
}

export function conclusion(a: AnalisisMaterial, unidadMaterial: string): string {
  if (a.demandaNoMedida) return `No se puede calcular hasta cuándo alcanza ${nombreEnTexto(a.nombre)}: no hubo existencia durante el periodo analizado, así que no hay entregas con qué medir su consumo. Existencia actual: ${miles(a.existencia)} ${unidadMaterial}.`
  const p = a.escenarios.promedio
  const base = `De acuerdo a este consumo promedio (${miles(p.consumo)} ${unidadMaterial} ${porUnidad(a.unidad)}), los ${miles(a.existencia)} ${unidadMaterial} de ${nombreEnTexto(a.nombre)}`
  let t = p.agotamiento ? `${base} alcanzarían hasta ${cuandoTexto(p.agotamiento, a.unidad)} aproximadamente.` : `${base} no se agotarían con el consumo registrado.`
  if (a.objetivo && p.faltante !== undefined) {
    t += p.faltante > 0
      ? ` Para llegar a ${cuandoTexto(a.objetivo, a.unidad)} se necesitan ${miles(p.necesario!)} ${unidadMaterial}: hacen falta ${miles(p.faltante)}.`
      : ` Para llegar a ${cuandoTexto(a.objetivo, a.unidad)} se necesitan ${miles(p.necesario!)} ${unidadMaterial}: alcanza y sobran ${miles(p.sobrante!)}.`
  }
  return t
}

// ---------------- Planeado vs real ----------------
/** Plan fijado (o capturado a mano): consumo constante por periodo desde una semana o mes. */
export interface PlanMaterial {
  /** Día en que se fijó el plan. */
  creado: string
  /** Primer día del periodo en que empieza el plan. */
  inicio: string
  unidad: UnidadPeriodo
  existenciaInicial: number
  consumo: number
  /** De dónde salió: proyección de la app o captura manual. */
  origen: 'proyeccion' | 'manual'
}

export interface FilaPlanReal {
  periodo: Periodo
  enCurso: boolean
  planeado: number
  real: number
  diferencia: number // real - planeado
  acumPlaneado: number
  acumReal: number
  /** Existencia al iniciar el periodo según el plan y según el kardex. */
  existPlaneada: number
  existReal: number
  /** Entradas de material registradas en el periodo (pedidos que llegaron). */
  entradas: number
}

export interface ComparacionPlan {
  plan: PlanMaterial
  inicio: Periodo
  filas: FilaPlanReal[]
  /** Periodos completos ya transcurridos (sin el que va en curso). */
  completos: number
  totalPlaneado: number
  totalReal: number
  desviacionPct: number // (real - planeado) / planeado de los periodos completos
  promedioReal: number
  agotamientoPlan: Periodo | null
  /** Con el consumo real promedio y la existencia real de hoy. */
  agotamientoReal: Periodo | null
  existenciaHoy: number
}

const fechaDeTs = (ts: string) => {
  const d = new Date(ts)
  return isNaN(d.getTime()) ? ts.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function compararPlan(o: { plan: PlanMaterial; entregas: Entrega[]; movimientos: Movimiento[]; ubicaciones: string[]; materialId: string; hoy: string; variantes?: string[] }): ComparacionPlan {
  const tallas = o.variantes?.length ? new Set(o.variantes) : undefined
  const u = o.plan.unidad
  const inicio = periodoDe(o.plan.inicio, u)
  const actual = periodoDe(o.hoy, u)
  const periodos = actual.clave >= inicio.clave ? periodosEntre(inicio.inicio, actual.fin, u) : []
  const consumo = consumoPorPeriodo(o.entregas, o.materialId, periodos, o.variantes)
  const ok = new Set(o.ubicaciones)
  const movs = o.movimientos.filter((m) => m.materialId === o.materialId && ok.has(m.ubicacionId) && (!tallas || tallas.has(m.varianteId))).map((m) => ({ f: fechaDeTs(m.ts), c: m.cantidad, entrada: m.tipo === 'ENTRADA' }))
  const existenciaAl = (f: string) => movs.reduce((s, m) => (m.f < f ? s + m.c : s), 0)
  let acumP = 0
  let acumR = 0
  const filas = consumo.map<FilaPlanReal>((c, i) => {
    acumP += o.plan.consumo
    acumR += c.cantidad
    return {
      periodo: c.periodo,
      enCurso: c.periodo.clave === actual.clave,
      planeado: o.plan.consumo,
      real: c.cantidad,
      diferencia: c.cantidad - o.plan.consumo,
      acumPlaneado: acumP,
      acumReal: acumR,
      existPlaneada: o.plan.existenciaInicial - o.plan.consumo * i,
      existReal: existenciaAl(c.periodo.inicio),
      entradas: movs.reduce((s, m) => (m.entrada && m.f >= c.periodo.inicio && m.f <= c.periodo.fin ? s + m.c : s), 0),
    }
  })
  const completas = filas.filter((f) => !f.enCurso)
  const totalPlaneado = completas.reduce((s, f) => s + f.planeado, 0)
  const totalReal = completas.reduce((s, f) => s + f.real, 0)
  const promedioReal = completas.length ? Math.round(totalReal / completas.length) : 0
  const existenciaHoy = movs.reduce((s, m) => s + m.c, 0)
  const sig = siguientePeriodo(actual, u)
  return {
    plan: o.plan,
    inicio,
    filas,
    completos: completas.length,
    totalPlaneado,
    totalReal,
    desviacionPct: totalPlaneado ? Math.round(((totalReal - totalPlaneado) / totalPlaneado) * 100) : 0,
    promedioReal,
    agotamientoPlan: proyectar(o.plan.existenciaInicial, o.plan.consumo, inicio, u).agotamiento,
    agotamientoReal: completas.length ? proyectar(existenciaHoy, promedioReal, sig, u).agotamiento : null,
    existenciaHoy,
  }
}

/** Conclusión del planeado vs real en lenguaje sencillo. */
export function conclusionPlan(c: ComparacionPlan, nombre: string, unidadMaterial: string): string {
  const u = c.plan.unidad
  if (!c.completos) return `El plan empieza ${c.inicio.largo.startsWith('Semana') ? 'en la ' : 'en '}${c.inicio.largo}; todavía no hay ${unidadTexto(u)} completas para comparar con lo real.`
  const n = `${c.completos} ${unidadTexto(u, c.completos)}`
  const dif = Math.abs(c.desviacionPct)
  let t =
    dif <= 5
      ? `En ${n}, el consumo real de ${nombre.toLowerCase()} (${miles(c.totalReal)} ${unidadMaterial}) se ha comportado como se planeó (${miles(c.totalPlaneado)}).`
      : `En ${n} se consumieron ${miles(c.totalReal)} ${unidadMaterial} de ${nombre.toLowerCase()} contra ${miles(c.totalPlaneado)} planeados: ${dif}% ${c.desviacionPct > 0 ? 'más' : 'menos'} de lo previsto.`
  const ap = c.agotamientoPlan
  const ar = c.agotamientoReal
  if (ap && ar) {
    if (ar.clave === ap.clave) t += ` Al ritmo real (${miles(c.promedioReal)} ${porUnidad(u)}) el material alcanzaría hasta ${cuandoTexto(ar, u)}, igual que en el plan.`
    else t += ` Al ritmo real (${miles(c.promedioReal)} ${porUnidad(u)}) y con la existencia de hoy (${miles(c.existenciaHoy)}), el material alcanzaría hasta ${cuandoTexto(ar, u)}; el plan indicaba ${cuandoTexto(ap, u)}.`
  } else if (!ar) t += ` Con el consumo real registrado el material no se agotaría.`
  return t
}

/** Nombre dentro de una oración: «guante de carnaza – talla G» (la talla conserva su mayúscula). */
export function nombreEnTexto(nombre: string): string {
  const [m, t] = nombre.split(' – ')
  return t ? `${m.toLowerCase()} – ${t.replace(/^Talla/, 'talla').replace(/^Tallas/, 'tallas')}` : m.toLowerCase()
}

/** Texto de la conclusión con el escenario indicado (promedio, bajo o conservador). */
export function conclusionEscenario(a: AnalisisMaterial, e: Escenario, unidadMaterial: string): string {
  if (e === 'promedio' || a.demandaNoMedida) return conclusion(a, unidadMaterial)
  const r = a.escenarios[e]
  const nombreE = e === 'alto' ? 'el escenario conservador' : 'el escenario bajo'
  let t = r.agotamiento
    ? `Con ${nombreE} (${miles(r.consumo)} ${unidadMaterial} ${porUnidad(a.unidad)}) alcanzarían hasta ${cuandoTexto(r.agotamiento, a.unidad)}.`
    : `Con ${nombreE} (${miles(r.consumo)} ${unidadMaterial} ${porUnidad(a.unidad)}) no se agotarían.`
  if (a.objetivo && r.faltante !== undefined) t += r.faltante > 0 ? ` Para ${cuandoTexto(a.objetivo, a.unidad)} faltarían ${miles(r.faltante)}.` : ` Para ${cuandoTexto(a.objetivo, a.unidad)} alcanza.`
  return t
}
