// Tendencias: consumo de EPP a partir de las entregas, proyección de existencias y
// documento en PDF y Word con gráficas.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  AYUDA_ESCENARIO, NOMBRE_ESCENARIO, coberturaTexto, conclusionEscenario, conclusionPlan, cuandoTexto, miles, periodoDe, porUnidad, unidadTexto,
  type AnalisisMaterial, type ComparacionPlan, type FilaConsumo, type PlanMaterial, type UnidadPeriodo,
} from '../domain/tendencias'
import { tieneTallas } from '../domain/logica'
import { fechaLocal } from '../lib/util'
import { cargarPlantilla, type Plantilla } from '../reportes/plantilla'
import { ESTILOS, PALETAS, type EstiloGrafica, type PaletaGrafica } from '../reportes/graficasTendencia'
import { imagenConsumoTallas, imagenCobertura, imagenesMaterial, imagenesPlan, type ImagenesMaterial, type ImagenesPlan } from '../reportes/imagenesTendencia'
import { conclusionTallas, construirDocumento, filasPlan, nombreArchivo, notaPlan, rangoTexto, tablaTallas, textoTendencia, type Item } from '../reportes/tendenciaDoc'
import { DocumentoTendencia } from '../reportes/ReporteTendencia'
import {
  analizar, analizaSeparadas, compararPlanes, ENCABEZADO_POR_DEFECTO, escenarioPrincipal, escenariosDe, existenciaApp, guardarTendencias, leerTendencias,
  NOTA_POR_DEFECTO, nuevaConfig, ORDEN_ESCENARIOS, PIE_POR_DEFECTO, planDe, sujetosDe, tallasElegidas, tituloDe, ultimosPeriodos, unidadSugerida,
  type ConfigTendencia, type GrupoTendencia, type MaterialTendencia, type VistaEscenarios,
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
function NumeroManual({ app, valor, onCambio, etiqueta }: { app: number; valor: number | null | undefined; onCambio: (v: number | null) => void; etiqueta: string }) {
  return (
    <input
      class="input"
      type="number"
      min={0}
      aria-label={etiqueta}
      title={valor == null ? `Según la app: ${miles(app)}` : 'Capturado a mano (borre o ponga el valor de la app para regresar)'}
      style={valor != null ? { borderColor: 'var(--warn, #d9822b)' } : undefined}
      value={valor ?? app}
      onInput={(e) => {
        const v = (e.target as HTMLInputElement).value
        onCambio(v === '' || Number(v) === app ? null : Math.max(0, Number(v)))
      }}
    />
  )
}

function EditorTallas({ cm, cambiarMat }: { cm: MaterialTendencia; cambiarMat: (p: Partial<MaterialTendencia>) => void }) {
  const m = S.materialesPorId.value.get(cm.materialId)
  if (!m || !tieneTallas(m)) return null
  const vigentes = m.variantes.filter((v) => v.activo)
  const elegidas = tallasElegidas(cm)
  const juntas = cm.juntas !== false
  const separadas = !!cm.separadas
  const alternar = (id: string) => {
    const nuevas = elegidas.includes(id) ? elegidas.filter((t) => t !== id) : [...elegidas, id]
    if (!nuevas.length) return
    cambiarMat({ tallas: vigentes.map((v) => v.id).filter((t) => nuevas.includes(t)) })
  }
  return (
    <div class="tend-tallas">
      <div class="chips" role="group" aria-label={`Tallas de ${m.nombre}`}>
        <span class="small muted">Tallas:</span>
        {vigentes.map((v) => (
          <button key={v.id} class="chip" aria-pressed={elegidas.includes(v.id)} onClick={() => alternar(v.id)}>
            {v.etiqueta}
          </button>
        ))}
        {elegidas.length < vigentes.length && (
          <button class="btn ghost sm" onClick={() => cambiarMat({ tallas: undefined })}>
            Todas
          </button>
        )}
      </div>
      <div class="row" style={{ flexWrap: 'wrap', gap: '14px' }}>
        <label class="check">
          <input type="checkbox" checked={juntas || !separadas} disabled={!separadas} onChange={(e) => cambiarMat({ juntas: (e.target as HTMLInputElement).checked })} />
          Analizar juntas {elegidas.length < vigentes.length ? `(${elegidas.length} tallas)` : '(total)'}
        </label>
        <label class="check">
          <input type="checkbox" checked={separadas} onChange={(e) => cambiarMat({ separadas: (e.target as HTMLInputElement).checked, juntas: (e.target as HTMLInputElement).checked ? juntas : true })} />
          Cada talla por separado (con comparativa de tallas)
        </label>
      </div>
      {separadas && (
        <div class="tabla-wrap">
          <table class="tabla-tallas">
            <thead>
              <tr>
                <th>Talla</th>
                <th>Almacén</th>
                <th>Pedido por llegar</th>
              </tr>
            </thead>
            <tbody>
              {elegidas.map((t) => (
                <tr key={t}>
                  <th>{m.variantes.find((v) => v.id === t)?.etiqueta ?? t}</th>
                  <td>
                    <NumeroManual
                      etiqueta={`Almacén talla ${t}`}
                      app={existenciaApp(cm.materialId, [t])}
                      valor={cm.existenciaTalla?.[t]}
                      onCambio={(v) => cambiarMat({ existenciaTalla: { ...cm.existenciaTalla, [t]: v } })}
                    />
                  </td>
                  <td>
                    <input
                      class="input"
                      type="number"
                      min={0}
                      aria-label={`Pedido talla ${t}`}
                      value={cm.pedidoTalla?.[t] ?? 0}
                      onInput={(e) => cambiarMat({ pedidoTalla: { ...cm.pedidoTalla, [t]: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) } })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EditorMateriales({ c, cambiar }: { c: ConfigTendencia; cambiar: (p: Partial<ConfigTendencia>) => void }) {
  const [elegido, setElegido] = useState('')
  const usados = new Set(c.materiales.map((m) => m.materialId))
  const disponibles = S.materialesActivos.value.filter((m) => !usados.has(m.id) && m.tipo !== 'prestamo')
  const porCat = S.categorias.value
    .map((cat) => ({ cat, mats: disponibles.filter((m) => m.categoriaId === cat.id) }))
    .filter((x) => x.mats.length)
  const sinCat = disponibles.filter((m) => !S.categorias.value.some((cat) => cat.id === m.categoriaId))
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
        const elegidas = tallasElegidas(cm)
        const app = existenciaApp(cm.materialId, elegidas.length ? elegidas : undefined)
        const porTalla = analizaSeparadas(cm)
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
              {!porTalla && (
                <>
                  <label class="campo">
                    Almacén {cm.existenciaManual == null ? `(según la app: ${miles(app)})` : '(capturado a mano)'}
                    <NumeroManual etiqueta="Almacén" app={app} valor={cm.existenciaManual} onCambio={(v) => cambiarMat(cm.materialId, { existenciaManual: v })} />
                  </label>
                  <label class="campo">
                    Pedido por llegar
                    <input class="input" type="number" min={0} value={cm.pedido} onInput={(e) => cambiarMat(cm.materialId, { pedido: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) })} />
                  </label>
                </>
              )}
            </div>
            {porTalla && <p class="muted small" style={{ margin: 0 }}>Con tallas por separado, el almacén y el pedido se capturan por talla; el total es la suma.</p>}
            <EditorTallas cm={cm} cambiarMat={(p) => cambiarMat(cm.materialId, p)} />
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

      <h3 style={{ margin: 0 }}>Escenarios en pantalla y en el reporte</h3>
      <div class="chips" role="group" aria-label="Escenarios">
        {ORDEN_ESCENARIOS.map((e) => {
          const sel = escenariosDe(c)
          const activo = sel.includes(e)
          return (
            <button
              key={e}
              class="chip"
              aria-pressed={activo}
              title={AYUDA_ESCENARIO[e]}
              onClick={() => {
                const nuevos = activo ? sel.filter((x) => x !== e) : [...sel, e]
                if (nuevos.length) cambiar({ escenarios: ORDEN_ESCENARIOS.filter((x) => nuevos.includes(x)) })
              }}
            >
              {NOMBRE_ESCENARIO[e]}
            </button>
          )
        })}
      </div>
      {escenariosDe(c).length > 1 && (
        <label class="campo" style={{ maxWidth: '360px' }}>
          Gráficas de proyección
          <select class="input" id="tend-vista" value={c.vistaEscenarios ?? 'comparativa'} onChange={(e) => cambiar({ vistaEscenarios: (e.target as HTMLSelectElement).value as VistaEscenarios })}>
            <option value="comparativa">Comparativa (todos los escenarios en una gráfica)</option>
            <option value="separadas">Por separado (una gráfica por escenario)</option>
            <option value="ambas">Ambas</option>
          </select>
        </label>
      )}
      <p class="muted small" style={{ margin: 0 }}>
        Bajo: periodo de menor consumo · Promedio: promedio del periodo · Conservador: periodo de mayor consumo. La conclusión principal usa el promedio si está elegido.
      </p>

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
  const texto = cp ? { conclusion: conclusionPlan(cp, a.nombre, unidad), filas: filasPlan(cp, unidad), nota: notaPlan(cp.plan.unidad) } : null
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
                  {texto.filas.map((f) => (
                      <tr key={f.nombre}>
                        <th>{f.nombre}</th>
                        {f.valores.map((v, j) => (
                          <td key={j} style={{ color: f.rojo?.[j] ? 'var(--bad)' : undefined }}>
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
              <img src={img.consumo.src} alt={`Gráfica de consumo planeado contra real de ${a.nombre}`} />
              <img src={img.existencia.src} alt={`Gráfica de existencia planeada contra real de ${a.nombre}`} />
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

function ResultadoMaterial({ a, unidad, img, c, extra }: { a: AnalisisMaterial; unidad: string; img: ImagenesMaterial; c: ConfigTendencia; extra?: preact.ComponentChildren }) {
  const sel = escenariosDe(c)
  const principal = escenarioPrincipal(c)
  const p = a.escenarios[principal]
  const u = a.unidad
  return (
    <div class="stack" style={{ gap: '14px' }}>
      <div class="kpis">
        <div class="kpi">
          <span>Salidas del periodo</span>
          <b>{miles(a.total)}</b>
          <small class="muted">{unidad}</small>
        </div>
        <div class="kpi">
          <span>{NOMBRE_ESCENARIO[principal]}</span>
          <b>{miles(p.consumo)}</b>
          <small class="muted">
            {unidad} {porUnidad(u)} · {a.existencia ? Math.round((p.consumo / a.existencia) * 100) : 0}% de las existencias
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
          <small class="muted">{coberturaTexto(p, u)}</small>
        </div>
        {a.objetivo && (
          <div class={`kpi ${p.faltante ? 'bad' : ''}`}>
            <span>
              Para {a.objetivo.etiqueta} {a.objetivo.clave.slice(0, 4)}
            </span>
            <b>{p.faltante ? miles(p.faltante) : '✓'}</b>
            <small class="muted">{p.faltante ? `${unidad} hacen falta (se necesitan ${miles(p.necesario!)})` : `alcanza, sobran ${miles(p.sobrante!)}`}</small>
          </div>
        )}
        <div class="kpi">
          <span>No recibieron {a.talla ? 'esta talla' : 'este material'}</span>
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
            {sel.map((e) => {
              const r = a.escenarios[e]
              return (
                <tr key={e} class={e === principal ? 'tend-fila-destacada' : ''}>
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
      <p style={{ margin: 0 }}>
        <b>{conclusionEscenario(a, principal, unidad)}</b>
        {sel
          .filter((e) => e !== principal)
          .map((e) => (
            <span key={e}> {conclusionEscenario(a, e, unidad)}</span>
          ))}
      </p>
      <p class="muted small" style={{ margin: 0 }}>
        {textoTendencia(a, unidad)}
      </p>

      <Historico a={a} unidad={unidad} />
      <div class="tend-graficas">
        <img src={img.historico.src} alt={`Gráfica del consumo registrado de ${a.nombre}`} />
        {img.comparada && <img src={img.comparada.src} alt={`Gráfica comparativa de escenarios de ${a.nombre}`} />}
        {sel.map((e) => img.proyeccion[e] && <img key={e} src={img.proyeccion[e]!.src} alt={`Existencia proyectada de ${a.nombre}, ${NOMBRE_ESCENARIO[e].toLowerCase()}`} />)}
        {img.tallas && <img src={img.tallas.src} alt={`Entregas de ${a.nombre} por talla`} />}
      </div>
      {u === 'semana' && p.filas.some((f) => f.periodo.clave.endsWith('-S53')) && (
        <p class="muted small" style={{ margin: 0 }}>
          Nota: {p.filas.find((f) => f.periodo.clave.endsWith('-S53'))!.periodo.clave.slice(0, 4)} tiene semana 53 en el calendario ISO; ya está considerada en el cálculo.
        </p>
      )}
      {extra}
    </div>
  )
}

/** Comparativa de las tallas de un material: consumo, hasta cuándo alcanza cada una y qué comprar. */
function ComparativaTallas({ g, c }: { g: GrupoTendencia; c: ConfigTendencia }) {
  const nombre = S.materialesPorId.value.get(g.materialId)?.nombre ?? ''
  const consumo = useMemo(() => imagenConsumoTallas(g.tallas, nombre, g.unidad, c), [g, c.estilo, c.paleta])
  const cobertura = useMemo(
    () => imagenCobertura(g.tallas.map((a) => ({ a, nombre: a.talla?.etiqueta ?? a.nombre })), c, `¿Hasta cuándo alcanza cada talla? – ${nombre}`, 'Comparativa entre tallas con el consumo del periodo analizado'),
    [g, c.estilo, c.paleta, c.escenarios],
  )
  const t = tablaTallas(g.tallas, c, g.unidad)
  return (
    <div class="stack" style={{ gap: '12px' }}>
      <h3 style={{ margin: 0 }}>Comparativa por talla</h3>
      <div class="tend-graficas">
        <img src={consumo.src} alt={`Consumo por talla de ${nombre}`} />
        <img src={cobertura.src} alt={`Hasta cuándo alcanza cada talla de ${nombre}`} />
      </div>
      <div class="tabla-wrap">
        <table>
          <thead>
            <tr>
              {t.encabezado.map((e) => (
                <th key={e}>{e}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.filas.map((f, i) => (
              <tr key={i}>
                {f.map((v, j) => (
                  <td key={j} class={j === f.length - 1 && /^Comprar/.test(v) ? 'tend-comprar' : ''}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: 0 }}>
        <b>{conclusionTallas(g.tallas, c, g.unidad)}</b>
      </p>
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
  const [itemsPdf, setItemsPdf] = useState<Item[]>([])
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
  const grupos = useMemo(() => (c ? analizar(c, hoy) : []), [c, hoy, S.entregas.value, S.movimientos.value, S.materiales.value])
  const sujetos = useMemo(() => sujetosDe(grupos), [grupos])
  const imagenes = useMemo(() => {
    const r = new Map<string, ImagenesMaterial>()
    if (c) for (const { a, unidad } of sujetos) r.set(a.clave, imagenesMaterial(a, c, unidad))
    return r
  }, [sujetos, c?.estilo, c?.paleta, c?.escenarios, c?.vistaEscenarios])
  const planes = useMemo(() => (c ? compararPlanes(c, grupos, hoy) : new Map<string, ComparacionPlan>()), [c, grupos, hoy])
  const imgPlanes = useMemo(() => {
    const r = new Map<string, ImagenesPlan>()
    if (c)
      for (const { a, unidad } of sujetos) {
        const cp = planes.get(a.clave)
        if (cp && cp.filas.length) r.set(a.clave, imagenesPlan(cp, a.nombre, unidad, c))
      }
    return r
  }, [planes, sujetos, c?.estilo, c?.paleta])
  const comparativa = useMemo(() => {
    if (!c || grupos.length < 2) return null
    const lista = grupos.flatMap((g) => (g.juntas ? [{ a: g.juntas }] : g.tallas.map((a) => ({ a }))))
    return { lista, img: imagenCobertura(lista, c, '¿Hasta cuándo alcanzan las existencias?', 'Comparativa entre materiales con el consumo del periodo analizado') }
  }, [grupos, c?.estilo, c?.paleta, c?.escenarios])

  if (!lista || !c) return <p class="muted">Cargando…</p>
  const valido = c.desde && c.hasta && c.desde <= c.hasta
  const listo = valido && sujetos.length > 0
  const titulo = tituloDe(c)
  const principal = escenarioPrincipal(c)
  const documento = () => construirDocumento(c, grupos, planes, { sujetos: imagenes, planes: imgPlanes }, hoy)

  const abrirPdf = async () => {
    if (!plantilla) setPlantilla(await cargarPlantilla())
    setItemsPdf(documento().items)
    setImprimiendo(true)
  }
  const bajarWord = () =>
    intentar(async () => {
      setGenerandoWord(true)
      try {
        const p = plantilla ?? (await cargarPlantilla())
        setPlantilla(p)
        const doc = documento()
        const { generarWord } = await import('../reportes/tendenciaWord')
        const blob = await generarWord({ plantilla: p, config: c, titulo: doc.titulo, items: doc.items })
        descargar(blob, `${nombreArchivo(titulo, hoy)}.docx`)
        avisar('Documento de Word descargado. Puede editarlo antes de imprimirlo.')
      } finally {
        setGenerandoWord(false)
      }
    })

  const cambiarPlan = (a: AnalisisMaterial, plan: PlanMaterial | null) =>
    cambiar({
      materiales: c.materiales.map((m) => {
        if (m.materialId !== a.material.id) return m
        // Los planes de la 2.27 (uno por material) pasan a la lista por análisis
        const planes = { ...(m.planes ?? (m.plan ? { [m.materialId]: m.plan } : {})), [a.clave]: plan }
        return { ...m, planes, plan: undefined }
      }),
    })
  const resultado = (a: AnalisisMaterial, unidad: string) => (
    <ResultadoMaterial
      a={a}
      unidad={unidad}
      c={c}
      img={imagenes.get(a.clave)!}
      extra={
        <PlanVsReal
          a={a}
          unidad={unidad}
          plan={planDe(
            c.materiales.find((m) => m.materialId === a.material.id),
            a.clave,
          )}
          cp={planes.get(a.clave)}
          img={imgPlanes.get(a.clave)}
          onPlan={(plan) => cambiarPlan(a, plan)}
        />
      }
    />
  )

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
        Con las entregas registradas se calcula el consumo {porUnidad(c.unidad)} de cada material (y de cada talla, si lo pide), hasta cuándo alcanzan las existencias y, si se indica una
        fecha, cuánto material hace falta.
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
      {valido && !sujetos.length && <div class="aviso small">Agregue al menos un material para ver la tendencia.</div>}
      {listo && comparativa && (
        <div class="card stack" style={{ padding: '16px' }}>
          <h2 style={{ margin: 0 }}>Comparativa entre materiales</h2>
          <img class="tend-img" src={comparativa.img.src} alt="Comparativa de hasta cuándo alcanzan las existencias de cada material" />
          <div class="tabla-wrap">
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>{NOMBRE_ESCENARIO[principal]}</th>
                  <th>Existencias</th>
                  <th>Alcanza para</th>
                  <th>Se terminaría en</th>
                </tr>
              </thead>
              <tbody>
                {comparativa.lista.map(({ a }) => {
                  const r = a.escenarios[principal]
                  return (
                    <tr key={a.clave}>
                      <td>{a.nombre}</td>
                      <td>
                        {miles(r.consumo)} {porUnidad(a.unidad)}
                      </td>
                      <td>{miles(a.existencia)}</td>
                      <td>{coberturaTexto(r, a.unidad)}</td>
                      <td>{r.agotamiento ? `${r.agotamiento.etiqueta} ${r.agotamiento.clave.slice(0, 4)}` : 'No se agota'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {listo &&
        grupos.map((g) => {
          const nombre = S.materialesPorId.value.get(g.materialId)?.nombre ?? ''
          const periodo = rangoTexto((g.juntas ?? g.tallas[0]).historico.map((f) => f.periodo), c.unidad).replace(/^de (la )?/, '')
          return (
            <div key={g.materialId} class="card stack" style={{ padding: '16px', gap: '14px' }}>
              <div class="spread">
                <h2 style={{ margin: 0 }}>
                  {nombre}
                  {g.juntas?.talla ? ` – ${g.juntas.talla.etiqueta}` : ''}
                </h2>
                <span class="muted small">{periodo}</span>
              </div>
              {g.juntas && resultado(g.juntas, g.unidad)}
              {g.tallas.length > 1 && <ComparativaTallas g={g} c={c} />}
              {g.tallas.map((a) => (
                <details key={a.clave} class="tend-talla" open={!g.juntas && g.tallas.length === 1}>
                  <summary>
                    <b>{a.talla?.etiqueta ?? a.nombre}</b>
                    <span class="muted small">
                      {' '}
                      · {miles(a.escenarios[principal].consumo)} {g.unidad} {porUnidad(a.unidad)} · existencia {miles(a.existencia)} ·{' '}
                      {a.escenarios[principal].agotamiento ? `hasta ${a.escenarios[principal].agotamiento!.etiqueta} ${a.escenarios[principal].agotamiento!.clave.slice(0, 4)}` : 'no se agota'}
                    </span>
                  </summary>
                  {resultado(a, g.unidad)}
                </details>
              ))}
            </div>
          )
        })}

      {imprimiendo && plantilla && listo && <VistaImpresionPortal onCerrar={() => setImprimiendo(false)}>
          <DocumentoTendencia p={plantilla} c={c} items={itemsPdf} />
        </VistaImpresionPortal>}
    </div>
  )
}
