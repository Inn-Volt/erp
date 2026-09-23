// ─── Módulo Solicitudes — Types ──────────────────────────────────────────────
import type { CategoriaItem, Cliente } from '@/types';

export type PrioridadSolicitud = 'Baja' | 'Media' | 'Alta' | 'Urgente';

export type EstadoSolicitud =
  | 'NUEVA'
  | 'EN_REVISION'
  | 'ANALIZADA_IA'
  | 'PENDIENTE_INFO'
  | 'LISTA_COTIZAR'
  | 'COTIZACION_GENERADA'
  | 'CERRADA'
  | 'CANCELADA'
  | 'NO_VIABLE';

/** Claves canónicas de tipo de servicio (se guardan en el array tipos_servicio). */
export type TipoServicio =
  | 'electricidad'
  | 'control_acceso'
  | 'cctv'
  | 'redes'
  | 'domotica'
  | 'citofonia'
  | 'energias_renovables'
  | 'iluminacion'
  | 'mantencion'
  | 'otro';

/** Resultado estructurado del análisis de IA. NO contiene precios finales. */
export interface AnalisisIA {
  resumen: string;
  necesidades: { titulo: string; detalle: string; tipo_servicio?: string }[];
  items_sugeridos: { descripcion: string; categoria: CategoriaItem; cantidad_sugerida: number; unidad: string }[];
  informacion_faltante: { pregunta: string; por_que: string }[];
  generado_at: string;
}

export interface HistorialEntry { fecha: string; texto: string; }

export interface Solicitud {
  id: string;
  folio: number;
  cliente_id: string | null;
  clientes?: Cliente | null;               // join
  contacto: string | null;
  descripcion: string;
  tipos_servicio: TipoServicio[];
  prioridad: PrioridadSolicitud;
  fecha_requerida: string | null;
  info_adicional: string | null;
  observaciones: string | null;
  estado: EstadoSolicitud;
  analisis_ia: AnalisisIA | null;
  cotizacion_id: string | null;
  cotizaciones?: { id: string; folio: number; estado: string } | null; // join
  historial: HistorialEntry[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Etiquetas y colores (usan las CSS vars del ERP) ──────────────────────────

export const TIPO_SERVICIO_OPCIONES: { key: TipoServicio; label: string }[] = [
  { key: 'electricidad',        label: 'Electricidad' },
  { key: 'control_acceso',      label: 'Control de acceso' },
  { key: 'cctv',                label: 'CCTV' },
  { key: 'redes',               label: 'Redes / Datos' },
  { key: 'domotica',            label: 'Domótica / Automatización' },
  { key: 'citofonia',           label: 'Citofonía' },
  { key: 'energias_renovables', label: 'Energías renovables' },
  { key: 'iluminacion',         label: 'Iluminación / LED' },
  { key: 'mantencion',          label: 'Mantención' },
  { key: 'otro',                label: 'Otro' },
];

export const TIPO_SERVICIO_LABEL: Record<TipoServicio, string> =
  Object.fromEntries(TIPO_SERVICIO_OPCIONES.map(o => [o.key, o.label])) as Record<TipoServicio, string>;

export const PRIORIDAD_META: Record<PrioridadSolicitud, { color: string; bg: string }> = {
  Baja:    { color: 'var(--muted)',   bg: 'var(--hover-bg)' },
  Media:   { color: 'var(--info)',    bg: 'var(--info-soft)' },
  Alta:    { color: 'var(--y)',       bg: 'var(--y-soft)' },
  Urgente: { color: 'var(--danger)',  bg: 'rgba(220,38,38,0.08)' },
};

export const ESTADO_SOLICITUD_META: Record<EstadoSolicitud, { label: string; color: string; bg: string }> = {
  NUEVA:               { label: 'Nueva',                color: 'var(--info)',    bg: 'var(--info-soft)' },
  EN_REVISION:         { label: 'En revisión',          color: 'var(--y)',       bg: 'var(--y-soft)' },
  ANALIZADA_IA:        { label: 'Analizada por IA',      color: 'var(--y)',       bg: 'var(--y-soft)' },
  PENDIENTE_INFO:      { label: 'Pendiente de info',     color: 'var(--danger)',  bg: 'rgba(220,38,38,0.08)' },
  LISTA_COTIZAR:       { label: 'Lista para cotizar',    color: 'var(--success)', bg: 'var(--success-soft)' },
  COTIZACION_GENERADA: { label: 'Cotización generada',   color: 'var(--success)', bg: 'var(--success-soft)' },
  CERRADA:             { label: 'Cerrada',               color: 'var(--muted)',   bg: 'var(--hover-bg)' },
  CANCELADA:           { label: 'Cancelada',             color: 'var(--muted)',   bg: 'var(--hover-bg)' },
  NO_VIABLE:           { label: 'No viable',             color: 'var(--danger)',  bg: 'rgba(220,38,38,0.08)' },
};

/** Orden de estados para el selector (flujo natural). */
export const ESTADOS_SOLICITUD: EstadoSolicitud[] = [
  'NUEVA', 'EN_REVISION', 'ANALIZADA_IA', 'PENDIENTE_INFO',
  'LISTA_COTIZAR', 'COTIZACION_GENERADA', 'CERRADA', 'CANCELADA', 'NO_VIABLE',
];
