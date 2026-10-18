import { useMemo, useRef, useState } from 'preact/hooks'
import type { Equipo, PrestamoEquipo } from '../domain/types'
import { entregarArchivo, fechaLocal, hace, normalizar, plural } from '../lib/util'
import { ahoraLocal, CONDICIONES, diasCalibracion, disponibilidad, ESTADOS, guardarEquipo, horasAlerta, prestamoVencido, TEXTO_DISPONIBILIDAD, type Disponibilidad } from '../state/equipos'
import { equipoPorLectura, textoQr } from '../domain/equipoQr'
import { dibujarEtiqueta, ETIQUETA_MM, etiquetaPng, imprimirEtiquetas } from '../lib/etiqueta'
import { comprimirFoto } from '../lib/imagen'
import { esAdmin, puedeInventario } from '../state/permisos'
import * as S from '../state/store'
import { CamaraEnVivo } from './Camara'
import { FotosGuardadas } from './Evidencia'
import { confirmarEliminarPrestamo, ModalAnular, ModalDevolver, ModalEditarPrestamo, ModalPrestar, fmtTs, FotoEquipo, nombreSI, TileEnUso } from './EquiposPrestamo'
import { avisar, intentar, Modal, Vacio } from './comunes'
import { Icono } from './iconos'

const COLOR_DISP: Record<Disponibilidad, string> = { disponible: 'ok', prestado: 'prest', revision: 'warn', calibracion: 'bad', baja: '' }

// ---------- Catálogo de equipos ----------

function EditorEquipo({ inicial, onCerrar }: { inicial: Equipo | null; onCerrar: () => void }) {
  const [codigo, setCodigo] = useState(inicial?.codigo ?? '')
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [marca, setMarca] = useState(inicial?.marca ?? '')
  const [modelo, setModelo] = useState(inicial?.modelo ?? '')
  const [serie, setSerie] = useState(inicial?.serie ?? '')
  const [accesorios, setAccesorios] = useState((inicial?.accesorios ?? []).join('\n'))
  const [llevaBitacora, setLlevaBitacora] = useState(inicial?.llevaBitacora ?? true)
  const [calibracion, setCalibracion] = useState(inicial?.calibracion ?? '')
  const [estado, setEstado] = useState<Equipo['estado']>(inicial?.estado ?? 'operativo')
  const [notas, setNotas] = useState(inicial?.notas ?? '')
  const [foto, setFoto] = useState<string | null | undefined>(undefined) // undefined = sin cambios, null = quitar
  const fotoActual = foto === undefined ? (inicial?.fotoId ? S.fotos.value.get(inicial.fotoId) : undefined) : foto ?? undefined
  const elegirFoto = async (e: Event) => {
    const archivo = (e.target as HTMLInputElement).files?.[0]
    ;(e.target as HTMLInputElement).value = ''
    if (!archivo) return
    const data = await intentar(() => comprimirFoto(archivo))
    if (data) setFoto(data)
  }
  const tipos = useMemo(() => [...new Set(S.equipos.value.map((e) => e.nombre).concat(['Explosímetro', 'Detector multigas', 'Higrómetro', 'Termohigrómetro', 'Sonómetro', 'Luxómetro']))].sort(), [])

  const guardar = async () => {
    const ok = await intentar(async () => {
      await guardarEquipo({
        id: inicial?.id,
        codigo,
        nombre,
        marca,
        modelo,
        serie,
        accesorios: accesorios.split(/\n|,/),
        llevaBitacora,
        calibracion,
        estado,
        notas,
        fotoId: inicial?.fotoId,
        activo: estado !== 'baja',
      }, foto)
      return true
    })
    if (ok) {
      avisar(inicial ? '✓ Equipo actualizado' : `✓ ${codigo.toUpperCase()} agregado`)
      onCerrar()
    }
  }

  return (
    <Modal
      titulo={inicial ? `Equipo ${inicial.codigo}` : 'Nuevo equipo'}
      onCerrar={onCerrar}
      acciones={
        <>
          <button class="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button class="btn primary" onClick={guardar}>
            Guardar
          </button>
        </>
      }
    >
      <div class="row" style={{ alignItems: 'center', gap: '12px' }}>
        <span class="foto" style={{ width: '120px', flex: 'none' }}>{fotoActual ? <img src={fotoActual} alt="" /> : <Icono n="equipo" />}</span>
        <div class="stack" style={{ gap: '6px' }}>
          <label class="btn sm soft" style={{ cursor: 'pointer' }}>
            <Icono n="camara" /> Tomar foto
            <input type="file" accept="image/*" capture="environment" hidden onChange={elegirFoto} />
          </label>
          <label class="btn sm soft" style={{ cursor: 'pointer' }}>
            <Icono n="galeria" /> Galería o archivo
            <input type="file" accept="image/*" hidden onChange={elegirFoto} />
          </label>
          {fotoActual && (
            <button class="btn sm ghost" onClick={() => setFoto(null)}>
              Quitar foto
            </button>
          )}
        </div>
      </div>
      <div class="row" style={{ alignItems: 'start' }}>
        <label class="campo" style={{ width: '140px' }}>
          Código
          <input class="input mono" id="eqc-codigo" placeholder="EXP-01" value={codigo} onInput={(e) => setCodigo((e.target as HTMLInputElement).value.toUpperCase())} />
        </label>
        <label class="campo grow">
          Equipo
          <input class="input" id="eqc-nombre" list="eq-tipos" placeholder="Explosímetro, higrómetro…" value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} />
          <datalist id="eq-tipos">
            {tipos.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
      </div>
      <div class="row" style={{ alignItems: 'start' }}>
        <label class="campo grow">
          Marca
          <input class="input" id="eqc-marca" value={marca} onInput={(e) => setMarca((e.target as HTMLInputElement).value)} />
        </label>
        <label class="campo grow">
          Modelo
          <input class="input" id="eqc-modelo" value={modelo} onInput={(e) => setModelo((e.target as HTMLInputElement).value)} />
        </label>
        <label class="campo grow">
          No. de serie
          <input class="input mono" id="eqc-serie" value={serie} onInput={(e) => setSerie((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <label class="campo">
        Accesorios que salen con el equipo (uno por renglón)
        <textarea class="input" id="eqc-acc" rows={3} placeholder={'Cargador\nEstuche\nManguera de muestreo'} value={accesorios} onInput={(e) => setAccesorios((e.target as HTMLTextAreaElement).value)} />
      </label>
      <label class="check">
        <input type="checkbox" checked={llevaBitacora} onChange={(e) => setLlevaBitacora((e.target as HTMLInputElement).checked)} />
        El equipo tiene bitácora propia que sale con él
      </label>
      <div class="row" style={{ alignItems: 'start' }}>
        <label class="campo grow">
          Próxima calibración (vacío si no aplica)
          <input class="input" id="eqc-cal" type="date" value={calibracion} onInput={(e) => setCalibracion((e.target as HTMLInputElement).value)} />
        </label>
        <label class="campo grow">
          Estado
          <select class="input" id="eqc-estado" value={estado} onChange={(e) => setEstado((e.target as HTMLSelectElement).value as Equipo['estado'])}>
            {(Object.keys(ESTADOS) as Equipo['estado'][]).map((x) => (
              <option key={x} value={x}>
                {ESTADOS[x]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label class="campo">
        Notas
        <input class="input" id="eqc-notas" value={notas} onInput={(e) => setNotas((e.target as HTMLInputElement).value)} />
      </label>
    </Modal>
  )
}

function Calibracion({ e }: { e: Equipo }) {
  const d = diasCalibracion(e)
  if (d === null) return null
  const clase = d < 0 ? 'bad' : d <= 30 ? 'warn' : ''
  return <span class={`badge ${clase}`}>{d < 0 ? `Calibración vencida (${e.calibracion})` : `Calibración ${e.calibracion}`}</span>
}

/** Etiqueta con QR de un equipo: vista previa, descarga e impresión. */
function ModalEtiqueta({ e, onCerrar }: { e: Equipo; onCerrar: () => void }) {
  const src = useMemo(() => dibujarEtiqueta(e).toDataURL('image/png'), [e])
  return (
    <Modal
      titulo={`Etiqueta de ${e.codigo}`}
      onCerrar={onCerrar}
      acciones={
        <>
          <button class="btn" onClick={() => intentar(async () => entregarArchivo(`Etiqueta ${e.codigo}.png`, await etiquetaPng(e)))}>
            <Icono n="descarga" /> Descargar
          </button>
          <button class="btn primary" onClick={() => imprimirEtiquetas([e])}>
            <Icono n="pdf" /> Imprimir
          </button>
        </>
      }
    >
      <img class="etiqueta-vista" src={src} alt={`Etiqueta con código QR del equipo ${e.codigo}`} />
      <p class="muted small">
        Se imprime a {ETIQUETA_MM.ancho} × {ETIQUETA_MM.alto} mm. Péguela en el equipo (de preferencia con mica o cinta transparente encima). Al prestar, escanee el QR con el lector o con la
        cámara y el equipo se elige solo. Cualquier celular que lea el QR ve: <span class="mono">{textoQr(e)}</span>
      </p>
    </Modal>
  )
}

/** Catálogo de equipos a resguardo: alta, edición, foto y etiqueta con QR. */
export function CatalogoEquipos({ onPrestar }: { onPrestar?: (e: Equipo) => void }) {
  const [etiqueta, setEtiqueta] = useState<Equipo | null>(null)
  const [editar, setEditar] = useState<Equipo | null | 'nuevo'>(null)
  const [texto, setTexto] = useState('')
  const [bajas, setBajas] = useState(false)
  const activos = S.prestamosEquipoActivos.value
  const q = normalizar(texto)
  const lista = S.equipos.value.filter((e) => (bajas || e.estado !== 'baja') && (!q || normalizar(`${e.codigo} ${e.nombre} ${e.marca} ${e.modelo} ${e.serie}`).includes(q)))
  const edita = puedeInventario()
  return (
    <div class="stack">
      <div class="row">
        {edita && (
          <button class="btn primary" onClick={() => setEditar('nuevo')}>
            <Icono n="mas1" /> Nuevo equipo
          </button>
        )}
        <input class="input grow" id="eq-filtro" type="search" placeholder="Buscar equipo…" value={texto} onInput={(e) => setTexto((e.target as HTMLInputElement).value)} />
        <label class="check">
          <input type="checkbox" checked={bajas} onChange={(e) => setBajas((e.target as HTMLInputElement).checked)} />
          Ver bajas
        </label>
        {lista.length > 0 && (
          <button class="btn" onClick={() => imprimirEtiquetas(lista)} title="Imprime en hoja carta las etiquetas de los equipos que se muestran">
            <Icono n="pdf" /> Imprimir etiquetas ({lista.length})
          </button>
        )}
      </div>
      {!S.equipos.value.length && (
        <Vacio>
          Aún no hay equipos. {edita ? 'Agregue los explosímetros, higrómetros y demás equipos que presta la oficina con «Nuevo equipo».' : 'Un encargado de almacén o un administrador puede agregarlos.'}
        </Vacio>
      )}
      <div class="equipos-lista">
        {lista.map((e) => {
          const disp = disponibilidad(e, activos)
          const p = activos.find((x) => x.equipoId === e.id)
          const historial = S.prestamosEquipo.value.filter((x) => x.equipoId === e.id && x.estatus !== 'ANULADO')
          return (
            <div key={e.id} class="card stack" style={{ gap: '6px' }}>
              {e.fotoId && S.fotos.value.get(e.fotoId) && (
                <span class="foto">
                  <img src={S.fotos.value.get(e.fotoId)} alt="" loading="lazy" />
                </span>
              )}
              <div class="spread">
                <strong class="mono">{e.codigo}</strong>
                <span class={`badge ${COLOR_DISP[disp]}`}>{TEXTO_DISPONIBILIDAD[disp]}</span>
              </div>
              <strong>{e.nombre}</strong>
              <span class="muted small">{[e.marca, e.modelo, e.serie && `Serie ${e.serie}`].filter(Boolean).join(' · ') || 'Sin marca ni serie'}</span>
              <Calibracion e={e} />
              {p && (
                <span class="small">
                  Lo tiene <strong>{p.nombre}</strong> desde {hace(p.ts)}
                </span>
              )}
              {e.accesorios.length > 0 && <span class="muted small">Accesorios: {e.accesorios.join(', ')}</span>}
              <span class="muted small">{plural(historial.length, 'préstamo registrado', 'préstamos registrados')}</span>
              <div class="row" style={{ gap: '6px' }}>
                {disp === 'disponible' && onPrestar && (
                  <button class="btn sm primary" onClick={() => onPrestar(e)}>
                    Prestar
                  </button>
                )}
                <button class="btn sm" onClick={() => setEtiqueta(e)}>
                  <Icono n="qr" /> Etiqueta QR
                </button>
                {edita && (
                  <button class="btn sm" onClick={() => setEditar(e)}>
                    <Icono n="editar" /> Editar
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {editar && <EditorEquipo inicial={editar === 'nuevo' ? null : editar} onCerrar={() => setEditar(null)} />}
      {etiqueta && <ModalEtiqueta e={etiqueta} onCerrar={() => setEtiqueta(null)} />}
    </div>
  )
}

// ---------- Bitácora ----------

async function exportarBitacora(lista: PrestamoEquipo[]) {
  const { default: escribir } = await import('write-excel-file/universal')
  const ENC = { fontWeight: 'bold' as const, color: '#FFFFFF', backgroundColor: '#235B4E' }
  const enc = [
    'Folio', 'Código', 'Equipo', 'Salida', 'Recibió RPE', 'Recibió', 'Área', 'Actividad', 'Entregó (SI)', 'Lleva libreta', 'Observaciones al entregar', 'Estatus',
    'Cierre', 'Fecha y hora del cierre', 'Devolvió o transfirió', 'Recibió (SI)', 'Condición', 'Faltantes', 'Observaciones al recibir', 'Fotos',
  ].map((value) => ({ value, ...ENC }))
  const filas = lista.map((p) => {
    const r = p.regreso
    const faltan = r ? p.accesorios.filter((a) => !r.accesorios.includes(a)).concat(p.bitacora && !r.bitacora ? ['Libreta'] : []) : []
    const fotos = (p.fotos?.length ?? 0) + (r?.fotos?.length ?? 0)
    return [
      p.folio, p.equipoCodigo, p.equipoNombre, fmtTs(p.ts), p.rpe, p.nombre, p.area, p.uso, nombreSI(p.entregoSI, p.usuarioNombre), p.bitacora ? 'SI' : 'NO', p.observaciones,
      p.estatus, r ? (r.tipo === 'transferencia' ? 'Transferencia' : 'Devolución') : '', r ? fmtTs(r.ts) : '', r ? `${r.devolvioNombre} (${r.devolvioRpe})` : '',
      r ? nombreSI(r.recibioSI, r.usuarioNombre) : '', r ? CONDICIONES[r.condicion] : '', faltan.join(', '), r?.comentarios ?? '', fotos ? `${fotos} en la app` : '',
    ].map((value) => ({ value: value ?? '' }))
  })
  const blob = (await escribir([enc, ...filas], {
    sheet: 'Bitácora de equipos',
    stickyRowsCount: 1,
    columns: [14, 11, 26, 16, 10, 28, 22, 28, 14, 10, 30, 11, 14, 16, 28, 14, 16, 20, 34, 12].map((width) => ({ width })),
  }).toBlob()) as Blob
  await entregarArchivo(`Bitácora de equipos ${fechaLocal()}.xlsx`, blob)
}

function Bitacora() {
  const [editar, setEditar] = useState<PrestamoEquipo | null>(null)
  const [texto, setTexto] = useState('')
  const [estatus, setEstatus] = useState<'' | PrestamoEquipo['estatus'] | 'DETALLE'>('')
  const q = normalizar(texto)
  const lista = [...S.prestamosEquipo.value]
    .reverse()
    .filter(
      (p) =>
        (!estatus || (estatus === 'DETALLE' ? p.regreso && p.regreso.condicion !== 'bueno' : p.estatus === estatus)) &&
        (!q || normalizar(`${p.folio} ${p.equipoCodigo} ${p.equipoNombre} ${p.rpe} ${p.nombre} ${p.regreso?.devolvioNombre ?? ''}`).includes(q)),
    )
  return (
    <div class="stack">
      <div class="filtros">
        <label class="campo">
          Buscar
          <input class="input" id="bit-buscar" type="search" placeholder="Equipo, persona o folio" value={texto} onInput={(e) => setTexto((e.target as HTMLInputElement).value)} />
        </label>
        <label class="campo">
          Estatus
          <select class="input" id="bit-estatus" value={estatus} onChange={(e) => setEstatus((e.target as HTMLSelectElement).value as typeof estatus)}>
            <option value="">Todos</option>
            <option value="ACTIVO">Fuera de la oficina</option>
            <option value="DEVUELTO">Devueltos</option>
            <option value="DETALLE">Devueltos con detalle o daño</option>
            <option value="ANULADO">Anulados</option>
          </select>
        </label>
        <button class="btn" disabled={!lista.length} onClick={() => intentar(() => exportarBitacora(lista))}>
          <Icono n="excel" /> Excel
        </button>
      </div>
      <div class="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Equipo</th>
              <th>Salida</th>
              <th>Recibió</th>
              <th>Entregó</th>
              <th>Cierre</th>
              <th>Devolvió / recibió</th>
              <th>Estado</th>
              {esAdmin() && <th />}
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const r = p.regreso
              const faltan = r ? p.accesorios.filter((a) => !r.accesorios.includes(a)) : []
              return (
                <tr key={p.id} style={{ opacity: p.estatus === 'ANULADO' ? 0.55 : 1 }}>
                  <td class="mono small">{p.folio}</td>
                  <td>
                    <strong class="mono">{p.equipoCodigo}</strong>
                    <div class="muted small">{p.equipoNombre}</div>
                  </td>
                  <td class="small">{fmtTs(p.ts)}</td>
                  <td>
                    {p.nombre}
                    <div class="muted small">
                      {p.rpe}
                      {p.uso && ` · ${p.uso}`}
                      {p.origenId && ' · recibido en transferencia'}
                    </div>
                  </td>
                  <td class="small">{nombreSI(p.entregoSI, p.usuarioNombre)}</td>
                  <td class="small">
                    {r ? (
                      <>
                        {fmtTs(r.ts)}
                        {r.tipo === 'transferencia' && <div class="muted">transferencia</div>}
                      </>
                    ) : p.estatus === 'ACTIVO' ? (
                      <span class={`badge ${prestamoVencido(p) ? 'bad' : 'prest'}`}>Fuera · {hace(p.ts)}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td class="small">
                    {r ? (
                      <>
                        {r.devolvioNombre}
                        <div class="muted">recibió {nombreSI(r.recibioSI, r.usuarioNombre)}</div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td class="small">
                    {p.obsRapidas?.length ? <div class="muted">Al entregar: {p.obsRapidas.join(', ')}</div> : null}
                    <FotosGuardadas ids={p.fotos} />
                    {p.estatus === 'ANULADO' ? (
                      <span class="badge">Anulado</span>
                    ) : r ? (
                      <>
                        <span class={`badge ${r.condicion === 'bueno' ? 'ok' : r.condicion === 'detalle' ? 'warn' : 'bad'}`}>{CONDICIONES[r.condicion]}</span>
                        {faltan.length > 0 && <div class="muted">Faltó: {faltan.join(', ')}</div>}
                        {p.bitacora && !r.bitacora && <div class="muted">Faltó la bitácora</div>}
                        {r.comentarios && <div class="muted">{r.comentarios}</div>}
                        <FotosGuardadas ids={r.fotos} />
                      </>
                    ) : (
                      ''
                    )}
                    {p.ediciones?.length ? <div class="muted" title={p.ediciones.map((x) => `${fmtTs(x.ts)} · ${x.usuarioNombre}: ${x.cambios}`).join('\n')}>Corregido ({p.ediciones.length})</div> : null}
                  </td>
                  {esAdmin() && (
                    <td>
                      <div class="row" style={{ gap: '4px', flexWrap: 'nowrap' }}>
                        <button class="btn sm" onClick={() => setEditar(p)} title="Corregir este registro">
                          <Icono n="editar" />
                        </button>
                        <button class="btn sm ghost" onClick={() => void confirmarEliminarPrestamo(p)} title="Eliminar este registro">
                          <Icono n="cerrar" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
        {!lista.length && <div class="muted small" style={{ padding: '14px' }}>Sin registros.</div>}
      </div>
      {editar && <ModalEditarPrestamo p={editar} onCerrar={() => setEditar(null)} />}
    </div>
  )
}

// ---------- Pantalla ----------

/** Equipos que hoy no se pueden prestar y por qué. */
function NoDisponibles() {
  const [abierto, setAbierto] = useState(false)
  const activos = S.prestamosEquipoActivos.value
  const lista = S.equipos.value.filter((e) => {
    const d = disponibilidad(e, activos)
    return d !== 'disponible' && d !== 'prestado' && d !== 'baja'
  })
  if (!lista.length) return null
  return (
    <div class="stack" style={{ gap: '4px' }}>
      <button class="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => setAbierto(!abierto)}>
        {plural(lista.length, 'equipo no está disponible', 'equipos no están disponibles')} · {abierto ? 'ocultar' : 'ver por qué'}
      </button>
      {abierto && (
        <p class="muted small">
          {lista.map((e) => `${e.codigo}: ${TEXTO_DISPONIBILIDAD[disponibilidad(e, activos)].toLowerCase()}`).join(' · ')}
        </p>
      )}
    </div>
  )
}

/** Equipos disponibles en cuadros grandes, como el despacho de EPP. */
function PrestarEquipos({ onElegir }: { onElegir: (e: Equipo) => void }) {
  const activos = S.prestamosEquipoActivos.value
  const [buscar, setBuscar] = useState('')
  const [camara, setCamara] = useState(false)
  const cuadros = useRef(0)
  const disponibles = S.equipos.value.filter((e) => disponibilidad(e, activos) === 'disponible')
  const q = normalizar(buscar)
  const lista = disponibles.filter((e) => !q || normalizar(`${e.codigo} ${e.nombre} ${e.marca} ${e.modelo} ${e.serie}`).includes(q))

  /** Lectura del QR (escáner o cámara): abre el préstamo de ese equipo si está disponible. */
  const porLectura = (texto: string): boolean => {
    const leido = equipoPorLectura(texto, S.equipos.value)
    if (leido && disponibles.includes(leido)) {
      onElegir(leido)
      return true
    }
    if (leido) {
      const p = activos.find((x) => x.equipoId === leido.id)
      avisar(p ? `${leido.codigo} lo tiene ${p.nombre.split(' ').slice(0, 2).join(' ')}: regístrelo en «Devolver o transferir».` : `${leido.codigo} no está disponible: ${TEXTO_DISPONIBILIDAD[disponibilidad(leido, activos)].toLowerCase()}.`, { tipo: 'bad' })
    }
    return !!leido
  }

  return (
    <div class="stack">
      <div class="row" style={{ flexWrap: 'nowrap' }}>
        <div class="campo-buscar mini grow">
          <Icono n="buscar" />
          <input
            class="input"
            id="eq-buscar"
            placeholder="Buscar equipo o escanear su QR"
            value={buscar}
            onInput={(e) => setBuscar((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              // Acepta el código tecleado o la lectura del QR con un escáner
              if (!porLectura(buscar) && lista.length === 1) onElegir(lista[0])
            }}
          />
        </div>
        <button class="btn" onClick={() => setCamara(true)} aria-label="Leer el código QR con la cámara" title="Leer el QR con la cámara">
          <Icono n="qr" />
          <span class="solo-ancho">Cámara</span>
        </button>
      </div>
      {camara && (
        <CamaraEnVivo
          titulo="Leer QR del equipo"
          ayuda="Apunte la cámara al código QR de la etiqueta del equipo. Se abre solo en cuanto lo lee."
          textoFoto="Leer de la foto"
          guia={1}
          buscarCodigo={async (c) => {
            const { codigoEnCuadro } = await import('../lib/lectorGafete')
            const texto = await codigoEnCuadro(c, cuadros.current++)
            return texto && equipoPorLectura(texto, S.equipos.value) ? texto : ''
          }}
          onCodigo={(texto) => {
            setCamara(false)
            porLectura(texto)
          }}
          onFoto={async (foto) => {
            const { codigoEnFoto } = await import('../lib/lectorGafete')
            const bmp = await createImageBitmap(foto)
            const lienzo = document.createElement('canvas')
            lienzo.width = bmp.width
            lienzo.height = bmp.height
            lienzo.getContext('2d')!.drawImage(bmp, 0, 0)
            const texto = await codigoEnFoto(lienzo).catch(() => '')
            setCamara(false)
            if (!texto || !porLectura(texto)) avisar('No se encontró el QR de un equipo en la foto.', { tipo: 'bad' })
          }}
          onCerrar={() => setCamara(false)}
        />
      )}
      <div class="mosaico grande">
        {lista.map((e) => {
          const dc = diasCalibracion(e)
          return (
            <button key={e.id} class="tile equipo" onClick={() => onElegir(e)}>
              <FotoEquipo e={e} />
              <span class="tile-codigo mono">{e.codigo}</span>
              <span class="tile-nombre">{e.nombre}</span>
              <span class="tile-stock">{[e.marca, e.modelo].filter(Boolean).join(' ') || 'Sin marca'}</span>
              {dc !== null && dc <= 30 && <span class="badge warn">Calibración en {dc} {dc === 1 ? 'día' : 'días'}</span>}
            </button>
          )
        })}
      </div>
      {!lista.length && (
        <Vacio>{disponibles.length ? 'Ningún equipo disponible coincide.' : S.equipos.value.length ? 'No hay equipos disponibles: todos están prestados o fuera de servicio.' : 'Aún no hay equipos. Un administrador o el encargado de almacén los agrega en la pestaña «Equipos».'}</Vacio>
      )}
      <NoDisponibles />
    </div>
  )
}

/** Equipos que están fuera de la oficina: se devuelven o pasan a otra persona. */
function DevolverEquipos({ onElegir }: { onElegir: (p: PrestamoEquipo) => void }) {
  const [buscar, setBuscar] = useState('')
  const q = normalizar(buscar)
  const lista = [...S.prestamosEquipoActivos.value]
    .sort((a, b) => (a.ts < b.ts ? -1 : 1))
    .filter((p) => !q || normalizar(`${p.equipoCodigo} ${p.equipoNombre} ${p.nombre} ${p.rpe} ${p.uso}`).includes(q))
  if (!S.prestamosEquipoActivos.value.length) return <Vacio>No hay equipos fuera de la oficina.</Vacio>
  return (
    <div class="stack">
      <div class="campo-buscar mini">
        <Icono n="buscar" />
        <input class="input" id="eq-buscar-uso" placeholder="Buscar por equipo o por persona" value={buscar} onInput={(e) => setBuscar((e.target as HTMLInputElement).value)} />
      </div>
      <div class="mosaico grande">
        {lista.map((p) => (
          <TileEnUso key={p.id} p={p} onClick={() => onElegir(p)} />
        ))}
      </div>
      {!lista.length && <Vacio>Ningún equipo coincide.</Vacio>}
    </div>
  )
}

export function PantallaEquipos() {
  const [tab, setTab] = useState<'prestar' | 'devolver' | 'catalogo' | 'bitacora'>('prestar')
  const [prestar, setPrestar] = useState<Equipo | null>(null)
  const [devolver, setDevolver] = useState<PrestamoEquipo | null>(null)
  const [anular, setAnular] = useState<PrestamoEquipo | null>(null)
  const activos = S.prestamosEquipoActivos.value
  const ahora = ahoraLocal()
  const vencidos = activos.filter((p) => prestamoVencido(p, ahora))
  const disponibles = S.equipos.value.filter((e) => disponibilidad(e, activos) === 'disponible').length
  const calibrar = S.equipos.value.filter((e) => e.estado !== 'baja' && (diasCalibracion(e) ?? 999) <= 30)
  return (
    <div class="stack">
      <div class="spread">
        <h1>Equipos a resguardo</h1>
      </div>
      <div class="kpis">
        <button class="kpi" style={{ textAlign: 'left' }} onClick={() => setTab('prestar')}>
          <span>Disponibles</span>
          <b>{disponibles}</b>
        </button>
        <button class="kpi" style={{ textAlign: 'left' }} onClick={() => setTab('devolver')}>
          <span>Fuera de la oficina</span>
          <b>{activos.length}</b>
        </button>
        <button class={`kpi ${vencidos.length ? 'bad' : ''}`} style={{ textAlign: 'left' }} onClick={() => setTab('devolver')}>
          <span>Sin devolver{horasAlerta() ? ` (más de ${horasAlerta()} h)` : ''}</span>
          <b>{vencidos.length}</b>
        </button>
        <button class={`kpi ${calibrar.length ? 'bad' : ''}`} style={{ textAlign: 'left' }} onClick={() => setTab('catalogo')}>
          <span>Calibración ≤ 30 días</span>
          <b>{calibrar.length}</b>
        </button>
      </div>
      {vencidos.length > 0 && (
        <div class="aviso bad">
          <Icono n="alerta" />
          <div>
            <strong>{plural(vencidos.length, 'equipo lleva', 'equipos llevan')} mucho tiempo fuera:</strong> {vencidos.map((p) => `${p.equipoCodigo} (${p.nombre.split(' ').slice(0, 2).join(' ')}, ${hace(p.ts)})`).join(' · ')}
          </div>
        </div>
      )}
      <div class="tabs" role="tablist">
        {(
          [
            ['prestar', 'Prestar'],
            ['devolver', `Devolver o transferir (${activos.length})`],
            ['catalogo', `Equipos (${S.equipos.value.filter((e) => e.estado !== 'baja').length})`],
            ['bitacora', 'Bitácora'],
          ] as const
        ).map(([id, txt]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {txt}
          </button>
        ))}
      </div>
      {tab === 'prestar' && <PrestarEquipos onElegir={setPrestar} />}
      {tab === 'devolver' && <DevolverEquipos onElegir={setDevolver} />}
      {tab === 'catalogo' && <CatalogoEquipos onPrestar={setPrestar} />}
      {tab === 'bitacora' && <Bitacora />}
      {prestar && <ModalPrestar eq={prestar} onCerrar={() => setPrestar(null)} />}
      {devolver && <ModalDevolver p={devolver} onCerrar={() => setDevolver(null)} onAnular={setAnular} />}
      {anular && <ModalAnular p={anular} onCerrar={() => setAnular(null)} />}
    </div>
  )
}

/** Número de préstamos de equipo vencidos, para el aviso del menú. */
export function equiposVencidos(): number {
  const ahora = ahoraLocal()
  return S.prestamosEquipoActivos.value.filter((p) => prestamoVencido(p, ahora)).length
}
