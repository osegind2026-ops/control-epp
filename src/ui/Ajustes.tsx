import { useEffect, useState } from 'preact/hooks'
import type { Rol, Ubicacion, Usuario } from '../domain/types'
import { nombreRol, rolDe, ROLES } from '../state/permisos'
import { descargarArchivo, hace, plural } from '../lib/util'
import { armarRespaldo, importarRespaldo, leerRespaldo, marcarRespaldado, nombreArchivo, type Respaldo } from '../state/respaldo'
import { guardarBloqueo, guardarDispositivo, guardarRegistro, guardarUsuario, nuevoId } from '../state/servicios'
import * as S from '../state/store'
import { avisar, confirmar, intentar, Modal } from './comunes'
import { Icono } from './iconos'
import { TarjetaNube } from './Nube'
import { PlantillaReportes } from './PlantillaReportes'
import { nube } from '../state/nube'

function Equipo() {
  const eq = S.dispositivo.value!
  const [codigo, setCodigo] = useState(eq.codigo)
  const [nombre, setNombre] = useState(eq.nombre)
  const guardar = async () => {
    if (!/^[A-Z0-9]{1,4}$/.test(codigo)) return avisar('El código debe tener de 1 a 4 letras o números.', { tipo: 'bad' })
    const ajeno = S.entregas.value.some((e) => e.equipo === codigo && codigo !== eq.codigo)
    if (ajeno && !(await confirmar('Código en uso', `Hay entregas con el código ${codigo} de otro equipo. Si lo repite, los folios pueden duplicarse.`, 'Usarlo de todos modos', true))) return
    await intentar(() => guardarDispositivo(codigo, nombre))
    avisar('✓ Equipo actualizado')
  }
  return (
    <section class="card stack">
      <h2>Este equipo</h2>
      <div class="row" style={{ alignItems: 'end' }}>
        <label class="campo" style={{ width: '120px' }}>
          Código
          <input class="input" id="eq-codigo" maxLength={4} value={codigo} onInput={(e) => setCodigo((e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        </label>
        <label class="campo grow">
          Responsable o descripción
          <input class="input" id="eq-nombre" value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} />
        </label>
        <button class="btn" onClick={guardar}>
          Guardar
        </button>
      </div>
      <p class="muted small">
        Próximo folio: <span class="mono">CFE-{eq.codigo}-{String((S.folios.value[eq.codigo] ?? 0) + 1).padStart(4, '0')}</span>
      </p>
      <label class="campo" style={{ maxWidth: '320px' }}>
        Bloquear la sesión tras
        <select class="input" id="eq-bloqueo" value={S.bloqueoMin.value} onChange={(e) => guardarBloqueo(parseInt((e.target as HTMLSelectElement).value, 10))}>
          {[2, 5, 10, 15, 30, 60, 0].map((m) => (
            <option key={m} value={m}>
              {m === 0 ? 'Nunca' : `${m} minutos sin uso`}
            </option>
          ))}
        </select>
      </label>
    </section>
  )
}

function EditorUsuario({ u, onCerrar }: { u: Usuario | null; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(u?.nombre ?? '')
  const [pin, setPin] = useState('')
  const [rol, setRol] = useState<Rol>(u ? rolDe(u) : 'despachador')
  const [activo, setActivo] = useState(u?.activo ?? true)
  const guardar = async () => {
    if (!nombre.trim()) return avisar('Escriba el nombre.', { tipo: 'bad' })
    const ok = await intentar(async () => {
      await guardarUsuario({ id: u?.id, nombre, rol, activo, pin: pin || undefined })
      return true
    })
    if (ok) {
      avisar('✓ Usuario guardado')
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
      <label class="campo">
        {u ? 'Nuevo PIN (déjelo vacío para conservar el actual)' : 'PIN (4 a 6 números)'}
        <input class="input" id="u-pin" type="password" inputMode="numeric" maxLength={6} value={pin} onInput={(e) => setPin((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
      </label>
      <fieldset class="stack" style={{ gap: '6px', border: 0, padding: 0, margin: 0 }}>
        <legend class="small" style={{ marginBottom: '4px' }}>Rol</legend>
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
      {u && (
        <label class="check">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo((e.target as HTMLInputElement).checked)} />
          Activo
        </label>
      )}
    </Modal>
  )
}

function Usuarios() {
  const [editar, setEditar] = useState<Usuario | null | 'nuevo'>(null)
  const admin = S.sesion.value?.esAdmin
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
      <p class="muted small">Todos pueden despachar, recibir devoluciones, prestar equipos y anular con un motivo autorizado. Las entradas, traspasos, ajustes y conteos son del encargado de almacén o del administrador. Cada registro guarda quién lo hizo.</p>
      {S.usuarios.value.map((u) => (
        <div key={u.id} class="row" style={{ opacity: u.activo ? 1 : 0.5 }}>
          <span class="grow">
            <strong>{u.nombre}</strong> <span class={`badge ${rolDe(u) === 'admin' ? 'ok' : rolDe(u) === 'almacen' ? 'warn' : ''}`}>{nombreRol(rolDe(u))}</span> {!u.activo && <span class="badge">Inactivo</span>}
          </span>
          {admin && (
            <button class="btn sm" onClick={() => setEditar(u)}>
              Editar
            </button>
          )}
        </div>
      ))}
      {!admin && <p class="muted small">Solo un administrador puede agregar o editar usuarios.</p>}
      {editar && <EditorUsuario u={editar === 'nuevo' ? null : editar} onCerrar={() => setEditar(null)} />}
    </section>
  )
}

function Ubicaciones() {
  const guardar = (u: Ubicacion) => intentar(() => guardarRegistro('ubicaciones', u))
  const [nueva, setNueva] = useState('')
  return (
    <section class="card stack">
      <h2>Almacenes</h2>
      <p class="muted small">Las entregas y devoluciones se registran en el almacén marcado como punto de despacho.</p>
      {S.ubicaciones.value
        .slice()
        .sort((a, b) => a.orden - b.orden)
        .map((u) => (
          <div key={u.id} class="row" style={{ flexWrap: 'nowrap' }}>
            <input
              class="input grow"
              id={`ubi-${u.id}`}
              aria-label="Nombre del almacén"
              defaultValue={u.nombre}
              onBlur={(e) => {
                const v = (e.target as HTMLInputElement).value.trim()
                if (v && v !== u.nombre) guardar({ ...u, nombre: v })
              }}
            />
            <label class="check small" style={{ whiteSpace: 'nowrap' }}>
              <input type="radio" name="despacho" checked={u.esDespacho} onChange={() => guardar({ ...u, esDespacho: true })} />
              Despacho
            </label>
          </div>
        ))}
      <div class="row" style={{ flexWrap: 'nowrap' }}>
        <input class="input grow" id="ubi-nueva" placeholder="Nuevo almacén" value={nueva} onInput={(e) => setNueva((e.target as HTMLInputElement).value)} />
        <button
          class="btn"
          disabled={!nueva.trim()}
          onClick={async () => {
            await guardar({ id: nuevoId('UBI'), nombre: nueva.trim(), esDespacho: false, orden: S.ubicaciones.value.length + 1, activo: true })
            setNueva('')
          }}
        >
          Agregar
        </button>
      </div>
    </section>
  )
}

function Respaldos() {
  const [archivo, setArchivo] = useState<{ nombre: string; r: Respaldo } | null>(null)
  const [uso, setUso] = useState('')

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUso(`${(e.usage / 1024 / 1024).toFixed(1)} MB usados${e.quota ? ` de ${Math.round(e.quota / 1024 / 1024)} MB disponibles` : ''}`)
    })
  }, [])

  const descargar = async () => {
    const r = await armarRespaldo()
    descargarArchivo(nombreArchivo(`CFE_EPP_Respaldo_${r.equipoOrigen?.codigo ?? ''}`, 'json'), JSON.stringify(r), 'application/json')
    await marcarRespaldado()
    avisar('✓ Respaldo descargado')
  }

  const elegir = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]
    ;(e.target as HTMLInputElement).value = ''
    if (!f) return
    const r = await intentar(async () => leerRespaldo(await f.text()))
    if (r) setArchivo({ nombre: f.name, r })
  }

  const aplicar = async (modo: 'combinar' | 'reemplazar') => {
    if (!archivo) return
    if (modo === 'reemplazar') {
      if (!(await confirmar('Reemplazar datos', 'Se borrarán los datos de este equipo y quedarán solo los del archivo. Antes se descargará un respaldo de seguridad.', 'Reemplazar', true))) return
      await descargar()
    }
    const res = await intentar(() => importarRespaldo(archivo.r, modo))
    setArchivo(null)
    if (!res) return
    const agregados = Object.entries(res.agregados)
      .map(([t, n]) => `${n} ${t}`)
      .join(', ')
    avisar(modo === 'combinar' ? `✓ Combinado: ${agregados || 'nada nuevo'}${res.actualizados ? `; ${res.actualizados} actualizados` : ''}` : '✓ Datos reemplazados', { ms: 7000 })
  }

  return (
    <section class="card stack">
      <h2>Respaldo en archivo</h2>
      <div class={`aviso ${S.cambiosSinRespaldo.value ? 'warn' : 'info'}`}>
        Último respaldo: {S.ultimoRespaldo.value ? `${new Date(S.ultimoRespaldo.value).toLocaleString()} (${hace(S.ultimoRespaldo.value)})` : 'nunca'} · {plural(S.cambiosSinRespaldo.value, 'cambio', 'cambios')} sin respaldar
      </div>
      <p class="muted small">
        {nube.value
          ? 'Con la nube conectada no hace falta, pero puede descargar una copia en archivo cuando quiera.'
          : 'Sin nube, pase los datos entre equipos con un respaldo: descárguelo en uno y cárguelo en el otro con «Combinar». No se pierde nada de ninguno de los dos.'}
      </p>
      <div class="row">
        <button class="btn primary" onClick={descargar}>
          <Icono n="descarga" /> Descargar respaldo
        </button>
        <label class="btn" style={{ cursor: 'pointer' }}>
          <Icono n="subir" /> Cargar respaldo
          <input type="file" accept=".json,application/json" hidden onChange={elegir} />
        </label>
      </div>
      {uso && <p class="muted small">Almacenamiento del navegador: {uso}.</p>}
      {archivo && (
        <Modal
          titulo="Cargar respaldo"
          onCerrar={() => setArchivo(null)}
          acciones={
            <>
              <button class="btn" onClick={() => setArchivo(null)}>
                Cancelar
              </button>
              {!nube.value && (
                <button class="btn danger" onClick={() => aplicar('reemplazar')}>
                  Reemplazar
                </button>
              )}
              <button class="btn primary" onClick={() => aplicar('combinar')}>
                Combinar
              </button>
            </>
          }
        >
          <p>
            <strong>{archivo.nombre}</strong>
            <br />
            <span class="muted small">
              Equipo {archivo.r.equipoOrigen?.codigo ?? '?'} ({archivo.r.equipoOrigen?.nombre}) · {new Date(archivo.r.generado).toLocaleString()}
            </span>
          </p>
          <p class="small">
            {plural(archivo.r.datos.entregas?.length ?? 0, 'entrega', 'entregas')} · {plural(archivo.r.datos.movimientos?.length ?? 0, 'movimiento', 'movimientos')} · {plural(archivo.r.datos.personal?.length ?? 0, 'trabajador', 'trabajadores')}
          </p>
          {archivo.r.equipoOrigen?.codigo === S.dispositivo.value?.codigo && (
            <div class="aviso warn">El respaldo viene de un equipo con el mismo código que este ({S.dispositivo.value?.codigo}). Si son equipos distintos, cambie el código de uno de ellos.</div>
          )}
          <div class="aviso info small">
            <strong>Combinar</strong> agrega lo que falta sin borrar nada (recomendado). <strong>Reemplazar</strong> deja solo lo del archivo.
          </div>
        </Modal>
      )}
    </section>
  )
}

export function PantallaAjustes() {
  return (
    <div class="stack" style={{ maxWidth: '860px' }}>
      <h1>Ajustes</h1>
      <TarjetaNube />
      <Respaldos />
      <Equipo />
      <Usuarios />
      <Ubicaciones />
      <PlantillaReportes />
      <p class="muted small">Control EPP v2.1 · {nube.value ? 'Sincronizado con Google Sheets' : 'Los datos se guardan solo en este navegador'}.</p>
    </div>
  )
}
