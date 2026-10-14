import { createPortal } from 'preact/compat'
import { useEffect, useState } from 'preact/hooks'
import { guardarConfig, leerConfig } from '../db/db'
import { avisar } from './comunes'
import { Icono } from './iconos'

type Unidad = 'U1' | 'U2'
type TipoFormato = 'contaminado' | 'registro_epp' | 'resguardo_economico' | 'pdf_externo'

const ANIO_ACTUAL = new Date().getFullYear()

/** Genera la clave de configuración para el contador de folios de EPP contaminado. */
const claveFolioContaminado = (u: Unidad) => `folio_contaminado_${u}`

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
              <th style={{ width: '16.66%' }}>CASCO</th>
              <th style={{ width: '16.66%' }}>LENTES</th>
              <th style={{ width: '16.66%' }}>TAPONES</th>
              <th style={{ width: '16.66%' }}>GUANTE<br />CARNAZA</th>
              <th style={{ width: '16.66%' }}>GUANTE<br />HYFLEX</th>
              <th style={{ width: '16.7%' }}>FAJA</th>
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
            <th rowspan={2} class="col-h-nom">NOMBRE</th>
            <th rowspan={2} class="col-h-rpe">RPE</th>
            <th rowspan={2} class="col-h-firma">FIRMA</th>
            <th rowspan={2} class="col-h-area">ÁREA</th>
            <th rowspan={2} class="col-h-rotado">LENTES</th>
            <th colspan={3} class="col-h-grupo">GUANTES</th>
            <th rowspan={2} class="col-h-rotado">TAPONES</th>
            <th colspan={4} class="col-h-grupo">MASCARILLA</th>
            <th rowspan={2} class="col-h-fecha">FECHA<br/><small>(DD/MM/AAA)</small></th>
            <th rowspan={2} class="col-h-hora">HORA</th>
            <th rowspan={2} class="col-h-obs">OBSERVACIONES</th>
          </tr>
          <tr>
            <th class="col-h-rotado sub">CARNAZA</th>
            <th class="col-h-rotado sub">HYFLEX</th>
            <th class="col-h-rotado sub">NITRILO</th>
            <th class="col-h-rotado sub">AZUL</th>
            <th class="col-h-rotado sub">NEGRA</th>
            <th class="col-h-rotado sub">GRIS</th>
            <th class="col-h-rotado sub">POLVO</th>
          </tr>
        </thead>
        <tbody>
          {renglones.map((i) => (
            <tr key={i}>
              <td class="col-h-nom">&nbsp;</td>
              <td class="col-h-rpe">&nbsp;</td>
              <td class="col-h-firma">&nbsp;</td>
              <td class="col-h-area">&nbsp;</td>
              <td class="col-h-chk">&nbsp;</td>
              <td class="col-h-chk">&nbsp;</td>
              <td class="col-h-chk">&nbsp;</td>
              <td class="col-h-chk">&nbsp;</td>
              <td class="col-h-chk">&nbsp;</td>
              <td class="col-h-chk">&nbsp;</td>
              <td class="col-h-chk">&nbsp;</td>
              <td class="col-h-chk">&nbsp;</td>
              <td class="col-h-chk">&nbsp;</td>
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

// =========================================================================
// VENTANA MODAL / PORTAL DE IMPRESIÓN
// =========================================================================
function VistaImpresionPortal({ children, onCerrar }: { children: preact.ComponentChildren; onCerrar: () => void }) {
  const [contenedor] = useState(() => {
    const el = document.createElement('div')
    el.className = 'contenedor-formatos-impresion'
    document.body.appendChild(el)
    document.body.classList.add('imprimiendo-formato-activo')
    return el
  })

  useEffect(() => {
    return () => {
      document.body.classList.remove('imprimiendo-formato-activo')
      contenedor.remove()
    }
  }, [contenedor])

  return createPortal(
    <div class="portal-formatos-wrap">
      <div class="no-print barra-acciones-impresion">
        <button class="btn primary" onClick={() => window.print()}>
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
// PANTALLA PRINCIPAL: FORMATOS
// =========================================================================
export function PantallaFormatos() {
  const [tipo, setTipo] = useState<TipoFormato>('contaminado')

  // Estado para EPP Contaminado
  const [unidad, setUnidad] = useState<Unidad>('U1')
  const [folioInicioContaminado, setFolioInicioContaminado] = useState(1)
  const [cantContaminado, setCantContaminado] = useState(8)
  const [cargandoFolio, setCargandoFolio] = useState(true)

  // Estado para Registro de Entrega Horizontal
  const [hojaInicioReg, setHojaInicioReg] = useState(1)
  const [cantHojasReg, setCantHojasReg] = useState(5)

  // Estado para Resguardo Económico
  const [folioInicioResg, setFolioInicioResg] = useState(1)
  const [cantResg, setCantResg] = useState(4)

  // Estado para PDF Externo cargado
  const [pdfArchivo, setPdfArchivo] = useState<File | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [prefijoPdf, setPrefijoPdf] = useState('U1-SI-2026-')
  const [folioInicioPdf, setFolioInicioPdf] = useState(1)
  const [posicionFolio, setPosicionFolio] = useState<'arriba-der' | 'arriba-izq' | 'abajo-der'>('arriba-der')

  // Vista de impresión activa
  const [imprimiendo, setImprimiendo] = useState(false)

  // Cargar último folio de EPP Contaminado de IndexedDB
  useEffect(() => {
    let montado = true
    setCargandoFolio(true)
    leerConfig<number>(claveFolioContaminado(unidad), 0).then((ultimo) => {
      if (montado) {
        setFolioInicioContaminado(ultimo + 1)
        setCargandoFolio(false)
      }
    })
    return () => {
      montado = false
    }
  }, [unidad])

  // Cargar último folio de Resguardo
  useEffect(() => {
    leerConfig<number>('ultimo_folio_resguardo_economico', 0).then((ultimo) => {
      setFolioInicioResg(ultimo + 1)
    })
  }, [])

  // Limpiar URL de PDF externo al desmontar
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    }
  }, [pdfUrl])

  const manejarArchivoPdf = (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (file && file.type === 'application/pdf') {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
      setPdfArchivo(file)
      setPdfUrl(URL.createObjectURL(file))
    } else {
      avisar('Por favor seleccione un archivo PDF válido.', { tipo: 'bad' })
    }
  }

  // Confirmar impresión y guardar nuevo consecutivo
  const ejecutarImpresion = async () => {
    if (tipo === 'contaminado') {
      const nuevoUltimo = folioInicioContaminado + cantContaminado - 1
      await guardarConfig(claveFolioContaminado(unidad), nuevoUltimo)
    } else if (tipo === 'resguardo_economico') {
      const nuevoUltimo = folioInicioResg + cantResg - 1
      await guardarConfig('ultimo_folio_resguardo_economico', nuevoUltimo)
    }
    setImprimiendo(true)
  }

  // Agrupación en páginas para EPP Contaminado (exactamente 4 por hoja carta)
  const gruposContaminado = () => {
    const items = Array.from({ length: cantContaminado }, (_, i) => folioInicioContaminado + i)
    const paginas: number[][] = []
    for (let i = 0; i < items.length; i += 4) {
      paginas.push(items.slice(i, i + 4))
    }
    return paginas
  }

  // Agrupación en páginas para Resguardo Económico (2 por hoja carta)
  const gruposResguardo = () => {
    const items = Array.from({ length: cantResg }, (_, i) => folioInicioResg + i)
    const paginas: number[][] = []
    for (let i = 0; i < items.length; i += 2) {
      paginas.push(items.slice(i, i + 2))
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
                disabled={cargandoFolio}
                onInput={(e) => setFolioInicioContaminado(Math.max(1, Number((e.target as HTMLInputElement).value)))}
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
              <strong>{formatoFolioContaminado(unidad, folioInicioContaminado + cantContaminado - 1)}</strong>. Al imprimir se actualizará el consecutivo de la <strong>{unidad}</strong> para no duplicar folios.
            </span>
          </div>

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
              Formato oficial en orientación <strong>horizontal (apaisado)</strong> con tabla completa de firmas por trabajador, área, desglose de lentes, guantes (carnaza, hyflex, nitrilo), tapones, mascarillas y foliado de páginas correlativo.
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
                onInput={(e) => setHojaInicioReg(Math.max(1, Number((e.target as HTMLInputElement).value)))}
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
              Se generará en orientación horizontal desde la <strong>PÁGINA No. {String(hojaInicioReg).padStart(3, '0')}</strong> hasta la <strong>PÁGINA No. {String(hojaInicioReg + cantHojasReg - 1).padStart(3, '0')}</strong>.
            </span>
          </div>

          <div class="row">
            <button class="btn primary" onClick={() => setImprimiendo(true)}>
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
              Vale de resguardo económico oficial No. SI-2026 con recuadros para Quien Entrega, Visto Bueno Jefe de Oficina y Recibí. Caben <strong>2 formatos por cada hoja tamaño carta</strong>.
            </p>
          </div>

          <div class="filtros" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label class="campo">
              Folio inicial
              <input
                class="input"
                id="resg-folio-inicio"
                type="number"
                min={1}
                value={folioInicioResg}
                onInput={(e) => setFolioInicioResg(Math.max(1, Number((e.target as HTMLInputElement).value)))}
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
                <option value={2}>2 formatos (1 hoja carta)</option>
                <option value={4}>4 formatos (2 hojas carta)</option>
                <option value={6}>6 formatos (3 hojas carta)</option>
                <option value={8}>8 formatos (4 hojas carta)</option>
                <option value={10}>10 formatos (5 hojas carta)</option>
                <option value={20}>20 formatos (10 hojas carta)</option>
              </select>
            </label>
          </div>

          <div class="aviso info small">
            <Icono n="info" />
            <span>
              Se generarán folios del <strong>{formatoFolioResguardo(folioInicioResg)}</strong> al{' '}
              <strong>{formatoFolioResguardo(folioInicioResg + cantResg - 1)}</strong>.
            </span>
          </div>

          <div class="row">
            <button class="btn primary" onClick={ejecutarImpresion}>
              <Icono n="casco" /> Generar e Imprimir ({cantResg} vales en {Math.ceil(cantResg / 2)} hojas)
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
              Suba cualquier formato en PDF para imprimirlo o estamparle folios consecutivos.
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
                <span>Archivo cargado: <strong>{pdfArchivo.name}</strong> ({Math.round(pdfArchivo.size / 1024)} KB)</span>
              </div>

              <div class="filtros" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label class="campo">
                  Prefijo de folio
                  <input
                    class="input"
                    value={prefijoPdf}
                    onInput={(e) => setPrefijoPdf((e.target as HTMLInputElement).value)}
                    placeholder="Ej. U1-SI-2026-"
                  />
                </label>
                <label class="campo">
                  Folio inicial
                  <input
                    class="input"
                    type="number"
                    min={1}
                    value={folioInicioPdf}
                    onInput={(e) => setFolioInicioPdf(Math.max(1, Number((e.target as HTMLInputElement).value)))}
                  />
                </label>
                <label class="campo">
                  Posición del folio
                  <select
                    class="input fmt-select"
                    value={posicionFolio}
                    onChange={(e) => setPosicionFolio((e.target as HTMLSelectElement).value as any)}
                  >
                    <option value="arriba-der">Esquina superior derecha</option>
                    <option value="arriba-izq">Esquina superior izquierda</option>
                    <option value="abajo-der">Pie de página derecho</option>
                  </select>
                </label>
              </div>

              {pdfUrl && (
                <div style={{ border: '1px solid var(--rule)', borderRadius: '8px', overflow: 'hidden', height: '420px', position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      top: posicionFolio.startsWith('arriba') ? '12px' : 'auto',
                      bottom: posicionFolio === 'abajo-der' ? '12px' : 'auto',
                      right: posicionFolio.endsWith('der') ? '18px' : 'auto',
                      left: posicionFolio === 'arriba-izq' ? '18px' : 'auto',
                      background: 'rgba(255, 255, 255, 0.95)',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid #111',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      zIndex: 2,
                    }}
                  >
                    No. {prefijoPdf}{String(folioInicioPdf).padStart(3, '0')}
                  </div>
                  <iframe src={pdfUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="Vista previa PDF" />
                </div>
              )}

              <div class="row">
                <button
                  class="btn primary"
                  onClick={() => {
                    if (pdfUrl) {
                      const ventana = window.open(pdfUrl, '_blank')
                      ventana?.focus()
                      ventana?.print()
                    }
                  }}
                >
                  <Icono n="pdfSubir" /> Imprimir PDF Cargado
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
        <VistaImpresionPortal onCerrar={() => setImprimiendo(false)}>
          {/* EPP Contaminado: exactamente 4 por página carta */}
          {tipo === 'contaminado' &&
            gruposContaminado().map((grupo, numPag) => (
              <section key={numPag} class="hoja-carta-formato hoja-contaminado">
                {grupo.map((n) => (
                  <FormatoContaminadoIndividual
                    key={n}
                    folioTexto={formatoFolioContaminado(unidad, n)}
                  />
                ))}
              </section>
            ))}

          {/* Registro de entrega de EPP 2026: 1 página completa por hoja en HORIZONTAL */}
          {tipo === 'registro_epp' &&
            Array.from({ length: cantHojasReg }, (_, i) => hojaInicioReg + i).map((numPag) => (
              <section key={numPag} class="hoja-carta-formato hoja-registro-horizontal">
                <FormatoRegistroEntregaHorizontal paginaNum={numPag} />
              </section>
            ))}

          {/* Resguardo Económico: 2 por hoja carta */}
          {tipo === 'resguardo_economico' &&
            gruposResguardo().map((grupo, numPag) => (
              <section key={numPag} class="hoja-carta-formato hoja-resguardo">
                {grupo.map((n) => (
                  <FormatoResguardoIndividual
                    key={n}
                    folioTexto={formatoFolioResguardo(n)}
                  />
                ))}
              </section>
            ))}
        </VistaImpresionPortal>
      )}
    </div>
  )
}
