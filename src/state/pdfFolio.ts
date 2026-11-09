/**
 * Estampa folios en un PDF cargado. Cada copia del documento lleva un folio consecutivo
 * y el folio va SOLO en la primera página de cada copia (las demás hojas quedan igual).
 * pdf-lib se carga bajo demanda para no hacer más pesada la app al abrir.
 */
export type PosicionFolio = 'arriba-der' | 'arriba-izq' | 'abajo-der'

export interface OpcionesFolioPdf {
  prefijo: string
  inicio: number
  copias: number
  posicion: PosicionFolio
}

export const textoFolioPdf = (prefijo: string, n: number) => `No. ${prefijo}${String(n).padStart(3, '0')}`

const MARGEN = 22
const TAM = 11
const RELLENO = 4

export async function estamparFoliosPdf(original: ArrayBuffer | Uint8Array, o: OpcionesFolioPdf): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib')
  let fuente: Awaited<ReturnType<typeof PDFDocument.load>>
  try {
    fuente = await PDFDocument.load(original, { ignoreEncryption: true })
  } catch {
    throw new Error('No se pudo leer el PDF. Verifique que no esté dañado.')
  }
  if (fuente.isEncrypted) throw new Error('El PDF está protegido con contraseña; no se le pueden estampar folios.')
  const nPaginas = fuente.getPageCount()
  if (!nPaginas) throw new Error('El PDF no tiene páginas.')
  const copias = Math.max(1, Math.min(200, Math.floor(o.copias) || 1))
  const inicio = Math.max(1, Math.floor(o.inicio) || 1)

  const salida = await PDFDocument.create()
  const negrita = await salida.embedFont(StandardFonts.HelveticaBold)
  const indices = fuente.getPageIndices()

  for (let c = 0; c < copias; c++) {
    const paginas = await salida.copyPages(fuente, indices)
    paginas.forEach((p) => salida.addPage(p))
    const primera = paginas[0]
    const texto = textoFolioPdf(o.prefijo, inicio + c)
    let ancho: number
    try {
      ancho = negrita.widthOfTextAtSize(texto, TAM)
    } catch {
      throw new Error('El prefijo tiene caracteres que no se pueden imprimir en el PDF; use letras, números y guiones.')
    }
    const caja = primera.getCropBox()
    const giro = ((primera.getRotation().angle % 360) + 360) % 360
    // Medidas tal como se ve la hoja (si viene girada se intercambian)
    const vAncho = giro === 90 || giro === 270 ? caja.height : caja.width
    const bw = ancho + RELLENO * 2
    const bh = TAM + RELLENO * 2
    // Esquina inferior izquierda del recuadro, medida desde arriba a la izquierda de la hoja vista
    const vx = o.posicion === 'arriba-izq' ? MARGEN : vAncho - MARGEN - bw
    const vy = o.posicion === 'abajo-der' ? (giro === 90 || giro === 270 ? caja.width : caja.height) - MARGEN : MARGEN + bh
    const aHoja = (x: number, y: number) => {
      // Convierte un punto de la hoja vista (desde arriba a la izquierda) a coordenadas del PDF
      const { x: ox, y: oy, width: W, height: H } = caja
      if (giro === 90) return { x: ox + y, y: oy + x }
      if (giro === 180) return { x: ox + W - x, y: oy + y }
      if (giro === 270) return { x: ox + W - y, y: oy + H - x }
      return { x: ox + x, y: oy + H - y }
    }
    const rotate = degrees(giro)
    const esq = aHoja(vx, vy)
    primera.drawRectangle({ x: esq.x, y: esq.y, width: bw, height: bh, rotate, color: rgb(1, 1, 1), borderColor: rgb(0.07, 0.07, 0.07), borderWidth: 1 })
    const base = aHoja(vx + RELLENO, vy - RELLENO - 1.5)
    primera.drawText(texto, { x: base.x, y: base.y, size: TAM, font: negrita, color: rgb(0.07, 0.07, 0.07), rotate })
  }
  salida.setTitle(`Formato con folios ${textoFolioPdf(o.prefijo, inicio)}${copias > 1 ? ` a ${textoFolioPdf(o.prefijo, inicio + copias - 1)}` : ''}`)
  return salida.save()
}

/** Cuántas páginas tiene un PDF (para avisar en pantalla). */
export async function contarPaginasPdf(original: ArrayBuffer | Uint8Array): Promise<number> {
  const { PDFDocument } = await import('pdf-lib')
  const d = await PDFDocument.load(original, { ignoreEncryption: true })
  return d.getPageCount()
}
