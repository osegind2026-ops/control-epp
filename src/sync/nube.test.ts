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

  it('los préstamos llegan a la hoja y los vencidos generan el aviso por correo', async () => {
    const hoy = new Date().toISOString().slice(0, 10)
    const supervisor = { nombre: 'SUPERVISOR PRUEBA', rpe: 'S0002', extension: '7788' }
    const { entrega } = await registrarEntrega(S.personal.value.get('T0901')!, [{ materialId: 'arnes_cuerpo', varianteId: '', cantidad: 1 }], '', { supervisor, vence: hoy })
    // Simular que la fecha límite ya pasó
    const prestamo = (await db.resguardos.where('entregaId').equals(entrega.id).first())!
    await db.resguardos.put({ ...prestamo, vence: '2026-01-05' })
    cfgA.cursor = (await sincronizar(db, cfgA, servidor.transporte)).cursor

    const fila = filasDe('Resguardos').find((f) => f['Tipo'] === 'PRÉSTAMO')
    expect(fila?.['Ext. supervisor']).toBe('7788')
    expect(servidor.enviarAvisos()).toMatch(/Aviso enviado/)
    const correo = servidor.correos.at(-1)!
    expect(correo.subject).toMatch(/1 préstamo vencido/)
    expect(correo.htmlBody).toContain('SUPERVISOR PRUEBA (RPE S0002, ext. 7788)')
    expect(correo.htmlBody).toContain('2026-01-05')
    servidor.activarAvisosDiarios()
    servidor.activarAvisosDiarios()
    expect(servidor.disparadores).toEqual(['enviarAvisos'])
  })

  it('los equipos a resguardo y su bitácora se sincronizan y avisan si no regresan', async () => {
    const { guardarEquipo, prestarEquipo } = await import('../state/equipos')
    const eq = await guardarEquipo({ codigo: 'EXP-09', nombre: 'Explosímetro', marca: 'Marca', modelo: 'M', serie: 'S9', accesorios: ['Cargador'], llevaBitacora: true, estado: 'operativo', notas: '', activo: true, calibracion: '2020-02-02' })
    // Calibración al día para poder prestarlo; la vencida se prueba en el aviso
    await guardarEquipo({ ...eq, calibracion: '2099-01-01' })
    const p = await prestarEquipo({ equipoId: eq.id, trabajador: S.personal.value.get('T0901')!, contacto: 'Ext. 4455', uso: 'Tanque', vence: '2099-01-01T08:00', accesorios: ['Cargador'], bitacora: true, observaciones: '' })
    await db.prestamosEquipo.put({ ...p, vence: '2026-01-05T08:00' })
    cfgA.cursor = (await sincronizar(db, cfgA, servidor.transporte)).cursor
    expect(filasDe('Equipos a resguardo')[0]['Código']).toBe('EXP-09')
    expect(filasDe('Bitácora equipos')[0]['Contacto']).toBe('Ext. 4455')
    cfgB.cursor = (await sincronizar(baseB, cfgB, servidor.transporte)).cursor
    expect((await baseB.prestamosEquipo.get(p.id))?.nombre).toBe('TRABAJADOR DE PRUEBA')
    servidor.enviarAvisos()
    const correo = servidor.correos.at(-1)!
    expect(correo.subject).toMatch(/1 equipo sin devolver/)
    expect(correo.htmlBody).toContain('EXP-09')
  })

  it('con un servidor sin actualizar, los equipos quedan pendientes sin trabar la sincronización', async () => {
    const viejo: typeof servidor.transporte = async (url, cuerpo) => {
      const c = cuerpo as { cambios?: { tabla: string }[] }
      const conocidos = (c.cambios ?? []).filter((x) => x.tabla !== 'equipos' && x.tabla !== 'prestamosEquipo')
      const desconocidas = [...new Set((c.cambios ?? []).filter((x) => !conocidos.includes(x)).map((x) => x.tabla))]
      const r = (await servidor.transporte(url, { ...c, cambios: conocidos })) as { errores?: string[] }
      return { ...r, errores: [...(r.errores ?? []), ...desconocidas.map((t) => 'Tabla desconocida: ' + t)] }
    }
    const { guardarEquipo } = await import('../state/equipos')
    await guardarEquipo({ codigo: 'HIG-09', nombre: 'Higrómetro', marca: '', modelo: '', serie: '', accesorios: [], llevaBitacora: false, estado: 'operativo', notas: '', activo: true })
    const r = await sincronizar(db, cfgA, viejo)
    cfgA.cursor = r.cursor
    expect(r.errores.join(' ')).toMatch(/actualizarse/)
    expect(await db.equipos.where('_mod').above(0).count()).toBe(1)
    // Ya con el servidor nuevo, se sube
    cfgA.cursor = (await sincronizar(db, cfgA, servidor.transporte)).cursor
    expect(await contarPendientes(db)).toBe(0)
  })
})
