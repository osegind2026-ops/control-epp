import { createPortal } from 'preact/compat'
import { useEffect, useState } from 'preact/hooks'
import { guardarConfig, leerConfig } from '../db/db'
import { avisar } from './comunes'
import { Icono } from './iconos'

type Unidad = 'U1' | 'U2'
type TipoFormato = 'contaminado' | 'registro_epp' | 'resguardo_economico' | 'pdf_externo'

const ANIO_ACTUAL = new Date().getFullYear()

/** Genera la clave de configuración para el contador de folios. */
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

        <div class="fmt-c-celda fmt-c-area">
          <span class="fmt-lbl">ÁREA:</span>
          <span class="fmt-linea" />
        </div>
        <div class="fmt-c-celda fmt-c-sup">
          <span class="fmt-lbl">SUPERVISOR:</span>
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
        <div class="fmt-c-epp-tabla">
          <div class="fmt-c-col">
            <span class="fmt-c-col-h">CASCO</span>
            <span class="fmt-c-chk" />
          </div>
          <div class="fmt-c-col">
            <span class="fmt-c-col-h">LENTES</span>
            <span class="fmt-c-chk" />
          </div>
          <div class="fmt-c-col">
            <span class="fmt-c-col-h">TAPONES</span>
            <span class="fmt-c-chk" />
          </div>
          <div class="fmt-c-col">
            <span class="fmt-c-col-h">GUANTE<br />CARNAZA</span>
            <span class="fmt-c-chk" />
          </div>
          <div class="fmt-c-col">
            <span class="fmt-c-col-h">GUANTE<br />HYFLEX</span>
            <span class="fmt-c-chk" />
          </div>
          <div class="fmt-c-col">
            <span class="fmt-c-col-h">FAJA</span>
            <span class="fmt-c-chk" />
          </div>
        </div>
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
// 2. FORMATO REGISTRO DE ENTREGA DE EPP 2026 (Firmas - Hoja Completa)
// =========================================================================
function FormatoRegistroEntrega({ paginaNum, anio = ANIO_ACTUAL }: { paginaNum: number; anio?: number }) {
  const renglones = Array.from({ length: 18 }, (_, i) => i)
  return (
    <div class="fmt-reg-pagina">
      <div class="fmt-reg-cab">
        <div class="fmt-reg-logo">
          <img src="plantilla/logo_encabezado.png" alt="CFE" />
          <small>Comisión Federal de Electricidad</small>
        </div>
        <div class="fmt-reg-tit">
          <h1>REGISTRO DE ENTREGA DE EPP {anio}</h1>
        </div>
        <div class="fmt-reg-sub">
          <span>Central Nucleoeléctrica Laguna Verde</span>
          <span>Subgerencia de Seguridad Nuclear</span>
          <span>Oficina de Seguridad Industrial</span>
          {paginaNum > 0 && <span class="fmt-reg-folio">Hoja No. {paginaNum}</span>}
        </div>
      </div>

      <table class="fmt-reg-tabla">
        <thead>
          <tr>
            <th rowspan={2} class="col-nom">NOMBRE</th>
            <th rowspan={2} class="col-rpe">RPE</th>
            <th rowspan={2} class="col-firma">FIRMA</th>
            <th rowspan={2} class="col-area">ÁREA</th>
            <th rowspan={2} class="col-vert">L<br/>E<br/>N<br/>T<br/>E<br/>S</th>
            <th colspan={3} class="col-subgrupo">GUANTES</th>
            <th rowspan={2} class="col-vert">T<br/>A<br/>P<br/>O<br/>N<br/>E<br/>S</th>
            <th colspan={4} class="col-subgrupo">MASCARILLA</th>
            <th rowspan={2} class="col-fecha">FECHA<br/><small>(DD/MM/AAAA)</small></th>
            <th rowspan={2} class="col-hora">HORA</th>
            <th rowspan={2} class="col-obs">OBSERVACIONES</th>
          </tr>
          <tr>
            <th class="col-vert sub">C<br/>A<br/>R<br/>N<br/>A<br/>Z<br/>A</th>
            <th class="col-vert sub">H<br/>Y<br/>F<br/>L<br/>E<br/>X</th>
            <th class="col-vert sub">N<br/>I<br/>T<br/>R<br/>I<br/>L<br/>O</th>
            <th class="col-vert sub">A<br/>Z<br/>U<br/>L</th>
            <th class="col-vert sub">N<br/>E<br/>G<br/>R<br/>A</th>
            <th class="col-vert sub">G<br/>R<br/>I<br/>S</th>
            <th class="col-vert sub">P<br/>O<br/>L<br/>V<br/>O</th>
          </tr>
        </thead>
        <tbody>
          {renglones.map((i) => (
            <tr key={i}>
              <td class="col-nom">&nbsp;</td>
              <td class="col-rpe">&nbsp;</td>
              <td class="col-firma">&nbsp;</td>
              <td class="col-area">&nbsp;</td>
              <td class="col-chk">&nbsp;</td>
              <td class="col-chk">&nbsp;</td>
              <td class="col-chk">&nbsp;</td>
              <td class="col-chk">&nbsp;</td>
              <td class="col-chk">&nbsp;</td>
              <td class="col-chk">&nbsp;</td>
              <td class="col-chk">&nbsp;</td>
              <td class="col-chk">&nbsp;</td>
              <td class="col-chk">&nbsp;</td>
              <td class="col-fecha">&nbsp;</td>
              <td class="col-hora">&nbsp;</td>
              <td class="col-obs">&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div class="fmt-reg-pie">
        <div class="fmt-reg-leyenda">
          <strong>IMPORTANTE:</strong> TENGO EL CONOCIMIENTO DE CÓMO UTILIZAR MI EPP CORRECTAMENTE Y EL CUIDADO QUE REQUIERE EL MISMO. EN CASO DE REQUERIR UN REEMPLAZO SE DEBERÁ MOSTRAR EL EPP DAÑADO, LO ANTERIOR CON BASE EN LA NOM-017-STPS-2024 APARTADO 7.1 INCISO K.
        </div>
        <div class="fmt-reg-dir">
          Carretera Federal 180 Cardel-Nautla km 42.5, Mpio. Alto Lucero, Ver. CP 91680 Tel (01229) 9899090 Ext 45114/46044
        </div>
      </div>
    </div>
  )
}

// =========================================================================
// 3. FORMATO RESGUARDO ECONÓMICO (2 por hoja)
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
  const [cantContaminado, setCantContaminado] = useState(8) // Múltiplos de 4 por defecto
  const [cargandoFolio, setCargandoFolio] = useState(true)

  // Estado para Registro de Entrega
  const [hojaInicioReg, setHojaInicioReg] = useState(1)
  const [cantHojasReg, setCantHojasReg] = useState(5)

  // Estado para Resguardo Económico
  const [folioInicioResg, setFolioInicioResg] = useState(1)
  const [cantResg, setCantResg] = useState(4) // Múltiplos de 2 por defecto

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
            Genere e imprima formatos oficiales en blanco con control de folios consecutivos o cargue un PDF externo.
          </p>
        </div>
      </div>

      <div class="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
        <button
          class="chip"
          aria-pressed={tipo === 'contaminado'}
          onClick={() => setTipo('contaminado')}
        >
          <Icono n="pdf" /> EPP Contaminado (4 por hoja)
        </button>
        <button
          class="chip"
          aria-pressed={tipo === 'registro_epp'}
          onClick={() => setTipo('registro_epp')}
        >
          <Icono n="nota" /> Registro de Entrega EPP 2026 (Firmas)
        </button>
        <button
          class="chip"
          aria-pressed={tipo === 'resguardo_economico'}
          onClick={() => setTipo('resguardo_economico')}
        >
          <Icono n="equipo" /> Resguardo Económico (2 por hoja)
        </button>
        <button
          class="chip"
          aria-pressed={tipo === 'pdf_externo'}
          onClick={() => setTipo('pdf_externo')}
        >
          <Icono n="subir" /> Cargar Formato PDF con Folios
        </button>
      </div>

      {/* ---------------- PESTAÑA 1: EPP CONTAMINADO ---------------- */}
      {tipo === 'contaminado' && (
        <div class="card stack" style={{ padding: '20px', gap: '16px' }}>
          <div>
            <h3>Reporte de EPP Contaminado</h3>
            <p class="muted small">
              Formato oficial para cambio de EPP contaminado. Diseñado con visto bueno de Protección Radiológica. Caben <strong>4 formatos completos por cada hoja tamaño carta</strong>.
            </p>
          </div>

          <div class="filtros" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label class="campo">
              Unidad
              <select
                class="input"
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
                class="input"
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
              <Icono n="pdf" /> Generar e Imprimir Formatos ({cantContaminado} talones en {Math.ceil(cantContaminado / 4)} hojas)
            </button>
          </div>
        </div>
      )}

      {/* ---------------- PESTAÑA 2: REGISTRO DE ENTREGA EPP 2026 ---------------- */}
      {tipo === 'registro_epp' && (
        <div class="card stack" style={{ padding: '20px', gap: '16px' }}>
          <div>
            <h3>Registro de Entrega de EPP 2026 (Hojas de Firmas)</h3>
            <p class="muted small">
              Formato institucional con tabla completa de firmas por trabajador, área, desglose de lentes, guantes (carnaza, hyflex, nitrilo), tapones, mascarillas y leyenda oficial NOM-017-STPS-2024.
            </p>
          </div>

          <div class="filtros" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label class="campo">
              Número de hoja inicial
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
              Cantidad de hojas
              <input
                class="input"
                id="reg-cant-hojas"
                type="number"
                min={1}
                max={50}
                value={cantHojasReg}
                onInput={(e) => setCantHojasReg(Math.max(1, Math.min(50, Number((e.target as HTMLInputElement).value))))}
              />
            </label>
          </div>

          <p class="small muted">
            Cada hoja contiene 18 renglones amplios para recabar firmas del personal.
          </p>

          <div class="row">
            <button class="btn primary" onClick={() => setImprimiendo(true)}>
              <Icono n="pdf" /> Imprimir {cantHojasReg} Hoja{cantHojasReg > 1 ? 's' : ''} de Registro
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
              Vale de resguardo económico oficial No. SI-2026. Con recuadros de firma para Quien Entrega, Visto Bueno Jefe de Oficina y Recibí. Caben <strong>2 formatos por cada hoja tamaño carta</strong>.
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
                class="input"
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
              <Icono n="pdf" /> Generar e Imprimir ({cantResg} vales en {Math.ceil(cantResg / 2)} hojas)
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
                    class="input"
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
                  <Icono n="pdf" /> Imprimir PDF Cargado
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

          {/* Registro de entrega de EPP 2026: 1 página completa por hoja */}
          {tipo === 'registro_epp' &&
            Array.from({ length: cantHojasReg }, (_, i) => hojaInicioReg + i).map((numPag) => (
              <section key={numPag} class="hoja-carta-formato hoja-registro">
                <FormatoRegistroEntrega paginaNum={numPag} />
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
