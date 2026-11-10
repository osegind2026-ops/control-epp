// Copia a public/ocr los archivos de Tesseract (motor, trabajador y datos en español)
// para que la lectura de gafetes funcione sin depender de sitios externos.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const destino = join(raiz, 'public', 'ocr')
mkdirSync(destino, { recursive: true })
const archivos = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz', 'spa.traineddata.gz'],
]
for (const [origen, nombre] of archivos) {
  const ruta = join(raiz, origen)
  if (!existsSync(ruta)) throw new Error(`Falta ${origen}. Ejecute npm install.`)
  copyFileSync(ruta, join(destino, nombre))
}
console.log(`OCR: ${archivos.length} archivos copiados a public/ocr`)
