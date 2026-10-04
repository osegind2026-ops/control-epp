import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import type { Entrega } from '../domain/types'
import { detectarFoliosRepetidos, recibirIntercambio } from './intercambio'
import { armarRespaldo } from './respaldo'
import { cambiarMiPin, esperaPin, guardarUsuario, inicializarSistema, iniciarSesion, restablecerPin } from './servicios'
import * as S from './store'

const usuario = (nombre: string) => S.usuarios.value.find((u) => u.nombre === nombre)!

beforeAll(async () => {
  await inicializarSistema({ equipo: { codigo: 'T1', nombre: 'Prueba' }, admin: { nombre: 'Admin', pin: '1234' }, demo: false, padron: [] })
})

describe('gestión de usuarios', () => {
  it('el administrador da de alta con PIN temporal y el usuario debe cambiarlo al entrar', async () => {
    await guardarUsuario({ nombre: 'Despachador Uno', rol: 'despachador', activo: true, pin: '4821' })
    await expect(guardarUsuario({ nombre: 'despachador uno', rol: 'despachador', activo: true, pin: '1111' })).rejects.toThrow(/Ya existe/)
    const admin = S.sesion.value
    expect(iniciarSesion(usuario('Despachador Uno'), '4821')).toBe(true)
    expect(S.sesion.value?.debeCambiarPin).toBe(true)
    await expect(cambiarMiPin('4821', '1111')).rejects.toThrow(/obvio/)
    await expect(cambiarMiPin('0000', '7392')).rejects.toThrow(/actual/)
    await cambiarMiPin('4821', '7392')
    expect(S.sesion.value?.debeCambiarPin).toBe(false)
    expect(iniciarSesion(usuario('Despachador Uno'), '7392')).toBe(true)
    // Un despachador no administra usuarios
    await expect(restablecerPin(usuario('Admin').id)).rejects.toThrow(/administrador/)
    S.sesion.value = admin
  })

  it('restablece un PIN olvidado con uno temporal de 4 números', async () => {
    const pin = await restablecerPin(usuario('Despachador Uno').id)
    expect(pin).toMatch(/^\d{4}$/)
    expect(iniciarSesion(usuario('Despachador Uno'), '7392')).toBe(false)
    const admin = S.sesion.value
    expect(iniciarSesion(usuario('Despachador Uno'), pin)).toBe(true)
    expect(S.sesion.value?.debeCambiarPin).toBe(true)
    S.sesion.value = admin
  })

  it('bloquea un minuto tras 5 PIN incorrectos', () => {
    const u = usuario('Despachador Uno')
    for (let i = 0; i < 5; i++) iniciarSesion(u, '000000')
    expect(esperaPin(u.id)).toBeGreaterThan(50)
    expect(iniciarSesion(u, '000000')).toBe(false)
  })
})

describe('intercambio por archivo', () => {
  it('combina lo del otro lado y lo deja pendiente de subir', async () => {
    const r = await armarRespaldo()
    const ajeno = { id: 'E-ajena', folio: 'CFE-C1-0001', rpe: 'X', estado: 'registrada', lineas: [] } as unknown as Entrega
    const choque = { id: 'E-otra', folio: 'CFE-T1-0001', rpe: 'X', estado: 'registrada', lineas: [] } as unknown as Entrega
    const archivo = { ...r, equipoOrigen: { codigo: 'C1', nombre: 'Celular' }, datos: { ...r.datos, entregas: [ajeno] } }
    const res = await recibirIntercambio(JSON.stringify(archivo))
    expect(res.origen).toBe('C1')
    expect(res.nuevos.entregas).toBe(1)
    expect(((await db.entregas.get('E-ajena')) as unknown as { _mod: number })._mod).toBeGreaterThan(0)
    // Un registro que ya existía y llega más nuevo también queda pendiente de subir
    const mat = (await db.materiales.get('casco'))!
    await db.materiales.put({ ...mat, _remoto: true } as typeof mat)
    const otro = { ...r, datos: { materiales: [{ ...mat, nombre: 'Casco renombrado', actualizado: '2099-01-01T00:00:00.000Z' }] } }
    await recibirIntercambio(JSON.stringify(otro))
    const casco = (await db.materiales.get('casco')) as unknown as { nombre: string; _mod: number }
    expect(casco.nombre).toBe('Casco renombrado')
    expect(casco._mod).toBeGreaterThan(0)
    expect(detectarFoliosRepetidos([{ id: 'E-mia', folio: 'CFE-T1-0001' }], [choque])).toEqual(['CFE-T1-0001'])
  })
})

describe('tipo de trabajador y recurrencia', () => {
  it('asigna el tipo por el RPE y solo almacén o administrador lo corrige', async () => {
    const { guardarTrabajador, registrarEntrega } = await import('./servicios')
    const { tipoDe, materialesRecurrentes, entregasPrevias } = await import('../domain/logica')
    const { solicitantesRecurrentes } = await import('../reportes/datos')
    const base = { area: 'TALLER', puesto: 'OPERADOR', casillero: '', activo: true }
    const perm = await guardarTrabajador({ ...base, rpe: '9zz01', nombre: 'Permanente Prueba' })
    const even = await guardarTrabajador({ ...base, rpe: 'zz902', nombre: 'Eventual Prueba' })
    expect(tipoDe(perm)).toBe('permanente')
    expect(tipoDe(even)).toBe('eventual')
    const temporal = await guardarTrabajador({ ...even, tipo: 'temporal' })
    expect(temporal.tipo).toBe('temporal')
    expect(temporal.tipoManual).toBe(true)
    const admin = S.sesion.value
    S.sesion.value = { ...admin!, rol: 'despachador', esAdmin: false }
    await expect(guardarTrabajador({ ...temporal, tipo: 'permanente' })).rejects.toThrow(/almacén/)
    // Editar otros datos sin tocar el tipo sí se permite
    expect((await guardarTrabajador({ ...temporal, puesto: 'AYUDANTE' })).tipo).toBe('temporal')
    S.sesion.value = admin

    // Recurrencia: a la tercera entrega del mismo consumible en 30 días se marca y guarda el comentario
    await db.movimientos.add({ id: 'M-ini', ts: new Date().toISOString(), tipo: 'INICIAL', materialId: 'tapones', varianteId: '', ubicacionId: 'ubi_despacho', cantidad: 50, ref: '', motivo: '', nota: '', usuarioId: 'x', usuarioNombre: 'x', equipo: 'T1' })
    await S.recargar('movimientos')
    const linea = [{ materialId: 'tapones', varianteId: '', cantidad: 1 }]
    const e1 = (await registrarEntrega(even, linea, '')).entrega
    const e2 = (await registrarEntrega(even, linea, '')).entrega
    expect(e1.recurrencia ?? e2.recurrencia).toBeUndefined()
    expect(materialesRecurrentes(S.entregas.value, even.rpe, ['tapones'], e2.fecha)[0].previas).toHaveLength(2)
    const e3 = (await registrarEntrega(even, linea, '', undefined, 'Se le rompieron')).entrega
    expect(e3.recurrencia).toEqual({ materiales: ['tapones'], nota: 'Se le rompieron' })
    expect(entregasPrevias(S.entregas.value, even.rpe, 'tapones').map((p) => p.entrega.id)).toContain(e1.id)

    const rec = solicitantesRecurrentes(S.entregas.value, S.materialesPorId.value, S.personal.value)
    const fila = rec.find((r) => r.rpe === even.rpe && r.materialId === 'tapones')!
    expect(fila.veces).toBe(3)
    expect(fila.tipo).toBe('Temporal')
    expect(fila.notas).toEqual(['Se le rompieron'])
  })
})
