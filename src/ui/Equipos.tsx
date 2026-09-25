import { useMemo, useState } from 'preact/hooks'
import type { CondicionRegreso, Equipo, PrestamoEquipo, Trabajador } from '../domain/types'
import { entregarArchivo, fechaDeTs, fechaLocal, hace, horaLocal, normalizar, plural } from '../lib/util'
import {
  ahoraLocal,
  anularPrestamoEquipo,
  CONDICIONES,
  diasCalibracion,
  disponibilidad,
  ESTADOS,
  guardarEquipo,
  prestamoVencido,
  prestarEquipo,
  registrarRegreso,
  TEXTO_DISPONIBILIDAD,
  type Disponibilidad,
} from '../state/equipos'
import { puedeInventario } from '../state/permisos'
import * as S from '../state/store'
import { avisar, intentar, Modal, Vacio } from './comunes'
import { Icono } from './iconos'
import { BuscadorTrabajador } from './Trabajador'

const COLOR_DISP: Record<Disponibilidad, string> = { disponible: 'ok', prestado: 'prest', revision: 'warn', calibracion: 'bad', baja: '' }

const fmtVence = (v: string) => {
  const [f, h] = v.split('T')
  return `${f === fechaLocal() ? 'hoy' : f} ${h ?? ''}`.trim()
}
const fmtTs = (ts: string) => `${fechaDeTs(ts)} ${horaLocal(new Date(ts))}`

/** Último contacto registrado de un trabajador, para no volver a preguntarlo. */
function contactoPrevio(rpe: string): string {
  for (let i = S.prestamosEquipo.value.length - 1; i >= 0; i--) {
    const p = S.prestamosEquipo.value[i]
    if (p.rpe === rpe && p.contacto) return p.contacto
  }
  return ''
}

// ---------- Préstamo ----------

function plazo(horas: number | 'turno' | 'manana'): string {
  const d = new Date()
  if (horas === 'turno') {
    d.setHours(18, 0, 0, 0)
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
  } else if (horas === 'manana') {
    d.setDate(d.getDate() + 1)
    d.setHours(8, 0, 0, 0)
  } else d.setTime(d.getTime() + horas * 3600000)
  return ahoraLocal(d)
}

function ChipTrabajador({ t, onQuitar }: { t: Pick<Trabajador, 'rpe' | 'nombre' | 'area'>; onQuitar: () => void }) {
  return (
    <div class="row card" style={{ padding: '10px', flexWrap: 'nowrap' }}>
      <div class="grow">
        <strong>{t.nombre}</strong>
        <div class="muted small">
          <span class="mono">{t.rpe}</span> · {t.area}
        </div>
      </div>
      <button class="btn ghost sm" onClick={onQuitar} aria-label="Cambiar persona">
        Cambiar
      </button>
    </div>
  )
}

function ModalPrestar({ equipoInicial, onCerrar }: { equipoInicial?: Equipo; onCerrar: () => void }) {
  const activos = S.prestamosEquipoActivos.value
  const disponibles = S.equipos.value.filter((e) => disponibilidad(e, activos) === 'disponible')
  const [eq, setEq] = useState<Equipo | undefined>(equipoInicial)
  const [buscar, setBuscar] = useState('')
  const [t, setT] = useState<Trabajador | null>(null)
  const [contacto, setContacto] = useState('')
  const [uso, setUso] = useState('')
  const [vence, setVence] = useState(plazo('turno'))
  const [accesorios, setAccesorios] = useState<string[]>(equipoInicial?.accesorios ?? [])
  const [bitacora, setBitacora] = useState(equipoInicial?.llevaBitacora ?? false)
  const [observaciones, setObservaciones] = useState('')

  const elegirEquipo = (e: Equipo) => {
    setEq(e)
    setAccesorios(e.accesorios)
    setBitacora(e.llevaBitacora)
  }
  const q = normalizar(buscar)
  const lista = disponibles.filter((e) => !q || normalizar(`${e.codigo} ${e.nombre} ${e.marca} ${e.modelo} ${e.serie}`).includes(q))

  const guardar = async () => {
    if (!eq || !t) return
    const p = await intentar(() => prestarEquipo({ equipoId: eq.id, trabajador: t, contacto, uso, vence, accesorios, bitacora, observaciones }))
    if (p) {
      avisar(`✓ ${p.equipoCodigo} prestado a ${p.nombre} · folio ${p.folio}`)
      onCerrar()
    }
  }

  return (
    <Modal
      titulo="Prestar equipo"
      onCerrar={onCerrar}
      ancho
      acciones={
        <>
          <button class="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button class="btn primary" disabled={!eq || !t} onClick={guardar}>
            Registrar salida
          </button>
        </>
      }
    >
      <div class="stack" style={{ gap: '6px' }}>
        <strong>1. Equipo</strong>
        {eq ? (
          <div class="row card" style={{ padding: '10px', flexWrap: 'nowrap' }}>
            <span class="avatar">
              <Icono n="equipo" />
            </span>
            <div class="grow">
              <strong class="mono">{eq.codigo}</strong> · {eq.nombre}
              <div class="muted small">{[eq.marca, eq.modelo, eq.serie && `Serie ${eq.serie}`].filter(Boolean).join(' · ')}</div>
            </div>
            {!equipoInicial && (
              <button class="btn ghost sm" onClick={() => setEq(undefined)}>
                Cambiar
              </button>
            )}
          </div>
        ) : (
          <>
            <input
              class="input"
              id="eq-buscar"
              placeholder="Código, tipo o serie (también puede escanear la etiqueta)"
              value={buscar}
              onInput={(e) => setBuscar((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                const exacto = disponibles.find((x) => x.codigo.toUpperCase() === buscar.trim().toUpperCase())
                if (exacto) elegirEquipo(exacto)
                else if (lista.length === 1) elegirEquipo(lista[0])
              }}
            />
            <div class="resultados">
              {lista.slice(0, 8).map((e) => (
                <button key={e.id} onClick={() => elegirEquipo(e)}>
                  <span class="mono">{e.codigo}</span>
                  <span class="grow">{e.nombre}</span>
                  <span class="muted small">{[e.marca, e.modelo].filter(Boolean).join(' ')}</span>
                </button>
              ))}
              {!lista.length && <div class="muted small" style={{ padding: '10px' }}>{disponibles.length ? 'Ningún equipo disponible coincide.' : 'No hay equipos disponibles.'}</div>}
            </div>
          </>
        )}
      </div>

      <div class="stack" style={{ gap: '6px' }}>
        <strong>2. Quién lo recibe</strong>
        {t ? (
          <ChipTrabajador t={t} onQuitar={() => setT(null)} />
        ) : (
          <BuscadorTrabajador
            autoFocus={false}
            onElegir={(x) => {
              setT(x)
              setContacto(contactoPrevio(x.rpe))
            }}
          />
        )}
      </div>

      <div class="stack" style={{ gap: '10px' }}>
        <strong>3. Datos de la salida</strong>
        <div class="row" style={{ alignItems: 'start' }}>
          <label class="campo grow">
            Extensión o teléfono
            <input class="input" id="eq-contacto" inputMode="tel" placeholder="Para localizarlo" value={contacto} onInput={(e) => setContacto((e.target as HTMLInputElement).value)} />
          </label>
          <label class="campo grow">
            Trabajo o lugar donde se usará
            <input class="input" id="eq-uso" placeholder="Ej. espacio confinado, Unidad 2" value={uso} onInput={(e) => setUso((e.target as HTMLInputElement).value)} />
          </label>
        </div>
        <label class="campo">
          Debe regresar a más tardar
          <input class="input" id="eq-vence" type="datetime-local" value={vence} onInput={(e) => setVence((e.target as HTMLInputElement).value)} />
        </label>
        <div class="chips">
          <button class="chip" onClick={() => setVence(plazo(4))}>
            En 4 horas
          </button>
          <button class="chip" onClick={() => setVence(plazo('turno'))}>
            Fin del turno (18:00)
          </button>
          <button class="chip" onClick={() => setVence(plazo('manana'))}>
            Mañana 8:00
          </button>
          <button class="chip" onClick={() => setVence(plazo(24 * 7))}>
            En una semana
          </button>
        </div>
        {eq && eq.accesorios.length > 0 && (
          <fieldset class="stack" style={{ gap: '6px', border: 0, padding: 0, margin: 0 }}>
            <legend class="small" style={{ fontWeight: 600, marginBottom: '4px' }}>
              Accesorios que salen con el equipo
            </legend>
            {eq.accesorios.map((a) => (
              <label key={a} class="check">
                <input type="checkbox" checked={accesorios.includes(a)} onChange={(e) => setAccesorios((e.target as HTMLInputElement).checked ? [...accesorios, a] : accesorios.filter((x) => x !== a))} />
                {a}
              </label>
            ))}
          </fieldset>
        )}
        <label class="check">
          <input type="checkbox" checked={bitacora} onChange={(e) => setBitacora((e.target as HTMLInputElement).checked)} />
          Lleva su bitácora
        </label>
        <label class="campo">
          Observaciones (opcional)
          <input class="input" id="eq-obs" placeholder="Estado al salir, carga de batería…" value={observaciones} onInput={(e) => setObservaciones((e.target as HTMLInputElement).value)} />
        </label>
        <p class="muted small">Entrega: {S.sesion.value?.usuarioNombre}</p>
      </div>
    </Modal>
  )
}

// ---------- Regreso ----------

function ModalRegreso({ p, onCerrar }: { p: PrestamoEquipo; onCerrar: () => void }) {
  const [otro, setOtro] = useState<Trabajador | null>(null)
  const [mismo, setMismo] = useState(true)
  const [accesorios, setAccesorios] = useState<string[]>(p.accesorios)
  const [bitacora, setBitacora] = useState(p.bitacora)
  const [condicion, setCondicion] = useState<CondicionRegreso>('bueno')
  const [comentarios, setComentarios] = useState('')
  const faltan = p.accesorios.filter((a) => !accesorios.includes(a))
  const conDetalle = condicion !== 'bueno' || faltan.length > 0 || (p.bitacora && !bitacora)

  const guardar = async () => {
    const devolvio = mismo ? { rpe: p.rpe, nombre: p.nombre } : otro
    if (!devolvio) return avisar('Indique quién devuelve el equipo.', { tipo: 'bad' })
    const ok = await intentar(async () => {
      await registrarRegreso({ prestamoId: p.id, devolvio, condicion, accesorios, bitacora, comentarios })
      return true
    })
    if (ok) {
      avisar(conDetalle ? `Regreso de ${p.equipoCodigo} registrado con observaciones` : `✓ ${p.equipoCodigo} de regreso en la oficina`)
      onCerrar()
    }
  }

  return (
    <Modal
      titulo={`Regreso de ${p.equipoCodigo}`}
      onCerrar={onCerrar}
      acciones={
        <>
          <button class="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button class="btn primary" onClick={guardar}>
            Registrar regreso
          </button>
        </>
      }
    >
      <div class="muted small">
        {p.equipoNombre} · folio {p.folio}
        <br />
        Salió {fmtTs(p.ts)} con {p.nombre}
      </div>
      <div class="stack" style={{ gap: '6px' }}>
        <strong>Quién lo devuelve</strong>
        <div class="row" role="group">
          <button class="chip" aria-pressed={mismo} onClick={() => setMismo(true)}>
            {p.nombre.split(' ').slice(0, 2).join(' ')}
          </button>
          <button class="chip" aria-pressed={!mismo} onClick={() => setMismo(false)}>
            Otra persona
          </button>
        </div>
        {!mismo && (otro ? <ChipTrabajador t={otro} onQuitar={() => setOtro(null)} /> : <BuscadorTrabajador autoFocus={false} onElegir={setOtro} />)}
      </div>
      <div class="stack" style={{ gap: '6px' }}>
        <strong>Estado del equipo</strong>
        {(Object.keys(CONDICIONES) as CondicionRegreso[]).map((c) => (
          <button key={c} class="opcion" aria-pressed={condicion === c} onClick={() => setCondicion(c)}>
            <span class={`badge ${c === 'bueno' ? 'ok' : c === 'detalle' ? 'warn' : 'bad'}`}>{c === 'bueno' ? '✓' : '!'}</span>
            {CONDICIONES[c]}
          </button>
        ))}
        {condicion === 'danado' && <p class="muted small">El equipo quedará «En revisión» y no se podrá prestar hasta que se marque como operativo.</p>}
      </div>
      {(p.accesorios.length > 0 || p.bitacora) && (
        <fieldset class="stack" style={{ gap: '6px', border: 0, padding: 0, margin: 0 }}>
          <legend class="small" style={{ fontWeight: 600, marginBottom: '4px' }}>
            Lo que regresa
          </legend>
          {p.accesorios.map((a) => (
            <label key={a} class="check">
              <input type="checkbox" checked={accesorios.includes(a)} onChange={(e) => setAccesorios((e.target as HTMLInputElement).checked ? [...accesorios, a] : accesorios.filter((x) => x !== a))} />
              {a}
            </label>
          ))}
          {p.bitacora && (
            <label class="check">
              <input type="checkbox" checked={bitacora} onChange={(e) => setBitacora((e.target as HTMLInputElement).checked)} />
              Bitácora del equipo
            </label>
          )}
        </fieldset>
      )}
      <label class="campo">
        {conDetalle ? 'Describa el detalle o lo que falta (obligatorio)' : 'Comentarios (opcional)'}
        <textarea class="input" id="eq-comentarios" rows={2} value={comentarios} onInput={(e) => setComentarios((e.target as HTMLTextAreaElement).value)} />
      </label>
      <p class="muted small">Revisa: {S.sesion.value?.usuarioNombre}</p>
    </Modal>
  )
}

// ---------- Catálogo de equipos ----------

function EditorEquipo({ inicial, onCerrar }: { inicial: Equipo | null; onCerrar: () => void }) {
  const [codigo, setCodigo] = useState(inicial?.codigo ?? '')
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [marca, setMarca] = useState(inicial?.marca ?? '')
  const [modelo, setModelo] = useState(inicial?.modelo ?? '')
  const [serie, setSerie] = useState(inicial?.serie ?? '')
  const [accesorios, setAccesorios] = useState((inicial?.accesorios ?? []).join('\n'))
  const [llevaBitacora, setLlevaBitacora] = useState(inicial?.llevaBitacora ?? true)
  const [calibracion, setCalibracion] = useState(inicial?.calibracion ?? '')
  const [estado, setEstado] = useState<Equipo['estado']>(inicial?.estado ?? 'operativo')
  const [notas, setNotas] = useState(inicial?.notas ?? '')
  const tipos = useMemo(() => [...new Set(S.equipos.value.map((e) => e.nombre).concat(['Explosímetro', 'Detector multigas', 'Higrómetro', 'Termohigrómetro', 'Sonómetro', 'Luxómetro']))].sort(), [])

  const guardar = async () => {
    const ok = await intentar(async () => {
      await guardarEquipo({
        id: inicial?.id,
        codigo,
        nombre,
        marca,
        modelo,
        serie,
        accesorios: accesorios.split(/\n|,/),
        llevaBitacora,
        calibracion,
        estado,
        notas,
        fotoId: inicial?.fotoId,
        activo: estado !== 'baja',
      })
      return true
    })
    if (ok) {
      avisar(inicial ? '✓ Equipo actualizado' : `✓ ${codigo.toUpperCase()} agregado`)
      onCerrar()
    }
  }

  return (
    <Modal
      titulo={inicial ? `Equipo ${inicial.codigo}` : 'Nuevo equipo'}
      onCerrar={onCerrar}
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
      <div class="row" style={{ alignItems: 'start' }}>
        <label class="campo" style={{ width: '140px' }}>
          Código
          <input class="input mono" id="eqc-codigo" placeholder="EXP-01" value={codigo} onInput={(e) => setCodigo((e.target as HTMLInputElement).value.toUpperCase())} />
        </label>
        <label class="campo grow">
          Equipo
          <input class="input" id="eqc-nombre" list="eq-tipos" placeholder="Explosímetro, higrómetro…" value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} />
          <datalist id="eq-tipos">
            {tipos.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
      </div>
      <div class="row" style={{ alignItems: 'start' }}>
        <label class="campo grow">
          Marca
          <input class="input" id="eqc-marca" value={marca} onInput={(e) => setMarca((e.target as HTMLInputElement).value)} />
        </label>
        <label class="campo grow">
          Modelo
          <input class="input" id="eqc-modelo" value={modelo} onInput={(e) => setModelo((e.target as HTMLInputElement).value)} />
        </label>
        <label class="campo grow">
          No. de serie
          <input class="input mono" id="eqc-serie" value={serie} onInput={(e) => setSerie((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <label class="campo">
        Accesorios que salen con el equipo (uno por renglón)
        <textarea class="input" id="eqc-acc" rows={3} placeholder={'Cargador\nEstuche\nManguera de muestreo'} value={accesorios} onInput={(e) => setAccesorios((e.target as HTMLTextAreaElement).value)} />
      </label>
      <label class="check">
        <input type="checkbox" checked={llevaBitacora} onChange={(e) => setLlevaBitacora((e.target as HTMLInputElement).checked)} />
        El equipo tiene bitácora propia que sale con él
      </label>
      <div class="row" style={{ alignItems: 'start' }}>
        <label class="campo grow">
          Próxima calibración (vacío si no aplica)
          <input class="input" id="eqc-cal" type="date" value={calibracion} onInput={(e) => setCalibracion((e.target as HTMLInputElement).value)} />
        </label>
        <label class="campo grow">
          Estado
          <select class="input" id="eqc-estado" value={estado} onChange={(e) => setEstado((e.target as HTMLSelectElement).value as Equipo['estado'])}>
            {(Object.keys(ESTADOS) as Equipo['estado'][]).map((x) => (
              <option key={x} value={x}>
                {ESTADOS[x]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label class="campo">
        Notas
        <input class="input" id="eqc-notas" value={notas} onInput={(e) => setNotas((e.target as HTMLInputElement).value)} />
      </label>
    </Modal>
  )
}

function Calibracion({ e }: { e: Equipo }) {
  const d = diasCalibracion(e)
  if (d === null) return null
  const clase = d < 0 ? 'bad' : d <= 30 ? 'warn' : ''
  return <span class={`badge ${clase}`}>{d < 0 ? `Calibración vencida (${e.calibracion})` : `Calibración ${e.calibracion}`}</span>
}

function Catalogo({ onPrestar }: { onPrestar: (e: Equipo) => void }) {
  const [editar, setEditar] = useState<Equipo | null | 'nuevo'>(null)
  const [texto, setTexto] = useState('')
  const [bajas, setBajas] = useState(false)
  const activos = S.prestamosEquipoActivos.value
  const q = normalizar(texto)
  const lista = S.equipos.value.filter((e) => (bajas || e.estado !== 'baja') && (!q || normalizar(`${e.codigo} ${e.nombre} ${e.marca} ${e.modelo} ${e.serie}`).includes(q)))
  const edita = puedeInventario()
  return (
    <div class="stack">
      <div class="row">
        {edita && (
          <button class="btn primary" onClick={() => setEditar('nuevo')}>
            <Icono n="mas1" /> Nuevo equipo
          </button>
        )}
        <input class="input grow" id="eq-filtro" type="search" placeholder="Buscar equipo…" value={texto} onInput={(e) => setTexto((e.target as HTMLInputElement).value)} />
        <label class="check">
          <input type="checkbox" checked={bajas} onChange={(e) => setBajas((e.target as HTMLInputElement).checked)} />
          Ver bajas
        </label>
      </div>
      {!S.equipos.value.length && (
        <Vacio>
          Aún no hay equipos. {edita ? 'Agregue los explosímetros, higrómetros y demás equipos que presta la oficina con «Nuevo equipo».' : 'Un encargado de almacén o un administrador puede agregarlos.'}
        </Vacio>
      )}
      <div class="equipos-lista">
        {lista.map((e) => {
          const disp = disponibilidad(e, activos)
          const p = activos.find((x) => x.equipoId === e.id)
          const historial = S.prestamosEquipo.value.filter((x) => x.equipoId === e.id && x.estatus !== 'ANULADO')
          return (
            <div key={e.id} class="card stack" style={{ gap: '6px' }}>
              <div class="spread">
                <strong class="mono">{e.codigo}</strong>
                <span class={`badge ${COLOR_DISP[disp]}`}>{TEXTO_DISPONIBILIDAD[disp]}</span>
              </div>
              <strong>{e.nombre}</strong>
              <span class="muted small">{[e.marca, e.modelo, e.serie && `Serie ${e.serie}`].filter(Boolean).join(' · ') || 'Sin marca ni serie'}</span>
              <Calibracion e={e} />
              {p && (
                <span class="small">
                  Lo tiene <strong>{p.nombre}</strong> desde {hace(p.ts)}
                </span>
              )}
              {e.accesorios.length > 0 && <span class="muted small">Accesorios: {e.accesorios.join(', ')}</span>}
              <span class="muted small">{plural(historial.length, 'préstamo registrado', 'préstamos registrados')}</span>
              <div class="row" style={{ gap: '6px' }}>
                {disp === 'disponible' && (
                  <button class="btn sm primary" onClick={() => onPrestar(e)}>
                    Prestar
                  </button>
                )}
                {edita && (
                  <button class="btn sm" onClick={() => setEditar(e)}>
                    <Icono n="editar" /> Editar
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {editar && <EditorEquipo inicial={editar === 'nuevo' ? null : editar} onCerrar={() => setEditar(null)} />}
    </div>
  )
}

// ---------- En uso ----------

function EnUso({ onRegreso }: { onRegreso: (p: PrestamoEquipo) => void }) {
  const [anular, setAnular] = useState<PrestamoEquipo | null>(null)
  const [motivo, setMotivo] = useState('')
  const ahora = ahoraLocal()
  const activos = [...S.prestamosEquipoActivos.value].sort((a, b) => (a.vence < b.vence ? -1 : 1))
  if (!activos.length) return <Vacio>No hay equipos fuera de la oficina.</Vacio>
  return (
    <div class="equipos-lista">
      {activos.map((p) => {
        const vencido = prestamoVencido(p, ahora)
        return (
          <div key={p.id} class={`card stack ${vencido ? 'prestamo-vencido' : ''}`} style={{ gap: '6px' }}>
            <div class="spread">
              <span>
                <strong class="mono">{p.equipoCodigo}</strong> <span class="muted small">{p.folio}</span>
              </span>
              <span class={`badge ${vencido ? 'bad' : 'prest'}`}>{vencido ? `Debió volver ${fmtVence(p.vence)}` : `Vuelve ${fmtVence(p.vence)}`}</span>
            </div>
            <span class="muted small">{p.equipoNombre}</span>
            <div>
              <strong>{p.nombre}</strong>
              <div class="muted small">
                <span class="mono">{p.rpe}</span> · {p.area}
              </div>
            </div>
            <span class="small">
              Contacto:{' '}
              <a href={`tel:${p.contacto.replace(/[^0-9+]/g, '')}`} class="mono">
                {p.contacto}
              </a>
              {p.uso && ` · ${p.uso}`}
            </span>
            <span class="muted small">
              Salió {fmtTs(p.ts)} · entregó {p.usuarioNombre}
              {p.accesorios.length > 0 && ` · con ${p.accesorios.join(', ')}`}
              {p.bitacora && ' · con bitácora'}
            </span>
            {p.observaciones && <span class="muted small">Obs.: {p.observaciones}</span>}
            <div class="row" style={{ gap: '6px' }}>
              <button class="btn sm primary" onClick={() => onRegreso(p)}>
                <Icono n="devolucion" /> Registrar regreso
              </button>
              <button class="btn sm ghost" onClick={() => (setAnular(p), setMotivo(''))}>
                Anular salida
              </button>
            </div>
          </div>
        )
      })}
      {anular && (
        <Modal
          titulo={`Anular salida ${anular.folio}`}
          onCerrar={() => setAnular(null)}
          acciones={
            <>
              <button class="btn" onClick={() => setAnular(null)}>
                Cancelar
              </button>
              <button
                class="btn danger"
                onClick={async () => {
                  const ok = await intentar(async () => {
                    await anularPrestamoEquipo(anular.id, motivo)
                    return true
                  })
                  if (ok) {
                    avisar('Salida anulada')
                    setAnular(null)
                  }
                }}
              >
                Anular
              </button>
            </>
          }
        >
          <p class="small">Úselo solo si la salida se registró por error (el equipo nunca salió). Si el equipo regresó, use «Registrar regreso».</p>
          <label class="campo">
            Motivo
            <input class="input" id="eq-anular" value={motivo} onInput={(e) => setMotivo((e.target as HTMLInputElement).value)} />
          </label>
        </Modal>
      )}
    </div>
  )
}

// ---------- Bitácora ----------

async function exportarBitacora(lista: PrestamoEquipo[]) {
  const { default: escribir } = await import('write-excel-file/universal')
  const ENC = { fontWeight: 'bold' as const, color: '#FFFFFF', backgroundColor: '#235B4E' }
  const enc = [
    'Folio', 'Código', 'Equipo', 'Salida', 'Recibió RPE', 'Recibió', 'Área', 'Contacto', 'Uso / lugar', 'Entregó', 'Debía volver', 'Accesorios', 'Lleva bitácora',
    'Estatus', 'Regreso', 'Devolvió', 'Revisó', 'Condición', 'Faltantes', 'Comentarios',
  ].map((value) => ({ value, ...ENC }))
  const filas = lista.map((p) => {
    const r = p.regreso
    const faltan = r ? p.accesorios.filter((a) => !r.accesorios.includes(a)).concat(p.bitacora && !r.bitacora ? ['Bitácora'] : []) : []
    return [
      p.folio, p.equipoCodigo, p.equipoNombre, fmtTs(p.ts), p.rpe, p.nombre, p.area, p.contacto, p.uso, p.usuarioNombre, p.vence.replace('T', ' '),
      p.accesorios.join(', '), p.bitacora ? 'SI' : 'NO', p.estatus, r ? fmtTs(r.ts) : '', r ? `${r.devolvioNombre} (${r.devolvioRpe})` : '', r?.usuarioNombre ?? '',
      r ? CONDICIONES[r.condicion] : '', faltan.join(', '), [r?.comentarios, p.observaciones].filter(Boolean).join(' · '),
    ].map((value) => ({ value: value ?? '' }))
  })
  const blob = (await escribir([enc, ...filas], {
    sheet: 'Bitácora de equipos',
    stickyRowsCount: 1,
    columns: [14, 11, 26, 16, 10, 28, 22, 14, 24, 18, 16, 24, 10, 11, 16, 28, 18, 16, 20, 34].map((width) => ({ width })),
  }).toBlob()) as Blob
  await entregarArchivo(`Bitácora de equipos ${fechaLocal()}.xlsx`, blob)
}

function Bitacora() {
  const [texto, setTexto] = useState('')
  const [estatus, setEstatus] = useState<'' | PrestamoEquipo['estatus'] | 'DETALLE'>('')
  const q = normalizar(texto)
  const lista = [...S.prestamosEquipo.value]
    .reverse()
    .filter(
      (p) =>
        (!estatus || (estatus === 'DETALLE' ? p.regreso && p.regreso.condicion !== 'bueno' : p.estatus === estatus)) &&
        (!q || normalizar(`${p.folio} ${p.equipoCodigo} ${p.equipoNombre} ${p.rpe} ${p.nombre} ${p.regreso?.devolvioNombre ?? ''}`).includes(q)),
    )
  return (
    <div class="stack">
      <div class="filtros">
        <label class="campo">
          Buscar
          <input class="input" id="bit-buscar" type="search" placeholder="Equipo, persona o folio" value={texto} onInput={(e) => setTexto((e.target as HTMLInputElement).value)} />
        </label>
        <label class="campo">
          Estatus
          <select class="input" id="bit-estatus" value={estatus} onChange={(e) => setEstatus((e.target as HTMLSelectElement).value as typeof estatus)}>
            <option value="">Todos</option>
            <option value="ACTIVO">Fuera de la oficina</option>
            <option value="DEVUELTO">Devueltos</option>
            <option value="DETALLE">Devueltos con detalle o daño</option>
            <option value="ANULADO">Anulados</option>
          </select>
        </label>
        <button class="btn" disabled={!lista.length} onClick={() => intentar(() => exportarBitacora(lista))}>
          <Icono n="excel" /> Excel
        </button>
      </div>
      <div class="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Equipo</th>
              <th>Salida</th>
              <th>Recibió</th>
              <th>Entregó</th>
              <th>Regreso</th>
              <th>Devolvió / revisó</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const r = p.regreso
              const faltan = r ? p.accesorios.filter((a) => !r.accesorios.includes(a)) : []
              return (
                <tr key={p.id} style={{ opacity: p.estatus === 'ANULADO' ? 0.55 : 1 }}>
                  <td class="mono small">{p.folio}</td>
                  <td>
                    <strong class="mono">{p.equipoCodigo}</strong>
                    <div class="muted small">{p.equipoNombre}</div>
                  </td>
                  <td class="small">{fmtTs(p.ts)}</td>
                  <td>
                    {p.nombre}
                    <div class="muted small">
                      {p.rpe} · {p.contacto}
                    </div>
                  </td>
                  <td class="small">{p.usuarioNombre}</td>
                  <td class="small">{r ? fmtTs(r.ts) : p.estatus === 'ACTIVO' ? <span class={`badge ${prestamoVencido(p) ? 'bad' : 'prest'}`}>Fuera · {fmtVence(p.vence)}</span> : '—'}</td>
                  <td class="small">
                    {r ? (
                      <>
                        {r.devolvioNombre}
                        <div class="muted">revisó {r.usuarioNombre}</div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td class="small">
                    {p.estatus === 'ANULADO' ? (
                      <span class="badge">Anulado</span>
                    ) : r ? (
                      <>
                        <span class={`badge ${r.condicion === 'bueno' ? 'ok' : r.condicion === 'detalle' ? 'warn' : 'bad'}`}>{CONDICIONES[r.condicion]}</span>
                        {faltan.length > 0 && <div class="muted">Faltó: {faltan.join(', ')}</div>}
                        {p.bitacora && !r.bitacora && <div class="muted">Faltó la bitácora</div>}
                        {r.comentarios && <div class="muted">{r.comentarios}</div>}
                      </>
                    ) : (
                      ''
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!lista.length && <div class="muted small" style={{ padding: '14px' }}>Sin registros.</div>}
      </div>
    </div>
  )
}

// ---------- Pantalla ----------

export function PantallaEquipos() {
  const [tab, setTab] = useState<'uso' | 'catalogo' | 'bitacora'>('uso')
  const [prestar, setPrestar] = useState<Equipo | true | null>(null)
  const [regreso, setRegreso] = useState<PrestamoEquipo | null>(null)
  const activos = S.prestamosEquipoActivos.value
  const ahora = ahoraLocal()
  const vencidos = activos.filter((p) => prestamoVencido(p, ahora))
  const disponibles = S.equipos.value.filter((e) => disponibilidad(e, activos) === 'disponible').length
  const calibrar = S.equipos.value.filter((e) => e.estado !== 'baja' && (diasCalibracion(e) ?? 999) <= 30)
  return (
    <div class="stack">
      <div class="spread">
        <h1>Equipos a resguardo</h1>
        <button class="btn primary" onClick={() => setPrestar(true)}>
          <Icono n="equipo" /> Prestar equipo
        </button>
      </div>
      <div class="kpis">
        <div class="kpi">
          <span>Disponibles</span>
          <b>{disponibles}</b>
        </div>
        <button class="kpi" style={{ textAlign: 'left' }} onClick={() => setTab('uso')}>
          <span>Fuera de la oficina</span>
          <b>{activos.length}</b>
        </button>
        <button class={`kpi ${vencidos.length ? 'bad' : ''}`} style={{ textAlign: 'left' }} onClick={() => setTab('uso')}>
          <span>Sin devolver a tiempo</span>
          <b>{vencidos.length}</b>
        </button>
        <button class={`kpi ${calibrar.length ? 'bad' : ''}`} style={{ textAlign: 'left' }} onClick={() => setTab('catalogo')}>
          <span>Calibración ≤ 30 días</span>
          <b>{calibrar.length}</b>
        </button>
      </div>
      {vencidos.length > 0 && (
        <div class="aviso bad">
          <Icono n="alerta" />
          <div>
            <strong>{plural(vencidos.length, 'equipo no ha regresado', 'equipos no han regresado')} a tiempo:</strong>{' '}
            {vencidos.map((p) => `${p.equipoCodigo} (${p.nombre}, ${p.contacto})`).join(' · ')}
          </div>
        </div>
      )}
      <div class="tabs" role="tablist">
        {(
          [
            ['uso', `En uso (${activos.length})`],
            ['catalogo', `Equipos (${S.equipos.value.filter((e) => e.estado !== 'baja').length})`],
            ['bitacora', 'Bitácora'],
          ] as const
        ).map(([id, txt]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {txt}
          </button>
        ))}
      </div>
      {tab === 'uso' && <EnUso onRegreso={setRegreso} />}
      {tab === 'catalogo' && <Catalogo onPrestar={(e) => setPrestar(e)} />}
      {tab === 'bitacora' && <Bitacora />}
      {prestar && <ModalPrestar equipoInicial={prestar === true ? undefined : prestar} onCerrar={() => setPrestar(null)} />}
      {regreso && <ModalRegreso p={regreso} onCerrar={() => setRegreso(null)} />}
    </div>
  )
}

/** Número de préstamos de equipo vencidos, para el aviso del menú. */
export function equiposVencidos(): number {
  const ahora = ahoraLocal()
  return S.prestamosEquipoActivos.value.filter((p) => prestamoVencido(p, ahora)).length
}
