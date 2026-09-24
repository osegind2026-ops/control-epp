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
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
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
          const { BarcodeFormat, DecodeHintType } = await import('@zxing/library')
          // TRY_HARDER también prueba la imagen girada: el código del gafete va vertical
          const pistas = new Map<number, unknown>([
            [DecodeHintType.TRY_HARDER, true],
            [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_39, BarcodeFormat.CODE_128, BarcodeFormat.CODE_93, BarcodeFormat.CODABAR, BarcodeFormat.ITF, BarcodeFormat.QR_CODE]],
          ])
          const lector = new BrowserMultiFormatReader(pistas as Map<never, unknown>, { delayBetweenScanAttempts: 150 })
          const controles = await lector.decodeFromConstraints(
            { video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } },
            video.current!,
            (res) => {
              if (res) listo(res.getText())
            },
          )
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
      <p class="muted small">
        Acerque el código de barras al recuadro. El del gafete va de arriba abajo: gire el gafete (o el celular) para que las barras queden horizontales. Si no lo lee, use
        «Gafete» para leerlo con una foto.
      </p>
    </Modal>
  )
}
