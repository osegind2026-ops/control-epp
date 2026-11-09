import type { ComponentChildren } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import type { CondicionRegreso, Equipo, ObsElegida, PersonalSI, PrestamoEquipo, Trabajador, TurnoSI } from '../domain/types'
import { fechaDeTs, hace, horaLocal } from '../lib/util'
import {
  actividadesRecientes,
  ahoraLocal,
  anularPrestamoEquipo,
  obsOrdenadas,
  personalSIOrdenado,
  prestamoVencido,
  prestarEquipos,
  puedeSerSupervisor,
  enTurno,
  turnoDe,
  TURNOS_SI,
  registrarRegresos,
  CONDICIONES,
  editarPrestamoEquipo,
  eliminarPrestamoEquipo,
} from '../state/equipos'
import { puedeInventario } from '../state/permisos'
import * as S from '../state/store'
import { CapturaFotos } from './Evidencia'
import { avisar, confirmar, intentar, Modal } from './comunes'
import { Icono } from './iconos'
import { BuscadorTrabajador, TarjetaTrabajador } from './Trabajador'

export const fmtTs = (ts: string) => `${fechaDeTs(ts)} ${horaLocal(new Date(ts))}`
/** Nombre corto de quien atendió, o de quien registró si aún no había lista de Seguridad Industrial. */
export const nombreSI = (ref: { nombre: string; corto?: string } | undefined, respaldo = '') => ref?.corto || ref?.nombre || respaldo

// ---------- Piezas compartidas ----------

export function FotoEquipo({ e, mini }: { e: Pick<Equipo, 'fotoId'>; mini?: boolean }) {
  const src = e.fotoId ? S.fotos.value.get(e.fotoId) : undefined
  return <span class={`foto ${mini ? 'mini' : ''}`}>{src ? <img src={src} alt="" loading="lazy" /> : <Icono n="equipo" />}</span>
}

type Funcion = 'tecnico' | 'supervisor'

/** Un botón por persona de Seguridad Industrial; el rótulo dice qué hace en este movimiento (presta a, entrega, recibe…). */
function BotonesSI({ funcion, rol, valor, onCambio, excluirRpe, turno }: { funcion: Funcion; rol: string; valor: string; onCambio: (id: string) => void; excluirRpe?: string; turno: TurnoSI | null }) {
  const todos = useMemo(
    () => personalSIOrdenado(S.personalSI.value, S.prestamosEquipo.value, funcion).filter((x) => !excluirRpe || x.rpe !== excluirRpe),
    [S.personalSI.value, S.prestamosEquipo.value, funcion, excluirRpe],
  )
  // Solo los del turno en curso (y quienes están en los dos); el ya elegido siempre se ve
  const lista = todos.filter((x) => !turno || enTurno(x, turno) || x.id === valor)
  if (todos.length && !lista.length) {
    return (
      <div class="stack" style={{ gap: '4px' }}>
        <strong class="small">{rol}</strong>
        <span class="small">Nadie de esta lista está asignado al {TURNOS_SI[turno!].nombre}. Toque «Ver todos» arriba.</span>
      </div>
    )
  }
  if (!lista.length) {
    return (
      <div class="stack" style={{ gap: '4px' }}>
        <strong class="small">{rol}</strong>
        <span class={`small ${funcion === 'tecnico' ? '' : 'muted'}`}>
          {funcion === 'tecnico'
            ? 'No hay técnicos en la lista. El administrador los agrega en Ajustes → Equipos a resguardo.'
            : `Se registrará a nombre de ${S.sesion.value?.usuarioNombre}.${S.sesion.value?.rol === 'admin' ? ' Para elegir entre varios supervisores, agréguelos en Ajustes → Equipos a resguardo.' : ''}`}
        </span>
      </div>
    )
  }
  return (
    <div class="stack" style={{ gap: '6px' }}>
      <strong class="small">
        {rol} {!valor && <span class="muted">(elija uno)</span>}
      </strong>
      <div class="chips" role="group" aria-label={rol}>
        {lista.map((x) => (
          <button key={x.id} class="chip chip-si" aria-pressed={valor === x.id} onClick={() => onCambio(x.id)} title={x.nombre}>
            {x.corto}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Turno del movimiento y opción para ver también al personal de los otros turnos. */
function AvisoTurno({ turno, verTodos, onVerTodos }: { turno: TurnoSI; verTodos: boolean; onVerTodos: (v: boolean) => void }) {
  const fuera = S.personalSI.value.filter((x) => x.activo && !enTurno(x, turno)).length
  if (!fuera && !verTodos) return null
  return (
    <div class="row small aviso-turno" style={{ gap: '8px', alignItems: 'center' }}>
      <span class="grow">
        {verTodos ? (
          <>Se muestra el personal de los dos turnos.</>
        ) : (
          <>
            <strong>{TURNOS_SI[turno].nombre}</strong> ({TURNOS_SI[turno].horario}): solo el personal de este turno.
          </>
        )}
      </span>
      <button class="btn sm ghost" onClick={() => onVerTodos(!verTodos)}>
        {verTodos ? `Solo ${TURNOS_SI[turno].nombre}` : `Ver todos (+${fuera})`}
      </button>
    </div>
  )
}

/** Quien tiene la sesión abierta queda preseleccionado como supervisor si está en la lista. */
function siPorDefecto(): string {
  const u = S.sesion.value?.usuarioId
  return S.personalSI.value.find((x) => x.activo && puedeSerSupervisor(x) && x.usuarioId === u)?.id ?? ''
}

/** Datos del técnico para el préstamo: el RPE y el área salen del padrón. */
function trabajadorDe(x: PersonalSI): Pick<Trabajador, 'rpe' | 'nombre' | 'area'> {
  const t = x.rpe ? S.personal.value.get(x.rpe) : undefined
  return { rpe: x.rpe ?? x.id, nombre: t?.nombre ?? x.nombre, area: t?.area ?? 'OFICINA DE SEGURIDAD INDUSTRIAL' }
}

const haySupervisores = () => S.personalSI.value.some((x) => x.activo && puedeSerSupervisor(x))

/** Hora del movimiento: se registra al guardar; administrador y almacén pueden corregirla. */
function HoraMovimiento({ etiqueta, valor, onCambio }: { etiqueta: string; valor: string; onCambio: (v: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  if (!puedeInventario()) return null
  if (!abierto && !valor) {
    return (
      <button class="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => (setAbierto(true), onCambio(ahoraLocal()))}>
        <Icono n="historial" /> {etiqueta}: ahora · cambiar
      </button>
    )
  }
  return (
    <label class="campo">
      {etiqueta}
      <div class="row" style={{ flexWrap: 'nowrap' }}>
        <input class="input grow" id="eq-hora" type="datetime-local" max={ahoraLocal()} value={valor} onInput={(e) => onCambio((e.target as HTMLInputElement).value)} />
        <button class="btn sm" onClick={() => (onCambio(''), setAbierto(false))}>
          Ahora
        </button>
      </div>
      <span class="muted small" style={{ fontWeight: 400 }}>Solo si el movimiento ya ocurrió antes.</span>
    </label>
  )
}

/** Accesorios que salen o regresan con el equipo: colapsados mientras estén completos. */
function Accesorios({ lista, marcados, onCambio, titulo }: { lista: string[]; marcados: string[]; onCambio: (m: string[]) => void; titulo: string }) {
  const [abierto, setAbierto] = useState(false)
  if (!lista.length) return null
  const completos = lista.every((a) => marcados.includes(a))
  if (completos && !abierto) {
    return (
      <button class="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => setAbierto(true)}>
        <Icono n="ok" /> Accesorios completos ({lista.length}) · revisar
      </button>
    )
  }
  return (
    <fieldset class="stack" style={{ gap: '6px', border: 0, padding: 0, margin: 0 }}>
      <legend class="small" style={{ fontWeight: 600, marginBottom: '4px' }}>
        {titulo}
      </legend>
      {lista.map((a) => (
        <label key={a} class="check">
          <input type="checkbox" checked={marcados.includes(a)} onChange={(e) => onCambio((e.target as HTMLInputElement).checked ? [...marcados, a] : marcados.filter((x) => x !== a))} />
          {a}
        </label>
      ))}
    </fieldset>
  )
}

/**
 * Observaciones de selección rápida. Las opciones de daño piden foto; lo que se escribe nuevo
 * queda guardado como opción para la próxima vez.
 */
function ObsRapidas({ titulo, obs, onObs, fotos, onFotos, id = 'eq-obs-nueva' }: { titulo: string; obs: ObsElegida[]; onObs: (o: ObsElegida[]) => void; fotos: string[]; onFotos: (f: string[]) => void; id?: string }) {
  const [texto, setTexto] = useState('')
  const [esDano, setEsDano] = useState(false)
  const [verFotos, setVerFotos] = useState(false)
  const catalogo = useMemo(() => obsOrdenadas(S.obsEquipo.value, S.prestamosEquipo.value), [S.obsEquipo.value, S.prestamosEquipo.value])
  const elegida = (t: string) => obs.some((o) => o.texto.toLowerCase() === t.toLowerCase())
  const alternar = (o: ObsElegida) => {
    if (elegida(o.texto)) return onObs(obs.filter((x) => x.texto.toLowerCase() !== o.texto.toLowerCase()))
    // «Sin novedad» y las observaciones se excluyen entre sí
    onObs(o.tipo === 'ok' ? [o] : [...obs.filter((x) => x.tipo !== 'ok'), o])
  }
  const propias = obs.filter((o) => !catalogo.some((c) => c.texto.toLowerCase() === o.texto.toLowerCase()))
  const agregar = () => {
    const t = texto.trim()
    if (!t) return
    const conocida = catalogo.find((c) => c.texto.toLowerCase() === t.toLowerCase())
    if (!elegida(t)) alternar(conocida ? { texto: conocida.texto, tipo: conocida.tipo } : { texto: t, tipo: esDano ? 'dano' : 'detalle' })
    setTexto('')
    setEsDano(false)
  }
  const hayDano = obs.some((o) => o.tipo === 'dano')
  return (
    <div class="stack" style={{ gap: '8px' }}>
      <strong class="small">{titulo}</strong>
      <div class="chips" role="group" aria-label={titulo}>
        {catalogo.map((o) => (
          <button key={o.id} class={`chip obs-${o.tipo}`} aria-pressed={elegida(o.texto)} onClick={() => alternar({ texto: o.texto, tipo: o.tipo })}>
            {o.tipo === 'dano' && '⚠ '}
            {o.texto}
          </button>
        ))}
        {propias.map((o) => (
          <button key={o.texto} class={`chip obs-${o.tipo}`} aria-pressed onClick={() => alternar(o)}>
            {o.tipo === 'dano' && '⚠ '}
            {o.texto}
          </button>
        ))}
      </div>
      <div class="row" style={{ flexWrap: 'nowrap', gap: '6px' }}>
        <input
          class="input grow"
          id={id}
          placeholder="Otra observación (queda guardada como opción)"
          value={texto}
          maxLength={80}
          onInput={(e) => setTexto((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              agregar()
            }
          }}
        />
        <label class="check small" style={{ flex: 'none' }} title="Marcar si es un daño: pedirá una foto">
          <input type="checkbox" checked={esDano} onChange={(e) => setEsDano((e.target as HTMLInputElement).checked)} />
          Daño
        </label>
        <button class="btn" disabled={!texto.trim()} onClick={agregar}>
          Agregar
        </button>
      </div>
      {hayDano || verFotos || fotos.length > 0 ? (
        <CapturaFotos fotos={fotos} onCambio={onFotos} sugerida={hayDano} />
      ) : (
        <button class="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => setVerFotos(true)}>
          <Icono n="camara" /> Agregar foto
        </button>
      )}
    </div>
  )
}

function ActividadCampo({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  const recientes = useMemo(() => actividadesRecientes(S.prestamosEquipo.value), [S.prestamosEquipo.value])
  return (
    <div class="stack" style={{ gap: '6px' }}>
      <label class="campo">
        ¿Para qué actividad se usará?
        <input class="input" id="eq-actividad" placeholder="Ej. Muestreo en espacio confinado, Unidad 2" value={valor} onInput={(e) => onCambio((e.target as HTMLInputElement).value)} />
      </label>
      {recientes.length > 0 && !valor && (
        <div class="chips" role="group" aria-label="Actividades recientes">
          {recientes.map((a) => (
            <button key={a} class="chip" onClick={() => onCambio(a)}>
              {a}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- Prestar ----------

/** A quién se presta: un técnico de Seguridad Industrial (botones) o cualquier trabajador de la planta (padrón). */
type Receptor = { tipo: 'si'; id: string } | { tipo: 'planta'; t: Trabajador | null }

function personaDe(r: Receptor): Pick<Trabajador, 'rpe' | 'nombre' | 'area'> | null {
  if (r.tipo === 'si') {
    const x = S.personalSI.value.find((y) => y.id === r.id)
    return x ? trabajadorDe(x) : null
  }
  return r.t ? { rpe: r.t.rpe, nombre: r.t.nombre, area: r.t.area } : null
}

/** Nombre corto para los avisos: el del botón de SI o las dos primeras palabras. */
function cortoDe(rpe: string, nombre: string): string {
  return S.personalSI.value.find((x) => x.rpe === rpe)?.corto || nombre.split(' ').slice(0, 2).join(' ')
}

function ElegirReceptor({ rol, valor, onCambio, excluirRpe, turno }: { rol: string; valor: Receptor; onCambio: (r: Receptor) => void; excluirRpe?: string; turno: TurnoSI | null }) {
  return (
    <div class="stack" style={{ gap: '8px' }}>
      <div class="row" role="group" aria-label={rol}>
        <button class="opcion grow" aria-pressed={valor.tipo === 'si'} onClick={() => valor.tipo !== 'si' && onCambio({ tipo: 'si', id: '' })}>
          Técnico de Seguridad Industrial
        </button>
        <button class="opcion grow" aria-pressed={valor.tipo === 'planta'} onClick={() => valor.tipo !== 'planta' && onCambio({ tipo: 'planta', t: null })}>
          Personal de la planta
        </button>
      </div>
      {valor.tipo === 'si' ? (
        <BotonesSI funcion="tecnico" rol={`${rol} (técnico)`} valor={valor.id} onCambio={(id) => onCambio({ tipo: 'si', id })} excluirRpe={excluirRpe} turno={turno} />
      ) : (
        <div class="stack" style={{ gap: '6px' }}>
          <strong class="small">{rol} (trabajador de la planta)</strong>
          {valor.t ? (
            <TarjetaTrabajador t={valor.t} onQuitar={() => onCambio({ tipo: 'planta', t: null })} />
          ) : (
            <BuscadorTrabajador autoFocus={false} onElegir={(t) => onCambio({ tipo: 'planta', t })} />
          )}
        </div>
      )}
    </div>
  )
}

/** Lo que se anota de cada equipo dentro de un movimiento de varios. */
interface Detalle {
  accesorios: string[]
  bitacora: boolean
  obs: ObsElegida[]
  fotos: string[]
}

/** Resumen corto de lo anotado en un equipo, para verlo sin abrir su renglón. */
function resumenDetalle(d: Detalle, accesoriosEsperados: string[], libreta: boolean, regreso: boolean): { texto: string; nivel: '' | 'warn' | 'bad' } {
  const partes: string[] = []
  const faltan = accesoriosEsperados.filter((a) => !d.accesorios.includes(a))
  if (faltan.length) partes.push(`${regreso ? 'Falta' : 'Sin'}: ${faltan.join(', ')}`)
  if (regreso && libreta && !d.bitacora) partes.push('sin libreta')
  if (!regreso && d.bitacora) partes.push('lleva libreta')
  partes.push(...d.obs.map((o) => (o.tipo === 'dano' ? `⚠ ${o.texto}` : o.texto)))
  if (d.fotos.length) partes.push(d.fotos.length === 1 ? '1 foto' : `${d.fotos.length} fotos`)
  const nivel = d.obs.some((o) => o.tipo === 'dano') ? 'bad' : faltan.length || d.obs.some((o) => o.tipo === 'detalle') || (regreso && libreta && !d.bitacora) ? 'warn' : ''
  return { texto: partes.join(' · ') || 'Sin comentarios', nivel }
}

/** Renglón de un equipo en la canasta: se abre para anotar accesorios, libreta, condición y fotos. */
function RenglonEquipo(props: {
  foto: Pick<Equipo, 'fotoId'>
  codigo: string
  nombre: string
  sub?: string
  resumen: { texto: string; nivel: '' | 'warn' | 'bad' }
  abierto: boolean
  onAbrir: () => void
  onQuitar?: () => void
  children: ComponentChildren
}) {
  return (
    <div class={`renglon-eq ${props.abierto ? 'abierto' : ''}`}>
      <div class="renglon-eq-cab">
        <FotoEquipo e={props.foto} mini />
        <button class="renglon-eq-titulo" onClick={props.onAbrir} aria-expanded={props.abierto}>
          <span>
            <strong class="mono">{props.codigo}</strong> · {props.nombre}
          </span>
          {props.sub && <span class="muted small">{props.sub}</span>}
          <span class={`small renglon-eq-resumen ${props.resumen.nivel}`}>{props.resumen.texto}</span>
        </button>
        <button class="btn ghost sm" onClick={props.onAbrir}>
          {props.abierto ? 'Listo' : 'Anotar'}
        </button>
        {props.onQuitar && (
          <button class="btn ghost sm" onClick={props.onQuitar} aria-label={`Quitar ${props.codigo} de la lista`} title="Quitar de la lista">
            <Icono n="cerrar" />
          </button>
        )}
      </div>
      {props.abierto && <div class="renglon-eq-cuerpo stack">{props.children}</div>}
    </div>
  )
}

/** Detalle guardado de cada renglón; los que no se tocan usan su valor inicial. */
function useDetalles(inicial: (id: string) => Detalle) {
  const [mapa, setMapa] = useState<Record<string, Detalle>>({})
  const de = (id: string) => mapa[id] ?? inicial(id)
  const cambiar = (id: string, c: Partial<Detalle>) => setMapa((m) => ({ ...m, [id]: { ...(m[id] ?? inicial(id)), ...c } }))
  return { de, cambiar }
}

/**
 * Préstamo de uno o varios equipos a la misma persona, como el despacho: se agregan a la lista,
 * cada uno puede llevar o no comentarios de su estado, y al final se registran juntos (un folio por equipo).
 */
export function ModalPrestar({ equipos, onQuitar, onCerrar, onListo }: { equipos: Equipo[]; onQuitar?: (id: string) => void; onCerrar: () => void; onListo?: () => void }) {
  const [receptor, setReceptor] = useState<Receptor>({ tipo: 'si', id: '' })
  const [actividad, setActividad] = useState('')
  // Casi nadie lleva su libreta: no viene marcada
  const det = useDetalles((id) => ({ accesorios: equipos.find((e) => e.id === id)?.accesorios ?? [], bitacora: false, obs: [], fotos: [] }))
  const [abierto, setAbierto] = useState<string | null>(null)
  const [si, setSi] = useState(siPorDefecto())
  const [hora, setHora] = useState('')
  // El turno sale de la hora del movimiento (ahora, o la que corrija el administrador)
  const turnoMov = turnoDe(hora ? new Date(hora) : new Date())
  const [verTodos, setVerTodos] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const persona = personaDe(receptor)
  const uno = equipos.length === 1
  const falta = !equipos.length ? 'Agregue al menos un equipo' : !persona ? 'Elija a quién se presta' : haySupervisores() && !si ? 'Elija qué supervisor entrega' : ''

  const guardar = async () => {
    if (!persona || guardando) return
    setGuardando(true)
    const lista = await intentar(() =>
      prestarEquipos({
        trabajador: persona,
        actividad,
        entregoSIId: si || undefined,
        fechaHora: hora || undefined,
        renglones: equipos.map((e) => ({ equipoId: e.id, ...det.de(e.id) })),
      }),
    )
    setGuardando(false)
    if (lista) {
      const quien = cortoDe(persona.rpe, persona.nombre)
      avisar(
        lista.length === 1
          ? `✓ ${lista[0].equipoCodigo} para ${quien} · ${lista[0].folio}`
          : `✓ ${lista.length} equipos para ${quien} · folios ${lista[0].folio} a ${lista[lista.length - 1].folio}`,
        { ms: 6000 },
      )
      onListo?.()
      onCerrar()
    }
  }

  return (
    <Modal
      titulo={uno ? `Prestar ${equipos[0].codigo}` : `Prestar ${equipos.length} equipos`}
      onCerrar={onCerrar}
      ancho
      acciones={
        <>
          <span class="muted small grow">{falta}</span>
          <button class="btn" onClick={onCerrar}>
            {onQuitar && !uno ? 'Seguir agregando' : 'Cancelar'}
          </button>
          <button class="btn primary" disabled={!!falta || guardando} onClick={guardar}>
            {uno ? 'Registrar salida' : `Registrar salida de ${equipos.length}`}
          </button>
        </>
      }
    >
      <div class="stack" style={{ gap: '6px' }}>
        <strong class="small">{uno ? 'Equipo' : `Equipos (${equipos.length}) · toque uno para anotar su estado; si no, sale sin comentarios`}</strong>
        {equipos.map((eq) => {
          const d = det.de(eq.id)
          const abiertoEste = uno || abierto === eq.id
          return (
            <RenglonEquipo
              key={eq.id}
              foto={eq}
              codigo={eq.codigo}
              nombre={eq.nombre}
              sub={[eq.marca, eq.modelo, eq.serie && `Serie ${eq.serie}`].filter(Boolean).join(' · ')}
              resumen={resumenDetalle(d, eq.accesorios, false, false)}
              abierto={abiertoEste}
              onAbrir={() => !uno && setAbierto(abiertoEste ? null : eq.id)}
              onQuitar={onQuitar && !uno ? () => onQuitar(eq.id) : undefined}
            >
              <Accesorios lista={eq.accesorios} marcados={d.accesorios} onCambio={(accesorios) => det.cambiar(eq.id, { accesorios })} titulo="Accesorios que salen con el equipo" />
              {eq.llevaBitacora && (
                <label class="check">
                  <input type="checkbox" checked={d.bitacora} onChange={(e) => det.cambiar(eq.id, { bitacora: (e.target as HTMLInputElement).checked })} />
                  Se lleva su libreta de bitácora
                </label>
              )}
              <ObsRapidas
                id={`eq-obs-${eq.id}`}
                titulo="Condición del equipo al entregarlo"
                obs={d.obs}
                onObs={(obs) => det.cambiar(eq.id, { obs })}
                fotos={d.fotos}
                onFotos={(fotos) => det.cambiar(eq.id, { fotos })}
              />
            </RenglonEquipo>
          )
        })}
      </div>
      <AvisoTurno turno={turnoMov} verTodos={verTodos} onVerTodos={setVerTodos} />
      <ElegirReceptor rol="Se presta a" valor={receptor} onCambio={setReceptor} turno={verTodos ? null : turnoMov} />
      <BotonesSI funcion="supervisor" rol="Lo entrega (supervisor)" valor={si} onCambio={setSi} turno={verTodos ? null : turnoMov} />
      <ActividadCampo valor={actividad} onCambio={setActividad} />
      <HoraMovimiento etiqueta={uno ? 'Hora de la entrega' : 'Hora de la entrega (la misma para todos)'} valor={hora} onCambio={setHora} />
    </Modal>
  )
}

// ---------- Devolver o transferir ----------

/**
 * Devolución a la oficina o paso a otra persona de uno o varios equipos (de una o de varias personas).
 * Cada equipo lleva sus accesorios, libreta, condición y fotos; lo demás se captura una sola vez.
 */
export function ModalDevolver({
  prestamos,
  onQuitar,
  onCerrar,
  onListo,
  onAnular,
}: {
  prestamos: PrestamoEquipo[]
  onQuitar?: (id: string) => void
  onCerrar: () => void
  onListo?: () => void
  onAnular: (p: PrestamoEquipo) => void
}) {
  const uno = prestamos.length === 1
  const titulares = [...new Set(prestamos.map((p) => p.rpe))]
  const unTitular = titulares.length === 1
  const p0 = prestamos[0]
  const [modo, setModo] = useState<'devolucion' | 'transferencia'>('devolucion')
  // Quien devuelve: el que lo tiene (por defecto) u otro técnico
  const [otroId, setOtroId] = useState('')
  const [nuevo, setNuevo] = useState<Receptor>({ tipo: 'si', id: '' })
  const usos = [...new Set(prestamos.map((p) => p.uso))]
  const [actividad, setActividad] = useState(usos.length === 1 ? usos[0] : '')
  const det = useDetalles((id) => {
    const p = prestamos.find((x) => x.id === id)
    return { accesorios: p?.accesorios ?? [], bitacora: !!p?.bitacora, obs: [], fotos: [] }
  })
  const [abierto, setAbierto] = useState<string | null>(null)
  const [si, setSi] = useState(siPorDefecto())
  const [hora, setHora] = useState('')
  // El turno sale de la hora del movimiento (ahora, o la que corrija el administrador)
  const turnoMov = turnoDe(hora ? new Date(hora) : new Date())
  const [verTodos, setVerTodos] = useState(false)
  const [guardando, setGuardando] = useState(false)
  if (!p0) return null
  const transfiere = modo === 'transferencia'
  const otro = unTitular ? S.personalSI.value.find((x) => x.id === otroId) : undefined
  const destino = personaDe(nuevo)
  const nombreTitular = cortoDe(p0.rpe, p0.nombre)
  const falta = !prestamos.length
    ? 'Elija al menos un equipo'
    : transfiere && !destino
      ? 'Elija quién lo recibe'
      : transfiere && destino && titulares.includes(destino.rpe)
        ? 'Quien recibe ya tiene uno de estos equipos: elija a otra persona'
        : haySupervisores() && !si
          ? `Elija qué supervisor ${transfiere ? 'registra' : 'recibe'}`
          : ''

  const guardar = async () => {
    if (guardando) return
    setGuardando(true)
    const devolvio = !transfiere && otro ? trabajadorDe(otro) : undefined
    const act = actividad.trim()
    const r = await intentar(() =>
      registrarRegresos({
        recibioSIId: si || undefined,
        fechaHora: hora || undefined,
        // Sin actividad nueva, cada equipo conserva la suya
        transferirA: transfiere && destino ? { trabajador: destino, actividad: act || undefined } : undefined,
        renglones: prestamos.map((p) => ({ prestamoId: p.id, devolvio, ...det.de(p.id) })),
      }),
    )
    setGuardando(false)
    if (!r) return
    const que = uno ? p0.equipoCodigo : `${prestamos.length} equipos`
    avisar(
      transfiere && destino
        ? `✓ ${que} ${uno ? 'pasó' : 'pasaron'} ${unTitular ? `de ${nombreTitular} ` : ''}a ${cortoDe(destino.rpe, destino.nombre)}`
        : `✓ ${que} de regreso en la oficina`,
      { ms: 6000 },
    )
    onListo?.()
    onCerrar()
  }

  return (
    <Modal
      titulo={`${transfiere ? 'Transferir' : 'Devolver'} ${uno ? p0.equipoCodigo : `${prestamos.length} equipos`}`}
      onCerrar={onCerrar}
      ancho
      acciones={
        <>
          <span class="muted small grow">{falta}</span>
          <button class="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button class="btn primary" disabled={!!falta || guardando} onClick={guardar}>
            {transfiere ? 'Registrar transferencia' : 'Registrar devolución'}
            {!uno && ` de ${prestamos.length}`}
          </button>
        </>
      }
    >
      {uno && (
        <div class="muted small">
          {p0.equipoNombre} · folio {p0.folio}
          <br />
          Lo tiene <strong>{nombreTitular}</strong> desde {fmtTs(p0.ts)} ({hace(p0.ts)}){p0.uso && ` · ${p0.uso}`}
        </div>
      )}
      <div class="row" role="group" aria-label="Qué se hace con el equipo">
        <button class="opcion grow" aria-pressed={!transfiere} onClick={() => setModo('devolucion')}>
          <Icono n="devolucion" /> Devolución a la oficina
        </button>
        <button class="opcion grow" aria-pressed={transfiere} onClick={() => setModo('transferencia')}>
          <Icono n="repetir" /> Pasa a otra persona
        </button>
      </div>

      <div class="stack" style={{ gap: '6px' }}>
        <strong class="small">{uno ? 'Equipo' : `Equipos (${prestamos.length}) · toque uno para anotar su estado; si no, queda sin comentarios`}</strong>
        {prestamos.map((p) => {
          const d = det.de(p.id)
          const abiertoEste = uno || abierto === p.id
          const eq = S.equipos.value.find((e) => e.id === p.equipoId)
          return (
            <RenglonEquipo
              key={p.id}
              foto={eq ?? {}}
              codigo={p.equipoCodigo}
              nombre={eq?.nombre ?? p.equipoNombre}
              sub={uno ? undefined : `${p.folio} · ${unTitular ? '' : `${cortoDe(p.rpe, p.nombre)} · `}desde ${fmtTs(p.ts)} (${hace(p.ts)})`}
              resumen={resumenDetalle(d, p.accesorios, p.bitacora, true)}
              abierto={abiertoEste}
              onAbrir={() => !uno && setAbierto(abiertoEste ? null : p.id)}
              onQuitar={onQuitar && !uno ? () => onQuitar(p.id) : undefined}
            >
              <Accesorios
                lista={p.accesorios}
                marcados={d.accesorios}
                onCambio={(accesorios) => det.cambiar(p.id, { accesorios })}
                titulo={transfiere ? 'Accesorios que pasan con el equipo' : 'Accesorios que regresan'}
              />
              {p.bitacora && (
                <label class="check">
                  <input type="checkbox" checked={d.bitacora} onChange={(e) => det.cambiar(p.id, { bitacora: (e.target as HTMLInputElement).checked })} />
                  {transfiere ? 'La libreta de bitácora pasa con el equipo' : 'Regresa la libreta de bitácora'}
                </label>
              )}
              <ObsRapidas
                id={`eq-obs-${p.id}`}
                titulo={transfiere ? 'Condición del equipo en la transferencia' : 'Condición del equipo al recibirlo'}
                obs={d.obs}
                onObs={(obs) => det.cambiar(p.id, { obs })}
                fotos={d.fotos}
                onFotos={(fotos) => det.cambiar(p.id, { fotos })}
              />
              {d.obs.some((o) => o.tipo === 'dano') && !transfiere && <p class="muted small">Con un daño, el equipo quedará «En revisión» y no se podrá prestar hasta que se marque como operativo.</p>}
            </RenglonEquipo>
          )
        })}
      </div>

      <AvisoTurno turno={turnoMov} verTodos={verTodos} onVerTodos={setVerTodos} />
      {transfiere ? (
        <>
          <div class="stack" style={{ gap: '6px' }}>
            <strong class="small">Transfiere</strong>
            <div class="chips">
              {titulares.map((rpe) => {
                const p = prestamos.find((x) => x.rpe === rpe)!
                return (
                  <button key={rpe} class="chip chip-si" aria-pressed>
                    {cortoDe(p.rpe, p.nombre)}
                  </button>
                )
              })}
            </div>
          </div>
          <ElegirReceptor rol="Recibe" valor={nuevo} onCambio={setNuevo} excluirRpe={unTitular ? p0.rpe : undefined} turno={verTodos ? null : turnoMov} />
          <ActividadCampo valor={actividad} onCambio={setActividad} />
          {!actividad.trim() && usos.length > 1 && <p class="muted small">Sin actividad nueva, cada equipo conserva la que tenía.</p>}
        </>
      ) : unTitular ? (
        <div class="stack" style={{ gap: '6px' }}>
          <strong class="small">Devuelve</strong>
          <div class="chips" role="group" aria-label="Quién devuelve">
            <button class="chip chip-si" aria-pressed={!otroId} onClick={() => setOtroId('')}>
              {nombreTitular}
            </button>
            {personalSIOrdenado(S.personalSI.value, S.prestamosEquipo.value, 'tecnico')
              .filter((x) => x.rpe !== p0.rpe && (verTodos || enTurno(x, turnoMov) || x.id === otroId))
              .map((x) => (
                <button key={x.id} class="chip chip-si" aria-pressed={otroId === x.id} onClick={() => setOtroId(x.id)} title={x.nombre}>
                  {x.corto}
                </button>
              ))}
          </div>
        </div>
      ) : (
        <p class="muted small">Cada equipo queda devuelto por la persona que lo tiene.</p>
      )}

      <BotonesSI funcion="supervisor" rol={transfiere ? 'Registra la transferencia (supervisor)' : 'Recibe (supervisor)'} valor={si} onCambio={setSi} turno={verTodos ? null : turnoMov} />
      <HoraMovimiento
        etiqueta={`${transfiere ? 'Hora de la transferencia' : 'Hora de la devolución'}${uno ? '' : ' (la misma para todos)'}`}
        valor={hora}
        onCambio={setHora}
      />
      {uno && (
        <button class="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => (onCerrar(), onAnular(p0))}>
          Se registró por error: anular esta salida
        </button>
      )}
    </Modal>
  )
}

export function ModalAnular({ p, onCerrar }: { p: PrestamoEquipo; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState('')
  return (
    <Modal
      titulo={`Anular salida ${p.folio}`}
      onCerrar={onCerrar}
      acciones={
        <>
          <button class="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            class="btn danger"
            onClick={async () => {
              const ok = await intentar(async () => {
                await anularPrestamoEquipo(p.id, motivo)
                return true
              })
              if (ok) {
                avisar('Salida anulada')
                onCerrar()
              }
            }}
          >
            Anular
          </button>
        </>
      }
    >
      <p class="small">Úselo solo si la salida se registró por error (el equipo nunca salió). Si el equipo regresó, use «Devolver».</p>
      <label class="campo">
        Motivo
        <input class="input" id="eq-anular" value={motivo} onInput={(e) => setMotivo((e.target as HTMLInputElement).value)} />
      </label>
    </Modal>
  )
}

/** Cuadro de un equipo prestado: quién lo tiene, desde cuándo y si ya se pasó el tiempo de alerta. */
export function TileEnUso({ p, onClick, elegido }: { p: PrestamoEquipo; onClick: () => void; elegido?: boolean }) {
  const eq = S.equipos.value.find((e) => e.id === p.equipoId)
  const vencido = prestamoVencido(p)
  return (
    <button class={`tile prest ${vencido ? 'prestamo-vencido' : ''}`} onClick={onClick} aria-pressed={elegido === undefined ? undefined : elegido}>
      {elegido && <span class="tile-marca" aria-hidden="true">✓</span>}
      <FotoEquipo e={eq ?? {}} />
      <span class="tile-codigo mono">{p.equipoCodigo}</span>
      <span class="tile-nombre">{p.nombre.split(' ').slice(0, 3).join(' ')}</span>
      <span class="tile-stock">{p.uso || p.equipoNombre}</span>
      <span class={`badge ${vencido ? 'bad' : 'prest'}`}>
        {vencido ? 'Sin devolver · ' : 'Fuera · '}
        {hace(p.ts)}
      </span>
    </button>
  )
}

// ---------- Correcciones del administrador ----------

/** Fecha ISO → valor de un campo de fecha y hora (hora local). */
const aCampo = (iso: string) => ahoraLocal(new Date(iso))

/** Lista de opciones para corregir a una persona: la actual siempre aparece aunque ya no esté en la lista. */
function SelectorPersona({ etiqueta, actual, lista, valor, onCambio }: { etiqueta: string; actual: { clave: string; texto: string }; lista: { clave: string; texto: string }[]; valor: string; onCambio: (v: string) => void }) {
  const opciones = [actual, ...lista.filter((x) => x.clave !== actual.clave)]
  return (
    <label class="campo">
      {etiqueta}
      <select class="input" value={valor} onChange={(e) => onCambio((e.target as HTMLSelectElement).value)}>
        {opciones.map((o) => (
          <option key={o.clave} value={o.clave}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  )
}

/** El administrador corrige un registro de la bitácora. Queda anotado qué cambió y quién. */
export function ModalEditarPrestamo({ p, onCerrar }: { p: PrestamoEquipo; onCerrar: () => void }) {
  const r = p.regreso
  const tecnicos = personalSIOrdenado(S.personalSI.value, S.prestamosEquipo.value, 'tecnico')
  const supervisores = personalSIOrdenado(S.personalSI.value, S.prestamosEquipo.value, 'supervisor')
  const opcTecnicos = tecnicos.map((x) => ({ clave: x.rpe ?? x.id, texto: `${x.corto} · ${trabajadorDe(x).nombre}` }))
  const opcSupervisores = supervisores.map((x) => ({ clave: x.id, texto: `${x.corto} · ${x.nombre}` }))
  const [tec, setTec] = useState(p.rpe)
  const [entrego, setEntrego] = useState(p.entregoSI?.id ?? '')
  const [uso, setUso] = useState(p.uso)
  const [salida, setSalida] = useState(aCampo(p.ts))
  const [bitacora, setBitacora] = useState(p.bitacora)
  const [obs, setObs] = useState(p.observaciones)
  const [regresoFecha, setRegresoFecha] = useState(r ? aCampo(r.ts) : '')
  const [devolvio, setDevolvio] = useState(r?.devolvioRpe ?? '')
  const [recibio, setRecibio] = useState(r?.recibioSI?.id ?? '')
  const [condicion, setCondicion] = useState<CondicionRegreso>(r?.condicion ?? 'bueno')
  const [comentarios, setComentarios] = useState(r?.comentarios ?? '')
  /** La persona elegida en la lista; si no se cambió, la que ya estaba en el registro. */
  const personaDe = (rpe: string, actual: Pick<Trabajador, 'rpe' | 'nombre' | 'area'>): Pick<Trabajador, 'rpe' | 'nombre' | 'area'> => {
    if (rpe === actual.rpe) return actual
    const x = tecnicos.find((t) => (t.rpe ?? t.id) === rpe)
    return x ? trabajadorDe(x) : actual
  }

  const guardar = async () => {
    const ok = await intentar(async () => {
      await editarPrestamoEquipo(p.id, {
        tecnico: personaDe(tec, { rpe: p.rpe, nombre: p.nombre, area: p.area }),
        entregoSIId: entrego && entrego !== p.entregoSI?.id ? entrego : undefined,
        uso,
        salida,
        bitacora,
        observaciones: obs,
        regreso: r
          ? {
              fecha: regresoFecha,
              devolvio: personaDe(devolvio, { rpe: r.devolvioRpe, nombre: r.devolvioNombre, area: '' }),
              recibioSIId: recibio && recibio !== r.recibioSI?.id ? recibio : undefined,
              condicion,
              comentarios,
            }
          : undefined,
      })
      return true
    })
    if (ok) {
      avisar(`✓ Registro ${p.folio} corregido`)
      onCerrar()
    }
  }

  return (
    <Modal
      titulo={`Corregir ${p.folio}`}
      onCerrar={onCerrar}
      ancho
      acciones={
        <>
          <button class="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button class="btn primary" onClick={guardar}>
            Guardar corrección
          </button>
        </>
      }
    >
      <p class="muted small">
        {p.equipoCodigo} · {p.equipoNombre}. Los cambios quedan anotados en el registro con su nombre y se envían a los demás equipos.
      </p>
      <strong>Salida</strong>
      <div class="row" style={{ alignItems: 'start', gap: '8px' }}>
        <div class="grow">
          <SelectorPersona etiqueta="Se prestó a" actual={{ clave: p.rpe, texto: `${p.nombre} (${p.rpe})` }} lista={opcTecnicos} valor={tec} onCambio={setTec} />
        </div>
        <div class="grow">
          <SelectorPersona
            etiqueta="Lo entregó"
            actual={{ clave: p.entregoSI?.id ?? '', texto: p.entregoSI ? `${p.entregoSI.corto ?? ''} · ${p.entregoSI.nombre}` : p.usuarioNombre }}
            lista={opcSupervisores}
            valor={entrego}
            onCambio={setEntrego}
          />
        </div>
      </div>
      <div class="row" style={{ alignItems: 'start', gap: '8px' }}>
        <label class="campo grow">
          Actividad
          <input class="input" value={uso} onInput={(e) => setUso((e.target as HTMLInputElement).value)} />
        </label>
        <label class="campo">
          Fecha y hora de salida
          <input class="input" type="datetime-local" value={salida} max={ahoraLocal()} onInput={(e) => setSalida((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <label class="campo">
        Observaciones al entregar
        <input class="input" value={obs} onInput={(e) => setObs((e.target as HTMLInputElement).value)} />
      </label>
      <label class="check">
        <input type="checkbox" checked={bitacora} onChange={(e) => setBitacora((e.target as HTMLInputElement).checked)} />
        Se llevó su libreta de bitácora
      </label>
      {r && (
        <>
          <strong>{r.tipo === 'transferencia' ? 'Transferencia' : 'Devolución'}</strong>
          <div class="row" style={{ alignItems: 'start', gap: '8px' }}>
            <div class="grow">
              <SelectorPersona etiqueta={r.tipo === 'transferencia' ? 'Lo transfirió' : 'Lo devolvió'} actual={{ clave: r.devolvioRpe, texto: `${r.devolvioNombre} (${r.devolvioRpe})` }} lista={opcTecnicos} valor={devolvio} onCambio={setDevolvio} />
            </div>
            <div class="grow">
              <SelectorPersona
                etiqueta={r.tipo === 'transferencia' ? 'Registró' : 'Lo recibió'}
                actual={{ clave: r.recibioSI?.id ?? '', texto: r.recibioSI ? `${r.recibioSI.corto ?? ''} · ${r.recibioSI.nombre}` : r.usuarioNombre }}
                lista={opcSupervisores}
                valor={recibio}
                onCambio={setRecibio}
              />
            </div>
          </div>
          <div class="row" style={{ alignItems: 'start', gap: '8px' }}>
            <label class="campo">
              Fecha y hora
              <input class="input" type="datetime-local" value={regresoFecha} max={ahoraLocal()} onInput={(e) => setRegresoFecha((e.target as HTMLInputElement).value)} />
            </label>
            <label class="campo grow">
              Condición
              <select class="input" value={condicion} onChange={(e) => setCondicion((e.target as HTMLSelectElement).value as CondicionRegreso)}>
                {(Object.keys(CONDICIONES) as CondicionRegreso[]).map((c) => (
                  <option key={c} value={c}>
                    {CONDICIONES[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label class="campo">
            Observaciones al recibir
            <input class="input" value={comentarios} onInput={(e) => setComentarios((e.target as HTMLInputElement).value)} />
          </label>
        </>
      )}
      {p.ediciones?.length ? (
        <details>
          <summary class="small">Correcciones anteriores ({p.ediciones.length})</summary>
          <ul class="small muted">
            {p.ediciones.map((x, i) => (
              <li key={i}>
                {fmtTs(x.ts)} · {x.usuarioNombre}: {x.cambios}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Modal>
  )
}

/** Borrado definitivo: primero se muestra qué se va a borrar y se pide confirmación explícita. */
export async function confirmarEliminarPrestamo(p: PrestamoEquipo): Promise<void> {
  const r = p.regreso
  const ligado = p.origenId || r?.siguienteId
  const fotos = (p.fotos?.length ?? 0) + (r?.fotos?.length ?? 0)
  const detalle = [
    `Folio ${p.folio} · ${p.equipoCodigo} ${p.equipoNombre}`,
    `Salida: ${fmtTs(p.ts)} · se prestó a ${p.nombre} (${p.rpe})${p.uso ? ` · ${p.uso}` : ''}`,
    r ? `${r.tipo === 'transferencia' ? 'Transferencia' : 'Devolución'}: ${fmtTs(r.ts)} · ${r.devolvioNombre}` : 'Sigue fuera de la oficina: el equipo quedará como disponible.',
    fotos ? `Se borrarán también ${fotos} foto(s).` : '',
    ligado ? 'Es parte de una transferencia: el registro ligado se conserva, pero sin la liga a este.' : '',
    'El registro se borra también en los demás equipos al sincronizar y no se puede recuperar (salvo desde un respaldo).',
  ]
    .filter(Boolean)
    .join('\n')
  if (!(await confirmar('Eliminar registro de la bitácora', detalle, 'Eliminar definitivamente', true))) return
  const ok = await intentar(async () => {
    await eliminarPrestamoEquipo(p.id)
    return true
  })
  if (ok) avisar(`Registro ${p.folio} eliminado`)
}
