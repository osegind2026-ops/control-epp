import type JSZip from 'jszip'
import { contaminadoEn } from '../domain/contaminado'
import { aplicarFiltro, cortesTendencia, NOMBRE_TIPO, tipoLinea, type DatosReporte, type Fuentes } from './datos'

// Hoja «Tablero» del Excel: tres listas desplegables (área, tipo de EPP y categoría) y tablas
// con fórmulas SUMIFS/COUNTIFS que leen la hoja oculta «Datos». Las gráficas son nativas de
// Excel y apuntan a esas tablas, así que todo se recalcula al cambiar la lista.
// Solo usa funciones de Excel 2010 en adelante: funciona en Office 2016 y en Excel en línea.
// write-excel-file no escribe listas ni gráficas; se agregan editando el XML (posprocesarExcel).

export type Celda = {
  value: string | number | null
  type?: typeof String | typeof Number | 'Formula'
  fontWeight?: 'bold'
  fontStyle?: 'italic'
  fontSize?: number
  textColor?: string
  backgroundColor?: string
  align?: 'left' | 'center' | 'right'
  wrap?: boolean
  format?: string
  borderColor?: string
  borderStyle?: 'thin'
}
export type Fila = Celda[]

const VERDE = '#235B4E'
const GUINDA = '#691C32'
const GRIS = '#6F7271'
const AMARILLO = '#FFF4D6'
const TODAS = '(Todas)'
const TODOS = '(Todos)'

export const HOJA_TABLERO = 'Tablero'
export const HOJA_DATOS = 'Datos'

/** «A», «B»… «AA» para el número de columna (1 = A). */
export const letra = (n: number): string => (n > 26 ? letra(Math.floor((n - 1) / 26)) : '') + String.fromCharCode(65 + ((n - 1) % 26))

export interface Grafica {
  tipo: 'barras' | 'lineas' | 'dona'
  titulo: string
  /** Formato de las etiquetas; los ceros no se muestran. */
  formato?: string
  categorias: { ref: string; valores: string[] }
  series: { nombre: string; ref: string; valores: number[]; color: string }[]
  /** Esquina superior izquierda e inferior derecha (columna y fila, desde 0). */
  desde: [number, number]
  hasta: [number, number]
}

export interface Tablero {
  tablero: Fila[]
  datos: Fila[]
  /** Valor inicial (con «Todas») de cada celda con fórmula, para que se vea aunque no se recalcule. */
  valores: Map<string, number | string>
  graficas: Grafica[]
  listas: { celda: string; rango: string }[]
  nombres: [string, string][]
}

const COLORES = ['235B4E', 'BC955C', '691C32', '6F7271', '3F8B78', '9D7B45', 'A34A62', '98989A']

export function armarTablero(d: DatosReporte, f: Fuentes, hojas: { recurrentes: string; contaminado?: string; entregas: string; porArea: string; resumen: string }): Tablero {
  const mats = new Map(f.materiales.map((m) => [m.id, m]))
  const nombreMat = (id: string) => mats.get(id)?.nombre ?? id
  const nombreCat = (id: string) => f.categorias?.find((c) => c.id === id)?.nombre ?? (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Sin categoría')
  const catDe = (materialId: string) => nombreCat(mats.get(materialId)?.categoriaId ?? '')

  // ---------- Hoja Datos ----------
  // A-H: una fila por línea de entrega · K-O: casos recurrentes (O = 1 por caso) · P-U: tendencia · W-Y: listas
  // Se suma con SUMIFS en vez de contar con COUNTIFS: «*» también contaría el encabezado.
  const lineas: { area: string; material: string; cat: string; tipo: string; piezas: number; cont: number; entrega: number; persona: number }[] = []
  const vistos = new Set<string>()
  for (const e of d.entregas) {
    e.lineas.forEach((l, i) => {
      const kp = `${e.rpe}|${e.area}`
      lineas.push({
        area: e.area,
        material: nombreMat(l.materialId),
        cat: catDe(l.materialId),
        tipo: NOMBRE_TIPO[tipoLinea(l)],
        piezas: l.cantidad,
        cont: contaminadoEn(e, l.materialId) ? l.cantidad : 0,
        entrega: i === 0 ? 1 : 0,
        persona: vistos.has(kp) ? 0 : 1,
      })
      vistos.add(kp)
    })
  }
  const rec = d.recurrentes.map((r) => ({ area: r.area, material: r.material, cat: catDe(r.materialId), tipo: NOMBRE_TIPO.consumible }))
  const { unidad, cortes } = cortesTendencia(d.desde, d.hasta)
  const tend = new Map<string, { periodo: string; area: string; cat: string; tipo: string; piezas: number; cont: number }>()
  const enTendencia = aplicarFiltro(f.entregas, d.filtro, mats).filter((e) => e.fecha >= cortes[0].desde && e.fecha <= cortes[cortes.length - 1].hasta)
  for (const e of enTendencia) {
    const c = cortes.find((x) => e.fecha >= x.desde && e.fecha <= x.hasta)
    if (!c) continue
    for (const l of e.lineas) {
      const tipo = NOMBRE_TIPO[tipoLinea(l)]
      const cat = catDe(l.materialId)
      const k = [c.etiqueta, e.area, cat, tipo].join('|')
      const x = tend.get(k) ?? { periodo: c.etiqueta, area: e.area, cat, tipo, piezas: 0, cont: 0 }
      x.piezas += l.cantidad
      if (contaminadoEn(e, l.materialId)) x.cont += l.cantidad
      tend.set(k, x)
    }
  }
  const tendencia = [...tend.values()]
  const listaAreas = [...new Set([...lineas.map((x) => x.area), ...tendencia.map((x) => x.area)])].sort((a, b) => a.localeCompare(b))
  const listaTipos = Object.values(NOMBRE_TIPO)
  const listaCats = [...new Set([...lineas.map((x) => x.cat), ...tendencia.map((x) => x.cat)])].sort((a, b) => a.localeCompare(b))

  const t = (value: string): Celda => ({ value })
  const n = (value: number): Celda => ({ value, type: Number })
  const vacia: Celda = { value: null }
  const filasDatos = Math.max(lineas.length, rec.length, tendencia.length, listaAreas.length + 1, listaCats.length + 1, 5)
  const datos: Fila[] = [
    ['Área', 'Material', 'Categoría', 'Tipo', 'Piezas', 'Piezas contaminadas', 'Cuenta entrega', 'Cuenta persona', '', '', 'Área (recurrente)', 'Material', 'Categoría', 'Tipo', 'Cuenta caso', 'Periodo', 'Área', 'Categoría', 'Tipo', 'Piezas', 'Piezas contaminadas', '', 'Áreas', 'Tipos', 'Categorías'].map(
      (v) => ({ value: v || null, fontWeight: 'bold' as const }),
    ),
  ]
  for (let i = 0; i < filasDatos; i++) {
    const l = lineas[i]
    const r = rec[i]
    const x = tendencia[i]
    const lista = (xs: string[], todas: string) => (i === 0 ? t(todas) : xs[i - 1] !== undefined ? t(xs[i - 1]) : vacia)
    datos.push([
      ...(l ? [t(l.area), t(l.material), t(l.cat), t(l.tipo), n(l.piezas), n(l.cont), n(l.entrega), n(l.persona)] : Array(8).fill(vacia)),
      vacia,
      vacia,
      ...(r ? [t(r.area), t(r.material), t(r.cat), t(r.tipo), n(1)] : Array(5).fill(vacia)),
      ...(x ? [t(x.periodo), t(x.area), t(x.cat), t(x.tipo), n(x.piezas), n(x.cont)] : Array(6).fill(vacia)),
      vacia,
      lista(listaAreas, TODAS),
      lista(listaTipos, TODOS),
      lista(listaCats, TODAS),
    ])
  }

  // ---------- Hoja Tablero ----------
  const tablero: Fila[] = []
  const valores = new Map<string, number | string>()
  const fila = () => tablero.length + 1 // número de la siguiente fila
  const D = (col: string) => `${HOJA_DATOS}!$${col}:$${col}`
  const formula = (celda: string, f: string, valor: number | string, estilo: Partial<Celda> = {}): Celda => {
    valores.set(celda, valor)
    return { value: f, type: 'Formula', ...(typeof valor === 'number' ? { format: '#,##0' } : {}), ...estilo }
  }
  const suma = <T,>(xs: T[], fn: (x: T) => number) => xs.reduce((s, x) => s + fn(x), 0)
  const enc = (...xs: string[]): Fila => xs.map((value) => ({ value, fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: VERDE, align: value === xs[0] ? 'left' : 'center' }))
  const titulo = (s: string): Fila => [{ value: s, fontWeight: 'bold', textColor: GUINDA, fontSize: 13 }]

  tablero.push([{ value: 'Tablero · Informe de Entrega de Equipo de Protección Personal', fontWeight: 'bold', textColor: VERDE, fontSize: 16 }])
  tablero.push([{ value: d.filtroTexto ? `${d.titulo} · ${d.filtroTexto}` : d.titulo, textColor: GRIS }])
  const vinculos: [string, string][] = [
    ['Resumen', hojas.resumen],
    ['Recurrentes', hojas.recurrentes],
    ...(hojas.contaminado ? ([['EPP contaminado', hojas.contaminado]] as [string, string][]) : []),
    ['Entregas', hojas.entregas],
    ['Por área', hojas.porArea],
  ]
  {
    const r = fila()
    tablero.push([
      { value: 'Ir a la hoja:', fontWeight: 'bold', textColor: GRIS },
      ...vinculos.map(([texto, hoja], i) => formula(`${letra(i + 2)}${r}`, `HYPERLINK("#'${hoja}'!A1","${texto} ›")`, `${texto} ›`, { textColor: '#1F5FA8', fontWeight: 'bold' })),
    ])
  }
  tablero.push([])
  const celdaLista = (texto: string, valor: string, nota: string): Fila => [
    { value: texto, fontWeight: 'bold' },
    { value: valor, fontWeight: 'bold', backgroundColor: AMARILLO, borderColor: '#BC955C', borderStyle: 'thin' },
    { value: null },
    { value: nota, fontStyle: 'italic', textColor: GRIS },
  ]
  const filaArea = fila()
  tablero.push(celdaLista('Área', TODAS, '◄ Elija aquí el área: todo el tablero y sus gráficas se recalculan.'))
  const filaTipo = fila()
  tablero.push(celdaLista('Tipo de EPP', TODOS, '◄ Consumible, resguardo o préstamo.'))
  const filaCat = fila()
  tablero.push(celdaLista('Categoría', TODAS, '◄ Ojos, manos, oídos…'))
  const listas = [
    { celda: `B${filaArea}`, rango: `${HOJA_DATOS}!$W$2:$W$${listaAreas.length + 2}` },
    { celda: `B${filaTipo}`, rango: `${HOJA_DATOS}!$X$2:$X$${listaTipos.length + 2}` },
    { celda: `B${filaCat}`, rango: `${HOJA_DATOS}!$Y$2:$Y$${listaCats.length + 2}` },
  ]
  const nombres: [string, string][] = [
    ['fArea', `IF(${HOJA_TABLERO}!$B$${filaArea}="${TODAS}","*",${HOJA_TABLERO}!$B$${filaArea})`],
    ['fTipo', `IF(${HOJA_TABLERO}!$B$${filaTipo}="${TODOS}","*",${HOJA_TABLERO}!$B$${filaTipo})`],
    ['fCat', `IF(${HOJA_TABLERO}!$B$${filaCat}="${TODAS}","*",${HOJA_TABLERO}!$B$${filaCat})`],
  ]
  const filtros = `${D('A')},fArea,${D('D')},fTipo,${D('C')},fCat`
  tablero.push([])

  // Indicadores
  tablero.push(enc('Piezas entregadas', 'Personas', 'Entregas', 'Casos recurrentes', 'Piezas contaminadas').map((c) => ({ ...c, align: 'center' as const })))
  {
    const r = fila()
    const grande = { fontWeight: 'bold' as const, fontSize: 18, align: 'center' as const }
    tablero.push([
      formula(`A${r}`, `SUMIFS(${D('E')},${filtros})`, suma(lineas, (x) => x.piezas), { ...grande, textColor: VERDE }),
      formula(`B${r}`, `SUMIFS(${D('H')},${D('A')},fArea)`, suma(lineas, (x) => x.persona), grande),
      formula(`C${r}`, `SUMIFS(${D('G')},${D('A')},fArea)`, suma(lineas, (x) => x.entrega), grande),
      formula(`D${r}`, `SUMIFS(${D('O')},${D('K')},fArea,${D('N')},fTipo,${D('M')},fCat)`, rec.length, { ...grande, textColor: GUINDA }),
      formula(`E${r}`, `SUMIFS(${D('F')},${filtros})`, suma(lineas, (x) => x.cont), { ...grande, textColor: GUINDA }),
    ])
  }
  tablero.push([{ value: 'Personas y entregas solo toman en cuenta el área elegida.', fontStyle: 'italic', textColor: GRIS }])
  tablero.push([])

  // Por material
  tablero.push(titulo('Por material'))
  tablero.push(enc('Material', 'Categoría', 'Piezas', 'Piezas contaminadas', 'Casos recurrentes'))
  const iniMat = fila()
  for (const m of d.materiales) {
    const r = fila()
    const delMat = lineas.filter((x) => x.material === m.nombre)
    tablero.push([
      { value: m.nombre },
      { value: catDe(m.id), textColor: GRIS },
      formula(`C${r}`, `SUMIFS(${D('E')},${filtros},${D('B')},$A${r})`, suma(delMat, (x) => x.piezas), { align: 'center' }),
      formula(`D${r}`, `SUMIFS(${D('F')},${filtros},${D('B')},$A${r})`, suma(delMat, (x) => x.cont), { align: 'center' }),
      formula(`E${r}`, `SUMIFS(${D('O')},${D('K')},fArea,${D('N')},fTipo,${D('M')},fCat,${D('L')},$A${r})`, rec.filter((x) => x.material === m.nombre).length, { align: 'center' }),
    ])
  }
  const finMat = Math.max(iniMat, fila() - 1)
  tablero.push([])

  // Tendencia
  tablero.push(titulo(`Tendencia (últim${unidad === 'semana' ? 'as 12 semanas' : 'os 12 meses'})`))
  tablero.push(enc('Periodo', 'Piezas', 'Contaminadas'))
  const iniTend = fila()
  const filtrosT = `${D('Q')},fArea,${D('S')},fTipo,${D('R')},fCat`
  for (const c of cortes) {
    const r = fila()
    const del = tendencia.filter((x) => x.periodo === c.etiqueta)
    tablero.push([
      { value: c.etiqueta },
      formula(`B${r}`, `SUMIFS(${D('T')},${filtrosT},${D('P')},$A${r})`, suma(del, (x) => x.piezas), { align: 'center' }),
      formula(`C${r}`, `SUMIFS(${D('U')},${filtrosT},${D('P')},$A${r})`, suma(del, (x) => x.cont), { align: 'center' }),
    ])
  }
  const finTend = fila() - 1
  tablero.push([])

  // Por categoría
  tablero.push(titulo('Por categoría de EPP'))
  tablero.push(enc('Categoría', 'Piezas'))
  const iniCat = fila()
  const cats = [...new Set(lineas.map((x) => x.cat))].sort((a, b) => suma(lineas.filter((x) => x.cat === b), (x) => x.piezas) - suma(lineas.filter((x) => x.cat === a), (x) => x.piezas))
  for (const c of cats) {
    const r = fila()
    tablero.push([{ value: c }, formula(`B${r}`, `SUMIFS(${D('E')},${D('A')},fArea,${D('D')},fTipo,${D('C')},$A${r})`, suma(lineas.filter((x) => x.cat === c), (x) => x.piezas), { align: 'center' })])
  }
  const finCat = Math.max(iniCat, fila() - 1)
  tablero.push([])

  // Por área (compara todas las áreas; respeta tipo y categoría)
  tablero.push(titulo('Por área (todas las áreas, para comparar)'))
  tablero.push(enc('Área', 'Personas', 'Piezas', 'Piezas por persona', 'Casos recurrentes', 'Piezas contaminadas'))
  const iniArea = fila()
  for (const a of d.porArea) {
    const r = fila()
    const del = lineas.filter((x) => x.area === a.area)
    const personas = suma(del, (x) => x.persona)
    const piezas = suma(del, (x) => x.piezas)
    tablero.push([
      { value: a.area },
      formula(`B${r}`, `SUMIFS(${D('H')},${D('A')},$A${r})`, personas, { align: 'center' }),
      formula(`C${r}`, `SUMIFS(${D('E')},${D('A')},$A${r},${D('D')},fTipo,${D('C')},fCat)`, piezas, { align: 'center' }),
      formula(`D${r}`, `IFERROR(ROUND(C${r}/B${r},1),0)`, personas ? Math.round((piezas / personas) * 10) / 10 : 0, { align: 'center', format: '0.0' }),
      formula(`E${r}`, `SUMIFS(${D('O')},${D('K')},$A${r},${D('N')},fTipo,${D('M')},fCat)`, rec.filter((x) => x.area === a.area).length, { align: 'center' }),
      formula(`F${r}`, `SUMIFS(${D('F')},${D('A')},$A${r},${D('D')},fTipo,${D('C')},fCat)`, suma(del, (x) => x.cont), { align: 'center' }),
    ])
  }
  const finArea = Math.max(iniArea, fila() - 1)

  // ---------- Gráficas ----------
  const ref = (col: string, a: number, b: number) => `${HOJA_TABLERO}!$${col}$${a}:$${col}$${b}`
  const valoresDe = (col: string, a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => Number(valores.get(`${col}${a + i}`) ?? 0))
  const textosDe = (filas: Fila[], a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => String(filas[a - 1 + i]?.[0]?.value ?? ''))
  const graficas: Grafica[] = [
    {
      tipo: 'barras',
      titulo: 'Piezas entregadas por material',
      categorias: { ref: ref('A', iniMat, finMat), valores: textosDe(tablero, iniMat, finMat) },
      series: [{ nombre: 'Piezas', ref: ref('C', iniMat, finMat), valores: valoresDe('C', iniMat, finMat), color: COLORES[0] }],
      desde: [7, 3],
      hasta: [14, 23],
    },
    {
      tipo: 'lineas',
      titulo: `Tendencia por ${unidad}`,
      categorias: { ref: ref('A', iniTend, finTend), valores: textosDe(tablero, iniTend, finTend) },
      series: [
        { nombre: 'Piezas', ref: ref('B', iniTend, finTend), valores: valoresDe('B', iniTend, finTend), color: COLORES[1] },
        { nombre: 'Piezas contaminadas', ref: ref('C', iniTend, finTend), valores: valoresDe('C', iniTend, finTend), color: COLORES[2] },
      ],
      desde: [14, 3],
      hasta: [22, 23],
    },
    {
      tipo: 'barras',
      titulo: 'Casos recurrentes y piezas contaminadas por material',
      categorias: { ref: ref('A', iniMat, finMat), valores: textosDe(tablero, iniMat, finMat) },
      series: [
        { nombre: 'Casos recurrentes', ref: ref('E', iniMat, finMat), valores: valoresDe('E', iniMat, finMat), color: COLORES[2] },
        { nombre: 'Piezas contaminadas', ref: ref('D', iniMat, finMat), valores: valoresDe('D', iniMat, finMat), color: COLORES[1] },
      ],
      desde: [7, 24],
      hasta: [14, 45],
    },
    {
      tipo: 'dona',
      titulo: 'Piezas por categoría de EPP',
      categorias: { ref: ref('A', iniCat, finCat), valores: textosDe(tablero, iniCat, finCat) },
      series: [{ nombre: 'Piezas', ref: ref('B', iniCat, finCat), valores: valoresDe('B', iniCat, finCat), color: COLORES[0] }],
      desde: [14, 24],
      hasta: [22, 45],
    },
    {
      tipo: 'barras',
      titulo: 'Piezas por persona en cada área',
      formato: '0.0',
      categorias: { ref: ref('A', iniArea, finArea), valores: textosDe(tablero, iniArea, finArea) },
      series: [{ nombre: 'Piezas por persona', ref: ref('D', iniArea, finArea), valores: valoresDe('D', iniArea, finArea), color: COLORES[1] }],
      desde: [7, 46],
      hasta: [22, 46 + Math.max(16, Math.ceil((finArea - iniArea + 1) * 1.1) + 4)],
    },
  ]
  return { tablero, datos, valores, graficas, listas, nombres }
}

// ---------------- XML de las gráficas ----------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const relleno = (color: string) => `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`
const texto = (tam: number, color = '2B2B2B', negrita = false) =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${tam}" b="${negrita ? 1 : 0}">${relleno(color)}</a:defRPr></a:pPr><a:endParaRPr lang="es-MX"/></a:p></c:txPr>`
const cat = (g: Grafica) =>
  `<c:cat><c:strRef><c:f>${esc(g.categorias.ref)}</c:f><c:strCache><c:ptCount val="${g.categorias.valores.length}"/>${g.categorias.valores
    .map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`)
    .join('')}</c:strCache></c:strRef></c:cat>`
const val = (s: Grafica['series'][number]) =>
  `<c:val><c:numRef><c:f>${esc(s.ref)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${s.valores.length}"/>${s.valores
    .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
    .join('')}</c:numCache></c:numRef></c:val>`
const etiquetas = (mostrar: 'val' | 'pct', pos = '', formato = '#,##0') =>
  // «;;;» al final oculta las etiquetas en cero (áreas o materiales sin entregas con el filtro elegido)
  `<c:dLbls>${mostrar === 'val' ? `<c:numFmt formatCode="${formato};;;" sourceLinked="0"/>` : ''}${pos ? `<c:dLblPos val="${pos}"/>` : ''}<c:showLegendKey val="0"/><c:showVal val="${mostrar === 'val' ? 1 : 0}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${mostrar === 'pct' ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`

export function xmlGrafica(g: Grafica): string {
  const leyenda = g.series.length > 1 || g.tipo === 'dona' ? `<c:legend><c:legendPos val="${g.tipo === 'dona' ? 'r' : 't'}"/><c:overlay val="0"/>${texto(900)}</c:legend>` : ''
  let area: string
  if (g.tipo === 'dona') {
    const s = g.series[0]
    const puntos = g.categorias.valores.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>${relleno(COLORES[i % COLORES.length])}</c:spPr></c:dPt>`).join('')
    area = `<c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${esc(s.nombre)}</c:v></c:tx>${puntos}${etiquetas('pct').replace('<c:dLbls>', `<c:dLbls>${texto(900, 'FFFFFF', true)}`)}${cat(g)}${val(s)}</c:ser><c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`
  } else {
    const barras = g.tipo === 'barras'
    const series = g.series
      .map(
        (s, i) =>
          `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.nombre)}</c:v></c:tx><c:spPr>${
            barras ? relleno(s.color) : `<a:ln w="28575" cap="rnd">${relleno(s.color)}<a:round/></a:ln>`
          }</c:spPr>${barras ? '<c:invertIfNegative val="0"/>' : `<c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr>${relleno(s.color)}</c:spPr></c:marker>`}${cat(g)}${val(s)}${barras ? '' : '<c:smooth val="0"/>'}</c:ser>`,
      )
      .join('')
    const ejes = `<c:axId val="5001"/><c:axId val="5002"/>`
    const graf = barras
      ? `<c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}${etiquetas('val', 'outEnd', g.formato)}<c:gapWidth val="45"/>${ejes}</c:barChart>`
      : `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}${etiquetas('val', 't', g.formato)}<c:marker val="1"/>${ejes}</c:lineChart>`
    const catAx = `<c:catAx><c:axId val="5001"/><c:scaling><c:orientation val="${barras ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${barras ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln>${relleno('D9D4CA')}</a:ln></c:spPr>${texto(900)}<c:crossAx val="5002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
    const valAx = `<c:valAx><c:axId val="5002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${barras ? 1 : 0}"/><c:axPos val="${barras ? 'b' : 'l'}"/>${
      barras ? '' : `<c:majorGridlines><c:spPr><a:ln w="6350">${relleno('E4E0D8')}</a:ln></c:spPr></c:majorGridlines>`
    }<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${texto(800, '6F7271')}<c:crossAx val="5001"/><c:crosses val="${barras ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`
    area = graf + catAx + valAx
  }
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<c:roundedCorners val="0"/><c:chart>` +
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1">${relleno('235B4E')}</a:defRPr></a:pPr><a:r><a:rPr lang="es-MX" sz="1200" b="1">${relleno('235B4E')}</a:rPr><a:t>${esc(g.titulo)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` +
    `<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${area}</c:plotArea>${leyenda}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:spPr>${relleno('FFFFFF')}<a:ln w="9525">${relleno('E2DED6')}</a:ln></c:spPr>${texto(900)}</c:chartSpace>`
  )
}

function xmlDibujo(graficas: Grafica[]): string {
  const anclas = graficas
    .map(
      (g, i) =>
        `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${g.desde[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.desde[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
        `<xdr:to><xdr:col>${g.hasta[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.hasta[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
        `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Gráfica ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
        `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
        `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i + 1}"/>` +
        `</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`,
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anclas}</xdr:wsDr>`
}

/** Última fila y columna con datos de una hoja (para el filtro automático). */
function dimension(xml: string): { filas: number; columnas: number } {
  let filas = 0
  for (const m of xml.matchAll(/<row r="(\d+)"/g)) filas = Math.max(filas, Number(m[1]))
  const primera = /<row r="1"[^>]*>(.*?)<\/row>/.exec(xml)?.[1] ?? ''
  let columnas = 0
  for (const m of primera.matchAll(/<c r="([A-Z]+)1"/g)) {
    const n = [...m[1]].reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0)
    columnas = Math.max(columnas, n)
  }
  return { filas, columnas }
}

/**
 * Agrega al libro lo que write-excel-file no escribe: listas desplegables, nombres, valores
 * iniciales de las fórmulas, gráficas, filtro automático en las hojas de detalle y la hoja «Datos» oculta.
 */
export async function posprocesarExcel(blob: Blob, t: Tablero, hojas: string[], conFiltro: string[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip: JSZip = await JSZip.loadAsync(await blob.arrayBuffer())
  const leer = (n: string) => zip.file(n)!.async('string')
  const iT = hojas.indexOf(HOJA_TABLERO) + 1
  const rutaT = `xl/worksheets/sheet${iT}.xml`

  // Libro: nombres, recálculo al abrir y hoja Datos oculta
  let libro = await leer('xl/workbook.xml')
  const nombres = [...t.nombres.map(([n, f]) => `<definedName name="${n}">${esc(f)}</definedName>`)]
  const filtros: string[] = []
  for (const hoja of conFiltro) {
    const i = hojas.indexOf(hoja)
    if (i < 0) continue
    const ruta = `xl/worksheets/sheet${i + 1}.xml`
    let xml = await leer(ruta)
    const { filas, columnas } = dimension(xml)
    if (filas < 2 || !columnas) continue
    const rango = `$A$1:$${letra(columnas)}$${filas}`
    xml = xml.replace('</sheetData>', `</sheetData><autoFilter ref="${rango.replace(/\$/g, '')}"/>`)
    zip.file(ruta, xml)
    filtros.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(hoja)}'!${rango}</definedName>`)
  }
  libro = libro.replace(/<definedNames\/>|<definedNames>.*?<\/definedNames>/, `<definedNames>${[...filtros, ...nombres].join('')}</definedNames>`)
  libro = libro.replace(/<calcPr[^>]*\/>/, '<calcPr calcId="191029" fullCalcOnLoad="1"/>')
  libro = libro.replace(new RegExp(`(<sheet [^>]*name="${HOJA_DATOS}")`), '$1 state="hidden"')
  zip.file('xl/workbook.xml', libro)

  // Tablero: valores iniciales de las fórmulas, listas desplegables y dibujo con las gráficas
  let hojaT = await leer(rutaT)
  hojaT = hojaT.replace(/<c r="([A-Z]+\d+)"([^>]*)><f>(.*?)<\/f><\/c>/g, (todo, celda: string, atr: string, f: string) => {
    const v = t.valores.get(celda)
    if (v === undefined) return todo
    return typeof v === 'number' ? `<c r="${celda}"${atr}><f>${f}</f><v>${v}</v></c>` : `<c r="${celda}"${atr} t="str"><f>${f}</f><v>${esc(v)}</v></c>`
  })
  const listas = `<dataValidations count="${t.listas.length}">${t.listas
    .map((l) => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${l.celda}"><formula1>${esc(l.rango)}</formula1></dataValidation>`)
    .join('')}</dataValidations>`
  hojaT = hojaT.replace('</worksheet>', `${listas}<drawing r:id="rIdDibujo"/></worksheet>`)
  zip.file(rutaT, hojaT)
  const relsT = `xl/worksheets/_rels/sheet${iT}.xml.rels`
  const rels = zip.file(relsT) ? await leer(relsT) : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  zip.file(
    relsT,
    rels.replace('</Relationships>', '<Relationship Id="rIdDibujo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>'),
  )
  zip.file('xl/drawings/drawing1.xml', xmlDibujo(t.graficas))
  zip.file(
    'xl/drawings/_rels/drawing1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${t.graficas
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${i + 1}.xml"/>`)
      .join('')}</Relationships>`,
  )
  t.graficas.forEach((g, i) => zip.file(`xl/charts/chart${i + 1}.xml`, xmlGrafica(g)))
  let tipos = await leer('[Content_Types].xml')
  tipos = tipos.replace(
    '</Types>',
    `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>${t.graficas
      .map((_, i) => `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`)
      .join('')}</Types>`,
  )
  zip.file('[Content_Types].xml', tipos)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
