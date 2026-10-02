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

const CADA_MS = 3 * 60 * 1000 // revisión periódica con Google
const TRAS_CAMBIO_MS = 4000 // espera tras un cambio local, para juntar varios
// Con el servidor de la carpeta de red (en la misma PC) se sincroniza casi al instante
const CADA_MS_LOCAL = 5000
const TRAS_CAMBIO_MS_LOCAL = 700

/** Servidor local de la carpeta de red, si la app se abrió desde él. */
export const servidorLocal = signal<{ url: string; pc: string; tieneDatos: boolean } | null>(null)

const URL_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1):\d+\/api$/
export const esLocal = (url?: string) => !!url && URL_LOCAL.test(url)

/** ¿La app se sirvió desde el servidor de la carpeta de red? (Control EPP en red local) */
export async function detectarServidorLocal(): Promise<void> {
  if (typeof location === 'undefined' || location.protocol !== 'http:' || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return
  const url = new URL('./api', location.href).href.replace(/\/$/, '')
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 3000)
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ accion: 'ping' }), signal: ctl.signal })
    clearTimeout(t)
    const d = (await r.json()) as { app?: string; modo?: string; pc?: string; tieneDatos?: boolean }
    if (d.app === 'control-epp' && d.modo === 'local') servidorLocal.value = { url, pc: d.pc ?? '', tieneDatos: !!d.tieneDatos }
  } catch {
    /* no es el servidor local */
  }
}

/** Con el servidor local, un equipo ya configurado se conecta solo a la carpeta de red. */
export async function conectarLocalSiFalta(): Promise<string | undefined> {
  const local = servidorLocal.value
  if (!local || !S.dispositivo.value || !S.usuarios.value.length) return
  if (nube.value?.url === local.url) return
  try {
    await conectarNube(local.url, '')
  } catch (e) {
    errorNube.value = (e as Error).message
    estadoNube.value = 'error'
    return errorNube.value
  }
}

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
  if (esLocal(u)) return u
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
      if (!err.permanente) programar(esLocal(cfg.url) ? 5000 : Math.min(30 * 60 * 1000, 30000 * 2 ** Math.min(reintentos, 6)))
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
  if (nube.value && estadoNube.value !== 'error') programar(esLocal(nube.value.url) ? TRAS_CAMBIO_MS_LOCAL : TRAS_CAMBIO_MS)
}

let automaticoIniciado = false
function iniciarAutomatico(): void {
  if (automaticoIniciado || typeof window === 'undefined') return
  automaticoIniciado = true
  let ultimaAuto = Date.now()
  window.setInterval(() => {
    if (!nube.value) return
    const local = esLocal(nube.value.url)
    // Google: cada 3 min con la app a la vista. Carpeta de red: cada 5 s a la vista y cada 30 s minimizada
    const espera = local ? (document.visibilityState === 'visible' ? 0 : 30000) : document.visibilityState === 'visible' ? CADA_MS : Infinity
    if (Date.now() - ultimaAuto < espera) return
    ultimaAuto = Date.now()
    void sincronizarAhora()
  }, CADA_MS_LOCAL)
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
