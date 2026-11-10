import type { Entrega } from './types'

// ---------------- EPP contaminado ----------------
// Cada cambio de EPP contaminado se respalda con el formato en papel «Reporte de equipo de
// protección personal contaminado», que lleva un folio impreso (U1-SI-2026-003). Al despachar
// se marca la casilla y se anota ese folio; el resto de los datos queda en el papel.

export type UnidadFolio = 'U1' | 'U2'
export const UNIDADES_FOLIO: UnidadFolio[] = ['U1', 'U2']

/** Texto con que se marcaba antes (comentario rápido del aviso de recurrencia). */
export const NOTA_CONTAMINADO = 'EPP Contaminado'

export function formatoFolioContaminado(unidad: UnidadFolio, n: number, anio: number): string {
  return `${unidad}-SI-${anio}-${String(n).padStart(3, '0')}`
}

/**
 * Interpreta lo que se escribe o se lee con el escáner: «3», «003», «U1-SI-2026-3»,
 * «u2 si 2026 015»… Devuelve el folio con formato oficial o '' si no se entiende.
 */
export function normalizarFolioContaminado(texto: string, unidad: UnidadFolio, anio: number): string {
  const t = texto.trim().toUpperCase()
  if (!t) return ''
  const solo = /^(\d{1,4})$/.exec(t)
  if (solo) return Number(solo[1]) > 0 ? formatoFolioContaminado(unidad, Number(solo[1]), anio) : ''
  const completo = /^(U[12])[\s\-_/]*SI[\s\-_/]*(\d{4})[\s\-_/]*(\d{1,4})$/.exec(t)
  if (completo && Number(completo[3]) > 0) return formatoFolioContaminado(completo[1] as UnidadFolio, Number(completo[3]), Number(completo[2]))
  return ''
}

/** Partes de un folio oficial, o null si no lo es. */
export function partesFolio(folio: string): { unidad: UnidadFolio; anio: number; n: number } | null {
  const m = /^(U[12])-SI-(\d{4})-(\d{3,4})$/.exec(folio)
  return m ? { unidad: m[1] as UnidadFolio, anio: Number(m[2]), n: Number(m[3]) } : null
}

/** ¿La entrega fue un cambio de EPP contaminado? Incluye las marcadas antes solo con comentario. */
export function esContaminada(e: Entrega): boolean {
  return !!e.contaminado || e.recurrencia?.nota === NOTA_CONTAMINADO || /contaminad/i.test(e.observaciones)
}

/** Materiales contaminados de la entrega (las anteriores sin detalle: los recurrentes o todos). */
export function materialesContaminados(e: Entrega): string[] {
  if (e.contaminado) return e.contaminado.materiales
  if (!esContaminada(e)) return []
  return e.recurrencia?.materiales.length ? e.recurrencia.materiales : [...new Set(e.lineas.map((l) => l.materialId))]
}

/** ¿Ese material se cambió por contaminación en esa entrega? (no cuenta como sobreconsumo) */
export const contaminadoEn = (e: Entrega, materialId: string) => materialesContaminados(e).includes(materialId)

/** Entrega vigente que ya usa ese folio de formato. */
export function entregaConFolio(entregas: Entrega[], folio: string, excepto = ''): Entrega | undefined {
  return entregas.find((e) => e.estado === 'registrada' && e.id !== excepto && e.contaminado?.folio === folio)
}

/** Número más alto ya capturado para esa unidad y año (para seguir la numeración al imprimir). */
export function ultimoFolioCapturado(entregas: Entrega[], unidad: UnidadFolio, anio: number): number {
  let max = 0
  for (const e of entregas) {
    const p = e.contaminado && partesFolio(e.contaminado.folio)
    if (p && p.unidad === unidad && p.anio === anio && p.n > max) max = p.n
  }
  return max
}

/**
 * Folios del año que no aparecen capturados en ningún despacho, del 1 al `hasta`
 * (el último impreso o capturado): formatos que siguen en blanco, se perdieron o faltan por capturar.
 */
export function foliosSinCapturar(entregas: Entrega[], unidad: UnidadFolio, anio: number, hasta: number): string[] {
  const usados = new Set<number>()
  for (const e of entregas) {
    if (e.estado !== 'registrada') continue
    const p = e.contaminado && partesFolio(e.contaminado.folio)
    if (p && p.unidad === unidad && p.anio === anio) usados.add(p.n)
  }
  const r: string[] = []
  for (let n = 1; n <= hasta; n++) if (!usados.has(n)) r.push(formatoFolioContaminado(unidad, n, anio))
  return r
}

/** Clave del último folio impreso en este equipo (Formatos para imprimir). */
export const claveFolioImpreso = (u: UnidadFolio) => `folio_contaminado_${u}`
