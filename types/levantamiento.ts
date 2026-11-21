// ─── Levantamiento Técnico Eléctrico — Types ─────────────────────────────────

interface TableroRow {
  _id: string;
  nombre: string;
  tipo: string;
  ubicacion: string;
  marca: string;
  circuitos: string;
  proteccion: string;
  estado: string;
  espacio: string;
  obs: string;
}

interface CircuitoRow {
  _id: string;
  circuito: string;
  proteccion: string;
  cableado: string;
  canalizacion: string;
  uso: string;
  estado: string;
  obs: string;
}

interface LevantamientoData {
  // S1
  cliente_nombre: string;
  empresa: string;
  direccion: string;
  fecha: string;
  hora: string;
  contacto: string;
  telefono: string;
  correo: string;
  tecnico: string;
  tipo_proyecto: string;
  obs_generales: string;
  // S2
  sistema: string;
  voltaje: string;
  tipo_empalme: string;
  capacidad_empalme: string;
  estado_empalme: string;
  tierra: boolean;
  grupo_electrogeno: boolean;
  ups: boolean;
  obs_electrica: string;
  // S3
  tableros: TableroRow[];
  // S4
  circuitos: CircuitoRow[];
  // S5
  ilum_tipo: string;
  ilum_cantidad: string;
  ilum_estado: string;
  ilum_emergencia: boolean;
  ilum_obs: string;
  // S6
  enchufes_cantidad: string;
  enchufes_tipo: string;
  enchufes_estado: string;
  enchufes_fuerza: boolean;
  enchufes_equipos: string;
  enchufes_obs: string;
  // S7
  canal_emt: boolean;
  canal_pvc: boolean;
  canal_bandeja: boolean;
  canal_escalerilla: boolean;
  canal_estado: string;
  canal_saturacion: string;
  canal_obs: string;
  // S8
  checklist: Record<string, boolean>;
  // S9
  med_v_r: string;
  med_v_s: string;
  med_v_t: string;
  med_i_r: string;
  med_i_s: string;
  med_i_t: string;
  med_balance: string;
  med_tierra: string;
  med_temp: string;
  med_obs: string;
  // S10
  recomendaciones: string;
  // S12
  alcance_trabajos: string;
  alcance_mejoras: string;
  alcance_mantenciones: string;
  alcance_obs_comerciales: string;
  // Fotos de la visita (Storage privado). Opcional: levantamientos antiguos no tienen.
  fotos?: { path: string; caption: string }[];
}

export type EstadoLevantamiento = 'Borrador' | 'Completado' | 'Enviado' | 'Archivado';

export interface Levantamiento {
  id: string;
  folio: number;
  cliente_id?: string | null;
  data: LevantamientoData;
  estado: EstadoLevantamiento;
  created_at: string;
  updated_at?: string;
}
