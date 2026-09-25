import type PptxGenJS from 'pptxgenjs'
import type { DatosReporte } from './datos'
import { pct, titulo } from './datos'
import type { Plantilla } from './plantilla'

// Presentación ejecutiva (.pptx) con la plantilla institucional. Las gráficas son
// nativas de PowerPoint: se pueden editar y restilizar después.

const C = {
  verde: '235B4E',
  guinda: '691C32',
  dorado: 'BC955C',
  texto: '2B2B2B',
  gris: '6F7271',
  claro: 'F4F2EE',
  blanco: 'FFFFFF',
}
const SERIE = ['235B4E', 'BC955C', '691C32', '6F7271', '3F8B78', '9D7B45', 'A34A62', '98989A']
const FUENTE = 'Arial'
const ANCHO = 13.333
const ALTO = 7.5

const sinPrefijo = (dataUrl: string) => dataUrl.replace(/^data:/, '')

type Slide = PptxGenJS.Slide

/** Imagen para un patrón de diapositivas (se edita una sola vez en Ver → Patrón de diapositivas). */
function imagenPatron(p: Plantilla, clave: keyof Plantilla['imagenes'], opc: { alto: number; x?: number; y: number; derecha?: number; centro?: boolean }) {
  const img = p.imagenes[clave]
  const w = (opc.alto * img.ancho) / img.alto
  const x = opc.centro ? (ANCHO - w) / 2 : opc.derecha !== undefined ? ANCHO - opc.derecha - w : opc.x ?? 0
  return { image: { data: sinPrefijo(img.dataUrl), x, y: opc.y, w, h: opc.alto } }
}

function definirPatrones(pres: PptxGenJS, p: Plantilla) {
  pres.defineSlideMaster({
    title: 'PORTADA EPP',
    background: { data: sinPrefijo(p.imagenes.fondoPortada.dataUrl) },
    objects: [
      imagenPatron(p, 'logoEncabezado', { alto: 0.62, y: 0.35, derecha: 0.45 }),
      imagenPatron(p, 'logoAnio', { alto: 1.15, y: 6.05, centro: true }),
      imagenPatron(p, 'logoPie', { alto: 0.36, y: 6.85, derecha: 0.45 }),
    ],
  })
  pres.defineSlideMaster({
    title: 'LAMINA EPP',
    background: { data: sinPrefijo(p.imagenes.fondoContenido.dataUrl) },
    objects: [
      imagenPatron(p, 'logoEncabezado', { alto: 0.42, y: 0.3, derecha: 0.35 }),
      imagenPatron(p, 'logoAnio', { alto: 0.62, x: 0.35, y: 6.72 }),
      imagenPatron(p, 'logoPie', { alto: 0.28, y: 7.03, derecha: 0.35 }),
    ],
  })
}

function laminaContenido(pres: PptxGenJS, _p: Plantilla, d: DatosReporte, tituloLamina: string): Slide {
  const s = pres.addSlide({ masterName: 'LAMINA EPP' })
  s.addText(tituloLamina, { x: 0.6, y: 0.3, w: 9.4, h: 0.62, fontFace: FUENTE, fontSize: 28, bold: true, color: C.verde, margin: 0, isTextBox: true })
  s.addText(d.titulo, { x: 0.6, y: 0.92, w: 9.4, h: 0.36, fontFace: FUENTE, fontSize: 14, color: C.gris, margin: 0, isTextBox: true })
  return s
}

function tarjeta(s: Slide, x: number, y: number, w: number, h: number, relleno = C.blanco) {
  s.addShape('roundRect', { x, y, w, h, rectRadius: 0.12, fill: { color: relleno }, line: { color: 'E2DED6', width: 0.75 } })
}

function cifra(s: Slide, x: number, y: number, w: number, numero: string, etiqueta: string, color = C.verde, tam = 40) {
  s.addText(numero, { x, y, w, h: tam / 55, fontFace: FUENTE, fontSize: tam, bold: true, color, margin: 0, isTextBox: true })
  s.addText(etiqueta, { x, y: y + tam / 55, w, h: 0.5, fontFace: FUENTE, fontSize: 13, color: C.gris, margin: 0, valign: 'top', isTextBox: true })
}

const miles = (n: number) => n.toLocaleString('es-MX')

export async function generarPresentacion(d: DatosReporte, p: Plantilla): Promise<Blob> {
  const { default: Pptx } = await import('pptxgenjs')
  const pres = new Pptx()
  pres.layout = 'LAYOUT_WIDE'
  pres.author = p.textos.oficina
  pres.company = p.textos.institucion
  pres.title = `Entrega de EPP · ${d.titulo}`
  definirPatrones(pres, p)

  // ---------- 1. Portada ----------
  {
    const s = pres.addSlide({ masterName: 'PORTADA EPP' })
    s.addText('ENTREGA DE EQUIPO DE\nPROTECCIÓN PERSONAL', { x: 0.7, y: 1.55, w: 11.5, h: 1.8, fontFace: FUENTE, fontSize: 40, bold: true, color: C.verde, margin: 0, valign: 'bottom', isTextBox: true })
    s.addShape('line', { x: 0.7, y: 3.55, w: 11.95, h: 0, line: { color: C.dorado, width: 1.5 } })
    s.addText(d.titulo.toUpperCase(), { x: 0.7, y: 3.7, w: 11.9, h: 0.5, fontFace: FUENTE, fontSize: 20, bold: true, color: C.guinda, margin: 0, isTextBox: true })
    const kpis: [string, string][] = [
      [miles(d.personas), 'personas atendidas'],
      [miles(d.areas), d.areas === 1 ? 'área' : 'áreas'],
      [miles(d.piezas), 'piezas de EPP entregadas'],
    ]
    kpis.forEach(([n, t], i) => cifra(s, 0.7 + i * 3.4, 4.45, 3.2, n, t, i === 0 ? C.verde : C.texto, 36))
    s.addText(`${p.textos.oficina} · ${p.textos.institucion}`, { x: 0.7, y: 6.95, w: 5.5, h: 0.3, fontFace: FUENTE, fontSize: 10, color: C.gris, margin: 0, isTextBox: true })
  }

  // ---------- 2. Resumen general ----------
  {
    const s = laminaContenido(pres, p, d, 'Resumen general')
    const casco = d.materiales.find((m) => m.id === 'casco')
    const carnaza = d.materiales.find((m) => m.id === 'g_carnaza')
    const kpis: [string, string, string][] = [
      [miles(d.personas), 'Personal atendido', C.verde],
      [miles(casco?.piezas ?? 0), 'Cascos entregados', C.guinda],
      [miles(carnaza?.piezas ?? 0), 'Guantes de carnaza', C.texto],
    ]
    kpis.forEach(([n, t, color], i) => {
      tarjeta(s, 0.6, 1.5 + i * 1.28, 3.8, 1.12)
      cifra(s, 0.85, 1.6 + i * 1.28, 3.4, n, t, color, 34)
    })
    tarjeta(s, 0.6, 5.36, 3.8, 1.2, 'F6EEEA')
    s.addText(
      [
        { text: `${pct(d.personasConCasco, d.personas)}%`, options: { fontSize: 26, bold: true, color: C.guinda, breakLine: true } },
        { text: 'del personal atendido solicitó casco; el resto ya contaba con uno de algún contrato anterior.', options: { fontSize: 11, color: C.texto } },
      ],
      { x: 0.85, y: 5.42, w: 3.4, h: 1.1, fontFace: FUENTE, margin: 0, valign: 'middle', isTextBox: true },
    )
    const otros = d.materiales.filter((m) => m.id !== 'casco' && m.id !== 'g_carnaza').slice(0, 12)
    const cols = 3
    const ancho = 2.55
    otros.forEach((m, i) => {
      const x = 4.85 + (i % cols) * (ancho + 0.18)
      const y = 1.5 + Math.floor(i / cols) * 1.28
      tarjeta(s, x, y, ancho, 1.12)
      s.addText(miles(m.piezas), { x: x + 0.2, y: y + 0.1, w: ancho - 0.4, h: 0.55, fontFace: FUENTE, fontSize: 26, bold: true, color: SERIE[i % 3], margin: 0, isTextBox: true })
      s.addText(m.nombre, { x: x + 0.2, y: y + 0.66, w: ancho - 0.4, h: 0.38, fontFace: FUENTE, fontSize: 11.5, color: C.gris, margin: 0, fit: 'shrink', isTextBox: true })
    })
  }

  // ---------- 3. Material entregado ----------
  if (d.materiales.length) {
    const s = laminaContenido(pres, p, d, 'Material entregado')
    const top = d.materiales.slice(0, 12).reverse()
    s.addChart(pres.ChartType.bar, [{ name: 'Piezas', labels: top.map((m) => m.nombre), values: top.map((m) => m.piezas) }], {
      x: 0.5, y: 1.4, w: 8.4, h: 5.25, barDir: 'bar', chartColors: [C.verde], showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 11, dataLabelColor: C.texto,
      catAxisLabelFontSize: 11, catAxisLabelColor: C.texto, valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false, barGapWidthPct: 45,
    })
    const conTallas = d.materiales.filter((m) => m.tallas.length).slice(0, 4)
    if (conTallas.length) {
      s.addText('Tallas más solicitadas', { x: 9.2, y: 1.45, w: 3.7, h: 0.4, fontFace: FUENTE, fontSize: 15, bold: true, color: C.guinda, margin: 0, isTextBox: true })
      conTallas.forEach((m, i) => {
        const y = 1.95 + i * 1.12
        tarjeta(s, 9.2, y, 3.7, 1.0)
        const tallas = [...m.tallas].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => `${t}: ${n}`).join('  ·  ')
        s.addText(
          [
            { text: m.nombre, options: { bold: true, fontSize: 12, color: C.texto, breakLine: true } },
            { text: tallas, options: { fontSize: 11, color: C.gris } },
          ],
          { x: 9.38, y: y + 0.08, w: 3.4, h: 0.85, fontFace: FUENTE, margin: 0, valign: 'middle', isTextBox: true },
        )
      })
    }
  }

  // ---------- 4. Personal atendido por área ----------
  if (d.porArea.length) {
    const s = laminaContenido(pres, p, d, 'Personal atendido por área')
    const areas = d.porArea.slice(0, 14).reverse()
    s.addChart(pres.ChartType.bar, [{ name: 'Personas', labels: areas.map((a) => titulo(a.area)), values: areas.map((a) => a.personas) }], {
      x: 0.5, y: 1.4, w: 8.2, h: 5.25, barDir: 'bar', chartColors: [C.dorado], showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 11, dataLabelColor: C.texto,
      catAxisLabelFontSize: 10.5, catAxisLabelColor: C.texto, valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false, barGapWidthPct: 40,
    })
    const top = d.porArea[0]
    tarjeta(s, 9.0, 1.5, 3.9, 1.6)
    cifra(s, 9.25, 1.62, 3.5, `${pct(top.personas, d.personas)}%`, `del personal atendido fue de ${titulo(top.area)}`, C.verde, 34)
    tarjeta(s, 9.0, 3.3, 3.9, 1.6)
    cifra(s, 9.25, 3.42, 3.5, miles(d.areas), `áreas atendidas en ${d.corto.toLowerCase().startsWith('semana') ? 'la ' : 'el periodo: '}${d.corto}`, C.texto, 34)
    if (d.porArea.length > 2) {
      s.addText(`Mayor afluencia: ${d.porArea.slice(0, 3).map((a) => titulo(a.area)).join(', ')}.`, { x: 9.0, y: 5.1, w: 3.9, h: 1.3, fontFace: FUENTE, fontSize: 13, color: C.texto, margin: 0, valign: 'top', isTextBox: true })
    }
  }

  // ---------- 5. Cascos ----------
  if (d.cascos) {
    const s = laminaContenido(pres, p, d, 'Entrega de cascos')
    const conCasco = [...d.porArea].filter((a) => a.cascos).sort((a, b) => b.cascos - a.cascos)
    const principales = conCasco.slice(0, 6)
    const resto = conCasco.slice(6).reduce((n, a) => n + a.cascos, 0)
    const etiquetas = [...principales.map((a) => titulo(a.area)), ...(resto ? ['Otras áreas'] : [])]
    const valores = [...principales.map((a) => a.cascos), ...(resto ? [resto] : [])]
    s.addChart(pres.ChartType.doughnut, [{ name: 'Cascos', labels: etiquetas, values: valores }], {
      x: 0.5, y: 1.4, w: 6.4, h: 5.2, holeSize: 55, chartColors: SERIE, showPercent: true, showValue: false, dataLabelColor: C.blanco, dataLabelFontSize: 11,
      showLegend: true, legendPos: 'r', legendFontSize: 10.5, legendColor: C.texto,
    })
    const top = conCasco[0]
    tarjeta(s, 7.2, 1.5, 5.7, 1.35)
    s.addText(
      [
        { text: `${titulo(top.area)} `, options: { bold: true, color: C.verde } },
        { text: `concentra el ${pct(top.cascos, d.cascos)}% de los cascos entregados.`, options: { color: C.texto } },
      ],
      { x: 7.45, y: 1.58, w: 5.25, h: 1.2, fontFace: FUENTE, fontSize: 16, margin: 0, valign: 'middle', isTextBox: true },
    )
    tarjeta(s, 7.2, 3.0, 2.75, 1.4)
    cifra(s, 7.4, 3.1, 2.4, miles(d.cascos), `cascos de ${miles(d.personas)} personas`, C.guinda, 30)
    tarjeta(s, 10.15, 3.0, 2.75, 1.4)
    cifra(s, 10.35, 3.1, 2.4, miles(d.areasSinCasco.length), 'áreas sin solicitud de casco', C.texto, 30)
    const partes: PptxGenJS.TextProps[] = []
    if (d.motivosCasco.length) {
      partes.push({ text: 'Motivos de entrega', options: { bold: true, color: C.guinda, fontSize: 13, breakLine: true } })
      d.motivosCasco.slice(0, 4).forEach(([m, n], i, arr) => partes.push({ text: `${m}: ${n} (${pct(n, d.cascos)}%)`, options: { bullet: { indent: 14 }, fontSize: 12, color: C.texto, breakLine: i < arr.length - 1 } }))
    }
    if (d.areasSinCasco.length) {
      if (partes.length) partes[partes.length - 1].options = { ...partes[partes.length - 1].options, breakLine: true }
      partes.push({ text: 'Áreas sin solicitar casco: ', options: { bold: true, color: C.guinda, fontSize: 12 } })
      partes.push({ text: d.areasSinCasco.slice(0, 8).map(titulo).join(', ') + (d.areasSinCasco.length > 8 ? '…' : ''), options: { fontSize: 12, color: C.texto } })
    }
    if (partes.length) s.addText(partes, { x: 7.2, y: 4.6, w: 5.7, h: 2.0, fontFace: FUENTE, margin: 0, valign: 'top', paraSpaceAfter: 4, isTextBox: true })
  }

  // ---------- 6. Material por área ----------
  if (d.porArea.length) {
    const s = laminaContenido(pres, p, d, 'Material entregado por área')
    const mats = d.materiales.slice(0, 8)
    const areas = d.porArea.slice(0, 12)
    const enc: PptxGenJS.TableCell[] = [
      { text: 'ÁREA', options: { bold: true, color: C.blanco, fill: { color: C.verde }, fontSize: 9.5 } },
      ...mats.map((m) => ({ text: m.nombre.toUpperCase(), options: { bold: true, color: C.blanco, fill: { color: C.verde }, fontSize: 8.5, align: 'center' as const } })),
      { text: 'PERSONAS', options: { bold: true, color: C.blanco, fill: { color: C.guinda }, fontSize: 8.5, align: 'center' as const } },
    ]
    const filas: PptxGenJS.TableRow[] = areas.map((a, i) => {
      const relleno = { color: i % 2 ? 'F3F1EC' : C.blanco }
      return [
        { text: titulo(a.area), options: { fontSize: 9.5, bold: true, color: C.texto, fill: relleno } },
        ...mats.map((m) => ({ text: a.porMaterial[m.id] ? String(a.porMaterial[m.id]) : '–', options: { fontSize: 10, align: 'center' as const, color: a.porMaterial[m.id] ? C.texto : 'B5B5B5', fill: relleno } })),
        { text: String(a.personas), options: { fontSize: 10, bold: true, align: 'center' as const, color: C.guinda, fill: relleno } },
      ]
    })
    const anchoArea = 2.7
    const anchoCol = (12.3 - anchoArea) / (mats.length + 1)
    s.addTable([enc, ...filas], {
      x: 0.5, y: 1.45, w: 12.3, colW: [anchoArea, ...mats.map(() => anchoCol), anchoCol], fontFace: FUENTE, border: { type: 'solid', color: 'DDD8CE', pt: 0.5 }, valign: 'middle', rowH: 0.36, autoPage: false,
    })
    if (d.porArea.length > areas.length) {
      s.addText(`Se muestran las ${areas.length} áreas con más personal atendido de ${d.porArea.length}. El detalle completo está en el Excel.`, { x: 0.5, y: 6.35, w: 9, h: 0.3, fontFace: FUENTE, fontSize: 10, italic: true, color: C.gris, margin: 0, isTextBox: true })
    }
  }

  // ---------- 7. Evolución diaria ----------
  if (d.porDia.length > 1) {
    const s = laminaContenido(pres, p, d, 'Evolución por día')
    const et = d.porDia.map((x) => {
      const f = new Date(x.fecha + 'T12:00:00')
      return f.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
    })
    s.addChart(
      pres.ChartType.bar,
      [
        { name: 'Personas atendidas', labels: et, values: d.porDia.map((x) => x.personas) },
        { name: 'Piezas entregadas', labels: et, values: d.porDia.map((x) => x.piezas) },
      ],
      {
        x: 0.5, y: 1.4, w: 12.3, h: 5.2, barDir: 'col', barGrouping: 'clustered', chartColors: [C.verde, C.dorado], showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 10,
        catAxisLabelFontSize: 11, catAxisLabelColor: C.texto, valAxisLabelColor: C.gris, valAxisLabelFontSize: 10, valGridLine: { color: 'E4E0D8', size: 0.5 }, catGridLine: { style: 'none' },
        showLegend: true, legendPos: 't', legendFontSize: 11, legendColor: C.texto, barGapWidthPct: 60,
      },
    )
  }

  // ---------- 8. Hallazgos y alertas ----------
  {
    const s = laminaContenido(pres, p, d, 'Hallazgos y alertas')
    d.hallazgos.slice(0, 6).forEach((h, i) => {
      const y = 1.5 + i * 0.84
      s.addShape('ellipse', { x: 0.6, y: y + 0.08, w: 0.46, h: 0.46, fill: { color: i % 2 ? C.dorado : C.verde }, line: { color: i % 2 ? C.dorado : C.verde } })
      s.addText(String(i + 1), { x: 0.6, y: y + 0.08, w: 0.46, h: 0.46, fontFace: FUENTE, fontSize: 14, bold: true, color: C.blanco, align: 'center', valign: 'middle', margin: 0, isTextBox: true })
      s.addText(h, { x: 1.25, y, w: 6.8, h: 0.66, fontFace: FUENTE, fontSize: 13, color: C.texto, margin: 0, valign: 'middle', fit: 'shrink', isTextBox: true })
    })
    if (!d.hallazgos.length) s.addText('Sin entregas registradas en el periodo.', { x: 0.6, y: 1.6, w: 7, h: 0.5, fontFace: FUENTE, fontSize: 14, color: C.gris, margin: 0, isTextBox: true })

    const bloques: { titulo: string; color: string; lineas: string[] }[] = [
      { titulo: `Por reabastecer (${d.reabastecer.length})`, color: C.guinda, lineas: d.reabastecer.slice(0, 5).map((r) => `${r.nombre}: ${r.existencia} (mín. ${r.minimo})`) },
      { titulo: `Préstamos vencidos (${d.prestamosVencidos.length})`, color: C.guinda, lineas: d.prestamosVencidos.slice(0, 4).map((r) => `${r.nombre} · desde ${r.fechaEntrega}`) },
      { titulo: 'Equipo en resguardo', color: C.verde, lineas: d.resguardosActivos.map((r) => `${r.nombre}: ${r.cantidad}`) },
    ]
    let y = 1.5
    for (const b of bloques) {
      const lineas = b.lineas.length ? b.lineas : ['Sin pendientes']
      const alto = 0.55 + lineas.length * 0.27
      tarjeta(s, 8.5, y, 4.4, alto)
      s.addText(
        [
          { text: b.titulo, options: { bold: true, fontSize: 13, color: b.color, breakLine: true } },
          ...lineas.map((l, i) => ({ text: l, options: { fontSize: 10.5, color: C.texto, breakLine: i < lineas.length - 1 } })),
        ],
        { x: 8.7, y: y + 0.08, w: 4.0, h: alto - 0.16, fontFace: FUENTE, margin: 0, valign: 'top', isTextBox: true },
      )
      y += alto + 0.18
    }
  }

  const blob = (await pres.write({ outputType: 'blob' })) as Blob
  return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
}

export { ALTO }
