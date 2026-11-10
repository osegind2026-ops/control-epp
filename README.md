# Control EPP v2 · Oficina de Seguridad Industrial

App de despacho de EPP tipo comanda: se identifica al trabajador (credencial, RPE o nombre),
se tocan los materiales y se entrega. Funciona sin conexión y guarda todo en el navegador (IndexedDB).

## Uso diario

| Tarea | Dónde |
| --- | --- |
| Entregar material (kits, repetir última, tallas recordadas) | Despacho |
| Recibir cascos, fajas, arneses | Devolución |
| Prestar y recibir equipos de la oficina (explosímetros, higrómetros…), calibraciones y bitácora | Equipos |
| Entradas, traspasos entre almacenes, ajustes, conteo rápido, kardex | Inventario |
| Consultar, anular o exportar entregas (Excel, CSV, WhatsApp) | Historial |
| Consumo por material, talla, área, trabajador y despachador; reporte ejecutivo en Excel, PDF o PowerPoint | Reportes |
| Materiales con foto y tallas, kits por área, motivos autorizados | Catálogo |
| Padrón, alta de eventuales (también leyendo el gafete con una foto), importar CSV | Personal |
| Código del equipo, usuarios y PIN, almacenes, nube, respaldos, logotipos de los reportes | Ajustes |

## Usuarios y roles

- **Despachador**: despacha, recibe devoluciones, presta equipos y consulta existencias.
- **Encargado de almacén**: además, entradas, traspasos, ajustes, conteo rápido y catálogo de equipos.
- **Administrador**: todo, incluidos usuarios, catálogo de materiales, kits y motivos.

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

Las fotos del catálogo (`public/catalogo`) se tomaron del Anexo Técnico 2026 de EPP básico; cada
material se puede cambiar por una foto propia (cámara, galería o archivo) en Catálogo.

El padrón **no** se incluye en el código: se carga desde un CSV al configurar el equipo, para que la
app pueda publicarse en un enlace sin exponer datos del personal.

## Lectura de gafetes

En Despacho y en Personal, el botón **Gafete** abre la cámara dentro de la app: mientras se apunta
busca el código de barras (también en gafetes de fondo oscuro, con contraste realzado y linterna) y,
con **Tomar foto**, lee el texto impreso (nombre, área, puesto y RPE) con Tesseract. También acepta
una foto de la galería. El botón **Escáner** recibe la lectura de un lector de código de barras USB
o Bluetooth (modo teclado). Del código solo se usan los primeros 5 caracteres (el RPE); el último
es un dígito verificador. Todo se procesa en el equipo, sin internet; los archivos del lector (`public/ocr`, ~14 MB)
se copian en cada `npm run build` y se descargan solo la primera vez que se usa.

## Reportes ejecutivos

`src/reportes/datos.ts` calcula los números y hallazgos del periodo; con ellos se generan el Excel
(`excel.ts`), la presentación de PowerPoint con gráficas editables (`presentacion.ts`) y la versión
para imprimir o guardar como PDF (`ReporteImprimible.tsx`). La plantilla institucional (fondos y
logotipos en `public/plantilla`) se puede reemplazar desde Ajustes → Plantilla de reportes, y en la
presentación también desde PowerPoint (Vista → Patrón de diapositivas).

Para revisar una presentación de muestra: `MUESTRA_PPTX=ruta/muestra.pptx npx vitest run src/reportes/muestra.qa.test.ts`.
