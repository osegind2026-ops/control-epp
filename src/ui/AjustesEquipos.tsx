import { useState } from 'preact/hooks'
import type { ObsEquipo, PersonalSI, TipoObsEquipo } from '../domain/types'
import { normalizar, plural } from '../lib/util'
import { AJUSTE_HORAS_ALERTA, cortoSugerido, guardarAjuste, guardarObsEquipo, guardarPersonalSI, horasAlerta } from '../state/equipos'
import { esAdmin, puedeInventario } from '../state/permisos'
import * as S from '../state/store'
import { avisar, intentar, Modal } from './comunes'
import { Icono } from './iconos'
import { BuscadorTrabajador } from './Trabajador'

const TIPOS: Record<TipoObsEquipo, string> = { ok: 'Sin novedad', detalle: 'Detalle', dano: 'Daño (pide foto)' }

/** Alta o edición de un botón de Seguridad Industrial: la persona sale del padrón. */
function EditorSI({ inicial, rpe, onCerrar }: { inicial?: PersonalSI; rpe?: string; onCerrar: () => void }) {
  const rpeFinal = inicial?.rpe ?? rpe ?? ''
  const trabajador = rpeFinal ? S.personal.value.get(rpeFinal) : undefined
  const [corto, setCorto] = useState(inicial?.corto ?? (trabajador ? cortoSugerido(trabajador.nombre) : ''))
  const [usuarioId, setUsuarioId] = useState(inicial?.usuarioId ?? '')
  const [activo, setActivo] = useState(inicial?.activo ?? true)
  const nombre = trabajador?.nombre ?? inicial?.nombre ?? ''

  const guardar = async () => {
    const ok = await intentar(async () => {
      await guardarPersonalSI({ id: inicial?.id, rpe: rpeFinal, corto, usuarioId, activo })
      return true
    })
    if (ok) {
      avisar('✓ Guardado')
      onCerrar()
    }
  }
  return (
    <Modal
      titulo={inicial ? 'Editar botón' : 'Nuevo botón'}
      onCerrar={onCerrar}
      acciones={
        <>
          <button class="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button class="btn primary" disabled={!corto.trim()} onClick={guardar}>
            Guardar
          </button>
        </>
      }
    >
      <div class="card" style={{ padding: '10px' }}>
        <strong>{nombre}</strong>
        <div class="muted small">
          <span class="mono">{rpeFinal}</span> · {trabajador?.area ?? 'Sin área'}
        </div>
      </div>
      <label class="campo">
        Nombre corto del botón
        <input class="input" id="si-corto" maxLength={18} value={corto} onInput={(e) => setCorto((e.target as HTMLInputElement).value)} />
      </label>
      <label class="campo">
        Usuario de la app (opcional)
        <select class="input" id="si-usuario" value={usuarioId} onChange={(e) => setUsuarioId((e.target as HTMLSelectElement).value)}>
          <option value="">Ninguno</option>
          {S.usuariosActivos.value.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
        <span class="muted small" style={{ fontWeight: 400 }}>Si esa persona tiene la sesión abierta, su botón sale ya marcado.</span>
      </label>
      <label class="check">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo((e.target as HTMLInputElement).checked)} />
        Aparece como botón
      </label>
    </Modal>
  )
}

function PersonalSeguridad() {
  const [editar, setEditar] = useState<PersonalSI | null>(null)
  const [nuevo, setNuevo] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)
  const lista = [...S.personalSI.value].sort((a, b) => Number(b.activo) - Number(a.activo) || a.corto.localeCompare(b.corto))
  const yaEsta = new Set(S.personalSI.value.map((x) => x.rpe))
  // Personas del área de Seguridad Industrial que aún no son botón
  const sugeridos = [...S.personal.value.values()].filter((t) => t.activo && normalizar(t.area).includes('seguridad industrial') && !yaEsta.has(t.rpe))
  return (
    <div class="stack" style={{ gap: '10px' }}>
      <h3>Personal de Seguridad Industrial</h3>
      <p class="muted small">
        Son los botones con nombre corto que aparecen al prestar, recibir o transferir un equipo (los usados más recientemente salen primero). Las personas se toman del padrón; si alguien no está, búsquelo o dé de alta al trabajador.
      </p>
      <div class="chips">
        {lista.map((x) => (
          <button key={x.id} class="chip chip-si" style={{ opacity: x.activo ? 1 : 0.5 }} onClick={() => setEditar(x)} title={x.nombre}>
            {x.corto}
            {!x.activo && ' (oculto)'} <Icono n="editar" />
          </button>
        ))}
        {!lista.length && <span class="muted small">Aún no hay botones: sin lista, los movimientos quedan a nombre de quien tiene la sesión abierta.</span>}
      </div>
      {sugeridos.length > 0 && (
        <div class="stack" style={{ gap: '6px' }}>
          <strong class="small">Del área de Seguridad Industrial en el padrón ({sugeridos.length}) · toque para agregar</strong>
          <div class="chips">
            {sugeridos.map((t) => (
              <button key={t.rpe} class="chip" onClick={() => setNuevo(t.rpe)} title={t.nombre}>
                + {t.nombre.split(' ').slice(0, 2).join(' ')}
              </button>
            ))}
          </div>
        </div>
      )}
      {!sugeridos.length && !lista.length && <p class="muted small">No hay trabajadores del área «Seguridad Industrial» en el padrón. Agréguelos con el botón de abajo.</p>}
      <div class="row">
        <button class="btn" onClick={() => setBuscando(true)}>
          <Icono n="mas1" /> Agregar otra persona del padrón
        </button>
      </div>
      {buscando && (
        <Modal titulo="Elegir persona" onCerrar={() => setBuscando(false)}>
          <BuscadorTrabajador
            autoFocus={false}
            onElegir={(t) => {
              setBuscando(false)
              setNuevo(t.rpe)
            }}
          />
        </Modal>
      )}
      {nuevo && <EditorSI rpe={nuevo} onCerrar={() => setNuevo(null)} />}
      {editar && <EditorSI inicial={editar} onCerrar={() => setEditar(null)} />}
    </div>
  )
}

function FilaObs({ o }: { o: ObsEquipo }) {
  const guardar = (cambios: Partial<ObsEquipo>) => intentar(() => guardarObsEquipo({ id: o.id, texto: o.texto, tipo: o.tipo, activo: o.activo, ...cambios }))
  return (
    <div class="row" style={{ flexWrap: 'nowrap', gap: '6px', alignItems: 'center' }}>
      <input
        class="input grow"
        aria-label="Texto de la observación"
        maxLength={80}
        defaultValue={o.texto}
        onBlur={(e) => {
          const v = (e.target as HTMLInputElement).value
          if (v.trim() && v.trim() !== o.texto) guardar({ texto: v })
          else (e.target as HTMLInputElement).value = o.texto
        }}
      />
      <select class="input" style={{ width: '150px', flex: 'none' }} aria-label="Gravedad" value={o.tipo} onChange={(e) => guardar({ tipo: (e.target as HTMLSelectElement).value as TipoObsEquipo })}>
        {(Object.keys(TIPOS) as TipoObsEquipo[]).map((t) => (
          <option key={t} value={t}>
            {TIPOS[t]}
          </option>
        ))}
      </select>
      <label class="check small" style={{ flex: 'none' }}>
        <input type="checkbox" checked={o.activo} onChange={(e) => guardar({ activo: (e.target as HTMLInputElement).checked })} />
        Visible
      </label>
    </div>
  )
}

function ObservacionesRapidas() {
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<TipoObsEquipo>('detalle')
  const lista = [...S.obsEquipo.value].sort((a, b) => Number(b.activo) - Number(a.activo) || a.texto.localeCompare(b.texto))
  const agregar = async () => {
    const ok = await intentar(async () => {
      await guardarObsEquipo({ texto, tipo, activo: true })
      return true
    })
    if (ok) setTexto('')
  }
  return (
    <div class="stack" style={{ gap: '8px' }}>
      <h3>Observaciones rápidas de equipos</h3>
      <p class="muted small">
        Opciones para anotar la condición de un equipo al entregarlo o recibirlo. Las que se escriben al registrar un movimiento se agregan solas aquí. Las marcadas como «Daño» piden una foto y dejan el equipo «En revisión» al devolverlo. {plural(lista.length, 'opción', 'opciones')}.
      </p>
      {lista.map((o) => (
        <FilaObs key={o.id + o.actualizado} o={o} />
      ))}
      <div class="row" style={{ flexWrap: 'nowrap', gap: '6px' }}>
        <input
          class="input grow"
          id="obs-nueva"
          placeholder="Nueva opción"
          maxLength={80}
          value={texto}
          onInput={(e) => setTexto((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && agregar()}
        />
        <select class="input" style={{ width: '150px', flex: 'none' }} aria-label="Gravedad de la nueva opción" value={tipo} onChange={(e) => setTipo((e.target as HTMLSelectElement).value as TipoObsEquipo)}>
          {(Object.keys(TIPOS) as TipoObsEquipo[]).map((t) => (
            <option key={t} value={t}>
              {TIPOS[t]}
            </option>
          ))}
        </select>
        <button class="btn" disabled={!texto.trim()} onClick={agregar}>
          Agregar
        </button>
      </div>
    </div>
  )
}

function AlertaTiempo() {
  const [horas, setHoras] = useState(String(horasAlerta()))
  const n = Number(horas)
  const valido = horas.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 720
  return (
    <div class="stack" style={{ gap: '8px' }}>
      <h3>Alerta de equipo sin devolver</h3>
      <p class="muted small">
        Como el préstamo ya no lleva fecha de regreso, un equipo se marca «sin devolver» cuando pasa más de este tiempo fuera de la oficina: aviso en pantalla, punto en el menú y correo diario. Escriba 0 para no alertar. Aplica a todos los equipos de la oficina.
      </p>
      <div class="row" style={{ flexWrap: 'nowrap', gap: '6px', alignItems: 'end' }}>
        <label class="campo" style={{ width: '160px' }}>
          Horas fuera
          <input class="input" id="horas-alerta" inputMode="numeric" value={horas} onInput={(e) => setHoras((e.target as HTMLInputElement).value.replace(/[^0-9]/g, ''))} />
        </label>
        <button
          class="btn primary"
          disabled={!valido || n === horasAlerta()}
          onClick={async () => {
            const ok = await intentar(async () => {
              await guardarAjuste(AJUSTE_HORAS_ALERTA, n)
              return true
            })
            if (ok) avisar(n ? `✓ Alerta tras ${n} horas fuera` : '✓ Sin alertas por tiempo')
          }}
        >
          Guardar
        </button>
      </div>
    </div>
  )
}

/** Ajustes del préstamo de equipos. El administrador ve todo; el encargado de almacén solo las observaciones rápidas. */
export function AjustesEquipos() {
  if (!puedeInventario()) return null
  return (
    <section class="card stack" style={{ gap: '18px' }}>
      <h2>Equipos a resguardo</h2>
      {esAdmin() && <PersonalSeguridad />}
      <ObservacionesRapidas />
      {esAdmin() && <AlertaTiempo />}
    </section>
  )
}
