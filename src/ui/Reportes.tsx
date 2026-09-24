import { useMemo, useState } from 'preact/hooks'
import { csvq, descargarArchivo, fechaLocal } from '../lib/util'
import { nombreArchivo } from '../state/respaldo'
import * as S from '../state/store'
import { FotoMaterial, Vacio } from './comunes'
import { Icono } from './iconos'
import { listaAreas } from './Trabajador'

type Rango = 'hoy' | '7d' | 'mes' | 'todo'

function rango(r: Rango): [string, string] {
  const hoy = new Date()
  if (r === 'hoy') return [fechaLocal(hoy), fechaLocal(hoy)]
  if (r === '7d') return [fechaLocal(new Date(Date.now() - 6 * 86400000)), fechaLocal(hoy)]
  if (r === 'mes') return [fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), fechaLocal(hoy)]
  return ['', '']
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

  const exportar = () => {
    let csv = `REPORTE DE CONSUMO EPP,${csvq((desde || 'inicio') + ' a ' + (hasta || 'hoy'))},${csvq(area || 'TODAS LAS ÁREAS')}\n\nMATERIAL,TALLA,PIEZAS\n`
    for (const [id, m] of d.materiales) {
      if (m.tallas.size) for (const [v, n] of m.tallas) csv += `${csvq(S.nombreMaterial(id))},${csvq(v)},${n}\n`
      else csv += `${csvq(S.nombreMaterial(id))},,${m.total}\n`
    }
    csv += '\nAREA,ENTREGAS,PERSONAS,PIEZAS\n'
    for (const [a, x] of d.areas) csv += `${csvq(a)},${x.entregas},${x.personas.size},${x.piezas}\n`
    csv += '\nRPE,NOMBRE,AREA,ENTREGAS,PIEZAS,ULTIMA\n'
    for (const [rpe, t] of d.trabajadores) csv += [rpe, t.nombre, t.area].map(csvq).join(',') + `,${t.entregas},${t.piezas},${t.ultima}\n`
    csv += '\nDESPACHO,ENTREGAS,PIEZAS\n'
    for (const [u, x] of d.usuarios) csv += `${csvq(u)},${x.entregas},${x.piezas}\n`
    descargarArchivo(nombreArchivo('CFE_Reporte_Consumo', 'csv'), '﻿' + csv, 'text/csv;charset=utf-8')
  }

  const maxMat = d.materiales[0]?.[1].total ?? 0
  const maxArea = d.areas[0]?.[1].piezas ?? 0

  return (
    <div class="stack">
      <div class="spread">
        <h1>Reportes de consumo</h1>
        <button class="btn" onClick={exportar}>
          <Icono n="descarga" /> CSV
        </button>
      </div>
      <div class="row">
        {(
          [
            ['hoy', 'Hoy'],
            ['7d', 'Últimos 7 días'],
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
