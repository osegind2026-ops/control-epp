import { signal } from '@preact/signals'
import { useState } from 'preact/hooks'
import type { Resguardo, Trabajador } from '../domain/types'
import { diasEntre, fechaLocal } from '../lib/util'
import { devolverResguardo } from '../state/servicios'
import * as S from '../state/store'
import { avisar, FotoMaterial, intentar, Modal, Talla } from './comunes'
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
  const opciones = S.motivosDe('devolucion')
  const elegido = opciones.find((m) => m.id === motivo)
  const guardar = async () => {
    const ok = await intentar(async () => {
      await devolverResguardo(r.id, motivo, nota)
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
      <input class="input" id="dev-nota" placeholder="Nota (opcional)" value={nota} onInput={(e) => setNota((e.target as HTMLInputElement).value)} />
    </Modal>
  )
}

function TarjetaPendiente({ r, onDevolver, conTrabajador }: { r: Resguardo; onDevolver: () => void; conTrabajador?: boolean }) {
  return (
    <div class={`card row pendiente ${esPrestamo(r) ? 'prest' : ''}`} style={{ padding: '10px 12px', flexWrap: 'nowrap', alignItems: 'start' }}>
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
  const activos = t ? S.resguardosActivos.value.filter((r) => r.rpe === t.rpe) : []
  const historial = t ? S.resguardos.value.filter((r) => r.rpe === t.rpe && r.estatus === 'CERRADO') : []
  const prestamos = S.resguardosActivos.value.filter(esPrestamo).sort((a, b) => (a.vence ?? '').localeCompare(b.vence ?? ''))

  return (
    <div class="stack" style={{ maxWidth: '900px' }}>
      <h1>Devoluciones</h1>
      <div class="card" style={{ padding: '12px' }}>
        {t ? <TarjetaTrabajador t={t} onQuitar={() => (seleccionado.value = null)} /> : <BuscadorTrabajador onElegir={(x) => (seleccionado.value = x)} />}
      </div>

      {!t && (
        <div class="stack" style={{ gap: '8px' }}>
          <h2>Equipo prestado ({prestamos.length})</h2>
          {prestamos.length === 0 ? (
            <p class="muted">No hay arneses ni líneas de vida prestados en este momento.</p>
          ) : (
            prestamos.map((r) => <TarjetaPendiente key={r.id} r={r} conTrabajador onDevolver={() => setDevolver(r)} />)
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
          <h2>Pendientes de devolver ({activos.length})</h2>
          {activos.map((r) => (
            <TarjetaPendiente key={r.id} r={r} onDevolver={() => setDevolver(r)} />
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {devolver && <ModalDevolver r={devolver} onCerrar={() => setDevolver(null)} />}
    </div>
  )
}
