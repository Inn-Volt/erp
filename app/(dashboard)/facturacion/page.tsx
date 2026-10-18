'use client';

/**
 * Finanzas → Por facturar y cobranza (traído de TecApp).
 * Cada OT cerrada cae aquí sola. Se avanza por etapas (OC, HES, factura) hasta el pago.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Save, Search, Wallet, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import NumeroInput from '@/components/NumeroInput';
import { ETAPAS_COBRO, facturacionService, faltaFase2, folioOT, type EtapaCobro, type PorFacturar } from '@/services/operacion';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP, formatDate } from '@/utils';

const etapa = (e: EtapaCobro) => ETAPAS_COBRO.find(x => x.clave === e) || ETAPAS_COBRO[0];
const saldo = (p: PorFacturar) => Math.max(0, Number(p.monto) - Number(p.monto_pagado || 0));
const vencida = (p: PorFacturar) => p.etapa === 'facturado' && saldo(p) > 0 && !!p.vencimiento && p.vencimiento < fechaLocal();

function Ficha({ p, puedeEditar, onClose, onGuardado }: { p: PorFacturar; puedeEditar: boolean; onClose: () => void; onGuardado: () => void }) {
  const { success, error: toastError } = useToast();
  const [d, setD] = useState<PorFacturar>(p);
  const [guardando, setGuardando] = useState(false);
  const set = (patch: Partial<PorFacturar>) => setD(x => ({ ...x, ...patch }));
  const lbl = { display: 'block', marginBottom: 6 } as const;

  const guardar = async () => {
    if (d.etapa === 'sin_cobro' && !d.sin_cobro_motivo) { toastError('Indica por qué no se cobra'); return; }
    setGuardando(true);
    try {
      await facturacionService.actualizar(d.id, {
        etapa: d.etapa, monto: d.monto, sin_cobro_motivo: d.etapa === 'sin_cobro' ? d.sin_cobro_motivo : null,
        numero_oc: d.numero_oc || null, numero_hes: d.numero_hes || null, numero_factura: d.numero_factura || null,
        fecha_factura: d.fecha_factura || null, vencimiento: d.vencimiento || null,
        monto_pagado: d.monto_pagado || 0, fecha_pago: d.fecha_pago || null, notas: d.notas || null,
      });
      success('Guardado'); onGuardado();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}><Wallet size={16} /> {d.descripcion || 'Cobro'}</p>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>
        <fieldset disabled={!puedeEditar} style={{ border: 'none', margin: 0, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ETAPAS_COBRO.map(e => (
              <button type="button" key={e.clave} onClick={() => set({ etapa: e.clave, ...(e.clave === 'facturado' && !d.fecha_factura ? { fecha_factura: fechaLocal() } : {}) })} className="badge"
                style={{ cursor: 'pointer', padding: '0.35rem 0.7rem', background: d.etapa === e.clave ? e.color : 'var(--bg3)', color: d.etapa === e.clave ? '#fff' : 'var(--muted)', border: 'none' }}>{e.nombre}</button>
            ))}
          </div>
          {d.etapa === 'sin_cobro' && (
            <div><label className="label-muted" style={lbl}>Motivo</label>
              <select className="input" value={d.sin_cobro_motivo || ''} onChange={e => set({ sin_cobro_motivo: (e.target.value || null) as PorFacturar['sin_cobro_motivo'] })}>
                <option value="">Elegir…</option><option value="garantia">Garantía</option><option value="cortesia">Cortesía</option></select></div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <div><label className="label-muted" style={lbl}>Monto a cobrar (con IVA)</label><NumeroInput className="input" value={Number(d.monto)} onChange={v => set({ monto: v })} /></div>
            <div><label className="label-muted" style={lbl}>N° OC</label><input className="input" value={d.numero_oc || ''} onChange={e => set({ numero_oc: e.target.value })} /></div>
            <div><label className="label-muted" style={lbl}>N° HES</label><input className="input" value={d.numero_hes || ''} onChange={e => set({ numero_hes: e.target.value })} /></div>
            <div><label className="label-muted" style={lbl}>N° factura</label><input className="input" value={d.numero_factura || ''} onChange={e => set({ numero_factura: e.target.value })} /></div>
            <div><label className="label-muted" style={lbl}>Fecha factura</label><input className="input" type="date" value={d.fecha_factura || ''} onChange={e => set({ fecha_factura: e.target.value })} /></div>
            <div><label className="label-muted" style={lbl}>Vencimiento</label><input className="input" type="date" value={d.vencimiento || ''} onChange={e => set({ vencimiento: e.target.value })} /></div>
            <div><label className="label-muted" style={lbl}>Pagado</label><NumeroInput className="input" value={Number(d.monto_pagado || 0)} onChange={v => set({ monto_pagado: v })} /></div>
            <div><label className="label-muted" style={lbl}>Fecha de pago</label><input className="input" type="date" value={d.fecha_pago || ''} onChange={e => set({ fecha_pago: e.target.value })} /></div>
          </div>
          {puedeEditar && saldo(d) > 0 && d.etapa === 'facturado' && (
            <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => set({ monto_pagado: d.monto, fecha_pago: d.fecha_pago || fechaLocal() })}>Marcar pagada completa</button>
          )}
          <div><label className="label-muted" style={lbl}>Notas</label><textarea className="input" rows={2} value={d.notas || ''} onChange={e => set({ notas: e.target.value })} /></div>
          {d.ot_id && <Link href={`/ordenes/${d.ot_id}`} style={{ fontSize: '0.85rem' }}>Ver {folioOT(d.ordenes_trabajo?.folio)}</Link>}
        </fieldset>
        {puedeEditar && (
          <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Save size={14} />} Guardar</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FacturacionPage() {
  const { puede } = usePermisos();
  const { error: toastError } = useToast();
  const [filas, setFilas] = useState<PorFacturar[]>([]);
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  const [filtro, setFiltro] = useState<'pendientes' | 'por_cobrar' | 'todas' | EtapaCobro>('pendientes');
  const [busca, setBusca] = useState('');
  const [abierta, setAbierta] = useState<PorFacturar | null>(null);

  const cargar = useCallback(async () => {
    try { setFilas(await facturacionService.listar()); }
    catch (e) { if (faltaFase2(e)) setFalta(true); else toastError('No se pudo cargar: ' + (e instanceof Error ? e.message : '')); }
    finally { setCargando(false); }
  }, [toastError]);
  useEffect(() => { cargar(); }, [cargar]);

  const total = (f: (p: PorFacturar) => boolean, v: (p: PorFacturar) => number = p => Number(p.monto)) => filas.filter(f).reduce((s, p) => s + v(p), 0);
  const kpis = [
    { t: 'Por facturar', v: total(p => !['facturado', 'sin_cobro'].includes(p.etapa)), c: '#d97706', f: 'pendientes' as const },
    { t: 'Por cobrar', v: total(p => p.etapa === 'facturado', saldo), c: '#2563eb', f: 'por_cobrar' as const },
    { t: 'Vencido', v: total(vencida, saldo), c: '#dc2626', f: 'por_cobrar' as const },
  ];

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return filas.filter(p => filtro === 'todas' ? true
      : filtro === 'pendientes' ? !['facturado', 'sin_cobro'].includes(p.etapa)
      : filtro === 'por_cobrar' ? p.etapa === 'facturado' && saldo(p) > 0
      : p.etapa === filtro)
      .filter(p => !q || `${p.descripcion || ''} ${p.clientes?.nombre_cliente || ''} ${p.numero_factura || ''} ${p.numero_oc || ''}`.toLowerCase().includes(q));
  }, [filas, filtro, busca]);

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Finanzas" title="Por facturar y cobranza" /><FaltaSQL /></div>;

  return (
    <div className="anim-in">
      {abierta && <Ficha p={abierta} puedeEditar={puede('facturacion.gestionar')} onClose={() => setAbierta(null)} onGuardado={() => { setAbierta(null); cargar(); }} />}
      <PageHeader eyebrow="Finanzas" title="Por facturar y cobranza" subtitle="Cada OT cerrada llega aquí sola. Avánzala hasta que esté pagada." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 12 }}>
        {kpis.map(k => (
          <button key={k.t} className="kpi-card" style={{ cursor: 'pointer', textAlign: 'left' }} onClick={() => setFiltro(k.f)}>
            <p className="label-muted">{k.t}</p><p className="kpi-value" style={{ color: k.c }}>{formatCLP(k.v)}</p>
          </button>
        ))}
      </div>

      <div className="panel-y">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input className="input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, OT, factura u OC…" style={{ paddingLeft: '2.2rem' }} />
          </div>
          <select className="input" style={{ maxWidth: 200 }} value={filtro} onChange={e => setFiltro(e.target.value as typeof filtro)}>
            <option value="pendientes">Pendientes de facturar</option><option value="por_cobrar">Facturadas por cobrar</option><option value="todas">Todas</option>
            {ETAPAS_COBRO.map(e => <option key={e.clave} value={e.clave}>{e.nombre}</option>)}
          </select>
        </div>
        {cargando ? <div style={{ padding: '1.5rem' }}><div className="skeleton" style={{ height: 120 }} /></div>
          : lista.length === 0 ? <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>Nada en esta vista.</p>
          : lista.map(p => { const e = etapa(p.etapa); return (
            <button key={p.id} onClick={() => setAbierta(p)} style={{ display: 'flex', width: '100%', gap: 12, padding: '0.85rem 1rem', borderTop: '1px solid var(--border2)', background: 'none', border: 'none', borderTopStyle: 'solid', cursor: 'pointer', textAlign: 'left', alignItems: 'center' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descripcion || 'Cobro'}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  {p.clientes?.nombre_cliente || 'Sin cliente'}
                  {p.numero_oc ? ` · OC ${p.numero_oc}` : ''}{p.numero_factura ? ` · Fact. ${p.numero_factura}` : ''}
                  {p.vencimiento && p.etapa === 'facturado' ? ` · vence ${formatDate(p.vencimiento)}` : ''}
                </span>
              </span>
              <span style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{formatCLP(p.etapa === 'facturado' ? saldo(p) : Number(p.monto))}</span>
                <span className="badge" style={{ background: vencida(p) ? '#dc2626' : e.color, color: '#fff', fontSize: '0.7rem' }}>{vencida(p) ? 'Vencida' : p.etapa === 'facturado' && saldo(p) === 0 ? 'Pagada' : e.nombre}</span>
              </span>
            </button>); })}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border2)', color: 'var(--muted)', fontSize: '0.78rem' }}>{lista.length} registros</div>
      </div>
    </div>
  );
}
