import { useEffect, useState } from 'preact/hooks'
import { prestamosVencidos } from './domain/logica'
import { fechaLocal, hace, iniciales, plural } from './lib/util'
import { cerrarSesion } from './state/servicios'
import { migrar } from './state/migraciones'
import { pantalla, type Pantalla } from './state/navegacion'
import { cargarNube, nube } from './state/nube'
import * as S from './state/store'
import { PantallaAcceso } from './ui/Acceso'
import { PantallaAjustes } from './ui/Ajustes'
import { PantallaCatalogo } from './ui/Catalogo'
import { Confirmacion, Toasts } from './ui/comunes'
import { PantallaDespacho } from './ui/Despacho'
import { PantallaDevolucion } from './ui/Devolucion'
import { equiposVencidos, PantallaEquipos } from './ui/Equipos'
import { PantallaHistorial } from './ui/Historial'
import { Icono } from './ui/iconos'
import { PantallaInicio } from './ui/Inicio'
import { IndicadorNube } from './ui/Nube'
import { PantallaInventario } from './ui/Inventario'
import { PantallaPersonal } from './ui/Personal'
import { PantallaReportes } from './ui/Reportes'


const NAV: { id: Pantalla; texto: string; icono: string }[] = [
  { id: 'despacho', texto: 'Despacho', icono: 'despacho' },
  { id: 'devolucion', texto: 'Devolución', icono: 'devolucion' },
  { id: 'equipos', texto: 'Equipos', icono: 'equipo' },
  { id: 'inventario', texto: 'Inventario', icono: 'inventario' },
  { id: 'historial', texto: 'Historial', icono: 'historial' },
  { id: 'reportes', texto: 'Reportes', icono: 'reportes' },
  { id: 'catalogo', texto: 'Catálogo', icono: 'catalogo' },
  { id: 'personal', texto: 'Personal', icono: 'personal' },
  { id: 'ajustes', texto: 'Ajustes', icono: 'ajustes' },
]
const NAV_MOVIL: Pantalla[] = ['despacho', 'devolucion', 'inventario', 'historial']

function requiereRespaldo(): boolean {
  // Con la nube conectada y al día, el respaldo manual no hace falta
  if (nube.value?.ultimaSync && Date.now() - new Date(nube.value.ultimaSync).getTime() < 24 * 3600 * 1000) return false
  const n = S.cambiosSinRespaldo.value
  if (!n) return false
  if (n >= 50 || !S.ultimoRespaldo.value) return true
  return Date.now() - new Date(S.ultimoRespaldo.value).getTime() > 12 * 3600 * 1000
}

/** Bloquea la sesión tras X minutos sin tocar la pantalla. */
function useBloqueoInactividad() {
  useEffect(() => {
    let ultimo = Date.now()
    const actividad = () => (ultimo = Date.now())
    const eventos = ['pointerdown', 'keydown', 'touchstart']
    eventos.forEach((e) => window.addEventListener(e, actividad, { passive: true }))
    const t = window.setInterval(() => {
      const min = S.bloqueoMin.value
      if (min > 0 && S.sesion.value && Date.now() - ultimo > min * 60000) cerrarSesion()
    }, 15000)
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, actividad))
      clearInterval(t)
    }
  }, [])
}

function Contenido() {
  switch (pantalla.value) {
    case 'despacho':
      return <PantallaDespacho />
    case 'devolucion':
      return <PantallaDevolucion />
    case 'equipos':
      return <PantallaEquipos />
    case 'inventario':
      return <PantallaInventario />
    case 'historial':
      return <PantallaHistorial />
    case 'reportes':
      return <PantallaReportes />
    case 'catalogo':
      return <PantallaCatalogo />
    case 'personal':
      return <PantallaPersonal />
    case 'ajustes':
      return <PantallaAjustes />
  }
}

function MenuMas({ onCerrar }: { onCerrar: () => void }) {
  return (
    <div class="velo" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Más opciones">
        <div class="stack" style={{ gap: '4px' }}>
          {NAV.filter((n) => !NAV_MOVIL.includes(n.id)).map((n) => (
            <button
              key={n.id}
              class="nav-item"
              aria-current={pantalla.value === n.id ? 'page' : undefined}
              onClick={() => {
                pantalla.value = n.id
                onCerrar()
              }}
            >
              <Icono n={n.icono} /> {n.texto}
              {n.id === 'ajustes' && requiereRespaldo() && <span class="punto" />}
              {n.id === 'equipos' && equiposVencidos() > 0 && <span class="punto" />}
            </button>
          ))}
          <button class="nav-item" onClick={() => (cerrarSesion(), onCerrar())}>
            <Icono n="candado" /> Bloquear / cambiar usuario
          </button>
        </div>
      </div>
    </div>
  )
}

function Shell() {
  const [mas, setMas] = useState(false)
  const s = S.sesion.value!
  const eq = S.dispositivo.value!
  const alerta = requiereRespaldo()
  const vencidos = prestamosVencidos(S.resguardosActivos.value, fechaLocal()).length
  const eqVencidos = equiposVencidos()
  useBloqueoInactividad()

  return (
    <div class="shell">
      <nav class="side" aria-label="Secciones">
        <div class="marca">
          Control EPP
          <small>Seguridad Industrial · Laguna Verde</small>
        </div>
        {NAV.map((n) => (
          <button key={n.id} class="nav-item" aria-current={pantalla.value === n.id ? 'page' : undefined} onClick={() => (pantalla.value = n.id)}>
            <Icono n={n.icono} /> {n.texto}
            {n.id === 'ajustes' && alerta && <span class="punto" title="Hay cambios sin respaldar" />}
            {n.id === 'devolucion' && vencidos > 0 && <span class="punto" title="Préstamos vencidos" />}
            {n.id === 'equipos' && eqVencidos > 0 && <span class="punto" title="Equipos sin devolver" />}
          </button>
        ))}
        <div class="side-pie">
          <IndicadorNube />
          {alerta && (
            <button class="aviso warn small" style={{ border: 0, textAlign: 'left' }} onClick={() => (pantalla.value = 'ajustes')}>
              {plural(S.cambiosSinRespaldo.value, 'cambio', 'cambios')} sin respaldar · último respaldo {hace(S.ultimoRespaldo.value)}
            </button>
          )}
          <button class="usuario-chip" onClick={cerrarSesion} title="Bloquear o cambiar de usuario">
            <span class="badge ok">{iniciales(s.usuarioNombre)}</span>
            <span class="grow">
              <strong>{s.usuarioNombre}</strong>
              <br />
              <span class="muted small">Equipo {eq.codigo} · bloquear</span>
            </span>
            <Icono n="candado" />
          </button>
        </div>
      </nav>

      <div class="main">
        <header class="topbar">
          <div class="marca">
            Control EPP
            <small>Equipo {eq.codigo}</small>
          </div>
          <IndicadorNube compacto />
          <button class="usuario-chip" onClick={cerrarSesion} aria-label="Bloquear o cambiar de usuario">
            {s.usuarioNombre.split(' ')[0]}
            <Icono n="candado" />
          </button>
        </header>
        <main class="pagina">
          <Contenido />
        </main>
      </div>

      <nav class="bottomnav" aria-label="Secciones">
        {NAV.filter((n) => NAV_MOVIL.includes(n.id)).map((n) => (
          <button key={n.id} aria-current={pantalla.value === n.id ? 'page' : undefined} onClick={() => (pantalla.value = n.id)}>
            <Icono n={n.icono} />
            {n.texto}
            {n.id === 'devolucion' && vencidos > 0 && <span class="punto" />}
          </button>
        ))}
        <button aria-current={!NAV_MOVIL.includes(pantalla.value) ? 'page' : undefined} onClick={() => setMas(true)}>
          <Icono n="mas" />
          Más
          {(alerta || eqVencidos > 0) && <span class="punto" />}
        </button>
      </nav>
      {mas && <MenuMas onCerrar={() => setMas(false)} />}
    </div>
  )
}

export function App() {
  useEffect(() => {
    S.cargarTodo().then(migrar).then(cargarNube)
  }, [])

  let vista
  if (!S.cargado.value) vista = <div style={{ padding: '40px', textAlign: 'center' }} class="muted">Cargando…</div>
  else if (!S.dispositivo.value || !S.usuarios.value.length) vista = <PantallaInicio />
  else if (!S.sesion.value) vista = <PantallaAcceso />
  else vista = <Shell />

  return (
    <>
      {vista}
      <Toasts />
      <Confirmacion />
    </>
  )
}
