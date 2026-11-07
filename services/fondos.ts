'use client';

/**
 * Fondos por persona (fase 19). La base hace las cuentas y cuida las reglas (el fondo nunca
 * queda negativo, los movimientos no se editan, solo quien paga entrega, paga y revierte).
 */

import { supabase } from '@/lib/supabase';
import type { Cuentas, GastoDelFondo, MovimientoFondo } from '@/lib/fondos';

const lanzar = (e: unknown) => {
  if (!e) return;
  const x = e as { message?: string };
  throw new Error(x.message || 'Error');
};
const num = (v: unknown) => Number(v) || 0;
const aCuentas = (r: Record<string, unknown> | null | undefined): Cuentas => ({
  en_fondo: num(r?.en_fondo), disponible: num(r?.disponible), por_confirmar: num(r?.por_confirmar), debemos: num(r?.debemos), en_revision: num(r?.en_revision),
});

export type CuentasDe = Cuentas & { usuario_id: string };

export const fondosService = {
  /** Las cuentas de una persona (sin `uid`: las propias). */
  async situacion(uid?: string | null): Promise<Cuentas> {
    const { data, error } = await supabase.rpc('fondo_situacion', uid ? { p_uid: uid } : {});
    lanzar(error);
    return aCuentas(((data || []) as Record<string, unknown>[])[0]);
  },
  /** Todo el equipo con fondo o deuda (quien ve todas las rendiciones). */
  async equipo(): Promise<CuentasDe[]> {
    const { data, error } = await supabase.rpc('fondos_equipo');
    lanzar(error);
    return ((data || []) as Record<string, unknown>[]).map(r => ({ usuario_id: String(r.usuario_id), ...aCuentas(r) }));
  },
  async movimientos(uid?: string | null): Promise<MovimientoFondo[]> {
    let q = supabase.from('fondo_movimientos').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(500);
    if (uid) q = q.eq('usuario_id', uid);
    const { data, error } = await q;
    lanzar(error);
    return ((data || []) as MovimientoFondo[]).map(m => ({ ...m, monto: num(m.monto) }));
  },
  /** Los gastos de una persona, para su libro. */
  async gastosDe(uid: string): Promise<(GastoDelFondo & { boleta_path: string | null; sin_boleta?: boolean; cotizacion_id?: string | null; proyecto_id?: string | null })[]> {
    const { data, error } = await supabase.from('gastos')
      .select('id, fecha, monto, monto_fondo, monto_propio, pagado_con, estado, descripcion, categoria, created_at, boleta_path, sin_boleta, cotizacion_id, proyecto_id')
      .eq('usuario_id', uid).order('fecha').limit(1000);
    lanzar(error);
    return ((data || []) as (GastoDelFondo & { boleta_path: string | null })[]).map(g => ({
      ...g, monto: num(g.monto), monto_fondo: g.monto_fondo === null ? null : num(g.monto_fondo), monto_propio: g.monto_propio === null ? null : num(g.monto_propio),
    }));
  },
  async entregar(uid: string, monto: number, fecha: string, nota: string | null, comprobante: string | null) {
    const { error } = await supabase.from('fondo_movimientos').insert({ usuario_id: uid, tipo: 'entrega', monto, fecha, nota, comprobante_path: comprobante });
    lanzar(error);
  },
  /** La persona declara que devolvió (con su comprobante): queda por confirmar. */
  async declararDevolucion(uid: string, monto: number, fecha: string, nota: string | null, comprobante: string) {
    const { error } = await supabase.from('fondo_movimientos').insert({ usuario_id: uid, tipo: 'devolucion', monto, fecha, nota, comprobante_path: comprobante, estado: 'por_confirmar' });
    lanzar(error);
  },
  /** Quien paga recibe una devolución (en mano o en la cuenta): queda confirmada, con motivo. */
  async recibirDevolucion(uid: string, monto: number, fecha: string, motivo: string, comprobante: string | null) {
    const { error } = await supabase.from('fondo_movimientos').insert({ usuario_id: uid, tipo: 'devolucion', monto, fecha, motivo, comprobante_path: comprobante });
    lanzar(error);
  },
  async confirmar(id: string) {
    const { error } = await supabase.from('fondo_movimientos').update({ estado: 'confirmado' }).eq('id', id);
    lanzar(error);
  },
  /** «No llegó» (quien paga, con motivo) o «Retirar» (quien la declaró). */
  async descartar(id: string, motivo: string | null) {
    const { error } = await supabase.from('fondo_movimientos').update({ estado: 'descartado', motivo }).eq('id', id);
    lanzar(error);
  },
  /** Pagar lo que puso: por transferencia («pago») o descontándolo de su fondo («compensacion»). */
  async pagar(uid: string, monto: number, como: 'pago' | 'compensacion', fecha: string, nota: string | null, comprobante: string | null) {
    const { error } = await supabase.from('fondo_movimientos').insert({ usuario_id: uid, tipo: como, monto, fecha, nota, comprobante_path: comprobante });
    lanzar(error);
  },
  async revertir(m: Pick<MovimientoFondo, 'id' | 'usuario_id' | 'monto'>, motivo: string) {
    const { error } = await supabase.from('fondo_movimientos').insert({ usuario_id: m.usuario_id, tipo: 'reversa', monto: m.monto, revierte_id: m.id, motivo });
    lanzar(error);
  },
};
