import { signal } from '@preact/signals'
import { VERSION } from '../version'
import { enServidorOficina } from './nube'

// En las PCs la app se carga del servidor de la oficina (sin caché de celular). Cuando se actualiza
// la PC host, las ventanas que ya estaban abiertas siguen con la versión anterior hasta recargarse:
// aquí se revisa la versión del servidor y se recarga sola en cuanto nadie la está usando.

/** Versión nueva disponible en el servidor ('' = está al día). */
export const versionNueva = signal('')

let trabajoEnCurso: () => boolean = () => false
/** Las pantallas avisan si hay algo a medias (p. ej. un ticket sin entregar) para no recargar encima. */
export function registrarTrabajoEnCurso(fn: () => boolean): void {
  trabajoEnCurso = fn
}

export function vigilarVersion(): void {
  if (!enServidorOficina() || typeof window === 'undefined') return
  let ultimaActividad = Date.now()
  for (const e of ['pointerdown', 'keydown']) window.addEventListener(e, () => (ultimaActividad = Date.now()), { passive: true })
  const revisar = async () => {
    try {
      const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })
      if (!r.ok) return
      const d = (await r.json()) as { version?: string }
      if (!d.version || d.version === VERSION) return
      versionNueva.value = d.version
      // Una sola recarga automática por versión: si después sigue distinta, queda solo el aviso
      let yaRecargo = false
      try {
        yaRecargo = sessionStorage.getItem('eppRecargaVersion') === d.version
      } catch {
        /* sin almacenamiento: se recarga igual */
      }
      const quieto = Date.now() - ultimaActividad > 60000 || document.visibilityState === 'hidden'
      if (quieto && !yaRecargo && !trabajoEnCurso() && !document.querySelector('.velo')) {
        try {
          sessionStorage.setItem('eppRecargaVersion', d.version)
        } catch {
          /* sin almacenamiento */
        }
        location.reload()
      }
    } catch {
      /* el servidor se está reiniciando: se revisa en la siguiente vuelta */
    }
  }
  window.setInterval(revisar, 30000)
  void revisar()
}
