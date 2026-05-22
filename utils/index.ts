import type { CotizacionItem } from '@/types';

// ─── Formatters ───────────────────────────────────────────────────────────────

export const formatCLP = (v: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(v || 0);

export const formatFolio = (num: number | null | undefined) =>
  num ? `IV-${num.toString().padStart(4, '0')}` : 'IV-0000';

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const cleanNumber = (val: unknown): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  return Number(String(val).replace(/[^0-9.-]/g, '')) || 0;
};

// ─── ID generation (browser-safe) ─────────────────────────────────────────────

export const newId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
};

// ─── Totals calculation ───────────────────────────────────────────────────────

export interface Totals {
  netoMateriales: number;
  ivaMateriales: number;
  netoMO: number;
  ivaMO: number;
  netoServicios: number;
  ivaServicios: number;
  netoGeneral: number;
  ivaGeneral: number;
  total: number;
  montoDescuentoMO: number;
  utilidadEstimada: number;
  margenPromedio: number;
}

export function calcularTotals(items: CotizacionItem[], descuentoPorcentajeMO: number): Totals {
  let nMat = 0, ivaMat = 0;
  let nMO = 0, ivaMO = 0;
  let nServ = 0, ivaServ = 0;
  let costoTotal = 0;
  let ventaTotal = 0;

  for (const item of items) {
    const qty = item.cantidad || 0;
    const precio = item.precio || 0;
    const costo = item.costo || 0;
    const tot = qty * precio;
    const totCosto = qty * costo;

    costoTotal += totCosto;

    const cat = item.categoria;

    if (cat === 'material') {
      if (item.iva_incluido) {
        const neto = tot / 1.19;
        nMat += neto;
        ivaMat += tot - neto;
      } else {
        nMat += tot;
        ivaMat += tot * 0.19;
      }
    } else if (cat === 'mano_obra') {
      if (item.iva_incluido) {
        const neto = tot / 1.19;
        nMO += neto;
        ivaMO += tot - neto;
      } else {
        nMO += tot;
      }
    } else {
      // servicio
      if (item.iva_incluido) {
        const neto = tot / 1.19;
        nServ += neto;
        ivaServ += tot - neto;
      } else {
        nServ += tot;
      }
    }
  }

  const descMO = nMO * (descuentoPorcentajeMO / 100);
  const ivaMOdesc = ivaMO * (1 - descuentoPorcentajeMO / 100);
  const nMOfin = nMO - descMO;

  const netoGeneral = nMat + nMOfin + nServ;
  const ivaGeneral = ivaMat + ivaMOdesc + ivaServ;
  const total = netoGeneral + ivaGeneral;

  ventaTotal = netoGeneral;
  const utilidadEstimada = ventaTotal - costoTotal;
  const margenPromedio = ventaTotal > 0 ? (utilidadEstimada / ventaTotal) * 100 : 0;

  return {
    netoMateriales: nMat,
    ivaMateriales: ivaMat,
    netoMO: nMOfin,
    ivaMO: ivaMOdesc,
    netoServicios: nServ,
    ivaServicios: ivaServ,
    netoGeneral,
    ivaGeneral,
    total,
    montoDescuentoMO: descMO,
    utilidadEstimada,
    margenPromedio,
  };
}

// ─── Item factory ─────────────────────────────────────────────────────────────

export function newItem(overrides?: Partial<CotizacionItem>): CotizacionItem {
  return {
    id: newId(),
    descripcion: '',
    categoria: 'material',
    cantidad: 1,
    unidad: 'un',
    costo: 0,
    margen: 30,
    precio: 0,
    iva_incluido: true,
    esMaterial: true,
    ...overrides,
  };
}

// ─── Price from margin ────────────────────────────────────────────────────────

export function precioDesdeMargen(costo: number, margen: number): number {
  if (margen >= 100) return costo * 10;
  return costo / (1 - margen / 100);
}

export function margenDesdePrecio(costo: number, precio: number): number {
  if (precio <= 0) return 0;
  return ((precio - costo) / precio) * 100;
}

// ─── Excel helpers ────────────────────────────────────────────────────────────

export function itemsToExcelRows(items: CotizacionItem[]) {
  return items.map(i => ({
    Descripcion: i.descripcion,
    Categoria: i.categoria,
    Cantidad: i.cantidad,
    Unidad: i.unidad,
    'Costo unitario': i.costo,
    'Margen (%)': i.margen,
    'Precio venta': i.precio,
    Subtotal: i.cantidad * i.precio,
    IVA: i.iva_incluido ? 'Incluido' : 'No incluido',
  }));
}
