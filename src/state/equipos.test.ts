import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Trabajador } from '../domain/types'
import { ahoraLocal, disponibilidad, guardarEquipo, prestamoVencido, prestarEquipo, registrarRegreso } from './equipos'
import { inicializarSistema } from './servicios'
import * as S from './store'

const persona = (rpe: string, nombre: string): Trabajador => ({
  rpe, nombre, area: 'SEGURIDAD FISICA', puesto: 'OPERADOR', casillero: '', tipo: 'planta', tallas: {}, activo: true, alta: '', actualizado: '',
})
const manana = () => ahoraLocal(new Date(Date.now() + 86400000))

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

  it('presta, impide prestarlo dos veces y registra el regreso con detalle', async () => {
    const eq = S.equipos.value[0]
    const t = S.personal.value.get('T0901')!
    await expect(prestarEquipo({ equipoId: eq.id, trabajador: t, contacto: '', uso: '', vence: manana(), accesorios: [], bitacora: true, observaciones: '' })).rejects.toThrow(/extensión/)
    const p = await prestarEquipo({ equipoId: eq.id, trabajador: t, contacto: '1234', uso: 'Espacio confinado', vence: manana(), accesorios: ['Cargador', 'Estuche'], bitacora: true, observaciones: '' })
    expect(p.folio).toBe('EQ-T1-0001')
    expect(p.usuarioNombre).toBe('Admin')
    expect(disponibilidad(eq, S.prestamosEquipoActivos.value)).toBe('prestado')
    await expect(prestarEquipo({ equipoId: eq.id, trabajador: S.personal.value.get('T0902')!, contacto: '1', uso: '', vence: manana(), accesorios: [], bitacora: false, observaciones: '' })).rejects.toThrow(/ya está prestado/)

    // Falta el estuche: se exige describirlo
    const regreso = { prestamoId: p.id, devolvio: { rpe: 'T0902', nombre: 'TRABAJADOR DOS' }, condicion: 'bueno' as const, accesorios: ['Cargador'], bitacora: true, comentarios: '' }
    await expect(registrarRegreso(regreso)).rejects.toThrow(/Describa/)
    await registrarRegreso({ ...regreso, condicion: 'danado', comentarios: 'Sin estuche y no enciende' })
    const final = S.prestamosEquipo.value.find((x) => x.id === p.id)!
    expect(final.estatus).toBe('DEVUELTO')
    expect(final.regreso?.devolvioNombre).toBe('TRABAJADOR DOS')
    expect(final.ver).toBe(2)
    // Dañado: queda en revisión y no se presta
    expect(S.equipos.value[0].estado).toBe('revision')
    expect(disponibilidad(S.equipos.value[0], S.prestamosEquipoActivos.value)).toBe('revision')
  })

  it('no presta equipos con la calibración vencida y detecta préstamos vencidos', async () => {
    const eq = await guardarEquipo({ codigo: 'HIG-01', nombre: 'Higrómetro', marca: '', modelo: '', serie: '', accesorios: [], llevaBitacora: false, estado: 'operativo', notas: '', activo: true, calibracion: '2020-01-01' })
    expect(disponibilidad(eq, [])).toBe('calibracion')
    await expect(prestarEquipo({ equipoId: eq.id, trabajador: S.personal.value.get('T0901')!, contacto: '1', uso: '', vence: manana(), accesorios: [], bitacora: false, observaciones: '' })).rejects.toThrow(/calibración vencida/)
    expect(prestamoVencido({ estatus: 'ACTIVO', vence: '2026-01-01T08:00' }, '2026-01-01T08:01')).toBe(true)
    expect(prestamoVencido({ estatus: 'DEVUELTO', vence: '2026-01-01T08:00' }, '2026-01-02T08:00')).toBe(false)
  })

  it('solo el encargado de almacén o el administrador edita el catálogo', async () => {
    const antes = S.sesion.value
    S.sesion.value = { ...antes!, rol: 'despachador', esAdmin: false }
    await expect(guardarEquipo({ codigo: 'X', nombre: 'X', marca: '', modelo: '', serie: '', accesorios: [], llevaBitacora: false, estado: 'operativo', notas: '', activo: true })).rejects.toThrow(/encargado/)
    S.sesion.value = antes
  })
})
