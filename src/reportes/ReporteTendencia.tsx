// Documento de Tendencias en hojas carta (vista previa, impresión y «Guardar como PDF»).
// Los bloques del documento se acomodan solos: cada título empieza hoja nueva y lo que no
// cabe pasa a la siguiente hoja.
import type { ComponentChildren } from 'preact'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { Plantilla } from './plantilla'
import type { ConfigTendencia } from '../state/tendencias'
import type { Bloque, Item } from './tendenciaDoc'


function Hoja({ p, c, children }: { p: Plantilla; c: ConfigTendencia; children: ComponentChildren }) {
  return (
    <section class="hoja-formato-impresion hoja-tendencia">
      <header class="tdz-enc">
        <img src={p.imagenes.logoEncabezado.dataUrl} alt="" />
        <div>
          {c.encabezado.filter(Boolean).map((l, i) => (
            <p key={i} class={i === 0 ? 'fuerte' : ''}>
              {l}
            </p>
          ))}
        </div>
      </header>
      <div class="tdz-cuerpo">{children}</div>
      <footer class="tdz-pie">
        <img src={p.imagenes.logoAnio.dataUrl} alt="" />
        <div>
          <p>{c.pie}</p>
          <i />
        </div>
      </footer>
    </section>
  )
}

function TablaBloque({ b }: { b: Bloque }) {
  return (
    <table class="tdz-tabla tdz-horiz">
      <thead>
        <tr>
          <th />
          {b.etiquetas.map((e, i) => (
            <th key={i}>{e}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {b.filas.map((f) => (
          <tr key={f.nombre}>
            <th>{f.nombre}</th>
            {f.valores.map((v, j) => (
              <td key={j} class={f.rojo?.[j] ? 'rojo' : ''}>
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Pares({ filas, destacar }: { filas: [string, string][]; destacar?: number }) {
  return (
    <table class="tdz-tabla tdz-pares">
      <tbody>
        {filas.map(([a, b], i) => (
          <tr key={a} class={i === destacar ? 'destacado' : ''}>
            <th>{a}</th>
            <td>{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Elemento({ it }: { it: Item }) {
  switch (it.t) {
    case 'titulo':
      return (
        <div class="tdz-titulo">
          <h1>{it.titulo}</h1>
          <p>{it.subtitulo}</p>
          <p class="fecha">{it.fecha}</p>
        </div>
      )
    case 'parrafo': {
      const clase = { normal: 'tdz-parrafo', conclusion: 'tdz-parrafo tdz-conclusion', chico: 'tdz-chico', nota: 'tdz-nota', fuente: 'tdz-fuente' }[it.estilo ?? 'normal']
      return <p class={clase}>{it.texto}</p>
    }
    case 'bloque':
      return <TablaBloque b={it.bloque} />
    case 'cajas':
      return (
        <div class={`tdz-cajas ${it.grupos.length === 2 ? 'tdz-cajas-2' : ''}`}>
          {it.grupos.map((g, i) => (
            <Pares key={i} filas={g.filas} destacar={g.destacar} />
          ))}
        </div>
      )
    case 'tabla':
      return (
        <table class="tdz-tabla tdz-escenarios">
          <thead>
            <tr>
              {it.encabezado.map((e) => (
                <th key={e}>{e}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {it.filas.map((f, i) => (
              <tr key={i} class={it.destacar?.includes(i) ? 'destacado' : ''}>
                {f.map((v, j) => (
                  <td key={j}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'imagen':
      // La proporción va fija para que la hoja se pueda medir aunque la imagen no haya cargado
      return <img class="tdz-grafica" src={it.img.src} alt="" style={{ aspectRatio: `${1 / it.img.ratio}`, ...(it.ancho ? { width: `${it.ancho * 100}%`, alignSelf: 'center' } : {}) }} />
  }
}

/**
 * Reparte los bloques en hojas con las medidas reales (en px) de cada bloque y del cuerpo de la
 * hoja. Cada título empieza hoja; lo que no cabe pasa a la siguiente; una imagen más alta que
 * la hoja se reduce para que quepa sola.
 */
export function paginar(items: Item[], altos: number[], util: number, espacio: number): Item[][] {
  const hojas: Item[][] = []
  let actual: Item[] = []
  let usado = 0
  const nueva = () => {
    if (actual.length) hojas.push(actual)
    actual = []
    usado = 0
  }
  items.forEach((it, i) => {
    let h = altos[i] ?? 0
    let item = it
    if (it.t === 'imagen' && h > util) {
      item = { ...it, ancho: ((it.ancho ?? 1) * (util - 4)) / h }
      h = util - 4
    }
    const sig = items[i + 1]
    // Un título o un párrafo que presenta una tabla no se quedan solos al final de la hoja
    const amarre = (it.t === 'titulo' || (it.t === 'parrafo' && sig?.t === 'bloque')) && sig ? (altos[i + 1] ?? 0) + espacio : 0
    if (it.t === 'titulo') nueva()
    else if (actual.length && usado + h + Math.min(amarre, util / 3) > util) nueva()
    actual.push(item)
    usado += h + espacio
  })
  nueva()
  return hojas
}

/** Documento completo: primero mide los bloques en una hoja oculta y luego arma las hojas. */
export function DocumentoTendencia({ p, c, items }: { p: Plantilla; c: ConfigTendencia; items: Item[] }) {
  const medida = useRef<HTMLDivElement>(null)
  const [hojas, setHojas] = useState<Item[][] | null>(null)
  useLayoutEffect(() => {
    const raiz = medida.current
    if (!raiz) return
    const cuerpo = raiz.querySelector('.tdz-cuerpo') as HTMLElement
    const util = cuerpo.clientHeight
    const espacio = parseFloat(getComputedStyle(cuerpo).rowGap || '0') || 8
    const altos = [...cuerpo.children].map((el) => (el as HTMLElement).getBoundingClientRect().height)
    setHojas(paginar(items, altos, util, espacio))
  }, [items])
  if (!hojas)
    return (
      <div ref={medida} class="tdz-medida" aria-hidden="true">
        <Hoja p={p} c={c}>
          {items.map((it, j) => (
            <Elemento key={j} it={it} />
          ))}
        </Hoja>
      </div>
    )
  return (
    <>
      {hojas.map((hoja, i) => (
        <Hoja key={i} p={p} c={c}>
          {hoja.map((it, j) => (
            <Elemento key={j} it={it} />
          ))}
        </Hoja>
      ))}
    </>
  )
}
