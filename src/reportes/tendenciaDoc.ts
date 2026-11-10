// Contenido del documento de Tendencias como una lista de bloques (títulos, párrafos, tablas,
// gráficas). El PDF los acomoda en hojas carta y el Word los escribe en orden, así los dos
// dicen exactamente lo mismo.
import {
  AYUDA_ESCENARIO, NOMBRE_ESCENARIO, coberturaTexto, conclusionEscenario, conclusionPlan, cuandoTexto, fechaLarga, miles, nombreEnTexto, notaDisponibilidad, porUnidad, sinFin, unidadTexto,
  type AnalisisMaterial, type ComparacionPlan, type Escenario, type Periodo, type UnidadPeriodo,
} from '../domain/tendencias'
import { escenarioPrincipal, escenariosDe, sujetosDe, tituloDe, type ConfigTendencia, type GrupoTendencia } from '../state/tendencias'
import * as S from '../state/store'
import { VERSION } from '../version'
import { HORIZONTE_TALLAS, NOMBRE_CORTO, imagenConsumoTallas, imagenCobertura, imagenExistenciaTallas, imagenTallasExistencia, imagenesMaterial, type Img, type ImagenesMaterial, type ImagenesPlan } from './imagenesTendencia'

export interface Bloque {
  etiquetas: string[]
  filas: { nombre: string; valores: string[]; rojo?: boolean[] }[]
}

export type EstiloParrafo = 'normal' | 'conclusion' | 'chico' | 'nota' | 'fuente'
export type Item =
  | { t: 'titulo'; titulo: string; subtitulo: string; fecha: string }
  | { t: 'parrafo'; texto: string; estilo?: EstiloParrafo }
  | { t: 'bloque'; bloque: Bloque }
  | { t: 'cajas'; grupos: { filas: [string, string][]; destacar?: number }[] }
  | { t: 'tabla'; encabezado: string[]; filas: string[][]; destacar?: number[] }
  | { t: 'imagen'; img: Img; ancho?: number }

const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`
const mayus = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`
const per = (p: Periodo) => `${p.etiqueta} ${p.clave.slice(0, 4)}`

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
export const nombreArchivo = (titulo: string, hoy: string) => `${titulo.replace(/[\\/:*?"<>|]+/g, '').trim()} ${hoy}`

// ---------------- Análisis de un material o una talla ----------------
export function tablaEscenarios(a: AnalisisMaterial, sel: Escenario[], unidad: string) {
  const u = a.unidad
  return {
    encabezado: ['Escenario', `Consumo ${porUnidad(u)}`, 'Alcanza para', 'Se terminaría en', ...(a.objetivo ? [`Para ${per(a.objetivo)}`] : [])],
    filas: sel.map((e) => {
      const r = a.escenarios[e]
      const f = [`${NOMBRE_ESCENARIO[e]} (${AYUDA_ESCENARIO[e].toLowerCase()})`, r.sinDato ? 'Sin dato' : `${miles(r.consumo)} ${unidad}`, coberturaTexto(r, u), r.agotamiento ? cuandoTexto(r.agotamiento, u).replace(/^la /, '') : sinFin(r)]
      if (a.objetivo) f.push(r.sinDato ? 'Sin dato' : r.faltante! > 0 ? `Faltan ${miles(r.faltante!)}` : `Alcanza (sobran ${miles(r.sobrante!)})`)
      return f
    }),
  }
}

export function textoTendencia(a: AnalisisMaterial, unidad: string): string {
  const u = a.unidad
  const p = a.escenarios.promedio
  if (a.demandaNoMedida) return 'Sin existencia en el periodo no se puede saber si el consumo sube o baja.'
  if (a.periodosMedidos < 3) return `Con ${a.historico.length} ${unidadTexto(u, a.historico.length)} de datos todavía no se puede saber si el consumo sube o baja.`
  if (Math.abs(a.pendiente) < Math.max(1, p.consumo * 0.05)) return 'El consumo se ha mantenido estable durante el periodo analizado.'
  return a.pendiente > 0
    ? `El consumo va en aumento: en promedio sube ${miles(a.pendiente)} ${unidad} cada ${unidadTexto(u, 1)}; conviene tomar como referencia el escenario conservador.`
    : `El consumo va a la baja: en promedio baja ${miles(-a.pendiente)} ${unidad} cada ${unidadTexto(u, 1)}.`
}

function itemsSujeto(a: AnalisisMaterial, img: ImagenesMaterial, c: ConfigTendencia, unidad: string, fecha: string, titulo?: string): Item[] {
  const sel = escenariosDe(c)
  const principal = escenarioPrincipal(c)
  const nombre = a.nombre
  const periodos = a.historico.map((f) => f.periodo)
  const rango = rangoTexto(periodos, a.unidad)
  const desde = periodos[0]?.inicio ?? c.desde
  const hasta = periodos[periodos.length - 1]?.fin ?? c.hasta
  const contexto = c.contexto.trim() ? ` de ${c.contexto.trim()}` : ''
  const Un = mayus(unidad)
  const enTexto = nombreEnTexto(nombre)
  const excluir = c.excluirSinExistencia !== false
  const conKardex = a.historico.some((f) => f.existInicio != null)
  const conFaltas = a.historico.some((f) => (f.diasSinExistencia ?? 0) > 0)
  const it: Item[] = [
    { t: 'titulo', titulo: titulo ?? `Tendencia de Consumo de ${nombre}`, subtitulo: `Cálculo de tendencia conservadora de consumo de equipo de protección personal – ${nombre}`, fecha },
    { t: 'parrafo', texto: `Referente del consumo de ${nombre} durante el periodo${contexto} ${rango} (del ${fechaCorta(desde)} al ${fechaCorta(hasta)}), se obtuvieron los siguientes datos:` },
  ]
  for (const t of trozos(a.historico, 13))
    it.push({
      t: 'bloque',
      bloque: {
        etiquetas: t.map((f) => f.periodo.etiqueta),
        filas: [
          { nombre: `${Un} entregados`, valores: t.map((f) => miles(f.cantidad)), rojo: t.map((f) => !!f.sinExistencia && excluir) },
          { nombre: 'Solicitudes atendidas', valores: t.map((f) => miles(f.solicitudes)) },
          ...(conKardex ? [{ nombre: 'Existencia al inicio', valores: t.map((f) => (f.existInicio == null ? '—' : miles(f.existInicio))) }] : []),
          ...(conFaltas ? [{ nombre: 'Días sin existencia', valores: t.map((f) => (f.diasSinExistencia ? String(f.diasSinExistencia) : '—')), rojo: t.map((f) => !!f.sinExistencia) }] : []),
        ],
      },
    })
  const aviso = notaDisponibilidad(a)
  if (conFaltas && excluir) it.push({ t: 'parrafo', estilo: 'chico', texto: `En rojo: ${unidadTexto(a.unidad)} en que el almacén estuvo sin existencia al menos la cuarta parte de los días (según el kardex).` })
  if (aviso) it.push({ t: 'parrafo', texto: aviso })
  const r0 = a.escenarios[principal]
  it.push({
    t: 'cajas',
    grupos: [
      {
        filas: [
          ['Salidas', miles(a.total)],
          [`Personal que no recibió ${a.talla ? 'esta talla' : enTexto} durante entrega de EPP`, miles(a.sinMaterial)],
          [`Solicitudes totales atendidas de EPP ${rango}`, miles(a.solicitudes)],
        ],
        destacar: 0,
      },
      {
        filas: [
          ['Almacén', miles(a.almacen)],
          ['Pedido', miles(a.pedido)],
          ['Existencias', miles(a.existencia)],
        ],
        destacar: 2,
      },
      {
        filas: [
          [NOMBRE_ESCENARIO[principal], r0.sinDato ? 'Sin dato' : `${miles(r0.consumo)} ${unidad} ${porUnidad(a.unidad)}`],
          ['% de consumo', r0.sinDato ? 'Sin dato' : `${a.existencia ? Math.round((r0.consumo / a.existencia) * 100) : 0}%`],
          [`% que no recibió ${a.talla ? 'esta talla' : enTexto}`, `${a.pctSinMaterial}%`],
        ],
        destacar: 0,
      },
    ],
  })
  const te = tablaEscenarios(a, sel, unidad)
  it.push({ t: 'tabla', encabezado: te.encabezado, filas: te.filas, destacar: [sel.indexOf(principal)] })
  it.push({ t: 'parrafo', texto: conclusionEscenario(a, principal, unidad), estilo: 'conclusion' })
  if (!a.demandaNoMedida) for (const e of sel) if (e !== principal) it.push({ t: 'parrafo', texto: conclusionEscenario(a, e, unidad) })
  it.push({ t: 'parrafo', texto: textoTendencia(a, unidad), estilo: 'chico' })
  it.push({ t: 'imagen', img: img.historico })
  if (img.comparada) it.push({ t: 'imagen', img: img.comparada })
  for (const e of sel) if (img.proyeccion[e]) it.push({ t: 'imagen', img: img.proyeccion[e]! })

  // Tabla de proyección: una fila de existencia por escenario elegido (si hay con qué proyectar)
  if (!a.demandaNoMedida) itemsProyeccion(it, a, sel, unidad, r0.consumo)
  it.push({ t: 'parrafo', texto: c.nota, estilo: 'nota' })
  if (a.porTalla.length > 1) {
    it.push({ t: 'tabla', encabezado: ['Talla', 'Entregados', '%'], filas: a.porTalla.map((t) => [t.etiqueta, miles(t.cantidad), `${t.pct}%`]) })
    if (img.tallas) it.push({ t: 'imagen', img: img.tallas, ancho: 0.62 })
  }
  it.push({
    t: 'parrafo',
    estilo: 'fuente',
    texto: `Fuente: Control EPP v${VERSION}. ${miles(a.conMaterial)} entregas con ${enTexto} de ${miles(a.solicitudes)} registradas del ${fechaCorta(desde)} al ${fechaCorta(hasta)} (no cuenta entregas anuladas ni préstamos). Se pueden verificar en Historial filtrando por material y fechas.${conKardex ? ' La existencia de cada periodo sale del kardex del almacén.' : ''}`,
  })
  return it
}

function itemsProyeccion(it: Item[], a: AnalisisMaterial, sel: Escenario[], unidad: string, consumo0: number) {
  const r0 = { consumo: consumo0 }
  const largo = Math.min(52, Math.max(...sel.map((e) => a.escenarios[e].filas.length)))
  const base = sel.map((e) => a.escenarios[e].filas).sort((x, y) => y.length - x.length)[0].slice(0, largo)
  for (const [k, t] of trozos(base, 13).entries())
    it.push({
      t: 'bloque',
      bloque: {
        etiquetas: t.map((f) => f.periodo.etiqueta),
        filas: sel.map((e) => {
          const filas = a.escenarios[e].filas
          const vals = t.map((_, j) => filas[k * 13 + j])
          return {
            nombre: sel.length > 1 ? `${NOMBRE_CORTO[e]} (${miles(a.escenarios[e].consumo)})*` : `Existencia (${unidad})`,
            valores: vals.map((f) => (f ? miles(f.existencia) : '')),
            rojo: vals.map((f) => !!f && f.existencia < 0),
          }
        }),
      },
    })
  if (sel.length === 1) it.push({ t: 'parrafo', texto: `Existencia al inicio de cada ${unidadTexto(a.unidad, 1)} con un consumo de ${miles(r0.consumo)} ${unidad} ${porUnidad(a.unidad)}*.`, estilo: 'chico' })
  else it.push({ t: 'parrafo', texto: `Existencia al inicio de cada ${unidadTexto(a.unidad, 1)} en cada escenario; entre paréntesis, el consumo ${porUnidad(a.unidad)}*.`, estilo: 'chico' })
  if (base.length < Math.max(...sel.map((e) => a.escenarios[e].filas.length))) it.push({ t: 'parrafo', texto: 'La tabla muestra el primer año; la gráfica y el cálculo consideran todo el periodo.', estilo: 'chico' })
}

// ---------------- Comparativa por talla ----------------
/** Sugerencia de compra de una talla. */
export function sugerenciaTalla(a: AnalisisMaterial, e: Escenario): string {
  const r = a.escenarios[e]
  if (r.sinDato) return a.existencia > 0 ? 'Sin dato: vigilar' : 'Sin existencia: revisar'
  if (a.objetivo) return r.faltante! > 0 ? `Comprar ${miles(r.faltante!)}` : 'No es necesario'
  if (!isFinite(r.cobertura)) return 'Sin consumo: no comprar'
  const [ya, pronto] = a.unidad === 'semana' ? [4, 8] : [1, 2]
  if (r.cobertura < ya) return 'Comprar ya'
  if (r.cobertura < pronto) return 'Comprar pronto'
  return 'Suficiente'
}

export function tablaTallas(tallas: AnalisisMaterial[], c: ConfigTendencia, unidad: string) {
  const e = escenarioPrincipal(c)
  const total = tallas.reduce((s, t) => s + t.total, 0) || 1
  const obj = tallas[0]?.objetivo
  return {
    encabezado: ['Talla', `Consumo ${porUnidad(tallas[0]?.unidad ?? 'semana')}`, '% del consumo', 'Existencias', 'Se terminaría en', ...(obj ? [`Para ${per(obj)}`] : []), 'Sugerencia'],
    filas: tallas.map((t) => {
      const r = t.escenarios[e]
      const f = [t.talla?.etiqueta.replace(/^Talla /, '') ?? t.nombre, r.sinDato ? 'Sin dato' : `${miles(r.consumo)} ${unidad}`, `${Math.round((t.total / total) * 100)}%`, miles(t.existencia), r.agotamiento ? per(r.agotamiento) : sinFin(r)]
      if (obj) f.push(r.sinDato ? 'Sin dato' : r.faltante! > 0 ? `Faltan ${miles(r.faltante!)}` : 'Alcanza')
      f.push(sugerenciaTalla(t, e))
      return f
    }),
  }
}

export function conclusionTallas(tallas: AnalisisMaterial[], c: ConfigTendencia, unidad: string): string {
  const e = escenarioPrincipal(c)
  const total = tallas.reduce((s, t) => s + t.total, 0)
  if (!total) return 'No hubo entregas de estas tallas en el periodo analizado.'
  const et = (t: AnalisisMaterial) => t.talla?.etiqueta.replace(/^Talla /, '') ?? t.nombre
  const orden = [...tallas].sort((x, y) => y.total - x.total)
  const mas = orden.slice(0, 2).map((t) => `${et(t)} (${Math.round((t.total / total) * 100)}%)`)
  let txt = `Las tallas de mayor consumo son ${mas.join(' y ')}.`
  const agot = tallas.filter((t) => t.escenarios[e].agotamiento).sort((x, y) => (x.escenarios[e].agotamiento!.clave < y.escenarios[e].agotamiento!.clave ? -1 : 1))
  if (agot.length) txt += ` La primera en terminarse sería la talla ${et(agot[0])} (${cuandoTexto(agot[0].escenarios[e].agotamiento!, agot[0].unidad).replace(/^la /, '')}).`
  const comprar = tallas.filter((t) => /^Comprar/.test(sugerenciaTalla(t, e)))
  const sinDato = tallas.filter((t) => t.escenarios[e].sinDato)
  const no = tallas.filter((t) => !/^Comprar/.test(sugerenciaTalla(t, e)) && !t.escenarios[e].sinDato)
  if (tallas[0].objetivo) {
    if (comprar.length) txt += ` Para llegar a ${cuandoTexto(tallas[0].objetivo, tallas[0].unidad)} conviene comprar: ${comprar.map((t) => `${et(t)} ${miles(t.escenarios[e].faltante!)}`).join(', ')} ${unidad}.`
    if (no.length) txt += ` ${no.length === 1 ? 'La talla' : 'Las tallas'} ${no.map(et).join(', ')} no ${no.length === 1 ? 'requiere' : 'requieren'} compra para esa fecha.`
  } else {
    if (comprar.length) txt += ` Conviene comprar primero: ${comprar.map(et).join(', ')}.`
    if (no.length) txt += ` ${no.length === 1 ? 'La talla' : 'Las tallas'} ${no.map(et).join(', ')} ${no.length === 1 ? 'tiene' : 'tienen'} existencia suficiente por ahora.`
  }
  // Tallas con poco movimiento: poca demanda y existencia de sobra
  const h = HORIZONTE_TALLAS[tallas[0].unidad]
  const poco = no.filter((t) => t.total / total < 0.1 && t.existencia > 0 && t.escenarios[e].cobertura >= h * 2)
  if (poco.length) txt += ` ${poco.length === 1 ? 'La talla' : 'Las tallas'} ${poco.map((t) => `${et(t)} (${Math.round((t.total / total) * 100)}% del consumo)`).join(', ')} ${poco.length === 1 ? 'tiene' : 'tienen'} poco movimiento y existencia de sobra: la compra puede enfocarse en las tallas de mayor demanda.`
  if (sinDato.length) txt += ` ${sinDato.length === 1 ? 'La talla' : 'Las tallas'} ${sinDato.map(et).join(', ')} no ${sinDato.length === 1 ? 'tuvo' : 'tuvieron'} existencia en el periodo: no se entregó porque no había, no porque no se necesite; su consumo no se puede estimar con estos datos.`
  const parciales = tallas.filter((t) => !t.escenarios[e].sinDato && t.periodosSinExistencia)
  if (parciales.length) txt += ` En ${parciales.map((t) => `la talla ${et(t)} (${t.periodosSinExistencia} ${unidadTexto(t.unidad, t.periodosSinExistencia)})`).join(', ')} no se contaron las ${unidadTexto(tallas[0].unidad)} sin existencia.`
  return txt
}

function itemsTallas(g: GrupoTendencia, c: ConfigTendencia, fecha: string): Item[] {
  const nombre = S.materialesPorId.value.get(g.materialId)?.nombre ?? g.tallas[0].material.nombre
  const t = tablaTallas(g.tallas, c, g.unidad)
  const e = escenarioPrincipal(c)
  const umbral = g.tallas[0].unidad === 'semana' ? 'menos de 4 semanas: «Comprar ya»; de 4 a 8: «Comprar pronto»' : 'menos de 1 mes: «Comprar ya»; de 1 a 2: «Comprar pronto»'
  return [
    { t: 'titulo', titulo: `Consumo por talla – ${nombre}`, subtitulo: 'Análisis de cada talla para decidir cuáles comprar', fecha },
    {
      t: 'parrafo',
      texto: `Se analizaron por separado las tallas ${g.tallas.map((x) => x.talla?.etiqueta.replace(/^Talla /, '')).join(', ')} con el consumo registrado ${rangoTexto(g.tallas[0].historico.map((f) => f.periodo), g.tallas[0].unidad)}; las proyecciones usan el ${NOMBRE_ESCENARIO[e].toLowerCase()} de cada talla y su propia existencia.`,
    },
    { t: 'imagen', img: imagenTallasExistencia(g.tallas, nombre, g.unidad, c) },
    { t: 'imagen', img: imagenConsumoTallas(g.tallas, nombre, g.unidad, c) },
    ...(() => {
      const ex = imagenExistenciaTallas(g.tallas, nombre, g.unidad, c)
      return ex ? [{ t: 'imagen', img: ex } as Item] : []
    })(),
    { t: 'imagen', img: imagenCobertura(g.tallas.map((a) => ({ a, nombre: a.talla?.etiqueta ?? a.nombre })), c, `¿Hasta cuándo alcanza cada talla? – ${nombre}`, 'Comparativa entre tallas con el consumo del periodo analizado') },
    { t: 'tabla', encabezado: t.encabezado, filas: t.filas },
    { t: 'parrafo', texto: conclusionTallas(g.tallas, c, g.unidad), estilo: 'conclusion' },
    {
      t: 'parrafo',
      estilo: 'nota',
      texto: g.tallas[0].objetivo
        ? `*Sugerencia: lo que falta de cada talla para llegar a la fecha objetivo con el ${NOMBRE_ESCENARIO[e].toLowerCase()}.`
        : `*Sugerencia según lo que alcanza la existencia de cada talla: ${umbral}. Indique «Llegar hasta» para calcular cuántas piezas comprar de cada talla.`,
    },
  ]
}

// ---------------- Planeado vs real ----------------
export function filasPlan(cp: ComparacionPlan, unidad: string): Bloque['filas'] {
  const signo = (n: number) => (n > 0 ? `+${miles(n)}` : miles(n))
  const Un = mayus(unidad)
  const f = cp.filas
  return [
    { nombre: `${Un} planeados`, valores: f.map((x) => miles(x.planeado)) },
    { nombre: `${Un} reales`, valores: f.map((x) => miles(x.real)) },
    { nombre: 'Diferencia', valores: f.map((x) => signo(x.diferencia)), rojo: f.map((x) => x.diferencia > 0) },
    { nombre: 'Existencia planeada', valores: f.map((x) => miles(x.existPlaneada)), rojo: f.map((x) => x.existPlaneada < 0) },
    { nombre: 'Existencia real', valores: f.map((x) => miles(x.existReal)) },
    { nombre: 'Entradas al almacén', valores: f.map((x) => (x.entradas ? miles(x.entradas) : '—')) },
  ]
}

export function resumenPlan(cp: ComparacionPlan, unidad: string): { resumen: [string, string][]; fechas: [string, string][] } {
  const u = cp.plan.unidad
  const dif = cp.totalReal - cp.totalPlaneado
  return {
    resumen: [
      [`Planeado (${cp.completos} ${unidadTexto(u, cp.completos)} completas)`, `${miles(cp.totalPlaneado)} ${unidad}`],
      ['Real registrado', `${miles(cp.totalReal)} ${unidad}`],
      ['Diferencia', `${dif > 0 ? '+' : ''}${miles(dif)} (${cp.desviacionPct > 0 ? '+' : ''}${cp.desviacionPct}%)`],
      ['Consumo real promedio', `${miles(cp.promedioReal)} ${porUnidad(u)}`],
    ],
    fechas: [
      ['Según el plan alcanzaba hasta', cp.agotamientoPlan ? cuandoTexto(cp.agotamientoPlan, u).replace(/^la /, '') : 'No se agotaba'],
      ['Al ritmo real alcanzaría hasta', cp.completos ? (cp.agotamientoReal ? cuandoTexto(cp.agotamientoReal, u).replace(/^la /, '') : 'No se agota') : 'Sin datos aún'],
      ['Existencia real hoy', `${miles(cp.existenciaHoy)} ${unidad}`],
    ],
  }
}

export const notaPlan = (u: UnidadPeriodo) =>
  `*${mayus(unidadTexto(u, 1))} en curso: todavía no termina y no se cuenta en los totales. La existencia real incluye las entradas al almacén (pedidos que llegaron), por eso puede subir aunque haya consumo.`

function itemsPlan(cp: ComparacionPlan, img: ImagenesPlan, nombre: string, unidad: string, fecha: string): Item[] {
  const u = cp.plan.unidad
  const origen = cp.plan.origen === 'manual' ? 'capturado a mano' : 'fijado con la proyección de la app'
  const { resumen, fechas } = resumenPlan(cp, unidad)
  const it: Item[] = [
    { t: 'titulo', titulo: `Planeado vs Real – ${nombre}`, subtitulo: 'Comparación de la tendencia planeada contra el consumo real registrado', fecha },
    {
      t: 'parrafo',
      texto: `Comparación entre el plan ${origen} el ${fechaLarga(cp.plan.creado)} (${miles(cp.plan.consumo)} ${unidad} ${porUnidad(u)} a partir de ${cp.inicio.largo.startsWith('Semana') ? 'la ' : ''}${cp.inicio.largo}, con ${miles(cp.plan.existenciaInicial)} ${unidad} en existencia) y lo registrado realmente en las entregas.`,
    },
    { t: 'cajas', grupos: [{ filas: resumen, destacar: 2 }, { filas: fechas, destacar: 1 }] },
    { t: 'parrafo', texto: conclusionPlan(cp, nombre, unidad), estilo: 'conclusion' },
    { t: 'imagen', img: img.consumo },
    { t: 'imagen', img: img.existencia },
  ]
  const filas = filasPlan(cp, unidad)
  for (const [k, t] of trozos(cp.filas, 12).entries())
    it.push({
      t: 'bloque',
      bloque: {
        etiquetas: t.map((f) => (f.enCurso ? `${f.periodo.etiqueta}*` : f.periodo.etiqueta)),
        filas: filas.map((f) => ({ nombre: f.nombre, valores: f.valores.slice(k * 12, k * 12 + 12), rojo: f.rojo?.slice(k * 12, k * 12 + 12) })),
      },
    })
  it.push({ t: 'parrafo', texto: notaPlan(u), estilo: 'nota' })
  return it
}

// ---------------- Documento completo ----------------
export interface ImagenesPantalla {
  sujetos: Map<string, ImagenesMaterial>
  planes: Map<string, ImagenesPlan>
}

export function construirDocumento(c: ConfigTendencia, grupos: GrupoTendencia[], planes: Map<string, ComparacionPlan>, imgs: ImagenesPantalla, hoy: string): { titulo: string; items: Item[] } {
  const fecha = fechaDocumento(c, hoy)
  const titulo = tituloDe(c)
  const items: Item[] = []
  const principal = escenarioPrincipal(c)
  // Comparativa entre materiales (cuando hay más de uno)
  if (grupos.length > 1) {
    const lista = grupos.flatMap((g) => (g.juntas ? [{ a: g.juntas, unidad: g.unidad }] : g.tallas.map((a) => ({ a, unidad: g.unidad }))))
    const obj = lista.find((x) => x.a.objetivo)?.a.objetivo
    items.push(
      { t: 'titulo', titulo, subtitulo: 'Cálculo de tendencia conservadora de consumo de equipo de protección personal – comparativa', fecha },
      {
        t: 'parrafo',
        texto: `Comparativa de ${grupos.length} materiales con el consumo registrado ${rangoTexto(lista[0].a.historico.map((f) => f.periodo), c.unidad)}${c.contexto.trim() ? `, durante el periodo de ${c.contexto.trim()}` : ''}. Cada barra indica cuántas ${unidadTexto(c.unidad)} alcanzan las existencias con el ${NOMBRE_ESCENARIO[principal].toLowerCase()}; la línea marca el rango entre el escenario conservador y el bajo.`,
      },
      { t: 'imagen', img: imagenCobertura(lista, c, '¿Hasta cuándo alcanzan las existencias?', 'Comparativa entre materiales con el consumo del periodo analizado') },
      {
        t: 'tabla',
        encabezado: ['Material', NOMBRE_ESCENARIO[principal], 'Existencias', 'Alcanza para', 'Se terminaría en', ...(obj ? [`Faltante para ${per(obj)}`] : [])],
        filas: lista.map(({ a, unidad }) => {
          const r = a.escenarios[principal]
          const f = [a.nombre, `${miles(r.consumo)} ${unidad} ${porUnidad(a.unidad)}`, `${miles(a.existencia)} ${unidad}`, coberturaTexto(r, a.unidad), r.agotamiento ? per(r.agotamiento) : sinFin(r)]
          if (obj) f.push(r.faltante ? `${miles(r.faltante)} ${unidad}` : 'Alcanza')
          return f
        }),
      },
      { t: 'parrafo', texto: c.nota, estilo: 'nota' },
    )
  }
  for (const g of grupos) {
    const conPlan = (a: AnalisisMaterial) => {
      const cp = planes.get(a.clave)
      const ip = imgs.planes.get(a.clave)
      if (cp && ip && cp.filas.length) items.push(...itemsPlan(cp, ip, a.nombre, g.unidad, fecha))
    }
    if (g.juntas) {
      items.push(...itemsSujeto(g.juntas, imgs.sujetos.get(g.juntas.clave) ?? imagenesMaterial(g.juntas, c, g.unidad), c, g.unidad, fecha, grupos.length === 1 ? titulo : undefined))
      conPlan(g.juntas)
    }
    if (g.tallas.length > 1) items.push(...itemsTallas(g, c, fecha))
    for (const a of g.tallas) {
      items.push(...itemsSujeto(a, imgs.sujetos.get(a.clave) ?? imagenesMaterial(a, c, g.unidad), c, g.unidad, fecha))
      conPlan(a)
    }
  }
  return { titulo, items }
}

export { sujetosDe }
