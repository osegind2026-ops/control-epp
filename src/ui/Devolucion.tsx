import { signal } from '@preact/signals'
import { useState } from 'preact/hooks'
import type { Resguardo, Trabajador } from '../domain/types'
import { diasEntre, fechaLocal, plural } from '../lib/util'
import { devolverResguardo, devolverResguardos } from '../state/servicios'
import * as S from '../state/store'
import { avisar, FotoMaterial, intentar, Modal, Talla } from './comunes'
import { CapturaFotos, FotosGuardadas } from './Evidencia'
import { Icono } from './iconos'
import { BuscadorTrabajador, diasDesde, TarjetaTrabajador } from './Trabajador'

const seleccionado = signal<Trabajador | null>(null)

const esPrestamo = (r: Resguardo) => r.tipo === 'prestamo'

function EstadoVence({ r }: { r: Resguardo }) {
  if (!esPrestamo(r) || !r.vence) return null
  const dias = diasEntre(fechaLocal(), r.vence)
  if (dias < 0) return <span class="badge bad">Vencido hace {-dias} día{dias === -1 ? '' : 's'}</span>
  if (dias === 0) return <span class="badge warn">Vence hoy</span>
  return <span class="badge">Vence {r.vence}</span>
}

function Supervisor({ r }: { r: Resguardo }) {
  if (!r.supervisor) return esPrestamo(r) ? <div class="small" style={{ color: 'var(--bad)' }}>Sin datos del supervisor (préstamo anterior al cambio)</div> : null
  return (
    <div class="small">
      Supervisor: <strong>{r.supervisor.nombre}</strong> · RPE <span class="mono">{r.supervisor.rpe}</span> · Ext. <strong class="mono">{r.supervisor.extension}</strong>
    </div>
  )
}

function ModalDevolver({ r, onCerrar }: { r: Resguardo; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const [fotos, setFotos] = useState<string[]>([])
  const opciones = S.motivosDe('devolucion')
  const elegido = opciones.find((m) => m.id === motivo)
  const guardar = async () => {
    const ok = await intentar(async () => {
      await devolverResguardo(r.id, motivo, nota, fotos)
      return true
    })
    if (ok) {
      avisar(elegido?.reingresa ? `✓ Devuelto: regresó al ${S.ubicacionDespacho.value?.nombre}` : '✓ Cerrado (baja)')
      onCerrar()
    }
  }
  return (
    <Modal
      titulo={esPrestamo(r) ? 'Recibir equipo prestado' : 'Recibir devolución'}
      onCerrar={onCerrar}
      acciones={
        <>
          <button class="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button class="btn primary" disabled={!motivo} onClick={guardar}>
            Registrar devolución
          </button>
        </>
      }
    >
      <div class="row">
        <FotoMaterial materialId={r.materialId} mini />
        <div>
          <strong>{S.nombreMaterial(r.materialId, r.varianteId)}</strong>
          <div class="muted small">
            {r.folioSI} · {r.nombre} · entregado {r.fechaEntrega}
          </div>
        </div>
      </div>
      <div class="stack" style={{ gap: '6px' }} role="radiogroup" aria-label="Estado del equipo">
        {opciones.map((m) => (
          <button key={m.id} class="opcion" aria-pressed={motivo === m.id} onClick={() => setMotivo(m.id)}>
            <span class="grow">{m.texto}</span>
            <span class={`badge ${m.reingresa ? 'ok' : 'bad'}`}>{m.reingresa ? 'Reingresa' : 'Baja'}</span>
          </button>
        ))}
      </div>
      <input class="input" id="dev-nota" placeholder={elegido && !elegido.reingresa ? 'Describa el daño o el motivo de la baja' : 'Nota (opcional)'} value={nota} onInput={(e) => setNota((e.target as HTMLInputElement).value)} />
      <CapturaFotos fotos={fotos} onCambio={setFotos} sugerida={!!elegido && !elegido.reingresa} />
    </Modal>
  )
}

/**
 * Recibe varios equipos juntos, como el despacho: se elige un estado para todos y cada uno puede
 * cambiarlo y llevar su nota y sus fotos; si no se anota nada, queda con el estado común.
 */
function ModalDevolverVarios({ lista, onQuitar, onCerrar, onListo }: { lista: Resguardo[]; onQuitar: (id: string) => void; onCerrar: () => void; onListo: () => void }) {
  const opciones = S.motivosDe('devolucion')
  const [comun, setComun] = useState(opciones.find((m) => m.reingresa)?.id ?? '')
  const [propio, setPropio] = useState<Record<string, { motivo?: string; nota?: string; fotos?: string[] }>>({})
  const [abierto, setAbierto] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const de = (id: string) => ({ motivo: propio[id]?.motivo ?? comun, nota: propio[id]?.nota ?? '', fotos: propio[id]?.fotos ?? [] })
  const cambiar = (id: string, c: { motivo?: string; nota?: string; fotos?: string[] }) => setPropio((m) => ({ ...m, [id]: { ...m[id], ...c } }))
  const sinEstado = lista.filter((r) => !de(r.id).motivo).length
  const personas = new Set(lista.map((r) => r.rpe)).size
  const falta = !lista.length ? 'Elija al menos un equipo' : sinEstado ? `Falta el estado de ${plural(sinEstado, 'equipo', 'equipos')}` : ''

  const guardar = async () => {
    if (guardando || falta) return
    setGuardando(true)
    const ok = await intentar(async () => {
      await devolverResguardos(lista.map((r) => ({ resguardoId: r.id, motivoId: de(r.id).motivo, nota: de(r.id).nota, fotos: de(r.id).fotos })))
      return true
    })
    setGuardando(false)
    if (!ok) return
    const bajas = lista.filter((r) => !opciones.find((m) => m.id === de(r.id).motivo)?.reingresa).length
    avisar(`✓ ${plural(lista.length, 'equipo recibido', 'equipos recibidos')}${bajas ? ` · ${bajas} de baja` : ''}`, { ms: 6000 })
    onListo()
    onCerrar()
  }

  return (
    <Modal
      titulo={`Recibir ${plural(lista.length, 'equipo', 'equipos')}${personas > 1 ? ` de ${personas} personas` : ''}`}
      onCerrar={onCerrar}
      ancho
      acciones={
        <>
          <span class="muted small grow">{falta}</span>
          <button class="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button class="btn primary" disabled={!!falta || guardando} onClick={guardar}>
            Registrar {lista.length > 1 ? `${lista.length} devoluciones` : 'devolución'}
          </button>
        </>
      }
    >
      <div class="stack" style={{ gap: '6px' }}>
        <strong class="small">Estado para todos (cada uno se puede cambiar abajo)</strong>
        <div class="chips" role="radiogroup" aria-label="Estado para todos">
          {opciones.map((m) => (
            <button key={m.id} class="chip" aria-pressed={comun === m.id} onClick={() => setComun(m.id)}>
              {m.texto} · {m.reingresa ? 'reingresa' : 'baja'}
            </button>
          ))}
        </div>
      </div>
      <div class="stack" style={{ gap: '6px' }}>
        <strong class="small">Equipos ({lista.length}) · toque uno para cambiar su estado o anotar algo</strong>
        {lista.map((r) => {
          const d = de(r.id)
          const m = opciones.find((x) => x.id === d.motivo)
          const esteAbierto = abierto === r.id
          const resumen = [m ? `${m.texto}${m.reingresa ? '' : ' (baja)'}` : 'Falta el estado', d.nota.trim(), d.fotos.length ? plural(d.fotos.length, 'foto', 'fotos') : ''].filter(Boolean).join(' · ')
          return (
            <div key={r.id} class={`renglon-eq ${esteAbierto ? 'abierto' : ''}`}>
              <div class="renglon-eq-cab">
                <FotoMaterial materialId={r.materialId} mini />
                <button class="renglon-eq-titulo" onClick={() => setAbierto(esteAbierto ? null : r.id)} aria-expanded={esteAbierto}>
                  <span>
                    <strong>{S.nombreMaterial(r.materialId, r.varianteId)}</strong>
                  </span>
                  <span class="muted small">
                    {r.folioSI} · {r.nombre} · entregado {r.fechaEntrega}
                  </span>
                  <span class={`small renglon-eq-resumen ${!m ? 'bad' : m.reingresa ? '' : 'bad'}`}>{resumen}</span>
                </button>
                <button class="btn ghost sm" onClick={() => setAbierto(esteAbierto ? null : r.id)}>
                  {esteAbierto ? 'Listo' : 'Anotar'}
                </button>
                <button class="btn ghost sm" onClick={() => onQuitar(r.id)} aria-label="Quitar de la lista" title="Quitar de la lista">
                  <Icono n="cerrar" />
                </button>
              </div>
              {esteAbierto && (
                <div class="renglon-eq-cuerpo stack">
                  <div class="stack" style={{ gap: '6px' }} role="radiogroup" aria-label="Estado del equipo">
                    {opciones.map((o) => (
                      <button key={o.id} class="opcion" aria-pressed={d.motivo === o.id} onClick={() => cambiar(r.id, { motivo: o.id })}>
                        <span class="grow">{o.texto}</span>
                        <span class={`badge ${o.reingresa ? 'ok' : 'bad'}`}>{o.reingresa ? 'Reingresa' : 'Baja'}</span>
                      </button>
                    ))}
                  </div>
                  <input
                    class="input"
                    id={`dev-nota-${r.id}`}
                    placeholder={m && !m.reingresa ? 'Describa el daño o el motivo de la baja' : 'Nota (opcional)'}
                    value={d.nota}
                    onInput={(e) => cambiar(r.id, { nota: (e.target as HTMLInputElement).value })}
                  />
                  <CapturaFotos fotos={d.fotos} onCambio={(fotos) => cambiar(r.id, { fotos })} sugerida={!!m && !m.reingresa} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

function TarjetaPendiente({ r, onDevolver, conTrabajador, elegido, onElegir }: { r: Resguardo; onDevolver: () => void; conTrabajador?: boolean; elegido: boolean; onElegir: () => void }) {
  return (
    <div class={`card row pendiente ${esPrestamo(r) ? 'prest' : ''}`} style={{ padding: '10px 12px', flexWrap: 'nowrap', alignItems: 'start' }}>
      <input
        type="checkbox"
        class="devolver-check"
        checked={elegido}
        onChange={onElegir}
        aria-label={`Agregar ${S.nombreMaterial(r.materialId, r.varianteId)} de ${r.nombre} a la lista para recibir juntos`}
        title="Marcar para recibir varios juntos"
      />
      <FotoMaterial materialId={r.materialId} mini />
      <div class="grow stack" style={{ gap: '4px' }}>
        <div class="row" style={{ gap: '6px' }}>
          <strong>{S.materialesPorId.value.get(r.materialId)?.nombre ?? r.materialId}</strong>
          {r.varianteId && (
            <span class="muted">
              · <Talla materialId={r.materialId} varianteId={r.varianteId} />
            </span>
          )}
          {esPrestamo(r) ? <span class="badge prest">Préstamo</span> : <span class="badge resg">Resguardo</span>}
          <EstadoVence r={r} />
        </div>
        {conTrabajador && (
          <div class="small">
            <strong>{r.nombre}</strong> · <span class="mono">{r.rpe}</span> · {r.area}
          </div>
        )}
        <div class="muted small">
          {r.folioSI} · entregado {r.fechaEntrega} (hace {diasDesde(r.fechaEntrega)} días) · {r.cantidad} pza
        </div>
        <Supervisor r={r} />
      </div>
      <button class="btn primary" onClick={onDevolver}>
        Devolver
      </button>
    </div>
  )
}

export function PantallaDevolucion() {
  const t = seleccionado.value
  const [devolver, setDevolver] = useState<Resguardo | null>(null)
  const [marcados, setMarcados] = useState<string[]>([])
  const [varios, setVarios] = useState(false)
  const activos = t ? S.resguardosActivos.value.filter((r) => r.rpe === t.rpe) : []
  const historial = t ? S.resguardos.value.filter((r) => r.rpe === t.rpe && r.estatus === 'CERRADO') : []
  const prestamos = S.resguardosActivos.value.filter(esPrestamo).sort((a, b) => (a.vence ?? '').localeCompare(b.vence ?? ''))
  // Solo cuenta lo que se ve en pantalla y sigue activo
  const visibles = t ? activos : prestamos
  const elegidos = marcados.map((id) => visibles.find((r) => r.id === id)).filter((r): r is Resguardo => !!r)
  const ids = elegidos.map((r) => r.id)
  const alternar = (id: string) => setMarcados((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l.filter((x) => visibles.some((r) => r.id === x)), id]))
  const todos = visibles.length > 1 && (
    <button class="btn ghost sm" onClick={() => setMarcados(ids.length === visibles.length ? [] : visibles.map((r) => r.id))}>
      {ids.length === visibles.length ? 'Quitar todos' : 'Marcar todos'}
    </button>
  )

  return (
    <div class="stack" style={{ maxWidth: '900px' }}>
      <h1>Devoluciones</h1>
      <div class="card" style={{ padding: '12px' }}>
        {t ? <TarjetaTrabajador t={t} onQuitar={() => (seleccionado.value = null)} /> : <BuscadorTrabajador onElegir={(x) => (seleccionado.value = x)} />}
      </div>

      {!t && (
        <div class="stack" style={{ gap: '8px' }}>
          <div class="spread">
            <h2>Equipo prestado ({prestamos.length})</h2>
            {todos}
          </div>
          {prestamos.length === 0 ? (
            <p class="muted">No hay arneses ni líneas de vida prestados en este momento.</p>
          ) : (
            prestamos.map((r) => <TarjetaPendiente key={r.id} r={r} conTrabajador elegido={ids.includes(r.id)} onElegir={() => alternar(r.id)} onDevolver={() => setDevolver(r)} />)
          )}
        </div>
      )}

      {t && activos.length === 0 && (
        <div class="aviso info" style={{ padding: '16px' }}>
          <Icono n="ok" />
          <div>
            <strong>Sin equipo pendiente.</strong> {t.nombre} no tiene resguardos ni préstamos por devolver. Puede emitirse la constancia de no adeudo.
          </div>
        </div>
      )}

      {activos.length > 0 && (
        <div class="stack" style={{ gap: '8px' }}>
          <div class="spread">
            <h2>Pendientes de devolver ({activos.length})</h2>
            {todos}
          </div>
          {activos.map((r) => (
            <TarjetaPendiente key={r.id} r={r} elegido={ids.includes(r.id)} onElegir={() => alternar(r.id)} onDevolver={() => setDevolver(r)} />
          ))}
        </div>
      )}

      {historial.length > 0 && (
        <details class="card">
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Devoluciones anteriores ({historial.length})</summary>
          <div class="tabla-wrap" style={{ marginTop: '10px' }}>
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Tipo</th>
                  <th>Entregado</th>
                  <th>Cerrado</th>
                  <th>Motivo</th>
                  <th>Fotos</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((r) => (
                  <tr key={r.id}>
                    <td>{S.nombreMaterial(r.materialId, r.varianteId)}</td>
                    <td>{esPrestamo(r) ? 'Préstamo' : 'Resguardo'}</td>
                    <td>{r.fechaEntrega}</td>
                    <td>{r.cierre?.fecha}</td>
                    <td>{r.cierre?.motivo}</td>
                    <td>
                      <FotosGuardadas ids={r.cierre?.fotos} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {ids.length > 0 && (
        <div class="canasta-barra" role="region" aria-label="Equipos marcados">
          <span class="grow">
            <strong>{plural(ids.length, 'equipo marcado', 'equipos marcados')}</strong>
            <span class="muted small canasta-nombres"> · {elegidos.map((r) => S.materialesPorId.value.get(r.materialId)?.nombre ?? r.materialId).join(', ')}</span>
          </span>
          <button class="btn ghost sm" onClick={() => setMarcados([])}>
            Quitar todos
          </button>
          <button class="btn primary" onClick={() => setVarios(true)}>
            Recibir {ids.length > 1 ? `los ${ids.length}` : 'el marcado'} →
          </button>
        </div>
      )}

      {devolver && <ModalDevolver r={devolver} onCerrar={() => setDevolver(null)} />}
      {varios && elegidos.length > 0 && <ModalDevolverVarios lista={elegidos} onQuitar={(id) => setMarcados((l) => l.filter((x) => x !== id))} onCerrar={() => setVarios(false)} onListo={() => setMarcados([])} />}
    </div>
  )
}
