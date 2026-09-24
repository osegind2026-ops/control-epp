import { signal } from '@preact/signals'

export type Pantalla = 'despacho' | 'devolucion' | 'inventario' | 'historial' | 'reportes' | 'catalogo' | 'personal' | 'ajustes'

export const pantalla = signal<Pantalla>('despacho')
