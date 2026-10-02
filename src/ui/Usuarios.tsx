import { useState } from 'preact/hooks'
import type { Rol, Usuario } from '../domain/types'
import { normalizar } from '../lib/util'
import { nombreRol, rolDe, ROLES } from '../state/permisos'
import { cambiarMiPin, cerrarSesion, guardarUsuario, restablecerPin } from '../state/servicios'
import * as S from '../state/store'
import { avisar, confirmar, intentar, Modal } from './comunes'
import { Icono } from './iconos'

const soloNumeros = (v: string) => v.replace(/\D/g, '').slice(0, 6)

function CampoPin(props: { id: string; etiqueta: string; valor: string; onCambio: (v: string) => void }) {
  return (
    <label class="campo">
      {props.etiqueta}
      <input class="input mono" id={props.id} type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={props.valor} onInput={(e) => props.onCambio(soloNumeros((e.target as HTMLInputElement).value))} />
    </label>
  )
}

// ---------- Alta y edición (administrador) ----------

function EditorUsuario({ u, onCerrar }: { u: Usuario | null; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(u?.nombre ?? '')
  const [pin, setPin] = useState('')
  const [rol, setRol] = useState<Rol>(u ? rolDe(u) : 'despachador')
  const [activo, setActivo] = useState(u?.activo ?? true)
  const yo = u?.id === S.sesion.value?.usuarioId
  const guardar = async () => {
    const ok = await intentar(async () => {
      await guardarUsuario({ id: u?.id, nombre, rol, activo, pin: pin || undefined })
      return true
    })
    if (ok) {
      avisar(u ? '✓ Usuario actualizado' : `✓ ${nombre.trim()} puede entrar con el PIN asignado; se le pedirá cambiarlo.`, { ms: 6000 })
      onCerrar()
    }
  }
  return (
    <Modal
      titulo={u ? 'Editar usuario' : 'Nuevo usuario'}
      onCerrar={onCerrar}
      acciones={
        <>
          <button class="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button class="btn primary" onClick={guardar}>
            Guardar
          </button>
        </>
      }
    >
      <label class="campo">
        Nombre
        <input class="input" id="u-nombre" value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} />
      </label>
      {!u && <CampoPin id="u-pin" etiqueta="PIN inicial (4 a 6 números; al entrar se le pedirá cambiarlo)" valor={pin} onCambio={setPin} />}
      <fieldset class="stack" style={{ gap: '6px', border: 0, padding: 0, margin: 0 }}>
        <legend class="small" style={{ marginBottom: '4px' }}>
          Rol
        </legend>
        {ROLES.map((r) => (
          <label key={r.id} class="check" style={{ alignItems: 'flex-start' }}>
            <input type="radio" name="u-rol" checked={rol === r.id} onChange={() => setRol(r.id)} />
            <span>
              <strong>{r.nombre}</strong>
              <br />
              <span class="muted small">{r.ayuda}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {u && !yo && (
        <label class="check">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo((e.target as HTMLInputElement).checked)} />
          Activo (puede entrar a la app)
        </label>
      )}
      {u && <p class="muted small">Para un PIN olvidado use «Restablecer PIN» en la lista de usuarios.</p>}
    </Modal>
  )
}

function ModalPinTemporal({ u, pin, onCerrar }: { u: Usuario; pin: string; onCerrar: () => void }) {
  return (
    <Modal
      titulo="PIN temporal"
      onCerrar={onCerrar}
      acciones={
        <button class="btn primary" onClick={onCerrar}>
          Listo, ya lo anoté
        </button>
      }
    >
      <p>
        Comunique este PIN a <strong>{u.nombre}</strong>. Solo sirve para entrar una vez: la app le pedirá elegir su propio PIN.
      </p>
      <div class="pin-temporal mono" aria-label={`PIN temporal ${pin.split('').join(' ')}`}>
        {pin}
      </div>
      <p class="muted small">Por seguridad no se vuelve a mostrar. Si se pierde, restablézcalo de nuevo. El cambio llega a los demás equipos al sincronizar.</p>
    </Modal>
  )
}

/** Ajustes → Usuarios: lista, alta, edición, activar/desactivar y restablecer PIN. */
export function SeccionUsuarios() {
  const [editar, setEditar] = useState<Usuario | null | 'nuevo'>(null)
  const [temporal, setTemporal] = useState<{ u: Usuario; pin: string } | null>(null)
  const [texto, setTexto] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)
  const admin = S.sesion.value?.rol === 'admin'
  const yoId = S.sesion.value?.usuarioId
  const q = normalizar(texto)
  const lista = S.usuarios.value
    .filter((u) => (verInactivos || u.activo) && (!q || normalizar(u.nombre).includes(q)))
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre))
  const inactivos = S.usuarios.value.filter((u) => !u.activo).length

  const restablecer = async (u: Usuario) => {
    if (!(await confirmar('Restablecer PIN', `Se generará un PIN temporal para ${u.nombre}. Su PIN actual dejará de funcionar.`, 'Restablecer'))) return
    const pin = await intentar(() => restablecerPin(u.id))
    if (pin) setTemporal({ u: S.usuarios.value.find((x) => x.id === u.id) ?? u, pin })
  }

  const alternarActivo = async (u: Usuario) => {
    if (u.activo && !(await confirmar('Desactivar usuario', `${u.nombre} ya no podrá entrar a la app. Sus registros se conservan.`, 'Desactivar', true))) return
    const ok = await intentar(async () => {
      await guardarUsuario({ id: u.id, nombre: u.nombre, rol: rolDe(u), activo: !u.activo })
      return true
    })
    if (ok) avisar(u.activo ? `${u.nombre} desactivado` : `✓ ${u.nombre} activado`)
  }

  return (
    <section class="card stack">
      <div class="spread">
        <h2>Usuarios</h2>
        {admin && (
          <button class="btn" onClick={() => setEditar('nuevo')}>
            <Icono n="mas1" /> Nuevo usuario
          </button>
        )}
      </div>
      <p class="muted small">
        Despachador: despacha, recibe devoluciones y presta equipos. Encargado de almacén: además entradas, traspasos, ajustes y conteos. Administrador: además usuarios, catálogo y motivos. Cada registro guarda quién lo hizo.
      </p>
      {S.usuarios.value.length > 6 && (
        <div class="row">
          <input class="input grow" id="u-buscar" type="search" placeholder="Buscar usuario…" value={texto} onInput={(e) => setTexto((e.target as HTMLInputElement).value)} />
        </div>
      )}
      <div class="usuarios-lista">
        {lista.map((u) => (
          <div key={u.id} class="usuario-fila" style={{ opacity: u.activo ? 1 : 0.55 }}>
            <div class="grow">
              <strong>{u.nombre}</strong>
              {u.id === yoId && <span class="muted small"> (usted)</span>}
              <div class="row" style={{ gap: '4px', marginTop: '4px' }}>
                <span class={`badge ${rolDe(u) === 'admin' ? 'ok' : rolDe(u) === 'almacen' ? 'warn' : ''}`}>{nombreRol(rolDe(u))}</span>
                {!u.activo && <span class="badge">Inactivo</span>}
                {u.debeCambiarPin && u.activo && <span class="badge warn">PIN temporal</span>}
              </div>
            </div>
            {admin && (
              <div class="row" style={{ gap: '4px' }}>
                <button class="btn sm" onClick={() => setEditar(u)}>
                  <Icono n="editar" /> Editar
                </button>
                {u.id !== yoId && (
                  <button class="btn sm" onClick={() => restablecer(u)}>
                    <Icono n="candado" /> Restablecer PIN
                  </button>
                )}
                {u.id !== yoId && (
                  <button class="btn sm ghost" onClick={() => alternarActivo(u)}>
                    {u.activo ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {inactivos > 0 && (
        <label class="check small">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos((e.target as HTMLInputElement).checked)} />
          Mostrar {inactivos} inactivo{inactivos === 1 ? '' : 's'}
        </label>
      )}
      {!admin && <p class="muted small">Solo un administrador puede agregar usuarios, cambiar roles o restablecer un PIN olvidado.</p>}
      <MiPin />
      {editar && <EditorUsuario u={editar === 'nuevo' ? null : editar} onCerrar={() => setEditar(null)} />}
      {temporal && <ModalPinTemporal u={temporal.u} pin={temporal.pin} onCerrar={() => setTemporal(null)} />}
    </section>
  )
}

// ---------- Cambio del propio PIN ----------

function FormCambioPin({ obligatorio, onListo }: { obligatorio?: boolean; onListo: () => void }) {
  const [actual, setActual] = useState('')
  const [nuevo, setNuevo] = useState('')
  const [nuevo2, setNuevo2] = useState('')
  const guardar = async () => {
    if (nuevo !== nuevo2) return avisar('Los PIN nuevos no coinciden.', { tipo: 'bad' })
    const ok = await intentar(async () => {
      await cambiarMiPin(actual, nuevo)
      return true
    })
    if (ok) {
      avisar('✓ PIN actualizado')
      onListo()
    }
  }
  return (
    <div class="stack" style={{ gap: '10px' }}>
      <CampoPin id="pin-actual" etiqueta={obligatorio ? 'PIN temporal que le dieron' : 'PIN actual'} valor={actual} onCambio={setActual} />
      <CampoPin id="pin-nuevo" etiqueta="PIN nuevo (4 a 6 números)" valor={nuevo} onCambio={setNuevo} />
      <CampoPin id="pin-nuevo2" etiqueta="Repita el PIN nuevo" valor={nuevo2} onCambio={setNuevo2} />
      <button class="btn primary" disabled={actual.length < 4 || nuevo.length < 4 || nuevo2.length < 4} onClick={guardar}>
        Guardar mi PIN
      </button>
    </div>
  )
}

function MiPin() {
  const [abierto, setAbierto] = useState(false)
  return (
    <div class="row" style={{ borderTop: '1px solid var(--rule)', paddingTop: '10px' }}>
      <span class="grow small">
        Sesión de <strong>{S.sesion.value?.usuarioNombre}</strong>
      </span>
      <button class="btn sm" onClick={() => setAbierto(true)}>
        <Icono n="candado" /> Cambiar mi PIN
      </button>
      {abierto && (
        <Modal titulo="Cambiar mi PIN" onCerrar={() => setAbierto(false)}>
          <FormCambioPin onListo={() => setAbierto(false)} />
        </Modal>
      )}
    </div>
  )
}

/** Pantalla obligatoria cuando se entra con un PIN temporal. */
export function PantallaCambioPin() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '20px' }}>
      <div class="card stack" style={{ width: '100%', maxWidth: '400px', gap: '14px', padding: '22px' }}>
        <h1>Elija su PIN</h1>
        <p class="muted">
          Hola, {S.sesion.value?.usuarioNombre}. Entró con un PIN temporal; elija ahora su propio PIN de 4 a 6 números. No use números repetidos ni seguidos.
        </p>
        <FormCambioPin obligatorio onListo={() => undefined} />
        <button class="btn ghost" onClick={cerrarSesion}>
          Salir
        </button>
      </div>
    </div>
  )
}
