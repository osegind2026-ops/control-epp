import { useMemo, useState } from 'preact/hooks'
import type { Entrega } from '../domain/types'
import { descargarArchivo, entregarArchivo, fechaLocal, normalizar, plural } from '../lib/util'
import { calcularReporte } from '../reportes/datos'
import { csvDetalle, nombreArchivo } from '../state/respaldo'
import * as S from '../state/store'
import { avisar, intentar, Vacio } from './comunes'
import { DetalleEntrega } from './DetalleEntrega'
import { Icono } from './iconos'

const fuentesActuales = () => ({
  entregas: S.entregas.value,
  movimientos: S.movimientos.value,
  resguardos: S.resguardos.value,
  materiales: S.materiales.value,
  motivos: S.motivos.value,
  ubicaciones: S.ubicaciones.value,
  personal: S.personal.value,
})

async function excelDe(desde: string, hasta: string): Promise<void> {
  const { generarExcel } = await import('../reportes/excel')
  const d = calcularReporte(fuentesActuales(), desde, hasta)
  await entregarArchivo(`Entrega de EPP ${d.titulo.replace(/[·/\\:]/g, '-')}.xlsx`, await generarExcel(d, fuentesActuales()))
}

async function compartirHoy() {
  const hoy = fechaLocal()
  const lista = S.entregas.value.filter((e) => e.fecha === hoy && e.estado === 'registrada')
  const piezas = new Map<string, number>()
  for (const e of lista) for (const l of e.lineas) piezas.set(l.materialId, (piezas.get(l.materialId) ?? 0) + l.cantidad)
  const top = [...piezas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  const msg =
    `*CFE Laguna Verde · Reporte de EPP*\n📅 ${hoy} · Equipo ${S.dispositivo.value?.codigo}\n` +
    `👥 Personas atendidas: ${new Set(lista.map((e) => e.rpe)).size}\n📦 Entregas: ${lista.length}\n\n` +
    top.map(([id, n]) => `• ${S.nombreMaterial(id)}: ${n}`).join('\n') +
    `\n\n_Se adjunta el Excel con el detalle del día._`
  await intentar(() => excelDe(hoy, hoy))
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

  const exportar = async (tipo: 'excel' | 'detalle') => {
    const orden = [...lista].reverse()
    if (!orden.length) return avisar('No hay entregas con este filtro.')
    if (tipo === 'excel') await intentar(() => excelDe(desde || orden[0].fecha, hasta || orden[orden.length - 1].fecha))
    else descargarArchivo(nombreArchivo('CFE_EPP_Detalle', 'csv'), csvDetalle(orden), 'text/csv;charset=utf-8')
  }

  return (
    <div class="stack">
      <div class="spread">
        <h1>Historial de entregas</h1>
        <div class="row">
          <button class="btn" onClick={() => exportar('excel')}>
            <Icono n="excel" /> Excel
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
