'use client';

/**
 * Pedidos de material (TecApp): el técnico pide lo que necesita para una OT; bodega lo
 * despacha a su bodega (camioneta) o directo a la OT. Despachar mueve el stock solo.
 */

import NumeroInput from '@/components/NumeroInput';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, PackageCheck, Plus, Search, Send, Trash2, X } from 'lucide-react';
import { bodegaService, folioOT, type Bodega, type StockFila } from '@/services/operacion';
import { folioPedido, pedidosService, type Pedido } from '@/services/fase5';
import { catalogoService } from '@/services/catalogo';
import { useToast } from '@/hooks/useToast';
import { usePermisos } from '@/hooks/usePermisos';
import { formatDate } from '@/utils';
import type { CatalogoItem, Vendedor } from '@/types';

const COLOR: Record<Pedido['estado'], string> = { pendiente: '#d97706', parcial: '#2563eb', despachado: '#16a34a', rechazado: '#dc2626', cancelado: '#78716c' };

export function PedirMaterial({ otId, onCerrar, onListo }: { otId?: string | null; onCerrar: () => void; onListo: () => void }) {
  const { perfil } = usePermisos();
  const { success, error: toastError } = useToast();
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [lineas, setLineas] = useState<{ articulo: CatalogoItem; cantidad: number }[]>([]);
  const [busca, setBusca] = useState('');
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [para, setPara] = useState('');
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    Promise.all([catalogoService.getAll(), bodegaService.bodegas()]).then(([c, b]) => {
      const activas = b.filter(x => x.activo);
      setCatalogo(c.filter(x => x.categoria === 'material'));
      setBodegas(activas);
      const mia = activas.find(x => x.responsable_id === perfil?.id);
      setDestino(mia?.id || '');
      setOrigen(activas.find(x => x.id !== mia?.id)?.id || '');
    }).catch(() => {});
  }, [perfil?.id]);

  const sugeridos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    return catalogo.filter(c => `${c.codigo || ''} ${c.descripcion}`.toLowerCase().includes(q)).slice(0, 8);
  }, [busca, catalogo]);

  const enviar = async () => {
    if (!lineas.length) { toastError('Agrega al menos un material'); return; }
    setOcupado(true);
    try {
      await pedidosService.crear({ ot_id: otId || null, bodega_origen_id: origen || null, bodega_destino_id: destino || null, para_fecha: para || null, nota: nota || null },
        lineas.map(l => ({ articulo_id: l.articulo.id, cantidad: l.cantidad })));
      success('Pedido enviado a bodega');
      onListo();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo pedir'); }
    finally { setOcupado(false); }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 220 }}>
      <div className="modal-box" style={{ maxWidth: 560, width: '95%', display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}><Send size={15} /> Pedir material</p>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: '1.1rem 1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input className="input" autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar material del catálogo…" style={{ paddingLeft: '2rem' }} />
            {sugeridos.length > 0 && (
              <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, marginTop: 4, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, overflow: 'hidden' }}>
                {sugeridos.map(c => (
                  <button key={c.id} type="button" onClick={() => { setLineas(ls => ls.some(l => l.articulo.id === c.id) ? ls : [...ls, { articulo: c, cantidad: 1 }]); setBusca(''); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.7rem', background: 'none', border: 'none', borderBottom: '1px solid var(--border2)', color: 'var(--text)', cursor: 'pointer', fontSize: '0.85rem' }}>
                    {c.codigo ? <span style={{ color: 'var(--muted)' }}>{c.codigo} · </span> : null}{c.descripcion}</button>
                ))}
              </div>
            )}
          </div>
          {lineas.map((l, i) => (
            <div key={l.articulo.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ flex: 1, fontSize: '0.86rem', color: 'var(--text)' }}>{l.articulo.descripcion}</span>
              <NumeroInput className="input" min={0} decimales={3} value={l.cantidad} envoltura={{ width: 90 }}
                onChange={v => setLineas(ls => ls.map((x, j) => (j === i ? { ...x, cantidad: v } : x)))} />
              <span style={{ fontSize: '0.74rem', color: 'var(--muted)', width: 30 }}>{l.articulo.unidad}</span>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setLineas(ls => ls.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <label><span className="label-muted">Sale de</span>
              <select className="input" value={origen} onChange={e => setOrigen(e.target.value)}>
                <option value="">Bodega decide</option>{bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
            <label><span className="label-muted">Llega a</span>
              <select className="input" value={destino} onChange={e => setDestino(e.target.value)}>
                <option value="">{otId ? 'Directo a la OT' : 'Retiro en bodega'}</option>{bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
            <label><span className="label-muted">Para el</span><input className="input" type="date" value={para} onChange={e => setPara(e.target.value)} /></label>
          </div>
          <input className="input" value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota para bodega (opcional)" />
        </div>
        <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primary" onClick={enviar} disabled={ocupado || !lineas.length}>{ocupado ? <Loader2 size={14} className="iv-spin" /> : <Send size={14} />} Enviar pedido</button>
        </div>
      </div>
    </div>
  );
}

function Despachar({ pedido, bodegas, stock, onCerrar, onListo }: { pedido: Pedido; bodegas: Bodega[]; stock: StockFila[]; onCerrar: () => void; onListo: () => void }) {
  const { success, error: toastError } = useToast();
  const [origen, setOrigen] = useState(pedido.bodega_origen_id || bodegas[0]?.id || '');
  const [cant, setCant] = useState<Record<string, number>>(() => Object.fromEntries((pedido.pedido_lineas || []).map(l => [l.id, Math.max(Number(l.cantidad) - Number(l.despachada), 0)])));
  const [ocupado, setOcupado] = useState(false);
  const hay = (articulo: string) => Number(stock.find(s => s.articulo_id === articulo && s.bodega_id === origen)?.cantidad || 0);
  const despachar = async () => {
    setOcupado(true);
    try {
      if (origen !== pedido.bodega_origen_id) await pedidosService.actualizar(pedido.id, { bodega_origen_id: origen });
      await pedidosService.despachar(pedido.id, Object.entries(cant).filter(([, v]) => v > 0).map(([linea_id, cantidad]) => ({ linea_id, cantidad })));
      success('Despachado: el stock ya se movió');
      onListo();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo despachar'); }
    finally { setOcupado(false); }
  };
  return (
    <div className="modal-overlay" style={{ zIndex: 220 }}>
      <div className="modal-box" style={{ maxWidth: 520, width: '95%', padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="section-label" style={{ margin: 0 }}><PackageCheck size={15} /> Despachar {folioPedido(pedido.folio)}</p>
        <label><span className="label-muted">Sale de</span>
          <select className="input" value={origen} onChange={e => setOrigen(e.target.value)}>{bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
        {(pedido.pedido_lineas || []).map(l => (
          <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
            <span style={{ flex: 1, color: 'var(--text)' }}>{l.catalogo_items?.descripcion}<span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)' }}>
              pidió {Number(l.cantidad)} · despachado {Number(l.despachada)} · hay {hay(l.articulo_id)}</span></span>
            <NumeroInput className="input" min={0} decimales={3} envoltura={{ width: 90 }} value={cant[l.id] ?? 0} onChange={v => setCant({ ...cant, [l.id]: v })} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primary" onClick={despachar} disabled={ocupado || !origen}>{ocupado ? <Loader2 size={14} className="iv-spin" /> : <PackageCheck size={14} />} Despachar</button>
        </div>
      </div>
    </div>
  );
}

/** Lista de pedidos (de una OT, los míos o todos) con despacho para bodega. */
export default function PedidosMaterial({ otId, soloMios, equipo }: { otId?: string; soloMios?: boolean; equipo: Record<string, Vendedor> }) {
  const { perfil, puede } = usePermisos();
  const { success, error: toastError } = useToast();
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [stock, setStock] = useState<StockFila[]>([]);
  const [pedir, setPedir] = useState(false);
  const [despachando, setDespachando] = useState<Pedido | null>(null);
  const [verCerrados, setVerCerrados] = useState(false);
  const despacha = puede('bodega.mover');

  const cargar = useCallback(() => {
    pedidosService.listar({ otId, mios: soloMios ? perfil?.id : undefined }).then(setPedidos).catch(() => setPedidos([]));
    if (despacha) Promise.all([bodegaService.bodegas(), bodegaService.stock()]).then(([b, s]) => { setBodegas(b.filter(x => x.activo)); setStock(s); }).catch(() => {});
  }, [otId, soloMios, perfil?.id, despacha]);
  useEffect(() => { cargar(); }, [cargar]);

  const nombreBodega = (id: string | null) => bodegas.find(b => b.id === id)?.nombre;
  const lista = (pedidos || []).filter(p => verCerrados || ['pendiente', 'parcial'].includes(p.estado));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {pedir && <PedirMaterial otId={otId} onCerrar={() => setPedir(false)} onListo={() => { setPedir(false); cargar(); }} />}
      {despachando && <Despachar pedido={despachando} bodegas={bodegas} stock={stock} onCerrar={() => setDespachando(null)} onListo={() => { setDespachando(null); cargar(); }} />}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setPedir(true)}><Plus size={13} /> Pedir material</button>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', color: 'var(--muted)', marginLeft: 'auto' }}>
          <input type="checkbox" checked={verCerrados} onChange={e => setVerCerrados(e.target.checked)} style={{ accentColor: 'var(--y-brand)' }} /> Ver despachados y cerrados
        </label>
      </div>
      {pedidos === null ? <Loader2 size={16} className="iv-spin" /> : lista.length === 0 ? <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>Sin pedidos {verCerrados ? '' : 'abiertos'}.</p> : lista.map(p => (
        <div key={p.id} style={{ border: '1px solid var(--border2)', borderLeft: `3px solid ${COLOR[p.estado]}`, borderRadius: 8, padding: '0.55rem 0.7rem', fontSize: '0.84rem' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <b style={{ color: 'var(--text)' }}>{folioPedido(p.folio)}</b>
            <span className="badge" style={{ background: COLOR[p.estado], color: '#fff', fontSize: '0.68rem' }}>{p.estado}</span>
            {!otId && p.ot_id && p.ordenes_trabajo && <Link href={`/ordenes/${p.ot_id}`}>{folioOT(p.ordenes_trabajo.folio)}</Link>}
            <span style={{ color: 'var(--muted)', fontSize: '0.76rem' }}>
              {p.pedido_por ? equipo[p.pedido_por]?.nombre?.split(' ')[0] : ''} · {formatDate(p.created_at)}{p.para_fecha ? ` · para el ${formatDate(p.para_fecha)}` : ''}
              {p.bodega_destino_id ? ` · a ${nombreBodega(p.bodega_destino_id) || 'su bodega'}` : ''}
            </span>
            <span style={{ flex: 1 }} />
            {despacha && ['pendiente', 'parcial'].includes(p.estado) && <button className="btn btn-primary btn-xs" onClick={() => setDespachando(p)}><PackageCheck size={12} /> Despachar</button>}
            {despacha && p.estado === 'pendiente' && <button className="btn btn-ghost btn-xs" onClick={async () => {
              const m = prompt('¿Por qué se rechaza el pedido?'); if (!m?.trim()) return;
              try { await pedidosService.actualizar(p.id, { estado: 'rechazado', motivo_rechazo: m.trim() }); cargar(); } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
            }}>Rechazar</button>}
            {p.pedido_por === perfil?.id && p.estado === 'pendiente' && <button className="btn btn-ghost btn-xs" onClick={async () => {
              try { await pedidosService.actualizar(p.id, { estado: 'cancelado' }); success('Pedido cancelado'); cargar(); } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
            }}>Cancelar</button>}
          </div>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: '0.78rem' }}>
            {(p.pedido_lineas || []).map(l => `${Number(l.cantidad)} ${l.catalogo_items?.unidad || ''} ${l.catalogo_items?.descripcion || ''}${Number(l.despachada) ? ` (${Number(l.despachada)} desp.)` : ''}`).join(' · ')}
            {p.nota ? ` — ${p.nota}` : ''}{p.motivo_rechazo ? ` — Rechazado: ${p.motivo_rechazo}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
