import type { Categoria, Kit, Material, Motivo, Ubicacion, Variante } from '../domain/types'

// Catálogo inicial de la Oficina de Seguridad Industrial. Todo se puede editar
// después desde Catálogo; esto solo evita arrancar con la app vacía.

const ahora = () => new Date().toISOString()

export const AREAS = [
  'APOYO CONSTRUCTIVO',
  'COMUNICACIONES',
  'DESEMPEÑO HUMANO',
  'DTM',
  'INFRA',
  'INSTRUMENTACION Y CONTROL',
  'MANTENIMIENTO CIVIL',
  'MANTENIMIENTO ELÉCTRICO',
  'MANTENIMIENTO MECÁNICO',
  'MODIFICACIONES',
  'OFICINA DE SEGURIDAD INDUSTRIAL',
  'OPERACIÓN',
  'PND',
  'PREDICTIVO',
  'PROCESO QUÍMICO',
  'PROTECCIÓN RADIOLÓGICA',
  'SEGURIDAD FISICA',
  'SUBGERENCIA INGENIERIA IPC',
  'TALLER',
  'VISITANTE CFE',
]

export const CATEGORIAS: Categoria[] = [
  { id: 'cabeza', nombre: 'Cabeza', orden: 1 },
  { id: 'ojos', nombre: 'Ojos y cara', orden: 2 },
  { id: 'manos', nombre: 'Manos', orden: 3 },
  { id: 'oidos', nombre: 'Oídos', orden: 4 },
  { id: 'respiratoria', nombre: 'Respiratoria', orden: 5 },
  { id: 'altura', nombre: 'Lumbar y altura', orden: 6 },
  { id: 'otros', nombre: 'Otros', orden: 7 },
]

const tallas = (ids: string[], colores?: Record<string, string>, nombres?: Record<string, string>): Variante[] =>
  ids.map((id) => ({ id, etiqueta: nombres?.[id] ?? id, color: colores?.[id], activo: true }))

const minimos = (ids: string[], n: number) => Object.fromEntries(ids.map((id) => [id, n]))

type MatSemilla = Omit<Material, 'actualizado' | 'activo' | 'orden'> & { demo: Record<string, number> }

const MATS: MatSemilla[] = [
  { id: 'casco', nombre: 'Casco de Seguridad', categoriaId: 'cabeza', tipo: 'resguardo', variantes: [], stockMin: { '': 25 }, icono: 'casco', demo: { '': 80 } },
  { id: 'arnes_casco', nombre: 'Arnés de Casco', categoriaId: 'cabeza', tipo: 'consumible', variantes: [], stockMin: { '': 10 }, icono: 'arnescasco', demo: { '': 30 } },
  { id: 'barbiquejo', nombre: 'Barbiquejo', categoriaId: 'cabeza', tipo: 'consumible', variantes: [], stockMin: { '': 15 }, icono: 'barbiquejo', demo: { '': 50 } },
  { id: 'lentes_claros', nombre: 'Lentes Claros', categoriaId: 'ojos', tipo: 'consumible', variantes: [], stockMin: { '': 30 }, icono: 'lentes', demo: { '': 150 } },
  { id: 'lentes_oscuros', nombre: 'Lentes Oscuros', categoriaId: 'ojos', tipo: 'consumible', variantes: [], stockMin: { '': 15 }, icono: 'lentes', demo: { '': 60 } },
  { id: 'cubre_lentes', nombre: 'Cubre Lentes', categoriaId: 'ojos', tipo: 'consumible', variantes: [], stockMin: { '': 10 }, icono: 'cubrelentes', demo: { '': 30 } },
  { id: 'careta_policarbonato', nombre: 'Mica de Policarbonato para Careta', categoriaId: 'ojos', tipo: 'consumible', variantes: [], stockMin: { '': 5 }, icono: 'careta', demo: { '': 15 } },
  { id: 'careta_base', nombre: 'Base de Careta', categoriaId: 'ojos', tipo: 'consumible', variantes: [], stockMin: { '': 3 }, icono: 'careta', demo: { '': 8 } },
  {
    id: 'g_carnaza', nombre: 'Guante de Carnaza', categoriaId: 'manos', tipo: 'consumible',
    variantes: tallas(['CH', 'M', 'G', 'XG']), stockMin: minimos(['CH', 'M', 'G', 'XG'], 10), icono: 'guante',
    demo: { CH: 20, M: 60, G: 90, XG: 30 },
  },
  {
    id: 'g_hyflex', nombre: 'Guante Hyflex', categoriaId: 'manos', tipo: 'consumible',
    variantes: tallas(['6', '7', '8', '9', '10'],
      { '6': '#6B3FA0', '7': '#C62828', '8': '#F2C200', '9': '#795548', '10': '#212121' },
      { '6': '6 · morado', '7': '7 · rojo', '8': '8 · amarillo', '9': '9 · café', '10': '10 · negro' }),
    stockMin: minimos(['6', '7', '8', '9', '10'], 5), icono: 'guante',
    demo: { '6': 10, '7': 20, '8': 30, '9': 25, '10': 4 },
  },
  {
    id: 'g_nitrilo', nombre: 'Guante de Nitrilo', categoriaId: 'manos', tipo: 'consumible',
    variantes: tallas(['7', '8', '9', '10']), stockMin: minimos(['7', '8', '9', '10'], 5), icono: 'guante',
    demo: { '7': 10, '8': 15, '9': 15, '10': 10 },
  },
  { id: 'tapones', nombre: 'Tapones Auditivos', categoriaId: 'oidos', tipo: 'consumible', variantes: [], stockMin: { '': 50 }, icono: 'tapones', demo: { '': 300 } },
  { id: 'm_polvo', nombre: 'Mascarilla Polvo', categoriaId: 'respiratoria', tipo: 'consumible', variantes: [], stockMin: { '': 20 }, icono: 'mascarilla', demo: { '': 100 } },
  { id: 'm_gris', nombre: 'Mascarilla Gris', categoriaId: 'respiratoria', tipo: 'consumible', variantes: [], stockMin: { '': 15 }, icono: 'mascarilla', demo: { '': 40 } },
  { id: 'm_negra', nombre: 'Mascarilla Negra', categoriaId: 'respiratoria', tipo: 'consumible', variantes: [], stockMin: { '': 15 }, icono: 'mascarilla', demo: { '': 40 } },
  { id: 'm_azul', nombre: 'Mascarilla Azul', categoriaId: 'respiratoria', tipo: 'consumible', variantes: [], stockMin: { '': 15 }, icono: 'mascarilla', demo: { '': 30 } },
  {
    id: 'faja', nombre: 'Faja Lumbar', categoriaId: 'altura', tipo: 'resguardo',
    variantes: tallas(['MED', 'GDE', 'XL']), stockMin: minimos(['MED', 'GDE', 'XL'], 5), icono: 'faja',
    demo: { MED: 20, GDE: 25, XL: 4 },
  },
  { id: 'arnes_cuerpo', nombre: 'Arnés de Cuerpo Completo', categoriaId: 'altura', tipo: 'prestamo', plazoDias: 1, variantes: [], stockMin: { '': 5 }, icono: 'arnes', demo: { '': 15 } },
  { id: 'linea_vida', nombre: 'Línea de Vida / Amort.', categoriaId: 'altura', tipo: 'prestamo', plazoDias: 1, variantes: [], stockMin: { '': 5 }, icono: 'linea', demo: { '': 15 } },
]

export function materialesSemilla(): Material[] {
  const t = ahora()
  return MATS.map(({ demo: _demo, ...m }, i) => ({ ...m, orden: i + 1, activo: true, actualizado: t }))
}

export function existenciasDemo(): { materialId: string; varianteId: string; cantidad: number }[] {
  return MATS.flatMap((m) => Object.entries(m.demo).map(([varianteId, cantidad]) => ({ materialId: m.id, varianteId, cantidad })))
}

const GUANTES_FINOS = ['INSTRUMENTACION Y CONTROL', 'MANTENIMIENTO ELÉCTRICO']
const GUANTES_CARNAZA = ['MANTENIMIENTO ELÉCTRICO', 'MANTENIMIENTO MECÁNICO', 'APOYO CONSTRUCTIVO']

export function kitsSemilla(): Kit[] {
  const t = ahora()
  const resto = [
    { materialId: 'lentes_claros', cantidad: 1 },
    { materialId: 'tapones', cantidad: 1 },
    { materialId: 'g_hyflex', cantidad: 1, areas: GUANTES_FINOS },
    { materialId: 'g_carnaza', cantidad: 1, areas: GUANTES_CARNAZA },
  ]
  return [
    {
      id: 'kit_ingreso',
      nombre: 'Ingreso',
      descripcion: 'Casco con arnés y barbiquejo, lentes claros, tapones y guantes según el área',
      lineas: [
        { materialId: 'casco', cantidad: 1 },
        { materialId: 'arnes_casco', cantidad: 1, conMaterial: 'casco' },
        { materialId: 'barbiquejo', cantidad: 1, conMaterial: 'casco' },
        ...resto,
      ],
      orden: 1,
      activo: true,
      actualizado: t,
    },
    {
      id: 'kit_ingreso_sin_casco',
      nombre: 'Ingreso sin casco',
      descripcion: 'Para quien ya cuenta con casco: lentes, tapones y guantes según el área',
      lineas: resto,
      orden: 2,
      activo: true,
      actualizado: t,
    },
  ]
}

export function motivosSemilla(): Motivo[] {
  const lista: Omit<Motivo, 'orden' | 'activo'>[] = [
    { id: 'ent_primera', tipo: 'entrega', texto: 'Primera asignación' },
    { id: 'ent_desgaste', tipo: 'entrega', texto: 'Cambio por desgaste', cierraPrevio: 'baja' },
    { id: 'ent_dano', tipo: 'entrega', texto: 'Reposición por daño', cierraPrevio: 'baja' },
    { id: 'ent_extravio', tipo: 'entrega', texto: 'Reposición por extravío', cierraPrevio: 'baja' },
    { id: 'ent_talla', tipo: 'entrega', texto: 'Cambio de talla', cierraPrevio: 'reingresa' },
    { id: 'ent_jefatura', tipo: 'entrega', texto: 'Autorizado por jefatura' },
    { id: 'dev_bueno', tipo: 'devolucion', texto: 'Buen estado (regresa al almacén)', reingresa: true },
    { id: 'dev_baja_trab', tipo: 'devolucion', texto: 'Baja o fin de contrato (buen estado)', reingresa: true },
    { id: 'dev_desgaste', tipo: 'devolucion', texto: 'Desgaste (se desecha)', reingresa: false },
    { id: 'dev_danado', tipo: 'devolucion', texto: 'Dañado (se desecha)', reingresa: false },
    { id: 'dev_extravio', tipo: 'devolucion', texto: 'Extravío reportado', reingresa: false },
    { id: 'aju_conteo', tipo: 'ajuste', texto: 'Conteo físico' },
    { id: 'aju_merma', tipo: 'ajuste', texto: 'Merma o daño en almacén' },
    { id: 'aju_captura', tipo: 'ajuste', texto: 'Corrección de captura' },
    { id: 'aju_caducidad', tipo: 'ajuste', texto: 'Caducidad' },
    { id: 'anu_error', tipo: 'anulacion', texto: 'Error de captura' },
    { id: 'anu_no_entregado', tipo: 'anulacion', texto: 'Material no entregado' },
    { id: 'anu_duplicado', tipo: 'anulacion', texto: 'Registro duplicado' },
    { id: 'anu_trabajador', tipo: 'anulacion', texto: 'Trabajador equivocado' },
    { id: 'entr_compra', tipo: 'entrada', texto: 'Reabastecimiento / orden de compra' },
    { id: 'entr_transferencia', tipo: 'entrada', texto: 'Transferencia de otra área' },
    { id: 'entr_otro', tipo: 'entrada', texto: 'Otro' },
  ]
  return lista.map((m, i) => ({ ...m, orden: i + 1, activo: true }))
}

export function ubicacionesSemilla(): Ubicacion[] {
  return [
    { id: 'ubi_despacho', nombre: 'Almacén de despacho', esDespacho: true, orden: 1, activo: true },
    { id: 'ubi_2', nombre: 'Almacén 2', esDespacho: false, orden: 2, activo: true },
    { id: 'ubi_3', nombre: 'Almacén 3', esDespacho: false, orden: 3, activo: true },
  ]
}

/** Materiales para «Más pedidos» mientras aún no hay historial. */
export const MAS_PEDIDOS_BASE = ['lentes_claros', 'tapones', 'g_carnaza', 'g_hyflex', 'm_polvo', 'casco', 'g_nitrilo', 'lentes_oscuros']
