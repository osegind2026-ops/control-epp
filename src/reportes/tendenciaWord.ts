// Documento de Tendencias en Word (.docx) editable: textos y tablas se pueden corregir en Word;
// las gráficas van como imagen de alta resolución (idénticas al PDF).
import type { Plantilla } from './plantilla'
import type { ConfigTendencia } from '../state/tendencias'
import type { Bloque, Item } from './tendenciaDoc'
import { paleta } from './graficasTendencia'

export interface DatosWord {
  plantilla: Plantilla
  config: ConfigTendencia
  titulo: string
  items: Item[]
}

function bytesDe(dataUrl: string): Uint8Array {
  const b = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const r = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) r[i] = b.charCodeAt(i)
  return r
}
const tipoDe = (dataUrl: string): 'png' | 'jpg' => (dataUrl.startsWith('data:image/jp') ? 'jpg' : 'png')

function medidasImagen(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((ok) => {
    const i = new Image()
    i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight })
    i.onerror = () => ok({ w: 1600, h: 800 })
    i.src = dataUrl
  })
}

/** Convierte una gráfica PNG a JPG (fondo blanco) al tamaño indicado. */
function aJpg(dataUrl: string, anchoMax: number): Promise<string> {
  return new Promise((ok) => {
    const i = new Image()
    i.onload = () => {
      const k = Math.min(1, anchoMax / i.naturalWidth)
      const c = document.createElement('canvas')
      c.width = Math.round(i.naturalWidth * k)
      c.height = Math.round(i.naturalHeight * k)
      const g = c.getContext('2d')!
      g.fillStyle = '#fff'
      g.fillRect(0, 0, c.width, c.height)
      g.drawImage(i, 0, 0, c.width, c.height)
      ok(c.toDataURL('image/jpeg', 0.9))
    }
    i.onerror = () => ok(dataUrl)
    i.src = dataUrl
  })
}

export async function generarWord(d: DatosWord): Promise<Blob> {
  const D = await import('docx')
  const { AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType } = D
  const pal = paleta(d.config.paleta)
  const VERDE = pal.principal.replace('#', '')
  const AMARILLO = 'FFF2A8'
  const FUENTE = 'Arial'
  const ANCHO_PX = 680 // ancho útil en píxeles (carta con márgenes de 1.8 cm)

  const imagen = async (png: string, anchoPx: number, alineacion = AlignmentType.CENTER) => {
    // Las gráficas van en JPG de alta calidad: se ven igual y el archivo pesa mucho menos
    const dataUrl = await aJpg(png, anchoPx * 2)
    const m = await medidasImagen(dataUrl)
    return new Paragraph({
      alignment: alineacion,
      spacing: { before: 80, after: 80 },
      children: [new ImageRun({ type: tipoDe(dataUrl), data: bytesDe(dataUrl), transformation: { width: anchoPx, height: Math.round((anchoPx * m.h) / m.w) } })],
    })
  }
  const texto = (t: string, o: { negrita?: boolean; tam?: number; color?: string; italica?: boolean } = {}) =>
    new TextRun({ text: t, bold: o.negrita, italics: o.italica, size: o.tam ?? 21, color: o.color, font: FUENTE })
  const parrafo = (t: string, o: { negrita?: boolean; tam?: number; alin?: (typeof AlignmentType)[keyof typeof AlignmentType]; antes?: number; despues?: number; italica?: boolean; color?: string; saltoAntes?: boolean } = {}) =>
    new Paragraph({
      alignment: o.alin ?? AlignmentType.JUSTIFIED,
      spacing: { before: o.antes ?? 60, after: o.despues ?? 100 },
      pageBreakBefore: o.saltoAntes,
      children: [texto(t, o)],
    })

  const borde = { style: BorderStyle.SINGLE, size: 4, color: '8C9196' }
  const bordes = { top: borde, bottom: borde, left: borde, right: borde }
  const sinBorde = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const sinBordes = { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde, insideHorizontal: sinBorde, insideVertical: sinBorde }
  const celda = (t: string, o: { enc?: boolean; destacado?: boolean; izq?: boolean; rojo?: boolean; ancho?: number; tam?: number } = {}) =>
    new TableCell({
      borders: bordes,
      verticalAlign: VerticalAlign.CENTER,
      width: o.ancho ? { size: o.ancho, type: WidthType.PERCENTAGE } : undefined,
      shading: o.enc ? { type: ShadingType.CLEAR, color: 'auto', fill: VERDE } : o.destacado ? { type: ShadingType.CLEAR, color: 'auto', fill: AMARILLO } : undefined,
      margins: { top: 30, bottom: 30, left: 60, right: 60 },
      children: [
        new Paragraph({
          alignment: o.izq ? AlignmentType.LEFT : AlignmentType.CENTER,
          children: [texto(t, { negrita: o.enc || o.destacado, tam: o.tam ?? 17, color: o.enc ? 'FFFFFF' : o.rojo ? 'C0392B' : '222222' })],
        }),
      ],
    })
  const tabla = (filas: InstanceType<typeof TableRow>[]) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: filas })
  const tablaBloques = (bloques: Bloque[]) =>
    bloques.flatMap((b: Bloque) => [
      tabla([
        new TableRow({ tableHeader: true, children: [celda('', { enc: true, ancho: 22 }), ...b.etiquetas.map((e) => celda(e, { enc: true, tam: 15 }))] }),
        ...b.filas.map((f) => new TableRow({ children: [celda(f.nombre, { izq: true, ancho: 22, tam: 15 }), ...f.valores.map((v, j) => celda(v, { rojo: f.rojo?.[j], tam: 15 }))] })),
      ]),
      new Paragraph({ spacing: { after: 60 }, children: [] }),
    ])
  const tablaPares = (filas: [string, string][], destacar?: number) =>
    tabla(filas.map(([a, b], i) => new TableRow({ children: [celda(a, { izq: true, ancho: 62, destacado: i === destacar }), celda(b, { destacado: i === destacar })] })))
  const tablaSimple = (t: { encabezado: string[]; filas: string[][] }, destacar: number[] = []) =>
    tabla([
      new TableRow({ tableHeader: true, children: t.encabezado.map((e) => celda(e, { enc: true })) }),
      ...t.filas.map((f, i) => new TableRow({ children: f.map((v, j) => celda(v, { izq: j === 0, destacado: destacar.includes(i) })) })),
    ])
  // Tres tablas de datos lado a lado (como las cajas del reporte)
  const cajas = (grupos: { filas: [string, string][]; destacar?: number }[]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: sinBordes,
      rows: [
        new TableRow({
          children: grupos.map(
            (g) =>
              new TableCell({
                borders: { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde },
                width: { size: Math.floor(100 / grupos.length), type: WidthType.PERCENTAGE },
                margins: { left: 50, right: 50 },
                children: [tablaPares(g.filas, g.destacar)],
              }),
          ),
        }),
      ],
    })

  // Encabezado y pie como en el formato institucional
  const p = d.plantilla
  const logo = p.imagenes.logoEncabezado
  const anio = p.imagenes.logoAnio
  const encabezado = new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: sinBordes,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde },
                width: { size: 45, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ children: [new ImageRun({ type: tipoDe(logo.dataUrl), data: bytesDe(logo.dataUrl), transformation: { width: 250, height: Math.round((250 * logo.alto) / logo.ancho) } })] })],
              }),
              new TableCell({
                borders: { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde },
                verticalAlign: VerticalAlign.CENTER,
                children: d.config.encabezado.filter(Boolean).map((l, i) => new Paragraph({ alignment: AlignmentType.RIGHT, children: [texto(l, { negrita: i === 0, tam: 18 })] })),
              }),
            ],
          }),
        ],
      }),
    ],
  })
  const pie = new Footer({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: sinBordes,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde },
                width: { size: 22, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ children: [new ImageRun({ type: tipoDe(anio.dataUrl), data: bytesDe(anio.dataUrl), transformation: { width: 130, height: Math.round((130 * anio.alto) / anio.ancho) } })] })],
              }),
              new TableCell({
                borders: { top: sinBorde, bottom: { style: BorderStyle.SINGLE, size: 18, color: '9D2449' }, left: sinBorde, right: sinBorde },
                verticalAlign: VerticalAlign.BOTTOM,
                children: [new Paragraph({ children: [texto(d.config.pie, { tam: 13, color: '9D2449' })] })],
              }),
            ],
          }),
        ],
      }),
    ],
  })

  // Cada bloque del documento, en orden; cada título empieza página nueva
  const cuerpo: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = []
  let primero = true
  for (const it of d.items) {
    switch (it.t) {
      case 'titulo':
        cuerpo.push(parrafo(it.titulo, { negrita: true, tam: 28, alin: AlignmentType.CENTER, antes: 0, despues: 20, saltoAntes: !primero }))
        cuerpo.push(parrafo(it.subtitulo, { tam: 20, alin: AlignmentType.CENTER, antes: 0, despues: 60 }))
        cuerpo.push(parrafo(it.fecha, { tam: 20, alin: AlignmentType.RIGHT, antes: 0, despues: 140 }))
        primero = false
        break
      case 'parrafo': {
        const e = it.estilo ?? 'normal'
        if (e === 'conclusion') cuerpo.push(parrafo(it.texto, { negrita: true, antes: 140 }))
        else if (e === 'chico') cuerpo.push(parrafo(it.texto, { tam: 18 }))
        else if (e === 'nota') cuerpo.push(parrafo(it.texto, { tam: 16, italica: true }))
        else if (e === 'fuente') cuerpo.push(parrafo(it.texto, { tam: 15, color: '6F7271' }))
        else cuerpo.push(parrafo(it.texto))
        break
      }
      case 'bloque':
        cuerpo.push(...tablaBloques([it.bloque]))
        break
      case 'cajas':
        cuerpo.push(cajas(it.grupos))
        cuerpo.push(new Paragraph({ spacing: { after: 80 }, children: [] }))
        break
      case 'tabla':
        cuerpo.push(tablaSimple(it, it.destacar))
        cuerpo.push(new Paragraph({ spacing: { after: 60 }, children: [] }))
        break
      case 'imagen':
        cuerpo.push(await imagen(it.img.src, Math.round(ANCHO_PX * (it.ancho ?? 1))))
        break
    }
  }

  const doc = new Document({
    creator: 'Control EPP',
    title: d.titulo,
    styles: { default: { document: { run: { font: FUENTE } } } },
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1850, bottom: 1500, left: 1000, right: 1000, header: 420, footer: 360 } } },
        headers: { default: encabezado },
        footers: { default: pie },
        children: cuerpo,
      },
    ],
  })
  return Packer.toBlob(doc)
}
