import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { DatosReporte } from './datos'
import { pct, titulo } from './datos'
import type { Plantilla } from './plantilla'

// Versión para imprimir o guardar como PDF: mismas láminas que la presentación,
// en páginas horizontales de 13.33 × 7.5 pulgadas.

const miles = (n: number) => n.toLocaleString('es-MX')
const COLORES = ['#235B4E', '#BC955C', '#691C32', '#6F7271', '#3F8B78', '#9D7B45', '#A34A62', '#98989A']

function Pagina({ p, portada, tituloPag, d, children }: { p: Plantilla; portada?: boolean; tituloPag?: string; d: DatosReporte; children: ComponentChildren }) {
  const fondo = portada ? p.imagenes.fondoPortada.dataUrl : p.imagenes.fondoContenido.dataUrl
  return (
    <section class={`rp-pagina ${portada ? 'rp-portada' : ''}`} style={{ backgroundImage: `url(${fondo})` }}>
      <img class="rp-logo-enc" src={p.imagenes.logoEncabezado.dataUrl} alt="" />
      <img class="rp-logo-anio" src={p.imagenes.logoAnio.dataUrl} alt="" />
      <img class="rp-logo-pie" src={p.imagenes.logoPie.dataUrl} alt="" />
      {tituloPag && (
        <header class="rp-titulo">
          <h2>{tituloPag}</h2>
          <p>{d.titulo}</p>
        </header>
      )}
      {children}
    </section>
  )
}

function Barras({ datos, color = '#235B4E' }: { datos: [string, number][]; color?: string }) {
  const max = Math.max(1, ...datos.map(([, n]) => n))
  return (
    <div class="rp-barras">
      {datos.map(([et, n]) => (
        <div class="rp-barra" key={et}>
          <span class="rp-et">{et}</span>
          <span class="rp-pista">
            <span style={{ width: `${(n / max) * 100}%`, background: color }} />
          </span>
          <b>{miles(n)}</b>
        </div>
      ))}
    </div>
  )
}

function Dona({ datos }: { datos: [string, number][] }) {
  const total = datos.reduce((s, [, n]) => s + n, 0) || 1
  let acumulado = 0
  const partes = datos.map(([, n], i) => {
    const ini = (acumulado / total) * 360
    acumulado += n
    return `${COLORES[i % COLORES.length]} ${ini}deg ${(acumulado / total) * 360}deg`
  })
  return (
    <div class="rp-dona-wrap">
      <div class="rp-dona" style={{ background: `conic-gradient(${partes.join(',')})` }} />
      <ul class="rp-leyenda">
        {datos.map(([et, n], i) => (
          <li key={et}>
            <i style={{ background: COLORES[i % COLORES.length] }} /> {et} <b>{pct(n, total)}%</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ReporteImprimible({ d, p, onCerrar }: { d: DatosReporte; p: Plantilla; onCerrar: () => void }) {
  // En pantalla las páginas se reducen para caber en la ventana; al imprimir salen a tamaño real
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    const ajustar = () => setZoom(Math.min(1, (window.innerWidth - 32) / 1280))
    ajustar()
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [])

  useEffect(() => {
    document.body.classList.add('imprimiendo-reporte')
    const t = document.title
    document.title = `Entrega de EPP · ${d.titulo}`
    return () => {
      document.body.classList.remove('imprimiendo-reporte')
      document.title = t
    }
  }, [])

  const casco = d.materiales.find((m) => m.id === 'casco')
  const carnaza = d.materiales.find((m) => m.id === 'g_carnaza')
  const otros = d.materiales.filter((m) => m.id !== 'casco' && m.id !== 'g_carnaza').slice(0, 12)
  const conCasco = d.porArea.filter((a) => a.cascos).sort((a, b) => b.cascos - a.cascos)
  const dona: [string, number][] = [...conCasco.slice(0, 6).map((a) => [titulo(a.area), a.cascos] as [string, number])]
  const restoCascos = conCasco.slice(6).reduce((s, a) => s + a.cascos, 0)
  if (restoCascos) dona.push(['Otras áreas', restoCascos])
  const matsTabla = d.materiales.slice(0, 8)

  return (
    <div class="reporte-imprimible" style={{ '--zoom': zoom } as unknown as Record<string, string>}>
      <div class="rp-barra-herr no-imprimir">
        <strong>Vista previa del reporte · {d.titulo}</strong>
        <span class="muted small">En el diálogo elija «Guardar como PDF», orientación horizontal y active «Gráficos de fondo».</span>
        <button class="btn primary" onClick={() => window.print()}>
          Guardar como PDF / Imprimir
        </button>
        <button class="btn" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      <Pagina p={p} portada d={d}>
        <div class="rp-portada-texto">
          <h1>ENTREGA DE EQUIPO DE PROTECCIÓN PERSONAL</h1>
          <hr />
          <p class="rp-periodo">{d.titulo.toUpperCase()}</p>
          <div class="rp-kpis">
            <div>
              <b style={{ color: '#235B4E' }}>{miles(d.personas)}</b>personas atendidas
            </div>
            <div>
              <b>{miles(d.areas)}</b>
              {d.areas === 1 ? 'área' : 'áreas'}
            </div>
            <div>
              <b>{miles(d.piezas)}</b>piezas de EPP entregadas
            </div>
          </div>
        </div>
        <p class="rp-pie-texto">
          {p.textos.oficina} · {p.textos.institucion}
        </p>
      </Pagina>

      <Pagina p={p} d={d} tituloPag="Resumen general">
        <div class="rp-resumen">
          <div class="rp-col">
            <div class="rp-tarjeta">
              <b style={{ color: '#235B4E' }}>{miles(d.personas)}</b>Personal atendido
            </div>
            <div class="rp-tarjeta">
              <b style={{ color: '#691C32' }}>{miles(casco?.piezas ?? 0)}</b>Cascos entregados
            </div>
            <div class="rp-tarjeta">
              <b>{miles(carnaza?.piezas ?? 0)}</b>Guantes de carnaza
            </div>
            <div class="rp-tarjeta rp-rosa">
              <b style={{ color: '#691C32', fontSize: '26pt' }}>{pct(d.personasConCasco, d.personas)}%</b>
              del personal atendido solicitó casco; el resto ya contaba con uno de algún contrato anterior.
            </div>
          </div>
          <div class="rp-mosaico">
            {otros.map((m, i) => (
              <div class="rp-tarjeta" key={m.id}>
                <b style={{ color: COLORES[i % 3], fontSize: '24pt' }}>{miles(m.piezas)}</b>
                {m.nombre}
              </div>
            ))}
          </div>
        </div>
      </Pagina>

      {d.materiales.length > 0 && (
        <Pagina p={p} d={d} tituloPag="Material entregado">
          <div class="rp-dos">
            <Barras datos={d.materiales.slice(0, 12).map((m) => [m.nombre, m.piezas])} />
            <div class="rp-col">
              <h3>Tallas más solicitadas</h3>
              {d.materiales
                .filter((m) => m.tallas.length)
                .slice(0, 4)
                .map((m) => (
                  <div class="rp-tarjeta rp-chica" key={m.id}>
                    <strong>{m.nombre}</strong>
                    {[...m.tallas]
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5)
                      .map(([t, n]) => `${t}: ${n}`)
                      .join('  ·  ')}
                  </div>
                ))}
            </div>
          </div>
        </Pagina>
      )}

      {d.porArea.length > 0 && (
        <Pagina p={p} d={d} tituloPag="Personal atendido por área">
          <div class="rp-dos">
            <Barras datos={d.porArea.slice(0, 14).map((a) => [titulo(a.area), a.personas])} color="#BC955C" />
            <div class="rp-col">
              <div class="rp-tarjeta">
                <b style={{ color: '#235B4E' }}>{pct(d.porArea[0].personas, d.personas)}%</b>del personal atendido fue de {titulo(d.porArea[0].area)}
              </div>
              <div class="rp-tarjeta">
                <b>{miles(d.areas)}</b>áreas atendidas
              </div>
            </div>
          </div>
        </Pagina>
      )}

      {d.cascos > 0 && (
        <Pagina p={p} d={d} tituloPag="Entrega de cascos">
          <div class="rp-dos">
            <Dona datos={dona} />
            <div class="rp-col">
              <div class="rp-tarjeta">
                <span style={{ fontSize: '15pt' }}>
                  <strong style={{ color: '#235B4E' }}>{titulo(conCasco[0].area)}</strong> concentra el {pct(conCasco[0].cascos, d.cascos)}% de los cascos entregados.
                </span>
              </div>
              <div class="rp-fila">
                <div class="rp-tarjeta">
                  <b style={{ color: '#691C32' }}>{miles(d.cascos)}</b>cascos de {miles(d.personas)} personas
                </div>
                <div class="rp-tarjeta">
                  <b>{miles(d.areasSinCasco.length)}</b>áreas sin solicitud de casco
                </div>
              </div>
              {d.motivosCasco.length > 0 && (
                <div>
                  <h3>Motivos de entrega</h3>
                  <ul class="rp-lista">
                    {d.motivosCasco.slice(0, 4).map(([m, n]) => (
                      <li key={m}>
                        {m}: {n} ({pct(n, d.cascos)}%)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {d.areasSinCasco.length > 0 && (
                <p class="rp-nota">
                  <strong>Áreas sin solicitar casco:</strong> {d.areasSinCasco.slice(0, 8).map(titulo).join(', ')}
                  {d.areasSinCasco.length > 8 ? '…' : ''}
                </p>
              )}
            </div>
          </div>
        </Pagina>
      )}

      {d.porArea.length > 0 && (
        <Pagina p={p} d={d} tituloPag="Material entregado por área">
          <table class="rp-tabla">
            <thead>
              <tr>
                <th>Área</th>
                {matsTabla.map((m) => (
                  <th key={m.id}>{m.nombre}</th>
                ))}
                <th class="rp-guinda">Personas</th>
              </tr>
            </thead>
            <tbody>
              {d.porArea.slice(0, 12).map((a) => (
                <tr key={a.area}>
                  <td>{titulo(a.area)}</td>
                  {matsTabla.map((m) => (
                    <td key={m.id} class={a.porMaterial[m.id] ? '' : 'rp-cero'}>
                      {a.porMaterial[m.id] ?? '–'}
                    </td>
                  ))}
                  <td class="rp-total">{a.personas}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.porArea.length > 12 && <p class="rp-nota">Se muestran las 12 áreas con más personal atendido de {d.porArea.length}. El detalle completo está en el Excel.</p>}
        </Pagina>
      )}

      {d.porDia.length > 1 && (
        <Pagina p={p} d={d} tituloPag="Evolución por día">
          <div class="rp-columnas">
            {(() => {
              const max = Math.max(1, ...d.porDia.map((x) => x.piezas))
              return d.porDia.map((x) => (
                <div class="rp-dia" key={x.fecha}>
                  <div class="rp-pareja">
                    <span style={{ height: `${(x.personas / max) * 100}%`, background: '#235B4E' }}>
                      <em>{x.personas}</em>
                    </span>
                    <span style={{ height: `${(x.piezas / max) * 100}%`, background: '#BC955C' }}>
                      <em>{x.piezas}</em>
                    </span>
                  </div>
                  <small>{new Date(x.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}</small>
                </div>
              ))
            })()}
          </div>
          <p class="rp-nota">
            <i class="rp-cuadro" style={{ background: '#235B4E' }} /> Personas atendidas <i class="rp-cuadro" style={{ background: '#BC955C' }} /> Piezas entregadas
          </p>
        </Pagina>
      )}

      <Pagina p={p} d={d} tituloPag="Hallazgos y alertas">
        <div class="rp-dos rp-hallazgos">
          <ol>
            {d.hallazgos.slice(0, 7).map((h) => (
              <li key={h}>{h}</li>
            ))}
            {!d.hallazgos.length && <li>Sin entregas registradas en el periodo.</li>}
          </ol>
          <div class="rp-col">
            <div class="rp-tarjeta rp-chica">
              <strong style={{ color: '#691C32' }}>Por reabastecer ({d.reabastecer.length})</strong>
              {d.reabastecer.slice(0, 6).map((r) => (
                <span key={r.nombre}>
                  {r.nombre}: {r.existencia} (mín. {r.minimo})
                </span>
              ))}
              {!d.reabastecer.length && <span>Sin pendientes</span>}
            </div>
            <div class="rp-tarjeta rp-chica">
              <strong style={{ color: '#691C32' }}>Préstamos vencidos ({d.prestamosVencidos.length})</strong>
              {d.prestamosVencidos.slice(0, 5).map((r) => (
                <span key={r.id}>
                  {r.nombre} · desde {r.fechaEntrega}
                </span>
              ))}
              {!d.prestamosVencidos.length && <span>Sin pendientes</span>}
            </div>
            <div class="rp-tarjeta rp-chica">
              <strong style={{ color: '#235B4E' }}>Equipo en resguardo</strong>
              {d.resguardosActivos.map((r) => (
                <span key={r.nombre}>
                  {r.nombre}: {r.cantidad}
                </span>
              ))}
              {!d.resguardosActivos.length && <span>Sin pendientes</span>}
            </div>
          </div>
        </div>
      </Pagina>
    </div>
  )
}
