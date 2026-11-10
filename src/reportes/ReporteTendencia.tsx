// Documento de Tendencias en hojas carta (vista previa, impresión y «Guardar como PDF»).
import type { ComponentChildren } from 'preact'
import type { Plantilla } from './plantilla'
import type { ConfigTendencia } from '../state/tendencias'
import type { Bloque, ContenidoMaterial } from './tendenciaDoc'
import type { ImagenesMaterial } from './imagenesTendencia'

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

function TablaBloques({ bloques }: { bloques: Bloque[] }) {
  return (
    <div class="tdz-bloques">
      {bloques.map((b, i) => (
        <table key={i} class="tdz-tabla tdz-horiz">
          <thead>
            <tr>
              <th />
              {b.etiquetas.map((e) => (
                <th key={e}>{e}</th>
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
      ))}
    </div>
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

function Titulo({ titulo, subtitulo, fecha }: { titulo: string; subtitulo: string; fecha: string }) {
  return (
    <div class="tdz-titulo">
      <h1>{titulo}</h1>
      <p>{subtitulo}</p>
      <p class="fecha">{fecha}</p>
    </div>
  )
}

export function hojasMaterial(p: Plantilla, c: ConfigTendencia, t: ContenidoMaterial, img: ImagenesMaterial, fecha: string, nota: string, clave = '') {
  return [
    <Hoja key={`${clave}a`} p={p} c={c}>
      <Titulo titulo={t.titulo} subtitulo={t.subtitulo} fecha={fecha} />
      <p class="tdz-parrafo">{t.intro}</p>
      <TablaBloques bloques={t.historico} />
      <div class="tdz-cajas">
        <Pares filas={t.resumen} destacar={0} />
        <Pares filas={t.existencias} destacar={2} />
        <Pares filas={t.indicadores} destacar={0} />
      </div>
      <table class="tdz-tabla tdz-escenarios">
        <thead>
          <tr>
            {t.escenarios.encabezado.map((e) => (
              <th key={e}>{e}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.escenarios.filas.map((f, i) => (
            <tr key={i} class={i === 1 ? 'destacado' : ''}>
              {f.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p class="tdz-parrafo tdz-conclusion">{t.conclusion}</p>
      <p class="tdz-parrafo tdz-chico">{t.tendencia}</p>
      <img class="tdz-grafica" src={img.historico} alt="" />
    </Hoja>,
    <Hoja key={`${clave}b`} p={p} c={c}>
      <img class="tdz-grafica" src={img.proyeccion} alt="" />
      <TablaBloques bloques={t.proyeccion} />
      {t.proyeccionRecortada && <p class="tdz-chico">La tabla muestra el primer año; la gráfica y el cálculo consideran todo el periodo.</p>}
      <p class="tdz-nota">{nota}</p>
      {t.tallas.length > 0 && (
        <div class="tdz-tallas">
          <table class="tdz-tabla">
            <thead>
              <tr>
                <th>Talla</th>
                <th>Entregados</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {t.tallas.map((f) => (
                <tr key={f[0]}>
                  {f.map((v, j) => (
                    <td key={j}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {img.tallas && <img src={img.tallas} alt="" />}
        </div>
      )}
      <p class="tdz-fuente">{t.fuente}</p>
    </Hoja>,
  ]
}

export function hojaComparativa(
  p: Plantilla,
  c: ConfigTendencia,
  d: { titulo: string; fecha: string; intro: string; imagen: string; tabla: { encabezado: string[]; filas: string[][] }; nota: string },
) {
  return (
    <Hoja key="comp" p={p} c={c}>
      <Titulo titulo={d.titulo} subtitulo="Cálculo de tendencia conservadora de consumo de equipo de protección personal – comparativa" fecha={d.fecha} />
      <p class="tdz-parrafo">{d.intro}</p>
      <img class="tdz-grafica" src={d.imagen} alt="" />
      <table class="tdz-tabla tdz-escenarios">
        <thead>
          <tr>
            {d.tabla.encabezado.map((e) => (
              <th key={e}>{e}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.tabla.filas.map((f, i) => (
            <tr key={i}>
              {f.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p class="tdz-nota">{d.nota}</p>
    </Hoja>
  )
}
