/** Tamaño máximo de la foto en texto: una celda de Google Sheets admite 50 000 caracteres. */
export const MAX_CARACTERES_FOTO = 42000

/**
 * Reduce una foto a un tamaño adecuado para la tarjeta del material. Baja la
 * calidad y el tamaño hasta que quepa en una celda de la hoja de la nube.
 * Una foto de celular de 3 MB queda en ~20 KB.
 */
export async function comprimirFoto(archivo: File): Promise<string> {
  const url = URL.createObjectURL(archivo)
  try {
    const img = await new Promise<HTMLImageElement>((ok, falla) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => falla(new Error('No se pudo leer la imagen.'))
      i.src = url
    })
    for (const [lado, calidad] of [
      [420, 0.72],
      [360, 0.65],
      [300, 0.6],
      [240, 0.55],
    ] as const) {
      const escala = Math.min(1, lado / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * escala)
      canvas.height = Math.round(img.height * escala)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const data = canvas.toDataURL('image/jpeg', calidad)
      if (data.length <= MAX_CARACTERES_FOTO) return data
    }
    throw new Error('La foto es demasiado detallada. Intente con otra más sencilla o con fondo liso.')
  } finally {
    URL.revokeObjectURL(url)
  }
}
