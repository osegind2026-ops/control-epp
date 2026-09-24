// Simulador mínimo de Google Apps Script / Google Sheets para probar nube/Codigo.gs
// sin cuenta de Google. Solo implementa lo que usa el servidor.
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

type Celda = unknown

class Rango {
  private hoja: HojaSimulada
  private r: number
  private c: number
  private nr: number
  private nc: number
  constructor(hoja: HojaSimulada, r: number, c: number, nr: number, nc: number) {
    this.hoja = hoja
    this.r = r
    this.c = c
    this.nr = nr
    this.nc = nc
  }
  getValues(): Celda[][] {
    return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => this.hoja.datos[this.r - 1 + i]?.[this.c - 1 + j] ?? ''))
  }
  setValues(v: Celda[][]): this {
    v.forEach((fila, i) =>
      fila.forEach((x, j) => {
        const f = (this.hoja.datos[this.r - 1 + i] ??= [])
        f[this.c - 1 + j] = x
      }),
    )
    return this
  }
  setValue(x: Celda): this {
    return this.setValues([[x]])
  }
  setFontWeight(): this {
    return this
  }
  setBackground(): this {
    return this
  }
  setNumberFormat(): this {
    return this
  }
}

export class HojaSimulada {
  datos: Celda[][] = []
  nombre: string
  constructor(nombre: string) {
    this.nombre = nombre
  }
  getLastRow(): number {
    let n = this.datos.length
    while (n > 0 && !(this.datos[n - 1] ?? []).some((x) => x !== '' && x !== undefined)) n--
    return n
  }
  getMaxRows(): number {
    return 1000
  }
  getRange(r: number, c: number, nr = 1, nc = 1): Rango {
    return new Rango(this, r, c, nr, nc)
  }
  setFrozenRows(): void {}
  hideColumns(): void {}
  clearContents(): void {
    this.datos = []
  }
  /** Filas como objetos usando el encabezado (para las pruebas). */
  registros(): Record<string, Celda>[] {
    const [enc, ...filas] = this.datos
    return filas.filter((f) => f?.length).map((f) => Object.fromEntries((enc as string[]).map((k, i) => [k, f[i]])))
  }
}

export function crearServidorSimulado() {
  const hojas = new Map<string, HojaSimulada>()
  const props = new Map<string, string>()
  const libro = {
    getSheetByName: (n: string) => hojas.get(n) ?? null,
    insertSheet: (n: string) => {
      const h = new HojaSimulada(n)
      hojas.set(n, h)
      return h
    },
  }
  const partes = (d: Date) =>
    Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        .formatToParts(d)
        .map((p) => [p.type, p.value]),
    )
  const contexto = {
    SpreadsheetApp: { getActiveSpreadsheet: () => libro },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => void props.set(k, String(v)) }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: {
      createTextOutput: (s: string) => ({ contenido: s, setMimeType() { return this } }),
      MimeType: { JSON: 'json' },
    },
    Utilities: {
      computeDigest: (_a: unknown, s: string) => [...createHash('sha256').update(s, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
      DigestAlgorithm: { SHA_256: 1 },
      Charset: { UTF_8: 1 },
      getUuid: () => randomUUID(),
      formatDate: (d: Date, _tz: string, patron: string) => {
        const p = partes(d)
        const hora = p.hour === '24' ? '00' : p.hour
        return patron.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', hora).replace('mm', p.minute)
      },
    },
    Logger: { log: () => {} },
  }
  vm.createContext(contexto)
  const ruta = fileURLToPath(new URL('../../nube/Codigo.gs', import.meta.url))
  vm.runInContext(readFileSync(ruta, 'utf8'), contexto)
  const g = contexto as unknown as {
    doPost: (e: unknown) => { contenido: string }
    configurar: () => string
  }
  return {
    hojas,
    props,
    configurar: () => g.configurar(),
    /** Transporte para el cliente: en lugar de fetch, llama directo a doPost. */
    transporte: async (_url: string, cuerpo: unknown) => JSON.parse(g.doPost({ postData: { contents: JSON.stringify(cuerpo) } }).contenido),
  }
}
