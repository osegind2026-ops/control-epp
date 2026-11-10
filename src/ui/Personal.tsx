import { useMemo, useState } from 'preact/hooks'
import { tipoDe, TIPOS_TRABAJADOR, type TipoNormal } from '../domain/logica'
import type { Trabajador } from '../domain/types'
import { normalizar } from '../lib/util'
import { importarPadron, leerPadronCSV } from '../state/respaldo'
import * as S from '../state/store'
import { avisar, intentar, Vacio } from './comunes'
import { Icono } from './iconos'
import { FormTrabajador, LectorGafete } from './Trabajador'

export function PantallaPersonal() {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'permanente' | 'temporal' | 'eventual' | 'inactivos'>('todos')
  const [editar, setEditar] = useState<Partial<Trabajador> | null>(null)
  const [gafete, setGafete] = useState(false)

  const lista = useMemo(() => {
    const t = normalizar(q)
    return [...S.personal.value.values()]
      .filter((p) => {
        if (filtro === 'inactivos') return !p.activo
        if (!p.activo) return false
        if ((filtro === 'eventual' || filtro === 'temporal' || filtro === 'permanente') && tipoDe(p) !== filtro) return false
        return !t || normalizar(`${p.rpe} ${p.nombre} ${p.area}`).includes(t)
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [S.personal.value, q, filtro])

  const resguardosPor = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of S.resguardosActivos.value) m.set(r.rpe, (m.get(r.rpe) ?? 0) + 1)
    return m
  }, [S.resguardosActivos.value])

  const importar = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]
    ;(e.target as HTMLInputElement).value = ''
    if (!f) return
    const nuevos = leerPadronCSV(await f.text())
    if (!nuevos.length) return avisar('No se encontraron trabajadores en el archivo.', { tipo: 'bad' })
    const r = await intentar(() => importarPadron(nuevos))
    if (r) avisar(`✓ Padrón cargado: ${r.nuevos} nuevos, ${r.actualizados} actualizados`)
  }

  const cuenta = (tipo: TipoNormal) => [...S.personal.value.values()].filter((p) => p.activo && tipoDe(p) === tipo).length

  return (
    <div class="stack">
      <div class="spread">
        <h1>Personal</h1>
        <div class="row">
          <button class="btn primary" onClick={() => setEditar({ tipo: 'eventual' })}>
            <Icono n="mas1" /> Alta de trabajador
          </button>
          <button class="btn" onClick={() => setGafete(true)}>
            <Icono n="gafete" /> Leer gafete
          </button>
          <label class="btn" style={{ cursor: 'pointer' }}>
            <Icono n="subir" /> Importar padrón CSV
            <input type="file" accept=".csv,text/csv" hidden onChange={importar} />
          </label>
        </div>
      </div>
      <p class="muted small">
        {cuenta('permanente')} permanentes · {cuenta('temporal')} temporales · {cuenta('eventual')} eventuales (el tipo lo corrige un administrador o el encargado de almacén al editar al trabajador). El CSV acepta el formato <span class="mono">rpe,nombre,area,puesto,casillero</span> o
        simplemente <span class="mono">RPE,Nombre,Área</span>.
      </p>
      <div class="row">
        <div class="campo-buscar mini grow" style={{ minWidth: '220px' }}>
          <Icono n="buscar" />
          <input class="input" id="p-buscar" placeholder="RPE, nombre o área" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </div>
        {(
          [
            ['todos', 'Todos'],
            ['permanente', 'Permanentes'],
            ['temporal', 'Temporales'],
            ['eventual', 'Eventuales'],
            ['inactivos', 'Inactivos'],
          ] as const
        ).map(([id, txt]) => (
          <button key={id} class="chip" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>
            {txt}
          </button>
        ))}
      </div>
      {lista.length === 0 ? (
        <Vacio>No hay trabajadores con este filtro.</Vacio>
      ) : (
        <div class="tabla-wrap" style={{ maxHeight: '70vh' }}>
          <table>
            <thead>
              <tr>
                <th>RPE</th>
                <th>Nombre</th>
                <th>Área</th>
                <th>Tipo</th>
                <th>Tallas</th>
                <th class="num">Resguardos</th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, 400).map((p) => {
                const tipo = tipoDe(p)
                return (
                  <tr key={p.rpe} class="clic" onClick={() => setEditar(p)}>
                    <td class="mono">{p.rpe}</td>
                    <td>{p.nombre}</td>
                    <td class="small">{p.area}</td>
                    <td>
                      <span class={`badge ${tipo === 'permanente' ? 'ok' : tipo === 'temporal' ? 'prest' : 'warn'}`}>{TIPOS_TRABAJADOR[tipo]}</span>
                    </td>
                    <td class="small">
                      {Object.entries(p.tallas)
                        .map(([m, v]) => `${S.materialesPorId.value.get(m)?.nombre.replace(/^Guante (de )?/, 'G. ') ?? m}: ${v}`)
                        .join(' · ')}
                    </td>
                    <td class="num">{resguardosPor.get(p.rpe) ?? ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {lista.length > 400 && <p class="muted small">Se muestran 400 de {lista.length}. Use el buscador.</p>}
      {editar && <FormTrabajador inicial={editar} onCerrar={() => setEditar(null)} onListo={() => setEditar(null)} />}
      {gafete && (
        <LectorGafete
          onCerrar={() => setGafete(false)}
          onElegir={(t) => {
            setGafete(false)
            setEditar(t)
          }}
        />
      )}
    </div>
  )
}
