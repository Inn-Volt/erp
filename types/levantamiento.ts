// ─── Levantamiento Técnico Eléctrico — Types ─────────────────────────────────

export interface TableroRow {
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

export interface CircuitoRow {
  _id: string;
  circuito: string;
  proteccion: string;
  cableado: string;
  canalizacion: string;
  uso: string;
  estado: string;
  obs: string;
}

export interface LevantamientoData {
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

export const ESTADO_LEV_COLORS: Record<EstadoLevantamiento, { color: string; bg: string }> = {
  Borrador:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)'  },
  Completado: { color: '#4ade80', bg: 'rgba(74,222,128,0.1)'  },
  Enviado:    { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)'  },
  Archivado:  { color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
};

export const CHECKLIST_CRITICO = [
  { id: 'sobrecarga',    label: 'Sobrecarga detectada'           },
  { id: 'recalentam',   label: 'Cables recalentados'            },
  { id: 'falta_tierra', label: 'Falta de tierra física'         },
  { id: 'diferencial',  label: 'Diferenciales defectuosos'      },
  { id: 'humedad',      label: 'Presencia de humedad'           },
  { id: 'corrosion',    label: 'Corrosión en bornes/tableros'   },
  { id: 'neutros',      label: 'Neutros compartidos indebidamente' },
  { id: 'sin_rotulo',   label: 'Tableros sin rotulación'        },
  { id: 'canal_danada', label: 'Canalizaciones dañadas/abiertas'},
  { id: 'riesgo_elec',  label: 'Riesgo eléctrico inmediato'     },
];

export const TIPOS_PROYECTO = [
  'Visita técnica', 'Anteproyecto', 'Cotización', 'Mantención preventiva',
  'Mantención correctiva', 'Levantamiento comercial', 'Levantamiento industrial',
  'Instalación nueva', 'Ampliación', 'Certificación SEC',
];
export const TIPOS_EMPALME = ['Aéreo', 'Subterráneo', 'No aplica'];
export const ESTADOS_GEN   = ['Bueno', 'Regular', 'Deficiente', 'Sin revisar'];
export const TIPOS_TABLERO = ['TG', 'TDA', 'TGAux', 'TSAS', 'TSub', 'Otro'];
export const TIPOS_CABLE   = ['Thhn', 'Imsa', 'Lsh', 'Vulcanizado', 'No identificado'];
export const TIPOS_CANAL   = ['EMT', 'PVC', 'Bandeja perforada', 'Escalerilla', 'Conduit flexible', 'Sin canalización'];
export const TIPOS_LUM     = ['LED', 'Fluorescente', 'HID', 'Halógena', 'Mixta'];
export const SISTEMAS_ELEC = ['Monofásico', 'Trifásico', 'Bifásico'];

export const emptyLevantamiento = (): LevantamientoData => ({
  cliente_nombre:'', empresa:'', direccion:'',
  fecha: new Date().toISOString().slice(0,10),
  hora: new Date().toTimeString().slice(0,5),
  contacto:'', telefono:'', correo:'', tecnico:'',
  tipo_proyecto:'', obs_generales:'',
  sistema:'', voltaje:'', tipo_empalme:'', capacidad_empalme:'',
  estado_empalme:'', tierra:false, grupo_electrogeno:false, ups:false, obs_electrica:'',
  tableros:[], circuitos:[],
  ilum_tipo:'', ilum_cantidad:'', ilum_estado:'', ilum_emergencia:false, ilum_obs:'',
  enchufes_cantidad:'', enchufes_tipo:'', enchufes_estado:'', enchufes_fuerza:false,
  enchufes_equipos:'', enchufes_obs:'',
  canal_emt:false, canal_pvc:false, canal_bandeja:false, canal_escalerilla:false,
  canal_estado:'', canal_saturacion:'', canal_obs:'',
  checklist:{},
  med_v_r:'', med_v_s:'', med_v_t:'', med_i_r:'', med_i_s:'', med_i_t:'',
  med_balance:'', med_tierra:'', med_temp:'', med_obs:'',
  recomendaciones:'',
  alcance_trabajos:'', alcance_mejoras:'', alcance_mantenciones:'', alcance_obs_comerciales:'',
});
