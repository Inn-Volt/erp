/**
 * Factura electrónica del SII (fase 15): arma el documento (DTE) en el formato del SII que usa
 * OpenFactura (Encabezado / Detalle / Totales). Puro: no llama a nadie.
 * 33 = factura afecta (con IVA; puede llevar una línea exenta) · 34 = factura exenta.
 */

import { limpiarRut, rutValido } from '@/lib/rut';
import type { Desglose } from '@/lib/contabilidad';

export interface Emisor { rut: string; razon: string; giro: string; acteco: string; direccion: string; comuna: string; sucursal?: string | null }
export interface Receptor { rut: string; razon: string; giro: string; direccion: string; comuna: string; contacto?: string | null; correo?: string | null }
export interface DatosEmision {
  tipo: 33 | 34; fecha: string; emisor: Emisor; receptor: Receptor;
  item: { nombre: string; descripcion?: string | null }; montos: Desglose;
}

/** RUT como lo pide el SII: sin puntos, con guion (76795561-8). */
export const rutSII = (r: string) => { const s = limpiarRut(r); return `${s.slice(0, -1)}-${s.slice(-1)}`; };
const corta = (s: string | null | undefined, n: number) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Lo que falta para poder emitir (vacío = se puede). */
export function faltantesDTE(d: DatosEmision): string[] {
  const f: string[] = [];
  if (!rutValido(d.emisor.rut)) f.push('el RUT de la empresa (Mi empresa)');
  if (!d.emisor.giro.trim()) f.push('el giro de la empresa (Mi empresa)');
  if (!d.emisor.direccion.trim()) f.push('la dirección de la empresa (Mi empresa)');
  if (!d.emisor.acteco.trim()) f.push('el código de actividad económica (Configuración → Factura electrónica)');
  if (!d.emisor.comuna.trim()) f.push('la comuna de la empresa (Configuración → Factura electrónica)');
  if (!rutValido(d.receptor.rut)) f.push('un RUT válido del cliente');
  if (!d.receptor.razon.trim()) f.push('la razón social del cliente');
  if (!d.receptor.giro.trim()) f.push('el giro del cliente');
  if (!d.receptor.direccion.trim()) f.push('la dirección del cliente');
  if (!d.receptor.comuna.trim()) f.push('la comuna del cliente');
  if (!(d.montos.total > 0)) f.push('un monto mayor a cero');
  if (d.tipo === 34 && d.montos.iva > 0) f.push('que no lleve IVA (una factura exenta no tiene IVA)');
  return f;
}

export function armarDTE(d: DatosEmision) {
  const m = d.montos;
  const nombre = corta(d.item.nombre, 80) || 'Servicios eléctricos';
  const dsc = corta(d.item.descripcion, 1000);
  const linea = (n: number, monto: number, exento: boolean) => ({
    NroLinDet: n, NmbItem: nombre, ...(dsc ? { DscItem: dsc } : {}), ...(exento ? { IndExe: 1 } : {}),
    QtyItem: 1, PrcItem: monto, MontoItem: monto,
  });
  const Detalle = d.tipo === 34
    ? [linea(1, m.total, true)]
    : [linea(1, m.neto, false), ...(m.exento > 0 ? [{ ...linea(2, m.exento, true), NmbItem: `${nombre.slice(0, 70)} (exento)` }] : [])];
  const Totales = d.tipo === 34
    ? { MntExe: m.total, MntTotal: m.total }
    : { MntNeto: m.neto, ...(m.exento > 0 ? { MntExe: m.exento } : {}), TasaIVA: '19', IVA: m.iva, MntTotal: m.total };
  return {
    Encabezado: {
      IdDoc: { TipoDTE: d.tipo, Folio: 0, FchEmis: d.fecha },
      Emisor: {
        RUTEmisor: rutSII(d.emisor.rut), RznSoc: corta(d.emisor.razon, 100), GiroEmis: corta(d.emisor.giro, 80),
        Acteco: corta(d.emisor.acteco, 6), DirOrigen: corta(d.emisor.direccion, 70), CmnaOrigen: corta(d.emisor.comuna, 20),
        ...(d.emisor.sucursal ? { CdgSIISucur: corta(d.emisor.sucursal, 9) } : {}),
      },
      Receptor: {
        RUTRecep: rutSII(d.receptor.rut), RznSocRecep: corta(d.receptor.razon, 100), GiroRecep: corta(d.receptor.giro, 40),
        DirRecep: corta(d.receptor.direccion, 70), CmnaRecep: corta(d.receptor.comuna, 20),
        ...(d.receptor.contacto ? { Contacto: corta(d.receptor.contacto, 80) } : {}),
        ...(d.receptor.correo ? { CorreoRecep: corta(d.receptor.correo, 80) } : {}),
      },
      Totales,
    },
    Detalle,
  };
}
