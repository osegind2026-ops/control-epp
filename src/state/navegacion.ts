import { signal } from '@preact/signals'

export type Pantalla = 'despacho' | 'devolucion' | 'equipos' | 'inventario' | 'historial' | 'reportes' | 'formatos' | 'catalogo' | 'personal' | 'ajustes'

export const pantalla = signal<Pantalla>('despacho')

