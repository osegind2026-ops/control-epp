// Contenido del documento de Tendencias. Lo usan el PDF (ReporteTendencia) y el Word
// (tendenciaWord) para que los dos digan exactamente lo mismo.
import {
  AYUDA_ESCENARIO, NOMBRE_ESCENARIO, coberturaTexto, conclusion, cuandoTexto, fechaLarga, miles, porUnidad, unidadTexto,
  type AnalisisMaterial, type Escenario, type Periodo, type UnidadPeriodo,
} from '../domain/tendencias'
import type { ConfigTendencia } from '../state/tendencias'
import { VERSION } from '../version'

export interface Bloque {
  etiquetas: string[]
  filas: { nombre: string; valores: string[]; rojo?: boolean[] }[]
}

export interface ContenidoMaterial {
  titulo: string
  subtitulo: string
  intro: string
  historico: Bloque[]
  resumen: [string, string][]
  existencias: [string, string][]
  indicadores: [string, string][]
  escenarios: { encabezado: string[]; filas: string[][] }
  conclusion: string
  tendencia: string
  proyeccion: Bloque[]
  proyeccionRecortada: boolean
  tallas: [string, string, string][]
  fuente: string
  unidad: string
}

const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`

export function trozos<T>(lista: T[], n: number): T[][] {
  const r: T[][] = []
  for (let i = 0; i < lista.length; i += n) r.push(lista.slice(i, i + n))
  return r
}

/** «de la Semana 37 a la 39» / «de la Semana 50 de 2026 a la Semana 02 de 2027» / «de septiembre a noviembre de 2026». */
export function rangoTexto(ps: Periodo[], u: UnidadPeriodo): string {
  if (!ps.length) return ''
  const a = ps[0]
  const b = ps[ps.length - 1]
  if (u === 'semana') {
    const [aa, sa] = a.clave.split('-S')
    const [ab, sb] = b.clave.split('-S')
    if (a.clave === b.clave) return `de la Semana ${sa} de ${aa}`
    return aa === ab ? `de la Semana ${sa} a la ${sb} de ${aa}` : `de la Semana ${sa} de ${aa} a la Semana ${sb} de ${ab}`
  }
  if (a.clave === b.clave) return `de ${a.largo}`
  const [ma, aa] = a.largo.split(' de ')
  return aa === b.largo.split(' de ')[1] ? `de ${ma} a ${b.largo}` : `de ${a.largo} a ${b.largo}`
}

export const fechaDocumento = (c: ConfigTendencia, hoy: string) => `${c.lugar} a ${fechaLarga(c.fechaDocumento || hoy)}`

export function contenidoMaterial(a: AnalisisMaterial, c: ConfigTendencia, unidad: string, titulo?: string): ContenidoMaterial {
  const nombre = a.material.nombre
  const periodos = a.historico.map((f) => f.periodo)
  const rango = rangoTexto(periodos, a.unidad)
  const desde = periodos[0]?.inicio
  const hasta = periodos[periodos.length - 1]?.fin
  const contexto = c.contexto.trim() ? ` de ${c.contexto.trim()}` : ''
  const p = a.escenarios.promedio
  const u = a.unidad

  const historico = trozos(a.historico, 13).map<Bloque>((t) => ({
    etiquetas: t.map((f) => f.periodo.etiqueta),
    filas: [
      { nombre: `${unidad[0].toUpperCase()}${unidad.slice(1)} entregados`, valores: t.map((f) => miles(f.cantidad)) },
      { nombre: 'Solicitudes atendidas', valores: t.map((f) => miles(f.solicitudes)) },
    ],
  }))

  const filasProy = p.filas.slice(0, 52)
  const proyeccion = trozos(filasProy, 13).map<Bloque>((t) => ({
    etiquetas: t.map((f) => f.periodo.etiqueta),
    filas: [
      { nombre: `Existencia (${unidad})`, valores: t.map((f) => miles(f.existencia)), rojo: t.map((f) => f.existencia < 0) },
      { nombre: 'Consumo promedio*', valores: t.map((f) => miles(f.consumo)) },
    ],
  }))

  const conObjetivo = !!a.objetivo
  const escenarios = {
    encabezado: ['Escenario', `Consumo ${porUnidad(u)}`, 'Alcanza para', 'Se terminaría en', ...(conObjetivo ? [`Para ${a.objetivo!.etiqueta} ${a.objetivo!.clave.slice(0, 4)}`] : [])],
    filas: (['bajo', 'promedio', 'alto'] as Escenario[]).map((e) => {
      const r = a.escenarios[e]
      const fila = [`${NOMBRE_ESCENARIO[e]} (${AYUDA_ESCENARIO[e].toLowerCase()})`, `${miles(r.consumo)} ${unidad}`, coberturaTexto(r, u), r.agotamiento ? cuandoTexto(r.agotamiento, u).replace(/^la /, '') : 'No se agota']
      if (conObjetivo) fila.push(r.faltante! > 0 ? `Faltan ${miles(r.faltante!)}` : `Alcanza (sobran ${miles(r.sobrante!)})`)
      return fila
    }),
  }

  const tendencia =
    a.historico.length < 3
      ? `Con ${a.historico.length} ${unidadTexto(u, a.historico.length)} de datos todavía no se puede saber si el consumo sube o baja.`
      : Math.abs(a.pendiente) < Math.max(1, p.consumo * 0.05)
        ? `El consumo se ha mantenido estable durante el periodo analizado.`
        : a.pendiente > 0
          ? `El consumo va en aumento: en promedio sube ${miles(a.pendiente)} ${unidad} cada ${unidadTexto(u, 1)}; conviene tomar como referencia el escenario conservador.`
          : `El consumo va a la baja: en promedio baja ${miles(-a.pendiente)} ${unidad} cada ${unidadTexto(u, 1)}.`

  return {
    titulo: titulo ?? `Tendencia de Consumo de ${nombre}`,
    subtitulo: `Cálculo de tendencia conservadora de consumo de equipo de protección personal – ${nombre}`,
    intro: `Referente del consumo de ${nombre} durante el periodo${contexto} ${rango} (del ${fechaCorta(desde ?? '')} al ${fechaCorta(hasta ?? '')}), se obtuvieron los siguientes datos:`,
    historico,
    resumen: [
      ['Salidas', miles(a.total)],
      [`Personal que no recibió ${nombre.toLowerCase()} durante entrega de EPP`, miles(a.sinMaterial)],
      [`Solicitudes totales atendidas de EPP ${rango}`, miles(a.solicitudes)],
    ],
    existencias: [
      ['Almacén', miles(a.almacen)],
      ['Pedido', miles(a.pedido)],
      ['Existencias', miles(a.existencia)],
    ],
    indicadores: [
      ['Consumo promedio', `${miles(p.consumo)} ${unidad} ${porUnidad(u)}`],
      ['% de consumo promedio', `${a.pctConsumo}%`],
      [`% que no recibió ${nombre.toLowerCase()}`, `${a.pctSinMaterial}%`],
    ],
    escenarios,
    conclusion: conclusion(a, unidad),
    tendencia,
    proyeccion,
    proyeccionRecortada: p.filas.length > filasProy.length,
    tallas: a.porTalla.map((t) => [t.etiqueta, miles(t.cantidad), `${t.pct}%`]),
    fuente: `Fuente: Control EPP v${VERSION}. ${miles(a.conMaterial)} entregas con ${nombre.toLowerCase()} de ${miles(a.solicitudes)} registradas del ${fechaCorta(desde ?? '')} al ${fechaCorta(hasta ?? '')} (no cuenta entregas anuladas ni préstamos). Se pueden verificar en Historial filtrando por material y fechas.`,
    unidad,
  }
}

/** Resumen comparativo cuando hay varios materiales. */
export function filasComparativas(lista: { a: AnalisisMaterial; unidad: string }[]): { encabezado: string[]; filas: string[][] } {
  const objetivo = lista.find((x) => x.a.objetivo)?.a.objetivo
  return {
    encabezado: ['Material', 'Consumo promedio', 'Existencias', 'Alcanza (promedio)', 'Conservador', ...(objetivo ? [`Faltante para ${objetivo.etiqueta}`] : [])],
    filas: lista.map(({ a, unidad }) => {
      const p = a.escenarios.promedio
      const al = a.escenarios.alto
      const f = [
        a.material.nombre,
        `${miles(p.consumo)} ${unidad} ${porUnidad(a.unidad)}`,
        `${miles(a.existencia)} ${unidad}`,
        p.agotamiento ? `${coberturaTexto(p, a.unidad)} · ${p.agotamiento.etiqueta} ${p.agotamiento.clave.slice(0, 4)}` : 'No se agota',
        al.agotamiento ? `${al.agotamiento.etiqueta} ${al.agotamiento.clave.slice(0, 4)}` : 'No se agota',
      ]
      if (objetivo) f.push(p.faltante ? `${miles(p.faltante)} ${unidad}` : 'Alcanza')
      return f
    }),
  }
}

export const nombreArchivo = (titulo: string, hoy: string) => `${titulo.replace(/[\\/:*?"<>|]+/g, '').trim()} ${hoy}`
