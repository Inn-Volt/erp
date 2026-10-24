/**
 * Cartola del banco (fase 15): lee el CSV que bajan los bancos chilenos (o una hoja de Excel
 * pasada a CSV) y sugiere a qué cobro corresponde cada abono y a qué compra cada cargo.
 * Funciones puras: no tocan la base.
 */

export interface MovCartola { fecha: string; descripcion: string; monto: number; referencia: string | null; huella: string }

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Separa una línea CSV respetando comillas. */
function columnas(linea: string, sep: string): string[] {
  const out: string[] = [];
  let actual = '', comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') {
      if (comillas && linea[i + 1] === '"') { actual += '"'; i++; }
      else comillas = !comillas;
    } else if (ch === sep && !comillas) { out.push(actual.trim()); actual = ''; }
    else actual += ch;
  }
  out.push(actual.trim());
  return out;
}

/** «1.234.567», «-12.000», «$ 1.234,50», «(5.000)» → número. Vacío → null. */
export function numeroCL(txt: string | null | undefined): number | null {
  let t = (txt || '').replace(/\s|\$|CLP/gi, '');
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (t.startsWith('-')) { neg = true; t = t.slice(1); }
  if (t.endsWith('-')) { neg = true; t = t.slice(0, -1); }
  if (t.includes('.') && t.includes(',')) {
    // El que va último es el decimal.
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (t.includes('.')) {
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  } else if (t.includes(',')) {
    t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** «31/01/2026», «31-01-26», «2026-01-31» → «2026-01-31». */
export function fechaCL(txt: string | null | undefined): string | null {
  const t = (txt || '').trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (!m) return null;
  const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
  const d = Number(m[1]), mes = Number(m[2]);
  if (d < 1 || d > 31 || mes < 1 || mes > 12) return null;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const es = (h: string, claves: string[]) => claves.some(c => h.includes(c));

export function parsearCartola(texto: string): { movimientos: MovCartola[]; avisos: string[] } {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const muestra = lineas.slice(0, 30).join('\n');
  const sep = [';', '\t', ','].map(s => [s, muestra.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const avisos: string[] = [];

  // La fila de títulos: la primera que tenga «fecha» y algo de montos.
  let iTit = -1;
  let tit: string[] = [];
  for (let i = 0; i < Math.min(lineas.length, 40); i++) {
    const c = columnas(lineas[i], sep).map(sinTildes);
    if (c.some(x => x.includes('fecha')) && c.some(x => es(x, ['monto', 'importe', 'abono', 'cargo', 'deposito', 'giro', 'haber', 'debe', 'credito', 'debito']))) {
      iTit = i; tit = c; break;
    }
  }
  if (iTit < 0) return { movimientos: [], avisos: ['No encontré la fila de títulos (con «Fecha» y «Monto» o «Cargo/Abono»).'] };

  const col = (claves: string[], fuera: string[] = []) => tit.findIndex(h => es(h, claves) && !es(h, fuera));
  const cFecha = col(['fecha']);
  const cDesc = col(['descrip', 'detalle', 'glosa', 'concepto', 'movimiento'], ['fecha']);
  const cRef = col(['docto', 'documento', 'referencia', 'operacion', 'n° doc', 'nro'], ['fecha']);
  const cAbono = col(['abono', 'deposito', 'haber', 'credito'], ['saldo']);
  const cCargo = col(['cargo', 'giro', 'debe', 'debito'], ['saldo']);
  const cMonto = col(['monto', 'importe'], ['saldo']);
  if (cAbono < 0 && cCargo < 0 && cMonto < 0) return { movimientos: [], avisos: ['No encontré la columna del monto.'] };

  const vistos = new Map<string, number>();
  const movimientos: MovCartola[] = [];
  for (const linea of lineas.slice(iTit + 1)) {
    const c = columnas(linea, sep);
    const fecha = fechaCL(c[cFecha]);
    if (!fecha) continue;
    const monto = cAbono >= 0 || cCargo >= 0
      ? Math.abs(numeroCL(c[cAbono]) || 0) - Math.abs(numeroCL(c[cCargo]) || 0)
      : numeroCL(c[cMonto]) || 0;
    if (!monto) continue;
    const descripcion = (cDesc >= 0 ? c[cDesc] : '') || '';
    const referencia = cRef >= 0 && c[cRef] && !/^0+$/.test(c[cRef]) ? c[cRef] : null;
    // Dos movimientos iguales el mismo día se distinguen por su orden en la cartola.
    const base = `${fecha}|${monto}|${sinTildes(descripcion)}|${referencia || ''}`;
    const n = (vistos.get(base) || 0) + 1;
    vistos.set(base, n);
    movimientos.push({ fecha, descripcion, monto, referencia, huella: `${base}|${n}` });
  }
  if (!movimientos.length) avisos.push('La cartola no trae movimientos con fecha y monto.');
  return { movimientos, avisos };
}

export interface CobroAbierto { id: string; saldo: number; numero_factura: string | null; cliente: string | null }
export interface CompraAbierta { id: string; total: number; folio: string | null; proveedor: string }

const palabras = (s: string) => sinTildes(s).split(/[^a-z0-9]+/).filter(w => w.length >= 4);

/** El cobro que más calza con un abono: por N° de factura en la glosa, o por monto exacto. */
export function sugerirCobro(m: { monto: number; descripcion: string; referencia?: string | null }, cobros: CobroAbierto[]): { id: string; razon: string } | null {
  if (m.monto <= 0) return null;
  const texto = ` ${sinTildes(`${m.descripcion} ${m.referencia || ''}`)} `;
  const porFactura = cobros.filter(c => {
    const n = (c.numero_factura || '').replace(/\D/g, '').replace(/^0+/, '');
    return n.length >= 2 && new RegExp(`[^0-9]0*${n}[^0-9]`).test(texto);
  });
  if (porFactura.length === 1) return { id: porFactura[0].id, razon: `la glosa menciona la factura ${porFactura[0].numero_factura}` };
  const exactos = cobros.filter(c => Math.abs(c.saldo - m.monto) < 1);
  if (exactos.length === 1) return { id: exactos[0].id, razon: 'mismo monto' };
  if (exactos.length > 1) {
    const w = palabras(m.descripcion);
    const porNombre = exactos.filter(c => c.cliente && palabras(c.cliente).some(x => w.includes(x)));
    if (porNombre.length === 1) return { id: porNombre[0].id, razon: 'mismo monto y el nombre del cliente' };
  }
  return null;
}

/** La compra impaga que calza con un cargo (monto exacto; si hay varias, por proveedor o folio). */
export function sugerirCompra(m: { monto: number; descripcion: string }, compras: CompraAbierta[]): { id: string; razon: string } | null {
  if (m.monto >= 0) return null;
  const exactas = compras.filter(c => Math.abs(c.total + m.monto) < 1);
  if (exactas.length === 1) return { id: exactas[0].id, razon: 'mismo monto' };
  const w = palabras(m.descripcion);
  const porNombre = exactas.filter(c => palabras(c.proveedor).some(x => w.includes(x)) || (c.folio && sinTildes(m.descripcion).includes(c.folio)));
  return porNombre.length === 1 ? { id: porNombre[0].id, razon: 'mismo monto y el proveedor' } : null;
}
