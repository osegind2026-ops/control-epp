import { guardarConfig, leerConfig } from '../db/db'

// Imágenes y textos de la plantilla institucional de los reportes. Las imágenes
// por defecto vienen con la app (public/plantilla); cada una se puede
// reemplazar desde Ajustes (p. ej. el logotipo del año cuando cambie).

export type ClaveImagen = 'fondoPortada' | 'fondoContenido' | 'logoEncabezado' | 'logoAnio' | 'logoPie'

export const IMAGENES: { clave: ClaveImagen; nombre: string; archivo: string; ayuda: string }[] = [
  { clave: 'logoEncabezado', nombre: 'Logotipo del encabezado', archivo: 'logo_encabezado.png', ayuda: 'Gobierno de México · CFE, arriba a la derecha' },
  { clave: 'logoAnio', nombre: 'Logotipo del año', archivo: 'logo_anio.png', ayuda: 'Emblema oficial del año (cámbielo cada año)' },
  { clave: 'logoPie', nombre: 'Logotipo del pie', archivo: 'logo_pie.png', ayuda: 'Coordinación Nuclear, abajo a la derecha' },
  { clave: 'fondoPortada', nombre: 'Fondo de portada', archivo: 'fondo_portada.jpg', ayuda: 'Imagen horizontal 16:9, sin logotipos' },
  { clave: 'fondoContenido', nombre: 'Fondo de láminas', archivo: 'fondo_contenido.jpg', ayuda: 'Imagen horizontal 16:9, sin logotipos' },
]

export interface TextosPlantilla {
  institucion: string
  oficina: string
}

export const TEXTOS_POR_DEFECTO: TextosPlantilla = {
  institucion: 'Central Nucleoeléctrica Laguna Verde',
  oficina: 'Oficina de Seguridad Industrial',
}

export interface Plantilla {
  imagenes: Record<ClaveImagen, { dataUrl: string; ancho: number; alto: number }>
  textos: TextosPlantilla
  personalizadas: ClaveImagen[]
}

async function aDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob()
  return new Promise((ok, falla) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result))
    r.onerror = () => falla(r.error)
    r.readAsDataURL(blob)
  })
}

function medidas(dataUrl: string): Promise<{ ancho: number; alto: number }> {
  return new Promise((ok) => {
    const i = new Image()
    i.onload = () => ok({ ancho: i.naturalWidth, alto: i.naturalHeight })
    i.onerror = () => ok({ ancho: 1, alto: 1 })
    i.src = dataUrl
  })
}

export async function cargarPlantilla(): Promise<Plantilla> {
  const propias = await leerConfig<Partial<Record<ClaveImagen, string>>>('plantillaImagenes', {})
  const textos = { ...TEXTOS_POR_DEFECTO, ...(await leerConfig<Partial<TextosPlantilla>>('plantillaTextos', {})) }
  const imagenes = {} as Plantilla['imagenes']
  for (const img of IMAGENES) {
    const dataUrl = propias[img.clave] ?? (await aDataUrl(new URL(`./plantilla/${img.archivo}`, document.baseURI).href))
    imagenes[img.clave] = { dataUrl, ...(await medidas(dataUrl)) }
  }
  return { imagenes, textos, personalizadas: Object.keys(propias) as ClaveImagen[] }
}

export async function guardarImagenPlantilla(clave: ClaveImagen, dataUrl: string | null): Promise<void> {
  const propias = await leerConfig<Partial<Record<ClaveImagen, string>>>('plantillaImagenes', {})
  if (dataUrl) propias[clave] = dataUrl
  else delete propias[clave]
  await guardarConfig('plantillaImagenes', propias)
}

export async function guardarTextosPlantilla(textos: TextosPlantilla): Promise<void> {
  await guardarConfig('plantillaTextos', textos)
}

/** Lee una imagen elegida por el usuario conservando transparencia (PNG) y limitando su tamaño. */
export async function leerImagenPlantilla(archivo: File, maxLado: number): Promise<string> {
  const url = URL.createObjectURL(archivo)
  try {
    const img = await new Promise<HTMLImageElement>((ok, falla) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => falla(new Error('No se pudo leer la imagen.'))
      i.src = url
    })
    const escala = Math.min(1, maxLado / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * escala)
    c.height = Math.round(img.height * escala)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return archivo.type === 'image/png' || archivo.type === 'image/svg+xml' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}
