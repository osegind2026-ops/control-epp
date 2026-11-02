import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { DatosReporte } from './datos'
import { pct, titulo, fechasCortas, otrosTexto, periodoPortada, desgloseOtrasAreas, textoVariacion, variacion } from './datos'
import { mezcla, svgPastel, varsBarra, type EstiloBarras, type EstiloPastel } from './estilos'
import type { Plantilla } from './plantilla'

// Versión para imprimir o guardar como PDF: mismas láminas que la presentación,
// en páginas horizontales de 13.33 × 7.5 pulgadas.

const miles = (n: number) => n.toLocaleString('es-MX')
const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`
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
          <p>{d.filtroTexto ? `${d.titulo} · ${d.filtroTexto}` : d.titulo}</p>
        </header>
      )}
      {children}
    </section>
  )
}

function Barras({ datos, color = '#235B4E', estilo = 'plana' }: { datos: [string, number][]; color?: string; estilo?: EstiloBarras }) {
  const max = Math.max(1, ...datos.map(([, n]) => n))
  return (
    <div class={`rp-barras est-${estilo}`}>
      {datos.map(([et, n]) => (
        <div class="rp-barra" key={et}>
          <span class="rp-et">{et}</span>
          <span class="rp-pista">
            <span style={estilo === 'plana' ? { width: `${(n / max) * 100}%`, background: color } : { width: `${(n / max) * 100}%`, ...varsBarra(color) }} />
          </span>
          <b>{miles(n)}</b>
        </div>
      ))}
    </div>
  )
}

function Dona({ datos, estilo = 'dona' }: { datos: [string, number][]; estilo?: EstiloPastel }) {
  const total = datos.reduce((s, [, n]) => s + n, 0) || 1
  if (estilo !== 'dona') {
    return (
      <div class="rp-dona-wrap">
        <div class="rp-pastel" dangerouslySetInnerHTML={{ __html: svgPastel({ valores: datos.map(([, n]) => n), colores: COLORES, ancho: 360, alto: 360, est: estilo }) }} />
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

/** Clase de color de una variación: subir consumo = guinda, bajar = verde. */
const claseVar = (actual: number, anterior: number, neutro = false) => {
  const v = variacion(actual, anterior)
  return neutro || v === null || v === 0 ? 'rp-var' : v > 0 ? 'rp-var rp-sube' : 'rp-var rp-baja'
}

/** Gráfica de líneas (tendencia) en SVG. */
function Lineas({ etiquetas, series }: { etiquetas: string[]; series: { nombre: string; color: string; valores: number[] }[] }) {
  const W = 760
  const H = 430
  const izq = 44
  const der = 16
  const arriba = 40
  const abajo = 34
  const max = Math.max(1, ...series.flatMap((x) => x.valores)) * 1.12
  const x = (i: number) => izq + (i * (W - izq - der)) / Math.max(1, etiquetas.length - 1)
  const y = (v: number) => arriba + (H - arriba - abajo) * (1 - v / max)
  const lineasGuia = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f))
  return (
    <svg class="rp-lineas" viewBox={`0 0 ${W} ${H}`}>
      {lineasGuia.map((v) => (
        <g key={v}>
          <line x1={izq} x2={W - der} y1={y(v)} y2={y(v)} stroke="#E4E0D8" stroke-width="1" />
          <text x={izq - 6} y={y(v) + 4} text-anchor="end" font-size="10" fill="#6F7271">
            {miles(v)}
          </text>
        </g>
      ))}
      {etiquetas.map((e, i) => (
        <text key={e + i} x={x(i)} y={H - 12} text-anchor="middle" font-size="11" fill="#2B2B2B">
          {e}
        </text>
      ))}
      {series.map((sr, k) => (
        <g key={sr.nombre}>
          <polyline points={sr.valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={sr.color} stroke-width="3" />
          {sr.valores.map((v, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(v)} r="4.5" fill={sr.color} />
              <text x={x(i)} y={y(v) - 9} text-anchor="middle" font-size="10" fill="#2B2B2B">
                {miles(v)}
              </text>
            </g>
          ))}
          <rect x={izq + k * 190} y="8" width="12" height="12" fill={sr.color} />
          <text x={izq + k * 190 + 18} y="18" font-size="12" fill="#2B2B2B">
            {sr.nombre}
          </text>
        </g>
      ))}
    </svg>
  )
}

const NIVEL = { alta: ['ALERTA', 'rp-alta'], media: ['ATENCIÓN', 'rp-media'], ok: ['BIEN', 'rp-ok'] } as const

export function ReporteImprimible({
  d,
  p,
  onCerrar,
  detalleRecurrentes,
  estiloBarras = 'plana',
  estiloPastel = 'dona',
}: {
  d: DatosReporte
  p: Plantilla
  onCerrar: () => void
  detalleRecurrentes?: boolean
  estiloBarras?: EstiloBarras
  estiloPastel?: EstiloPastel
}) {
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
    const estilo = document.createElement('style')
    estilo.id = 'estilo-reporte-16-9'
    estilo.textContent = '@page { size: 13.333in 7.5in; margin: 0; }'
    document.head.appendChild(estilo)

    const t = document.title
    document.title = `Entrega de EPP · ${d.titulo}`
    return () => {
      document.body.classList.remove('imprimiendo-reporte')
      estilo.remove()
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
  const otrasAreas = desgloseOtrasAreas(conCasco.slice(6), d.cascos)
  const matsTabla = d.materiales.slice(0, 8)
  const maximos = matsTabla.map((m) => Math.max(1, ...d.porArea.slice(0, 12).map((a) => a.porMaterial[m.id] ?? 0)))
  const personasRec = new Set(d.recurrentes.map((r) => r.rpe)).size
  const topPctRec = [...d.recurrenciaPorArea].filter((a) => a.personasArea >= 3).sort((a, b) => b.pct - a.pct)[0]

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
          <h1>
            INFORME DE ENTREGA DE EQUIPO DE
            <br />
            PROTECCIÓN PERSONAL
          </h1>
          <hr />
          <p class="rp-periodo">{periodoPortada(d.desde, d.hasta)}</p>
          {d.filtroTexto && <p class="rp-filtro">{d.filtroTexto.toUpperCase()}</p>}
          <div class="rp-kpis">
            <div>
              <b style={{ color: '#235B4E' }}>{miles(d.personas)}</b>personas atendidas
            </div>
            <div>
              <b>{miles(d.areas)}</b>
              {d.areas === 1 ? 'área' : 'áreas'}
            </div>
            <div>
              <b style={{ color: '#235B4E' }}>{miles(d.entregas.length)}</b>
              {d.entregas.length === 1 ? 'entrega realizada' : 'entregas realizadas'}
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
            <div class="rp-tarjeta rp-con-var">
              <b style={{ color: '#235B4E' }}>{miles(d.personas)}</b>Personal atendido
              <span class={claseVar(d.personas, d.anterior.personas, true)}>
                {textoVariacion(d.personas, d.anterior.personas)}
                <small>vs. anterior</small>
              </span>
            </div>
            <div class="rp-tarjeta rp-con-var">
              <b style={{ color: '#691C32' }}>{miles(casco?.piezas ?? 0)}</b>Cascos entregados
              <span class={claseVar(casco?.piezas ?? 0, d.anterior.cascos)}>
                {textoVariacion(casco?.piezas ?? 0, d.anterior.cascos)}
                <small>vs. anterior</small>
              </span>
            </div>
            <div class="rp-tarjeta rp-con-var">
              <b>{miles(carnaza?.piezas ?? 0)}</b>Guantes de carnaza
              <span class={claseVar(carnaza?.piezas ?? 0, d.anterior.porMaterial.get('g_carnaza') ?? 0)}>
                {textoVariacion(carnaza?.piezas ?? 0, d.anterior.porMaterial.get('g_carnaza') ?? 0)}
                <small>vs. anterior</small>
              </span>
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

      {d.tendencia.puntos.some((x) => x.piezas) && (
        <Pagina p={p} d={d} tituloPag="Tendencia y comparativo">
          <div class="rp-dos rp-tendencia">
            <div class="rp-col">
              <h3>Últim{d.tendencia.unidad === 'semana' ? 'as 12 semanas' : 'os 12 meses'}</h3>
              <Lineas
                etiquetas={d.tendencia.puntos.map((x) => x.etiqueta)}
                series={[
                  { nombre: 'Piezas entregadas', color: '#BC955C', valores: d.tendencia.puntos.map((x) => x.piezas) },
                  { nombre: 'Personas atendidas', color: '#235B4E', valores: d.tendencia.puntos.map((x) => x.personas) },
                ]}
              />
            </div>
            <div class="rp-col">
              <h3>Contra el periodo anterior</h3>
              <p class="rp-nota" style={{ marginTop: '-4pt' }}>{d.anterior.titulo}</p>
              <table class="rp-tabla rp-flujo">
                <thead>
                  <tr>
                    <th>Indicador</th>
                    <th>Actual</th>
                    <th>Anterior</th>
                    <th>Cambio</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['Personas atendidas', d.personas, d.anterior.personas],
                      ['Entregas', d.entregas.length, d.anterior.entregas],
                      ['Piezas entregadas', d.piezas, d.anterior.piezas],
                      ['Cascos', d.cascos, d.anterior.cascos],
                      ['Casos recurrentes', d.recurrentes.length, d.anterior.recurrentes],
                      ['EPP contaminado', d.contaminado.eventos, d.anterior.contaminado],
                    ] as [string, number, number][]
                  ).map(([n, actual, antes], i) => (
                    <tr key={n}>
                      <td>{n}</td>
                      <td>
                        <b>{miles(actual)}</b>
                      </td>
                      <td class="rp-cero">{miles(antes)}</td>
                      <td class={claseVar(actual, antes, i === 0)}>{textoVariacion(actual, antes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p class="rp-nota">▲ en guinda: subió el consumo. ▼ en verde: bajó.</p>
            </div>
          </div>
        </Pagina>
      )}

      {d.materiales.length > 0 && (
        <Pagina p={p} d={d} tituloPag="Material entregado">
          <div class="rp-dos">
            <Barras datos={d.materiales.slice(0, 12).map((m) => [m.nombre, m.piezas])} estilo={estiloBarras} />
            <div class="rp-col">
              <div class="rp-tarjeta rp-verde-claro">
                <span>
                  <b style={{ fontSize: '20pt', color: '#235B4E' }}>
                    {d.pareto.materiales} de {d.pareto.total}
                  </b>{' '}
                  materiales concentran el 80% de las piezas entregadas.
                </span>
              </div>
              <h3>Tallas más solicitadas</h3>
              {d.materiales
                .filter((m) => m.tallas.length)
                .slice(0, 3)
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

      {(d.porCategoria.length > 1 || d.porTipo.length > 1) && (
        <Pagina p={p} d={d} tituloPag="Tipo de equipo entregado">
          <div class="rp-dos rp-tipo">
            <Dona datos={d.porCategoria.slice(0, 8).map((c) => [c.nombre, c.piezas])} estilo={estiloPastel} />
            <div class="rp-col">
              <div class="rp-tarjeta">
                <span style={{ fontSize: '15pt' }}>
                  <strong style={{ color: '#235B4E' }}>{d.porCategoria[0].nombre}</strong> es la protección más solicitada: {pct(d.porCategoria[0].piezas, d.piezas)}% de las piezas.
                </span>
              </div>
              <div class="rp-fila rp-tres">
                {d.porTipo.map((t, i) => (
                  <div class="rp-tarjeta" key={t.tipo}>
                    <b style={{ color: COLORES[[0, 2, 3][i]], fontSize: '22pt' }}>{miles(t.piezas)}</b>
                    {t.nombre.toLowerCase()} ({pct(t.piezas, d.piezas)}%)
                  </div>
                ))}
              </div>
              <p class="rp-nota">Consumible: se entrega y no regresa. Resguardo: queda a cargo del trabajador. Préstamo: se devuelve al almacén.</p>
            </div>
          </div>
        </Pagina>
      )}

      {d.porArea.length > 1 && (
        <Pagina p={p} d={d} tituloPag="Personal atendido por área">
          <div class="rp-dos">
            <Barras datos={d.porArea.slice(0, 14).map((a) => [titulo(a.area), a.personas])} color="#BC955C" estilo={estiloBarras} />
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

      {d.consumoPorPersona.length > 1 && (
        <Pagina p={p} d={d} tituloPag="Piezas por persona en cada área">
          <div class="rp-dos">
            <Barras datos={d.consumoPorPersona.slice(0, 14).map((a) => [titulo(a.area), a.porPersona])} estilo={estiloBarras} />
            <div class="rp-col">
              <div class="rp-tarjeta">
                <b style={{ color: '#235B4E' }}>{d.promedioPorPersona}</b>piezas por persona en promedio
              </div>
              {(() => {
                const altas = d.consumoPorPersona.filter((a) => a.porPersona >= d.promedioPorPersona * 1.5)
                return altas.length ? (
                  <div class="rp-tarjeta rp-rosa rp-chica">
                    <strong style={{ color: '#691C32' }}>Por encima de 1.5 veces el promedio</strong>
                    {altas.slice(0, 6).map((a) => (
                      <span key={a.area}>
                        {titulo(a.area)}: {a.porPersona} ({a.personas} personas)
                      </span>
                    ))}
                  </div>
                ) : (
                  <div class="rp-tarjeta rp-chica">Ninguna área supera 1.5 veces el promedio de piezas por persona.</div>
                )
              })()}
              <p class="rp-nota">Solo áreas con 3 personas o más. Un valor alto puede indicar trabajos especiales o falta de resguardo del EPP.</p>
            </div>
          </div>
        </Pagina>
      )}

      {d.cascos > 0 && (
        <Pagina p={p} d={d} tituloPag="Entrega de cascos">
          <div class="rp-dos">
            <div class={`rp-col ${otrasAreas ? 'rp-con-desglose' : ''}`}>
              <Dona datos={dona} estilo={estiloPastel} />
              {otrasAreas && (
                <p class="rp-tarjeta rp-desglose">
                  <span>
                    <strong>Desglose de «Otras áreas» ({miles(restoCascos)} cascos):</strong> {otrasAreas}
                  </span>
                </p>
              )}
            </div>
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

      {d.porArea.length > 1 && (
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
                  {matsTabla.map((m, j) => {
                    const n = a.porMaterial[m.id] ?? 0
                    const t = n / maximos[j]
                    return (
                      <td key={m.id} class={n ? '' : 'rp-cero'} style={n ? { background: `#${mezcla('235B4E', 0.92 - t * 0.92)}`, color: t > 0.6 ? '#fff' : undefined, fontWeight: t > 0.6 ? 'bold' : undefined } : undefined}>
                        {n || '–'}
                      </td>
                    )
                  })}
                  <td class="rp-total">{a.personas}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="rp-nota">
            {d.porArea.length > 12 ? `Se muestran las 12 áreas con más personal atendido de ${d.porArea.length}. ` : ''}Color más intenso = el área que más recibió de ese material. El detalle completo
            está en el Excel.
          </p>
        </Pagina>
      )}

      {d.recurrentes.length > 0 && (
        <Pagina p={p} d={d} tituloPag="Solicitantes recurrentes">
          <table class="rp-tabla rp-izq">
            <thead>
              <tr>
                <th>Solicitante</th>
                <th>Área</th>
                <th>Material</th>
                <th class="rp-guinda">Veces</th>
                <th>Piezas</th>
                <th>Última</th>
                <th>Comentario</th>
              </tr>
            </thead>
            <tbody>
              {[...d.recurrentes]
                .sort((a, b) => b.veces - a.veces || b.piezas - a.piezas)
                .slice(0, detalleRecurrentes ? 7 : 12)
                .flatMap((r, i) => [
                  <tr key={r.area + r.materialId + r.rpe} class={detalleRecurrentes ? (i % 2 ? 'rp-par' : 'rp-non') : ''}>
                    <td>
                      {titulo(r.nombre)} ({r.rpe})
                    </td>
                    <td>{titulo(r.area)}</td>
                    <td>{r.material}</td>
                    <td class="rp-total">{r.veces}</td>
                    <td>{r.piezas}</td>
                    <td>{r.ultima}</td>
                    <td class={r.notas.length ? '' : 'rp-cero'}>{r.notas.join(' · ') || '—'}</td>
                  </tr>,
                  ...(detalleRecurrentes
                    ? [
                        <tr key={r.area + r.materialId + r.rpe + '-d'} class={`rp-detalle ${i % 2 ? 'rp-par' : 'rp-non'}`}>
                          <td colSpan={7}>
                            <b>Fechas:</b> {fechasCortas(r, 14)}
                            {r.otros.length > 0 && (
                              <>
                                {'  ·  '}
                                <b>También recibió:</b> {otrosTexto(r)}
                              </>
                            )}
                          </td>
                        </tr>,
                      ]
                    : []),
                ])}
            </tbody>
          </table>
          <p class="rp-nota">
            Personas que recibieron el mismo material en 2 o más entregas del periodo ({d.recurrentes.length} casos{detalleRecurrentes ? '; se muestran los 7 más frecuentes' : ''}). El detalle por área y material está en el Excel.
          </p>
        </Pagina>
      )}

      {d.recurrenciaPorArea.length > 1 && (
        <Pagina p={p} d={d} tituloPag="Solicitantes recurrentes por área">
          <div class="rp-dos">
            <Barras datos={d.recurrenciaPorArea.slice(0, 12).map((a) => [titulo(a.area), a.casos])} color="#691C32" estilo={estiloBarras} />
            <div class="rp-col">
              <div class="rp-tarjeta">
                <b style={{ color: '#691C32' }}>{pct(personasRec, d.personas)}%</b>del personal atendido ({personasRec} personas) tuvo algún caso recurrente
              </div>
              {topPctRec && (
                <div class="rp-tarjeta">
                  <b>{topPctRec.pct}%</b>de las personas de {titulo(topPctRec.area)} repitió material
                </div>
              )}
              <p class="rp-nota">Casos = persona y material que se entregaron 2 o más veces en el periodo. El listado con nombres está en la página anterior y en el Excel.</p>
            </div>
          </div>
        </Pagina>
      )}

      {d.contaminado.ultimos.length > 0 && (
        <Pagina p={p} d={d} tituloPag="EPP contaminado">
          <div class="rp-dos rp-contaminado">
            <div class="rp-col">
              <div class="rp-fila">
                <div class="rp-tarjeta">
                  <b style={{ color: '#691C32' }}>{miles(d.contaminado.eventos)}</b>
                  {d.contaminado.eventos === 1 ? 'cambio en el periodo' : 'cambios en el periodo'}
                </div>
                <div class="rp-tarjeta">
                  <b>{miles(d.contaminado.piezas)}</b>
                  {d.contaminado.piezas === 1 ? 'pieza contaminada' : 'piezas contaminadas'}
                </div>
              </div>
              <h3>Material contaminado</h3>
              {d.contaminado.porMaterial.length > 0 ? (
                <table class="rp-tabla rp-flujo">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Cambios</th>
                      <th class="rp-guinda">Piezas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.contaminado.porMaterial.slice(0, 8).map((m) => (
                      <tr key={m.material}>
                        <td>{m.material}</td>
                        <td>{m.eventos}</td>
                        <td class="rp-total">{m.piezas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p class="rp-nota">Sin cambios de EPP contaminado en el periodo.</p>
              )}
            </div>
            <div class="rp-col">
              <h3>Últimos {d.contaminado.ultimos.length} folios entregados</h3>
              <table class="rp-tabla rp-flujo rp-izq">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Fecha</th>
                    <th>Persona</th>
                    <th>Área</th>
                    <th>Material</th>
                  </tr>
                </thead>
                <tbody>
                  {d.contaminado.ultimos.map((x) => (
                    <tr key={x.entrega.id}>
                      <td class={x.folioFormato ? 'rp-folio' : 'rp-cero'}>{x.folioFormato || '—'}</td>
                      <td>{fechaCorta(x.entrega.fecha)}</td>
                      <td>{titulo(x.entrega.nombre)}</td>
                      <td>{titulo(x.entrega.area)}</td>
                      <td class="rp-mat">{x.materiales.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p class="rp-nota rp-nota-pie">Cambios registrados con la casilla «EPP contaminado» y el folio del formato en papel. El listado completo está en el Excel.</p>
        </Pagina>
      )}

      {d.porDia.length > 1 && (
        <Pagina p={p} d={d} tituloPag="Evolución por día">
          <div class={`rp-columnas est-${estiloBarras}`}>
            {(() => {
              const max = Math.max(1, ...d.porDia.map((x) => x.piezas))
              return d.porDia.map((x) => (
                <div class="rp-dia" key={x.fecha}>
                  <div class="rp-pareja">
                    <span style={estiloBarras === 'plana' ? { height: `${(x.personas / max) * 100}%`, background: '#235B4E' } : { height: `${(x.personas / max) * 100}%`, ...varsBarra('#235B4E') }}>
                      <em>{x.personas}</em>
                    </span>
                    <span style={estiloBarras === 'plana' ? { height: `${(x.piezas / max) * 100}%`, background: '#BC955C' } : { height: `${(x.piezas / max) * 100}%`, ...varsBarra('#BC955C') }}>
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
        <div class="rp-dos rp-cierre">
          <div class="rp-col">
            {d.alertas.slice(0, 5).map((a) => (
              <div class={`rp-tarjeta rp-alerta ${NIVEL[a.nivel][1]}`} key={a.titulo}>
                <em>{NIVEL[a.nivel][0]}</em>
                <div>
                  <strong>{a.titulo}</strong>
                  <span>→ {a.accion}</span>
                </div>
              </div>
            ))}
            {!d.alertas.length && <p class="rp-nota">{d.personas ? 'Sin alertas en el periodo.' : 'Sin entregas registradas en el periodo.'}</p>}
          </div>
          <div class="rp-col">
            <div class="rp-tarjeta rp-chica rp-hallazgos-lista">
              <strong style={{ color: '#235B4E' }}>Hallazgos del periodo</strong>
              <ul>
                {d.hallazgos.slice(0, 5).map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
            <div class="rp-tarjeta rp-chica">
              <strong style={{ color: '#235B4E' }}>Equipo en resguardo</strong>
              <span>{d.resguardosActivos.length ? d.resguardosActivos.slice(0, 6).map((r) => `${r.nombre}: ${r.cantidad}`).join(' · ') : 'Sin equipo en resguardo.'}</span>
            </div>
          </div>
        </div>
      </Pagina>
    </div>
  )
}
