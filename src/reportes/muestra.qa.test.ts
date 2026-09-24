// Genera una presentación de muestra para revisión visual (no forma parte de las pruebas normales).
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { materialesSemilla, motivosSemilla, ubicacionesSemilla, AREAS } from '../db/semilla'
import type { Entrega } from '../domain/types'
import { calcularReporte } from './datos'
import type { Plantilla } from './plantilla'
import { generarPresentacion } from './presentacion'
import { generarExcel } from './excel'
import { renderToString } from 'preact-render-to-string'
import { h } from 'preact'
import { ReporteImprimible } from './ReporteImprimible'

const SALIDA = process.env.MUESTRA_PPTX
const imagen = (archivo: string, tipo: string, ancho: number, alto: number) => ({
  dataUrl: `data:${tipo};base64,` + readFileSync(`public/plantilla/${archivo}`).toString('base64'),
  ancho,
  alto,
})

describe.runIf(SALIDA)('muestra', () => {
  it('genera la presentación', async () => {
    let semilla = 7
    const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647
    const pesoAreas = AREAS.map((a, i) => [a, a.includes('MECÁNICO') ? 12 : a.includes('APOYO') ? 9 : a.includes('ELÉCTRICO') ? 6 : 3 - (i % 3)] as const)
    const total = pesoAreas.reduce((s, [, p]) => s + Math.max(p, 0.5), 0)
    const elegirArea = () => {
      let r = azar() * total
      for (const [a, p] of pesoAreas) if ((r -= Math.max(p, 0.5)) <= 0) return a
      return AREAS[0]
    }
    const entregas: Entrega[] = []
    const dias = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']
    for (let i = 0; i < 390; i++) {
      const area = elegirArea()
      const lineas: [string, number, string?, string?][] = []
      if (azar() < 0.45) lineas.push(['casco', 1, '', azar() < 0.6 ? 'ent_extravio' : azar() < 0.5 ? 'ent_primera' : 'ent_desgaste'])
      if (azar() < 0.7) lineas.push(['lentes_claros', 1])
      if (azar() < 0.1) lineas.push(['lentes_oscuros', 1])
      if (azar() < 0.2) lineas.push(['cubre_lentes', 1])
      if (azar() < 0.8) lineas.push(['tapones', 1 + Math.floor(azar() * 2)])
      if (area.includes('INSTRUMENTACION') || area.includes('ELÉCTRICO') || azar() < 0.2) lineas.push(['g_hyflex', 1, ['7', '8', '9', '10'][Math.floor(azar() * 4)]])
      if (!area.includes('INSTRUMENTACION') && azar() < 0.55) lineas.push(['g_carnaza', 1, ['M', 'G', 'XG'][Math.floor(azar() * 3)]])
      if (azar() < 0.05) lineas.push(['m_polvo', 1])
      if (azar() < 0.03) lineas.push(['faja', 1, ['MED', 'GDE', 'XL'][Math.floor(azar() * 3)], 'ent_primera'])
      if (azar() < 0.04) lineas.push(['barbiquejo', 1])
      const fecha = dias[Math.floor(azar() * dias.length)]
      entregas.push({
        id: 'E' + i, folio: 'CFE-A-' + i, ts: fecha + 'T15:00:00Z', fecha, hora: '09:00', rpe: 'R' + i, nombre: 'P' + i, area, usuarioId: 'u', usuarioNombre: 'U', equipo: 'A', ubicacionId: 'ubi_despacho',
        lineas: lineas.map(([materialId, cantidad, varianteId = '', motivoId]) => ({ materialId, cantidad, varianteId, esResguardo: ['casco', 'faja'].includes(materialId), motivoId })),
        observaciones: '', estado: 'registrada',
      })
    }
    const fuentes = { entregas, movimientos: [], resguardos: [], materiales: materialesSemilla(), motivos: motivosSemilla(), ubicaciones: ubicacionesSemilla(), personal: new Map() }
    const d = calcularReporte(
      fuentes,
      '2026-09-21',
      '2026-09-27',
    )
    d.reabastecer = [
      { nombre: 'Guante Hyflex 10', existencia: 4, minimo: 5 },
      { nombre: 'Faja Lumbar XL', existencia: 3, minimo: 5 },
    ]
    const p: Plantilla = {
      imagenes: {
        logoEncabezado: imagen('logo_encabezado.png', 'image/png', 271, 64),
        logoAnio: imagen('logo_anio.png', 'image/png', 207, 109),
        logoPie: imagen('logo_pie.png', 'image/png', 208, 36),
        fondoPortada: imagen('fondo_portada.jpg', 'image/jpeg', 1280, 720),
        fondoContenido: imagen('fondo_contenido.jpg', 'image/jpeg', 1280, 720),
      },
      textos: { institucion: 'Central Nucleoeléctrica Laguna Verde', oficina: 'Oficina de Seguridad Industrial' },
      personalizadas: [],
    }
    const blob = await generarPresentacion(d, p)
    writeFileSync(SALIDA!, Buffer.from(await blob.arrayBuffer()))
    // HTML autónomo de la versión PDF (para imprimir con Chrome y revisar)
    const css = readFileSync('src/styles.css', 'utf8')
    const cuerpo = renderToString(h(ReporteImprimible, { d, p, onCerrar: () => {} }))
    writeFileSync(
      SALIDA!.replace(/\.pptx$/, '.html'),
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${css}</style></head><body class="imprimiendo-reporte"><div class="contenedor-reporte">${cuerpo}</div></body></html>`,
    )
    const xlsx = await generarExcel(d, fuentes)
    writeFileSync(SALIDA!.replace(/\.pptx$/, '.xlsx'), Buffer.from(await xlsx.arrayBuffer()))
  }, 60000)
})
