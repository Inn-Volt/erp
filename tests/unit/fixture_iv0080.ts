// Cotización de prueba con la forma de IV-0080 (Coffe Market): 5 partidas exentas de IVA con la misma
// venta neta y los mismos descuentos de partida que la real (total $3.903.591, descuento $189.375).
// Los costos y las líneas son inventados (el repositorio es público): costo total $3.150.000.
import type { HitoCobro, Linea, PartidaCot } from '../../lib/cotizador/tipos.ts';

const linea = (id: string, partidaId: string, categoria: Linea['categoria'], precio: number, costo: number): Linea => ({
  id, partidaId, descripcion: id, categoria, unidad: 'gl', cantidad: 1, costo, imprevistos: 0, margen: 0,
  precio, iva: 0, descuento: 0, itemId: `cat-${id}`,
}) as Linea;

const PARTIDAS_IV0080: PartidaCot[] = [
  { id: 'p1', nombre: 'Ingeniería y diseño eléctrico', cantidad: 1, unidad: 'global', tipo: 'instalacion', descuento: 10 },
  { id: 'p2', nombre: 'Canalizaciones y cableado', cantidad: 1, unidad: 'global', tipo: 'instalacion', descuento: 5 },
  { id: 'p3', nombre: 'Pruebas, puesta en servicio y documentación', cantidad: 1, unidad: 'global', tipo: 'instalacion', descuento: 8 },
  { id: 'p4', nombre: 'Tablero e instalación de negocio', cantidad: 1, unidad: 'global', tipo: 'instalacion' },
  { id: 'p5', nombre: 'Tablero TG negocio y casa', cantidad: 1, unidad: 'global', tipo: 'instalacion', descuento: 5 },
] as PartidaCot[];

const ITEMS_IV0080: Linea[] = [
  linea('ingenieria', 'p1', 'servicio', 211766, 150000),
  linea('cable', 'p2', 'material', 800000, 600000),
  linea('canalizacion', 'p2', 'mano_obra', 1094123, 900000),
  linea('pruebas', 'p3', 'servicio', 717650, 500000),
  linea('tablero', 'p4', 'material', 600000, 500000),
  linea('montaje', 'p4', 'mano_obra', 347836, 250000),
  linea('tablero-tg', 'p5', 'material', 221591, 200000),
  linea('conexion-tg', 'p5', 'mano_obra', 100000, 50000),
];

export const VENTA_POR_PARTIDA = { p1: 190589, p2: 1799417, p3: 660238, p4: 947836, p5: 305511 };
export const TOTAL_IV0080 = 3903591;
export const COSTO_IV0080 = 3150000;
export const PLAN_COBRO_IV0080: HitoCobro[] = [
  { nombre: 'Anticipo', porcentaje: 50, cuando: 'aprobar' },
  { nombre: 'Saldo', porcentaje: 50, cuando: 'terminar' },
];

export const IV0080 = { items: ITEMS_IV0080, partidas: PARTIDAS_IV0080, moneda: 'CLP' as const, valor_uf: null };
