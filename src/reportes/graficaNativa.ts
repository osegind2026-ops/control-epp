// Gráficas NATIVAS de Office para el Word de Tendencias: en lugar de una imagen, el Word lleva
// una gráfica de Word con su propia hoja de Excel incrustada. En Word: clic derecho en la
// gráfica → «Editar datos» abre la tabla en Excel y la gráfica se actualiza sola; también se
// puede cambiar el tipo de gráfica, los colores y los títulos como cualquier gráfica de Office.
//
// La librería docx no hace gráficas: aquí se escribe el XML de DrawingML (chartSpace) y un
// .xlsx mínimo, y `incrustarGraficas` los mete al .docx ya generado.

export type TipoSerie = 'columnas' | 'lineas' | 'area'

export interface SerieNativa {
  nombre: string
  valores: (number | null)[]
  color: string
  tipo?: TipoSerie
  /** En el eje derecho (p. ej. porcentaje 0-100). */
  eje2?: boolean
  punteada?: boolean
  /** Color por punto (p. ej. semanas sin existencia en gris, valores negativos en rojo). */
  colores?: (string | undefined)[]
  /** Mostrar las cifras sobre la gráfica (por omisión, si hay pocas categorías). */
  etiquetas?: boolean
  /** Formato de número de Excel para la serie (por omisión «#,##0»). */
  formato?: string
}

export interface GraficaNativa {
  /** columnas/líneas en el mismo eje («combinada»), barras horizontales o dona. */
  tipo: 'combinada' | 'barras' | 'dona'
  titulo: string
  subtitulo?: string
  categorias: string[]
  series: SerieNativa[]
  ejeY?: string
  ejeY2?: { titulo?: string; max?: number }
  /** Separación entre columnas (0-500); por omisión 60. */
  separacion?: number
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const hex = (c: string) => {
  const m = c.trim().match(/^#?([0-9a-f]{6})$/i)
  if (m) return m[1].toUpperCase()
  const r = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (r) return [r[1], r[2], r[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase()
  return '235B4E'
}
/** Aclara (t>0) u oscurece (t<0) un color en hex. */
const tono = (c: string, t: number) => {
  const h = hex(c)
  return [0, 2, 4]
    .map((i) => {
      const v = parseInt(h.slice(i, i + 2), 16)
      const n = Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t))
      return n.toString(16).padStart(2, '0')
    })
    .join('')
    .toUpperCase()
}

/** Letra de columna de Excel (0 → A). */
export const columna = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : columna(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)))

const SOMBRA = '<a:effectLst><a:outerShdw blurRad="50800" dist="31750" dir="2700000" algn="tl" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst>'
/** Relleno con degradado y sombra (como las columnas «con sombra» de la app). */
const rellenoBarra = (color: string, horizontal: boolean) =>
  `<c:spPr><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${tono(color, 0.2)}"/></a:gs><a:gs pos="45000"><a:srgbClr val="${hex(color)}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${tono(color, -0.3)}"/></a:gs></a:gsLst><a:lin ang="${horizontal ? 5400000 : 0}" scaled="1"/></a:gradFill>${SOMBRA}</c:spPr>`
const lineaSerie = (color: string, punteada?: boolean) =>
  `<c:spPr><a:ln w="38100" cap="rnd"><a:solidFill><a:srgbClr val="${hex(color)}"/></a:solidFill>${punteada ? '<a:prstDash val="dash"/>' : ''}<a:round/></a:ln>${SOMBRA}</c:spPr>`
const txPr = (sz: number, color = '3A3F44', b = false) =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${b ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:pPr><a:endParaRPr lang="es-MX"/></a:p></c:txPr>`

/** Referencias a la hoja «Datos»: categorías en la columna A y cada serie en B, C… */
function referencias(g: GraficaNativa, i: number) {
  const n = g.categorias.length
  const col = columna(i + 1)
  return {
    tx: `<c:tx><c:strRef><c:f>Datos!$${col}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(g.series[i].nombre)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`,
    cat: `<c:cat><c:strRef><c:f>Datos!$A$2:$A$${n + 1}</c:f><c:strCache><c:ptCount val="${n}"/>${g.categorias.map((c, j) => `<c:pt idx="${j}"><c:v>${esc(c)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`,
    val: `<c:val><c:numRef><c:f>Datos!$${col}$2:$${col}$${n + 1}</c:f><c:numCache><c:formatCode>${esc(g.series[i].formato ?? '#,##0')}</c:formatCode><c:ptCount val="${n}"/>${g.series[i].valores
      .map((v, j) => (v == null || !isFinite(v) ? '' : `<c:pt idx="${j}"><c:v>${v}</c:v></c:pt>`))
      .join('')}</c:numCache></c:numRef></c:val>`,
  }
}

function etiquetasDatos(s: SerieNativa, n: number, pos: string | null, color = '2B2F33') {
  const mostrar = s.etiquetas ?? n <= 16
  if (!mostrar) return '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>'
  return `<c:dLbls><c:numFmt formatCode="${esc(s.formato ?? '#,##0')}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, color, true)}${pos ? `<c:dLblPos val="${pos}"/>` : ''}<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`
}

function puntos(s: SerieNativa, horizontal: boolean, barra: boolean) {
  if (!s.colores) return ''
  return s.colores
    .map((c, j) =>
      c
        ? barra
          ? `<c:dPt><c:idx val="${j}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/>${rellenoBarra(c, horizontal)}</c:dPt>`
          : `<c:dPt><c:idx val="${j}"/><c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr><a:solidFill><a:srgbClr val="${hex(c)}"/></a:solidFill></c:spPr></c:marker><c:bubble3D val="0"/></c:dPt>`
        : '',
    )
    .join('')
}

function ejes(cat: number, val: number, o: { horizontal?: boolean; titulo?: string; derecho?: boolean; max?: number; oculto?: boolean }) {
  const h = !!o.horizontal
  const der = !!o.derecho
  const catAx = `<c:catAx><c:axId val="${cat}"/><c:scaling><c:orientation val="${h ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="${der ? 1 : 0}"/><c:axPos val="${h ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:spPr><a:ln w="12700"><a:solidFill><a:srgbClr val="9AA1A8"/></a:solidFill></a:ln></c:spPr>${txPr(h ? 1000 : 900, '4A4F55', h)}<c:crossAx val="${val}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
  const titulo = o.titulo
    ? `<c:title><c:tx><c:rich><a:bodyPr rot="${h ? 0 : -5400000}" vert="horz"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="0"/></a:pPr><a:r><a:rPr lang="es-MX" sz="900" b="0"><a:solidFill><a:srgbClr val="5B6168"/></a:solidFill></a:rPr><a:t>${esc(o.titulo)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
    : ''
  const valAx = `<c:valAx><c:axId val="${val}"/><c:scaling><c:orientation val="minMax"/>${o.max != null ? `<c:max val="${o.max}"/><c:min val="0"/>` : ''}</c:scaling><c:delete val="${o.oculto ? 1 : 0}"/><c:axPos val="${h ? 'b' : der ? 'r' : 'l'}"/>${der ? '' : '<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="DDE1E5"/></a:solidFill><a:prstDash val="dash"/></a:ln></c:spPr></c:majorGridlines>'}${titulo}<c:numFmt formatCode="${der && o.max === 100 ? '0&quot;%&quot;' : '#,##0'}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, '5B6168')}<c:crossAx val="${cat}"/><c:crosses val="${der || h ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`
  return catAx + valAx
}

/** XML de la gráfica (word/charts/chartN.xml). */
export function xmlGrafica(g: GraficaNativa): string {
  const n = g.categorias.length
  let plot = ''
  if (g.tipo === 'dona') {
    const s = g.series[0]
    const r = referencias(g, 0)
    const colores = s.colores ?? []
    plot = `<c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>${r.tx}${g.categorias
      .map(
        (_, j) =>
          `<c:dPt><c:idx val="${j}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${hex(colores[j] ?? s.color)}"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>${SOMBRA}</c:spPr></c:dPt>`,
      )
      .join(
        '',
      )}<c:dLbls><c:numFmt formatCode="0%" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(1000, 'FFFFFF', true)}<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="0"/></c:dLbls>${r.cat}${r.val}</c:ser><c:firstSliceAng val="0"/><c:holeSize val="50"/></c:doughnutChart>`
  } else {
    const horizontal = g.tipo === 'barras'
    const idx = g.series.map((s, i) => ({ s, i }))
    const grupo = (pred: (s: SerieNativa) => boolean) => idx.filter(({ s }) => pred(s))
    const barras = grupo((s) => horizontal || (s.tipo ?? 'columnas') === 'columnas')
    const areas = grupo((s) => !horizontal && s.tipo === 'area' && !s.eje2)
    const lineas = grupo((s) => !horizontal && s.tipo === 'lineas' && !s.eje2)
    const lineas2 = grupo((s) => !horizontal && s.eje2 === true && s.tipo !== 'columnas')
    const serBarra = ({ s, i }: { s: SerieNativa; i: number }) => {
      const r = referencias(g, i)
      return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${r.tx}${rellenoBarra(s.color, horizontal)}<c:invertIfNegative val="0"/>${puntos(s, horizontal, true)}${etiquetasDatos(s, n, 'outEnd')}${r.cat}${r.val}</c:ser>`
    }
    const serLinea = ({ s, i }: { s: SerieNativa; i: number }) => {
      const r = referencias(g, i)
      return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${r.tx}${lineaSerie(s.color, s.punteada)}<c:marker><c:symbol val="${s.punteada ? 'none' : 'circle'}"/><c:size val="6"/><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="${hex(s.color)}"/></a:solidFill></a:ln></c:spPr></c:marker>${puntos(s, false, false)}${etiquetasDatos(s, n, 't')}${r.cat}${r.val}<c:smooth val="0"/></c:ser>`
    }
    const serArea = ({ s, i }: { s: SerieNativa; i: number }) => {
      const r = referencias(g, i)
      return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${r.tx}<c:spPr><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${hex(s.color)}"><a:alpha val="70000"/></a:srgbClr></a:gs><a:gs pos="100000"><a:srgbClr val="${hex(s.color)}"><a:alpha val="8000"/></a:srgbClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="1"/></a:gradFill><a:ln w="28575"><a:solidFill><a:srgbClr val="${hex(s.color)}"/></a:solidFill></a:ln></c:spPr>${etiquetasDatos(s, n, null)}${r.cat}${r.val}</c:ser>`
    }
    if (barras.length)
      plot += `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${barras.map(serBarra).join('')}<c:gapWidth val="${g.separacion ?? 60}"/><c:overlap val="${barras.length > 1 ? -10 : 0}"/><c:axId val="101"/><c:axId val="102"/></c:barChart>`
    if (areas.length) plot += `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${areas.map(serArea).join('')}<c:axId val="101"/><c:axId val="102"/></c:areaChart>`
    if (lineas.length) plot += `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${lineas.map(serLinea).join('')}<c:marker val="1"/><c:axId val="101"/><c:axId val="102"/></c:lineChart>`
    if (lineas2.length) plot += `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${lineas2.map(serLinea).join('')}<c:marker val="1"/><c:axId val="103"/><c:axId val="104"/></c:lineChart>`
    plot += ejes(101, 102, { horizontal, titulo: g.ejeY })
    if (lineas2.length) plot += ejes(103, 104, { derecho: true, titulo: g.ejeY2?.titulo, max: g.ejeY2?.max })
  }
  const titulo = `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr><a:r><a:rPr lang="es-MX" sz="1400" b="1"><a:solidFill><a:srgbClr val="3A3F44"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${esc(g.titulo)}</a:t></a:r></a:p>${
    g.subtitulo
      ? `<a:p><a:pPr><a:defRPr sz="1000" b="0"/></a:pPr><a:r><a:rPr lang="es-MX" sz="1000" b="0"><a:solidFill><a:srgbClr val="6F7271"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${esc(g.subtitulo)}</a:t></a:r></a:p>`
      : ''
  }</c:rich></c:tx><c:overlay val="0"/></c:title>`
  const leyenda = g.series.length > 1 || g.tipo === 'dona' ? `<c:legend><c:legendPos val="${g.tipo === 'dona' ? 'r' : 'b'}"/><c:overlay val="0"/>${txPr(900, '3A3F44')}</c:legend>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:date1904 val="0"/><c:lang val="es-MX"/><c:roundedCorners val="1"/><c:chart>${titulo}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${leyenda}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="FFFFFF"/></a:gs><a:gs pos="100000"><a:srgbClr val="EEF0F2"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="1"/></a:gradFill><a:ln w="12700"><a:solidFill><a:srgbClr val="D5D9DD"/></a:solidFill></a:ln></c:spPr>${txPr(900)}<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`
}

/** Hoja de Excel (.xlsx) con los datos de la gráfica: A = categorías; B, C… = series. */
export async function xlsxGrafica(g: GraficaNativa): Promise<Uint8Array> {
  const JSZip = (await import('jszip')).default
  const z = new JSZip()
  const celdaTexto = (ref: string, t: string, s = 0) => `<c r="${ref}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${esc(t)}</t></is></c>`
  const filas: string[] = []
  filas.push(`<row r="1">${celdaTexto('A1', g.ejeY ? 'Periodo / categoría' : 'Categoría', 1)}${g.series.map((s, i) => celdaTexto(`${columna(i + 1)}1`, s.nombre, 1)).join('')}</row>`)
  g.categorias.forEach((c, j) => {
    const r = j + 2
    filas.push(
      `<row r="${r}">${celdaTexto(`A${r}`, c)}${g.series
        .map((s, i) => {
          const v = s.valores[j]
          return v == null || !isFinite(v) ? '' : `<c r="${columna(i + 1)}${r}" s="2"><v>${v}</v></c>`
        })
        .join('')}</row>`,
    )
  })
  const ultima = columna(g.series.length)
  z.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
  )
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
  z.file(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Datos" sheetId="1" r:id="rId1"/></sheets></workbook>',
  )
  z.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  )
  z.file(
    'xl/styles.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF235B4E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  )
  z.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${ultima}${g.categorias.length + 1}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="22" customWidth="1"/><col min="2" max="${g.series.length + 1}" width="20" customWidth="1"/></cols><sheetData>${filas.join('')}</sheetData></worksheet>`,
  )
  return z.generateAsync({ type: 'uint8array' })
}

/** Marca que se pone en el Word en el lugar de cada gráfica nativa. */
export const marcaGrafica = (i: number) => `⟦GRAFICA:${i}⟧`

/**
 * Mete las gráficas nativas al .docx generado por la librería docx: reemplaza cada marca por la
 * gráfica y agrega chartN.xml, su Excel incrustado y las relaciones y tipos de contenido.
 */
export async function incrustarGraficas(docx: Blob, graficas: { g: GraficaNativa; anchoEmu: number; altoEmu: number }[]): Promise<Blob> {
  if (!graficas.length) return docx
  const JSZip = (await import('jszip')).default
  const z = await JSZip.loadAsync(docx)
  let documento = await z.file('word/document.xml')!.async('string')
  let rels = await z.file('word/_rels/document.xml.rels')!.async('string')
  let tipos = await z.file('[Content_Types].xml')!.async('string')
  if (!/Extension="xlsx"/.test(tipos)) tipos = tipos.replace('<Default ', '<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/><Default ')
  for (const [k, { g, anchoEmu, altoEmu }] of graficas.entries()) {
    const i = k + 1
    z.file(`word/charts/chart${i}.xml`, xmlGrafica(g))
    z.file(`word/embeddings/Microsoft_Excel_Worksheet${i}.xlsx`, await xlsxGrafica(g))
    z.file(
      `word/charts/_rels/chart${i}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../embeddings/Microsoft_Excel_Worksheet${i}.xlsx"/></Relationships>`,
    )
    tipos = tipos.replace('</Types>', `<Override PartName="/word/charts/chart${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`)
    rels = rels.replace('</Relationships>', `<Relationship Id="rIdGrafica${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart${i}.xml"/></Relationships>`)
    const dibujo = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${anchoEmu}" cy="${altoEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${5000 + i}" name="Gráfica ${i}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdGrafica${i}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
    const marca = marcaGrafica(k)
    const re = new RegExp(`<w:r>(?:(?!</w:r>).)*?${marca.replace(/[[\]]/g, '\\$&')}</w:t></w:r>`, 's')
    if (!re.test(documento)) throw new Error(`No se encontró el lugar de la gráfica ${i}`)
    documento = documento.replace(re, dibujo)
  }
  z.file('word/document.xml', documento)
  z.file('word/_rels/document.xml.rels', rels)
  z.file('[Content_Types].xml', tipos)
  return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}
