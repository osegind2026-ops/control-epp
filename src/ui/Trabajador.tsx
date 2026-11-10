import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { AREAS } from '../db/semilla'
import { buscarTrabajadores, lecturaEscanerValida, resolverRpe, rpeDeCodigo, tipoDe, tipoPorRpe, TIPOS_TRABAJADOR, type TipoNormal } from '../domain/logica'
import type { Entrega, Trabajador } from '../domain/types'
import { puedeInventario } from '../state/permisos'
import { DetalleEntrega } from './DetalleEntrega'
import { diasEntre, fechaLocal, hace, iniciales, normalizar, tecladoFisico } from '../lib/util'
import { guardarTrabajador } from '../state/servicios'
import * as S from '../state/store'
import { avisar, intentar, Modal } from './comunes'
import { CamaraEnVivo, LectorTeclado } from './Camara'
import { Icono } from './iconos'

export function listaAreas(): string[] {
  const set = new Set(AREAS)
  for (const t of S.personal.value.values()) if (t.area) set.add(t.area)
  return [...set].sort()
}

export function listaPuestos(): string[] {
  const set = new Set(['OPERADOR / TÉCNICO'])
  for (const t of S.personal.value.values()) if (t.puesto) set.add(t.puesto)
  return [...set].sort()
}

const OTRA = '__otra__'

/** Alta o edición de un trabajador (planta o eventual). */
export function FormTrabajador(props: {
  inicial?: Partial<Trabajador>
  onListo: (t: Trabajador) => void
  onCerrar: () => void
  /** Foto del gafete, para comparar lo que se leyó. */
  vistaPrevia?: string
  aviso?: string
}) {
  const i = props.inicial ?? {}
  const existente = !!(i.rpe && S.personal.value.get(i.rpe))
  const areas = listaAreas()
  const [rpe, setRpe] = useState(i.rpe ?? '')
  const [nombre, setNombre] = useState(i.nombre ?? '')
  const [area, setArea] = useState(i.area ?? '')
  const [areaLibre, setAreaLibre] = useState(!!i.area && !areas.includes(i.area))
  const [puesto, setPuesto] = useState(i.puesto ?? 'OPERADOR / TÉCNICO')
  const [activo, setActivo] = useState(i.activo ?? true)
  // Permanente / temporal / eventual: lo corrigen el administrador o el encargado de almacén
  const puedeTipo = puedeInventario()
  const tipoSugerido = i.tipo ? tipoDe({ tipo: i.tipo }) : tipoPorRpe(rpe)
  const [tipoElegido, setTipoElegido] = useState<TipoNormal | null>(null)
  const tipo = tipoElegido ?? tipoSugerido

  const guardar = async () => {
    const t = await intentar(() =>
      guardarTrabajador({
        rpe,
        nombre,
        area: area.trim().toUpperCase() || 'SIN ÁREA',
        puesto: puesto.trim().toUpperCase(),
        // Datos que ya no se capturan: se conservan si el registro los tenía
        casillero: i.casillero ?? '',
        gafete: i.gafete,
        tipo: tipoElegido ?? undefined,
        vigencia: i.vigencia,
        activo,
      }),
    )
    if (t) props.onListo(t)
  }

  return (
    <Modal
      titulo={existente ? 'Editar trabajador' : 'Alta de trabajador'}
      onCerrar={props.onCerrar}
      acciones={
        <>
          <button class="btn" onClick={props.onCerrar}>
            Cancelar
          </button>
          <button class="btn primary" onClick={guardar}>
            Guardar
          </button>
        </>
      }
    >
      {props.vistaPrevia && <img class="gafete-vista" src={props.vistaPrevia} alt="Foto del gafete" />}
      {props.aviso && (
        <div class="aviso info small">
          <Icono n="info" />
          <span>{props.aviso}</span>
        </div>
      )}
      <div class="row" style={{ alignItems: 'start' }}>
        <label class="campo" style={{ width: '120px' }}>
          RPE
          <input class="input mono" id="tr-rpe" value={rpe} maxLength={5} autoCapitalize="characters" disabled={existente} onInput={(e) => setRpe(rpeDeCodigo((e.target as HTMLInputElement).value))} />
        </label>
        <label class="campo grow">
          Nombre completo
          <input class="input" id="tr-nombre" value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <label class="campo">
        Área
        {areaLibre ? (
          <div class="row" style={{ flexWrap: 'nowrap' }}>
            <input class="input grow" id="tr-area-otra" placeholder="Escriba el área" value={area} onInput={(e) => setArea((e.target as HTMLInputElement).value)} />
            <button class="btn sm" type="button" onClick={() => (setAreaLibre(false), setArea(''))}>
              Lista
            </button>
          </div>
        ) : (
          <select
            class="input"
            id="tr-area"
            value={area}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value
              if (v === OTRA) {
                setAreaLibre(true)
                setArea('')
              } else setArea(v)
            }}
          >
            <option value="">Elija el área…</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            <option value={OTRA}>Otra área…</option>
          </select>
        )}
      </label>
      <label class="campo">
        Puesto
        <input class="input" id="tr-puesto" list="puestos-lista" value={puesto} onInput={(e) => setPuesto((e.target as HTMLInputElement).value)} />
        <datalist id="puestos-lista">
          {listaPuestos().map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </label>
      <div class="stack" style={{ gap: '6px' }}>
        <span class="small" style={{ fontWeight: 600, color: 'var(--muted)' }}>Tipo de trabajador</span>
        {puedeTipo ? (
          <div class="row" role="group" aria-label="Tipo de trabajador">
            {(Object.keys(TIPOS_TRABAJADOR) as TipoNormal[]).map((x) => (
              <button key={x} type="button" class="chip" aria-pressed={tipo === x} onClick={() => setTipoElegido(x)}>
                {TIPOS_TRABAJADOR[x]}
              </button>
            ))}
          </div>
        ) : (
          <span>
            <span class={`badge ${tipo === 'permanente' ? 'ok' : 'warn'}`}>{TIPOS_TRABAJADOR[tipo]}</span>{' '}
            <span class="muted small">Lo puede corregir un administrador o el encargado de almacén.</span>
          </span>
        )}
        {!existente && !tipoElegido && <span class="muted small">Se asigna por el RPE: los que empiezan con 9 son permanentes; el resto, eventuales.</span>}
      </div>
      {existente && (
        <label class="check">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo((e.target as HTMLInputElement).checked)} />
          Activo
        </label>
      )}
    </Modal>
  )
}

/**
 * Lee el gafete con la cámara dentro de la app. Mientras se apunta busca el código de
 * barras; si no lo encuentra (gafetes con fondo oscuro), «Tomar foto» lee el texto
 * impreso. Si el RPE ya está en el padrón elige al trabajador; si no, abre el alta con
 * los datos leídos para confirmarlos.
 */
export function LectorGafete({ onElegir, onCerrar }: { onElegir: (t: Trabajador) => void; onCerrar: () => void }) {
  const [estado, setEstado] = useState<{ texto: string; avance?: number } | null>(null)
  const [alta, setAlta] = useState<{ datos: Partial<Trabajador>; vista: string; aviso: string } | null>(null)
  const cuadros = useRef(0)
  const existe = (x: string) => S.personal.value.has(x)

  /** Código leído (de la cámara o de la foto): los primeros 5 caracteres son el RPE. */
  const porCodigo = (codigo: string, vista = '') => {
    const rpe = resolverRpe(codigo, existe)
    const t = S.personal.value.get(rpe)
    if (t) return onElegir(t)
    setEstado(null)
    setAlta({ datos: { rpe }, vista, aviso: `El RPE ${rpe} no está en el padrón. Complete sus datos para darlo de alta.` })
  }

  const procesar = async (f: Blob) => {
    setEstado({ texto: 'Buscando código de barras…' })
    try {
      const { leerGafete } = await import('../lib/lectorGafete')
      const { interpretarGafete, rpeMasVotado, rpeParecido } = await import('../lib/gafete')
      const r = await leerGafete(f, (texto, avance) => setEstado({ texto, avance }))
      if (import.meta.env.DEV) (window as unknown as { __gafete: unknown }).__gafete = r
      // 1) Código de barras: es la fuente más confiable
      const rpeCodigo = r.codigo ? rpeDeCodigo(r.codigo) : ''
      if (rpeCodigo && existe(rpeCodigo)) return onElegir(S.personal.value.get(rpeCodigo)!)
      // 2) Texto impreso
      const d = interpretarGafete(r.texto, listaAreas())
      const z = interpretarGafete(r.zona, [])
      d.rpe = rpeCodigo || rpeMasVotado(r.zona) || z.rpe || d.rpe
      let rpe = d.rpe ? resolverRpe(d.rpe, existe) : ''
      if (rpe && !existe(rpe)) rpe = rpeParecido(rpe, S.personal.value.keys()) || rpe
      const porRpe = rpe ? S.personal.value.get(rpe) : undefined
      if (porRpe) return onElegir(porRpe)
      const porNombre = d.nombre ? [...S.personal.value.values()].filter((t) => normalizar(t.nombre) === normalizar(d.nombre)) : []
      if (porNombre.length === 1) return onElegir(porNombre[0])
      setEstado(null)
      setAlta({
        datos: { rpe: rpeDeCodigo(rpe), nombre: d.nombre, area: d.area, puesto: d.puesto || undefined },
        vista: r.vistaPrevia,
        aviso: d.nombre || d.rpe
          ? 'Datos leídos del gafete: revíselos antes de guardar (la cámara puede confundir letras como O y 0).'
          : 'No se pudo leer el gafete. Capture los datos a mano o tome otra foto más cerca y con buena luz.',
      })
    } catch (e) {
      setEstado(null)
      avisar(`No se pudo leer la foto: ${(e as Error).message}`, { tipo: 'bad', ms: 6000 })
    }
  }

  if (alta) {
    return <FormTrabajador inicial={alta.datos} vistaPrevia={alta.vista || undefined} aviso={alta.aviso} onCerrar={onCerrar} onListo={onElegir} />
  }
  if (estado) {
    return (
      <Modal titulo="Leyendo gafete" onCerrar={onCerrar}>
        <p>{estado.texto}</p>
        {estado.avance !== undefined && (
          <div class="progreso" role="progressbar" aria-valuenow={Math.round(estado.avance * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${Math.round(estado.avance * 100)}%` }} />
          </div>
        )}
        <p class="muted small">Todo se procesa en este equipo; la foto no se guarda ni se envía.</p>
      </Modal>
    )
  }
  return (
    <CamaraEnVivo
      titulo="Leer gafete"
      ayuda={
        <>
          Encuadre el gafete completo, de frente y con buena luz. Si el código de barras se alcanza a leer, el trabajador se elige solo; si no, toque <strong>Tomar foto</strong> para leer el nombre, el área y el RPE impresos.
        </>
      }
      buscarCodigo={async (c) => {
        const { codigoEnCuadro } = await import('../lib/lectorGafete')
        return codigoEnCuadro(c, cuadros.current++)
      }}
      onCodigo={(c) => porCodigo(c)}
      onFoto={procesar}
      onCerrar={onCerrar}
      guia={1.58}
    />
  )
}

/** Tarjeta del trabajador elegido, con sus resguardos activos y su última entrega. */
export function TarjetaTrabajador({ t, onQuitar, onEditar }: { t: Trabajador; onQuitar: () => void; onEditar?: () => void }) {
  const activos = S.resguardosActivos.value.filter((r) => r.rpe === t.rpe)
  const ultima = [...S.entregas.value].reverse().find((e) => e.rpe === t.rpe && e.estado === 'registrada')
  const tipo = tipoDe(t)
  const [detalle, setDetalle] = useState<Entrega | null>(null)
  return (
    <div class="trabajador">
      <span class="avatar">{iniciales(t.nombre)}</span>
      <div class="grow stack" style={{ gap: '4px' }}>
        <div class="row" style={{ gap: '6px' }}>
          <strong class="nombre">{t.nombre}</strong>
          <span class={`badge ${tipo === 'permanente' ? 'ok' : 'warn'}`}>{TIPOS_TRABAJADOR[tipo]}</span>
        </div>
        <span class="muted small">
          <span class="mono">{t.rpe}</span> · {t.area}
          {t.casillero && ` · Casillero ${t.casillero}`}
        </span>
        <span class="muted small">
          {ultima ? (
            <button class="enlace" onClick={() => setDetalle(ultima)} title="Ver qué se le entregó">
              Última entrega {hace(ultima.ts)} ({ultima.folio})
            </button>
          ) : (
            'Sin entregas registradas'
          )}
          {activos.length > 0 && ` · En resguardo: ${activos.map((r) => S.nombreMaterial(r.materialId, r.varianteId)).join(', ')}`}
        </span>
        {detalle && <DetalleEntrega e={S.entregas.value.find((x) => x.id === detalle.id) ?? detalle} onCerrar={() => setDetalle(null)} />}
      </div>
      <div class="row" style={{ gap: '4px' }}>
        {onEditar && (
          <button class="btn ghost sm" onClick={onEditar} aria-label="Editar trabajador">
            <Icono n="editar" />
          </button>
        )}
        <button class="btn ghost sm" onClick={onQuitar} aria-label="Quitar trabajador">
          <Icono n="cerrar" />
        </button>
      </div>
    </div>
  )
}

/**
 * Buscador de trabajador: escáner de credencial (cámara o lector USB/Bluetooth),
 * RPE o nombre. Si el RPE no existe, ofrece el alta rápida.
 */
export function BuscadorTrabajador({ onElegir, autoFocus = true }: { onElegir: (t: Trabajador) => void; autoFocus?: boolean }) {
  const [texto, setTexto] = useState('')
  const [escaner, setEscaner] = useState(false)
  const [gafete, setGafete] = useState(false)
  const [alta, setAlta] = useState<Partial<Trabajador> | null>(null)
  const [activo, setActivo] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  const lista = useMemo(() => [...S.personal.value.values()], [S.personal.value])
  const resultados = useMemo(() => buscarTrabajadores(lista, texto), [lista, texto])

  useEffect(() => {
    if (autoFocus && tecladoFisico()) ref.current?.focus()
  }, [])

  const recientes = useMemo(() => {
    const vistos: string[] = []
    for (let i = S.entregas.value.length - 1; i >= 0 && vistos.length < 6; i--) {
      const rpe = S.entregas.value[i].rpe
      if (!vistos.includes(rpe)) vistos.push(rpe)
    }
    return vistos.map((r) => S.personal.value.get(r)).filter(Boolean) as Trabajador[]
  }, [S.entregas.value, S.personal.value])

  const resolver = (entrada: string) => {
    const rpe = resolverRpe(entrada, (r) => S.personal.value.has(r))
    if (!rpe) return
    const t = S.personal.value.get(rpe)
    if (t) {
      setTexto('')
      onElegir(t)
    } else if (resultados.length && entrada === texto) {
      setTexto('')
      onElegir(resultados[activo] ?? resultados[0])
    } else {
      setAlta({ rpe })
    }
  }

  return (
    <div class="buscador">
      <div class="row" style={{ flexWrap: 'nowrap' }}>
        <div class="campo-buscar grow">
          <Icono n="buscar" />
          <input
            ref={ref}
            id="buscar-trabajador"
            class="input"
            placeholder="RPE, nombre o escanee el gafete"
            autoComplete="off"
            value={texto}
            onInput={(e) => {
              setTexto((e.target as HTMLInputElement).value)
              setActivo(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') resolver(texto)
              else if (e.key === 'ArrowDown') setActivo((a) => Math.min(a + 1, resultados.length - 1))
              else if (e.key === 'ArrowUp') setActivo((a) => Math.max(a - 1, 0))
            }}
          />
        </div>
        <button class="btn" onClick={() => setGafete(true)} aria-label="Leer el gafete con la cámara" title="Leer el gafete con la cámara">
          <Icono n="gafete" />
          <span class="solo-ancho">Gafete</span>
        </button>
        <button class="btn" onClick={() => setEscaner(true)} aria-label="Usar un escáner de código de barras USB o Bluetooth" title="Escáner USB o Bluetooth">
          <Icono n="lector" />
          <span class="solo-ancho">Escáner</span>
        </button>
      </div>

      {texto.trim().length >= 2 && (
        <div class="resultados" role="listbox">
          {resultados.map((t, i) => (
            <button key={t.rpe} role="option" aria-selected={i === activo} onClick={() => resolver(t.rpe)}>
              <span class="mono">{t.rpe}</span>
              <span class="grow">{t.nombre}</span>
              <span class="muted small">{t.area}</span>
            </button>
          ))}
          <button class="alta" onClick={() => setAlta(/^[A-Z0-9]{4,6}$/i.test(texto.trim()) ? { rpe: rpeDeCodigo(texto) } : { nombre: texto.trim().toUpperCase() })}>
            <Icono n="mas1" /> Dar de alta a un trabajador nuevo o eventual
          </button>
        </div>
      )}

      {!texto && recientes.length > 0 && (
        <div class="row" style={{ gap: '6px' }}>
          <span class="muted small">Recientes:</span>
          {recientes.map((t) => (
            <button key={t.rpe} class="chip" onClick={() => onElegir(t)}>
              {t.nombre.split(' ').slice(0, 2).join(' ')}
            </button>
          ))}
        </div>
      )}

      {escaner && (
        <LectorTeclado
          onCerrar={() => setEscaner(false)}
          onCodigo={(c) => {
            setEscaner(false)
            resolver(c)
          }}
        />
      )}
      {gafete && (
        <LectorGafete
          onCerrar={() => setGafete(false)}
          onElegir={(t) => {
            setGafete(false)
            setTexto('')
            avisar(`Gafete leído: ${t.nombre}`)
            onElegir(t)
          }}
        />
      )}
      {alta && (
        <FormTrabajador
          inicial={alta}
          onCerrar={() => setAlta(null)}
          onListo={(t) => {
            setAlta(null)
            setTexto('')
            onElegir(t)
          }}
        />
      )}
    </div>
  )
}

/** Días desde una fecha YYYY-MM-DD hasta hoy. */
export const diasDesde = (fecha: string) => diasEntre(fecha, fechaLocal())

interface LecturaPrueba {
  hora: string
  origen: 'Código' | 'Foto'
  codigo: string
  rpe: string
  resultado: string
  ok: boolean
  segundos?: number
}

/**
 * Herramienta de prueba (Ajustes): lee gafetes con la cámara o webcam sin despachar ni
 * dar de alta a nadie, para saber si la cámara sirve y a qué distancia lee mejor.
 */
export function PruebaLectorGafete({ onCerrar }: { onCerrar: () => void }) {
  const [lecturas, setLecturas] = useState<LecturaPrueba[]>([])
  const [leyendo, setLeyendo] = useState('')
  const cuadros = useRef(0)
  const agregar = (l: Omit<LecturaPrueba, 'hora'>) => setLecturas((x) => [{ ...l, hora: new Date().toLocaleTimeString('es-MX') }, ...x].slice(0, 30))
  const describir = (rpe: string) => {
    const t = S.personal.value.get(rpe)
    return t ? { resultado: `${t.nombre} · ${t.area}`, ok: true } : { resultado: 'No está en el padrón (se ofrecería el alta)', ok: false }
  }

  const porCodigo = (codigo: string) => {
    if (!lecturaEscanerValida(codigo)) return agregar({ origen: 'Código', codigo, rpe: '', resultado: 'Lectura incompleta', ok: false })
    const rpe = resolverRpe(codigo, (x) => S.personal.value.has(x))
    agregar({ origen: 'Código', codigo, rpe, ...describir(rpe) })
  }

  const porFoto = async (f: Blob) => {
    const inicio = Date.now()
    setLeyendo('Leyendo la foto…')
    try {
      const { leerGafete } = await import('../lib/lectorGafete')
      const { interpretarGafete, rpeMasVotado } = await import('../lib/gafete')
      const r = await leerGafete(f, (texto, avance) => setLeyendo(avance !== undefined ? `${texto} ${Math.round(avance * 100)}%` : texto))
      const segundos = Math.round((Date.now() - inicio) / 100) / 10
      if (r.codigo) {
        const rpe = rpeDeCodigo(r.codigo)
        agregar({ origen: 'Foto', codigo: r.codigo, rpe, segundos, ...describir(rpe) })
      } else {
        const d = interpretarGafete(r.texto, listaAreas())
        const rpe = rpeDeCodigo(rpeMasVotado(r.zona) || interpretarGafete(r.zona, []).rpe || d.rpe)
        const base = rpe ? describir(rpe) : { resultado: 'No se leyó el RPE', ok: false }
        agregar({ origen: 'Foto', codigo: 'sin código · texto impreso', rpe, segundos, ...base, resultado: `${base.resultado} · leído: ${[d.nombre, d.area, d.puesto].filter(Boolean).join(' / ') || 'nada'}` })
      }
    } catch (e) {
      agregar({ origen: 'Foto', codigo: '', rpe: '', resultado: `Error: ${(e as Error).message}`, ok: false })
    }
    setLeyendo('')
  }

  const exitos = lecturas.filter((l) => l.ok).length
  return (
    <CamaraEnVivo
      titulo="Probar lector de gafete"
      continuo
      mostrarInfo
      ayuda={
        <>
          Ponga el gafete frente a la cámara a distintas distancias (15 a 40 cm). Cada vez que lea el código de barras aparece abajo. Con <strong>Tomar foto</strong> se prueba la lectura del texto impreso. No se registra nada.
        </>
      }
      buscarCodigo={async (c) => {
        const { codigoEnCuadro } = await import('../lib/lectorGafete')
        return codigoEnCuadro(c, cuadros.current++)
      }}
      onCodigo={porCodigo}
      onFoto={porFoto}
      onCerrar={onCerrar}
      guia={1.58}
    >
      {leyendo && <div class="aviso info small">{leyendo}</div>}
      <div class="stack" style={{ gap: '6px' }}>
        <strong class="small">
          Lecturas: {lecturas.length} · correctas: {exitos}
        </strong>
        {lecturas.map((l, i) => (
          <div key={i} class={`aviso small ${l.ok ? 'ok' : 'warn'}`} style={{ display: 'block' }}>
            <strong>
              {l.hora} · {l.origen}
              {l.segundos !== undefined && ` · ${l.segundos} s`}
            </strong>
            <br />
            Código: <span class="mono">{l.codigo || '—'}</span> → RPE <span class="mono">{l.rpe || '—'}</span>
            <br />
            {l.resultado}
          </div>
        ))}
      </div>
    </CamaraEnVivo>
  )
}
