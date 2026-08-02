import { supabase } from '@/lib/supabase';
import type {
  CatalogoItem, Receta, RecetaComponente, RecetaConComponentes,
} from '@/types';

// ══════════════════════════════════════════════════════════════════════════════
// CATÁLOGO DE ÍTEMS (biblioteca)
// ══════════════════════════════════════════════════════════════════════════════

export const catalogoService = {
  async getAll(soloActivos = true): Promise<CatalogoItem[]> {
    let q = supabase.from('catalogo_items').select('*').order('descripcion');
    if (soloActivos) q = q.eq('activo', true);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async create(item: Omit<CatalogoItem, 'id' | 'created_at' | 'updated_at'>): Promise<CatalogoItem> {
    const { data, error } = await supabase
      .from('catalogo_items')
      .insert([{ ...item, activo: item.activo ?? true }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, item: Partial<CatalogoItem>): Promise<CatalogoItem> {
    const { data, error } = await supabase
      .from('catalogo_items')
      .update(item)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('catalogo_items').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Carga masiva desde Excel. Actualiza si coincide el código (o la
   * descripción+categoría); si no, inserta. Así reimportar no duplica.
   */
  async bulkUpsert(
    rows: Array<Omit<CatalogoItem, 'id' | 'created_at' | 'updated_at'>>,
  ): Promise<{ creados: number; actualizados: number }> {
    const existentes = await this.getAll(false);
    const porCodigo = new Map<string, CatalogoItem>();
    const porDesc   = new Map<string, CatalogoItem>();
    for (const e of existentes) {
      if (e.codigo) porCodigo.set(e.codigo.trim().toLowerCase(), e);
      porDesc.set(`${e.categoria}|${e.descripcion.trim().toLowerCase()}`, e);
    }

    let creados = 0, actualizados = 0;
    for (const row of rows) {
      const key = `${row.categoria}|${row.descripcion.trim().toLowerCase()}`;
      const match = (row.codigo && porCodigo.get(row.codigo.trim().toLowerCase())) || porDesc.get(key);
      if (match) {
        await this.update(match.id, row);
        actualizados++;
      } else {
        const nuevo = await this.create(row);
        creados++;
        if (nuevo.codigo) porCodigo.set(nuevo.codigo.trim().toLowerCase(), nuevo);
        porDesc.set(key, nuevo);
      }
    }
    return { creados, actualizados };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// RECETAS (ensambles)
// ══════════════════════════════════════════════════════════════════════════════

export const recetasService = {
  async getAll(soloActivas = true): Promise<Receta[]> {
    let q = supabase.from('recetas').select('*').order('nombre');
    if (soloActivas) q = q.eq('activo', true);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  /** Trae una receta con sus componentes ordenados. */
  async getConComponentes(id: string): Promise<RecetaConComponentes | null> {
    const { data: receta, error: e1 } = await supabase
      .from('recetas').select('*').eq('id', id).single();
    if (e1 || !receta) return null;

    const { data: comps, error: e2 } = await supabase
      .from('receta_componentes')
      .select('*')
      .eq('receta_id', id)
      .order('orden');
    if (e2) throw e2;

    return { ...receta, componentes: comps || [] };
  },

  /** Trae TODAS las recetas con sus componentes (para el buscador del cotizador). */
  async getAllConComponentes(): Promise<RecetaConComponentes[]> {
    const { data: recetas, error: e1 } = await supabase
      .from('recetas').select('*').eq('activo', true).order('nombre');
    if (e1) throw e1;
    if (!recetas || recetas.length === 0) return [];

    const { data: comps, error: e2 } = await supabase
      .from('receta_componentes')
      .select('*')
      .in('receta_id', recetas.map(r => r.id))
      .order('orden');
    if (e2) throw e2;

    const porReceta = new Map<string, RecetaComponente[]>();
    (comps || []).forEach(c => {
      const arr = porReceta.get(c.receta_id) || [];
      arr.push(c);
      porReceta.set(c.receta_id, arr);
    });

    return recetas.map(r => ({ ...r, componentes: porReceta.get(r.id) || [] }));
  },

  async create(receta: Omit<Receta, 'id' | 'created_at' | 'updated_at'>): Promise<Receta> {
    const { data, error } = await supabase
      .from('recetas')
      .insert([{ ...receta, activo: receta.activo ?? true }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, receta: Partial<Receta>): Promise<Receta> {
    const { data, error } = await supabase
      .from('recetas')
      .update(receta)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    // receta_componentes cae por ON DELETE CASCADE
    const { error } = await supabase.from('recetas').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Reemplaza por completo los componentes de una receta.
   * Se borra todo y se reinserta: simple y consistente para el editor.
   */
  async setComponentes(
    recetaId: string,
    componentes: Array<Omit<RecetaComponente, 'id' | 'receta_id'>>,
  ): Promise<void> {
    const { error: delErr } = await supabase
      .from('receta_componentes').delete().eq('receta_id', recetaId);
    if (delErr) throw delErr;

    if (componentes.length === 0) return;

    const filas = componentes.map((c, i) => ({
      receta_id:   recetaId,
      item_id:     c.item_id ?? null,
      descripcion: c.descripcion,
      categoria:   c.categoria,
      unidad:      c.unidad,
      costo:       c.costo,
      cantidad:    c.cantidad,
      orden:       c.orden ?? i,
    }));
    const { error: insErr } = await supabase.from('receta_componentes').insert(filas);
    if (insErr) throw insErr;
  },
};
