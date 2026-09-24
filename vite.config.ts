import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Dos salidas:
// - `npm run build`          → PWA instalable (requiere publicarse en un sitio HTTPS).
// - `npm run build:archivo`  → un solo HTML que se abre con doble clic (sin instalación ni modo offline de PWA).
export default defineConfig(({ mode }) => {
  const archivo = mode === 'archivo'
  return {
    base: './',
    plugins: [
      preact(),
      archivo
        ? viteSingleFile()
        : VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'plantilla/*'],
            manifest: {
              name: 'Control EPP · Laguna Verde',
              short_name: 'Control EPP',
              description: 'Despacho de EPP, resguardos e inventario de la Oficina de Seguridad Industrial',
              lang: 'es-MX',
              theme_color: '#0A6E3C',
              background_color: '#F2F4F1',
              display: 'standalone',
              start_url: './',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}'],
              // El lector de gafetes (~12 MB) se descarga solo la primera vez que se usa
              globIgnores: ['ocr/**'],
              maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
              runtimeCaching: [
                {
                  urlPattern: ({ url }) => url.pathname.includes('/ocr/'),
                  handler: 'CacheFirst',
                  options: { cacheName: 'lector-gafetes', expiration: { maxEntries: 10 } },
                },
              ],
            },
          }),
    ],
    build: {
      outDir: archivo ? 'dist-archivo' : 'dist',
    },
    test: {
      environment: 'node',
    },
  }
})
