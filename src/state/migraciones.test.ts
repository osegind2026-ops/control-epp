import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { kitsSemilla, materialesSemilla } from '../db/semilla'
import type { Resguardo } from '../domain/types'
import { migrar } from './migraciones'

const resguardo = (id: string, materialId: string): Resguardo => ({
  id, entregaId: 'E1', folioSI: 'SI-1', rpe: 'X1', nombre: 'X', area: 'A', materialId, varianteId: '', cantidad: 1, fechaEntrega: '2026-09-20', estatus: 'ACTIVO',
})

describe('migración v3 (datos creados antes del cambio)', () => {
  it('reclasifica materiales, resguardos y el kit de ingreso sin tocar el casco', async () => {
    // Estado anterior: todo era «resguardo» y el kit no tenía complementos
    const viejos = materialesSemilla().map((m) => (['arnes_casco', 'barbiquejo', 'careta_policarbonato', 'arnes_cuerpo', 'linea_vida'].includes(m.id) ? { ...m, tipo: 'resguardo' as const, plazoDias: undefined } : m))
      .filter((m) => !['careta_base', 'g_anticorte', 'cinturon'].includes(m.id))
      .map(({ imagen: _i, descripcion: _d, ...m }) => m)
      .map((m) => (m.id === 'careta_policarbonato' ? { ...m, nombre: 'Careta Policarbonato' } : m))
    await db.materiales.bulkPut(viejos)
    await db.kits.bulkPut(kitsSemilla().map((k) => ({ ...k, lineas: k.lineas.map(({ conMaterial: _c, ...l }) => l) })))
    await db.resguardos.bulkPut([resguardo('r1', 'casco'), resguardo('r2', 'barbiquejo'), resguardo('r3', 'arnes_cuerpo')])

    await migrar()

    expect((await db.materiales.get('barbiquejo'))?.tipo).toBe('consumible')
    expect((await db.materiales.get('arnes_cuerpo'))?.tipo).toBe('prestamo')
    expect((await db.materiales.get('casco'))?.tipo).toBe('resguardo')
    expect((await db.resguardos.get('r1'))?.estatus).toBe('ACTIVO')
    expect((await db.resguardos.get('r2'))?.estatus).toBe('CERRADO')
    const arnes = await db.resguardos.get('r3')
    expect(arnes?.tipo).toBe('prestamo')
    expect(arnes?.vence).toBe('2026-09-20')
    const kit = await db.kits.get('kit_ingreso')
    expect(kit?.lineas.find((l) => l.materialId === 'barbiquejo')?.conMaterial).toBe('casco')
    // v4: la careta se divide en mica y base, ambas consumibles
    expect((await db.materiales.get('careta_policarbonato'))?.nombre).toBe('Mica de Policarbonato para Careta')
    expect((await db.materiales.get('careta_base'))?.tipo).toBe('consumible')
    // v5: materiales del Anexo Técnico y fotos incluidas, sin tocar lo que ya existía
    expect((await db.materiales.get('g_anticorte'))?.variantes.map((v) => v.id)).toEqual(['8', '9', '10'])
    expect((await db.materiales.get('cinturon'))?.tipo).toBe('consumible')
    expect((await db.materiales.get('casco'))?.imagen).toBe('casco.webp')
    expect((await db.materiales.get('casco'))?.nombre).toBe('Casco de Seguridad')
    expect((await db.categorias.get('soldadura'))?.nombre).toBe('Soldadura y cuerpo')

    // Correrla otra vez no cambia nada
    const antes = JSON.stringify(await db.resguardos.toArray())
    await migrar()
    expect(JSON.stringify(await db.resguardos.toArray())).toBe(antes)
  })
})
