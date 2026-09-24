import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { AREAS } from '../db/semilla'
import { buscarTrabajadores, resolverRpe } from '../domain/logica'
import type { Trabajador } from '../domain/types'
import { diasEntre, fechaLocal, hace, iniciales } from '../lib/util'
import { guardarTrabajador } from '../state/servicios'
import * as S from '../state/store'
import { intentar, Modal } from './comunes'
import { Escaner } from './Escaner'
import { Icono } from './iconos'

export function listaAreas(): string[] {
  const set = new Set(AREAS)
  for (const t of S.personal.value.values()) if (t.area) set.add(t.area)
  return [...set].sort()
}

/** Alta o edición de un trabajador (planta o eventual). */
export function FormTrabajador(props: { inicial?: Partial<Trabajador>; onListo: (t: Trabajador) => void; onCerrar: () => void }) {
  const i = props.inicial ?? {}
  const existente = !!(i.rpe && S.personal.value.get(i.rpe))
  const [rpe, setRpe] = useState(i.rpe ?? '')
  const [nombre, setNombre] = useState(i.nombre ?? '')
  const [area, setArea] = useState(i.area ?? '')
  const [puesto, setPuesto] = useState(i.puesto ?? 'OPERADOR / TÉCNICO')
  const [casillero, setCasillero] = useState(i.casillero ?? '')
  const [tipo, setTipo] = useState<Trabajador['tipo']>(i.tipo ?? 'eventual')
  const [vigencia, setVigencia] = useState(i.vigencia ?? '')
  const [activo, setActivo] = useState(i.activo ?? true)

  const guardar = async () => {
    const t = await intentar(() =>
      guardarTrabajador({
        rpe,
        nombre,
        area: area.trim().toUpperCase() || 'SIN ÁREA',
        puesto,
        casillero,
        tipo,
        vigencia: tipo === 'eventual' ? vigencia || undefined : undefined,
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
      <div class="row" role="group" aria-label="Tipo de trabajador">
        <button class="chip" aria-pressed={tipo === 'eventual'} onClick={() => setTipo('eventual')}>
          Eventual
        </button>
        <button class="chip" aria-pressed={tipo === 'planta'} onClick={() => setTipo('planta')}>
          Planta
        </button>
      </div>
      <div class="row" style={{ alignItems: 'start' }}>
        <label class="campo" style={{ width: '120px' }}>
          RPE
          <input class="input" id="tr-rpe" value={rpe} disabled={existente} onInput={(e) => setRpe((e.target as HTMLInputElement).value.toUpperCase())} />
        </label>
        <label class="campo grow">
          Nombre completo
          <input class="input" id="tr-nombre" value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <label class="campo">
        Área
        <input class="input" id="tr-area" list="areas-lista" value={area} onInput={(e) => setArea((e.target as HTMLInputElement).value)} />
        <datalist id="areas-lista">
          {listaAreas().map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      </label>
      <div class="row" style={{ alignItems: 'start' }}>
        <label class="campo grow">
          Puesto
          <input class="input" id="tr-puesto" value={puesto} onInput={(e) => setPuesto((e.target as HTMLInputElement).value)} />
        </label>
        <label class="campo" style={{ width: '120px' }}>
          Casillero
          <input class="input" id="tr-casillero" value={casillero} onInput={(e) => setCasillero((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      {tipo === 'eventual' && (
        <label class="campo">
          Vigencia del contrato (opcional)
          <input class="input" id="tr-vigencia" type="date" value={vigencia} onInput={(e) => setVigencia((e.target as HTMLInputElement).value)} />
        </label>
      )}
      {existente && (
        <label class="check">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo((e.target as HTMLInputElement).checked)} />
          Activo
        </label>
      )}
    </Modal>
  )
}

/** Tarjeta del trabajador elegido, con sus resguardos activos y su última entrega. */
export function TarjetaTrabajador({ t, onQuitar, onEditar }: { t: Trabajador; onQuitar: () => void; onEditar?: () => void }) {
  const activos = S.resguardosActivos.value.filter((r) => r.rpe === t.rpe)
  const ultima = [...S.entregas.value].reverse().find((e) => e.rpe === t.rpe && e.estado === 'registrada')
  const vencido = t.tipo === 'eventual' && t.vigencia && t.vigencia < fechaLocal()
  return (
    <div class="trabajador">
      <span class="avatar">{iniciales(t.nombre)}</span>
      <div class="grow stack" style={{ gap: '4px' }}>
        <div class="row" style={{ gap: '6px' }}>
          <strong class="nombre">{t.nombre}</strong>
          {t.tipo === 'eventual' && <span class={`badge ${vencido ? 'bad' : 'warn'}`}>{vencido ? 'Eventual · vigencia vencida' : 'Eventual'}</span>}
        </div>
        <span class="muted small">
          <span class="mono">{t.rpe}</span> · {t.area}
          {t.casillero && ` · Casillero ${t.casillero}`}
        </span>
        <span class="muted small">
          {ultima ? `Última entrega ${hace(ultima.ts)} (${ultima.folio})` : 'Sin entregas registradas'}
          {activos.length > 0 && ` · En resguardo: ${activos.map((r) => S.nombreMaterial(r.materialId, r.varianteId)).join(', ')}`}
        </span>
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
  const [camara, setCamara] = useState(false)
  const [alta, setAlta] = useState<Partial<Trabajador> | null>(null)
  const [activo, setActivo] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  const lista = useMemo(() => [...S.personal.value.values()], [S.personal.value])
  const resultados = useMemo(() => buscarTrabajadores(lista, texto), [lista, texto])

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
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
            placeholder="Escanee la credencial o escriba RPE o nombre"
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
        <button class="btn" onClick={() => setCamara(true)} aria-label="Escanear con la cámara">
          <Icono n="camara" />
          <span class="solo-ancho">Cámara</span>
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
          <button class="alta" onClick={() => setAlta(/^[A-Z0-9]{4,6}$/i.test(texto.trim()) ? { rpe: texto.trim().toUpperCase() } : { nombre: texto.trim().toUpperCase() })}>
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

      {camara && (
        <Escaner
          onCerrar={() => setCamara(false)}
          onCodigo={(c) => {
            setCamara(false)
            resolver(c)
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
