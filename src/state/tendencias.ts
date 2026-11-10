// Análisis de Tendencias guardados en este equipo (Ajustes de la pantalla Tendencias).
import { guardarConfig, leerConfig } from '../db/db'
import {
  analizarMaterial, claveSujeto, compararPlan, existenciaTotal, periodoDe, sumarDias,
  type AnalisisMaterial, type ComparacionPlan, type ConfigMaterial, type Escenario, type PlanMaterial, type UnidadPeriodo,
} from '../domain/tendencias'
import { variantesDe, tieneTallas } from '../domain/logica'
import { fechaLocal } from '../lib/util'
import type { EstiloGrafica, PaletaGrafica } from '../reportes/graficasTendencia'
import * as S from './store'

export interface MaterialTendencia extends ConfigMaterial {
  /** Cómo se cuenta: pares, piezas, cajas… */
  unidad: string
  /** Tallas que entran al análisis (sin indicar = todas las vigentes). */
  tallas?: string[]
  /** Analizar las tallas elegidas juntas (como un solo material). Por omisión, sí. */
  juntas?: boolean
  /** Analizar cada talla elegida por separado (con su comparativa de tallas). */
  separadas?: boolean
  /** Pedido por llegar y existencia corregida, por talla (cuando se analizan por separado). */
  pedidoTalla?: Record<string, number>
  existenciaTalla?: Record<string, number | null>
  /** Planes por análisis (clave del material o de la talla). */
  planes?: Record<string, PlanMaterial | null>
  /** Versión 2.27: un solo plan para el material completo. */
  plan?: PlanMaterial | null
}

export type VistaEscenarios = 'comparativa' | 'separadas' | 'ambas'

export interface ConfigTendencia {
  id: string
  nombre: string
  /** Título del documento; vacío = automático («Tendencia de Consumo de …»). */
  titulo: string
  materiales: MaterialTendencia[]
  desde: string
  hasta: string
  unidad: UnidadPeriodo
  /** Fecha a la que se quiere llegar ('' = solo calcular hasta cuándo alcanza). */
  fechaObjetivo: string
  estilo: EstiloGrafica
  paleta: PaletaGrafica
  /** Escenarios que se muestran en pantalla y en el reporte. */
  escenarios?: Escenario[]
  /** Con varios escenarios: una gráfica de proyección por escenario, una comparativa o ambas. */
  vistaEscenarios?: VistaEscenarios
  /** Texto del periodo, p. ej. «pre recarga» → «durante el periodo de pre recarga». */
  contexto: string
  nota: string
  lugar: string
  /** Fecha del documento ('' = hoy). */
  fechaDocumento: string
  encabezado: string[]
  pie: string
}

const CLAVE = 'tendencias'
export const ORDEN_ESCENARIOS: Escenario[] = ['bajo', 'promedio', 'alto']

export const NOTA_POR_DEFECTO =
  '*La estimación del consumo puede variar, ya que el tiempo de vida útil del equipo depende de la actividad y de los cuidados que el personal le da a su equipo de protección personal; se estima con base en las entregas registradas en el periodo analizado, por lo que en otra etapa (operación normal, recarga) el consumo puede aumentar o reducirse de acuerdo al número de personas laborando.'

export const ENCABEZADO_POR_DEFECTO = ['Coordinación Nuclear', 'Gerencia Nucleoeléctrica Laguna Verde', 'Subgerencia de Seguridad Nuclear', 'Oficina de Seguridad Industrial']
export const PIE_POR_DEFECTO = 'Carretera federal Cardel-Nautla Km. 42.5 C.P. 91476 Mpio. Alto Lucero, Veracruz, México Tel:(229)9899090 Ext 45150 www.cfe.mx'

/** Periodos completos más recientes (sin contar el que va en curso). */
export function ultimosPeriodos(n: number, u: UnidadPeriodo, hoy = fechaLocal()): { desde: string; hasta: string } {
  const actual = periodoDe(hoy, u)
  const hasta = sumarDias(actual.inicio, -1)
  let p = periodoDe(hasta, u)
  for (let i = 1; i < n; i++) p = periodoDe(sumarDias(p.inicio, -1), u)
  return { desde: p.inicio, hasta }
}

export function nuevaConfig(): ConfigTendencia {
  const r = ultimosPeriodos(8, 'semana')
  return {
    id: crypto.randomUUID(),
    nombre: 'Nuevo análisis',
    titulo: '',
    materiales: [],
    ...r,
    unidad: 'semana',
    fechaObjetivo: '',
    estilo: 'sombra',
    paleta: 'verde',
    escenarios: ['promedio'],
    vistaEscenarios: 'comparativa',
    contexto: '',
    nota: NOTA_POR_DEFECTO,
    lugar: 'Laguna Verde, Ver.',
    fechaDocumento: '',
    encabezado: [...ENCABEZADO_POR_DEFECTO],
    pie: PIE_POR_DEFECTO,
  }
}

/** Escenarios elegidos, en orden (al menos uno). */
export const escenariosDe = (c: ConfigTendencia): Escenario[] => {
  const e = ORDEN_ESCENARIOS.filter((x) => (c.escenarios ?? ['promedio']).includes(x))
  return e.length ? e : ['promedio']
}
/** El escenario con el que se redacta la conclusión principal. */
export const escenarioPrincipal = (c: ConfigTendencia): Escenario => {
  const e = escenariosDe(c)
  return e.includes('promedio') ? 'promedio' : e[e.length - 1]
}

export const leerTendencias = () => leerConfig<ConfigTendencia[]>(CLAVE, [])
export const guardarTendencias = (lista: ConfigTendencia[]) => guardarConfig(CLAVE, lista)

export function unidadSugerida(nombre: string): string {
  const n = nombre.toLowerCase()
  if (n.includes('guante')) return 'pares'
  if (n.includes('tapon') || n.includes('tapón')) return 'pares'
  return 'piezas'
}

export function tituloDe(c: ConfigTendencia): string {
  if (c.titulo.trim()) return c.titulo.trim()
  if (c.materiales.length === 1) return `Tendencia de Consumo de ${S.materialesPorId.value.get(c.materiales[0].materialId)?.nombre ?? 'material'}`
  return 'Tendencia de Consumo de EPP'
}

/** Tallas del material que entran al análisis. */
export function tallasElegidas(cm: MaterialTendencia): string[] {
  const m = S.materialesPorId.value.get(cm.materialId)
  if (!m || !tieneTallas(m)) return []
  const vigentes = variantesDe(m)
  const elegidas = cm.tallas?.filter((t) => vigentes.includes(t)) ?? vigentes
  return elegidas.length ? elegidas : vigentes
}

export const analizaJuntas = (cm: MaterialTendencia) => cm.juntas !== false || !cm.separadas || tallasElegidas(cm).length === 0
export const analizaSeparadas = (cm: MaterialTendencia) => !!cm.separadas && tallasElegidas(cm).length > 0

/** Existencia de una talla según la app (todas las ubicaciones activas). */
export function existenciaApp(materialId: string, variantes?: string[]): number {
  return existenciaTotal(S.movimientos.value, materialId, S.ubicacionesActivas.value.map((u) => u.id), variantes)
}

export interface GrupoTendencia {
  materialId: string
  unidad: string
  /** Análisis de las tallas elegidas juntas (o del material sin tallas). */
  juntas?: AnalisisMaterial
  /** Un análisis por talla (si se pidió por separado). */
  tallas: AnalisisMaterial[]
}

/** Analiza cada material (y sus tallas) con los datos actuales de la app. */
export function analizar(c: ConfigTendencia, hoy = fechaLocal()): GrupoTendencia[] {
  const ubicaciones = S.ubicacionesActivas.value.map((u) => u.id)
  const base = { entregas: S.entregas.value, movimientos: S.movimientos.value, ubicaciones, desde: c.desde, hasta: c.hasta, unidad: c.unidad, fechaObjetivo: c.fechaObjetivo || undefined, hoy }
  const r: GrupoTendencia[] = []
  for (const cm of c.materiales) {
    const material = S.materialesPorId.value.get(cm.materialId)
    if (!material) continue
    const elegidas = tallasElegidas(cm)
    const sep = analizaSeparadas(cm)
    const g: GrupoTendencia = { materialId: cm.materialId, unidad: cm.unidad || 'piezas', tallas: [] }
    if (analizaJuntas(cm)) {
      // Con tallas por separado, el pedido y la existencia del total son la suma de las tallas
      const config: ConfigMaterial = sep
        ? {
            materialId: cm.materialId,
            pedido: elegidas.reduce((s, t) => s + (cm.pedidoTalla?.[t] ?? 0), 0),
            existenciaManual: elegidas.some((t) => cm.existenciaTalla?.[t] != null)
              ? elegidas.reduce((s, t) => s + (cm.existenciaTalla?.[t] ?? existenciaApp(cm.materialId, [t])), 0)
              : null,
          }
        : cm
      g.juntas = analizarMaterial({ ...base, material, config, variantes: elegidas.length ? elegidas : undefined })
    }
    if (sep)
      for (const t of elegidas)
        g.tallas.push(
          analizarMaterial({ ...base, material, variantes: [t], config: { materialId: cm.materialId, pedido: cm.pedidoTalla?.[t] ?? 0, existenciaManual: cm.existenciaTalla?.[t] ?? null } }),
        )
    r.push(g)
  }
  return r
}

/** Todos los análisis en el orden del reporte: total del material y luego sus tallas. */
export const sujetosDe = (grupos: GrupoTendencia[]) => grupos.flatMap((g) => [...(g.juntas ? [{ a: g.juntas, unidad: g.unidad }] : []), ...g.tallas.map((a) => ({ a, unidad: g.unidad }))])

/** Plan guardado para un análisis (material completo o talla). */
export function planDe(cm: MaterialTendencia | undefined, clave: string): PlanMaterial | null {
  if (!cm) return null
  if (cm.planes && clave in cm.planes) return cm.planes[clave] ?? null
  return clave === cm.materialId ? (cm.plan ?? null) : null
}

/** Planeado vs real de cada análisis que tiene un plan. */
export function compararPlanes(c: ConfigTendencia, grupos: GrupoTendencia[], hoy = fechaLocal()): Map<string, ComparacionPlan> {
  const ubicaciones = S.ubicacionesActivas.value.map((u) => u.id)
  const r = new Map<string, ComparacionPlan>()
  for (const { a } of sujetosDe(grupos)) {
    const plan = planDe(
      c.materiales.find((m) => m.materialId === a.material.id),
      a.clave,
    )
    if (!plan) continue
    r.set(a.clave, compararPlan({ plan, entregas: S.entregas.value, movimientos: S.movimientos.value, ubicaciones, materialId: a.material.id, hoy, variantes: a.talla?.ids }))
  }
  return r
}

export { claveSujeto }
