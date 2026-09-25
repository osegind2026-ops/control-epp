import { useMemo, useState } from 'preact/hooks'
import { ETIQUETA_NIVEL, existencia, nivelStock, tieneTallas, variantesDe } from '../domain/logica'
import type { Material, TipoMovimiento } from '../domain/types'
import { descargarArchivo, fechaDeTs, horaLocal, normalizar, plural } from '../lib/util'
import { csvKardex, nombreArchivo } from '../state/respaldo'
import { ajustarExistencia, ErrorNegocio, registrarEntrada, traspasar } from '../state/servicios'
import * as S from '../state/store'
import { puedeInventario } from '../state/permisos'
import { avisar, confirmar, FotoMaterial, intentar, Modal, SelectorMotivo, Talla, Vacio } from './comunes'
import { Icono } from './iconos'

type TipoOp = 'entrada' | 'traspaso' | 'ajuste'

const TITULO_OP: Record<TipoOp, string> = { entrada: 'Entrada de material', traspaso: 'Traspaso entre almacenes', ajuste: 'Ajuste por conteo' }

function ModalMovimiento(props: { tipo: TipoOp; materialId?: string; varianteId?: string; ubicacionId?: string; onCerrar: () => void }) {
  const mats = S.materialesActivos.value
  const ubis = S.ubicacionesActivas.value
  const [materialId, setMaterialId] = useState(props.materialId ?? mats[0]?.id ?? '')
  const m = S.materialesPorId.value.get(materialId)
  const [varianteId, setVarianteId] = useState(props.varianteId ?? (m && tieneTallas(m) ? variantesDe(m)[0] : ''))
  const [ubicacionId, setUbicacionId] = useState(props.ubicacionId ?? S.ubicacionDespacho.value?.id ?? '')
  const [destinoId, setDestinoId] = useState(ubis.find((u) => u.id !== (props.ubicacionId ?? S.ubicacionDespacho.value?.id))?.id ?? '')
  const [cantidad, setCantidad] = useState('')
  const [motivoId, setMotivoId] = useState(props.tipo === 'entrada' ? 'entr_compra' : props.tipo === 'ajuste' ? 'aju_conteo' : '')
  const [ref, setRef] = useState('')
  const [nota, setNota] = useState('')

  const actual = existencia(S.existencias.value, materialId, varianteId, ubicacionId)
  const n = parseInt(cantidad, 10)

  const cambiarMaterial = (id: string) => {
    setMaterialId(id)
    const nuevo = S.materialesPorId.value.get(id)
    setVarianteId(nuevo && tieneTallas(nuevo) ? variantesDe(nuevo)[0] : '')
  }

  const guardar = async () => {
    const ok = await intentar(async () => {
      if (props.tipo === 'entrada') {
        await registrarEntrada({ materialId, varianteId, ubicacionId, cantidad: n, motivoId, ref, nota })
        avisar(`✓ Entrada de ${n} registrada`)
      } else if (props.tipo === 'traspaso') {
        await traspasar({ materialId, varianteId, origenId: ubicacionId, destinoId, cantidad: n, nota })
        avisar(`✓ Traspaso de ${n} registrado`)
      } else {
        if (isNaN(n)) throw new ErrorNegocio('Ingrese el conteo físico.')
        const dif = await ajustarExistencia({ materialId, varianteId, ubicacionId, conteo: n, motivoId, nota })
        avisar(dif === 0 ? 'Sin diferencia: no se registró ajuste' : `✓ Ajuste registrado (${dif > 0 ? '+' : ''}${dif})`)
      }
      return true
    })
    if (ok) props.onCerrar()
  }

  return (
    <Modal
      titulo={TITULO_OP[props.tipo]}
      onCerrar={props.onCerrar}
      acciones={
        <>
          <button class="btn" onClick={props.onCerrar}>
            Cancelar
          </button>
          <button class="btn primary" disabled={isNaN(n) || (props.tipo !== 'ajuste' && n <= 0) || (props.tipo !== 'traspaso' && !motivoId)} onClick={guardar}>
            Guardar
          </button>
        </>
      }
    >
      <label class="campo">
        Material
        <select class="input" id="mov-material" value={materialId} onChange={(e) => cambiarMaterial((e.target as HTMLSelectElement).value)}>
          {mats.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>
      </label>
      {m && tieneTallas(m) && (
        <div class="row" role="group" aria-label="Talla" style={{ gap: '6px' }}>
          {m.variantes
            .filter((v) => v.activo)
            .map((v) => (
              <button key={v.id} class="chip" aria-pressed={v.id === varianteId} onClick={() => setVarianteId(v.id)}>
                {v.color && <span class="swatch" style={{ background: v.color, marginRight: '4px' }} />}
                {v.id}
              </button>
            ))}
        </div>
      )}
      <div class="row" style={{ alignItems: 'start' }}>
        <label class="campo grow">
          {props.tipo === 'traspaso' ? 'Desde' : 'Almacén'}
          <select class="input" id="mov-ubicacion" value={ubicacionId} onChange={(e) => setUbicacionId((e.target as HTMLSelectElement).value)}>
            {ubis.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </label>
        {props.tipo === 'traspaso' && (
          <label class="campo grow">
            Hacia
            <select class="input" id="mov-destino" value={destinoId} onChange={(e) => setDestinoId((e.target as HTMLSelectElement).value)}>
              {ubis
                .filter((u) => u.id !== ubicacionId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      <div class="row" style={{ alignItems: 'start' }}>
        <label class="campo" style={{ width: '150px' }}>
          {props.tipo === 'ajuste' ? 'Conteo físico' : 'Cantidad'}
          <input class="input" id="mov-cantidad" type="number" inputMode="numeric" min={0} value={cantidad} onInput={(e) => setCantidad((e.target as HTMLInputElement).value)} />
        </label>
        <div class="grow muted small" style={{ paddingTop: '26px' }}>
          En sistema: <strong>{actual}</strong>
          {props.tipo === 'ajuste' && !isNaN(n) && n !== actual && (
            <span class={n > actual ? 'pos' : 'neg'}>
              {' '}
              · diferencia {n > actual ? '+' : ''}
              {n - actual}
            </span>
          )}
        </div>
      </div>
      {props.tipo !== 'traspaso' && (
        <label class="campo">
          Motivo
          <SelectorMotivo id="mov-motivo" tipo={props.tipo === 'entrada' ? 'entrada' : 'ajuste'} valor={motivoId} onCambio={setMotivoId} />
        </label>
      )}
      {props.tipo === 'entrada' && (
        <label class="campo">
          Referencia (orden de compra, vale…)
          <input class="input" id="mov-ref" value={ref} onInput={(e) => setRef((e.target as HTMLInputElement).value)} />
        </label>
      )}
      <label class="campo">
        Nota (opcional)
        <input class="input" id="mov-nota" value={nota} onInput={(e) => setNota((e.target as HTMLInputElement).value)} />
      </label>
    </Modal>
  )
}

// ---------- Existencias ----------

function filasMaterial(m: Material) {
  const ubis = S.ubicacionesActivas.value
  return variantesDe(m).map((v) => {
    const porUbi = ubis.map((u) => existencia(S.existencias.value, m.id, v, u.id))
    const total = porUbi.reduce((a, b) => a + b, 0)
    const minimo = m.stockMin[v] ?? 0
    return { varianteId: v, porUbi, total, minimo, nivel: nivelStock(total, minimo) }
  })
}

function Existencias({ abrir }: { abrir: (t: TipoOp, m?: string, v?: string) => void }) {
  const ubis = S.ubicacionesActivas.value
  const despacho = S.ubicacionDespacho.value
  const [soloAlertas, setSoloAlertas] = useState(false)
  const datos = S.materialesActivos.value.map((m) => ({ m, filas: filasMaterial(m) }))
  const reabastecer = datos.flatMap(({ m, filas }) => filas.filter((f) => f.nivel > 0).map((f) => ({ m, f })))
  const mover = despacho
    ? datos.flatMap(({ m, filas }) =>
        filas
          .filter((f) => {
            const enDespacho = f.porUbi[ubis.findIndex((u) => u.id === despacho.id)] ?? 0
            return enDespacho <= f.minimo && f.total - enDespacho > 0
          })
          .map((f) => ({ m, f })),
      )
    : []

  return (
    <div class="stack">
      <div class="kpis">
        <button class="kpi" style={{ textAlign: 'left' }} onClick={() => setSoloAlertas(!soloAlertas)}>
          <span>Por reabastecer</span>
          <b style={{ color: reabastecer.length ? 'var(--bad)' : undefined }}>{reabastecer.length}</b>
        </button>
        <div class="kpi">
          <span>Surtir {despacho?.nombre ?? 'despacho'}</span>
          <b style={{ color: mover.length ? 'var(--warn)' : undefined }}>{mover.length}</b>
        </div>
        <div class="kpi">
          <span>Materiales activos</span>
          <b>{datos.length}</b>
        </div>
      </div>

      {mover.length > 0 && (
        <div class="aviso warn">
          <Icono n="traspaso" />
          <div>
            <strong>Conviene traspasar al {despacho?.nombre}:</strong>{' '}
            {mover
              .slice(0, 6)
              .map(({ m, f }) => S.nombreMaterial(m.id, f.varianteId))
              .join(', ')}
            {mover.length > 6 && '…'}
          </div>
        </div>
      )}

      <div class="row">
        {puedeInventario() && (
          <>
            <button class="btn primary" onClick={() => abrir('entrada')}>
              <Icono n="entrada" /> Entrada
            </button>
            <button class="btn" onClick={() => abrir('traspaso')}>
              <Icono n="traspaso" /> Traspaso
            </button>
            <button class="btn" onClick={() => abrir('ajuste')}>
              <Icono n="ajuste" /> Ajuste
            </button>
          </>
        )}
        <label class="check" style={{ marginLeft: 'auto' }}>
          <input type="checkbox" checked={soloAlertas} onChange={(e) => setSoloAlertas((e.target as HTMLInputElement).checked)} />
          Solo por reabastecer
        </label>
      </div>

      <div class="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Material</th>
              {ubis.map((u) => (
                <th key={u.id} class="num">
                  {u.nombre}
                  {u.esDespacho && ' ★'}
                </th>
              ))}
              <th class="num">Total</th>
              <th class="num">Mín.</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {datos.map(({ m, filas }) => {
              const visibles = soloAlertas ? filas.filter((f) => f.nivel > 0) : filas
              if (!visibles.length) return null
              return visibles.map((f, i) => (
                <tr key={m.id + f.varianteId} class={i > 0 ? 'subfila' : ''}>
                  <td>
                    {i === 0 || soloAlertas ? (
                      <div class="material-celda">
                        <FotoMaterial materialId={m.id} mini />
                        <div>
                          <strong>{m.nombre}</strong>
                          {f.varianteId && (
                            <div class="small">
                              Talla <Talla materialId={m.id} varianteId={f.varianteId} />
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ paddingLeft: '54px' }}>
                        Talla <Talla materialId={m.id} varianteId={f.varianteId} />
                      </div>
                    )}
                  </td>
                  {f.porUbi.map((n, j) => (
                    <td key={j} class={`num ${n < 0 ? 'neg' : ''}`}>
                      {n}
                    </td>
                  ))}
                  <td class="num">
                    <strong>{f.total}</strong>
                  </td>
                  <td class="num muted">{f.minimo}</td>
                  <td>
                    <span class={`badge ${['ok', 'warn', 'bad', 'bad'][f.nivel]}`}>{ETIQUETA_NIVEL[f.nivel]}</span>
                  </td>
                  <td>
                    {puedeInventario() && (
                    <div class="row" style={{ gap: '2px', flexWrap: 'nowrap' }}>
                      <button class="btn ghost sm" title="Entrada" aria-label={`Entrada de ${m.nombre}`} onClick={() => abrir('entrada', m.id, f.varianteId)}>
                        <Icono n="entrada" />
                      </button>
                      <button class="btn ghost sm" title="Traspaso" aria-label={`Traspaso de ${m.nombre}`} onClick={() => abrir('traspaso', m.id, f.varianteId)}>
                        <Icono n="traspaso" />
                      </button>
                      <button class="btn ghost sm" title="Ajuste" aria-label={`Ajuste de ${m.nombre}`} onClick={() => abrir('ajuste', m.id, f.varianteId)}>
                        <Icono n="ajuste" />
                      </button>
                    </div>
                    )}
                  </td>
                </tr>
              ))
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------- Conteo rápido ----------

const claveBorrador = (ubicacionId: string) => `conteo-borrador:${ubicacionId}`

function leerBorrador(ubicacionId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(claveBorrador(ubicacionId)) ?? '{}')
  } catch {
    return {}
  }
}

function guardarBorrador(ubicacionId: string, conteos: Record<string, string>) {
  try {
    if (Object.keys(conteos).length) localStorage.setItem(claveBorrador(ubicacionId), JSON.stringify(conteos))
    else localStorage.removeItem(claveBorrador(ubicacionId))
  } catch {
    /* sin almacenamiento: el conteo solo vive en pantalla */
  }
}

/**
 * Captura rápida de lo que hay físicamente en un almacén, pensada para el celular:
 * tarjetas grandes, botones − / + y «igual al sistema». El avance se guarda en el
 * equipo por si se cambia de pantalla. Solo se ajustan los renglones con diferencia.
 */
function Conteo() {
  const ubis = S.ubicacionesActivas.value
  const [ubicacionId, setUbicacionId] = useState(S.ubicacionDespacho.value?.id ?? '')
  const [conteos, setConteosEstado] = useState<Record<string, string>>(() => leerBorrador(S.ubicacionDespacho.value?.id ?? ''))
  const [motivoId, setMotivoId] = useState('aju_conteo')
  const [guardando, setGuardando] = useState(false)
  const [texto, setTexto] = useState('')
  const [categoria, setCategoria] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [revisar, setRevisar] = useState(false)

  const setConteos = (c: Record<string, string>) => {
    setConteosEstado(c)
    guardarBorrador(ubicacionId, c)
  }
  const cambiarUbicacion = (id: string) => {
    setUbicacionId(id)
    setConteosEstado(leerBorrador(id))
  }

  const filas = S.materialesActivos.value.flatMap((m) =>
    variantesDe(m).map((v) => ({ m, v, clave: `${m.id}|${v}`, sistema: existencia(S.existencias.value, m.id, v, ubicacionId) })),
  )
  const contadas = filas.filter((f) => (conteos[f.clave] ?? '') !== '')
  const cambios = contadas.filter((f) => parseInt(conteos[f.clave], 10) !== f.sistema)
  const buscar = normalizar(texto)
  const visibles = S.materialesActivos.value.filter(
    (m) =>
      (!categoria || m.categoriaId === categoria) &&
      (!buscar || normalizar(m.nombre).includes(buscar)) &&
      (!soloPendientes || variantesDe(m).some((v) => (conteos[`${m.id}|${v}`] ?? '') === '')),
  )

  const poner = (clave: string, valor: string) => setConteos({ ...conteos, [clave]: valor.replace(/[^0-9]/g, '') })
  const sumar = (clave: string, base: number, d: number) => {
    const actual = conteos[clave] === undefined || conteos[clave] === '' ? base : parseInt(conteos[clave], 10)
    poner(clave, String(Math.max(0, actual + d)))
  }

  const aplicar = async () => {
    setGuardando(true)
    let n = 0
    for (const f of cambios) {
      const ok = await intentar(() => ajustarExistencia({ materialId: f.m.id, varianteId: f.v, ubicacionId, conteo: parseInt(conteos[f.clave], 10), motivoId, nota: 'Conteo físico' }))
      if (ok !== undefined) n++
    }
    setGuardando(false)
    setRevisar(false)
    setConteos({})
    avisar(`✓ Conteo aplicado: ${plural(n, 'ajuste', 'ajustes')}`)
  }

  const descartar = async () => {
    if (await confirmar('Descartar conteo', '¿Borrar lo capturado en este conteo?', 'Descartar', true)) setConteos({})
  }

  const ubi = ubis.find((u) => u.id === ubicacionId)
  return (
    <div class="stack conteo">
      <p class="muted small">
        Cuente lo que hay en el almacén y escriba la cantidad, o toque <strong>✓</strong> si coincide con el sistema. El avance se guarda en este equipo; al final revise las diferencias y aplíquelas.
      </p>
      <div class="filtros">
        <label class="campo">
          Almacén
          <select class="input" id="conteo-ubi" value={ubicacionId} onChange={(e) => cambiarUbicacion((e.target as HTMLSelectElement).value)}>
            {ubis.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </label>
        <label class="campo grow">
          Buscar
          <input class="input" id="conteo-buscar" type="search" placeholder="Material…" value={texto} onInput={(e) => setTexto((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <div class="chips conteo-chips" role="group" aria-label="Categoría">
        <button class="chip" aria-pressed={!categoria} onClick={() => setCategoria('')}>
          Todo
        </button>
        {S.categorias.value.map((c) => (
          <button key={c.id} class="chip" aria-pressed={categoria === c.id} onClick={() => setCategoria(categoria === c.id ? '' : c.id)}>
            {c.nombre}
          </button>
        ))}
      </div>
      <label class="check">
        <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes((e.target as HTMLInputElement).checked)} />
        Mostrar solo lo que falta contar
      </label>

      <div class="conteo-lista">
        {visibles.map((m) => (
          <div key={m.id} class="card conteo-card">
            <div class="material-celda">
              <FotoMaterial materialId={m.id} mini />
              <strong>{m.nombre}</strong>
            </div>
            {variantesDe(m).map((v) => {
              const clave = `${m.id}|${v}`
              const sistema = existencia(S.existencias.value, m.id, v, ubicacionId)
              const valor = conteos[clave] ?? ''
              const dif = valor === '' ? null : parseInt(valor, 10) - sistema
              return (
                <div key={clave} class={`conteo-fila ${valor !== '' ? (dif ? 'difiere' : 'igual') : ''}`}>
                  <span class="conteo-talla">{v ? <Talla materialId={m.id} varianteId={v} /> : <span class="muted small">Piezas</span>}</span>
                  <span class="muted small conteo-sistema">
                    Sistema <b>{sistema}</b>
                    {dif !== null && dif !== 0 && !isNaN(dif) && <span class={`badge ${dif > 0 ? 'ok' : 'bad'}`}>{dif > 0 ? `+${dif}` : dif}</span>}
                  </span>
                  <div class="conteo-captura">
                    <button class="btn sm" aria-label="Uno menos" onClick={() => sumar(clave, sistema, -1)}>
                      −
                    </button>
                    <input
                      class="input"
                      id={`conteo-${clave}`}
                      inputMode="numeric"
                      enterKeyHint="next"
                      aria-label={`Conteo de ${S.nombreMaterial(m.id, v)}`}
                      placeholder="—"
                      value={valor}
                      onInput={(e) => poner(clave, (e.target as HTMLInputElement).value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return
                        const campos = [...document.querySelectorAll<HTMLInputElement>('.conteo-captura input')]
                        campos[campos.indexOf(e.target as HTMLInputElement) + 1]?.focus()
                      }}
                    />
                    <button class="btn sm" aria-label="Uno más" onClick={() => sumar(clave, sistema, 1)}>
                      +
                    </button>
                    <button class={`btn sm ${valor !== '' && !dif ? 'primary' : 'ghost'}`} title="Igual al sistema" aria-label="Igual al sistema" onClick={() => poner(clave, String(sistema))}>
                      ✓
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        {!visibles.length && <Vacio>No hay materiales con ese filtro.</Vacio>}
      </div>

      <div class="conteo-barra">
        <span class="small grow">
          <strong>
            {contadas.length} de {filas.length}
          </strong>{' '}
          contados · {plural(cambios.length, 'diferencia', 'diferencias')}
        </span>
        {Object.keys(conteos).length > 0 && (
          <button class="btn ghost sm" onClick={descartar}>
            Descartar
          </button>
        )}
        <button class="btn primary" disabled={!cambios.length} onClick={() => setRevisar(true)}>
          Revisar y aplicar
        </button>
      </div>

      {revisar && (
        <Modal
          titulo={`Ajustes del conteo · ${ubi?.nombre ?? ''}`}
          onCerrar={() => setRevisar(false)}
          acciones={
            <>
              <button class="btn" onClick={() => setRevisar(false)}>
                Seguir contando
              </button>
              <button class="btn primary" disabled={!motivoId || guardando} onClick={aplicar}>
                {guardando ? 'Aplicando…' : `Aplicar ${plural(cambios.length, 'ajuste', 'ajustes')}`}
              </button>
            </>
          }
        >
          <label class="campo">
            Motivo
            <SelectorMotivo id="conteo-motivo" tipo="ajuste" valor={motivoId} onCambio={setMotivoId} />
          </label>
          <div class="tabla-wrap">
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th class="num">Sistema</th>
                  <th class="num">Conteo</th>
                  <th class="num">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {cambios.map((f) => {
                  const dif = parseInt(conteos[f.clave], 10) - f.sistema
                  return (
                    <tr key={f.clave}>
                      <td>{S.nombreMaterial(f.m.id, f.v)}</td>
                      <td class="num">{f.sistema}</td>
                      <td class="num">{conteos[f.clave]}</td>
                      <td class={`num ${dif > 0 ? 'pos' : 'neg'}`}>{dif > 0 ? `+${dif}` : dif}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ---------- Kardex ----------

const TIPOS: Record<TipoMovimiento, string> = {
  INICIAL: 'Saldo inicial',
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  DEVOLUCION: 'Devolución',
  AJUSTE: 'Ajuste',
  TRASPASO: 'Traspaso',
  ANULACION: 'Anulación',
}

function Kardex() {
  const [material, setMaterial] = useState('')
  const [tipo, setTipo] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const ubis = new Map(S.ubicaciones.value.map((u) => [u.id, u.nombre]))

  const lista = useMemo(() => {
    const saldos = new Map<string, number>()
    const conSaldo = S.movimientos.value.map((m) => {
      const k = `${m.materialId}|${m.varianteId}|${m.ubicacionId}`
      const s = (saldos.get(k) ?? 0) + m.cantidad
      saldos.set(k, s)
      return { ...m, saldo: s, fecha: fechaDeTs(m.ts) }
    })
    return conSaldo
      .filter(
        (m) =>
          (!material || m.materialId === material) &&
          (!tipo || m.tipo === tipo) &&
          (!ubicacion || m.ubicacionId === ubicacion) &&
          (!desde || m.fecha >= desde) &&
          (!hasta || m.fecha <= hasta),
      )
      .reverse()
  }, [S.movimientos.value, material, tipo, ubicacion, desde, hasta])

  return (
    <div class="stack">
      <div class="filtros">
        <select class="input" id="k-material" aria-label="Material" value={material} onChange={(e) => setMaterial((e.target as HTMLSelectElement).value)}>
          <option value="">Todos los materiales</option>
          {S.materialesActivos.value.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
        <select class="input" id="k-tipo" aria-label="Tipo" value={tipo} onChange={(e) => setTipo((e.target as HTMLSelectElement).value)}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select class="input" id="k-ubi" aria-label="Almacén" value={ubicacion} onChange={(e) => setUbicacion((e.target as HTMLSelectElement).value)}>
          <option value="">Todos los almacenes</option>
          {S.ubicacionesActivas.value.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
        <input class="input" id="k-desde" type="date" aria-label="Desde" value={desde} onInput={(e) => setDesde((e.target as HTMLInputElement).value)} />
        <input class="input" id="k-hasta" type="date" aria-label="Hasta" value={hasta} onInput={(e) => setHasta((e.target as HTMLInputElement).value)} />
        <button class="btn" onClick={() => descargarArchivo(nombreArchivo('CFE_Kardex', 'csv'), csvKardex([...lista].reverse()), 'text/csv;charset=utf-8')}>
          <Icono n="descarga" /> CSV
        </button>
      </div>
      {lista.length === 0 ? (
        <Vacio>Sin movimientos para este filtro.</Vacio>
      ) : (
        <div class="tabla-wrap" style={{ maxHeight: '65vh' }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Material</th>
                <th>Almacén</th>
                <th>Tipo</th>
                <th class="num">Cant.</th>
                <th class="num">Saldo</th>
                <th>Referencia · motivo</th>
                <th>Registró</th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, 400).map((m) => (
                <tr key={m.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {m.fecha} {horaLocal(new Date(m.ts))}
                  </td>
                  <td>{S.nombreMaterial(m.materialId, m.varianteId)}</td>
                  <td>{ubis.get(m.ubicacionId)}</td>
                  <td>{TIPOS[m.tipo]}</td>
                  <td class={`num ${m.cantidad >= 0 ? 'pos' : 'neg'}`}>{m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}</td>
                  <td class="num">{m.saldo}</td>
                  <td>
                    {[m.ref, m.motivo, m.nota].filter(Boolean).join(' · ')}
                  </td>
                  <td class="small">
                    {m.usuarioNombre}
                    <span class="muted"> · {m.equipo}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lista.length > 400 && <p class="muted small">Se muestran los 400 más recientes. Descargue el CSV para ver todos.</p>}
    </div>
  )
}

export function PantallaInventario() {
  const [tab, setTab] = useState<'existencias' | 'conteo' | 'kardex'>('existencias')
  const [op, setOp] = useState<{ tipo: TipoOp; m?: string; v?: string } | null>(null)
  return (
    <div class="stack">
      <h1>Inventario</h1>
      <div class="tabs" role="tablist">
        {(
          [
            ['existencias', 'Existencias'],
            ...(puedeInventario() ? ([['conteo', 'Conteo rápido']] as const) : []),
            ['kardex', 'Kardex'],
          ] as const
        ).map(([id, txt]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {txt}
          </button>
        ))}
      </div>
      {tab === 'existencias' && <Existencias abrir={(tipo, m, v) => setOp({ tipo, m, v })} />}
      {tab === 'conteo' && <Conteo />}
      {tab === 'kardex' && <Kardex />}
      {op && <ModalMovimiento tipo={op.tipo} materialId={op.m} varianteId={op.v} onCerrar={() => setOp(null)} />}
    </div>
  )
}
