import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { BaseEPP, db } from '../db/db'
import type { Trabajador } from '../domain/types'
import { anularEntrega, deshacerEntrega, inicializarSistema, registrarEntrega } from '../state/servicios'
import * as S from '../state/store'
import { contarPendientes, registrarEquipo, sincronizar, type ConfigNube } from './cliente'
import { crearServidorSimulado } from './simulador'

const URL_FALSA = 'https://script.google.com/macros/s/prueba/exec'
const servidor = crearServidorSimulado()
let clave = ''
let cfgA: ConfigNube
let cfgB: ConfigNube
const baseB = new BaseEPP('equipo-b')

const trabajador: Trabajador = {
  rpe: 'T0901', nombre: 'TRABAJADOR DE PRUEBA', area: 'MANTENIMIENTO MECÁNICO', puesto: 'OPERADOR',
  casillero: '', tipo: 'planta', tallas: {}, activo: true, alta: '', actualizado: '',
}

const filasDe = (hoja: string) => servidor.hojas.get(hoja)?.registros() ?? []

beforeAll(async () => {
  clave = servidor.configurar()
  await inicializarSistema({ equipo: { codigo: 'A1', nombre: 'Equipo A' }, admin: { nombre: 'Admin', pin: '1234' }, demo: true, padron: [trabajador] })
})

describe('registro de equipos', () => {
  it('rechaza una clave equivocada', async () => {
    await expect(registrarEquipo(servidor.transporte, URL_FALSA, 'XXXX-XXXX-XXXX', { id: 'D-a', codigo: 'A1', nombre: 'A' })).rejects.toThrow(/clave/)
  })

  it('registra equipos y evita códigos repetidos', async () => {
    const tokenA = await registrarEquipo(servidor.transporte, URL_FALSA, clave.toLowerCase(), { id: S.dispositivo.value!.id, codigo: 'A1', nombre: 'Equipo A' })
    cfgA = { url: URL_FALSA, equipoId: S.dispositivo.value!.id, token: tokenA, cursor: 0 }
    await expect(registrarEquipo(servidor.transporte, URL_FALSA, clave, { id: 'D-b', codigo: 'A1', nombre: 'Otro' })).rejects.toThrow(/ya lo usa/)
    const tokenB = await registrarEquipo(servidor.transporte, URL_FALSA, clave, { id: 'D-b', codigo: 'B2', nombre: 'Equipo B' })
    cfgB = { url: URL_FALSA, equipoId: 'D-b', token: tokenB, cursor: 0 }
  })

  it('rechaza un token inválido', async () => {
    await expect(sincronizar(db, { ...cfgA, token: 'falso' }, servidor.transporte)).rejects.toThrow(/no autorizado/)
  })
})

describe('sincronización entre dos equipos', () => {
  it('el equipo A sube todo y el servidor arma las hojas de consulta', async () => {
    await registrarEntrega(S.personal.value.get('T0901')!, [
      { materialId: 'casco', varianteId: '', cantidad: 1, motivoId: 'ent_primera' },
      { materialId: 'g_carnaza', varianteId: 'G', cantidad: 2 },
    ], '')
    expect(await contarPendientes(db)).toBeGreaterThan(0)
    const r = await sincronizar(db, cfgA, servidor.transporte)
    cfgA.cursor = r.cursor
    expect(r.errores).toEqual([])
    expect(await contarPendientes(db)).toBe(0)

    const entregas = filasDe('Entregas')
    expect(entregas).toHaveLength(1)
    expect(entregas[0]['Folio']).toBe('CFE-A1-0001')
    expect(String(entregas[0]['Materiales'])).toContain('Guante de Carnaza G ×2')
    expect(filasDe('Detalle de entregas')).toHaveLength(2)
    const carnazaG = filasDe('Existencias').find((f) => f['Material'] === 'Guante de Carnaza' && String(f['Talla']) === 'G')
    expect(carnazaG?.['Total']).toBe(88)
  })

  it('una segunda sincronización sin cambios no transfiere nada', async () => {
    const r = await sincronizar(db, cfgA, servidor.transporte)
    expect(r.subidos).toBe(0)
    expect(r.bajados).toBe(0)
  })

  it('el equipo B descarga todo desde cero', async () => {
    const r = await sincronizar(baseB, cfgB, servidor.transporte)
    cfgB.cursor = r.cursor
    expect(await baseB.entregas.count()).toBe(1)
    expect(await baseB.movimientos.count()).toBe(await db.movimientos.count())
    expect(await baseB.usuarios.count()).toBe(1)
    expect(await contarPendientes(baseB)).toBe(0)
  })

  it('una devolución hecha en B llega a A', async () => {
    const casco = (await baseB.resguardos.toArray()).find((x) => x.materialId === 'casco')!
    await baseB.resguardos.put({ ...casco, estatus: 'CERRADO', ver: (casco.ver ?? 0) + 1 })
    expect(await contarPendientes(baseB)).toBe(1)
    cfgB.cursor = (await sincronizar(baseB, cfgB, servidor.transporte)).cursor
    const rA = await sincronizar(db, cfgA, servidor.transporte)
    cfgA.cursor = rA.cursor
    expect(rA.afectadas.has('resguardos')).toBe(true)
    expect((await db.resguardos.get(casco.id))?.estatus).toBe('CERRADO')
  })

  it('una anulación gana aunque otro equipo suba una versión vieja', async () => {
    await S.recargar()
    const entrega = S.entregas.value[0]
    await anularEntrega(entrega.id, 'anu_error', '')
    cfgA.cursor = (await sincronizar(db, cfgA, servidor.transporte)).cursor
    // B edita su copia vieja (registrada) y la sube
    const vieja = (await baseB.entregas.get(entrega.id))!
    await baseB.entregas.put({ ...vieja, observaciones: 'editada en B' })
    cfgB.cursor = (await sincronizar(baseB, cfgB, servidor.transporte)).cursor
    expect((await baseB.entregas.get(entrega.id))?.estado).toBe('anulada')
    expect(filasDe('Entregas')[0]['Estado']).toBe('ANULADA')
    expect(filasDe('Detalle de entregas').every((f) => f['Estado'] === 'ANULADA')).toBe(true)
  })

  it('deshacer después de sincronizar elimina la entrega en los demás equipos', async () => {
    const { entrega, deshacer } = await registrarEntrega(S.personal.value.get('T0901')!, [{ materialId: 'tapones', varianteId: '', cantidad: 5 }], '')
    cfgA.cursor = (await sincronizar(db, cfgA, servidor.transporte)).cursor
    cfgB.cursor = (await sincronizar(baseB, cfgB, servidor.transporte)).cursor
    expect(await baseB.entregas.get(entrega.id)).toBeDefined()

    await deshacerEntrega(deshacer)
    cfgA.cursor = (await sincronizar(db, cfgA, servidor.transporte)).cursor
    cfgB.cursor = (await sincronizar(baseB, cfgB, servidor.transporte)).cursor
    expect(await baseB.entregas.get(entrega.id)).toBeUndefined()
    expect(await baseB.movimientos.where('grupo').equals(entrega.id).count()).toBe(0)
    expect(await db.bajas.count()).toBe(0)
    const tapones = filasDe('Existencias').find((f) => f['Material'] === 'Tapones Auditivos')
    expect(tapones?.['Total']).toBe(300)
  })

  it('los dos equipos terminan con las mismas existencias', async () => {
    const suma = async (b: BaseEPP) => (await b.movimientos.toArray()).reduce((s, m) => s + m.cantidad, 0)
    expect(await suma(baseB)).toBe(await suma(db))
    expect(await baseB.movimientos.count()).toBe(await db.movimientos.count())
  })
})
