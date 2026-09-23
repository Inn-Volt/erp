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
  titulo: string;
  direccion: string | null;
  fecha: string;                                // YYYY-MM-DD
  hora_inicio: string | null;                   // HH:MM(:SS)
  hora_fin: string | null;
  responsable: ResponsableAgenda;
  tipos_servicio: TipoServicio[];
  estado: EstadoAgenda;
  notas: string | null;
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
