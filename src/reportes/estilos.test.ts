import { describe, expect, it } from 'vitest'
import { materialesSemilla, motivosSemilla, ubicacionesSemilla } from '../db/semilla'
import type { Entrega } from '../domain/types'
import { calcularReporte } from './datos'
import { estilizarBarrasXml, estilizarPastelXml, mezcla, svgPastel, type EstiloBarras, type EstiloPastel } from './estilos'
import { generarPresentacion } from './presentacion'
import type { Plantilla } from './plantilla'

const entrega = (id: string, fecha: string, rpe: string, area: string, lineas: [string, number, string?][]): Entrega => ({
  id, folio: id, ts: fecha + 'T15:00:00Z', fecha, hora: '09:00', rpe, nombre: rpe, area, usuarioId: 'u', usuarioNombre: 'U', equipo: 'A', ubicacionId: 'ubi_despacho',
  lineas: lineas.map(([materialId, cantidad, varianteId = '']) => ({ materialId, cantidad, varianteId, esResguardo: materialId === 'casco', motivoId: materialId === 'casco' ? 'ent_primera' : undefined })),
  observaciones: '', estado: 'registrada',
})
const img = { dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', ancho: 1, alto: 1 }
const plantilla = {
  imagenes: { fondoPortada: img, fondoContenido: img, logoEncabezado: img, logoAnio: img, logoPie: img },
  textos: { titulo: 'Reporte', subtitulo: '', area: '', pie: '' },
} as unknown as Plantilla

async function graficas(barras: EstiloBarras, pastel: EstiloPastel): Promise<string[]> {
  const entregas = [
    entrega('1', '2026-09-21', 'A', 'TALLER', [['casco', 1], ['lentes_claros', 1], ['tapones', 2]]),
    entrega('2', '2026-09-22', 'B', 'DTM', [['casco', 1], ['g_carnaza', 1, 'G']]),
    entrega('3', '2026-09-22', 'C', 'DTM', [['casco', 1], ['tapones', 1]]),
    entrega('4', '2026-09-23', 'D', 'INFRA', [['casco', 1], ['lentes_claros', 2]]),
  ]
  const f = { entregas, movimientos: [], resguardos: [], materiales: materialesSemilla(), motivos: motivosSemilla(), ubicaciones: ubicacionesSemilla(), personal: new Map() }
  const d = calcularReporte(f, '2026-09-21', '2026-09-23')
  const blob = await generarPresentacion(d, plantilla, { estiloBarras: barras, estiloPastel: pastel })
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const nombres = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n)).sort()
  return Promise.all(nombres.map((n) => zip.file(n)!.async('string')))
}

describe('estilos de las gráficas', () => {
  it('«actual» deja las gráficas exactamente igual', async () => {
    const xs = await graficas('plana', 'dona')
    expect(xs.some((x) => x.includes('<c:barChart>'))).toBe(true)
    expect(xs.some((x) => x.includes('<c:doughnutChart>'))).toBe(true)
    for (const x of xs) {
      expect(estilizarBarrasXml(x, 'plana')).toBe(x)
      expect(estilizarPastelXml(x, 'dona')).toBe(x)
    }
  })

  it('barras 3D y cilindros quedan como gráficas 3D válidas', async () => {
    for (const est of ['3d', 'cilindro'] as const) {
      const barras = (await graficas(est, 'dona')).filter((x) => x.includes('bar3DChart'))
      expect(barras.length).toBeGreaterThanOrEqual(2)
      for (const x of barras) {
        expect(x).not.toContain('<c:barChart>')
        expect(x).not.toMatch(/<c:overlap/)
        expect(x).toContain(`<c:shape val="${est === 'cilindro' ? 'cylinder' : 'box'}"/>`)
        expect(x).toContain('<c:view3D>')
        const bloque = x.slice(x.indexOf('<c:bar3DChart>'), x.indexOf('</c:bar3DChart>'))
        expect(bloque.match(/<c:axId /g)?.length).toBe(2)
        // gapWidth, shape y luego los ejes: el orden que exige PowerPoint
        expect(bloque.indexOf('<c:gapWidth')).toBeLessThan(bloque.indexOf('<c:shape'))
        expect(bloque.indexOf('<c:shape')).toBeLessThan(bloque.indexOf('<c:axId'))
      }
    }
  })

  it('degradado usa relleno degradado con sombra', async () => {
    const barras = (await graficas('degradado', 'dona')).filter((x) => x.includes('<c:barChart>'))
    for (const x of barras) {
      expect(x).toContain('<a:gradFill')
      expect(x).toContain('<a:outerShdw')
      expect(x).not.toMatch(/<c:ser>[\s\S]*?<c:spPr><a:solidFill>/)
    }
  })

  it('pastel plano, 3D y destacado', async () => {
    const plano = (await graficas('plana', 'plano')).find((x) => x.includes('<c:pieChart>'))!
    expect(plano).not.toContain('holeSize')
    const tres = (await graficas('plana', '3d')).find((x) => x.includes('<c:pie3DChart>'))!
    expect(tres).not.toMatch(/holeSize|firstSliceAng/)
    expect(tres).toContain('<c:view3D>')
    const dest = (await graficas('plana', 'destacado')).find((x) => x.includes('<c:pieChart>'))!
    expect(dest.match(/<c:explosion /g)?.length).toBe(1)
    // explosion va después de bubble3D y antes de spPr dentro del dPt
    const dpt = dest.slice(dest.indexOf('<c:explosion') - 80, dest.indexOf('<c:explosion') + 60)
    expect(dpt.indexOf('bubble3D')).toBeLessThan(dpt.indexOf('explosion'))
    expect(dpt).toContain('<c:spPr>')
  })

  it('el pastel en SVG del PDF dibuja una rebanada por valor y los porcentajes', () => {
    const svg = svgPastel({ valores: [50, 30, 20], colores: ['#235B4E', '#BC955C', '#691C32'], ancho: 360, alto: 360, est: 'destacado' })
    expect(svg.match(/<path /g)?.length).toBe(3)
    expect(svg).toContain('50.0%')
    expect(svg).toContain('translate(')
    expect(svgPastel({ valores: [60, 40], colores: ['#235B4E', '#BC955C'], ancho: 360, alto: 360, est: '3d' })).toContain('feDropShadow')
    expect(mezcla('#000000', 0.5)).toBe('808080')
    expect(mezcla('FFFFFF', -0.5)).toBe('808080')
  })
})
