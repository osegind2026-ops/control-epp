import { signal } from '@preact/signals'
import { createPortal } from 'preact/compat'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { entregarArchivo, fechaLocal, plural } from '../lib/util'
import { calcularReporte, entregasContaminadas, resumenContaminado, type DatosReporte, type Fuentes } from '../reportes/datos'
import { claveFolioImpreso, foliosSinCapturar, ultimoFolioCapturado, UNIDADES_FOLIO } from '../domain/contaminado'
import { leerConfig } from '../db/db'
import { cargarPlantilla, type Plantilla } from '../reportes/plantilla'
import { ReporteImprimible } from '../reportes/ReporteImprimible'
import { ESTILOS_BARRAS, ESTILOS_PASTEL, svgPastel, varsBarra, type EstiloBarras, type EstiloPastel } from '../reportes/estilos'
import { tipoDe } from '../domain/logica'
import type { Entrega } from '../domain/types'
import * as S from '../state/store'
import { Recurrentes } from './Recurrentes'
import { avisar, FotoMaterial, intentar, Vacio } from './comunes'
import { Icono } from './iconos'
import { listaAreas } from './Trabajador'

type Rango = 'hoy' | 'ayer' | 'semana' | 'semanaAnt' | 'mes' | 'todo'

function rango(r: Rango): [string, string] {
  const hoy = new Date()
  const dia = (n: number) => fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n))
  const lunes = -((hoy.getDay() + 6) % 7)
  if (r === 'hoy') return [dia(0), dia(0)]
  if (r === 'ayer') return [dia(-1), dia(-1)]
  if (r === 'semana') return [dia(lunes), dia(lunes + 6)]
  if (r === 'semanaAnt') return [dia(lunes - 7), dia(lunes - 1)]
  if (r === 'mes') return [fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0))]
  return ['', '']
}

function fuentes(): Fuentes {
  return {
    entregas: S.entregas.value,
    movimientos: S.movimientos.value,
    resguardos: S.resguardos.value,
    materiales: S.materiales.value,
    motivos: S.motivos.value,
    ubicaciones: S.ubicaciones.value,
    personal: S.personal.value,
  }
}

/** Sin fechas («Todo») el reporte va de la primera entrega a hoy. */
function limites(desde: string, hasta: string): [string, string] {
  const primera = S.entregas.value.reduce((m, e) => (e.fecha < m ? e.fecha : m), fechaLocal())
  return [desde || primera, hasta || fechaLocal()]
}

const nombreReporte = (d: DatosReporte, ext: string) => `Entrega de EPP ${d.titulo.replace(/[·/\\:]/g, '-')}.${ext}`

/** Folios de EPP contaminado de este año sin capturar, por unidad (hasta el último impreso o capturado). */
function FoliosSinCapturar() {
  const anio = new Date().getFullYear()
  const [impresos, setImpresos] = useState<Record<string, number>>({})
  useEffect(() => {
    Promise.all(UNIDADES_FOLIO.map((u) => leerConfig<number>(claveFolioImpreso(u), 0))).then((v) => setImpresos(Object.fromEntries(UNIDADES_FOLIO.map((u, i) => [u, v[i]]))))
  }, [])
  const filas = UNIDADES_FOLIO.map((u) => {
    const hasta = Math.max(impresos[u] ?? 0, ultimoFolioCapturado(S.entregas.value, u, anio))
    return { u, hasta, faltan: foliosSinCapturar(S.entregas.value, u, anio, hasta) }
  }).filter((f) => f.hasta > 0)
  if (!filas.length) return null
  return (
    <div class="stack" style={{ gap: '4px' }}>
      {filas.map((f) => (
        <p key={f.u} class="small">
          <strong>
            {f.u} · {anio}:
          </strong>{' '}
          {f.faltan.length ? (
            <>
              {plural(f.faltan.length, 'folio', 'folios')} del 1 al {f.hasta} sin capturar (en blanco, extraviados o pendientes):{' '}
              <span class="mono">{f.faltan.slice(0, 40).map((x) => Number(x.slice(-3))).join(', ')}</span>
              {f.faltan.length > 40 && ' …'}
            </>
          ) : (
            `los ${f.hasta} folios están capturados.`
          )}
        </p>
      ))}
      <p class="muted small">El último folio impreso se conoce solo en el equipo donde se imprimieron los formatos.</p>
    </div>
  )
}

/** Reporte de cambios de EPP contaminado en el periodo (con el folio de su formato). */
function ReporteContaminado({ entregas }: { entregas: Entrega[] }) {
  const lista = useMemo(() => entregasContaminadas(entregas, S.materialesPorId.value, S.personal.value), [entregas, S.materiales.value, S.personal.value])
  const resumen = useMemo(() => resumenContaminado(lista, S.materialesPorId.value), [lista])
  if (!lista.length) return null
  const piezas = lista.reduce((s, c) => s + c.piezas, 0)
  return (
    <div class="stack">
      <div class="spread">
        <h2>EPP contaminado</h2>
        <span class="muted small">
          {plural(lista.length, 'cambio', 'cambios')} · {plural(piezas, 'pieza', 'piezas')} · {plural(new Set(lista.map((c) => c.entrega.rpe)).size, 'persona', 'personas')}
        </span>
      </div>
      <div class="row" style={{ alignItems: 'start', gap: '16px' }}>
        <div class="tabla-wrap grow" style={{ minWidth: '260px' }}>
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th class="num">Cambios</th>
                <th class="num">Piezas</th>
              </tr>
            </thead>
            <tbody>
              {resumen.porMaterial.map(([m, x]) => (
                <tr key={m}>
                  <td>{m}</td>
                  <td class="num">{x.eventos}</td>
                  <td class="num">
                    <strong>{x.piezas}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div class="tabla-wrap grow" style={{ minWidth: '260px' }}>
          <table>
            <thead>
              <tr>
                <th>Área</th>
                <th class="num">Cambios</th>
                <th class="num">Personas</th>
                <th class="num">Piezas</th>
              </tr>
            </thead>
            <tbody>
              {resumen.porArea.map(([a, x]) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td class="num">{x.eventos}</td>
                  <td class="num">{x.personas.size}</td>
                  <td class="num">
                    <strong>{x.piezas}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div class="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Folio formato</th>
              <th>Fecha</th>
              <th>Hora</th>
              <th>Nombre</th>
              <th>RPE</th>
              <th>Área</th>
              <th>Material contaminado</th>
              <th>Actividad</th>
              <th>Supervisor</th>
              <th>Vo. Bo. PR</th>
              <th>Entrega</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.entrega.id}>
                <td class="mono small">{c.folioFormato || <span class="muted" title="Marcada antes solo con comentario">sin folio</span>}</td>
                <td>{c.entrega.fecha}</td>
                <td>{c.hora}</td>
                <td>{c.entrega.nombre}</td>
                <td class="mono small">{c.entrega.rpe}</td>
                <td>{c.entrega.area}</td>
                <td>{c.materiales.join(', ')}</td>
                <td class="small">{c.actividad || <span class="muted">—</span>}</td>
                <td class="small">{c.supervisor || <span class="muted">—</span>}</td>
                <td class="small">{c.vistoBueno || <span class="muted">—</span>}</td>
                <td class="mono small">{c.entrega.folio}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FoliosSinCapturar />
    </div>
  )
}

/** Preferencia de este equipo: incluir o no el detalle de recurrentes en los archivos. */
const CLAVE_DETALLE = 'eppDetalleRecurrentes'
function leerDetalle(): boolean {
  try {
    return localStorage.getItem(CLAVE_DETALLE) === '1'
  } catch {
    return false
  }
}

/** Preferencia guardada en este equipo (localStorage); si no se puede leer, el valor por omisión. */
function preferencia<T extends string>(clave: string, permitidos: T[], omision: T): T {
  try {
    const v = localStorage.getItem(clave) as T | null
    return v && permitidos.includes(v) ? v : omision
  } catch {
    return omision
  }
}
function guardarPreferencia(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    /* sin almacenamiento: vale mientras está abierta la pantalla */
  }
}

const COLORES_MUESTRA = ['#235B4E', '#BC955C', '#691C32', '#6F7271']

/** Muestra pequeña de cómo se verán las barras o el pastel con el estilo elegido. */
function MuestraEstilo({ barras, pastel }: { barras?: EstiloBarras; pastel?: EstiloPastel }) {
  if (barras) {
    return (
      <div class="muestra-estilo rp-reporte-muestra" aria-hidden="true">
        <div class={`rp-barras est-${barras}`}>
          {[0.9, 0.62, 0.4].map((f, i) => (
            <div class="rp-barra" key={i}>
              <span class="rp-pista">
                <span style={barras === 'plana' ? { width: `${f * 92}%`, background: COLORES_MUESTRA[0] } : { width: `${f * 92}%`, ...varsBarra(COLORES_MUESTRA[0]) }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  const datos = [45, 28, 17, 10]
  if (pastel === 'dona') {
    let acum = 0
    const partes = datos.map((n, i) => {
      const ini = (acum / 100) * 360
      acum += n
      return `${COLORES_MUESTRA[i]} ${ini}deg ${(acum / 100) * 360}deg`
    })
    return (
      <div class="muestra-estilo" aria-hidden="true">
        <div class="rp-dona" style={{ background: `conic-gradient(${partes.join(',')})` }} />
      </div>
    )
  }
  return (
    <div class="muestra-estilo" aria-hidden="true">
      <div class="rp-pastel" dangerouslySetInnerHTML={{ __html: svgPastel({ valores: datos, colores: COLORES_MUESTRA, ancho: 360, alto: 360, est: pastel ?? 'plano', sinTexto: true }) }} />
    </div>
  )
}

const detalleRec = signal(leerDetalle())
const estBarras = signal<EstiloBarras>(preferencia('eppEstiloBarras', ESTILOS_BARRAS.map(([k]) => k), 'plana'))
const estPastel = signal<EstiloPastel>(preferencia('eppEstiloPastel', ESTILOS_PASTEL.map(([k]) => k), 'dona'))

/** Opciones de los archivos entregables: estilo de las gráficas y detalle de recurrentes. */
function OpcionesArchivos() {
  const resumen = [ESTILOS_BARRAS.find(([k]) => k === estBarras.value)?.[1], ESTILOS_PASTEL.find(([k]) => k === estPastel.value)?.[1], detalleRec.value ? 'con detalle de recurrentes' : '']
    .filter(Boolean)
    .join(' · ')
  return (
    <details class="card opciones-archivos">
      <summary>
        <strong>Opciones de los archivos</strong> <span class="muted small">({resumen})</span>
      </summary>
      <div class="estilos-graficas">
        <div class="estilo-con-muestra">
          <label class="campo">
            Estilo de las barras
            <select
              class="input"
              id="rep-est-barras"
              value={estBarras.value}
              onChange={(e) => {
                estBarras.value = (e.target as HTMLSelectElement).value as EstiloBarras
                guardarPreferencia('eppEstiloBarras', estBarras.value)
              }}
            >
              {ESTILOS_BARRAS.map(([k, t]) => (
                <option key={k} value={k}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <MuestraEstilo barras={estBarras.value} />
        </div>
        <div class="estilo-con-muestra">
          <label class="campo">
            Estilo del pastel
            <select
              class="input"
              id="rep-est-pastel"
              value={estPastel.value}
              onChange={(e) => {
                estPastel.value = (e.target as HTMLSelectElement).value as EstiloPastel
                guardarPreferencia('eppEstiloPastel', estPastel.value)
              }}
            >
              {ESTILOS_PASTEL.map(([k, t]) => (
                <option key={k} value={k}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <MuestraEstilo pastel={estPastel.value} />
        </div>
      </div>
      <label class="check small" title="En Excel, PDF y presentación">
        <input
          type="checkbox"
          checked={detalleRec.value}
          onChange={(e) => {
            detalleRec.value = (e.target as HTMLInputElement).checked
            guardarPreferencia(CLAVE_DETALLE, detalleRec.value ? '1' : '0')
          }}
        />
        Incluir el detalle de solicitantes recurrentes (fechas de cada entrega y qué más se llevaron)
      </label>
      <p class="muted small">Los estilos se aplican a las gráficas del PDF y de la presentación (las de PowerPoint siguen siendo editables). El Excel no lleva gráficas.</p>
    </details>
  )
}

function Exportar({ desde, hasta, area }: { desde: string; hasta: string; area: string }) {
  const [trabajando, setTrabajando] = useState('')
  const [vista, setVista] = useState<{ d: DatosReporte; p: Plantilla } | null>(null)
  const opciones = { detalleRecurrentes: detalleRec.value, estiloBarras: estBarras.value, estiloPastel: estPastel.value }

  const preparar = () => {
    const [a, b] = limites(desde, hasta)
    return calcularReporte(fuentes(), a, b, area)
  }
  const ejecutar = async (tipo: 'excel' | 'pptx' | 'pdf') => {
    setTrabajando(tipo)
    await intentar(async () => {
      const d = preparar()
      if (tipo === 'excel') {
        const { generarExcel } = await import('../reportes/excel')
        await entregarArchivo(nombreReporte(d, 'xlsx'), await generarExcel(d, fuentes(), opciones))
      } else {
        const p = await cargarPlantilla()
        if (tipo === 'pptx') {
          const { generarPresentacion } = await import('../reportes/presentacion')
          await entregarArchivo(nombreReporte(d, 'pptx'), await generarPresentacion(d, p, opciones))
        } else setVista({ d, p })
      }
      if (tipo !== 'pdf') avisar('✓ Reporte descargado')
    })
    setTrabajando('')
  }

  return (
    <>
      <div class="row">
        <button class="btn" disabled={!!trabajando} onClick={() => ejecutar('excel')}>
          <Icono n="excel" /> {trabajando === 'excel' ? 'Generando…' : 'Excel'}
        </button>
        <button class="btn" disabled={!!trabajando} onClick={() => ejecutar('pdf')}>
          <Icono n="pdf" /> {trabajando === 'pdf' ? 'Preparando…' : 'PDF'}
        </button>
        <button class="btn primary" disabled={!!trabajando} onClick={() => ejecutar('pptx')}>
          <Icono n="presentacion" /> {trabajando === 'pptx' ? 'Generando…' : 'Presentación'}
        </button>
      </div>
      {vista && <VistaPdf d={vista.d} p={vista.p} {...opciones} onCerrar={() => setVista(null)} />}
    </>
  )
}

/** El reporte se monta directo en <body> para que al imprimir solo salgan sus páginas. */
function VistaPdf(props: { d: DatosReporte; p: Plantilla; detalleRecurrentes?: boolean; estiloBarras?: EstiloBarras; estiloPastel?: EstiloPastel; onCerrar: () => void }) {
  const [contenedor] = useState(() => {
    const el = document.createElement('div')
    el.className = 'contenedor-reporte'
    document.body.appendChild(el)
    return el
  })
  useEffect(() => () => contenedor.remove(), [])
  return createPortal(<ReporteImprimible {...props} />, contenedor)
}

function Barra({ valor, max }: { valor: number; max: number }) {
  return <div class="barra" style={{ width: `${max ? Math.round((valor / max) * 100) : 0}%` }} />
}

export function PantallaReportes() {
  const [sel, setSel] = useState<Rango>('mes')
  const [[desde, hasta], setFechas] = useState(rango('mes'))
  const [area, setArea] = useState('')

  const d = useMemo(() => {
    const ent = S.entregas.value.filter(
      (e) => e.estado === 'registrada' && (!desde || e.fecha >= desde) && (!hasta || e.fecha <= hasta) && (!area || e.area === area),
    )
    const porMaterial = new Map<string, { total: number; tallas: Map<string, number> }>()
    const porArea = new Map<string, { entregas: number; personas: Set<string>; piezas: number }>()
    const porTrab = new Map<string, { nombre: string; area: string; entregas: number; piezas: number; ultima: string }>()
    const porUsuario = new Map<string, { entregas: number; piezas: number }>()
    let piezas = 0
    for (const e of ent) {
      const pz = e.lineas.reduce((s, l) => s + l.cantidad, 0)
      piezas += pz
      for (const l of e.lineas) {
        const m = porMaterial.get(l.materialId) ?? { total: 0, tallas: new Map() }
        m.total += l.cantidad
        if (l.varianteId) m.tallas.set(l.varianteId, (m.tallas.get(l.varianteId) ?? 0) + l.cantidad)
        porMaterial.set(l.materialId, m)
      }
      const a = porArea.get(e.area) ?? { entregas: 0, personas: new Set(), piezas: 0 }
      a.entregas++
      a.personas.add(e.rpe)
      a.piezas += pz
      porArea.set(e.area, a)
      const t = porTrab.get(e.rpe) ?? { nombre: e.nombre, area: e.area, entregas: 0, piezas: 0, ultima: '' }
      t.entregas++
      t.piezas += pz
      if (e.fecha > t.ultima) t.ultima = e.fecha
      porTrab.set(e.rpe, t)
      const u = porUsuario.get(e.usuarioNombre) ?? { entregas: 0, piezas: 0 }
      u.entregas++
      u.piezas += pz
      porUsuario.set(e.usuarioNombre, u)
    }
    const eventuales = new Set(ent.filter((e) => { const p = S.personal.value.get(e.rpe); return p && tipoDe(p) !== 'permanente' }).map((e) => e.rpe)).size
    return {
      ent,
      piezas,
      eventuales,
      materiales: [...porMaterial.entries()].sort((a, b) => b[1].total - a[1].total),
      areas: [...porArea.entries()].sort((a, b) => b[1].piezas - a[1].piezas),
      trabajadores: [...porTrab.entries()].sort((a, b) => b[1].entregas - a[1].entregas || b[1].piezas - a[1].piezas).slice(0, 15),
      usuarios: [...porUsuario.entries()].sort((a, b) => b[1].entregas - a[1].entregas),
    }
  }, [S.entregas.value, desde, hasta, area])

  const maxMat = d.materiales[0]?.[1].total ?? 0
  const maxArea = d.areas[0]?.[1].piezas ?? 0

  return (
    <div class="stack">
      <div class="spread">
        <h1>Reportes</h1>
        <Exportar desde={desde} hasta={hasta} area={area} />
      </div>
      <p class="muted small">
        Elija el periodo y descargue el reporte ejecutivo con la plantilla institucional: Excel con el detalle, PDF para enviar o presentación de PowerPoint editable.
      </p>
      <OpcionesArchivos />
      <div class="row">
        {(
          [
            ['hoy', 'Hoy'],
            ['ayer', 'Ayer'],
            ['semana', 'Esta semana'],
            ['semanaAnt', 'Semana anterior'],
            ['mes', 'Este mes'],
            ['todo', 'Todo'],
          ] as const
        ).map(([id, txt]) => (
          <button key={id} class="chip" aria-pressed={sel === id} onClick={() => (setSel(id), setFechas(rango(id)))}>
            {txt}
          </button>
        ))}
      </div>
      <div class="filtros">
        <label class="campo">
          Desde
          <input class="input" id="r-desde" type="date" value={desde} onInput={(e) => setFechas([(e.target as HTMLInputElement).value, hasta])} />
        </label>
        <label class="campo">
          Hasta
          <input class="input" id="r-hasta" type="date" value={hasta} onInput={(e) => setFechas([desde, (e.target as HTMLInputElement).value])} />
        </label>
        <label class="campo">
          Área
          <select class="input" id="r-area" value={area} onChange={(e) => setArea((e.target as HTMLSelectElement).value)}>
            <option value="">Todas</option>
            {listaAreas().map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div class="kpis">
        <div class="kpi">
          <span>Entregas</span>
          <b>{d.ent.length}</b>
        </div>
        <div class="kpi">
          <span>Personas atendidas</span>
          <b>{new Set(d.ent.map((e) => e.rpe)).size}</b>
        </div>
        <div class="kpi">
          <span>Piezas entregadas</span>
          <b>{d.piezas}</b>
        </div>
        <div class="kpi">
          <span>Eventuales y temporales</span>
          <b>{d.eventuales}</b>
        </div>
        <div class="kpi">
          <span>En resguardo hoy</span>
          <b>{S.resguardosActivos.value.filter((r) => !area || r.area === area).reduce((s, r) => s + r.cantidad, 0)}</b>
        </div>
      </div>

      {d.ent.length === 0 ? (
        <Vacio>Sin entregas en este periodo.</Vacio>
      ) : (
        <>
          <h2>Por material</h2>
          <div class="tabla-wrap">
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th class="num">Piezas</th>
                  <th style={{ width: '30%' }} />
                  <th>Por talla</th>
                </tr>
              </thead>
              <tbody>
                {d.materiales.map(([id, m]) => (
                  <tr key={id}>
                    <td>
                      <div class="material-celda">
                        <FotoMaterial materialId={id} mini />
                        {S.nombreMaterial(id)}
                      </div>
                    </td>
                    <td class="num">
                      <strong>{m.total}</strong>
                    </td>
                    <td style={{ verticalAlign: 'middle' }}>
                      <Barra valor={m.total} max={maxMat} />
                    </td>
                    <td class="small">
                      {[...m.tallas.entries()]
                        .sort()
                        .map(([v, n]) => `${v}: ${n}`)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Por área</h2>
          <div class="tabla-wrap">
            <table>
              <thead>
                <tr>
                  <th>Área</th>
                  <th class="num">Entregas</th>
                  <th class="num">Personas</th>
                  <th class="num">Piezas</th>
                  <th style={{ width: '30%' }} />
                </tr>
              </thead>
              <tbody>
                {d.areas.map(([a, x]) => (
                  <tr key={a}>
                    <td>{a}</td>
                    <td class="num">{x.entregas}</td>
                    <td class="num">{x.personas.size}</td>
                    <td class="num">
                      <strong>{x.piezas}</strong>
                    </td>
                    <td style={{ verticalAlign: 'middle' }}>
                      <Barra valor={x.piezas} max={maxArea} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Recurrentes entregas={d.ent} />
          <ReporteContaminado entregas={d.ent} />

          <div class="row" style={{ alignItems: 'start', gap: '16px' }}>
            <div class="stack grow" style={{ minWidth: '300px' }}>
              <h2>Trabajadores con más entregas</h2>
              <div class="tabla-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Trabajador</th>
                      <th class="num">Entregas</th>
                      <th class="num">Piezas</th>
                      <th>Última</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.trabajadores.map(([rpe, t]) => (
                      <tr key={rpe}>
                        <td>
                          {t.nombre}
                          <div class="muted small">
                            {rpe} · {t.area}
                          </div>
                        </td>
                        <td class="num">{t.entregas}</td>
                        <td class="num">{t.piezas}</td>
                        <td>{t.ultima}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div class="stack" style={{ minWidth: '260px', flex: '0 1 340px' }}>
              <h2>Por quién despachó</h2>
              <div class="tabla-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th class="num">Entregas</th>
                      <th class="num">Piezas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.usuarios.map(([u, x]) => (
                      <tr key={u}>
                        <td>{u}</td>
                        <td class="num">{x.entregas}</td>
                        <td class="num">{x.piezas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
