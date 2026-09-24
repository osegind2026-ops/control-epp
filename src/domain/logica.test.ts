import { describe, expect, it } from 'vitest'
import {
  aplicarKit,
  buscarTrabajadores,
  calcularExistencias,
  existencia,
  formatoFolio,
  masPedidos,
  nivelStock,
  resolverRpe,
  siguienteFolio,
} from './logica'
import type { Kit, Material, Movimiento, Trabajador } from './types'

const mov = (p: Partial<Movimiento>): Movimiento => ({
  id: Math.random().toString(),
  ts: '2026-09-23T10:00:00.000Z',
  tipo: 'ENTRADA',
  materialId: 'm',
  varianteId: '',
  ubicacionId: 'u1',
  cantidad: 0,
  ref: '',
  motivo: '',
  nota: '',
  usuarioId: 'x',
  usuarioNombre: 'x',
  equipo: 'A',
  ...p,
})

const material = (p: Partial<Material>): Material => ({
  id: 'm',
  nombre: 'M',
  categoriaId: 'c',
  tipo: 'consumible',
  variantes: [],
  stockMin: {},
  orden: 0,
  activo: true,
  actualizado: '',
  ...p,
})

describe('existencias', () => {
  it('suma movimientos por material, talla y ubicación', () => {
    const mapa = calcularExistencias([
      mov({ materialId: 'hyflex', varianteId: '8', cantidad: 20 }),
      mov({ materialId: 'hyflex', varianteId: '8', cantidad: -3, tipo: 'SALIDA' }),
      mov({ materialId: 'hyflex', varianteId: '9', cantidad: 5 }),
      mov({ materialId: 'hyflex', varianteId: '8', cantidad: 10, ubicacionId: 'u2' }),
    ])
    expect(existencia(mapa, 'hyflex', '8', 'u1')).toBe(17)
    expect(existencia(mapa, 'hyflex', '8', undefined, ['u1', 'u2'])).toBe(27)
    expect(existencia(mapa, 'hyflex', '9', 'u2')).toBe(0)
  })

  it('clasifica el nivel de stock', () => {
    expect(nivelStock(0, 10)).toBe(3)
    expect(nivelStock(4, 10)).toBe(2)
    expect(nivelStock(10, 10)).toBe(1)
    expect(nivelStock(11, 10)).toBe(0)
  })
})

describe('folios', () => {
  it('continúa después del folio más alto del mismo equipo', () => {
    expect(siguienteFolio('JP1', 2, ['CFE-JP1-0005', 'CFE-B-0009', 'CFE-0012'])).toBe(6)
    expect(siguienteFolio('JP1', 7, ['CFE-JP1-0005'])).toBe(8)
    expect(formatoFolio('JP1', 6)).toBe('CFE-JP1-0006')
  })
})

describe('RPE', () => {
  const existentes = new Set(['ZQ9X7', 'T0901'])
  it('quita el dígito verificador de la credencial', () => {
    expect(resolverRpe('zq9x72', (r) => existentes.has(r))).toBe('ZQ9X7')
    expect(resolverRpe(' T0901 ', (r) => existentes.has(r))).toBe('T0901')
    expect(resolverRpe('ZZ999', (r) => existentes.has(r))).toBe('ZZ999')
  })

  it('busca por RPE o por nombre sin importar acentos', () => {
    const lista = [
      { rpe: 'A1', nombre: 'JOSÉ PÉREZ LÓPEZ', activo: true },
      { rpe: 'B2', nombre: 'MARIA LOPEZ', activo: true },
      { rpe: 'C3', nombre: 'INACTIVO LOPEZ', activo: false },
    ] as Trabajador[]
    expect(buscarTrabajadores(lista, 'lopez').map((t) => t.rpe)).toEqual(['A1', 'B2'])
    expect(buscarTrabajadores(lista, 'jose per').map((t) => t.rpe)).toEqual(['A1'])
    expect(buscarTrabajadores(lista, 'b2').map((t) => t.rpe)).toEqual(['B2'])
  })
})

describe('kits', () => {
  const mats = new Map<string, Material>([
    ['casco', material({ id: 'casco', tipo: 'resguardo' })],
    ['lentes', material({ id: 'lentes' })],
    ['hyflex', material({ id: 'hyflex' })],
    ['carnaza', material({ id: 'carnaza' })],
  ])
  const kit: Kit = {
    id: 'k',
    nombre: 'Ingreso',
    orden: 0,
    activo: true,
    actualizado: '',
    lineas: [
      { materialId: 'casco', cantidad: 1 },
      { materialId: 'lentes', cantidad: 1 },
      { materialId: 'hyflex', cantidad: 1, areas: ['INSTRUMENTACION Y CONTROL', 'MANTENIMIENTO ELÉCTRICO'] },
      { materialId: 'carnaza', cantidad: 1, areas: ['MANTENIMIENTO ELÉCTRICO', 'MANTENIMIENTO MECÁNICO'] },
    ],
  }

  it('elige los guantes según el área', () => {
    const ic = aplicarKit(kit, { area: 'INSTRUMENTACION Y CONTROL' }, [], mats)
    expect(ic.lineas.map((l) => l.materialId)).toEqual(['casco', 'lentes', 'hyflex'])
    const elec = aplicarKit(kit, { area: 'Mantenimiento Electrico' }, [], mats)
    expect(elec.lineas.map((l) => l.materialId)).toEqual(['casco', 'lentes', 'hyflex', 'carnaza'])
  })

  it('omite el equipo que ya tiene en resguardo', () => {
    const r = aplicarKit(kit, { area: 'MANTENIMIENTO MECÁNICO' }, [{ materialId: 'casco' }], mats)
    expect(r.lineas.map((l) => l.materialId)).toEqual(['lentes', 'carnaza'])
    expect(r.omitidas).toEqual([{ materialId: 'casco', razon: 'ya lo tiene en resguardo' }])
  })
})

describe('más pedidos', () => {
  it('ordena por consumo y completa con la lista base', () => {
    const r = masPedidos(
      [
        { materialId: 'b', cantidad: 1 },
        { materialId: 'a', cantidad: 5 },
      ],
      ['c', 'a', 'd'],
      3,
    )
    expect(r).toEqual(['a', 'b', 'c'])
  })
})
