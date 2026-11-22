/**
 * «Leer con IA» una boleta o factura (fase 20): el esquema y las instrucciones para la IA, y el
 * orden de lo que responde. La IA solo PRELLENA: el formulario marca en amarillo lo que leyó y la
 * persona siempre revisa y guarda. Sin React ni Supabase (pruebas: tests/unit/leerDocumento.test.ts).
 */

import type { GeminiSchema } from '@/lib/ia';
import { formatearRut, rutValido } from '@/lib/rut';

export type TipoDocLeido = 'factura' | 'factura_exenta' | 'boleta' | 'nota_credito' | 'otro';
/** Una línea del detalle (lo comprado): el monto como aparece en el documento. */
export interface LineaLeida { descripcion: string; cantidad: number | null; unidad: string; monto: number }
export interface DocumentoLeido {
  tipo_doc: TipoDocLeido; folio: string; fecha: string; proveedor_nombre: string; proveedor_rut: string;
  neto: number; iva: number; exento: number; total: number; descripcion: string;
  /** Fase 21: el detalle de lo comprado (vacío si no se lee). */
  lineas: LineaLeida[];
}
export interface LecturaDocumento {
  doc: DocumentoLeido;
  /** Los campos que trajo la IA (se marcan en amarillo). */
  leidos: (keyof DocumentoLeido)[];
  /** Lo que hay que revisar: RUT que no calza, montos que no suman el total. */
  avisos: string[];
}

/** Lo más grande que se manda a leer (la foto se achica antes en el navegador). */
export const MAX_BYTES_DOCUMENTO = 4 * 1024 * 1024;
export const TIPOS_ARCHIVO_DOCUMENTO = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

export const ESQUEMA_DOCUMENTO: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    tipo_doc: { type: 'STRING', enum: ['factura', 'factura_exenta', 'boleta', 'nota_credito', 'otro'] },
    folio: { type: 'STRING', description: 'N° del documento (folio), solo el número' },
    fecha: { type: 'STRING', description: 'Fecha de emisión en formato AAAA-MM-DD' },
    proveedor_nombre: { type: 'STRING', description: 'Razón social de quien emite el documento' },
    proveedor_rut: { type: 'STRING', description: 'RUT de quien emite el documento, ej. 76.123.456-7' },
    neto: { type: 'NUMBER', description: 'Monto neto en pesos (0 si no aparece)' },
    iva: { type: 'NUMBER', description: 'IVA en pesos (0 si no aparece)' },
    exento: { type: 'NUMBER', description: 'Monto exento en pesos (0 si no aparece)' },
    total: { type: 'NUMBER', description: 'Monto total en pesos' },
    descripcion: { type: 'STRING', description: 'Qué se compró, en pocas palabras' },
    lineas: {
      type: 'ARRAY', description: 'El detalle: cada producto o servicio del documento, en orden',
      items: {
        type: 'OBJECT',
        properties: {
          descripcion: { type: 'STRING', description: 'El producto como aparece' },
          cantidad: { type: 'NUMBER', description: 'Cantidad (0 si no aparece)' },
          unidad: { type: 'STRING', description: 'Unidad: un, m, kg, caja… (vacío si no aparece)' },
          monto: { type: 'NUMBER', description: 'Total de la línea en pesos, tal como aparece' },
        },
        required: ['descripcion', 'cantidad', 'unidad', 'monto'],
      },
    },
  },
  required: ['tipo_doc', 'folio', 'fecha', 'proveedor_nombre', 'proveedor_rut', 'neto', 'iva', 'exento', 'total', 'descripcion', 'lineas'],
};

export const INSTRUCCIONES_DOCUMENTO = `Lees documentos tributarios chilenos (facturas, facturas exentas, boletas, notas de crédito) de fotos o PDF.
Devuelve los datos tal como aparecen en el documento, sin inventar:
- tipo_doc: factura, factura_exenta, boleta, nota_credito u otro (voucher, guía, cotización…).
- proveedor: quien EMITE el documento (el de arriba, con su RUT), no el cliente.
- Montos en pesos chilenos como números enteros (el punto separa miles: 1.234.567 = 1234567).
- Si un dato no aparece o no se lee, deja el texto vacío o el número en 0.
- descripcion: un resumen corto de lo comprado (máximo 80 caracteres).
- lineas: cada producto o servicio del detalle, en el orden del documento, con su cantidad, unidad y el total de la línea tal como aparece (no lo recalcules). Sin las líneas de subtotal, IVA, descuentos generales ni total.
Responde SIEMPRE con el JSON pedido.`;

const TIPOS: TipoDocLeido[] = ['factura', 'factura_exenta', 'boleta', 'nota_credito', 'otro'];

export function tipoLeido(v: unknown): TipoDocLeido {
  const t = String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (TIPOS.includes(t as TipoDocLeido)) return t as TipoDocLeido;
  if (/nota.*cred/.test(t)) return 'nota_credito';
  if (/exent/.test(t) && /factura/.test(t)) return 'factura_exenta';
  if (/factura/.test(t)) return 'factura';
  if (/boleta/.test(t)) return 'boleta';
  return 'otro';
}

/** «$ 1.234.567», «1234567», 1234567.4 → 1234567 (pesos enteros, sin signo). */
export function montoLeido(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.abs(Math.round(v)) : 0;
  const s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  // Con coma decimal (1.234,50) o solo puntos de miles (1.234.567).
  const limpio = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\.(?=\d{3}(\D|$))/g, '');
  const n = Number(limpio);
  return Number.isFinite(n) ? Math.abs(Math.round(n)) : 0;
}

/** «2026-11-23», «23-11-2026», «23/11/2026» → «2026-11-23» (vacío si no se entiende). */
export function fechaLeida(v: unknown): string {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valida(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return valida(m[3], m[2], m[1]);
  return '';
}
function valida(a: string, m: string, d: string): string {
  const f = `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const t = new Date(`${f}T12:00:00Z`);
  return !isNaN(t.getTime()) && t.toISOString().slice(0, 10) === f ? f : '';
}

const texto = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Una línea leída: sin descripción no sirve; la cantidad puede venir con decimales. */
function lineaLeida(v: unknown): LineaLeida | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const descripcion = texto(o.descripcion, 160);
  if (!descripcion) return null;
  const c = Number(String(o.cantidad ?? '').replace(',', '.'));
  return { descripcion, cantidad: Number.isFinite(c) && c > 0 ? Math.round(c * 1000) / 1000 : null, unidad: texto(o.unidad, 20), monto: montoLeido(o.monto) };
}
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

export function normalizarDocumento(raw: unknown): LecturaDocumento {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const doc: DocumentoLeido = {
    tipo_doc: tipoLeido(r.tipo_doc),
    folio: texto(r.folio, 30).replace(/^n[°º.]?\s*/i, ''),
    fecha: fechaLeida(r.fecha),
    proveedor_nombre: texto(r.proveedor_nombre, 120),
    proveedor_rut: texto(r.proveedor_rut, 20),
    neto: montoLeido(r.neto), iva: montoLeido(r.iva), exento: montoLeido(r.exento), total: montoLeido(r.total),
    descripcion: texto(r.descripcion, 120),
    lineas: (Array.isArray(r.lineas) ? r.lineas : []).slice(0, 80).map(lineaLeida).filter((l): l is LineaLeida => !!l),
  };
  const avisos: string[] = [];
  if (doc.proveedor_rut) {
    if (rutValido(doc.proveedor_rut)) doc.proveedor_rut = formatearRut(doc.proveedor_rut);
    else avisos.push('Revisa el RUT del proveedor: el dígito verificador no calza.');
  }
  // Lo que se lee de más: el total que falta sale de las partes (y al revés no se adivina).
  if (!doc.total && doc.neto + doc.iva + doc.exento > 0) doc.total = doc.neto + doc.iva + doc.exento;
  const partes = doc.neto + doc.iva + doc.exento;
  if (partes > 0 && doc.total > 0 && Math.abs(partes - doc.total) > 1) {
    avisos.push(`Neto + IVA + exento (${fmt(partes)}) no da el total (${fmt(doc.total)}): revisa los montos.`);
  }
  const leidos = (Object.keys(doc) as (keyof DocumentoLeido)[]).filter(k => {
    const v = doc[k];
    return k === 'tipo_doc' ? r.tipo_doc !== undefined && r.tipo_doc !== '' : Array.isArray(v) ? v.length > 0 : typeof v === 'number' ? v > 0 : !!v;
  });
  return { doc, leidos, avisos };
}
