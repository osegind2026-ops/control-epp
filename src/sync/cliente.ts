import { LLAVE, TABLAS, type BaseEPP, type NombreTabla } from '../db/db'
import { ganaEntrante } from '../domain/fusion'

// Motor de sincronización con el servidor de Apps Script.
// Funciona «primero local»: todo se guarda en el equipo y aquí solo se suben los
// registros marcados como pendientes (`_mod` > 0) y se bajan los que el servidor
// tiene con un número de revisión mayor al último recibido (`cursor`).

export interface ConfigNube {
  url: string
  equipoId: string
  token: string
  cursor: number
  ultimaSync?: string
}

export class ErrorNube extends Error {
  /** true si reintentar no sirve (clave o URL incorrecta, equipo dado de baja). */
  permanente: boolean
  constructor(mensaje: string, permanente = false) {
    super(mensaje)
    this.permanente = permanente
  }
}

export type Transporte = (url: string, cuerpo: unknown) => Promise<unknown>

interface Respuesta {
  ok: boolean
  error?: string
  [k: string]: unknown
}

/**
 * Apps Script responde con una redirección a googleusercontent.com; `fetch` la
 * sigue sola. Se envía como text/plain para evitar la verificación CORS previa.
 */
export const transporteFetch: Transporte = async (url, cuerpo) => {
  let r: Response
  try {
    r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo), redirect: 'follow' })
  } catch {
    throw new ErrorNube('Sin conexión con el servidor.')
  }
  if (!r.ok) throw new ErrorNube(`El servidor respondió con el código ${r.status}.`, r.status === 404)
  try {
    return await r.json()
  } catch {
    throw new ErrorNube('La URL no corresponde a la aplicación web del servidor (debe terminar en /exec).', true)
  }
}

const ERRORES_PERMANENTES = /clave|autorizado|registrado|dado de baja|configurado|código/i

async function llamar(t: Transporte, url: string, cuerpo: unknown): Promise<Respuesta> {
  const d = (await t(url, cuerpo)) as Respuesta
  if (!d || typeof d !== 'object') throw new ErrorNube('Respuesta vacía del servidor.')
  if (!d.ok) throw new ErrorNube(d.error ?? 'Error del servidor.', ERRORES_PERMANENTES.test(d.error ?? ''))
  return d
}

export async function probarServidor(t: Transporte, url: string): Promise<string> {
  const d = await llamar(t, url, { accion: 'ping' })
  if (d.app !== 'control-epp') throw new ErrorNube('La URL no es del servidor de Control EPP.', true)
  return String(d.version)
}

export async function registrarEquipo(t: Transporte, url: string, clave: string, equipo: { id: string; codigo: string; nombre: string }): Promise<string> {
  const d = await llamar(t, url, { accion: 'registrar', clave, equipo })
  return String(d.token)
}

// ---------- Cambios locales ----------

interface Cambio {
  tabla: string
  id: string
  borrado?: boolean
  datos?: unknown
}
interface Marca {
  tabla: NombreTabla | 'bajas'
  llave: string
  mod: number
}

type Fila = Record<string, unknown> & { _mod?: number }

function limpio(obj: Fila): Record<string, unknown> {
  const { _mod: _m, ...resto } = obj
  return resto
}

async function recolectar(base: BaseEPP, omitir: Set<string> = new Set(), maxItems = 300, maxCaracteres = 1_500_000): Promise<{ cambios: Cambio[]; marcas: Marca[] }> {
  const cambios: Cambio[] = []
  const marcas: Marca[] = []
  let caracteres = 0
  // Primero catálogos, al final lo transaccional (así el servidor ya conoce los nombres)
  for (const tabla of TABLAS) {
    if (cambios.length >= maxItems || caracteres >= maxCaracteres) break
    if (omitir.has(tabla)) continue
    const filas = (await base.table(tabla).where('_mod').above(0).toArray()) as Fila[]
    for (const f of filas) {
      if (cambios.length >= maxItems || caracteres >= maxCaracteres) break
      const datos = limpio(f)
      const llave = String(f[LLAVE[tabla]])
      caracteres += JSON.stringify(datos).length
      cambios.push({ tabla, id: llave, datos })
      marcas.push({ tabla, llave, mod: f._mod! })
    }
  }
  const bajas = await base.bajas.where('_mod').above(0).toArray()
  for (const b of bajas) {
    if (omitir.has(b.tabla)) continue
    cambios.push({ tabla: b.tabla, id: b.registroId, borrado: true })
    marcas.push({ tabla: 'bajas', llave: b.id, mod: (b as unknown as Fila)._mod! })
  }
  return { cambios, marcas }
}

/** Quita la marca de pendiente a lo que el servidor ya recibió (si no cambió mientras tanto). */
async function confirmarSubidos(base: BaseEPP, marcas: Marca[]): Promise<void> {
  const porTabla = new Map<string, Marca[]>()
  for (const m of marcas) porTabla.set(m.tabla, [...(porTabla.get(m.tabla) ?? []), m])
  for (const [tabla, lista] of porTabla) {
    const t = base.table(tabla)
    await base.transaction('rw', t, async () => {
      const actuales = (await t.bulkGet(lista.map((m) => m.llave))) as (Fila | undefined)[]
      if (tabla === 'bajas') {
        await t.bulkDelete(lista.filter((m, i) => actuales[i]?._mod === m.mod).map((m) => m.llave))
        return
      }
      const listos = actuales.filter((f, i): f is Fila => !!f && f._mod === lista[i].mod).map((f) => ({ ...f, _remoto: true }))
      if (listos.length) await t.bulkPut(listos)
    })
  }
}

export async function contarPendientes(base: BaseEPP, omitir: Set<string> = new Set()): Promise<number> {
  let n = (await base.bajas.where('_mod').above(0).toArray()).filter((b) => !omitir.has(b.tabla)).length
  for (const t of TABLAS) if (!omitir.has(t)) n += await base.table(t).where('_mod').above(0).count()
  return n
}

/** Marca todo lo local como pendiente (al conectar por primera vez un equipo que ya tenía datos). */
export async function marcarTodoPendiente(base: BaseEPP): Promise<void> {
  for (const t of TABLAS) await base.table(t).toCollection().modify((f: Fila) => void (f._mod = -1))
}

// ---------- Cambios remotos ----------

interface FilaRemota {
  tabla: NombreTabla
  id: string
  rev: number
  borrado: boolean
  datos: Record<string, unknown> | null
}

async function aplicarRemotos(base: BaseEPP, filas: FilaRemota[]): Promise<Set<string>> {
  const afectadas = new Set<string>()
  const porTabla = new Map<NombreTabla, FilaRemota[]>()
  for (const f of filas) {
    if (!(TABLAS as readonly string[]).includes(f.tabla)) continue
    porTabla.set(f.tabla, [...(porTabla.get(f.tabla) ?? []), f])
  }
  for (const [tabla, lista] of porTabla) {
    const t = base.table(tabla)
    await base.transaction('rw', t, async () => {
      const locales = (await t.bulkGet(lista.map((f) => f.id))) as (Fila | undefined)[]
      const poner: Fila[] = []
      const quitar: string[] = []
      lista.forEach((f, i) => {
        const local = locales[i]
        if (f.borrado || !f.datos) {
          if (local) quitar.push(f.id)
          return
        }
        // Un cambio local aún sin subir se conserva si el servidor lo aceptaría
        if (local && (local._mod ?? 0) > 0 && ganaEntrante(tabla, f.datos, limpio(local))) return
        poner.push({ ...f.datos, _remoto: true })
      })
      if (poner.length) await t.bulkPut(poner)
      if (quitar.length) await t.bulkDelete(quitar)
      if (poner.length || quitar.length) afectadas.add(tabla)
    })
  }
  return afectadas
}

// ---------- Ciclo completo ----------

export interface ResultadoSync {
  subidos: number
  bajados: number
  afectadas: Set<string>
  errores: string[]
  cursor: number
}

export async function sincronizar(base: BaseEPP, cfg: ConfigNube, t: Transporte, alAvanzar?: (texto: string) => void): Promise<ResultadoSync> {
  const r: ResultadoSync = { subidos: 0, bajados: 0, afectadas: new Set(), errores: [], cursor: cfg.cursor }
  // Tablas que el servidor aún no conoce (servidor sin actualizar): quedan pendientes para después
  const desconocidas = new Set<string>()
  for (let vuelta = 0; vuelta < 200; vuelta++) {
    const { cambios, marcas } = await recolectar(base, desconocidas)
    const d = await llamar(t, cfg.url, { accion: 'sync', equipoId: cfg.equipoId, token: cfg.token, cursor: r.cursor, cambios })
    for (const e of (d.errores ?? []) as string[]) {
      const m = /Tabla desconocida: (\w+)/.exec(e)
      if (m) desconocidas.add(m[1])
    }
    await confirmarSubidos(base, marcas.filter((m) => !desconocidas.has(m.tabla === 'bajas' ? m.llave.split(':')[0] : m.tabla)))
    r.subidos += cambios.length
    const filas = (d.filas ?? []) as FilaRemota[]
    for (const a of await aplicarRemotos(base, filas)) r.afectadas.add(a)
    r.bajados += filas.length
    r.errores.push(...((d.errores ?? []) as string[]).filter((e) => !/Tabla desconocida/.test(e)))
    r.cursor = Number(d.cursor)
    alAvanzar?.(`${r.subidos} enviados · ${r.bajados} recibidos`)
    if (!d.hayMas && (await contarPendientes(base, desconocidas)) === 0) break
    if (!d.hayMas && !cambios.length) break
  }
  if (desconocidas.size) r.errores.push('El servidor de Google necesita actualizarse (versión 2.2) para guardar los equipos a resguardo; mientras tanto quedan en este equipo.')
  return r
}
