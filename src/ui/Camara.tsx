import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { Modal } from './comunes'
import { Icono } from './iconos'

/**
 * Vista de la cámara trasera dentro de la app (sin salir a la app de Cámara, que en
 * algunos Android cierra la página). Permite tomar la foto, encender la linterna y,
 * mientras se apunta, busca un código de barras en cada cuadro.
 */
export function CamaraEnVivo(props: {
  titulo: string
  ayuda: ComponentChildren
  /** Se llama con cada cuadro (reducido) para buscar un código; si devuelve texto, termina. */
  buscarCodigo?: (cuadro: HTMLCanvasElement) => Promise<string>
  onCodigo?: (codigo: string) => void
  onFoto: (foto: Blob) => void
  onCerrar: () => void
  /** Proporción del recuadro guía (ancho / alto). */
  guia?: number
  textoFoto?: string
}) {
  const video = useRef<HTMLVideoElement>(null)
  const pista = useRef<MediaStreamTrack | null>(null)
  const [error, setError] = useState('')
  const [listo, setListo] = useState(false)
  const [linterna, setLinterna] = useState<boolean | null>(null)

  useEffect(() => {
    let activo = true
    let stream: MediaStream | null = null
    let temporizador: number | undefined
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('sin cámara')
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
        })
        if (!activo || !video.current) return stream.getTracks().forEach((t) => t.stop())
        pista.current = stream.getVideoTracks()[0]
        const capacidades = (pista.current.getCapabilities?.() ?? {}) as { torch?: boolean; focusMode?: string[] }
        if (capacidades.torch) setLinterna(false)
        if (capacidades.focusMode?.includes('continuous')) {
          pista.current.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {})
        }
        video.current.srcObject = stream
        await video.current.play()
        setListo(true)
        if (props.buscarCodigo) {
          const lienzo = document.createElement('canvas')
          const buscar = async () => {
            if (!activo) return
            const v = video.current
            if (v && v.videoWidth) {
              const escala = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight))
              lienzo.width = Math.round(v.videoWidth * escala)
              lienzo.height = Math.round(v.videoHeight * escala)
              lienzo.getContext('2d', { willReadFrequently: true })!.drawImage(v, 0, 0, lienzo.width, lienzo.height)
              const codigo = await props.buscarCodigo!(lienzo).catch(() => '')
              if (codigo && activo) {
                activo = false
                props.onCodigo?.(codigo)
                return
              }
            }
            temporizador = window.setTimeout(buscar, 350)
          }
          temporizador = window.setTimeout(buscar, 500)
        }
      } catch {
        setError('No se pudo abrir la cámara. Revise que el navegador tenga permiso de usar la cámara, o elija una foto de la galería.')
      }
    })()
    return () => {
      activo = false
      clearTimeout(temporizador)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const alternarLinterna = async () => {
    const nuevo = !linterna
    try {
      await pista.current?.applyConstraints({ advanced: [{ torch: nuevo } as MediaTrackConstraintSet] })
      setLinterna(nuevo)
    } catch {
      setLinterna(null)
    }
  }

  const tomar = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    c.toBlob((b) => b && props.onFoto(b), 'image/jpeg', 0.92)
  }

  const desdeArchivo = (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]
    ;(e.target as HTMLInputElement).value = ''
    if (f) props.onFoto(f)
  }

  const guia = props.guia ?? 1.55
  return (
    <Modal titulo={props.titulo} onCerrar={props.onCerrar}>
      {error ? (
        <div class="aviso bad">{error}</div>
      ) : (
        <div class="camara">
          <video ref={video} playsInline muted autoPlay />
          <div class="camara-guia" style={{ aspectRatio: String(guia) }} />
          {!listo && <span class="camara-espera">Abriendo cámara…</span>}
          {linterna !== null && (
            <button class={`btn sm camara-linterna ${linterna ? 'primary' : ''}`} onClick={alternarLinterna} aria-pressed={linterna} aria-label="Linterna">
              <Icono n="linterna" />
            </button>
          )}
        </div>
      )}
      <p class="muted small">{props.ayuda}</p>
      <div class="camara-acciones">
        {!error && (
          <button class="btn primary" disabled={!listo} onClick={tomar}>
            <Icono n="camara" /> {props.textoFoto ?? 'Tomar foto'}
          </button>
        )}
        {/* Una etiqueta con el campo adentro abre el selector de forma confiable en celulares */}
        <label class="btn">
          <Icono n="galeria" /> Galería o archivo
          <input type="file" accept="image/*" hidden onChange={desdeArchivo} />
        </label>
        {error && (
          <label class="btn primary">
            <Icono n="camara" /> Cámara del celular
            <input type="file" accept="image/*" capture="environment" hidden onChange={desdeArchivo} />
          </label>
        )}
      </div>
    </Modal>
  )
}

/**
 * Espera la lectura de un escáner de código de barras USB o Bluetooth (funcionan como
 * teclado: escriben el código y un Enter). En el celular no abre el teclado en pantalla.
 */
export function LectorTeclado({ onCodigo, onCerrar }: { onCodigo: (c: string) => void; onCerrar: () => void }) {
  const campo = useRef<HTMLInputElement>(null)
  const [valor, setValor] = useState('')
  const [manual, setManual] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => campo.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [manual])
  const enviar = () => {
    const c = valor.trim()
    if (c) onCodigo(c)
    setValor('')
  }
  return (
    <Modal titulo="Escáner de código de barras" onCerrar={onCerrar}>
      <div class="lector-espera" onClick={() => campo.current?.focus()}>
        <Icono n="lector" />
        <strong>Listo para escanear</strong>
        <span class="muted small">Apunte el escáner USB o Bluetooth al código del gafete y dispare.</span>
      </div>
      <label class="campo">
        {manual ? 'Escriba el RPE y presione Enter' : 'Lectura'}
        <input
          ref={campo}
          id="lector-teclado"
          class="input mono"
          inputMode={manual ? 'text' : 'none'}
          autoComplete="off"
          autoCapitalize="characters"
          value={valor}
          placeholder="Esperando lectura…"
          onInput={(e) => setValor((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              enviar()
            }
          }}
        />
      </label>
      <p class="muted small">
        El escáner debe estar configurado como teclado (HID) y terminar con Enter, que es lo normal. En el celular, primero vincule el escáner por Bluetooth.{' '}
        {!manual && (
          <button class="btn ghost sm" onClick={() => setManual(true)}>
            Escribir a mano
          </button>
        )}
      </p>
    </Modal>
  )
}
