import type PptxGenJS from 'pptxgenjs'
import type { DatosReporte } from './datos'
import { pct, titulo, fechasCortas, otrosTexto, periodoPortada, desgloseOtrasAreas, textoVariacion, variacion, type OpcionesEntregable } from './datos'
import { estilizarPresentacion, mezcla } from './estilos'
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
  s.addText(d.filtroTexto ? `${d.titulo} · ${d.filtroTexto}` : d.titulo, { x: 0.6, y: 0.92, w: 9.4, h: 0.36, fontFace: FUENTE, fontSize: 14, color: C.gris, margin: 0, fit: 'shrink', isTextBox: true })
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
const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`
/** Color de una variación: subir consumo es atención (guinda), bajar es bueno (verde). */
const colorVariacion = (actual: number, anterior: number, neutro = false) => {
  const v = variacion(actual, anterior)
  if (neutro || v === null || v === 0) return C.gris
  return v > 0 ? C.guinda : C.verde
}
const COLOR_NIVEL = { alta: C.guinda, media: C.dorado, ok: C.verde }
const ETIQUETA_NIVEL = { alta: 'ALERTA', media: 'ATENCIÓN', ok: 'BIEN' }

export async function generarPresentacion(d: DatosReporte, p: Plantilla, opciones: OpcionesEntregable = {}): Promise<Blob> {
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
    s.addText('INFORME DE ENTREGA DE EQUIPO DE\nPROTECCIÓN PERSONAL', { x: 0.7, y: 1.45, w: 11.9, h: 1.8, fontFace: FUENTE, fontSize: 40, bold: true, color: C.verde, margin: 0, valign: 'bottom', isTextBox: true })
    s.addShape('line', { x: 0.7, y: 3.45, w: 11.95, h: 0, line: { color: C.dorado, width: 1.5 } })
    s.addText(periodoPortada(d.desde, d.hasta), { x: 0.7, y: 3.6, w: 11.9, h: 0.5, fontFace: FUENTE, fontSize: 20, bold: true, color: C.guinda, margin: 0, isTextBox: true })
    if (d.filtroTexto) s.addText(d.filtroTexto.toUpperCase(), { x: 0.7, y: 4.02, w: 11.9, h: 0.32, fontFace: FUENTE, fontSize: 13, bold: true, color: C.gris, margin: 0, fit: 'shrink', isTextBox: true })
    const kpis: [string, string][] = [
      [miles(d.personas), 'personas atendidas'],
      [miles(d.areas), d.areas === 1 ? 'área' : 'áreas'],
      [miles(d.entregas.length), d.entregas.length === 1 ? 'entrega realizada' : 'entregas realizadas'],
      [miles(d.piezas), 'piezas de EPP entregadas'],
    ]
    const anchoKpi = 11.95 / kpis.length
    kpis.forEach(([n, t], i) => {
      const x = 0.7 + i * anchoKpi
      const color = i % 2 ? C.texto : C.verde
      s.addText(n, { x, y: 4.35, w: anchoKpi, h: 0.66, fontFace: FUENTE, fontSize: 36, bold: true, color, align: 'center', margin: 0, isTextBox: true })
      s.addText(t, { x, y: 5.01, w: anchoKpi, h: 0.4, fontFace: FUENTE, fontSize: 13, color: C.gris, align: 'center', margin: 0, valign: 'top', isTextBox: true })
    })
    s.addText(`${p.textos.oficina} · ${p.textos.institucion}`, { x: 0.7, y: 6.95, w: 5.5, h: 0.3, fontFace: FUENTE, fontSize: 10, color: C.gris, margin: 0, isTextBox: true })
  }

  // ---------- 2. Resumen general ----------
  {
    const s = laminaContenido(pres, p, d, 'Resumen general')
    const casco = d.materiales.find((m) => m.id === 'casco')
    const carnaza = d.materiales.find((m) => m.id === 'g_carnaza')
    const kpis: [string, string, string, number, number, boolean][] = [
      [miles(d.personas), 'Personal atendido', C.verde, d.personas, d.anterior.personas, true],
      [miles(casco?.piezas ?? 0), 'Cascos entregados', C.guinda, casco?.piezas ?? 0, d.anterior.porMaterial.get('casco') ?? 0, false],
      [miles(carnaza?.piezas ?? 0), 'Guantes de carnaza', C.texto, carnaza?.piezas ?? 0, d.anterior.porMaterial.get('g_carnaza') ?? 0, false],
    ]
    kpis.forEach(([n, t, color, actual, antes, neutro], i) => {
      tarjeta(s, 0.6, 1.5 + i * 1.28, 3.8, 1.12)
      cifra(s, 0.85, 1.6 + i * 1.28, 3.4, n, t, color, 34)
      s.addText([
        { text: textoVariacion(actual, antes), options: { bold: true, color: colorVariacion(actual, antes, neutro), breakLine: true } },
        { text: 'vs. anterior', options: { fontSize: 9, color: C.gris } },
      ], { x: 2.95, y: 1.62 + i * 1.28, w: 1.3, h: 0.6, fontFace: FUENTE, fontSize: 13, align: 'right', margin: 0, valign: 'top', isTextBox: true })
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

  // ---------- Tendencia y comparativo ----------
  if (d.tendencia.puntos.some((x) => x.piezas)) {
    const s = laminaContenido(pres, p, d, 'Tendencia y comparativo')
    const t = d.tendencia.puntos
    s.addText(`Últim${d.tendencia.unidad === 'semana' ? 'as 12 semanas' : 'os 12 meses'}`, { x: 0.6, y: 1.42, w: 7.8, h: 0.34, fontFace: FUENTE, fontSize: 14, bold: true, color: C.guinda, margin: 0, isTextBox: true })
    s.addChart(
      pres.ChartType.line,
      [
        { name: 'Piezas entregadas', labels: t.map((x) => x.etiqueta), values: t.map((x) => x.piezas) },
        { name: 'Personas atendidas', labels: t.map((x) => x.etiqueta), values: t.map((x) => x.personas) },
      ],
      {
        x: 0.5, y: 1.8, w: 7.9, h: 4.8, chartColors: [C.dorado, C.verde], lineSize: 2.5, lineDataSymbol: 'circle', lineDataSymbolSize: 7, showValue: true, dataLabelPosition: 't', dataLabelFontSize: 9,
        dataLabelColor: C.texto, catAxisLabelFontSize: 10, catAxisLabelColor: C.texto, valAxisLabelColor: C.gris, valAxisLabelFontSize: 9, valGridLine: { color: 'E4E0D8', size: 0.5 },
        catGridLine: { style: 'none' }, showLegend: true, legendPos: 't', legendFontSize: 11, legendColor: C.texto,
      },
    )
    const a = d.anterior
    const filasC: [string, number, number][] = [
      ['Personas atendidas', d.personas, a.personas],
      ['Entregas', d.entregas.length, a.entregas],
      ['Piezas entregadas', d.piezas, a.piezas],
      ['Cascos', d.cascos, a.cascos],
      ['Casos recurrentes', d.recurrentes.length, a.recurrentes],
      ['EPP contaminado', d.contaminado.eventos, a.contaminado],
    ]
    const encC = (text: string, align: 'left' | 'center' = 'center') => ({ text, options: { bold: true, color: C.blanco, fill: { color: C.verde }, fontSize: 8.5, align } })
    s.addText([
      { text: 'Contra el periodo anterior', options: { bold: true, color: C.guinda, fontSize: 14, breakLine: true } },
      { text: a.titulo, options: { color: C.gris, fontSize: 11 } },
    ], { x: 8.7, y: 1.42, w: 4.2, h: 0.62, fontFace: FUENTE, margin: 0, isTextBox: true })
    s.addTable(
      [
        [encC('INDICADOR', 'left'), encC('ACTUAL'), encC('ANTERIOR'), encC('CAMBIO')],
        ...filasC.map(([n, actual, antes], i): PptxGenJS.TableRow => {
          const o = { fontSize: 10.5, color: C.texto, fill: { color: i % 2 ? 'F3F1EC' : C.blanco }, align: 'center' as const }
          return [
            { text: n, options: { ...o, align: 'left', bold: true } },
            { text: miles(actual), options: { ...o, bold: true } },
            { text: miles(antes), options: { ...o, color: C.gris } },
            { text: textoVariacion(actual, antes), options: { ...o, bold: true, color: colorVariacion(actual, antes, i === 0) } },
          ]
        }),
      ],
      { x: 8.7, y: 2.15, w: 4.2, colW: [1.5, 0.75, 0.9, 1.05], fontFace: FUENTE, border: { type: 'solid', color: 'DDD8CE', pt: 0.5 }, valign: 'middle', rowH: 0.42, autoPage: false },
    )
    s.addText('▲ en guinda: subió el consumo. ▼ en verde: bajó.', { x: 8.7, y: 5.25, w: 4.2, h: 0.3, fontFace: FUENTE, fontSize: 9.5, italic: true, color: C.gris, margin: 0, isTextBox: true })
  }

  // ---------- 3. Material entregado ----------
  if (d.materiales.length) {
    const s = laminaContenido(pres, p, d, 'Material entregado')
    const top = d.materiales.slice(0, 12).reverse()
    s.addChart(pres.ChartType.bar, [{ name: 'Piezas', labels: top.map((m) => m.nombre), values: top.map((m) => m.piezas) }], {
      x: 0.5, y: 1.4, w: 8.4, h: 5.25, barDir: 'bar', chartColors: [C.verde], showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 11, dataLabelColor: C.texto,
      catAxisLabelFontSize: 11, catAxisLabelColor: C.texto, valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false, barGapWidthPct: 45,
    })
    tarjeta(s, 9.2, 1.5, 3.7, 1.05, 'EAF1EE')
    s.addText([
      { text: `${d.pareto.materiales} de ${d.pareto.total} `, options: { bold: true, fontSize: 20, color: C.verde } },
      { text: `materiales concentran el 80% de las piezas entregadas.`, options: { fontSize: 11.5, color: C.texto } },
    ], { x: 9.38, y: 1.56, w: 3.4, h: 0.93, fontFace: FUENTE, margin: 0, valign: 'middle', isTextBox: true })
    const conTallas = d.materiales.filter((m) => m.tallas.length).slice(0, 3)
    if (conTallas.length) {
      s.addText('Tallas más solicitadas', { x: 9.2, y: 2.75, w: 3.7, h: 0.4, fontFace: FUENTE, fontSize: 15, bold: true, color: C.guinda, margin: 0, isTextBox: true })
      conTallas.forEach((m, i) => {
        const y = 3.2 + i * 1.12
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

  // ---------- Tipo de equipo ----------
  if (d.porCategoria.length > 1 || d.porTipo.length > 1) {
    const s = laminaContenido(pres, p, d, 'Tipo de equipo entregado')
    const cats = d.porCategoria.slice(0, 8)
    s.addChart(pres.ChartType.doughnut, [{ name: 'Piezas', labels: cats.map((c) => c.nombre), values: cats.map((c) => c.piezas) }], {
      x: 0.5, y: 1.4, w: 6.6, h: 5.2, holeSize: 55, chartColors: SERIE, showPercent: true, showValue: false, dataLabelColor: C.blanco, dataLabelFontSize: 11,
      showLegend: true, legendPos: 'r', legendFontSize: 11, legendColor: C.texto,
    })
    const top = d.porCategoria[0]
    tarjeta(s, 7.4, 1.5, 5.5, 1.3)
    s.addText([
      { text: `${top.nombre} `, options: { bold: true, color: C.verde } },
      { text: `es la protección más solicitada: ${pct(top.piezas, d.piezas)}% de las piezas.`, options: { color: C.texto } },
    ], { x: 7.65, y: 1.56, w: 5.05, h: 1.18, fontFace: FUENTE, fontSize: 16, margin: 0, valign: 'middle', isTextBox: true })
    d.porTipo.forEach((t, i) => {
      const x = 7.4 + i * 1.88
      tarjeta(s, x, 3.0, 1.74, 1.45)
      cifra(s, x + 0.17, 3.1, 1.45, miles(t.piezas), `${t.nombre.toLowerCase()} (${pct(t.piezas, d.piezas)}%)`, i === 0 ? C.verde : i === 1 ? C.guinda : C.texto, 24)
    })
    s.addText('Consumible: se entrega y no regresa. Resguardo: queda a cargo del trabajador. Préstamo: se devuelve al almacén.', {
      x: 7.4, y: 4.65, w: 5.5, h: 0.8, fontFace: FUENTE, fontSize: 10.5, italic: true, color: C.gris, margin: 0, valign: 'top', isTextBox: true,
    })
  }

  // ---------- 4. Personal atendido por área ----------
  if (d.porArea.length > 1) {
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

  // ---------- Consumo por persona ----------
  if (d.consumoPorPersona.length > 1) {
    const s = laminaContenido(pres, p, d, 'Piezas por persona en cada área')
    const areas = d.consumoPorPersona.slice(0, 14).reverse()
    s.addChart(pres.ChartType.bar, [{ name: 'Piezas por persona', labels: areas.map((a) => titulo(a.area)), values: areas.map((a) => a.porPersona) }], {
      x: 0.5, y: 1.4, w: 8.2, h: 5.25, barDir: 'bar', chartColors: [C.verde], showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 11, dataLabelColor: C.texto, dataLabelFormatCode: '0.0',
      catAxisLabelFontSize: 10.5, catAxisLabelColor: C.texto, valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false, barGapWidthPct: 40,
    })
    tarjeta(s, 9.0, 1.5, 3.9, 1.5)
    cifra(s, 9.25, 1.62, 3.5, String(d.promedioPorPersona), 'piezas por persona en promedio', C.verde, 34)
    const altas = d.consumoPorPersona.filter((a) => a.porPersona >= d.promedioPorPersona * 1.5)
    tarjeta(s, 9.0, 3.2, 3.9, 3.3, altas.length ? 'F6EEEA' : C.blanco)
    s.addText(
      altas.length
        ? [
            { text: 'Por encima de 1.5 veces el promedio', options: { bold: true, color: C.guinda, fontSize: 13, breakLine: true } },
            ...altas.slice(0, 6).map((a, i, arr) => ({ text: `${titulo(a.area)}: ${a.porPersona} (${a.personas} personas)`, options: { bullet: { indent: 12 }, fontSize: 11.5, color: C.texto, breakLine: i < arr.length - 1 } })),
          ]
        : [{ text: 'Ninguna área supera 1.5 veces el promedio de piezas por persona.', options: { fontSize: 12, color: C.texto } }],
      { x: 9.2, y: 3.32, w: 3.5, h: 3.06, fontFace: FUENTE, margin: 0, valign: 'top', paraSpaceAfter: 4, isTextBox: true },
    )
    s.addText('Solo áreas con 3 personas o más. Un valor alto puede indicar trabajos especiales o falta de resguardo del EPP.', {
      x: 0.5, y: 6.4, w: 8.2, h: 0.3, fontFace: FUENTE, fontSize: 10, italic: true, color: C.gris, margin: 0, isTextBox: true,
    })
  }

  // ---------- 5. Cascos ----------
  if (d.cascos) {
    const s = laminaContenido(pres, p, d, 'Entrega de cascos')
    const conCasco = [...d.porArea].filter((a) => a.cascos).sort((a, b) => b.cascos - a.cascos)
    const principales = conCasco.slice(0, 6)
    const resto = conCasco.slice(6).reduce((n, a) => n + a.cascos, 0)
    const etiquetas = [...principales.map((a) => titulo(a.area)), ...(resto ? ['Otras áreas'] : [])]
    const valores = [...principales.map((a) => a.cascos), ...(resto ? [resto] : [])]
    const otras = desgloseOtrasAreas(conCasco.slice(6), d.cascos)
    s.addChart(pres.ChartType.doughnut, [{ name: 'Cascos', labels: etiquetas, values: valores }], {
      x: 0.5, y: 1.4, w: 6.4, h: otras ? 4.3 : 5.2, holeSize: 55, chartColors: SERIE, showPercent: true, showValue: false, dataLabelColor: C.blanco, dataLabelFontSize: 11,
      showLegend: true, legendPos: 'r', legendFontSize: 10.5, legendColor: C.texto,
    })
    if (otras) {
      // Desglose de la rebanada «Otras áreas»
      tarjeta(s, 0.6, 5.8, 6.3, 0.85, 'F3F1EC')
      s.addText(
        [
          { text: `Desglose de «Otras áreas» (${miles(resto)} cascos): `, options: { bold: true, color: C.guinda } },
          { text: otras, options: { color: C.texto } },
        ],
        { x: 0.75, y: 5.84, w: 6.0, h: 0.77, fontFace: FUENTE, fontSize: 10, margin: 0, valign: 'middle', fit: 'shrink', isTextBox: true },
      )
    }
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
  if (d.porArea.length > 1) {
    const s = laminaContenido(pres, p, d, 'Material entregado por área')
    const mats = d.materiales.slice(0, 8)
    const areas = d.porArea.slice(0, 12)
    const enc: PptxGenJS.TableCell[] = [
      { text: 'ÁREA', options: { bold: true, color: C.blanco, fill: { color: C.verde }, fontSize: 9.5 } },
      ...mats.map((m) => ({ text: m.nombre.toUpperCase(), options: { bold: true, color: C.blanco, fill: { color: C.verde }, fontSize: 8.5, align: 'center' as const } })),
      { text: 'PERSONAS', options: { bold: true, color: C.blanco, fill: { color: C.guinda }, fontSize: 8.5, align: 'center' as const } },
    ]
    // Mapa de calor: cada celda se colorea según cuánto representa dentro de su material
    const maximos = mats.map((m) => Math.max(1, ...areas.map((a) => a.porMaterial[m.id] ?? 0)))
    const filas: PptxGenJS.TableRow[] = areas.map((a, i) => {
      const relleno = { color: i % 2 ? 'F3F1EC' : C.blanco }
      return [
        { text: titulo(a.area), options: { fontSize: 9.5, bold: true, color: C.texto, fill: relleno } },
        ...mats.map((m, j) => {
          const n = a.porMaterial[m.id] ?? 0
          const t = n / maximos[j]
          return { text: n ? String(n) : '–', options: { fontSize: 10, align: 'center' as const, bold: t > 0.6, color: !n ? 'B5B5B5' : t > 0.6 ? C.blanco : C.texto, fill: n ? { color: mezcla(C.verde, 0.92 - t * 0.92) } : relleno } }
        }),
        { text: String(a.personas), options: { fontSize: 10, bold: true, align: 'center' as const, color: C.guinda, fill: relleno } },
      ]
    })
    const anchoArea = 2.7
    const anchoCol = (12.3 - anchoArea) / (mats.length + 1)
    s.addTable([enc, ...filas], {
      x: 0.5, y: 1.45, w: 12.3, colW: [anchoArea, ...mats.map(() => anchoCol), anchoCol], fontFace: FUENTE, border: { type: 'solid', color: 'DDD8CE', pt: 0.5 }, valign: 'middle', rowH: 0.36, autoPage: false,
    })
    if (d.porArea.length > areas.length) {
      s.addText(`Se muestran las ${areas.length} áreas con más personal atendido de ${d.porArea.length}. Color más intenso = el área que más recibió de ese material. El detalle completo está en el Excel.`, { x: 0.5, y: 6.35, w: 9, h: 0.3, fontFace: FUENTE, fontSize: 10, italic: true, color: C.gris, margin: 0, isTextBox: true })
    }
  }

  // ---------- Solicitantes recurrentes ----------
  if (d.recurrentes.length) {
    const s = laminaContenido(pres, p, d, 'Solicitantes recurrentes')
    const conDetalle = !!opciones.detalleRecurrentes
    const top = [...d.recurrentes].sort((a, b) => b.veces - a.veces || b.piezas - a.piezas).slice(0, conDetalle ? 7 : 12)
    const celdaEnc = (text: string, align: 'left' | 'center' = 'left') => ({ text, options: { bold: true, color: C.blanco, fill: { color: C.verde }, fontSize: 9.5, align } })
    const enc: PptxGenJS.TableCell[] = [celdaEnc('SOLICITANTE'), celdaEnc('ÁREA'), celdaEnc('MATERIAL'), celdaEnc('VECES', 'center'), celdaEnc('PIEZAS', 'center'), celdaEnc('ÚLTIMA', 'center'), celdaEnc('COMENTARIO')]
    const filas: PptxGenJS.TableRow[] = top.flatMap((r, i) => {
      const fill = { color: i % 2 ? 'F3F1EC' : C.blanco }
      const o = { fontSize: 9.5, color: C.texto, fill }
      const detalle: PptxGenJS.TableRow[] = conDetalle
        ? [
            [
              {
                text: [
                  { text: 'Fechas: ', options: { bold: true, color: C.verde } },
                  { text: fechasCortas(r, 14) },
                  ...(r.otros.length ? [{ text: '   ·   También recibió: ', options: { bold: true, color: C.verde } }, { text: otrosTexto(r) }] : []),
                ],
                options: { colspan: 7, fontSize: 8, color: '4A4D4C', fill },
              },
            ],
          ]
        : []
      return [
        [
        { text: `${titulo(r.nombre)} (${r.rpe})`, options: { ...o, bold: true } },
        { text: titulo(r.area), options: o },
        { text: r.material, options: o },
        { text: String(r.veces), options: { ...o, bold: true, color: C.guinda, align: 'center' as const } },
        { text: String(r.piezas), options: { ...o, align: 'center' as const } },
        { text: r.ultima, options: { ...o, align: 'center' as const } },
        { text: r.notas.join(' · ') || '—', options: { ...o, fontSize: 8.5, color: r.notas.length ? C.texto : 'B5B5B5' } },
      ],
        ...detalle,
      ]
    })
    s.addTable([enc, ...filas], {
      x: 0.5, y: 1.45, w: 12.3, colW: [3.1, 2.3, 2.3, 0.8, 0.8, 1.1, 1.9], fontFace: FUENTE, border: { type: 'solid', color: 'DDD8CE', pt: 0.5 }, valign: 'middle', rowH: conDetalle ? 0.29 : 0.36, autoPage: false,
    })
    s.addText(`Personas que recibieron el mismo material en 2 o más entregas del periodo (${d.recurrentes.length} casos${conDetalle ? '; se muestran los 7 más frecuentes' : ''}). El detalle por área y material está en el Excel.`, {
      x: 0.5, y: 6.35, w: 12.3, h: 0.3, fontFace: FUENTE, fontSize: 10, italic: true, color: C.gris, margin: 0, isTextBox: true,
    })
  }

  // ---------- Recurrencia por área ----------
  if (d.recurrenciaPorArea.length > 1) {
    const s = laminaContenido(pres, p, d, 'Solicitantes recurrentes por área')
    const areas = d.recurrenciaPorArea.slice(0, 12).reverse()
    s.addChart(pres.ChartType.bar, [{ name: 'Casos', labels: areas.map((a) => titulo(a.area)), values: areas.map((a) => a.casos) }], {
      x: 0.5, y: 1.4, w: 8.2, h: 5.25, barDir: 'bar', chartColors: [C.guinda], showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 11, dataLabelColor: C.texto,
      catAxisLabelFontSize: 10.5, catAxisLabelColor: C.texto, valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false, barGapWidthPct: 40,
    })
    const personasRec = new Set(d.recurrentes.map((r) => r.rpe)).size
    tarjeta(s, 9.0, 1.5, 3.9, 1.6)
    cifra(s, 9.25, 1.62, 3.5, `${pct(personasRec, d.personas)}%`, `del personal atendido (${personasRec} personas) tuvo algún caso recurrente`, C.guinda, 34)
    const topPct = [...d.recurrenciaPorArea].filter((a) => a.personasArea >= 3).sort((a, b) => b.pct - a.pct)[0]
    if (topPct) {
      tarjeta(s, 9.0, 3.3, 3.9, 1.6)
      cifra(s, 9.25, 3.42, 3.5, `${topPct.pct}%`, `de las personas de ${titulo(topPct.area)} repitió material`, C.texto, 34)
    }
    s.addText('Casos = persona y material que se entregaron 2 o más veces en el periodo. El listado con nombres está en la lámina anterior y en el Excel.', {
      x: 9.0, y: 5.1, w: 3.9, h: 1.2, fontFace: FUENTE, fontSize: 10.5, italic: true, color: C.gris, margin: 0, valign: 'top', isTextBox: true,
    })
  }

  // ---------- EPP contaminado ----------
  if (d.contaminado.ultimos.length) {
    const s = laminaContenido(pres, p, d, 'EPP contaminado')
    const c = d.contaminado
    tarjeta(s, 0.5, 1.5, 4.4, 1.3)
    cifra(s, 0.7, 1.6, 2.0, miles(c.eventos), c.eventos === 1 ? 'cambio en el periodo' : 'cambios en el periodo', C.guinda, 32)
    cifra(s, 2.75, 1.6, 2.0, miles(c.piezas), c.piezas === 1 ? 'pieza contaminada' : 'piezas contaminadas', C.texto, 32)
    const celdaEnc = (text: string, align: 'left' | 'center' = 'left') => ({ text, options: { bold: true, color: C.blanco, fill: { color: C.verde }, fontSize: 9.5, align } })
    s.addText('Material contaminado', { x: 0.5, y: 3.0, w: 4.4, h: 0.36, fontFace: FUENTE, fontSize: 14, bold: true, color: C.guinda, margin: 0, isTextBox: true })
    if (c.porMaterial.length) {
      const mats = c.porMaterial.slice(0, 8)
      s.addTable(
        [
          [celdaEnc('MATERIAL'), celdaEnc('CAMBIOS', 'center'), celdaEnc('PIEZAS', 'center')],
          ...mats.map((m, i): PptxGenJS.TableRow => {
            const o = { fontSize: 10, color: C.texto, fill: { color: i % 2 ? 'F3F1EC' : C.blanco } }
            return [
              { text: m.material, options: { ...o, bold: true } },
              { text: String(m.eventos), options: { ...o, align: 'center' } },
              { text: String(m.piezas), options: { ...o, bold: true, color: C.guinda, align: 'center' } },
            ]
          }),
        ],
        { x: 0.5, y: 3.42, w: 4.4, colW: [2.6, 0.9, 0.9], fontFace: FUENTE, border: { type: 'solid', color: 'DDD8CE', pt: 0.5 }, valign: 'middle', rowH: 0.32, autoPage: false },
      )
    } else {
      s.addText('Sin cambios de EPP contaminado en el periodo.', { x: 0.5, y: 3.42, w: 4.4, h: 0.4, fontFace: FUENTE, fontSize: 12, color: C.gris, margin: 0, isTextBox: true })
    }
    s.addText(`Últimos ${c.ultimos.length} folios entregados`, { x: 5.2, y: 1.45, w: 7.6, h: 0.36, fontFace: FUENTE, fontSize: 14, bold: true, color: C.guinda, margin: 0, isTextBox: true })
    s.addTable(
      [
        [celdaEnc('FOLIO'), celdaEnc('FECHA', 'center'), celdaEnc('PERSONA'), celdaEnc('ÁREA'), celdaEnc('MATERIAL')],
        ...c.ultimos.map((x, i): PptxGenJS.TableRow => {
          const o = { fontSize: 9, color: C.texto, fill: { color: i % 2 ? 'F3F1EC' : C.blanco } }
          return [
            { text: x.folioFormato || '—', options: { ...o, bold: true, color: x.folioFormato ? C.guinda : 'B5B5B5' } },
            { text: fechaCorta(x.entrega.fecha), options: { ...o, align: 'center' } },
            { text: titulo(x.entrega.nombre), options: o },
            { text: titulo(x.entrega.area), options: o },
            { text: x.materiales.join(', '), options: { ...o, fontSize: 8.5 } },
          ]
        }),
      ],
      { x: 5.2, y: 1.87, w: 7.6, colW: [1.45, 0.95, 2.0, 1.6, 1.6], fontFace: FUENTE, border: { type: 'solid', color: 'DDD8CE', pt: 0.5 }, valign: 'middle', rowH: 0.38, autoPage: false },
    )
    s.addText('Cambios registrados con la casilla «EPP contaminado» y el folio del formato en papel. El listado completo está en el Excel.', {
      x: 0.5, y: 6.35, w: 12.3, h: 0.3, fontFace: FUENTE, fontSize: 10, italic: true, color: C.gris, margin: 0, isTextBox: true,
    })
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

  // ---------- 8. Hallazgos y alertas (cierre) ----------
  {
    const s = laminaContenido(pres, p, d, 'Hallazgos y alertas')
    const lista = d.alertas.slice(0, 5)
    if (!lista.length) {
      s.addText(d.personas ? 'Sin alertas en el periodo.' : 'Sin entregas registradas en el periodo.', { x: 0.6, y: 1.6, w: 7.5, h: 0.5, fontFace: FUENTE, fontSize: 15, color: C.gris, margin: 0, isTextBox: true })
    }
    lista.forEach((a, i) => {
      const y = 1.45 + i * 1.0
      const color = COLOR_NIVEL[a.nivel]
      tarjeta(s, 0.55, y, 7.75, 0.88)
      s.addShape('roundRect', { x: 0.7, y: y + 0.24, w: 1.15, h: 0.4, rectRadius: 0.08, fill: { color }, line: { color } })
      s.addText(ETIQUETA_NIVEL[a.nivel], { x: 0.7, y: y + 0.24, w: 1.15, h: 0.4, fontFace: FUENTE, fontSize: 9.5, bold: true, color: C.blanco, align: 'center', valign: 'middle', margin: 0, isTextBox: true })
      s.addText(
        [
          { text: a.titulo, options: { fontSize: 11.5, bold: true, color: C.texto, breakLine: true } },
          { text: `→ ${a.accion}`, options: { fontSize: 10.5, color: color === C.dorado ? '8A6A35' : color } },
        ],
        { x: 2.0, y: y + 0.05, w: 6.15, h: 0.78, fontFace: FUENTE, margin: 0, valign: 'middle', fit: 'shrink', isTextBox: true },
      )
    })

    const hall = d.hallazgos.slice(0, 5)
    tarjeta(s, 8.55, 1.45, 4.35, 3.55)
    s.addText(
      [
        { text: 'Hallazgos del periodo', options: { bold: true, fontSize: 13, color: C.verde, breakLine: true } },
        ...(hall.length ? hall : ['Sin datos suficientes.']).map((h, i, arr) => ({ text: h, options: { bullet: { indent: 12 }, fontSize: 10.5, color: C.texto, breakLine: i < arr.length - 1 } })),
      ],
      { x: 8.75, y: 1.55, w: 3.95, h: 3.35, fontFace: FUENTE, margin: 0, valign: 'top', paraSpaceAfter: 3, fit: 'shrink', isTextBox: true },
    )
    const resg = d.resguardosActivos.map((r) => `${r.nombre}: ${r.cantidad}`)
    tarjeta(s, 8.55, 5.15, 4.35, 1.35)
    s.addText(
      [
        { text: 'Equipo en resguardo', options: { bold: true, fontSize: 12, color: C.verde, breakLine: true } },
        { text: resg.length ? resg.slice(0, 6).join(' · ') : 'Sin equipo en resguardo.', options: { fontSize: 10.5, color: C.texto } },
      ],
      { x: 8.75, y: 5.22, w: 3.95, h: 1.2, fontFace: FUENTE, margin: 0, valign: 'top', fit: 'shrink', isTextBox: true },
    )
  }

  const blob = (await pres.write({ outputType: 'blob' })) as Blob
  // Estilo de las gráficas elegido en Reportes (se aplica sobre las gráficas nativas de PowerPoint)
  const final = await estilizarPresentacion(blob, { barras: opciones.estiloBarras ?? 'plana', pastel: opciones.estiloPastel ?? 'dona' })
  return new Blob([final], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
}

export { ALTO }
