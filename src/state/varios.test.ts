import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { existencia } from '../domain/logica'
import type { Trabajador } from '../domain/types'
import { disponibilidad, guardarEquipo, prestarEquipos, registrarRegresos } from './equipos'
import { devolverResguardos, inicializarSistema, registrarEntrega } from './servicios'
import * as S from './store'

// Datos ficticios
const persona = (rpe: string, nombre: string): Trabajador => ({
  rpe, nombre, area: 'MANTENIMIENTO MECÁNICO', puesto: 'OPERADOR', casillero: '', tipo: 'planta', tallas: {}, activo: true, alta: '', actualizado: '',
})
const stock = (m: string, v = '') => existencia(S.existencias.value, m, v, 'ubi_despacho')

beforeAll(async () => {
  await inicializarSistema({
    equipo: { codigo: 'T1', nombre: 'Equipo de prueba' },
    admin: { nombre: 'Admin', pin: '1234' },
    demo: true,
    padron: [persona('T0901', 'TRABAJADOR UNO'), persona('T0902', 'TRABAJADOR DOS'), persona('T0903', 'TRABAJADOR TRES')],
  })
  for (const c of ['EXP-01', 'EXP-02', 'HIG-01']) {
    await guardarEquipo({ codigo: c, nombre: c.startsWith('EXP') ? 'Explosímetro' : 'Higrómetro', marca: '', modelo: '', serie: '', accesorios: ['Cargador', 'Estuche'], llevaBitacora: true, estado: 'operativo', notas: '', activo: true })
  }
})

const eq = (codigo: string) => S.equipos.value.find((e) => e.codigo === codigo)!
const t = (rpe: string) => S.personal.value.get(rpe)!

describe('varios equipos a resguardo en un solo paso', () => {
  it('presta varios a una persona de la planta: un folio por equipo y cada uno con su estado', async () => {
    const lista = await prestarEquipos({
      trabajador: t('T0901'),
      actividad: 'Prueba de tanque',
      renglones: [
        { equipoId: eq('EXP-01').id, accesorios: ['Cargador', 'Estuche'], bitacora: false },
        { equipoId: eq('EXP-02').id, accesorios: ['Cargador'], bitacora: true, obs: [{ texto: 'Rayones o golpes leves', tipo: 'detalle' }] },
      ],
    })
    expect(lista.map((p) => p.folio)).toEqual(['EQ-T1-0001', 'EQ-T1-0002'])
    expect(lista.every((p) => p.rpe === 'T0901' && p.uso === 'Prueba de tanque' && p.ts === lista[0].ts)).toBe(true)
    expect(lista[0].observaciones).toBe('')
    expect(lista[1]).toMatchObject({ accesorios: ['Cargador'], bitacora: true, condicionSalida: 'detalle' })
    expect(disponibilidad(eq('EXP-02'), S.prestamosEquipoActivos.value)).toBe('prestado')
  })

  it('si uno no se puede prestar no se registra ninguno', async () => {
    const antes = S.prestamosEquipo.value.length
    await expect(
      prestarEquipos({
        trabajador: t('T0902'),
        renglones: [
          { equipoId: eq('HIG-01').id, accesorios: [], bitacora: false },
          { equipoId: eq('EXP-01').id, accesorios: [], bitacora: false },
        ],
      }),
    ).rejects.toThrow(/EXP-01 ya está prestado/)
    await expect(prestarEquipos({ trabajador: t('T0902'), renglones: [{ equipoId: eq('HIG-01').id, accesorios: [], bitacora: false }, { equipoId: eq('HIG-01').id, accesorios: [], bitacora: false }] })).rejects.toThrow(/repetido/)
    expect(S.prestamosEquipo.value.length).toBe(antes)
    expect(disponibilidad(eq('HIG-01'), S.prestamosEquipoActivos.value)).toBe('disponible')
  })

  it('transfiere varios juntos y luego devuelve equipos de dos personas en un paso', async () => {
    await prestarEquipos({ trabajador: t('T0903'), renglones: [{ equipoId: eq('HIG-01').id, accesorios: ['Cargador', 'Estuche'], bitacora: false }] })
    const deUno = S.prestamosEquipoActivos.value.filter((p) => p.rpe === 'T0901')
    await expect(registrarRegresos({ transferirA: { trabajador: t('T0901') }, renglones: deUno.map((p) => ({ prestamoId: p.id, accesorios: p.accesorios, bitacora: p.bitacora })) })).rejects.toThrow(/otra persona/)
    const { siguientes } = await registrarRegresos({ transferirA: { trabajador: t('T0902') }, renglones: deUno.map((p) => ({ prestamoId: p.id, accesorios: p.accesorios, bitacora: p.bitacora })) })
    // Salieron a la misma hora: el orden de la lista no importa
    expect(siguientes.map((p) => `${p.equipoCodigo}:${p.rpe}:${p.uso}`).sort()).toEqual(['EXP-01:T0902:Prueba de tanque', 'EXP-02:T0902:Prueba de tanque'])
    expect(new Set(siguientes.map((p) => p.folio)).size).toBe(2)

    // Devolución de equipos de T0902 y T0903 juntos: uno con daño queda en revisión, otro sin comentarios
    const fuera = S.prestamosEquipoActivos.value
    expect(fuera.length).toBe(3)
    const hig = fuera.find((p) => p.equipoCodigo === 'HIG-01')!
    const exp1 = fuera.find((p) => p.equipoCodigo === 'EXP-01')!
    const exp2 = fuera.find((p) => p.equipoCodigo === 'EXP-02')!
    await registrarRegresos({
      renglones: [
        { prestamoId: hig.id, accesorios: ['Cargador'], bitacora: false },
        { prestamoId: exp1.id, accesorios: exp1.accesorios, bitacora: false, obs: [{ texto: 'No enciende', tipo: 'dano' }] },
        { prestamoId: exp2.id, accesorios: exp2.accesorios, bitacora: exp2.bitacora },
      ],
    })
    expect(S.prestamosEquipoActivos.value.length).toBe(0)
    const cierre = (id: string) => S.prestamosEquipo.value.find((p) => p.id === id)!.regreso!
    expect(cierre(hig.id)).toMatchObject({ devolvioRpe: 'T0903', condicion: 'detalle', comentarios: 'Falta: Estuche' })
    expect(cierre(exp1.id)).toMatchObject({ devolvioRpe: 'T0902', condicion: 'danado' })
    expect(cierre(exp2.id)).toMatchObject({ condicion: 'bueno', comentarios: '' })
    expect(eq('EXP-01').estado).toBe('revision')
    expect(eq('EXP-02').estado).toBe('operativo')
  })
})

describe('devolución de varios materiales en resguardo o prestados', () => {
  it('recibe varios juntos, cada uno con su estado; si uno falla no se cierra ninguno', async () => {
    await registrarEntrega(
      t('T0901'),
      [
        { materialId: 'casco', varianteId: '', cantidad: 1, motivoId: 'ent_primera' },
        { materialId: 'faja', varianteId: 'MED', cantidad: 1, motivoId: 'ent_primera' },
      ],
      '',
    )
    const [casco, faja] = ['casco', 'faja'].map((m) => S.resguardosActivos.value.find((r) => r.materialId === m && r.rpe === 'T0901')!)
    const cascos = stock('casco')
    const fajas = stock('faja', 'MED')
    await expect(devolverResguardos([{ resguardoId: casco.id, motivoId: 'dev_bueno' }, { resguardoId: faja.id, motivoId: '' }])).rejects.toThrow(/Elija el estado/)
    expect(S.resguardosActivos.value.filter((r) => r.rpe === 'T0901').length).toBe(2)

    await devolverResguardos([
      { resguardoId: casco.id, motivoId: 'dev_bueno' },
      { resguardoId: faja.id, motivoId: 'dev_danado', nota: 'Hebilla rota' },
    ])
    expect(S.resguardosActivos.value.filter((r) => r.rpe === 'T0901').length).toBe(0)
    expect(stock('casco')).toBe(cascos + 1)
    expect(stock('faja', 'MED')).toBe(fajas)
    expect(S.resguardos.value.find((r) => r.id === faja.id)!.cierre!.motivo).toBe('Dañado (se desecha) · Hebilla rota')
  })
})
