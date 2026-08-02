'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus, Search, Trash2, Edit3, X, Loader2, Package, Layers, Save,
  FileUp, FileDown,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { catalogoService, recetasService } from '@/services/catalogo';
import { useToast } from '@/hooks/useToast';
import { formatCLP, cleanNumber, costoReceta, parseCategoria } from '@/utils';
import type {
  CatalogoItem, RecetaComponente, RecetaConComponentes, CategoriaItem,
} from '@/types';
import {
  CATEGORIA_LABELS, CATEGORIAS_ORDEN, CATEGORIA_COLORS, UNIDADES,
} from '@/types';

// ─── Estilos base ─────────────────────────────────────────────────────────────
const field: React.CSSProperties = {
  background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)',
  fontFamily: 'var(--font-body)', fontSize: '0.85rem', padding: '0.5rem 0.7rem',
  outline: 'none', width: '100%', borderRadius: 'var(--r-sm)',
};
const fieldLabel: React.CSSProperties = {
  fontSize: '0.6rem', color: 'var(--muted)', marginBottom: '0.25rem', display: 'block',
  fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
};

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: Ítem de catálogo
// ══════════════════════════════════════════════════════════════════════════════
function ItemModal({ item, onClose, onSaved }: {
  item: Partial<CatalogoItem> | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { success, error } = useToast();
  const [form, setForm] = useState<Partial<CatalogoItem>>({
    descripcion: '', categoria: 'material', unidad: 'un', costo: 0, codigo: '', ...item,
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof CatalogoItem, v: string | number) => setForm(p => ({ ...p, [k]: v }));

  const guardar = async () => {
    if (!form.descripcion?.trim()) { error('La descripción es obligatoria'); return; }
    setSaving(true);
    try {
      const payload = {
        codigo: form.codigo?.trim() || undefined,
        descripcion: form.descripcion.trim(),
        categoria: (form.categoria || 'material') as CategoriaItem,
        unidad: form.unidad || 'un',
        costo: cleanNumber(form.costo),
      };
      if (item?.id) await catalogoService.update(item.id, payload);
      else await catalogoService.create(payload);
      success(item?.id ? 'Ítem actualizado' : 'Ítem agregado al catálogo');
      onSaved();
    } catch (e) {
      error('Error al guardar: ' + (e instanceof Error ? e.message : 'Error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 200 }}>
      <div className="modal-box" style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border2)' }}>
          <span className="section-label" style={{ margin: 0, paddingTop: 0 }}><Package size={13} /> {item?.id ? 'Editar ítem' : 'Nuevo ítem'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '1.25rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <span style={fieldLabel}>Descripción *</span>
            <input style={field} value={form.descripcion || ''} onChange={e => set('descripcion', e.target.value)} placeholder="Ej. Cable THHN 2.5mm" autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div>
              <span style={fieldLabel}>Categoría</span>
              <select style={field} value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                {CATEGORIAS_ORDEN.map(c => <option key={c} value={c}>{CATEGORIA_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <span style={fieldLabel}>Unidad</span>
              <select style={field} value={form.unidad} onChange={e => set('unidad', e.target.value)}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div>
              <span style={fieldLabel}>Costo unitario (CLP)</span>
              <input style={field} type="number" min="0" value={form.costo || ''} onChange={e => set('costo', parseFloat(e.target.value) || 0)} placeholder="0" />
            </div>
            <div>
              <span style={fieldLabel}>Código (opcional)</span>
              <input style={field} value={form.codigo || ''} onChange={e => set('codigo', e.target.value)} placeholder="MAT-001" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
            <button onClick={onClose} className="btn btn-ghost">Cancelar</button>
            <button onClick={guardar} disabled={saving} className="btn btn-primary">
              {saving ? <Loader2 size={13} className="iv-spin" /> : <Save size={13} />} Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: Editor de receta
// ══════════════════════════════════════════════════════════════════════════════
type CompEdit = Omit<RecetaComponente, 'id' | 'receta_id'>;

function RecetaModal({ receta, catalogo, onClose, onSaved }: {
  receta: RecetaConComponentes | null;
  catalogo: CatalogoItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { success, error, warning } = useToast();
  const [nombre, setNombre] = useState(receta?.nombre || '');
  const [unidad, setUnidad] = useState(receta?.unidad || 'un');
  const [descripcion, setDescripcion] = useState(receta?.descripcion || '');
  const [comps, setComps] = useState<CompEdit[]>(
    (receta?.componentes || []).map(c => ({
      item_id: c.item_id, descripcion: c.descripcion, categoria: c.categoria,
      unidad: c.unidad, costo: c.costo, cantidad: c.cantidad, orden: c.orden,
    })),
  );
  const [busca, setBusca] = useState('');
  const [saving, setSaving] = useState(false);

  const sugerencias = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    return catalogo.filter(i => i.descripcion.toLowerCase().includes(q) || (i.codigo || '').toLowerCase().includes(q)).slice(0, 6);
  }, [busca, catalogo]);

  const agregar = (it: CatalogoItem) => {
    setComps(prev => [...prev, {
      item_id: it.id, descripcion: it.descripcion, categoria: it.categoria,
      unidad: it.unidad, costo: it.costo, cantidad: 1, orden: prev.length,
    }]);
    setBusca('');
  };
  const quitar = (i: number) => setComps(prev => prev.filter((_, idx) => idx !== i));
  const setCant = (i: number, v: string) => setComps(prev => prev.map((c, idx) => idx === i ? { ...c, cantidad: cleanNumber(v) } : c));

  const costoTotal = comps.reduce((s, c) => s + c.costo * c.cantidad, 0);

  const guardar = async () => {
    if (!nombre.trim()) { error('El nombre de la receta es obligatorio'); return; }
    if (comps.length === 0) { warning('Agrega al menos un componente'); return; }
    setSaving(true);
    try {
      let recetaId = receta?.id;
      if (recetaId) {
        await recetasService.update(recetaId, { nombre: nombre.trim(), unidad, descripcion: descripcion.trim() || undefined });
      } else {
        const nueva = await recetasService.create({ nombre: nombre.trim(), unidad, descripcion: descripcion.trim() || undefined });
        recetaId = nueva.id;
      }
      await recetasService.setComponentes(recetaId!, comps);
      success(receta?.id ? 'Receta actualizada' : 'Receta creada');
      onSaved();
    } catch (e) {
      error('Error al guardar: ' + (e instanceof Error ? e.message : 'Error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 200 }}>
      <div className="modal-box" style={{ maxWidth: 620, width: '95%', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ position: 'sticky', top: 0, background: 'var(--bg2)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border2)' }}>
          <span className="section-label" style={{ margin: 0, paddingTop: 0 }}><Layers size={13} /> {receta?.id ? 'Editar receta' : 'Nueva receta'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>

        <div style={{ padding: '1.25rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Datos receta */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.6rem' }}>
            <div>
              <span style={fieldLabel}>Nombre de la receta *</span>
              <input style={field} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Punto eléctrico enchufe" autoFocus />
            </div>
            <div>
              <span style={fieldLabel}>Unidad</span>
              <select style={field} value={unidad} onChange={e => setUnidad(e.target.value)}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div>
            <span style={fieldLabel}>Descripción (opcional)</span>
            <input style={field} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Notas de la receta…" />
          </div>

          {/* Buscador de componentes */}
          <div>
            <span style={fieldLabel}>Agregar componentes desde el catálogo</span>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input style={{ ...field, paddingLeft: '2rem' }} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar material, mano de obra…" />
              {sugerencias.length > 0 && (
                <div className="dropdown" style={{ borderTop: '1px solid var(--border2)' }}>
                  {sugerencias.map(it => (
                    <div key={it.id} className="dropdown-item" onMouseDown={() => agregar(it)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: CATEGORIA_COLORS[it.categoria], flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.descripcion}</span>
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: '0.75rem', flexShrink: 0 }}>{formatCLP(it.costo)}/{it.unidad}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {catalogo.length === 0 && (
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.4rem' }}>
                No hay ítems en el catálogo aún. Créalos primero en la pestaña Ítems.
              </p>
            )}
          </div>

          {/* Lista de componentes */}
          <div style={{ border: '1px solid var(--border2)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
            {comps.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem' }}>
                Sin componentes — busca arriba para agregar
              </div>
            ) : comps.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-soft)', borderLeft: `3px solid ${CATEGORIA_COLORS[c.categoria]}` }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.descripcion}</span>
                <input type="number" min="0" step="0.01" value={c.cantidad} onChange={e => setCant(i, e.target.value)} style={{ ...field, width: 70, textAlign: 'center', padding: '0.3rem' }} />
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)', width: 34 }}>{c.unidad}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text)', width: 90, textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 700 }}>{formatCLP(c.costo * c.cantidad)}</span>
                <button onClick={() => quitar(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem', background: 'var(--bg3)', borderRadius: 'var(--r-sm)', borderTop: '2px solid var(--y-brand)' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Costo interno por {unidad}</span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.1rem', color: 'var(--y)' }}>{formatCLP(costoTotal)}</span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button onClick={onClose} className="btn btn-ghost">Cancelar</button>
            <button onClick={guardar} disabled={saving} className="btn btn-primary">
              {saving ? <Loader2 size={13} className="iv-spin" /> : <Save size={13} />} Guardar receta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PÁGINA
// ══════════════════════════════════════════════════════════════════════════════
export default function BibliotecaPage() {
  const { success, error: toastError } = useToast();
  const [tab, setTab] = useState<'items' | 'recetas'>('items');

  const [items, setItems] = useState<CatalogoItem[]>([]);
  const [recetas, setRecetas] = useState<RecetaConComponentes[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [itemModal, setItemModal] = useState<{ open: boolean; item: Partial<CatalogoItem> | null }>({ open: false, item: null });
  const [recetaModal, setRecetaModal] = useState<{ open: boolean; receta: RecetaConComponentes | null }>({ open: false, receta: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [its, recs] = await Promise.all([
        catalogoService.getAll(false),
        recetasService.getAllConComponentes(),
      ]);
      setItems(its);
      setRecetas(recs);
    } catch (e) {
      console.error(e);
      toastError('No se pudo cargar la biblioteca');
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { load(); }, [load]);

  const eliminarItem = async (id: string, desc: string) => {
    if (!confirm(`¿Eliminar "${desc}" del catálogo?`)) return;
    try { await catalogoService.delete(id); success('Ítem eliminado'); load(); }
    catch (e) { toastError('Error: ' + (e instanceof Error ? e.message : 'Error')); }
  };
  const eliminarReceta = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar la receta "${nombre}"?`)) return;
    try { await recetasService.delete(id); success('Receta eliminada'); load(); }
    catch (e) { toastError('Error: ' + (e instanceof Error ? e.message : 'Error')); }
  };

  // ── Excel: importar / exportar ──────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);

  const leerExcel = (file: File): Promise<Record<string, unknown>[]> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const wb = XLSX.read(ev.target?.result, { type: 'binary' });
          resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsBinaryString(file);
    });

  const pick = (r: Record<string, unknown>, ...claves: string[]) => {
    for (const k of claves) if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k];
    return undefined;
  };

  const descargarLibro = (rows: Record<string, unknown>[], hoja: string, archivo: string) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, hoja);
    XLSX.writeFile(wb, archivo);
  };

  const exportarItems = () => {
    const rows = (items.length ? items.map(i => ({
      Codigo: i.codigo || '', Descripcion: i.descripcion, Categoria: i.categoria,
      Unidad: i.unidad, Costo: Math.round(i.costo),
    })) : [{ Codigo: 'MAT-001', Descripcion: 'Cable THHN 2.5mm', Categoria: 'material', Unidad: 'm', Costo: 450 }]);
    descargarLibro(rows, 'Catálogo', 'Biblioteca_items.xlsx');
  };

  const exportarRecetas = () => {
    const rows: Record<string, unknown>[] = [];
    for (const r of recetas) {
      if (r.componentes.length === 0) {
        rows.push({ Receta: r.nombre, UnidadReceta: r.unidad, Componente: '', Categoria: '', UnidadComp: '', Costo: '', Cantidad: '' });
      }
      for (const c of r.componentes) {
        rows.push({
          Receta: r.nombre, UnidadReceta: r.unidad,
          Componente: c.descripcion, Categoria: c.categoria,
          UnidadComp: c.unidad, Costo: Math.round(c.costo), Cantidad: c.cantidad,
        });
      }
    }
    if (rows.length === 0) rows.push({ Receta: 'Punto eléctrico', UnidadReceta: 'un', Componente: 'Cable THHN 2.5mm', Categoria: 'material', UnidadComp: 'm', Costo: 450, Cantidad: 8 });
    descargarLibro(rows, 'Recetas', 'Biblioteca_recetas.xlsx');
  };

  const importarItems = async (file: File) => {
    setImportando(true);
    try {
      const raw = await leerExcel(file);
      const filas = raw.map(r => {
        const descripcion = String(pick(r, 'Descripcion', 'Descripción', 'descripcion') ?? '').trim();
        if (!descripcion) return null;
        return {
          descripcion,
          categoria: parseCategoria(pick(r, 'Categoria', 'Categoría', 'categoria')),
          unidad: String(pick(r, 'Unidad', 'unidad') ?? 'un'),
          costo: cleanNumber(pick(r, 'Costo', 'Costo unitario', 'costo')),
          codigo: String(pick(r, 'Codigo', 'Código', 'codigo') ?? '').trim() || undefined,
          activo: true,
        };
      }).filter((x): x is NonNullable<typeof x> => x !== null);
      if (filas.length === 0) { toastError('No se encontraron ítems válidos (falta columna "Descripcion").'); return; }
      const { creados, actualizados } = await catalogoService.bulkUpsert(filas);
      success(`${creados} creados, ${actualizados} actualizados`);
      load();
    } catch (e) {
      toastError('Error al importar: ' + (e instanceof Error ? e.message : 'Error'));
    } finally { setImportando(false); }
  };

  const importarRecetas = async (file: File) => {
    setImportando(true);
    try {
      const raw = await leerExcel(file);
      // Agrupar filas por receta
      const grupos = new Map<string, { unidad: string; comps: Array<{ descripcion: string; categoria: CategoriaItem; unidad: string; costo: number; cantidad: number }> }>();
      for (const r of raw) {
        const nombre = String(pick(r, 'Receta', 'receta', 'Nombre') ?? '').trim();
        if (!nombre) continue;
        const g = grupos.get(nombre) || { unidad: String(pick(r, 'UnidadReceta', 'Unidad receta') ?? 'un'), comps: [] };
        const cdesc = String(pick(r, 'Componente', 'componente', 'Descripcion') ?? '').trim();
        if (cdesc) {
          g.comps.push({
            descripcion: cdesc,
            categoria: parseCategoria(pick(r, 'Categoria', 'Categoría')),
            unidad: String(pick(r, 'UnidadComp', 'Unidad', 'unidad') ?? 'un'),
            costo: cleanNumber(pick(r, 'Costo', 'costo')),
            cantidad: cleanNumber(pick(r, 'Cantidad', 'cantidad')) || 1,
          });
        }
        grupos.set(nombre, g);
      }
      if (grupos.size === 0) { toastError('No se encontraron recetas válidas (falta columna "Receta").'); return; }

      // Asegurar ítems del catálogo (crear los que falten para poder vincularlos)
      const nuevosCat = new Map<string, { descripcion: string; categoria: CategoriaItem; unidad: string; costo: number; activo: boolean }>();
      const existentesDesc = new Set(items.map(i => i.descripcion.trim().toLowerCase()));
      for (const g of grupos.values()) {
        for (const c of g.comps) {
          const k = c.descripcion.trim().toLowerCase();
          if (!existentesDesc.has(k) && !nuevosCat.has(k) && c.costo > 0) {
            nuevosCat.set(k, { descripcion: c.descripcion, categoria: c.categoria, unidad: c.unidad, costo: c.costo, activo: true });
          }
        }
      }
      if (nuevosCat.size > 0) await catalogoService.bulkUpsert([...nuevosCat.values()]);

      // Mapa descripción → item (catálogo fresco)
      const catalogo = await catalogoService.getAll(false);
      const mapDesc = new Map(catalogo.map(i => [i.descripcion.trim().toLowerCase(), i]));

      // Recetas existentes por nombre (para actualizar en vez de duplicar)
      const recetasExist = await recetasService.getAll(false);
      const mapReceta = new Map(recetasExist.map(r => [r.nombre.trim().toLowerCase(), r]));

      let n = 0;
      for (const [nombre, g] of grupos) {
        const existente = mapReceta.get(nombre.trim().toLowerCase());
        const recetaId = existente
          ? (await recetasService.update(existente.id, { unidad: g.unidad })).id
          : (await recetasService.create({ nombre, unidad: g.unidad, activo: true })).id;
        const componentes = g.comps.map((c, i) => {
          const it = mapDesc.get(c.descripcion.trim().toLowerCase());
          return {
            item_id: it?.id ?? null,
            descripcion: c.descripcion,
            categoria: it?.categoria ?? c.categoria,
            unidad: it?.unidad ?? c.unidad,
            costo: it?.costo ?? c.costo,
            cantidad: c.cantidad,
            orden: i,
          };
        });
        await recetasService.setComponentes(recetaId, componentes);
        n++;
      }
      success(`${n} receta${n === 1 ? '' : 's'} importada${n === 1 ? '' : 's'}`);
      load();
    } catch (e) {
      toastError('Error al importar: ' + (e instanceof Error ? e.message : 'Error'));
    } finally { setImportando(false); }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) (tab === 'items' ? importarItems : importarRecetas)(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const itemsFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(i => !q || i.descripcion.toLowerCase().includes(q) || (i.codigo || '').toLowerCase().includes(q));
  }, [items, search]);

  const recetasFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recetas.filter(r => !q || r.nombre.toLowerCase().includes(q));
  }, [recetas, search]);

  const tabBtn = (activo: boolean): React.CSSProperties => ({
    padding: '0.5rem 1rem', background: activo ? 'var(--y-brand)' : 'var(--bg2)',
    color: activo ? 'var(--on-accent)' : 'var(--muted)', border: '1px solid var(--border2)',
    cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700,
    fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase',
    borderRadius: 'var(--r-sm)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
  });

  return (
    <div className="anim-in">
      {itemModal.open && (
        <ItemModal item={itemModal.item} onClose={() => setItemModal({ open: false, item: null })}
          onSaved={() => { setItemModal({ open: false, item: null }); load(); }} />
      )}
      {recetaModal.open && (
        <RecetaModal receta={recetaModal.receta} catalogo={items} onClose={() => setRecetaModal({ open: false, receta: null })}
          onSaved={() => { setRecetaModal({ open: false, receta: null }); load(); }} />
      )}

      {/* Header */}
      <div className="iv-page-header">
        <div>
          <p className="label-muted" style={{ marginBottom: '0.35rem', letterSpacing: '0.4em' }}>Catálogo y ensambles</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(2rem,5vw,3.2rem)', textTransform: 'uppercase', lineHeight: 0.9, color: 'var(--text)' }}>
            BIBLIO<span style={{ color: 'var(--y)' }}>TECA</span>
          </h1>
        </div>
        <div className="iv-header-actions">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} disabled={importando} className="btn btn-ghost btn-sm" title={`Importar ${tab === 'items' ? 'ítems' : 'recetas'} desde Excel`}>
            {importando ? <Loader2 size={13} className="iv-spin" /> : <FileUp size={13} />} Importar
          </button>
          <button onClick={() => (tab === 'items' ? exportarItems() : exportarRecetas())} className="btn btn-ghost btn-sm" title={`Exportar ${tab === 'items' ? 'ítems' : 'recetas'} a Excel`}>
            <FileDown size={13} /> Exportar
          </button>
          {tab === 'items' ? (
            <button onClick={() => setItemModal({ open: true, item: null })} className="btn btn-primary"><Plus size={14} /> Nuevo ítem</button>
          ) : (
            <button onClick={() => setRecetaModal({ open: true, receta: null })} className="btn btn-primary"><Plus size={14} /> Nueva receta</button>
          )}
        </div>
      </div>

      {/* Tabs + búsqueda */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={tabBtn(tab === 'items')} onClick={() => setTab('items')}><Package size={13} /> Ítems ({items.length})</button>
        <button style={tabBtn(tab === 'recetas')} onClick={() => setTab('recetas')}><Layers size={13} /> Recetas ({recetas.length})</button>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, marginLeft: 'auto' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder={tab === 'items' ? 'Buscar ítem…' : 'Buscar receta…'} style={{ paddingLeft: '2.1rem' }} />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 52 }} />)}
        </div>
      ) : tab === 'items' ? (
        /* ── ÍTEMS ── */
        <div className="panel-y">
          {itemsFiltrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
              <Package size={36} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
              <p style={{ fontSize: '0.875rem' }}>{search ? 'Sin resultados' : 'Catálogo vacío — agrega tu primer ítem'}</p>
            </div>
          ) : (
            <div>
              {itemsFiltrados.map(it => (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 1rem', borderBottom: '1px solid var(--border-soft)', borderLeft: `3px solid ${CATEGORIA_COLORS[it.categoria]}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.88rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.descripcion}</p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
                      {CATEGORIA_LABELS[it.categoria]}{it.codigo ? ` · ${it.codigo}` : ''}
                    </p>
                  </div>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', textAlign: 'right' }}>
                    {formatCLP(it.costo)}<span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.7rem' }}>/{it.unidad}</span>
                  </span>
                  <button onClick={() => setItemModal({ open: true, item: it })} className="btn btn-ghost btn-xs" title="Editar"><Edit3 size={12} /></button>
                  <button onClick={() => eliminarItem(it.id, it.descripcion)} className="btn btn-danger btn-xs" title="Eliminar"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── RECETAS ── */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.6rem' }}>
          {recetasFiltradas.length === 0 ? (
            <div className="panel-y" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
              <Layers size={36} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
              <p style={{ fontSize: '0.875rem' }}>{search ? 'Sin resultados' : 'Sin recetas — crea tu primer ensamble (ej. "punto eléctrico")'}</p>
            </div>
          ) : recetasFiltradas.map(r => (
            <div key={r.id} className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.95rem', textTransform: 'uppercase', color: 'var(--text)', lineHeight: 1.1 }}>{r.nombre}</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{r.componentes.length} componente{r.componentes.length !== 1 ? 's' : ''} · por {r.unidad}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                  <button onClick={() => setRecetaModal({ open: true, receta: r })} className="btn btn-ghost btn-xs" title="Editar"><Edit3 size={12} /></button>
                  <button onClick={() => eliminarReceta(r.id, r.nombre)} className="btn btn-danger btn-xs" title="Eliminar"><Trash2 size={12} /></button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                {r.componentes.slice(0, 5).map((c, i) => (
                  <span key={i} style={{ fontSize: '0.62rem', color: 'var(--muted)', background: 'var(--bg3)', padding: '0.1rem 0.4rem', borderRadius: 'var(--r-xs)', borderLeft: `2px solid ${CATEGORIA_COLORS[c.categoria]}` }}>
                    {c.descripcion}
                  </span>
                ))}
                {r.componentes.length > 5 && <span style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>+{r.componentes.length - 5}</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.4rem', borderTop: '1px solid var(--border-soft)' }}>
                <span style={{ fontSize: '0.6rem', color: 'var(--muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Costo interno</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--y)' }}>{formatCLP(costoReceta(r))}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
