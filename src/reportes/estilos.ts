// Estilos de las gráficas de los reportes entregables (PDF y presentación), los mismos que ofrece la
// Bitácora 24RU1: barras planas / degradado con sombra / 3D / cilindros con brillo, y pastel
// dona / plano / 3D / rebanada mayor destacada. Los elige el usuario en Reportes.

export type EstiloBarras = 'plana' | 'degradado' | '3d' | 'cilindro'
export type EstiloPastel = 'dona' | 'plano' | '3d' | 'destacado'

export const ESTILOS_BARRAS: [EstiloBarras, string][] = [
  ['plana', 'Actual (barras planas)'],
  ['degradado', 'Degradado con sombra'],
  ['3d', '3D'],
  ['cilindro', 'Cilindros con brillo'],
]
export const ESTILOS_PASTEL: [EstiloPastel, string][] = [
  ['dona', 'Actual (dona)'],
  ['plano', 'Pastel plano'],
  ['3d', 'Pastel 3D'],
  ['destacado', 'Rebanada mayor destacada'],
]

/** Aclara (f > 0) u oscurece (f < 0) un color «RRGGBB» o «#RRGGBB». Devuelve «RRGGBB». */
export function mezcla(hex: string, f: number): string {
  const n = parseInt((hex || '888888').replace('#', ''), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
    .map((x) => Math.round(f > 0 ? x + (255 - x) * f : x * (1 + f)))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

/** Variables CSS para dibujar una barra del PDF en el estilo elegido (caras de 3D, brillo del cilindro). */
export function varsBarra(color: string): Record<string, string> {
  return {
    '--c': color,
    '--c-claro': '#' + mezcla(color, 0.35),
    '--c-brillo': '#' + mezcla(color, 0.45),
    '--c-medio': '#' + mezcla(color, 0.15),
    '--c-oscuro': '#' + mezcla(color, -0.15),
    '--c-sombra': '#' + mezcla(color, -0.35),
    '--c-fondo': '#' + mezcla(color, -0.45),
  }
}

let gid = 0

/**
 * Gráfica de pastel en SVG (PDF), con la geometría de la Bitácora 24RU1: rebanadas desde arriba en el
 * sentido del reloj, porcentaje dentro (o fuera si es chica). Estilos: plano, 3D y rebanada mayor destacada.
 */
export function svgPastel(o: { valores: number[]; colores: string[]; ancho: number; alto: number; est: Exclude<EstiloPastel, 'dona'>; sinTexto?: boolean }): string {
  const { valores: v, colores, ancho: W, alto: H, est } = o
  const d3 = est === '3d'
  const dest = est === 'destacado'
  const id = 'pp' + ++gid
  const r = Math.min(W, H) / 2 - 24
  const ry = d3 ? r * 0.55 : r
  const dep = d3 ? r * 0.2 : 0
  const cx = W / 2
  const cy = H / 2 - dep / 2
  const tot = v.reduce((a, b) => a + b, 0) || 1
  const col = (i: number) => (colores[i % colores.length] || '#888888').replace('#', '')
  const pt = (a: number, rr: number): [number, number] => [cx + rr * Math.cos(a), cy + rr * (ry / r) * Math.sin(a)]
  const f = (x: number) => x.toFixed(2)
  const mayor = v.indexOf(Math.max(...v))
  let defs = ''
  let cuerpo = ''
  let paredes = ''
  let a0 = -Math.PI / 2
  const et: { i: number; m: number; p: number; ox: number; oy: number }[] = []
  if (est !== 'plano') defs += `<filter id="${id}s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="1.5" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".25"/></filter>`
  if (dest) defs += `<radialGradient id="${id}h" cx=".42" cy=".35" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></radialGradient>`
  v.forEach((n, i) => {
    if (!n) return
    const a1 = a0 + (n / tot) * Math.PI * 2
    const big = a1 - a0 > Math.PI ? 1 : 0
    const ex = dest && i === mayor ? r * 0.07 : 0
    const m = (a0 + a1) / 2
    const ox = ex * Math.cos(m)
    const oy = ex * Math.sin(m)
    const [x0, y0] = pt(a0, r)
    const [x1, y1] = pt(a1, r)
    if (d3) {
      // Pared de la rebanada en la parte de enfrente (de 0 a 180 grados)
      for (const [p0, p1] of [
        [Math.max(a0, 0), Math.min(a1, Math.PI)],
        [Math.max(a0, 2 * Math.PI), Math.min(a1, 3 * Math.PI)],
      ]) {
        if (p1 <= p0) continue
        const [u0, w0] = pt(p0, r)
        const [u1, w1] = pt(p1, r)
        paredes += `<path d="M${f(u0)},${f(w0)} A${f(r)},${f(ry)} 0 0 1 ${f(u1)},${f(w1)} L${f(u1)},${f(w1 + dep)} A${f(r)},${f(ry)} 0 0 0 ${f(u0)},${f(w0 + dep)} Z" fill="#${mezcla(col(i), -0.32)}"/>`
      }
    }
    if (n === tot) cuerpo += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(r)}" ry="${f(ry)}" fill="#${col(i)}"/>`
    else
      cuerpo += `<path${ex ? ` transform="translate(${f(ox)},${f(oy)})"` : ''} d="M${f(cx)},${f(cy)} L${f(x0)},${f(y0)} A${f(r)},${f(ry)} 0 ${big} 1 ${f(x1)},${f(y1)} Z" fill="#${col(i)}" stroke="#fff" stroke-width="${est === 'plano' ? 1.2 : 1.6}"/>`
    et.push({ i, m, p: (n / tot) * 100, ox, oy })
    a0 = a1
  })
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" font-family="Arial,Helvetica,sans-serif" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>`
  s += est === 'plano' ? cuerpo : `<g filter="url(#${id}s)">${paredes}${cuerpo}</g>`
  if (dest) s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="url(#${id}h)"/>`
  const claro = (c: string) => {
    const x = parseInt(c, 16)
    return ((x >> 16) * 299 + ((x >> 8) & 255) * 587 + (x & 255) * 114) / 1000 > 150
  }
  let fuera = 0 // las rebanadas chicas llevan su porcentaje por fuera, alternando la distancia para que no se encimen
  for (const e of o.sinTexto ? [] : et) {
    const dentro = e.p >= 3.4
    const dist = dentro ? r * (e.p > 30 ? 0.55 : 0.68) : r + 8 + (fuera++ % 2) * 11
    const [px, py] = pt(e.m, dist)
    const x = px + e.ox
    const y = py + e.oy + (!dentro && d3 && Math.sin(e.m) > 0 ? dep : 0)
    const fz = e.p >= 9 ? 13 : 11
    const fill = dentro ? (claro(col(e.i)) ? '#1b1b1b' : '#fff') : '#1b1b1b'
    s += `<text x="${f(x)}" y="${f(y + fz * 0.35)}" text-anchor="middle" font-size="${fz}" font-weight="700" fill="${fill}">${e.p.toFixed(1)}%</text>`
  }
  return s + '</svg>'
}

// ---------------------------------------------------------------- PowerPoint: estilos sobre las gráficas nativas

const SOMBRA_BARRA = `<a:effectLst><a:outerShdw blurRad="38100" dist="19050" dir="5400000" algn="t" rotWithShape="0"><a:prstClr val="black"><a:alpha val="30000"/></a:prstClr></a:outerShdw></a:effectLst>`
const SOMBRA_PASTEL = `<a:effectLst><a:outerShdw blurRad="50800" dist="25400" dir="5400000" algn="t" rotWithShape="0"><a:prstClr val="black"><a:alpha val="25000"/></a:prstClr></a:outerShdw></a:effectLst>`

/** Relleno de PowerPoint de una barra en cada estilo (el mismo de la Bitácora). */
function rellenoBarra(c: string, est: EstiloBarras): string {
  const hx = (k: number) => mezcla(c, k)
  if (est === 'degradado')
    return `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${hx(0.35)}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${hx(-0.15)}"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>${SOMBRA_BARRA}`
  if (est === 'cilindro')
    return `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${hx(-0.35)}"/></a:gs><a:gs pos="38000"><a:srgbClr val="${hx(0.45)}"/></a:gs><a:gs pos="55000"><a:srgbClr val="${hx(0.15)}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${hx(-0.45)}"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:effectLst/>`
  return `<a:solidFill><a:srgbClr val="${c}"/></a:solidFill><a:effectLst/>`
}

/** Aplica el estilo de barras a una gráfica de barras de pptxgenjs. */
export function estilizarBarrasXml(xml: string, est: EstiloBarras): string {
  if (est === 'plana' || !xml.includes('<c:barChart>')) return xml
  // Relleno de cada serie (el primer spPr de cada <c:ser>)
  let s = xml.replace(/(<c:ser>[\s\S]*?<c:spPr>)\s*<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"\/><\/a:solidFill>\s*<a:effectLst\/>/g, (_m, ini: string, c: string) => ini + rellenoBarra(c.toUpperCase(), est))
  if (est === '3d' || est === 'cilindro') {
    // Gráfica de barras 3D: sin «overlap» (no existe en 3D), con forma de caja o cilindro y solo dos ejes
    s = s.replace('<c:barChart>', '<c:bar3DChart>').replace('</c:barChart>', '</c:bar3DChart>')
    s = s.replace(/<c:overlap val="-?\d+"\/>/, `<c:shape val="${est === 'cilindro' ? 'cylinder' : 'box'}"/>`)
    s = s.replace(/(<c:bar3DChart>[\s\S]*?)(<c:axId val="\d+"\/>)(<c:axId val="\d+"\/>)<c:axId val="\d+"\/>(<\/c:bar3DChart>)/, '$1$2$3$4')
    s = s.replace(/<c:dLblPos val="\w+"\/>/g, '')
    s = s.replace(
      '<c:autoTitleDeleted val="1"/>',
      '<c:autoTitleDeleted val="1"/><c:view3D><c:rotX val="12"/><c:rotY val="18"/><c:rAngAx val="1"/></c:view3D><c:floor><c:thickness val="0"/></c:floor><c:sideWall><c:thickness val="0"/><c:spPr><a:noFill/></c:spPr></c:sideWall><c:backWall><c:thickness val="0"/><c:spPr><a:noFill/></c:spPr></c:backWall>',
    )
  }
  return s
}

/** Aplica el estilo de pastel a la gráfica de dona de pptxgenjs. */
export function estilizarPastelXml(xml: string, est: EstiloPastel): string {
  if (est === 'dona' || !xml.includes('<c:doughnutChart>')) return xml
  const tag = est === '3d' ? 'pie3DChart' : 'pieChart'
  let s = xml.replace('<c:doughnutChart>', `<c:${tag}>`).replace('</c:doughnutChart>', `</c:${tag}>`)
  s = s.replace(/<c:holeSize val="\d+"\/>/, '')
  if (est === '3d') {
    s = s.replace(/<c:firstSliceAng val="\d+"\/>/, '')
    s = s.replace('<c:autoTitleDeleted val="1"/>', '<c:autoTitleDeleted val="1"/><c:view3D><c:rotX val="30"/><c:rotY val="0"/><c:rAngAx val="0"/></c:view3D>')
  }
  // Valores para ubicar la rebanada mayor
  const ser = s.slice(s.indexOf('<c:val>'))
  const vals = [...ser.matchAll(/<c:pt idx="(\d+)"><c:v>([\d.]+)<\/c:v><\/c:pt>/g)].map((m) => Number(m[2]))
  const mayor = vals.indexOf(Math.max(...vals))
  // Sombra y borde blanco en cada rebanada; la mayor se separa en «destacado»
  s = s.replace(/<c:dPt>\s*<c:idx val="(\d+)"\/>\s*<c:bubble3D val="0"\/>\s*<c:spPr>([\s\S]*?)<a:effectLst\/>\s*<\/c:spPr>/g, (_m, idx: string, relleno: string) => {
    const explota = est === 'destacado' && Number(idx) === mayor ? '<c:explosion val="10"/>' : ''
    return `<c:dPt><c:idx val="${idx}"/><c:bubble3D val="0"/>${explota}<c:spPr>${relleno}<a:ln w="25400"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>${SOMBRA_PASTEL}</c:spPr>`
  })
  return s
}

/** Abre el .pptx generado y aplica los estilos elegidos a sus gráficas. */
export async function estilizarPresentacion(blob: Blob, est: { barras: EstiloBarras; pastel: EstiloPastel }): Promise<Blob> {
  if (est.barras === 'plana' && est.pastel === 'dona') return blob
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  for (const nombre of Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))) {
    const xml = await zip.file(nombre)!.async('string')
    const nuevo = estilizarPastelXml(estilizarBarrasXml(xml, est.barras), est.pastel)
    if (nuevo !== xml) zip.file(nombre, nuevo)
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression: 'DEFLATE' })
}
