// Tendencias: consumo de EPP a partir de las entregas, proyección de existencias y
// documento en PDF y Word con gráficas.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  AYUDA_ESCENARIO, NOMBRE_ESCENARIO, coberturaTexto, cuandoTexto, miles, periodoDe, porUnidad, unidadTexto,
  type AnalisisMaterial, type ComparacionPlan, type Escenario, type FilaConsumo, type PlanMaterial, type UnidadPeriodo,
} from '../domain/tendencias'
import { fechaLocal } from '../lib/util'
import { cargarPlantilla, type Plantilla } from '../reportes/plantilla'
import { ESTILOS, PALETAS, type EstiloGrafica, type PaletaGrafica } from '../reportes/graficasTendencia'
import { imagenComparativa, imagenesMaterial, imagenesPlan, type ImagenesMaterial, type ImagenesPlan } from '../reportes/imagenesTendencia'
import { contenidoMaterial, contenidoPlan, fechaDocumento, filasComparativas, nombreArchivo, rangoTexto } from '../reportes/tendenciaDoc'
import { hojaComparativa, hojasMaterial, hojasPlan } from '../reportes/ReporteTendencia'
import {
  analizar, compararPlanes, ENCABEZADO_POR_DEFECTO, guardarTendencias, leerTendencias, NOTA_POR_DEFECTO, nuevaConfig, PIE_POR_DEFECTO, tituloDe,
  ultimosPeriodos, unidadSugerida, type ConfigTendencia, type MaterialTendencia,
} from '../state/tendencias'
import * as S from '../state/store'
import { avisar, intentar } from './comunes'
import { VistaImpresionPortal } from './Formatos'
import { Icono } from './iconos'

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`

// ---------------- Configuración ----------------
function EditorMateriales({ c, cambiar }: { c: ConfigTendencia; cambiar: (p: Partial<ConfigTendencia>) => void }) {
  const [elegido, setElegido] = useState('')
  const usados = new Set(c.materiales.map((m) => m.materialId))
  const disponibles = S.materialesActivos.value.filter((m) => !usados.has(m.id) && m.tipo !== 'prestamo')
  const porCat = S.categorias.value
    .map((cat) => ({ cat, mats: disponibles.filter((m) => m.categoriaId === cat.id) }))
    .filter((x) => x.mats.length)
  const sinCat = disponibles.filter((m) => !S.categorias.value.some((cat) => cat.id === m.categoriaId))
  const ubis = S.ubicacionesActivas.value.map((u) => u.id)
  const enApp = (id: string) => S.movimientos.value.reduce((s, mv) => (mv.materialId === id && ubis.includes(mv.ubicacionId) ? s + mv.cantidad : s), 0)
  const cambiarMat = (id: string, p: Partial<MaterialTendencia>) => cambiar({ materiales: c.materiales.map((m) => (m.materialId === id ? { ...m, ...p } : m)) })
  const agregar = (id: string) => {
    const m = S.materialesPorId.value.get(id)
    if (!m) return
    cambiar({ materiales: [...c.materiales, { materialId: id, pedido: 0, existenciaManual: null, unidad: unidadSugerida(m.nombre) }] })
    setElegido('')
  }
  return (
    <div class="stack" style={{ gap: '10px' }}>
      <div class="filtros" style={{ alignItems: 'flex-end' }}>
        <label class="campo grow">
          Agregar material al análisis
          <select class="input" id="tend-material" value={elegido} onChange={(e) => agregar((e.target as HTMLSelectElement).value)}>
            <option value="">Elija un material…</option>
            {porCat.map(({ cat, mats }) => (
              <optgroup key={cat.id} label={cat.nombre}>
                {mats.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </optgroup>
            ))}
            {sinCat.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!c.materiales.length && <p class="muted small">Agregue uno o más materiales. Con varios, el documento incluye una hoja comparativa.</p>}
      {c.materiales.map((cm) => {
        const m = S.materialesPorId.value.get(cm.materialId)
        const app = enApp(cm.materialId)
        return (
          <div key={cm.materialId} class="tend-mat">
            <div class="spread">
              <strong>{m?.nombre ?? 'Material eliminado'}</strong>
              <button class="btn ghost sm" aria-label={`Quitar ${m?.nombre ?? ''}`} onClick={() => cambiar({ materiales: c.materiales.filter((x) => x.materialId !== cm.materialId) })}>
                <Icono n="cerrar" /> Quitar
              </button>
            </div>
            <div class="filtros" style={{ alignItems: 'flex-end' }}>
              <label class="campo">
                Se cuenta en
                <input class="input" value={cm.unidad} onInput={(e) => cambiarMat(cm.materialId, { unidad: (e.target as HTMLInputElement).value || 'piezas' })} placeholder="pares, piezas…" />
              </label>
              <label class="campo">
                Almacén {cm.existenciaManual == null ? `(según la app: ${miles(app)})` : '(capturado a mano)'}
                <input
                  class="input"
                  type="number"
                  min={0}
                  value={cm.existenciaManual ?? app}
                  onInput={(e) => {
                    const v = (e.target as HTMLInputElement).value
                    cambiarMat(cm.materialId, { existenciaManual: v === '' || Number(v) === app ? null : Math.max(0, Number(v)) })
                  }}
                />
              </label>
              <label class="campo">
                Pedido por llegar
                <input class="input" type="number" min={0} value={cm.pedido} onInput={(e) => cambiarMat(cm.materialId, { pedido: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) })} />
              </label>
              {cm.existenciaManual != null && (
                <button class="btn sm" onClick={() => cambiarMat(cm.materialId, { existenciaManual: null })}>
                  Usar la de la app
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Configuracion({ c, cambiar }: { c: ConfigTendencia; cambiar: (p: Partial<ConfigTendencia>) => void }) {
  const [mas, setMas] = useState(false)
  const rapidos: [string, number, UnidadPeriodo][] = [
    ['Últimas 4 semanas', 4, 'semana'],
    ['8 semanas', 8, 'semana'],
    ['12 semanas', 12, 'semana'],
    ['Últimos 3 meses', 3, 'mes'],
    ['6 meses', 6, 'mes'],
    ['12 meses', 12, 'mes'],
  ]
  return (
    <div class="card stack" style={{ padding: '16px', gap: '14px' }}>
      <div class="filtros" style={{ alignItems: 'flex-end' }}>
        <label class="campo grow">
          Nombre del análisis (solo para encontrarlo aquí)
          <input class="input" id="tend-nombre" value={c.nombre} onInput={(e) => cambiar({ nombre: (e.target as HTMLInputElement).value })} />
        </label>
        <label class="campo grow">
          Título del documento
          <input class="input" id="tend-titulo" value={c.titulo} placeholder={tituloDe({ ...c, titulo: '' })} onInput={(e) => cambiar({ titulo: (e.target as HTMLInputElement).value })} />
        </label>
      </div>

      <h3 style={{ margin: 0 }}>Materiales</h3>
      <EditorMateriales c={c} cambiar={cambiar} />

      <h3 style={{ margin: 0 }}>Periodo a analizar</h3>
      <div class="chips">
        {rapidos.map(([t, n, u]) => (
          <button key={t} class="chip" onClick={() => cambiar({ ...ultimosPeriodos(n, u), unidad: u })}>
            {t}
          </button>
        ))}
      </div>
      <div class="filtros" style={{ alignItems: 'flex-end' }}>
        <label class="campo">
          Desde
          <input class="input" id="tend-desde" type="date" value={c.desde} onInput={(e) => cambiar({ desde: (e.target as HTMLInputElement).value })} />
        </label>
        <label class="campo">
          Hasta
          <input class="input" id="tend-hasta" type="date" value={c.hasta} onInput={(e) => cambiar({ hasta: (e.target as HTMLInputElement).value })} />
        </label>
        <label class="campo">
          Agrupar por
          <select class="input" id="tend-unidad" value={c.unidad} onChange={(e) => cambiar({ unidad: (e.target as HTMLSelectElement).value as UnidadPeriodo })}>
            <option value="semana">Semana (lunes a domingo)</option>
            <option value="mes">Mes</option>
          </select>
        </label>
        <label class="campo">
          Llegar hasta (opcional)
          <input class="input" id="tend-objetivo" type="date" value={c.fechaObjetivo} onInput={(e) => cambiar({ fechaObjetivo: (e.target as HTMLInputElement).value })} />
        </label>
        {c.fechaObjetivo && (
          <button class="btn sm" onClick={() => cambiar({ fechaObjetivo: '' })}>
            Quitar fecha
          </button>
        )}
      </div>
      <p class="muted small" style={{ margin: 0 }}>
        Se toman {c.unidad === 'semana' ? 'semanas completas' : 'meses completos'}: si la fecha cae a media {c.unidad === 'semana' ? 'semana' : 'mes'}, se cuenta {c.unidad === 'semana' ? 'toda la semana' : 'todo el mes'}.
        Con «Llegar hasta» se calcula cuánto material hace falta para esa fecha.
      </p>

      <h3 style={{ margin: 0 }}>Gráficas</h3>
      <div class="filtros" style={{ alignItems: 'flex-end' }}>
        <label class="campo">
          Tipo de gráfica
          <select class="input" id="tend-estilo" value={c.estilo} onChange={(e) => cambiar({ estilo: (e.target as HTMLSelectElement).value as EstiloGrafica })}>
            {ESTILOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label class="campo">
          Colores
          <select class="input" id="tend-paleta" value={c.paleta} onChange={(e) => cambiar({ paleta: (e.target as HTMLSelectElement).value as PaletaGrafica })}>
            {PALETAS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button class="btn ghost sm" style={{ justifySelf: 'start' }} aria-expanded={mas} onClick={() => setMas(!mas)}>
        {mas ? '▾' : '▸'} Textos del documento
      </button>
      {mas && (
        <div class="stack" style={{ gap: '10px' }}>
          <label class="campo">
            Periodo o etapa (opcional): «durante el periodo de …»
            <input class="input" value={c.contexto} placeholder="pre recarga, recarga 24RU1, operación normal…" onInput={(e) => cambiar({ contexto: (e.target as HTMLInputElement).value })} />
          </label>
          <div class="filtros">
            <label class="campo grow">
              Lugar
              <input class="input" value={c.lugar} onInput={(e) => cambiar({ lugar: (e.target as HTMLInputElement).value })} />
            </label>
            <label class="campo">
              Fecha del documento (vacío = hoy)
              <input class="input" type="date" value={c.fechaDocumento} onInput={(e) => cambiar({ fechaDocumento: (e.target as HTMLInputElement).value })} />
            </label>
          </div>
          <label class="campo">
            Nota al pie de la tabla
            <textarea class="input" rows={4} value={c.nota} onInput={(e) => cambiar({ nota: (e.target as HTMLTextAreaElement).value })} />
          </label>
          <label class="campo">
            Encabezado (una línea por renglón)
            <textarea class="input" rows={4} value={c.encabezado.join('\n')} onInput={(e) => cambiar({ encabezado: (e.target as HTMLTextAreaElement).value.split('\n') })} />
          </label>
          <label class="campo">
            Pie de página
            <input class="input" value={c.pie} onInput={(e) => cambiar({ pie: (e.target as HTMLInputElement).value })} />
          </label>
          <button
            class="btn sm"
            style={{ justifySelf: 'start' }}
            onClick={() => cambiar({ nota: NOTA_POR_DEFECTO, encabezado: [...ENCABEZADO_POR_DEFECTO], pie: PIE_POR_DEFECTO, lugar: 'Laguna Verde, Ver.' })}
          >
            Restaurar textos originales
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------- Resultados en pantalla ----------------
function Historico({ a, unidad }: { a: AnalisisMaterial; unidad: string }) {
  const [abierto, setAbierto] = useState<FilaConsumo | null>(null)
  return (
    <div class="stack" style={{ gap: '8px' }}>
      <div class="tabla-wrap">
        <table class="tabla-tend">
          <thead>
            <tr>
              <th>Periodo</th>
              {a.historico.map((f) => (
                <th key={f.periodo.clave}>
                  <button class="tend-per" aria-pressed={abierto?.periodo.clave === f.periodo.clave} title="Ver las entregas de este periodo" onClick={() => setAbierto(abierto?.periodo.clave === f.periodo.clave ? null : f)}>
                    {f.periodo.etiqueta}
                  </button>
                </th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>{unidad[0].toUpperCase() + unidad.slice(1)} entregados</th>
              {a.historico.map((f) => (
                <td key={f.periodo.clave}>{miles(f.cantidad)}</td>
              ))}
              <td>
                <b>{miles(a.total)}</b>
              </td>
            </tr>
            <tr>
              <th>Solicitudes atendidas</th>
              {a.historico.map((f) => (
                <td key={f.periodo.clave}>{miles(f.solicitudes)}</td>
              ))}
              <td>
                <b>{miles(a.solicitudes)}</b>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="muted small" style={{ margin: 0 }}>
        Toque un periodo para ver las entregas que se sumaron y comprobarlas en Historial.
      </p>
      {abierto && (
        <div class="tabla-wrap" style={{ maxHeight: '320px', overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Trabajador</th>
                <th>{unidad}</th>
              </tr>
            </thead>
            <tbody>
              {abierto.folios.map((f) => (
                <tr key={f.folio}>
                  <td>{f.folio}</td>
                  <td>{fechaCorta(f.fecha)}</td>
                  <td>{f.nombre}</td>
                  <td>{miles(f.cantidad)}</td>
                </tr>
              ))}
              {!abierto.folios.length && (
                <tr>
                  <td colSpan={4} class="muted">
                    Sin entregas de este material en {abierto.periodo.largo}.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={3}>
                  {abierto.periodo.largo} ({fechaCorta(abierto.periodo.inicio)} al {fechaCorta(abierto.periodo.fin)}): {abierto.conMaterial} de {abierto.solicitudes} entregas
                </th>
                <th>{miles(abierto.cantidad)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function PlanVsReal({ a, unidad, cp, img, plan, onPlan }: { a: AnalisisMaterial; unidad: string; cp?: ComparacionPlan; img?: ImagenesPlan; plan?: PlanMaterial | null; onPlan: (p: PlanMaterial | null) => void }) {
  const hoy = fechaLocal()
  if (!plan) {
    return (
      <div class="tend-plan">
        <h3 style={{ margin: 0 }}>Planeado vs real</h3>
        <p class="muted small" style={{ margin: 0 }}>
          Fije la proyección de hoy como plan y, conforme pasen las semanas, la app la compara contra lo que realmente se entregue. También puede capturar un plan que ya tenga
          (por ejemplo, el de un reporte anterior).
        </p>
        <div class="row" style={{ flexWrap: 'wrap' }}>
          <button
            class="btn"
            onClick={() =>
              onPlan({ creado: hoy, inicio: a.inicioProyeccion.inicio, unidad: a.unidad, existenciaInicial: a.existencia, consumo: a.escenarios.promedio.consumo, origen: 'proyeccion' })
            }
          >
            <Icono n="ok" /> Fijar esta proyección como plan
          </button>
          <button class="btn ghost" onClick={() => onPlan({ creado: hoy, inicio: periodoDe(hoy, a.unidad).inicio, unidad: a.unidad, existenciaInicial: 0, consumo: 0, origen: 'manual' })}>
            <Icono n="editar" /> Capturar un plan a mano
          </button>
        </div>
      </div>
    )
  }
  const u = plan.unidad
  const cambiar = (p: Partial<PlanMaterial>) => onPlan({ ...plan, ...p, origen: p.origen ?? 'manual' })
  const texto = cp ? contenidoPlan(cp, a.material.nombre, unidad) : null
  return (
    <div class="tend-plan">
      <div class="spread">
        <h3 style={{ margin: 0 }}>Planeado vs real</h3>
        <button class="btn ghost sm" onClick={() => onPlan(null)}>
          <Icono n="cerrar" /> Quitar plan
        </button>
      </div>
      <div class="filtros" style={{ alignItems: 'flex-end' }}>
        <label class="campo">
          El plan empieza {u === 'semana' ? `(${periodoDe(plan.inicio, u).etiqueta})` : ''}
          <input class="input" type="date" value={plan.inicio} onInput={(e) => cambiar({ inicio: periodoDe((e.target as HTMLInputElement).value || plan.inicio, u).inicio })} />
        </label>
        <label class="campo">
          Existencia al empezar
          <input class="input" type="number" min={0} value={plan.existenciaInicial} onInput={(e) => cambiar({ existenciaInicial: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) })} />
        </label>
        <label class="campo">
          Consumo planeado {porUnidad(u)}
          <input class="input" type="number" min={0} value={plan.consumo} onInput={(e) => cambiar({ consumo: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) })} />
        </label>
        <label class="campo">
          Por
          <select
            class="input"
            value={u}
            onChange={(e) => {
              const nu = (e.target as HTMLSelectElement).value as UnidadPeriodo
              cambiar({ unidad: nu, inicio: periodoDe(plan.inicio, nu).inicio })
            }}
          >
            <option value="semana">Semana</option>
            <option value="mes">Mes</option>
          </select>
        </label>
      </div>
      <p class="muted small" style={{ margin: 0 }}>
        Plan {plan.origen === 'manual' ? 'capturado o corregido a mano' : 'fijado con la proyección de la app'} el {fechaCorta(plan.creado)}.
      </p>
      {cp && texto && (
        <>
          <div class="kpis">
            <div class="kpi">
              <span>
                Planeado ({cp.completos} {unidadTexto(u, cp.completos)})
              </span>
              <b>{miles(cp.totalPlaneado)}</b>
              <small class="muted">{unidad}</small>
            </div>
            <div class="kpi">
              <span>Real registrado</span>
              <b>{miles(cp.totalReal)}</b>
              <small class="muted">
                {unidad} · {miles(cp.promedioReal)} {porUnidad(u)}
              </small>
            </div>
            <div class={`kpi ${cp.desviacionPct > 5 ? 'bad' : ''}`}>
              <span>Diferencia</span>
              <b>
                {cp.desviacionPct > 0 ? '+' : ''}
                {cp.desviacionPct}%
              </b>
              <small class="muted">{cp.desviacionPct > 0 ? 'se consumió más de lo planeado' : cp.desviacionPct < 0 ? 'se consumió menos de lo planeado' : 'igual a lo planeado'}</small>
            </div>
            <div class="kpi">
              <span>Alcanzaría hasta</span>
              <b style={{ fontSize: '22px' }}>{cp.completos ? (cp.agotamientoReal ? `${cp.agotamientoReal.etiqueta} ${cp.agotamientoReal.clave.slice(0, 4)}` : 'No se agota') : '—'}</b>
              <small class="muted">plan: {cp.agotamientoPlan ? `${cp.agotamientoPlan.etiqueta} ${cp.agotamientoPlan.clave.slice(0, 4)}` : 'no se agotaba'}</small>
            </div>
          </div>
          <p style={{ margin: 0 }}>
            <b>{texto.conclusion}</b>
          </p>
          {cp.filas.length > 0 && (
            <div class="tabla-wrap">
              <table class="tabla-tend">
                <thead>
                  <tr>
                    <th>Periodo</th>
                    {cp.filas.map((f) => (
                      <th key={f.periodo.clave} title={f.enCurso ? 'En curso: no cuenta en los totales' : f.periodo.largo}>
                        {f.periodo.etiqueta}
                        {f.enCurso ? '*' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {texto.bloques
                    .flatMap((b) => b.filas)
                    .reduce<{ nombre: string; valores: string[]; rojo: boolean[] }[]>((acc, f) => {
                      const ya = acc.find((x) => x.nombre === f.nombre)
                      if (ya) {
                        ya.valores.push(...f.valores)
                        ya.rojo.push(...(f.rojo ?? f.valores.map(() => false)))
                      } else acc.push({ nombre: f.nombre, valores: [...f.valores], rojo: [...(f.rojo ?? f.valores.map(() => false))] })
                      return acc
                    }, [])
                    .map((f) => (
                      <tr key={f.nombre}>
                        <th>{f.nombre}</th>
                        {f.valores.map((v, j) => (
                          <td key={j} style={{ color: f.rojo[j] ? 'var(--bad)' : undefined }}>
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          {img && cp.filas.length > 0 && (
            <div class="tend-graficas">
              <img src={img.consumo} alt={`Gráfica de consumo planeado contra real de ${a.material.nombre}`} />
              <img src={img.existencia} alt={`Gráfica de existencia planeada contra real de ${a.material.nombre}`} />
            </div>
          )}
          <p class="muted small" style={{ margin: 0 }}>
            {texto.nota}
          </p>
        </>
      )}
    </div>
  )
}

function ResultadoMaterial({ a, unidad, img, extra }: { a: AnalisisMaterial; unidad: string; img: ImagenesMaterial; extra?: preact.ComponentChildren }) {
  const p = a.escenarios.promedio
  const u = a.unidad
  return (
    <div class="card stack" style={{ padding: '16px', gap: '14px' }}>
      <div class="spread">
        <h2 style={{ margin: 0 }}>{a.material.nombre}</h2>
        <span class="muted small">{rangoTexto(a.historico.map((f) => f.periodo), u).replace(/^de (la )?/, '')}</span>
      </div>
      <div class="kpis">
        <div class="kpi">
          <span>Salidas del periodo</span>
          <b>{miles(a.total)}</b>
          <small class="muted">{unidad}</small>
        </div>
        <div class="kpi">
          <span>Consumo promedio</span>
          <b>{miles(p.consumo)}</b>
          <small class="muted">
            {unidad} {porUnidad(u)} · {a.pctConsumo}% de las existencias
          </small>
        </div>
        <div class="kpi">
          <span>Existencias</span>
          <b>{miles(a.existencia)}</b>
          <small class="muted">
            almacén {miles(a.almacen)}
            {a.pedido ? ` + pedido ${miles(a.pedido)}` : ''}
          </small>
        </div>
        <div class={`kpi ${p.agotamiento && p.cobertura < 4 ? 'bad' : ''}`}>
          <span>Alcanza hasta</span>
          <b style={{ fontSize: '24px' }}>{p.agotamiento ? `${p.agotamiento.etiqueta} ${p.agotamiento.clave.slice(0, 4)}` : 'No se agota'}</b>
          <small class="muted">{coberturaTexto(p, u)} con el promedio</small>
        </div>
        {a.objetivo && (
          <div class={`kpi ${p.faltante ? 'bad' : ''}`}>
            <span>Para {a.objetivo.etiqueta} {a.objetivo.clave.slice(0, 4)}</span>
            <b>{p.faltante ? miles(p.faltante) : '✓'}</b>
            <small class="muted">{p.faltante ? `${unidad} hacen falta (se necesitan ${miles(p.necesario!)})` : `alcanza, sobran ${miles(p.sobrante!)}`}</small>
          </div>
        )}
        <div class="kpi">
          <span>No recibieron este material</span>
          <b>{a.pctSinMaterial}%</b>
          <small class="muted">
            {miles(a.sinMaterial)} de {miles(a.solicitudes)} solicitudes
          </small>
        </div>
      </div>

      <div class="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Escenario</th>
              <th>Consumo {porUnidad(u)}</th>
              <th>Alcanza para</th>
              <th>Se terminaría en</th>
              {a.objetivo && <th>Para {a.objetivo.etiqueta}</th>}
            </tr>
          </thead>
          <tbody>
            {(['bajo', 'promedio', 'alto'] as Escenario[]).map((e) => {
              const r = a.escenarios[e]
              return (
                <tr key={e} class={e === 'promedio' ? 'tend-fila-destacada' : ''}>
                  <td>
                    <b>{NOMBRE_ESCENARIO[e]}</b>
                    <br />
                    <small class="muted">{AYUDA_ESCENARIO[e]}</small>
                  </td>
                  <td>
                    {miles(r.consumo)} {unidad}
                  </td>
                  <td>{coberturaTexto(r, u)}</td>
                  <td>{r.agotamiento ? cuandoTexto(r.agotamiento, u).replace(/^la /, '') : 'No se agota'}</td>
                  {a.objetivo && <td>{r.faltante ? `Faltan ${miles(r.faltante)}` : `Alcanza (sobran ${miles(r.sobrante!)})`}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Historico a={a} unidad={unidad} />
      <div class="tend-graficas">
        <img src={img.proyeccion} alt={`Gráfica de la existencia proyectada de ${a.material.nombre}`} />
        <img src={img.historico} alt={`Gráfica del consumo registrado de ${a.material.nombre}`} />
        {img.tallas && <img src={img.tallas} alt={`Entregas de ${a.material.nombre} por talla`} />}
      </div>
      {u === 'semana' && a.escenarios.promedio.filas.some((f) => f.periodo.clave.endsWith('-S53')) && (
        <p class="muted small" style={{ margin: 0 }}>
          Nota: {a.escenarios.promedio.filas.find((f) => f.periodo.clave.endsWith('-S53'))!.periodo.clave.slice(0, 4)} tiene semana 53 en el calendario ISO; ya está considerada en el cálculo.
        </p>
      )}
      {extra}
    </div>
  )
}

// ---------------- Pantalla ----------------
export function PantallaTendencias() {
  const [lista, setLista] = useState<ConfigTendencia[] | null>(null)
  const [actualId, setActualId] = useState('')
  const [plantilla, setPlantilla] = useState<Plantilla | null>(null)
  const [imprimiendo, setImprimiendo] = useState(false)
  const [generandoWord, setGenerandoWord] = useState(false)
  const guardado = useRef<number>()

  useEffect(() => {
    leerTendencias().then((l) => {
      const ok = l.length ? l : [nuevaConfig()]
      setLista(ok)
      setActualId(ok[0].id)
    })
  }, [])

  const c = lista?.find((x) => x.id === actualId) ?? lista?.[0]
  const persistir = (nueva: ConfigTendencia[]) => {
    setLista(nueva)
    clearTimeout(guardado.current)
    guardado.current = window.setTimeout(() => guardarTendencias(nueva), 400)
  }
  const cambiar = (p: Partial<ConfigTendencia>) => c && lista && persistir(lista.map((x) => (x.id === c.id ? { ...x, ...p } : x)))

  const hoy = fechaLocal()
  const analisis = useMemo(() => (c ? analizar(c, hoy) : []), [c, hoy, S.entregas.value, S.movimientos.value, S.materiales.value])
  const conUnidad = useMemo(() => (c ? analisis.map((a) => ({ a, unidad: c.materiales.find((m) => m.materialId === a.material.id)?.unidad || 'piezas' })) : []), [analisis, c])
  const imagenes = useMemo(() => (c ? conUnidad.map(({ a, unidad }) => imagenesMaterial(a, c, unidad)) : []), [conUnidad, c?.estilo, c?.paleta])
  const planes = useMemo(() => (c ? compararPlanes(c, hoy) : new Map<string, ComparacionPlan>()), [c, hoy, S.entregas.value, S.movimientos.value])
  const imgPlanes = useMemo(() => {
    const r = new Map<string, ImagenesPlan>()
    if (c)
      for (const { a, unidad } of conUnidad) {
        const cp = planes.get(a.material.id)
        if (cp && cp.filas.length) r.set(a.material.id, imagenesPlan(cp, a.material.nombre, unidad, c))
      }
    return r
  }, [planes, conUnidad, c?.estilo, c?.paleta])
  const comparativa = useMemo(() => (c && conUnidad.length > 1 ? imagenComparativa(conUnidad, c) : ''), [conUnidad, c?.estilo, c?.paleta])

  if (!lista || !c) return <p class="muted">Cargando…</p>
  const valido = c.desde && c.hasta && c.desde <= c.hasta
  const listo = valido && analisis.length > 0
  const fecha = fechaDocumento(c, hoy)
  const titulo = tituloDe(c)

  const documento = () => {
    const materiales = conUnidad.map(({ a, unidad }, i) => {
      const cp = planes.get(a.material.id)
      const ip = imgPlanes.get(a.material.id)
      return {
        t: contenidoMaterial(a, c, unidad, conUnidad.length === 1 ? titulo : undefined),
        img: imagenes[i],
        plan: cp && ip ? { t: contenidoPlan(cp, a.material.nombre, unidad), img: ip } : undefined,
      }
    })
    const comp =
      conUnidad.length > 1
        ? {
            titulo,
            intro: `Comparativa de ${conUnidad.length} materiales con el consumo registrado ${rangoTexto(analisis[0].historico.map((f) => f.periodo), c.unidad)}${c.contexto.trim() ? `, durante el periodo de ${c.contexto.trim()}` : ''}. Cada barra indica cuántas ${unidadTexto(c.unidad)} alcanzan las existencias con el consumo promedio; la línea marca el rango entre el escenario conservador y el bajo.`,
            imagen: comparativa,
            tabla: filasComparativas(conUnidad),
          }
        : undefined
    return { materiales, comp }
  }

  const abrirPdf = async () => {
    if (!plantilla) setPlantilla(await cargarPlantilla())
    setImprimiendo(true)
  }
  const bajarWord = () =>
    intentar(async () => {
      setGenerandoWord(true)
      try {
        const p = plantilla ?? (await cargarPlantilla())
        setPlantilla(p)
        const { materiales, comp } = documento()
        const { generarWord } = await import('../reportes/tendenciaWord')
        const blob = await generarWord({ plantilla: p, config: c, fecha, comparativa: comp, materiales })
        descargar(blob, `${nombreArchivo(titulo, hoy)}.docx`)
        avisar('Documento de Word descargado. Puede editarlo antes de imprimirlo.')
      } finally {
        setGenerandoWord(false)
      }
    })

  return (
    <div class="stack">
      <div class="spread">
        <h1>Tendencias</h1>
        <div class="row" style={{ flexWrap: 'wrap' }}>
          <button class="btn primary" disabled={!listo} onClick={abrirPdf}>
            <Icono n="pdf" /> PDF
          </button>
          <button class="btn" disabled={!listo || generandoWord} onClick={bajarWord}>
            <Icono n="descarga" /> {generandoWord ? 'Preparando…' : 'Word'}
          </button>
        </div>
      </div>
      <p class="muted small">
        Con las entregas registradas se calcula el consumo {porUnidad(c.unidad)} de cada material, hasta cuándo alcanzan las existencias y, si se indica una fecha, cuánto material hace falta.
        Escenario bajo y conservador: el periodo de menor y de mayor consumo.
      </p>

      <div class="filtros" style={{ alignItems: 'flex-end' }}>
        <label class="campo grow">
          Análisis guardados
          <select class="input" id="tend-lista" value={c.id} onChange={(e) => setActualId((e.target as HTMLSelectElement).value)}>
            {lista.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre || 'Sin nombre'}
              </option>
            ))}
          </select>
        </label>
        <button
          class="btn"
          onClick={() => {
            const n = nuevaConfig()
            persistir([...lista, n])
            setActualId(n.id)
          }}
        >
          + Nuevo
        </button>
        <button
          class="btn"
          onClick={() => {
            const n = { ...structuredClone(c), id: crypto.randomUUID(), nombre: `${c.nombre} (copia)` }
            persistir([...lista, n])
            setActualId(n.id)
          }}
        >
          Duplicar
        </button>
        <button
          class="btn ghost"
          disabled={lista.length < 2}
          onClick={() => {
            const resto = lista.filter((x) => x.id !== c.id)
            persistir(resto)
            setActualId(resto[0].id)
          }}
        >
          <Icono n="basura" /> Eliminar
        </button>
      </div>

      <Configuracion c={c} cambiar={cambiar} />

      {!valido && <div class="aviso bad small">La fecha «Desde» debe ser anterior a «Hasta».</div>}
      {valido && !analisis.length && <div class="aviso small">Agregue al menos un material para ver la tendencia.</div>}
      {listo && conUnidad.length > 1 && (
        <div class="card stack" style={{ padding: '16px' }}>
          <h2 style={{ margin: 0 }}>Comparativa</h2>
          <img class="tend-img" src={comparativa} alt="Comparativa de hasta cuándo alcanzan las existencias de cada material" />
          <div class="tabla-wrap">
            <table>
              <thead>
                <tr>
                  {filasComparativas(conUnidad).encabezado.map((e) => (
                    <th key={e}>{e}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filasComparativas(conUnidad).filas.map((f, i) => (
                  <tr key={i}>
                    {f.map((v, j) => (
                      <td key={j}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {listo &&
        conUnidad.map(({ a, unidad }, i) => {
          const cm = c.materiales.find((m) => m.materialId === a.material.id)
          return (
            <ResultadoMaterial
              key={a.material.id}
              a={a}
              unidad={unidad}
              img={imagenes[i]}
              extra={
                <PlanVsReal
                  a={a}
                  unidad={unidad}
                  plan={cm?.plan}
                  cp={planes.get(a.material.id)}
                  img={imgPlanes.get(a.material.id)}
                  onPlan={(plan) => cambiar({ materiales: c.materiales.map((m) => (m.materialId === a.material.id ? { ...m, plan } : m)) })}
                />
              }
            />
          )
        })}

      {imprimiendo && plantilla && listo && (
        <VistaImpresionPortal onCerrar={() => setImprimiendo(false)}>
          {(() => {
            const { materiales, comp } = documento()
            return [
              comp && hojaComparativa(plantilla, c, { ...comp, fecha, nota: c.nota }),
              ...materiales.flatMap(({ t, img, plan }, i) => [
                ...hojasMaterial(plantilla, c, t, img, fecha, c.nota, `m${i}`),
                ...(plan ? hojasPlan(plantilla, c, plan.t, plan.img, fecha, `m${i}`) : []),
              ]),
            ]
          })()}
        </VistaImpresionPortal>
      )}
    </div>
  )
}
