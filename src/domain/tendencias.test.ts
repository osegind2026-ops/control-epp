import { describe, expect, it } from 'vitest'
import type { Entrega, Movimiento } from './types'
import { analizarMaterial, conclusion, periodoDe, periodosEntre, semanaISO } from './tendencias'

let n = 0
function entrega(fecha: string, lineas: [string, string, number][], extra: Partial<Entrega> = {}): Entrega {
  n++
  return {
    id: `e${n}`, folio: `F-${n}`, ts: `${fecha}T10:00:00Z`, fecha, hora: '10:00', rpe: `Z${n}`, nombre: `Trabajador ficticio ${n}`, area: 'Pruebas',
    usuarioId: 'u', usuarioNombre: 'u', equipo: 'P1', ubicacionId: 'alm', observaciones: '', estado: 'registrada',
    lineas: lineas.map(([materialId, varianteId, cantidad]) => ({ materialId, varianteId, cantidad, esResguardo: false })),
    ...extra,
  }
}
const mov = (materialId: string, cantidad: number, ubicacionId = 'alm'): Movimiento => ({
  id: `m${++n}`, ts: '', tipo: 'ENTRADA', materialId, varianteId: 'G', ubicacionId, cantidad, ref: '', motivo: '', nota: '', usuarioId: '', usuarioNombre: '', equipo: '',
})

describe('semanas ISO', () => {
  it('numera como el calendario ISO (lunes a domingo)', () => {
    expect(semanaISO('2026-09-24')).toMatchObject({ anio: 2026, semana: 39, lunes: '2026-09-21' })
    expect(semanaISO('2027-01-01')).toMatchObject({ anio: 2026, semana: 53 })
    expect(semanaISO('2027-01-04')).toMatchObject({ anio: 2027, semana: 1 })
    expect(periodosEntre('2026-09-10', '2026-09-24', 'semana').map((p) => p.etiqueta)).toEqual(['SEM 37', 'SEM 38', 'SEM 39'])
    expect(periodoDe('2026-02-14', 'mes')).toMatchObject({ etiqueta: 'FEB 26', inicio: '2026-02-01', fin: '2026-02-28' })
  })
})

describe('tendencia de consumo (caso del reporte de guantes de carnaza)', () => {
  // Semanas 37, 38 y 39 de 2026 con 243, 52 y 161 pares; 818 solicitudes en total
  const entregas: Entrega[] = []
  const repartir = (lunes: string, pares: number, solicitudes: number) => {
    for (let i = 0; i < solicitudes; i++) {
      const fecha = `2026-09-${String(Number(lunes.slice(8)) + (i % 5)).padStart(2, '0')}`
      entregas.push(entrega(fecha, i < pares ? [['carnaza', i % 2 ? 'G' : 'M', 1], ['lentes', '', 1]] : [['lentes', '', 1]]))
    }
  }
  repartir('2026-09-07', 243, 300)
  repartir('2026-09-14', 52, 200)
  repartir('2026-09-21', 161, 318)
  entregas.push(entrega('2026-09-22', [['carnaza', 'G', 5]], { estado: 'anulada' }))
  entregas.push(entrega('2026-09-22', [['carnaza', 'G', 5]].map(([a, b, c]) => [a, b, c] as [string, string, number])))
  entregas[entregas.length - 1].lineas[0].esPrestamo = true
  const movimientos = [mov('carnaza', 300), mov('carnaza', 50, 'otra-baja')]
  const material = { id: 'carnaza', nombre: 'Guantes de carnaza', variantes: [{ id: 'M', etiqueta: 'M', activo: true }, { id: 'G', etiqueta: 'G', activo: true }] }

  const a = analizarMaterial({
    entregas, movimientos, ubicaciones: ['alm'], material, config: { materialId: 'carnaza', pedido: 2000 },
    desde: '2026-09-07', hasta: '2026-09-27', unidad: 'semana', hoy: '2026-09-24',
  })

  it('cuenta salidas, solicitudes y personal sin el material (sin anuladas ni préstamos)', () => {
    expect(a.historico.map((f) => f.cantidad)).toEqual([243, 52, 161])
    expect(a.total).toBe(456)
    expect(a.solicitudes).toBe(819) // 818 + la del préstamo (sí fue una solicitud atendida)
    expect(a.conMaterial).toBe(456)
    expect(a.almacen).toBe(300)
    expect(a.existencia).toBe(2300)
    expect(a.porTalla.map((t) => t.etiqueta)).toEqual(['M', 'G'])
  })

  it('proyecta como el reporte: 152 por semana, alcanza hasta la Semana 03 del 2027', () => {
    const p = a.escenarios.promedio
    expect(p.consumo).toBe(152)
    expect(a.pctConsumo).toBe(7)
    expect(a.inicioProyeccion.etiqueta).toBe('SEM 40')
    expect(p.filas.map((f) => f.existencia).slice(0, 3)).toEqual([2300, 2148, 1996])
    expect(p.filas[p.filas.length - 1].existencia).toBe(-132)
    // Ojo: 2026 tiene semana 53, por eso es una semana antes que en el reporte hecho a mano
    expect(p.agotamiento?.clave).toBe('2027-S02')
    expect(a.escenarios.alto.consumo).toBe(243)
    expect(a.escenarios.bajo.consumo).toBe(52)
    expect(conclusion(a, 'pares')).toContain('alcanzarían hasta la Semana 02 del 2027')
  })

  it('analiza cada talla por separado o un grupo de tallas', async () => {
    const { etiquetaTallas } = await import('./tendencias')
    const base = { entregas, movimientos, ubicaciones: ['alm'], material, desde: '2026-09-07', hasta: '2026-09-27', unidad: 'semana' as const, hoy: '2026-09-24' }
    const g = analizarMaterial({ ...base, config: { materialId: 'carnaza', pedido: 100 }, variantes: ['G'] })
    const m = analizarMaterial({ ...base, config: { materialId: 'carnaza', pedido: 0 }, variantes: ['M'] })
    expect(g.total + m.total).toBe(456)
    expect(g.nombre).toBe('Guantes de carnaza – Talla G')
    expect(g.clave).toBe('carnaza|G')
    expect(g.almacen).toBe(300) // el kardex de prueba solo tiene talla G
    expect(m.almacen).toBe(0)
    expect(g.existencia).toBe(400)
    // Las dos tallas juntas = el material completo
    const todas = analizarMaterial({ ...base, config: { materialId: 'carnaza', pedido: 0 }, variantes: ['M', 'G'] })
    expect(todas.clave).toBe('carnaza')
    expect(todas.talla).toBeUndefined()
    expect(etiquetaTallas({ variantes: [{ id: 'CH', etiqueta: 'CH', activo: true }, { id: 'M', etiqueta: 'M', activo: true }, { id: 'G', etiqueta: 'G', activo: true }] }, ['CH', 'G'])).toBe('Tallas CH y G')
  })

  it('calcula cuánto falta para llegar a una fecha', () => {
    const b = analizarMaterial({
      entregas, movimientos, ubicaciones: ['alm'], material, config: { materialId: 'carnaza', pedido: 0 },
      desde: '2026-09-07', hasta: '2026-09-27', unidad: 'semana', hoy: '2026-09-24', fechaObjetivo: '2026-10-25',
    })
    // SEM 40 a SEM 43 = 4 semanas × 152 = 608; hay 300 → faltan 308
    expect(b.escenarios.promedio.necesario).toBe(608)
    expect(b.escenarios.promedio.faltante).toBe(308)
    expect(b.escenarios.bajo.faltante).toBe(0)
    expect(b.escenarios.bajo.sobrante).toBe(92)
  })
})

describe('planeado vs real', () => {
  it('compara el consumo y la existencia por semana contra el plan', async () => {
    const { compararPlan, conclusionPlan } = await import('./tendencias')
    // Plan: 2300 pares desde la SEM 40 de 2026, 152 por semana
    const plan = { creado: '2026-09-24', inicio: '2026-09-28', unidad: 'semana' as const, existenciaInicial: 2300, consumo: 152, origen: 'manual' as const }
    const ents = [
      entrega('2026-09-29', [['carnaza', 'G', 100]]),
      entrega('2026-10-06', [['carnaza', 'G', 120]]),
      entrega('2026-10-14', [['carnaza', 'G', 90]]),
    ]
    const movs: Movimiento[] = [
      { ...mov('carnaza', 2300), ts: '2026-09-20T12:00:00Z' },
      { ...mov('carnaza', -100), ts: '2026-09-29T12:00:00Z', tipo: 'SALIDA' },
      { ...mov('carnaza', -120), ts: '2026-10-06T12:00:00Z', tipo: 'SALIDA' },
      { ...mov('carnaza', 500), ts: '2026-10-07T12:00:00Z' },
      { ...mov('carnaza', -90), ts: '2026-10-14T12:00:00Z', tipo: 'SALIDA' },
    ]
    const c = compararPlan({ plan, entregas: ents, movimientos: movs, ubicaciones: ['alm'], materialId: 'carnaza', hoy: '2026-10-21' })
    expect(c.filas.map((f) => f.periodo.etiqueta)).toEqual(['SEM 40', 'SEM 41', 'SEM 42', 'SEM 43'])
    expect(c.filas[3].enCurso).toBe(true)
    expect(c.completos).toBe(3)
    expect(c.totalPlaneado).toBe(456)
    expect(c.totalReal).toBe(310)
    expect(c.desviacionPct).toBe(-32)
    expect(c.filas.map((f) => f.existPlaneada)).toEqual([2300, 2148, 1996, 1844])
    expect(c.filas.map((f) => f.existReal)).toEqual([2300, 2200, 2580, 2490])
    expect(c.filas[1].entradas).toBe(500)
    expect(c.existenciaHoy).toBe(2490)
    expect(c.promedioReal).toBe(103)
    expect(c.agotamientoPlan?.clave).toBe('2027-S02')
    expect(conclusionPlan(c, 'Guantes de carnaza', 'pares')).toContain('32% menos de lo previsto')
  })
})

describe('semanas sin existencia en almacén', () => {
  const m = (materialId: string, varianteId: string, fecha: string, cantidad: number, tipo: Movimiento['tipo'] = cantidad > 0 ? 'ENTRADA' : 'SALIDA'): Movimiento => ({
    id: `m${++n}`, ts: `${fecha}T12:00:00`, tipo, materialId, varianteId, ubicacionId: 'alm', cantidad, ref: '', motivo: '', nota: '', usuarioId: '', usuarioNombre: '', equipo: '',
  })
  const material = { id: 'guante', nombre: 'Guante ficticio', variantes: [{ id: 'G', etiqueta: 'G', activo: true }, { id: 'XL', etiqueta: 'XL', activo: true }] }
  // G: 100 iniciales, 20 por semana. XL: 10 iniciales que se acaban el martes de la semana 37 y no vuelve a llegar.
  const entregas: Entrega[] = []
  const movimientos: Movimiento[] = [m('guante', 'G', '2026-09-01', 100, 'INICIAL'), m('guante', 'XL', '2026-09-01', 10, 'INICIAL')]
  for (const f of ['2026-09-08', '2026-09-15', '2026-09-22']) {
    entregas.push(entrega(f, [['guante', 'G', 20]]))
    movimientos.push(m('guante', 'G', f, -20))
  }
  entregas.push(entrega('2026-09-08', [['guante', 'XL', 10]]))
  movimientos.push(m('guante', 'XL', '2026-09-08', -10))
  const base = { entregas, movimientos, ubicaciones: ['alm'], material, desde: '2026-09-07', hasta: '2026-09-27', unidad: 'semana' as const, hoy: '2026-10-01' }

  it('una talla sin existencia no se toma como «no se agota»', () => {
    const xl = analizarMaterial({ ...base, config: { materialId: 'guante', pedido: 0 }, variantes: ['XL'] })
    expect(xl.historico.map((f) => f.diasSinExistencia)).toEqual([5, 7, 7])
    expect(xl.historico.map((f) => f.existInicio)).toEqual([10, 0, 0])
    expect(xl.demandaNoMedida).toBe(true)
    expect(xl.escenarios.promedio.sinDato).toBe(true)
    expect(xl.escenarios.promedio.agotamiento).toBeNull()
    expect(conclusion(xl, 'pares')).toContain('no hubo existencia')
    const g = analizarMaterial({ ...base, config: { materialId: 'guante', pedido: 0 }, variantes: ['G'] })
    expect(g.periodosSinExistencia).toBe(0)
    expect(g.escenarios.promedio.consumo).toBe(20)
    const todo = analizarMaterial({ ...base, config: { materialId: 'guante', pedido: 0 } })
    expect(todo.tallasSinExistencia).toEqual([{ etiqueta: 'XL', periodos: 3 }])
  })

  it('las semanas sin existencia no cuentan para el promedio (si así se elige)', () => {
    const ent = [entrega('2026-09-07', [['y', 'G', 10]]), entrega('2026-09-15', [['y', 'G', 12]]), entrega('2026-09-22', [['y', 'G', 14]])]
    const mv = [m('y', 'G', '2026-09-01', 10, 'INICIAL'), m('y', 'G', '2026-09-07', -10), m('y', 'G', '2026-09-14', 50), m('y', 'G', '2026-09-15', -12), m('y', 'G', '2026-09-22', -14)]
    const mat = { id: 'y', nombre: 'Material ficticio', variantes: [{ id: 'G', etiqueta: 'G', activo: true }] }
    const o = { ...base, entregas: ent, movimientos: mv, material: mat, config: { materialId: 'y', pedido: 0 } }
    const a = analizarMaterial(o)
    expect(a.historico.map((f) => f.sinExistencia)).toEqual([true, false, false])
    expect(a.periodosMedidos).toBe(2)
    expect(a.escenarios.promedio.consumo).toBe(13)
    expect(a.escenarios.bajo.consumo).toBe(12)
    expect(a.total).toBe(36)
    expect(analizarMaterial({ ...o, excluirSinExistencia: false }).escenarios.promedio.consumo).toBe(12)
  })
})
