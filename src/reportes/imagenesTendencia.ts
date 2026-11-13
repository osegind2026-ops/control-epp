// Imágenes de las gráficas de Tendencias (las mismas en pantalla, PDF y Word).
import { NOMBRE_ESCENARIO, miles, porUnidad, type AnalisisMaterial, type ComparacionPlan, type Escenario } from '../domain/tendencias'
import { escenarioPrincipal, escenariosDe, type ConfigTendencia } from '../state/tendencias'
import { graficaColumnas, graficaComparativa, graficaDona, graficaSeries, graficaTallas, paleta, type FilaTalla, type PaletaGrafica } from './graficasTendencia'
import { rangoTexto, sugerenciaTalla } from './tendenciaDoc'
import type { GraficaNativa } from './graficaNativa'

/** Imagen lista para usarse: PNG y proporción alto/ancho (para acomodarla en la hoja). */
export interface Img {
  src: string
  ratio: number
  /** Los mismos datos como gráfica nativa de Word (editable con «Editar datos»). */
  nativa?: GraficaNativa
}
const img = (c: HTMLCanvasElement, nativa?: GraficaNativa): Img => ({ src: c.toDataURL('image/png'), ratio: c.height / c.width, nativa })
const ROJO = '#C0392B'
const GRIS = '#9AA1A8'
const finito = (v: number) => (isFinite(v) ? Math.round(v * 10) / 10 : null)

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
  // Sin dato de consumo no se dibuja la proyección (sería una línea plana engañosa)
  const separadas = !a.demandaNoMedida && (sel.length === 1 || vista !== 'comparativa')
  const comparar = !a.demandaNoMedida && sel.length > 1 && vista !== 'separadas'

  const proyeccion: Partial<Record<Escenario, Img>> = {}
  if (separadas)
    for (const e of sel) {
      const r = a.escenarios[e]
      const resaltar = new Map<number, string>()
      if (a.objetivo) {
        const i = r.filas.findIndex((f) => f.periodo.clave === a.objetivo!.clave)
        if (i >= 0) resaltar.set(i, pal.acento)
      }
      const tituloP = sel.length > 1 ? `${NOMBRE_ESCENARIO[e]} – ${a.nombre}` : `Tendencia de Consumo de ${a.nombre}`
      const etP = etiquetasPeriodos(r.filas.map((f) => f.periodo))
      proyeccion[e] = img(
        graficaColumnas(
          {
            titulo: tituloP,
            subtitulo: `Existencia proyectada con ${miles(r.consumo)} ${unidad} ${porUnidad(a.unidad)}${a.objetivo ? ` · resaltado: ${a.objetivo.etiqueta} (fecha objetivo)` : ''}`,
            etiquetas: etiquetasPeriodos(r.filas.map((f) => f.periodo)),
            valores: r.filas.map((f) => f.existencia),
            porcentaje: { nombre: '% consumido acumulado', valores: r.filas.map((f) => f.acumulado) },
            resaltar,
            nombreSerie: `Existencia al inicio (${unidad})`,
          },
          { ...o, alto: sel.length > 1 ? 680 : 760 },
        ),
        {
          tipo: 'combinada',
          titulo: tituloP,
          subtitulo: `Existencia proyectada con ${miles(r.consumo)} ${unidad} ${porUnidad(a.unidad)}`,
          categorias: etP,
          ejeY: `Existencia (${unidad})`,
          ejeY2: { titulo: '% consumido', max: 100 },
          series: [
            {
              nombre: `Existencia al inicio (${unidad})`,
              valores: r.filas.map((f) => f.existencia),
              color: pal.principal,
              colores: r.filas.map((f, i) => (f.existencia < 0 ? ROJO : resaltar.get(i))),
            },
            { nombre: '% consumido acumulado', valores: r.filas.map((f) => Math.round(f.acumulado)), color: pal.acento, tipo: 'lineas', eje2: true, etiquetas: false, formato: '0"%"' },
          ],
        },
      )
    }

  let comparada: Img | undefined
  if (comparar) {
    // Se muestran los periodos hasta que se agota el escenario que más dura (máximo 60)
    const largo = Math.min(60, Math.max(...sel.map((e) => a.escenarios[e].filas.length)))
    const base = sel.map((e) => a.escenarios[e].filas).sort((x, y) => y.length - x.length)[0].slice(0, largo)
    const seriesC = sel.map((e) => ({
      nombre: `${NOMBRE_CORTO[e]} (${miles(a.escenarios[e].consumo)} ${porUnidad(a.unidad)})`,
      valores: base.map((_, i) => a.escenarios[e].filas[i]?.existencia ?? null),
      color: colorEscenario(e, c.paleta),
      punteada: e !== principal,
    }))
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
      {
        tipo: 'combinada',
        titulo: `Escenarios de consumo – ${a.nombre}`,
        subtitulo: `Existencia proyectada (${unidad})`,
        categorias: etiquetasPeriodos(base.map((f) => f.periodo)),
        ejeY: `Existencia (${unidad})`,
        series: seriesC.map((x) => ({ ...x, tipo: 'lineas' as const, etiquetas: base.length <= 12 && !x.punteada })),
      },
    )
  }

  const sinExist = c.excluirSinExistencia === false ? undefined : a.historico.map((f) => !!f.sinExistencia)
  const historico = img(
    graficaColumnas(
      {
        titulo: `Consumo registrado de ${a.nombre}`,
        subtitulo: rangoTexto(a.historico.map((f) => f.periodo), a.unidad).replace(/^de (la )?/, 'Periodo analizado: '),
        etiquetas: a.historico.map((f) => f.periodo.etiqueta),
        valores: a.historico.map((f) => f.cantidad),
        referencia: a.demandaNoMedida ? undefined : { nombre: NOMBRE_ESCENARIO[principal], valor: a.escenarios[principal].consumo },
        sinExistencia: sinExist,
        nombreSerie: `${unidad[0].toUpperCase()}${unidad.slice(1)} entregados`,
      },
      { ...o, alto: 700 },
    ),
    {
      tipo: 'combinada',
      titulo: `Consumo registrado de ${a.nombre}`,
      subtitulo: rangoTexto(a.historico.map((f) => f.periodo), a.unidad).replace(/^de (la )?/, 'Periodo analizado: ') + (sinExist?.some(Boolean) ? ' · en gris: sin existencia en almacén' : ''),
      categorias: a.historico.map((f) => f.periodo.etiqueta),
      ejeY: `${unidad[0].toUpperCase()}${unidad.slice(1)} entregados`,
      series: [
        { nombre: `${unidad[0].toUpperCase()}${unidad.slice(1)} entregados`, valores: a.historico.map((f) => f.cantidad), color: pal.principal, colores: sinExist?.map((z) => (z ? GRIS : undefined)) },
        ...(a.demandaNoMedida ? [] : [{ nombre: NOMBRE_ESCENARIO[principal], valores: a.historico.map(() => a.escenarios[principal].consumo), color: pal.acento, tipo: 'lineas' as const, punteada: true, etiquetas: false }]),
      ],
    },
  )
  const tallas =
    a.porTalla.length > 1
      ? img(graficaDona(a.porTalla.map((t) => ({ etiqueta: t.etiqueta, valor: t.cantidad })), { ...o, titulo: 'Entregas por talla', alto: 700 }), {
          tipo: 'dona',
          titulo: 'Entregas por talla',
          categorias: a.porTalla.map((t) => t.etiqueta),
          series: [{ nombre: 'Entregados', valores: a.porTalla.map((t) => t.cantidad), color: pal.principal, colores: a.porTalla.map((_, i) => pal.serie[i % pal.serie.length]) }],
        })
      : undefined
  return { historico, proyeccion, comparada, tallas }
}

/** Comparativa entre materiales o entre tallas: hasta cuándo alcanza cada uno. */
export function imagenCobertura(lista: { a: AnalisisMaterial; nombre?: string }[], c: ConfigTendencia, titulo: string, subtitulo: string): Img {
  const u = lista[0]?.a.unidad ?? 'semana'
  const e = escenarioPrincipal(c)
  const pal = paleta(c.paleta)
  const nombres = lista.map(({ a, nombre }) => nombre ?? a.nombre)
  const cob = (a: AnalisisMaterial, x: Escenario) => (a.demandaNoMedida ? null : finito(a.escenarios[x].cobertura))
  const otros = (['alto', 'bajo'] as Escenario[]).filter((x) => x !== e)
  return img(
    graficaComparativa(
      lista.map(({ a, nombre }) =>
        a.demandaNoMedida
          ? { nombre: nombre ?? a.nombre, promedio: 0, alto: 0, bajo: 0, texto: 'sin dato: no hubo existencia' }
          : {
              nombre: nombre ?? a.nombre,
              promedio: a.escenarios[e].cobertura,
              alto: a.escenarios.alto.cobertura,
              bajo: a.escenarios.bajo.cobertura,
              texto: a.escenarios[e].agotamiento ? `hasta ${a.escenarios[e].agotamiento!.etiqueta} ${a.escenarios[e].agotamiento!.clave.slice(0, 4)}` : 'no se agota',
            },
      ),
      u === 'semana' ? 'Semanas' : 'Meses',
      { estilo: c.estilo, paleta: c.paleta, titulo, subtitulo, nota: `Barra: ${NOMBRE_ESCENARIO[e].toLowerCase()} · Línea delgada: del escenario conservador al bajo` },
    ),
    {
      tipo: 'barras',
      titulo,
      subtitulo: `${u === 'semana' ? 'Semanas' : 'Meses'} que alcanzan las existencias (vacío = no se agota o sin dato)`,
      categorias: nombres,
      ejeY: u === 'semana' ? 'Semanas' : 'Meses',
      series: [
        { nombre: NOMBRE_ESCENARIO[e], valores: lista.map(({ a }) => cob(a, e)), color: pal.principal, colores: lista.map((_, i) => pal.serie[i % pal.serie.length]), formato: '#,##0.0' },
        ...otros.map((x) => ({ nombre: NOMBRE_ESCENARIO[x], valores: lista.map(({ a }) => cob(a, x)), color: x === 'alto' ? ROJO : pal.serie[3], formato: '#,##0.0' })),
      ],
      separacion: 50,
    },
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
    {
      tipo: 'combinada',
      titulo: `Consumo por talla – ${nombreMaterial}`,
      subtitulo: `${unidad[0].toUpperCase()}${unidad.slice(1)} entregados ${porUnidad(tallas[0].unidad)}`,
      categorias: base.map((f) => f.periodo.etiqueta),
      ejeY: `${unidad[0].toUpperCase()}${unidad.slice(1)}`,
      series: tallas.map((t, i) => ({ nombre: t.talla?.etiqueta ?? t.nombre, valores: t.historico.map((f) => f.cantidad), color: pal.serie[i % pal.serie.length], etiquetas: base.length * tallas.length <= 32 })),
      separacion: 40,
    },
  )
}

/** Horizonte con el que se compara la existencia de cada talla cuando no hay fecha objetivo. */
export const HORIZONTE_TALLAS = { semana: 8, mes: 2 } as const

/**
 * Existencia de cada talla contra lo que se consumirá hasta la fecha objetivo (o en las
 * próximas 8 semanas / 2 meses): deja ver qué tallas sobran y cuáles hay que comprar.
 */
export function imagenTallasExistencia(tallas: AnalisisMaterial[], nombreMaterial: string, unidad: string, c: ConfigTendencia): Img {
  const e = escenarioPrincipal(c)
  const u = tallas[0].unidad
  const obj = tallas[0].objetivo
  const h = HORIZONTE_TALLAS[u]
  const nombreNecesario = obj ? `Lo que se usará hasta ${obj.etiqueta} ${obj.clave.slice(0, 4)}` : `Lo que se usará en ${h} ${u === 'semana' ? 'semanas' : 'meses'}`
  const pal = paleta(c.paleta)
  const filas = tallas.map((t): FilaTalla => {
        const r = t.escenarios[e]
        const sug = sugerenciaTalla(t, e)
        const necesario = r.sinDato ? 0 : obj ? (r.necesario ?? 0) : Math.ceil(r.consumo * h)
        const veredicto = r.sinDato ? 'sindato' : /^Comprar/.test(sug) ? 'comprar' : 'suficiente'
        return {
          nombre: t.talla?.etiqueta.replace(/^Talla /, '') ?? t.nombre,
          detalle: r.sinDato ? 'sin existencia en el periodo' : `${miles(r.consumo)} ${unidad} ${porUnidad(u)}`,
          existencia: t.existencia,
          necesario,
          veredicto,
          texto: veredicto === 'sindato' ? 'Sin dato' : veredicto === 'comprar' ? (obj ? sug : `${sug} (faltan ${miles(Math.max(0, necesario - t.existencia))})`) : 'No comprar',
        }
      })
  return img(
    graficaTallas(
      filas,
      {
        estilo: c.estilo,
        paleta: c.paleta,
        titulo: `¿Qué tallas comprar? – ${nombreMaterial}`,
        subtitulo: `Existencia de cada talla contra lo que se usará (${NOMBRE_ESCENARIO[e].toLowerCase()} de cada talla)`,
        nombreNecesario,
        unidad: `${unidad[0].toUpperCase()}${unidad.slice(1)}`,
      },
    ),
    {
      tipo: 'barras',
      titulo: `¿Qué tallas comprar? – ${nombreMaterial}`,
      subtitulo: `Existencia contra lo que se usará · ${filas.map((f) => `${f.nombre}: ${f.texto}`).join(' · ')}`,
      categorias: filas.map((f) => f.nombre),
      ejeY: `${unidad[0].toUpperCase()}${unidad.slice(1)}`,
      series: [
        { nombre: 'Existencia (almacén + pedido)', valores: filas.map((f) => f.existencia), color: pal.principal, colores: filas.map((f) => (f.veredicto === 'comprar' ? ROJO : f.veredicto === 'sindato' ? GRIS : undefined)) },
        { nombre: nombreNecesario, valores: filas.map((f) => (f.veredicto === 'sindato' ? null : f.necesario)), color: '#6F7271' },
      ],
      separacion: 40,
    },
  )
}

/** Existencia de cada talla al inicio de cada periodo (kardex) y la de hoy. null si no hay kardex. */
export function imagenExistenciaTallas(tallas: AnalisisMaterial[], nombreMaterial: string, unidad: string, c: ConfigTendencia): Img | null {
  if (!tallas.some((t) => t.historico.some((f) => f.existInicio != null))) return null
  const pal = paleta(c.paleta)
  const base = tallas[0].historico
  return img(
    graficaSeries(
      {
        titulo: `Existencia de cada talla en el periodo – ${nombreMaterial}`,
        subtitulo: `${unidad[0].toUpperCase()}${unidad.slice(1)} en almacén al inicio de cada ${tallas[0].unidad === 'semana' ? 'semana' : 'mes'}: una línea plana es una talla con poco movimiento`,
        etiquetas: [...etiquetasPeriodos(base.map((f) => f.periodo)), 'HOY'],
        lineas: true,
        series: tallas.map((t, i) => ({
          nombre: t.talla?.etiqueta ?? t.nombre,
          valores: [...t.historico.map((f) => f.existInicio ?? null), t.almacen],
          color: pal.serie[i % pal.serie.length],
        })),
      },
      { estilo: 'lineas', paleta: c.paleta, alto: 720 },
    ),
    {
      tipo: 'combinada',
      titulo: `Existencia de cada talla en el periodo – ${nombreMaterial}`,
      subtitulo: `${unidad[0].toUpperCase()}${unidad.slice(1)} en almacén al inicio de cada periodo (según el kardex)`,
      categorias: [...base.map((f) => f.periodo.etiqueta), 'HOY'],
      ejeY: `${unidad[0].toUpperCase()}${unidad.slice(1)}`,
      series: tallas.map((t, i) => ({ nombre: t.talla?.etiqueta ?? t.nombre, valores: [...t.historico.map((f) => f.existInicio ?? null), t.almacen], color: pal.serie[i % pal.serie.length], tipo: 'lineas' as const, etiquetas: false })),
    },
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
  const cat = etiquetas
  return {
    consumo: img(consumo, {
      tipo: 'combinada',
      titulo: `Planeado vs Real – ${nombre}`,
      subtitulo: `Consumo ${porUnidad(cp.plan.unidad)} (${unidad}); * periodo en curso`,
      categorias: cat,
      ejeY: unidad,
      series: [
        { nombre: 'Planeado', valores: cp.filas.map((f) => f.planeado), color: pal.acento },
        { nombre: 'Real registrado', valores: cp.filas.map((f) => f.real), color: pal.principal },
      ],
    }),
    existencia: img(existencia, {
      tipo: 'combinada',
      titulo: `Existencia planeada vs real – ${nombre}`,
      subtitulo: `Al inicio de cada periodo (${unidad})`,
      categorias: cat,
      ejeY: unidad,
      series: [
        { nombre: 'Existencia planeada', valores: cp.filas.map((f) => f.existPlaneada), color: pal.acento, tipo: 'lineas', punteada: true },
        { nombre: 'Existencia real', valores: cp.filas.map((f) => f.existReal), color: pal.principal, tipo: 'lineas' },
      ],
    }),
  }
}
