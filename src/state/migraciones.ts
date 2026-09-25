import { db, guardarConfig, leerConfig } from '../db/db'
import { fechaLocal } from '../lib/util'
import type { Kit, Material, Resguardo } from '../domain/types'
import { CATEGORIAS, FICHAS, materialesSemilla } from '../db/semilla'
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

/**
 * v5: catálogo con fotos y fichas del Anexo Técnico 2026; materiales nuevos (guantes
 * anticorte y de uso rudo, cinturón, soldadura, cintas…) y categoría de soldadura.
 * No cambia nombres ni fotos que la oficina ya haya puesto.
 */
async function v5(): Promise<void> {
  const ahora = new Date().toISOString()
  const actuales = new Map((await db.materiales.toArray()).map((m) => [m.id, m]))
  let orden = Math.max(0, ...[...actuales.values()].map((m) => m.orden))
  const cambios: Material[] = []
  for (const semilla of materialesSemilla()) {
    const m = actuales.get(semilla.id)
    if (!m) {
      cambios.push({ ...semilla, orden: ++orden, actualizado: ahora })
      continue
    }
    const ficha = FICHAS[m.id]
    if (!ficha) continue
    const agregar: Partial<Material> = {}
    if (ficha.imagen && !m.imagen) agregar.imagen = ficha.imagen
    if (!m.descripcion) agregar.descripcion = ficha.descripcion
    if (Object.keys(agregar).length) cambios.push({ ...m, ...agregar, actualizado: ahora })
  }
  const categorias = await db.categorias.toArray()
  const nuevasCat = CATEGORIAS.filter((c) => !categorias.some((x) => x.id === c.id))
  const otros = categorias.find((c) => c.id === 'otros')
  await db.transaction('rw', [db.materiales, db.categorias], async () => {
    if (cambios.length) await db.materiales.bulkPut(cambios)
    if (nuevasCat.length) await db.categorias.bulkPut(nuevasCat)
    if (otros && otros.nombre === 'Otros') await db.categorias.put({ ...otros, nombre: 'Señalización y otros', orden: 8 })
  })
}

const MIGRACIONES: [number, () => Promise<void>][] = [
  [3, v3],
  [4, v4],
  [5, v5],
]

export async function migrar(): Promise<void> {
  // Equipo aún sin datos (recién instalado o uniéndose a la nube): se migra cuando ya los tenga
  if ((await db.materiales.count()) === 0) return
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
