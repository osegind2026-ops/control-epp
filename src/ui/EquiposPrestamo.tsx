import { useMemo, useState } from 'preact/hooks'
import type { Equipo, ObsElegida, PersonalSI, PrestamoEquipo, Trabajador } from '../domain/types'
import { fechaDeTs, hace, horaLocal } from '../lib/util'
import {
  actividadesRecientes,
  ahoraLocal,
  anularPrestamoEquipo,
  obsOrdenadas,
  personalSIOrdenado,
  prestamoVencido,
  prestarEquipo,
  puedeSerSupervisor,
  registrarRegreso,
} from '../state/equipos'
import { puedeInventario } from '../state/permisos'
import * as S from '../state/store'
import { CapturaFotos } from './Evidencia'
import { avisar, intentar, Modal } from './comunes'
import { Icono } from './iconos'

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
function BotonesSI({ funcion, rol, valor, onCambio, excluirRpe }: { funcion: Funcion; rol: string; valor: string; onCambio: (id: string) => void; excluirRpe?: string }) {
  const lista = useMemo(
    () => personalSIOrdenado(S.personalSI.value, S.prestamosEquipo.value, funcion).filter((x) => !excluirRpe || x.rpe !== excluirRpe),
    [S.personalSI.value, S.prestamosEquipo.value, funcion, excluirRpe],
  )
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
function ObsRapidas({ titulo, obs, onObs, fotos, onFotos }: { titulo: string; obs: ObsElegida[]; onObs: (o: ObsElegida[]) => void; fotos: string[]; onFotos: (f: string[]) => void }) {
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
          id="eq-obs-nueva"
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

export function ModalPrestar({ eq, onCerrar }: { eq: Equipo; onCerrar: () => void }) {
  const [tec, setTec] = useState('')
  const [actividad, setActividad] = useState('')
  const [accesorios, setAccesorios] = useState<string[]>(eq.accesorios)
  // Casi nadie lleva su libreta: no viene marcada
  const [bitacora, setBitacora] = useState(false)
  const [obs, setObs] = useState<ObsElegida[]>([])
  const [fotos, setFotos] = useState<string[]>([])
  const [si, setSi] = useState(siPorDefecto())
  const [hora, setHora] = useState('')
  const [guardando, setGuardando] = useState(false)
  const tecnico = S.personalSI.value.find((x) => x.id === tec)
  const falta = !tecnico ? 'Elija a quién se presta' : haySupervisores() && !si ? 'Elija qué supervisor entrega' : ''

  const guardar = async () => {
    if (!tecnico || guardando) return
    setGuardando(true)
    const p = await intentar(() => prestarEquipo({ equipoId: eq.id, trabajador: trabajadorDe(tecnico), actividad, accesorios, bitacora, obs, fotos, entregoSIId: si || undefined, fechaHora: hora || undefined }))
    setGuardando(false)
    if (p) {
      avisar(`✓ ${p.equipoCodigo} para ${tecnico.corto} · ${p.folio}`)
      onCerrar()
    }
  }

  return (
    <Modal
      titulo={`Prestar ${eq.codigo}`}
      onCerrar={onCerrar}
      ancho
      acciones={
        <>
          <span class="muted small grow">{falta}</span>
          <button class="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button class="btn primary" disabled={!!falta || guardando} onClick={guardar}>
            Registrar salida
          </button>
        </>
      }
    >
      <div class="row card" style={{ padding: '8px', flexWrap: 'nowrap' }}>
        <FotoEquipo e={eq} mini />
        <div class="grow">
          <strong class="mono">{eq.codigo}</strong> · {eq.nombre}
          <div class="muted small">{[eq.marca, eq.modelo, eq.serie && `Serie ${eq.serie}`].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <BotonesSI funcion="tecnico" rol="Se presta a (técnico)" valor={tec} onCambio={setTec} />
      <BotonesSI funcion="supervisor" rol="Lo entrega (supervisor)" valor={si} onCambio={setSi} />
      <ActividadCampo valor={actividad} onCambio={setActividad} />
      <Accesorios lista={eq.accesorios} marcados={accesorios} onCambio={setAccesorios} titulo="Accesorios que salen con el equipo" />
      <label class="check">
        <input type="checkbox" checked={bitacora} onChange={(e) => setBitacora((e.target as HTMLInputElement).checked)} />
        Se lleva su libreta de bitácora
      </label>
      <ObsRapidas titulo="Condición del equipo al entregarlo" obs={obs} onObs={setObs} fotos={fotos} onFotos={setFotos} />
      <HoraMovimiento etiqueta="Hora de la entrega" valor={hora} onCambio={setHora} />
    </Modal>
  )
}

// ---------- Devolver o transferir ----------

export function ModalDevolver({ p, onCerrar, onAnular }: { p: PrestamoEquipo; onCerrar: () => void; onAnular: (p: PrestamoEquipo) => void }) {
  const [modo, setModo] = useState<'devolucion' | 'transferencia'>('devolucion')
  // Quien devuelve: el que lo tiene (por defecto) u otro técnico
  const [otroId, setOtroId] = useState('')
  const [nuevoId, setNuevoId] = useState('')
  const [actividad, setActividad] = useState(p.uso)
  const [accesorios, setAccesorios] = useState<string[]>(p.accesorios)
  const [bitacora, setBitacora] = useState(p.bitacora)
  const [obs, setObs] = useState<ObsElegida[]>([])
  const [fotos, setFotos] = useState<string[]>([])
  const [si, setSi] = useState(siPorDefecto())
  const [hora, setHora] = useState('')
  const [guardando, setGuardando] = useState(false)
  const transfiere = modo === 'transferencia'
  const otro = S.personalSI.value.find((x) => x.id === otroId)
  const nuevo = S.personalSI.value.find((x) => x.id === nuevoId)
  const titularSI = S.personalSI.value.find((x) => x.rpe === p.rpe)
  const nombreTitular = titularSI?.corto ?? p.nombre.split(' ').slice(0, 2).join(' ')
  const devolvio = transfiere || !otro ? { rpe: p.rpe, nombre: p.nombre } : trabajadorDe(otro)
  const falta = transfiere && !nuevo ? 'Elija quién lo recibe' : haySupervisores() && !si ? `Elija qué supervisor ${transfiere ? 'registra' : 'recibe'}` : ''

  const guardar = async () => {
    if (guardando) return
    setGuardando(true)
    const r = await intentar(() =>
      registrarRegreso({
        prestamoId: p.id,
        devolvio,
        accesorios,
        bitacora,
        obs,
        fotos,
        recibioSIId: si || undefined,
        fechaHora: hora || undefined,
        transferirA: transfiere && nuevo ? { trabajador: trabajadorDe(nuevo), actividad } : undefined,
      }),
    )
    setGuardando(false)
    if (!r) return
    const corto = (n: string) => n.split(' ').slice(0, 2).join(' ')
    avisar(r.siguiente ? `✓ ${p.equipoCodigo} pasó de ${nombreTitular} a ${nuevo?.corto ?? corto(r.siguiente.nombre)}` : `✓ ${p.equipoCodigo} de regreso en la oficina`)
    onCerrar()
  }

  return (
    <Modal
      titulo={`${transfiere ? 'Transferir' : 'Devolver'} ${p.equipoCodigo}`}
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
          </button>
        </>
      }
    >
      <div class="muted small">
        {p.equipoNombre} · folio {p.folio}
        <br />
        Lo tiene <strong>{nombreTitular}</strong> desde {fmtTs(p.ts)} ({hace(p.ts)}){p.uso && ` · ${p.uso}`}
      </div>
      <div class="row" role="group" aria-label="Qué se hace con el equipo">
        <button class="opcion grow" aria-pressed={!transfiere} onClick={() => setModo('devolucion')}>
          <Icono n="devolucion" /> Devolución a la oficina
        </button>
        <button class="opcion grow" aria-pressed={transfiere} onClick={() => setModo('transferencia')}>
          <Icono n="repetir" /> Pasa a otro técnico
        </button>
      </div>

      {transfiere ? (
        <>
          <div class="stack" style={{ gap: '6px' }}>
            <strong class="small">Transfiere (técnico)</strong>
            <div class="chips">
              <button class="chip chip-si" aria-pressed>
                {nombreTitular}
              </button>
            </div>
          </div>
          <BotonesSI funcion="tecnico" rol="Recibe (técnico)" valor={nuevoId} onCambio={setNuevoId} excluirRpe={p.rpe} />
          <ActividadCampo valor={actividad} onCambio={setActividad} />
        </>
      ) : (
        <div class="stack" style={{ gap: '6px' }}>
          <strong class="small">Devuelve (técnico)</strong>
          <div class="chips" role="group" aria-label="Quién devuelve">
            <button class="chip chip-si" aria-pressed={!otroId} onClick={() => setOtroId('')}>
              {nombreTitular}
            </button>
            {personalSIOrdenado(S.personalSI.value, S.prestamosEquipo.value, 'tecnico')
              .filter((x) => x.rpe !== p.rpe)
              .map((x) => (
                <button key={x.id} class="chip chip-si" aria-pressed={otroId === x.id} onClick={() => setOtroId(x.id)} title={x.nombre}>
                  {x.corto}
                </button>
              ))}
          </div>
        </div>
      )}

      <BotonesSI funcion="supervisor" rol={transfiere ? 'Registra la transferencia (supervisor)' : 'Recibe (supervisor)'} valor={si} onCambio={setSi} />
      <Accesorios lista={p.accesorios} marcados={accesorios} onCambio={setAccesorios} titulo={transfiere ? 'Accesorios que pasan con el equipo' : 'Accesorios que regresan'} />
      {p.bitacora && (
        <label class="check">
          <input type="checkbox" checked={bitacora} onChange={(e) => setBitacora((e.target as HTMLInputElement).checked)} />
          {transfiere ? 'La libreta de bitácora pasa con el equipo' : 'Regresa la libreta de bitácora'}
        </label>
      )}
      <ObsRapidas titulo={transfiere ? 'Condición del equipo en la transferencia' : 'Condición del equipo al recibirlo'} obs={obs} onObs={setObs} fotos={fotos} onFotos={setFotos} />
      {obs.some((o) => o.tipo === 'dano') && !transfiere && <p class="muted small">Con un daño, el equipo quedará «En revisión» y no se podrá prestar hasta que se marque como operativo.</p>}
      <HoraMovimiento etiqueta={transfiere ? 'Hora de la transferencia' : 'Hora de la devolución'} valor={hora} onCambio={setHora} />
      <button class="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => (onCerrar(), onAnular(p))}>
        Se registró por error: anular esta salida
      </button>
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
export function TileEnUso({ p, onClick }: { p: PrestamoEquipo; onClick: () => void }) {
  const eq = S.equipos.value.find((e) => e.id === p.equipoId)
  const vencido = prestamoVencido(p)
  return (
    <button class={`tile prest ${vencido ? 'prestamo-vencido' : ''}`} onClick={onClick}>
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
