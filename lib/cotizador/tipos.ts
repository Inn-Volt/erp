/**
 * El cotizador de TecApp adaptado a InnVolt: tipos y constantes.
 * Las líneas y las partidas se siguen guardando en cotizaciones.items / .partidas
 * (JSONB), con los campos nuevos opcionales: así las cotizaciones de antes se leen igual.
 */

import type { CategoriaItem, Cliente, CotizacionItem, Partida } from '@/types';

export type EstadoCot = 'Borrador' | 'Enviada' | 'Aprobada' | 'Rechazada' | 'Anulada';
export type Moneda = 'CLP' | 'UF';
export type QueVe = 'partidas' | 'detalle' | 'total';
export type TipoPartida = 'instalacion' | 'venta';

export const ESTADOS_COT: { clave: EstadoCot; color: string; fondo: string; ayuda: string }[] = [
  { clave: 'Borrador', color: '#64748b', fondo: 'rgba(100,116,139,.14)', ayuda: 'En preparación. Es el único estado que se edita.' },
  { clave: 'Enviada', color: '#2563eb', fondo: 'rgba(37,99,235,.14)', ayuda: 'El cliente ya la tiene. No se edita.' },
  { clave: 'Aprobada', color: '#16a34a', fondo: 'rgba(22,163,74,.14)', ayuda: 'El cliente aceptó. Nace su OT.' },
  { clave: 'Rechazada', color: '#dc2626', fondo: 'rgba(220,38,38,.12)', ayuda: 'El cliente no aceptó. Es final.' },
  { clave: 'Anulada', color: '#78716c', fondo: 'rgba(120,113,108,.14)', ayuda: 'Ya no corresponde. Conserva su N°.' },
];
export const estadoCot = (e: string) => ESTADOS_COT.find(x => x.clave === e) || ESTADOS_COT[0];

/** Los estados de antes (por si la base todavía no corre la fase 4). */
export function normalizarEstado(e: string, enviada?: boolean): EstadoCot {
  switch (e) {
    case 'Pendiente': return enviada ? 'Enviada' : 'Borrador';
    case 'Aceptado': case 'Realizado': case 'Entregado': return 'Aprobada';
    case 'Rechazado': return 'Rechazada';
    default: return (ESTADOS_COT.some(x => x.clave === e) ? e : 'Borrador') as EstadoCot;
  }
}

export const QUE_VE: { valor: QueVe; nombre: string; ayuda: string }[] = [
  { valor: 'partidas', nombre: 'El total de cada partida', ayuda: 'Una fila por partida con su cantidad, valor unitario y total.' },
  { valor: 'detalle', nombre: 'Todo el detalle', ayuda: 'Cada partida con sus líneas: equipo e instalación (HH) por separado.' },
  { valor: 'total', nombre: 'Solo el total', ayuda: 'Las partidas sin montos; solo el total de la cotización.' },
];

export const MOTIVOS_RECHAZO = ['Precio', 'Plazo', 'Eligió a la competencia', 'Lo postergó', 'Cambió el alcance', 'No respondió', 'Otro'] as const;

export const UNIDADES_ITEM = ['un', 'global', 'm', 'ml', 'm²', 'm³', 'kg', 'lt', 'gl', 'hr', 'día', 'mes', 'pt', 'punto', 'par', 'juego', 'kit', 'rollo', 'caja', 'tira', 'bolsa', 'saco', 'viaje'];
export const UNIDADES_PARTIDA = ['global', 'un', 'local', 'm²', 'depto', 'piso', 'mes', 'puerta', 'punto'];

export const TITULO_VALORIZACION = 'VALORIZACIÓN';
export const IVA = 19;

/** Un cobro del plan: «Anticipo 50 % al aprobar», «Saldo 50 % al terminar». */
export interface HitoCobro { nombre: string; porcentaje: number; cuando: 'aprobar' | 'terminar' }
export const PLAN_COBRO_BASE: HitoCobro[] = [
  { nombre: 'Anticipo', porcentaje: 50, cuando: 'aprobar' },
  { nombre: 'Saldo', porcentaje: 50, cuando: 'terminar' },
];
export const CUANDO_COBRO: Record<HitoCobro['cuando'], string> = { aprobar: 'al aprobar', terminar: 'al terminar el trabajo' };
/** «50 % al aprobar y 50 % al terminar el trabajo». */
export const planEnPalabras = (plan: HitoCobro[]) =>
  plan.filter(h => h.porcentaje > 0).map(h => `${String(h.porcentaje).replace('.', ',')} % ${CUANDO_COBRO[h.cuando]}`)
    .join(', ').replace(/, ([^,]*)$/, ' y $1');

export type EstadoTrabajo = 'por_iniciar' | 'en_ejecucion' | 'terminado';
export const ESTADOS_TRABAJO: { clave: EstadoTrabajo; nombre: string; color: string }[] = [
  { clave: 'por_iniciar', nombre: 'Por iniciar', color: '#d97706' },
  { clave: 'en_ejecucion', nombre: 'En ejecución', color: '#2563eb' },
  { clave: 'terminado', nombre: 'Terminado', color: '#16a34a' },
];
export const estadoTrabajo = (e?: string | null) => ESTADOS_TRABAJO.find(x => x.clave === e) || ESTADOS_TRABAJO[0];

/** Una línea de la cotización (lo que se guarda en items[]). */
export interface Linea extends CotizacionItem {
  /** Artículo del catálogo (precio congelado al agregarla). */
  itemId?: string | null;
  codigo?: string | null;
  /** Fuera del catálogo: su precio sale de su costo y su ganancia. */
  fuera?: boolean;
  /** % de ganancia sobre el costo (solo fuera del catálogo). Vacío: se vende a costo. */
  ganancia?: number | null;
  /** Del catálogo, pero con el costo o la ganancia cambiados en esta cotización: se calcula
   *  como una fuera del catálogo (`fuera: true`) y la biblioteca no se toca. */
  ajustada?: boolean;
  /** Mano de obra ligada a un producto (id de la línea del producto). */
  ligadoA?: string | null;
  /** Cuánta mano de obra por cada unidad del producto. */
  porUnidad?: number;
  /** La cantidad de la mano de obra se escribió a mano: ya no sigue al producto. */
  cantidadAMano?: boolean;
  /** El producto del catálogo trae mano de obra al instalarse (para religarla al cambiar de tipo). */
  manoObraId?: string | null;
  /** Costo con IVA (precio de mercado): el costo y el precio escritos traen el IVA adentro;
   *  se calcula con el neto (÷ 1,19). */
  ivaIncluido?: boolean;
}

export interface PartidaCot extends Partida {
  tipo?: TipoPartida;
}

export interface Seccion {
  clave: string;
  tipo: 'portada' | 'texto';
  titulo: string;
  subtitulo?: string;
  texto: string;
  hoja_nueva?: boolean;
}

export interface CotizacionDoc {
  id: string;
  folio: number;
  estado: EstadoCot;
  revision: number;
  revision_aprobada?: number | null;
  titulo: string;
  cliente_id: string | null;
  clientes?: Cliente | null;
  sucursal_id?: string | null;
  contacto_id?: string | null;
  empresa_id?: string | null;
  vendedor_id?: string | null;
  solicitud_id?: string | null;
  levantamiento_id?: string | null;
  /** La OT de donde se cotizó (fase 6): al aprobarse, el trabajo sigue en ella. */
  ot_id?: string | null;
  /** Fase 7: la visita de la agenda de donde se cotizó (notas y fotos). */
  agendamiento_id?: string | null;
  /** Fase 7: cómo se cobra (hitos). Vacío: el de los ajustes. */
  plan_cobro?: HitoCobro[] | null;
  /** Fase 7: seguimiento del trabajo aprobado. */
  trabajo_estado?: EstadoTrabajo | null;
  trabajo_inicio?: string | null;
  trabajo_termino?: string | null;
  incluir_fotos?: boolean;
  proyecto_id?: string | null;
  plantilla_id?: string | null;
  plantilla_version?: number | null;
  origen_id?: string | null;
  items: Linea[];
  partidas: PartidaCot[];
  moneda: Moneda;
  valor_uf?: number | null;
  fecha_valor_uf?: string | null;
  que_ve_cliente: QueVe;
  titulo_valorizacion?: string | null;
  descripcion_general: string;
  aclaraciones: string;
  secciones: Seccion[];
  fecha_emision?: string | null;
  dias_validez?: number | null;
  valida_hasta?: string | null;
  valida_hasta_a_mano?: boolean;
  subtotal: number;
  iva: number;
  total: number;
  total_clp?: number | null;
  descuento_global?: number;
  costo_directo?: number | null;
  utilidad?: number | null;
  token_publico?: string | null;
  enviada_at?: string | null;
  vista_at?: string | null;
  respondida_at?: string | null;
  respondida_por?: string | null;
  respondida_rut?: string | null;
  respuesta_comentario?: string | null;
  respuesta_firma?: string | null;
  aceptada_at?: string | null;
  aprobada_como?: string | null;
  documento_respuesta?: string | null;
  motivo_perdida?: string | null;
  motivo_perdida_nota?: string | null;
  motivo_anulacion?: string | null;
  seguimiento_at?: string | null;
  seguimientos?: number | null;
  created_at: string;
  updated_at?: string;
}

export interface Familia {
  id: string;
  catalogo: 'bodega' | 'servicios';
  nombre: string;
  ganancia: number;
  redondeo: number;
  activo: boolean;
}

/** Un artículo del catálogo con su precio de venta ya calculado. */
export interface ArticuloCatalogo {
  id: string;
  codigo?: string | null;
  descripcion: string;
  categoria: CategoriaItem;
  unidad: string;
  costo: number;
  familia?: string | null;
  familia_precio_id?: string | null;
  familia_precio_nombre?: string | null;
  ganancia_propia?: number | null;
  ganancia_efectiva?: number | null;
  redondeo_efectivo?: number | null;
  precio_venta: number | null;
  marca?: string | null;
  modelo?: string | null;
  garantia?: string | null;
  proveedor?: string | null;
  mano_obra_id?: string | null;
  mano_obra_por_unidad?: number | null;
  activo?: boolean;
}

export interface AjustesCot {
  dias_validez: number;
  aclaraciones: string | null;
  importante: string | null;
  correo_aceptar: string | null;
  usa_presentacion: boolean;
  responde_en_linea: boolean;
  asunto_correo: string | null;
  mensaje_correo: string | null;
  mensaje_whatsapp: string | null;
  /** Fase 7: el plan de cobro por omisión de las cotizaciones nuevas. */
  plan_cobro?: HitoCobro[] | null;
  /** Fase 8: el diseño del PDF (color, título, pie y bloques que se muestran). */
  pdf_diseno?: import('@/components/pdf/CotizacionPDF').DisenoPDF | null;
  /** Fase 13: gastos fijos, ventas del mes y ganancia deseada (calculadora de utilidad). */
  estructura_costos?: Partial<import('@/lib/cotizador/utilidad').EstructuraCostos> | null;
  /** Fase 13: utilidad % por omisión de lo nuevo, por tipo. */
  utilidad_por_tipo?: import('@/lib/cotizador/utilidad').UtilidadPorTipo | null;
}

export interface Plantilla {
  id: string;
  nombre: string;
  para_que: string | null;
  descripcion: string | null;
  aclaraciones: string | null;
  que_ve_cliente: QueVe;
  titulo_valorizacion: string | null;
  secciones: Seccion[];
  es_la_de_siempre: boolean;
  activa: boolean;
  version: number;
  /** Fase 8: la forma de pago de las cotizaciones hechas con esta plantilla. */
  plan_cobro?: HitoCobro[] | null;
  updated_at?: string;
}

export interface EventoCot {
  id: number;
  tipo: string;
  estado_antes: string | null;
  estado_despues: string | null;
  revision: number | null;
  motivo: string | null;
  usuario_nombre: string | null;
  created_at: string;
}

export interface EnvioCot {
  id: string;
  revision: number;
  canal: string;
  para: string | null;
  pdf_path: string | null;
  total: number | null;
  moneda: string | null;
  es_reenvio: boolean;
  enviada_por: string | null;
  created_at: string;
}

// ── Recetas con preguntas ──
export interface OpcionPregunta { item_id: string; etiqueta?: string; defecto?: boolean }
export interface PreguntaReceta {
  clave: string;
  tipo: 'numero' | 'producto' | 'sino';
  texto: string;
  ayuda?: string;
  minimo?: number | null;
  maximo?: number | null;
  defecto?: number | boolean | null;
  entero?: boolean;
  unidad?: string;
  opciones?: OpcionPregunta[];
}
export interface ReglaComponente {
  /** El producto lo elige una pregunta de tipo «producto». */
  elegido_en?: string | null;
  modo?: 'fija' | 'por_cada' | 'uno_cada';
  por_pregunta?: string | null;
  por_cada?: number | null;
  fijo?: number | null;
  cada?: number | null;
  si_pregunta?: string | null;
  si_es?: boolean | null;
  si_opcion?: string | null;
  rango_pregunta?: string | null;
  desde?: number | null;
  hasta?: number | null;
}

export const VERSION_COTIZADOR = '1.0 (TecApp)';
