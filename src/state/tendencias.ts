// Análisis de Tendencias guardados en este equipo (Ajustes de la pantalla Tendencias).
import { guardarConfig, leerConfig } from '../db/db'
import { analizarMaterial, periodoDe, sumarDias, type AnalisisMaterial, type ConfigMaterial, type UnidadPeriodo } from '../domain/tendencias'
import { fechaLocal } from '../lib/util'
import type { EstiloGrafica, PaletaGrafica } from '../reportes/graficasTendencia'
import * as S from './store'

export interface MaterialTendencia extends ConfigMaterial {
  /** Cómo se cuenta: pares, piezas, cajas… */
  unidad: string
}

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
    contexto: '',
    nota: NOTA_POR_DEFECTO,
    lugar: 'Laguna Verde, Ver.',
    fechaDocumento: '',
    encabezado: [...ENCABEZADO_POR_DEFECTO],
    pie: PIE_POR_DEFECTO,
  }
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

/** Analiza cada material de la configuración con los datos actuales de la app. */
export function analizar(c: ConfigTendencia, hoy = fechaLocal()): AnalisisMaterial[] {
  const ubicaciones = S.ubicacionesActivas.value.map((u) => u.id)
  return c.materiales
    .map((cm) => {
      const material = S.materialesPorId.value.get(cm.materialId)
      if (!material) return null
      return analizarMaterial({
        entregas: S.entregas.value,
        movimientos: S.movimientos.value,
        ubicaciones,
        material,
        config: cm,
        desde: c.desde,
        hasta: c.hasta,
        unidad: c.unidad,
        fechaObjetivo: c.fechaObjetivo || undefined,
        hoy,
      })
    })
    .filter((a): a is AnalisisMaterial => !!a)
}

