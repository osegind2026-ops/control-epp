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
  { id: 'soldadura', nombre: 'Soldadura y cuerpo', orden: 7 },
  { id: 'otros', nombre: 'Señalización y otros', orden: 8 },
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
  {
    id: 'g_anticorte', nombre: 'Guante Anticorte', categoriaId: 'manos', tipo: 'consumible',
    variantes: tallas(['8', '9', '10']), stockMin: minimos(['8', '9', '10'], 3), icono: 'guante',
    demo: { '8': 6, '9': 8, '10': 6 },
  },
  { id: 'g_uso_rudo', nombre: 'Guante de Uso Rudo', categoriaId: 'manos', tipo: 'consumible', variantes: [], stockMin: { '': 5 }, icono: 'guante', demo: { '': 12 } },
  { id: 'g_latex', nombre: 'Guante de Látex', categoriaId: 'manos', tipo: 'consumible', variantes: [], stockMin: { '': 20 }, icono: 'guante', demo: { '': 100 } },
  { id: 'porta_guantes', nombre: 'Porta Guantes (clip)', categoriaId: 'manos', tipo: 'consumible', variantes: [], stockMin: { '': 10 }, icono: 'caja', demo: { '': 30 } },
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
  { id: 'cinturon', nombre: 'Cinturón de Seguridad', categoriaId: 'altura', tipo: 'consumible', variantes: [], stockMin: { '': 5 }, icono: 'faja', demo: { '': 15 } },
  { id: 'arnes_cuerpo', nombre: 'Arnés de Cuerpo Completo', categoriaId: 'altura', tipo: 'prestamo', plazoDias: 1, variantes: [], stockMin: { '': 5 }, icono: 'arnes', demo: { '': 15 } },
  { id: 'linea_vida', nombre: 'Línea de Vida / Amort.', categoriaId: 'altura', tipo: 'prestamo', plazoDias: 1, variantes: [], stockMin: { '': 5 }, icono: 'linea', demo: { '': 15 } },
  { id: 'sold_peto', nombre: 'Peto de Soldador', categoriaId: 'soldadura', tipo: 'consumible', variantes: [], stockMin: { '': 2 }, icono: 'caja', demo: { '': 5 } },
  { id: 'sold_mangas', nombre: 'Mangas de Soldador', categoriaId: 'soldadura', tipo: 'consumible', variantes: [], stockMin: { '': 2 }, icono: 'caja', demo: { '': 5 } },
  { id: 'sold_polainas', nombre: 'Polainas de Soldador', categoriaId: 'soldadura', tipo: 'consumible', variantes: [], stockMin: { '': 2 }, icono: 'caja', demo: { '': 5 } },
  { id: 'sold_guantes', nombre: 'Guantes de Soldador', categoriaId: 'soldadura', tipo: 'consumible', variantes: [], stockMin: { '': 2 }, icono: 'guante', demo: { '': 6 } },
  { id: 'traje_desechable', nombre: 'Traje Desechable', categoriaId: 'soldadura', tipo: 'consumible', variantes: tallas(['M', 'G', 'XG']), stockMin: minimos(['M', 'G', 'XG'], 3), icono: 'caja', demo: { M: 5, G: 8, XG: 5 } },
  { id: 'cinta_delimitadora', nombre: 'Cinta Delimitadora Amarillo/Negro 2"', categoriaId: 'otros', tipo: 'consumible', variantes: [], stockMin: { '': 5 }, icono: 'caja', demo: { '': 12 } },
  { id: 'cinta_antiderrapante', nombre: 'Cinta Antiderrapante 2"', categoriaId: 'otros', tipo: 'consumible', variantes: [], stockMin: { '': 3 }, icono: 'caja', demo: { '': 6 } },
  { id: 'aerosol_humo', nombre: 'Aerosol para Probar Detector de Humo', categoriaId: 'otros', tipo: 'consumible', variantes: [], stockMin: { '': 3 }, icono: 'caja', demo: { '': 6 } },
]

/** Foto incluida con la app y ficha técnica (Anexo Técnico 2026 de EPP básico). */
export const FICHAS: Record<string, { imagen?: string; descripcion: string }> = {
  casco: { imagen: 'casco.webp', descripcion: 'Casco amarillo de polietileno de alta densidad, Tipo I Clase G y E, suspensión de 4 puntos con matraca. NOM-115-STPS-2009 y ANSI Z89.1. SAP 866482.' },
  arnes_casco: { imagen: 'arnes_casco.webp', descripcion: 'Suspensión de repuesto de 4 puntos con matraca (ratchet) para el casco.' },
  barbiquejo: { imagen: 'barbiquejo.webp', descripcion: 'Cintas de poliéster de 19 mm con clips a la suspensión de 4 puntos y broche de ajuste rápido; sin metal, apto para casco dieléctrico. SAP 1834.' },
  lentes_claros: { imagen: 'lentes_claros.webp', descripcion: 'Mica clara de policarbonato antiempañante y antirrayas, protección UV, con cordón y bolsa. ANSI Z87.1+ y CSA Z94.3. SAP 521167.' },
  lentes_oscuros: { imagen: 'lentes_oscuros.webp', descripcion: 'Mica gris ahumada de policarbonato antiempañante y antirrayas, protección UV, con cordón y bolsa. ANSI Z87.1+. SAP 783082.' },
  cubre_lentes: { imagen: 'cubre_lentes.webp', descripcion: 'Sobrelente para usar encima de lentes graduados; policarbonato claro antirrayas con protección UV. ANSI Z87.1+. SAP 11316.' },
  careta_policarbonato: { descripcion: 'Mica (visor) de policarbonato de la careta: se cambia cuando se raya o se daña.' },
  careta_base: { descripcion: 'Base o suspensión de la careta que va sobre la cabeza; se reutiliza con micas nuevas.' },
  g_carnaza: { imagen: 'g_carnaza.webp', descripcion: 'Guante de piel carnaza para maniobras, con serigrafía «CFE-CNLV» y talla (CH, M, G, XG). SAP 173233.' },
  g_hyflex: { imagen: 'g_hyflex.webp', descripcion: 'Guante de nylon con palma cubierta de nitrilo espumado (HyFlex), antiestático. EN 388 3131A. SAP 783108.' },
  g_nitrilo: { imagen: 'g_nitrilo.webp', descripcion: 'Guante de nitrilo verde de 33 cm con resistencia química, forro de algodón. EN ISO 374-1 Tipo A. SAP 782817.' },
  g_anticorte: { imagen: 'g_anticorte.webp', descripcion: 'Guante anticorte de polietileno de alta densidad y fibra de vidrio, palma de poliuretano. EN 388 4X43C. Tallas 8, 9 y 10. SAP 894206.' },
  g_uso_rudo: { imagen: 'g_uso_rudo.webp', descripcion: 'Guante mecánico de alto rendimiento, palma reforzada y protección de nudillos (TPR), negro/naranja. ANSI/ISEA 138 y 105. SAP 304544.' },
  g_latex: { descripcion: 'Guante desechable de látex.' },
  porta_guantes: { imagen: 'porta_guantes.webp', descripcion: 'Clip de plástico no conductor para colgar guantes del cinturón, con liberación de seguridad.' },
  tapones: { imagen: 'tapones.webp', descripcion: 'Tapón reutilizable de TPE azul con cordón rojo y estuche rígido. NRR 27 dB. SAP 293302.' },
  m_polvo: { imagen: 'm_polvo.webp', descripcion: 'Mascarilla plegable contra partículas N95 (NIOSH 42CFR84). SAP 9382.' },
  m_azul: { imagen: 'm_azul.webp', descripcion: 'Respirador N95 con válvula de exhalación, azul con blanco (modelo 2500 o equivalente). SAP 756814.' },
  m_negra: { imagen: 'm_negra.webp', descripcion: 'Respirador con válvula para partículas base aceite, vapores orgánicos, olores y ozono (modelo 2400 o equivalente). SAP 782760.' },
  m_gris: { imagen: 'm_gris.webp', descripcion: 'Respirador con válvula contra humos de soldadura (modelo 2310 N99 o equivalente). SAP 211275.' },
  cinturon: { imagen: 'cinturon.webp', descripcion: 'Cinturón con hebilla tipo caimán de liberación rápida y leyenda «CFE LAGUNA VERDE». SAP 529243.' },
  cinta_delimitadora: { imagen: 'cinta_delimitadora.webp', descripcion: 'Cinta adhesiva delimitadora de seguridad, rayas amarillo/negro de 2". SAP 863299.' },
  cinta_antiderrapante: { imagen: 'cinta_antiderrapante.webp', descripcion: 'Cinta antiderrapante amarillo/negro de 2", adhesivo de caucho, reflejante. SAP 863294.' },
  aerosol_humo: { imagen: 'aerosol_humo.webp', descripcion: 'Aerosol para probar detectores de humo, sin aceite ni residuos. UL Listed. SAP 807165.' },
}

export function materialesSemilla(): Material[] {
  const t = ahora()
  return MATS.map(({ demo: _demo, ...m }, i) => ({ ...m, ...FICHAS[m.id], orden: i + 1, activo: true, actualizado: t }))
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
