// Datos de una cotización tal como los ve el CLIENTE en el link público (/c/<token>).
// Nunca incluye costos, márgenes, imprevistos ni supuestos internos.

import type { HitoCobro } from '@/lib/cotizador/tipos';
import type { Cliente, CotizacionItem, Moneda, Partida } from '@/types';
import type { EstadoCot, QueVe, Seccion } from '@/lib/cotizador/tipos';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';

export interface FotoPublica { url: string; caption: string; }

export interface CotizacionPublica {
  /** Portada de presentación en el PDF y n° de revisión vigente (fase 3). */
  incluir_portada?: boolean;
  revision?: number;
  folio: number;
  estado: EstadoCot;
  created_at: string;
  titulo: string;
  fecha_emision: string | null;
  valida_hasta: string | null;
  fecha_valor_uf: string | null;
  que_ve_cliente: QueVe;
  titulo_valorizacion: string | null;
  aclaraciones: string;
  secciones: Seccion[];
  /** Fase 7: forma de pago (cobros por hitos). */
  plan_cobro: HitoCobro[] | null;
  /** Fase 8: diseño del PDF. */
  pdf_diseno: Record<string, unknown> | null;
  /** De dónde viene (si se activó en el diseño del PDF): «Solicitud SOL-0012». */
  referencia?: string | null;
  /** Ajustes: si el cliente puede responder en línea, «Importante» y el correo de «Cómo aceptar». */
  responde_en_linea: boolean;
  importante: string | null;
  correo_aceptar: string | null;
  sucursal: { nombre: string; direccion: string | null; comuna: string | null } | null;
  contacto: { nombre: string; email: string | null; telefono: string | null } | null;
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
  /** Quién cotizó: su contacto (nombre, cargo, teléfono, correo). Sin datos internos. */
  vendedor: { nombre: string; cargo: string | null; telefono: string | null; email: string | null } | null;
  fotos: FotoPublica[];
}
