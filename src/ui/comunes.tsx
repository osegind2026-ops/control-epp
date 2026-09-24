import { signal } from '@preact/signals'
import type { ComponentChildren } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import * as S from '../state/store'
import { ErrorNegocio } from '../state/servicios'
import { IlustracionMaterial, Icono } from './iconos'

// ---------- Avisos flotantes ----------

interface Toast {
  id: number
  texto: string
  tipo?: 'bad'
  accion?: { texto: string; fn: () => void }
}
export const toasts = signal<Toast[]>([])
let siguienteToast = 1

export function avisar(texto: string, opciones: { tipo?: 'bad'; accion?: Toast['accion']; ms?: number } = {}): void {
  const id = siguienteToast++
  toasts.value = [...toasts.value.slice(-2), { id, texto, tipo: opciones.tipo, accion: opciones.accion }]
  setTimeout(() => cerrarToast(id), opciones.ms ?? 3500)
}
export function cerrarToast(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

/** Ejecuta una operación y muestra el error de negocio como aviso. */
export async function intentar<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (e) {
    const msg = e instanceof ErrorNegocio ? e.message : `Ocurrió un error: ${(e as Error).message}`
    avisar(msg, { tipo: 'bad', ms: 5000 })
    if (!(e instanceof ErrorNegocio)) console.error(e)
    return undefined
  }
}

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class={`toast ${t.tipo ?? ''}`}>
          <span>{t.texto}</span>
          {t.accion && (
            <button
              onClick={() => {
                t.accion!.fn()
                cerrarToast(t.id)
              }}
            >
              {t.accion.texto}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------- Modal ----------

export function Modal(props: { titulo: string; onCerrar: () => void; ancho?: boolean; children: ComponentChildren; acciones?: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    const primero = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.cerrar-modal)')
    primero?.focus()
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onCerrar()
    }
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('keydown', tecla)
      previo?.focus?.()
    }
  }, [])
  return (
    <div class="velo" onClick={(e) => e.target === e.currentTarget && props.onCerrar()}>
      <div class={`modal ${props.ancho ? 'ancho' : ''}`} role="dialog" aria-modal="true" aria-label={props.titulo} ref={ref}>
        <div class="spread">
          <h2>{props.titulo}</h2>
          <button class="btn ghost sm cerrar-modal" onClick={props.onCerrar} aria-label="Cerrar">
            <Icono n="cerrar" />
          </button>
        </div>
        {props.children}
        {props.acciones && <div class="modal-acciones">{props.acciones}</div>}
      </div>
    </div>
  )
}

// ---------- Confirmación ----------

interface Pregunta {
  titulo: string
  texto: string
  si: string
  peligro?: boolean
  resolver: (v: boolean) => void
}
const pregunta = signal<Pregunta | null>(null)

export function confirmar(titulo: string, texto: string, si = 'Confirmar', peligro = false): Promise<boolean> {
  return new Promise((resolver) => {
    pregunta.value = { titulo, texto, si, peligro, resolver }
  })
}

export function Confirmacion() {
  const p = pregunta.value
  if (!p) return null
  const cerrar = (v: boolean) => {
    pregunta.value = null
    p.resolver(v)
  }
  return (
    <Modal
      titulo={p.titulo}
      onCerrar={() => cerrar(false)}
      acciones={
        <>
          <button class="btn" onClick={() => cerrar(false)}>
            Cancelar
          </button>
          <button class={`btn ${p.peligro ? 'danger' : 'primary'}`} onClick={() => cerrar(true)}>
            {p.si}
          </button>
        </>
      }
    >
      <p style={{ whiteSpace: 'pre-line' }}>{p.texto}</p>
    </Modal>
  )
}

// ---------- Material ----------

export function FotoMaterial({ materialId, mini }: { materialId: string; mini?: boolean }) {
  const m = S.materialesPorId.value.get(materialId)
  const src = m?.fotoId ? S.fotos.value.get(m.fotoId) : undefined
  return (
    <span class={`foto ${mini ? 'mini' : ''}`}>
      {src ? <img src={src} alt="" loading="lazy" /> : <IlustracionMaterial icono={m?.icono} />}
    </span>
  )
}

export function Talla({ materialId, varianteId }: { materialId: string; varianteId: string }) {
  if (!varianteId) return null
  const v = S.materialesPorId.value.get(materialId)?.variantes.find((x) => x.id === varianteId)
  return (
    <span class="row" style={{ gap: '4px', display: 'inline-flex' }}>
      {v?.color && <span class="swatch" style={{ background: v.color }} />}
      {v?.etiqueta ?? varianteId}
    </span>
  )
}

// ---------- Selección de motivos ----------

export function SelectorMotivo(props: { tipo: Parameters<typeof S.motivosDe>[0]; valor: string; onCambio: (id: string) => void; id?: string; vacio?: string }) {
  return (
    <select id={props.id} class="input" value={props.valor} onChange={(e) => props.onCambio((e.target as HTMLSelectElement).value)}>
      <option value="">{props.vacio ?? 'Elija un motivo…'}</option>
      {S.motivosDe(props.tipo).map((m) => (
        <option key={m.id} value={m.id}>
          {m.texto}
        </option>
      ))}
    </select>
  )
}

export function Vacio({ children }: { children: ComponentChildren }) {
  return <div class="card muted" style={{ textAlign: 'center', padding: '28px 16px' }}>{children}</div>
}
