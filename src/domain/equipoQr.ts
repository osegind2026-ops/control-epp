import type { Equipo } from './types'

// Código QR de los equipos a resguardo. El texto es una sola línea, sin acentos ni
// símbolos: los lectores USB/Bluetooth «teclean» lo que leen y, con el teclado en
// español, cambian guiones y signos (un «-» llega como «'»). Por eso el código se
// compara solo con letras y números.

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Solo letras y números en mayúsculas: «exp-01» y «EXP'01» → «EXP01». */
export function soloAlfanumerico(s: string): string {
  return sinAcentos(s).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const limpio = (s: string) => sinAcentos(s).replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Texto del QR: código primero y después los datos para identificarlo con cualquier celular. */
export function textoQr(e: Pick<Equipo, 'codigo' | 'nombre' | 'marca' | 'modelo' | 'serie'>): string {
  // «EQ» marca dónde termina el código (EXP-1 no se confunde con EXP-13)
  const partes = [e.codigo.toUpperCase().replace(/[^A-Z0-9-]/g, ''), 'EQ', limpio(e.nombre), limpio([e.marca, e.modelo].filter(Boolean).join(' '))]
  if (e.serie.trim()) partes.push('Serie ' + limpio(e.serie))
  partes.push('CFE Laguna Verde Seguridad Industrial')
  return partes.filter(Boolean).join(' ')
}

/**
 * Equipo al que corresponde una lectura (QR completo, solo el código, o el código
 * tecleado). Si varios códigos coinciden al inicio, gana el más largo (EXP-10 antes que EXP-1).
 */
export function equipoPorLectura<T extends Pick<Equipo, 'codigo'>>(lectura: string, equipos: T[]): T | undefined {
  const texto = soloAlfanumerico(lectura)
  if (!texto) return undefined
  const exacto = equipos.find((e) => soloAlfanumerico(e.codigo) === texto)
  if (exacto) return exacto
  const conMarca = equipos.find((e) => texto.startsWith(soloAlfanumerico(e.codigo) + 'EQ'))
  if (conMarca) return conMarca
  return equipos
    .filter((e) => {
      const c = soloAlfanumerico(e.codigo)
      return c.length >= 2 && texto.startsWith(c)
    })
    .sort((a, b) => soloAlfanumerico(b.codigo).length - soloAlfanumerico(a.codigo).length)[0]
}
