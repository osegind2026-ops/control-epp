import { useMemo, useState } from 'preact/hooks'
import type { Entrega } from '../domain/types'
import { descargarArchivo, fechaLocal, normalizar, plural } from '../lib/util'
import { csvDetalle, csvLibroMaestro, nombreArchivo } from '../state/respaldo'
import { anularEntrega } from '../state/servicios'
import * as S from '../state/store'
import { avisar, FotoMaterial, intentar, Modal, SelectorMotivo, Talla, Vacio } from './comunes'
import { Icono } from './iconos'

function DetalleEntrega({ e, onCerrar }: { e: Entrega; onCerrar: () => void }) {
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
      {e.observaciones && <p class="small">Observaciones: {e.observaciones}</p>}
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

function compartirHoy() {
  const hoy = fechaLocal()
  const lista = S.entregas.value.filter((e) => e.fecha === hoy && e.estado === 'registrada')
  const piezas = new Map<string, number>()
  for (const e of lista) for (const l of e.lineas) piezas.set(l.materialId, (piezas.get(l.materialId) ?? 0) + l.cantidad)
  const top = [...piezas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  const msg =
    `*CFE Laguna Verde · Reporte de EPP*\n📅 ${hoy} · Equipo ${S.dispositivo.value?.codigo}\n` +
    `👥 Personas atendidas: ${new Set(lista.map((e) => e.rpe)).size}\n📦 Entregas: ${lista.length}\n\n` +
    top.map(([id, n]) => `• ${S.nombreMaterial(id)}: ${n}`).join('\n') +
    `\n\n_Se adjunta el CSV para el libro maestro._`
  descargarArchivo(nombreArchivo('CFE_EPP_LibroMaestro', 'csv'), csvLibroMaestro(lista), 'text/csv;charset=utf-8')
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank')
}

export function PantallaHistorial() {
  const [q, setQ] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [estado, setEstado] = useState<'' | 'registrada' | 'anulada'>('')
  const [detalle, setDetalle] = useState<Entrega | null>(null)

  const lista = useMemo(() => {
    const t = normalizar(q)
    return S.entregas.value
      .filter(
        (e) =>
          (!t || normalizar(`${e.folio} ${e.rpe} ${e.nombre} ${e.area} ${e.usuarioNombre}`).includes(t)) &&
          (!desde || e.fecha >= desde) &&
          (!hasta || e.fecha <= hasta) &&
          (!estado || e.estado === estado),
      )
      .reverse()
  }, [S.entregas.value, q, desde, hasta, estado])

  const exportar = (tipo: 'maestro' | 'detalle') => {
    const orden = [...lista].reverse()
    if (!orden.length) return avisar('No hay entregas con este filtro.')
    if (tipo === 'maestro') descargarArchivo(nombreArchivo('CFE_EPP_LibroMaestro', 'csv'), csvLibroMaestro(orden), 'text/csv;charset=utf-8')
    else descargarArchivo(nombreArchivo('CFE_EPP_Detalle', 'csv'), csvDetalle(orden), 'text/csv;charset=utf-8')
  }

  return (
    <div class="stack">
      <div class="spread">
        <h1>Historial de entregas</h1>
        <div class="row">
          <button class="btn" onClick={() => exportar('maestro')} title="Formato de la macro ImportarTurnoCSV">
            <Icono n="descarga" /> CSV libro maestro
          </button>
          <button class="btn" onClick={() => exportar('detalle')}>
            <Icono n="descarga" /> CSV detalle
          </button>
          <button class="btn soft" onClick={compartirHoy}>
            Enviar resumen de hoy por WhatsApp
          </button>
        </div>
      </div>
      <div class="filtros">
        <div class="campo-buscar mini" style={{ gridColumn: 'span 2' }}>
          <Icono n="buscar" />
          <input class="input" id="h-buscar" placeholder="Folio, RPE, nombre, área o quien despachó" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </div>
        <input class="input" id="h-desde" type="date" aria-label="Desde" value={desde} onInput={(e) => setDesde((e.target as HTMLInputElement).value)} />
        <input class="input" id="h-hasta" type="date" aria-label="Hasta" value={hasta} onInput={(e) => setHasta((e.target as HTMLInputElement).value)} />
        <select class="input" id="h-estado" aria-label="Estado" value={estado} onChange={(e) => setEstado((e.target as HTMLSelectElement).value as typeof estado)}>
          <option value="">Todas</option>
          <option value="registrada">Registradas</option>
          <option value="anulada">Anuladas</option>
        </select>
      </div>
      <p class="muted small">{plural(lista.length, 'entrega', 'entregas')}</p>
      {lista.length === 0 ? (
        <Vacio>No hay entregas con este filtro.</Vacio>
      ) : (
        <div class="tabla-wrap" style={{ maxHeight: '70vh' }}>
          <table>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Trabajador</th>
                <th>Materiales</th>
                <th>Despachó</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, 500).map((e) => (
                <tr key={e.id} class="clic" onClick={() => setDetalle(e)}>
                  <td class="mono" style={{ whiteSpace: 'nowrap' }}>
                    {e.folio}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {e.fecha} {e.hora}
                  </td>
                  <td>
                    {e.nombre}
                    <div class="muted small">
                      {e.rpe} · {e.area}
                    </div>
                  </td>
                  <td class="small">{e.lineas.map((l) => `${S.nombreMaterial(l.materialId, l.varianteId)} (${l.cantidad})`).join(', ')}</td>
                  <td class="small">{e.usuarioNombre}</td>
                  <td>{e.estado === 'anulada' ? <span class="badge bad">Anulada</span> : <span class="badge ok">OK</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detalle && <DetalleEntrega e={S.entregas.value.find((x) => x.id === detalle.id) ?? detalle} onCerrar={() => setDetalle(null)} />}
    </div>
  )
}
