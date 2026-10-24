// ─── Módulo Agenda — Types ───────────────────────────────────────────────────
import type { Cliente } from '@/types';
import type { TipoServicio } from '@/types/solicitud';

export type ResponsableAgenda = 'Cesar' | 'Joaquin' | 'Ambos';

export type EstadoAgenda =
  | 'Agendada'
  | 'Confirmada'
  | 'Realizada'
  | 'Reprogramada'
  | 'Cancelada';

export interface Agendamiento {
  id: string;
  folio: number;
  cliente_id: string | null;
  clientes?: Cliente | null;                    // join
  solicitud_id: string | null;
  solicitudes?: { id: string; folio: number } | null; // join
  ot_id?: string | null;                       // OT que originó la cita
  titulo: string;
  direccion: string | null;
  fecha: string;                                // YYYY-MM-DD
  hora_inicio: string | null;                   // HH:MM(:SS)
  hora_fin: string | null;
  responsable: ResponsableAgenda;
  tipos_servicio: TipoServicio[];
  estado: EstadoAgenda;
  notas: string | null;
  /** Fase 7: lo que se vio en la visita y sus fotos (pasan a la cotización). */
  notas_visita?: string | null;
  fotos?: { path: string; caption: string }[];
  /** Fase 8: el informe de la visita, llenado con una plantilla. */
  informe?: import('@/services/informes').InformeLleno | null;
  /** Fase 10: el técnico encargado (usuario): la ve en Inicio y llena sus informes. */
  tecnico_id?: string | null;
  /** Fase 15: quién recibe en el lugar (si no es el contacto del cliente). */
  contacto_sitio?: string | null;
  telefono_sitio?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const RESPONSABLE_OPCIONES: { key: ResponsableAgenda; label: string }[] = [
  { key: 'Cesar',   label: 'César' },
  { key: 'Joaquin', label: 'Joaquín' },
  { key: 'Ambos',   label: 'Ambos' },
];

export const RESPONSABLE_LABEL: Record<ResponsableAgenda, string> = {
  Cesar: 'César', Joaquin: 'Joaquín', Ambos: 'Ambos',
};

export const RESPONSABLE_META: Record<ResponsableAgenda, { color: string; bg: string }> = {
  Cesar:   { color: 'var(--y)',       bg: 'var(--y-soft)' },
  Joaquin: { color: 'var(--info)',    bg: 'var(--info-soft)' },
  Ambos:   { color: 'var(--success)', bg: 'var(--success-soft)' },
};

export const ESTADOS_AGENDA: EstadoAgenda[] = [
  'Agendada', 'Confirmada', 'Realizada', 'Reprogramada', 'Cancelada',
];

export const ESTADO_AGENDA_META: Record<EstadoAgenda, { color: string; bg: string }> = {
  Agendada:     { color: 'var(--y)',       bg: 'var(--y-soft)' },
  Confirmada:   { color: 'var(--info)',    bg: 'var(--info-soft)' },
  Realizada:    { color: 'var(--success)', bg: 'var(--success-soft)' },
  Reprogramada: { color: 'var(--muted)',   bg: 'var(--hover-bg)' },
  Cancelada:    { color: 'var(--danger)',  bg: 'rgba(220,38,38,0.08)' },
};
