import type {
  CotizacionItem, CategoriaItem, CatalogoItem, RecetaConComponentes, Moneda,
  BorradorIA, PartidaIAResuelta, PartidaIA, ComponenteIA,
} from '@/types';
import { CATEGORIAS_ORDEN } from '@/types';
import type { AnalisisIA } from '@/types/solicitud';

// ─── Formatters ───────────────────────────────────────────────────────────────

export const formatCLP = (v: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Math.round(v) || 0);

/** UF con 2 decimales (formato chileno): 12.5 → "UF 12,50". */
const formatUF = (v: number) =>
  `UF ${new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0)}`;

/** Formatea un monto según la moneda de la cotización (CLP por defecto). */
export const formatMoneda = (v: number, moneda: Moneda = 'CLP') =>
  moneda === 'UF' ? formatUF(v) : formatCLP(v);

/** Número con separador de miles chileno (60000 → "60.000"). */
export const formatMiles = (v: number) =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(v || 0);

/** Texto seguro para nombre de archivo (un cliente "A/B Ltda." rompía la descarga). */
export const nombreArchivo = (s: string) =>
  (s || 'cliente').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 60);

export const formatFolio = (num: number | null | undefined) =>
  num ? `IV-${num.toString().padStart(4, '0')}` : 'IV-0000';

/**
 * Fecha dd-mm-aaaa. Las columnas DATE de Postgres llegan como "2026-09-24":
 * `new Date("2026-09-24")` las interpreta en UTC y en Chile se mostraba el día
 * ANTERIOR. Por eso esas fechas se construyen como fecha local.
 */
export const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/**
 * Fecha LOCAL en formato YYYY-MM-DD. No usar `toISOString().slice(0,10)`: es
 * UTC y en Chile, desde las ~21:00, devuelve la fecha de mañana.
 */
export const fechaLocal = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Suma días a una fecha y la devuelve como YYYY-MM-DD local. Acepta una fecha
 * pura ("2026-09-24", se toma como local) o un timestamp ISO (created_at), que
 * se convierte primero a la hora de Chile.
 */
export const sumarDias = (iso: string, dias: number) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
  d.setDate(d.getDate() + dias);
  return fechaLocal(d);
};

/**
 * Días de validez de la oferta, leídos de las condiciones comerciales
 * ("Validez oferta: 15 días") para que PDF, link del cliente y texto nunca se
 * contradigan. Si no se indica, 15 días.
 */
export const diasValidez = (condiciones: string | null | undefined): number => {
  const m = /validez[^\d\n]{0,40}(\d{1,3})\s*d[ií]as/i.exec(condiciones || '');
  const n = m ? parseInt(m[1], 10) : NaN;
  return n > 0 && n <= 365 ? n : 15;
};

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

interface ItemCalculo {
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

// ─── Totales por categoría (hoja "Presupuesto Resumen") ───────────────────────

interface SubtotalCategoria {
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

interface Totals {
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

// ─── Matcheo de texto contra el catálogo (para IA) ───────────────────────────
const _normMatch = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const _tokensMatch = (s: string) => _normMatch(s).split(/[^a-z0-9]+/).filter(t => t.length >= 3);

/**
 * Devuelve el ítem del catálogo que mejor coincide con una descripción (misma
 * categoría), o null si no hay match confiable. Se usa para enlazar componentes
 * generados por IA con ítems reales de la biblioteca (precio + código vivos).
 * Conservador: exige ≥2 términos compartidos y cubrir ≥50% de los términos.
 */
export function mejorMatchCatalogo<T extends { descripcion: string; categoria: string; familia?: string }>(
  desc: string, categoria: string, catalogo: T[],
): T | null {
  const at = _tokensMatch(desc);
  if (at.length === 0) return null;
  let best: T | null = null;
  let bestScore = 0;
  for (const it of catalogo) {
    if (it.categoria !== categoria) continue;
    const ct = new Set(_tokensMatch(`${it.descripcion} ${it.familia || ''}`));
    let shared = 0;
    for (const t of at) if (ct.has(t)) shared++;
    const score = shared / at.length;
    if (shared >= 2 && score > bestScore) { bestScore = score; best = it; }
  }
  return bestScore >= 0.5 ? best : null;
}

const CATEGORIAS_IA: CategoriaItem[] = ['material', 'mano_obra', 'servicio', 'operacion'];

/**
 * Limpia la respuesta de la IA antes de usarla: números que llegan como texto
 * ("1.200.000"), categorías fuera de la lista, campos faltantes, componentes sin
 * descripción y partidas vacías. Así una respuesta con detalles menores se usa en
 * vez de perderse entera.
 */
export function normalizarBorradorIA(crudo: unknown): BorradorIA {
  const o = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>;
  const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
  const num = (v: unknown) => { const n = cleanNumber(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const partidas: PartidaIA[] = [];
  for (const p of Array.isArray(o.partidas) ? o.partidas : []) {
    if (!p || typeof p !== 'object') continue;
    const pp = p as Record<string, unknown>;
    const componentes: ComponenteIA[] = [];
    for (const c of Array.isArray(pp.componentes) ? pp.componentes : []) {
      if (!c || typeof c !== 'object') continue;
      const cc = c as Record<string, unknown>;
      const descripcion = txt(cc.descripcion);
      if (!descripcion) continue;
      const cat = txt(cc.categoria).toLowerCase() as CategoriaItem;
      componentes.push({
        descripcion,
        categoria: CATEGORIAS_IA.includes(cat) ? cat : 'material',
        unidad: txt(cc.unidad) || 'un',
        cantidad: num(cc.cantidad) || 1,
        costoUnitario: num(cc.costoUnitario),
      });
    }
    if (!componentes.length) continue;
    partidas.push({
      nombre: txt(pp.nombre) || 'Partida',
      descripcion: txt(pp.descripcion),
      cantidad: num(pp.cantidad) || 1,
      unidad: txt(pp.unidad) || 'global',
      componentes,
    });
  }
  return { resumen: txt(o.resumen), partidas };
}

/**
 * Convierte el ANÁLISIS de una solicitud (necesidades + ítems sugeridos, ya
 * generado por la IA) en un borrador para el cotizador SIN volver a llamar a la
 * IA. Matchea cada ítem con el catálogo para traer su precio real; los no
 * encontrados quedan en 0 para que el usuario los complete. Devuelve una única
 * partida con todos los ítems (el usuario la reorganiza/edita en el cotizador).
 */
export function borradorDesdeAnalisis(
  analisis: AnalisisIA, catalogo: CatalogoItem[], nombrePartida = 'Propuesta técnica',
): PartidaIAResuelta[] {
  const componentes = (analisis.items_sugeridos || []).map(it => {
    const m = catalogo.length ? mejorMatchCatalogo(it.descripcion, it.categoria, catalogo) : null;
    return m
      ? { descripcion: m.descripcion, categoria: it.categoria, unidad: m.unidad || it.unidad, cantidad: it.cantidad_sugerida || 1, costo: m.costo, codigo: m.codigo, matched: true }
      : { descripcion: it.descripcion, categoria: it.categoria, unidad: it.unidad || 'un', cantidad: it.cantidad_sugerida || 1, costo: 0, matched: false };
  });
  if (!componentes.length) return [];
  return [{ nombre: nombrePartida, descripcion: analisis.resumen || '', cantidad: 1, unidad: 'global', componentes }];
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

/** Costo interno total de una receta (para mostrarlo en la biblioteca). */
export function costoReceta(receta: RecetaConComponentes): number {
  return (receta.componentes || []).reduce((s, c) => s + (c.costo || 0) * (c.cantidad || 0), 0);
}
