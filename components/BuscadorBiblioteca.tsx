'use client';

/**
 * BuscadorBiblioteca
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal del cotizador para insertar desde la biblioteca:
 *   · Ítem del catálogo  → una línea.
 *   · Receta ("punto eléctrico") → se EXPANDE en varias líneas editables,
 *     multiplicadas por la cantidad indicada, aplicando los supuestos actuales.
 */

import { useState, useEffect, useMemo } from 'react';
import { X, Search, Package, Layers, Plus, Loader2 } from 'lucide-react';
import { catalogoService, recetasService } from '@/services/catalogo';
import { itemDesdeCatalogo, costoReceta, formatCLP } from '@/utils';
import type { CatalogoItem, RecetaConComponentes, CotizacionItem, Supuestos } from '@/types';
import { CATEGORIA_COLORS, CATEGORIA_LABELS } from '@/types';

interface Props {
  supuestos: Supuestos;
  onInsertar: (items: CotizacionItem[], mensaje: string) => void;
  /** Inserta una receta (el cotizador la convierte en partida de proyecto). */
  onInsertarReceta: (receta: RecetaConComponentes, cantidad: number) => void;
  /** Nombre de la partida destino, si se abrió desde una partida (solo informativo). */
  partidaDestino?: string | null;
  onClose: () => void;
}

export default function BuscadorBiblioteca({ supuestos, onInsertar, onInsertarReceta, partidaDestino, onClose }: Props) {
  const [tab, setTab] = useState<'items' | 'recetas'>('recetas');
  const [items, setItems] = useState<CatalogoItem[]>([]);
  const [recetas, setRecetas] = useState<RecetaConComponentes[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [cant, setCant] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      try {
        const [its, recs] = await Promise.all([
          catalogoService.getAll(true),
          recetasService.getAllConComponentes(),
        ]);
        setItems(its);
        setRecetas(recs);
        // Si no hay recetas pero sí ítems, abrir en la pestaña de ítems
        if (recs.length === 0 && its.length > 0) setTab('items');
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const itemsF = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return items.filter(i => !q || i.descripcion.toLowerCase().includes(q) || (i.codigo || '').toLowerCase().includes(q));
  }, [items, busca]);

  const recetasF = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return recetas.filter(r => !q || r.nombre.toLowerCase().includes(q));
  }, [recetas, busca]);

  const insertarItem = (it: CatalogoItem) => {
    onInsertar([itemDesdeCatalogo(it, 1, supuestos)], `"${it.descripcion}" agregado`);
  };
  const insertarReceta = (r: RecetaConComponentes) => {
    const n = Math.max(1, cant[r.id] || 1);
    onInsertarReceta(r, n);
  };

  const tabBtn = (activo: boolean): React.CSSProperties => ({
    padding: '0.45rem 0.9rem', background: activo ? 'var(--y-brand)' : 'var(--bg3)',
    color: activo ? 'var(--on-accent)' : 'var(--muted)', border: '1px solid var(--border2)',
    cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700,
    fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase',
    borderRadius: 'var(--r-sm)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
  });

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 200 }}>
      <div className="modal-box" style={{ maxWidth: 560, width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.3rem', borderBottom: '1px solid var(--border2)' }}>
          <span className="section-label" style={{ margin: 0, paddingTop: 0 }}><Search size={13} /> Insertar desde biblioteca</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>

        {/* Tabs + búsqueda */}
        <div style={{ padding: '0.8rem 1.3rem', display: 'flex', gap: '0.4rem', alignItems: 'center', borderBottom: '1px solid var(--border2)', flexWrap: 'wrap' }}>
          <button style={tabBtn(tab === 'recetas')} onClick={() => setTab('recetas')}><Layers size={12} /> Recetas ({recetas.length})</button>
          <button style={tabBtn(tab === 'items')} onClick={() => setTab('items')}><Package size={12} /> Ítems ({items.length})</button>
          <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar…"
              style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', padding: '0.4rem 0.5rem 0.4rem 1.8rem', borderRadius: 'var(--r-sm)', outline: 'none', fontSize: '0.82rem' }} />
          </div>
        </div>

        {partidaDestino && (
          <div style={{ padding: '0.5rem 1.3rem', background: 'var(--y-soft)', fontSize: '0.72rem', color: 'var(--text)', borderBottom: '1px solid var(--border2)' }}>
            Insertando dentro de la partida: <strong>{partidaDestino}</strong>
          </div>
        )}

        {/* Lista */}
        <div style={{ overflowY: 'auto', padding: '0.6rem 1.3rem 1.2rem', flex: 1 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: 'var(--muted)' }}>
              <Loader2 size={20} className="iv-spin" />
            </div>
          ) : tab === 'recetas' ? (
            recetasF.length === 0 ? (
              <Vacio texto={recetas.length === 0 ? 'Aún no hay recetas. Créalas en Biblioteca.' : 'Sin resultados'} />
            ) : recetasF.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0', borderBottom: '1px solid var(--border-soft)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</p>
                  <p style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{r.componentes.length} comp. · {formatCLP(costoReceta(r))} costo/{r.unidad}</p>
                </div>
                <input type="number" min="1" step="1" value={cant[r.id] ?? 1}
                  onChange={e => setCant(c => ({ ...c, [r.id]: parseFloat(e.target.value) || 1 }))}
                  title={`Cantidad de ${r.unidad}`}
                  style={{ width: 58, textAlign: 'center', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', padding: '0.3rem', borderRadius: 'var(--r-sm)', outline: 'none' }} />
                <button onClick={() => insertarReceta(r)} className="btn btn-primary btn-xs"><Plus size={11} /> Agregar</button>
              </div>
            ))
          ) : (
            itemsF.length === 0 ? (
              <Vacio texto={items.length === 0 ? 'Catálogo vacío. Agrega ítems en Biblioteca.' : 'Sin resultados'} />
            ) : itemsF.map(it => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0', borderBottom: '1px solid var(--border-soft)', borderLeft: `3px solid ${CATEGORIA_COLORS[it.categoria]}`, paddingLeft: '0.5rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.descripcion}</p>
                  <p style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{CATEGORIA_LABELS[it.categoria]} · {formatCLP(it.costo)}/{it.unidad}</p>
                </div>
                <button onClick={() => insertarItem(it)} className="btn btn-ghost btn-xs"><Plus size={11} /> Insertar</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--muted)', fontSize: '0.8rem' }}>
      {texto}
    </div>
  );
}
