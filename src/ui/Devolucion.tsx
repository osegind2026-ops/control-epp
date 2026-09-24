import { signal } from '@preact/signals'
import { useState } from 'preact/hooks'
import type { Resguardo, Trabajador } from '../domain/types'
import { devolverResguardo } from '../state/servicios'
import * as S from '../state/store'
import { avisar, FotoMaterial, intentar, Modal, Talla } from './comunes'
import { Icono } from './iconos'
import { BuscadorTrabajador, diasDesde, TarjetaTrabajador } from './Trabajador'

const seleccionado = signal<Trabajador | null>(null)

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
      avisar(elegido?.reingresa ? `✓ Devuelto: regresó al ${S.ubicacionDespacho.value?.nombre}` : '✓ Resguardo cerrado (baja)')
      onCerrar()
    }
  }
  return (
    <Modal
      titulo="Recibir devolución"
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
            {r.folioSI} · entregado {r.fechaEntrega}
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

export function PantallaDevolucion() {
  const t = seleccionado.value
  const [devolver, setDevolver] = useState<Resguardo | null>(null)
  const activos = t ? S.resguardosActivos.value.filter((r) => r.rpe === t.rpe) : []
  const historial = t ? S.resguardos.value.filter((r) => r.rpe === t.rpe && r.estatus === 'CERRADO') : []

  return (
    <div class="stack" style={{ maxWidth: '860px' }}>
      <h1>Devolución de resguardos</h1>
      <div class="card" style={{ padding: '12px' }}>
        {t ? <TarjetaTrabajador t={t} onQuitar={() => (seleccionado.value = null)} /> : <BuscadorTrabajador onElegir={(x) => (seleccionado.value = x)} />}
      </div>

      {t && activos.length === 0 && (
        <div class="aviso info" style={{ padding: '16px' }}>
          <Icono n="ok" />
          <div>
            <strong>Sin equipo bajo resguardo.</strong> {t.nombre} no tiene cascos, fajas, arneses ni caretas pendientes de devolver. Puede emitirse la constancia de no adeudo.
          </div>
        </div>
      )}

      {activos.length > 0 && (
        <div class="stack" style={{ gap: '8px' }}>
          <h2>Pendientes de devolver ({activos.length})</h2>
          {activos.map((r) => (
            <div key={r.id} class="card row" style={{ padding: '10px 12px', flexWrap: 'nowrap' }}>
              <FotoMaterial materialId={r.materialId} mini />
              <div class="grow">
                <strong>{S.materialesPorId.value.get(r.materialId)?.nombre ?? r.materialId}</strong>
                {r.varianteId && (
                  <span class="muted">
                    {' '}
                    · <Talla materialId={r.materialId} varianteId={r.varianteId} />
                  </span>
                )}
                <div class="muted small">
                  {r.folioSI} · {r.fechaEntrega} · hace {diasDesde(r.fechaEntrega)} días · {r.cantidad} pza
                </div>
              </div>
              <button class="btn primary" onClick={() => setDevolver(r)}>
                Devolver
              </button>
            </div>
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
                  <th>Entregado</th>
                  <th>Cerrado</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((r) => (
                  <tr key={r.id}>
                    <td>{S.nombreMaterial(r.materialId, r.varianteId)}</td>
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
