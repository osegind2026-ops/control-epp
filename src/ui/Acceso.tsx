import { nombreRol, rolDe } from '../state/permisos'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { Usuario } from '../domain/types'
import { iniciales } from '../lib/util'
import { iniciarSesion } from '../state/servicios'
import * as S from '../state/store'

/** Teclado numérico para el PIN. Prueba en cuanto hay 4, 5 o 6 dígitos. */
export function TecladoPin({ onIntento, error }: { onIntento: (pin: string) => boolean; error?: boolean }) {
  const [pin, setPinEstado] = useState('')
  const [mal, setMal] = useState(false)
  // Referencia al valor actual: las teclas pueden llegar más rápido que el render.
  const actual = useRef('')
  const intento = useRef(onIntento)
  intento.current = onIntento
  const setPin = (v: string) => {
    actual.current = v
    setPinEstado(v)
  }

  const teclear = (k: string) => {
    setMal(false)
    if (k === 'borrar') return setPin(actual.current.slice(0, -1))
    if (actual.current.length >= 6) return
    const nuevo = actual.current + k
    setPin(nuevo)
    if (nuevo.length >= 4 && intento.current(nuevo)) return
    if (nuevo.length === 6) {
      setMal(true)
      setTimeout(() => setPin(''), 350)
    }
  }

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) teclear(e.key)
      else if (e.key === 'Backspace') teclear('borrar')
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  return (
    <div class="stack" style={{ gap: '16px' }}>
      <div class={`puntos ${mal || error ? 'error' : ''}`} aria-label={`${pin.length} dígitos`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <i key={i} class={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <div class="pinpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'borrar'].map((k) =>
          k === '' ? (
            <span key="v" />
          ) : (
            <button key={k} onClick={() => teclear(k)} aria-label={k === 'borrar' ? 'Borrar' : k}>
              {k === 'borrar' ? '←' : k}
            </button>
          ),
        )}
      </div>
      {mal && <p class="small" style={{ color: 'var(--bad)', textAlign: 'center' }}>PIN incorrecto</p>}
    </div>
  )
}

export function PantallaAcceso() {
  const lista = S.usuariosActivos.value
  const [elegido, setElegido] = useState<Usuario | null>(lista.length === 1 ? lista[0] : null)

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '20px' }}>
      <div class="card stack" style={{ width: '100%', maxWidth: '400px', gap: '18px', padding: '22px' }}>
        <div class="stack" style={{ gap: '4px' }}>
          <span class="badge ok" style={{ justifySelf: 'start' }}>
            Equipo {S.dispositivo.value?.codigo}
          </span>
          <h1>Control EPP</h1>
          <p class="muted">{elegido ? `Hola, ${elegido.nombre}. Escriba su PIN.` : '¿Quién va a despachar?'}</p>
        </div>
        {!elegido ? (
          <div class="stack" style={{ gap: '8px' }}>
            {lista.map((u) => (
              <button key={u.id} class="usuario-chip" style={{ padding: '12px' }} onClick={() => setElegido(u)}>
                <span class="badge ok" style={{ fontSize: '14px', padding: '8px' }}>
                  {iniciales(u.nombre)}
                </span>
                <span class="grow">
                  <strong>{u.nombre}</strong>
                  {rolDe(u) !== 'despachador' && <span class="muted small"> · {nombreRol(rolDe(u)).toLowerCase()}</span>}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <TecladoPin onIntento={(pin) => iniciarSesion(elegido, pin)} />
            {lista.length > 1 && (
              <button class="btn ghost" onClick={() => setElegido(null)}>
                Cambiar de usuario
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
