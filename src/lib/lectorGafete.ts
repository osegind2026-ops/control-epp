import type { Worker } from 'tesseract.js'

// Lectura de gafetes con la cámara: primero intenta el código de barras de la
// foto y, en paralelo, reconoce el texto impreso (OCR con Tesseract, sin
// internet: los archivos se sirven desde /ocr y quedan guardados en el equipo).

export type Progreso = (texto: string, avance?: number) => void

let trabajador: Promise<Worker> | null = null

async function obtenerLector(progreso: Progreso): Promise<Worker> {
  if (!trabajador) {
    trabajador = (async () => {
      progreso('Preparando el lector (solo la primera vez)…', 0)
      const { createWorker } = await import('tesseract.js')
      const base = new URL('./ocr/', document.baseURI).href
      return createWorker('spa', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base,
        langPath: base.replace(/\/$/, ''),
        gzip: true,
        workerBlobURL: false,
        logger: (m) => {
          if (m.status === 'recognizing text') progreso('Leyendo el gafete…', m.progress)
          else if (m.status.includes('loading')) progreso('Preparando el lector (solo la primera vez)…', m.progress)
        },
      })
    })().catch((e) => {
      trabajador = null
      throw e
    })
  }
  return trabajador
}

/** Ajusta la foto: tamaño manejable y, en una copia, escala de grises con más contraste. */
async function prepararImagen(archivo: Blob): Promise<{ original: HTMLCanvasElement; procesada: HTMLCanvasElement }> {
  const url = URL.createObjectURL(archivo)
  try {
    const img = await new Promise<HTMLImageElement>((ok, falla) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => falla(new Error('No se pudo abrir la foto.'))
      i.src = url
    })
    const escala = Math.min(1, 1800 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * escala)
    c.height = Math.round(img.height * escala)
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0, c.width, c.height)
    const original = document.createElement('canvas')
    original.width = c.width
    original.height = c.height
    original.getContext('2d')!.drawImage(c, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height)
    for (let i = 0; i < d.data.length; i += 4) {
      const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]
      const v = Math.max(0, Math.min(255, (g - 128) * 1.35 + 128))
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v
    }
    ctx.putImageData(d, 0, 0)
    return { original, procesada: c }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function rotar(c: HTMLCanvasElement): HTMLCanvasElement {
  const r = document.createElement('canvas')
  r.width = c.height
  r.height = c.width
  const ctx = r.getContext('2d')!
  ctx.translate(r.width, 0)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(c, 0, 0)
  return r
}

/** Busca un código de barras en la foto, derecho y girado 90° (el del gafete va vertical). */
export async function codigoEnFoto(c: HTMLCanvasElement): Promise<string> {
  const Nativo = (window as unknown as { BarcodeDetector?: new (o: object) => { detect: (x: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector
  if (Nativo) {
    try {
      const r = await new Nativo({ formats: ['code_39', 'code_128', 'code_93', 'codabar', 'itf', 'ean_13', 'qr_code', 'pdf417'] }).detect(c)
      if (r.length) return r[0].rawValue
    } catch {
      /* se intenta con ZXing */
    }
  }
  const zx = await import('@zxing/library')
  const pistas = new Map<number, unknown>([
    [zx.DecodeHintType.TRY_HARDER, true],
    [zx.DecodeHintType.POSSIBLE_FORMATS, [zx.BarcodeFormat.CODE_39, zx.BarcodeFormat.CODE_128, zx.BarcodeFormat.CODE_93, zx.BarcodeFormat.CODABAR, zx.BarcodeFormat.ITF, zx.BarcodeFormat.QR_CODE]],
  ])
  const lector = new zx.MultiFormatReader()
  lector.setHints(pistas as Map<never, unknown>)
  for (const lienzo of [c, rotar(c)]) {
    try {
      const fuente = new zx.HTMLCanvasElementLuminanceSource(lienzo)
      return lector.decode(new zx.BinaryBitmap(new zx.HybridBinarizer(fuente))).getText()
    } catch {
      /* sin código en esta orientación */
    }
  }
  return ''
}

export interface LecturaGafete {
  texto: string
  /** Texto de la zona del número y el RPE (se lee aparte, con más precisión). */
  zona: string
  codigo: string
  vistaPrevia: string
}

export async function leerGafete(archivo: Blob, progreso: Progreso): Promise<LecturaGafete> {
  const { original, procesada: lienzo } = await prepararImagen(archivo)
  const vistaPrevia = original.toDataURL('image/jpeg', 0.6)
  const codigo = (await codigoEnFoto(original).catch(() => '')) || (await codigoEnFoto(lienzo).catch(() => ''))

  const lector = await obtenerLector(progreso)
  const { PSM } = await import('tesseract.js')
  await lector.setParameters({ tessedit_pageseg_mode: PSM.AUTO, tessedit_char_whitelist: '' })
  const { data } = await lector.recognize(lienzo, {}, { blocks: true })

  // Segunda lectura enfocada en la zona bajo la foto (número y RPE), a la izquierda del texto
  const lineas = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
  const columna = lineas.find((l) => /^\s*[ÁA]REA/i.test(l.text)) ?? lineas.find((l) => /[A-Z]{3,}/.test(l.text))
  const fecha = lineas.find((l) => /\d{1,2}\/\d{1,2}\/\d{4}/.test(l.text))
  const derecha = columna ? columna.bbox.x0 : Math.round(lienzo.width * 0.4)
  // La zona empieza en la última línea de texto antes de la fecha (el puesto), que coincide con
  // el borde inferior de la foto: incluir parte de la foto empeora la lectura del RPE.
  const alto = fecha ? fecha.bbox.y1 - fecha.bbox.y0 : 40
  const ultima = fecha && columna ? lineas.filter((l) => l.bbox.y1 <= fecha.bbox.y0 && Math.abs(l.bbox.x0 - columna.bbox.x0) < alto * 2).pop() : undefined
  const arriba = ultima ? ultima.bbox.y0 : fecha ? Math.max(0, fecha.bbox.y0 - alto * 4) : Math.round(lienzo.height * 0.5)
  const abajo = fecha ? Math.min(lienzo.height, fecha.bbox.y1 + alto * 2) : lienzo.height
  const zonas: string[] = []
  if (derecha > 40 && abajo - arriba > 40) {
    await lector.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' })
    // Dos lecturas (desde el puesto y desde debajo de él) que luego «votan» por el RPE
    for (const top of [arriba, ultima ? ultima.bbox.y1 : arriba + alto]) {
      if (abajo - top < 30) continue
      zonas.push((await lector.recognize(original, { rectangle: { left: 0, top, width: derecha, height: abajo - top } })).data.text)
    }
    await lector.setParameters({ tessedit_char_whitelist: '' })
  }
  const zona = zonas.join('\n')
  progreso('Listo', 1)
  return { texto: data.text, zona, codigo, vistaPrevia }
}
