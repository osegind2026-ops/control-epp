import { useEffect, useState } from 'preact/hooks'
import {
  cargarPlantilla,
  guardarImagenPlantilla,
  guardarTextosPlantilla,
  IMAGENES,
  leerImagenPlantilla,
  type ClaveImagen,
  type Plantilla,
} from '../reportes/plantilla'
import { avisar, intentar } from './comunes'
import { Icono } from './iconos'

/** Ajustes → logotipos, fondos y textos de los reportes (Excel, PDF y presentación). */
export function PlantillaReportes() {
  const [p, setP] = useState<Plantilla | null>(null)
  const [institucion, setInstitucion] = useState('')
  const [oficina, setOficina] = useState('')

  const recargar = async () => {
    const x = await cargarPlantilla()
    setP(x)
    setInstitucion(x.textos.institucion)
    setOficina(x.textos.oficina)
  }
  useEffect(() => {
    void recargar()
  }, [])

  const cambiar = async (clave: ClaveImagen, e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]
    ;(e.target as HTMLInputElement).value = ''
    if (!f) return
    const esFondo = clave.startsWith('fondo')
    const ok = await intentar(async () => {
      await guardarImagenPlantilla(clave, await leerImagenPlantilla(f, esFondo ? 1920 : 900))
      return true
    })
    if (ok) {
      avisar('✓ Imagen de la plantilla actualizada')
      await recargar()
    }
  }

  const restaurar = async (clave: ClaveImagen) => {
    await guardarImagenPlantilla(clave, null)
    await recargar()
    avisar('Se restauró la imagen original')
  }

  const guardarTextos = async () => {
    await guardarTextosPlantilla({ institucion: institucion.trim(), oficina: oficina.trim() })
    avisar('✓ Textos de la plantilla guardados')
  }

  return (
    <section class="card stack">
      <h2>Plantilla de reportes</h2>
      <p class="muted small">
        Logotipos y fondos que usan el PDF y la presentación. Cuando cambie el emblema del año (por ejemplo, el de 2026), reemplácelo aquí. Los cambios se guardan en este equipo.
      </p>
      {!p ? (
        <p class="muted small">Cargando…</p>
      ) : (
        <div class="plantilla-grid">
          {IMAGENES.map((img) => (
            <div key={img.clave} class="plantilla-item">
              <span class={`plantilla-vista ${img.clave.startsWith('fondo') ? 'fondo' : ''}`}>
                <img src={p.imagenes[img.clave].dataUrl} alt={img.nombre} />
              </span>
              <strong class="small">{img.nombre}</strong>
              <span class="muted small">{img.ayuda}</span>
              <div class="row" style={{ gap: '4px' }}>
                <label class="btn sm" style={{ cursor: 'pointer' }}>
                  <Icono n="subir" /> Cambiar
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml" hidden onChange={(e) => cambiar(img.clave, e)} />
                </label>
                {p.personalizadas.includes(img.clave) && (
                  <button class="btn sm ghost" onClick={() => restaurar(img.clave)}>
                    Restaurar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div class="row" style={{ alignItems: 'end' }}>
        <label class="campo grow">
          Institución
          <input class="input" id="pl-institucion" value={institucion} onInput={(e) => setInstitucion((e.target as HTMLInputElement).value)} />
        </label>
        <label class="campo grow">
          Oficina
          <input class="input" id="pl-oficina" value={oficina} onInput={(e) => setOficina((e.target as HTMLInputElement).value)} />
        </label>
        <button class="btn" onClick={guardarTextos}>
          Guardar
        </button>
      </div>
      <p class="muted small">
        En la presentación, los logotipos y fondos también se pueden cambiar después en PowerPoint: <em>Vista → Patrón de diapositivas</em>.
      </p>
    </section>
  )
}
