import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Trabajador } from '../domain/types'
import {
  actividadesRecientes,
  ahoraLocal,
  condicionDe,
  disponibilidad,
  guardarAjuste,
  guardarEquipo,
  guardarObsEquipo,
  guardarPersonalSI,
  obsOrdenadas,
  personalSIOrdenado,
  prestamoVencido,
  prestarEquipo,
  registrarRegreso,
} from './equipos'
import { inicializarSistema } from './servicios'
import * as S from './store'

const persona = (rpe: string, nombre: string): Trabajador => ({
  rpe, nombre, area: 'SEGURIDAD FISICA', puesto: 'OPERADOR', casillero: '', tipo: 'planta', tallas: {}, activo: true, alta: '', actualizado: '',
})

beforeAll(async () => {
  await inicializarSistema({
    equipo: { codigo: 'T1', nombre: 'Equipo de prueba' },
    admin: { nombre: 'Admin', pin: '1234' },
    demo: false,
    padron: [persona('T0901', 'TRABAJADOR UNO'), persona('T0902', 'TRABAJADOR DOS')],
  })
})

describe('equipos a resguardo', () => {
  it('da de alta equipos sin repetir el código', async () => {
    await guardarEquipo({ codigo: 'exp-01', nombre: 'Explosímetro', marca: 'Marca X', modelo: 'M1', serie: 'S123', accesorios: ['Cargador', 'Estuche', ''], llevaBitacora: true, estado: 'operativo', notas: '', activo: true, calibracion: '2099-01-01' })
    expect(S.equipos.value[0].codigo).toBe('EXP-01')
    expect(S.equipos.value[0].accesorios).toEqual(['Cargador', 'Estuche'])
    await expect(guardarEquipo({ codigo: 'EXP-01', nombre: 'Otro', marca: '', modelo: '', serie: '', accesorios: [], llevaBitacora: false, estado: 'operativo', notas: '', activo: true })).rejects.toThrow(/ya es de otro/)
  })

  it('presta sin teléfono ni plazo, impide prestarlo dos veces y registra la devolución con daño', async () => {
    const eq = S.equipos.value[0]
    const t = S.personal.value.get('T0901')!
    const p = await prestarEquipo({ equipoId: eq.id, trabajador: t, actividad: ' Espacio confinado ', accesorios: ['Cargador', 'Estuche'], bitacora: false })
    expect(p.folio).toBe('EQ-T1-0001')
    expect(p.usuarioNombre).toBe('Admin')
    expect(p.uso).toBe('Espacio confinado')
    expect(p.vence).toBe('')
    expect(p.contacto).toBe('')
    expect(p.entregoSI).toEqual({ id: S.sesion.value!.usuarioId, nombre: 'Admin' }) // sin lista de SI: a nombre de la sesión
    expect(disponibilidad(eq, S.prestamosEquipoActivos.value)).toBe('prestado')
    await expect(prestarEquipo({ equipoId: eq.id, trabajador: S.personal.value.get('T0902')!, accesorios: [], bitacora: false })).rejects.toThrow(/ya está prestado/)

    // Falta el estuche: se anota solo, sin tener que escribirlo
    const regreso = { prestamoId: p.id, devolvio: { rpe: 'T0902', nombre: 'TRABAJADOR DOS' }, accesorios: ['Cargador'], bitacora: false }
    await registrarRegreso({ ...regreso, obs: [{ texto: 'No enciende', tipo: 'dano' }], fotos: ['data:image/jpeg;base64,AAAA'] })
    const final = S.prestamosEquipo.value.find((x) => x.id === p.id)!
    expect(final.estatus).toBe('DEVUELTO')
    expect(final.regreso?.tipo).toBe('devolucion')
    expect(final.regreso?.devolvioNombre).toBe('TRABAJADOR DOS')
    expect(final.regreso?.condicion).toBe('danado')
    expect(final.regreso?.comentarios).toBe('No enciende · Falta: Estuche')
    expect(final.regreso?.fotos?.length).toBe(1)
    expect(final.ver).toBe(2)
    // Dañado: queda en revisión y no se presta
    expect(S.equipos.value[0].estado).toBe('revision')
    expect(disponibilidad(S.equipos.value[0], S.prestamosEquipoActivos.value)).toBe('revision')
    // Lo escrito queda como opción rápida para la próxima vez
    expect(S.obsEquipo.value.some((o) => o.texto === 'No enciende')).toBe(true)
  })

  it('transfiere el equipo de una persona a otra sin pasar por la oficina', async () => {
    const eq = await guardarEquipo({ codigo: 'DET-01', nombre: 'Detector', marca: '', modelo: '', serie: '', accesorios: ['Funda'], llevaBitacora: false, estado: 'operativo', notas: '', activo: true })
    const uno = S.personal.value.get('T0901')!
    const dos = S.personal.value.get('T0902')!
    const p = await prestarEquipo({ equipoId: eq.id, trabajador: uno, actividad: 'Revisión de ductos', accesorios: ['Funda'], bitacora: true })
    await expect(registrarRegreso({ prestamoId: p.id, devolvio: uno, accesorios: ['Funda'], bitacora: true, transferirA: { trabajador: uno } })).rejects.toThrow(/otra persona/)
    const { siguiente } = await registrarRegreso({ prestamoId: p.id, devolvio: uno, accesorios: ['Funda'], bitacora: true, obs: [{ texto: 'Sin novedad', tipo: 'ok' }], transferirA: { trabajador: dos } })
    expect(siguiente?.rpe).toBe('T0902')
    expect(siguiente?.origenId).toBe(p.id)
    expect(siguiente?.uso).toBe('Revisión de ductos')
    expect(siguiente?.bitacora).toBe(true)
    const cerrado = S.prestamosEquipo.value.find((x) => x.id === p.id)!
    expect(cerrado.regreso?.tipo).toBe('transferencia')
    expect(cerrado.regreso?.siguienteId).toBe(siguiente?.id)
    // Sigue prestado, ahora a la otra persona, y no se pierde el seguimiento
    const activos = S.prestamosEquipoActivos.value.filter((x) => x.equipoId === eq.id)
    expect(activos.map((x) => x.rpe)).toEqual(['T0902'])
    expect(new Set(S.prestamosEquipo.value.map((x) => x.folio)).size).toBe(S.prestamosEquipo.value.length)
    await registrarRegreso({ prestamoId: siguiente!.id, devolvio: dos, accesorios: ['Funda'], bitacora: false })
    expect(disponibilidad(eq, S.prestamosEquipoActivos.value)).toBe('disponible')
    // Faltó la libreta: queda anotado y la condición pasa a «con detalle»
    expect(S.prestamosEquipo.value.find((x) => x.id === siguiente!.id)?.regreso?.condicion).toBe('detalle')
  })

  it('exige elegir a quien de Seguridad Industrial atiende cuando hay lista, y los ordena por uso reciente', async () => {
    const admin = S.sesion.value!
    const e = (rpe: string) => S.personal.value.get(rpe)!
    await expect(guardarPersonalSI({ rpe: 'NOEXISTE', corto: 'Nadie', activo: true })).rejects.toThrow(/padrón/)
    const ana = await guardarPersonalSI({ rpe: 'T0901', corto: 'Uno', usuarioId: admin.usuarioId, activo: true })
    const beto = await guardarPersonalSI({ rpe: 'T0902', corto: 'Dos', activo: true })
    expect(ana.nombre).toBe('TRABAJADOR UNO')
    await expect(guardarPersonalSI({ rpe: 'T0901', corto: 'Otro', activo: true })).rejects.toThrow(/ya está en la lista/)
    const eq = S.equipos.value.find((x) => x.codigo === 'DET-01')!
    await expect(prestarEquipo({ equipoId: eq.id, trabajador: e('T0901'), accesorios: [], bitacora: false })).rejects.toThrow(/Elija quién de Seguridad Industrial/)
    // Sin uso previo se ordenan por nombre corto
    expect(personalSIOrdenado(S.personalSI.value, S.prestamosEquipo.value).map((x) => x.corto)).toEqual(['Dos', 'Uno'])
    const p = await prestarEquipo({ equipoId: eq.id, trabajador: e('T0901'), accesorios: [], bitacora: false, entregoSIId: ana.id })
    expect(p.entregoSI).toEqual({ id: ana.id, nombre: 'TRABAJADOR UNO', corto: 'Uno' })
    // Quien atendió más recientemente va primero
    expect(personalSIOrdenado(S.personalSI.value, S.prestamosEquipo.value).map((x) => x.corto)).toEqual(['Uno', 'Dos'])
    await registrarRegreso({ prestamoId: p.id, devolvio: e('T0901'), accesorios: [], bitacora: false, recibioSIId: beto.id })
    expect(personalSIOrdenado(S.personalSI.value, S.prestamosEquipo.value).map((x) => x.corto)).toEqual(['Dos', 'Uno'])
    await expect(registrarRegreso({ prestamoId: p.id, devolvio: e('T0901'), accesorios: [], bitacora: false })).rejects.toThrow(/ya no está activo/)
  })

  it('observaciones rápidas: gravedad, orden por uso y actividades recientes', async () => {
    expect(condicionDe([])).toBe('bueno')
    expect(condicionDe([{ texto: 'a', tipo: 'ok' }])).toBe('bueno')
    expect(condicionDe([{ texto: 'a', tipo: 'detalle' }, { texto: 'b', tipo: 'ok' }])).toBe('detalle')
    expect(condicionDe([{ texto: 'a', tipo: 'detalle' }, { texto: 'b', tipo: 'dano' }])).toBe('danado')
    await expect(guardarObsEquipo({ texto: 'sin novedad', tipo: 'ok', activo: true })).rejects.toThrow(/Ya existe/)
    const o = await guardarObsEquipo({ texto: 'Correa floja', tipo: 'detalle', activo: true })
    await guardarObsEquipo({ ...o, activo: false })
    expect(obsOrdenadas(S.obsEquipo.value, S.prestamosEquipo.value).some((x) => x.texto === 'Correa floja')).toBe(false)
    // «No enciende» ya se usó en un regreso, así que va antes que las demás de daño
    const orden = obsOrdenadas(S.obsEquipo.value, S.prestamosEquipo.value).map((x) => x.texto)
    expect(orden.indexOf('No enciende')).toBeLessThan(orden.indexOf('Pantalla dañada'))
    expect(actividadesRecientes(S.prestamosEquipo.value)[0]).toBe('Revisión de ductos')
  })

  it('el equipo se alerta por tiempo fuera y el administrador cambia el límite', async () => {
    const hace = (h: number) => new Date(Date.now() - h * 3600000).toISOString()
    const ahora = ahoraLocal()
    expect(prestamoVencido({ estatus: 'ACTIVO', vence: '', ts: hace(25) }, ahora)).toBe(true)
    expect(prestamoVencido({ estatus: 'ACTIVO', vence: '', ts: hace(5) }, ahora)).toBe(false)
    expect(prestamoVencido({ estatus: 'ACTIVO', vence: '', ts: hace(500) }, ahora, 0)).toBe(false) // 0 = sin alerta
    expect(prestamoVencido({ estatus: 'DEVUELTO', vence: '', ts: hace(500) }, ahora)).toBe(false)
    // Los préstamos anteriores, con fecha de regreso, se siguen evaluando con ella
    expect(prestamoVencido({ estatus: 'ACTIVO', vence: '2026-01-01T08:00', ts: hace(1) }, '2026-01-01T08:01')).toBe(true)
    await guardarAjuste('horasAlertaEquipo', 2)
    const { horasAlerta } = await import('./equipos')
    expect(horasAlerta()).toBe(2)
    expect(prestamoVencido({ estatus: 'ACTIVO', vence: '', ts: hace(3) }, ahora)).toBe(true)
    const antes = S.sesion.value
    S.sesion.value = { ...antes!, rol: 'almacen', esAdmin: false }
    await expect(guardarAjuste('horasAlertaEquipo', 9)).rejects.toThrow(/administrador/)
    S.sesion.value = antes
    await guardarAjuste('horasAlertaEquipo', 24)
  })

  it('solo administrador y almacén corrigen la hora, y no puede ser futura', async () => {
    const eq = S.equipos.value.find((x) => x.codigo === 'DET-01')!
    const t = S.personal.value.get('T0901')!
    const hace3 = ahoraLocal(new Date(Date.now() - 3 * 3600000))
    const antes = S.sesion.value
    S.sesion.value = { ...antes!, rol: 'despachador', esAdmin: false }
    await expect(prestarEquipo({ equipoId: eq.id, trabajador: t, accesorios: [], bitacora: false, entregoSIId: S.personalSI.value[0].id, fechaHora: hace3 })).rejects.toThrow(/administrador o el encargado/)
    S.sesion.value = antes
    await expect(prestarEquipo({ equipoId: eq.id, trabajador: t, accesorios: [], bitacora: false, entregoSIId: S.personalSI.value[0].id, fechaHora: ahoraLocal(new Date(Date.now() + 3 * 3600000)) })).rejects.toThrow(/posteriores/)
    const p = await prestarEquipo({ equipoId: eq.id, trabajador: t, accesorios: [], bitacora: false, entregoSIId: S.personalSI.value[0].id, fechaHora: hace3 })
    expect(new Date(p.ts).getTime()).toBeLessThan(Date.now() - 2.9 * 3600000)
    expect(p.capturada).toBeTruthy()
    // La devolución no puede ser anterior a la salida
    await expect(registrarRegreso({ prestamoId: p.id, devolvio: t, accesorios: [], bitacora: false, recibioSIId: S.personalSI.value[0].id, fechaHora: ahoraLocal(new Date(Date.now() - 5 * 3600000)) })).rejects.toThrow(/anterior a la salida/)
    await registrarRegreso({ prestamoId: p.id, devolvio: t, accesorios: [], bitacora: false, recibioSIId: S.personalSI.value[0].id })
  })

  it('no presta equipos con la calibración vencida', async () => {
    const eq = await guardarEquipo({ codigo: 'HIG-01', nombre: 'Higrómetro', marca: '', modelo: '', serie: '', accesorios: [], llevaBitacora: false, estado: 'operativo', notas: '', activo: true, calibracion: '2020-01-01' })
    expect(disponibilidad(eq, [])).toBe('calibracion')
    await expect(prestarEquipo({ equipoId: eq.id, trabajador: S.personal.value.get('T0901')!, accesorios: [], bitacora: false })).rejects.toThrow(/calibración vencida/)
  })

  it('solo el encargado de almacén o el administrador edita el catálogo', async () => {
    const antes = S.sesion.value
    S.sesion.value = { ...antes!, rol: 'despachador', esAdmin: false }
    await expect(guardarEquipo({ codigo: 'X', nombre: 'X', marca: '', modelo: '', serie: '', accesorios: [], llevaBitacora: false, estado: 'operativo', notas: '', activo: true })).rejects.toThrow(/encargado/)
    S.sesion.value = antes
  })

  it('el QR identifica al equipo aunque el escáner cambie los guiones', async () => {
    const { equipoPorLectura, textoQr } = await import('../domain/equipoQr')
    const exp1 = await guardarEquipo({ codigo: 'EXP-1', nombre: '3M Detector', marca: 'Marca Ñ', modelo: 'M/2', serie: 'S-9', accesorios: [], llevaBitacora: false, estado: 'operativo', notas: '', activo: true })
    const exp13 = await guardarEquipo({ codigo: 'EXP-13', nombre: 'Explosímetro', marca: '', modelo: '', serie: '', accesorios: [], llevaBitacora: false, estado: 'operativo', notas: '', activo: true })
    const qr = textoQr(exp1)
    expect(qr).toBe('EXP-1 EQ 3M Detector Marca N M 2 Serie S 9 CFE Laguna Verde Seguridad Industrial')
    const lista = S.equipos.value
    expect(equipoPorLectura(qr, lista)?.id).toBe(exp1.id)
    // Un lector con teclado en español escribe ' en lugar de -
    expect(equipoPorLectura(qr.replace(/-/g, "'"), lista)?.id).toBe(exp1.id)
    expect(equipoPorLectura(textoQr(exp13), lista)?.id).toBe(exp13.id)
    expect(equipoPorLectura('exp 13', lista)?.id).toBe(exp13.id)
    expect(equipoPorLectura('NADA', lista)).toBeUndefined()
    await expect(guardarEquipo({ codigo: 'EXP 1', nombre: 'Otro', marca: '', modelo: '', serie: '', accesorios: [], llevaBitacora: false, estado: 'operativo', notas: '', activo: true })).rejects.toThrow(/ya es de otro/)
  })

  it('guarda y quita la foto del equipo', async () => {
    const eq = S.equipos.value.find((e) => e.codigo === 'EXP-13')!
    const conFoto = await guardarEquipo(eq, 'data:image/jpeg;base64,AAAA')
    expect(S.fotos.value.get(conFoto.fotoId!)).toBe('data:image/jpeg;base64,AAAA')
    const sinFoto = await guardarEquipo(conFoto, null)
    expect(sinFoto.fotoId).toBeUndefined()
    expect(S.fotos.value.has(conFoto.fotoId!)).toBe(false)
  })
})
