import { signal } from '@preact/signals'
import { db, guardarConfig, leerConfig } from '../db/db'
import type { Dispositivo } from '../domain/types'
import { nuevoId } from '../lib/util'
import {
  contarPendientes,
  ErrorNube,
  marcarTodoPendiente,
  probarServidor,
  registrarEquipo,
  sincronizar,
  transporteFetch,
  type ConfigNube,
} from '../sync/cliente'
import * as S from './store'

// Estado de la conexión con la nube (Google Sheets) y sincronización automática.

export type EstadoNube = 'desconectado' | 'sincronizando' | 'al-dia' | 'pendiente' | 'sin-red' | 'error'

export const nube = signal<ConfigNube | null>(null)
export const estadoNube = signal<EstadoNube>('desconectado')
export const pendientesNube = signal(0)
export const errorNube = signal('')
export const progresoNube = signal('')

const CADA_MS = 3 * 60 * 1000 // revisión periódica
const TRAS_CAMBIO_MS = 4000 // espera tras un cambio local, para juntar varios

let enCurso: Promise<void> | null = null
let temporizador: number | undefined
let reintentos = 0

async function guardarNube(cfg: ConfigNube | null): Promise<void> {
  await guardarConfig('nube', cfg)
  nube.value = cfg
}

export async function actualizarPendientes(): Promise<void> {
  pendientesNube.value = await contarPendientes(db)
  if (nube.value && estadoNube.value !== 'sincronizando' && estadoNube.value !== 'error' && estadoNube.value !== 'sin-red') {
    estadoNube.value = pendientesNube.value ? 'pendiente' : 'al-dia'
  }
}

export async function cargarNube(): Promise<void> {
  nube.value = await leerConfig<ConfigNube | null>('nube', null)
  estadoNube.value = nube.value ? 'pendiente' : 'desconectado'
  await actualizarPendientes()
  if (nube.value) iniciarAutomatico()
}

function normalizarUrl(url: string): string {
  const u = url.trim()
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u)) {
    throw new ErrorNube('Pegue la URL de la aplicación web: empieza con https://script.google.com/macros/s/ y termina en /exec.', true)
  }
  return u
}

/** Sube lo pendiente y baja lo nuevo. Si ya hay una sincronización en curso, espera esa. */
export function sincronizarAhora(): Promise<void> {
  if (enCurso) return enCurso
  const cfg = nube.value
  if (!cfg) return Promise.resolve()
  enCurso = (async () => {
    estadoNube.value = 'sincronizando'
    errorNube.value = ''
    try {
      const r = await sincronizar(db, cfg, transporteFetch, (t) => (progresoNube.value = t))
      await guardarNube({ ...cfg, cursor: r.cursor, ultimaSync: new Date().toISOString() })
      if (r.afectadas.size) await S.recargar(...r.afectadas)
      if (r.errores.length) errorNube.value = r.errores.join(' · ')
      reintentos = 0
      estadoNube.value = 'al-dia'
    } catch (e) {
      const err = e instanceof ErrorNube ? e : new ErrorNube((e as Error).message)
      errorNube.value = err.message
      estadoNube.value = !navigator.onLine || /conexión/i.test(err.message) ? 'sin-red' : 'error'
      reintentos++
      if (!err.permanente) programar(Math.min(30 * 60 * 1000, 30000 * 2 ** Math.min(reintentos, 6)))
    } finally {
      progresoNube.value = ''
      enCurso = null
      await actualizarPendientes()
    }
  })()
  return enCurso
}

function programar(ms: number): void {
  if (!nube.value) return
  clearTimeout(temporizador)
  temporizador = window.setTimeout(() => void sincronizarAhora(), ms)
}

/** Lo llaman las operaciones locales: sube el cambio en unos segundos. */
export function avisarCambioLocal(): void {
  void actualizarPendientes()
  if (nube.value && estadoNube.value !== 'error') programar(TRAS_CAMBIO_MS)
}

let automaticoIniciado = false
function iniciarAutomatico(): void {
  if (automaticoIniciado || typeof window === 'undefined') return
  automaticoIniciado = true
  window.setInterval(() => {
    if (nube.value && document.visibilityState === 'visible') void sincronizarAhora()
  }, CADA_MS)
  window.addEventListener('online', () => void sincronizarAhora())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sincronizarAhora()
  })
  programar(1500)
}

/** Conecta este equipo (que ya tiene datos) a la nube y sube todo lo que tiene. */
export async function conectarNube(url: string, clave: string): Promise<void> {
  const eq = S.dispositivo.value
  if (!eq) throw new ErrorNube('Configure el equipo primero.')
  const u = normalizarUrl(url)
  await probarServidor(transporteFetch, u)
  const token = await registrarEquipo(transporteFetch, u, clave, eq)
  await guardarNube({ url: u, equipoId: eq.id, token, cursor: 0 })
  await marcarTodoPendiente(db)
  iniciarAutomatico()
  await sincronizarAhora()
  if (estadoNube.value === 'error') throw new ErrorNube(errorNube.value)
}

/** Equipo nuevo: descarga todo de la nube (catálogo, padrón, usuarios, movimientos). */
export async function unirseDesdeNube(url: string, clave: string, codigo: string, nombre: string): Promise<void> {
  const u = normalizarUrl(url)
  await probarServidor(transporteFetch, u)
  // Se reutiliza el mismo identificador si se reintenta, para no chocar con el propio código
  const previo = await leerConfig<string | null>('equipoPendienteId', null)
  const id = previo ?? nuevoId('D')
  await guardarConfig('equipoPendienteId', id)
  const equipo: Dispositivo = { id, codigo, nombre: nombre.trim() }
  const token = await registrarEquipo(transporteFetch, u, clave, equipo)
  const cfg: ConfigNube = { url: u, equipoId: equipo.id, token, cursor: 0 }
  const r = await sincronizar(db, cfg, transporteFetch, (t) => (progresoNube.value = t))
  progresoNube.value = ''
  if (!(await db.usuarios.count())) {
    throw new ErrorNube('La nube todavía no tiene datos. Configure primero un equipo con «Empezar un sistema nuevo» y conéctelo desde Ajustes.', true)
  }
  await guardarNube({ ...cfg, cursor: r.cursor, ultimaSync: new Date().toISOString() })
  await guardarConfig('dispositivo', equipo)
  await S.recargar()
  S.dispositivo.value = equipo
  estadoNube.value = 'al-dia'
  iniciarAutomatico()
}

/** Deja de sincronizar este equipo. Los datos locales se conservan. */
export async function desconectarNube(): Promise<void> {
  clearTimeout(temporizador)
  await guardarNube(null)
  estadoNube.value = 'desconectado'
  errorNube.value = ''
}
