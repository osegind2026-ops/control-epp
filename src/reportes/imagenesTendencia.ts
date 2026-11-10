// Imágenes de las gráficas de Tendencias (las mismas en pantalla, PDF y Word).
import { NOMBRE_ESCENARIO, miles, porUnidad, type AnalisisMaterial, type ComparacionPlan, type Escenario } from '../domain/tendencias'
import { escenarioPrincipal, escenariosDe, type ConfigTendencia } from '../state/tendencias'
import { graficaColumnas, graficaComparativa, graficaDona, graficaSeries, paleta, type PaletaGrafica } from './graficasTendencia'
import { rangoTexto } from './tendenciaDoc'

/** Imagen lista para usarse: PNG y proporción alto/ancho (para acomodarla en la hoja). */
export interface Img {
  src: string
  ratio: number
}
const img = (c: HTMLCanvasElement): Img => ({ src: c.toDataURL('image/png'), ratio: c.height / c.width })

/** Color de cada escenario en las gráficas comparativas. */
export function colorEscenario(e: Escenario, p: PaletaGrafica): string {
  const pal = paleta(p)
  return e === 'promedio' ? pal.principal : e === 'alto' ? '#C0392B' : pal.serie[3]
}
export const NOMBRE_CORTO: Record<Escenario, string> = { bajo: 'Bajo', promedio: 'Promedio', alto: 'Conservador' }

export interface ImagenesMaterial {
  historico: Img
  /** Una gráfica de proyección por escenario (si se pidieron por separado o hay uno solo). */
  proyeccion: Partial<Record<Escenario, Img>>
  /** Gráfica que compara la existencia proyectada de los escenarios elegidos. */
  comparada?: Img
  /** Dona de entregas por talla (análisis del material con varias tallas). */
  tallas?: Img
}

const etiquetasPeriodos = (claves: { etiqueta: string; clave: string }[]) => {
  const cruza = new Set(claves.map((p) => p.clave.slice(0, 4))).size > 1
  return claves.map((p, i) => (cruza && (p.etiqueta.endsWith(' 01') || i === 0) ? `${p.etiqueta} '${p.clave.slice(2, 4)}` : p.etiqueta))
}

export function imagenesMaterial(a: AnalisisMaterial, c: ConfigTendencia, unidad: string): ImagenesMaterial {
  const o = { estilo: c.estilo, paleta: c.paleta }
  const pal = paleta(c.paleta)
  const sel = escenariosDe(c)
  const principal = escenarioPrincipal(c)
  const vista = c.vistaEscenarios ?? 'comparativa'
  const separadas = sel.length === 1 || vista !== 'comparativa'
  const comparar = sel.length > 1 && vista !== 'separadas'

  const proyeccion: Partial<Record<Escenario, Img>> = {}
  if (separadas)
    for (const e of sel) {
      const r = a.escenarios[e]
      const resaltar = new Map<number, string>()
      if (a.objetivo) {
        const i = r.filas.findIndex((f) => f.periodo.clave === a.objetivo!.clave)
        if (i >= 0) resaltar.set(i, pal.acento)
      }
      proyeccion[e] = img(
        graficaColumnas(
          {
            titulo: sel.length > 1 ? `${NOMBRE_ESCENARIO[e]} – ${a.nombre}` : `Tendencia de Consumo de ${a.nombre}`,
            subtitulo: `Existencia proyectada con ${miles(r.consumo)} ${unidad} ${porUnidad(a.unidad)}${a.objetivo ? ` · resaltado: ${a.objetivo.etiqueta} (fecha objetivo)` : ''}`,
            etiquetas: etiquetasPeriodos(r.filas.map((f) => f.periodo)),
            valores: r.filas.map((f) => f.existencia),
            porcentaje: { nombre: '% consumido acumulado', valores: r.filas.map((f) => f.acumulado) },
            resaltar,
            nombreSerie: `Existencia al inicio (${unidad})`,
          },
          { ...o, alto: sel.length > 1 ? 680 : 760 },
        ),
      )
    }

  let comparada: Img | undefined
  if (comparar) {
    // Se muestran los periodos hasta que se agota el escenario que más dura (máximo 60)
    const largo = Math.min(60, Math.max(...sel.map((e) => a.escenarios[e].filas.length)))
    const base = sel.map((e) => a.escenarios[e].filas).sort((x, y) => y.length - x.length)[0].slice(0, largo)
    comparada = img(
      graficaSeries(
        {
          titulo: `Escenarios de consumo – ${a.nombre}`,
          subtitulo: `Existencia proyectada (${unidad}) con: ${sel.map((e) => `${NOMBRE_CORTO[e].toLowerCase()} ${miles(a.escenarios[e].consumo)}`).join(' · ')} ${porUnidad(a.unidad)}`,
          etiquetas: etiquetasPeriodos(base.map((f) => f.periodo)),
          lineas: true,
          series: sel.map((e) => ({
            nombre: `${NOMBRE_CORTO[e]} (${miles(a.escenarios[e].consumo)} ${porUnidad(a.unidad)})`,
            valores: base.map((_, i) => a.escenarios[e].filas[i]?.existencia ?? null),
            color: colorEscenario(e, c.paleta),
            punteada: e !== principal,
          })),
        },
        { ...o, estilo: o.estilo === 'lineas' ? 'lineas' : 'area', alto: 720 },
      ),
    )
  }

  const historico = img(
    graficaColumnas(
      {
        titulo: `Consumo registrado de ${a.nombre}`,
        subtitulo: rangoTexto(a.historico.map((f) => f.periodo), a.unidad).replace(/^de (la )?/, 'Periodo analizado: '),
        etiquetas: a.historico.map((f) => f.periodo.etiqueta),
        valores: a.historico.map((f) => f.cantidad),
        referencia: { nombre: NOMBRE_ESCENARIO[principal], valor: a.escenarios[principal].consumo },
        nombreSerie: `${unidad[0].toUpperCase()}${unidad.slice(1)} entregados`,
      },
      { ...o, alto: 700 },
    ),
  )
  const tallas =
    a.porTalla.length > 1 ? img(graficaDona(a.porTalla.map((t) => ({ etiqueta: t.etiqueta, valor: t.cantidad })), { ...o, titulo: 'Entregas por talla', alto: 700 })) : undefined
  return { historico, proyeccion, comparada, tallas }
}

/** Comparativa entre materiales o entre tallas: hasta cuándo alcanza cada uno. */
export function imagenCobertura(lista: { a: AnalisisMaterial; nombre?: string }[], c: ConfigTendencia, titulo: string, subtitulo: string): Img {
  const u = lista[0]?.a.unidad ?? 'semana'
  const e = escenarioPrincipal(c)
  return img(
    graficaComparativa(
      lista.map(({ a, nombre }) => ({
        nombre: nombre ?? a.nombre,
        promedio: a.escenarios[e].cobertura,
        alto: a.escenarios.alto.cobertura,
        bajo: a.escenarios.bajo.cobertura,
        texto: a.escenarios[e].agotamiento ? `hasta ${a.escenarios[e].agotamiento!.etiqueta} ${a.escenarios[e].agotamiento!.clave.slice(0, 4)}` : 'no se agota',
      })),
      u === 'semana' ? 'Semanas' : 'Meses',
      { estilo: c.estilo, paleta: c.paleta, titulo, subtitulo, nota: `Barra: ${NOMBRE_ESCENARIO[e].toLowerCase()} · Línea delgada: del escenario conservador al bajo` },
    ),
  )
}

/** Consumo de cada talla periodo por periodo (columnas agrupadas o líneas). */
export function imagenConsumoTallas(tallas: AnalisisMaterial[], nombreMaterial: string, unidad: string, c: ConfigTendencia): Img {
  const pal = paleta(c.paleta)
  const base = tallas[0].historico
  return img(
    graficaSeries(
      {
        titulo: `Consumo por talla – ${nombreMaterial}`,
        subtitulo: `${unidad[0].toUpperCase()}${unidad.slice(1)} entregados ${porUnidad(tallas[0].unidad)}`,
        etiquetas: base.map((f) => f.periodo.etiqueta),
        series: tallas.map((t, i) => ({ nombre: t.talla?.etiqueta ?? t.nombre, valores: t.historico.map((f) => f.cantidad), color: pal.serie[i % pal.serie.length] })),
      },
      { estilo: c.estilo, paleta: c.paleta, alto: 720 },
    ),
  )
}

export interface ImagenesPlan {
  consumo: Img
  existencia: Img
}

export function imagenesPlan(cp: ComparacionPlan, nombre: string, unidad: string, c: ConfigTendencia): ImagenesPlan {
  const o = { estilo: c.estilo, paleta: c.paleta }
  const pal = paleta(c.paleta)
  const etiquetas = cp.filas.map((f) => (f.enCurso ? `${f.periodo.etiqueta}*` : f.periodo.etiqueta))
  const consumo = graficaSeries(
    {
      titulo: `Planeado vs Real – ${nombre}`,
      subtitulo: `Consumo ${porUnidad(cp.plan.unidad)} (${unidad})`,
      etiquetas,
      series: [
        { nombre: 'Planeado', valores: cp.filas.map((f) => f.planeado), color: pal.acento, punteada: true },
        { nombre: 'Real registrado', valores: cp.filas.map((f) => f.real), color: pal.principal },
      ],
    },
    { ...o, alto: 700 },
  )
  const existencia = graficaSeries(
    {
      titulo: `Existencia planeada vs real – ${nombre}`,
      subtitulo: `Al inicio de cada periodo (${unidad}); la real incluye las entradas al almacén`,
      etiquetas,
      lineas: true,
      series: [
        { nombre: 'Existencia planeada', valores: cp.filas.map((f) => f.existPlaneada), color: pal.acento, punteada: true },
        { nombre: 'Existencia real', valores: cp.filas.map((f) => f.existReal), color: pal.principal },
      ],
    },
    { ...o, estilo: o.estilo === 'lineas' ? 'lineas' : 'area', alto: 700 },
  )
  return { consumo: img(consumo), existencia: img(existencia) }
}
