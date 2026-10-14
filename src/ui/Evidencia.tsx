import { useState } from 'preact/hooks'
import { comprimirFoto } from '../lib/imagen'
import { MAX_FOTOS_EVIDENCIA } from '../state/servicios'
import * as S from '../state/store'
import { intentar } from './comunes'
import { Icono } from './iconos'

/** Vista ampliada de una foto; se cierra al tocarla. */
function FotoAmpliada({ src, onCerrar }: { src: string; onCerrar: () => void }) {
  return (
    <div class="velo foto-ampliada" onClick={onCerrar} role="dialog" aria-modal="true" aria-label="Foto ampliada">
      <img src={src} alt="Foto del equipo" />
      <button class="btn" onClick={onCerrar}>
        Cerrar
      </button>
    </div>
  )
}

/**
 * Para adjuntar fotos al recibir un equipo (daños, faltantes): con la cámara o desde la
 * galería/archivo. Las fotos se reducen de tamaño antes de guardarse.
 */
export function CapturaFotos({ fotos, onCambio, sugerida }: { fotos: string[]; onCambio: (f: string[]) => void; sugerida?: boolean }) {
  const [ver, setVer] = useState('')
  const agregar = async (e: Event) => {
    const archivos = [...((e.target as HTMLInputElement).files ?? [])]
    ;(e.target as HTMLInputElement).value = ''
    let lista = fotos
    for (const a of archivos) {
      if (lista.length >= MAX_FOTOS_EVIDENCIA) break
      const data = await intentar(() => comprimirFoto(a))
      if (data) lista = [...lista, data]
    }
    onCambio(lista)
  }
  const lleno = fotos.length >= MAX_FOTOS_EVIDENCIA
  return (
    <div class={`stack evidencia ${sugerida && !fotos.length ? 'sugerida' : ''}`} style={{ gap: '6px' }}>
      <span class="small" style={{ fontWeight: 600 }}>
        Fotos del equipo {sugerida ? '(recomendado: muestre el daño o lo que falta)' : '(opcional)'}
      </span>
      {fotos.length > 0 && (
        <div class="evidencia-fotos">
          {fotos.map((f, i) => (
            <span key={i} class="evidencia-foto">
              <img src={f} alt={`Foto ${i + 1}`} onClick={() => setVer(f)} />
              <button class="quitar" aria-label={`Quitar foto ${i + 1}`} onClick={() => onCambio(fotos.filter((_, j) => j !== i))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {!lleno && (
        <div class="row" style={{ gap: '6px' }}>
          <label class="btn sm soft" style={{ cursor: 'pointer' }}>
            <Icono n="camara" /> Tomar foto
            <input type="file" accept="image/*" capture="environment" hidden onChange={agregar} />
          </label>
          <label class="btn sm soft" style={{ cursor: 'pointer' }}>
            <Icono n="galeria" /> Galería o archivo
            <input type="file" accept="image/*" multiple hidden onChange={agregar} />
          </label>
          <span class="muted small">
            {fotos.length} de {MAX_FOTOS_EVIDENCIA}
          </span>
        </div>
      )}
      {ver && <FotoAmpliada src={ver} onCerrar={() => setVer('')} />}
    </div>
  )
}

/** Miniaturas de las fotos guardadas con una devolución; al tocarlas se amplían. */
export function FotosGuardadas({ ids }: { ids?: string[] }) {
  const [ver, setVer] = useState('')
  const fotos = (ids ?? []).map((id) => S.fotos.value.get(id)).filter((x): x is string => !!x)
  if (!ids?.length) return null
  if (!fotos.length) return <span class="muted small">{ids.length} foto(s) aún sin sincronizar</span>
  return (
    <span class="evidencia-fotos">
      {fotos.map((f, i) => (
        <span key={i} class="evidencia-foto chica">
          <img
            src={f}
            alt={`Foto ${i + 1} del equipo devuelto`}
            onClick={(e) => {
              e.stopPropagation()
              setVer(f)
            }}
          />
        </span>
      ))}
      {ver && <FotoAmpliada src={ver} onCerrar={() => setVer('')} />}
    </span>
  )
}
