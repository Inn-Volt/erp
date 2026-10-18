'use client';

/**
 * Operación → Bodega (traído de TecApp). El stock es la suma de los movimientos:
 * nunca se edita a mano y los movimientos no se borran (se corrigen con otro).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, Loader2, Minus, Package, Plus, ScanLine, Search, SlidersHorizontal, Warehouse, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import NumeroInput from '@/components/NumeroInput';
import LectorDeCodigo from '@/components/LectorDeCodigo';
import {
  bodegaService, faltaFase2, folioOT, otService,
  type Bodega, type Movimiento, type OrdenTrabajo, type SerieFila, type StockFila,
} from '@/services/operacion';
import { catalogoService } from '@/services/catalogo';
import PedidosMaterial from '@/components/bodega/PedidosMaterial';
import { catastroService, type EquipoInstalado } from '@/services/fase5';
import { formatDate } from '@/utils';
import { vendedoresService } from '@/services/vendedores';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { formatCLP } from '@/utils';
import type { CatalogoItem, Vendedor } from '@/types';

type TipoReg = 'entrada' | 'salida' | 'ajuste' | 'traslado';
const TIPOS: { clave: TipoReg; nombre: string; icono: React.ReactNode; permiso: string }[] = [
  { clave: 'entrada', nombre: 'Entrada', icono: <Plus size={14} />, permiso: 'bodega.mover' },
  { clave: 'salida', nombre: 'Salida', icono: <Minus size={14} />, permiso: 'bodega.mover' },
  { clave: 'traslado', nombre: 'Traslado', icono: <ArrowLeftRight size={14} />, permiso: 'bodega.mover' },
  { clave: 'ajuste', nombre: 'Ajuste', icono: <SlidersHorizontal size={14} />, permiso: 'bodega.ajustar' },
];

function Registrar({ bodegas, catalogo, ots, tipoInicial, puedeAjustar, onClose, onListo }: {
  bodegas: Bodega[]; catalogo: CatalogoItem[]; ots: OrdenTrabajo[]; tipoInicial: TipoReg; puedeAjustar: boolean;
  onClose: () => void; onListo: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [tipo, setTipo] = useState<TipoReg>(tipoInicial);
  const [busca, setBusca] = useState('');
  const [art, setArt] = useState<CatalogoItem | null>(null);
  const [f, setF] = useState({ bodega_id: bodegas[0]?.id || '', destino_id: bodegas[1]?.id || '', cantidad: 1, costo: 0, serie: '', ot_id: '', nota: '' });
  const [escaneando, setEscaneando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const lbl = { display: 'block', marginBottom: 6 } as const;

  const sugeridos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q || art) return [];
    return catalogo.filter(c => `${c.codigo || ''} ${c.descripcion}`.toLowerCase().includes(q)).slice(0, 8);
  }, [busca, art, catalogo]);

  const elegir = (c: CatalogoItem) => { setArt(c); setBusca(c.descripcion); setF(x => ({ ...x, costo: c.costo || 0 })); };

  const guardar = async () => {
    if (!art) { toastError('Elige el artículo'); return; }
    if (!f.cantidad || (tipo !== 'ajuste' && f.cantidad < 0)) { toastError('Cantidad inválida'); return; }
    if (tipo === 'ajuste' && !f.nota.trim()) { toastError('Explica el motivo del ajuste'); return; }
    if (tipo === 'traslado' && f.bodega_id === f.destino_id) { toastError('Elige bodegas distintas'); return; }
    setGuardando(true);
    try {
      const base = { articulo_id: art.id, cantidad: f.cantidad, serie: f.serie.trim() || null, nota: f.nota.trim() || null };
      if (tipo === 'traslado') {
        const destino = bodegas.find(b => b.id === f.destino_id)?.nombre;
        const origen = bodegas.find(b => b.id === f.bodega_id)?.nombre;
        await bodegaService.registrar({ ...base, tipo: 'salida', bodega_id: f.bodega_id, nota: `Traslado a ${destino}${base.nota ? ' · ' + base.nota : ''}` });
        await bodegaService.registrar({ ...base, tipo: 'entrada', bodega_id: f.destino_id, nota: `Traslado desde ${origen}${base.nota ? ' · ' + base.nota : ''}` });
      } else {
        await bodegaService.registrar({
          ...base, tipo, bodega_id: f.bodega_id,
          costo_unitario: tipo === 'entrada' ? f.costo || null : null,
          ot_id: tipo === 'salida' ? f.ot_id || null : null,
        });
      }
      success('Movimiento registrado');
      onListo();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo registrar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {escaneando && <LectorDeCodigo titulo="Escanear código del artículo" onCerrar={() => setEscaneando(false)} onLeido={codigo => {
        const c = catalogo.find(x => x.codigo && x.codigo.toLowerCase() === codigo.toLowerCase());
        if (c) { elegir(c); setEscaneando(false); return { ok: true, mensaje: c.descripcion }; }
        if (art) { setF(x => ({ ...x, serie: codigo })); setEscaneando(false); return { ok: true, mensaje: `Serie ${codigo}` }; }
        return { ok: false, mensaje: `No hay artículo con código ${codigo}` };
      }} />}
      <div className="modal-box" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}><Package size={16} /> Registrar movimiento</p>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TIPOS.filter(t => t.clave !== 'ajuste' || puedeAjustar).map(t => (
              <button key={t.clave} type="button" onClick={() => setTipo(t.clave)} className="btn btn-sm"
                style={{ background: tipo === t.clave ? 'var(--y-brand)' : 'var(--bg3)', color: tipo === t.clave ? '#111' : 'var(--muted)' }}>{t.icono} {t.nombre}</button>
            ))}
          </div>
          <div>
            <label className="label-muted" style={lbl}>Artículo *</label>
            <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
              <input className="input" autoFocus value={busca} onChange={e => { setBusca(e.target.value); setArt(null); }} placeholder="Buscar por código o descripción…" />
              <button type="button" className="btn btn-ghost" onClick={() => setEscaneando(true)} aria-label="Escanear"><ScanLine size={15} /></button>
              {sugeridos.length > 0 && (
                <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 44, top: '100%', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, maxHeight: 240, overflowY: 'auto' }}>
                  {sugeridos.map(c => <button key={c.id} type="button" onClick={() => elegir(c)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.7rem', background: 'none', border: 'none', borderBottom: '1px solid var(--border2)', color: 'var(--text)', cursor: 'pointer', fontSize: '0.85rem' }}>
                    {c.codigo ? <span style={{ color: 'var(--muted)' }}>{c.codigo} · </span> : null}{c.descripcion}</button>)}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <div><label className="label-muted" style={lbl}>{tipo === 'traslado' ? 'Desde' : 'Bodega'}</label>
              <select className="input" value={f.bodega_id} onChange={e => setF({ ...f, bodega_id: e.target.value })}>{bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
            {tipo === 'traslado' && <div><label className="label-muted" style={lbl}>Hacia</label>
              <select className="input" value={f.destino_id} onChange={e => setF({ ...f, destino_id: e.target.value })}>{bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>}
            <div><label className="label-muted" style={lbl}>Cantidad {art ? `(${art.unidad})` : ''}{tipo === 'ajuste' ? ' — negativa para restar' : ''}</label>
              <NumeroInput className="input" decimales={3} value={f.cantidad} onChange={v => setF({ ...f, cantidad: v })} /></div>
            {tipo === 'entrada' && <div><label className="label-muted" style={lbl}>Costo unitario</label><NumeroInput className="input" prefijo="$" value={f.costo} onChange={v => setF({ ...f, costo: v })} /></div>}
          </div>
          <div><label className="label-muted" style={lbl}>N° de serie (si aplica)</label><input className="input" value={f.serie} onChange={e => setF({ ...f, serie: e.target.value })} /></div>
          {tipo === 'salida' && (
            <div><label className="label-muted" style={lbl}>Para la OT</label>
              <select className="input" value={f.ot_id} onChange={e => setF({ ...f, ot_id: e.target.value })}>
                <option value="">Sin OT</option>
                {ots.map(o => <option key={o.id} value={o.id}>{folioOT(o.folio)} · {o.titulo}</option>)}
              </select></div>
          )}
          <div><label className="label-muted" style={lbl}>Nota{tipo === 'ajuste' ? ' *' : ''}</label><input className="input" value={f.nota} onChange={e => setF({ ...f, nota: e.target.value })} placeholder={tipo === 'ajuste' ? 'Conteo físico, pérdida, daño…' : 'Proveedor, guía, etc.'} /></div>
        </div>
        <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando || !art}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Package size={14} />} Registrar</button>
        </div>
      </div>
    </div>
  );
}

export default function BodegaPage() {
  const { puede, perfil } = usePermisos();
  const { success, error: toastError } = useToast();
  const [tab, setTab] = useState<'stock' | 'movimientos' | 'series' | 'pedidos' | 'catastro' | 'bodegas'>('stock');
  const [catastro, setCatastro] = useState<EquipoInstalado[] | null>(null);
  useEffect(() => {
    // /bodega?tab=pedidos (desde un aviso) abre esa pestaña.
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'pedidos' || t === 'catastro') setTab(t);
  }, []);
  useEffect(() => { if (tab === 'catastro' && catastro === null) catastroService.listar().then(setCatastro).catch(() => setCatastro([])); }, [tab, catastro]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [stock, setStock] = useState<StockFila[]>([]);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [series, setSeries] = useState<SerieFila[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [equipo, setEquipo] = useState<Record<string, Vendedor>>({});
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  const [bodegaFiltro, setBodegaFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [registrar, setRegistrar] = useState<TipoReg | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [b, s, m, se, c] = await Promise.all([bodegaService.bodegas(), bodegaService.stock(), bodegaService.movimientos({}, 300), bodegaService.series(), catalogoService.getAll(false)]);
      setBodegas(b); setStock(s); setMovs(m); setSeries(se); setCatalogo(c);
      vendedoresService.mapa().then(setEquipo).catch(() => {});
      otService.listar().then(o => setOts(o.filter(x => !['cerrada', 'anulada'].includes(x.estado)))).catch(() => {});
    } catch (e) { if (faltaFase2(e)) setFalta(true); else toastError('No se pudo cargar la bodega: ' + (e instanceof Error ? e.message : '')); }
    finally { setCargando(false); }
  }, [toastError]);
  useEffect(() => { cargar(); }, [cargar]);

  const art = useMemo(() => Object.fromEntries(catalogo.map(c => [c.id, c])), [catalogo]);
  const bod = useMemo(() => Object.fromEntries(bodegas.map(b => [b.id, b])), [bodegas]);
  const q = busca.trim().toLowerCase();
  const coincide = (id: string, extra = '') => !q || `${art[id]?.codigo || ''} ${art[id]?.descripcion || ''} ${extra}`.toLowerCase().includes(q);

  // Stock agrupado por artículo, con detalle por bodega.
  const filasStock = useMemo(() => {
    const m = new Map<string, { id: string; total: number; por: Record<string, number> }>();
    stock.filter(s => Number(s.cantidad) !== 0 && (!bodegaFiltro || s.bodega_id === bodegaFiltro)).forEach(s => {
      const f = m.get(s.articulo_id) || { id: s.articulo_id, total: 0, por: {} };
      f.total += Number(s.cantidad); f.por[s.bodega_id] = Number(s.cantidad); m.set(s.articulo_id, f);
    });
    return Array.from(m.values()).filter(f => coincide(f.id)).sort((a, b) => (art[a.id]?.descripcion || '').localeCompare(art[b.id]?.descripcion || ''));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock, bodegaFiltro, q, art]);
  const valorizado = filasStock.reduce((s, f) => s + f.total * (art[f.id]?.costo || 0), 0);

  const nuevaBodega = async () => {
    const n = prompt('Nombre de la nueva bodega (ej. "Camioneta Joaquín")');
    if (!n?.trim()) return;
    try { await bodegaService.crearBodega(n.trim()); success('Bodega creada'); cargar(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo crear'); }
  };

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Operación" title="Bodega" /><FaltaSQL /></div>;

  const th = { padding: '0.6rem 1rem', textAlign: 'left', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 } as const;
  const td = { padding: '0.6rem 1rem', borderTop: '1px solid var(--border2)', fontSize: '0.86rem', color: 'var(--text)' } as const;

  return (
    <div className="anim-in">
      {registrar && <Registrar bodegas={bodegas.filter(b => b.activo)} catalogo={catalogo.filter(c => c.activo !== false)} ots={ots} tipoInicial={registrar}
        puedeAjustar={puede('bodega.ajustar')} onClose={() => setRegistrar(null)} onListo={() => { setRegistrar(null); cargar(); }} />}
      <PageHeader eyebrow="Operación" title="Bodega" subtitle="Stock por bodega a partir de los movimientos. Los artículos son los del catálogo."
        actions={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {puede('bodega.ajustar') && <button className="btn btn-ghost" onClick={nuevaBodega}><Warehouse size={14} /> Nueva bodega</button>}
          {puede('bodega.mover') && <button className="btn btn-ghost" onClick={() => setRegistrar('salida')}><Minus size={14} /> Salida</button>}
          {puede('bodega.mover') && <button className="btn btn-primary" onClick={() => setRegistrar('entrada')}><Plus size={14} /> Entrada</button>}
        </div>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
        <div className="kpi-card"><p className="label-muted">Artículos con stock</p><p className="kpi-value">{filasStock.length}</p></div>
        {puede('cotizaciones.ver_costos') && <div className="kpi-card"><p className="label-muted">Valorizado (costo)</p><p className="kpi-value">{formatCLP(valorizado)}</p></div>}
        <div className="kpi-card"><p className="label-muted">Bodegas</p><p className="kpi-value">{bodegas.filter(b => b.activo).length}</p></div>
      </div>

      <div className="panel-y">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {([['stock', 'Stock'], ['movimientos', 'Movimientos'], ['series', 'Series'], ['pedidos', 'Pedidos'], ['catastro', 'Catastro'],
              ...(puede('bodega.ajustar') ? [['bodegas', 'Bodegas']] : [])] as [typeof tab, string][]).map(([t, nombre]) => (
              <button key={t} className="btn btn-sm" onClick={() => setTab(t)} style={{ background: tab === t ? 'var(--y-brand)' : 'var(--bg3)', color: tab === t ? '#111' : 'var(--muted)' }}>
                {nombre}</button>
            ))}
          </div>
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input className="input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar artículo o serie…" style={{ paddingLeft: '2.2rem' }} />
          </div>
          <select className="input" style={{ maxWidth: 190 }} value={bodegaFiltro} onChange={e => setBodegaFiltro(e.target.value)}>
            <option value="">Todas las bodegas</option>
            {bodegas.some(b => b.responsable_id === perfil?.id) && <option value={bodegas.find(b => b.responsable_id === perfil?.id)!.id}>Mi bodega</option>}
            {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}{b.responsable_id ? ` · ${equipo[b.responsable_id]?.nombre?.split(' ')[0] || ''}` : ''}</option>)}
          </select>
        </div>

        {cargando ? <div style={{ padding: '1.5rem' }}><div className="skeleton" style={{ height: 120 }} /></div> : (
          <div style={{ overflowX: 'auto' }}>
            {tab === 'stock' && (filasStock.length === 0
              ? <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>Sin stock. Registra una entrada para empezar.</p>
              : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Artículo</th>{!bodegaFiltro && bodegas.map(b => <th key={b.id} style={{ ...th, textAlign: 'right' }}>{b.nombre}</th>)}<th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>
                <tbody>{filasStock.map(f => (
                  <tr key={f.id}>
                    <td style={td}>{art[f.id]?.codigo ? <span style={{ color: 'var(--muted)' }}>{art[f.id].codigo} · </span> : null}{art[f.id]?.descripcion || 'Artículo'}</td>
                    {!bodegaFiltro && bodegas.map(b => <td key={b.id} style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: f.por[b.id] ? 'var(--text)' : 'var(--muted)' }}>{f.por[b.id] || '—'}</td>)}
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: f.total < 0 ? 'var(--danger)' : 'var(--text)' }}>{f.total} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{art[f.id]?.unidad}</span></td>
                  </tr>))}</tbody>
              </table>)}

            {tab === 'movimientos' && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Fecha</th><th style={th}>Tipo</th><th style={th}>Artículo</th><th style={{ ...th, textAlign: 'right' }}>Cant.</th><th style={th}>Bodega</th><th style={th}>Detalle</th></tr></thead>
                <tbody>{movs.filter(m => (!bodegaFiltro || m.bodega_id === bodegaFiltro) && coincide(m.articulo_id, m.serie || '')).map(m => (
                  <tr key={m.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--muted)' }}>{new Date(m.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td style={{ ...td, color: m.tipo === 'salida' ? 'var(--danger)' : m.tipo === 'entrada' ? 'var(--success)' : 'var(--info)' }}>{m.tipo}</td>
                    <td style={td}>{m.catalogo_items?.descripcion}{m.serie ? <span style={{ color: 'var(--muted)' }}> · S/N {m.serie}</span> : null}</td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.tipo === 'salida' ? '−' : ''}{m.cantidad}</td>
                    <td style={td}>{m.bodegas?.nombre}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>
                      {m.ot_id ? <Link href={`/ordenes/${m.ot_id}`}>{folioOT(m.ordenes_trabajo?.folio)}</Link> : null}
                      {m.ot_id && m.nota ? ' · ' : ''}{m.nota}{(m.ot_id || m.nota) ? ' · ' : ''}{equipo[m.usuario_id || '']?.nombre?.split(' ')[0] || ''}
                    </td>
                  </tr>))}</tbody>
              </table>)}

            {tab === 'series' && (series.length === 0
              ? <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>Aún no hay equipos con número de serie.</p>
              : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Serie</th><th style={th}>Artículo</th><th style={th}>Dónde está</th><th style={th}>Bodega / OT</th></tr></thead>
                <tbody>{series.filter(s => (!bodegaFiltro || s.bodega_id === bodegaFiltro) && coincide(s.articulo_id, s.serie)).map(s => (
                  <tr key={`${s.articulo_id}-${s.serie}`}>
                    <td style={{ ...td, fontWeight: 600 }}>{s.serie}</td>
                    <td style={td}>{art[s.articulo_id]?.descripcion}</td>
                    <td style={{ ...td, color: s.estado === 'en bodega' ? 'var(--success)' : 'var(--muted)' }}>{s.estado}</td>
                    <td style={td}>{s.ot_id ? <Link href={`/ordenes/${s.ot_id}`}>Ver OT</Link> : bod[s.bodega_id]?.nombre}</td>
                  </tr>))}</tbody>
              </table>)}

            {tab === 'pedidos' && <div style={{ padding: '1rem' }}><PedidosMaterial equipo={equipo} /></div>}

            {tab === 'catastro' && (catastro === null ? <div style={{ padding: '1.5rem' }}><Loader2 className="iv-spin" /></div> : catastro.length === 0
              ? <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>Aún no hay equipos instalados con serie. Se anotan solos al sacar un equipo con su serie para una OT.</p>
              : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Cliente / lugar</th><th style={th}>Equipo</th><th style={th}>Serie</th><th style={th}>Instalado</th><th style={th}>OT</th></tr></thead>
                <tbody>{catastro.filter(c => !q || `${c.nombre_cliente || ''} ${c.sucursal_nombre || ''} ${c.descripcion} ${c.serie} ${c.marca || ''} ${c.modelo || ''}`.toLowerCase().includes(q)).map(c => (
                  <tr key={`${c.articulo_id}-${c.serie}`}>
                    <td style={td}>{c.nombre_cliente || '—'}{c.sucursal_nombre ? <span style={{ color: 'var(--muted)' }}> · {c.sucursal_nombre}</span> : c.direccion ? <span style={{ color: 'var(--muted)' }}> · {c.direccion}</span> : null}</td>
                    <td style={td}>{c.descripcion}{c.marca || c.modelo ? <span style={{ color: 'var(--muted)' }}> · {[c.marca, c.modelo].filter(Boolean).join(' ')}</span> : null}{c.garantia ? <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)' }}>Garantía: {c.garantia}</span> : null}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{c.serie}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{formatDate(c.instalado_at)}</td>
                    <td style={td}><Link href={`/ordenes/${c.ot_id}`}>OT-{String(c.ot_folio).padStart(4, '0')}</Link></td>
                  </tr>))}</tbody>
              </table>)}

            {tab === 'bodegas' && (
              <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>Una bodega con responsable es «su bodega» (por ejemplo, la camioneta de un técnico): ahí llegan sus pedidos y desde ahí descuenta lo que instala.</p>
                {bodegas.map(b => (
                  <div key={b.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--border2)', paddingBottom: 6, opacity: b.activo ? 1 : 0.5 }}>
                    <b style={{ flex: 1, minWidth: 160, color: 'var(--text)' }}>{b.nombre}</b>
                    <select className="input" style={{ width: 220 }} value={b.responsable_id || ''} onChange={async e => {
                      try { await bodegaService.actualizarBodega(b.id, { responsable_id: e.target.value || null }); success('Responsable guardado'); cargar(); }
                      catch (err) { toastError(err instanceof Error ? err.message : 'No se pudo'); }
                    }}>
                      <option value="">Sin responsable (bodega común)</option>
                      {Object.values(equipo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                    <button className="btn btn-ghost btn-xs" onClick={async () => {
                      try { await bodegaService.actualizarBodega(b.id, { activo: !b.activo }); cargar(); } catch (err) { toastError(err instanceof Error ? err.message : 'No se pudo'); }
                    }}>{b.activo ? 'Desactivar' : 'Activar'}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
