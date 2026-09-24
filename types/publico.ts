// Datos de una cotización tal como los ve el CLIENTE en el link público (/c/<token>).
// Nunca incluye costos, márgenes, imprevistos ni supuestos internos.

import type { Cliente, CotizacionItem, EstadoCotizacion, Moneda, Partida } from '@/types';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';

export interface FotoPublica { url: string; caption: string; }

export interface CotizacionPublica {
  folio: number;
  estado: EstadoCotizacion;
  created_at: string;
  moneda: Moneda;
  valor_uf: number | null;
  descuento_global: number;
  descripcion_general: string;
  condiciones_servicio: string;
  condiciones_comerciales: string;
  ocultar_suministros: boolean;
  mostrar_detalle: boolean;
  /** Ítems SANITIZADOS: costo, margen e imprevistos van en 0. */
  items: CotizacionItem[];
  partidas: Partida[];
  cliente: Pick<Cliente, 'nombre_cliente' | 'empresa' | 'rut' | 'email' | 'telefono' | 'direccion' | 'contacto_nombre'>;
  empresa: EmpresaInfo;
  /** Fecha de vencimiento (YYYY-MM-DD) según los días de validez de las condiciones. */
  vence: string;
  vigente: boolean;
  respondida_at: string | null;
  respondida_por: string | null;
  respondida_rut: string | null;
  /** Firma del cliente (PNG data URI), solo si la aceptó online. */
  respuesta_firma: string | null;
  fotos: FotoPublica[];
}
