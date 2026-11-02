import { calcularExistencias, ETIQUETA_NIVEL, existencia, nivelStock, variantesDe } from '../domain/logica'
import { fechaDeTs, horaLocal } from '../lib/util'
import type { DatosReporte, Fuentes } from './datos'
import { contaminadoEn } from '../domain/contaminado'
import { entregasContaminadas, fechasCortas, otrosTexto, pct, textoVariacion, titulo, type OpcionesEntregable } from './datos'
import { armarTablero, HOJA_DATOS, HOJA_TABLERO, posprocesarExcel, type Celda, type Fila } from './excelTablero'

// Libro de Excel del reporte: un «Tablero» con listas desplegables y gráficas, el resumen y una
// hoja por tema, con encabezados fijos, filtro automático y columnas con ancho adecuado.

const ENC = { fontWeight: 'bold' as const, textColor: '#FFFFFF', backgroundColor: '#235B4E' }
const enc = (...t: string[]): Fila => t.map((value) => ({ value, ...ENC }))
const v = (value: string | number | null | undefined): Celda => ({ value: value ?? '' })
const n = (value: number): Celda => ({ value, type: Number })

export async function generarExcel(d: DatosReporte, f: Fuentes, opciones: OpcionesEntregable = {}): Promise<Blob> {
  const { default: escribir } = await import('write-excel-file/universal')
  const mats = new Map(f.materiales.map((m) => [m.id, m]))
  const ubis = f.ubicaciones.filter((u) => u.activo).sort((a, b) => a.orden - b.orden)
  const motivos = new Map(f.motivos.map((m) => [m.id, m.texto]))

  // Resumen
  const resumen: Fila[] = [
    [{ value: 'Informe de Entrega de Equipo de Protección Personal', fontWeight: 'bold', textColor: '#235B4E' }],
    [v(d.titulo)],
    ...(d.filtroTexto ? [[v(`Filtro: ${d.filtroTexto}`)]] : []),
    [v(`Generado el ${d.generado}`)],
    [],
    enc('Indicador', 'Valor'),
    [v('Personal atendido'), n(d.personas)],
    [v('Áreas atendidas'), n(d.areas)],
    [v('Piezas de EPP entregadas'), n(d.piezas)],
    [v('Cascos entregados'), n(d.cascos)],
    [v('% del personal que solicitó casco'), { value: pct(d.personasConCasco, d.personas) / 100, type: Number, format: '0.0%' }],
    [v('Materiales por reabastecer'), n(d.reabastecer.length)],
    [v('Préstamos vencidos'), n(d.prestamosVencidos.length)],
    [v('Entregas realizadas'), n(d.entregas.length)],
    [v('Casos de solicitantes recurrentes'), n(d.recurrentes.length)],
    [v('Cambios de EPP contaminado'), n(d.contaminado.eventos)],
    [],
    [{ value: 'Hallazgos', fontWeight: 'bold', textColor: '#691C32' }],
    ...d.hallazgos.map((h) => [{ value: h, wrap: true }]),
  ]
  const subtitulo = (t: string): Fila[] => [[], [{ value: t, fontWeight: 'bold', textColor: '#691C32' }]]

  // Comparativo contra el periodo anterior
  resumen.push(...subtitulo(`Contra el periodo anterior (${d.anterior.titulo})`))
  resumen.push(enc('Indicador', 'Actual', 'Anterior', 'Cambio'))
  for (const [nombre, actual, antes] of [
    ['Personas atendidas', d.personas, d.anterior.personas],
    ['Entregas', d.entregas.length, d.anterior.entregas],
    ['Piezas entregadas', d.piezas, d.anterior.piezas],
    ['Cascos', d.cascos, d.anterior.cascos],
    ['Casos recurrentes', d.recurrentes.length, d.anterior.recurrentes],
    ['Cambios de EPP contaminado', d.contaminado.eventos, d.anterior.contaminado],
  ] as [string, number, number][]) {
    resumen.push([v(nombre), n(actual), n(antes), { value: textoVariacion(actual, antes), fontWeight: 'bold' }])
  }

  // Hallazgos y alertas priorizados con su acción sugerida
  if (d.alertas.length) {
    resumen.push(...subtitulo('Alertas priorizadas'))
    resumen.push(enc('Alerta', 'Nivel', 'Acción sugerida'))
    const NIVEL = { alta: ['ALERTA', '#691C32'], media: ['ATENCIÓN', '#9D7B45'], ok: ['BIEN', '#235B4E'] } as const
    for (const a of d.alertas) resumen.push([{ value: a.titulo, wrap: true }, { value: NIVEL[a.nivel][0], fontWeight: 'bold', textColor: NIVEL[a.nivel][1] }, { value: a.accion, wrap: true }])
  }

  // Solicitantes recurrentes más frecuentes (la lista completa está en su hoja)
  resumen.push(...subtitulo(`Solicitantes recurrentes (${d.recurrentes.length} caso${d.recurrentes.length === 1 ? '' : 's'}; 2 o más entregas del mismo material)`))
  if (d.recurrentes.length) {
    resumen.push(enc('Solicitante', 'Veces', 'Material', 'Área', 'Piezas', 'Última'))
    for (const r of [...d.recurrentes].sort((a, b) => b.veces - a.veces || b.piezas - a.piezas).slice(0, 10)) {
      resumen.push([v(`${r.nombre} (${r.rpe})`), n(r.veces), v(r.material), v(titulo(r.area)), n(r.piezas), v(r.ultima)])
    }
    if (d.recurrentes.length > 10) resumen.push([v(`Se muestran los 10 casos más frecuentes; el listado completo está en la hoja «Solicitantes recurrentes».`)])
  } else resumen.push([v('Sin solicitantes recurrentes en el periodo.')])

  // EPP contaminado: material del periodo y los últimos 10 folios entregados
  resumen.push(...subtitulo(`EPP contaminado (${d.contaminado.eventos} cambio${d.contaminado.eventos === 1 ? '' : 's'} · ${d.contaminado.piezas} pieza${d.contaminado.piezas === 1 ? '' : 's'} en el periodo)`))
  if (d.contaminado.porMaterial.length) {
    resumen.push(enc('Material contaminado', 'Piezas', 'Cambios'))
    for (const m of d.contaminado.porMaterial) resumen.push([v(m.material), n(m.piezas), n(m.eventos)])
  } else resumen.push([v('Sin cambios de EPP contaminado en el periodo.')])
  if (d.contaminado.ultimos.length) {
    resumen.push(...subtitulo(`Últimos ${d.contaminado.ultimos.length} folios de EPP contaminado entregados`))
    resumen.push(enc('Solicitante', 'Folio formato', 'Material', 'Área', 'Piezas', 'Fecha'))
    for (const c of d.contaminado.ultimos) {
      resumen.push([v(`${c.entrega.nombre} (${c.entrega.rpe})`), v(c.folioFormato || 'sin folio'), { value: c.materiales.join(' · '), wrap: true }, v(titulo(c.entrega.area)), n(c.piezas), v(c.entrega.fecha)])
    }
  }

  // Por material
  const material: Fila[] = [
    enc('Material', 'Piezas', 'Personas', '% del personal', 'Tallas'),
    ...d.materiales.map((m) => [
      v(m.nombre),
      n(m.piezas),
      n(m.personas),
      { value: pct(m.personas, d.personas) / 100, type: Number, format: '0.0%' } as Celda,
      v([...m.tallas].sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}: ${c}`).join(' · ')),
    ]),
  ]

  // Por área (con todos los materiales como columnas)
  const columnasMat = d.materiales.map((m) => m.id)
  const porArea: Fila[] = [
    enc('Área', 'Personas', 'Entregas', 'Piezas', 'Cascos', ...columnasMat.map((id) => mats.get(id)?.nombre ?? id)),
    ...d.porArea.map((a) => [v(titulo(a.area)), n(a.personas), n(a.entregas), n(a.piezas), n(a.cascos), ...columnasMat.map((id) => n(a.porMaterial[id] ?? 0))]),
  ]

  // Detalle de entregas
  const detalle: Fila[] = [
    enc('Folio', 'Fecha', 'Hora', 'RPE', 'Nombre', 'Área', 'Material', 'Talla', 'Cantidad', 'Tipo', 'Motivo', 'Despachó', 'Equipo', 'Observaciones', 'Categoría', 'Contaminado'),
    ...d.entregas.flatMap((e) =>
      e.lineas.map((l) => [
        v(e.folio), v(e.fecha), v(e.hora), v(e.rpe), v(e.nombre), v(e.area), v(mats.get(l.materialId)?.nombre ?? l.materialId), v(l.varianteId), n(l.cantidad),
        v(l.esResguardo ? 'Resguardo' : l.esPrestamo ? 'Préstamo' : 'Consumible'), v(l.motivoId ? motivos.get(l.motivoId) : ''), v(e.usuarioNombre), v(e.equipo), v(e.observaciones),
        v(f.categorias?.find((c) => c.id === mats.get(l.materialId)?.categoriaId)?.nombre ?? mats.get(l.materialId)?.categoriaId ?? ''), v(contaminadoEn(e, l.materialId) ? 'Sí' : ''),
      ]),
    ),
  ]

  // Existencias actuales
  const exist = calcularExistencias(f.movimientos)
  const existencias: Fila[] = [enc('Material', 'Talla', ...ubis.map((u) => u.nombre), 'Total', 'Mínimo', 'Estado')]
  for (const m of f.materiales.filter((x) => x.activo).sort((a, b) => a.orden - b.orden)) {
    for (const t of variantesDe(m)) {
      const porUbi = ubis.map((u) => existencia(exist, m.id, t, u.id))
      const total = porUbi.reduce((a, b) => a + b, 0)
      const min = m.stockMin[t] ?? 0
      const nivel = nivelStock(total, min)
      existencias.push([v(m.nombre), v(t), ...porUbi.map(n), n(total), n(min), { value: ETIQUETA_NIVEL[nivel], ...(nivel ? { textColor: '#B3261E', fontWeight: 'bold' as const } : {}) }])
    }
  }

  // Resguardos y préstamos activos
  const activos = f.resguardos.filter((r) => r.estatus === 'ACTIVO').sort((a, b) => (a.tipo ?? '').localeCompare(b.tipo ?? '') || a.fechaEntrega.localeCompare(b.fechaEntrega))
  const resguardos: Fila[] = [
    enc('Folio', 'Tipo', 'RPE', 'Nombre', 'Área', 'Material', 'Talla', 'Cantidad', 'Entregado', 'Devolver antes de', 'Supervisor', 'RPE supervisor', 'Ext. supervisor'),
    ...activos.map((r) => [
      v(r.folioSI), v(r.tipo === 'prestamo' ? 'Préstamo' : 'Resguardo'), v(r.rpe), v(r.nombre), v(r.area), v(mats.get(r.materialId)?.nombre ?? r.materialId), v(r.varianteId), n(r.cantidad),
      v(r.fechaEntrega), v(r.vence ?? ''), v(r.supervisor?.nombre ?? ''), v(r.supervisor?.rpe ?? ''), v(r.supervisor?.extension ?? ''),
    ]),
  ]

  // Movimientos del periodo (kardex)
  const movs = f.movimientos.filter((m) => {
    const fecha = fechaDeTs(m.ts)
    return fecha >= d.desde && fecha <= d.hasta
  })
  const nombresUbi = new Map(f.ubicaciones.map((u) => [u.id, u.nombre]))
  const kardex: Fila[] = [
    enc('Fecha', 'Hora', 'Tipo', 'Material', 'Talla', 'Almacén', 'Cantidad', 'Referencia', 'Motivo', 'Nota', 'Usuario', 'Equipo'),
    ...movs.map((m) => [
      v(fechaDeTs(m.ts)), v(horaLocal(new Date(m.ts))), v(m.tipo), v(mats.get(m.materialId)?.nombre ?? m.materialId), v(m.varianteId), v(nombresUbi.get(m.ubicacionId)), n(m.cantidad), v(m.ref), v(m.motivo), v(m.nota), v(m.usuarioNombre), v(m.equipo),
    ]),
  ]

  // Solicitantes recurrentes por área y material
  const recurrentes: Fila[] = [
    enc('Área', 'Material', 'RPE', 'Nombre', 'Tipo', 'Veces', 'Piezas', 'Primera', 'Última', 'Comentarios al despachar'),
    ...d.recurrentes.map((r) => [v(r.area), v(r.material), v(r.rpe), v(r.nombre), v(r.tipo), n(r.veces), n(r.piezas), v(r.primera), v(r.ultima), { value: r.notas.join(' · '), wrap: true }]),
  ]
  if (!d.recurrentes.length) recurrentes.push([v('Sin solicitantes recurrentes en el periodo.')])
  // Con detalle: fechas de cada entrega y lo que más se llevó además, y una hoja con cada entrega
  const conDetalle = !!opciones.detalleRecurrentes && d.recurrentes.length > 0
  if (conDetalle) {
    recurrentes[0].push(...enc('Fechas de las entregas', 'También recibió en esas entregas'))
    d.recurrentes.forEach((r, i) => recurrentes[i + 1].push({ value: fechasCortas(r, 60), wrap: true }, { value: otrosTexto(r, 6), wrap: true }))
  }
  const detalleRec: Fila[] = [
    enc('Área', 'Solicitante', 'RPE', 'Material', 'Fecha', 'Hora', 'Folio', 'Piezas'),
    ...d.recurrentes.flatMap((r) => r.detalle.map((x) => [v(r.area), v(r.nombre), v(r.rpe), v(r.material), v(x.fecha), v(x.hora), v(x.folio), n(x.cantidad)])),
  ]

  // Cambios de EPP contaminado (con el folio del formato en papel)
  const contaminadas = entregasContaminadas(d.entregas, mats, f.personal)
  const contaminado: Fila[] = [
    enc('Folio formato', 'Fecha', 'Hora', 'RPE', 'Nombre', 'Área', 'Material contaminado', 'Piezas', 'Actividad', 'Supervisor', 'Vo. Bo. PR', 'Entrega', 'Despachó'),
    ...contaminadas.map((c) => [
      v(c.folioFormato || 'sin folio'), v(c.entrega.fecha), v(c.hora), v(c.entrega.rpe), v(c.entrega.nombre), v(c.entrega.area), { value: c.materiales.join(' · '), wrap: true }, n(c.piezas),
      v(c.actividad), v(c.supervisor), v(c.vistoBueno), v(c.entrega.folio), v(c.entrega.usuarioNombre),
    ]),
  ]

  const ancho = (...w: number[]) => w.map((width) => ({ width }))
  const tab = armarTablero(d, f, {
    resumen: 'Resumen',
    recurrentes: 'Solicitantes recurrentes',
    contaminado: contaminadas.length ? 'EPP contaminado' : undefined,
    entregas: 'Entregas',
    porArea: 'Por área',
  })
  const hojas = [
    { data: tab.tablero, sheet: HOJA_TABLERO, columns: ancho(34, 16, 16, 21, 21, 21, 3, ...Array(16).fill(10)) },
    { data: resumen, sheet: 'Resumen', columns: ancho(70, 14, 30, 30, 9, 11) },
    // Recurrentes y contaminado van junto al resumen para que se encuentren sin buscar
    { data: recurrentes, sheet: 'Solicitantes recurrentes', columns: ancho(30, 30, 9, 34, 12, 8, 8, 11, 11, 50, ...(conDetalle ? [44, 44] : [])), stickyRowsCount: 1 },
    ...(conDetalle ? [{ data: detalleRec, sheet: 'Detalle de recurrentes', columns: ancho(30, 34, 9, 30, 11, 7, 18, 8), stickyRowsCount: 1 }] : []),
    ...(contaminadas.length ? [{ data: contaminado, sheet: 'EPP contaminado', columns: ancho(16, 11, 7, 9, 34, 30, 40, 8, 30, 26, 26, 16, 20), stickyRowsCount: 1 }] : []),
    { data: material, sheet: 'Por material', columns: ancho(30, 10, 10, 14, 40), stickyRowsCount: 1 },
    { data: porArea, sheet: 'Por área', columns: ancho(34, 10, 10, 10, 10, ...columnasMat.map(() => 14)), stickyRowsCount: 1, stickyColumnsCount: 1 },
    { data: detalle, sheet: 'Entregas', columns: ancho(16, 11, 7, 9, 34, 30, 28, 7, 9, 12, 28, 20, 8, 30), stickyRowsCount: 1 },
    { data: existencias, sheet: 'Existencias', columns: ancho(30, 7, ...ubis.map(() => 18), 9, 9, 11), stickyRowsCount: 1 },
    { data: resguardos, sheet: 'Resguardos y préstamos', columns: ancho(20, 11, 9, 34, 30, 28, 7, 9, 11, 16, 30, 12, 12), stickyRowsCount: 1 },
    { data: kardex, sheet: 'Movimientos', columns: ancho(11, 7, 12, 28, 7, 22, 9, 22, 28, 30, 20, 8), stickyRowsCount: 1 },
    { data: tab.datos, sheet: HOJA_DATOS, columns: ancho(30, 28, 18, 12, 8, 10, 8, 8, 2, 2, 30, 28, 18, 12, 8, 10, 30, 18, 12, 8, 10, 2, 30, 12, 18) },
  ]
  const nombres = hojas.map((h) => h.sheet)
  const conFiltro = nombres.filter((h) => ![HOJA_TABLERO, 'Resumen', HOJA_DATOS].includes(h))
  return posprocesarExcel(await escribir(hojas as never).toBlob(), tab, nombres, conFiltro)
}
