import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { detalleUltimo, registrarImpresion, ultimoImpreso } from './folios'
import { inicializarSistema } from './servicios'
import * as S from './store'

beforeAll(async () => {
  await inicializarSistema({ equipo: { codigo: 'P1', nombre: 'PC de prueba' }, admin: { nombre: 'Admin', pin: '1234' }, demo: false, padron: [] })
})

describe('consecutivo de formatos impresos', () => {
  it('avanza al imprimir y no retrocede al reimprimir un folio anterior', async () => {
    expect(await registrarImpresion('resguardo', 2027, 1, 6)).toBe(6)
    expect(await registrarImpresion('resguardo', 2027, 7, 12)).toBe(12)
    // Reimpresión del folio 3: el consecutivo se queda en 12
    expect(await registrarImpresion('resguardo', 2027, 3, 3)).toBe(12)
    expect(ultimoImpreso(S.ajustes.value, 'resguardo', 2027)).toBe(12)
    await expect(registrarImpresion('resguardo', 2027, 5, 4)).rejects.toThrow(/folio inicial/)
  })

  it('toma el mayor de todos los equipos (cada equipo tiene su renglón) y separa series y años', async () => {
    await db.ajustes.put({ id: 'folioImpreso|resguardo|2027|C1', valor: 20, actualizado: '2027-01-05T10:00:00.000Z' })
    await S.recargar('ajustes')
    expect(ultimoImpreso(S.ajustes.value, 'resguardo', 2027)).toBe(20)
    expect(await detalleUltimo('resguardo', 2027)).toMatchObject({ ultimo: 20, equipo: 'C1' })
    expect(ultimoImpreso(S.ajustes.value, 'resguardo', 2028)).toBe(0)
    expect(ultimoImpreso(S.ajustes.value, 'contaminado-U1', 2027)).toBe(0)
    // Este equipo sigue después del 20 aunque su propio renglón diga 12
    expect(await registrarImpresion('resguardo', 2027, 21, 22)).toBe(22)
  })

  it('respeta lo que este equipo llevaba solo para sí antes de compartirse (2026)', async () => {
    await db.config.put({ clave: 'folio_contaminado_U2', valor: 57 })
    expect((await detalleUltimo('contaminado-U2', 2026)).ultimo).toBe(57)
    expect(ultimoImpreso(S.ajustes.value, 'contaminado-U2', 2026, 57)).toBe(57)
    expect(await registrarImpresion('contaminado-U2', 2026, 58, 61)).toBe(61)
  })
})
