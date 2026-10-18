import { useEffect, useState } from 'preact/hooks'
import { descargarBlob, hace, plural } from '../lib/util'
import {
  cambiarEquipoRegistrado,
  conectarLocalSiFalta,
  conectarNube,
  desconectarNube,
  detectarServidorLocal,
  enServidorOficina,
  equiposRegistrados,
  errorNube,
  esCodigoOcupado,
  esLocal,
  estadoNube,
  nube,
  pendientesNube,
  progresoNube,
  servidorLocal,
  sincronizarAhora,
  unirseDesdeNube,
} from '../state/nube'
import type { EquipoRegistrado } from '../sync/cliente'
import { esAdmin } from '../state/permisos'
import { pantalla } from '../state/navegacion'
import * as S from '../state/store'
import { avisar, confirmar, intentar, ultimoError } from './comunes'
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
  if (!cfg && servidorLocal.value) {
    // Abierta desde la carpeta de red pero sin conectar: que se note
    return (
      <button class="indicador-nube bad" onClick={() => (pantalla.value = 'ajustes')} title={errorNube.value || 'Conectar al servidor de la oficina'}>
        <span class="punto-nube" />
        {!compacto && <span>Sin conectar al servidor</span>}
      </button>
    )
  }
  if (!cfg && enServidorOficina()) {
    // Abierta desde el servidor de la oficina, pero este no responde (se está reiniciando o se cerró)
    return (
      <button class="indicador-nube bad" onClick={() => (pantalla.value = 'ajustes')} title="El servidor de la oficina no responde">
        <span class="punto-nube" />
        {!compacto && <span>Servidor sin respuesta</span>}
      </button>
    )
  }
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
      title={errorNube.value || (esLocal(cfg.url) ? 'Sincronizar ahora con el servidor de la oficina' : 'Sincronizar ahora con Google Sheets')}
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

/** Pregunta si se reemplaza el registro que tiene el mismo código (mismo equipo con los datos del navegador borrados). */
async function confirmarReemplazo(mensaje: string): Promise<boolean> {
  return confirmar(
    'Código ya registrado',
    `${mensaje}\n\nSi ese registro es de este mismo equipo (por ejemplo, se borraron los datos del navegador), o de un equipo que ya no se usa, puede reemplazarlo: el registro anterior queda dado de baja y deja de sincronizar.\n\nSi es otro equipo que sigue en uso, cancele y cambie el código de este en «Este equipo».`,
    'Reemplazar el registro anterior',
    true,
  )
}

/** Direcciones para abrir la app desde las otras PCs, con acceso directo descargable. */
function AccesoOtrasPcs() {
  const local = servidorLocal.value
  if (!local) return null
  const enEstaPc = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  if (!enEstaPc) {
    return <p class="muted small">Esta PC usa el servidor de la PC host «{local.pc}» ({location.host}).</p>
  }
  if (!local.enRed) {
    return (
      <div class="aviso warn small">
        <Icono n="alerta" />
        <span>
          Solo esta PC puede abrir la app. Para que las otras PCs entren por la red, ejecute en esta PC <strong>HABILITAR ACCESO EN RED (ejecutar como administrador)</strong>, que viene en la carpeta de Control EPP, y después reinicie el servidor (DETENER SERVIDOR y volver a abrir INICIAR CONTROL EPP).
        </span>
      </div>
    )
  }
  const acceso = (url: string) => descargarBlob('Control EPP.url', new Blob([`[InternetShortcut]\r\nURL=${url}\r\n`], { type: 'application/octet-stream' }))
  return (
    <div class="stack" style={{ gap: '6px' }}>
      <strong class="small">Abrir desde las otras PCs (esta es la PC host «{local.pc}»)</strong>
      <p class="muted small">Use de preferencia la dirección con el nombre de la PC: sigue funcionando aunque cambie la IP. Descargue el acceso directo y cópielo al escritorio de cada PC.</p>
      {local.urls.map((u) => (
        <div key={u} class="row" style={{ flexWrap: 'nowrap', gap: '6px' }}>
          <code class="grow mono small" style={{ wordBreak: 'break-all' }}>{u}</code>
          <button class="btn sm" onClick={() => void navigator.clipboard?.writeText(u).then(() => avisar('✓ Dirección copiada'))}>
            Copiar
          </button>
          <button class="btn sm" onClick={() => acceso(u)}>
            <Icono n="descarga" /> Acceso directo
          </button>
        </div>
      ))}
    </div>
  )
}

/** Tarjeta de Ajustes para conectar este equipo y ver el estado de la sincronización. */
export function TarjetaNube() {
  const cfg = nube.value
  const [url, setUrl] = useState('')
  const [clave, setClave] = useState('')
  const [trabajando, setTrabajando] = useState(false)

  const local = servidorLocal.value
  const oficina = enServidorOficina()
  const titulo = (cfg ? esLocal(cfg.url) : !!local || oficina) ? 'Servidor de la oficina' : 'Nube · Google Sheets'

  const conectar = async () => {
    setTrabajando(true)
    const destino = local ? local.url : url
    const claveUsada = local ? '' : clave
    let ok = await intentar(async () => {
      await conectarNube(destino, claveUsada)
      return true
    }, { silencioso: (e) => esCodigoOcupado(e.message) })
    if (!ok && esCodigoOcupado(errorNube.value || ultimoError)) {
      if (await confirmarReemplazo(errorNube.value || ultimoError)) {
        ok = await intentar(async () => {
          await conectarNube(destino, claveUsada, true)
          return true
        })
      }
    }
    setTrabajando(false)
    if (ok) {
      setClave('')
      errorNube.value = ''
      avisar(local ? '✓ Equipo conectado al servidor de la oficina.' : '✓ Equipo conectado a Google Sheets. Los datos se sincronizan solos.', { ms: 6000 })
    }
  }

  const desconectar = async () => {
    if (!(await confirmar('Desconectar', 'Este equipo dejará de sincronizarse. Los datos se quedan en el equipo y los cambios nuevos no llegarán a los demás.', 'Desconectar', true))) return
    await desconectarNube()
  }

  // PC abierta desde el servidor de la oficina, pero sin respuesta: nunca ofrecer Google (TI lo bloquea en las PCs)
  if (oficina && !local) {
    return (
      <section class="card stack">
        <h2>{titulo}</h2>
        <div class="aviso bad">
          <Icono n="alerta" />
          <span>
            El servidor de la oficina ({location.host}) no responde. Se vuelve a intentar solo cada 10 segundos. Si no se arregla, en la PC host abra <strong>INICIAR CONTROL EPP</strong> (o reiníciela).
          </span>
        </div>
        <button
          class="btn primary"
          style={{ justifySelf: 'start' }}
          disabled={trabajando}
          onClick={async () => {
            setTrabajando(true)
            await detectarServidorLocal()
            if (servidorLocal.value) await conectarLocalSiFalta()
            else avisar('El servidor sigue sin responder.', { tipo: 'bad' })
            setTrabajando(false)
          }}
        >
          {trabajando ? 'Probando…' : 'Reintentar ahora'}
        </button>
      </section>
    )
  }

  if (!cfg && local) {
    return (
      <section class="card stack">
        <h2>{titulo}</h2>
        <p class="muted small">Este equipo aún no está conectado al servidor de la oficina (PC {local.pc}).</p>
        {errorNube.value && (
          <div class="aviso bad small">
            <Icono n="alerta" />
            <span>{errorNube.value}</span>
          </div>
        )}
        <button class="btn primary" style={{ justifySelf: 'start' }} disabled={trabajando} onClick={conectar}>
          {trabajando ? progresoNube.value || 'Conectando…' : 'Conectar al servidor de la oficina'}
        </button>
        <AccesoOtrasPcs />
      </section>
    )
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
        <h2>{titulo}</h2>
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
        {esLocal(cfg.url) && local && (
          <>
            <dt>Servidor</dt>
            <dd>
              PC {local.pc} · {location.host}
            </dd>
          </>
        )}
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
      {esLocal(cfg.url) && <AccesoOtrasPcs />}
    </section>
  )
}

/** Panel del administrador: equipos registrados en el servidor (baja, reactivación). */
export function PanelEquipos() {
  const [lista, setLista] = useState<EquipoRegistrado[] | null>(null)
  const [error, setError] = useState('')
  const [trabajando, setTrabajando] = useState('')
  const cfg = nube.value
  const cargar = async () => {
    setError('')
    try {
      setLista(await equiposRegistrados())
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    if (cfg && esAdmin()) void cargar()
  }, [cfg?.url, cfg?.equipoId])
  if (!cfg || !esAdmin()) return null

  const cambiar = async (e: EquipoRegistrado, activo: boolean) => {
    const que = activo
      ? `El equipo ${e.codigo} («${e.nombre}») vuelve a quedar autorizado para sincronizar.`
      : `El equipo ${e.codigo} («${e.nombre}») dejará de sincronizar y su código quedará libre para otro equipo. Sus registros ya guardados NO se borran. Si ese equipo se vuelve a usar, deberá conectarse de nuevo.`
    if (!(await confirmar(activo ? 'Reactivar equipo' : 'Dar de baja equipo', que, activo ? 'Reactivar' : 'Dar de baja', !activo))) return
    setTrabajando(e.id)
    const ok = await intentar(async () => {
      await cambiarEquipoRegistrado(e.id, { activo })
      return true
    })
    setTrabajando('')
    if (ok) {
      avisar(activo ? `✓ ${e.codigo} reactivado` : `✓ ${e.codigo} dado de baja`)
      void cargar()
    }
  }

  // Códigos que aparecen en las entregas pero no están registrados aquí (p. ej. celulares que se juntan por archivo)
  const registrados = new Set((lista ?? []).map((e) => e.codigo))
  const otros = new Map<string, { n: number; ultima: string }>()
  for (const e of S.entregas.value) {
    if (!e.equipo || registrados.has(e.equipo)) continue
    const x = otros.get(e.equipo) ?? { n: 0, ultima: '' }
    x.n++
    if (e.fecha > x.ultima) x.ultima = e.fecha
    otros.set(e.equipo, x)
  }
  const ordenados = [...(lista ?? [])].sort((a, b) => Number(b.activo) - Number(a.activo) || a.codigo.localeCompare(b.codigo))

  return (
    <section class="card stack">
      <div class="spread">
        <h2>Equipos conectados</h2>
        <button class="btn sm" onClick={() => void cargar()}>
          <Icono n="repetir" /> Actualizar
        </button>
      </div>
      <p class="muted small">
        PCs y celulares registrados en {esLocal(cfg.url) ? 'el servidor de la oficina' : 'Google Sheets'}. Si un equipo dice que su código «ya lo usa otro equipo», dé de baja aquí el registro viejo o use «Reemplazar» al conectarlo.
      </p>
      {error && (
        <div class="aviso bad small">
          <Icono n="alerta" />
          <span>
            {error}
            {/Acción desconocida|accion/i.test(error) && ' El servidor necesita actualizarse para mostrar esta lista.'}
          </span>
        </div>
      )}
      {lista && (
        <div class="tabla-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>{esLocal(cfg.url) ? 'IP' : 'Alta'}</th>
                <th>Último contacto</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ordenados.map((e) => {
                const yo = e.id === cfg.equipoId
                return (
                  <tr key={e.id} style={{ opacity: e.activo ? 1 : 0.55 }}>
                    <td class="mono">
                      <strong>{e.codigo}</strong>
                    </td>
                    <td>
                      {e.nombre}
                      {yo && <span class="badge ok" style={{ marginLeft: '6px' }}>este equipo</span>}
                    </td>
                    <td class="small mono">{esLocal(cfg.url) ? e.ip || '—' : e.alta}</td>
                    <td class="small">{e.ultimo || '—'}</td>
                    <td>{e.activo ? <span class="badge ok">Activo</span> : <span class="badge">Baja{e.baja ? ` · ${e.baja}` : ''}</span>}</td>
                    <td>
                      {!yo &&
                        (e.activo ? (
                          <button class="btn sm ghost" disabled={trabajando === e.id} onClick={() => void cambiar(e, false)}>
                            Dar de baja
                          </button>
                        ) : (
                          <button class="btn sm" disabled={trabajando === e.id} onClick={() => void cambiar(e, true)}>
                            Reactivar
                          </button>
                        ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {otros.size > 0 && (
        <p class="muted small">
          Otros códigos que aparecen en las entregas (celulares que se juntan por archivo u otros servidores):{' '}
          {[...otros].map(([c, x]) => `${c} (${plural(x.n, 'entrega', 'entregas')}, última ${x.ultima})`).join(' · ')}.
        </p>
      )}
    </section>
  )
}

/** Alta de un equipo nuevo descargando todo de la nube (pantalla inicial). */
export function UnirseDesdeNube({ onAtras }: { onAtras: () => void }) {
  const local = servidorLocal.value
  const [url, setUrl] = useState(local?.url ?? '')
  const [clave, setClave] = useState('')
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState(local && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? `PC ${local.pc}` : '')
  const [trabajando, setTrabajando] = useState(false)
  const unir = async () => {
    if (!/^[A-Z0-9]{1,4}$/.test(codigo) || !nombre.trim()) return avisar('Complete el código y el nombre de este equipo.', { tipo: 'bad' })
    setTrabajando(true)
    let ok = await intentar(async () => {
      await unirseDesdeNube(url, clave, codigo, nombre)
      return true
    }, { silencioso: (e) => esCodigoOcupado(e.message) })
    if (!ok && esCodigoOcupado(ultimoError) && (await confirmarReemplazo(ultimoError))) {
      ok = await intentar(async () => {
        await unirseDesdeNube(url, clave, codigo, nombre, true)
        return true
      })
    }
    setTrabajando(false)
    if (ok) avisar('✓ Equipo listo. Entre con su usuario y PIN.')
  }
  return (
    <>
      <p class="muted">
        {local
          ? 'Descarga del servidor de la oficina el catálogo, el padrón, los usuarios y las existencias. Entre después con su usuario y PIN de siempre.'
          : 'Descarga de la nube el catálogo, el padrón, los usuarios y las existencias. Entre después con su usuario y PIN de siempre.'}
      </p>
      {!local && <CamposConexion url={url} clave={clave} onUrl={setUrl} onClave={setClave} />}
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
        <button class="btn primary grow" disabled={!url || (!local && !clave) || trabajando} onClick={unir}>
          {trabajando ? 'Descargando…' : 'Conectar y descargar'}
        </button>
      </div>
    </>
  )
}
