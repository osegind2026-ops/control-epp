import type { JSX } from 'preact'

const trazo = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const

// Ilustraciones de respaldo para materiales sin foto.
const MATERIAL: Record<string, JSX.Element> = {
  casco: <path {...trazo} d="M3 17h18M5 17a7 7 0 0 1 14 0M10 7.5V12M14 7.5V12M9.5 7.2a7 7 0 0 1 5 0" />,
  barbiquejo: <path {...trazo} d="M6 5c0 9 2.5 13 6 13s6-4 6-13M9 18.5l-1 2.5M15 18.5l1 2.5" />,
  arnescasco: (
    <g {...trazo}>
      <ellipse cx="12" cy="12" rx="8" ry="4.5" />
      <path d="M4 12v2M20 12v2M9 7.8v8.4M15 7.8v8.4" />
    </g>
  ),
  lentes: (
    <g {...trazo}>
      <circle cx="7" cy="13" r="3.5" />
      <circle cx="17" cy="13" r="3.5" />
      <path d="M10.5 12.5h3M3.5 12 2 9M20.5 12 22 9" />
    </g>
  ),
  cubrelentes: <path {...trazo} d="M3 10h18v4.5a3 3 0 0 1-3 3h-3l-3-2.5-3 2.5H6a3 3 0 0 1-3-3z" />,
  careta: <path {...trazo} d="M4 6h16M5 6l1 11a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3l1-11M4 6l2-2h12l2 2" />,
  guante: (
    <path
      {...trazo}
      d="M7 21v-8L5 9.5a1.2 1.2 0 0 1 2-1.3L9 11V4.5a1.2 1.2 0 0 1 2.4 0V10V3.5a1.2 1.2 0 0 1 2.4 0V10V4.5a1.2 1.2 0 0 1 2.4 0V11V7a1.2 1.2 0 0 1 2.4 0v8a6 6 0 0 1-3 5.2V21z"
    />
  ),
  tapones: (
    <g {...trazo}>
      <rect x="4" y="6" width="6" height="12" rx="3" />
      <rect x="14" y="6" width="6" height="12" rx="3" />
      <path d="M10 12h4" />
    </g>
  ),
  mascarilla: (
    <g {...trazo}>
      <path d="M5 9c3-3 11-3 14 0v4c0 4-4 6-7 6s-7-2-7-6z" />
      <path d="M5 10 2 8M19 10l3-2M9 13h6" />
    </g>
  ),
  faja: (
    <g {...trazo}>
      <rect x="3" y="8" width="18" height="8" rx="1.5" />
      <path d="M9 8v8M15 8v8M11 12h2" />
    </g>
  ),
  arnes: <path {...trazo} d="M8 3v5l4 4 4-4V3M12 12v3M7 21l5-6 5 6M5 9h14" />,
  linea: <path {...trazo} d="M6 4a3 3 0 0 1 6 0v3M9 7v3M9 10c0 6 6 4 6 10M15 20h3" />,
  caja: <path {...trazo} d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9" />,
}

export const ICONOS_MATERIAL = Object.keys(MATERIAL)

export function IlustracionMaterial({ icono }: { icono?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {MATERIAL[icono ?? 'caja'] ?? MATERIAL.caja}
    </svg>
  )
}

// Íconos de interfaz
const UI: Record<string, JSX.Element> = {
  despacho: <path {...trazo} d="M4 7h16l-1.5 12a2 2 0 0 1-2 1.8h-9a2 2 0 0 1-2-1.8zM9 7V5a3 3 0 0 1 6 0v2" />,
  devolucion: <path {...trazo} d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />,
  inventario: <path {...trazo} d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9" />,
  historial: <path {...trazo} d="M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4" />,
  mas: <path {...trazo} d="M5 12h.01M12 12h.01M19 12h.01" stroke-width={3} />,
  reportes: <path {...trazo} d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  catalogo: <path {...trazo} d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  personal: <path {...trazo} d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-4-5.6" />,
  ajustes: (
    <g {...trazo}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </g>
  ),
  buscar: <path {...trazo} d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5" />,
  camara: (
    <g {...trazo}>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </g>
  ),
  cerrar: <path {...trazo} d="M6 6l12 12M18 6 6 18" />,
  mas1: <path {...trazo} d="M12 5v14M5 12h14" />,
  menos: <path {...trazo} d="M5 12h14" />,
  ok: <path {...trazo} d="m5 12 5 5L20 7" />,
  alerta: <path {...trazo} d="M12 3 2 20h20zM12 10v4M12 17h.01" />,
  info: <path {...trazo} d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7h.01" />,
  candado: (
    <g {...trazo}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </g>
  ),
  repetir: <path {...trazo} d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5" />,
  kit: <path {...trazo} d="M4 8h16v12H4zM9 8V5h6v3M4 13h16" />,
  traspaso: <path {...trazo} d="M4 8h14l-3-3M20 16H6l3 3" />,
  entrada: <path {...trazo} d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  ajuste: <path {...trazo} d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4" />,
  descarga: <path {...trazo} d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  subir: <path {...trazo} d="M12 21V9M7 14l5-5 5 5M4 3h16" />,
  nota: <path {...trazo} d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5" />,
  editar: <path {...trazo} d="M4 20h4L20 8l-4-4L4 16zM13.5 6.5l4 4" />,
  basura: <path {...trazo} d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
}

export function Icono({ n, titulo }: { n: string; titulo?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden={titulo ? undefined : 'true'} role={titulo ? 'img' : undefined}>
      {titulo && <title>{titulo}</title>}
      {UI[n] ?? UI.info}
    </svg>
  )
}
