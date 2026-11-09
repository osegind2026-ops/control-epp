import { describe, expect, it } from 'vitest'
import { PDFArray, PDFDocument, degrees } from 'pdf-lib'
import { estamparFoliosPdf, textoFolioPdf } from './pdfFolio'

async function pdfDePrueba(paginas: number, giro = 0) {
  const d = await PDFDocument.create()
  for (let i = 0; i < paginas; i++) {
    const p = d.addPage([612, 792])
    p.setRotation(degrees(giro))
    p.drawText(`Hoja ${i + 1}`, { x: 50, y: 700, size: 12 })
  }
  return d.save()
}

/** Cuántos flujos de contenido tiene cada página (una página estampada tiene uno más). */
const flujos = (d: PDFDocument) =>
  d.getPages().map((p) => {
    const c = p.node.Contents()
    return c instanceof PDFArray ? c.size() : c ? 1 : 0
  })

describe('folios en PDF cargado', () => {
  it('pone un folio por copia y solo en la primera página de cada copia', async () => {
    const original = await PDFDocument.load(await pdfDePrueba(3))
    const base = flujos(original)
    const salida = await PDFDocument.load(await estamparFoliosPdf(await pdfDePrueba(3), { prefijo: 'U1-SI-2026-', inicio: 7, copias: 2, posicion: 'arriba-der' }))
    expect(salida.getPageCount()).toBe(6)
    const f = flujos(salida)
    expect(f[0]).toBeGreaterThan(base[0])
    expect(f[3]).toBeGreaterThan(base[0])
    expect([f[1], f[2], f[4], f[5]]).toEqual([base[1], base[2], base[1], base[2]])
    expect(salida.getTitle()).toBe('Formato con folios No. U1-SI-2026-007 a No. U1-SI-2026-008')
  })

  it('funciona con hojas giradas y avisa si el prefijo no se puede imprimir', async () => {
    for (const g of [90, 180, 270]) {
      const s = await PDFDocument.load(await estamparFoliosPdf(await pdfDePrueba(1, g), { prefijo: 'X-', inicio: 1, copias: 1, posicion: 'abajo-der' }))
      expect(s.getPageCount()).toBe(1)
    }
    await expect(estamparFoliosPdf(await pdfDePrueba(1), { prefijo: '✓-', inicio: 1, copias: 1, posicion: 'arriba-izq' })).rejects.toThrow(/caracteres/)
    expect(textoFolioPdf('A-', 12)).toBe('No. A-012')
  })
})
