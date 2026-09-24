import { computed, signal } from '@preact/signals'
import { db, leerConfig } from '../db/db'
import { calcularExistencias } from '../domain/logica'
import type {
  Categoria,
  Dispositivo,
  Entrega,
  Kit,
  Material,
  Motivo,
  Movimiento,
  Resguardo,
  Sesion,
  Trabajador,
  Ubicacion,
  Usuario,
} from '../domain/types'

// Estado en memoria. IndexedDB es la fuente de verdad; aquí se guarda una copia
// para que las pantallas respondan al instante.

export const materiales = signal<Material[]>([])
export const categorias = signal<Categoria[]>([])
export const fotos = signal<Map<string, string>>(new Map())
export const kits = signal<Kit[]>([])
export const ubicaciones = signal<Ubicacion[]>([])
export const personal = signal<Map<string, Trabajador>>(new Map())
export const usuarios = signal<Usuario[]>([])
export const motivos = signal<Motivo[]>([])
export const entregas = signal<Entrega[]>([])
export const movimientos = signal<Movimiento[]>([])
export const resguardos = signal<Resguardo[]>([])

export const dispositivo = signal<Dispositivo | null>(null)
export const folios = signal<Record<string, number>>({})
export const ultimoRespaldo = signal<string>('')
export const cambiosSinRespaldo = signal<number>(0)
export const bloqueoMin = signal<number>(10)

export const cargado = signal(false)
export const sesion = signal<Sesion | null>(null)

// ---------- Derivados ----------

export const materialesActivos = computed(() =>
  materiales.value.filter((m) => m.activo).sort((a, b) => a.orden - b.orden),
)
export const materialesPorId = computed(() => new Map(materiales.value.map((m) => [m.id, m])))
export const ubicacionesActivas = computed(() =>
  ubicaciones.value.filter((u) => u.activo).sort((a, b) => a.orden - b.orden),
)
export const ubicacionDespacho = computed(
  () => ubicacionesActivas.value.find((u) => u.esDespacho) ?? ubicacionesActivas.value[0],
)
export const existencias = computed(() => calcularExistencias(movimientos.value))
export const resguardosActivos = computed(() => resguardos.value.filter((r) => r.estatus === 'ACTIVO'))
export const motivosDe = (tipo: Motivo['tipo']) =>
  motivos.value.filter((m) => m.tipo === tipo && m.activo).sort((a, b) => a.orden - b.orden)
export const usuariosActivos = computed(() => usuarios.value.filter((u) => u.activo))

export function nombreMaterial(id: string, varianteId?: string): string {
  const m = materialesPorId.value.get(id)
  if (!m) return id
  if (!varianteId) return m.nombre
  const v = m.variantes.find((x) => x.id === varianteId)
  return `${m.nombre} · ${v ? v.etiqueta : varianteId}`
}

// ---------- Carga ----------

export async function recargar(...tablas: string[]): Promise<void> {
  const todas = tablas.length === 0
  const t = (n: string) => todas || tablas.includes(n)
  const tareas: Promise<void>[] = []
  if (t('materiales')) tareas.push(db.materiales.toArray().then((v) => void (materiales.value = v)))
  if (t('categorias')) tareas.push(db.categorias.toArray().then((v) => void (categorias.value = v.sort((a, b) => a.orden - b.orden))))
  if (t('fotos')) tareas.push(db.fotos.toArray().then((v) => void (fotos.value = new Map(v.map((f) => [f.id, f.dataUrl])))))
  if (t('kits')) tareas.push(db.kits.toArray().then((v) => void (kits.value = v.sort((a, b) => a.orden - b.orden))))
  if (t('ubicaciones')) tareas.push(db.ubicaciones.toArray().then((v) => void (ubicaciones.value = v)))
  if (t('personal')) tareas.push(db.personal.toArray().then((v) => void (personal.value = new Map(v.map((p) => [p.rpe, p])))))
  if (t('usuarios')) tareas.push(db.usuarios.toArray().then((v) => void (usuarios.value = v)))
  if (t('motivos')) tareas.push(db.motivos.toArray().then((v) => void (motivos.value = v)))
  if (t('entregas')) tareas.push(db.entregas.orderBy('ts').toArray().then((v) => void (entregas.value = v)))
  if (t('movimientos')) tareas.push(db.movimientos.orderBy('ts').toArray().then((v) => void (movimientos.value = v)))
  if (t('resguardos')) tareas.push(db.resguardos.toArray().then((v) => void (resguardos.value = v)))
  if (t('config')) {
    tareas.push(
      (async () => {
        dispositivo.value = await leerConfig<Dispositivo | null>('dispositivo', null)
        folios.value = await leerConfig<Record<string, number>>('folios', {})
        ultimoRespaldo.value = await leerConfig<string>('ultimoRespaldo', '')
        cambiosSinRespaldo.value = await leerConfig<number>('cambiosSinRespaldo', 0)
        bloqueoMin.value = await leerConfig<number>('bloqueoMin', 10)
      })(),
    )
  }
  await Promise.all(tareas)
}

export async function cargarTodo(): Promise<void> {
  await recargar()
  cargado.value = true
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {})
}
