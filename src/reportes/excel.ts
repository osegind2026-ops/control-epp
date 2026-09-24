import { calcularExistencias, ETIQUETA_NIVEL, existencia, nivelStock, variantesDe } from '../domain/logica'
import { fechaDeTs, horaLocal } from '../lib/util'
import type { DatosReporte, Fuentes } from './datos'
import { pct, titulo } from './datos'

// Libro de Excel del reporte: una hoja por tema, con encabezados fijos y
// columnas con ancho adecuado para filtrar o hacer tablas dinámicas.

type Celda = { value: string | number | null; fontWeight?: 'bold'; color?: string; backgroundColor?: string; type?: typeof String | typeof Number; wrap?: boolean; format?: string }
type Fila = Celda[]

const ENC = { fontWeight: 'bold' as const, color: '#FFFFFF', backgroundColor: '#235B4E' }
const enc = (...t: string[]): Fila => t.map((value) => ({ value, ...ENC }))
const v = (value: string | number | null | undefined): Celda => ({ value: value ?? '' })
const n = (value: number): Celda => ({ value, type: Number })

export async function generarExcel(d: DatosReporte, f: Fuentes): Promise<Blob> {
  const { default: escribir } = await import('write-excel-file/universal')
  const mats = new Map(f.materiales.map((m) => [m.id, m]))
  const ubis = f.ubicaciones.filter((u) => u.activo).sort((a, b) => a.orden - b.orden)
  const motivos = new Map(f.motivos.map((m) => [m.id, m.texto]))

  // Resumen
  const resumen: Fila[] = [
    [{ value: 'Entrega de Equipo de Protección Personal', fontWeight: 'bold', color: '#235B4E' }],
    [v(d.titulo)],
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
    [],
    [{ value: 'Hallazgos', fontWeight: 'bold', color: '#691C32' }],
    ...d.hallazgos.map((h) => [{ value: h, wrap: true }]),
  ]

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
    enc('Folio', 'Fecha', 'Hora', 'RPE', 'Nombre', 'Área', 'Material', 'Talla', 'Cantidad', 'Tipo', 'Motivo', 'Despachó', 'Equipo', 'Observaciones'),
    ...d.entregas.flatMap((e) =>
      e.lineas.map((l) => [
        v(e.folio), v(e.fecha), v(e.hora), v(e.rpe), v(e.nombre), v(e.area), v(mats.get(l.materialId)?.nombre ?? l.materialId), v(l.varianteId), n(l.cantidad),
        v(l.esResguardo ? 'Resguardo' : l.esPrestamo ? 'Préstamo' : 'Consumible'), v(l.motivoId ? motivos.get(l.motivoId) : ''), v(e.usuarioNombre), v(e.equipo), v(e.observaciones),
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
      existencias.push([v(m.nombre), v(t), ...porUbi.map(n), n(total), n(min), { value: ETIQUETA_NIVEL[nivel], ...(nivel ? { color: '#B3261E', fontWeight: 'bold' as const } : {}) }])
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

  const ancho = (...w: number[]) => w.map((width) => ({ width }))
  const hojas = [
    { data: resumen, sheet: 'Resumen', columns: ancho(70, 14) },
    { data: material, sheet: 'Por material', columns: ancho(30, 10, 10, 14, 40), stickyRowsCount: 1 },
    { data: porArea, sheet: 'Por área', columns: ancho(34, 10, 10, 10, 10, ...columnasMat.map(() => 14)), stickyRowsCount: 1, stickyColumnsCount: 1 },
    { data: detalle, sheet: 'Entregas', columns: ancho(16, 11, 7, 9, 34, 30, 28, 7, 9, 12, 28, 20, 8, 30), stickyRowsCount: 1 },
    { data: existencias, sheet: 'Existencias', columns: ancho(30, 7, ...ubis.map(() => 18), 9, 9, 11), stickyRowsCount: 1 },
    { data: resguardos, sheet: 'Resguardos y préstamos', columns: ancho(20, 11, 9, 34, 30, 28, 7, 9, 11, 16, 30, 12, 12), stickyRowsCount: 1 },
    { data: kardex, sheet: 'Movimientos', columns: ancho(11, 7, 12, 28, 7, 22, 9, 22, 28, 30, 20, 8), stickyRowsCount: 1 },
  ]
  return escribir(hojas as never).toBlob()
}
