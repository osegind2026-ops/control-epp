import { db, guardarConfig, TABLAS, type NombreTabla } from '../db/db'
import { COLUMNAS_EXCEL } from '../db/semilla'
import { ganaEntrante } from '../domain/fusion'
import type { Entrega, Trabajador } from '../domain/types'
import { csvq, fechaDeTs, fechaLocal, horaLocal } from '../lib/util'
import * as S from './store'
import { ErrorNegocio } from './servicios'

// ---------- Respaldo JSON ----------

export interface Respaldo {
  app: 'control-epp'
  version: 2
  generado: string
  equipoOrigen: { codigo: string; nombre: string } | null
  folios: Record<string, number>
  datos: Partial<Record<NombreTabla, unknown[]>>
}

export async function armarRespaldo(): Promise<Respaldo> {
  const datos: Respaldo['datos'] = {}
  for (const t of TABLAS) datos[t] = await (db[t] as unknown as { toArray: () => Promise<unknown[]> }).toArray()
  const eq = S.dispositivo.value
  return {
    app: 'control-epp',
    version: 2,
    generado: new Date().toISOString(),
    equipoOrigen: eq ? { codigo: eq.codigo, nombre: eq.nombre } : null,
    folios: S.folios.value,
    datos,
  }
}

export async function marcarRespaldado(): Promise<void> {
  const ahora = new Date().toISOString()
  await guardarConfig('ultimoRespaldo', ahora)
  await guardarConfig('cambiosSinRespaldo', 0)
  S.ultimoRespaldo.value = ahora
  S.cambiosSinRespaldo.value = 0
}

export function leerRespaldo(texto: string): Respaldo {
  let data: Respaldo
  try {
    data = JSON.parse(texto)
  } catch {
    throw new ErrorNegocio('El archivo no es un JSON válido.')
  }
  if (data?.app !== 'control-epp' || !data.datos) {
    throw new ErrorNegocio('El archivo no es un respaldo de esta versión de la app.')
  }
  return data
}

type ConId = { id?: string; rpe?: string; actualizado?: string }
const llave = (r: ConId) => (r.id ?? r.rpe) as string

function elegir(tabla: NombreTabla, local: ConId, externo: ConId): ConId {
  return ganaEntrante(tabla, local, externo) ? externo : local
}

export interface ResumenImportacion {
  agregados: Partial<Record<NombreTabla, number>>
  actualizados: number
}

export async function importarRespaldo(r: Respaldo, modo: 'combinar' | 'reemplazar'): Promise<ResumenImportacion> {
  const resumen: ResumenImportacion = { agregados: {}, actualizados: 0 }
  await db.transaction('rw', TABLAS.map((t) => db[t]), async () => {
    for (const t of TABLAS) {
      const externos = (r.datos[t] ?? []) as ConId[]
      const tabla = db[t] as unknown as {
        clear: () => Promise<void>
        bulkPut: (x: unknown[]) => Promise<unknown>
        toArray: () => Promise<ConId[]>
      }
      if (modo === 'reemplazar') {
        await tabla.clear()
        await tabla.bulkPut(externos)
        resumen.agregados[t] = externos.length
        continue
      }
      const locales = new Map((await tabla.toArray()).map((x) => [llave(x), x]))
      const cambios: ConId[] = []
      let nuevos = 0
      for (const e of externos) {
        const l = locales.get(llave(e))
        if (!l) {
          cambios.push(e)
          nuevos++
        } else if (elegir(t, l, e) === e && JSON.stringify(l) !== JSON.stringify(e)) {
          cambios.push(e)
          resumen.actualizados++
        }
      }
      if (cambios.length) await tabla.bulkPut(cambios)
      if (nuevos) resumen.agregados[t] = nuevos
    }
  })
  await S.recargar()
  return resumen
}

// ---------- CSV para el libro maestro de Excel ----------

/**
 * Mismo formato que espera la macro ImportarTurnoCSV: 10 columnas de datos y
 * después una columna por material en el orden de COLUMNAS_EXCEL. Las tallas se
 * suman en la columna de su material (salvo la faja, que tiene una por talla).
 * Los materiales sin columna aparecen en MATERIALES_RESUMEN.
 */
export function csvLibroMaestro(lista: Entrega[]): string {
  const mats = S.materialesPorId.value
  let csv = ['FOLIO', 'FECHA', 'HORA', 'RPE', 'NOMBRE', 'AREA', 'MATERIALES_RESUMEN', 'RESGUARDO_FOLIO', 'JUSTIFICACION', 'OBSERVACIONES', ...COLUMNAS_EXCEL].join(',') + '\n'
  const motivos = new Map(S.motivos.value.map((m) => [m.id, m.texto]))
  for (const e of lista.filter((x) => x.estado === 'registrada')) {
    const cols = new Map<string, number>()
    for (const l of e.lineas) {
      const plantilla = mats.get(l.materialId)?.columnaExcel
      if (!plantilla) continue
      const col = plantilla.replace('{v}', l.varianteId)
      cols.set(col, (cols.get(col) ?? 0) + l.cantidad)
    }
    const resumen = e.lineas.map((l) => `${S.nombreMaterial(l.materialId, l.varianteId)}:${l.cantidad}`).join(';')
    const folioSI = S.resguardos.value.find((r) => r.entregaId === e.id)?.folioSI ?? ''
    const justif = [...new Set(e.lineas.filter((l) => l.motivoId).map((l) => motivos.get(l.motivoId!) ?? ''))].join(' / ')
    const fila = [e.folio, e.fecha, e.hora, e.rpe, e.nombre, e.area, resumen, folioSI, justif, e.observaciones].map(csvq)
    csv += [...fila, ...COLUMNAS_EXCEL.map((c) => String(cols.get(c) ?? 0))].join(',') + '\n'
  }
  return '﻿' + csv
}

/** Un renglón por material entregado: el formato más cómodo para filtrar y hacer tablas dinámicas. */
export function csvDetalle(lista: Entrega[]): string {
  const ubis = new Map(S.ubicaciones.value.map((u) => [u.id, u.nombre]))
  const motivos = new Map(S.motivos.value.map((m) => [m.id, m.texto]))
  let csv = 'FOLIO,FECHA,HORA,ESTADO,RPE,NOMBRE,AREA,MATERIAL,TALLA,CANTIDAD,RESGUARDO,MOTIVO,DESPACHO,EQUIPO,UBICACION,OBSERVACIONES\n'
  for (const e of lista) {
    for (const l of e.lineas) {
      csv +=
        [
          e.folio, e.fecha, e.hora, e.estado, e.rpe, e.nombre, e.area,
          S.nombreMaterial(l.materialId), l.varianteId, l.cantidad, l.esResguardo ? 'SI' : 'NO',
          l.motivoId ? motivos.get(l.motivoId) : '', e.usuarioNombre, e.equipo, ubis.get(e.ubicacionId), e.observaciones,
        ].map(csvq).join(',') + '\n'
    }
  }
  return '﻿' + csv
}

export function csvKardex(lista = S.movimientos.value): string {
  const ubis = new Map(S.ubicaciones.value.map((u) => [u.id, u.nombre]))
  let csv = 'FECHA,HORA,TIPO,MATERIAL,TALLA,UBICACION,CANTIDAD,REFERENCIA,MOTIVO,NOTA,USUARIO,EQUIPO\n'
  for (const m of lista) {
    const d = new Date(m.ts)
    csv +=
      [fechaDeTs(m.ts), horaLocal(d), m.tipo, S.nombreMaterial(m.materialId), m.varianteId, ubis.get(m.ubicacionId), m.cantidad, m.ref, m.motivo, m.nota, m.usuarioNombre, m.equipo]
        .map(csvq)
        .join(',') + '\n'
  }
  return '﻿' + csv
}

export const nombreArchivo = (base: string, ext: string) => {
  const d = new Date()
  return `${base}_${fechaLocal(d)}_${horaLocal(d).replace(':', '')}.${ext}`
}

// ---------- Padrón ----------

function partirCSV(linea: string, sep: string): string[] {
  const out: string[] = []
  let token = ''
  let comillas = false
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i]
    if (ch === '"') {
      if (comillas && linea[i + 1] === '"') {
        token += '"'
        i++
      } else comillas = !comillas
    } else if (ch === sep && !comillas) {
      out.push(token)
      token = ''
    } else token += ch
  }
  out.push(token)
  return out.map((t) => t.trim())
}

/**
 * Lee un padrón en CSV. Acepta el formato de personal_semilla.csv
 * (rpe,nombre,area,puesto,casillero) o simplemente «RPE,Nombre,Área» sin encabezado.
 */
export function leerPadronCSV(texto: string, tipo: Trabajador['tipo'] = 'planta'): Trabajador[] {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (!lineas.length) return []
  const sep = lineas[0].includes(';') && !lineas[0].includes(',') ? ';' : ','
  const primera = partirCSV(lineas[0], sep).map((c) => c.toLowerCase())
  const conEncabezado = primera.includes('rpe') || primera.includes('nombre')
  const idx = (n: string, porDefecto: number) => (conEncabezado ? primera.indexOf(n) : porDefecto)
  const iR = idx('rpe', 0)
  const iN = idx('nombre', 1)
  const iA = conEncabezado ? primera.findIndex((c) => c === 'area' || c === 'área') : 2
  const iP = idx('puesto', 3)
  const iC = idx('casillero', 4)
  const ahora = new Date().toISOString()
  const vistos = new Map<string, Trabajador>()
  for (const l of lineas.slice(conEncabezado ? 1 : 0)) {
    const c = partirCSV(l, sep)
    const rpe = (c[iR] ?? '').toUpperCase().replace(/\s+/g, '')
    const nombre = (c[iN] ?? '').toUpperCase()
    if (!rpe || !nombre) continue
    vistos.set(rpe, {
      rpe,
      nombre,
      area: (iA >= 0 ? c[iA] : '')?.toUpperCase() || 'SIN ÁREA',
      puesto: (iP >= 0 ? c[iP] : '') || 'OPERADOR / TÉCNICO',
      casillero: (iC >= 0 ? c[iC] : '') || '',
      tipo,
      tallas: {},
      activo: true,
      alta: ahora,
      actualizado: ahora,
    })
  }
  return [...vistos.values()]
}

export async function importarPadron(lista: Trabajador[]): Promise<{ nuevos: number; actualizados: number }> {
  let nuevos = 0
  let actualizados = 0
  const actuales = S.personal.value
  const aGuardar = lista.map((t) => {
    const previo = actuales.get(t.rpe)
    if (previo) {
      actualizados++
      return { ...previo, nombre: t.nombre, area: t.area, puesto: t.puesto || previo.puesto, casillero: t.casillero || previo.casillero, actualizado: t.actualizado }
    }
    nuevos++
    return t
  })
  await db.personal.bulkPut(aGuardar)
  await S.recargar('personal')
  return { nuevos, actualizados }
}
