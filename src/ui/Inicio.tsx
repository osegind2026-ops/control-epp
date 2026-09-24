import { useState } from 'preact/hooks'
import type { Trabajador } from '../domain/types'
import { importarRespaldo, leerPadronCSV, leerRespaldo } from '../state/respaldo'
import { guardarDispositivo, inicializarSistema } from '../state/servicios'
import * as S from '../state/store'
import { avisar, intentar } from './comunes'
import { UnirseDesdeNube } from './Nube'

function CampoEquipo(props: { codigo: string; nombre: string; onCodigo: (v: string) => void; onNombre: (v: string) => void }) {
  return (
    <>
      <label class="campo">
        Código de este equipo (1 a 4 letras o números)
        <input
          class="input"
          id="ini-codigo"
          maxLength={4}
          value={props.codigo}
          placeholder="Ej. JP1, OSI, PC1"
          onInput={(e) => props.onCodigo((e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        />
      </label>
      <label class="campo">
        Responsable o descripción del equipo
        <input class="input" id="ini-equipo" value={props.nombre} placeholder="Ej. PC de la oficina" onInput={(e) => props.onNombre((e.target as HTMLInputElement).value)} />
      </label>
      <p class="muted small">
        El código va en los folios (<span class="mono">CFE-{props.codigo || 'JP1'}-0001</span>) y debe ser distinto en cada celular o PC.
      </p>
    </>
  )
}

export function PantallaInicio() {
  const [modo, setModo] = useState<'elegir' | 'nuevo' | 'unir' | 'nube'>('elegir')
  const [codigo, setCodigo] = useState('')
  const [equipo, setEquipo] = useState('')
  const [admin, setAdmin] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [padron, setPadron] = useState<Trabajador[]>([])
  const [demo, setDemo] = useState(true)
  const [respaldoListo, setRespaldoListo] = useState(false)
  const [trabajando, setTrabajando] = useState(false)

  const leerArchivo = (e: Event, fn: (texto: string) => void) => {
    const f = (e.target as HTMLInputElement).files?.[0]
    if (!f) return
    f.text().then(fn)
  }

  const crear = async () => {
    if (!/^[A-Z0-9]{1,4}$/.test(codigo)) return avisar('Escriba un código de equipo de 1 a 4 caracteres.', { tipo: 'bad' })
    if (!equipo.trim() || !admin.trim()) return avisar('Complete el nombre del equipo y del administrador.', { tipo: 'bad' })
    if (!/^\d{4,6}$/.test(pin)) return avisar('El PIN debe tener de 4 a 6 números.', { tipo: 'bad' })
    if (pin !== pin2) return avisar('Los PIN no coinciden.', { tipo: 'bad' })
    setTrabajando(true)
    await intentar(() => inicializarSistema({ equipo: { codigo, nombre: equipo }, admin: { nombre: admin, pin }, demo, padron }))
    setTrabajando(false)
  }

  const unir = async () => {
    if (!/^[A-Z0-9]{1,4}$/.test(codigo) || !equipo.trim()) return avisar('Complete el código y el nombre de este equipo.', { tipo: 'bad' })
    const usados = new Set(S.entregas.value.map((e) => e.equipo))
    if (usados.has(codigo)) return avisar(`El código ${codigo} ya lo usa otro equipo. Elija otro.`, { tipo: 'bad' })
    await intentar(() => guardarDispositivo(codigo, equipo))
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '20px' }}>
      <div class="card stack" style={{ width: '100%', maxWidth: '520px', gap: '16px', padding: '24px' }}>
        <div class="stack" style={{ gap: '6px' }}>
          <span class="badge ok" style={{ justifySelf: 'start' }}>
            Oficina de Seguridad Industrial · CFE Laguna Verde
          </span>
          <h1>Control EPP</h1>
        </div>

        {modo === 'elegir' && (
          <>
            <p class="muted">Configuración inicial de este equipo.</p>
            <button class="btn primary block" onClick={() => setModo('nube')}>
              Unirme a la nube de la oficina
            </button>
            <button class="btn block" onClick={() => setModo('nuevo')}>
              Empezar un sistema nuevo
            </button>
            <button class="btn ghost block" onClick={() => setModo('unir')}>
              Unirme con el archivo de respaldo de otro equipo
            </button>
            <p class="muted small">
              Si la oficina ya usa la app, elija «Unirme a la nube» y tenga a la mano la URL del servidor y la clave de la oficina. «Empezar un sistema nuevo» es solo para
              el primer equipo.
            </p>
          </>
        )}

        {modo === 'nube' && <UnirseDesdeNube onAtras={() => setModo('elegir')} />}

        {modo === 'nuevo' && (
          <>
            <CampoEquipo codigo={codigo} nombre={equipo} onCodigo={setCodigo} onNombre={setEquipo} />
            <hr style={{ border: 0, borderTop: '1px solid var(--rule)', width: '100%' }} />
            <label class="campo">
              Su nombre (administrador)
              <input class="input" id="ini-admin" value={admin} onInput={(e) => setAdmin((e.target as HTMLInputElement).value)} />
            </label>
            <div class="row" style={{ alignItems: 'start' }}>
              <label class="campo grow">
                PIN (4 a 6 números)
                <input class="input" id="ini-pin" type="password" inputMode="numeric" maxLength={6} value={pin} onInput={(e) => setPin((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
              </label>
              <label class="campo grow">
                Repita el PIN
                <input class="input" id="ini-pin2" type="password" inputMode="numeric" maxLength={6} value={pin2} onInput={(e) => setPin2((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
              </label>
            </div>
            <hr style={{ border: 0, borderTop: '1px solid var(--rule)', width: '100%' }} />
            <label class="campo">
              Padrón de personal (CSV, opcional)
              <input
                class="input"
                id="ini-padron"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) =>
                  leerArchivo(e, (t) => {
                    const lista = leerPadronCSV(t)
                    setPadron(lista)
                    avisar(`${lista.length} trabajadores listos para cargar`)
                  })
                }
              />
            </label>
            <p class="muted small">
              {padron.length
                ? `Se cargarán ${padron.length} trabajadores.`
                : 'Puede usar personal_semilla.csv. También puede cargarlo después o dar de alta a cada trabajador al despachar.'}
            </p>
            <label class="check">
              <input type="checkbox" checked={demo} onChange={(e) => setDemo((e.target as HTMLInputElement).checked)} />
              Cargar existencias de ejemplo (para la demostración)
            </label>
            <div class="row">
              <button class="btn" onClick={() => setModo('elegir')}>
                Atrás
              </button>
              <button class="btn primary grow" disabled={trabajando} onClick={crear}>
                {trabajando ? 'Preparando…' : 'Crear y entrar'}
              </button>
            </div>
          </>
        )}

        {modo === 'unir' && (
          <>
            {!respaldoListo ? (
              <>
                <label class="campo">
                  Respaldo JSON del otro equipo
                  <input
                    class="input"
                    id="ini-respaldo"
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) =>
                      leerArchivo(e, async (t) => {
                        const ok = await intentar(async () => {
                          await importarRespaldo(leerRespaldo(t), 'reemplazar')
                          return true
                        })
                        if (ok) {
                          setRespaldoListo(true)
                          avisar('Respaldo cargado')
                        }
                      })
                    }
                  />
                </label>
                <button class="btn" onClick={() => setModo('elegir')}>
                  Atrás
                </button>
              </>
            ) : (
              <>
                <div class="aviso info">
                  Respaldo cargado: {S.usuarios.value.length} usuarios, {S.personal.value.size} trabajadores, {S.entregas.value.length} entregas.
                </div>
                <CampoEquipo codigo={codigo} nombre={equipo} onCodigo={setCodigo} onNombre={setEquipo} />
                <button class="btn primary block" onClick={unir}>
                  Guardar y entrar
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
