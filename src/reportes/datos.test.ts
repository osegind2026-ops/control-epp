import { describe, expect, it } from 'vitest'
import { materialesSemilla, motivosSemilla, ubicacionesSemilla } from '../db/semilla'
import type { Entrega } from '../domain/types'
import { calcularReporte, describirPeriodo, semanaIso } from './datos'

const entrega = (id: string, fecha: string, rpe: string, area: string, lineas: [string, number, string?, string?][]): Entrega => ({
  id, folio: id, ts: fecha + 'T15:00:00Z', fecha, hora: '09:00', rpe, nombre: rpe, area, usuarioId: 'u', usuarioNombre: 'U', equipo: 'A', ubicacionId: 'ubi_despacho',
  lineas: lineas.map(([materialId, cantidad, varianteId = '', motivoId]) => ({ materialId, cantidad, varianteId, esResguardo: materialId === 'casco', motivoId })),
  observaciones: '', estado: 'registrada',
})

describe('periodos', () => {
  it('describe días, rangos, semanas y meses', () => {
    expect(describirPeriodo('2026-09-11', '2026-09-11').titulo).toBe('11 de septiembre 2026')
    expect(describirPeriodo('2026-09-21', '2026-09-22').titulo).toBe('21 y 22 de septiembre 2026')
    expect(describirPeriodo('2026-09-07', '2026-09-13')).toEqual({ titulo: 'Semana 37 · 7 al 13 de septiembre 2026', corto: 'Semana 37' })
    expect(describirPeriodo('2026-09-01', '2026-09-30').titulo).toBe('Septiembre 2026')
    expect(semanaIso('2026-09-11')).toBe(37)
    expect(semanaIso('2026-01-01')).toBe(1)
  })
})

describe('reporte ejecutivo', () => {
  const fuentes = {
    entregas: [
      entrega('1', '2026-09-21', 'A', 'MANTENIMIENTO MECÁNICO', [['casco', 1, '', 'ent_extravio'], ['g_carnaza', 1, 'G'], ['lentes_claros', 1]]),
      entrega('2', '2026-09-21', 'B', 'MANTENIMIENTO MECÁNICO', [['g_carnaza', 2, 'XG'], ['tapones', 1]]),
      entrega('3', '2026-09-22', 'C', 'INSTRUMENTACION Y CONTROL', [['g_hyflex', 1, '8'], ['lentes_claros', 1]]),
      entrega('4', '2026-09-22', 'D', 'APOYO CONSTRUCTIVO', [['casco', 1, '', 'ent_primera'], ['tapones', 2]]),
      { ...entrega('5', '2026-09-22', 'E', 'INFRA', [['casco', 1]]), estado: 'anulada' as const },
      entrega('6', '2026-09-25', 'F', 'INFRA', [['casco', 1]]),
    ],
    movimientos: [],
    resguardos: [],
    materiales: materialesSemilla(),
    motivos: motivosSemilla(),
    ubicaciones: ubicacionesSemilla(),
    personal: new Map(),
  }
  const d = calcularReporte(fuentes, '2026-09-21', '2026-09-22')

  it('cuenta personas, áreas y piezas sin anuladas ni fuera de periodo', () => {
    expect(d.personas).toBe(4)
    expect(d.areas).toBe(3)
    expect(d.piezas).toBe(11)
    expect(d.cascos).toBe(2)
    expect(d.materiales[0]).toMatchObject({ id: 'g_carnaza', piezas: 3, personas: 2 })
    expect(d.porArea[0]).toMatchObject({ area: 'MANTENIMIENTO MECÁNICO', personas: 2, cascos: 1 })
    expect(d.areasSinCasco).toEqual(['INSTRUMENTACION Y CONTROL'])
    expect(d.porDia).toEqual([
      { fecha: '2026-09-21', personas: 2, piezas: 6 },
      { fecha: '2026-09-22', personas: 2, piezas: 5 },
    ])
  })

  it('redacta hallazgos para la dirección', () => {
    expect(d.hallazgos).toContain('El 50% del personal atendido recibió guantes de carnaza y el 25% guantes Hyflex.')
    expect(d.hallazgos).toContain('Mantenimiento Mecánico concentró el 50% del personal atendido.')
    expect(d.hallazgos).toContain('El 50% del personal solicitó casco; el resto ya contaba con uno de algún contrato anterior.')
    expect(d.hallazgos.some((h) => h.includes('Reposición por extravío'))).toBe(true)
  })

  it('escribe los nombres de área con siglas y conectores correctos', async () => {
    const { titulo } = await import('./datos')
    expect(titulo('OFICINA DE SEGURIDAD INDUSTRIAL')).toBe('Oficina de Seguridad Industrial')
    expect(titulo('VISITANTE CFE')).toBe('Visitante CFE')
    expect(titulo('DTM')).toBe('DTM')
    expect(titulo('INSTRUMENTACION Y CONTROL')).toBe('Instrumentacion y Control')
    expect(titulo('MANTENIMIENTO ELÉCTRICO')).toBe('Mantenimiento Eléctrico')
  })
})
