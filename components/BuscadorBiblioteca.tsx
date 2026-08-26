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
import { X, Search, Package, Layers, Plus, Loader2, ExternalLink, ShoppingCart } from 'lucide-react';
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

/** Normaliza para búsqueda: minúsculas + sin acentos (á→a, ñ→n se mantiene). */
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function BuscadorBiblioteca({ supuestos, onInsertar, onInsertarReceta, partidaDestino, onClose }: Props) {
  const [tab, setTab] = useState<'items' | 'recetas'>('recetas');
  const [items, setItems] = useState<CatalogoItem[]>([]);
  const [recetas, setRecetas] = useState<RecetaConComponentes[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  // Dimensión de filtro por chips: familia (categoría de producto) o proveedor.
  const [modoFiltro, setModoFiltro] = useState<'familia' | 'proveedor'>('familia');
  const [grupoSel, setGrupoSel] = useState<string>('__todas__');
  const [cant, setCant] = useState<Record<string, number>>({});
  const [cesta, setCesta] = useState<Record<string, number>>({}); // itemId → cantidad

  const TOPE = 60; // ítems renderizados como máximo (hay miles)

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

  // Familias (categorías de producto) con conteo, para filtrar rápido.
  const familias = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) { const f = i.familia || 'Sin categoría'; m.set(f, (m.get(f) || 0) + 1); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  // Proveedores con conteo (segunda dimensión de filtro).
  const proveedores = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) { const p = i.proveedor || 'Sin proveedor'; m.set(p, (m.get(p) || 0) + 1); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  /** Valor de agrupación del ítem según la dimensión activa. */
  const grupoDe = (i: CatalogoItem) =>
    modoFiltro === 'familia' ? (i.familia || 'Sin categoría') : (i.proveedor || 'Sin proveedor');
  const grupos = modoFiltro === 'familia' ? familias : proveedores;

  // Texto de búsqueda pre-normalizado por ítem (desc + código + familia + proveedor).
  const buscables = useMemo(
    () => items.map(i => ({ i, hay: norm(`${i.descripcion} ${i.codigo || ''} ${i.familia || ''} ${i.proveedor || ''}`) })),
    [items],
  );

  const itemsF = useMemo(() => {
    const q = norm(busca.trim());
    if (q) {
      // Búsqueda por PALABRAS: cada palabra debe aparecer (en cualquier orden y campo).
      const tokens = q.split(/\s+/).filter(Boolean);
      const res = buscables.filter(({ hay }) => tokens.every(t => hay.includes(t)));
      // Relevancia: código exacto → empieza con la búsqueda → resto.
      const rank = (it: CatalogoItem) => {
        const d = norm(it.descripcion), c = norm(it.codigo || '');
        if (c === q) return 4;
        if (d.startsWith(tokens[0]) || c.startsWith(tokens[0])) return 3;
        if (d.includes(' ' + tokens[0])) return 2;
        return 1;
      };
      return res.sort((a, b) => rank(b.i) - rank(a.i)).map(x => x.i);
    }
    if (grupoSel === '__todas__') return items;
    return items.filter(i => grupoDe(i) === grupoSel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, buscables, busca, grupoSel, modoFiltro]);

  const recetasF = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return recetas.filter(r => !q || r.nombre.toLowerCase().includes(q));
  }, [recetas, busca]);

  const insertarReceta = (r: RecetaConComponentes) => {
    const n = Math.max(1, cant[r.id] || 1);
    onInsertarReceta(r, n);
  };

  // ── Cesta: seleccionar varios ítems y agregarlos de una ──
  const itemById = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const cestaEntries = Object.entries(cesta).filter(([, n]) => n > 0);
  const cestaUnidades = cestaEntries.reduce((s, [, n]) => s + n, 0);
  const cestaCosto = cestaEntries.reduce((s, [id, n]) => s + (itemById.get(id)?.costo || 0) * n, 0);

  const addCesta = (id: string, delta = 1) => setCesta(c => {
    const n = Math.max(0, (c[id] || 0) + delta);
    const next = { ...c };
    if (n <= 0) delete next[id]; else next[id] = n;
    return next;
  });
  const setCestaCant = (id: string, n: number) => setCesta(c => {
    const next = { ...c };
    if (!n || n <= 0) delete next[id]; else next[id] = Math.floor(n);
    return next;
  });

  const agregarCesta = () => {
    const nuevos = cestaEntries
      .map(([id, n]) => { const it = itemById.get(id); return it ? itemDesdeCatalogo(it, n, supuestos) : null; })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (nuevos.length === 0) return;
    setCesta({});
    onInsertar(nuevos, `${nuevos.length} ítems agregados${partidaDestino ? ' a la partida' : ''}`);
  };

  const tabBtn = (activo: boolean): React.CSSProperties => ({
    padding: '0.45rem 0.9rem', background: activo ? 'var(--y-brand)' : 'var(--bg3)',
    color: activo ? 'var(--on-accent)' : 'var(--muted)', border: '1px solid var(--border2)',
    cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700,
    fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase',
    borderRadius: 'var(--r-sm)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
  });

  const chip = (activo: boolean): React.CSSProperties => ({
    padding: '0.22rem 0.5rem', background: activo ? 'var(--y-soft)' : 'var(--bg3)',
    color: activo ? 'var(--y)' : 'var(--muted)', border: `1px solid ${activo ? 'var(--y)' : 'var(--border2)'}`,
    cursor: 'pointer', fontSize: '0.58rem', fontWeight: 600, whiteSpace: 'nowrap', borderRadius: 'var(--r-sm)',
  });

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 200 }}>
      <div className="modal-box" style={{ maxWidth: 680, width: '96%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
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

        {/* Chips de filtro (solo Ítems). Al buscar por texto, busca en todo. */}
        {tab === 'items' && grupos.length > 0 && (
          <div style={{ padding: '0.5rem 1.3rem', borderBottom: '1px solid var(--border2)' }}>
            {/* Selector de dimensión: Categoría o Proveedor */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.55rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>Filtrar por</span>
              <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                {(['familia', 'proveedor'] as const).map(m => (
                  <button key={m}
                    onClick={() => { setModoFiltro(m); setGrupoSel('__todas__'); }}
                    style={{
                      background: modoFiltro === m ? 'var(--y-brand)' : 'transparent',
                      color: modoFiltro === m ? 'var(--on-accent)' : 'var(--muted)',
                      border: 'none', cursor: 'pointer', padding: '0.22rem 0.6rem',
                      fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                    {m === 'familia' ? 'Categoría' : 'Proveedor'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxHeight: 84, overflowY: 'auto' }}>
              <button style={chip(grupoSel === '__todas__')} onClick={() => setGrupoSel('__todas__')}>Todos ({items.length})</button>
              {grupos.map(([g, n]) => (
                <button key={g} style={chip(grupoSel === g)} onClick={() => setGrupoSel(g)}>{g} ({n})</button>
              ))}
            </div>
          </div>
        )}

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
              <Vacio texto={items.length === 0 ? 'Catálogo vacío. Sincroniza con Google Sheets en Biblioteca.' : 'Sin resultados'} />
            ) : (<>
              {itemsF.slice(0, TOPE).map(it => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0', borderBottom: '1px solid var(--border-soft)', borderLeft: `3px solid ${CATEGORIA_COLORS[it.categoria]}`, paddingLeft: '0.5rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p title={it.descripcion} style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.25 }}>{it.descripcion}</p>
                  <p style={{ fontSize: '0.66rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                    {it.codigo ? <><span style={{ color: 'var(--y)', fontWeight: 700 }}>{it.codigo}</span>{' · '}</> : null}
                    {it.familia || CATEGORIA_LABELS[it.categoria]}
                    {it.proveedor ? <> · <span style={{ color: 'var(--text)', fontWeight: 600 }}>{it.proveedor}</span></> : null}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', margin: 0, whiteSpace: 'nowrap' }}>
                    {formatCLP(it.costo)}<span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.62rem' }}> /{it.unidad}</span>
                  </p>
                  <span style={{ fontSize: '0.52rem', color: CATEGORIA_COLORS[it.categoria], fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{CATEGORIA_LABELS[it.categoria]}</span>
                </div>
                {it.link ? (
                  <a href={it.link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-xs" title="Ver producto" onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}><ExternalLink size={11} /></a>
                ) : null}
                {cesta[it.id] > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                    <button onClick={() => addCesta(it.id, -1)} className="btn btn-ghost btn-xs" style={{ padding: '0 0.45rem' }}>−</button>
                    <input type="number" min="0" value={cesta[it.id]} onChange={e => setCestaCant(it.id, parseFloat(e.target.value) || 0)}
                      className="no-spin-arrows" style={{ width: 40, textAlign: 'center', background: 'var(--input-bg)', border: '1px solid var(--y)', color: 'var(--text)', borderRadius: 'var(--r-sm)', padding: '0.2rem', fontSize: '0.78rem', outline: 'none' }} />
                    <button onClick={() => addCesta(it.id, 1)} className="btn btn-ghost btn-xs" style={{ padding: '0 0.45rem' }}>+</button>
                  </div>
                ) : (
                  <button onClick={() => addCesta(it.id, 1)} className="btn btn-primary btn-xs" style={{ flexShrink: 0 }}><Plus size={11} /> Añadir</button>
                )}
              </div>
              ))}
              {itemsF.length > TOPE && (
                <div style={{ textAlign: 'center', padding: '0.6rem', color: 'var(--muted)', fontSize: '0.68rem' }}>
                  Mostrando {TOPE} de {itemsF.length}. Escribe para buscar (incluye proveedor) o filtra por categoría/proveedor.
                </div>
              )}
            </>)
          )}
        </div>

        {/* Cesta: agrega varios ítems de una sola vez */}
        {cestaEntries.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border2)', padding: '0.7rem 1.3rem', display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'var(--bg2)', flexWrap: 'wrap' }}>
            <ShoppingCart size={16} color="var(--y)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 120 }}>
              <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>{cestaEntries.length} ítems · {cestaUnidades} unid.</p>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--muted)' }}>Costo total {formatCLP(cestaCosto)}</p>
            </div>
            <button onClick={() => setCesta({})} className="btn btn-ghost btn-xs">Vaciar</button>
            <button onClick={agregarCesta} className="btn btn-primary btn-sm"><Plus size={13} /> Agregar {cestaEntries.length}</button>
          </div>
        )}
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
