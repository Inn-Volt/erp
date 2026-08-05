import type {
  CotizacionItem, CategoriaItem, Supuestos, CatalogoItem, RecetaConComponentes, Moneda,
} from '@/types';
import { SUPUESTOS_DEFAULT, CATEGORIAS_ORDEN } from '@/types';

// ─── Formatters ───────────────────────────────────────────────────────────────

export const formatCLP = (v: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Math.round(v) || 0);

/** UF con 2 decimales (formato chileno): 12.5 → "UF 12,50". */
export const formatUF = (v: number) =>
  `UF ${new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0)}`;

/** Formatea un monto según la moneda de la cotización (CLP por defecto). */
export const formatMoneda = (v: number, moneda: Moneda = 'CLP') =>
  moneda === 'UF' ? formatUF(v) : formatCLP(v);

/** Redondeo según moneda: CLP a peso entero; UF a 2 decimales. */
export const redondearMoneda = (v: number, moneda: Moneda = 'CLP') =>
  moneda === 'UF' ? Math.round((v || 0) * 100) / 100 : Math.round(v || 0);

/** Número con separador de miles chileno (60000 → "60.000"). */
export const formatMiles = (v: number) =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(v || 0);

export const formatFolio = (num: number | null | undefined) =>
  num ? `IV-${num.toString().padStart(4, '0')}` : 'IV-0000';

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const formatPct = (v: number) =>
  `${(Math.round((v || 0) * 10) / 10).toLocaleString('es-CL')}%`;

export const cleanNumber = (val: unknown): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (val === null || val === undefined) return 0;
  // Formato chileno: coma = decimal, punto = miles.
  //   "1.234.567,89" → 1234567.89 · "60.000" → 60000 · "1,5" → 1.5 · "1.5" → 1.5
  let s = String(val).trim().replace(/[^0-9.,-]/g, '');
  if (s.includes(',')) {
    // Hay coma decimal → los puntos son separadores de miles
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // Patrón de miles con puntos ("60.000", "1.234.567") → quitar puntos
    s = s.replace(/\./g, '');
  }
  // Si no, se deja el punto como decimal ("1.5")
  const n = Number(s);
  return isNaN(n) ? 0 : n;
};

// ─── ID generation (browser-safe) ─────────────────────────────────────────────

export const newId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
};

// ══════════════════════════════════════════════════════════════════════════════
// MOTOR DE COSTEO — réplica exacta de "Gestion de proyecto.xlsx"
// ══════════════════════════════════════════════════════════════════════════════
//
//   Costo Total    = costo × cantidad                 (Excel: H = F*G)
//   Costo c/Imprev = Costo Total × (1 + imprevistos)  (Excel: J = H*(1+I))
//   Precio Venta   = Costo c/Imprev / (1 − margen)    (Excel: L = J/(1-K))
//   P.V. + IVA     = Precio Venta × (1 + iva)         (Excel: M = L*(1+IVA))
//
// ══════════════════════════════════════════════════════════════════════════════

/** Tope de margen: el Excel divide por (1−margen); ≥100% sería división por cero. */
const MARGEN_MAX = 99.9;

export interface ItemCalculo {
  costoTotal: number;      // H — costo directo sin contingencia
  costoConImprev: number;  // J — costo + imprevistos
  precioBruto: number;     // precio × cantidad ANTES de descuento
  montoDescuento: number;  // precioBruto × descuento%
  precioVenta: number;     // L — precio de venta NETO de la línea (tras descuento)
  precioConIva: number;    // M — precio de venta con IVA
  montoImprevistos: number;// J − H
  montoIva: number;        // M − L
  utilidad: number;        // L − J  (lo que se gana sobre el costo con imprevistos)
}

/**
 * Calcula una línea completa aplicando la cadena de fórmulas del Excel.
 *
 * El precio de venta sale del `precio` unitario guardado, que es el que se
 * muestra en la fila y en el PDF. Así el subtotal de cada línea coincide
 * exactamente con el total del resumen. Ese `precio` se deriva de la fórmula
 * del Excel al editar costo/imprevistos/margen (ver `precioDesdeMargen`);
 * si por algún motivo no existe, se calcula aquí con la misma fórmula.
 */
export function calcularItem(item: CotizacionItem): ItemCalculo {
  const cantidad    = item.cantidad || 0;
  const costoUnit   = item.costo || 0;
  const imprevistos = (item.imprevistos || 0) / 100;
  const margen      = Math.min(item.margen || 0, MARGEN_MAX) / 100;
  const iva         = (item.iva || 0) / 100;
  const descuento   = Math.min(Math.max(item.descuento || 0, 0), 100) / 100;

  const costoTotal     = costoUnit * cantidad;
  const costoConImprev = costoTotal * (1 + imprevistos);
  const precioBruto    = item.precio > 0
    ? item.precio * cantidad
    : costoConImprev / (1 - margen);
  const montoDescuento = precioBruto * descuento;
  const precioVenta    = precioBruto - montoDescuento;   // neto tras descuento
  const precioConIva   = precioVenta * (1 + iva);

  return {
    costoTotal,
    costoConImprev,
    precioBruto,
    montoDescuento,
    precioVenta,
    precioConIva,
    montoImprevistos: costoConImprev - costoTotal,
    montoIva:         precioConIva - precioVenta,
    utilidad:         precioVenta - costoConImprev,
  };
}

/**
 * Precio de venta UNITARIO neto a partir del costo unitario.
 * Equivale a la fórmula del Excel dividida por la cantidad.
 */
export function precioDesdeMargen(costo: number, margen: number, imprevistos = 0): number {
  const m = Math.min(margen || 0, MARGEN_MAX) / 100;
  const i = (imprevistos || 0) / 100;
  return (costo || 0) * (1 + i) / (1 - m);
}

/** Operación inversa: dado un precio de venta unitario, deduce el margen %. */
export function margenDesdePrecio(costo: number, precio: number, imprevistos = 0): number {
  if (!precio || precio <= 0) return 0;
  const costoConImprev = (costo || 0) * (1 + (imprevistos || 0) / 100);
  return ((precio - costoConImprev) / precio) * 100;
}

/** Recalcula `precio` de un ítem según su costo/imprevistos/margen actuales. */
export function recalcularPrecio(item: CotizacionItem): number {
  return Math.round(precioDesdeMargen(item.costo, item.margen, item.imprevistos));
}

// ─── Totales por categoría (hoja "Presupuesto Resumen") ───────────────────────

export interface SubtotalCategoria {
  costoTotal: number;
  costoConImprev: number;
  bruto: number;            // Precio Venta antes de descuento
  montoDescuento: number;   // descuento total de la categoría
  descuentoPromedio: number;// % descuento promedio (ponderado)
  neto: number;             // Precio Venta neto (tras descuento)
  iva: number;
  total: number;            // P.V. + IVA
  utilidad: number;
  margenEfectivo: number;   // %
  cantidadItems: number;
}

const subtotalVacio = (): SubtotalCategoria => ({
  costoTotal: 0, costoConImprev: 0, bruto: 0, montoDescuento: 0,
  descuentoPromedio: 0, neto: 0, iva: 0,
  total: 0, utilidad: 0, margenEfectivo: 0, cantidadItems: 0,
});

export interface Totals {
  /** Subtotales por categoría — equivalente a "Presupuesto Resumen". */
  porCategoria: Record<CategoriaItem, SubtotalCategoria>;

  // ── Agregados globales ──
  costoTotal: number;       // costo directo (sin imprevistos)
  costoConImprev: number;   // costo + contingencia
  montoImprevistos: number;
  netoGeneral: number;      // suma de Precio Venta (tras descuentos)
  ivaGeneral: number;
  total: number;            // TOTAL PROYECTO
  montoDescuentoTotal: number;
  montoDescuentoMO: number;
  utilidadEstimada: number;
  margenPromedio: number;   // %

  // ── Compatibilidad con PDFs y vistas existentes ──
  netoMateriales: number;
  ivaMateriales: number;
  netoMO: number;
  ivaMO: number;
  netoServicios: number;
  ivaServicios: number;
  netoOperacion: number;
  ivaOperacion: number;
}

/**
 * Consolida todos los ítems replicando la hoja "Presupuesto Resumen".
 * El descuento se aplica sobre Mano de Obra (neto e IVA proporcionalmente),
 * igual que en el flujo comercial actual de InnVolt.
 */
export function calcularTotals(items: CotizacionItem[], descuentoPorcentajeMO = 0): Totals {
  const porCategoria: Record<CategoriaItem, SubtotalCategoria> = {
    material:  subtotalVacio(),
    mano_obra: subtotalVacio(),
    servicio:  subtotalVacio(),
    operacion: subtotalVacio(),
  };

  for (const item of items) {
    const cat = porCategoria[item.categoria] ? item.categoria : 'material';
    const c = calcularItem(item);
    const acc = porCategoria[cat];

    acc.costoTotal      += c.costoTotal;
    acc.costoConImprev  += c.costoConImprev;
    acc.bruto           += c.precioBruto;
    acc.montoDescuento  += c.montoDescuento;
    acc.neto            += c.precioVenta;
    acc.iva             += c.montoIva;
    acc.total           += c.precioConIva;
    acc.utilidad        += c.utilidad;
    acc.cantidadItems   += 1;
  }

  // ── Descuento global legacy sobre Mano de Obra ──
  // Cotizaciones antiguas guardaban un `descuento_global` que aplicaba solo a
  // MO. Los ítems nuevos usan descuento por línea (ya aplicado arriba), así que
  // aquí el factor es 0 y no hay doble conteo.
  const factorLegacy = Math.min(Math.max(descuentoPorcentajeMO || 0, 0), 100) / 100;
  if (factorLegacy > 0) {
    const mo = porCategoria.mano_obra;
    const extra = mo.neto * factorLegacy;
    mo.montoDescuento += extra;
    mo.iva  = mo.iva * (1 - factorLegacy);
    mo.neto = mo.neto - extra;
  }

  // Promedios por categoría (tras todos los descuentos)
  for (const cat of CATEGORIAS_ORDEN) {
    const a = porCategoria[cat];
    a.total             = a.neto + a.iva;
    a.utilidad          = a.neto - a.costoConImprev;
    a.margenEfectivo    = a.neto  > 0 ? (a.utilidad / a.neto) * 100 : 0;
    a.descuentoPromedio = a.bruto > 0 ? (a.montoDescuento / a.bruto) * 100 : 0;
  }

  const netoGeneral    = CATEGORIAS_ORDEN.reduce((s, c) => s + porCategoria[c].neto, 0);
  const ivaGeneral     = CATEGORIAS_ORDEN.reduce((s, c) => s + porCategoria[c].iva, 0);
  const costoTotal     = CATEGORIAS_ORDEN.reduce((s, c) => s + porCategoria[c].costoTotal, 0);
  const costoConImprev = CATEGORIAS_ORDEN.reduce((s, c) => s + porCategoria[c].costoConImprev, 0);
  const montoDescuentoTotal = CATEGORIAS_ORDEN.reduce((s, c) => s + porCategoria[c].montoDescuento, 0);

  const utilidadEstimada = netoGeneral - costoConImprev;

  return {
    porCategoria,

    costoTotal,
    costoConImprev,
    montoImprevistos: costoConImprev - costoTotal,
    netoGeneral,
    ivaGeneral,
    total: netoGeneral + ivaGeneral,
    montoDescuentoTotal,
    montoDescuentoMO: porCategoria.mano_obra.montoDescuento,
    utilidadEstimada,
    margenPromedio: netoGeneral > 0 ? (utilidadEstimada / netoGeneral) * 100 : 0,

    // Compatibilidad
    netoMateriales: porCategoria.material.neto,
    ivaMateriales:  porCategoria.material.iva,
    netoMO:         porCategoria.mano_obra.neto,
    ivaMO:          porCategoria.mano_obra.iva,
    netoServicios:  porCategoria.servicio.neto,
    ivaServicios:   porCategoria.servicio.iva,
    netoOperacion:  porCategoria.operacion.neto,
    ivaOperacion:   porCategoria.operacion.iva,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// CALCULADORA HH — hoja "Presupuesto Mano de Obra" (bloque Q1:V4)
// ══════════════════════════════════════════════════════════════════════════════
//
//   Horas Reales       = HH Base / (nº técnicos + nº ayudantes)     (T2)
//   Sueldo día (8h)    = sueldo base × (1 + margen extra)           (V2 / V4)
//   Valor Hora         = Sueldo día / 8                             (R4 / S4)
//   Costo Total        = Horas Reales × (téc×VHtéc + ayu×VHayu)     (T4)
//
// ══════════════════════════════════════════════════════════════════════════════

export interface HHInput {
  hhBase: number;            // Q2 — horas hombre totales estimadas
  tecnicos: number;          // R2
  ayudantes: number;         // S2
  sueldoTecnicoDia: number;  // base de V2 (jornada 8 h)
  sueldoAyudanteDia: number; // base de V4 (jornada 8 h)
  margenExtra: number;       // Q4 en % — recargo por trabajo específico
}

export interface HHResultado {
  horasReales: number;
  sueldoTecnicoDia: number;
  sueldoAyudanteDia: number;
  valorHoraTecnico: number;
  valorHoraAyudante: number;
  costoTotal: number;
  costoPorHora: number;
  totalPersonas: number;
}

export const HH_DEFAULT: HHInput = {
  hhBase: 24,
  tecnicos: 2,
  ayudantes: 1,
  sueldoTecnicoDia: 60000,
  sueldoAyudanteDia: 40000,
  margenExtra: 0,
};

const JORNADA_HORAS = 8;

export function calcularHH(input: HHInput): HHResultado {
  const tecnicos     = Math.max(input.tecnicos || 0, 0);
  const ayudantes    = Math.max(input.ayudantes || 0, 0);
  const totalPersonas = tecnicos + ayudantes;
  const factorExtra  = 1 + (input.margenExtra || 0) / 100;

  // T2 — el Excel devuelve 0 si no hay personal asignado
  const horasReales = totalPersonas > 0 ? (input.hhBase || 0) / totalPersonas : 0;

  const sueldoTecnicoDia  = (input.sueldoTecnicoDia  || 0) * factorExtra;
  const sueldoAyudanteDia = (input.sueldoAyudanteDia || 0) * factorExtra;

  const valorHoraTecnico  = sueldoTecnicoDia  / JORNADA_HORAS;
  const valorHoraAyudante = sueldoAyudanteDia / JORNADA_HORAS;

  const costoTotal =
    horasReales * ((tecnicos * valorHoraTecnico) + (ayudantes * valorHoraAyudante));

  return {
    horasReales,
    sueldoTecnicoDia,
    sueldoAyudanteDia,
    valorHoraTecnico,
    valorHoraAyudante,
    costoTotal,
    costoPorHora: horasReales > 0 ? costoTotal / horasReales : 0,
    totalPersonas,
  };
}

// ─── Item factory & normalización ─────────────────────────────────────────────

export function newItem(
  overrides?: Partial<CotizacionItem>,
  supuestos: Supuestos = SUPUESTOS_DEFAULT,
): CotizacionItem {
  const categoria = overrides?.categoria || 'material';
  const s = supuestos[categoria] || SUPUESTOS_DEFAULT[categoria];

  const base: CotizacionItem = {
    id: newId(),
    descripcion: '',
    categoria,
    cantidad: 1,
    unidad: 'un',
    costo: 0,
    imprevistos: s.imprevistos,
    margen: s.margen,
    precio: 0,
    iva: s.iva,
    descuento: 0,
    ...overrides,
  };

  // Si vino costo pero no precio explícito, derivarlo con la fórmula del Excel
  if (base.costo > 0 && !overrides?.precio) {
    base.precio = Math.round(precioDesdeMargen(base.costo, base.margen, base.imprevistos));
  }
  return base;
}

/**
 * Normaliza ítems guardados con el formato antiguo (sin `imprevistos`/`iva`,
 * con `esMaterial`/`iva_incluido`) para que sigan calculando correctamente.
 */
export function normalizarItem(
  raw: Partial<CotizacionItem>,
  supuestos: Supuestos = SUPUESTOS_DEFAULT,
): CotizacionItem {
  const categoria: CategoriaItem =
    (raw.categoria as CategoriaItem) ||
    (raw.esMaterial === false ? 'mano_obra' : 'material');

  const s = supuestos[categoria] || SUPUESTOS_DEFAULT[categoria];

  // Ítems antiguos no tenían contingencia: se respeta su precio original
  // usando imprevistos 0, para no alterar cotizaciones ya emitidas.
  const imprevistos = typeof raw.imprevistos === 'number' ? raw.imprevistos : 0;

  const iva = typeof raw.iva === 'number'
    ? raw.iva
    : (raw.iva_incluido === false ? 0 : (s.iva || 19));

  return {
    id:          (raw.id as string) || newId(),
    descripcion: (raw.descripcion as string) || '',
    categoria,
    cantidad:    typeof raw.cantidad === 'number' ? raw.cantidad : 1,
    unidad:      (raw.unidad as string) || 'un',
    costo:       typeof raw.costo === 'number' ? raw.costo : 0,
    imprevistos,
    margen:      typeof raw.margen === 'number' ? raw.margen : s.margen,
    precio:      typeof raw.precio === 'number' ? raw.precio : 0,
    iva,
    descuento:   typeof raw.descuento === 'number' ? raw.descuento : 0,
  };
}

/** Aplica los supuestos globales a todos los ítems y recalcula sus precios. */
export function aplicarSupuestos(items: CotizacionItem[], supuestos: Supuestos): CotizacionItem[] {
  return items.map(item => {
    const s = supuestos[item.categoria] || SUPUESTOS_DEFAULT[item.categoria];
    const actualizado = { ...item, imprevistos: s.imprevistos, margen: s.margen, iva: s.iva };
    return { ...actualizado, precio: recalcularPrecio(actualizado) };
  });
}

// ─── Excel helpers ────────────────────────────────────────────────────────────

/** Columnas idénticas a la hoja "Exportar Cotizador" del Excel de InnVolt. */
export function itemsToExcelRows(items: CotizacionItem[]) {
  return items.map(i => {
    const c = calcularItem(i);
    return {
      'Descripcion':      i.descripcion,
      'Categoria':        i.categoria,
      'Cantidad':         i.cantidad,
      'Unidad':           i.unidad,
      'Costo unitario':   Math.round(i.costo),
      'Costo Total':      Math.round(c.costoTotal),
      '% Imprevistos':    i.imprevistos,
      'Costo c/Imprev':   Math.round(c.costoConImprev),
      'Margen (%)':       i.margen,
      'Precio venta':     Math.round(i.precio),
      'Descuento (%)':    i.descuento || 0,
      'Subtotal':         Math.round(c.precioVenta),
      'IVA (%)':          i.iva,
      'P.V. + IVA':       Math.round(c.precioConIva),
    };
  });
}

const CATEGORIA_ALIASES: Record<string, CategoriaItem> = {
  material: 'material', materiales: 'material', insumo: 'material', insumos: 'material',
  mano_obra: 'mano_obra', 'mano de obra': 'mano_obra', mo: 'mano_obra', manoobra: 'mano_obra',
  servicio: 'servicio', servicios: 'servicio',
  operacion: 'operacion', 'operación': 'operacion', operacional: 'operacion',
  'operacion y otros': 'operacion', extras: 'operacion', gasto: 'operacion',
};

/** Interpreta la categoría escrita en el Excel (tolerante a mayúsculas/acentos). */
export function parseCategoria(raw: unknown): CategoriaItem {
  const k = String(raw ?? '').trim().toLowerCase();
  return CATEGORIA_ALIASES[k] || 'material';
}

// ══════════════════════════════════════════════════════════════════════════════
// BIBLIOTECA — catálogo e ítem desde receta (Fase 3)
// ══════════════════════════════════════════════════════════════════════════════

/** Convierte un ítem del catálogo en una línea de cotización lista. */
export function itemDesdeCatalogo(
  cat: CatalogoItem,
  cantidad = 1,
  supuestos: Supuestos = SUPUESTOS_DEFAULT,
): CotizacionItem {
  return newItem({
    descripcion: cat.descripcion,
    categoria:   cat.categoria,
    unidad:      cat.unidad,
    costo:       cat.costo,
    cantidad,
  }, supuestos);
}

/**
 * Expande una receta en varias líneas de cotización.
 * Cada componente se multiplica por `veces` (cantidad de recetas) y hereda los
 * supuestos (margen/imprevistos/IVA) de su categoría. El resultado son líneas
 * totalmente editables — el usuario puede ajustar cualquiera después.
 */
export function expandirReceta(
  receta: RecetaConComponentes,
  veces = 1,
  supuestos: Supuestos = SUPUESTOS_DEFAULT,
): CotizacionItem[] {
  const n = veces > 0 ? veces : 1;
  return (receta.componentes || [])
    .slice()
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map(c => newItem({
      descripcion: c.descripcion,
      categoria:   c.categoria,
      unidad:      c.unidad,
      costo:       c.costo,
      cantidad:    (c.cantidad || 0) * n,
    }, supuestos));
}

/** Costo interno total de una receta (para mostrarlo en la biblioteca). */
export function costoReceta(receta: RecetaConComponentes): number {
  return (receta.componentes || []).reduce((s, c) => s + (c.costo || 0) * (c.cantidad || 0), 0);
}
