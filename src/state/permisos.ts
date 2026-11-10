import type { Rol, Usuario } from '../domain/types'
import * as S from './store'

export const ROLES: { id: Rol; nombre: string; ayuda: string }[] = [
  { id: 'despachador', nombre: 'Despachador', ayuda: 'Despacha EPP, recibe devoluciones, presta equipos y consulta existencias.' },
  { id: 'almacen', nombre: 'Encargado de almacén', ayuda: 'Lo mismo que un despachador y además entradas, traspasos, ajustes y conteos de inventario, y el catálogo de equipos.' },
  { id: 'admin', nombre: 'Administrador', ayuda: 'Todo lo anterior, más usuarios, catálogo de materiales, kits y motivos autorizados.' },
]

export function rolDe(u: Pick<Usuario, 'rol' | 'esAdmin'>): Rol {
  return u.rol ?? (u.esAdmin ? 'admin' : 'despachador')
}

export const nombreRol = (r: Rol) => ROLES.find((x) => x.id === r)?.nombre ?? r

/** Entradas, traspasos, ajustes y conteos; alta y edición de equipos a resguardo. */
export function puedeInventario(): boolean {
  const r = S.sesion.value?.rol
  return r === 'admin' || r === 'almacen'
}

export function esAdmin(): boolean {
  return S.sesion.value?.rol === 'admin'
}
