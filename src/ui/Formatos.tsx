import { createPortal } from 'preact/compat'
import { useEffect, useRef, useState } from 'preact/hooks'
import { ultimoFolioCapturado } from '../domain/contaminado'
import { hace } from '../lib/util'
import { contarPaginasPdf, estamparFoliosPdf, textoFolioPdf, type PosicionFolio } from '../state/pdfFolio'
import { anteriorLocal, detalleUltimo, registrarImpresion, ultimoImpreso, type SerieFolio, type UltimoImpreso } from '../state/folios'
import * as S from '../state/store'
import { avisar, intentar } from './comunes'
import { Icono } from './iconos'

type Unidad = 'U1' | 'U2'
type TipoFormato = 'contaminado' | 'registro_epp' | 'resguardo_economico' | 'pdf_externo'

const ANIO_ACTUAL = new Date().getFullYear()

/** Formato oficial de folio de EPP contaminado. */
function formatoFolioContaminado(unidad: Unidad, n: number, anio = ANIO_ACTUAL): string {
  return `${unidad}-SI-${anio}-${String(n).padStart(3, '0')}`
}

/** Formato oficial de folio de Resguardo Económico. */
function formatoFolioResguardo(n: number, anio = ANIO_ACTUAL): string {
  return `SI-${anio}-${String(n).padStart(3, '0')}`
}

// =========================================================================
// 1. FORMATO EPP CONTAMINADO (4 por hoja tamaño carta)
// =========================================================================
function FormatoContaminadoIndividual({ folioTexto }: { folioTexto: string }) {
  return (
    <div class="fmt-c-item">
      <div class="fmt-c-cab">
        <div class="fmt-c-logo">
          <img src="plantilla/logo_encabezado.png" alt="Gobierno de México | CFE" />
        </div>
        <div class="fmt-c-tit">
          <strong>REPORTE DE EQUIPO DE PROTECCIÓN PERSONAL</strong>
          <strong>CONTAMINADO</strong>
        </div>
        <div class="fmt-c-folio">
          <span>No. {folioTexto}</span>
        </div>
      </div>

      <div class="fmt-c-grid-datos">
        {/* Fila 1: Nombre a la izquierda, RPE al centro, Fecha a la derecha */}
        <div class="fmt-c-celda fmt-c-nom">
          <span class="fmt-lbl">NOMBRE:</span>
          <span class="fmt-linea" />
        </div>
        <div class="fmt-c-celda fmt-c-rpe">
          <span class="fmt-lbl">RPE:</span>
          <span class="fmt-linea" />
        </div>
        <div class="fmt-c-celda fmt-c-fec">
          <span class="fmt-lbl">FECHA:</span>
          <span class="fmt-txt-fijo">____ / ____ / ________</span>
        </div>

        {/* Fila 2: Supervisor a la izquierda (bajo Nombre), Área al centro (bajo RPE), Hora a la derecha */}
        <div class="fmt-c-celda fmt-c-sup">
          <span class="fmt-lbl">SUPERVISOR:</span>
          <span class="fmt-linea" />
        </div>
        <div class="fmt-c-celda fmt-c-area">
          <span class="fmt-lbl">ÁREA:</span>
          <span class="fmt-linea" />
        </div>
        <div class="fmt-c-celda fmt-c-hora">
          <span class="fmt-lbl">HORA:</span>
          <span class="fmt-txt-fijo">____ : ____ HRS</span>
        </div>
      </div>

      <div class="fmt-c-seccion-act">
        <div class="fmt-c-act-tit">ACTIVIDAD QUE ESTABA REALIZANDO:</div>
        <div class="fmt-c-act-lineas">
          <div class="fmt-c-renglon" />
        </div>
      </div>

      <div class="fmt-c-epp-bloque">
        <div class="fmt-c-epp-barra">TIPO DE EQUIPO DE PROTECCIÓN PERSONAL</div>
        {/* Tabla con encabezados y casillas perfectamente alineadas en fila */}
        <table class="fmt-c-epp-tbl">
          <thead>
            <tr>
              <th style={{ width: '14.28%' }}>CASCO</th>
              <th style={{ width: '14.28%' }}>LENTES</th>
              <th style={{ width: '14.28%' }}>TAPONES</th>
              <th style={{ width: '14.28%' }}>GUANTE<br />CARNAZA</th>
              <th style={{ width: '14.28%' }}>GUANTE<br />HYFLEX</th>
              <th style={{ width: '14.28%' }}>FAJA</th>
              <th style={{ width: '14.32%' }}>OTROS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="td-chk">&nbsp;</td>
              <td class="td-chk">&nbsp;</td>
              <td class="td-chk">&nbsp;</td>
              <td class="td-chk">&nbsp;</td>
              <td class="td-chk">&nbsp;</td>
              <td class="td-chk">&nbsp;</td>
              <td class="td-chk">&nbsp;</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="fmt-c-pie-firma">
        <div class="fmt-c-vb-lbl">
          <strong>VISTO BUENO PROTECCIÓN</strong>
          <strong>RADIOLÓGICA:</strong>
        </div>
        <div class="fmt-c-firma-linea-wrap">
          <div class="fmt-c-linea-firmar" />
          <span class="fmt-c-firma-sub">NOMBRE, FIRMA Y RPE</span>
        </div>
      </div>
    </div>
  )
}

// =========================================================================
// 2. FORMATO REGISTRO DE ENTREGA DE EPP 2026 (Firmas - Horizontal Landscape)
// =========================================================================
/** Tallas que se encierran en el registro (las mismas del catálogo de la app). */
const TALLAS_GUANTE: { clase: string; nombre: string; tallas: string[][] }[] = [
  { clase: 'carnaza', nombre: 'CARNAZA', tallas: [['CH', 'M'], ['G', 'XG']] },
  { clase: 'hyflex', nombre: 'HYFLEX', tallas: [['6', '7', '8'], ['9', '10']] },
  { clase: 'nitrilo', nombre: 'NITRILO', tallas: [['7', '8'], ['9', '10']] },
]

/** Casilla de talla con las opciones impresas en gris para encerrar la que se entregó. */
function CeldaTalla({ tallas }: { tallas: string[][] }) {
  return (
    <td class="col-h-talla">
      <span class="fmt-tallas">
        {tallas.map((fila, i) => (
          <span key={i}>{fila.join('\u2002')}</span>
        ))}
      </span>
    </td>
  )
}

function FormatoRegistroEntregaHorizontal({ paginaNum, anio = ANIO_ACTUAL }: { paginaNum: number; anio?: number }) {
  const renglones = Array.from({ length: 20 }, (_, i) => i)
  return (
    <div class="fmt-reg-h-pagina">
      <div class="fmt-reg-h-cab">
        <div class="fmt-reg-h-logo">
          <img src="plantilla/logo_encabezado.png" alt="CFE" />
          <span class="fmt-reg-h-cfe-txt">Comisión Federal de Electricidad</span>
        </div>
        <div class="fmt-reg-h-tit">
          <h1>REGISTRO DE ENTREGA DE EPP {anio}</h1>
        </div>
        <div class="fmt-reg-h-sub">
          <span>Central Nucleoeléctrica Laguna Verde</span>
          <span>Subgerencia de Seguridad Nuclear</span>
          <span>Oficina de Seguridad Industrial</span>
          <span class="fmt-reg-h-pagina-num">PÁGINA No. {String(paginaNum).padStart(3, '0')}</span>
        </div>
      </div>

      <table class="fmt-reg-h-tabla">
        <thead>
          <tr>
            <th rowspan={3} class="col-h-nom">NOMBRE</th>
            <th rowspan={3} class="col-h-rpe">RPE</th>
            <th rowspan={3} class="col-h-firma">FIRMA</th>
            <th rowspan={3} class="col-h-area">ÁREA</th>
            <th rowspan={3} class="col-h-lentes col-h-rot"><span class="col-v-txt">LENTES</span></th>
            <th colspan={6} class="col-h-grupo">GUANTES</th>
            <th rowspan={3} class="col-h-tapones col-h-rot"><span class="col-v-txt">TAPONES</span></th>
            <th colspan={4} class="col-h-grupo">MASCARILLA</th>
            <th rowspan={3} class="col-h-fecha">FECHA<br/><small>(DD/MM/AAAA)</small></th>
            <th rowspan={3} class="col-h-hora">HORA</th>
            <th rowspan={3} class="col-h-obs">OBSERVACIONES</th>
          </tr>
          <tr>
            {TALLAS_GUANTE.map((g) => (
              <th key={g.clase} colspan={2} class="col-h-guante">{g.nombre}</th>
            ))}
            <th rowspan={2} class="col-h-azul col-h-rot"><span class="col-v-txt">AZUL</span></th>
            <th rowspan={2} class="col-h-negra col-h-rot"><span class="col-v-txt">NEGRA</span></th>
            <th rowspan={2} class="col-h-gris col-h-rot"><span class="col-v-txt">GRIS</span></th>
            <th rowspan={2} class="col-h-polvo col-h-rot"><span class="col-v-txt">POLVO</span></th>
          </tr>
          <tr>
            {TALLAS_GUANTE.map((g) => [
              <th key={`${g.clase}-c`} class="col-h-cant">CANT.</th>,
              <th key={`${g.clase}-t`} class="col-h-talla">
                TALLA
                <small>(encierre)</small>
              </th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {renglones.map((i) => (
            <tr key={i}>
              <td class="col-h-nom">&nbsp;</td>
              <td class="col-h-rpe">&nbsp;</td>
              <td class="col-h-firma">&nbsp;</td>
              <td class="col-h-area">&nbsp;</td>
              <td class="col-h-lentes">&nbsp;</td>
              {TALLAS_GUANTE.map((g) => [
                <td key={`${g.clase}-c`} class="col-h-cant">&nbsp;</td>,
                <CeldaTalla key={`${g.clase}-t`} tallas={g.tallas} />,
              ])}
              <td class="col-h-tapones">&nbsp;</td>
              <td class="col-h-azul">&nbsp;</td>
              <td class="col-h-negra">&nbsp;</td>
              <td class="col-h-gris">&nbsp;</td>
              <td class="col-h-polvo">&nbsp;</td>
              <td class="col-h-fecha">&nbsp;</td>
              <td class="col-h-hora">&nbsp;</td>
              <td class="col-h-obs">&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div class="fmt-reg-h-pie">
        <div class="fmt-reg-h-leyenda">
          <strong>IMPORTANTE:</strong> TENGO EL CONOCIMIENTO DE COMO UTILIZAR MI EPP CORRECTAMENTE Y EL CUIDADO QUE REQUIERE EL MISMO.
          EN CASO DE REQUERIR UN REEMPLAZO SE DEBERA MOSTRAR EL EPP DAÑADO, LO ANTERIOR CON BASE EN LA NOM-017-STPS-2024 APARTADO 7.1 INCISO K.
        </div>
        <div class="fmt-reg-h-dir">
          Carretera Federal 180 Cardel-Nautla km 42.5, Mpio. Alto Lucero, Ver. CP 91680 Tel (01229) 9899090 Ext 45114/46044
        </div>
      </div>
    </div>
  )
}

// =========================================================================
// 3. FORMATO RESGUARDO ECONÓMICO (2 por hoja tamaño carta)
// =========================================================================
function FormatoResguardoIndividual({ folioTexto }: { folioTexto: string }) {
  return (
    <div class="fmt-resg-item">
      <div class="fmt-resg-cab">
        <div class="fmt-resg-logo">
          <img src="plantilla/logo_encabezado.png" alt="Gobierno de México | CFE" />
        </div>
        <div class="fmt-resg-inst">
          <span>Coordinación Nuclear</span>
          <span>Gerencia Nucleoeléctrica Laguna Verde</span>
          <span>Subgerencia de Seguridad Nuclear</span>
          <span>Oficina de Seguridad Industrial</span>
        </div>
        <div class="fmt-resg-folio">
          <span>No. {folioTexto}</span>
        </div>
      </div>

      <div class="fmt-resg-tit">
        <strong>COMISIÓN FEDERAL DE ELECTRICIDAD</strong>
        <span>RESGUARDO ECONÓMICO</span>
      </div>

      <div class="fmt-resg-datos">
        <div class="fmt-resg-campo">
          <strong>NOMBRE:</strong> <span class="fmt-linea" />
        </div>
        <div class="fmt-resg-campo">
          <strong>RPE:</strong> <span class="fmt-linea" />
        </div>
        <div class="fmt-resg-campo">
          <strong>ÁREA:</strong> <span class="fmt-linea" />
        </div>
      </div>

      <table class="fmt-resg-tabla">
        <thead>
          <tr>
            <th style={{ width: '15%' }}>CANTIDAD</th>
            <th style={{ width: '20%' }}>UNIDAD DE MEDIDA</th>
            <th style={{ width: '35%' }}>DESCRIPCIÓN</th>
            <th style={{ width: '15%' }}>COSTO UNITARIO</th>
            <th style={{ width: '15%' }}>COSTO TOTAL</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>&nbsp;</td>
            <td>PZ</td>
            <td style={{ textAlign: 'left', paddingLeft: '8px' }}>
              <span class="fmt-box-chk" /> CASCO DE SEGURIDAD
            </td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
          </tr>
          <tr>
            <td>&nbsp;</td>
            <td>PZ</td>
            <td style={{ textAlign: 'left', paddingLeft: '8px' }}>
              <span class="fmt-box-chk" /> FAJA
            </td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
          </tr>
        </tbody>
      </table>

      <div class="fmt-resg-fecha-lug">
        <span>LAGUNA VERDE, VERACRUZ</span>
        <span>FECHA: _____________________________</span>
      </div>

      <div class="fmt-resg-firmas">
        <div class="fmt-resg-col-firma">
          <div class="fmt-linea-firma" />
          <span>ENTREGUÉ</span>
        </div>
        <div class="fmt-resg-col-firma">
          <div class="fmt-linea-firma" />
          <span>VO. BO. JEFE DE OFICINA</span>
        </div>
        <div class="fmt-resg-col-firma">
          <div class="fmt-linea-firma" />
          <span>RECIBÍ</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Imprime un PDF cargado: se abre en un marco oculto y se imprime cuando ya terminó de cargar
 * (abrirlo en otra pestaña e imprimir de inmediato salía en blanco o lo bloqueaba el navegador).
 */
function imprimirPdf(url: string) {
  document.getElementById('marco-impresion-pdf')?.remove()
  const marco = document.createElement('iframe')
  marco.id = 'marco-impresion-pdf'
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  marco.src = url
  marco.onload = () => {
    try {
      marco.contentWindow?.focus()
      marco.contentWindow?.print()
    } catch {
      // Si el visor del navegador no deja imprimir desde el marco, se abre en otra pestaña
      window.open(url, '_blank')
    }
  }
  document.body.appendChild(marco)
}

// =========================================================================
// VISTA PREVIA EN PANTALLA (las mismas hojas que se imprimen, a escala)
// =========================================================================
const MM_A_PX = 96 / 25.4

function VistaPrevia({ paginas, horizontal = false }: { paginas: preact.ComponentChildren[]; horizontal?: boolean }) {
  const caja = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(0.4)
  const [hoja, setHoja] = useState(0)
  const anchoPx = (horizontal ? 279.4 : 215.9) * MM_A_PX
  const altoPx = (horizontal ? 215.9 : 279.4) * MM_A_PX
  useEffect(() => {
    const el = caja.current
    if (!el) return
    const medir = () => setEscala(Math.min(1, el.clientWidth / anchoPx))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [anchoPx])
  const total = paginas.length
  const actual = Math.min(hoja, Math.max(0, total - 1))
  if (!total) return null
  return (
    <div class="fmt-previa">
      <div class="spread">
        <strong class="small">
          Vista previa · hoja {actual + 1} de {total}
        </strong>
        {total > 1 && (
          <div class="row" style={{ gap: '6px' }}>
            <button class="btn sm" disabled={actual === 0} onClick={() => setHoja(actual - 1)} aria-label="Hoja anterior">
              ‹ Anterior
            </button>
            <button class="btn sm" disabled={actual >= total - 1} onClick={() => setHoja(actual + 1)} aria-label="Hoja siguiente">
              Siguiente ›
            </button>
          </div>
        )}
      </div>
      <div class={`fmt-previa-marco ${horizontal ? 'horizontal' : ''}`} ref={caja} style={{ height: `${Math.round(altoPx * escala)}px` }} aria-hidden="true">
        <div class="fmt-previa-hoja" style={{ width: `${anchoPx}px`, height: `${altoPx}px`, transform: `scale(${escala})` }}>
          {paginas[actual]}
        </div>
      </div>
    </div>
  )
}

// =========================================================================
// VENTANA MODAL / PORTAL DE IMPRESIÓN
// =========================================================================
export function VistaImpresionPortal({
  children,
  onCerrar,
  onImprimir,
  orientacion = 'portrait',
}: {
  children: preact.ComponentChildren
  onCerrar: () => void
  /** Se llama al presionar «Imprimir» (antes de abrir el diálogo): ahí se guarda el consecutivo. */
  onImprimir?: () => Promise<boolean>
  orientacion?: 'portrait' | 'landscape'
}) {
  const [contenedor] = useState(() => {
    const el = document.createElement('div')
    el.className = 'contenedor-formatos-impresion'
    document.body.appendChild(el)
    document.body.classList.add('imprimiendo-formato-activo')
    document.body.classList.add(orientacion === 'landscape' ? 'imprimiendo-formato-horizontal' : 'imprimiendo-formato-vertical')
    return el
  })

  useEffect(() => {
    // Inyectar regla @page exacta para que el diálogo de impresión de Chrome/Edge
    // detecte automáticamente tamaño Carta y la orientación correcta (horizontal o vertical) con márgenes 0
    const estilo = document.createElement('style')
    estilo.id = 'estilo-formato-print-dinamico'
    estilo.textContent = orientacion === 'landscape'
      ? `@page { size: letter landscape; margin: 0; }`
      : `@page { size: letter portrait; margin: 0; }`
    document.head.appendChild(estilo)

    return () => {
      document.body.classList.remove('imprimiendo-formato-activo')
      document.body.classList.remove('imprimiendo-formato-horizontal')
      document.body.classList.remove('imprimiendo-formato-vertical')
      estilo.remove()
      contenedor.remove()
    }
  }, [contenedor, orientacion])

  return createPortal(
    <div class="portal-formatos-wrap">
      <div class="no-print barra-acciones-impresion">
        <button
          class="btn primary"
          onClick={async () => {
            if (onImprimir && !(await onImprimir())) return
            window.print()
          }}
        >
          <Icono n="pdf" /> Imprimir / Guardar como PDF
        </button>
        <button class="btn ghost" onClick={onCerrar}>
          <Icono n="cerrar" /> Cerrar
        </button>
      </div>
      <div class="hojas-impresion-documento">
        {children}
      </div>
    </div>,
    contenedor,
  )
}

// =========================================================================
// CONSECUTIVO DE FOLIOS IMPRESOS (compartido entre todos los equipos)
// =========================================================================

/**
 * Folio inicial de una serie: sigue solo al último impreso en cualquier equipo (se sincroniza)
 * hasta que el usuario lo cambia a mano, p. ej. para reimprimir un folio.
 */
function useConsecutivo(serie: SerieFolio, piso = 0) {
  const [anterior, setAnterior] = useState(0)
  const [detalle, setDetalle] = useState<UltimoImpreso>({ ultimo: 0 })
  const [manual, setManual] = useState<number | null>(null)
  useEffect(() => {
    let vivo = true
    void anteriorLocal(serie, ANIO_ACTUAL).then((n) => vivo && setAnterior(n))
    void detalleUltimo(serie, ANIO_ACTUAL).then((d) => vivo && setDetalle(d))
    return () => {
      vivo = false
    }
  }, [serie, S.ajustes.value])
  useEffect(() => setManual(null), [serie])
  const impreso = Math.max(ultimoImpreso(S.ajustes.value, serie, ANIO_ACTUAL, anterior), detalle.ultimo)
  const ultimo = Math.max(impreso, piso)
  return {
    serie,
    impreso,
    ultimo,
    piso,
    detalle,
    siguiente: ultimo + 1,
    inicio: manual ?? ultimo + 1,
    cambiar: (n: number) => setManual(n),
    seguir: () => setManual(null),
  }
}
type Consecutivo = ReturnType<typeof useConsecutivo>

/** Muestra el último folio impreso y avisa si el folio inicial reimprime o salta folios. */
function AvisoConsecutivo({ c, fin, formato, nombre = 'folio', femenino = false }: { c: Consecutivo; fin: number; formato: (n: number) => string; nombre?: string; femenino?: boolean }) {
  const d = c.detalle
  const o = femenino ? 'a' : 'o'
  const quien = d.ultimo === c.impreso && d.equipo ? ` en el equipo ${d.equipo}${d.fecha ? `, ${hace(d.fecha)}` : ''}` : ''
  return (
    <div class="stack" style={{ gap: '8px' }}>
      <p class="muted small" style={{ margin: 0 }}>
        {c.impreso ? (
          <>
            Últim{o} {nombre} impres{o}: <strong>{formato(c.impreso)}</strong>
            {quien}.
          </>
        ) : (
          `Aún no se ha impreso ${femenino ? 'ninguna' : 'ningún'} ${nombre} en ${ANIO_ACTUAL}.`
        )}
        {c.piso > c.impreso && (
          <>
            {' '}
            Últim{o} usad{o} en un despacho: <strong>{formato(c.piso)}</strong>.
          </>
        )}{' '}
        El consecutivo se comparte con todas las PCs y celulares.
      </p>
      {c.inicio <= c.ultimo && (
        <div class="aviso warn small">
          <Icono n="alerta" />
          <span class="grow">
            <strong>Reimpresión:</strong> {c.inicio === Math.min(fin, c.ultimo) ? `${femenino ? 'la' : 'el'} ${nombre} ${formato(c.inicio)} ya se imprimió` : `del ${formato(c.inicio)} al ${formato(Math.min(fin, c.ultimo))} ya se imprimieron`}. Úselo solo para reponer
            un formato dañado o perdido; el consecutivo no retrocede.
          </span>
          <button class="btn sm" onClick={c.seguir}>
            Usar el siguiente ({formato(c.siguiente)})
          </button>
        </div>
      )}
      {c.inicio > c.siguiente && (
        <div class="aviso warn small">
          <Icono n="alerta" />
          <span class="grow">
            Se saltarán {c.inicio - c.siguiente === 1 ? `${femenino ? 'la' : 'el'} ${nombre} ${formato(c.siguiente)}` : `del ${formato(c.siguiente)} al ${formato(c.inicio - 1)}`} (no se imprimen).
          </span>
          <button class="btn sm" onClick={c.seguir}>
            Usar el siguiente ({formato(c.siguiente)})
          </button>
        </div>
      )}
    </div>
  )
}

// =========================================================================
// PANTALLA PRINCIPAL: FORMATOS
// =========================================================================
export function PantallaFormatos() {
  const [tipo, setTipo] = useState<TipoFormato>('contaminado')

  // Estado para EPP Contaminado
  const [unidad, setUnidad] = useState<Unidad>('U1')
  const [cantContaminado, setCantContaminado] = useState(8)
  // Folios ya usados al capturar despachos de EPP contaminado (también cuentan para no repetir)
  const capturado = ultimoFolioCapturado(S.entregas.value, unidad, ANIO_ACTUAL)
  const consContaminado = useConsecutivo(`contaminado-${unidad}`, capturado)
  const folioInicioContaminado = consContaminado.inicio

  // Estado para Registro de Entrega Horizontal
  const consRegistro = useConsecutivo('registro')
  const hojaInicioReg = consRegistro.inicio
  const [cantHojasReg, setCantHojasReg] = useState(5)

  // Estado para Resguardo Económico
  const consResg = useConsecutivo('resguardo')
  const folioInicioResg = consResg.inicio
  const [cantResg, setCantResg] = useState(6)
  const [porHojaResg, setPorHojaResg] = useState<2 | 3>(2)

  // Estado para PDF Externo cargado
  const [pdfArchivo, setPdfArchivo] = useState<File | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [prefijoPdf, setPrefijoPdf] = useState(`U1-SI-${ANIO_ACTUAL}-`)
  const [folioInicioPdf, setFolioInicioPdf] = useState(1)
  const [posicionFolio, setPosicionFolio] = useState<PosicionFolio>('arriba-der')
  const [copiasPdf, setCopiasPdf] = useState(1)
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null)
  const [pdfPaginas, setPdfPaginas] = useState(0)
  const [pdfFoliado, setPdfFoliado] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState('')
  const [pdfGenerando, setPdfGenerando] = useState(false)

  // Vista de impresión activa
  const [imprimiendo, setImprimiendo] = useState(false)

  // Limpiar URL de PDF externo al desmontar
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    }
  }, [pdfUrl])

  const manejarArchivoPdf = async (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (file && file.type === 'application/pdf') {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
      setPdfArchivo(file)
      setPdfUrl(URL.createObjectURL(file))
      setPdfError('')
      const bytes = await file.arrayBuffer()
      setPdfBytes(bytes)
      setPdfPaginas(await contarPaginasPdf(bytes.slice(0)).catch(() => 0))
    } else {
      avisar('Por favor seleccione un archivo PDF válido.', { tipo: 'bad' })
    }
  }

  // PDF con el folio estampado en la primera página de cada copia (se rehace al cambiar los datos)
  useEffect(() => {
    if (!pdfBytes) return
    let vigente = true
    let url: string | null = null
    setPdfGenerando(true)
    const t = setTimeout(async () => {
      try {
        const salida = await estamparFoliosPdf(pdfBytes.slice(0), { prefijo: prefijoPdf, inicio: folioInicioPdf, copias: copiasPdf, posicion: posicionFolio })
        if (!vigente) return
        url = URL.createObjectURL(new Blob([salida as BlobPart], { type: 'application/pdf' }))
        setPdfFoliado(url)
        setPdfError('')
      } catch (err) {
        if (vigente) {
          setPdfFoliado(null)
          setPdfError((err as Error).message)
        }
      } finally {
        if (vigente) setPdfGenerando(false)
      }
    }, 350)
    return () => {
      vigente = false
      clearTimeout(t)
      if (url) URL.revokeObjectURL(url)
    }
  }, [pdfBytes, prefijoPdf, folioInicioPdf, copiasPdf, posicionFolio])

  const descargarPdfFoliado = () => {
    if (!pdfFoliado || !pdfArchivo) return
    const a = document.createElement('a')
    a.href = pdfFoliado
    const fin = folioInicioPdf + copiasPdf - 1
    a.download = `${pdfArchivo.name.replace(/\.pdf$/i, '')} folio ${folioInicioPdf}${fin > folioInicioPdf ? `-${fin}` : ''}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // Abre la vista previa; el consecutivo se guarda hasta presionar «Imprimir»
  const ejecutarImpresion = () => {
    impreso.current = false
    setImprimiendo(true)
  }
  const impreso = useRef(false)
  const consActivo = tipo === 'contaminado' ? consContaminado : tipo === 'registro_epp' ? consRegistro : tipo === 'resguardo_economico' ? consResg : null
  const cantActiva = tipo === 'contaminado' ? cantContaminado : tipo === 'registro_epp' ? cantHojasReg : cantResg
  const guardarConsecutivo = async (): Promise<boolean> => {
    if (!consActivo) return true
    const c = consActivo
    const ok = await intentar(async () => {
      await registrarImpresion(c.serie, ANIO_ACTUAL, c.inicio, c.inicio + cantActiva - 1)
      return true
    })
    if (ok) impreso.current = true
    return !!ok
  }
  const cerrarImpresion = () => {
    setImprimiendo(false)
    // Lo siguiente que se imprima continúa después de lo impreso (incluso tras una reimpresión)
    if (impreso.current) consActivo?.seguir()
  }

  // Hojas que se imprimen; la vista previa muestra exactamente las mismas
  const hojasContaminado = () =>
    gruposContaminado().map((grupo, numPag) => (
      <section key={numPag} class="hoja-formato-impresion hoja-contaminado">
        {grupo.map((n) => (
          <FormatoContaminadoIndividual key={n} folioTexto={formatoFolioContaminado(unidad, n)} />
        ))}
      </section>
    ))
  const hojasRegistro = () =>
    Array.from({ length: cantHojasReg }, (_, i) => hojaInicioReg + i).map((numPag) => (
      <section key={numPag} class="hoja-formato-impresion hoja-registro-horizontal">
        <FormatoRegistroEntregaHorizontal paginaNum={numPag} />
      </section>
    ))
  const hojasResguardo = () =>
    gruposResguardo().map((grupo, numPag) => (
      <section key={numPag} class={`hoja-formato-impresion hoja-resguardo ${porHojaResg === 3 ? 'resg-3-por-hoja' : 'resg-2-por-hoja'}`}>
        {grupo.map((n) => (
          <FormatoResguardoIndividual key={n} folioTexto={formatoFolioResguardo(n)} />
        ))}
      </section>
    ))

  // Agrupación en páginas para EPP Contaminado (exactamente 4 por hoja carta)
  const gruposContaminado = () => {
    const items = Array.from({ length: cantContaminado }, (_, i) => folioInicioContaminado + i)
    const paginas: number[][] = []
    for (let i = 0; i < items.length; i += 4) {
      paginas.push(items.slice(i, i + 4))
    }
    return paginas
  }

  // Agrupación en páginas para Resguardo Económico (2 o 3 por hoja carta)
  const gruposResguardo = () => {
    const items = Array.from({ length: cantResg }, (_, i) => folioInicioResg + i)
    const paginas: number[][] = []
    for (let i = 0; i < items.length; i += porHojaResg) {
      paginas.push(items.slice(i, i + porHojaResg))
    }
    return paginas
  }

  return (
    <div class="stack" style={{ gap: '16px' }}>
      <div class="spread">
        <div>
          <h1>Formatos Imprimibles</h1>
          <p class="muted small">
            Genere e imprima formatos oficiales en blanco con foliado automático o cargue un archivo PDF externo.
          </p>
        </div>
      </div>

      {/* Barra de pestañas con iconos proporcionales que no se amontonan con el texto */}
      <div class="fmt-pestanas">
        <button
          class={`fmt-tab ${tipo === 'contaminado' ? 'activo' : ''}`}
          onClick={() => setTipo('contaminado')}
        >
          <Icono n="radiacion" />
          <span>EPP Contaminado (4 por hoja)</span>
        </button>
        <button
          class={`fmt-tab ${tipo === 'registro_epp' ? 'activo' : ''}`}
          onClick={() => setTipo('registro_epp')}
        >
          <Icono n="eppEntrega" />
          <span>Registro de Entrega EPP 2026 (Firmas)</span>
        </button>
        <button
          class={`fmt-tab ${tipo === 'resguardo_economico' ? 'activo' : ''}`}
          onClick={() => setTipo('resguardo_economico')}
        >
          <Icono n="casco" />
          <span>Resguardo Económico (Casco / Faja)</span>
        </button>
        <button
          class={`fmt-tab ${tipo === 'pdf_externo' ? 'activo' : ''}`}
          onClick={() => setTipo('pdf_externo')}
        >
          <Icono n="pdfSubir" />
          <span>Cargar Formato PDF con Folios</span>
        </button>
      </div>

      {/* ---------------- PESTAÑA 1: EPP CONTAMINADO ---------------- */}
      {tipo === 'contaminado' && (
        <div class="card stack" style={{ padding: '20px', gap: '16px' }}>
          <div>
            <h3>Reporte de EPP Contaminado</h3>
            <p class="muted small">
              Formato oficial para cambio de EPP contaminado con visto bueno de Protección Radiológica. Caben <strong>4 formatos completos por cada hoja tamaño carta</strong>.
            </p>
          </div>

          <div class="filtros" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label class="campo">
              Unidad
              <select
                class="input fmt-select"
                id="fc-unidad"
                value={unidad}
                onChange={(e) => setUnidad((e.target as HTMLSelectElement).value as Unidad)}
              >
                <option value="U1">Unidad 1 (U1)</option>
                <option value="U2">Unidad 2 (U2)</option>
              </select>
            </label>

            <label class="campo">
              Folio inicial
              <input
                class="input"
                id="fc-folio-inicio"
                type="number"
                min={1}
                value={folioInicioContaminado}
                onInput={(e) => consContaminado.cambiar(Math.max(1, Math.floor(Number((e.target as HTMLInputElement).value)) || 1))}
              />
            </label>

            <label class="campo">
              Cantidad de folios
              <select
                class="input fmt-select"
                id="fc-cantidad"
                value={cantContaminado}
                onChange={(e) => setCantContaminado(Number((e.target as HTMLSelectElement).value))}
              >
                <option value={4}>4 formatos (1 hoja carta)</option>
                <option value={8}>8 formatos (2 hojas carta)</option>
                <option value={12}>12 formatos (3 hojas carta)</option>
                <option value={16}>16 formatos (4 hojas carta)</option>
                <option value={20}>20 formatos (5 hojas carta)</option>
                <option value={40}>40 formatos (10 hojas carta)</option>
                <option value={100}>100 formatos (25 hojas carta)</option>
              </select>
            </label>
          </div>

          <div class="aviso info small">
            <Icono n="info" />
            <span>
              Se generarán folios del <strong>{formatoFolioContaminado(unidad, folioInicioContaminado)}</strong> al{' '}
              <strong>{formatoFolioContaminado(unidad, folioInicioContaminado + cantContaminado - 1)}</strong>. Al presionar «Imprimir» se guarda el consecutivo de la <strong>{unidad}</strong> para no duplicar folios.
            </span>
          </div>
          <AvisoConsecutivo c={consContaminado} fin={folioInicioContaminado + cantContaminado - 1} formato={(n) => formatoFolioContaminado(unidad, n)} />
          <VistaPrevia paginas={hojasContaminado()} />

          <div class="row">
            <button class="btn primary" onClick={ejecutarImpresion}>
              <Icono n="radiacion" /> Generar e Imprimir Formatos ({cantContaminado} talones en {Math.ceil(cantContaminado / 4)} hojas)
            </button>
          </div>
        </div>
      )}

      {/* ---------------- PESTAÑA 2: REGISTRO DE ENTREGA EPP 2026 (HORIZONTAL) ---------------- */}
      {tipo === 'registro_epp' && (
        <div class="card stack" style={{ padding: '20px', gap: '16px' }}>
          <div>
            <h3>Registro de Entrega de EPP 2026 (Formato Horizontal)</h3>
            <p class="muted small">
              Formato oficial en orientación <strong>horizontal (apaisado)</strong> con tabla completa de firmas por trabajador, área, desglose de lentes, guantes con su talla para encerrar (carnaza, hyflex, nitrilo), tapones, mascarillas y foliado de páginas correlativo.
            </p>
          </div>

          <div class="filtros" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label class="campo">
              Página / Folio inicial
              <input
                class="input"
                id="reg-hoja-inicio"
                type="number"
                min={1}
                value={hojaInicioReg}
                onInput={(e) => consRegistro.cambiar(Math.max(1, Math.floor(Number((e.target as HTMLInputElement).value)) || 1))}
              />
            </label>

            <label class="campo">
              Cantidad de páginas
              <select
                class="input fmt-select"
                id="reg-cant-hojas"
                value={cantHojasReg}
                onChange={(e) => setCantHojasReg(Number((e.target as HTMLSelectElement).value))}
              >
                <option value={1}>1 página (20 renglones)</option>
                <option value={3}>3 páginas (60 renglones)</option>
                <option value={5}>5 páginas (100 renglones)</option>
                <option value={10}>10 páginas (200 renglones)</option>
                <option value={20}>20 páginas (400 renglones)</option>
              </select>
            </label>
          </div>

          <div class="aviso info small">
            <Icono n="info" />
            <span>
              Se generará en orientación horizontal desde la <strong>PÁGINA No. {String(hojaInicioReg).padStart(3, '0')}</strong> hasta la <strong>PÁGINA No. {String(hojaInicioReg + cantHojasReg - 1).padStart(3, '0')}</strong>. Al presionar «Imprimir» se guarda la última página impresa.
            </span>
          </div>
          <AvisoConsecutivo c={consRegistro} fin={hojaInicioReg + cantHojasReg - 1} formato={(n) => `PÁGINA No. ${String(n).padStart(3, '0')}`} nombre="página" femenino />
          <VistaPrevia paginas={hojasRegistro()} horizontal />

          <div class="row">
            <button class="btn primary" onClick={ejecutarImpresion}>
              <Icono n="eppEntrega" /> Imprimir {cantHojasReg} Página{cantHojasReg > 1 ? 's' : ''} en Horizontal
            </button>
          </div>
        </div>
      )}

      {/* ---------------- PESTAÑA 3: RESGUARDO ECONÓMICO ---------------- */}
      {tipo === 'resguardo_economico' && (
        <div class="card stack" style={{ padding: '20px', gap: '16px' }}>
          <div>
            <h3>Resguardo Económico (Casco / Faja)</h3>
            <p class="muted small">
              Vale de resguardo económico oficial No. SI-2026 con recuadros para Quien Entrega, Visto Bueno Jefe de Oficina y Recibí. Puede elegir entre <strong>2 o 3 formatos por cada hoja carta</strong> para optimizar el espacio.
            </p>
          </div>

          <div class="filtros" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label class="campo">
              Formatos por hoja
              <select
                class="input fmt-select"
                id="resg-por-hoja"
                value={porHojaResg}
                onChange={(e) => setPorHojaResg(Number((e.target as HTMLSelectElement).value) as 2 | 3)}
              >
                <option value={2}>2 formatos por hoja (amplio)</option>
                <option value={3}>3 formatos por hoja (optimizar espacio)</option>
              </select>
            </label>

            <label class="campo">
              Folio inicial
              <input
                class="input"
                id="resg-folio-inicio"
                type="number"
                min={1}
                value={folioInicioResg}
                onInput={(e) => consResg.cambiar(Math.max(1, Math.floor(Number((e.target as HTMLInputElement).value)) || 1))}
              />
            </label>

            <label class="campo">
              Cantidad de formatos
              <select
                class="input fmt-select"
                id="resg-cantidad"
                value={cantResg}
                onChange={(e) => setCantResg(Number((e.target as HTMLSelectElement).value))}
              >
                {[2, 3, 4, 6, 8, 9, 10, 12, 15, 20, 30].map((n) => (
                  <option key={n} value={n}>
                    {n} formatos ({Math.ceil(n / porHojaResg)} hoja{Math.ceil(n / porHojaResg) > 1 ? 's' : ''})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div class="aviso info small">
            <Icono n="info" />
            <span>
              Se generarán folios del <strong>{formatoFolioResguardo(folioInicioResg)}</strong> al{' '}
              <strong>{formatoFolioResguardo(folioInicioResg + cantResg - 1)}</strong> impresos a{' '}
              <strong>{porHojaResg} por hoja</strong> ({Math.ceil(cantResg / porHojaResg)} hoja{Math.ceil(cantResg / porHojaResg) > 1 ? 's' : ''} en total). Al presionar «Imprimir» se guarda el consecutivo.
            </span>
          </div>
          <AvisoConsecutivo c={consResg} fin={folioInicioResg + cantResg - 1} formato={(n) => formatoFolioResguardo(n)} />
          <VistaPrevia paginas={hojasResguardo()} />

          <div class="row">
            <button class="btn primary" onClick={ejecutarImpresion}>
              <Icono n="casco" /> Generar e Imprimir ({cantResg} vales en {Math.ceil(cantResg / porHojaResg)} hoja{Math.ceil(cantResg / porHojaResg) > 1 ? 's' : ''})
            </button>
          </div>
        </div>
      )}

      {/* ---------------- PESTAÑA 4: CARGAR PDF CON FOLIOS ---------------- */}
      {tipo === 'pdf_externo' && (
        <div class="card stack" style={{ padding: '20px', gap: '16px' }}>
          <div>
            <h3>Cargar Formato PDF con Folios o Número de Página</h3>
            <p class="muted small">
              Suba cualquier formato en PDF y la app le estampa el folio en la primera página de cada copia; las demás páginas salen tal cual.
            </p>
          </div>

          <label class="campo">
            Seleccionar archivo PDF
            <input
              class="input"
              id="input-archivo-pdf"
              type="file"
              accept="application/pdf"
              onChange={manejarArchivoPdf}
            />
          </label>

          {pdfArchivo && (
            <div class="stack" style={{ gap: '12px' }}>
              <div class="aviso ok small">
                <Icono n="ok" />
                <span>
                  Archivo cargado: <strong>{pdfArchivo.name}</strong> ({Math.round(pdfArchivo.size / 1024)} KB
                  {pdfPaginas > 0 && `, ${pdfPaginas} ${pdfPaginas === 1 ? 'página' : 'páginas'}`})
                </span>
              </div>

              <div class="filtros" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label class="campo">
                  Prefijo de folio
                  <input
                    class="input"
                    id="pdf-prefijo"
                    value={prefijoPdf}
                    onInput={(e) => setPrefijoPdf((e.target as HTMLInputElement).value)}
                    placeholder="Ej. U1-SI-2026-"
                  />
                </label>
                <label class="campo">
                  Folio inicial
                  <input
                    class="input"
                    id="pdf-folio-inicio"
                    type="number"
                    min={1}
                    value={folioInicioPdf}
                    onInput={(e) => setFolioInicioPdf(Math.max(1, Number((e.target as HTMLInputElement).value)))}
                  />
                </label>
                <label class="campo">
                  Copias (un folio cada una)
                  <input
                    class="input"
                    id="pdf-copias"
                    type="number"
                    min={1}
                    max={200}
                    value={copiasPdf}
                    onInput={(e) => setCopiasPdf(Math.max(1, Math.min(200, Number((e.target as HTMLInputElement).value) || 1)))}
                  />
                </label>
                <label class="campo">
                  Posición del folio
                  <select
                    class="input fmt-select"
                    id="pdf-posicion"
                    value={posicionFolio}
                    onChange={(e) => setPosicionFolio((e.target as HTMLSelectElement).value as any)}
                  >
                    <option value="arriba-der">Esquina superior derecha</option>
                    <option value="arriba-izq">Esquina superior izquierda</option>
                    <option value="abajo-der">Pie de página derecho</option>
                  </select>
                </label>
              </div>

              <p class="muted small" style={{ margin: 0 }}>
                {copiasPdf > 1
                  ? `Se generan ${copiasPdf} copias: folios ${textoFolioPdf(prefijoPdf, folioInicioPdf)} a ${textoFolioPdf(prefijoPdf, folioInicioPdf + copiasPdf - 1)}`
                  : `Folio: ${textoFolioPdf(prefijoPdf, folioInicioPdf)}`}
                {pdfPaginas > 1 && ` · solo en la primera de las ${pdfPaginas} páginas de cada copia`}
                {pdfGenerando && ' · preparando…'}
              </p>

              {pdfError && (
                <div class="aviso bad small">
                  <Icono n="alerta" />
                  <span>{pdfError}</span>
                </div>
              )}

              {pdfFoliado && !pdfError && (
                <div style={{ border: '1px solid var(--rule)', borderRadius: '8px', overflow: 'hidden', height: '420px' }}>
                  <iframe src={pdfFoliado} style={{ width: '100%', height: '100%', border: 'none' }} title="Vista previa del PDF con folios" />
                </div>
              )}

              <div class="row" style={{ flexWrap: 'wrap' }}>
                <button class="btn primary" disabled={!pdfFoliado || !!pdfError || pdfGenerando} onClick={() => pdfFoliado && imprimirPdf(pdfFoliado)}>
                  <Icono n="pdfSubir" /> Imprimir con folios
                </button>
                <button class="btn" disabled={!pdfFoliado || !!pdfError || pdfGenerando} onClick={descargarPdfFoliado}>
                  <Icono n="pdf" /> Descargar PDF con folios
                </button>
                <button class="btn ghost" disabled={!pdfUrl} onClick={() => pdfUrl && imprimirPdf(pdfUrl)}>
                  Imprimir sin folio
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* VISTA DE IMPRESIÓN MODAL ACTIVA (PORTAL) */}
      {/* =================================================================== */}
      {imprimiendo && (
        <VistaImpresionPortal
          orientacion={tipo === 'registro_epp' ? 'landscape' : 'portrait'}
          onImprimir={guardarConsecutivo}
          onCerrar={cerrarImpresion}
        >
          {tipo === 'contaminado' && hojasContaminado()}
          {tipo === 'registro_epp' && hojasRegistro()}
          {tipo === 'resguardo_economico' && hojasResguardo()}
        </VistaImpresionPortal>
      )}
    </div>
  )
}
