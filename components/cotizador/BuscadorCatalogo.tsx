'use client';

/**
 * Buscador del catálogo dentro de una partida (TecApp): busca a la vez en materiales y
 * servicios activos, hasta 20 resultados. Lo sin precio se ve pero no se agrega. Siempre
 * ofrece «+ Agregar «…» fuera del catálogo» y, junto al buscador, «+ Nuevo»: no es
 * obligatorio usar la biblioteca.
 * Para cotizar rápido:
 *  · ↑ ↓ eligen el resultado y Enter lo agrega (sin flechas, el primero).
 *  · La cantidad se escribe junto al producto: «12 enchufe doble» o «enchufe doble x 12».
 *  · Con el buscador vacío aparecen los productos usados hace poco.
 *  · Pegar una lista (de WhatsApp, un correo o Excel) la convierte en líneas: se revisa
 *    qué calzó con la biblioteca y se agregan todas de una vez.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ClipboardList, Clock, Plus, ScanLine, Search, X } from 'lucide-react';
import LectorDeCodigo from '@/components/LectorDeCodigo';
import { CATEGORIA_LABELS, CATEGORIA_COLORS } from '@/types';
import type { ArticuloCatalogo, Moneda } from '@/lib/cotizador/tipos';
import { cantidadLegible, formatMonto } from '@/lib/cotizador/calculo';
import { candidatos, parsearLista, separarCantidad } from '@/lib/cotizador/pegarLista';

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const RECIENTES = 'innvolt-cot-recientes';
const leerRecientes = (): string[] => { try { return JSON.parse(localStorage.getItem(RECIENTES) || '[]'); } catch { return []; } };
const recordar = (id: string) => {
  try { localStorage.setItem(RECIENTES, JSON.stringify([id, ...leerRecientes().filter(x => x !== id)].slice(0, 10))); } catch { /* sin almacenamiento */ }
};

interface FilaRevision { texto: string; cantidad: number; opciones: ArticuloCatalogo[]; elegido: string; incluir: boolean }

export default function BuscadorCatalogo({ catalogo, moneda, valorUf, onElegir, onFuera, onBuscarReceta, autoFocus }: {
  catalogo: ArticuloCatalogo[];
  moneda: Moneda;
  valorUf?: number | null;
  onElegir: (a: ArticuloCatalogo, cantidad?: number) => void;
  onFuera: (texto: string, cantidad?: number) => void;
  onBuscarReceta?: (texto: string) => void;
  autoFocus?: boolean;
}) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [escanear, setEscanear] = useState(false);
  const [sel, setSel] = useState(0);
  const [recientes, setRecientes] = useState<string[]>([]);
  const [revision, setRevision] = useState<FilaRevision[] | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const listaId = useId();
  useEffect(() => { setRecientes(leerRecientes()); }, []);

  // «12 enchufe doble» → busca «enchufe doble» y lo agrega con cantidad 12.
  const { cantidad, texto: busqueda } = useMemo(() => separarCantidad(texto), [texto]);

  const resultados = useMemo(() => {
    const palabras = norm(busqueda).split(/\s+/).filter(Boolean);
    if (!palabras.length) {
      // Sin texto: lo usado hace poco (con precio), para agregarlo de un toque.
      const mapa = new Map(catalogo.map(a => [a.id, a]));
      return recientes.map(id => mapa.get(id)).filter((a): a is ArticuloCatalogo => !!a && a.activo !== false && a.precio_venta !== null);
    }
    return catalogo
      .filter(a => a.activo !== false)
      .filter(a => {
        const h = norm(`${a.codigo || ''} ${a.descripcion} ${a.marca || ''} ${a.modelo || ''} ${a.familia || ''} ${a.proveedor || ''}`);
        return palabras.every(p => h.includes(p));
      })
      .sort((a, b) => {
        const q = norm(busqueda);
        const ea = norm(a.codigo || '') === q ? 0 : norm(a.descripcion).startsWith(q) ? 1 : 2;
        const eb = norm(b.codigo || '') === q ? 0 : norm(b.descripcion).startsWith(q) ? 1 : 2;
        return ea - eb;
      })
      .slice(0, 20);
  }, [busqueda, catalogo, recientes]);
  useEffect(() => { setSel(0); }, [texto]);

  const elegir = (a: ArticuloCatalogo, n = cantidad) => {
    if (a.precio_venta === null) return;
    onElegir(a, n);
    recordar(a.id);
    setRecientes(leerRecientes());
    setTexto('');
    setTimeout(() => ref.current?.focus(), 30);
  };
  const fuera = () => { onFuera(busqueda.trim(), cantidad); setTexto(''); };
  const enPesos = (v: number | null) => (v === null ? null : moneda === 'UF' && valorUf ? v / valorUf : v);

  // Pegar una lista: cada línea con su cantidad y lo que más se parece de la biblioteca.
  const alPegar = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const t = e.clipboardData.getData('text');
    if (!/\n./.test(t.trim())) return;          // una sola línea: se pega normal
    e.preventDefault();
    const filas = parsearLista(t);
    if (!filas.length) return;
    setRevision(filas.map(f => {
      const opciones = candidatos(f.texto, catalogo);
      return { ...f, opciones, elegido: opciones[0]?.id || '', incluir: true };
    }));
    setAbierto(false);
  };
  const agregarRevision = () => {
    if (!revision) return;
    for (const f of revision.filter(x => x.incluir)) {
      const a = f.opciones.find(o => o.id === f.elegido);
      if (a) { onElegir(a, f.cantidad); recordar(a.id); }
      else onFuera(f.texto, f.cantidad);
    }
    setRecientes(leerRecientes());
    setRevision(null);
  };
  const visibles = abierto && (texto.trim() || resultados.length > 0);

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
          <input ref={ref} className="input" value={texto} autoFocus={autoFocus} role="combobox" aria-expanded={!!visibles} aria-controls={listaId}
            aria-label="Buscar en la biblioteca" aria-activedescendant={visibles && resultados[sel] ? `${listaId}-${sel}` : undefined}
            onChange={e => { setTexto(e.target.value); setAbierto(true); }}
            onFocus={() => setAbierto(true)}
            onBlur={() => setTimeout(() => setAbierto(false), 180)}
            onPaste={alPegar}
            onKeyDown={e => {
              if (e.key === 'ArrowDown' && resultados.length) { e.preventDefault(); setAbierto(true); setSel(s => Math.min(s + 1, resultados.length - 1)); }
              else if (e.key === 'ArrowUp' && resultados.length) { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
              else if (e.key === 'Enter') {
                e.preventDefault();
                const marcado = resultados[sel] && resultados[sel].precio_venta !== null ? resultados[sel] : resultados.find(r => r.precio_venta !== null);
                if (marcado && (texto.trim() || abierto)) elegir(marcado);
                else if (busqueda.trim()) fuera();
              }
              else if (e.key === 'Escape') setAbierto(false);
            }}
            placeholder="Producto o servicio (ej.: 12 enchufe doble) · o pega una lista" style={{ paddingLeft: '2rem' }} />
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setEscanear(true)} title="Escanear código de barras o QR" aria-label="Escanear"><ScanLine size={15} /></button>
        <button type="button" className="btn btn-ghost" onClick={fuera}
          title="Algo que no está en la biblioteca: escribes qué es, su costo y su utilidad, solo para esta cotización">
          <Plus size={14} /> Nuevo</button>
      </div>
      {visibles && (
        <div id={listaId} role="listbox" style={{ position: 'absolute', zIndex: 25, left: 0, right: 0, top: '100%', marginTop: 4, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,.25)', maxHeight: 380, overflowY: 'auto' }}>
          {!texto.trim() && <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, padding: '0.45rem 0.75rem', fontSize: '0.72rem', color: 'var(--muted)', borderBottom: '1px solid var(--border2)' }}>
            <Clock size={12} /> Usados hace poco · escribe para buscar, o pega una lista</p>}
          {texto.trim() && cantidad !== 1 && <p style={{ margin: 0, padding: '0.4rem 0.75rem', fontSize: '0.74rem', color: 'var(--text)', background: 'var(--y-soft)', borderBottom: '1px solid var(--border2)' }}>
            Se agrega con cantidad <b>{cantidadLegible(cantidad)}</b></p>}
          {resultados.map((a, i) => {
            const sinPrecio = a.precio_venta === null;
            return (
              <button key={a.id} id={`${listaId}-${i}`} type="button" role="option" aria-selected={i === sel}
                onMouseDown={e => e.preventDefault()} onMouseMove={() => setSel(i)} onClick={() => elegir(a)} disabled={sinPrecio}
                style={{ display: 'flex', width: '100%', gap: 10, alignItems: 'center', padding: '0.5rem 0.75rem', background: i === sel ? 'var(--bg3)' : 'none', border: 'none', borderBottom: '1px solid var(--border2)', textAlign: 'left', cursor: sinPrecio ? 'not-allowed' : 'pointer', opacity: sinPrecio ? 0.6 : 1 }}>
                <span style={{ width: 6, height: 28, borderRadius: 3, background: CATEGORIA_COLORS[a.categoria], flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.descripcion}</span>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)' }}>
                    {CATEGORIA_LABELS[a.categoria]}{a.codigo ? ` · ${a.codigo}` : ''}{a.marca ? ` · ${a.marca}` : ''}{a.modelo ? ` ${a.modelo}` : ''}
                    {sinPrecio ? ' · sin precio: ponle familia o utilidad en la Biblioteca' : ''}
                  </span>
                </span>
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                  {sinPrecio ? '—' : formatMonto(enPesos(a.precio_venta), moneda, true)}<span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.7rem' }}> /{a.unidad}</span>
                </span>
              </button>
            );
          })}
          {texto.trim() && resultados.length === 0 && <p style={{ padding: '0.7rem 0.8rem', fontSize: '0.82rem', color: 'var(--muted)', margin: 0 }}>Nada en el catálogo con «{busqueda.trim()}».</p>}
          {texto.trim() && resultados.length === 0 && onBuscarReceta && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => onBuscarReceta(busqueda.trim())}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.55rem 0.8rem', background: 'none', border: 'none', borderTop: '1px solid var(--border2)', color: 'var(--y)', fontSize: '0.84rem', cursor: 'pointer' }}>
              Buscar «{busqueda.trim()}» en las recetas
            </button>
          )}
          {texto.trim() && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={fuera}
              style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '0.6rem 0.8rem', background: 'var(--bg3)', border: 'none', borderTop: '1px solid var(--border2)', color: 'var(--text)', fontSize: '0.84rem', cursor: 'pointer' }}>
              <Plus size={13} /> Agregar «{busqueda.trim()}» fuera del catálogo{cantidad !== 1 ? ` (× ${cantidadLegible(cantidad)})` : ''}
            </button>
          )}
        </div>
      )}

      {/* Lista pegada: revisar qué calzó y agregar todo de una vez */}
      {revision && (
        <div style={{ marginTop: 8, border: '1.5px solid var(--y-brand)', borderRadius: 10, background: 'var(--bg2)', padding: '0.7rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClipboardList size={15} color="var(--y)" />
            <b style={{ flex: 1, fontSize: '0.88rem', color: 'var(--text)' }}>Lista pegada: {revision.length} línea{revision.length === 1 ? '' : 's'}</b>
            <button type="button" aria-label="Cerrar" onClick={() => setRevision(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={15} /></button>
          </div>
          <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted)' }}>Revisa qué encontró en la biblioteca. Lo que no calza entra «fuera del catálogo» (le pones costo después).</p>
          {revision.map((f, i) => {
            const cambiar = (patch: Partial<FilaRevision>) => setRevision(r => (r || []).map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', opacity: f.incluir ? 1 : 0.5, borderTop: '1px solid var(--border2)', paddingTop: 6 }}>
                <input type="checkbox" checked={f.incluir} onChange={e => cambiar({ incluir: e.target.checked })} aria-label={`Incluir ${f.texto}`} style={{ accentColor: 'var(--y-brand)', width: 16, height: 16 }} />
                <input className="input input-sm" inputMode="decimal" value={String(f.cantidad).replace('.', ',')} aria-label="Cantidad"
                  onChange={e => { const n = Number(e.target.value.replace(',', '.')); if (Number.isFinite(n)) cambiar({ cantidad: n }); }} style={{ width: 64, textAlign: 'right' }} />
                <span style={{ flex: '1 1 160px', minWidth: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>{f.texto}</span>
                <select className="input input-sm" value={f.elegido} onChange={e => cambiar({ elegido: e.target.value })} aria-label={`Qué es «${f.texto}»`}
                  style={{ flex: '2 1 220px', width: 'auto', color: f.elegido ? 'var(--text)' : '#d97706' }}>
                  {f.opciones.map(o => <option key={o.id} value={o.id}>{o.descripcion} · {formatMonto(enPesos(o.precio_venta), moneda, true)}</option>)}
                  <option value="">Fuera del catálogo: «{f.texto}»</option>
                </select>
              </div>
            );
          })}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRevision(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={agregarRevision} disabled={!revision.some(f => f.incluir)}>
              <Plus size={13} /> Agregar {revision.filter(f => f.incluir).length} línea{revision.filter(f => f.incluir).length === 1 ? '' : 's'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
