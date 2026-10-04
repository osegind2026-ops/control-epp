import { useMemo, useState } from 'preact/hooks'
import type { Entrega } from '../domain/types'
import { solicitantesRecurrentes, type SolicitanteRecurrente } from '../reportes/datos'
import { plural } from '../lib/util'
import * as S from '../state/store'
import { Modal, Vacio } from './comunes'
import { DetalleEntrega } from './DetalleEntrega'

/** Entregas de una persona para un material, con acceso al detalle de cada una. */
function EntregasDe({ r, entregas, onCerrar }: { r: SolicitanteRecurrente; entregas: Entrega[]; onCerrar: () => void }) {
  const [detalle, setDetalle] = useState<Entrega | null>(null)
  const lista = entregas.filter((e) => r.entregaIds.includes(e.id)).sort((a, b) => (a.ts < b.ts ? 1 : -1))
  if (detalle) return <DetalleEntrega e={S.entregas.value.find((x) => x.id === detalle.id) ?? detalle} onCerrar={() => setDetalle(null)} />
  return (
    <Modal titulo={`${r.material} · ${r.nombre}`} onCerrar={onCerrar}>
      <p class="muted small">
        <span class="mono">{r.rpe}</span> · {r.area} · {r.tipo} · {r.veces} entregas, {r.piezas} piezas
      </p>
      <div class="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Folio</th>
              <th class="num">Cant.</th>
              <th>Despachó</th>
              <th>Comentario</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id} class="clic" onClick={() => setDetalle(e)}>
                <td>{e.fecha}</td>
                <td class="mono small">{e.folio}</td>
                <td class="num">{e.lineas.filter((l) => l.materialId === r.materialId).reduce((s, l) => s + l.cantidad, 0)}</td>
                <td class="small">{e.usuarioNombre}</td>
                <td class="small">{e.recurrencia?.materiales.includes(r.materialId) ? e.recurrencia.nota || '—' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="muted small">Toque una entrega para ver todo lo que se entregó ese día.</p>
    </Modal>
  )
}

/**
 * Reportes → solicitantes más recurrentes de cada material en cada área, para dar
 * seguimiento a los motivos. Usa las entregas del periodo y el área elegidos arriba.
 */
export function Recurrentes({ entregas }: { entregas: Entrega[] }) {
  const [minimo, setMinimo] = useState(2)
  const [materialId, setMaterialId] = useState('')
  const [ver, setVer] = useState<SolicitanteRecurrente | null>(null)
  const todos = useMemo(() => solicitantesRecurrentes(entregas, S.materialesPorId.value, S.personal.value, 2), [entregas, S.materiales.value, S.personal.value])
  const materiales = [...new Map(todos.map((r) => [r.materialId, r.material])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const lista = todos.filter((r) => r.veces >= minimo && (!materialId || r.materialId === materialId))
  const areas = [...new Set(lista.map((r) => r.area))]

  return (
    <div class="stack">
      <div class="spread">
        <h2>Solicitantes recurrentes por área y material</h2>
        <span class="muted small">
          {plural(lista.length, 'caso', 'casos')} · {plural(new Set(lista.map((r) => r.rpe)).size, 'persona', 'personas')}
        </span>
      </div>
      <div class="filtros">
        <label class="campo">
          Material
          <select class="input" id="rec-material" value={materialId} onChange={(e) => setMaterialId((e.target as HTMLSelectElement).value)}>
            <option value="">Todos los materiales</option>
            {materiales.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
        <label class="campo">
          Lo recibió al menos
          <select class="input" id="rec-minimo" value={minimo} onChange={(e) => setMinimo(Number((e.target as HTMLSelectElement).value))}>
            <option value={2}>2 veces</option>
            <option value={3}>3 veces</option>
            <option value={4}>4 veces</option>
            <option value={5}>5 veces o más</option>
          </select>
        </label>
      </div>
      {!lista.length ? (
        <Vacio>Nadie recibió el mismo material {minimo} o más veces en este periodo.</Vacio>
      ) : (
        areas.map((area) => {
          const delArea = lista.filter((r) => r.area === area)
          const mats = [...new Set(delArea.map((r) => r.materialId))]
          return (
            <div key={area} class="card stack" style={{ gap: '8px' }}>
              <h3>{area}</h3>
              <div class="tabla-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Solicitante</th>
                      <th class="num">Veces</th>
                      <th class="num">Piezas</th>
                      <th>Última</th>
                      <th>Comentarios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mats.flatMap((m) =>
                      delArea
                        .filter((r) => r.materialId === m)
                        .slice(0, 5)
                        .map((r, i) => (
                          <tr key={m + r.rpe} class={`clic ${i > 0 ? 'subfila' : ''}`} onClick={() => setVer(r)}>
                            <td>{i === 0 ? <strong>{r.material}</strong> : ''}</td>
                            <td>
                              {r.nombre}
                              <div class="muted small">
                                <span class="mono">{r.rpe}</span> · {r.tipo}
                              </div>
                            </td>
                            <td class="num">
                              <span class={`badge ${r.veces >= 4 ? 'bad' : r.veces === 3 ? 'warn' : ''}`}>{r.veces}</span>
                            </td>
                            <td class="num">{r.piezas}</td>
                            <td class="small">{r.ultima}</td>
                            <td class="small">{r.notas.join(' · ') || <span class="muted">—</span>}</td>
                          </tr>
                        )),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}
      <p class="muted small">Se muestran hasta 5 solicitantes por material en cada área; la lista completa está en el Excel (hoja «Solicitantes recurrentes»). Toque un renglón para ver sus entregas.</p>
      {ver && <EntregasDe r={ver} entregas={entregas} onCerrar={() => setVer(null)} />}
    </div>
  )
}
