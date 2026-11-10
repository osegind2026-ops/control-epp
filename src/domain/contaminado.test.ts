import { describe, expect, it } from 'vitest'
import { esContaminada, foliosSinCapturar, materialesContaminados, normalizarFolioContaminado, partesFolio, ultimoFolioCapturado } from './contaminado'
import { materialesRecurrentes } from './logica'
import type { Entrega } from './types'

const entrega = (id: string, fecha: string, extra: Partial<Entrega> = {}): Entrega => ({
  id, folio: `CFE-T1-${id}`, ts: `${fecha}T10:00:00.000Z`, fecha, hora: '10:00', rpe: 'X0001', nombre: 'PERSONA FICTICIA', area: 'TALLER',
  usuarioId: 'U', usuarioNombre: 'Admin', equipo: 'T1', ubicacionId: 'u', observaciones: '', estado: 'registrada',
  lineas: [{ materialId: 'g_hyflex', varianteId: '8', cantidad: 1, esResguardo: false }],
  ...extra,
})

describe('folio del formato de EPP contaminado', () => {
  it('acepta el número solo o el folio completo, escrito o leído con escáner', () => {
    expect(normalizarFolioContaminado('3', 'U1', 2026)).toBe('U1-SI-2026-003')
    expect(normalizarFolioContaminado(' 015 ', 'U2', 2026)).toBe('U2-SI-2026-015')
    expect(normalizarFolioContaminado('u2-si-2025-7', 'U1', 2026)).toBe('U2-SI-2025-007')
    expect(normalizarFolioContaminado('U1 SI 2026 1234', 'U1', 2026)).toBe('U1-SI-2026-1234')
    expect(normalizarFolioContaminado('0', 'U1', 2026)).toBe('')
    expect(normalizarFolioContaminado('ABC', 'U1', 2026)).toBe('')
    expect(partesFolio('U1-SI-2026-003')).toEqual({ unidad: 'U1', anio: 2026, n: 3 })
  })

  it('reconoce las marcadas antes solo con comentario', () => {
    const vieja = entrega('1', '2026-10-01', { recurrencia: { materiales: ['g_hyflex'], nota: 'EPP Contaminado' } })
    expect(esContaminada(vieja)).toBe(true)
    expect(materialesContaminados(vieja)).toEqual(['g_hyflex'])
    expect(esContaminada(entrega('2', '2026-10-01'))).toBe(false)
  })

  it('sigue la numeración y lista los folios sin capturar', () => {
    const lista = [
      entrega('1', '2026-10-01', { contaminado: { folio: 'U1-SI-2026-001', materiales: ['g_hyflex'] } }),
      entrega('2', '2026-10-02', { contaminado: { folio: 'U1-SI-2026-004', materiales: ['g_hyflex'] } }),
      entrega('3', '2026-10-02', { contaminado: { folio: 'U2-SI-2026-009', materiales: ['g_hyflex'] } }),
      entrega('4', '2026-10-03', { contaminado: { folio: 'U1-SI-2026-002', materiales: ['g_hyflex'] }, estado: 'anulada' }),
    ]
    expect(ultimoFolioCapturado(lista, 'U1', 2026)).toBe(4)
    expect(ultimoFolioCapturado(lista, 'U1', 2025)).toBe(0)
    expect(foliosSinCapturar(lista, 'U1', 2026, 6)).toEqual(['U1-SI-2026-002', 'U1-SI-2026-003', 'U1-SI-2026-005', 'U1-SI-2026-006'])
  })

  it('los cambios por contaminación no cuentan como entrega recurrente', () => {
    const lista = [
      entrega('1', '2026-10-01', { contaminado: { folio: 'U1-SI-2026-001', materiales: ['g_hyflex'] } }),
      entrega('2', '2026-10-05', { contaminado: { folio: 'U1-SI-2026-002', materiales: ['g_hyflex'] } }),
      entrega('3', '2026-10-08'),
    ]
    expect(materialesRecurrentes(lista, 'X0001', ['g_hyflex'], '2026-10-10')).toEqual([])
    expect(materialesRecurrentes([...lista, entrega('4', '2026-10-09')], 'X0001', ['g_hyflex'], '2026-10-10').map((r) => r.previas.length)).toEqual([2])
  })
})
