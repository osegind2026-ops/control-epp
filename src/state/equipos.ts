import { db } from '../db/db'
import { soloAlfanumerico } from '../domain/equipoQr'
import type { CondicionRegreso, Equipo, ObsElegida, ObsEquipo, PersonalSI, PrestamoEquipo, RefSI, RolSI, TipoObsEquipo, Trabajador } from '../domain/types'
import { fechaLocal, horaLocal, normalizar, nuevoId } from '../lib/util'
import { avisarCambioLocal } from './nube'
import { ErrorNegocio, guardarFotosEvidencia } from './servicios'
import * as S from './store'

// Equipos a resguardo de la oficina (explosímetros, higrómetros, detectores…):
// catálogo propio y bitácora digital de salidas y regresos. Sustituye al formato
// «Bitácora de entrega y recepción de equipos de seguridad industrial».

export const CONDICIONES: Record<CondicionRegreso, string> = {
  bueno: 'Buen estado',
  detalle: 'Con detalle',
  danado: 'Dañado / no funciona',
}

export const ESTADOS: Record<Equipo['estado'], string> = {
  operativo: 'Operativo',
  revision: 'En revisión',
  baja: 'Baja',
}

/** Fecha y hora local en formato YYYY-MM-DDTHH:mm (como un campo datetime-local). */
export function ahoraLocal(d = new Date()): string {
  return `${fechaLocal(d)}T${horaLocal(d)}`
}

export const AJUSTE_HORAS_ALERTA = 'horasAlertaEquipo'
export const HORAS_ALERTA_DEFECTO = 24

/** Horas fuera de la oficina a partir de las cuales un equipo se marca «sin devolver» (0 = sin alerta). */
export function horasAlerta(): number {
  const v = S.ajustes.value.get(AJUSTE_HORAS_ALERTA)
  return typeof v === 'number' && v >= 0 ? v : HORAS_ALERTA_DEFECTO
}

/**
 * Equipo sin devolver. Los préstamos anteriores tenían fecha de regreso y se siguen evaluando con ella;
 * los nuevos no la llevan: se alertan cuando pasan más horas fuera que el límite configurado.
 */
export function prestamoVencido(p: Pick<PrestamoEquipo, 'estatus' | 'vence' | 'ts'>, ahora = ahoraLocal(), horasLimite = horasAlerta()): boolean {
  if (p.estatus !== 'ACTIVO') return false
  if (p.vence) return p.vence < ahora
  if (!horasLimite) return false
  return new Date(ahora).getTime() - new Date(p.ts).getTime() > horasLimite * 3600000
}

/** Días que faltan para la calibración (negativo = vencida); null si no aplica. */
export function diasCalibracion(e: Pick<Equipo, 'calibracion'>, hoy = fechaLocal()): number | null {
  if (!e.calibracion) return null
  return Math.round((new Date(e.calibracion + 'T12:00').getTime() - new Date(hoy + 'T12:00').getTime()) / 86400000)
}

export type Disponibilidad = 'disponible' | 'prestado' | 'revision' | 'calibracion' | 'baja'

export function disponibilidad(e: Equipo, activos: PrestamoEquipo[], hoy = fechaLocal()): Disponibilidad {
  if (!e.activo || e.estado === 'baja') return 'baja'
  if (activos.some((p) => p.equipoId === e.id)) return 'prestado'
  if (e.estado === 'revision') return 'revision'
  const dc = diasCalibracion(e, hoy)
  if (dc !== null && dc < 0) return 'calibracion'
  return 'disponible'
}

export const TEXTO_DISPONIBILIDAD: Record<Disponibilidad, string> = {
  disponible: 'Disponible',
  prestado: 'Prestado',
  revision: 'En revisión',
  calibracion: 'Calibración vencida',
  baja: 'Baja',
}

export function siguienteFolioEquipo(codigoDispositivo: string, existentes: string[]): string {
  const pref = `EQ-${codigoDispositivo}-`
  const n = existentes.filter((f) => f.startsWith(pref)).reduce((mx, f) => Math.max(mx, parseInt(f.slice(pref.length), 10) || 0), 0)
  return pref + String(n + 1).padStart(4, '0')
}

function actor() {
  const sesion = S.sesion.value
  const equipo = S.dispositivo.value
  if (!sesion) throw new ErrorNegocio('Inicie sesión con su PIN.')
  if (!equipo) throw new ErrorNegocio('Configure el equipo antes de registrar.')
  return { sesion, dispositivo: equipo }
}

// ---------- Catálogo ----------

/**
 * Guarda un equipo. `fotoDataUrl`: texto = foto nueva, null = quitar la foto, sin valor = no cambia.
 */
export async function guardarEquipo(datos: Omit<Equipo, 'id' | 'actualizado'> & { id?: string }, fotoDataUrl?: string | null): Promise<Equipo> {
  const { sesion } = actor()
  if (sesion.rol !== 'admin' && sesion.rol !== 'almacen') throw new ErrorNegocio('Solo un encargado de almacén o un administrador puede editar el catálogo de equipos.')
  const codigo = datos.codigo.trim().toUpperCase()
  if (!codigo) throw new ErrorNegocio('Escriba el código del equipo.')
  if (!datos.nombre.trim()) throw new ErrorNegocio('Escriba qué equipo es (por ejemplo, Explosímetro).')
  // Se compara sin guiones ni espacios: así se lee del QR con un escáner (EXP-01 = EXP01)
  if (soloAlfanumerico(codigo).length < 2) throw new ErrorNegocio('El código debe tener al menos 2 letras o números.')
  const repetido = S.equipos.value.find((e) => soloAlfanumerico(e.codigo) === soloAlfanumerico(codigo) && e.id !== datos.id)
  if (repetido) throw new ErrorNegocio(`El código ${codigo} ya es de otro equipo (${repetido.nombre}).`)
  const eq: Equipo = {
    ...datos,
    id: datos.id ?? nuevoId('EQ'),
    codigo,
    nombre: datos.nombre.trim(),
    marca: datos.marca.trim(),
    modelo: datos.modelo.trim(),
    serie: datos.serie.trim(),
    notas: datos.notas.trim(),
    accesorios: datos.accesorios.map((a) => a.trim()).filter(Boolean),
    calibracion: datos.calibracion || undefined,
    actualizado: new Date().toISOString(),
  }
  await db.transaction('rw', [db.equipos, db.fotos], async () => {
    if (fotoDataUrl) {
      eq.fotoId = eq.fotoId ?? nuevoId('F')
      await db.fotos.put({ id: eq.fotoId, dataUrl: fotoDataUrl })
    } else if (fotoDataUrl === null && eq.fotoId) {
      await db.fotos.delete(eq.fotoId)
      eq.fotoId = undefined
    }
    await db.equipos.put(eq)
  })
  await S.recargar('equipos', 'fotos')
  avisarCambioLocal()
  return eq
}

// ---------- Personal de Seguridad Industrial, observaciones rápidas y ajustes ----------

function exigirRol(...roles: ('admin' | 'almacen')[]) {
  const { sesion } = actor()
  if (!roles.includes(sesion.rol as 'admin' | 'almacen')) {
    throw new ErrorNegocio(roles.length === 1 ? 'Solo un administrador puede cambiar esto.' : 'Solo un administrador o el encargado de almacén puede cambiar esto.')
  }
}

/** Primer nombre de pila de un nombre «NOMBRES APELLIDOS», para sugerir el nombre corto. */
export const cortoSugerido = (nombre: string) => {
  const p = nombre.trim().split(/\s+/)[0] ?? ''
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
}

/** El integrante sale del padrón de trabajadores: de ahí vienen el nombre completo y el área. */
export async function guardarPersonalSI(d: { id?: string; rpe: string; corto: string; rol?: RolSI; usuarioId?: string; activo: boolean }): Promise<PersonalSI> {
  exigirRol('admin')
  const trabajador = S.personal.value.get(d.rpe)
  if (!trabajador) throw new ErrorNegocio('Elija a la persona del padrón (o dé de alta al trabajador primero).')
  const yaEsta = S.personalSI.value.find((x) => x.id !== d.id && x.rpe === d.rpe)
  if (yaEsta) throw new ErrorNegocio(`${trabajador.nombre} ya está en la lista (botón «${yaEsta.corto}»).`)
  const nombre = trabajador.nombre
  const corto = d.corto.trim().replace(/\s+/g, ' ')
  if (!corto) throw new ErrorNegocio('Escriba el nombre corto que aparecerá en el botón.')
  if (corto.length > 18) throw new ErrorNegocio('El nombre corto debe tener 18 letras o menos.')
  const repetido = S.personalSI.value.find((x) => x.id !== d.id && x.activo && normalizar(x.corto) === normalizar(corto))
  if (d.activo && repetido) throw new ErrorNegocio(`Ya hay un botón «${repetido.corto}». Use otro nombre corto.`)
  const reg: PersonalSI = { id: d.id ?? nuevoId('SI'), rpe: d.rpe, nombre, corto, rol: d.rol ?? 'ambos', usuarioId: d.usuarioId || undefined, activo: d.activo, actualizado: new Date().toISOString() }
  await db.personalSI.put(reg)
  await S.recargar('personalSI')
  avisarCambioLocal()
  return reg
}

export async function guardarObsEquipo(d: { id?: string; texto: string; tipo: TipoObsEquipo; activo: boolean }): Promise<ObsEquipo> {
  exigirRol('admin', 'almacen')
  const texto = d.texto.trim().replace(/\s+/g, ' ')
  if (!texto) throw new ErrorNegocio('Escriba el texto de la observación.')
  if (texto.length > 80) throw new ErrorNegocio('La observación debe tener 80 letras o menos.')
  const repetida = S.obsEquipo.value.find((x) => x.id !== d.id && normalizar(x.texto) === normalizar(texto))
  if (repetida) throw new ErrorNegocio(`Ya existe la observación «${repetida.texto}».`)
  const reg: ObsEquipo = { id: d.id ?? nuevoId('OB'), texto, tipo: d.tipo, activo: d.activo, actualizado: new Date().toISOString() }
  await db.obsEquipo.put(reg)
  await S.recargar('obsEquipo')
  avisarCambioLocal()
  return reg
}

/** Guarda un ajuste compartido entre todos los equipos de la oficina. Solo administrador. */
export async function guardarAjuste(id: string, valor: unknown): Promise<void> {
  exigirRol('admin')
  await db.ajustes.put({ id, valor, actualizado: new Date().toISOString() })
  await S.recargar('ajustes')
  avisarCambioLocal()
}

/** ¿Puede ser técnico (recibe el equipo) o supervisor (lo entrega y lo recibe de regreso)? Sin rol = ambos. */
export const puedeSerTecnico = (x: Pick<PersonalSI, 'rol'>) => x.rol !== 'supervisor'
export const puedeSerSupervisor = (x: Pick<PersonalSI, 'rol'>) => x.rol !== 'tecnico'

/**
 * Botones de Seguridad Industrial de una fila (técnicos o supervisores): primero a quien se usó
 * más recientemente en esa función, después el resto por nombre corto.
 */
export function personalSIOrdenado(lista: PersonalSI[], prestamos: PrestamoEquipo[], funcion: 'supervisor' | 'tecnico' = 'supervisor'): PersonalSI[] {
  const ultimo = new Map<string, string>()
  const marca = (id: string | undefined, ts: string | undefined) => {
    if (id && ts && (ultimo.get(id) ?? '') < ts) ultimo.set(id, ts)
  }
  const porRpe = new Map(lista.filter((x) => x.rpe).map((x) => [x.rpe as string, x.id]))
  for (const p of prestamos) {
    if (p.estatus === 'ANULADO') continue
    if (funcion === 'tecnico') marca(porRpe.get(p.rpe), p.ts)
    else {
      marca(p.entregoSI?.id, p.ts)
      marca(p.regreso?.recibioSI?.id, p.regreso?.ts)
    }
  }
  return lista.filter((x) => x.activo && (funcion === 'tecnico' ? puedeSerTecnico(x) : puedeSerSupervisor(x))).sort((a, b) => (ultimo.get(b.id) ?? '').localeCompare(ultimo.get(a.id) ?? '') || a.corto.localeCompare(b.corto))
}

/** Observaciones rápidas: las más usadas primero. */
export function obsOrdenadas(catalogo: ObsEquipo[], prestamos: PrestamoEquipo[]): ObsEquipo[] {
  const usos = new Map<string, number>()
  const cuenta = (textos: string[] | undefined) => {
    for (const t of textos ?? []) usos.set(normalizar(t), (usos.get(normalizar(t)) ?? 0) + 1)
  }
  for (const p of prestamos) {
    cuenta(p.obsRapidas)
    cuenta(p.regreso?.obsRapidas)
  }
  const rango = { ok: 0, detalle: 1, dano: 2 }
  return catalogo
    .filter((o) => o.activo)
    .sort((a, b) => (usos.get(normalizar(b.texto)) ?? 0) - (usos.get(normalizar(a.texto)) ?? 0) || rango[a.tipo] - rango[b.tipo] || a.texto.localeCompare(b.texto))
}

/** Actividades que se han anotado, de la más reciente a la más antigua, sin repetir. */
export function actividadesRecientes(prestamos: PrestamoEquipo[], limite = 6): string[] {
  const vistas = new Set<string>()
  const r: string[] = []
  for (let i = prestamos.length - 1; i >= 0 && r.length < limite; i--) {
    const u = prestamos[i].uso?.trim()
    if (!u || prestamos[i].estatus === 'ANULADO' || vistas.has(normalizar(u))) continue
    vistas.add(normalizar(u))
    r.push(u)
  }
  return r
}

/** Quienes han pedido equipos más recientemente (para elegirlos con un toque). */
export function solicitantesRecientes(prestamos: PrestamoEquipo[], limite = 6): { rpe: string; nombre: string; area: string }[] {
  const vistos = new Set<string>()
  const r: { rpe: string; nombre: string; area: string }[] = []
  for (let i = prestamos.length - 1; i >= 0 && r.length < limite; i--) {
    const p = prestamos[i]
    if (p.estatus === 'ANULADO' || vistos.has(p.rpe)) continue
    vistos.add(p.rpe)
    r.push({ rpe: p.rpe, nombre: p.nombre, area: p.area })
  }
  return r
}

const RANGO_OBS: Record<TipoObsEquipo, number> = { ok: 0, detalle: 1, dano: 2 }

/** Condición del equipo según lo más grave que se haya elegido. */
export function condicionDe(obs: ObsElegida[]): CondicionRegreso {
  const peor = obs.reduce((m, o) => Math.max(m, RANGO_OBS[o.tipo]), 0)
  return peor === 2 ? 'danado' : peor === 1 ? 'detalle' : 'bueno'
}

/** Limpia y quita repetidas las observaciones elegidas. */
function limpiarObs(obs: ObsElegida[] | undefined): ObsElegida[] {
  const vistas = new Set<string>()
  const r: ObsElegida[] = []
  for (const o of obs ?? []) {
    const texto = o.texto.trim().replace(/\s+/g, ' ')
    if (!texto || vistas.has(normalizar(texto))) continue
    if (texto.length > 80) throw new ErrorNegocio('Cada observación debe tener 80 letras o menos.')
    vistas.add(normalizar(texto))
    r.push({ texto, tipo: o.tipo })
  }
  return r
}

/**
 * Las observaciones nuevas que se escriben quedan como opción rápida para la próxima vez
 * (dentro de la transacción de quien llama, con la tabla db.obsEquipo).
 */
async function guardarObsNuevas(obs: ObsElegida[]): Promise<void> {
  const ahora = new Date().toISOString()
  for (const o of obs) {
    const existente = S.obsEquipo.value.find((x) => normalizar(x.texto) === normalizar(o.texto))
    if (!existente) await db.obsEquipo.put({ id: nuevoId('OB'), texto: o.texto, tipo: o.tipo, activo: true, actualizado: ahora })
    else if (!existente.activo) await db.obsEquipo.put({ ...existente, activo: true, actualizado: ahora })
  }
}

/** Quién de Seguridad Industrial atiende. Si la oficina aún no tiene lista, queda a nombre de quien tiene la sesión. */
function resolverSI(id: string | undefined, accion: string): RefSI {
  const { sesion } = actor()
  const activos = S.personalSI.value.filter((x) => x.activo)
  if (id) {
    const x = activos.find((y) => y.id === id)
    if (!x) throw new ErrorNegocio('Esa persona de Seguridad Industrial ya no está en la lista.')
    return { id: x.id, nombre: x.nombre, corto: x.corto }
  }
  if (activos.some(puedeSerSupervisor)) throw new ErrorNegocio(`Elija qué supervisor ${accion}.`)
  return { id: sesion.usuarioId, nombre: sesion.usuarioNombre }
}

/**
 * Momento del movimiento. Normalmente es ahora; el administrador o el encargado de almacén
 * pueden indicar otra hora (por ejemplo, para capturar algo que ya ocurrió).
 */
function momento(fechaHora: string | undefined, noAntesDe?: string): { ts: string; capturada?: string } {
  const { sesion } = actor()
  const ahora = new Date()
  if (!fechaHora) return { ts: ahora.toISOString() }
  const d = new Date(fechaHora)
  if (isNaN(d.getTime())) throw new ErrorNegocio('La fecha y hora no son válidas.')
  // El campo de fecha y hora solo llega al minuto: dentro del mismo minuto es «ahora»
  if (Math.abs(d.getTime() - ahora.getTime()) < 60000) return { ts: ahora.toISOString() }
  if (sesion.rol !== 'admin' && sesion.rol !== 'almacen') throw new ErrorNegocio('Solo un administrador o el encargado de almacén puede cambiar la fecha y la hora.')
  if (d.getTime() > ahora.getTime()) throw new ErrorNegocio('La fecha y hora no pueden ser posteriores a ahora.')
  if (noAntesDe && d.toISOString() < noAntesDe) throw new ErrorNegocio('La devolución no puede ser anterior a la salida del equipo.')
  return { ts: d.toISOString(), capturada: ahora.toISOString() }
}

// ---------- Préstamo, devolución y transferencia ----------

export interface DatosSalida {
  equipoId: string
  trabajador: Pick<Trabajador, 'rpe' | 'nombre' | 'area'>
  /** Para qué actividad se usará. */
  actividad?: string
  accesorios: string[]
  /** Se lleva su libreta de bitácora. */
  bitacora: boolean
  obs?: ObsElegida[]
  /** Fotos del equipo al entregarlo (data URL), p. ej. de un daño previo. */
  fotos?: string[]
  /** Quién de Seguridad Industrial lo entrega. */
  entregoSIId?: string
  /** Solo administrador o encargado de almacén: fecha y hora real (YYYY-MM-DDTHH:mm) si no es ahora. */
  fechaHora?: string
}

function armarPrestamo(
  eq: Equipo,
  d: Pick<DatosSalida, 'trabajador' | 'actividad' | 'accesorios' | 'bitacora'>,
  extra: { folios: string[]; ts: string; capturada?: string; entregoSI: RefSI; obs: ObsElegida[]; fotosIds?: string[]; origenId?: string },
): PrestamoEquipo {
  const { sesion, dispositivo } = actor()
  const textos = extra.obs.map((o) => o.texto)
  const p: PrestamoEquipo = {
    id: nuevoId('PE'),
    folio: siguienteFolioEquipo(dispositivo.codigo, extra.folios),
    equipoId: eq.id,
    equipoCodigo: eq.codigo,
    equipoNombre: [eq.nombre, eq.marca, eq.modelo].filter(Boolean).join(' '),
    rpe: d.trabajador.rpe,
    nombre: d.trabajador.nombre,
    area: d.trabajador.area,
    contacto: '',
    uso: (d.actividad ?? '').trim(),
    ts: extra.ts,
    usuarioId: sesion.usuarioId,
    usuarioNombre: sesion.usuarioNombre,
    equipo: dispositivo.codigo,
    vence: '',
    accesorios: d.accesorios,
    bitacora: d.bitacora,
    observaciones: textos.join(' · '),
    estatus: 'ACTIVO',
    entregoSI: extra.entregoSI,
    ver: 1,
    actualizado: new Date().toISOString(),
  }
  if (textos.length) {
    p.obsRapidas = textos
    p.condicionSalida = condicionDe(extra.obs)
  }
  if (extra.fotosIds?.length) p.fotos = extra.fotosIds
  if (extra.origenId) p.origenId = extra.origenId
  if (extra.capturada) p.capturada = extra.capturada
  return p
}

export async function prestarEquipo(d: DatosSalida): Promise<PrestamoEquipo> {
  const eq = S.equipos.value.find((e) => e.id === d.equipoId)
  if (!eq) throw new ErrorNegocio('Elija el equipo.')
  const estado = disponibilidad(eq, S.prestamosEquipoActivos.value)
  if (estado === 'prestado') {
    const p = S.prestamosEquipoActivos.value.find((x) => x.equipoId === eq.id)
    throw new ErrorNegocio(`${eq.codigo} ya está prestado a ${p?.nombre ?? 'otra persona'}. Registre primero su devolución o transfiéralo.`)
  }
  if (estado !== 'disponible') throw new ErrorNegocio(`${eq.codigo} no se puede prestar: ${TEXTO_DISPONIBILIDAD[estado].toLowerCase()}.`)
  if (!d.trabajador.rpe) throw new ErrorNegocio('Indique quién recibe el equipo.')
  const entregoSI = resolverSI(d.entregoSIId, 'entrega el equipo')
  const { ts, capturada } = momento(d.fechaHora)
  const obs = limpiarObs(d.obs)
  const p = armarPrestamo(eq, d, { folios: S.prestamosEquipo.value.map((x) => x.folio), ts, capturada, entregoSI, obs })
  await db.transaction('rw', [db.prestamosEquipo, db.fotos, db.obsEquipo], async () => {
    const ids = await guardarFotosEvidencia(d.fotos ?? [])
    if (ids) p.fotos = ids
    await guardarObsNuevas(obs)
    await db.prestamosEquipo.add(p)
  })
  await S.recargar('prestamosEquipo', 'fotos', 'obsEquipo')
  avisarCambioLocal()
  return p
}

export interface DatosRegreso {
  prestamoId: string
  /** Quien devuelve (o, en una transferencia, quien lo tenía y lo pasa). */
  devolvio: Pick<Trabajador, 'rpe' | 'nombre'>
  /** Accesorios que regresan o pasan a la otra persona. */
  accesorios: string[]
  bitacora: boolean
  obs?: ObsElegida[]
  /** Fotos del equipo al recibirlo (data URL), p. ej. del daño. */
  fotos?: string[]
  /** Quién de Seguridad Industrial lo recibe o registra la transferencia. */
  recibioSIId?: string
  /** Solo administrador o encargado de almacén: fecha y hora real (YYYY-MM-DDTHH:mm) si no es ahora. */
  fechaHora?: string
  /** Si se indica, el equipo pasa directo a esa persona en lugar de volver a la oficina. */
  transferirA?: { trabajador: Pick<Trabajador, 'rpe' | 'nombre' | 'area'>; actividad?: string }
}

export async function registrarRegreso(d: DatosRegreso): Promise<{ siguiente?: PrestamoEquipo }> {
  const { sesion } = actor()
  const p = S.prestamosEquipo.value.find((x) => x.id === d.prestamoId)
  if (!p || p.estatus !== 'ACTIVO') throw new ErrorNegocio('Ese préstamo ya no está activo.')
  const transfiere = !!d.transferirA
  if (d.transferirA && !d.transferirA.trabajador.rpe) throw new ErrorNegocio('Indique quién recibe el equipo.')
  if (d.transferirA && d.transferirA.trabajador.rpe === d.devolvio.rpe) throw new ErrorNegocio('Elija a otra persona: quien lo transfiere no puede ser también quien lo recibe.')
  const recibioSI = resolverSI(d.recibioSIId, transfiere ? 'registra la transferencia' : 'recibe el equipo')
  const { ts, capturada } = momento(d.fechaHora, p.ts)
  const obs = limpiarObs(d.obs)

  // Lo que falta se anota solo, sin tener que escribirlo
  const faltan = p.accesorios.filter((a) => !d.accesorios.includes(a))
  const faltaLibreta = p.bitacora && !d.bitacora
  const notasFalta: string[] = []
  if (faltan.length) notasFalta.push(`Falta: ${faltan.join(', ')}`)
  if (faltaLibreta) notasFalta.push('No regresó la libreta de bitácora')
  let condicion = condicionDe(obs)
  if (condicion === 'bueno' && notasFalta.length) condicion = 'detalle'
  const textos = obs.map((o) => o.texto)

  const siguiente = d.transferirA
    ? armarPrestamo(
        S.equipos.value.find((e) => e.id === p.equipoId) ?? ({ id: p.equipoId, codigo: p.equipoCodigo, nombre: p.equipoNombre, marca: '', modelo: '' } as Equipo),
        { trabajador: d.transferirA.trabajador, actividad: d.transferirA.actividad ?? p.uso, accesorios: d.accesorios, bitacora: d.bitacora },
        { folios: [...S.prestamosEquipo.value.map((x) => x.folio), p.folio], ts, capturada, entregoSI: recibioSI, obs, origenId: p.id },
      )
    : undefined
  // El préstamo nuevo conserva el nombre completo del equipo del anterior
  if (siguiente) siguiente.equipoNombre = p.equipoNombre

  const actualizado: PrestamoEquipo = {
    ...p,
    estatus: 'DEVUELTO',
    regreso: {
      ts,
      tipo: transfiere ? 'transferencia' : 'devolucion',
      recibioSI,
      devolvioRpe: d.devolvio.rpe,
      devolvioNombre: d.devolvio.nombre,
      usuarioId: sesion.usuarioId,
      usuarioNombre: sesion.usuarioNombre,
      condicion,
      accesorios: d.accesorios,
      bitacora: d.bitacora,
      comentarios: [...textos, ...notasFalta].join(' · '),
      ...(textos.length ? { obsRapidas: textos } : {}),
      ...(siguiente ? { siguienteId: siguiente.id } : {}),
      ...(capturada ? { capturada } : {}),
    },
    ver: p.ver + 1,
    actualizado: new Date().toISOString(),
  }
  const eq = S.equipos.value.find((e) => e.id === p.equipoId)
  await db.transaction('rw', [db.prestamosEquipo, db.equipos, db.fotos, db.obsEquipo], async () => {
    actualizado.regreso!.fotos = await guardarFotosEvidencia(d.fotos ?? [])
    await guardarObsNuevas(obs)
    await db.prestamosEquipo.put(actualizado)
    if (siguiente) await db.prestamosEquipo.add(siguiente)
    // Un equipo dañado no se vuelve a prestar hasta que alguien lo revise (si pasa a otra persona sigue en uso)
    if (!siguiente && eq && condicion === 'danado' && eq.estado === 'operativo') await db.equipos.put({ ...eq, estado: 'revision', actualizado: actualizado.actualizado })
  })
  await S.recargar('prestamosEquipo', 'equipos', 'fotos', 'obsEquipo')
  avisarCambioLocal()
  return { siguiente }
}

// ---------- Correcciones del administrador en la bitácora ----------

export interface EdicionPrestamo {
  /** Técnico que recibió el equipo. */
  tecnico?: Pick<Trabajador, 'rpe' | 'nombre' | 'area'>
  entregoSIId?: string
  uso?: string
  /** Fecha y hora de salida (YYYY-MM-DDTHH:mm). */
  salida?: string
  bitacora?: boolean
  observaciones?: string
  regreso?: {
    /** Fecha y hora del cierre (YYYY-MM-DDTHH:mm). */
    fecha?: string
    devolvio?: Pick<Trabajador, 'rpe' | 'nombre'>
    recibioSIId?: string
    condicion?: CondicionRegreso
    comentarios?: string
  }
}

const textoFecha = (iso: string) => `${fechaLocal(new Date(iso))} ${horaLocal(new Date(iso))}`

/** El administrador corrige un registro de la bitácora; queda anotado quién cambió qué. */
export async function editarPrestamoEquipo(id: string, e: EdicionPrestamo): Promise<PrestamoEquipo> {
  exigirRol('admin')
  const { sesion } = actor()
  const p = S.prestamosEquipo.value.find((x) => x.id === id)
  if (!p) throw new ErrorNegocio('Ese registro ya no existe.')
  const n: PrestamoEquipo = { ...p, regreso: p.regreso ? { ...p.regreso } : undefined }
  const cambios: string[] = []
  const anota = (campo: string, antes: string, despues: string) => {
    if (antes !== despues) cambios.push(`${campo}: ${antes || '—'} → ${despues || '—'}`)
  }
  const ahora = new Date()
  const aIso = (local: string, que: string) => {
    const d = new Date(local)
    if (isNaN(d.getTime())) throw new ErrorNegocio(`La fecha de ${que} no es válida.`)
    if (d.getTime() > ahora.getTime() + 60000) throw new ErrorNegocio(`La fecha de ${que} no puede ser posterior a ahora.`)
    return d.toISOString()
  }
  if (e.tecnico && e.tecnico.rpe !== p.rpe) {
    anota('Recibió', `${p.nombre} (${p.rpe})`, `${e.tecnico.nombre} (${e.tecnico.rpe})`)
    Object.assign(n, { rpe: e.tecnico.rpe, nombre: e.tecnico.nombre, area: e.tecnico.area })
  }
  if (e.entregoSIId !== undefined && e.entregoSIId !== p.entregoSI?.id) {
    const ref = resolverSI(e.entregoSIId, 'entregó el equipo')
    anota('Entregó', p.entregoSI?.corto || p.entregoSI?.nombre || p.usuarioNombre, ref.corto || ref.nombre)
    n.entregoSI = ref
  }
  if (e.uso !== undefined && e.uso.trim() !== p.uso) {
    anota('Actividad', p.uso, e.uso.trim())
    n.uso = e.uso.trim()
  }
  if (e.salida) {
    const ts = aIso(e.salida, 'salida')
    if (ahoraLocal(new Date(ts)) !== ahoraLocal(new Date(p.ts))) {
      anota('Salida', textoFecha(p.ts), textoFecha(ts))
      n.ts = ts
    }
  }
  if (e.bitacora !== undefined && e.bitacora !== p.bitacora) {
    anota('Libreta', p.bitacora ? 'sí' : 'no', e.bitacora ? 'sí' : 'no')
    n.bitacora = e.bitacora
  }
  if (e.observaciones !== undefined && e.observaciones.trim() !== p.observaciones) {
    anota('Observaciones al entregar', p.observaciones, e.observaciones.trim())
    n.observaciones = e.observaciones.trim()
    n.obsRapidas = n.observaciones ? n.observaciones.split(' · ').filter(Boolean) : undefined
  }
  if (e.regreso && n.regreso) {
    const r = n.regreso
    if (e.regreso.fecha) {
      const ts = aIso(e.regreso.fecha, 'regreso')
      if (ahoraLocal(new Date(ts)) !== ahoraLocal(new Date(r.ts))) {
        anota('Regreso', textoFecha(r.ts), textoFecha(ts))
        r.ts = ts
      }
    }
    if (e.regreso.devolvio && e.regreso.devolvio.rpe !== r.devolvioRpe) {
      anota('Devolvió', `${r.devolvioNombre} (${r.devolvioRpe})`, `${e.regreso.devolvio.nombre} (${e.regreso.devolvio.rpe})`)
      r.devolvioRpe = e.regreso.devolvio.rpe
      r.devolvioNombre = e.regreso.devolvio.nombre
    }
    if (e.regreso.recibioSIId !== undefined && e.regreso.recibioSIId !== r.recibioSI?.id) {
      const ref = resolverSI(e.regreso.recibioSIId, 'recibió el equipo')
      anota('Recibió (supervisor)', r.recibioSI?.corto || r.recibioSI?.nombre || r.usuarioNombre, ref.corto || ref.nombre)
      r.recibioSI = ref
    }
    if (e.regreso.condicion && e.regreso.condicion !== r.condicion) {
      anota('Condición', CONDICIONES[r.condicion], CONDICIONES[e.regreso.condicion])
      r.condicion = e.regreso.condicion
    }
    if (e.regreso.comentarios !== undefined && e.regreso.comentarios.trim() !== r.comentarios) {
      anota('Observaciones al recibir', r.comentarios, e.regreso.comentarios.trim())
      r.comentarios = e.regreso.comentarios.trim()
    }
  }
  if (n.regreso && n.regreso.ts < n.ts) throw new ErrorNegocio('El regreso no puede ser anterior a la salida.')
  if (!cambios.length) throw new ErrorNegocio('No hay cambios que guardar.')
  n.ediciones = [...(p.ediciones ?? []), { ts: ahora.toISOString(), usuarioNombre: sesion.usuarioNombre, cambios: cambios.join(' · ') }]
  n.ver = p.ver + 1
  n.actualizado = ahora.toISOString()
  await db.prestamosEquipo.put(n)
  await S.recargar('prestamosEquipo')
  avisarCambioLocal()
  return n
}

/**
 * El administrador borra un registro de la bitácora (se borra también en los demás equipos al sincronizar).
 * Si era parte de una transferencia, el registro ligado queda sin la liga. Se borran sus fotos.
 */
export async function eliminarPrestamoEquipo(id: string): Promise<void> {
  exigirRol('admin')
  const p = S.prestamosEquipo.value.find((x) => x.id === id)
  if (!p) throw new ErrorNegocio('Ese registro ya no existe.')
  const ahora = new Date().toISOString()
  const ligados: PrestamoEquipo[] = []
  for (const x of S.prestamosEquipo.value) {
    if (x.id === id) continue
    if (x.regreso?.siguienteId === id) {
      const { siguienteId: _s, ...regreso } = x.regreso
      ligados.push({ ...x, regreso, ver: x.ver + 1, actualizado: ahora })
    } else if (x.origenId === id) {
      const { origenId: _o, ...resto } = x
      ligados.push({ ...resto, ver: x.ver + 1, actualizado: ahora })
    }
  }
  const fotos = [...(p.fotos ?? []), ...(p.regreso?.fotos ?? [])]
  const baja = (tabla: string, registroId: string) => ({ id: `${tabla}:${registroId}`, tabla, registroId })
  await db.transaction('rw', [db.prestamosEquipo, db.fotos, db.bajas], async () => {
    await db.bajas.bulkPut([baja('prestamosEquipo', id), ...fotos.map((f) => baja('fotos', f))])
    await db.prestamosEquipo.delete(id)
    if (fotos.length) await db.fotos.bulkDelete(fotos)
    if (ligados.length) await db.prestamosEquipo.bulkPut(ligados)
  })
  await S.recargar('prestamosEquipo', 'fotos')
  avisarCambioLocal()
}

/** Corrige una salida registrada por error (no borra: queda en la bitácora como anulada). */
export async function anularPrestamoEquipo(prestamoId: string, motivo: string): Promise<void> {
  const { sesion } = actor()
  const p = S.prestamosEquipo.value.find((x) => x.id === prestamoId)
  if (!p || p.estatus !== 'ACTIVO') throw new ErrorNegocio('Ese préstamo ya no está activo.')
  if (!motivo.trim()) throw new ErrorNegocio('Escriba el motivo de la anulación.')
  const ahora = new Date().toISOString()
  await db.prestamosEquipo.put({
    ...p,
    estatus: 'ANULADO',
    observaciones: [p.observaciones, `ANULADO por ${sesion.usuarioNombre}: ${motivo.trim()}`].filter(Boolean).join(' · '),
    ver: p.ver + 1,
    actualizado: ahora,
  })
  await S.recargar('prestamosEquipo')
  avisarCambioLocal()
}
