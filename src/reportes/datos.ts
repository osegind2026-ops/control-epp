import { calcularExistencias, existencia, nivelStock, prestamosVencidos, tipoDe, TIPOS_TRABAJADOR, variantesDe } from '../domain/logica'
import type { Entrega, Material, Motivo, Movimiento, Resguardo, Trabajador, Ubicacion } from '../domain/types'
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
    for (const l of e.lineas) if (!l.esResguardo && !l.esPrestamo) porMaterial.set(l.materialId, (porMaterial.get(l.materialId) ?? 0) + l.cantidad)
    for (const [materialId, cantidad] of porMaterial) {
      const k = `${e.area}|${materialId}|${e.rpe}`
      const p = personal.get(e.rpe)
      const x = mapa.get(k) ?? {
        area: e.area, materialId, material: materiales.get(materialId)?.nombre ?? materialId, rpe: e.rpe, nombre: e.nombre,
        tipo: p ? TIPOS_TRABAJADOR[tipoDe(p)] : '', veces: 0, piezas: 0, primera: e.fecha, ultima: e.fecha, notas: [], entregaIds: [],
      }
      x.veces++
      x.piezas += cantidad
      if (e.fecha < x.primera) x.primera = e.fecha
      if (e.fecha > x.ultima) x.ultima = e.fecha
      if (e.recurrencia?.nota && e.recurrencia.materiales.includes(materialId) && !x.notas.includes(e.recurrencia.nota)) x.notas.push(e.recurrencia.nota)
      x.entregaIds.push(e.id)
      mapa.set(k, x)
    }
  }
  return [...mapa.values()]
    .filter((x) => x.veces >= minimo)
    .sort((a, b) => a.area.localeCompare(b.area) || a.material.localeCompare(b.material) || b.veces - a.veces || b.piezas - a.piezas)
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
  hallazgos: string[]
}

export interface Fuentes {
  entregas: Entrega[]
  movimientos: Movimiento[]
  resguardos: Resguardo[]
  materiales: Material[]
  motivos: Motivo[]
  ubicaciones: Ubicacion[]
  personal: Map<string, Trabajador>
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

export function calcularReporte(f: Fuentes, desde: string, hasta: string, area = ''): DatosReporte {
  const mats = new Map(f.materiales.map((m) => [m.id, m]))
  const motivos = new Map(f.motivos.map((m) => [m.id, m.texto]))
  const entregas = f.entregas.filter((e) => e.estado === 'registrada' && e.fecha >= desde && e.fecha <= hasta && (!area || e.area === area))
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
  for (const m of f.materiales.filter((x) => x.activo)) {
    for (const v of variantesDe(m)) {
      const n = existencia(exist, m.id, v, undefined, ubis)
      const min = m.stockMin[v] ?? 0
      if (nivelStock(n, min) > 0) reabastecer.push({ nombre: v ? `${m.nombre} ${v}` : m.nombre, existencia: n, minimo: min })
    }
  }
  const activos = f.resguardos.filter((r) => r.estatus === 'ACTIVO')
  const resgPorMat = new Map<string, number>()
  for (const r of activos.filter((x) => x.tipo !== 'prestamo')) resgPorMat.set(r.materialId, (resgPorMat.get(r.materialId) ?? 0) + r.cantidad)
  const resguardosActivos = [...resgPorMat.entries()].map(([id, cantidad]) => ({ nombre: mats.get(id)?.nombre ?? id, cantidad }))

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
    recurrentes: solicitantesRecurrentes(entregas, mats, f.personal),
    hallazgos: [],
  }
  d.hallazgos = hallazgos(d)
  return d
}

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
  if (d.prestamosVencidos.length) h.push(`Hay ${d.prestamosVencidos.length} préstamo${d.prestamosVencidos.length > 1 ? 's' : ''} de equipo de altura sin devolver a tiempo.`)
  if (d.reabastecer.length) h.push(`${d.reabastecer.length} material${d.reabastecer.length > 1 ? 'es están' : ' está'} por debajo del mínimo y requiere${d.reabastecer.length > 1 ? 'n' : ''} reabastecimiento.`)
  return h
}

export { pct, titulo }
