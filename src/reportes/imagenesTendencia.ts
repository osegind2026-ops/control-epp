// Imágenes de las gráficas de un análisis de Tendencias (las mismas en pantalla, PDF y Word).
import { miles, porUnidad, type AnalisisMaterial, type ComparacionPlan } from '../domain/tendencias'
import type { ConfigTendencia } from '../state/tendencias'
import { graficaColumnas, graficaComparativa, graficaDona, graficaSeries, paleta } from './graficasTendencia'
import { rangoTexto } from './tendenciaDoc'

export interface ImagenesMaterial {
  proyeccion: string
  historico: string
  tallas?: string
}

export function imagenesMaterial(a: AnalisisMaterial, c: ConfigTendencia, unidad: string): ImagenesMaterial {
  const o = { estilo: c.estilo, paleta: c.paleta }
  const p = a.escenarios.promedio
  const pal = paleta(c.paleta)
  const resaltar = new Map<number, string>()
  if (a.objetivo) {
    const i = p.filas.findIndex((f) => f.periodo.clave === a.objetivo!.clave)
    if (i >= 0) resaltar.set(i, pal.acento)
  }
  const cruzaAnio = new Set(p.filas.map((f) => f.periodo.clave.slice(0, 4))).size > 1
  const proyeccion = graficaColumnas(
    {
      titulo: `Tendencia de Consumo de ${a.material.nombre}`,
      subtitulo: `Existencia proyectada con el consumo promedio de ${miles(p.consumo)} ${unidad} ${porUnidad(a.unidad)}${a.objetivo ? ` · resaltado: ${a.objetivo.etiqueta} (fecha objetivo)` : ''}`,
      etiquetas: p.filas.map((f) => (cruzaAnio && (f.periodo.etiqueta.endsWith(' 01') || f === p.filas[0]) ? `${f.periodo.etiqueta} '${f.periodo.clave.slice(2, 4)}` : f.periodo.etiqueta)),
      valores: p.filas.map((f) => f.existencia),
      porcentaje: { nombre: '% consumido acumulado', valores: p.filas.map((f) => f.acumulado) },
      resaltar,
      nombreSerie: `Existencia al inicio (${unidad})`,
    },
    { ...o, alto: 760 },
  ).toDataURL('image/png')
  const historico = graficaColumnas(
    {
      titulo: `Consumo registrado de ${a.material.nombre}`,
      subtitulo: rangoTexto(a.historico.map((f) => f.periodo), a.unidad).replace(/^de (la )?/, 'Periodo analizado: '),
      etiquetas: a.historico.map((f) => f.periodo.etiqueta),
      valores: a.historico.map((f) => f.cantidad),
      referencia: { nombre: 'Consumo promedio', valor: p.consumo },
      nombreSerie: `${unidad[0].toUpperCase()}${unidad.slice(1)} entregados`,
    },
    { ...o, alto: 700 },
  ).toDataURL('image/png')
  const tallas =
    a.porTalla.length > 1
      ? graficaDona(a.porTalla.map((t) => ({ etiqueta: t.etiqueta, valor: t.cantidad })), { ...o, titulo: 'Entregas por talla', alto: 700 }).toDataURL('image/png')
      : undefined
  return { proyeccion, historico, tallas }
}

export function imagenComparativa(lista: { a: AnalisisMaterial; unidad: string }[], c: ConfigTendencia): string {
  const u = lista[0]?.a.unidad ?? 'semana'
  return graficaComparativa(
    lista.map(({ a }) => ({
      nombre: a.material.nombre,
      promedio: a.escenarios.promedio.cobertura,
      alto: a.escenarios.alto.cobertura,
      bajo: a.escenarios.bajo.cobertura,
      texto: a.escenarios.promedio.agotamiento ? `hasta ${a.escenarios.promedio.agotamiento.etiqueta} ${a.escenarios.promedio.agotamiento.clave.slice(0, 4)}` : 'no se agota',
    })),
    u === 'semana' ? 'Semanas' : 'Meses',
    { estilo: c.estilo, paleta: c.paleta, titulo: '¿Hasta cuándo alcanzan las existencias?', subtitulo: 'Comparativa entre materiales con el consumo del periodo analizado' },
  ).toDataURL('image/png')
}

export interface ImagenesPlan {
  consumo: string
  existencia: string
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
  ).toDataURL('image/png')
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
  ).toDataURL('image/png')
  return { consumo, existencia }
}

