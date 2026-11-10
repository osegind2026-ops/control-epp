// Gráficas de Tendencias dibujadas en canvas: se ven en pantalla y la misma imagen (PNG de
// alta resolución) va al PDF y al Word, así los tres coinciden.
import { miles } from '../domain/tendencias'

export type EstiloGrafica = 'sombra' | '3d' | 'area' | 'lineas'
export type PaletaGrafica = 'verde' | 'azul' | 'guinda'

export const ESTILOS: { id: EstiloGrafica; nombre: string }[] = [
  { id: 'sombra', nombre: 'Columnas con sombra' },
  { id: '3d', nombre: 'Columnas 3D' },
  { id: 'area', nombre: 'Área con degradado' },
  { id: 'lineas', nombre: 'Líneas con puntos' },
]
export const PALETAS: { id: PaletaGrafica; nombre: string; principal: string; acento: string; serie: string[] }[] = [
  { id: 'verde', nombre: 'Institucional verde', principal: '#235B4E', acento: '#BC955C', serie: ['#235B4E', '#BC955C', '#691C32', '#3F8B78', '#6F7271', '#9D7B45'] },
  { id: 'azul', nombre: 'Azul (como el ejemplo)', principal: '#2F6F8F', acento: '#ED7D31', serie: ['#2F6F8F', '#ED7D31', '#5B9B4A', '#8E5BA8', '#C0504D', '#4BACC6'] },
  { id: 'guinda', nombre: 'Guinda y oro', principal: '#691C32', acento: '#BC955C', serie: ['#691C32', '#BC955C', '#235B4E', '#A34A62', '#6F7271', '#9D7B45'] },
]
export const paleta = (id: PaletaGrafica) => PALETAS.find((p) => p.id === id) ?? PALETAS[0]

export interface OpcionesGrafica {
  estilo: EstiloGrafica
  paleta: PaletaGrafica
  ancho?: number
  alto?: number
}

const FUENTE = '"Barlow", "Segoe UI", Arial, sans-serif'

// ---------------- utilidades de color ----------------
function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
/** Aclara (t > 0) u oscurece (t < 0) un color. */
export function tono(hex: string, t: number): string {
  const [r, g, b] = rgb(hex)
  const f = (c: number) => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t))
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`
}
const alfa = (hex: string, a: number) => {
  const [r, g, b] = rgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function lienzo(ancho: number, alto: number) {
  const c = document.createElement('canvas')
  c.width = ancho
  c.height = alto
  const g = c.getContext('2d')!
  // Fondo con un degradado muy suave (como las gráficas de Office con efecto)
  const fondo = g.createLinearGradient(0, 0, 0, alto)
  fondo.addColorStop(0, '#FFFFFF')
  fondo.addColorStop(1, '#EEF0F2')
  g.fillStyle = fondo
  g.fillRect(0, 0, ancho, alto)
  g.strokeStyle = '#D5D9DD'
  g.lineWidth = 2
  g.strokeRect(1, 1, ancho - 2, alto - 2)
  return { c, g }
}

function titulo(g: CanvasRenderingContext2D, texto: string, ancho: number, k: number, sub?: string) {
  g.fillStyle = '#3A3F44'
  g.textAlign = 'center'
  g.textBaseline = 'top'
  g.font = `700 ${38 * k}px ${FUENTE}`
  g.fillText(texto, ancho / 2, 20 * k, ancho - 40 * k)
  if (sub) {
    g.font = `500 ${24 * k}px ${FUENTE}`
    g.fillStyle = '#6F7271'
    g.fillText(sub, ancho / 2, 66 * k, ancho - 40 * k)
  }
}

function escalaBonita(max: number): { tope: number; paso: number } {
  if (max <= 0) return { tope: 10, paso: 2 }
  const crudo = max / 5
  const mag = 10 ** Math.floor(Math.log10(crudo))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= crudo) ?? 10 * mag
  return { tope: Math.ceil(max / paso) * paso, paso }
}

function rectRedondo(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h))
  g.beginPath()
  g.moveTo(x, y + h)
  g.lineTo(x, y + rr)
  g.quadraticCurveTo(x, y, x + rr, y)
  g.lineTo(x + w - rr, y)
  g.quadraticCurveTo(x + w, y, x + w, y + rr)
  g.lineTo(x + w, y + h)
  g.closePath()
}

function etiquetaValor(g: CanvasRenderingContext2D, texto: string, x: number, y: number, k: number, color = '#2B2F33', dentro = false) {
  g.font = `700 ${23 * k}px ${FUENTE}`
  g.textAlign = 'center'
  g.textBaseline = 'bottom'
  if (dentro) {
    g.fillStyle = '#FFFFFF'
    g.shadowColor = 'rgba(0,0,0,0.45)'
    g.shadowBlur = 3 * k
  } else {
    g.fillStyle = color
    g.shadowColor = 'rgba(255,255,255,0.9)'
    g.shadowBlur = 4 * k
  }
  g.fillText(texto, x, y)
  g.shadowColor = 'transparent'
  g.shadowBlur = 0
}

// ---------------- gráfica de columnas genérica ----------------
export interface DatosColumnas {
  titulo: string
  subtitulo?: string
  etiquetas: string[]
  valores: number[]
  /** Línea en eje secundario (0 a 100 %), p. ej. porcentaje consumido acumulado. */
  porcentaje?: { nombre: string; valores: number[] }
  /** Línea horizontal de referencia (p. ej. el promedio). */
  referencia?: { nombre: string; valor: number }
  /** Índices a resaltar con el color de acento (p. ej. la semana objetivo). */
  resaltar?: Map<number, string>
  nombreSerie: string
}

export function graficaColumnas(d: DatosColumnas, o: OpcionesGrafica): HTMLCanvasElement {
  const ancho = o.ancho ?? 1600
  const alto = o.alto ?? 820
  const k = ancho / 1600
  const pal = paleta(o.paleta)
  const { c, g } = lienzo(ancho, alto)
  titulo(g, d.titulo, ancho, k, d.subtitulo)

  const n = Math.max(1, d.valores.length)
  const izq = 120 * k
  const der = d.porcentaje ? 115 * k : 40 * k
  const arriba = (d.subtitulo ? 128 : 96) * k
  const abajo = (n > 8 ? 150 : 100) * k + 44 * k // espacio para etiquetas y leyenda
  const x0 = izq
  const x1 = ancho - der
  const y0 = alto - abajo
  const y1 = arriba
  const maxV = Math.max(1, ...d.valores, d.referencia?.valor ?? 0)
  const { tope, paso } = escalaBonita(maxV * 1.08)
  const Y = (v: number) => y0 - (Math.max(0, v) / tope) * (y0 - y1)
  const banda = (x1 - x0) / n
  const X = (i: number) => x0 + banda * (i + 0.5)

  // Cuadrícula y ejes
  g.font = `500 ${23 * k}px ${FUENTE}`
  g.textBaseline = 'middle'
  for (let v = 0; v <= tope + 1e-9; v += paso) {
    const y = Y(v)
    g.strokeStyle = v === 0 ? '#9AA1A8' : '#DDE1E5'
    g.lineWidth = v === 0 ? 2 * k : 1.2 * k
    g.setLineDash(v === 0 ? [] : [6 * k, 6 * k])
    g.beginPath()
    g.moveTo(x0, y)
    g.lineTo(x1, y)
    g.stroke()
    g.setLineDash([])
    g.fillStyle = '#5B6168'
    g.textAlign = 'right'
    g.fillText(miles(v), x0 - 12 * k, y)
  }
  if (d.porcentaje) {
    g.textAlign = 'left'
    for (let p = 0; p <= 100; p += 20) g.fillText(`${p}%`, x1 + 12 * k, y0 - (p / 100) * (y0 - y1))
  }

  // Serie principal
  const ancho3d = 16 * k
  const w = Math.min(banda * (o.estilo === '3d' ? 0.62 : 0.7), 120 * k)
  const colorDe = (i: number) => d.resaltar?.get(i) ?? pal.principal
  if (o.estilo === 'sombra' || o.estilo === '3d') {
    d.valores.forEach((v, i) => {
      const color = v < 0 ? '#C0392B' : colorDe(i)
      const h = Math.abs(Y(v) - y0) || (v === 0 ? 0 : 2 * k)
      const x = X(i) - w / 2 - (o.estilo === '3d' ? ancho3d / 2 : 0)
      const y = y0 - h
      if (o.estilo === 'sombra') {
        g.save()
        g.shadowColor = 'rgba(0, 0, 0, 0.35)'
        g.shadowBlur = 14 * k
        g.shadowOffsetX = 6 * k
        g.shadowOffsetY = 6 * k
        const gr = g.createLinearGradient(x, 0, x + w, 0)
        gr.addColorStop(0, tono(color, 0.18))
        gr.addColorStop(0.45, color)
        gr.addColorStop(1, tono(color, -0.3))
        g.fillStyle = gr
        rectRedondo(g, x, y, w, h, 7 * k)
        g.fill()
        g.restore()
        // brillo superior
        const brillo = g.createLinearGradient(0, y, 0, y + Math.min(h, 60 * k))
        brillo.addColorStop(0, 'rgba(255,255,255,0.35)')
        brillo.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = brillo
        rectRedondo(g, x + 3 * k, y + 2 * k, w - 6 * k, Math.min(h, 60 * k), 6 * k)
        g.fill()
      } else {
        // Columna 3D: frente, costado y tapa
        const dx = ancho3d
        const dy = ancho3d * 0.7
        g.save()
        g.shadowColor = 'rgba(0,0,0,0.25)'
        g.shadowBlur = 10 * k
        g.shadowOffsetX = 8 * k
        g.shadowOffsetY = 4 * k
        const fr = g.createLinearGradient(x, 0, x + w, 0)
        fr.addColorStop(0, tono(color, 0.12))
        fr.addColorStop(1, tono(color, -0.12))
        g.fillStyle = fr
        g.fillRect(x, y, w, h)
        g.restore()
        g.fillStyle = tono(color, -0.38)
        g.beginPath()
        g.moveTo(x + w, y)
        g.lineTo(x + w + dx, y - dy)
        g.lineTo(x + w + dx, y0 - dy)
        g.lineTo(x + w, y0)
        g.closePath()
        g.fill()
        g.fillStyle = tono(color, 0.32)
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(x + dx, y - dy)
        g.lineTo(x + w + dx, y - dy)
        g.lineTo(x + w, y)
        g.closePath()
        g.fill()
      }
      const ex = o.estilo === '3d' ? ancho3d * 0.7 : 0
      if (h > 42 * k && n <= 20) etiquetaValor(g, miles(v), X(i), y + 32 * k, k, '#fff', true)
      else etiquetaValor(g, miles(v), X(i), y - 6 * k - ex, k, v < 0 ? '#C0392B' : '#2B2F33')
    })
  } else {
    const pts = d.valores.map((v, i) => [X(i), Y(v)] as const)
    if (o.estilo === 'area') {
      const gr = g.createLinearGradient(0, y1, 0, y0)
      gr.addColorStop(0, alfa(pal.principal, 0.55))
      gr.addColorStop(1, alfa(pal.principal, 0.04))
      g.fillStyle = gr
      g.beginPath()
      g.moveTo(pts[0][0], y0)
      pts.forEach(([x, y]) => g.lineTo(x, y))
      g.lineTo(pts[pts.length - 1][0], y0)
      g.closePath()
      g.fill()
    }
    g.save()
    g.shadowColor = alfa(pal.principal, 0.45)
    g.shadowBlur = 12 * k
    g.shadowOffsetY = 5 * k
    g.strokeStyle = pal.principal
    g.lineWidth = 5 * k
    g.lineJoin = 'round'
    g.beginPath()
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.stroke()
    g.restore()
    pts.forEach(([x, y], i) => {
      const color = d.valores[i] < 0 ? '#C0392B' : colorDe(i)
      g.save()
      g.shadowColor = 'rgba(0,0,0,0.35)'
      g.shadowBlur = 6 * k
      g.shadowOffsetY = 3 * k
      g.fillStyle = '#fff'
      g.beginPath()
      g.arc(x, y, 9 * k, 0, Math.PI * 2)
      g.fill()
      g.restore()
      g.fillStyle = color
      g.beginPath()
      g.arc(x, y, 6 * k, 0, Math.PI * 2)
      g.fill()
      if (n <= 26) etiquetaValor(g, miles(d.valores[i]), x, y - 14 * k, k, d.valores[i] < 0 ? '#C0392B' : '#2B2F33')
    })
  }

  // Línea de referencia (promedio)
  if (d.referencia) {
    const y = Y(d.referencia.valor)
    g.strokeStyle = pal.acento
    g.lineWidth = 3 * k
    g.setLineDash([14 * k, 8 * k])
    g.beginPath()
    g.moveTo(x0, y)
    g.lineTo(x1, y)
    g.stroke()
    g.setLineDash([])
    // Etiqueta en una cajita blanca para que no se pierda sobre las columnas
    g.font = `700 ${22 * k}px ${FUENTE}`
    const et = `${d.referencia.nombre}: ${miles(d.referencia.valor)}`
    const tw = g.measureText(et).width
    g.save()
    g.shadowColor = 'rgba(0,0,0,0.25)'
    g.shadowBlur = 6 * k
    g.shadowOffsetY = 2 * k
    g.fillStyle = '#FFFFFF'
    rectRedondo(g, x1 - tw - 22 * k, y - 40 * k, tw + 16 * k, 32 * k, 6 * k)
    g.fill()
    g.restore()
    g.strokeStyle = pal.acento
    g.lineWidth = 2 * k
    rectRedondo(g, x1 - tw - 22 * k, y - 40 * k, tw + 16 * k, 32 * k, 6 * k)
    g.stroke()
    g.textAlign = 'right'
    g.textBaseline = 'middle'
    g.fillStyle = tono(pal.acento, -0.45)
    g.fillText(et, x1 - 14 * k, y - 24 * k)
  }

  // Línea de porcentaje (eje derecho), curva suave con sombra
  if (d.porcentaje) {
    const P = (p: number) => y0 - (Math.max(0, Math.min(100, p)) / 100) * (y0 - y1)
    const pts = d.porcentaje.valores.map((p, i) => [X(i), P(p)] as const)
    g.save()
    g.shadowColor = 'rgba(0,0,0,0.3)'
    g.shadowBlur = 8 * k
    g.shadowOffsetY = 4 * k
    g.strokeStyle = pal.acento
    g.lineWidth = 6 * k
    g.lineCap = 'round'
    g.beginPath()
    pts.forEach(([x, y], i) => {
      if (!i) return g.moveTo(x, y)
      const [px, py] = pts[i - 1]
      const cx = (px + x) / 2
      g.bezierCurveTo(cx, py, cx, y, x, y)
    })
    g.stroke()
    g.restore()
  }

  // Etiquetas del eje X
  g.fillStyle = '#4A4F55'
  g.font = `600 ${(n > 26 ? 17 : 22) * k}px ${FUENTE}`
  d.etiquetas.forEach((et, i) => {
    g.save()
    if (n > 8) {
      g.translate(X(i) + 4 * k, y0 + 14 * k)
      g.rotate(-Math.PI / 4)
      g.textAlign = 'right'
      g.textBaseline = 'middle'
      g.fillText(et, 0, 0)
    } else {
      g.textAlign = 'center'
      g.textBaseline = 'top'
      g.fillText(et, X(i), y0 + 12 * k)
    }
    g.restore()
  })

  // Leyenda
  const items: [string, string, 'barra' | 'linea' | 'guion'][] = [[d.nombreSerie, pal.principal, o.estilo === 'sombra' || o.estilo === '3d' ? 'barra' : 'linea']]
  if (d.porcentaje) items.push([d.porcentaje.nombre, pal.acento, 'linea'])
  if (d.referencia) items.push([d.referencia.nombre, pal.acento, 'guion'])
  g.font = `600 ${22 * k}px ${FUENTE}`
  const anchos = items.map(([t]) => g.measureText(t).width + 56 * k)
  let lx = (ancho - anchos.reduce((s, a) => s + a, 0)) / 2
  const ly = alto - 30 * k
  items.forEach(([t, col, tipo], i) => {
    g.fillStyle = col
    g.strokeStyle = col
    if (tipo === 'barra') g.fillRect(lx, ly - 9 * k, 26 * k, 18 * k)
    else {
      g.lineWidth = 5 * k
      g.setLineDash(tipo === 'guion' ? [8 * k, 5 * k] : [])
      g.beginPath()
      g.moveTo(lx, ly)
      g.lineTo(lx + 28 * k, ly)
      g.stroke()
      g.setLineDash([])
    }
    g.fillStyle = '#3A3F44'
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    g.fillText(t, lx + 36 * k, ly)
    lx += anchos[i]
  })
  return c
}

// ---------------- comparativa entre materiales (barras horizontales con rango) ----------------
export interface FilaComparativa {
  nombre: string
  /** Periodos que alcanza con el consumo promedio, el alto (conservador) y el bajo. */
  promedio: number
  alto: number
  bajo: number
  texto: string
}

export function graficaComparativa(filas: FilaComparativa[], unidad: string, o: OpcionesGrafica & { titulo: string; subtitulo?: string; nota?: string }): HTMLCanvasElement {
  const ancho = o.ancho ?? 1600
  const alto = o.alto ?? Math.max(560, 210 + filas.length * 130)
  const k = ancho / 1600
  const pal = paleta(o.paleta)
  const { c, g } = lienzo(ancho, alto)
  titulo(g, o.titulo, ancho, k, o.subtitulo)
  const izq = 380 * k
  const der = 70 * k
  const arriba = (o.subtitulo ? 130 : 100) * k
  const abajo = 110 * k
  const x0 = izq
  const x1 = ancho - der
  const finitos = filas.flatMap((f) => [f.promedio, f.bajo, f.alto]).filter((v) => isFinite(v))
  const { tope, paso } = escalaBonita(Math.max(1, ...finitos) * 1.05)
  const X = (v: number) => x0 + (Math.min(isFinite(v) ? v : tope, tope) / tope) * (x1 - x0)
  const banda = (alto - arriba - abajo) / Math.max(1, filas.length)
  g.font = `500 ${22 * k}px ${FUENTE}`
  g.textBaseline = 'top'
  for (let v = 0; v <= tope + 1e-9; v += paso) {
    g.strokeStyle = v === 0 ? '#9AA1A8' : '#DDE1E5'
    g.lineWidth = v === 0 ? 2 * k : 1.2 * k
    g.setLineDash(v === 0 ? [] : [6 * k, 6 * k])
    g.beginPath()
    g.moveTo(X(v), arriba - 6 * k)
    g.lineTo(X(v), alto - abajo)
    g.stroke()
    g.setLineDash([])
    g.fillStyle = '#5B6168'
    g.textAlign = 'center'
    g.fillText(miles(v), X(v), alto - abajo + 10 * k)
  }
  g.fillStyle = '#5B6168'
  g.fillText(`${unidad} que alcanzan las existencias`, (x0 + x1) / 2, alto - abajo + 42 * k)
  filas.forEach((f, i) => {
    const color = pal.serie[i % pal.serie.length]
    const yc = arriba + banda * (i + 0.5)
    const h = Math.min(banda * 0.48, 60 * k)
    const yr = yc + h / 2 + 14 * k // línea del rango, debajo de la barra
    // nombre
    g.fillStyle = '#2B2F33'
    g.font = `700 ${26 * k}px ${FUENTE}`
    g.textAlign = 'right'
    g.textBaseline = 'middle'
    g.fillText(f.nombre, x0 - 16 * k, yc, izq - 30 * k)
    // barra con sombra y degradado vertical
    const wBar = X(f.promedio) - x0
    g.save()
    g.shadowColor = 'rgba(0,0,0,0.33)'
    g.shadowBlur = 12 * k
    g.shadowOffsetX = 5 * k
    g.shadowOffsetY = 5 * k
    const gr = g.createLinearGradient(0, yc - h / 2, 0, yc + h / 2)
    gr.addColorStop(0, tono(color, 0.22))
    gr.addColorStop(0.5, color)
    gr.addColorStop(1, tono(color, -0.3))
    g.fillStyle = gr
    g.beginPath()
    const r = Math.min(8 * k, h / 2)
    g.moveTo(x0, yc - h / 2)
    g.lineTo(x0 + wBar - r, yc - h / 2)
    g.quadraticCurveTo(x0 + wBar, yc - h / 2, x0 + wBar, yc - h / 2 + r)
    g.lineTo(x0 + wBar, yc + h / 2 - r)
    g.quadraticCurveTo(x0 + wBar, yc + h / 2, x0 + wBar - r, yc + h / 2)
    g.lineTo(x0, yc + h / 2)
    g.closePath()
    g.fill()
    g.restore()
    // rango: del escenario conservador al bajo
    const xa = X(f.alto)
    const xb = X(f.bajo)
    g.strokeStyle = '#2B2F33'
    g.lineWidth = 3 * k
    g.beginPath()
    g.moveTo(xa, yr)
    g.lineTo(xb, yr)
    g.moveTo(xa, yr - 8 * k)
    g.lineTo(xa, yr + 8 * k)
    g.moveTo(xb, yr - 8 * k)
    g.lineTo(xb, yr + 8 * k)
    g.stroke()
    // texto
    g.font = `700 ${24 * k}px ${FUENTE}`
    const t = f.texto
    const tw = g.measureText(t).width
    const dentro = wBar > tw + 30 * k
    g.textAlign = dentro ? 'right' : 'left'
    g.fillStyle = dentro ? '#fff' : '#2B2F33'
    g.fillText(t, dentro ? x0 + wBar - 14 * k : x0 + wBar + 14 * k, yc)
  })
  g.font = `500 ${19 * k}px ${FUENTE}`
  g.fillStyle = '#6F7271'
  g.textAlign = 'right'
  g.textBaseline = 'bottom'
  g.fillText(o.nota ?? 'Barra: consumo promedio · Línea delgada: del escenario conservador al bajo', x1, alto - 10 * k)
  return c
}

// ---------------- dona con sombra (desglose por talla) ----------------
export function graficaDona(datos: { etiqueta: string; valor: number }[], o: OpcionesGrafica & { titulo: string }): HTMLCanvasElement {
  const ancho = o.ancho ?? 1600
  const alto = o.alto ?? 700
  const k = ancho / 1600
  const pal = paleta(o.paleta)
  const { c, g } = lienzo(ancho, alto)
  titulo(g, o.titulo, ancho, k)
  const total = datos.reduce((s, d) => s + d.valor, 0) || 1
  const cx = ancho * 0.36
  const cy = alto / 2 + 30 * k
  const R = Math.min(alto * 0.36, 250 * k)
  let a = -Math.PI / 2
  g.save()
  g.shadowColor = 'rgba(0,0,0,0.35)'
  g.shadowBlur = 22 * k
  g.shadowOffsetX = 8 * k
  g.shadowOffsetY = 10 * k
  g.fillStyle = '#fff'
  g.beginPath()
  g.arc(cx, cy, R, 0, Math.PI * 2)
  g.fill()
  g.restore()
  datos.forEach((d, i) => {
    const ang = (d.valor / total) * Math.PI * 2
    const color = pal.serie[i % pal.serie.length]
    const gr = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R)
    gr.addColorStop(0, tono(color, 0.3))
    gr.addColorStop(1, tono(color, -0.15))
    g.fillStyle = gr
    g.beginPath()
    g.moveTo(cx, cy)
    g.arc(cx, cy, R, a, a + ang)
    g.closePath()
    g.fill()
    g.strokeStyle = '#fff'
    g.lineWidth = 4 * k
    g.stroke()
    if (d.valor / total >= 0.05) {
      const m = a + ang / 2
      etiquetaValor(g, `${Math.round((d.valor / total) * 100)}%`, cx + Math.cos(m) * R * 0.78, cy + Math.sin(m) * R * 0.78 + 10 * k, k, '#fff', true)
    }
    a += ang
  })
  g.fillStyle = '#fff'
  g.beginPath()
  g.arc(cx, cy, R * 0.5, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#2B2F33'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `700 ${54 * k}px ${FUENTE}`
  g.fillText(miles(total), cx, cy - 14 * k)
  g.font = `500 ${26 * k}px ${FUENTE}`
  g.fillStyle = '#6F7271'
  g.fillText('entregados', cx, cy + 32 * k)
  // leyenda
  const lx = ancho * 0.6
  let ly = cy - (datos.length * 64 * k) / 2 + 30 * k
  datos.forEach((d, i) => {
    g.fillStyle = pal.serie[i % pal.serie.length]
    g.fillRect(lx, ly - 18 * k, 36 * k, 36 * k)
    g.fillStyle = '#2B2F33'
    g.textAlign = 'left'
    g.font = `700 ${32 * k}px ${FUENTE}`
    g.fillText(`Talla ${d.etiqueta}`, lx + 52 * k, ly)
    g.font = `500 ${32 * k}px ${FUENTE}`
    g.fillText(`${miles(d.valor)} (${Math.round((d.valor / total) * 100)}%)`, lx + 300 * k, ly)
    ly += 64 * k
  })
  return c
}

// ---------------- planeado vs real (varias series) ----------------
export interface Serie {
  nombre: string
  valores: (number | null)[]
  color: string
  /** Línea punteada (para lo planeado). */
  punteada?: boolean
}

/** Columnas agrupadas (sombra/3D) o líneas (área/líneas) con varias series. */
export function graficaSeries(d: { titulo: string; subtitulo?: string; etiquetas: string[]; series: Serie[]; lineas?: boolean }, o: OpcionesGrafica): HTMLCanvasElement {
  const ancho = o.ancho ?? 1600
  const alto = o.alto ?? 760
  const k = ancho / 1600
  const { c, g } = lienzo(ancho, alto)
  titulo(g, d.titulo, ancho, k, d.subtitulo)
  const n = Math.max(1, d.etiquetas.length)
  const x0 = 120 * k
  const x1 = ancho - 40 * k
  const y1 = (d.subtitulo ? 128 : 96) * k
  const y0 = alto - ((n > 8 ? 150 : 100) * k + 44 * k)
  const todos = d.series.flatMap((s) => s.valores.filter((v): v is number => v != null))
  const minV = Math.min(0, ...todos)
  // La escala se calcula con todo el rango (también los negativos) para no saturar el eje
  const maxV = Math.max(1, ...todos)
  const { paso } = escalaBonita((maxV - minV) * 1.1)
  const tope = Math.ceil((maxV * 1.08) / paso) * paso
  const base = minV < 0 ? -Math.ceil((-minV * 1.05) / paso) * paso : 0
  const Y = (v: number) => y0 - ((v - base) / (tope - base)) * (y0 - y1)
  const banda = (x1 - x0) / n
  const X = (i: number) => x0 + banda * (i + 0.5)
  g.font = `500 ${23 * k}px ${FUENTE}`
  g.textBaseline = 'middle'
  for (let v = base; v <= tope + 1e-9; v += paso) {
    g.strokeStyle = v === 0 ? '#9AA1A8' : '#DDE1E5'
    g.lineWidth = v === 0 ? 2 * k : 1.2 * k
    g.setLineDash(v === 0 ? [] : [6 * k, 6 * k])
    g.beginPath()
    g.moveTo(x0, Y(v))
    g.lineTo(x1, Y(v))
    g.stroke()
    g.setLineDash([])
    g.fillStyle = '#5B6168'
    g.textAlign = 'right'
    g.fillText(miles(v), x0 - 12 * k, Y(v))
  }
  const lineas = d.lineas || o.estilo === 'area' || o.estilo === 'lineas'
  const ns = d.series.length
  if (!lineas) {
    const grupo = Math.min(banda * 0.78, 190 * k)
    const w = grupo / ns
    d.series.forEach((s, si) => {
      s.valores.forEach((v, i) => {
        if (v == null) return
        const x = X(i) - grupo / 2 + w * si + w * 0.08
        const ww = w * 0.84
        const y = Y(Math.max(0, v))
        const yb = Y(Math.min(0, v))
        const h = Math.max(2 * k, yb - y)
        g.save()
        g.shadowColor = 'rgba(0,0,0,0.33)'
        g.shadowBlur = 10 * k
        g.shadowOffsetX = 4 * k
        g.shadowOffsetY = 4 * k
        const gr = g.createLinearGradient(x, 0, x + ww, 0)
        gr.addColorStop(0, tono(s.color, 0.2))
        gr.addColorStop(0.5, s.color)
        gr.addColorStop(1, tono(s.color, -0.3))
        g.fillStyle = gr
        if (o.estilo === '3d') g.fillRect(x, y, ww, h)
        else {
          rectRedondo(g, x, y, ww, h, 5 * k)
          g.fill()
        }
        g.restore()
        if (s.punteada) {
          // Lo planeado lleva rayado para distinguirlo también en blanco y negro
          g.save()
          g.beginPath()
          g.rect(x, y, ww, h)
          g.clip()
          g.strokeStyle = 'rgba(255,255,255,0.35)'
          g.lineWidth = 3 * k
          for (let t = -h; t < ww + h; t += 12 * k) {
            g.beginPath()
            g.moveTo(x + t, y + h)
            g.lineTo(x + t + h, y)
            g.stroke()
          }
          g.restore()
        }
        if (n * ns <= 30) etiquetaValor(g, miles(v), x + ww / 2, y - 6 * k, k, v < 0 ? '#C0392B' : '#2B2F33')
      })
    })
  } else {
    d.series.forEach((s) => {
      const pts = s.valores.map((v, i) => (v == null ? null : ([X(i), Y(v)] as const)))
      const validos = pts.filter((p): p is readonly [number, number] => !!p)
      if (!validos.length) return
      if (o.estilo === 'area' && !s.punteada) {
        const gr = g.createLinearGradient(0, y1, 0, y0)
        gr.addColorStop(0, alfa(s.color, 0.45))
        gr.addColorStop(1, alfa(s.color, 0.03))
        g.fillStyle = gr
        g.beginPath()
        g.moveTo(validos[0][0], Y(Math.max(0, base)))
        validos.forEach(([x, y]) => g.lineTo(x, y))
        g.lineTo(validos[validos.length - 1][0], Y(Math.max(0, base)))
        g.closePath()
        g.fill()
      }
      g.save()
      g.shadowColor = alfa(s.color, 0.45)
      g.shadowBlur = 10 * k
      g.shadowOffsetY = 4 * k
      g.strokeStyle = s.color
      g.lineWidth = 5 * k
      g.lineJoin = 'round'
      g.setLineDash(s.punteada ? [16 * k, 10 * k] : [])
      g.beginPath()
      validos.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.stroke()
      g.restore()
      validos.forEach(([x, y]) => {
        g.fillStyle = '#fff'
        g.beginPath()
        g.arc(x, y, 8 * k, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = s.color
        g.beginPath()
        g.arc(x, y, 5.5 * k, 0, Math.PI * 2)
        g.fill()
      })
      // Lo planeado lleva sus números abajo de la línea y lo real arriba, para que no se encimen
      if (n <= 16)
        s.valores.forEach((v, i) => {
          // Si otra serie ya muestra el mismo número en ese punto, no se repite
          if (v == null || (s.punteada && d.series.some((o2) => o2 !== s && !o2.punteada && o2.valores[i] === v))) return
          etiquetaValor(g, miles(v), X(i), Y(v) + (s.punteada ? 36 : -14) * k, k, tono(s.color, -0.35))
        })
    })
  }
  // eje X
  g.fillStyle = '#4A4F55'
  g.font = `600 ${(n > 26 ? 17 : 22) * k}px ${FUENTE}`
  d.etiquetas.forEach((et, i) => {
    g.save()
    if (n > 8) {
      g.translate(X(i) + 4 * k, y0 + 14 * k)
      g.rotate(-Math.PI / 4)
      g.textAlign = 'right'
      g.textBaseline = 'middle'
      g.fillText(et, 0, 0)
    } else {
      g.textAlign = 'center'
      g.textBaseline = 'top'
      g.fillText(et, X(i), y0 + 12 * k)
    }
    g.restore()
  })
  // leyenda
  g.font = `600 ${22 * k}px ${FUENTE}`
  const anchos = d.series.map((s) => g.measureText(s.nombre).width + 60 * k)
  let lx = (ancho - anchos.reduce((s, a) => s + a, 0)) / 2
  const ly = alto - 30 * k
  d.series.forEach((s, i) => {
    g.fillStyle = s.color
    g.strokeStyle = s.color
    if (lineas) {
      g.lineWidth = 5 * k
      g.setLineDash(s.punteada ? [8 * k, 5 * k] : [])
      g.beginPath()
      g.moveTo(lx, ly)
      g.lineTo(lx + 30 * k, ly)
      g.stroke()
      g.setLineDash([])
    } else g.fillRect(lx, ly - 10 * k, 28 * k, 20 * k)
    g.fillStyle = '#3A3F44'
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    g.fillText(s.nombre, lx + 38 * k, ly)
    lx += anchos[i]
  })
  return c
}
