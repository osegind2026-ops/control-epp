import { useState } from 'preact/hooks'
import { SIN_TALLA, type Categoria, type Kit, type KitLinea, type Material, type Motivo, type TipoMotivo, type Variante } from '../domain/types'
import { comprimirFoto } from '../lib/imagen'
import { normalizar } from '../lib/util'
import { guardarMaterial, guardarRegistro, nuevoId } from '../state/servicios'
import * as S from '../state/store'
import { avisar, FotoMaterial, intentar, Modal } from './comunes'
import { ICONOS_MATERIAL, IlustracionMaterial, Icono } from './iconos'
import { listaAreas } from './Trabajador'

// ---------- Materiales ----------

function EditorMaterial({ inicial, onCerrar }: { inicial: Material | null; onCerrar: () => void }) {
  const nuevo = !inicial
  const usados = new Set(inicial ? S.movimientos.value.filter((m) => m.materialId === inicial.id).map((m) => m.varianteId) : [])
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [categoriaId, setCategoriaId] = useState(inicial?.categoriaId ?? S.categorias.value.find((c) => c.id === 'otros')?.id ?? S.categorias.value[0]?.id ?? '')
  const [tipo, setTipo] = useState<Material['tipo']>(inicial?.tipo ?? 'consumible')
  const [icono, setIcono] = useState(inicial?.icono ?? 'caja')
  const [variantes, setVariantes] = useState<Variante[]>(inicial?.variantes ?? [])
  const [stockMin, setStockMin] = useState<Record<string, number>>(inicial?.stockMin ?? { [SIN_TALLA]: 5 })
  const [activo, setActivo] = useState(inicial?.activo ?? true)
  const [plazoDias, setPlazoDias] = useState(inicial?.plazoDias ?? 1)
  const [foto, setFoto] = useState<string | null | undefined>(undefined) // undefined = sin cambios, null = quitar
  const fotoActual = foto === undefined ? (inicial?.fotoId ? S.fotos.value.get(inicial.fotoId) : undefined) : foto ?? undefined

  const cambiarVariante = (i: number, c: Partial<Variante>) => setVariantes(variantes.map((v, j) => (j === i ? { ...v, ...c } : v)))

  const elegirFoto = async (e: Event) => {
    const archivo = (e.target as HTMLInputElement).files?.[0]
    if (!archivo) return
    const data = await intentar(() => comprimirFoto(archivo))
    if (data) setFoto(data)
  }

  const guardar = async () => {
    const limpias = variantes.map((v) => ({ ...v, id: v.id.trim().toUpperCase(), etiqueta: v.etiqueta.trim() || v.id.trim().toUpperCase() })).filter((v) => v.id)
    const mins: Record<string, number> = {}
    if (limpias.length) for (const v of limpias) mins[v.id] = stockMin[v.id] ?? 0
    else mins[SIN_TALLA] = stockMin[SIN_TALLA] ?? 0
    const id = inicial?.id ?? `${normalizar(nombre).replace(/[^a-z0-9]+/g, '_').slice(0, 24)}_${nuevoId('').slice(-4)}`
    const ok = await intentar(async () => {
      await guardarMaterial(
        {
          id,
          nombre,
          categoriaId,
          tipo,
          icono,
          variantes: limpias,
          stockMin: mins,
          activo,
          orden: inicial?.orden ?? S.materiales.value.length + 1,
          fotoId: inicial?.fotoId,
          plazoDias: tipo === 'prestamo' ? plazoDias : undefined,
        },
        foto,
      )
      return true
    })
    if (ok) {
      avisar(nuevo ? `✓ ${nombre} agregado al catálogo` : '✓ Material actualizado')
      onCerrar()
    }
  }

  return (
    <Modal
      titulo={nuevo ? 'Nuevo material' : 'Editar material'}
      onCerrar={onCerrar}
      ancho
      acciones={
        <>
          <button class="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button class="btn primary" onClick={guardar}>
            Guardar
          </button>
        </>
      }
    >
      <div class="row" style={{ alignItems: 'start', gap: '16px' }}>
        <div class="stack" style={{ width: '180px', gap: '8px' }}>
          <span class="foto">{fotoActual ? <img src={fotoActual} alt="" /> : <IlustracionMaterial icono={icono} />}</span>
          <label class="btn sm soft" style={{ cursor: 'pointer' }}>
            <Icono n="camara" /> {fotoActual ? 'Cambiar foto' : 'Tomar o subir foto'}
            <input type="file" accept="image/*" capture="environment" hidden onChange={elegirFoto} />
          </label>
          {fotoActual && (
            <button class="btn sm ghost" onClick={() => setFoto(null)}>
              Quitar foto
            </button>
          )}
          {!fotoActual && (
            <div class="row" style={{ gap: '4px' }} role="group" aria-label="Ilustración">
              {ICONOS_MATERIAL.map((ic) => (
                <button
                  key={ic}
                  class="btn sm ghost"
                  aria-pressed={icono === ic}
                  style={{ padding: '4px', minHeight: '34px', width: '34px', background: icono === ic ? 'var(--accent-soft)' : undefined }}
                  onClick={() => setIcono(ic)}
                  aria-label={ic}
                >
                  <IlustracionMaterial icono={ic} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div class="stack grow" style={{ minWidth: '240px' }}>
          <label class="campo">
            Nombre
            <input class="input" id="mat-nombre" value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} />
          </label>
          <label class="campo">
            Categoría
            <select class="input" id="mat-cat" value={categoriaId} onChange={(e) => setCategoriaId((e.target as HTMLSelectElement).value)}>
              {S.categorias.value.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <div class="row" role="group" aria-label="Tipo">
            <button class="chip" aria-pressed={tipo === 'consumible'} onClick={() => setTipo('consumible')}>
              Consumible
            </button>
            <button class="chip" aria-pressed={tipo === 'resguardo'} onClick={() => setTipo('resguardo')}>
              Resguardo (uno por trabajador)
            </button>
            <button class="chip" aria-pressed={tipo === 'prestamo'} onClick={() => setTipo('prestamo')}>
              Préstamo (corto plazo)
            </button>
          </div>
          <p class="muted small">
            {tipo === 'consumible' && 'Se entrega y descuenta del inventario; no se devuelve.'}
            {tipo === 'resguardo' && 'Queda a cargo del trabajador. Solo puede tener uno; para darle otro se elige un motivo de reposición y el anterior se cierra.'}
            {tipo === 'prestamo' && 'Equipo que debe regresar pronto. Al prestarlo se piden nombre, RPE y extensión del supervisor y la fecha de devolución.'}
          </p>
          {tipo === 'prestamo' && (
            <label class="campo" style={{ maxWidth: '240px' }}>
              Días para devolverlo (0 = el mismo día)
              <input class="input" id="mat-plazo" type="number" min={0} max={60} value={plazoDias} onInput={(e) => setPlazoDias(Math.max(0, parseInt((e.target as HTMLInputElement).value, 10) || 0))} />
            </label>
          )}
          <label class="check">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo((e.target as HTMLInputElement).checked)} />
            Activo (aparece en el despacho)
          </label>
        </div>
      </div>

      <div class="stack" style={{ gap: '8px' }}>
        <div class="spread">
          <h3>Tallas y stock mínimo</h3>
          <button class="btn sm" onClick={() => setVariantes([...variantes, { id: '', etiqueta: '', activo: true }])}>
            <Icono n="mas1" /> Agregar talla
          </button>
        </div>
        {variantes.length === 0 ? (
          <label class="campo" style={{ maxWidth: '200px' }}>
            Stock mínimo
            <input
              class="input"
              id="mat-min"
              type="number"
              min={0}
              value={stockMin[SIN_TALLA] ?? 0}
              onInput={(e) => setStockMin({ ...stockMin, [SIN_TALLA]: parseInt((e.target as HTMLInputElement).value, 10) || 0 })}
            />
          </label>
        ) : (
          <div class="tabla-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Texto visible</th>
                  <th>Color</th>
                  <th class="num">Mínimo</th>
                  <th>Activa</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {variantes.map((v, i) => {
                  const bloqueada = usados.has(v.id) && !!v.id
                  return (
                    <tr key={i}>
                      <td>
                        <input
                          class="input"
                          id={`var-id-${i}`}
                          style={{ width: '80px', minHeight: '36px' }}
                          value={v.id}
                          disabled={bloqueada}
                          title={bloqueada ? 'Ya tiene movimientos; desactívela en lugar de cambiarla' : undefined}
                          onInput={(e) => cambiarVariante(i, { id: (e.target as HTMLInputElement).value.toUpperCase() })}
                        />
                      </td>
                      <td>
                        <input class="input" id={`var-et-${i}`} style={{ minHeight: '36px' }} value={v.etiqueta} placeholder={v.id} onInput={(e) => cambiarVariante(i, { etiqueta: (e.target as HTMLInputElement).value })} />
                      </td>
                      <td>
                        <input type="color" id={`var-color-${i}`} aria-label="Color" value={v.color ?? '#cccccc'} onInput={(e) => cambiarVariante(i, { color: (e.target as HTMLInputElement).value })} />
                        {v.color && (
                          <button class="btn ghost sm" aria-label="Quitar color" onClick={() => cambiarVariante(i, { color: undefined })}>
                            <Icono n="cerrar" />
                          </button>
                        )}
                      </td>
                      <td class="num">
                        <input
                          class="input"
                          id={`var-min-${i}`}
                          type="number"
                          min={0}
                          style={{ width: '80px', minHeight: '36px', textAlign: 'right' }}
                          value={stockMin[v.id] ?? 0}
                          onInput={(e) => setStockMin({ ...stockMin, [v.id]: parseInt((e.target as HTMLInputElement).value, 10) || 0 })}
                        />
                      </td>
                      <td>
                        <input type="checkbox" aria-label="Activa" checked={v.activo} onChange={(e) => cambiarVariante(i, { activo: (e.target as HTMLInputElement).checked })} />
                      </td>
                      <td>
                        {!bloqueada && (
                          <button class="btn ghost sm" aria-label="Eliminar talla" onClick={() => setVariantes(variantes.filter((_, j) => j !== i))}>
                            <Icono n="basura" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </Modal>
  )
}

function Materiales() {
  const [editar, setEditar] = useState<Material | null | 'nuevo'>(null)
  const [verInactivos, setVerInactivos] = useState(false)
  const cats = S.categorias.value
  const lista = S.materiales.value.filter((m) => verInactivos || m.activo).sort((a, b) => a.orden - b.orden)
  return (
    <div class="stack">
      <div class="row">
        <button class="btn primary" onClick={() => setEditar('nuevo')}>
          <Icono n="mas1" /> Nuevo material
        </button>
        <label class="check">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos((e.target as HTMLInputElement).checked)} />
          Mostrar inactivos
        </label>
      </div>
      {cats.map((c) => {
        const deCat = lista.filter((m) => m.categoriaId === c.id)
        if (!deCat.length) return null
        return (
          <div key={c.id} class="stack" style={{ gap: '8px' }}>
            <h3>{c.nombre}</h3>
            <div class="mosaico">
              {deCat.map((m) => (
                <button key={m.id} class={`tile ${m.tipo === 'resguardo' ? 'resg' : m.tipo === 'prestamo' ? 'prest' : ''}`} style={{ opacity: m.activo ? 1 : 0.5 }} onClick={() => setEditar(m)}>
                  <FotoMaterial materialId={m.id} />
                  <span class="tile-nombre">{m.nombre}</span>
                  <span class="tile-stock">{m.variantes.length ? m.variantes.filter((v) => v.activo).map((v) => v.id).join(' · ') : 'Sin tallas'}</span>
                  {m.tipo === 'resguardo' && <span class="badge resg">Resguardo</span>}
                  {m.tipo === 'prestamo' && <span class="badge prest">Préstamo · {m.plazoDias ?? 1} d</span>}
                  {!m.fotoId && <span class="badge warn">Sin foto</span>}
                </button>
              ))}
            </div>
          </div>
        )
      })}
      {editar && <EditorMaterial inicial={editar === 'nuevo' ? null : editar} onCerrar={() => setEditar(null)} />}
    </div>
  )
}

// ---------- Kits ----------

function EditorKit({ inicial, onCerrar }: { inicial: Kit | null; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '')
  const [lineas, setLineas] = useState<KitLinea[]>(inicial?.lineas ?? [])
  const [activo, setActivo] = useState(inicial?.activo ?? true)
  const areas = listaAreas()
  const cambiar = (i: number, c: Partial<KitLinea>) => setLineas(lineas.map((l, j) => (j === i ? { ...l, ...c } : l)))

  const guardar = async () => {
    if (!nombre.trim() || !lineas.length) return avisar('El kit necesita nombre y al menos un material.', { tipo: 'bad' })
    const ok = await intentar(async () => {
      await guardarRegistro('kits', {
        id: inicial?.id ?? nuevoId('KIT'),
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        lineas: lineas.map((l) => ({ ...l, areas: l.areas?.length ? l.areas : undefined })),
        orden: inicial?.orden ?? S.kits.value.length + 1,
        activo,
        actualizado: '',
      })
      return true
    })
    if (ok) onCerrar()
  }

  return (
    <Modal
      titulo={inicial ? 'Editar kit' : 'Nuevo kit'}
      onCerrar={onCerrar}
      ancho
      acciones={
        <>
          <button class="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button class="btn primary" onClick={guardar}>
            Guardar
          </button>
        </>
      }
    >
      <label class="campo">
        Nombre
        <input class="input" id="kit-nombre" value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} />
      </label>
      <label class="campo">
        Descripción
        <input class="input" id="kit-desc" value={descripcion} onInput={(e) => setDescripcion((e.target as HTMLInputElement).value)} />
      </label>
      <p class="muted small">
        El equipo de resguardo que el trabajador ya tiene se omite solo. La talla se toma de la última que usó el trabajador; si no hay, se pide en el ticket.
      </p>
      {lineas.map((l, i) => (
        <div key={i} class="card stack" style={{ gap: '8px', padding: '10px' }}>
          <div class="row" style={{ flexWrap: 'nowrap' }}>
            <select class="input grow" id={`kit-mat-${i}`} value={l.materialId} onChange={(e) => cambiar(i, { materialId: (e.target as HTMLSelectElement).value })}>
              {S.materialesActivos.value.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
            <input
              class="input"
              id={`kit-cant-${i}`}
              type="number"
              min={1}
              aria-label="Cantidad"
              style={{ width: '80px' }}
              value={l.cantidad}
              onInput={(e) => cambiar(i, { cantidad: parseInt((e.target as HTMLInputElement).value, 10) || 1 })}
            />
            <button class="btn ghost sm" aria-label="Quitar" onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>
              <Icono n="basura" />
            </button>
          </div>
          <details>
            <summary class="small" style={{ cursor: 'pointer' }}>
              {l.areas?.length ? `Solo para: ${l.areas.join(', ')}` : 'Para todas las áreas'}
            </summary>
            <div class="row" style={{ gap: '6px', marginTop: '8px' }}>
              {areas.map((a) => {
                const sel = l.areas?.includes(a) ?? false
                return (
                  <button
                    key={a}
                    class="chip"
                    aria-pressed={sel}
                    onClick={() => cambiar(i, { areas: sel ? (l.areas ?? []).filter((x) => x !== a) : [...(l.areas ?? []), a] })}
                  >
                    {a}
                  </button>
                )
              })}
            </div>
          </details>
          <label class="campo small">
            Agregar solo si el kit también entrega
            <select
              class="input"
              id={`kit-con-${i}`}
              value={l.conMaterial ?? ''}
              onChange={(e) => cambiar(i, { conMaterial: (e.target as HTMLSelectElement).value || undefined })}
            >
              <option value="">(siempre)</option>
              {lineas
                .filter((x) => x.materialId !== l.materialId)
                .map((x) => (
                  <option key={x.materialId} value={x.materialId}>
                    {S.nombreMaterial(x.materialId)}
                  </option>
                ))}
            </select>
          </label>
        </div>
      ))}
      <button class="btn" onClick={() => setLineas([...lineas, { materialId: S.materialesActivos.value[0]?.id ?? '', cantidad: 1 }])}>
        <Icono n="mas1" /> Agregar material
      </button>
      <label class="check">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo((e.target as HTMLInputElement).checked)} />
        Activo
      </label>
    </Modal>
  )
}

function Kits() {
  const [editar, setEditar] = useState<Kit | null | 'nuevo'>(null)
  return (
    <div class="stack">
      <button class="btn primary" style={{ justifySelf: 'start' }} onClick={() => setEditar('nuevo')}>
        <Icono n="mas1" /> Nuevo kit
      </button>
      {S.kits.value.map((k) => (
        <button key={k.id} class="card stack" style={{ textAlign: 'left', gap: '6px', opacity: k.activo ? 1 : 0.5 }} onClick={() => setEditar(k)}>
          <strong>{k.nombre}</strong>
          {k.descripcion && <span class="muted small">{k.descripcion}</span>}
          <span class="small">
            {k.lineas.map((l) => `${S.nombreMaterial(l.materialId)}${l.cantidad > 1 ? ` ×${l.cantidad}` : ''}${l.areas?.length ? ` (${l.areas.length} áreas)` : ''}`).join(' · ')}
          </span>
        </button>
      ))}
      {editar && <EditorKit inicial={editar === 'nuevo' ? null : editar} onCerrar={() => setEditar(null)} />}
    </div>
  )
}

// ---------- Motivos ----------

const TIPOS_MOTIVO: { id: TipoMotivo; nombre: string; ayuda: string }[] = [
  { id: 'entrega', nombre: 'Entrega de resguardo', ayuda: 'Se piden al entregar casco, faja, arnés u otro equipo de resguardo.' },
  { id: 'devolucion', nombre: 'Devolución', ayuda: 'Estado del equipo que regresa: si reingresa al almacén o se da de baja.' },
  { id: 'ajuste', nombre: 'Ajuste de inventario', ayuda: 'Justifican las diferencias de conteo.' },
  { id: 'anulacion', nombre: 'Anulación de entrega', ayuda: 'Se piden para anular una entrega ya registrada.' },
  { id: 'entrada', nombre: 'Entrada de material', ayuda: 'Origen del material que ingresa.' },
]

function Motivos() {
  const admin = S.sesion.value?.esAdmin
  const [nuevo, setNuevo] = useState<Record<string, string>>({})
  const guardar = (m: Motivo) => intentar(() => guardarRegistro('motivos', m))
  return (
    <div class="stack">
      {!admin && <div class="aviso info">Solo un administrador puede modificar la lista de motivos autorizados.</div>}
      {TIPOS_MOTIVO.map((t) => {
        const lista = S.motivos.value.filter((m) => m.tipo === t.id).sort((a, b) => a.orden - b.orden)
        return (
          <div key={t.id} class="card stack" style={{ gap: '8px' }}>
            <h3>{t.nombre}</h3>
            <p class="muted small">{t.ayuda}</p>
            {lista.map((m) => (
              <div key={m.id} class="row" style={{ opacity: m.activo ? 1 : 0.55 }}>
                <span class="grow">{m.texto}</span>
                {t.id === 'entrega' && (
                  <select
                    class="input"
                    id={`mot-cierra-${m.id}`}
                    style={{ width: 'auto', minHeight: '34px', padding: '4px 8px', fontSize: '13px' }}
                    disabled={!admin}
                    value={m.cierraPrevio ?? ''}
                    aria-label="Qué pasa con el resguardo anterior"
                    onChange={(e) => guardar({ ...m, cierraPrevio: ((e.target as HTMLSelectElement).value || undefined) as Motivo['cierraPrevio'] })}
                  >
                    <option value="">No cierra el anterior</option>
                    <option value="baja">Cierra el anterior (baja)</option>
                    <option value="reingresa">Cierra el anterior (reingresa)</option>
                  </select>
                )}
                {t.id === 'devolucion' && (
                  <label class="check small">
                    <input type="checkbox" disabled={!admin} checked={!!m.reingresa} onChange={(e) => guardar({ ...m, reingresa: (e.target as HTMLInputElement).checked })} />
                    Reingresa
                  </label>
                )}
                <label class="check small">
                  <input type="checkbox" disabled={!admin} checked={m.activo} onChange={(e) => guardar({ ...m, activo: (e.target as HTMLInputElement).checked })} />
                  Activo
                </label>
              </div>
            ))}
            {admin && (
              <div class="row" style={{ flexWrap: 'nowrap' }}>
                <input
                  class="input grow"
                  id={`mot-nuevo-${t.id}`}
                  placeholder="Nuevo motivo"
                  value={nuevo[t.id] ?? ''}
                  onInput={(e) => setNuevo({ ...nuevo, [t.id]: (e.target as HTMLInputElement).value })}
                />
                <button
                  class="btn"
                  disabled={!nuevo[t.id]?.trim()}
                  onClick={async () => {
                    await guardar({ id: nuevoId('MOT'), tipo: t.id, texto: nuevo[t.id].trim(), orden: lista.length + 1, activo: true, reingresa: t.id === 'devolucion' ? false : undefined })
                    setNuevo({ ...nuevo, [t.id]: '' })
                  }}
                >
                  Agregar
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------- Categorías ----------

function Categorias() {
  const [nueva, setNueva] = useState('')
  const guardar = (c: Categoria) => intentar(() => guardarRegistro('categorias', c))
  return (
    <div class="card stack" style={{ maxWidth: '520px' }}>
      {S.categorias.value.map((c) => (
        <input
          key={c.id}
          class="input"
          id={`cat-${c.id}`}
          aria-label="Nombre de la categoría"
          defaultValue={c.nombre}
          onBlur={(e) => {
            const v = (e.target as HTMLInputElement).value.trim()
            if (v && v !== c.nombre) guardar({ ...c, nombre: v })
          }}
        />
      ))}
      <div class="row" style={{ flexWrap: 'nowrap' }}>
        <input class="input grow" id="cat-nueva" placeholder="Nueva categoría" value={nueva} onInput={(e) => setNueva((e.target as HTMLInputElement).value)} />
        <button
          class="btn"
          disabled={!nueva.trim()}
          onClick={async () => {
            await guardar({ id: nuevoId('CAT'), nombre: nueva.trim(), orden: S.categorias.value.length + 1 })
            setNueva('')
          }}
        >
          Agregar
        </button>
      </div>
    </div>
  )
}

export function PantallaCatalogo() {
  const [tab, setTab] = useState<'materiales' | 'kits' | 'motivos' | 'categorias'>('materiales')
  return (
    <div class="stack">
      <h1>Catálogo</h1>
      <div class="tabs" role="tablist">
        {(
          [
            ['materiales', 'Materiales'],
            ['kits', 'Kits'],
            ['motivos', 'Motivos autorizados'],
            ['categorias', 'Categorías'],
          ] as const
        ).map(([id, txt]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {txt}
          </button>
        ))}
      </div>
      {tab === 'materiales' && <Materiales />}
      {tab === 'kits' && <Kits />}
      {tab === 'motivos' && <Motivos />}
      {tab === 'categorias' && <Categorias />}
    </div>
  )
}
