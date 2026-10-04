import qrcode from 'qrcode-generator'
import { textoQr } from '../domain/equipoQr'
import type { Equipo } from '../domain/types'

// Etiqueta con código QR para pegar en cada equipo a resguardo. Se dibuja en un lienzo
// (sin internet) para descargarla como imagen o mandarla a imprimir.

/** Medida de la etiqueta impresa, en milímetros. */
export const ETIQUETA_MM = { ancho: 70, alto: 35 }
const PX_POR_MM = 12 // ≈ 300 puntos por pulgada

function dibujarQr(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, lado: number) {
  const qr = qrcode(0, 'M')
  qr.addData(texto)
  qr.make()
  const n = qr.getModuleCount()
  const margen = 2 // zona de silencio, en módulos
  const modulo = Math.floor(lado / (n + margen * 2))
  const real = modulo * (n + margen * 2)
  const ox = x + Math.floor((lado - real) / 2)
  const oy = y + Math.floor((lado - real) / 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(ox, oy, real, real)
  ctx.fillStyle = '#000000'
  for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) if (qr.isDark(f, c)) ctx.fillRect(ox + (c + margen) * modulo, oy + (f + margen) * modulo, modulo, modulo)
}

function ajustarTexto(ctx: CanvasRenderingContext2D, texto: string, ancho: number, maxLineas: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean)
  const lineas: string[] = []
  let actual = ''
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p
    if (ctx.measureText(prueba).width <= ancho || !actual) actual = prueba
    else {
      lineas.push(actual)
      actual = p
    }
  }
  if (actual) lineas.push(actual)
  if (lineas.length > maxLineas) {
    lineas.length = maxLineas
    lineas[maxLineas - 1] = lineas[maxLineas - 1].replace(/.{0,2}$/, '…')
  }
  return lineas
}

/** Dibuja la etiqueta del equipo: QR a la izquierda; código, nombre, marca/modelo y serie a la derecha. */
export function dibujarEtiqueta(e: Equipo): HTMLCanvasElement {
  const W = ETIQUETA_MM.ancho * PX_POR_MM
  const H = ETIQUETA_MM.alto * PX_POR_MM
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 3
  ctx.strokeRect(4, 4, W - 8, H - 8)

  const m = 18
  const ladoQr = H - m * 2
  dibujarQr(ctx, textoQr(e), m, m, ladoQr)

  const x = m + ladoQr + 14
  const ancho = W - x - m
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'
  let y = m + 6
  // Código, lo más grande posible
  let tam = 96
  do {
    ctx.font = `700 ${tam}px Arial, Helvetica, sans-serif`
    tam -= 4
  } while (ctx.measureText(e.codigo).width > ancho && tam > 40)
  ctx.fillText(e.codigo, x, y)
  y += tam + 22
  ctx.font = '700 40px Arial, Helvetica, sans-serif'
  for (const l of ajustarTexto(ctx, e.nombre, ancho, 2)) {
    ctx.fillText(l, x, y)
    y += 46
  }
  ctx.font = '400 30px Arial, Helvetica, sans-serif'
  const detalle = [[e.marca, e.modelo].filter(Boolean).join(' '), e.serie ? `Serie ${e.serie}` : ''].filter(Boolean)
  for (const d of detalle) {
    for (const l of ajustarTexto(ctx, d, ancho, 1)) {
      ctx.fillText(l, x, y)
      y += 36
    }
  }
  const pie = 'SEGURIDAD INDUSTRIAL · CFE LAGUNA VERDE'
  let tamPie = 24
  do {
    ctx.font = `700 ${tamPie}px Arial, Helvetica, sans-serif`
    tamPie -= 1
  } while (ctx.measureText(pie).width > ancho && tamPie > 12)
  ctx.textBaseline = 'bottom'
  ctx.fillText(pie, x, H - m)
  return c
}

export function etiquetaPng(e: Equipo): Promise<Blob> {
  return new Promise((ok, falla) => dibujarEtiqueta(e).toBlob((b) => (b ? ok(b) : falla(new Error('No se pudo generar la imagen.'))), 'image/png'))
}

/** Manda a imprimir una o varias etiquetas a su tamaño real (varias por hoja carta). */
export function imprimirEtiquetas(equipos: Equipo[]): void {
  const imagenes = equipos.map((e) => dibujarEtiqueta(e).toDataURL('image/png'))
  const marco = document.createElement('iframe')
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(marco)
  const doc = marco.contentDocument!
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas de equipos</title><style>
    @page { size: letter; margin: 10mm; }
    body { margin: 0; display: flex; flex-wrap: wrap; gap: 4mm; align-content: flex-start; }
    img { width: ${ETIQUETA_MM.ancho}mm; height: ${ETIQUETA_MM.alto}mm; break-inside: avoid; }
  </style></head><body>${imagenes.map((src) => `<img src="${src}">`).join('')}</body></html>`)
  doc.close()
  const imprimir = () => {
    marco.contentWindow!.focus()
    marco.contentWindow!.print()
    setTimeout(() => marco.remove(), 60_000)
  }
  // Esperar a que las imágenes estén listas antes de abrir el diálogo de impresión
  const pendientes = [...doc.images].filter((i) => !i.complete)
  if (!pendientes.length) setTimeout(imprimir, 100)
  else {
    let faltan = pendientes.length
    pendientes.forEach((i) => (i.onload = i.onerror = () => --faltan === 0 && imprimir()))
  }
}
