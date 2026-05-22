// ─── Entidades principales ────────────────────────────────────────────────────

export interface Cliente {
  id: string;
  nombre_cliente: string;
  empresa?: string;
  rut: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  contacto_nombre?: string;
  notas?: string;
  estado: 'activo' | 'inactivo';
  created_at?: string;
  updated_at?: string;
}

export type CategoriaItem = 'material' | 'mano_obra' | 'servicio';

export interface CotizacionItem {
  id: string;
  descripcion: string;
  categoria: CategoriaItem;
  cantidad: number;
  unidad: string;
  costo: number;          // costo interno (no visible al cliente)
  margen: number;         // porcentaje margen (ej. 30 = 30%)
  precio: number;         // precio venta al cliente
  iva_incluido: boolean;  // si precio ya incluye IVA
  esMaterial: boolean;    // legacy compat: true = material, false = MO/servicio
}

export type EstadoCotizacion = 'Pendiente' | 'Aceptado' | 'Realizado' | 'Rechazado' | 'Entregado';

export interface Cotizacion {
  id: string;
  folio: number;
  cliente_id: string;
  clientes?: Cliente;
  items: CotizacionItem[];
  subtotal: number;
  iva: number;
  total: number;
  descuento_global: number;
  descripcion_general?: string;
  condiciones_servicio?: string;
  condiciones_comerciales?: string;
  ocultar_suministros: boolean;
  estado: EstadoCotizacion;
  created_at: string;
  updated_at?: string;
}

export interface ConfiguracionEmpresa {
  id: number;
  nombre: string;
  rut: string;
  giro: string;
  direccion: string;
  telefono: string;
  email: string;
  web?: string;
  iva_porcentaje: number;
  moneda: string;
  proximo_folio: number;
  condiciones_default: string;
  garantia_default: string;
  updated_at?: string;
  
}

// ─── KPIs Dashboard ───────────────────────────────────────────────────────────

export interface KpiData {
  total_cotizaciones: number;
  venta_acumulada: number;
  pendiente_pipeline: number;
  aceptadas: number;
}

// ─── Utilidades UI ────────────────────────────────────────────────────────────

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

export const ESTADOS_ACTIVOS: EstadoCotizacion[] = ['Aceptado', 'Realizado', 'Entregado'];
export const ESTADOS_PIPELINE: EstadoCotizacion[] = ['Pendiente'];
export const ESTADOS_TODOS: EstadoCotizacion[] = ['Pendiente', 'Aceptado', 'Realizado', 'Rechazado', 'Entregado'];

export const ESTADO_COLORS: Record<EstadoCotizacion, { color: string; bg: string }> = {
  Realizado: { color: '#4ade80', bg: 'rgba(74,222,128,0.10)' },
  Aceptado:  { color: '#60a5fa', bg: 'rgba(96,165,250,0.10)' },
  Entregado: { color: '#a78bfa', bg: 'rgba(167,139,250,0.10)' },
  Pendiente: { color: '#ffc600', bg: 'rgba(255,198,0,0.10)' },
  Rechazado: { color: '#f87171', bg: 'rgba(248,113,113,0.10)' },
};

export const CATEGORIA_LABELS: Record<CategoriaItem, string> = {
  material:   'Material',
  mano_obra:  'Mano de Obra',
  servicio:   'Servicio',
};

export const UNIDADES = ['un', 'ml', 'gl', 'm', 'm²', 'kg', 'hr', 'día', 'mes', 'global', 'pt'];

export const INNVOLT_INFO = {
  nombre: 'InnVolt SpA',
  rut: '78.299.986-9',
  giro: 'Servicios Eléctricos y Tecnológicos',
  direccion: 'Santiago, Chile',
  telefono: '+56 9 6657 5447',
  email: 'innvolt.cl@gmail.com',
  web: 'www.innvolt.cl',
};
