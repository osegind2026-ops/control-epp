import { db } from '../db/db'
import { avisarCambioLocal } from './nube'
import { ErrorNegocio } from './servicios'
import * as S from './store'

/**
 * Consecutivo de los formatos impresos (EPP contaminado, resguardo económico, registro de entrega).
 * Se guarda en los ajustes compartidos (se sincronizan con todas las PCs y celulares), un renglón
 * por equipo para que dos equipos nunca se pisen: el último impreso es el mayor de todos.
 * Reimprimir un folio anterior nunca hace retroceder el consecutivo.
 */
export type SerieFolio = 'contaminado-U1' | 'contaminado-U2' | 'resguardo' | 'registro'

const PREFIJO = 'folioImpreso'
const idAjuste = (serie: SerieFolio, anio: number, equipo: string) => `${PREFIJO}|${serie}|${anio}|${equipo}`

/** Lo que se llevaba solo en este equipo antes de la 2.22.0 (todo era de 2026). */
const CLAVE_ANTERIOR: Record<SerieFolio, string | null> = {
  'contaminado-U1': 'folio_contaminado_U1',
  'contaminado-U2': 'folio_contaminado_U2',
  resguardo: 'ultimo_folio_resguardo_economico',
  registro: null,
}
const ANIO_ANTERIOR = 2026

export interface UltimoImpreso {
  /** 0 = nunca se ha impreso. */
  ultimo: number
  /** Equipo que lo imprimió y cuándo (si se sabe). */
  equipo?: string
  fecha?: string
}

/** Mayor folio impreso de la serie en cualquier equipo (más el que llevaba este equipo antes). */
export function ultimoImpreso(ajustes: Map<string, unknown>, serie: SerieFolio, anio: number, anterior = 0): number {
  const pref = `${PREFIJO}|${serie}|${anio}|`
  let mx = anio === ANIO_ANTERIOR ? anterior : 0
  for (const [id, v] of ajustes) if (id.startsWith(pref) && typeof v === 'number' && v > mx) mx = v
  return mx
}

/** Último impreso con el equipo y la fecha, para mostrarlo en pantalla. */
export async function detalleUltimo(serie: SerieFolio, anio: number): Promise<UltimoImpreso> {
  const pref = `${PREFIJO}|${serie}|${anio}|`
  const filas = (await db.ajustes.toArray()).filter((a) => a.id.startsWith(pref) && typeof a.valor === 'number')
  let mejor: UltimoImpreso = { ultimo: await anteriorLocal(serie, anio) }
  for (const a of filas) if ((a.valor as number) > mejor.ultimo) mejor = { ultimo: a.valor as number, equipo: a.id.slice(pref.length), fecha: a.actualizado }
  return mejor
}

/** Consecutivo que este equipo llevaba solo para sí antes de compartirse. */
export async function anteriorLocal(serie: SerieFolio, anio: number): Promise<number> {
  const clave = CLAVE_ANTERIOR[serie]
  if (!clave || anio !== ANIO_ANTERIOR) return 0
  const fila = await db.config.get(clave)
  return typeof fila?.valor === 'number' ? fila.valor : 0
}

/**
 * Anota que se imprimieron los folios `desde`–`hasta`. Solo avanza: si es una reimpresión de
 * folios ya impresos, el consecutivo se queda donde estaba. Devuelve el último impreso resultante.
 */
export async function registrarImpresion(serie: SerieFolio, anio: number, desde: number, hasta: number): Promise<number> {
  if (!S.sesion.value) throw new ErrorNegocio('Inicie sesión con su PIN.')
  const equipo = S.dispositivo.value?.codigo
  if (!equipo) throw new ErrorNegocio('Configure el equipo antes de imprimir.')
  if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 1 || hasta < desde) throw new ErrorNegocio('Revise el folio inicial y la cantidad.')
  const id = idAjuste(serie, anio, equipo)
  const propio = await db.ajustes.get(id)
  const actual = typeof propio?.valor === 'number' ? propio.valor : 0
  if (hasta > actual) {
    await db.ajustes.put({ id, valor: hasta, actualizado: new Date().toISOString() })
    await S.recargar('ajustes')
    avisarCambioLocal()
  }
  return Math.max(ultimoImpreso(S.ajustes.value, serie, anio, await anteriorLocal(serie, anio)), hasta)
}
