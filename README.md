# Control EPP v2 · Oficina de Seguridad Industrial

App de despacho de EPP tipo comanda: se identifica al trabajador (credencial, RPE o nombre),
se tocan los materiales y se entrega. Funciona sin conexión y guarda todo en el navegador (IndexedDB).

## Uso diario

| Tarea | Dónde |
| --- | --- |
| Entregar material (kits, repetir última, tallas recordadas) | Despacho |
| Recibir cascos, fajas, arneses | Devolución |
| Entradas, traspasos entre almacenes, ajustes, conteo físico, kardex | Inventario |
| Consultar, anular o exportar entregas (CSV para el libro maestro, WhatsApp) | Historial |
| Consumo por material, talla, área, trabajador y despachador | Reportes |
| Materiales con foto y tallas, kits por área, motivos autorizados | Catálogo |
| Padrón, alta de eventuales, importar CSV | Personal |
| Código del equipo, usuarios y PIN, almacenes, respaldos | Ajustes |

## Varios equipos

Cada celular o PC tiene un código propio (folios `CFE-<código>-0001`). Mientras no exista la
sincronización con Google Sheets (Fase 2), los datos se pasan con **Ajustes → Descargar respaldo**
y **Cargar respaldo → Combinar** en el otro equipo. Un equipo nuevo puede arrancar con
«Unirme con el respaldo de otro equipo».

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
