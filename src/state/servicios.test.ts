import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { existencia } from '../domain/logica'
import type { Trabajador } from '../domain/types'
import { armarRespaldo, csvLibroMaestro, importarRespaldo, leerPadronCSV } from './respaldo'
import {
  ajustarExistencia,
  anularEntrega,
  deshacerEntrega,
  devolverResguardo,
  inicializarSistema,
  registrarEntrega,
  traspasar,
} from './servicios'
import * as S from './store'

const trabajador: Trabajador = {
  rpe: 'T0901',
  nombre: 'TRABAJADOR DE PRUEBA',
  area: 'MANTENIMIENTO ELÉCTRICO',
  puesto: 'OPERADOR',
  casillero: '',
  tipo: 'planta',
  tallas: {},
  activo: true,
  alta: '',
  actualizado: '',
}

const stock = (m: string, v = '', u = 'ubi_despacho') => existencia(S.existencias.value, m, v, u)
const persona = () => S.personal.value.get('T0901')!

beforeAll(async () => {
  await inicializarSistema({
    equipo: { codigo: 'T1', nombre: 'Equipo de prueba' },
    admin: { nombre: 'Admin', pin: '1234' },
    demo: true,
    padron: [trabajador],
  })
})

describe('despacho', () => {
  it('descuenta existencias, abre resguardos y recuerda tallas', async () => {
    const { entrega } = await registrarEntrega(
      persona(),
      [
        { materialId: 'casco', varianteId: '', cantidad: 1, motivoId: 'ent_primera' },
        { materialId: 'g_hyflex', varianteId: '8', cantidad: 2 },
      ],
      '',
    )
    expect(entrega.folio).toBe('CFE-T1-0001')
    expect(stock('casco')).toBe(79)
    expect(stock('g_hyflex', '8')).toBe(28)
    expect(S.resguardosActivos.value.filter((r) => r.rpe === 'T0901').map((r) => r.materialId)).toEqual(['casco'])
    expect(persona().tallas.g_hyflex).toBe('8')
  })

  it('exige talla y motivo', async () => {
    await expect(registrarEntrega(persona(), [{ materialId: 'g_hyflex', varianteId: '', cantidad: 1 }], '')).rejects.toThrow(/talla/)
    await expect(registrarEntrega(persona(), [{ materialId: 'faja', varianteId: 'GDE', cantidad: 1 }], '')).rejects.toThrow(/motivo/)
  })

  it('cambio de talla cierra el resguardo anterior y reingresa la pieza', async () => {
    await registrarEntrega(persona(), [{ materialId: 'faja', varianteId: 'MED', cantidad: 1, motivoId: 'ent_primera' }], '')
    expect(stock('faja', 'MED')).toBe(19)
    await registrarEntrega(persona(), [{ materialId: 'faja', varianteId: 'GDE', cantidad: 1, motivoId: 'ent_talla' }], '')
    expect(stock('faja', 'MED')).toBe(20)
    expect(stock('faja', 'GDE')).toBe(24)
    const fajas = S.resguardos.value.filter((r) => r.materialId === 'faja')
    expect(fajas.map((r) => `${r.varianteId}:${r.estatus}`)).toEqual(['MED:CERRADO', 'GDE:ACTIVO'])
  })

  it('deshacer revierte todo, incluido el folio', async () => {
    const antes = stock('lentes_claros')
    const { deshacer } = await registrarEntrega(persona(), [{ materialId: 'lentes_claros', varianteId: '', cantidad: 3 }], '')
    expect(stock('lentes_claros')).toBe(antes - 3)
    await deshacerEntrega(deshacer)
    expect(stock('lentes_claros')).toBe(antes)
    const { entrega } = await registrarEntrega(persona(), [{ materialId: 'lentes_claros', varianteId: '', cantidad: 1 }], '')
    expect(entrega.folio).toBe('CFE-T1-0004')
  })

  it('anular regresa existencias y reabre el resguardo que se había cerrado', async () => {
    const cambio = S.entregas.value.find((e) => e.lineas.some((l) => l.motivoId === 'ent_talla'))!
    await anularEntrega(cambio.id, 'anu_error', 'prueba')
    expect(stock('faja', 'GDE')).toBe(25)
    expect(stock('faja', 'MED')).toBe(19)
    const fajas = S.resguardos.value.filter((r) => r.materialId === 'faja')
    expect(fajas.map((r) => `${r.varianteId}:${r.estatus}`)).toEqual(['MED:ACTIVO', 'GDE:ANULADO'])
  })
})

describe('almacén y devoluciones', () => {
  it('devolución en buen estado reingresa', async () => {
    const casco = S.resguardosActivos.value.find((r) => r.materialId === 'casco')!
    await devolverResguardo(casco.id, 'dev_bueno', '')
    expect(stock('casco')).toBe(80)
  })

  it('ajuste y traspaso entre ubicaciones', async () => {
    const dif = await ajustarExistencia({ materialId: 'tapones', varianteId: '', ubicacionId: 'ubi_despacho', conteo: 290, motivoId: 'aju_conteo', nota: '' })
    expect(dif).toBe(-10)
    await traspasar({ materialId: 'tapones', varianteId: '', origenId: 'ubi_despacho', destinoId: 'ubi_2', cantidad: 40, nota: '' })
    expect(stock('tapones')).toBe(250)
    expect(stock('tapones', '', 'ubi_2')).toBe(40)
    await expect(traspasar({ materialId: 'tapones', varianteId: '', origenId: 'ubi_2', destinoId: 'ubi_3', cantidad: 41, nota: '' })).rejects.toThrow(/Solo hay 40/)
  })
})

describe('exportación e importación', () => {
  it('CSV del libro maestro respeta el orden de columnas de la macro', () => {
    const csv = csvLibroMaestro(S.entregas.value).replace(/^﻿/, '').trim().split('\n')
    const enc = csv[0].split(',')
    expect(enc[10]).toBe('CASCO')
    expect(enc[24]).toBe('FAJA_LUMBAR_MED')
    const primera = csv[1].split('","')
    expect(primera[0]).toBe('"CFE-T1-0001')
    const valores = csv[1].split(',').slice(-20)
    expect(valores[0]).toBe('1') // casco
    expect(valores[5]).toBe('2') // hyflex (todas las tallas)
  })

  it('combinar un respaldo no duplica registros', async () => {
    const r = await armarRespaldo()
    const total = S.movimientos.value.length
    const resumen = await importarRespaldo(r, 'combinar')
    expect(resumen.agregados).toEqual({})
    expect(S.movimientos.value.length).toBe(total)
  })

  it('lee el padrón en formato de la semilla', () => {
    const lista = leerPadronCSV('﻿rpe,nombre,area,puesto,casillero\nX1234,PERSONA EJEMPLO,PROCESO QUÍMICO,OPERADOR / TÉCNICO,\n"X1","PEREZ, JUAN",INFRA,,12')
    expect(lista.map((t) => `${t.rpe}|${t.nombre}|${t.area}|${t.casillero}`)).toEqual([
      'X1234|PERSONA EJEMPLO|PROCESO QUÍMICO|',
      'X1|PEREZ, JUAN|INFRA|12',
    ])
  })
})
