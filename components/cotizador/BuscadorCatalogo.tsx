'use client';

/**
 * Buscador del catálogo dentro de una partida (TecApp): busca a la vez en materiales y
 * servicios activos, hasta 20 resultados; Enter agrega el primero. Lo sin precio se ve
 * pero no se agrega. Siempre ofrece «+ Agregar «…» fuera del catálogo» y, junto al
 * buscador, «+ Nuevo»: no es obligatorio usar la biblioteca.
 */

import { useId, useMemo, useRef, useState } from 'react';
import { Plus, ScanLine, Search } from 'lucide-react';
import LectorDeCodigo from '@/components/LectorDeCodigo';
import { CATEGORIA_LABELS, CATEGORIA_COLORS } from '@/types';
import type { ArticuloCatalogo, Moneda } from '@/lib/cotizador/tipos';
import { formatMonto } from '@/lib/cotizador/calculo';

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function BuscadorCatalogo({ catalogo, moneda, valorUf, onElegir, onFuera, onBuscarReceta, autoFocus }: {
  catalogo: ArticuloCatalogo[];
  moneda: Moneda;
  valorUf?: number | null;
  onElegir: (a: ArticuloCatalogo) => void;
  onFuera: (texto: string) => void;
  onBuscarReceta?: (texto: string) => void;
  autoFocus?: boolean;
}) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [escanear, setEscanear] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const listaId = useId();

  const resultados = useMemo(() => {
    const palabras = norm(texto).split(/\s+/).filter(Boolean);
    if (!palabras.length) return [];
    return catalogo
      .filter(a => a.activo !== false)
      .filter(a => {
        const h = norm(`${a.codigo || ''} ${a.descripcion} ${a.marca || ''} ${a.modelo || ''} ${a.familia || ''} ${a.proveedor || ''}`);
        return palabras.every(p => h.includes(p));
      })
      .sort((a, b) => {
        const q = norm(texto);
        const ea = norm(a.codigo || '') === q ? 0 : norm(a.descripcion).startsWith(q) ? 1 : 2;
        const eb = norm(b.codigo || '') === q ? 0 : norm(b.descripcion).startsWith(q) ? 1 : 2;
        return ea - eb;
      })
      .slice(0, 20);
  }, [texto, catalogo]);

  const elegir = (a: ArticuloCatalogo) => {
    if (a.precio_venta === null) return;
    onElegir(a);
    setTexto('');
    setTimeout(() => ref.current?.focus(), 30);
  };
  const enPesos = (v: number | null) => (v === null ? null : moneda === 'UF' && valorUf ? v / valorUf : v);

  return (
    <div style={{ position: 'relative' }}>
      {escanear && <LectorDeCodigo titulo="Escanear el código del producto" onCerrar={() => setEscanear(false)} onLeido={codigo => {
        const a = catalogo.find(x => x.codigo && norm(x.codigo) === norm(codigo));
        if (!a) return { ok: false, mensaje: `No hay producto con el código ${codigo}` };
        if (a.precio_venta === null) return { ok: false, mensaje: `${a.descripcion}: no tiene precio` };
        onElegir(a);
        return { ok: true, mensaje: `Agregado: ${a.descripcion}` };
      }} />}
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input ref={ref} className="input" value={texto} autoFocus={autoFocus} role="combobox" aria-expanded={abierto && !!texto} aria-controls={listaId}
            onChange={e => { setTexto(e.target.value); setAbierto(true); }}
            onFocus={() => setAbierto(true)}
            onBlur={() => setTimeout(() => setAbierto(false), 180)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const primero = resultados.find(r => r.precio_venta !== null);
                if (primero) elegir(primero); else if (texto.trim()) { onFuera(texto.trim()); setTexto(''); }
              }
              if (e.key === 'Escape') setAbierto(false);
            }}
            placeholder="Busca un producto o servicio: código, nombre, marca…" style={{ paddingLeft: '2rem' }} />
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setEscanear(true)} title="Escanear código de barras o QR" aria-label="Escanear"><ScanLine size={15} /></button>
        <button type="button" className="btn btn-ghost" onClick={() => { onFuera(texto.trim()); setTexto(''); }}
          title="Algo que no está en la biblioteca: escribes qué es, su costo y su ganancia, solo para esta cotización">
          <Plus size={14} /> Nuevo</button>
      </div>
      {abierto && texto.trim() && (
        <div id={listaId} role="listbox" style={{ position: 'absolute', zIndex: 25, left: 0, right: 0, top: '100%', marginTop: 4, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,.25)', maxHeight: 360, overflowY: 'auto' }}>
          {resultados.map(a => {
            const sinPrecio = a.precio_venta === null;
            return (
              <button key={a.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => elegir(a)} disabled={sinPrecio}
                style={{ display: 'flex', width: '100%', gap: 10, alignItems: 'center', padding: '0.5rem 0.75rem', background: 'none', border: 'none', borderBottom: '1px solid var(--border2)', textAlign: 'left', cursor: sinPrecio ? 'not-allowed' : 'pointer', opacity: sinPrecio ? 0.6 : 1 }}>
                <span style={{ width: 6, height: 28, borderRadius: 3, background: CATEGORIA_COLORS[a.categoria], flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.descripcion}</span>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)' }}>
                    {CATEGORIA_LABELS[a.categoria]}{a.codigo ? ` · ${a.codigo}` : ''}{a.marca ? ` · ${a.marca}` : ''}{a.modelo ? ` ${a.modelo}` : ''}
                    {sinPrecio ? ' · sin precio: ponle familia o ganancia en la Biblioteca' : ''}
                  </span>
                </span>
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                  {sinPrecio ? '—' : formatMonto(enPesos(a.precio_venta), moneda, true)}<span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.7rem' }}> /{a.unidad}</span>
                </span>
              </button>
            );
          })}
          {resultados.length === 0 && <p style={{ padding: '0.7rem 0.8rem', fontSize: '0.82rem', color: 'var(--muted)', margin: 0 }}>Nada en el catálogo con «{texto.trim()}».</p>}
          {resultados.length === 0 && onBuscarReceta && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => onBuscarReceta(texto.trim())}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.55rem 0.8rem', background: 'none', border: 'none', borderTop: '1px solid var(--border2)', color: 'var(--y)', fontSize: '0.84rem', cursor: 'pointer' }}>
              Buscar «{texto.trim()}» en las recetas
            </button>
          )}
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onFuera(texto.trim()); setTexto(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '0.6rem 0.8rem', background: 'var(--bg3)', border: 'none', borderTop: '1px solid var(--border2)', color: 'var(--text)', fontSize: '0.84rem', cursor: 'pointer' }}>
            <Plus size={13} /> Agregar «{texto.trim()}» fuera del catálogo
          </button>
        </div>
      )}
    </div>
  );
}
