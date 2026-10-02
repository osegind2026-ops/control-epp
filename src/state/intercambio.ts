import { guardarConfig, leerConfig, type NombreTabla } from '../db/db'
import type { Entrega } from '../domain/types'
import { fechaLocal, horaLocal } from '../lib/util'
import { avisarCambioLocal } from './nube'
import { armarRespaldo, importarRespaldo, leerRespaldo, type Respaldo } from './respaldo'
import * as S from './store'

// Intercambio por archivo entre los dos «mundos» que no se ven entre sí: los celulares
// (sincronizados con Google) y las PCs de la carpeta de red (sin acceso a Apps Script).
// Es un respaldo completo que se COMBINA con las mismas reglas de la sincronización,
// así que nada se duplica ni se pierde; lo recibido se sube solo a la nube o a la carpeta.

export interface UltimoIntercambio {
  fecha: string
  tipo: 'recibido' | 'enviado'
  otro: string // código del equipo del otro lado
}

export interface ResultadoIntercambio {
  origen: string
  nuevos: Partial<Record<NombreTabla, number>>
  actualizados: number
  /** Folios del archivo que ya existen aquí con otro registro: dos equipos usan el mismo código. */
  foliosRepetidos: string[]
}

const NOMBRES: Partial<Record<NombreTabla, [string, string]>> = {
  entregas: ['entrega', 'entregas'],
  movimientos: ['movimiento de almacén', 'movimientos de almacén'],
  resguardos: ['resguardo o préstamo', 'resguardos y préstamos'],
  personal: ['trabajador', 'trabajadores'],
  materiales: ['material', 'materiales'],
  equipos: ['equipo a resguardo', 'equipos a resguardo'],
  prestamosEquipo: ['préstamo de equipo', 'préstamos de equipo'],
  usuarios: ['usuario', 'usuarios'],
  fotos: ['foto', 'fotos'],
}

export function describirNuevos(n: ResultadoIntercambio['nuevos']): string[] {
  return (Object.keys(n) as NombreTabla[])
    .filter((t) => (n[t] ?? 0) > 0)
    .map((t) => {
      const [uno, varios] = NOMBRES[t] ?? ['registro', 'registros']
      return `${n[t]} ${n[t] === 1 ? uno : varios}`
    })
}

export async function leerUltimoIntercambio(): Promise<UltimoIntercambio | null> {
  return leerConfig<UltimoIntercambio | null>('ultimoIntercambio', null)
}

/** Archivo con todo lo de este equipo, para cargarlo del otro lado. */
export async function generarIntercambio(): Promise<{ nombre: string; blob: Blob }> {
  const r = await armarRespaldo()
  const codigo = r.equipoOrigen?.codigo ?? 'EQ'
  const ahora = new Date()
  const nombre = `Intercambio EPP ${codigo} ${fechaLocal(ahora)} ${horaLocal(ahora).replace(':', '')}.json`
  await guardarConfig('ultimoIntercambio', { fecha: ahora.toISOString(), tipo: 'enviado', otro: '' } satisfies UltimoIntercambio)
  return { nombre, blob: new Blob([JSON.stringify(r)], { type: 'application/json' }) }
}

/** Folios que vienen en el archivo con un id distinto al de aquí (mismo código en dos equipos). */
export function detectarFoliosRepetidos(locales: Pick<Entrega, 'id' | 'folio'>[], externos: Pick<Entrega, 'id' | 'folio'>[]): string[] {
  const porFolio = new Map(locales.map((e) => [e.folio, e.id]))
  return externos.filter((e) => porFolio.has(e.folio) && porFolio.get(e.folio) !== e.id).map((e) => e.folio)
}

export async function recibirIntercambio(texto: string): Promise<ResultadoIntercambio> {
  const r: Respaldo = leerRespaldo(texto)
  const foliosRepetidos = detectarFoliosRepetidos(S.entregas.value, (r.datos.entregas ?? []) as Entrega[])
  const res = await importarRespaldo(r, 'combinar')
  const origen = r.equipoOrigen?.codigo ?? '¿?'
  await guardarConfig('ultimoIntercambio', { fecha: new Date().toISOString(), tipo: 'recibido', otro: origen } satisfies UltimoIntercambio)
  // Lo recibido queda pendiente de subir: se manda a Google o a la carpeta de red
  avisarCambioLocal()
  return { origen, nuevos: res.agregados, actualizados: res.actualizados, foliosRepetidos }
}
