/**
 * Cobranza (fase 25): abonos libres de cada trabajo, las cuentas (total, abonado, saldo) y los
 * ajustes (facturación activa, PPM). La lógica de la cuenta está en lib/cobranza.ts.
 */

import { supabase } from '@/lib/supabase';
import type { HitoCobro } from '@/lib/cotizador/tipos';
import type { MedioAbono } from '@/lib/cobranza';
import type { CobroCP } from '@/lib/controlProyecto';

export interface Abono {
  id: string; cotizacion_id: string; fecha: string; monto: number; medio: MedioAbono;
  referencia: string | null; nota: string | null; comprobante_path: string | null;
  movimiento_banco_id: string | null; origen_por_facturar_id: string | null;
  created_by: string | null; created_at: string;
  profiles?: { nombre: string | null } | null;
}
export type AbonoNuevo = Pick<Abono, 'cotizacion_id' | 'fecha' | 'monto' | 'medio' | 'referencia' | 'nota' | 'comprobante_path'> & { movimiento_banco_id?: string | null };

/** Un trabajo (cotización aprobada) con lo que hace falta para su cuenta. */
export interface TrabajoCobranza {
  id: string; folio: number; titulo: string | null; total: number; total_clp: number | null; iva: number | null;
  moneda: string | null; valor_uf: number | null; plan_cobro: HitoCobro[] | null;
  trabajo_estado: string | null; trabajo_termino: string | null; aceptada_at: string | null; cliente_id: string | null;
  clientes?: { nombre_cliente: string; telefono?: string | null; email?: string | null; contacto_nombre?: string | null } | null;
}

export interface AjustesCobranza { facturacionActiva: boolean; ppmPct: number; plan: HitoCobro[] | null }

/** El plan del trabajo como lo usa la base (_plan_cobro): el suyo, el de los ajustes o «todo al terminar». */
export const planDeTrabajo = (t: Pick<TrabajoCobranza, 'plan_cobro'>, planAjustes: HitoCobro[] | null): HitoCobro[] =>
  t.plan_cobro?.length ? t.plan_cobro : planAjustes?.length ? planAjustes : [{ nombre: 'Total', porcentaje: 100, cuando: 'terminar' }];

/** IVA ÷ total de la cotización (0 si no lleva IVA). */
export const ivaRatio = (t: Pick<TrabajoCobranza, 'iva' | 'total'>) => (Number(t.total) > 0 ? Math.min(Math.max(Number(t.iva) || 0, 0) / Number(t.total), 1) : 0);

/** El total en pesos (una cotización en UF trae su total en pesos aparte). */
export const totalPesos = (t: Pick<TrabajoCobranza, 'total' | 'total_clp'>) => Number(t.total_clp ?? t.total ?? 0);

const falta = (e: { code?: string; message?: string } | null | undefined) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703' || /abonos|facturacion_activa|ppm_pct/.test(e.message || ''));
const lanzar = (e: unknown) => { if (e) throw e; };

const SELECT_TRABAJO = 'id, folio, titulo, total, total_clp, iva, moneda, valor_uf, plan_cobro, trabajo_estado, trabajo_termino, aceptada_at, cliente_id, clientes(nombre_cliente, telefono, email, contacto_nombre)';

export const cobranzaService = {
  async ajustes(): Promise<AjustesCobranza> {
    const { data, error } = await supabase.from('ajustes_cotizacion').select('plan_cobro, facturacion_activa, ppm_pct').eq('id', 1).maybeSingle();
    if (error) {
      // Sin la fase 25 (o sin permiso para leer los ajustes): como antes, con la facturación.
      const { data: d } = await supabase.from('ajustes_cotizacion').select('plan_cobro').eq('id', 1).maybeSingle();
      return { facturacionActiva: true, ppmPct: 0, plan: (d as { plan_cobro?: HitoCobro[] } | null)?.plan_cobro || null };
    }
    const a = data as { plan_cobro?: HitoCobro[] | null; facturacion_activa?: boolean; ppm_pct?: number } | null;
    return { facturacionActiva: !!a?.facturacion_activa, ppmPct: Number(a?.ppm_pct) || 0, plan: a?.plan_cobro || null };
  },
  async guardarAjustes(a: { facturacion_activa: boolean; ppm_pct: number }) {
    const { error } = await supabase.from('ajustes_cotizacion').update(a).eq('id', 1);
    lanzar(error);
  },

  /** Los trabajos aprobados (para la cobranza). */
  async trabajos(): Promise<TrabajoCobranza[]> {
    const { data, error } = await supabase.from('cotizaciones').select(SELECT_TRABAJO).eq('estado', 'Aprobada').order('folio', { ascending: false }).limit(500);
    lanzar(error);
    return (data || []) as unknown as TrabajoCobranza[];
  },
  async trabajo(id: string): Promise<TrabajoCobranza | null> {
    const { data, error } = await supabase.from('cotizaciones').select(SELECT_TRABAJO).eq('id', id).maybeSingle();
    lanzar(error);
    return data as unknown as TrabajoCobranza | null;
  },

  /** Todos los abonos (sin el detalle), para las cuentas y el panel de dinero. */
  async abonos(): Promise<Pick<Abono, 'id' | 'cotizacion_id' | 'fecha' | 'monto'>[]> {
    const { data, error } = await supabase.from('abonos').select('id, cotizacion_id, fecha, monto').order('fecha');
    lanzar(error);
    return ((data || []) as Abono[]).map(a => ({ ...a, monto: Number(a.monto) }));
  },
  async abonosDe(cotId: string): Promise<Abono[]> {
    const { data, error } = await supabase.from('abonos').select('*, profiles:created_by(nombre)').eq('cotizacion_id', cotId)
      .order('fecha', { ascending: false }).order('created_at', { ascending: false });
    lanzar(error);
    return ((data || []) as Abono[]).map(a => ({ ...a, monto: Number(a.monto) }));
  },
  async guardarAbono(a: AbonoNuevo, id?: string): Promise<string> {
    const fila = { ...a, referencia: a.referencia?.trim() || null, nota: a.nota?.trim() || null };
    if (id) {
      const { error } = await supabase.from('abonos').update(fila).eq('id', id);
      lanzar(error);
      return id;
    }
    const { data, error } = await supabase.from('abonos').insert(fila).select('id').single();
    lanzar(error);
    return (data as { id: string }).id;
  },
  async eliminarAbono(a: Pick<Abono, 'id' | 'comprobante_path'>) {
    const { error } = await supabase.from('abonos').delete().eq('id', a.id);
    lanzar(error);
    if (a.comprobante_path) await supabase.storage.from('abonos').remove([a.comprobante_path]);
  },
  async subirComprobante(f: File): Promise<string> {
    const limpio = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-60);
    const path = `${new Date().getFullYear()}/${crypto.randomUUID()}-${limpio}`;
    const { error } = await supabase.storage.from('abonos').upload(path, f, { contentType: f.type || undefined });
    lanzar(error);
    return path;
  },
  async urlComprobante(path: string): Promise<string | null> {
    const { data } = await supabase.storage.from('abonos').createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  },

  /**
   * Lo cobrado de un trabajo para el análisis de proyecto y su flujo de caja: los abonos (con su
   * fecha) y, de antes, lo anotado en «Por facturar» que no pasó a abono. Sin la fase 25, lo de antes.
   */
  async pagosParaControl(cotId: string): Promise<CobroCP[]> {
    const [a, f] = await Promise.all([
      supabase.from('abonos').select('fecha, monto, created_at, origen_por_facturar_id').eq('cotizacion_id', cotId),
      supabase.from('por_facturar').select('id, monto, monto_pagado, fecha_pago, fecha_factura, created_at, hito').eq('cotizacion_id', cotId),
    ]);
    lanzar(f.error);
    const deAntes = ((f.data || []) as (CobroCP & { id: string })[]);
    if (a.error) {
      if (falta(a.error)) return deAntes;
      throw a.error;
    }
    const abonos = (a.data || []) as { fecha: string; monto: number; created_at: string; origen_por_facturar_id: string | null }[];
    const traidos = new Set(abonos.map(x => x.origen_por_facturar_id).filter(Boolean));
    return [
      ...abonos.map(x => ({ monto: Number(x.monto), monto_pagado: Number(x.monto), fecha_pago: x.fecha, created_at: x.created_at, hito: null })),
      ...deAntes.filter(p => Number(p.monto_pagado) > 0 && !traidos.has(p.id)),
    ];
  },
};

/** ¿Falta correr supabase_fase25_cobranza.sql? */
export const faltaFase25 = (e: unknown) => falta(e as { code?: string; message?: string });
