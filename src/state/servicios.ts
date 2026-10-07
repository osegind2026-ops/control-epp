import { db, guardarConfig, leerConfig } from '../db/db'
import {
  existenciasDemo,
  kitsSemilla,
  materialesSemilla,
  motivosSemilla,
  CATEGORIAS,
  ubicacionesSemilla,
} from '../db/semilla'
import { existencia, formatoFolio, formatoFolioSI, materialesRecurrentes, siguienteFolio, tipoDe, tipoPorRpe } from '../domain/logica'
import type {
  Dispositivo,
  DatosPrestamo,
  Entrega,
  LineaEntrega,
  Material,
  Movimiento,
  Resguardo,
  Rol,
  Sesion,
  TipoMovimiento,
  Trabajador,
  Usuario,
} from '../domain/types'
import { fechaLocal, hashPin, horaLocal, nuevoId } from '../lib/util'
import { avisarCambioLocal } from './nube'
import { rolDe } from './permisos'
import * as S from './store'

export class ErrorNegocio extends Error {}

// ---------- Contexto de quien opera ----------

function actor(): { sesion: Sesion; equipo: Dispositivo } {
  const sesion = S.sesion.value
  const equipo = S.dispositivo.value
  if (!sesion) throw new ErrorNegocio('Inicie sesión con su PIN.')
  if (!equipo) throw new ErrorNegocio('Configure el equipo antes de registrar.')
  return { sesion, equipo }
}

function exigirInventario(): void {
  const r = actor().sesion.rol
  if (r !== 'admin' && r !== 'almacen') throw new ErrorNegocio('Solo un encargado de almacén o un administrador puede modificar las existencias.')
}

function nuevoMovimiento(
  tipo: TipoMovimiento,
  datos: Pick<Movimiento, 'materialId' | 'varianteId' | 'ubicacionId' | 'cantidad'> & Partial<Movimiento>,
): Movimiento {
  const { sesion, equipo } = actor()
  return {
    id: nuevoId('M'),
    ts: new Date().toISOString(),
    tipo,
    ref: '',
    motivo: '',
    nota: '',
    usuarioId: sesion.usuarioId,
    usuarioNombre: sesion.usuarioNombre,
    equipo: equipo.codigo,
    ...datos,
  }
}

async function marcarCambio(n = 1): Promise<void> {
  const actual = await leerConfig<number>('cambiosSinRespaldo', 0)
  await guardarConfig('cambiosSinRespaldo', actual + n)
  S.cambiosSinRespaldo.value = actual + n
  avisarCambioLocal()
}

function ubicacionDespachoId(): string {
  const u = S.ubicacionDespacho.value
  if (!u) throw new ErrorNegocio('No hay una ubicación de despacho configurada.')
  return u.id
}

// ---------- Configuración inicial ----------

export interface DatosInicio {
  equipo: { codigo: string; nombre: string }
  admin: { nombre: string; pin: string }
  demo: boolean
  padron: Trabajador[]
}

export async function inicializarSistema(datos: DatosInicio): Promise<void> {
  const ahora = new Date().toISOString()
  const salt = nuevoId('S')
  const admin: Usuario = {
    id: nuevoId('U'),
    nombre: datos.admin.nombre.trim(),
    esAdmin: true,
    rol: 'admin',
    salt,
    pinHash: hashPin(datos.admin.pin, salt),
    activo: true,
    creado: ahora,
    actualizado: ahora,
  }
  const equipo: Dispositivo = { id: nuevoId('D'), codigo: datos.equipo.codigo, nombre: datos.equipo.nombre.trim() }
  const ubis = ubicacionesSemilla()

  await db.transaction('rw', [db.materiales, db.categorias, db.kits, db.ubicaciones, db.motivos, db.usuarios, db.personal, db.movimientos, db.config], async () => {
    if ((await db.materiales.count()) === 0) await db.materiales.bulkPut(materialesSemilla())
    if ((await db.categorias.count()) === 0) await db.categorias.bulkPut(CATEGORIAS)
    if ((await db.kits.count()) === 0) await db.kits.bulkPut(kitsSemilla())
    if ((await db.ubicaciones.count()) === 0) await db.ubicaciones.bulkPut(ubis)
    if ((await db.motivos.count()) === 0) await db.motivos.bulkPut(motivosSemilla())
    await db.usuarios.put(admin)
    if (datos.padron.length) await db.personal.bulkPut(datos.padron)
    if (datos.demo && (await db.movimientos.count()) === 0) {
      await db.movimientos.bulkPut(
        existenciasDemo().map((e) => ({
          id: nuevoId('M'),
          ts: ahora,
          tipo: 'INICIAL' as const,
          materialId: e.materialId,
          varianteId: e.varianteId,
          ubicacionId: ubis[0].id,
          cantidad: e.cantidad,
          ref: '',
          motivo: 'Existencias de ejemplo',
          nota: '',
          usuarioId: admin.id,
          usuarioNombre: admin.nombre,
          equipo: equipo.codigo,
        })),
      )
    }
    await db.config.put({ clave: 'dispositivo', valor: equipo })
  })
  await S.recargar()
  S.sesion.value = { usuarioId: admin.id, usuarioNombre: admin.nombre, esAdmin: true, rol: 'admin' }
}

export async function guardarDispositivo(codigo: string, nombre: string): Promise<void> {
  const actual = S.dispositivo.value
  const equipo: Dispositivo = { id: actual?.id ?? nuevoId('D'), codigo, nombre: nombre.trim() }
  await guardarConfig('dispositivo', equipo)
  S.dispositivo.value = equipo
}

export async function guardarBloqueo(minutos: number): Promise<void> {
  await guardarConfig('bloqueoMin', minutos)
  S.bloqueoMin.value = minutos
}

// ---------- Usuarios ----------

export function verificarPin(usuario: Usuario, pin: string): boolean {
  return usuario.activo && hashPin(pin, usuario.salt) === usuario.pinHash
}

// Bloqueo temporal tras varios PIN incorrectos (por usuario, en este equipo)
const MAX_INTENTOS = 5
const BLOQUEO_MS = 60_000
const fallos = new Map<string, { n: number; hasta: number }>()

/** Segundos que faltan para poder volver a intentar (0 = puede intentar). */
export function esperaPin(usuarioId: string, ahora = Date.now()): number {
  const f = fallos.get(usuarioId)
  return f && f.hasta > ahora ? Math.ceil((f.hasta - ahora) / 1000) : 0
}

export function iniciarSesion(usuario: Usuario, pin: string): boolean {
  if (esperaPin(usuario.id)) return false
  if (!verificarPin(usuario, pin)) {
    // El teclado prueba desde 4 dígitos; un intento fallido completo es cuando llega a 6
    if (pin.length === 6) {
      const f = fallos.get(usuario.id) ?? { n: 0, hasta: 0 }
      f.n++
      if (f.n >= MAX_INTENTOS) {
        f.n = 0
        f.hasta = Date.now() + BLOQUEO_MS
      }
      fallos.set(usuario.id, f)
    }
    return false
  }
  fallos.delete(usuario.id)
  const rol = rolDe(usuario)
  S.sesion.value = { usuarioId: usuario.id, usuarioNombre: usuario.nombre, esAdmin: rol === 'admin', rol, debeCambiarPin: !!usuario.debeCambiarPin }
  return true
}

function exigirAdmin(): void {
  if (S.sesion.value?.rol !== 'admin') throw new ErrorNegocio('Solo un administrador puede administrar usuarios.')
}

function pinAleatorio(): string {
  const b = new Uint32Array(1)
  crypto.getRandomValues(b)
  return String(1000 + (b[0] % 9000))
}

/**
 * Restablece el PIN de un usuario que lo olvidó: genera un PIN temporal de 4 números
 * (se muestra una sola vez al administrador) y al entrar se le pide elegir uno propio.
 */
export async function restablecerPin(usuarioId: string): Promise<string> {
  exigirAdmin()
  const u = S.usuarios.value.find((x) => x.id === usuarioId)
  if (!u) throw new ErrorNegocio('No se encontró el usuario.')
  const pin = pinAleatorio()
  const salt = nuevoId('S')
  await db.usuarios.put({ ...u, salt, pinHash: hashPin(pin, salt), debeCambiarPin: true, activo: true, actualizado: new Date().toISOString() })
  fallos.delete(usuarioId)
  await S.recargar('usuarios')
  await marcarCambio()
  return pin
}

/** El propio usuario cambia su PIN (también cuando entró con un PIN temporal). */
export async function cambiarMiPin(pinActual: string, pinNuevo: string): Promise<void> {
  const s = S.sesion.value
  const u = s ? S.usuarios.value.find((x) => x.id === s.usuarioId) : undefined
  if (!s || !u) throw new ErrorNegocio('Inicie sesión con su PIN.')
  if (!verificarPin(u, pinActual)) throw new ErrorNegocio('El PIN actual no es correcto.')
  if (!/^\d{4,6}$/.test(pinNuevo)) throw new ErrorNegocio('El PIN nuevo debe tener de 4 a 6 números.')
  if (pinNuevo === pinActual) throw new ErrorNegocio('Elija un PIN distinto al actual.')
  if (/^(\d)\1+$/.test(pinNuevo) || '0123456789'.includes(pinNuevo) || '9876543210'.includes(pinNuevo)) {
    throw new ErrorNegocio('Elija un PIN menos obvio (no use números repetidos ni seguidos).')
  }
  const salt = nuevoId('S')
  await db.usuarios.put({ ...u, salt, pinHash: hashPin(pinNuevo, salt), debeCambiarPin: false, actualizado: new Date().toISOString() })
  await S.recargar('usuarios')
  S.sesion.value = { ...s, debeCambiarPin: false }
  await marcarCambio()
}

export function cerrarSesion(): void {
  S.sesion.value = null
}

export async function guardarUsuario(datos: { id?: string; nombre: string; rol: Rol; activo: boolean; pin?: string }): Promise<void> {
  exigirAdmin()
  if (!datos.nombre.trim()) throw new ErrorNegocio('Escriba el nombre del usuario.')
  const repetido = S.usuarios.value.find((u) => u.id !== datos.id && u.nombre.trim().toUpperCase() === datos.nombre.trim().toUpperCase())
  if (repetido) throw new ErrorNegocio(`Ya existe un usuario llamado ${repetido.nombre}.`)
  const previo = datos.id ? S.usuarios.value.find((u) => u.id === datos.id) : undefined
  if (!previo && !datos.pin) throw new ErrorNegocio('Asigne un PIN al usuario nuevo.')
  if (datos.pin && !/^\d{4,6}$/.test(datos.pin)) throw new ErrorNegocio('El PIN debe tener de 4 a 6 números.')
  const salt = datos.pin ? nuevoId('S') : previo!.salt
  const usuario: Usuario = {
    id: previo?.id ?? nuevoId('U'),
    nombre: datos.nombre.trim(),
    esAdmin: datos.rol === 'admin',
    rol: datos.rol,
    activo: datos.activo,
    salt,
    pinHash: datos.pin ? hashPin(datos.pin, salt) : previo!.pinHash,
    // Un PIN puesto por el administrador es temporal (salvo el suyo propio)
    debeCambiarPin: datos.pin ? datos.id !== S.sesion.value?.usuarioId : previo?.debeCambiarPin,
    creado: previo?.creado ?? new Date().toISOString(),
    actualizado: new Date().toISOString(),
  }
  const admins = S.usuarios.value.filter((u) => u.esAdmin && u.activo && u.id !== usuario.id)
  if (!admins.length && !(usuario.esAdmin && usuario.activo)) throw new ErrorNegocio('Debe quedar al menos un administrador activo.')
  await db.usuarios.put(usuario)
  await S.recargar('usuarios')
  await marcarCambio()
}

// ---------- Personal ----------

export async function guardarTrabajador(t: Omit<Trabajador, 'actualizado' | 'alta' | 'tallas' | 'tipo'> & Partial<Trabajador>): Promise<Trabajador> {
  const rpe = t.rpe.trim().toUpperCase()
  const previo = S.personal.value.get(rpe)
  const ahora = new Date().toISOString()
  // Tipo: lo corrigen el administrador o el encargado de almacén; si no, sale del RPE (9… = permanente)
  const puedeCorregir = S.sesion.value?.rol === 'admin' || S.sesion.value?.rol === 'almacen'
  const tipoAnterior = previo ? tipoDe(previo) : tipoPorRpe(rpe)
  const tipoPedido = t.tipo ? tipoDe({ tipo: t.tipo }) : tipoAnterior
  let tipo = tipoAnterior
  let tipoManual = previo?.tipoManual
  if (tipoPedido !== tipoAnterior) {
    if (!puedeCorregir) throw new ErrorNegocio('Solo un administrador o el encargado de almacén puede cambiar si es permanente, temporal o eventual.')
    tipo = tipoPedido
    tipoManual = true
  }
  const trabajador: Trabajador = {
    tallas: previo?.tallas ?? {},
    alta: previo?.alta ?? ahora,
    altaPor: previo?.altaPor ?? S.sesion.value?.usuarioNombre,
    ...t,
    rpe,
    nombre: t.nombre.trim().toUpperCase(),
    tipo,
    tipoManual,
    actualizado: ahora,
  }
  if (!trabajador.rpe || !trabajador.nombre) throw new ErrorNegocio('RPE y nombre son obligatorios.')
  await db.personal.put(trabajador)
  await S.recargar('personal')
  await marcarCambio()
  return trabajador
}

// ---------- Despacho ----------

export interface LineaTicket {
  materialId: string
  varianteId: string
  cantidad: number
  motivoId?: string
}

export interface Deshacer {
  entregaId: string
  folioNum: number
  cerrados: Resguardo[]
  trabajadorAntes: Trabajador
}

export async function registrarEntrega(
  trabajador: Trabajador,
  lineas: LineaTicket[],
  observaciones: string,
  prestamo?: DatosPrestamo,
  /** Comentario cuando se entrega algo que la persona recibe de forma recurrente. */
  notaRecurrencia = '',
  /**
   * Día real de la entrega (YYYY-MM-DD) cuando se captura después para cuadrar el
   * inventario. Solo administrador o encargado de almacén; vacío = hoy.
   */
  fechaEntrega = '',
): Promise<{ entrega: Entrega; deshacer: Deshacer }> {
  const { sesion, equipo } = actor()
  if (!lineas.length) throw new ErrorNegocio('Agregue al menos un material.')
  const mats = S.materialesPorId.value
  const motivos = new Map(S.motivos.value.map((m) => [m.id, m]))
  const activosTrabajador = S.resguardos.value.filter((r) => r.estatus === 'ACTIVO' && r.rpe === trabajador.rpe)

  const lineasEntrega: LineaEntrega[] = lineas.map((l) => {
    const m = mats.get(l.materialId)
    if (!m) throw new ErrorNegocio(`Material desconocido: ${l.materialId}`)
    if (m.variantes.some((v) => v.activo) && !l.varianteId) throw new ErrorNegocio(`Elija la talla de ${m.nombre}.`)
    if (l.cantidad <= 0) throw new ErrorNegocio(`Cantidad inválida en ${m.nombre}.`)
    if (m.tipo === 'resguardo') {
      if (!l.motivoId) throw new ErrorNegocio(`Elija el motivo de ${m.nombre}.`)
      if (l.cantidad > 1) throw new ErrorNegocio(`Cada trabajador tiene un solo ${m.nombre} en resguardo.`)
      const motivo = motivos.get(l.motivoId)
      if (activosTrabajador.some((r) => r.materialId === m.id) && !motivo?.cierraPrevio) {
        throw new ErrorNegocio(`${trabajador.nombre} ya tiene ${m.nombre} en resguardo. Elija un motivo de reposición (desgaste, daño, extravío o cambio de talla); el anterior se cierra solo.`)
      }
    }
    if (m.tipo === 'prestamo') {
      if (activosTrabajador.some((r) => r.materialId === m.id)) throw new ErrorNegocio(`${trabajador.nombre} no ha devuelto el ${m.nombre} que tiene en préstamo.`)
      validarPrestamo(prestamo, fechaEntrega || fechaLocal())
    }
    return {
      materialId: m.id,
      varianteId: l.varianteId,
      cantidad: l.cantidad,
      esResguardo: m.tipo === 'resguardo',
      esPrestamo: m.tipo === 'prestamo' || undefined,
      motivoId: m.tipo === 'resguardo' ? l.motivoId : undefined,
    }
  })
  const hayPrestamo = lineasEntrega.some((l) => l.esPrestamo)

  const captura = new Date()
  let ahora = captura
  const posterior = !!fechaEntrega && fechaEntrega !== fechaLocal(captura)
  if (posterior) {
    if (sesion.rol !== 'admin' && sesion.rol !== 'almacen') throw new ErrorNegocio('Solo un administrador o el encargado de almacén puede registrar entregas de días anteriores.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEntrega) || isNaN(new Date(fechaEntrega + 'T12:00:00').getTime())) throw new ErrorNegocio('La fecha de la entrega no es válida.')
    if (fechaEntrega > fechaLocal(captura)) throw new ErrorNegocio('La fecha de la entrega no puede ser posterior a hoy.')
    // Mismo día de la entrega, con la hora de captura (conserva el orden entre varias capturas)
    ahora = new Date(`${fechaEntrega}T${String(captura.getHours()).padStart(2, '0')}:${String(captura.getMinutes()).padStart(2, '0')}:${String(captura.getSeconds()).padStart(2, '0')}`)
  }
  const ubicacionId = ubicacionDespachoId()
  const folioNum = siguienteFolio(equipo.codigo, S.folios.value[equipo.codigo] ?? 0, S.entregas.value.map((e) => e.folio))
  const folio = formatoFolio(equipo.codigo, folioNum)
  const hayResguardo = lineasEntrega.some((l) => l.esResguardo)
  const folioSI = hayResguardo ? formatoFolioSI(equipo.codigo, folioNum, ahora.getFullYear()) : ''

  const entrega: Entrega = {
    id: nuevoId('E'),
    folio,
    ts: ahora.toISOString(),
    fecha: fechaLocal(ahora),
    hora: horaLocal(ahora),
    rpe: trabajador.rpe,
    nombre: trabajador.nombre,
    area: trabajador.area,
    usuarioId: sesion.usuarioId,
    usuarioNombre: sesion.usuarioNombre,
    equipo: equipo.codigo,
    ubicacionId,
    lineas: lineasEntrega,
    observaciones: observaciones.trim(),
    estado: 'registrada',
    prestamo: hayPrestamo ? limpiarPrestamo(prestamo!) : undefined,
  }
  if (posterior) entrega.capturada = captura.toISOString()
  // Consumibles que esta persona ya recibió varias veces en los últimos días
  const consumibles = lineasEntrega.filter((l) => !l.esResguardo && !l.esPrestamo).map((l) => l.materialId)
  const recurrentes = materialesRecurrentes(S.entregas.value, trabajador.rpe, consumibles, entrega.fecha)
  if (recurrentes.length) entrega.recurrencia = { materiales: recurrentes.map((r) => r.materialId), nota: notaRecurrencia.trim() }

  const nota = `${trabajador.rpe} · ${trabajador.nombre}`
  const movs: Movimiento[] = lineasEntrega.map((l) =>
    nuevoMovimiento('SALIDA', {
      materialId: l.materialId,
      varianteId: l.varianteId,
      ubicacionId,
      cantidad: -l.cantidad,
      ref: folio,
      motivo: l.motivoId ? motivos.get(l.motivoId)?.texto ?? '' : '',
      nota,
      grupo: entrega.id,
    }),
  )

  // Resguardos nuevos y cierre de los anteriores según el motivo
  const nuevos: Resguardo[] = []
  const cerrados: Resguardo[] = []
  const actualizados: Resguardo[] = []
  for (const l of lineasEntrega.filter((x) => x.esResguardo)) {
    const motivo = l.motivoId ? motivos.get(l.motivoId) : undefined
    if (motivo?.cierraPrevio) {
      const previos = S.resguardos.value.filter((r) => r.estatus === 'ACTIVO' && r.rpe === trabajador.rpe && r.materialId === l.materialId)
      for (const p of previos) {
        cerrados.push(p)
        const reingresa = motivo.cierraPrevio === 'reingresa'
        actualizados.push({
          ...p,
          ver: (p.ver ?? 0) + 1,
          estatus: 'CERRADO',
          cierre: {
            ts: entrega.ts,
            fecha: entrega.fecha,
            motivo: motivo.texto,
            reingresa,
            usuarioId: sesion.usuarioId,
            usuarioNombre: sesion.usuarioNombre,
            ref: folio,
          },
        })
        if (reingresa) {
          movs.push(
            nuevoMovimiento('DEVOLUCION', {
              materialId: p.materialId,
              varianteId: p.varianteId,
              ubicacionId,
              cantidad: p.cantidad,
              ref: p.folioSI,
              motivo: motivo.texto,
              nota,
              grupo: entrega.id,
            }),
          )
        }
      }
    }
    nuevos.push({
      id: nuevoId('R'),
      entregaId: entrega.id,
      folioSI,
      rpe: trabajador.rpe,
      nombre: trabajador.nombre,
      area: trabajador.area,
      materialId: l.materialId,
      varianteId: l.varianteId,
      cantidad: l.cantidad,
      fechaEntrega: entrega.fecha,
      estatus: 'ACTIVO',
      tipo: 'resguardo',
    })
  }

  // Préstamos de corto plazo (arnés de cuerpo completo, línea de vida)
  for (const l of lineasEntrega.filter((x) => x.esPrestamo)) {
    nuevos.push({
      id: nuevoId('R'),
      entregaId: entrega.id,
      folioSI: `PR-${ahora.getFullYear()}-${equipo.codigo}-${String(folioNum).padStart(4, '0')}`,
      rpe: trabajador.rpe,
      nombre: trabajador.nombre,
      area: trabajador.area,
      materialId: l.materialId,
      varianteId: l.varianteId,
      cantidad: l.cantidad,
      fechaEntrega: entrega.fecha,
      estatus: 'ACTIVO',
      tipo: 'prestamo',
      vence: entrega.prestamo!.vence,
      supervisor: entrega.prestamo!.supervisor,
    })
  }

  // Recordar tallas (y supervisor) del trabajador para la próxima vez
  // Se parte de la ficha guardada (no de la copia en pantalla) para no deshacer correcciones recientes
  const ficha = S.personal.value.get(trabajador.rpe) ?? trabajador
  const tallas = { ...ficha.tallas }
  for (const l of lineasEntrega) if (l.varianteId) tallas[l.materialId] = l.varianteId
  const trabajadorNuevo: Trabajador = { ...ficha, tallas, supervisor: entrega.prestamo?.supervisor ?? ficha.supervisor, actualizado: captura.toISOString() }
  // El kardex lleva el día de la entrega, para que las existencias por fecha cuadren
  if (posterior) for (const m of movs) m.ts = entrega.ts
  const nuevosFolios = { ...S.folios.value, [equipo.codigo]: folioNum }

  await db.transaction('rw', [db.entregas, db.movimientos, db.resguardos, db.personal, db.config], async () => {
    await db.entregas.add(entrega)
    await db.movimientos.bulkAdd(movs)
    await db.resguardos.bulkPut([...nuevos, ...actualizados])
    await db.personal.put(trabajadorNuevo)
    await db.config.put({ clave: 'folios', valor: nuevosFolios })
  })
  S.folios.value = nuevosFolios
  await S.recargar('entregas', 'movimientos', 'resguardos', 'personal')
  await marcarCambio()
  return { entrega, deshacer: { entregaId: entrega.id, folioNum, cerrados, trabajadorAntes: ficha } }
}

function limpiarPrestamo(p: DatosPrestamo): DatosPrestamo {
  return {
    vence: p.vence,
    supervisor: { nombre: p.supervisor.nombre.trim().toUpperCase(), rpe: p.supervisor.rpe.trim().toUpperCase(), extension: p.supervisor.extension.trim() },
  }
}

function validarPrestamo(p?: DatosPrestamo, diaEntrega = fechaLocal()): void {
  if (!p) throw new ErrorNegocio('Faltan los datos del préstamo (supervisor y fecha de devolución).')
  if (!p.supervisor.nombre.trim() || !p.supervisor.rpe.trim() || !p.supervisor.extension.trim()) {
    throw new ErrorNegocio('Para prestar el equipo capture nombre, RPE y extensión del supervisor.')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.vence) || p.vence < diaEntrega) throw new ErrorNegocio('La fecha de devolución no puede ser anterior al día de la entrega.')
}

/** Revierte una entrega recién registrada (botón «Deshacer»). */
export async function deshacerEntrega(d: Deshacer): Promise<void> {
  const equipo = S.dispositivo.value
  await db.transaction('rw', [db.entregas, db.movimientos, db.resguardos, db.personal, db.config, db.bajas], async () => {
    // Avisar a la nube qué se eliminó, por si alcanzó a sincronizarse
    const movIds = await db.movimientos.where('grupo').equals(d.entregaId).primaryKeys()
    const resgIds = await db.resguardos.where('entregaId').equals(d.entregaId).primaryKeys()
    const baja = (tabla: string, registroId: string) => ({ id: `${tabla}:${registroId}`, tabla, registroId })
    await db.bajas.bulkPut([baja('entregas', d.entregaId), ...movIds.map((i) => baja('movimientos', i)), ...resgIds.map((i) => baja('resguardos', i))])
    await db.entregas.delete(d.entregaId)
    await db.movimientos.bulkDelete(movIds)
    await db.resguardos.bulkDelete(resgIds)
    // Se reabren con una versión mayor que la del cierre para que ganen al sincronizar
    if (d.cerrados.length) await db.resguardos.bulkPut(d.cerrados.map((r) => ({ ...r, ver: (r.ver ?? 0) + 2 })))
    await db.personal.put(d.trabajadorAntes)
    if (equipo) {
      const f = { ...S.folios.value }
      if (f[equipo.codigo] === d.folioNum) f[equipo.codigo] = d.folioNum - 1
      await db.config.put({ clave: 'folios', valor: f })
      S.folios.value = f
    }
  })
  await S.recargar('entregas', 'movimientos', 'resguardos', 'personal')
}

export async function anularEntrega(entregaId: string, motivoId: string, nota: string): Promise<void> {
  const { sesion } = actor()
  const entrega = S.entregas.value.find((e) => e.id === entregaId)
  if (!entrega) throw new ErrorNegocio('No se encontró la entrega.')
  if (entrega.estado === 'anulada') throw new ErrorNegocio('La entrega ya estaba anulada.')
  const motivo = S.motivos.value.find((m) => m.id === motivoId)
  if (!motivo) throw new ErrorNegocio('Elija un motivo de anulación.')

  const ts = new Date().toISOString()
  const originales = S.movimientos.value.filter((m) => m.grupo === entregaId && m.tipo !== 'ANULACION')
  const reversas = originales.map((m) =>
    nuevoMovimiento('ANULACION', {
      materialId: m.materialId,
      varianteId: m.varianteId,
      ubicacionId: m.ubicacionId,
      cantidad: -m.cantidad,
      ref: entrega.folio,
      motivo: motivo.texto,
      nota: nota.trim(),
      grupo: entregaId,
    }),
  )
  const cambiosResg: Resguardo[] = []
  for (const r of S.resguardos.value) {
    if (r.entregaId === entregaId && r.estatus !== 'ANULADO') cambiosResg.push({ ...r, estatus: 'ANULADO', ver: (r.ver ?? 0) + 1 })
    else if (r.estatus === 'CERRADO' && r.cierre?.ref === entrega.folio) cambiosResg.push({ ...r, estatus: 'ACTIVO', cierre: undefined, ver: (r.ver ?? 0) + 1 })
  }
  const anulada: Entrega = {
    ...entrega,
    estado: 'anulada',
    anulacion: { ts, usuarioId: sesion.usuarioId, usuarioNombre: sesion.usuarioNombre, motivoId, nota: nota.trim() },
  }
  await db.transaction('rw', [db.entregas, db.movimientos, db.resguardos], async () => {
    await db.entregas.put(anulada)
    await db.movimientos.bulkAdd(reversas)
    if (cambiosResg.length) await db.resguardos.bulkPut(cambiosResg)
  })
  await S.recargar('entregas', 'movimientos', 'resguardos')
  await marcarCambio()
}

// ---------- Resguardos ----------

export async function devolverResguardo(resguardoId: string, motivoId: string, nota: string): Promise<void> {
  const { sesion } = actor()
  const r = S.resguardos.value.find((x) => x.id === resguardoId)
  if (!r || r.estatus !== 'ACTIVO') throw new ErrorNegocio('El resguardo ya no está activo.')
  const motivo = S.motivos.value.find((m) => m.id === motivoId)
  if (!motivo) throw new ErrorNegocio('Elija el estado del equipo devuelto.')
  const ahora = new Date()
  const cerrado: Resguardo = {
    ...r,
    ver: (r.ver ?? 0) + 1,
    estatus: 'CERRADO',
    cierre: {
      ts: ahora.toISOString(),
      fecha: fechaLocal(ahora),
      motivo: motivo.texto + (nota.trim() ? ` · ${nota.trim()}` : ''),
      reingresa: !!motivo.reingresa,
      usuarioId: sesion.usuarioId,
      usuarioNombre: sesion.usuarioNombre,
      ref: 'DEVOLUCIÓN',
    },
  }
  await db.transaction('rw', [db.resguardos, db.movimientos], async () => {
    await db.resguardos.put(cerrado)
    if (motivo.reingresa) {
      await db.movimientos.add(
        nuevoMovimiento('DEVOLUCION', {
          materialId: r.materialId,
          varianteId: r.varianteId,
          ubicacionId: ubicacionDespachoId(),
          cantidad: r.cantidad,
          ref: r.folioSI,
          motivo: motivo.texto,
          nota: `${r.rpe} · ${r.nombre}`,
        }),
      )
    }
  })
  await S.recargar('resguardos', 'movimientos')
  await marcarCambio()
}

// ---------- Almacén ----------

export async function registrarEntrada(p: { materialId: string; varianteId: string; ubicacionId: string; cantidad: number; motivoId: string; ref: string; nota: string }): Promise<void> {
  exigirInventario()
  if (!(p.cantidad > 0)) throw new ErrorNegocio('La cantidad debe ser mayor a cero.')
  const motivo = S.motivos.value.find((m) => m.id === p.motivoId)
  await db.movimientos.add(
    nuevoMovimiento('ENTRADA', {
      materialId: p.materialId,
      varianteId: p.varianteId,
      ubicacionId: p.ubicacionId,
      cantidad: p.cantidad,
      ref: p.ref.trim(),
      motivo: motivo?.texto ?? '',
      nota: p.nota.trim(),
    }),
  )
  await S.recargar('movimientos')
  await marcarCambio()
}

export async function ajustarExistencia(p: { materialId: string; varianteId: string; ubicacionId: string; conteo: number; motivoId: string; nota: string }): Promise<number> {
  exigirInventario()
  if (!(p.conteo >= 0)) throw new ErrorNegocio('Ingrese un conteo de 0 o más.')
  const motivo = S.motivos.value.find((m) => m.id === p.motivoId)
  if (!motivo) throw new ErrorNegocio('Elija el motivo del ajuste.')
  const actual = existencia(S.existencias.value, p.materialId, p.varianteId, p.ubicacionId)
  const diferencia = p.conteo - actual
  if (diferencia === 0) return 0
  await db.movimientos.add(
    nuevoMovimiento('AJUSTE', {
      materialId: p.materialId,
      varianteId: p.varianteId,
      ubicacionId: p.ubicacionId,
      cantidad: diferencia,
      motivo: motivo.texto,
      nota: p.nota.trim(),
    }),
  )
  await S.recargar('movimientos')
  await marcarCambio()
  return diferencia
}

export async function traspasar(p: { materialId: string; varianteId: string; origenId: string; destinoId: string; cantidad: number; nota: string }): Promise<void> {
  exigirInventario()
  if (p.origenId === p.destinoId) throw new ErrorNegocio('El origen y el destino deben ser distintos.')
  if (!(p.cantidad > 0)) throw new ErrorNegocio('La cantidad debe ser mayor a cero.')
  const disponible = existencia(S.existencias.value, p.materialId, p.varianteId, p.origenId)
  if (p.cantidad > disponible) throw new ErrorNegocio(`Solo hay ${disponible} en el origen.`)
  const grupo = nuevoId('T')
  const nombres = new Map(S.ubicaciones.value.map((u) => [u.id, u.nombre]))
  await db.movimientos.bulkAdd([
    nuevoMovimiento('TRASPASO', { materialId: p.materialId, varianteId: p.varianteId, ubicacionId: p.origenId, cantidad: -p.cantidad, ref: `→ ${nombres.get(p.destinoId)}`, nota: p.nota.trim(), grupo }),
    nuevoMovimiento('TRASPASO', { materialId: p.materialId, varianteId: p.varianteId, ubicacionId: p.destinoId, cantidad: p.cantidad, ref: `← ${nombres.get(p.origenId)}`, nota: p.nota.trim(), grupo }),
  ])
  await S.recargar('movimientos')
  await marcarCambio()
}

// ---------- Catálogo ----------

export async function guardarMaterial(m: Omit<Material, 'actualizado'>, fotoDataUrl?: string | null): Promise<void> {
  if (!m.nombre.trim()) throw new ErrorNegocio('Escriba el nombre del material.')
  const ids = m.variantes.map((v) => v.id)
  if (new Set(ids).size !== ids.length) throw new ErrorNegocio('Hay tallas repetidas.')
  let fotoId = m.fotoId
  await db.transaction('rw', [db.materiales, db.fotos], async () => {
    if (fotoDataUrl) {
      fotoId = fotoId ?? nuevoId('F')
      await db.fotos.put({ id: fotoId, dataUrl: fotoDataUrl })
    } else if (fotoDataUrl === null && fotoId) {
      await db.fotos.delete(fotoId)
      fotoId = undefined
    }
    await db.materiales.put({ ...m, nombre: m.nombre.trim(), fotoId, actualizado: new Date().toISOString() })
  })
  await S.recargar('materiales', 'fotos')
  await marcarCambio()
}

export async function guardarRegistro<T extends { id: string }>(tabla: 'kits' | 'motivos' | 'ubicaciones' | 'categorias', registro: T): Promise<void> {
  const conFecha = tabla === 'kits' ? { ...registro, actualizado: new Date().toISOString() } : registro
  await (db[tabla] as unknown as { put: (r: unknown) => Promise<unknown> }).put(conFecha)
  if (tabla === 'ubicaciones' && (registro as unknown as { esDespacho: boolean }).esDespacho) {
    // Solo una ubicación de despacho
    const otras = (await db.ubicaciones.toArray()).filter((u) => u.id !== registro.id && u.esDespacho)
    await db.ubicaciones.bulkPut(otras.map((u) => ({ ...u, esDespacho: false })))
  }
  await S.recargar(tabla)
  await marcarCambio()
}

export { nuevoId }
