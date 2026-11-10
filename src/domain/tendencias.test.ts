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
