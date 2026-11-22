'use client';

/**
 * Control de proyecto (fase 20): lee lo que necesitan el control de presupuesto y el flujo de caja
 * de un trabajo (la cotización, sus gastos, compras, mano de obra, horas de antes y cobros; con la
 * fase 21, el anteproyecto y el detalle de cada compra y gasto), las partidas para elegir al
 * registrar, y guarda el plan del flujo. Las cuentas: lib/controlProyecto.ts y lib/anteproyecto.ts.
 */

import { supabase } from '@/lib/supabase';
import {
  opcionesDePartida, type CobroCP, type CompraCP, type DocumentoLineaCP, type FlujoPlan, type GastoCP, type HoraCP, type ManoObraCP, type PartidaOpcion,
} from '@/lib/controlProyecto';
import { anteproyectoService, type LineaPresupuestoBD } from '@/services/anteproyecto';
import type { HitoCobro, Linea, Moneda, PartidaCot } from '@/lib/cotizador/tipos';

export interface CotizacionControl {
  id: string; folio: number; items: Linea[]; partidas: PartidaCot[]; moneda: Moneda | null; valor_uf: number | null;
  total: number | null; total_clp: number | null; plan_cobro: HitoCobro[] | null; flujo_plan: unknown;
  trabajo_inicio: string | null; aceptada_at: string | null;
}
export interface DatosControl {
  cot: CotizacionControl; gastos: GastoCP[]; compras: CompraCP[]; manoObra: ManoObraCP[]; horas: HoraCP[]; cobros: CobroCP[];
  /** Fase 21: el anteproyecto y el detalle de compras y gastos (vacíos sin la fase). */
  presupuesto: LineaPresupuestoBD[]; lineas: DocumentoLineaCP[];
}

// Las partidas de cada trabajo, una vez por sesión (cambian solo si la cotización vuelve a borrador).
const cachePartidas = new Map<string, Promise<PartidaOpcion[]>>();

export const controlProyectoService = {
  /** Las partidas de una cotización, numeradas como en la cotización (vacío si no se puede leer). */
  partidasDe(cotId: string): Promise<PartidaOpcion[]> {
    if (!cachePartidas.has(cotId)) {
      const p = Promise.resolve(supabase.from('cotizaciones').select('partidas').eq('id', cotId).maybeSingle())
        .then(({ data, error }) => (error ? [] : opcionesDePartida((data as { partidas?: PartidaCot[] } | null)?.partidas)))
        .catch(() => [] as PartidaOpcion[]);
      cachePartidas.set(cotId, p);
      p.then(l => { if (!l.length) cachePartidas.delete(cotId); });
    }
    return cachePartidas.get(cotId)!;
  },

  async datos(cotId: string): Promise<DatosControl> {
    const [c, g, k, m, h, f, presupuesto] = await Promise.all([
      supabase.from('cotizaciones')
        .select('id, folio, items, partidas, moneda, valor_uf, total, total_clp, plan_cobro, flujo_plan, trabajo_inicio, aceptada_at')
        .eq('id', cotId).single(),
      supabase.from('gastos').select('id, fecha, monto, categoria, descripcion, estado, partida_id, usuario_id').eq('cotizacion_id', cotId),
      supabase.from('compras')
        .select('id, fecha, tipo_doc, folio, proveedor_nombre, proveedor_rut, neto, exento, iva, total, pagada, fecha_pago, partida_id, tipo_costo, descripcion')
        .eq('cotizacion_id', cotId),
      supabase.from('mano_obra')
        .select('id, fecha, tipo, nombre, horas, monto_liquido, honorarios, costo, pagado, fecha_pago, documento, nota, partida_id, trabajador_id')
        .eq('cotizacion_id', cotId),
      supabase.from('horas_trabajo').select('id, fecha, horas, costo_hora, usuario_id, nota').eq('cotizacion_id', cotId),
      supabase.from('por_facturar').select('monto, monto_pagado, fecha_pago, fecha_factura, created_at, hito').eq('cotizacion_id', cotId),
      anteproyectoService.lineas(cotId),
    ]);
    if (c.error) throw c.error;
    const gastos = (g.data || []) as GastoCP[], compras = (k.data || []) as CompraCP[];
    const lineas = await anteproyectoService.lineasDeDocumentos(compras.map(x => x.id), gastos.map(x => x.id));
    // Sin permiso para ver compras o mano de obra, la base no devuelve filas: igual que cotizacion_resultado.
    return {
      cot: c.data as unknown as CotizacionControl,
      gastos, compras, manoObra: (m.data || []) as ManoObraCP[],
      horas: (h.data || []) as HoraCP[], cobros: (f.data || []) as CobroCP[], presupuesto, lineas,
    };
  },

  async guardarFlujo(cotId: string, plan: FlujoPlan) {
    const { error } = await supabase.from('cotizaciones').update({ flujo_plan: plan }).eq('id', cotId);
    if (error) throw error;
  },
};
