import { db, guardarConfig, leerConfig } from '../db/db'
import { fechaLocal } from '../lib/util'
import type { Kit, Material, Resguardo } from '../domain/types'
import { materialesSemilla } from '../db/semilla'
import * as S from './store'

// Cambios de datos que acompañan a nuevas versiones de la app. Cada migración
// es idempotente: si dos equipos la corren, al sincronizar quedan igual.

const CONSUMIBLES_AHORA = ['arnes_casco', 'barbiquejo', 'careta_policarbonato']
const PRESTAMOS_AHORA = ['arnes_cuerpo', 'linea_vida']

/**
 * v3: arnés de casco, barbiquejo y careta pasan a ser consumibles; arnés de
 * cuerpo completo y línea de vida pasan a ser préstamos de corto plazo.
 */
async function v3(): Promise<void> {
  const ahora = new Date().toISOString()
  const materiales = await db.materiales.toArray()
  const cambiosMat: Material[] = []
  for (const m of materiales) {
    if (CONSUMIBLES_AHORA.includes(m.id) && m.tipo === 'resguardo') cambiosMat.push({ ...m, tipo: 'consumible', actualizado: ahora })
    if (PRESTAMOS_AHORA.includes(m.id) && m.tipo === 'resguardo') cambiosMat.push({ ...m, tipo: 'prestamo', plazoDias: m.plazoDias ?? 1, actualizado: ahora })
  }

  const kit = await db.kits.get('kit_ingreso')
  let kitNuevo: Kit | undefined
  if (kit && kit.lineas.some((l) => ['arnes_casco', 'barbiquejo'].includes(l.materialId) && !l.conMaterial)) {
    kitNuevo = {
      ...kit,
      lineas: kit.lineas.map((l) => (['arnes_casco', 'barbiquejo'].includes(l.materialId) ? { ...l, conMaterial: 'casco' } : l)),
      actualizado: ahora,
    }
  }

  const hoy = fechaLocal()
  const cambiosResg: Resguardo[] = []
  for (const r of await db.resguardos.where('estatus').equals('ACTIVO').toArray()) {
    if (CONSUMIBLES_AHORA.includes(r.materialId)) {
      cambiosResg.push({
        ...r,
        estatus: 'CERRADO',
        ver: (r.ver ?? 0) + 1,
        cierre: { ts: ahora, fecha: hoy, motivo: 'Reclasificado: ahora se entrega como consumible', reingresa: false, usuarioId: 'sistema', usuarioNombre: 'Sistema', ref: 'MIGRACIÓN' },
      })
    } else if (PRESTAMOS_AHORA.includes(r.materialId) && r.tipo !== 'prestamo') {
      // Sin fecha pactada: se marca vencido para que se dé seguimiento
      cambiosResg.push({ ...r, tipo: 'prestamo', vence: r.fechaEntrega, ver: (r.ver ?? 0) + 1 })
    }
  }

  if (!cambiosMat.length && !kitNuevo && !cambiosResg.length) return
  await db.transaction('rw', [db.materiales, db.kits, db.resguardos], async () => {
    if (cambiosMat.length) await db.materiales.bulkPut(cambiosMat)
    if (kitNuevo) await db.kits.put(kitNuevo)
    if (cambiosResg.length) await db.resguardos.bulkPut(cambiosResg)
  })
}

/**
 * v4: la careta se entrega en dos partes: la mica de policarbonato (se cambia
 * seguido) y la base que va sobre la cabeza (dura mucho más). Ambas son consumibles.
 */
async function v4(): Promise<void> {
  const ahora = new Date().toISOString()
  const cambios: Material[] = []
  const mica = await db.materiales.get('careta_policarbonato')
  if (mica && mica.nombre === 'Careta Policarbonato') cambios.push({ ...mica, nombre: 'Mica de Policarbonato para Careta', actualizado: ahora })
  if (!(await db.materiales.get('careta_base'))) {
    const base = materialesSemilla().find((m) => m.id === 'careta_base')!
    cambios.push({ ...base, orden: mica ? mica.orden + 0.5 : base.orden, actualizado: ahora })
  }
  if (cambios.length) await db.materiales.bulkPut(cambios)
}

const MIGRACIONES: [number, () => Promise<void>][] = [
  [3, v3],
  [4, v4],
]

export async function migrar(): Promise<void> {
  const actual = await leerConfig<number>('versionDatos', 2)
  let aplicada = actual
  for (const [version, fn] of MIGRACIONES) {
    if (version <= actual) continue
    await fn()
    aplicada = version
  }
  if (aplicada !== actual) {
    await guardarConfig('versionDatos', aplicada)
    await S.recargar()
  }
}
