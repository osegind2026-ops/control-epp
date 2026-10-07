import { useState } from 'preact/hooks'
import type { Entrega } from '../domain/types'
import { fechaLocal, horaLocal } from '../lib/util'
import { anularEntrega } from '../state/servicios'
import * as S from '../state/store'
import { avisar, FotoMaterial, intentar, Modal, SelectorMotivo, Talla } from './comunes'
import { Icono } from './iconos'

/** Detalle de una entrega (qué se entregó, quién despachó) con opción de anularla. */
export function DetalleEntrega({ e, onCerrar }: { e: Entrega; onCerrar: () => void }) {
  const [anular, setAnular] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const motivos = new Map(S.motivos.value.map((m) => [m.id, m.texto]))
  const resgs = S.resguardos.value.filter((r) => r.entregaId === e.id)
  const ubi = S.ubicaciones.value.find((u) => u.id === e.ubicacionId)?.nombre

  const confirmarAnulacion = async () => {
    const ok = await intentar(async () => {
      await anularEntrega(e.id, motivo, nota)
      return true
    })
    if (ok) {
      avisar(`Entrega ${e.folio} anulada; las existencias se restauraron.`)
      onCerrar()
    }
  }

  return (
    <Modal
      titulo={`Entrega ${e.folio}`}
      onCerrar={onCerrar}
      ancho
      acciones={
        e.estado === 'registrada' &&
        (anular ? (
          <>
            <button class="btn" onClick={() => setAnular(false)}>
              Cancelar
            </button>
            <button class="btn danger" disabled={!motivo} onClick={confirmarAnulacion}>
              Confirmar anulación
            </button>
          </>
        ) : (
          <button class="btn danger" onClick={() => setAnular(true)}>
            Anular entrega
          </button>
        ))
      }
    >
      <div class="row">
        {e.estado === 'anulada' ? <span class="badge bad">Anulada</span> : <span class="badge ok">Registrada</span>}
        {e.capturada && <span class="badge warn">Captura posterior</span>}
        <span class="muted small">
          {e.fecha} {e.hora} · despachó {e.usuarioNombre} · equipo {e.equipo} · {ubi}
        </span>
      </div>
      <div>
        <strong>{e.nombre}</strong>
        <div class="muted small">
          <span class="mono">{e.rpe}</span> · {e.area}
        </div>
      </div>
      <div class="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th>Talla</th>
              <th class="num">Cant.</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {e.lineas.map((l, i) => (
              <tr key={i}>
                <td>
                  <div class="material-celda">
                    <FotoMaterial materialId={l.materialId} mini />
                    {S.materialesPorId.value.get(l.materialId)?.nombre ?? l.materialId}
                    {l.esResguardo && <span class="badge resg">Resguardo</span>}
                    {l.esPrestamo && <span class="badge prest">Préstamo</span>}
                  </div>
                </td>
                <td>
                  <Talla materialId={l.materialId} varianteId={l.varianteId} />
                </td>
                <td class="num">{l.cantidad}</td>
                <td>{l.motivoId ? motivos.get(l.motivoId) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {resgs.length > 0 && (
        <p class="small">
          Resguardo <span class="mono">{resgs[0].folioSI}</span>: {resgs.map((r) => `${S.nombreMaterial(r.materialId, r.varianteId)} (${r.estatus.toLowerCase()})`).join(', ')}
        </p>
      )}
      {e.prestamo && (
        <p class="small">
          Préstamo · devolver a más tardar el <strong>{e.prestamo.vence}</strong> · supervisor {e.prestamo.supervisor.nombre} (RPE {e.prestamo.supervisor.rpe}, ext. {e.prestamo.supervisor.extension})
        </p>
      )}
      {e.capturada && (
        <p class="small muted">
          Entrega del {e.fecha}, capturada después: el {fechaLocal(new Date(e.capturada))} a las {horaLocal(new Date(e.capturada))} por {e.usuarioNombre}.
        </p>
      )}
      {e.observaciones && <p class="small">Observaciones: {e.observaciones}</p>}
      {e.recurrencia && (
        <div class="aviso warn small">
          <Icono n="repetir" />
          <span>
            <strong>Entrega recurrente:</strong> {e.recurrencia.materiales.map((m) => S.nombreMaterial(m)).join(', ')}.{' '}
            {e.recurrencia.nota ? `Comentario: ${e.recurrencia.nota}` : 'Sin comentario.'}
          </span>
        </div>
      )}
      {e.anulacion && (
        <div class="aviso bad">
          Anulada el {fechaLocal(new Date(e.anulacion.ts))} por {e.anulacion.usuarioNombre}: {motivos.get(e.anulacion.motivoId)}
          {e.anulacion.nota && ` · ${e.anulacion.nota}`}
        </div>
      )}
      {anular && (
        <div class="stack" style={{ gap: '8px' }}>
          <div class="aviso warn">Anular regresa las piezas al almacén y cancela los resguardos de esta entrega. Queda registrado quién la anuló y por qué.</div>
          <SelectorMotivo id="anular-motivo" tipo="anulacion" valor={motivo} onCambio={setMotivo} />
          <input class="input" id="anular-nota" placeholder="Nota (opcional)" value={nota} onInput={(ev) => setNota((ev.target as HTMLInputElement).value)} />
        </div>
      )}
    </Modal>
  )
}

