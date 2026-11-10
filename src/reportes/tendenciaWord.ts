// Documento de Tendencias en Word (.docx) editable: textos y tablas se pueden corregir en Word;
// las gráficas van como imagen de alta resolución (idénticas al PDF).
import type { Plantilla } from './plantilla'
import type { ConfigTendencia } from '../state/tendencias'
import type { Bloque, ContenidoMaterial, ContenidoPlan } from './tendenciaDoc'
import type { ImagenesMaterial, ImagenesPlan } from './imagenesTendencia'
import { paleta } from './graficasTendencia'

export interface DatosWord {
  plantilla: Plantilla
  config: ConfigTendencia
  fecha: string
  comparativa?: { titulo: string; intro: string; imagen: string; tabla: { encabezado: string[]; filas: string[][] } }
  materiales: { t: ContenidoMaterial; img: ImagenesMaterial; plan?: { t: ContenidoPlan; img: ImagenesPlan } }[]
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

export async function generarWord(d: DatosWord): Promise<Blob> {
  const D = await import('docx')
  const { AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType } = D
  const pal = paleta(d.config.paleta)
  const VERDE = pal.principal.replace('#', '')
  const AMARILLO = 'FFF2A8'
  const FUENTE = 'Arial'
  const ANCHO_PX = 680 // ancho útil en píxeles (carta con márgenes de 1.8 cm)

  const imagen = async (dataUrl: string, anchoPx: number, alineacion = AlignmentType.CENTER) => {
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
    bloques.flatMap((b) => [
      tabla([
        new TableRow({ tableHeader: true, children: [celda('', { enc: true, ancho: 22 }), ...b.etiquetas.map((e) => celda(e, { enc: true, tam: 15 }))] }),
        ...b.filas.map((f) => new TableRow({ children: [celda(f.nombre, { izq: true, ancho: 22, tam: 15 }), ...f.valores.map((v, j) => celda(v, { rojo: f.rojo?.[j], tam: 15 }))] })),
      ]),
      new Paragraph({ spacing: { after: 60 }, children: [] }),
    ])
  const tablaPares = (filas: [string, string][], destacar?: number) =>
    tabla(filas.map(([a, b], i) => new TableRow({ children: [celda(a, { izq: true, ancho: 62, destacado: i === destacar }), celda(b, { destacado: i === destacar })] })))
  const tablaSimple = (t: { encabezado: string[]; filas: string[][] }, destacar?: number) =>
    tabla([
      new TableRow({ tableHeader: true, children: t.encabezado.map((e) => celda(e, { enc: true })) }),
      ...t.filas.map((f, i) => new TableRow({ children: f.map((v, j) => celda(v, { izq: j === 0, destacado: i === destacar })) })),
    ])
  // Tres tablas de datos lado a lado (como las cajas del reporte)
  const cajas = (grupos: { filas: [string, string][]; destacar: number }[]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: sinBordes,
      rows: [
        new TableRow({
          children: grupos.map(
            (g) =>
              new TableCell({
                borders: { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde },
                width: { size: 33, type: WidthType.PERCENTAGE },
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

  const titulo = (t: string, sub: string, salto: boolean) => [
    parrafo(t, { negrita: true, tam: 28, alin: AlignmentType.CENTER, antes: 0, despues: 20, saltoAntes: salto }),
    parrafo(sub, { tam: 20, alin: AlignmentType.CENTER, antes: 0, despues: 60 }),
    parrafo(d.fecha, { tam: 20, alin: AlignmentType.RIGHT, antes: 0, despues: 140 }),
  ]

  const cuerpo: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = []
  if (d.comparativa) {
    cuerpo.push(...titulo(d.comparativa.titulo, 'Cálculo de tendencia conservadora de consumo de equipo de protección personal – comparativa', false))
    cuerpo.push(parrafo(d.comparativa.intro))
    cuerpo.push(await imagen(d.comparativa.imagen, ANCHO_PX))
    cuerpo.push(tablaSimple(d.comparativa.tabla))
    cuerpo.push(parrafo(d.config.nota, { tam: 16, italica: true, antes: 120 }))
  }
  for (const [i, { t, img, plan }] of d.materiales.entries()) {
    cuerpo.push(...titulo(t.titulo, t.subtitulo, !!d.comparativa || i > 0))
    cuerpo.push(parrafo(t.intro))
    cuerpo.push(...tablaBloques(t.historico))
    cuerpo.push(
      cajas([
        { filas: t.resumen, destacar: 0 },
        { filas: t.existencias, destacar: 2 },
        { filas: t.indicadores, destacar: 0 },
      ]),
    )
    cuerpo.push(new Paragraph({ spacing: { after: 80 }, children: [] }))
    cuerpo.push(tablaSimple(t.escenarios, 1))
    cuerpo.push(parrafo(t.conclusion, { negrita: true, antes: 140 }))
    cuerpo.push(parrafo(t.tendencia, { tam: 18 }))
    cuerpo.push(await imagen(img.historico, ANCHO_PX))
    cuerpo.push(await imagen(img.proyeccion, ANCHO_PX))
    cuerpo.push(...tablaBloques(t.proyeccion))
    if (t.proyeccionRecortada) cuerpo.push(parrafo('La tabla muestra el primer año; la gráfica y el cálculo consideran todo el periodo.', { tam: 16 }))
    cuerpo.push(parrafo(d.config.nota, { tam: 16, italica: true }))
    if (t.tallas.length) {
      cuerpo.push(tablaSimple({ encabezado: ['Talla', 'Entregados', '%'], filas: t.tallas }))
      if (img.tallas) cuerpo.push(await imagen(img.tallas, 420))
    }
    cuerpo.push(parrafo(t.fuente, { tam: 15, color: '6F7271' }))
    if (plan) {
      cuerpo.push(...titulo(plan.t.titulo, 'Comparación de la tendencia planeada contra el consumo real registrado', true))
      cuerpo.push(parrafo(plan.t.intro))
      cuerpo.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: sinBordes,
          rows: [
            new TableRow({
              children: [plan.t.resumen, plan.t.fechas].map(
                (f, j) =>
                  new TableCell({
                    borders: { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde },
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    margins: { left: 50, right: 50 },
                    children: [tablaPares(f, j === 0 ? 2 : 1)],
                  }),
              ),
            }),
          ],
        }),
      )
      cuerpo.push(parrafo(plan.t.conclusion, { negrita: true, antes: 140 }))
      cuerpo.push(await imagen(plan.img.consumo, ANCHO_PX))
      cuerpo.push(await imagen(plan.img.existencia, ANCHO_PX))
      cuerpo.push(...tablaBloques(plan.t.bloques))
      cuerpo.push(parrafo(plan.t.nota, { tam: 16, italica: true }))
    }
  }

  const doc = new Document({
    creator: 'Control EPP',
    title: d.comparativa?.titulo ?? d.materiales[0]?.t.titulo ?? 'Tendencia de consumo',
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
