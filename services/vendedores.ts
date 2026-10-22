import { supabase } from '@/lib/supabase';
import type { Vendedor } from '@/types';

/**
 * Datos de quien cotiza (cuentas de usuario). Tolerante: si la base aún no tiene
 * la Fase 1 (sin cargo/teléfono), devuelve lo que haya o nada, y el PDF usa los
 * datos de la empresa como antes.
 */
export const vendedoresService = {
  async mapa(): Promise<Record<string, Vendedor>> {
    try {
      let r = await supabase.from('profiles').select('id, nombre, email, cargo, telefono, empresa_id, activo');
      if (r.error) r = await supabase.from('profiles').select('id, nombre, email, cargo, telefono') as typeof r;
      if (r.error) throw r.error;
      return Object.fromEntries((r.data || []).map(p => [p.id as string, {
        id: p.id as string,
        nombre: (p.nombre as string) || (p.email as string) || '',
        cargo: p.cargo as string | null, telefono: p.telefono as string | null, email: p.email as string | null,
        empresa_id: (p.empresa_id as string | null) ?? null, activo: p.activo !== false,
      }]));
    } catch {
      return {};
    }
  },
};

/** Firma corta para mensajes: «César Castro, Jefe comercial · InnVolt SpA». */
export function firmaVendedor(v: Vendedor | null | undefined, empresa: string): string {
  if (!v?.nombre) return empresa;
  return `${v.nombre}${v.cargo ? `, ${v.cargo}` : ''} · ${empresa}`;
}
