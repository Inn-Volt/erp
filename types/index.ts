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

export type CategoriaItem = 'material' | 'mano_obra' | 'servicio' | 'operacion';

/**
 * Ítem de cotización — replica una fila de las hojas de presupuesto del Excel
 * "Gestion de proyecto.xlsx".
 *
 * Cadena de cálculo (idéntica al Excel):
 *   Costo Total    = costo × cantidad                    (H = F*G)
 *   Costo c/Imprev = Costo Total × (1 + imprevistos)     (J = H*(1+I))
 *   Precio Venta   = Costo c/Imprev / (1 − margen)       (L = J/(1-K))
 *   P.V. + IVA     = Precio Venta × (1 + iva)            (M = L*(1+IVA))
 *
 * `precio` se guarda como PRECIO UNITARIO neto de venta, de modo que
 * precio × cantidad === Precio Venta del Excel.
 */
export interface CotizacionItem {
  id: string;
  descripcion: string;
  categoria: CategoriaItem;
  cantidad: number;
  unidad: string;
  costo: number;          // costo unitario interno (no visible al cliente)
  imprevistos: number;    // % contingencia (ej. 20 = 20%)
  margen: number;         // % margen de utilidad (ej. 40 = 40%)
  precio: number;         // precio venta unitario NETO (calculado)
  iva: number;            // % IVA aplicado a este ítem (ej. 19 = 19%)
  descuento?: number;     // % descuento sobre el precio de venta de esta línea

  // ── Compatibilidad con cotizaciones antiguas ──
  /** @deprecated Reemplazado por `iva` (%). Se normaliza al cargar. */
  iva_incluido?: boolean;
  /** @deprecated Reemplazado por `categoria`. Se normaliza al cargar. */
  esMaterial?: boolean;
}

// ─── Supuestos globales (fila "SUPUESTOS GLOBALES" de cada hoja del Excel) ────

export interface SupuestosCategoria {
  margen: number;       // % utilidad
  imprevistos: number;  // % contingencia
  iva: number;          // % IVA
}

export type Supuestos = Record<CategoriaItem, SupuestosCategoria>;

/**
 * Valores por defecto tomados literalmente del Excel de InnVolt:
 *  · Presupuesto Materiales        → margen 10%, imprevistos 20%, IVA  0%
 *  · Presupuesto Mano de Obra      → margen 40%, imprevistos 15%, IVA 19%
 *  · Presupuesto Operacion y Otros → margen 15%, imprevistos 20%, IVA 19%
 * "servicio" no existe en el Excel; hereda los supuestos de Operación.
 */
export const SUPUESTOS_DEFAULT: Supuestos = {
  material:  { margen: 10, imprevistos: 20, iva: 0  },
  mano_obra: { margen: 40, imprevistos: 15, iva: 19 },
  operacion: { margen: 15, imprevistos: 20, iva: 19 },
  servicio:  { margen: 15, imprevistos: 20, iva: 19 },
};

export type EstadoCotizacion = 'Pendiente' | 'Aceptado' | 'Realizado' | 'Rechazado' | 'Entregado';

export interface Cotizacion {
  id: string;
  folio: number;
  cliente_id: string;
  clientes?: Cliente;
  items: CotizacionItem[];
  /** Supuestos globales usados al cotizar (margen/imprevistos/IVA por categoría). */
  supuestos?: Supuestos;
  /** Empresa emisora; sin esto el PDF se generaba siempre con la primera. */
  empresa_id?: string | null;
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

// ─── Biblioteca / Catálogo (Fase 3) ──────────────────────────────────────────

/** Ítem reutilizable del catálogo (material, mano de obra, servicio, operación). */
export interface CatalogoItem {
  id: string;
  codigo?: string;
  descripcion: string;
  categoria: CategoriaItem;
  unidad: string;
  costo: number;          // costo unitario interno
  activo?: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Receta / ensamble (ej. "punto eléctrico"): agrupa varios ítems del catálogo. */
export interface Receta {
  id: string;
  nombre: string;
  descripcion?: string;
  categoria?: string;
  unidad: string;
  activo?: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Componente de una receta: un ítem del catálogo con su cantidad por unidad. */
export interface RecetaComponente {
  id: string;
  receta_id: string;
  item_id?: string | null;   // referencia al catálogo (precio vivo)
  descripcion: string;       // snapshot
  categoria: CategoriaItem;
  unidad: string;
  costo: number;             // snapshot del costo
  cantidad: number;          // por 1 unidad de receta
  orden?: number;
}

/** Receta con sus componentes cargados. */
export interface RecetaConComponentes extends Receta {
  componentes: RecetaComponente[];
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

// Los colores son tokens CSS: cambian solos entre tema claro y oscuro
// manteniendo contraste legible sobre cada fondo (ver app/globals.css).
export const ESTADO_COLORS: Record<EstadoCotizacion, { color: string; bg: string }> = {
  Realizado: { color: 'var(--success)', bg: 'var(--success-soft)' },
  Aceptado:  { color: 'var(--info)',    bg: 'var(--info-soft)'    },
  Entregado: { color: 'var(--purple)',  bg: 'var(--purple-soft)'  },
  Pendiente: { color: 'var(--y)',       bg: 'var(--y-soft)'       },
  Rechazado: { color: 'var(--danger)',  bg: 'var(--danger-soft)'  },
};

export const CATEGORIA_LABELS: Record<CategoriaItem, string> = {
  material:   'Material',
  mano_obra:  'Mano de Obra',
  servicio:   'Servicio',
  operacion:  'Operación',
};

/** Orden de presentación (igual al Excel: Materiales → MO → Operación). */
export const CATEGORIAS_ORDEN: CategoriaItem[] = ['material', 'mano_obra', 'servicio', 'operacion'];

export const CATEGORIA_COLORS: Record<CategoriaItem, string> = {
  material:   'var(--y)',
  mano_obra:  'var(--info)',
  servicio:   'var(--purple)',
  operacion:  'var(--success)',
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
