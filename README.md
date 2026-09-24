# Control EPP v2 · Oficina de Seguridad Industrial

App de despacho de EPP tipo comanda: se identifica al trabajador (credencial, RPE o nombre),
se tocan los materiales y se entrega. Funciona sin conexión y guarda todo en el navegador (IndexedDB).

## Uso diario

| Tarea | Dónde |
| --- | --- |
| Entregar material (kits, repetir última, tallas recordadas) | Despacho |
| Recibir cascos, fajas, arneses | Devolución |
| Entradas, traspasos entre almacenes, ajustes, conteo físico, kardex | Inventario |
| Consultar, anular o exportar entregas (Excel, CSV, WhatsApp) | Historial |
| Consumo por material, talla, área, trabajador y despachador; reporte ejecutivo en Excel, PDF o PowerPoint | Reportes |
| Materiales con foto y tallas, kits por área, motivos autorizados | Catálogo |
| Padrón, alta de eventuales (también leyendo el gafete con una foto), importar CSV | Personal |
| Código del equipo, usuarios y PIN, almacenes, nube, respaldos, logotipos de los reportes | Ajustes |

## Varios equipos

Cada celular o PC tiene un código propio (folios `CFE-<código>-0001`) y se sincroniza solo con la
hoja de Google de la oficina (Ajustes → Nube; servidor en `nube/Codigo.gs`, guía en `nube/GUIA.md`).
Un equipo nuevo arranca con «Unirme a la nube de la oficina». Sin nube, los datos se pasan con
**Ajustes → Descargar respaldo** y **Cargar respaldo → Combinar** en el otro equipo.

## Desarrollo

```bash
npm install
npm run dev            # servidor local en http://localhost:5173
npm test               # pruebas de la lógica de negocio
npm run build          # PWA instalable en dist/ (publicar en un sitio HTTPS)
npm run build:archivo  # un solo HTML en dist-archivo/index.html (se abre con doble clic)
```

- `src/domain` — tipos y reglas puras (existencias, folios, kits, RPE).
- `src/db` — base IndexedDB (Dexie) y catálogo inicial.
- `src/state` — estado en memoria y operaciones (despacho, anulación, devoluciones, almacén, respaldo).
- `src/ui` — pantallas.

El padrón **no** se incluye en el código: se carga desde un CSV al configurar el equipo, para que la
app pueda publicarse en un enlace sin exponer datos del personal.

## Lectura de gafetes

En Despacho y en Personal, el botón **Gafete** toma una foto de la credencial: primero intenta el
código de barras y, si no, lee el texto impreso (nombre, área, puesto, número, RPE y vigencia) con
Tesseract. Todo se procesa en el equipo, sin internet; los archivos del lector (`public/ocr`, ~14 MB)
se copian en cada `npm run build` y se descargan solo la primera vez que se usa.

## Reportes ejecutivos

`src/reportes/datos.ts` calcula los números y hallazgos del periodo; con ellos se generan el Excel
(`excel.ts`), la presentación de PowerPoint con gráficas editables (`presentacion.ts`) y la versión
para imprimir o guardar como PDF (`ReporteImprimible.tsx`). La plantilla institucional (fondos y
logotipos en `public/plantilla`) se puede reemplazar desde Ajustes → Plantilla de reportes, y en la
presentación también desde PowerPoint (Vista → Patrón de diapositivas).

Para revisar una presentación de muestra: `MUESTRA_PPTX=ruta/muestra.pptx npx vitest run src/reportes/muestra.qa.test.ts`.
