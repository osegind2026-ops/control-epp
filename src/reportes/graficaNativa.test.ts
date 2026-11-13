import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { columna, incrustarGraficas, marcaGrafica, xlsxGrafica, xmlGrafica, type GraficaNativa } from './graficaNativa'

const g: GraficaNativa = {
  tipo: 'combinada',
  titulo: 'Consumo <prueba> & más',
  categorias: ['SEM 38', 'SEM 39', 'SEM 40'],
  series: [
    { nombre: 'Pares', valores: [5, null, 7], color: '#235B4E', colores: [undefined, '#9AA1A8', undefined] },
    { nombre: '% acumulado', valores: [10, 50, 100], color: '#BC955C', tipo: 'lineas', eje2: true },
  ],
  ejeY2: { max: 100 },
}

describe('gráficas nativas de Word', () => {
  it('escribe columnas y líneas ligadas a la hoja Datos (texto escapado, vacíos sin punto)', () => {
    const x = xmlGrafica(g)
    expect(x).toContain('<c:barChart>')
    expect(x).toContain('<c:lineChart>')
    expect(x).toContain('Datos!$B$2:$B$4')
    expect(x).toContain('Datos!$C$2:$C$4')
    expect(x).toContain('Consumo &lt;prueba&gt; &amp; más')
    expect(x).toContain('<c:externalData r:id="rId1">')
    expect(x).not.toContain('<c:pt idx="1"><c:v>null')
    expect(columna(0)).toBe('A')
    expect(columna(27)).toBe('AB')
  })

  it('arma el Excel de datos y lo incrusta en el docx en lugar de la marca', async () => {
    const xlsx = await JSZip.loadAsync(await xlsxGrafica(g))
    const hoja = await xlsx.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(hoja).toContain('<c r="B2" s="2"><v>5</v></c>')
    expect(hoja).not.toContain('r="B3"')

    const docx = new JSZip()
    docx.file('[Content_Types].xml', '<?xml version="1.0"?><Types><Default Extension="xml" ContentType="application/xml"/></Types>')
    docx.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships></Relationships>')
    docx.file('word/document.xml', `<w:document><w:body><w:p><w:r><w:t xml:space="preserve">${marcaGrafica(0)}</w:t></w:r></w:p></w:body></w:document>`)
    const salida = await JSZip.loadAsync(await incrustarGraficas(await docx.generateAsync({ type: 'blob' }), [{ g, anchoEmu: 6000000, altoEmu: 3000000 }]))
    const doc = await salida.file('word/document.xml')!.async('string')
    expect(doc).toContain('r:id="rIdGrafica1"')
    expect(doc).not.toContain('⟦GRAFICA')
    expect(salida.file('word/charts/chart1.xml')).toBeTruthy()
    expect(salida.file('word/embeddings/Microsoft_Excel_Worksheet1.xlsx')).toBeTruthy()
    expect(await salida.file('[Content_Types].xml')!.async('string')).toContain('drawingml.chart+xml')
  })
})
