import { createPortal } from 'preact/compat'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { entregarArchivo, fechaLocal } from '../lib/util'
import { calcularReporte, type DatosReporte, type Fuentes } from '../reportes/datos'
import { cargarPlantilla, type Plantilla } from '../reportes/plantilla'
import { ReporteImprimible } from '../reportes/ReporteImprimible'
import * as S from '../state/store'
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

function Exportar({ desde, hasta, area }: { desde: string; hasta: string; area: string }) {
  const [trabajando, setTrabajando] = useState('')
  const [vista, setVista] = useState<{ d: DatosReporte; p: Plantilla } | null>(null)

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
        await entregarArchivo(nombreReporte(d, 'xlsx'), await generarExcel(d, fuentes()))
      } else {
        const p = await cargarPlantilla()
        if (tipo === 'pptx') {
          const { generarPresentacion } = await import('../reportes/presentacion')
          await entregarArchivo(nombreReporte(d, 'pptx'), await generarPresentacion(d, p))
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
      {vista && <VistaPdf d={vista.d} p={vista.p} onCerrar={() => setVista(null)} />}
    </>
  )
}

/** El reporte se monta directo en <body> para que al imprimir solo salgan sus páginas. */
function VistaPdf(props: { d: DatosReporte; p: Plantilla; onCerrar: () => void }) {
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
    const eventuales = new Set(ent.filter((e) => S.personal.value.get(e.rpe)?.tipo === 'eventual').map((e) => e.rpe)).size
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
          <span>Eventuales atendidos</span>
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
