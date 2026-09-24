import { useState } from 'preact/hooks'
import { hace, plural } from '../lib/util'
import { conectarNube, desconectarNube, errorNube, estadoNube, nube, pendientesNube, progresoNube, sincronizarAhora, unirseDesdeNube } from '../state/nube'
import * as S from '../state/store'
import { avisar, confirmar, intentar } from './comunes'
import { Icono } from './iconos'

const TEXTO_ESTADO: Record<string, string> = {
  desconectado: 'Sin conectar',
  sincronizando: 'Sincronizando…',
  'al-dia': 'Al día',
  pendiente: 'Cambios por subir',
  'sin-red': 'Sin conexión',
  error: 'Error de sincronización',
}

/** Pastilla de estado en la barra lateral y superior. Al tocarla, sincroniza. */
export function IndicadorNube({ compacto }: { compacto?: boolean }) {
  const cfg = nube.value
  if (!cfg) return null
  const estado = estadoNube.value
  const clase = estado === 'al-dia' ? 'ok' : estado === 'error' ? 'bad' : estado === 'sin-red' || estado === 'pendiente' ? 'warn' : ''
  const detalle =
    estado === 'pendiente' || estado === 'sin-red'
      ? plural(pendientesNube.value, 'pendiente', 'pendientes')
      : estado === 'al-dia' && cfg.ultimaSync
        ? hace(cfg.ultimaSync)
        : ''
  return (
    <button
      class={`indicador-nube ${clase}`}
      onClick={() => void sincronizarAhora()}
      title={errorNube.value || 'Sincronizar ahora con Google Sheets'}
      aria-label={`Nube: ${TEXTO_ESTADO[estado]}. Sincronizar ahora`}
    >
      <span class={`punto-nube ${estado === 'sincronizando' ? 'gira' : ''}`} />
      {compacto ? (estado === 'pendiente' || estado === 'sin-red' ? pendientesNube.value : '') : (
        <span>
          {TEXTO_ESTADO[estado]}
          {detalle && <span class="muted"> · {detalle}</span>}
        </span>
      )}
    </button>
  )
}

function CamposConexion(props: { url: string; clave: string; onUrl: (v: string) => void; onClave: (v: string) => void }) {
  return (
    <>
      <label class="campo">
        URL del servidor (termina en /exec)
        <input class="input" id="nube-url" inputMode="url" autoComplete="off" placeholder="https://script.google.com/macros/s/…/exec" value={props.url} onInput={(e) => props.onUrl((e.target as HTMLInputElement).value.trim())} />
      </label>
      <label class="campo">
        Clave de la oficina
        <input
          class="input mono"
          id="nube-clave"
          autoComplete="off"
          placeholder="XXXX-XXXX-XXXX"
          value={props.clave}
          onInput={(e) => props.onClave((e.target as HTMLInputElement).value.toUpperCase())}
        />
      </label>
    </>
  )
}

/** Tarjeta de Ajustes para conectar este equipo y ver el estado de la sincronización. */
export function TarjetaNube() {
  const cfg = nube.value
  const [url, setUrl] = useState('')
  const [clave, setClave] = useState('')
  const [trabajando, setTrabajando] = useState(false)

  const conectar = async () => {
    setTrabajando(true)
    const ok = await intentar(async () => {
      await conectarNube(url, clave)
      return true
    })
    setTrabajando(false)
    if (ok) {
      setClave('')
      avisar('✓ Equipo conectado a Google Sheets. Los datos se sincronizan solos.', { ms: 6000 })
    }
  }

  const desconectar = async () => {
    if (!(await confirmar('Desconectar de la nube', 'Este equipo dejará de sincronizarse. Los datos se quedan en el equipo y los cambios nuevos no llegarán a la hoja.', 'Desconectar', true))) return
    await desconectarNube()
  }

  if (!cfg) {
    return (
      <section class="card stack">
        <h2>Nube · Google Sheets</h2>
        <p class="muted small">
          Conecte este equipo al servidor de la oficina para que todos los equipos compartan catálogo, padrón, entregas y existencias. La app sigue funcionando sin señal
          y sube los cambios cuando hay conexión.
        </p>
        <CamposConexion url={url} clave={clave} onUrl={setUrl} onClave={setClave} />
        <button class="btn primary" style={{ justifySelf: 'start' }} disabled={!url || !clave || trabajando} onClick={conectar}>
          {trabajando ? progresoNube.value || 'Conectando…' : 'Conectar y subir los datos de este equipo'}
        </button>
      </section>
    )
  }

  return (
    <section class="card stack">
      <div class="spread">
        <h2>Nube · Google Sheets</h2>
        <IndicadorNube />
      </div>
      <dl class="datos-nube">
        <dt>Última sincronización</dt>
        <dd>{cfg.ultimaSync ? `${new Date(cfg.ultimaSync).toLocaleString()} (${hace(cfg.ultimaSync)})` : 'aún no'}</dd>
        <dt>Cambios por subir</dt>
        <dd>{pendientesNube.value}</dd>
        <dt>Equipo</dt>
        <dd>
          {S.dispositivo.value?.codigo} · {S.dispositivo.value?.nombre}
        </dd>
      </dl>
      {errorNube.value && (
        <div class={`aviso ${estadoNube.value === 'sin-red' ? 'warn' : 'bad'}`}>
          <Icono n="alerta" />
          <span>{errorNube.value}</span>
        </div>
      )}
      {progresoNube.value && <p class="muted small">{progresoNube.value}</p>}
      <div class="row">
        <button class="btn primary" disabled={estadoNube.value === 'sincronizando'} onClick={() => void sincronizarAhora()}>
          <Icono n="repetir" /> Sincronizar ahora
        </button>
        <button class="btn ghost" onClick={desconectar}>
          Desconectar este equipo
        </button>
      </div>
    </section>
  )
}

/** Alta de un equipo nuevo descargando todo de la nube (pantalla inicial). */
export function UnirseDesdeNube({ onAtras }: { onAtras: () => void }) {
  const [url, setUrl] = useState('')
  const [clave, setClave] = useState('')
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const unir = async () => {
    if (!/^[A-Z0-9]{1,4}$/.test(codigo) || !nombre.trim()) return avisar('Complete el código y el nombre de este equipo.', { tipo: 'bad' })
    setTrabajando(true)
    const ok = await intentar(async () => {
      await unirseDesdeNube(url, clave, codigo, nombre)
      return true
    })
    setTrabajando(false)
    if (ok) avisar('✓ Equipo listo. Entre con su usuario y PIN.')
  }
  return (
    <>
      <p class="muted">Descarga de la nube el catálogo, el padrón, los usuarios y las existencias. Entre después con su usuario y PIN de siempre.</p>
      <CamposConexion url={url} clave={clave} onUrl={setUrl} onClave={setClave} />
      <label class="campo">
        Código de este equipo (1 a 4 letras o números, distinto a los demás)
        <input class="input" id="unir-codigo" maxLength={4} value={codigo} placeholder="Ej. JP1" onInput={(e) => setCodigo((e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
      </label>
      <label class="campo">
        Responsable o descripción del equipo
        <input class="input" id="unir-nombre" value={nombre} placeholder="Ej. Celular de Juan" onInput={(e) => setNombre((e.target as HTMLInputElement).value)} />
      </label>
      {trabajando && progresoNube.value && <p class="muted small">Descargando: {progresoNube.value}</p>}
      <div class="row">
        <button class="btn" onClick={onAtras}>
          Atrás
        </button>
        <button class="btn primary grow" disabled={!url || !clave || trabajando} onClick={unir}>
          {trabajando ? 'Descargando…' : 'Conectar y descargar'}
        </button>
      </div>
    </>
  )
}
