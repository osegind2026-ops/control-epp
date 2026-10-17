import { db } from '../db/db'
import { esContaminada, materialesContaminados } from '../domain/contaminado'
import { calcularExistencias, existencia, tipoDe, TIPOS_TRABAJADOR, variantesDe } from '../domain/logica'
import { fechaDeTs, horaLocal } from '../lib/util'
import { nombreRol, rolDe } from './permisos'
import { armarRespaldo, csvDetalle, csvKardex, nombreArchivo } from './respaldo'
import { ErrorNegocio } from './servicios'
import * as S from './store'

// Respaldo completo: un ZIP con todo lo que hay en este equipo, en formatos que sirven
// para restaurar (JSON) y para consultar sin la app (Excel y CSV).
// Solo administrador y encargado de almacén.

/** Claves de configuración que se guardan. La clave de la nube y el token del equipo NO se incluyen. */
const CLAVES_CONFIG = /^(plantillaImagenes|plantillaTextos|bloqueoMin|versionDatos|folio_contaminado_.+|ultimo_folio_resguardo_economico|ultimoIntercambio)$/

type Celda = { value: string | number | null; fontWeight?: 'bold'; color?: string; backgroundColor?: string; type?: typeof Number; wrap?: boolean }
type Fila = Celda[]
const enc = (...t: string[]): Fila => t.map((value) => ({ value, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#235B4E' }))
const v = (value: string | number | null | undefined): Celda => ({ value: value ?? '' })
const n = (value: number): Celda => ({ value, type: Number })
const ancho = (...w: number[]) => w.map((width) => ({ width }))
const si = (b: boolean | undefined) => v(b ? 'SI' : '')

/** Hojas de Excel con los datos de cada tabla, en columnas legibles. */
async function excelCompleto(): Promise<Blob> {
  const { default: escribir } = await import('write-excel-file/universal')
  const mats = S.materialesPorId.value
  const motivos = new Map(S.motivos.value.map((m) => [m.id, m.texto]))
  const ubis = new Map(S.ubicaciones.value.map((u) => [u.id, u.nombre]))
  const nombreMat = (id: string) => mats.get(id)?.nombre ?? id

  const entregas: Fila[] = [
    enc('Folio', 'Fecha', 'Hora', 'RPE', 'Nombre', 'Área', 'Material', 'Talla', 'Cantidad', 'Tipo', 'Motivo', 'Despachó', 'Equipo', 'Estado', 'EPP contaminado', 'Folio formato', 'Comentario recurrencia', 'Observaciones', 'Captura posterior', 'Anulación'),
    ...S.entregas.value.flatMap((e) => {
      const contaminados = new Set(materialesContaminados(e))
      return e.lineas.map((l) => [
        v(e.folio), v(e.fecha), v(e.hora), v(e.rpe), v(e.nombre), v(e.area), v(nombreMat(l.materialId)), v(l.varianteId), n(l.cantidad),
        v(l.esResguardo ? 'Resguardo' : l.esPrestamo ? 'Préstamo' : 'Consumible'), v(l.motivoId ? motivos.get(l.motivoId) : ''), v(e.usuarioNombre), v(e.equipo),
        v(e.estado === 'anulada' ? 'ANULADA' : 'OK'), v(esContaminada(e) && contaminados.has(l.materialId) ? 'SI' : ''), v(e.contaminado?.folio), v(e.recurrencia?.nota),
        v(e.observaciones), v(e.capturada ? fechaDeTs(e.capturada) : ''),
        v(e.anulacion ? `${fechaDeTs(e.anulacion.ts)} · ${e.anulacion.usuarioNombre} · ${motivos.get(e.anulacion.motivoId) ?? ''}${e.anulacion.nota ? ` · ${e.anulacion.nota}` : ''}` : ''),
      ])
    }),
  ]

  const movimientos: Fila[] = [
    enc('Fecha', 'Hora', 'Tipo', 'Material', 'Talla', 'Almacén', 'Cantidad', 'Referencia', 'Motivo', 'Nota', 'Usuario', 'Equipo'),
    ...S.movimientos.value.map((m) => [
      v(fechaDeTs(m.ts)), v(horaLocal(new Date(m.ts))), v(m.tipo), v(nombreMat(m.materialId)), v(m.varianteId), v(ubis.get(m.ubicacionId)), n(m.cantidad), v(m.ref), v(m.motivo), v(m.nota), v(m.usuarioNombre), v(m.equipo),
    ]),
  ]

  const exist = calcularExistencias(S.movimientos.value)
  const ubisActivas = S.ubicaciones.value.filter((u) => u.activo)
  const existencias: Fila[] = [enc('Material', 'Talla', ...ubisActivas.map((u) => u.nombre), 'Total', 'Mínimo')]
  for (const m of S.materiales.value.filter((x) => x.activo)) {
    for (const t of variantesDe(m)) {
      const por = ubisActivas.map((u) => existencia(exist, m.id, t, u.id))
      existencias.push([v(m.nombre), v(t), ...por.map(n), n(por.reduce((a, b) => a + b, 0)), n(m.stockMin[t] ?? 0)])
    }
  }

  const personal: Fila[] = [
    enc('RPE', 'Nombre', 'Área', 'Puesto', 'Tipo', 'Activo'),
    ...[...S.personal.value.values()].map((p) => [v(p.rpe), v(p.nombre), v(p.area), v(p.puesto), v(TIPOS_TRABAJADOR[tipoDe(p)]), si(p.activo)]),
  ]

  const resguardos: Fila[] = [
    enc('Folio', 'Tipo', 'RPE', 'Nombre', 'Área', 'Material', 'Talla', 'Cantidad', 'Entregado', 'Estatus', 'Cierre', 'Motivo de cierre', 'Devolver antes de', 'Supervisor', 'RPE supervisor'),
    ...S.resguardos.value.map((r) => [
      v(r.folioSI), v(r.tipo === 'prestamo' ? 'Préstamo' : 'Resguardo'), v(r.rpe), v(r.nombre), v(r.area), v(nombreMat(r.materialId)), v(r.varianteId), n(r.cantidad), v(r.fechaEntrega), v(r.estatus),
      v(r.cierre?.fecha), v(r.cierre?.motivo), v(r.vence), v(r.supervisor?.nombre), v(r.supervisor?.rpe),
    ]),
  ]

  const equipos: Fila[] = [
    enc('Código', 'Equipo', 'Marca', 'Modelo', 'Serie', 'Accesorios', 'Lleva bitácora', 'Próxima calibración', 'Estado', 'Activo', 'Notas'),
    ...S.equipos.value.map((e) => [v(e.codigo), v(e.nombre), v(e.marca), v(e.modelo), v(e.serie), v(e.accesorios.join(' · ')), si(e.llevaBitacora), v(e.calibracion), v(e.estado), si(e.activo), v(e.notas)]),
  ]

  const nombreSI = (r: { corto?: string; nombre: string } | undefined, otro = '') => r?.corto || r?.nombre || otro
  const bitacora: Fila[] = [
    enc('Folio', 'Código', 'Equipo', 'Salida', 'Recibió RPE', 'Recibió', 'Área', 'Actividad', 'Entregó (SI)', 'Lleva libreta', 'Observaciones al entregar', 'Accesorios', 'Estatus', 'Cierre', 'Fecha y hora del cierre', 'Devolvió o transfirió', 'Recibió (SI)', 'Condición', 'Observaciones al recibir', 'Fotos'),
    ...S.prestamosEquipo.value.map((p) => [
      v(p.folio), v(p.equipoCodigo), v(p.equipoNombre), v(`${fechaDeTs(p.ts)} ${horaLocal(new Date(p.ts))}`), v(p.rpe), v(p.nombre), v(p.area), v(p.uso), v(nombreSI(p.entregoSI, p.usuarioNombre)), si(p.bitacora),
      v(p.observaciones), v(p.accesorios.join(' · ')), v(p.estatus), v(p.regreso ? (p.regreso.tipo === 'transferencia' ? 'Transferencia' : 'Devolución') : ''),
      v(p.regreso ? `${fechaDeTs(p.regreso.ts)} ${horaLocal(new Date(p.regreso.ts))}` : ''), v(p.regreso ? `${p.regreso.devolvioNombre} · ${p.regreso.devolvioRpe}` : ''),
      v(p.regreso ? nombreSI(p.regreso.recibioSI, p.regreso.usuarioNombre) : ''), v(p.regreso?.condicion), v(p.regreso?.comentarios), n((p.fotos?.length ?? 0) + (p.regreso?.fotos?.length ?? 0)),
    ]),
  ]

  const personalSI: Fila[] = [enc('RPE', 'Nombre', 'Nombre corto', 'Activo'), ...S.personalSI.value.map((x) => [v(x.rpe), v(x.nombre), v(x.corto), si(x.activo)])]
  const observaciones: Fila[] = [enc('Observación', 'Gravedad', 'Activa'), ...S.obsEquipo.value.map((o) => [v(o.texto), v({ ok: 'Sin novedad', detalle: 'Detalle', dano: 'Daño' }[o.tipo]), si(o.activo)])]

  const materiales: Fila[] = [
    enc('Material', 'Categoría', 'Tipo', 'Tallas', 'Activo'),
    ...S.materiales.value.map((m) => [v(m.nombre), v(S.categorias.value.find((c) => c.id === m.categoriaId)?.nombre ?? m.categoriaId), v(m.tipo), v(m.variantes.map((x) => x.id).join(' · ')), si(m.activo)]),
  ]

  // Sin PIN ni claves: solo quién tiene acceso y con qué rol
  const usuarios: Fila[] = [enc('Nombre', 'Rol', 'Activo'), ...S.usuarios.value.map((u) => [v(u.nombre), v(nombreRol(rolDe(u))), si(u.activo)])]

  const hojas = [
    { data: entregas, sheet: 'Entregas', columns: ancho(16, 11, 7, 9, 34, 30, 28, 7, 9, 12, 28, 20, 8, 10, 11, 16, 30, 30, 12, 40), stickyRowsCount: 1 },
    { data: movimientos, sheet: 'Movimientos', columns: ancho(11, 7, 12, 28, 7, 22, 9, 22, 28, 40, 20, 8), stickyRowsCount: 1 },
    { data: existencias, sheet: 'Existencias', columns: ancho(30, 7, ...ubisActivas.map(() => 18), 9, 9), stickyRowsCount: 1 },
    { data: personal, sheet: 'Personal', columns: ancho(9, 40, 32, 24, 12, 8), stickyRowsCount: 1 },
    { data: resguardos, sheet: 'Resguardos y préstamos', columns: ancho(20, 11, 9, 34, 30, 28, 7, 9, 11, 10, 11, 30, 16, 30, 12), stickyRowsCount: 1 },
    { data: equipos, sheet: 'Equipos a resguardo', columns: ancho(12, 22, 16, 16, 18, 40, 10, 14, 12, 8, 30), stickyRowsCount: 1 },
    { data: bitacora, sheet: 'Bitácora de equipos', columns: ancho(18, 12, 22, 16, 10, 30, 28, 30, 14, 10, 30, 40, 10, 14, 16, 30, 14, 10, 40, 8), stickyRowsCount: 1 },
    { data: personalSI, sheet: 'Personal de SI', columns: ancho(9, 40, 16, 8), stickyRowsCount: 1 },
    { data: observaciones, sheet: 'Observaciones de equipos', columns: ancho(40, 14, 8), stickyRowsCount: 1 },
    { data: materiales, sheet: 'Materiales', columns: ancho(34, 20, 12, 30, 8), stickyRowsCount: 1 },
    { data: usuarios, sheet: 'Usuarios', columns: ancho(30, 24, 8), stickyRowsCount: 1 },
  ]
  return escribir(hojas as never).toBlob()
}

const LEEME = (equipo: string, fecha: string, cuentas: string) => `CONTROL EPP - RESPALDO COMPLETO
===============================
Equipo: ${equipo}
Generado: ${fecha}

${cuentas}

QUÉ CONTIENE ESTE ARCHIVO
-------------------------
- CFE_EPP_Respaldo_*.json   Respaldo restaurable con TODA la información de este equipo
                            (entregas, movimientos, personal, resguardos, equipos, usuarios,
                            fotos, catálogo, kits y motivos). Para recuperarlo: en la app,
                            Ajustes > Respaldo en archivo > Cargar respaldo > Combinar.
                            Incluye los PIN de los usuarios en forma cifrada: guárdelo en un
                            lugar seguro y no lo comparta.
- Datos_completos.xlsx      Todo lo anterior en hojas de Excel para consultarlo sin la app.
- Entregas_detalle.csv      Un renglón por material entregado.
- Movimientos.csv           Kardex completo de inventario.
- configuracion.json        Plantilla de reportes, último folio impreso de los formatos y
                            tiempo de bloqueo. No incluye la clave de la nube ni claves del equipo.
`

/** Genera el ZIP del respaldo completo. Solo administrador o encargado de almacén. */
export async function crearRespaldoCompleto(): Promise<{ nombre: string; blob: Blob; resumen: string }> {
  const rol = S.sesion.value?.rol
  if (rol !== 'admin' && rol !== 'almacen') throw new ErrorNegocio('Solo un administrador o el encargado de almacén puede crear el respaldo completo.')
  const { default: JSZip } = await import('jszip')

  const respaldo = await armarRespaldo()
  const config = Object.fromEntries((await db.config.toArray()).filter((f) => CLAVES_CONFIG.test(f.clave)).map((f) => [f.clave, f.valor]))
  const equipo = respaldo.equipoOrigen ? `${respaldo.equipoOrigen.codigo} (${respaldo.equipoOrigen.nombre})` : 'sin nombre'
  const cuentas = [
    `${S.entregas.value.length} entregas`, `${S.movimientos.value.length} movimientos`, `${S.personal.value.size} trabajadores`, `${S.resguardos.value.length} resguardos y préstamos`,
    `${S.equipos.value.length} equipos a resguardo`, `${S.prestamosEquipo.value.length} préstamos de equipo`, `${S.usuarios.value.length} usuarios`, `${S.fotos.value.size} fotos`,
  ]
  const resumen = cuentas.join(' · ')

  const zip = new JSZip()
  zip.file(nombreArchivo(`CFE_EPP_Respaldo_${respaldo.equipoOrigen?.codigo ?? ''}`, 'json'), JSON.stringify(respaldo))
  zip.file('Datos_completos.xlsx', await excelCompleto())
  zip.file('Entregas_detalle.csv', csvDetalle(S.entregas.value))
  zip.file('Movimientos.csv', csvKardex())
  zip.file('configuracion.json', JSON.stringify(config, null, 2))
  zip.file('LEEME.txt', LEEME(equipo, new Date().toLocaleString('es-MX'), `Contiene: ${resumen}.`))
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  return { nombre: nombreArchivo(`CFE_EPP_Respaldo_COMPLETO_${respaldo.equipoOrigen?.codigo ?? ''}`, 'zip'), blob, resumen }
}
