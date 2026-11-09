/**
 * Control EPP · Oficina de Seguridad Industrial · CFE Laguna Verde
 * Servidor de sincronización en Google Apps Script (Fase 2).
 *
 * Cómo instalarlo: vea nube/GUIA.md. En resumen: pegue este archivo en
 * Extensiones → Apps Script de la hoja, ejecute «configurar» una vez y
 * publíquelo como aplicación web (Ejecutar como: yo · Acceso: cualquier persona).
 *
 * Puente con la PC de la oficina (2.6.0): ejecute «instalarPuente» una vez. Crea un formulario y una
 * hoja aparte con datos cifrados para que el servidor de la PC host intercambie la información cada
 * 5 minutos (la red de la oficina solo deja pasar docs.google.com). También programa un respaldo
 * diario de esta hoja en Google Drive.
 *
 * Cada tabla de la app es una pestaña. Las columnas id, _rev, _borrado y _json
 * son las que usa la sincronización; el resto son columnas de consulta.
 * No edite las pestañas a mano: los cambios se hacen desde la app.
 */

var VERSION_SERVIDOR = '2.6.0'
var ZONA = 'America/Mexico_City'
var LIMITE_FILAS = 800
var LIMITE_CARACTERES = 3000000


// ---------------------------------------------------------------------------
// Definición de tablas
// ---------------------------------------------------------------------------

function nombreMat(ctx, id) {
  return (ctx.materiales()[id] || {}).nombre || id
}
function nombreUbi(ctx, id) {
  return (ctx.ubicaciones()[id] || {}).nombre || id
}
function fechaTs(ts, patron) {
  return ts ? Utilities.formatDate(new Date(ts), ZONA, patron) : ''
}

var TABLAS = {
  materiales: {
    hoja: 'Materiales',
    cols: ['Nombre', 'Categoría', 'Tipo', 'Tallas', 'Activo'],
    fila: function (d) {
      return [d.nombre, d.categoriaId, d.tipo, (d.variantes || []).map(function (v) { return v.id }).join(' · '), d.activo ? 'SI' : 'NO']
    },
  },
  categorias: { hoja: 'Categorias', cols: ['Nombre'], fila: function (d) { return [d.nombre] } },
  fotos: { hoja: 'Fotos', cols: ['Tamaño KB'], fila: function (d) { return [Math.round(((d.dataUrl || '').length * 0.75) / 1024)] } },
  kits: {
    hoja: 'Kits',
    cols: ['Nombre', 'Materiales', 'Activo'],
    fila: function (d, ctx) {
      return [d.nombre, (d.lineas || []).map(function (l) { return nombreMat(ctx, l.materialId) + ' ×' + l.cantidad + (l.areas && l.areas.length ? ' (' + l.areas.join(', ') + ')' : '') }).join(' · '), d.activo ? 'SI' : 'NO']
    },
  },
  ubicaciones: { hoja: 'Almacenes', cols: ['Nombre', 'Despacho', 'Activo'], fila: function (d) { return [d.nombre, d.esDespacho ? 'SI' : '', d.activo ? 'SI' : 'NO'] } },
  personal: {
    hoja: 'Personal',
    llave: 'rpe',
    cols: ['RPE', 'Nombre', 'Área', 'Puesto', 'Casillero', 'Tipo', 'Vigencia', 'Activo'],
    fila: function (d) { return [d.rpe, d.nombre, d.area, d.puesto, d.casillero, TIPOS_TRABAJADOR[d.tipo] || d.tipo, d.vigencia || '', d.activo ? 'SI' : 'NO'] },
  },
  usuarios: { hoja: 'Usuarios', cols: ['Nombre', 'Administrador', 'Activo', 'Rol'], fila: function (d) { return [d.nombre, d.esAdmin ? 'SI' : '', d.activo ? 'SI' : 'NO', ROLES[d.rol || (d.esAdmin ? 'admin' : 'despachador')] || ''] } },
  motivos: { hoja: 'Motivos', cols: ['Tipo', 'Texto', 'Activo'], fila: function (d) { return [d.tipo, d.texto, d.activo ? 'SI' : 'NO'] } },
  entregas: {
    hoja: 'Entregas',
    cols: ['Folio', 'Fecha', 'Hora', 'RPE', 'Nombre', 'Área', 'Materiales', 'Despachó', 'Equipo', 'Estado', 'Recurrente', 'Comentario'],
    fila: function (d, ctx) {
      return [
        d.folio, d.fecha, d.hora, d.rpe, d.nombre, d.area,
        (d.lineas || []).map(function (l) { return nombreMat(ctx, l.materialId) + (l.varianteId ? ' ' + l.varianteId : '') + ' ×' + l.cantidad }).join(' · '),
        d.usuarioNombre, d.equipo, d.estado === 'anulada' ? 'ANULADA' : 'OK',
        d.recurrencia ? (d.recurrencia.materiales || []).map(function (m) { return nombreMat(ctx, m) }).join(' · ') : '',
        d.recurrencia ? d.recurrencia.nota || '' : '',
      ]
    },
  },
  movimientos: {
    hoja: 'Movimientos',
    cols: ['Fecha', 'Hora', 'Tipo', 'MaterialId', 'Material', 'Talla', 'AlmacénId', 'Almacén', 'Cantidad', 'Referencia', 'Motivo', 'Nota', 'Usuario', 'Equipo'],
    fila: function (d, ctx) {
      return [
        fechaTs(d.ts, 'yyyy-MM-dd'), fechaTs(d.ts, 'HH:mm'), d.tipo, d.materialId, nombreMat(ctx, d.materialId), d.varianteId,
        d.ubicacionId, nombreUbi(ctx, d.ubicacionId), d.cantidad, d.ref, d.motivo, d.nota, d.usuarioNombre, d.equipo,
      ]
    },
  },
  resguardos: {
    hoja: 'Resguardos',
    cols: ['Folio', 'RPE', 'Nombre', 'Material', 'Talla', 'Cantidad', 'Entregado', 'Estatus', 'Cierre', 'Motivo de cierre', 'Tipo', 'Devolver antes de', 'Supervisor', 'RPE supervisor', 'Ext. supervisor'],
    fila: function (d, ctx) {
      var s = d.supervisor || {}
      return [
        d.folioSI, d.rpe, d.nombre, nombreMat(ctx, d.materialId), d.varianteId, d.cantidad, d.fechaEntrega, d.estatus,
        d.cierre ? d.cierre.fecha : '', d.cierre ? d.cierre.motivo : '',
        d.tipo === 'prestamo' ? 'PRÉSTAMO' : 'RESGUARDO', d.vence || '', s.nombre || '', s.rpe || '', s.extension || '',
      ]
    },
  },
}

TABLAS.equipos = {
  hoja: 'Equipos a resguardo',
  cols: ['Código', 'Equipo', 'Marca', 'Modelo', 'Serie', 'Accesorios', 'Lleva bitácora', 'Próxima calibración', 'Estado', 'Activo'],
  fila: function (d) {
    return [d.codigo, d.nombre, d.marca, d.modelo, d.serie, (d.accesorios || []).join(' · '), d.llevaBitacora ? 'SI' : 'NO', d.calibracion || '', ESTADOS_EQUIPO[d.estado] || d.estado, d.activo ? 'SI' : 'NO']
  },
}
TABLAS.prestamosEquipo = {
  hoja: 'Bitácora equipos',
  cols: ['Folio', 'Código', 'Equipo', 'Salida', 'Recibió RPE', 'Recibió', 'Área', 'Contacto', 'Uso / lugar', 'Entregó', 'Devolver antes de', 'Accesorios', 'Bitácora', 'Estatus', 'Regreso', 'Devolvió', 'Revisó', 'Condición', 'Faltantes', 'Comentarios', 'Entregó (SI)', 'Recibió (SI)', 'Tipo de cierre', 'Observaciones al entregar', 'Transferencia', 'Fotos'],
  fila: function (d) {
    var r = d.regreso || {}
    var refSI = function (x) { return x ? x.corto || x.nombre || '' : '' }
    var faltan = d.regreso ? (d.accesorios || []).filter(function (a) { return (r.accesorios || []).indexOf(a) < 0 }) : []
    return [
      d.folio, d.equipoCodigo, d.equipoNombre, fechaTs(d.ts, 'yyyy-MM-dd HH:mm'), d.rpe, d.nombre, d.area, d.contacto, d.uso, d.usuarioNombre,
      String(d.vence || '').replace('T', ' '), (d.accesorios || []).join(' · '), d.bitacora ? 'SI' : 'NO', d.estatus,
      d.regreso ? fechaTs(r.ts, 'yyyy-MM-dd HH:mm') : '', d.regreso ? r.devolvioNombre + ' · ' + r.devolvioRpe : '', r.usuarioNombre || '',
      d.regreso ? CONDICIONES[r.condicion] || r.condicion : '', faltan.join(' · '), r.comentarios || d.observaciones || '',
      refSI(d.entregoSI) || d.usuarioNombre, d.regreso ? refSI(r.recibioSI) || r.usuarioNombre || '' : '',
      d.regreso ? (r.tipo === 'transferencia' ? 'Transferencia' : 'Devolución') : '', (d.obsRapidas || []).join(' · '),
      d.origenId ? 'Recibido en transferencia' : r.siguienteId ? 'Pasó a otra persona' : '', ((d.fotos || []).length + (r.fotos || []).length) || '',
    ]
  },
}
TABLAS.personalSI = {
  hoja: 'Personal SI',
  cols: ['RPE', 'Nombre', 'Nombre corto', 'Activo'],
  fila: function (d) { return [d.rpe || '', d.nombre, d.corto, d.activo ? 'SI' : 'NO'] },
}
TABLAS.obsEquipo = {
  hoja: 'Observaciones equipos',
  cols: ['Observación', 'Gravedad', 'Activo'],
  fila: function (d) { return [d.texto, { ok: 'Sin novedad', detalle: 'Detalle', dano: 'Daño' }[d.tipo] || d.tipo, d.activo ? 'SI' : 'NO'] },
}
TABLAS.ajustes = {
  hoja: 'Ajustes',
  cols: ['Ajuste', 'Valor'],
  fila: function (d) { return [d.id, String(d.valor)] },
}
var TIPOS_TRABAJADOR = { permanente: 'Permanente', planta: 'Permanente', temporal: 'Temporal', eventual: 'Eventual' }
var ROLES = { admin: 'Administrador', almacen: 'Encargado de almacén', despachador: 'Despachador' }
var ESTADOS_EQUIPO = { operativo: 'Operativo', revision: 'En revisión', baja: 'Baja' }
var CONDICIONES = { bueno: 'Buen estado', detalle: 'Con detalle', danado: 'Dañado' }

var BASE = ['id', '_rev', '_borrado', '_json']
var COL_ID = 0
var COL_REV = 1
var COL_BORRADO = 2
var COL_JSON = 3

// ---------------------------------------------------------------------------
// Entrada HTTP
// ---------------------------------------------------------------------------

function doGet() {
  return respuesta({ ok: true, app: 'control-epp', version: VERSION_SERVIDOR })
}

function doPost(e) {
  var pet
  try {
    pet = JSON.parse(e.postData.contents)
  } catch (err) {
    return respuesta({ ok: false, error: 'Petición inválida.' })
  }
  try {
    if (pet.accion === 'ping') return respuesta({ ok: true, app: 'control-epp', version: VERSION_SERVIDOR })
    if (pet.accion === 'registrar') return respuesta(conCandado(function () { return registrar(pet) }))
    if (pet.accion === 'sync') return respuesta(conCandado(function () { return sincronizar(pet) }))
    if (pet.accion === 'equipos') return respuesta(conCandado(function () { return listaEquipos(pet) }))
    if (pet.accion === 'equipo') return respuesta(conCandado(function () { return cambiarEquipo(pet) }))
    return respuesta({ ok: false, error: 'Acción desconocida.' })
  } catch (err) {
    return respuesta({ ok: false, error: String((err && err.message) || err) })
  }
}

function respuesta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}

function conCandado(fn) {
  var candado = LockService.getScriptLock()
  if (!candado.tryLock(25000)) throw new Error('El servidor está ocupado. Se reintentará en un momento.')
  try {
    return fn()
  } finally {
    candado.releaseLock()
  }
}

// ---------------------------------------------------------------------------
// Configuración inicial (ejecutar a mano desde el editor)
// ---------------------------------------------------------------------------

function configurar() {
  var props = PropertiesService.getScriptProperties()
  if (!props.getProperty('CLAVE')) props.setProperty('CLAVE', generarClave())
  if (!props.getProperty('REV')) props.setProperty('REV', '0')
  Object.keys(TABLAS).forEach(function (t) { obtenerHoja(t) })
  hojaEquipos()
  var info = hojaSimple('Configuración', null)
  var correosPrevios = info.getLastRow() >= FILA_CORREOS ? String(info.getRange(FILA_CORREOS, 2).getValues()[0][0] || '') : ''
  info.clearContents()
  info.getRange(1, 1, 7, 2).setValues([
    ['Control EPP · servidor', VERSION_SERVIDOR],
    ['Clave de la oficina', props.getProperty('CLAVE')],
    ['Uso', 'Escriba esta clave en la app (Ajustes → Nube) para conectar cada equipo.'],
    ['Seguridad', 'No comparta esta clave fuera de la oficina. Para cambiarla, ejecute «nuevaClave».'],
    ['Configurado', Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH:mm')],
    ['Correos para avisos', correosPrevios],
    ['Avisos', 'Además de la cuenta dueña, escriba en la celda de arriba otros correos separados por coma. Active el envío diario con «activarAvisosDiarios».'],
  ])
  var hojaPuente = props.getProperty('PUENTE_HOJA')
  if (hojaPuente) {
    info.getRange(9, 1, 2, 2).setValues([
      ['Puente con la PC · enlace', 'https://docs.google.com/spreadsheets/d/' + hojaPuente + '/edit'],
      ['Puente · uso', 'Pegue este enlace y la clave de la oficina en la PC host: Ajustes → Servidor de la oficina → Puente con los celulares.'],
    ])
  }
  Logger.log('Clave de la oficina: ' + props.getProperty('CLAVE'))
  return props.getProperty('CLAVE')
}

/** Cambia la clave. Los equipos ya conectados siguen funcionando; los nuevos usan la nueva. */
function nuevaClave() {
  PropertiesService.getScriptProperties().setProperty('CLAVE', generarClave())
  return configurar()
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Control EPP')
    .addItem('Configurar / ver clave', 'configurar')
    .addItem('Recalcular existencias', 'recalcularExistencias')
    .addItem('Enviar avisos ahora', 'enviarAvisos')
    .addItem('Activar avisos diarios (7:00)', 'activarAvisosDiarios')
    .addSeparator()
    .addItem('Instalar / ver puente con la PC', 'instalarPuente')
    .addItem('Intercambiar con la PC ahora', 'puenteCiclo')
    .addItem('Respaldar esta hoja ahora', 'respaldoDiario')
    .addToUi()
}

function generarClave() {
  var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now(), Utilities.Charset.UTF_8)
  var s = ''
  for (var i = 0; i < 12; i++) {
    s += abc.charAt((bytes[i] + 256) % abc.length)
    if (i === 3 || i === 7) s += '-'
  }
  return s
}

function hashTexto(t) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2) })
    .join('')
}

// ---------------------------------------------------------------------------
// Hojas
// ---------------------------------------------------------------------------

function libro() {
  return SpreadsheetApp.getActiveSpreadsheet()
}

function hojaSimple(nombre, encabezado) {
  var h = libro().getSheetByName(nombre)
  if (!h) {
    h = libro().insertSheet(nombre)
    if (encabezado) {
      h.getRange(1, 1, 1, encabezado.length).setValues([encabezado]).setFontWeight('bold')
      h.setFrozenRows(1)
    }
  }
  return h
}

function obtenerHoja(tabla) {
  var def = TABLAS[tabla]
  if (!def) throw new Error('Tabla desconocida: ' + tabla)
  var h = libro().getSheetByName(def.hoja)
  if (!h) {
    h = libro().insertSheet(def.hoja)
    var enc = BASE.concat(def.cols)
    h.getRange(1, 1, 1, enc.length).setValues([enc]).setFontWeight('bold').setBackground('#DCEFE3')
    h.getRange(1, 1, h.getMaxRows(), enc.length).setNumberFormat('@')
    h.setFrozenRows(1)
    h.hideColumns(COL_JSON + 1)
  } else {
    // Hoja creada por una versión anterior: agregar las columnas nuevas al final
    var enc2 = BASE.concat(def.cols)
    var actual = h.getRange(1, 1, 1, enc2.length).getValues()[0]
    if (String(actual[enc2.length - 1]) !== enc2[enc2.length - 1]) {
      h.getRange(1, 1, 1, enc2.length).setValues([enc2]).setFontWeight('bold').setBackground('#DCEFE3')
      h.getRange(1, 1, h.getMaxRows(), enc2.length).setNumberFormat('@')
    }
  }
  return h
}

function hojaEquipos() {
  return hojaSimple('Equipos', ['equipoId', 'Código', 'Responsable', 'tokenHash', 'Activo', 'Alta', 'Último contacto'])
}

/** Lee una tabla completa: filas (sin encabezado) y un índice id → número de fila. */
function leerTabla(tabla) {
  var h = obtenerHoja(tabla)
  var n = h.getLastRow()
  var ancho = BASE.length + TABLAS[tabla].cols.length
  var filas = n > 1 ? h.getRange(2, 1, n - 1, ancho).getValues() : []
  var indice = {}
  for (var i = 0; i < filas.length; i++) indice[String(filas[i][COL_ID])] = i
  return { hoja: h, filas: filas, indice: indice, ancho: ancho }
}

// ---------------------------------------------------------------------------
// Registro de equipos
// ---------------------------------------------------------------------------

function registrar(pet) {
  var props = PropertiesService.getScriptProperties()
  var clave = props.getProperty('CLAVE')
  if (!clave) throw new Error('El servidor aún no está configurado. Ejecute «configurar» en Apps Script.')
  if (String(pet.clave || '').trim().toUpperCase() !== clave) throw new Error('La clave de la oficina no es correcta.')
  var eq = pet.equipo || {}
  if (!/^[A-Z0-9]{1,4}$/.test(eq.codigo || '')) throw new Error('Código de equipo inválido.')
  if (!eq.id) throw new Error('Falta el identificador del equipo.')

  var h = hojaEquipos()
  var n = h.getLastRow()
  var filas = n > 1 ? h.getRange(2, 1, n - 1, 7).getValues() : []
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][1]) === eq.codigo && String(filas[i][0]) !== eq.id && String(filas[i][4]) === 'SI') {
      // Reemplazo confirmado por el usuario (el mismo equipo con los datos borrados, o uno que ya no se usa)
      if (pet.reemplazar === true) {
        h.getRange(i + 2, 5).setValue('NO')
        continue
      }
      throw new Error('El código ' + eq.codigo + ' ya lo usa el equipo «' + filas[i][2] + '» (último contacto ' + filas[i][6] + ').')
    }
  }
  var token = Utilities.getUuid() + Utilities.getUuid()
  var ahora = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH:mm')
  var fila = [eq.id, eq.codigo, eq.nombre || '', hashTexto(token), 'SI', ahora, ahora]
  var existente = -1
  for (var j = 0; j < filas.length; j++) if (String(filas[j][0]) === eq.id) existente = j
  if (existente >= 0) h.getRange(existente + 2, 1, 1, 7).setValues([fila])
  else h.getRange(n + 1, 1, 1, 7).setValues([fila])
  return { ok: true, token: token, version: VERSION_SERVIDOR }
}

/** Equipos registrados (para el panel del administrador en la app). */
function listaEquipos(pet) {
  autenticar(pet)
  var h = hojaEquipos()
  var n = h.getLastRow()
  var filas = n > 1 ? h.getRange(2, 1, n - 1, 7).getValues() : []
  return {
    ok: true,
    equipos: filas.map(function (f) {
      return { id: String(f[0]), codigo: String(f[1]), nombre: String(f[2]), alta: String(f[5]), ultimo: String(f[6]), activo: String(f[4]) === 'SI' }
    }),
  }
}

/** Baja o reactivación de un equipo. Un equipo no puede darse de baja a sí mismo. */
function cambiarEquipo(pet) {
  autenticar(pet)
  var h = hojaEquipos()
  var n = h.getLastRow()
  var filas = n > 1 ? h.getRange(2, 1, n - 1, 7).getValues() : []
  var pos = -1
  for (var i = 0; i < filas.length; i++) if (String(filas[i][0]) === String(pet.objetivo)) pos = i
  if (pos < 0) throw new Error('Ese equipo ya no está registrado.')
  if (pet.activo === false && String(pet.objetivo) === String(pet.equipoId)) throw new Error('Este equipo no puede darse de baja a sí mismo.')
  if (pet.activo === true) {
    for (var j = 0; j < filas.length; j++) {
      if (j !== pos && String(filas[j][1]) === String(filas[pos][1]) && String(filas[j][4]) === 'SI') throw new Error('El código ' + filas[pos][1] + ' ya lo usa otro equipo activo (' + filas[j][2] + ').')
    }
  }
  if (pet.activo === true || pet.activo === false) h.getRange(pos + 2, 5).setValue(pet.activo ? 'SI' : 'NO')
  if (pet.nombre) h.getRange(pos + 2, 3).setValue(String(pet.nombre).trim())
  return { ok: true }
}

function autenticar(pet) {
  var h = hojaEquipos()
  var n = h.getLastRow()
  var filas = n > 1 ? h.getRange(2, 1, n - 1, 7).getValues() : []
  var hash = hashTexto(pet.token || '')
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][0]) === String(pet.equipoId)) {
      if (String(filas[i][4]) !== 'SI') throw new Error('Este equipo fue dado de baja en la hoja «Equipos».')
      if (String(filas[i][3]) !== hash) throw new Error('Equipo no autorizado. Vuelva a conectarlo con la clave de la oficina.')
      h.getRange(i + 2, 7).setValue(Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH:mm'))
      return { codigo: String(filas[i][1]) }
    }
  }
  throw new Error('Equipo no registrado. Conéctelo con la clave de la oficina.')
}

// ---------------------------------------------------------------------------
// Reglas para combinar versiones (iguales a las de la app)
// ---------------------------------------------------------------------------

/** Devuelve true si debe conservarse la versión entrante en lugar de la actual. */
function ganaEntrante(tabla, actual, entrante) {
  if (tabla === 'entregas') {
    if (actual.estado === 'anulada' && entrante.estado !== 'anulada') return false
    return true
  }
  if (tabla === 'resguardos' || tabla === 'prestamosEquipo') {
    // Cada cambio de estatus sube «ver»; gana la versión más reciente.
    var va = actual.ver || 0
    var ve = entrante.ver || 0
    if (ve !== va) return ve > va
    return !(actual.estatus !== 'ACTIVO' && entrante.estatus === 'ACTIVO')
  }
  if (actual.actualizado && entrante.actualizado) return entrante.actualizado >= actual.actualizado
  return true
}

// ---------------------------------------------------------------------------
// Sincronización
// ---------------------------------------------------------------------------

function contexto() {
  var cache = {}
  function mapa(tabla) {
    if (!cache[tabla]) {
      var t = leerTabla(tabla)
      var m = {}
      t.filas.forEach(function (f) {
        try {
          m[String(f[COL_ID])] = JSON.parse(f[COL_JSON])
        } catch (e) {}
      })
      cache[tabla] = m
    }
    return cache[tabla]
  }
  return {
    materiales: function () { return mapa('materiales') },
    ubicaciones: function () { return mapa('ubicaciones') },
    limpiar: function (tabla) { delete cache[tabla] },
  }
}

/**
 * Aplica cambios {tabla, id, borrado, datos} con las reglas de combinación (los de un equipo o los que
 * llegan por el puente). `eco` (opcional) recibe «tabla|id» → rev de lo que quedó tal como llegó, para
 * que el puente no se lo regrese a la PC que lo mandó.
 */
function aplicarCambios(cambios, eco) {
  var props = PropertiesService.getScriptProperties()
  var rev = Number(props.getProperty('REV') || '0')
  var ctx = contexto()
  var tablasLeidas = {}
  var errores = []
  var tocadas = {}
  var finalesEntregas = [] // versión que quedó guardada de cada entrega tocada

  // 1) Aplicar cambios del equipo, agrupados por tabla
  var porTabla = {}
  cambios.forEach(function (c) {
    if (!TABLAS[c.tabla]) return errores.push('Tabla desconocida: ' + c.tabla)
    ;(porTabla[c.tabla] = porTabla[c.tabla] || []).push(c)
  })
  // Materiales y almacenes primero, para que las columnas de consulta tengan nombres
  var orden = ['categorias', 'ubicaciones', 'materiales'].concat(Object.keys(TABLAS).filter(function (t) { return ['categorias', 'ubicaciones', 'materiales'].indexOf(t) < 0 }))
  orden.forEach(function (tabla) {
    var lista = porTabla[tabla]
    if (!lista) return
    var t = leerTabla(tabla)
    tablasLeidas[tabla] = t
    var nuevas = []
    var modificadas = {}
    lista.forEach(function (c) {
      var id = String(c.id)
      var pos = t.indice[id]
      var fila
      if (c.borrado) {
        rev++
        if (eco) eco[tabla + '|' + id] = rev
        if (tabla === 'entregas') finalesEntregas.push({ id: id, borrado: true })
        if (pos === undefined) {
          fila = [id, String(rev), 'SI', '{}'].concat(TABLAS[tabla].cols.map(function () { return '' }))
          t.indice[id] = t.filas.length
          t.filas.push(fila)
          nuevas.push(fila)
        } else {
          fila = t.filas[pos]
          fila[COL_REV] = String(rev)
          fila[COL_BORRADO] = 'SI'
          modificadas[pos] = true
        }
        return
      }
      var json = JSON.stringify(c.datos)
      if (json.length > 49000) return errores.push('Registro demasiado grande (' + tabla + ' ' + id + '); reduzca la foto.')
      rev++
      if (pos === undefined) {
        if (eco) eco[tabla + '|' + id] = rev
        if (tabla === 'entregas') finalesEntregas.push({ id: id, datos: c.datos })
        fila = [id, String(rev), '', json].concat(TABLAS[tabla].fila(c.datos, ctx))
        t.indice[id] = t.filas.length
        t.filas.push(fila)
        nuevas.push(fila)
      } else {
        fila = t.filas[pos]
        if (fila[COL_BORRADO] === 'SI') return
        var actual = {}
        try {
          actual = JSON.parse(fila[COL_JSON])
        } catch (e) {}
        var gana = ganaEntrante(tabla, actual, c.datos)
        if (tabla === 'entregas') finalesEntregas.push({ id: id, datos: gana ? c.datos : actual })
        if (gana) {
          if (eco) eco[tabla + '|' + id] = rev
          var nueva = [id, String(rev), '', json].concat(TABLAS[tabla].fila(c.datos, ctx))
          for (var k = 0; k < nueva.length; k++) fila[k] = nueva[k]
        } else {
          // Se conserva la versión del servidor, pero se marca para que el equipo la reciba
          fila[COL_REV] = String(rev)
        }
        modificadas[pos] = true
      }
    })
    Object.keys(modificadas).forEach(function (p) {
      var i = Number(p)
      t.hoja.getRange(i + 2, 1, 1, t.ancho).setValues([t.filas[i]])
    })
    if (nuevas.length) {
      var primera = t.hoja.getLastRow() + 1
      t.hoja.getRange(primera, 1, nuevas.length, t.ancho).setValues(nuevas)
    }
    tocadas[tabla] = true
    if (tabla === 'materiales' || tabla === 'ubicaciones') ctx.limpiar(tabla)
  })
  props.setProperty('REV', String(rev))

  if (finalesEntregas.length) actualizarDetalle(finalesEntregas, ctx)
  if (tocadas.movimientos || tocadas.materiales || tocadas.ubicaciones) recalcularExistencias()
  return { rev: rev, errores: errores, tablasLeidas: tablasLeidas }
}

function sincronizar(pet) {
  var equipo = autenticar(pet)
  var aplicado = aplicarCambios(pet.cambios || [])
  var rev = aplicado.rev
  var errores = aplicado.errores
  var tablasLeidas = aplicado.tablasLeidas

  // 2) Devolver lo que el equipo aún no tiene
  var cursor = Number(pet.cursor || 0)
  var filas = []
  if (cursor < rev) {
    Object.keys(TABLAS).forEach(function (tabla) {
      var t = tablasLeidas[tabla] || leerTabla(tabla)
      t.filas.forEach(function (f) {
        var r = Number(f[COL_REV])
        if (r > cursor) filas.push({ tabla: tabla, id: String(f[COL_ID]), rev: r, borrado: f[COL_BORRADO] === 'SI', json: f[COL_JSON] })
      })
    })
    filas.sort(function (a, b) { return a.rev - b.rev })
  }
  var salida = []
  var caracteres = 0
  var nuevoCursor = rev
  for (var i = 0; i < filas.length; i++) {
    if (salida.length >= LIMITE_FILAS || caracteres > LIMITE_CARACTERES) {
      nuevoCursor = salida[salida.length - 1].rev
      break
    }
    var f = filas[i]
    caracteres += f.json.length
    salida.push({ tabla: f.tabla, id: f.id, rev: f.rev, borrado: f.borrado, datos: f.borrado ? null : JSON.parse(f.json) })
  }
  return { ok: true, cursor: nuevoCursor, hayMas: nuevoCursor < rev, filas: salida, errores: errores, equipo: equipo.codigo }
}

// ---------------------------------------------------------------------------
// Hojas de consulta para la oficina
// ---------------------------------------------------------------------------

var ENC_DETALLE = ['Folio', 'Fecha', 'Hora', 'Estado', 'RPE', 'Nombre', 'Área', 'Material', 'Talla', 'Cantidad', 'Resguardo', 'Despachó', 'Equipo', 'entregaId']

/** Una fila por material entregado: cómoda para filtros y tablas dinámicas. */
function actualizarDetalle(cambios, ctx) {
  var h = hojaSimple('Detalle de entregas', ENC_DETALLE)
  var n = h.getLastRow()
  var ids = n > 1 ? h.getRange(2, ENC_DETALLE.length, n - 1, 1).getValues().map(function (f) { return String(f[0]) }) : []
  var nuevas = []
  cambios.forEach(function (c) {
    if (c.borrado) {
      ids.forEach(function (id, i) { if (id === String(c.id)) h.getRange(i + 2, 4).setValue('DESHECHA') })
      return
    }
    var e = c.datos
    var estado = e.estado === 'anulada' ? 'ANULADA' : 'OK'
    var existe = false
    ids.forEach(function (id, i) {
      if (id === e.id) {
        existe = true
        h.getRange(i + 2, 4).setValue(estado)
      }
    })
    if (existe) return
    ;(e.lineas || []).forEach(function (l) {
      nuevas.push([e.folio, e.fecha, e.hora, estado, e.rpe, e.nombre, e.area, nombreMat(ctx, l.materialId), l.varianteId, l.cantidad, l.esResguardo ? 'SI' : '', e.usuarioNombre, e.equipo, e.id])
    })
  })
  if (nuevas.length) h.getRange(n + 1, 1, nuevas.length, ENC_DETALLE.length).setValues(nuevas)
}

/** Existencias por material, talla y almacén, calculadas a partir de los movimientos. */
function recalcularExistencias() {
  var mov = leerTabla('movimientos')
  var ctx = contexto()
  var ubis = ctx.ubicaciones()
  var ubiIds = Object.keys(ubis).filter(function (id) { return ubis[id].activo !== false }).sort(function (a, b) { return (ubis[a].orden || 0) - (ubis[b].orden || 0) })
  var suma = {}
  mov.filas.forEach(function (f) {
    if (f[COL_BORRADO] === 'SI') return
    var base = BASE.length
    var mat = String(f[base + 3])
    var talla = String(f[base + 5])
    var ubi = String(f[base + 6])
    var cant = Number(f[base + 8]) || 0
    var k = mat + '|' + talla
    suma[k] = suma[k] || {}
    suma[k][ubi] = (suma[k][ubi] || 0) + cant
  })
  var mats = ctx.materiales()
  var filas = Object.keys(suma)
    .sort(function (a, b) {
      var ma = mats[a.split('|')[0]] || {}
      var mb = mats[b.split('|')[0]] || {}
      return (ma.orden || 999) - (mb.orden || 999) || (a < b ? -1 : 1)
    })
    .map(function (k) {
      var partes = k.split('|')
      var m = mats[partes[0]] || {}
      var porUbi = ubiIds.map(function (u) { return suma[k][u] || 0 })
      var total = porUbi.reduce(function (a, b) { return a + b }, 0)
      var minimo = (m.stockMin || {})[partes[1]] || 0
      return [m.nombre || partes[0], partes[1]].concat(porUbi).concat([total, minimo, total <= minimo ? 'REABASTECER' : ''])
    })
  var enc = ['Material', 'Talla'].concat(ubiIds.map(function (u) { return ubis[u].nombre })).concat(['Total', 'Mínimo', 'Alerta'])
  var h = hojaSimple('Existencias', null)
  h.clearContents()
  h.getRange(1, 1, 1, enc.length).setValues([enc]).setFontWeight('bold')
  h.setFrozenRows(1)
  if (filas.length) h.getRange(2, 1, filas.length, enc.length).setValues(filas)
  h.getRange(filas.length + 3, 1, 1, 2).setValues([['Actualizado', Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH:mm')]])
}

// ---------------------------------------------------------------------------
// Avisos por correo (préstamos vencidos, reabastecer, eventuales)
// ---------------------------------------------------------------------------

var FILA_CORREOS = 6

function correosAviso() {
  var dueno = Session.getEffectiveUser().getEmail()
  var h = libro().getSheetByName('Configuración')
  var extra = h ? String(h.getRange(FILA_CORREOS, 2).getValues()[0][0] || '') : ''
  var lista = [dueno].concat(extra.split(/[,;\s]+/)).filter(function (c) { return /@/.test(c) })
  return lista.filter(function (c, i) { return lista.indexOf(c) === i })
}

function datosTabla(tabla) {
  var t = leerTabla(tabla)
  var salida = []
  t.filas.forEach(function (f) {
    if (f[COL_BORRADO] === 'SI') return
    try {
      salida.push(JSON.parse(f[COL_JSON]))
    } catch (e) {}
  })
  return salida
}

/** Arma el resumen del día. Devuelve null si no hay nada que avisar. */
function resumenAvisos() {
  var hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd')
  var ctx = contexto()
  var ahoraLocal = Utilities.formatDate(new Date(), ZONA, "yyyy-MM-dd'T'HH:mm")
  // Préstamos anteriores: con fecha de regreso. Los nuevos: más horas fuera que el límite de Ajustes (24 por defecto; 0 = sin alerta)
  var horasLimite = 24
  datosTabla('ajustes').forEach(function (a) { if (a.id === 'horasAlertaEquipo' && typeof a.valor === 'number') horasLimite = a.valor })
  var prestamosEq = datosTabla('prestamosEquipo').filter(function (p) {
    if (p.estatus !== 'ACTIVO') return false
    if (p.vence) return p.vence < ahoraLocal
    return horasLimite > 0 && (Date.now() - new Date(p.ts).getTime()) / 36e5 > horasLimite
  })
  var en30 = Utilities.formatDate(new Date(Date.now() + 30 * 864e5), ZONA, 'yyyy-MM-dd')
  var calibrar = datosTabla('equipos').filter(function (e) { return e.activo !== false && e.estado !== 'baja' && e.calibracion && e.calibracion <= en30 })
  var resguardos = datosTabla('resguardos').filter(function (r) { return r.estatus === 'ACTIVO' })
  var vencidos = resguardos
    .filter(function (r) { return r.tipo === 'prestamo' && r.vence && r.vence < hoy })
    .sort(function (a, b) { return a.vence < b.vence ? -1 : 1 })
  var venceHoy = resguardos.filter(function (r) { return r.tipo === 'prestamo' && r.vence === hoy })

  var personal = {}
  datosTabla('personal').forEach(function (p) { personal[p.rpe] = p })
  var conEquipo = {}
  resguardos.forEach(function (r) { (conEquipo[r.rpe] = conEquipo[r.rpe] || []).push(r) })
  var eventuales = Object.keys(conEquipo)
    .map(function (rpe) { return personal[rpe] })
    .filter(function (p) { return p && p.tipo === 'eventual' && p.vigencia && p.vigencia < hoy })

  var mats = ctx.materiales()
  var suma = {}
  datosTabla('movimientos').forEach(function (m) {
    var k = m.materialId + '|' + m.varianteId
    suma[k] = (suma[k] || 0) + (Number(m.cantidad) || 0)
  })
  var reabastecer = Object.keys(suma)
    .map(function (k) {
      var p = k.split('|')
      var m = mats[p[0]] || {}
      return { nombre: (m.nombre || p[0]) + (p[1] ? ' ' + p[1] : ''), total: suma[k], minimo: (m.stockMin || {})[p[1]] || 0, activo: m.activo !== false }
    })
    .filter(function (x) { return x.activo && x.total <= x.minimo })

  if (!vencidos.length && !venceHoy.length && !eventuales.length && !reabastecer.length && !prestamosEq.length && !calibrar.length) return null

  function fila(celdas) { return '<tr>' + celdas.map(function (c) { return '<td style="padding:4px 8px;border-bottom:1px solid #ddd">' + c + '</td>' }).join('') + '</tr>' }
  function tablaHtml(titulo, enc, filas) {
    if (!filas.length) return ''
    return '<h3 style="font-family:Arial;margin:18px 0 6px">' + titulo + '</h3><table style="border-collapse:collapse;font-family:Arial;font-size:13px">' +
      '<tr>' + enc.map(function (e) { return '<th style="text-align:left;padding:4px 8px;background:#DCEFE3">' + e + '</th>' }).join('') + '</tr>' + filas.join('') + '</table>'
  }
  function sup(r) { return r.supervisor ? r.supervisor.nombre + ' (RPE ' + r.supervisor.rpe + ', ext. ' + r.supervisor.extension + ')' : 'sin datos' }

  var html = '<p style="font-family:Arial">Resumen de Control EPP al ' + hoy + '.</p>' +
    tablaHtml('Préstamos vencidos (' + vencidos.length + ')', ['Equipo', 'Trabajador', 'Prestado', 'Debía volver', 'Supervisor'],
      vencidos.map(function (r) { return fila([nombreMat(ctx, r.materialId), r.nombre + ' · ' + r.rpe, r.fechaEntrega, '<b>' + r.vence + '</b>', sup(r)]) })) +
    tablaHtml('Equipos de medición sin devolver (' + prestamosEq.length + ')', ['Equipo', 'Lo tiene', 'Actividad', 'Fuera desde', 'Entregó'],
      prestamosEq.map(function (p) { return fila([p.equipoCodigo + ' · ' + p.equipoNombre, p.nombre + ' · ' + p.rpe + ' (' + p.area + ')', p.uso || '', '<b>' + fechaTs(p.ts, 'yyyy-MM-dd HH:mm') + '</b>', (p.entregoSI && (p.entregoSI.corto || p.entregoSI.nombre)) || p.usuarioNombre]) })) +
    tablaHtml('Calibraciones vencidas o próximas (' + calibrar.length + ')', ['Equipo', 'Serie', 'Calibración'],
      calibrar.map(function (e) { return fila([e.codigo + ' · ' + e.nombre, e.serie || '', (e.calibracion < hoy ? '<b>VENCIDA</b> ' : '') + e.calibracion]) })) +
    tablaHtml('Préstamos que vencen hoy (' + venceHoy.length + ')', ['Equipo', 'Trabajador', 'Supervisor'],
      venceHoy.map(function (r) { return fila([nombreMat(ctx, r.materialId), r.nombre + ' · ' + r.rpe, sup(r)]) })) +
    tablaHtml('Eventuales con contrato vencido y equipo pendiente (' + eventuales.length + ')', ['Trabajador', 'Vigencia', 'Equipo'],
      eventuales.map(function (p) { return fila([p.nombre + ' · ' + p.rpe, p.vigencia, conEquipo[p.rpe].map(function (r) { return nombreMat(ctx, r.materialId) }).join(', ')]) })) +
    tablaHtml('Materiales por reabastecer (' + reabastecer.length + ')', ['Material', 'Existencia', 'Mínimo'],
      reabastecer.map(function (x) { return fila([x.nombre, x.total, x.minimo]) }))

  var partes = []
  if (prestamosEq.length) partes.push(prestamosEq.length + ' equipo' + (prestamosEq.length > 1 ? 's' : '') + ' sin devolver')
  if (calibrar.length) partes.push(calibrar.length + ' por calibrar')
  if (vencidos.length) partes.push(vencidos.length + ' préstamo' + (vencidos.length > 1 ? 's' : '') + ' vencido' + (vencidos.length > 1 ? 's' : ''))
  if (reabastecer.length) partes.push(reabastecer.length + ' por reabastecer')
  if (eventuales.length) partes.push(eventuales.length + ' eventual' + (eventuales.length > 1 ? 'es' : '') + ' con equipo')
  if (!partes.length) partes.push(venceHoy.length + ' préstamo' + (venceHoy.length > 1 ? 's' : '') + ' vence hoy')
  return { asunto: 'Control EPP · ' + partes.join(' · '), html: html }
}

/** Envía el resumen por correo (lo ejecuta el disparador diario o el menú). */
function enviarAvisos() {
  var r = resumenAvisos()
  if (!r) return 'Sin avisos pendientes.'
  var destinos = correosAviso()
  MailApp.sendEmail({ to: destinos.join(','), subject: r.asunto, htmlBody: r.html })
  return 'Aviso enviado a ' + destinos.join(', ')
}

/** Programa el envío diario a las 7:00. Ejecutar una vez desde el editor. */
function activarAvisosDiarios() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarAvisos') ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('enviarAvisos').timeBased().everyDays(1).atHour(7).inTimezone(ZONA).create()
  return 'Avisos diarios activados (7:00) para: ' + correosAviso().join(', ')
}

// ---------------------------------------------------------------------------
// Puente con el servidor de la oficina (PC host)
//
// La red de la oficina no deja pasar script.google.com pero sí docs.google.com. Entonces:
//  - la PC host manda sus cambios como respuestas de un FORMULARIO de Google (firmadas con la
//    clave de la oficina; las que no traen la firma correcta se descartan);
//  - Google deja lo nuevo de los celulares en una HOJA APARTE compartida como «Lector con el
//    enlace», que solo contiene datos CIFRADOS con la clave de la oficina.
// Cifrado: flujo SHA-256 en modo contador + HMAC-SHA256 (Apps Script no trae AES); el servidor de
// la PC hace lo mismo con .NET. Las llaves salen de la clave de la oficina y nunca viajan.
// ---------------------------------------------------------------------------

var PUENTE_PARTE = 40000 // caracteres por celda (Sheets admite 50 000)
var PUENTE_LOTE = 1500000 // caracteres de JSON por lote
var PUENTE_DIAS = 14 // la hoja cifrada conserva dos semanas
var SHA = Utilities.DigestAlgorithm.SHA_256

function bytesDe(texto) {
  return Utilities.newBlob(String(texto)).getBytes()
}

function llavesPuente() {
  var clave = String(PropertiesService.getScriptProperties().getProperty('CLAVE') || '').trim().toUpperCase()
  if (!clave) throw new Error('Ejecute «configurar» primero.')
  return { cifra: Utilities.computeDigest(SHA, bytesDe('epp-puente-cifra|' + clave)), mac: Utilities.computeDigest(SHA, bytesDe('epp-puente-mac|' + clave)) }
}

/** Huella de la clave (no la revela): la PC la compara para avisar si tiene otra clave guardada. */
function verificadorPuente(ll) {
  return hex(Utilities.computeHmacSha256Signature(bytesDe('epp-puente-verifica'), ll.mac))
}

function hex(bytes) {
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2) }).join('')
}

/** Flujo de cifra: bloque i = SHA-256(llave ‖ nonce ‖ i). Cifrar y descifrar es la misma operación. */
function flujoPuente(bytes, llave, nonce) {
  var salida = new Array(bytes.length)
  var bloque = null
  for (var i = 0; i < bytes.length; i++) {
    if (i % 32 === 0) {
      var n = i / 32
      bloque = Utilities.computeDigest(SHA, llave.concat(nonce, [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].map(function (x) { return x > 127 ? x - 256 : x })))
    }
    salida[i] = bytes[i] ^ bloque[i % 32]
  }
  return salida
}

/** JSON → gzip → cifrado → base64 (nonce ‖ cifrado ‖ firma). */
function cifrarPuente(obj, ll) {
  var gz = Utilities.gzip(Utilities.newBlob(JSON.stringify(obj), 'application/json')).getBytes()
  var nonce = Utilities.computeDigest(SHA, bytesDe(Utilities.getUuid() + Date.now())).slice(0, 16)
  var cuerpo = nonce.concat(flujoPuente(gz, ll.cifra, nonce))
  return Utilities.base64Encode(cuerpo.concat(Utilities.computeHmacSha256Signature(cuerpo, ll.mac)))
}

function hojaPuente() {
  var id = PropertiesService.getScriptProperties().getProperty('PUENTE_HOJA')
  if (!id) throw new Error('El puente no está instalado. Ejecute «instalarPuente».')
  return SpreadsheetApp.openById(id)
}

/** Ejecutar una vez desde el editor (o el menú Control EPP). Se puede repetir: reutiliza lo que ya existe. */
function instalarPuente() {
  configurar()
  var props = PropertiesService.getScriptProperties()
  // 1) Formulario por el que la PC manda sus cambios
  var form = null
  if (props.getProperty('PUENTE_FORM')) {
    try { form = FormApp.openById(props.getProperty('PUENTE_FORM')) } catch (e) { form = null }
  }
  if (!form) {
    form = FormApp.create('Control EPP · puente con la PC (no editar)')
    form.setDescription('Uso interno del servidor de Control EPP. No lo edite ni lo comparta.')
    form.addParagraphTextItem().setTitle('datos')
    props.setProperty('PUENTE_FORM', form.getId())
  }
  form.setCollectEmail(false)
  form.setLimitOneResponsePerUser(false)
  form.setAcceptingResponses(true)
  try { form.setRequireLogin(false) } catch (e) {} // solo existe en cuentas de Workspace
  try { if (form.setPublished) form.setPublished(true) } catch (e) {} // formularios nuevos nacen sin publicar
  var item = form.getItems()[0].asParagraphTextItem()
  var prellenado = form.createResponse().withItemResponse(item.createResponse('x')).toPrefilledUrl()
  var campo = (prellenado.match(/(entry\.\d+)=/) || [])[1]
  if (!campo) throw new Error('No se pudo leer el campo del formulario: ' + prellenado)
  var accion = prellenado.split('/viewform')[0] + '/formResponse'

  // 2) Hoja aparte con los datos cifrados para la PC
  var ss = null
  if (props.getProperty('PUENTE_HOJA')) {
    try { ss = SpreadsheetApp.openById(props.getProperty('PUENTE_HOJA')) } catch (e) { ss = null }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('Control EPP · puente (solo datos cifrados)')
    props.setProperty('PUENTE_HOJA', ss.getId())
    props.setProperty('PUENTE_REV', '0')
    props.setProperty('PUENTE_N', '0')
  }
  var salida = ss.getSheetByName('Salida') || ss.insertSheet('Salida')
  if (salida.getLastRow() === 0) salida.getRange(1, 1, 1, 6).setValues([['lote', 'parte', 'partes', 'rev', 'datos', 'fecha']]).setFontWeight('bold')
  salida.getRange('E:F').setNumberFormat('@')
  var conf = ss.getSheetByName('Config') || ss.insertSheet('Config')
  conf.clearContents()
  conf.getRange(1, 1, 5, 2).setValues([['clave', 'valor'], ['formulario', accion], ['campo', campo], ['version', VERSION_SERVIDOR], ['verificador', verificadorPuente(llavesPuente())]])
  var acuses = ss.getSheetByName('Recibidos') || ss.insertSheet('Recibidos')
  if (acuses.getLastRow() === 0) acuses.getRange(1, 1, 1, 3).setValues([['lote', 'estado', 'fecha']]).setFontWeight('bold')
  var sobra = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1') || ss.getSheetByName('Hoja1')
  if (sobra && ss.getSheets().length > 2) ss.deleteSheet(sobra)
  // Solo contiene datos cifrados: se comparte para que la PC la lea sin iniciar sesión
  DriveApp.getFileById(ss.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)

  // 3) Disparadores: intercambio cada 5 minutos y respaldo diario a las 2:00
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['puenteCiclo', 'respaldoDiario'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('puenteCiclo').timeBased().everyMinutes(5).create()
  ScriptApp.newTrigger('respaldoDiario').timeBased().everyDays(1).atHour(2).inTimezone(ZONA).create()
  configurar()
  var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/edit'
  Logger.log('Puente listo. En la PC host pegue este enlace y la clave de la oficina: ' + url)
  return url
}

function leerEco() {
  var h = hojaSimple('Puente eco', ['tabla|id', 'rev'])
  h.hideSheet()
  var n = h.getLastRow()
  var eco = {}
  if (n > 1) h.getRange(2, 1, n - 1, 2).getValues().forEach(function (f) { eco[String(f[0])] = Number(f[1]) })
  return eco
}

/** Guarda solo lo que aún no se exporta (rev mayor que el último exportado). */
function guardarEco(eco, hasta) {
  var h = hojaSimple('Puente eco', ['tabla|id', 'rev'])
  var filas = Object.keys(eco).filter(function (k) { return eco[k] > hasta }).map(function (k) { return [k, eco[k]] })
  if (h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, 2).clearContent()
  if (filas.length) h.getRange(2, 1, filas.length, 2).setValues(filas)
}

/** Lo que mandó la PC por el formulario: se juntan las partes de cada lote, se revisa la firma y se aplica. */
function puenteImportar(ll, eco) {
  var props = PropertiesService.getScriptProperties()
  var form = FormApp.openById(props.getProperty('PUENTE_FORM'))
  var lotes = {}
  var resumen = { aplicados: 0, filas: 0, descartados: 0, errores: [], acuses: {} }
  form.getResponses().forEach(function (r) {
    var txt = String((r.getItemResponses()[0] || { getResponse: function () { return '' } }).getResponse() || '')
    var p = txt.split('|')
    // EPP1|lote|parte|partes|firma|datos
    if (p.length < 6 || p[0] !== 'EPP1') {
      form.deleteResponse(r.getId())
      resumen.descartados++
      return
    }
    var lote = p[1]
    var parte = Number(p[2])
    var partes = Number(p[3])
    var datos = p.slice(5).join('|')
    var firma = hex(Utilities.computeHmacSha256Signature(bytesDe(lote + '|' + parte + '|' + partes + '|' + datos), ll.mac))
    if (firma !== p[4]) {
      // Firma que no cuadra: otra clave o la respuesta llegó recortada. La PC lo ve en «Recibidos»
      form.deleteResponse(r.getId())
      resumen.descartados++
      resumen.acuses[lote] = 'firma'
      return
    }
    var l = (lotes[lote] = lotes[lote] || { partes: partes, trozos: {}, ids: [], fecha: r.getTimestamp() })
    l.trozos[parte] = datos
    l.ids.push(r.getId())
  })
  var limite = Date.now() - 2 * 864e5
  Object.keys(lotes)
    .sort()
    .forEach(function (k) {
      var l = lotes[k]
      var completos = 0
      for (var i = 1; i <= l.partes; i++) if (l.trozos[i] !== undefined) completos++
      if (completos < l.partes) {
        // Incompleto: se espera a que lleguen las demás partes (se descarta tras 2 días)
        if (l.fecha.getTime() < limite) {
          l.ids.forEach(function (id) { form.deleteResponse(id) })
          resumen.acuses[k] = 'incompleto'
        }
        return
      }
      var texto = ''
      for (var j = 1; j <= l.partes; j++) texto += l.trozos[j]
      var obj = JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(texto), 'application/x-gzip')).getDataAsString('UTF-8'))
      if (obj.tipo === 'reenviar') {
        // La PC perdió lotes (estuvo apagada más de dos semanas o es nueva): se le manda todo otra vez
        props.setProperty('PUENTE_REV', String(Number(obj.desde) || 0))
        Object.keys(eco).forEach(function (x) { delete eco[x] })
      } else {
        var r = aplicarCambios(obj.filas || [], eco)
        resumen.filas += (obj.filas || []).length
        resumen.errores = resumen.errores.concat(r.errores)
      }
      resumen.aplicados++
      if (resumen.acuses[k] !== 'firma') resumen.acuses[k] = 'ok'
      l.ids.forEach(function (id) { form.deleteResponse(id) })
    })
  return resumen
}

/** Escribe en la hoja cifrada lo nuevo de los celulares (lo que no vino de la misma PC). */
function puenteExportar(ll, eco) {
  var props = PropertiesService.getScriptProperties()
  var rev = Number(props.getProperty('REV') || '0')
  var desde = Number(props.getProperty('PUENTE_REV') || '0')
  if (desde >= rev) return 0
  var filas = []
  Object.keys(TABLAS).forEach(function (tabla) {
    leerTabla(tabla).filas.forEach(function (f) {
      var r = Number(f[COL_REV])
      if (r <= desde || eco[tabla + '|' + f[COL_ID]] === r) return
      filas.push({ tabla: tabla, id: String(f[COL_ID]), rev: r, borrado: f[COL_BORRADO] === 'SI', json: f[COL_JSON] })
    })
  })
  filas.sort(function (a, b) { return a.rev - b.rev })
  var salida = hojaPuente().getSheetByName('Salida')
  var n = Number(props.getProperty('PUENTE_N') || '0')
  var escritos = 0
  var i = 0
  while (i < filas.length && escritos < 6) {
    var lote = []
    var car = 0
    while (i < filas.length && (!lote.length || car < PUENTE_LOTE)) {
      var f = filas[i++]
      car += f.json.length
      lote.push({ tabla: f.tabla, id: f.id, borrado: f.borrado, datos: f.borrado ? null : JSON.parse(f.json) })
    }
    var hasta = i < filas.length ? filas[i - 1].rev : rev
    var texto = cifrarPuente({ filas: lote }, ll)
    var partes = Math.ceil(texto.length / PUENTE_PARTE)
    n++
    var fecha = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH:mm:ss')
    var celdas = []
    // «x» al inicio: un texto que empieza con = o + se tomaría como fórmula
    for (var k = 0; k < partes; k++) celdas.push([n, k + 1, partes, hasta, 'x' + texto.substr(k * PUENTE_PARTE, PUENTE_PARTE), fecha])
    salida.getRange(salida.getLastRow() + 1, 1, celdas.length, 6).setValues(celdas)
    props.setProperty('PUENTE_N', String(n))
    props.setProperty('PUENTE_REV', String(hasta))
    escritos++
  }
  if (!filas.length) props.setProperty('PUENTE_REV', String(rev))
  return escritos
}

/** Acuse de recibo por lote (ok · firma · incompleto) para que la PC reenvíe lo que no llegó bien. */
function puenteAcuses(acuses, ll) {
  var ss = hojaPuente()
  var h = ss.getSheetByName('Recibidos') || ss.insertSheet('Recibidos')
  if (h.getLastRow() === 0) h.getRange(1, 1, 1, 3).setValues([['lote', 'estado', 'fecha']])
  var fecha = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH:mm:ss')
  var filas = Object.keys(acuses).map(function (k) { return [k, acuses[k], fecha] })
  if (filas.length) h.getRange(h.getLastRow() + 1, 1, filas.length, 3).setValues(filas)
  if (h.getLastRow() > 501) h.deleteRows(2, h.getLastRow() - 501)
  // La huella de la clave se renueva por si la clave cambió («nuevaClave»)
  var conf = ss.getSheetByName('Config')
  if (conf) conf.getRange(5, 1, 1, 2).setValues([['verificador', verificadorPuente(ll)]])
}

/** Borra de la hoja cifrada lo de más de dos semanas (siempre deja el último lote). */
function puenteLimpiar() {
  var salida = hojaPuente().getSheetByName('Salida')
  var n = salida.getLastRow()
  if (n < 3) return
  var limite = Utilities.formatDate(new Date(Date.now() - PUENTE_DIAS * 864e5), ZONA, 'yyyy-MM-dd')
  var fechas = salida.getRange(2, 6, n - 1, 1).getValues()
  var viejas = 0
  while (viejas < fechas.length - 1 && String(fechas[viejas][0]).slice(0, 10) < limite) viejas++
  if (viejas) salida.deleteRows(2, viejas)
}

/** Lo ejecuta el disparador cada 5 minutos (también desde el menú). */
function puenteCiclo() {
  var ll = llavesPuente()
  var resumen = conCandado(function () {
    var eco = leerEco()
    var r = puenteImportar(ll, eco)
    r.lotesEnviados = puenteExportar(ll, eco)
    guardarEco(eco, Number(PropertiesService.getScriptProperties().getProperty('PUENTE_REV') || '0'))
    return r
  })
  puenteAcuses(resumen.acuses, ll)
  delete resumen.acuses
  puenteLimpiar()
  PropertiesService.getScriptProperties().setProperty('PUENTE_ULTIMO', Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH:mm:ss') + ' · ' + JSON.stringify(resumen))
  return resumen
}

// ---------------------------------------------------------------------------
// Respaldo diario de esta hoja en Google Drive (carpeta «Control EPP · respaldos», últimos 30)
// ---------------------------------------------------------------------------

function respaldoDiario() {
  var nombre = 'Control EPP · respaldos'
  var carpetas = DriveApp.getFoldersByName(nombre)
  var carpeta = carpetas.hasNext() ? carpetas.next() : DriveApp.createFolder(nombre)
  var fecha = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH.mm')
  DriveApp.getFileById(libro().getId()).makeCopy('Control EPP · respaldo ' + fecha, carpeta)
  var archivos = []
  var it = carpeta.getFiles()
  while (it.hasNext()) archivos.push(it.next())
  archivos
    .sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime() })
    .slice(30)
    .forEach(function (f) { f.setTrashed(true) })
  return 'Respaldo guardado en «' + nombre + '» (' + fecha + ').'
}
