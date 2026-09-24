import { signal } from '@preact/signals'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { MAS_PEDIDOS_BASE } from '../db/semilla'
import { aplicarKit, existencia, masPedidos, nivelStock, resolverRpe, tieneTallas, variantesDe } from '../domain/logica'
import type { Material, Trabajador } from '../domain/types'
import { normalizar } from '../lib/util'
import { deshacerEntrega, registrarEntrega, type LineaTicket } from '../state/servicios'
import * as S from '../state/store'
import { avisar, FotoMaterial, intentar, Modal, Talla } from './comunes'
import { Icono } from './iconos'
import { BuscadorTrabajador, FormTrabajador, TarjetaTrabajador } from './Trabajador'

// El ticket vive fuera del componente para no perderse al cambiar de pantalla.
interface Linea extends LineaTicket {
  clave: string
}
const ticket = signal<Linea[]>([])
const trabajadorSel = signal<Trabajador | null>(null)
const observaciones = signal('')

const claveLinea = (materialId: string, varianteId: string) => `${materialId}|${varianteId}`

function motivoPorDefecto(t: Trabajador | null, materialId: string): string | undefined {
  const m = S.materialesPorId.value.get(materialId)
  if (!m || m.tipo !== 'resguardo') return undefined
  const yaTiene = t && S.resguardosActivos.value.some((r) => r.rpe === t.rpe && r.materialId === materialId)
  return yaTiene ? '' : 'ent_primera'
}

function agregar(materialId: string, varianteId: string, cantidad = 1) {
  const clave = claveLinea(materialId, varianteId)
  const lista = [...ticket.value]
  const i = lista.findIndex((l) => l.clave === clave)
  if (i >= 0) lista[i] = { ...lista[i], cantidad: lista[i].cantidad + cantidad }
  else lista.push({ clave, materialId, varianteId, cantidad, motivoId: motivoPorDefecto(trabajadorSel.value, materialId) })
  ticket.value = lista
}

function cambiarLinea(clave: string, cambios: Partial<Linea>) {
  ticket.value = ticket.value
    .map((l) => {
      if (l.clave !== clave) return l
      const n = { ...l, ...cambios }
      n.clave = claveLinea(n.materialId, n.varianteId)
      return n
    })
    .filter((l) => l.cantidad > 0)
  // Si al cambiar la talla quedaron dos renglones iguales, se juntan
  const unidos = new Map<string, Linea>()
  for (const l of ticket.value) {
    const previo = unidos.get(l.clave)
    unidos.set(l.clave, previo ? { ...previo, cantidad: previo.cantidad + l.cantidad } : l)
  }
  ticket.value = [...unidos.values()]
}

/** Agrega un material usando la talla que el trabajador pidió la última vez, si existe. */
function agregarConTalla(m: Material, pedirTalla: (m: Material) => void) {
  if (!tieneTallas(m)) return agregar(m.id, '')
  const recordada = trabajadorSel.value?.tallas[m.id]
  if (recordada && variantesDe(m).includes(recordada)) return agregar(m.id, recordada)
  pedirTalla(m)
}

function elegirTrabajador(t: Trabajador) {
  trabajadorSel.value = t
  // Recalcular motivos de resguardo según lo que el trabajador ya tiene
  ticket.value = ticket.value.map((l) => ({ ...l, motivoId: l.motivoId || motivoPorDefecto(t, l.materialId) }))
}

// ---------- Selector de talla ----------

function SelectorTalla({ m, onElegir, onCerrar }: { m: Material; onElegir: (v: string) => void; onCerrar: () => void }) {
  const ubi = S.ubicacionDespacho.value?.id
  return (
    <Modal titulo={`${m.nombre} · talla`} onCerrar={onCerrar}>
      <div class="tallas">
        {m.variantes
          .filter((v) => v.activo)
          .map((v) => {
            const disp = existencia(S.existencias.value, m.id, v.id, ubi)
            return (
              <button key={v.id} onClick={() => onElegir(v.id)} class={disp <= 0 ? 'sin' : ''}>
                {v.color && <span class="swatch grande" style={{ background: v.color }} />}
                <b>{v.id}</b>
                {v.etiqueta !== v.id && <span class="small">{v.etiqueta.replace(/^\S+\s·\s/, '')}</span>}
                <span class="mono small">Disp. {disp}</span>
              </button>
            )
          })}
      </div>
    </Modal>
  )
}

// ---------- Renglón del ticket ----------

function Renglon({ l, trabajador }: { l: Linea; trabajador: Trabajador | null }) {
  const m = S.materialesPorId.value.get(l.materialId)
  const [verTallas, setVerTallas] = useState(!l.varianteId)
  if (!m) return null
  const ubi = S.ubicacionDespacho.value?.id
  const disp = l.varianteId || !tieneTallas(m) ? existencia(S.existencias.value, m.id, l.varianteId, ubi) : null
  const otras = S.ubicacionesActivas.value.filter((u) => u.id !== ubi)
  const enOtras = disp !== null ? otras.map((u) => ({ u, n: existencia(S.existencias.value, m.id, l.varianteId, u.id) })).filter((x) => x.n > 0) : []
  const minimo = m.stockMin[l.varianteId] ?? 0
  const previo = trabajador && m.tipo === 'resguardo' ? S.resguardosActivos.value.find((r) => r.rpe === trabajador.rpe && r.materialId === m.id) : undefined

  return (
    <div class="renglon">
      <div class="renglon-top">
        <FotoMaterial materialId={m.id} mini />
        <div class="grow stack" style={{ gap: '2px' }}>
          <strong>{m.nombre}</strong>
          {tieneTallas(m) && (
            <button class={`talla-btn ${l.varianteId ? '' : 'falta'}`} onClick={() => setVerTallas(!verTallas)}>
              {l.varianteId ? (
                <>
                  Talla <Talla materialId={m.id} varianteId={l.varianteId} />
                </>
              ) : (
                'Elegir talla'
              )}
            </button>
          )}
        </div>
        <div class="stepper">
          <button onClick={() => cambiarLinea(l.clave, { cantidad: l.cantidad - 1 })} aria-label="Quitar una pieza">
            <Icono n="menos" />
          </button>
          <span aria-live="polite">{l.cantidad}</span>
          <button onClick={() => cambiarLinea(l.clave, { cantidad: l.cantidad + 1 })} aria-label="Agregar una pieza">
            <Icono n="mas1" />
          </button>
        </div>
      </div>
      {tieneTallas(m) && (verTallas || !l.varianteId) && (
        <div class="row" style={{ gap: '6px' }}>
          {m.variantes
            .filter((v) => v.activo)
            .map((v) => (
              <button
                key={v.id}
                class="chip"
                aria-pressed={v.id === l.varianteId}
                onClick={() => {
                  cambiarLinea(l.clave, { varianteId: v.id })
                  setVerTallas(false)
                }}
              >
                {v.color && <span class="swatch" style={{ background: v.color, marginRight: '4px' }} />}
                {v.id}
              </button>
            ))}
        </div>
      )}
      {m.tipo === 'resguardo' && (
        <label class="motivo-resg">
          <span>Resguardo · motivo</span>
          <select
            id={`motivo-${l.clave}`}
            class={`input ${l.motivoId ? '' : 'falta'}`}
            value={l.motivoId ?? ''}
            onChange={(e) => cambiarLinea(l.clave, { motivoId: (e.target as HTMLSelectElement).value })}
          >
            <option value="">Elija el motivo…</option>
            {S.motivosDe('entrega').map((mo) => (
              <option key={mo.id} value={mo.id}>
                {mo.texto}
              </option>
            ))}
          </select>
        </label>
      )}
      {previo && (
        <div class="aviso warn small">
          <Icono n="alerta" />
          <span>
            Ya tiene {S.nombreMaterial(previo.materialId, previo.varianteId)} en resguardo desde {previo.fechaEntrega} ({previo.folioSI}). Elija el motivo de la reposición.
          </span>
        </div>
      )}
      {disp !== null && l.cantidad > disp && (
        <div class="aviso bad small">
          <Icono n="alerta" />
          <span>
            Solo hay {Math.max(disp, 0)} en {S.ubicacionDespacho.value?.nombre}.
            {enOtras.length > 0 && ` Hay ${enOtras.map((x) => `${x.n} en ${x.u.nombre}`).join(', ')}.`}
          </span>
        </div>
      )}
      {disp !== null && l.cantidad <= disp && disp - l.cantidad <= minimo && (
        <div class="muted small">Quedarán {disp - l.cantidad} (mínimo {minimo})</div>
      )}
    </div>
  )
}

// ---------- Ticket ----------

function Ticket({ onEntregado }: { onEntregado: () => void }) {
  const t = trabajadorSel.value
  const lineas = ticket.value
  const [confirmarFalta, setConfirmarFalta] = useState(false)
  const [nota, setNota] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0)
  const ubi = S.ubicacionDespacho.value?.id
  const faltaTalla = lineas.filter((l) => {
    const m = S.materialesPorId.value.get(l.materialId)
    return m && tieneTallas(m) && !l.varianteId
  }).length
  const faltaMotivo = lineas.filter((l) => S.materialesPorId.value.get(l.materialId)?.tipo === 'resguardo' && !l.motivoId).length
  const sinExistencia = lineas.filter((l) => l.varianteId !== undefined && l.cantidad > existencia(S.existencias.value, l.materialId, l.varianteId, ubi)).length

  useEffect(() => setConfirmarFalta(false), [lineas, t])

  let bloqueo = ''
  if (!t) bloqueo = 'Identifique al trabajador'
  else if (!lineas.length) bloqueo = 'Agregue materiales'
  else if (faltaTalla) bloqueo = `Falta la talla en ${faltaTalla} ${faltaTalla > 1 ? 'renglones' : 'renglón'}`
  else if (faltaMotivo) bloqueo = `Falta el motivo en ${faltaMotivo} resguardo${faltaMotivo > 1 ? 's' : ''}`

  const entregar = async () => {
    if (bloqueo || !t || enviando) return
    if (sinExistencia && !confirmarFalta) return setConfirmarFalta(true)
    setEnviando(true)
    const r = await intentar(() => registrarEntrega(t, lineas, observaciones.value))
    setEnviando(false)
    if (!r) return
    const { entrega, deshacer } = r
    const anteriorTicket = ticket.value
    const anteriorTrabajador = t
    const anteriorNota = observaciones.value
    ticket.value = []
    trabajadorSel.value = null
    observaciones.value = ''
    setNota(false)
    onEntregado()
    avisar(`✓ ${entrega.folio} · ${entrega.nombre.split(' ').slice(0, 2).join(' ')} · ${piezas} pieza${piezas > 1 ? 's' : ''}`, {
      ms: 12000,
      accion: {
        texto: 'Deshacer',
        fn: async () => {
          await intentar(() => deshacerEntrega(deshacer))
          ticket.value = anteriorTicket
          trabajadorSel.value = S.personal.value.get(anteriorTrabajador.rpe) ?? anteriorTrabajador
          observaciones.value = anteriorNota
          avisar('Entrega deshecha')
        },
      },
    })
  }

  return (
    <div class="ticket">
      <div class="ticket-cab spread">
        <h2>Ticket</h2>
        {lineas.length > 0 && (
          <button class="btn ghost sm" onClick={() => (ticket.value = [])}>
            Vaciar
          </button>
        )}
      </div>
      <div class="ticket-lineas">
        {lineas.length === 0 ? (
          <p class="muted small" style={{ padding: '24px 16px', textAlign: 'center' }}>
            Toque un material para agregarlo. Cada toque suma una pieza.
          </p>
        ) : (
          lineas.map((l) => <Renglon key={l.clave} l={l} trabajador={t} />)
        )}
      </div>
      <div class="ticket-pie">
        {nota || observaciones.value ? (
          <input
            class="input"
            id="obs-despacho"
            placeholder="Observaciones (opcional)"
            value={observaciones.value}
            onInput={(e) => (observaciones.value = (e.target as HTMLInputElement).value)}
          />
        ) : (
          <button class="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => setNota(true)}>
            <Icono n="nota" /> Agregar observación
          </button>
        )}
        <div class="spread small">
          <span class="muted">{bloqueo || `${lineas.length} ${lineas.length === 1 ? 'renglón' : 'renglones'}`}</span>
          <strong>
            {piezas} pieza{piezas === 1 ? '' : 's'}
          </strong>
        </div>
        <button class={`btn block entregar ${confirmarFalta ? 'warn' : 'primary'}`} disabled={!!bloqueo || enviando} onClick={entregar}>
          {confirmarFalta ? `Entregar aunque falte existencia (${sinExistencia})` : 'ENTREGAR'}
        </button>
      </div>
    </div>
  )
}

// ---------- Pantalla ----------

export function PantallaDespacho() {
  const [cat, setCat] = useState('top')
  const [buscar, setBuscar] = useState('')
  const [tallaDe, setTallaDe] = useState<Material | null>(null)
  const [ticketAbierto, setTicketAbierto] = useState(false)
  const [editar, setEditar] = useState(false)
  const [, refrescar] = useState(0)
  const t = trabajadorSel.value
  const ubi = S.ubicacionDespacho.value?.id

  // Lector de código de barras USB/Bluetooth: escribe rápido y termina con Enter.
  useEffect(() => {
    let buffer = ''
    let ultimo = 0
    const tecla = (e: KeyboardEvent) => {
      const destino = e.target as HTMLElement
      if (destino.matches('input, textarea, select') || document.querySelector('.velo')) return
      const ahora = Date.now()
      if (ahora - ultimo > 80) buffer = ''
      ultimo = ahora
      if (e.key === 'Enter') {
        if (buffer.length >= 4) {
          const rpe = resolverRpe(buffer, (r) => S.personal.value.has(r))
          const tr = S.personal.value.get(rpe)
          if (tr) elegirTrabajador(tr)
          else avisar(`RPE ${rpe} no está en el padrón`, { tipo: 'bad' })
        }
        buffer = ''
      } else if (e.key.length === 1) buffer += e.key
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  const categorias = S.categorias.value.filter((c) => S.materialesActivos.value.some((m) => m.categoriaId === c.id))
  const top = useMemo(() => {
    const desde = new Date(Date.now() - 60 * 86400000).toISOString()
    const lineas = S.entregas.value.filter((e) => e.ts >= desde && e.estado === 'registrada').flatMap((e) => e.lineas)
    return masPedidos(lineas, MAS_PEDIDOS_BASE, 8)
  }, [S.entregas.value])

  const visibles = useMemo(() => {
    const activos = S.materialesActivos.value
    if (buscar.trim()) {
      const q = normalizar(buscar)
      return activos.filter((m) => normalizar(m.nombre).includes(q))
    }
    if (cat === 'top') return top.map((id) => S.materialesPorId.value.get(id)).filter((m): m is Material => !!m && m.activo)
    return activos.filter((m) => m.categoriaId === cat)
  }, [cat, buscar, top, S.materialesActivos.value])

  const ultimaEntrega = t ? [...S.entregas.value].reverse().find((e) => e.rpe === t.rpe && e.estado === 'registrada') : undefined

  const repetir = () => {
    if (!ultimaEntrega) return
    const consumibles = ultimaEntrega.lineas.filter((l) => !l.esResguardo)
    if (!consumibles.length) return avisar('La última entrega solo tenía equipo de resguardo.')
    for (const l of consumibles) agregar(l.materialId, l.varianteId, l.cantidad)
  }

  const usarKit = (kitId: string) => {
    const kit = S.kits.value.find((k) => k.id === kitId)
    if (!kit || !t) return
    const r = aplicarKit(kit, t, S.resguardosActivos.value.filter((x) => x.rpe === t.rpe), S.materialesPorId.value)
    for (const l of r.lineas) {
      const m = S.materialesPorId.value.get(l.materialId)!
      const recordada = t.tallas[m.id]
      const talla = tieneTallas(m) ? (recordada && variantesDe(m).includes(recordada) ? recordada : '') : ''
      agregar(m.id, talla, l.cantidad)
    }
    if (r.omitidas.length) avisar(`No se agregó ${r.omitidas.map((o) => S.nombreMaterial(o.materialId)).join(', ')}: ya ${r.omitidas.length > 1 ? 'los tiene' : 'lo tiene'} en resguardo.`)
    if (!r.lineas.some((l) => l.materialId.startsWith('g_'))) avisar(`El kit no define guantes para ${t.area}. Agréguelos si aplica.`)
  }

  const conteoEnTicket = (id: string) => ticket.value.filter((l) => l.materialId === id).reduce((s, l) => s + l.cantidad, 0)
  const piezas = ticket.value.reduce((s, l) => s + l.cantidad, 0)

  return (
    <div class="despacho">
      <section class="despacho-main">
        <div class="card" style={{ padding: '12px' }}>
          {t ? (
            <TarjetaTrabajador t={t} onQuitar={() => (trabajadorSel.value = null)} onEditar={() => setEditar(true)} />
          ) : (
            <BuscadorTrabajador onElegir={elegirTrabajador} />
          )}
        </div>

        {t && (
          <div class="rapidos">
            <button class="btn soft" disabled={!ultimaEntrega} onClick={repetir}>
              <Icono n="repetir" /> Repetir última
            </button>
            {S.kits.value
              .filter((k) => k.activo)
              .map((k) => (
                <button key={k.id} class="btn soft" onClick={() => usarKit(k.id)} title={k.descripcion}>
                  <Icono n="kit" /> {k.nombre}
                </button>
              ))}
          </div>
        )}

        <div class="categorias">
          <div class="campo-buscar mini">
            <Icono n="buscar" />
            <input class="input" id="buscar-material" placeholder="Buscar material" value={buscar} onInput={(e) => setBuscar((e.target as HTMLInputElement).value)} />
          </div>
          <button class="cat" aria-pressed={!buscar && cat === 'top'} onClick={() => (setCat('top'), setBuscar(''))}>
            Más pedidos
          </button>
          {categorias.map((c) => (
            <button key={c.id} class="cat" aria-pressed={!buscar && cat === c.id} onClick={() => (setCat(c.id), setBuscar(''))}>
              {c.nombre}
            </button>
          ))}
        </div>

        <div class="mosaico">
          {visibles.map((m) => {
            const vars = variantesDe(m)
            const total = vars.reduce((s, v) => s + existencia(S.existencias.value, m.id, v, ubi), 0)
            const nivel = Math.max(...vars.map((v) => nivelStock(existencia(S.existencias.value, m.id, v, ubi), m.stockMin[v] ?? 0)))
            const n = conteoEnTicket(m.id)
            return (
              <button key={m.id} class={`tile ${m.tipo === 'resguardo' ? 'resg' : ''}`} onClick={() => agregarConTalla(m, setTallaDe)}>
                {n > 0 && <span class="contador">{n}</span>}
                <FotoMaterial materialId={m.id} />
                <span class="tile-nombre">{m.nombre}</span>
                <span class={`tile-stock ${nivel >= 2 ? 'bajo' : nivel === 1 ? 'reorden' : ''}`}>
                  {tieneTallas(m) ? `${vars.length} tallas · ` : ''}
                  {total} disp.
                </span>
                {m.tipo === 'resguardo' && <span class="badge resg">Resguardo</span>}
              </button>
            )
          })}
          {visibles.length === 0 && <p class="muted">No hay materiales que coincidan.</p>}
        </div>
      </section>

      <aside class="despacho-ticket">
        <Ticket onEntregado={() => refrescar((x) => x + 1)} />
      </aside>

      <div class="barra-ticket">
        <button class="btn grow" onClick={() => setTicketAbierto(true)}>
          Ticket · {piezas} pieza{piezas === 1 ? '' : 's'}
        </button>
        <button class="btn primary" disabled={!t || !ticket.value.length} onClick={() => setTicketAbierto(true)}>
          Revisar y entregar
        </button>
      </div>

      {ticketAbierto && (
        <div class="velo" onClick={(e) => e.target === e.currentTarget && setTicketAbierto(false)}>
          <div class="modal ticket-movil" role="dialog" aria-modal="true" aria-label="Ticket">
            <button class="btn ghost sm" style={{ justifySelf: 'end' }} onClick={() => setTicketAbierto(false)}>
              <Icono n="cerrar" /> Seguir agregando
            </button>
            <Ticket onEntregado={() => setTicketAbierto(false)} />
          </div>
        </div>
      )}

      {tallaDe && (
        <SelectorTalla
          m={tallaDe}
          onCerrar={() => setTallaDe(null)}
          onElegir={(v) => {
            agregar(tallaDe.id, v)
            setTallaDe(null)
          }}
        />
      )}

      {editar && t && (
        <FormTrabajador
          inicial={t}
          onCerrar={() => setEditar(false)}
          onListo={(nuevo) => {
            trabajadorSel.value = nuevo
            setEditar(false)
          }}
        />
      )}
    </div>
  )
}
