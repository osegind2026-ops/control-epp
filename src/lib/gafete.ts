import { normalizar } from './util'

// Interpreta el texto leído (OCR) de un gafete CFE Laguna Verde. Formato típico:
//
//   CFE                         Laguna Verde
//   [foto]  NOMBRE(S)                    POE
//           APELLIDOS
//           AREA:
//           ÁREA EN UNA O DOS LÍNEAS
//           PUESTO
//   1234    (número)            dd/mm/aaaa (vigencia)
//   ABC12   (RPE)
//
// El resultado siempre se muestra al usuario para confirmar: el OCR confunde
// letras parecidas (O/0, I/1) y el orden de líneas puede variar con la foto.

export interface DatosGafete {
  rpe: string
  nombre: string
  area: string
  puesto: string
  numero: string
  vigencia: string // YYYY-MM-DD
  areaSegura: boolean // true si el área coincidió con una conocida
}

const RUIDO = /^(CFE|LAGUNA VERDE|POE|SEG\.? ?FISICA|NUCLEAR|SEG\.? FISICA NUCLEAR)$/
const PALABRAS_PUESTO = /\b(JEFE|JEFA|OPERADOR|OPERADORA|TECNICO|TECNICA|AUXILIAR|SUPERVISOR|SUPERVISORA|INGENIERO|INGENIERA|ESPECIALISTA|OFICIAL|AYUDANTE|SUPERINTENDENTE|ENCARGADO|ENCARGADA|ANALISTA|COORDINADOR|COORDINADORA|GERENTE|SUBGERENTE|INSPECTOR|INSPECTORA|MECANICO|ELECTRICISTA|INSTRUMENTISTA|OFICINISTA|SECRETARIA|CHOFER|VIGILANTE|PROFESIONISTA|RESIDENTE)\b/

/** Similitud 0..1 entre dos textos (coeficiente de Dice sobre pares de letras). */
export function similitud(a: string, b: string): number {
  const pares = (s: string) => {
    const t = normalizar(s).replace(/[^a-z0-9]/g, '')
    const m = new Map<string, number>()
    for (let i = 0; i < t.length - 1; i++) m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) ?? 0) + 1)
    return m
  }
  const pa = pares(a)
  const pb = pares(b)
  let comunes = 0
  let total = 0
  for (const [k, n] of pa) {
    comunes += Math.min(n, pb.get(k) ?? 0)
    total += n
  }
  for (const n of pb.values()) total += n
  return total ? (2 * comunes) / total : 0
}

export function mejorArea(texto: string, areas: string[]): { area: string; puntaje: number } {
  let mejor = { area: '', puntaje: 0 }
  for (const a of areas) {
    const p = similitud(texto, a)
    if (p > mejor.puntaje) mejor = { area: a, puntaje: p }
  }
  return mejor
}

// Textos impresos que no son datos del trabajador
const FRASES_RUIDO = [/\bCFE\b/g, /\bLAGUNA\s+VERDE\b/g, /\bPOE\b/g, /\bSEG\.?\s*F[IÍ]SICA\b/g, /\bNUCLEAR\b/g]

function limpiarLinea(l: string): string {
  let t = l
    .toUpperCase()
    .replace(/\s[|!]\s*$/, ' I') // el número romano «I» al final del puesto se lee como «|»
    .replace(/[|_~`´"“”'’=]/g, ' ')
    .replace(/[^A-ZÁÉÍÓÚÜÑ0-9/:.\-\s]/g, ' ')
  for (const f of FRASES_RUIDO) t = t.replace(f, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

/** En el nombre se descartan restos del código de barras (p. ej. «LIL», «II»). */
function limpiarNombre(l: string): string {
  return l
    .split(' ')
    .filter((t) => t.length > 1 && !/^[IL1]+$/.test(t) && !/\d/.test(t))
    .join(' ')
}

/** Una línea «útil» tiene suficientes letras (descarta ruido del código de barras). */
function esTexto(l: string): boolean {
  const letras = l.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '').length
  return letras >= 3 && letras / Math.max(l.replace(/\s/g, '').length, 1) > 0.6
}

function esRpe(t: string): boolean {
  return /^[A-Z0-9]{5}$/.test(t) && /[A-Z]/.test(t) && /\d/.test(t)
}

export function interpretarGafete(texto: string, areasConocidas: string[]): DatosGafete {
  const lineas = texto
    .split(/\r?\n/)
    .map(limpiarLinea)
    .filter((l) => l && !RUIDO.test(normalizar(l).toUpperCase()))

  // Vigencia y número
  let vigencia = ''
  let numero = ''
  let rpe = ''
  for (const l of lineas) {
    const f = l.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/)
    if (f && !vigencia) vigencia = `${f[3]}-${f[2].padStart(2, '0')}-${f[1].padStart(2, '0')}`
    for (const token of l.split(' ')) {
      const t = token.replace(/[^A-Z0-9]/g, '')
      if (!rpe && esRpe(t)) rpe = t
      // La fecha queda como un solo bloque de 8 dígitos, así que no se confunde con el número
      else if (!numero && /^\d{3,6}$/.test(t)) numero = t
    }
  }

  // Bloque de texto: nombre antes de «AREA», área y puesto después
  const textos = lineas.filter(esTexto)
  const iArea = textos.findIndex((l) => /^[ÁA]REA\b/.test(l))
  let nombreLineas: string[]
  let despues: string[]
  if (iArea >= 0) {
    nombreLineas = textos.slice(0, iArea)
    const resto = textos[iArea].replace(/^[ÁA]REA\s*:?\s*/, '')
    despues = [...(resto ? [resto] : []), ...textos.slice(iArea + 1)]
  } else {
    // Sin la palabra ÁREA: el puesto se reconoce por sus palabras y el área es lo que queda antes
    const iPuesto = textos.findIndex((l) => PALABRAS_PUESTO.test(normalizar(l).toUpperCase()))
    nombreLineas = textos.slice(0, Math.min(2, iPuesto >= 0 ? iPuesto : textos.length))
    despues = textos.slice(nombreLineas.length)
  }
  despues = despues.filter((l) => !esRpe(l.replace(/\s/g, '')))

  // El área puede ocupar 1 a 3 líneas: se elige la combinación más parecida a un área conocida
  let area = ''
  let puntaje = 0
  let usadas = 0
  for (let n = 1; n <= Math.min(3, despues.length); n++) {
    const candidato = despues.slice(0, n).join(' ')
    if (n > 1 && PALABRAS_PUESTO.test(normalizar(despues[n - 1]).toUpperCase())) break
    const m = mejorArea(candidato, areasConocidas)
    if (m.puntaje > puntaje) {
      puntaje = m.puntaje
      area = m.area
      usadas = n
    }
  }
  const areaSegura = puntaje >= 0.6
  if (!areaSegura) {
    usadas = Math.min(1, despues.length)
    area = despues.slice(0, usadas).join(' ')
  }
  const puesto = despues.slice(usadas).find((l) => PALABRAS_PUESTO.test(normalizar(l).toUpperCase())) ?? despues[usadas] ?? ''

  return {
    rpe,
    nombre: nombreLineas.map(limpiarNombre).join(' ').replace(/\s+/g, ' ').trim(),
    area,
    puesto,
    numero,
    vigencia,
    areaSegura,
  }
}

// Caracteres que la cámara suele confundir entre sí
const PARECIDOS: string[][] = [['0', 'O', 'D', 'Q'], ['1', 'I', 'L', 'T'], ['2', 'Z'], ['5', 'S'], ['6', 'G'], ['8', 'B'], ['4', 'A']]
const grupo = (c: string) => PARECIDOS.find((g) => g.includes(c))

/**
 * Si el RPE leído no existe tal cual, busca en el padrón uno que solo difiera
 * en caracteres fáciles de confundir (máximo dos). Solo lo devuelve si es único.
 */
export function rpeParecido(leido: string, existentes: Iterable<string>): string {
  const candidatos: string[] = []
  for (const r of existentes) {
    if (r.length !== leido.length) continue
    let difs = 0
    let valido = true
    for (let i = 0; i < r.length && valido; i++) {
      if (r[i] === leido[i]) continue
      difs++
      valido = difs <= 2 && !!grupo(r[i])?.includes(leido[i])
    }
    if (valido && difs > 0) candidatos.push(r)
  }
  return candidatos.length === 1 ? candidatos[0] : ''
}

/** RPE que más veces aparece en las lecturas de la zona (desempata el primero). */
export function rpeMasVotado(texto: string): string {
  const votos = new Map<string, number>()
  for (const t of texto.toUpperCase().split(/[^A-Z0-9]+/)) if (esRpe(t)) votos.set(t, (votos.get(t) ?? 0) + 1)
  let mejor = ''
  let max = 0
  for (const [rpe, n] of votos) if (n > max) [mejor, max] = [rpe, n]
  return mejor
}
