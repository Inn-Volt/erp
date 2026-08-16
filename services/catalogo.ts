import { supabase } from '@/lib/supabase';
import { parseCategoria } from '@/utils';
import type {
  CatalogoItem, Receta, RecetaComponente, RecetaConComponentes,
} from '@/types';

// ══════════════════════════════════════════════════════════════════════════════
// CATÁLOGO DE ÍTEMS (biblioteca)
// ══════════════════════════════════════════════════════════════════════════════

export const catalogoService = {
  /**
   * Trae TODOS los ítems paginando (Supabase corta en 1000 por consulta y el
   * catálogo del Google Sheet puede tener miles de ítems).
   */
  async getAll(soloActivos = true): Promise<CatalogoItem[]> {
    const all: CatalogoItem[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      let q = supabase.from('catalogo_items').select('*').order('descripcion').range(from, from + page - 1);
      if (soloActivos) q = q.eq('activo', true);
      const { data, error } = await q;
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < page) break;
    }
    return all;
  },

  /**
   * Sincroniza el catálogo desde el Google Sheet: hace upsert por `codigo`
   * escribiendo SOLO lo que cambió (así una re-sincronización es rápida).
   * No borra ítems que ya no estén en el Sheet (para no perder los manuales).
   */
  async syncCatalogo(
    rows: Array<Omit<CatalogoItem, 'id' | 'created_at' | 'updated_at'>>,
  ): Promise<{ creados: number; actualizados: number; sinCambios: number; borrados: number }> {
    const existentes = await this.getAll(false);
    const porCodigo = new Map<string, CatalogoItem>();
    for (const e of existentes) if (e.codigo) porCodigo.set(e.codigo.trim().toLowerCase(), e);

    const differs = (a: Partial<CatalogoItem>, b: CatalogoItem) =>
      (a.descripcion || '') !== (b.descripcion || '') ||
      Number(a.costo || 0) !== Number(b.costo || 0) ||
      (a.categoria || '') !== (b.categoria || '') ||
      (a.unidad || '') !== (b.unidad || '') ||
      (a.proveedor || '') !== (b.proveedor || '') ||
      (a.link || '') !== (b.link || '') ||
      (a.familia || '') !== (b.familia || '');

    const toUpsert: Array<Record<string, unknown>> = [];
    const toInsert: Array<Record<string, unknown>> = [];
    let sinCambios = 0;
    for (const r of rows) {
      const cod = (r.codigo || '').trim();
      const m = cod ? porCodigo.get(cod.toLowerCase()) : undefined;
      const row = { ...r, activo: r.activo ?? true };
      if (m) {
        if (differs(r, m)) toUpsert.push({ ...row, id: m.id });
        else sinCambios++;
      } else {
        toInsert.push(row);
      }
    }

    const chunk = <T,>(arr: T[], n: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    };

    let actualizados = 0, creados = 0;
    for (const c of chunk(toUpsert, 500)) {
      const { error } = await supabase.from('catalogo_items').upsert(c);
      if (error) throw error;
      actualizados += c.length;
    }
    for (const c of chunk(toInsert, 500)) {
      const { error } = await supabase.from('catalogo_items').insert(c);
      if (error) throw error;
      creados += c.length;
    }

    // Espejo: borra los ítems que ya NO están en el Sheet. Solo se borran los
    // gestionados por el Sheet (tienen `codigo` y `familia`), para no tocar los
    // ítems creados a mano en la app (sin familia). Las recetas que los usaban
    // conservan su costo (item_id → NULL por ON DELETE SET NULL).
    const codigosSheet = new Set(rows.map(r => (r.codigo || '').trim().toLowerCase()).filter(Boolean));
    const idsBorrar = existentes
      .filter(e => e.codigo && e.familia && !codigosSheet.has(e.codigo.trim().toLowerCase()))
      .map(e => e.id);
    let borrados = 0;
    for (const c of chunk(idsBorrar, 200)) {
      const { error } = await supabase.from('catalogo_items').delete().in('id', c);
      if (error) throw error;
      borrados += c.length;
    }

    return { creados, actualizados, sinCambios, borrados };
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

/**
 * Sobrescribe el costo de cada componente con el costo VIVO del catálogo
 * (por item_id). Así, al sincronizar precios desde el Google Sheet, las recetas
 * y sus partidas reflejan los valores actualizados sin re-guardar snapshots.
 * Los componentes sin item_id conservan su costo guardado.
 */
async function overrideCostosVivos(comps: RecetaComponente[]): Promise<RecetaComponente[]> {
  const ids = [...new Set(comps.filter(c => c.item_id).map(c => c.item_id as string))];
  if (ids.length === 0) return comps;
  const costos = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase
      .from('catalogo_items').select('id, costo').in('id', ids.slice(i, i + 300));
    (data || []).forEach((d: { id: string; costo: number }) => costos.set(d.id, d.costo));
  }
  return comps.map(c => (c.item_id && costos.has(c.item_id)) ? { ...c, costo: costos.get(c.item_id)! } : c);
}

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

    return { ...receta, componentes: await overrideCostosVivos(comps || []) };
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

    const compsVivos = await overrideCostosVivos(comps || []);
    const porReceta = new Map<string, RecetaComponente[]>();
    compsVivos.forEach(c => {
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
   * Sincroniza recetas desde el Google Sheet (pestaña "Recetas", formato largo).
   * Cada receta se hace upsert por nombre; sus componentes se resuelven por
   * `codigo` contra el catálogo (item_id + snapshot de descripción/categoría/
   * unidad/costo). Los códigos no encontrados en el catálogo se omiten.
   * No borra recetas ausentes del Sheet (para no perder las hechas a mano).
   */
  async syncRecetas(
    sheetRecetas: Array<{ nombre: string; descripcion: string; unidad: string; componentes: Array<{ codigo?: string; descripcion?: string; categoria?: string; unidad?: string; costo?: number; cantidad: number }> }>,
  ): Promise<{ creados: number; actualizados: number; componentes: number; omitidos: number }> {
    if (!sheetRecetas || sheetRecetas.length === 0) return { creados: 0, actualizados: 0, componentes: 0, omitidos: 0 };

    const catalogo = await catalogoService.getAll(false);
    const porCodigo = new Map<string, CatalogoItem>();
    for (const c of catalogo) if (c.codigo) porCodigo.set(c.codigo.trim().toLowerCase(), c);

    const existentes = await this.getAll(false);
    const porNombre = new Map<string, Receta>();
    for (const r of existentes) porNombre.set(r.nombre.trim().toLowerCase(), r);

    let creados = 0, actualizados = 0, componentes = 0, omitidos = 0;
    for (const sr of sheetRecetas) {
      let receta = porNombre.get(sr.nombre.trim().toLowerCase());
      if (receta) {
        await this.update(receta.id, { descripcion: sr.descripcion, unidad: sr.unidad });
        actualizados++;
      } else {
        receta = await this.create({ nombre: sr.nombre, descripcion: sr.descripcion, unidad: sr.unidad });
        creados++;
      }
      const comps: Array<Omit<RecetaComponente, 'id' | 'receta_id'>> = [];
      for (const c of sr.componentes) {
        const cat = c.codigo ? porCodigo.get(c.codigo.trim().toLowerCase()) : undefined;
        if (cat) {
          // Enlazado al catálogo → costo VIVO (item_id).
          comps.push({
            item_id: cat.id, descripcion: cat.descripcion, categoria: cat.categoria,
            unidad: cat.unidad, costo: cat.costo, cantidad: c.cantidad, orden: comps.length,
          });
        } else if (c.descripcion) {
          // Componente definido en la propia hoja (descripción + costo explícito).
          comps.push({
            item_id: null, descripcion: c.descripcion,
            categoria: parseCategoria(c.categoria || 'material'),
            unidad: c.unidad || 'un', costo: c.costo || 0,
            cantidad: c.cantidad, orden: comps.length,
          });
        } else {
          omitidos++;
        }
      }
      await this.setComponentes(receta.id, comps);
      componentes += comps.length;
    }
    return { creados, actualizados, componentes, omitidos };
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
