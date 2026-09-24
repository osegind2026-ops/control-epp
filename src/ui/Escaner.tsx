import { useEffect, useRef, useState } from 'preact/hooks'
import { Modal } from './comunes'

interface DetectorNativo {
  detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]>
}

/**
 * Lee la credencial con la cámara. Usa el detector nativo del navegador cuando
 * existe (Android/Chrome) y, si no (iPhone/Safari), la librería ZXing, que se
 * carga solo al abrir la cámara.
 */
export function Escaner({ onCodigo, onCerrar }: { onCodigo: (c: string) => void; onCerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    let stream: MediaStream | null = null
    let intervalo: number | undefined
    let detenerZxing: (() => void) | undefined

    const listo = (codigo: string) => {
      if (!activo) return
      activo = false
      onCodigo(codigo)
    }

    ;(async () => {
      try {
        const Nativo = (window as unknown as { BarcodeDetector?: new (o: object) => DetectorNativo }).BarcodeDetector
        if (Nativo) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
          if (!video.current) return
          video.current.srcObject = stream
          await video.current.play()
          const det = new Nativo({ formats: ['code_128', 'code_39', 'code_93', 'ean_13', 'qr_code', 'pdf417'] })
          intervalo = window.setInterval(async () => {
            try {
              const r = await det.detect(video.current!)
              if (r.length) listo(r[0].rawValue)
            } catch {
              /* cuadro sin código */
            }
          }, 300)
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser')
          const lector = new BrowserMultiFormatReader()
          const controles = await lector.decodeFromVideoDevice(undefined, video.current!, (res) => {
            if (res) listo(res.getText())
          })
          detenerZxing = () => controles.stop()
        }
      } catch {
        setError('No se pudo abrir la cámara. Revise el permiso del navegador o escriba el RPE.')
      }
    })()

    return () => {
      activo = false
      if (intervalo) clearInterval(intervalo)
      detenerZxing?.()
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <Modal titulo="Escanear credencial" onCerrar={onCerrar}>
      {error ? (
        <div class="aviso bad">{error}</div>
      ) : (
        <div style={{ position: 'relative', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
          <video ref={video} playsInline muted style={{ width: '100%', display: 'block' }} />
          <div
            style={{
              position: 'absolute',
              inset: '28% 12%',
              border: '3px solid #4cc283',
              borderRadius: '10px',
              boxShadow: '0 0 0 999px rgba(0,0,0,0.35)',
            }}
          />
        </div>
      )}
      <p class="muted small">Acerque el código de barras de la credencial al recuadro.</p>
    </Modal>
  )
}
