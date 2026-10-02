import { useEffect, useState } from 'preact/hooks'
import { entregarArchivo, hace } from '../lib/util'
import { describirNuevos, generarIntercambio, leerUltimoIntercambio, recibirIntercambio, type ResultadoIntercambio, type UltimoIntercambio } from '../state/intercambio'
import { esLocal, nube } from '../state/nube'
import * as S from '../state/store'
import { avisar, intentar } from './comunes'
import { Icono } from './iconos'

/**
 * Ajustes → Intercambio con celulares / PCs. Une por archivo la información de los
 * celulares (Google) y la de las PCs de la carpeta de red, que no se pueden ver entre sí.
 */
export function Intercambio() {
  const [ultimo, setUltimo] = useState<UltimoIntercambio | null>(null)
  const [resultado, setResultado] = useState<ResultadoIntercambio | null>(null)
  const [trabajando, setTrabajando] = useState('')
  const enRed = esLocal(nube.value?.url)
  const otroLado = enRed ? 'un celular' : 'la PC de la oficina'

  useEffect(() => {
    void leerUltimoIntercambio().then(setUltimo)
  }, [resultado, trabajando])

  const recibir = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]
    ;(e.target as HTMLInputElement).value = ''
    if (!f) return
    setTrabajando('Combinando…')
    const r = await intentar(async () => recibirIntercambio(await f.text()))
    setTrabajando('')
    if (r) {
      setResultado(r)
      avisar(`✓ Información de ${r.origen} combinada`)
    }
  }

  const enviar = async () => {
    setTrabajando('Preparando archivo…')
    await intentar(async () => {
      const { nombre, blob } = await generarIntercambio()
      await entregarArchivo(nombre, blob)
    })
    setTrabajando('')
  }

  const viejo = !ultimo || Date.now() - new Date(ultimo.fecha).getTime() > 24 * 3600 * 1000
  const nuevos = resultado ? describirNuevos(resultado.nuevos) : []
  return (
    <section class="card stack">
      <h2>Intercambio con {enRed ? 'celulares' : 'las PCs de la oficina'}</h2>
      <p class="muted small">
        Las PCs de la carpeta de red y los celulares (Google) no se ven entre sí. Para juntar la información, pase un archivo de un lado al otro: se combina con las mismas reglas
        de la sincronización (gana lo más reciente y no se duplica nada) y luego se sube solo a {enRed ? 'la carpeta de red' : 'Google'}. Hágalo al menos una vez al día.
      </p>
      <div class={`aviso ${viejo ? 'warn' : 'info'} small`}>
        <Icono n={viejo ? 'alerta' : 'info'} />
        <span>
          Último intercambio:{' '}
          {ultimo ? `${ultimo.tipo === 'recibido' ? `recibido de ${ultimo.otro}` : 'archivo enviado'} ${hace(ultimo.fecha)} (${new Date(ultimo.fecha).toLocaleString()})` : 'nunca'}
        </span>
      </div>
      <ol class="pasos small">
        <li>
          En {otroLado}: Ajustes → Intercambio → <strong>Enviar archivo</strong>, y pase el archivo a este equipo (cable, correo o Teams).
        </li>
        <li>
          Aquí: <strong>Recibir archivo</strong> y elíjalo.
        </li>
        <li>
          Aquí: <strong>Enviar archivo</strong> y cárguelo en {otroLado} con <strong>Recibir archivo</strong>. Así los dos lados quedan iguales.
        </li>
      </ol>
      <div class="row">
        <label class={`btn ${trabajando ? 'disabled' : ''}`} style={{ cursor: 'pointer' }}>
          <Icono n="subir" /> Recibir archivo
          <input type="file" accept=".json,application/json" hidden disabled={!!trabajando} onChange={recibir} />
        </label>
        <button class="btn primary" disabled={!!trabajando} onClick={enviar}>
          <Icono n="descarga" /> Enviar archivo
        </button>
        {trabajando && <span class="muted small">{trabajando}</span>}
      </div>
      {resultado && (
        <div class="aviso ok small" style={{ display: 'block' }}>
          <strong>Recibido de {resultado.origen}:</strong> {nuevos.length ? nuevos.join(', ') : 'nada nuevo'}
          {resultado.actualizados > 0 && ` · ${resultado.actualizados} registros actualizados`}.
          <br />
          {S.sesion.value && 'Se subirá solo en unos segundos. '}
          Ahora use <strong>Enviar archivo</strong> para devolverle a {otroLado} lo de este lado.
        </div>
      )}
      {resultado && resultado.foliosRepetidos.length > 0 && (
        <div class="aviso bad small">
          <Icono n="alerta" />
          <span>
            Dos equipos están usando el mismo código: los folios {resultado.foliosRepetidos.slice(0, 5).join(', ')}
            {resultado.foliosRepetidos.length > 5 && '…'} existen en ambos lados con registros distintos. Cambie el código de uno de los equipos en Ajustes → Este equipo (por ejemplo, celulares C1, C2… y PCs P1, P2…). Los registros
            no se pierden, pero los folios quedan repetidos.
          </span>
        </div>
      )}
    </section>
  )
}
