import { calcularExistencias, existencia, nivelStock, prestamosVencidos, tipoDe, TIPOS_TRABAJADOR, variantesDe } from '../domain/logica'
import type { EstiloBarras, EstiloPastel } from './estilos'
import { esContaminada, materialesContaminados, contaminadoEn } from '../domain/contaminado'
import type { Categoria, Entrega, LineaEntrega, Material, Motivo, Movimiento, Resguardo, TipoMaterial, Trabajador, Ubicacion } from '../domain/types'
import { fechaLocal } from '../lib/util'

// Datos de un reporte ejecutivo para un periodo. Es la única fuente de números
// para el Excel, el PDF y la presentación, así que los tres siempre coinciden.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const fechaD = (f: string) => new Date(f + 'T12:00:00')

/** Número de semana ISO (la que usa el calendario laboral). */
export function semanaIso(fecha: string): number {
  const d = fechaD(fecha)
  const dia = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dia + 3)
  const primerJueves = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - primerJueves.getTime()) / 86400000 - 3 + ((primerJueves.getDay() + 6) % 7)) / 7)
}

/** «11 de septiembre 2026», «21 y 22 de septiembre 2026», «Semana 37 · 7 al 13 de septiembre 2026»… */
export function describirPeriodo(desde: string, hasta: string): { titulo: string; corto: string } {
  const a = fechaD(desde)
  const b = fechaD(hasta)
  const mes = (d: Date) => MESES[d.getMonth()]
  if (desde === hasta) {
    const t = `${a.getDate()} de ${mes(a)} ${a.getFullYear()}`
    return { titulo: t, corto: t }
  }
  const dias = Math.round((b.getTime() - a.getTime()) / 86400000) + 1
  const mismoMes = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  const rango = mismoMes
    ? dias === 2
      ? `${a.getDate()} y ${b.getDate()} de ${mes(b)} ${b.getFullYear()}`
      : `${a.getDate()} al ${b.getDate()} de ${mes(b)} ${b.getFullYear()}`
    : `${a.getDate()} de ${mes(a)} al ${b.getDate()} de ${mes(b)} ${b.getFullYear()}`
  const ultimoDia = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate()
  if (mismoMes && a.getDate() === 1 && b.getDate() === ultimoDia) {
    const t = `${mes(a)[0].toUpperCase()}${mes(a).slice(1)} ${a.getFullYear()}`
    return { titulo: t, corto: t }
  }
  if (dias === 7 && a.getDay() === 1) return { titulo: `Semana ${semanaIso(desde)} · ${rango}`, corto: `Semana ${semanaIso(desde)}` }
  return { titulo: rango, corto: rango }
}

/** Periodo en la portada: «DEL 1° AL 31 DE OCTUBRE DE 2026», «1° DE OCTUBRE DE 2026». */
export function periodoPortada(desde: string, hasta: string): string {
  const a = fechaD(desde)
  const b = fechaD(hasta)
  const dia = (d: Date) => (d.getDate() === 1 ? '1°' : String(d.getDate()))
  const mes = (d: Date) => MESES[d.getMonth()]
  let t: string
  if (desde === hasta) t = `${dia(a)} de ${mes(a)} de ${a.getFullYear()}`
  else if (a.getFullYear() !== b.getFullYear()) t = `del ${dia(a)} de ${mes(a)} de ${a.getFullYear()} al ${dia(b)} de ${mes(b)} de ${b.getFullYear()}`
  else if (a.getMonth() !== b.getMonth()) t = `del ${dia(a)} de ${mes(a)} al ${dia(b)} de ${mes(b)} de ${b.getFullYear()}`
  else t = `del ${dia(a)} al ${dia(b)} de ${mes(b)} de ${b.getFullYear()}`
  const dias = Math.round((b.getTime() - a.getTime()) / 86400000) + 1
  if (dias === 7 && a.getDay() === 1) t = `semana ${semanaIso(desde)} · ${t}`
  return t.toUpperCase()
}

export interface MaterialReporte {
  id: string
  nombre: string
  piezas: number
  personas: number
  tallas: [string, number][]
}

export interface AreaReporte {
  area: string
  personas: number
  entregas: number
  piezas: number
  cascos: number
  porMaterial: Record<string, number>
}

/** Persona que recibió el mismo material varias veces en el periodo (para dar seguimiento al motivo). */
export interface SolicitanteRecurrente {
  area: string
  materialId: string
  material: string
  rpe: string
  nombre: string
  tipo: string
  veces: number // entregas distintas en las que lo recibió
  piezas: number
  primera: string
  ultima: string
  /** Comentarios capturados al despachar cuando la app avisó de la recurrencia. */
  notas: string[]
  entregaIds: string[]
  /** Cada entrega del caso, de la más antigua a la más reciente. */
  detalle: { fecha: string; hora: string; folio: string; cantidad: number }[]
  /** Lo que más se llevó además en esas mismas entregas (piezas), de más a menos. */
  otros: { material: string; piezas: number }[]
}

/**
 * Solicitantes recurrentes por área y material: quienes recibieron un consumible en
 * `minimo` o más entregas. Ordenado por área, material y de mayor a menor número de veces.
 */
export function solicitantesRecurrentes(entregas: Entrega[], materiales: Map<string, Material>, personal: Map<string, Trabajador>, minimo = 2): SolicitanteRecurrente[] {
  const mapa = new Map<string, SolicitanteRecurrente>()
  for (const e of entregas) {
    if (e.estado !== 'registrada') continue
    const porMaterial = new Map<string, number>()
    for (const l of e.lineas) if (!l.esResguardo && !l.esPrestamo && !contaminadoEn(e, l.materialId)) porMaterial.set(l.materialId, (porMaterial.get(l.materialId) ?? 0) + l.cantidad)
    for (const [materialId, cantidad] of porMaterial) {
      const k = `${e.area}|${materialId}|${e.rpe}`
      const p = personal.get(e.rpe)
      const x = mapa.get(k) ?? {
        area: e.area, materialId, material: materiales.get(materialId)?.nombre ?? materialId, rpe: e.rpe, nombre: e.nombre,
        tipo: p ? TIPOS_TRABAJADOR[tipoDe(p)] : '', veces: 0, piezas: 0, primera: e.fecha, ultima: e.fecha, notas: [], entregaIds: [], detalle: [], otros: [],
      }
      x.veces++
      x.piezas += cantidad
      if (e.fecha < x.primera) x.primera = e.fecha
      if (e.fecha > x.ultima) x.ultima = e.fecha
      if (e.recurrencia?.nota && e.recurrencia.materiales.includes(materialId) && !x.notas.includes(e.recurrencia.nota)) x.notas.push(e.recurrencia.nota)
      x.entregaIds.push(e.id)
      x.detalle.push({ fecha: e.fecha, hora: e.hora, folio: e.folio, cantidad })
      // Lo demás que se llevó en esa misma entrega
      const otros = new Map(x.otros.map((o) => [o.material, o.piezas]))
      for (const l of e.lineas) {
        if (l.materialId === materialId) continue
        const nombre = materiales.get(l.materialId)?.nombre ?? l.materialId
        otros.set(nombre, (otros.get(nombre) ?? 0) + l.cantidad)
      }
      x.otros = [...otros].map(([material, piezas]) => ({ material, piezas }))
      mapa.set(k, x)
    }
  }
  for (const x of mapa.values()) {
    x.detalle.sort((a, b) => (a.fecha + a.hora < b.fecha + b.hora ? -1 : 1))
    x.otros.sort((a, b) => b.piezas - a.piezas || a.material.localeCompare(b.material))
  }
  return [...mapa.values()]
    .filter((x) => x.veces >= minimo)
    .sort((a, b) => a.area.localeCompare(b.area) || a.material.localeCompare(b.material) || b.veces - a.veces || b.piezas - a.piezas)
}

/** Opciones de los archivos entregables (Excel, PDF y presentación). */
export interface OpcionesEntregable {
  /** Agrega a «Solicitantes recurrentes» las fechas de cada entrega y lo que más se llevó además. */
  detalleRecurrentes?: boolean
  /** Estilo de las gráficas de barras y de pastel (PDF y presentación). */
  estiloBarras?: EstiloBarras
  estiloPastel?: EstiloPastel
}

/** «02/10, 08/10 y 15/10»: fechas cortas de las entregas de un caso recurrente. */
export function fechasCortas(r: Pick<SolicitanteRecurrente, 'detalle'>, maximo = 12): string {
  const f = r.detalle.map((d) => `${d.fecha.slice(8, 10)}/${d.fecha.slice(5, 7)}${d.cantidad > 1 ? ` (×${d.cantidad})` : ''}`)
  const mostrar = f.slice(-maximo)
  const resto = f.length - mostrar.length
  return (resto > 0 ? `${resto} antes… ` : '') + mostrar.join(', ')
}

/** «Tapones ×4, Guante Hyflex ×2»: lo que más se llevó además en esas entregas. */
export const otrosTexto = (r: Pick<SolicitanteRecurrente, 'otros'>, maximo = 3) =>
  r.otros
    .slice(0, maximo)
    .map((o) => `${o.material} ×${o.piezas}`)
    .join(', ')

/** Cambio de EPP contaminado (entrega marcada con su folio de formato, o anterior marcada por comentario). */
export interface EntregaContaminada {
  entrega: Entrega
  /** Folio del formato en papel; vacío en las marcadas antes solo con comentario. */
  folioFormato: string
  /** Material contaminado con sus piezas, p. ej. «Guante Hyflex M ×2». */
  materiales: string[]
  piezas: number
  actividad: string
  supervisor: string
  hora: string
  vistoBueno: string
}

/** Entregas del periodo que fueron cambio de EPP contaminado, de la más reciente a la más antigua. */
export function entregasContaminadas(entregas: Entrega[], materiales: Map<string, Material>, personal: Map<string, Trabajador>): EntregaContaminada[] {
  const r: EntregaContaminada[] = []
  for (const e of entregas) {
    if (e.estado !== 'registrada' || !esContaminada(e)) continue
    const ids = materialesContaminados(e)
    const lineas = e.lineas.filter((l) => ids.includes(l.materialId))
    if (!lineas.length) continue // el filtro del reporte dejó fuera el material contaminado
    const c = e.contaminado
    const trab = personal.get(e.rpe)
    r.push({
      entrega: e,
      folioFormato: c?.folio ?? '',
      materiales: lineas.map((l) => `${materiales.get(l.materialId)?.nombre ?? l.materialId}${l.varianteId ? ` ${l.varianteId}` : ''} ×${l.cantidad}`),
      piezas: lineas.reduce((s, l) => s + l.cantidad, 0),
      actividad: c?.actividad ?? '',
      supervisor: c?.supervisor || (trab?.supervisor ? `${trab.supervisor.nombre} (${trab.supervisor.rpe})` : ''),
      hora: c?.hora || e.hora,
      vistoBueno: c?.vistoBueno ?? '',
    })
  }
  return r.sort((a, b) => (a.entrega.ts < b.entrega.ts ? 1 : -1))
}

/** Totales de EPP contaminado por material y por área (piezas y eventos). */
export function resumenContaminado(lista: EntregaContaminada[], materiales: Map<string, Material>) {
  const porMaterial = new Map<string, { piezas: number; eventos: number }>()
  const porArea = new Map<string, { piezas: number; eventos: number; personas: Set<string> }>()
  for (const c of lista) {
    const ids = materialesContaminados(c.entrega)
    for (const id of new Set(ids)) {
      const piezas = c.entrega.lineas.filter((l) => l.materialId === id).reduce((s, l) => s + l.cantidad, 0)
      const nombre = materiales.get(id)?.nombre ?? id
      const x = porMaterial.get(nombre) ?? { piezas: 0, eventos: 0 }
      x.piezas += piezas
      x.eventos++
      porMaterial.set(nombre, x)
    }
    const a = porArea.get(c.entrega.area) ?? { piezas: 0, eventos: 0, personas: new Set<string>() }
    a.piezas += c.piezas
    a.eventos++
    a.personas.add(c.entrega.rpe)
    porArea.set(c.entrega.area, a)
  }
  return {
    porMaterial: [...porMaterial].sort((a, b) => b[1].piezas - a[1].piezas),
    porArea: [...porArea].sort((a, b) => b[1].piezas - a[1].piezas),
  }
}

/** Filtros del reporte. Vacío = todo. */
export interface FiltroReporte {
  areas?: string[]
  tipos?: TipoMaterial[]
  categorias?: string[]
  materiales?: string[]
}

export const NOMBRE_TIPO: Record<TipoMaterial, string> = { consumible: 'Consumible', resguardo: 'Resguardo', prestamo: 'Préstamo' }
export const tipoLinea = (l: LineaEntrega): TipoMaterial => (l.esResguardo ? 'resguardo' : l.esPrestamo ? 'prestamo' : 'consumible')

export function lineaPasa(l: LineaEntrega, fl: FiltroReporte, materiales: Map<string, Material>): boolean {
  if (fl.tipos?.length && !fl.tipos.includes(tipoLinea(l))) return false
  if (fl.materiales?.length && !fl.materiales.includes(l.materialId)) return false
  if (fl.categorias?.length && !fl.categorias.includes(materiales.get(l.materialId)?.categoriaId ?? '')) return false
  return true
}

/** Entregas registradas que pasan el filtro. Con tipo, categoría o material solo quedan esas líneas. */
export function aplicarFiltro(entregas: Entrega[], fl: FiltroReporte, materiales: Map<string, Material>): Entrega[] {
  const areas = fl.areas?.length ? new Set(fl.areas) : null
  const porLinea = !!(fl.tipos?.length || fl.categorias?.length || fl.materiales?.length)
  const r: Entrega[] = []
  for (const e of entregas) {
    if (e.estado !== 'registrada' || (areas && !areas.has(e.area))) continue
    if (!porLinea) {
      r.push(e)
      continue
    }
    const lineas = e.lineas.filter((l) => lineaPasa(l, fl, materiales))
    if (lineas.length) r.push(lineas.length === e.lineas.length ? e : { ...e, lineas })
  }
  return r
}

/** «Área: Taller · Tipo: Consumible · Categoría: Manos». Vacío sin filtros. */
export function describirFiltro(fl: FiltroReporte, materiales: Map<string, Material>, categorias: Categoria[] = []): string {
  const varios = (xs: string[], singular: string, plural: string) =>
    xs.length === 1 ? `${singular}: ${xs[0]}` : xs.length > 3 ? `${plural} (${xs.length})` : `${plural}: ${xs.join(', ')}`
  const partes: string[] = []
  if (fl.areas?.length) partes.push(varios(fl.areas.map(titulo), 'Área', 'Áreas'))
  if (fl.tipos?.length) partes.push(varios(fl.tipos.map((t) => NOMBRE_TIPO[t]), 'Tipo', 'Tipos'))
  if (fl.categorias?.length) partes.push(varios(fl.categorias.map((c) => categorias.find((x) => x.id === c)?.nombre ?? c), 'Categoría', 'Categorías'))
  if (fl.materiales?.length) partes.push(varios(fl.materiales.map((m) => materiales.get(m)?.nombre ?? m), 'Material', 'Materiales'))
  return partes.join(' · ')
}

/** Totales de un conjunto de entregas (para comparar contra el periodo anterior). */
export interface Totales {
  personas: number
  entregas: number
  piezas: number
  cascos: number
  recurrentes: number
  contaminado: number
  porMaterial: Map<string, number>
  porArea: Map<string, number>
}

export function totales(entregas: Entrega[], materiales: Map<string, Material>, personal: Map<string, Trabajador>): Totales {
  const porMaterial = new Map<string, number>()
  const porArea = new Map<string, number>()
  let piezas = 0
  for (const e of entregas) {
    for (const l of e.lineas) {
      piezas += l.cantidad
      porMaterial.set(l.materialId, (porMaterial.get(l.materialId) ?? 0) + l.cantidad)
      porArea.set(e.area, (porArea.get(e.area) ?? 0) + l.cantidad)
    }
  }
  return {
    personas: new Set(entregas.map((e) => e.rpe)).size,
    entregas: entregas.length,
    piezas,
    cascos: porMaterial.get('casco') ?? 0,
    recurrentes: solicitantesRecurrentes(entregas, materiales, personal).length,
    contaminado: entregasContaminadas(entregas, materiales, personal).length,
    porMaterial,
    porArea,
  }
}

/** Periodo inmediato anterior del mismo tamaño (meses completos → los meses anteriores). */
export function periodoAnterior(desde: string, hasta: string): [string, string] {
  const a = fechaD(desde)
  const b = fechaD(hasta)
  const finMes = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate()
  if (a.getDate() === 1 && b.getDate() === finMes) {
    const meses = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1
    return [fechaLocal(new Date(a.getFullYear(), a.getMonth() - meses, 1)), fechaLocal(new Date(a.getFullYear(), a.getMonth(), 0))]
  }
  const dias = Math.round((b.getTime() - a.getTime()) / 86400000) + 1
  return [fechaLocal(new Date(a.getFullYear(), a.getMonth(), a.getDate() - dias)), fechaLocal(new Date(a.getFullYear(), a.getMonth(), a.getDate() - 1))]
}

/** Variación en % contra el periodo anterior; null si antes no hubo nada. */
export const variacion = (actual: number, anterior: number): number | null => (anterior ? Math.round(((actual - anterior) / anterior) * 1000) / 10 : null)

/** «▲ 12.5%», «▼ 8%», «= 0%» o «nuevo». */
export function textoVariacion(actual: number, anterior: number): string {
  const v = variacion(actual, anterior)
  if (v === null) return actual ? 'nuevo' : '—'
  const n = Math.abs(v) >= 100 ? Math.round(Math.abs(v)) : Math.abs(v)
  return v > 0 ? `▲ ${n}%` : v < 0 ? `▼ ${n}%` : '= 0%'
}

export interface PuntoTendencia {
  etiqueta: string
  desde: string
  hasta: string
  personas: number
  entregas: number
  piezas: number
  contaminado: number
}

/** Cortes de la tendencia: 12 semanas (periodos de hasta 45 días) o 12 meses, terminando en «hasta». */
export function cortesTendencia(desde: string, hasta: string): { unidad: 'semana' | 'mes'; cortes: { etiqueta: string; desde: string; hasta: string }[] } {
  const b = fechaD(hasta)
  const dias = Math.round((b.getTime() - fechaD(desde).getTime()) / 86400000) + 1
  if (dias <= 45) {
    const lunes = new Date(b.getFullYear(), b.getMonth(), b.getDate() - ((b.getDay() + 6) % 7))
    return {
      unidad: 'semana',
      cortes: Array.from({ length: 12 }, (_, i) => {
        const ini = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() - 7 * (11 - i))
        const d1 = fechaLocal(ini)
        return { etiqueta: `S${semanaIso(d1)}`, desde: d1, hasta: fechaLocal(new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 6)) }
      }),
    }
  }
  return {
    unidad: 'mes',
    cortes: Array.from({ length: 12 }, (_, i) => {
      const ini = new Date(b.getFullYear(), b.getMonth() - (11 - i), 1)
      return { etiqueta: `${MESES[ini.getMonth()].slice(0, 3)} ${String(ini.getFullYear()).slice(2)}`, desde: fechaLocal(ini), hasta: fechaLocal(new Date(ini.getFullYear(), ini.getMonth() + 1, 0)) }
    }),
  }
}

/** Alerta priorizada para el cierre del reporte: alta (guinda), media (dorado) o buena noticia (verde). */
export interface Alerta {
  nivel: 'alta' | 'media' | 'ok'
  titulo: string
  accion: string
}

export interface DatosReporte {
  desde: string
  hasta: string
  titulo: string
  corto: string
  generado: string
  entregas: Entrega[]
  personas: number
  areas: number
  piezas: number
  materiales: MaterialReporte[]
  porArea: AreaReporte[]
  cascos: number
  personasConCasco: number
  areasSinCasco: string[]
  motivosCasco: [string, number][]
  porDia: { fecha: string; personas: number; piezas: number }[]
  reabastecer: { nombre: string; existencia: number; minimo: number }[]
  prestamosVencidos: Resguardo[]
  resguardosActivos: { nombre: string; cantidad: number }[]
  /** Solicitantes recurrentes del periodo (2 o más entregas del mismo material). */
  recurrentes: SolicitanteRecurrente[]
  /** Filtros aplicados y su descripción («Área: Taller · Tipo: Consumible»). */
  filtro: FiltroReporte
  filtroTexto: string
  /** Mismo cálculo en el periodo inmediato anterior. */
  anterior: Totales & { desde: string; hasta: string; titulo: string }
  tendencia: { unidad: 'semana' | 'mes'; puntos: PuntoTendencia[] }
  porCategoria: { id: string; nombre: string; piezas: number }[]
  porTipo: { tipo: TipoMaterial; nombre: string; piezas: number }[]
  /** Piezas por persona en cada área (áreas con 3 o más personas). */
  consumoPorPersona: { area: string; personas: number; piezas: number; porPersona: number }[]
  promedioPorPersona: number
  /** Personas con al menos un caso recurrente, por área. */
  recurrenciaPorArea: { area: string; casos: number; personas: number; personasArea: number; pct: number }[]
  /** Cuántos materiales concentran el 80% de las piezas. */
  pareto: { materiales: number; total: number }
  /** Cambios de EPP contaminado: totales del periodo y los últimos 10 folios hasta el fin del periodo. */
  contaminado: {
    eventos: number
    piezas: number
    personas: number
    porMaterial: { material: string; piezas: number; eventos: number }[]
    ultimos: EntregaContaminada[]
  }
  hallazgos: string[]
  /** Hallazgos y alertas más importantes con su acción sugerida (para el cierre). */
  alertas: Alerta[]
}

export interface Fuentes {
  entregas: Entrega[]
  movimientos: Movimiento[]
  resguardos: Resguardo[]
  materiales: Material[]
  motivos: Motivo[]
  ubicaciones: Ubicacion[]
  personal: Map<string, Trabajador>
  categorias?: Categoria[]
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0)
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'o', 'en', 'el', 'a', 'al'])
const SIGLAS = new Set(['CFE', 'DTM', 'PND', 'IPC', 'OSI', 'CNLV', 'SI', 'EPP'])
/** «OFICINA DE SEGURIDAD INDUSTRIAL» → «Oficina de Seguridad Industrial»; respeta siglas como DTM o CFE. */
const titulo = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => {
      const may = w.toUpperCase()
      if (i > 0 && CONECTORES.has(w)) return w
      if (SIGLAS.has(may) || (may.length <= 4 && !/[AEIOUÁÉÍÓÚ]/.test(may))) return may
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')

export function calcularReporte(f: Fuentes, desde: string, hasta: string, filtro: FiltroReporte | string = {}): DatosReporte {
  const fl: FiltroReporte = typeof filtro === 'string' ? (filtro ? { areas: [filtro] } : {}) : filtro
  const mats = new Map(f.materiales.map((m) => [m.id, m]))
  const motivos = new Map(f.motivos.map((m) => [m.id, m.texto]))
  const filtradas = aplicarFiltro(f.entregas, fl, mats)
  const entregas = filtradas.filter((e) => e.fecha >= desde && e.fecha <= hasta)
  const areasFiltro = fl.areas?.length ? new Set(fl.areas) : null
  const materialPasa = (m: Material) =>
    (!fl.materiales?.length || fl.materiales.includes(m.id)) && (!fl.categorias?.length || fl.categorias.includes(m.categoriaId)) && (!fl.tipos?.length || fl.tipos.includes(m.tipo))
  const personasSet = new Set(entregas.map((e) => e.rpe))

  // Por material
  const porMat = new Map<string, { piezas: number; personas: Set<string>; tallas: Map<string, number> }>()
  for (const e of entregas) {
    for (const l of e.lineas) {
      const x = porMat.get(l.materialId) ?? { piezas: 0, personas: new Set(), tallas: new Map() }
      x.piezas += l.cantidad
      x.personas.add(e.rpe)
      if (l.varianteId) x.tallas.set(l.varianteId, (x.tallas.get(l.varianteId) ?? 0) + l.cantidad)
      porMat.set(l.materialId, x)
    }
  }
  const materiales: MaterialReporte[] = [...porMat.entries()]
    .map(([id, x]) => ({ id, nombre: mats.get(id)?.nombre ?? id, piezas: x.piezas, personas: x.personas.size, tallas: [...x.tallas.entries()] }))
    .sort((a, b) => b.piezas - a.piezas)

  // Por área
  const porAreaMap = new Map<string, { personas: Set<string>; entregas: number; piezas: number; cascos: number; porMaterial: Record<string, number> }>()
  for (const e of entregas) {
    const a = porAreaMap.get(e.area) ?? { personas: new Set(), entregas: 0, piezas: 0, cascos: 0, porMaterial: {} }
    a.personas.add(e.rpe)
    a.entregas++
    for (const l of e.lineas) {
      a.piezas += l.cantidad
      a.porMaterial[l.materialId] = (a.porMaterial[l.materialId] ?? 0) + l.cantidad
      if (l.materialId === 'casco') a.cascos += l.cantidad
    }
    porAreaMap.set(e.area, a)
  }
  const porArea: AreaReporte[] = [...porAreaMap.entries()]
    .map(([nombre, a]) => ({ area: nombre, personas: a.personas.size, entregas: a.entregas, piezas: a.piezas, cascos: a.cascos, porMaterial: a.porMaterial }))
    .sort((a, b) => b.personas - a.personas || b.piezas - a.piezas)

  const casco = porMat.get('casco')
  const cascos = casco?.piezas ?? 0
  const personasConCasco = casco?.personas.size ?? 0
  const areasSinCasco = porArea.filter((a) => !a.cascos).map((a) => a.area)

  const motivosCascoMap = new Map<string, number>()
  for (const e of entregas) for (const l of e.lineas) if (l.materialId === 'casco') {
    const m = l.motivoId ? motivos.get(l.motivoId) ?? 'Sin motivo' : 'Sin motivo'
    motivosCascoMap.set(m, (motivosCascoMap.get(m) ?? 0) + l.cantidad)
  }
  const motivosCasco = [...motivosCascoMap.entries()].sort((a, b) => b[1] - a[1])

  const diaMap = new Map<string, { personas: Set<string>; piezas: number }>()
  for (const e of entregas) {
    const d = diaMap.get(e.fecha) ?? { personas: new Set(), piezas: 0 }
    d.personas.add(e.rpe)
    d.piezas += e.lineas.reduce((s, l) => s + l.cantidad, 0)
    diaMap.set(e.fecha, d)
  }
  const porDia = [...diaMap.entries()].sort().map(([fecha, d]) => ({ fecha, personas: d.personas.size, piezas: d.piezas }))

  // Situación actual del almacén y del equipo en resguardo
  const exist = calcularExistencias(f.movimientos)
  const ubis = f.ubicaciones.filter((u) => u.activo).map((u) => u.id)
  const reabastecer: DatosReporte['reabastecer'] = []
  for (const m of f.materiales.filter((x) => x.activo && materialPasa(x))) {
    for (const v of variantesDe(m)) {
      const n = existencia(exist, m.id, v, undefined, ubis)
      const min = m.stockMin[v] ?? 0
      if (nivelStock(n, min) > 0) reabastecer.push({ nombre: v ? `${m.nombre} ${v}` : m.nombre, existencia: n, minimo: min })
    }
  }
  const activos = f.resguardos.filter((r) => r.estatus === 'ACTIVO' && (!areasFiltro || areasFiltro.has(r.area)) && (!mats.get(r.materialId) || materialPasa(mats.get(r.materialId)!)))
  const resgPorMat = new Map<string, number>()
  for (const r of activos.filter((x) => x.tipo !== 'prestamo')) resgPorMat.set(r.materialId, (resgPorMat.get(r.materialId) ?? 0) + r.cantidad)
  const resguardosActivos = [...resgPorMat.entries()].map(([id, cantidad]) => ({ nombre: mats.get(id)?.nombre ?? id, cantidad }))

  // EPP contaminado: lo del periodo y los últimos folios (aunque sean de periodos anteriores)
  const contPeriodo = entregasContaminadas(entregas, mats, f.personal)
  const contHistoria = entregasContaminadas(
    filtradas.filter((e) => e.fecha <= hasta),
    mats,
    f.personal,
  )
  const contaminado: DatosReporte['contaminado'] = {
    eventos: contPeriodo.length,
    piezas: contPeriodo.reduce((s, c) => s + c.piezas, 0),
    personas: new Set(contPeriodo.map((c) => c.entrega.rpe)).size,
    porMaterial: resumenContaminado(contPeriodo, mats).porMaterial.map(([material, x]) => ({ material, ...x })),
    ultimos: contHistoria.slice(0, 10),
  }

  // Comparativo y tendencia
  const [antDesde, antHasta] = periodoAnterior(desde, hasta)
  const anterior = { ...totales(filtradas.filter((e) => e.fecha >= antDesde && e.fecha <= antHasta), mats, f.personal), desde: antDesde, hasta: antHasta, titulo: describirPeriodo(antDesde, antHasta).titulo }
  const { unidad, cortes } = cortesTendencia(desde, hasta)
  const puntos: PuntoTendencia[] = cortes.map((c) => {
    const ent = filtradas.filter((e) => e.fecha >= c.desde && e.fecha <= c.hasta)
    return {
      ...c,
      personas: new Set(ent.map((e) => e.rpe)).size,
      entregas: ent.length,
      piezas: ent.reduce((s, e) => s + e.lineas.reduce((t, l) => t + l.cantidad, 0), 0),
      contaminado: ent.filter((e) => esContaminada(e)).length,
    }
  })

  // Tipo de equipo
  const porCat = new Map<string, number>()
  const porTipoMap = new Map<TipoMaterial, number>()
  for (const e of entregas) for (const l of e.lineas) {
    const c = mats.get(l.materialId)?.categoriaId ?? 'otros'
    porCat.set(c, (porCat.get(c) ?? 0) + l.cantidad)
    porTipoMap.set(tipoLinea(l), (porTipoMap.get(tipoLinea(l)) ?? 0) + l.cantidad)
  }
  const nombreCat = (id: string) => f.categorias?.find((c) => c.id === id)?.nombre ?? id.charAt(0).toUpperCase() + id.slice(1)
  let porCategoria = [...porCat].map(([id, piezas]) => ({ id, nombre: nombreCat(id), piezas })).sort((a, b) => b.piezas - a.piezas)
  // Las categorías de menos del 3% se juntan en «Otras» para que la gráfica se lea
  const chicas = porCategoria.filter((c) => c.piezas < piezasTotalesCat(porCategoria) * 0.03)
  if (chicas.length > 1) porCategoria = [...porCategoria.filter((c) => !chicas.includes(c)), { id: 'otras', nombre: 'Otras', piezas: chicas.reduce((s, c) => s + c.piezas, 0) }]
  const porTipo = (['consumible', 'resguardo', 'prestamo'] as TipoMaterial[]).map((tipo) => ({ tipo, nombre: NOMBRE_TIPO[tipo], piezas: porTipoMap.get(tipo) ?? 0 })).filter((x) => x.piezas)

  // Consumo por persona y recurrencia por área
  const piezasTotales = materiales.reduce((s, m) => s + m.piezas, 0)
  const promedioPorPersona = personasSet.size ? Math.round((piezasTotales / personasSet.size) * 10) / 10 : 0
  const consumoPorPersona = porArea
    .filter((a) => a.personas >= 3)
    .map((a) => ({ area: a.area, personas: a.personas, piezas: a.piezas, porPersona: Math.round((a.piezas / a.personas) * 10) / 10 }))
    .sort((a, b) => b.porPersona - a.porPersona)
  const recurrentes = solicitantesRecurrentes(entregas, mats, f.personal)
  const recArea = new Map<string, { casos: number; personas: Set<string> }>()
  for (const r of recurrentes) {
    const x = recArea.get(r.area) ?? { casos: 0, personas: new Set<string>() }
    x.casos++
    x.personas.add(r.rpe)
    recArea.set(r.area, x)
  }
  const recurrenciaPorArea = [...recArea].map(([areaR, x]) => {
    const personasArea = porArea.find((a) => a.area === areaR)?.personas ?? x.personas.size
    return { area: areaR, casos: x.casos, personas: x.personas.size, personasArea, pct: pct(x.personas.size, personasArea) }
  }).sort((a, b) => b.casos - a.casos || b.pct - a.pct)

  // Pareto: cuántos materiales suman el 80% de las piezas
  let acumulado = 0
  let nPareto = 0
  for (const m of materiales) {
    if (acumulado >= piezasTotales * 0.8) break
    acumulado += m.piezas
    nPareto++
  }

  const d: DatosReporte = {
    desde,
    hasta,
    ...describirPeriodo(desde, hasta),
    generado: fechaLocal(),
    entregas,
    personas: personasSet.size,
    areas: porArea.length,
    piezas: materiales.reduce((s, m) => s + m.piezas, 0),
    materiales,
    porArea,
    cascos,
    personasConCasco,
    areasSinCasco,
    motivosCasco,
    porDia,
    reabastecer,
    prestamosVencidos: prestamosVencidos(activos, fechaLocal()),
    resguardosActivos,
    recurrentes,
    filtro: fl,
    filtroTexto: describirFiltro(fl, mats, f.categorias),
    anterior,
    tendencia: { unidad, puntos },
    porCategoria,
    porTipo,
    consumoPorPersona,
    promedioPorPersona,
    recurrenciaPorArea,
    pareto: { materiales: nPareto, total: materiales.length },
    contaminado,
    hallazgos: [],
    alertas: [],
  }
  d.hallazgos = hallazgos(d)
  d.alertas = alertas(d)
  return d
}

/**
 * Hallazgos y alertas más importantes, de mayor a menor prioridad, cada uno con una acción sugerida.
 * Reglas: aumentos contra el periodo anterior, EPP contaminado, consumo por persona alto,
 * solicitantes muy recurrentes, préstamos vencidos y material bajo el mínimo.
 */
export function alertas(d: DatosReporte): Alerta[] {
  const r: Alerta[] = []
  const a = d.anterior
  const ant = a.titulo.toLowerCase().startsWith('semana') ? 'la semana anterior' : `el periodo anterior (${a.titulo})`
  if (d.prestamosVencidos.length) {
    r.push({ nivel: 'alta', titulo: `${d.prestamosVencidos.length} préstamo${d.prestamosVencidos.length > 1 ? 's' : ''} de equipo sin devolver a tiempo.`, accion: 'Solicitar la devolución y revisar el estado del equipo.' })
  }
  if (d.contaminado.eventos) {
    const v = variacion(d.contaminado.eventos, a.contaminado)
    const sube = v === null || v > 0
    const mat = d.contaminado.porMaterial[0]
    r.push({
      nivel: sube ? 'alta' : 'media',
      titulo: `${d.contaminado.eventos} cambio${d.contaminado.eventos > 1 ? 's' : ''} de EPP contaminado (${textoVariacion(d.contaminado.eventos, a.contaminado)} contra ${ant})${mat ? `; el material más afectado fue ${mat.material.toLowerCase()} (${mat.piezas} pzas).` : '.'}`,
      accion: 'Revisar las actividades que originan la contaminación y reforzar el uso de EPP de sobreprotección.',
    })
  }
  const muy = d.recurrentes.filter((x) => x.veces >= 3)
  if (muy.length) {
    const top = [...muy].sort((x, y) => y.veces - x.veces)[0]
    const personas = new Set(muy.map((x) => x.rpe)).size
    r.push({
      nivel: top.veces >= 4 ? 'alta' : 'media',
      titulo: `${personas} persona${personas > 1 ? 's recibieron' : ' recibió'} el mismo material 3 o más veces; el caso más alto: ${titulo(top.nombre)} (${titulo(top.area)}), ${top.material.toLowerCase()} ${top.veces} veces.`,
      accion: 'Dar seguimiento al motivo con el supervisor de cada persona.',
    })
  }
  const vPiezas = variacion(d.piezas, a.piezas)
  if (vPiezas !== null && vPiezas >= 20) {
    r.push({
      nivel: vPiezas >= 50 ? 'alta' : 'media',
      titulo: `Las piezas entregadas subieron ${vPiezas}% contra ${ant} (${miles(a.piezas)} → ${miles(d.piezas)}).`,
      accion: d.personas > a.personas ? 'Se atendió a más personal; confirmar que las existencias alcancen el ritmo.' : 'Hubo más piezas por persona; revisar los motivos de entrega.',
    })
  }
  // Materiales que más subieron (al menos 10 piezas más y 30%)
  const subidas = d.materiales
    .map((m) => ({ m, antes: a.porMaterial.get(m.id) ?? 0 }))
    .filter(({ m, antes }) => antes && m.piezas - antes >= 10 && (m.piezas - antes) / antes >= 0.3)
    .sort((x, y) => (y.m.piezas - y.antes) / y.antes - (x.m.piezas - x.antes) / x.antes)
    .slice(0, 2)
  for (const { m, antes } of subidas) {
    r.push({ nivel: 'media', titulo: `${m.nombre}: ${miles(m.piezas)} piezas, ${textoVariacion(m.piezas, antes)} contra ${ant}.`, accion: `Confirmar los motivos de entrega y las existencias de ${m.nombre.toLowerCase()}.` })
  }
  // Áreas con consumo por persona alto
  const altas = d.areas > 1 ? d.consumoPorPersona.filter((x) => d.promedioPorPersona && x.porPersona >= d.promedioPorPersona * 1.5).slice(0, 3) : []
  if (altas.length) {
    r.push({
      nivel: 'media',
      titulo: `Consumo por persona alto en ${lista(altas.map((x) => `${titulo(x.area)} (${x.porPersona})`))}; el promedio es ${d.promedioPorPersona} piezas por persona.`,
      accion: 'Revisar con el supervisor del área el uso y el resguardo del EPP.',
    })
  }
  if (d.reabastecer.length) {
    const agotados = d.reabastecer.filter((x) => x.existencia <= 0)
    r.push({
      nivel: agotados.length ? 'alta' : 'media',
      titulo: `${d.reabastecer.length} material${d.reabastecer.length > 1 ? 'es' : ''} bajo el mínimo${agotados.length ? `, ${agotados.length} agotado${agotados.length > 1 ? 's' : ''}` : ''}: ${lista(d.reabastecer.slice(0, 3).map((x) => x.nombre))}${d.reabastecer.length > 3 ? '…' : '.'}`,
      accion: 'Solicitar el reabastecimiento.',
    })
  }
  // Buenas noticias: bajas importantes
  if (vPiezas !== null && vPiezas <= -20) r.push({ nivel: 'ok', titulo: `Las piezas entregadas bajaron ${Math.abs(vPiezas)}% contra ${ant}.`, accion: 'Mantener las medidas de control del EPP.' })
  if (a.contaminado && !d.contaminado.eventos) r.push({ nivel: 'ok', titulo: `Sin cambios de EPP contaminado (en ${ant} hubo ${a.contaminado}).`, accion: 'Mantener las medidas de protección.' })
  const orden = { alta: 0, media: 1, ok: 2 }
  return r.sort((x, y) => orden[x.nivel] - orden[y.nivel])
}

const miles = (n: number) => n.toLocaleString('es-MX')
const piezasTotalesCat = (xs: { piezas: number }[]) => xs.reduce((s, x) => s + x.piezas, 0)

/** Frases automáticas para la lámina de conclusiones. */
export function hallazgos(d: DatosReporte): string[] {
  if (!d.personas) return []
  const h: string[] = []
  const personasDe = (...ids: string[]) => {
    const s = new Set<string>()
    for (const e of d.entregas) if (e.lineas.some((l) => ids.includes(l.materialId))) s.add(e.rpe)
    return s.size
  }
  const carnaza = pct(personasDe('g_carnaza'), d.personas)
  const hyflex = pct(personasDe('g_hyflex'), d.personas)
  if (carnaza || hyflex) h.push(`El ${carnaza}% del personal atendido recibió guantes de carnaza y el ${hyflex}% guantes Hyflex.`)
  const ocular = pct(personasDe('lentes_claros', 'lentes_oscuros', 'cubre_lentes'), d.personas)
  if (ocular) h.push(`El ${ocular}% del personal solicitó protección ocular (lentes de seguridad o cubrelentes).`)
  if (d.porArea.length) {
    const top = d.porArea[0]
    h.push(`${titulo(top.area)} concentró el ${pct(top.personas, d.personas)}% del personal atendido.`)
    if (d.porArea.length > 2) h.push(`Las áreas con mayor afluencia fueron ${lista(d.porArea.slice(0, 3).map((a) => titulo(a.area)))}.`)
  }
  if (d.cascos) {
    h.push(`El ${pct(d.personasConCasco, d.personas)}% del personal solicitó casco; el resto ya contaba con uno de algún contrato anterior.`)
    const topCasco = [...d.porArea].sort((a, b) => b.cascos - a.cascos)[0]
    if (topCasco?.cascos) h.push(`${titulo(topCasco.area)} concentra el ${pct(topCasco.cascos, d.cascos)}% de los cascos entregados.`)
    if (d.motivosCasco.length) {
      const [motivo, n] = d.motivosCasco[0]
      h.push(`El motivo más frecuente de entrega de casco fue «${motivo}» (${pct(n, d.cascos)}%).`)
    }
  }
  const muyRecurrentes = d.recurrentes.filter((r) => r.veces >= 3)
  if (muyRecurrentes.length) {
    const top = [...muyRecurrentes].sort((a, b) => b.veces - a.veces)[0]
    const personas = new Set(muyRecurrentes.map((r) => r.rpe)).size
    h.push(`${personas} persona${personas > 1 ? 's recibieron' : ' recibió'} el mismo material 3 o más veces; el caso más alto es ${titulo(top.nombre)} (${titulo(top.area)}) con ${top.material.toLowerCase()} en ${top.veces} entregas.`)
  }
  if (d.contaminado.eventos) h.push(`Se registraron ${d.contaminado.eventos} cambio${d.contaminado.eventos > 1 ? 's' : ''} de EPP contaminado (${d.contaminado.piezas} pieza${d.contaminado.piezas > 1 ? 's' : ''}).`)
  if (d.prestamosVencidos.length) h.push(`Hay ${d.prestamosVencidos.length} préstamo${d.prestamosVencidos.length > 1 ? 's' : ''} de equipo de altura sin devolver a tiempo.`)
  if (d.reabastecer.length) h.push(`${d.reabastecer.length} material${d.reabastecer.length > 1 ? 'es están' : ' está'} por debajo del mínimo y requiere${d.reabastecer.length > 1 ? 'n' : ''} reabastecimiento.`)
  return h
}

/**
 * Texto para desglosar «Otras áreas» de la gráfica de pastel de cascos:
 * «Mantenimiento 12 (3.1%), Química 9 (2.3%)… y 4 áreas más (6).». Vacío si no hay otras áreas.
 */
export function desgloseOtrasAreas(otras: Pick<AreaReporte, 'area' | 'cascos'>[], total: number, maximo = 8): string {
  if (!otras.length) return ''
  const mostrar = otras.slice(0, maximo)
  const resto = otras.slice(maximo)
  const partes = mostrar.map((a) => `${titulo(a.area)} ${a.cascos} (${pct(a.cascos, total)}%)`)
  if (resto.length) partes.push(`y ${resto.length} área${resto.length > 1 ? 's' : ''} más (${resto.reduce((s, a) => s + a.cascos, 0)})`)
  return partes.join(', ') + '.'
}

export { pct, titulo }
