import Dexie, { type Table } from 'dexie'
import type {
  Categoria,
  Entrega,
  Equipo,
  Foto,
  Kit,
  Material,
  Motivo,
  Movimiento,
  PrestamoEquipo,
  Resguardo,
  Trabajador,
  Ubicacion,
  Usuario,
} from '../domain/types'

export interface ConfigFila {
  clave: string
  valor: unknown
}

/** Aviso de que un registro se eliminó (p. ej. al deshacer una entrega) y el servidor debe saberlo. */
export interface Baja {
  id: string // `${tabla}:${registroId}`
  tabla: string
  registroId: string
}

export const TABLAS = [
  'materiales',
  'categorias',
  'fotos',
  'kits',
  'ubicaciones',
  'personal',
  'usuarios',
  'motivos',
  'entregas',
  'movimientos',
  'resguardos',
  'equipos',
  'prestamosEquipo',
] as const

export type NombreTabla = (typeof TABLAS)[number]

/** Llave primaria de cada tabla sincronizada. */
export const LLAVE: Record<NombreTabla, 'id' | 'rpe'> = Object.fromEntries(TABLAS.map((t) => [t, t === 'personal' ? 'rpe' : 'id'])) as Record<NombreTabla, 'id' | 'rpe'>

// Marca de cambio local: `_mod` > 0 significa «pendiente de subir a la nube».
// Los registros que llegan del servidor traen `_remoto: true` y quedan con `_mod = 0`.
let reloj = 0
export function marcaCambio(): number {
  reloj = Math.max(reloj + 1, Date.now())
  return reloj
}

export class BaseEPP extends Dexie {
  materiales!: Table<Material, string>
  categorias!: Table<Categoria, string>
  fotos!: Table<Foto, string>
  kits!: Table<Kit, string>
  ubicaciones!: Table<Ubicacion, string>
  personal!: Table<Trabajador, string>
  usuarios!: Table<Usuario, string>
  motivos!: Table<Motivo, string>
  entregas!: Table<Entrega, string>
  movimientos!: Table<Movimiento, string>
  resguardos!: Table<Resguardo, string>
  equipos!: Table<Equipo, string>
  prestamosEquipo!: Table<PrestamoEquipo, string>
  bajas!: Table<Baja, string>
  config!: Table<ConfigFila, string>

  constructor(nombre = 'control-epp') {
    super(nombre)
    this.version(1).stores({
      materiales: 'id, categoriaId, activo',
      categorias: 'id',
      fotos: 'id',
      kits: 'id',
      ubicaciones: 'id',
      personal: 'rpe, area, activo',
      usuarios: 'id',
      motivos: 'id, tipo',
      entregas: 'id, folio, rpe, ts, estado',
      movimientos: 'id, ts, materialId, grupo',
      resguardos: 'id, rpe, estatus, entregaId, materialId',
      config: 'clave',
    })
    // v2: índice de cambios pendientes y avisos de eliminación para la nube
    this.version(2).stores({
      materiales: 'id, categoriaId, activo, _mod',
      categorias: 'id, _mod',
      fotos: 'id, _mod',
      kits: 'id, _mod',
      ubicaciones: 'id, _mod',
      personal: 'rpe, area, activo, _mod',
      usuarios: 'id, _mod',
      motivos: 'id, tipo, _mod',
      entregas: 'id, folio, rpe, ts, estado, _mod',
      movimientos: 'id, ts, materialId, grupo, _mod',
      resguardos: 'id, rpe, estatus, entregaId, materialId, _mod',
      bajas: 'id, _mod',
      config: 'clave',
    })
    // v3: equipos a resguardo y su bitácora de préstamos
    this.version(3).stores({
      equipos: 'id, codigo, _mod',
      prestamosEquipo: 'id, equipoId, rpe, estatus, ts, _mod',
    })

    for (const nombreTabla of [...TABLAS, 'bajas'] as const) {
      const tabla = this.table(nombreTabla)
      tabla.hook('creating', (_llave, obj: Record<string, unknown>) => {
        if (obj._remoto) {
          delete obj._remoto
          obj._mod = 0
        } else obj._mod = marcaCambio()
      })
      tabla.hook('updating', (cambios: object) => {
        if ((cambios as Record<string, unknown>)._remoto) return { _remoto: undefined, _mod: 0 }
        return { _mod: marcaCambio() }
      })
    }
  }
}

export const db = new BaseEPP()

export async function leerConfig<T>(clave: string, porDefecto: T): Promise<T> {
  const fila = await db.config.get(clave)
  return fila ? (fila.valor as T) : porDefecto
}

export async function guardarConfig(clave: string, valor: unknown): Promise<void> {
  await db.config.put({ clave, valor })
}
