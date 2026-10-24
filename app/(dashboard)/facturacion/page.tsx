'use client';

/**
 * Finanzas → Por facturar y cobranza (traído de TecApp).
 * Cada cobro de un trabajo (anticipo, saldo…) y cada OT cerrada cae aquí solo. Se avanza por
 * etapas (OC, HES, factura) hasta el pago. Fase 15: antigüedad de lo por cobrar, recordatorio
 * de pago para el cliente y conciliación con la cartola del banco.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, Landmark, Loader2, Mail, MessageCircle, Save, Search, Wallet, X } from 'lucide-react';
import Conciliacion from '@/components/facturacion/Conciliacion';
import { EmitirDTE } from '@/components/facturacion/FacturaElectronica';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import { supabase } from '@/lib/supabase';
import { useFase } from '@/lib/fases';
import { correoAutomatico, enviarCorreo } from '@/lib/correo';
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
/** Días desde que se facturó (o desde que llegó, si no tiene fecha de factura). */
const diasFactura = (p: PorFacturar) => Math.max(0, Math.floor((Date.parse(fechaLocal()) - Date.parse(p.fecha_factura || p.created_at.slice(0, 10))) / 864e5));
const TRAMOS = [
  { clave: '0-30', nombre: '0 a 30 días', color: '#2563eb', de: 0, a: 30 },
  { clave: '31-60', nombre: '31 a 60 días', color: '#d97706', de: 31, a: 60 },
  { clave: '60+', nombre: 'Más de 60 días', color: '#dc2626', de: 61, a: Infinity },
] as const;
type Tramo = typeof TRAMOS[number]['clave'];
const tramoDe = (p: PorFacturar): Tramo => { const d = diasFactura(p); return d <= 30 ? '0-30' : d <= 60 ? '31-60' : '60+'; };

/** El recordatorio de pago para el cliente: amable, con el monto, la factura y dónde pagar. */
function textoRecordatorio(p: PorFacturar, empresa: EmpresaInfo | null): string {
  const hoy = fechaLocal();
  const quien = p.clientes?.contacto_nombre?.split(' ')[0] || p.clientes?.nombre_cliente || '';
  const venc = p.vencimiento ? (p.vencimiento < hoy ? `, que venció el ${formatDate(p.vencimiento)}` : `, que vence el ${formatDate(p.vencimiento)}`) : '';
  const pago = empresa?.cuenta_bancaria
    ? `\n\nDatos para transferir: ${empresa.nombre}, RUT ${empresa.rut}, ${[empresa.banco, empresa.tipo_cuenta].filter(Boolean).join(' · ')} N° ${empresa.cuenta_bancaria}${empresa.email ? `, comprobante a ${empresa.email}` : ''}.`
    : '';
  return `Hola${quien ? ` ${quien}` : ''}, junto con saludar, te recordamos que la factura${p.numero_factura ? ` N° ${p.numero_factura}` : ''} por ${formatCLP(saldo(p))}${venc} aún aparece pendiente de pago${p.descripcion ? ` (${p.descripcion})` : ''}.${pago}\n\nSi ya la pagaste, por favor envíanos el comprobante y disculpa la molestia. ¡Gracias!\n${empresa?.nombre || ''}`.trim();
}

function Recordatorio({ p, empresa }: { p: PorFacturar; empresa: EmpresaInfo | null }) {
  const { success, error: toastError } = useToast();
  const [auto, setAuto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { correoAutomatico().then(setAuto); }, []);
  const texto = textoRecordatorio(p, empresa);
  const tel = (p.clientes?.telefono || '').replace(/[^\d]/g, '');
  const copiar = async () => { try { await navigator.clipboard.writeText(texto); success('Mensaje copiado'); } catch { /* sin portapapeles */ } };
  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '0.7rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="label-muted">Recordatorio de pago para el cliente</span>
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{texto}</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={copiar}><Copy size={13} /> Copiar</button>
        {tel && <a className="btn btn-ghost btn-sm" href={`https://wa.me/${tel.length === 9 ? `56${tel}` : tel}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer"><MessageCircle size={13} /> WhatsApp</a>}
        {p.clientes?.email && auto && <button type="button" className="btn btn-ghost btn-sm" disabled={enviando} onClick={async () => {
          setEnviando(true);
          try { await enviarCorreo({ para: p.clientes!.email!, asunto: `Recordatorio de pago${p.numero_factura ? ` · factura N° ${p.numero_factura}` : ''}`, texto }); success(`Recordatorio enviado a ${p.clientes!.email}`); }
          catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo enviar'); }
          finally { setEnviando(false); }
        }}>{enviando ? <Loader2 size={13} className="iv-spin" /> : <Mail size={13} />} Enviar por correo</button>}
        {p.clientes?.email && !auto && <a className="btn btn-ghost btn-sm" href={`mailto:${p.clientes.email}?subject=${encodeURIComponent(`Recordatorio de pago${p.numero_factura ? ` · factura N° ${p.numero_factura}` : ''}`)}&body=${encodeURIComponent(texto)}`}><Mail size={13} /> Correo</a>}
      </div>
    </div>
  );
}

function Ficha({ p, puedeEditar, empresa, onClose, onGuardado }: { p: PorFacturar; puedeEditar: boolean; empresa: EmpresaInfo | null; onClose: () => void; onGuardado: () => void }) {
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
    } catch (e) {
      const m = e instanceof Error ? e.message : (e as { message?: string } | null)?.message || '';
      toastError(/ya está registrada en otro trabajo/.test(m) ? `${m} Revisa el número: una factura no puede cobrar dos trabajos distintos.` : m || 'No se pudo guardar');
    }
    finally { setGuardando(false); }
  };

  return (
    <div className="modal-overlay">
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10 }}>
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
          <EmitirDTE p={p} puedeEmitir={puedeEditar} onEmitida={onGuardado} />
          {p.etapa === 'facturado' && saldo(p) > 0 && <Recordatorio p={p} empresa={empresa} />}
          <div><label className="label-muted" style={lbl}>Notas</label><textarea className="input" rows={2} value={d.notas || ''} onChange={e => set({ notas: e.target.value })} /></div>
          {d.cotizacion_id && <Link href={`/cotizador?edit=${d.cotizacion_id}`} style={{ fontSize: '0.85rem' }}>Ver el trabajo {d.cotizaciones ? `IV-${String(d.cotizaciones.folio).padStart(4, '0')}` : ''}</Link>}
          {d.ot_id && !d.cotizacion_id && <Link href={`/ordenes/${d.ot_id}`} style={{ fontSize: '0.85rem' }}>Ver {folioOT(d.ordenes_trabajo?.folio)}</Link>}
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
  const [tramo, setTramo] = useState<Tramo | ''>('');
  const [conciliando, setConciliando] = useState(false);
  const [empresa, setEmpresa] = useState<EmpresaInfo | null>(null);
  const fase15 = useFase(15);
  useEffect(() => {
    supabase.from('empresas').select('*').limit(1).then(({ data }) => setEmpresa(((data || [])[0] as EmpresaInfo | undefined) || null));
  }, []);

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
      : filtro === 'por_cobrar' ? p.etapa === 'facturado' && saldo(p) > 0 && (!tramo || tramoDe(p) === tramo)
      : p.etapa === filtro)
      .filter(p => !q || `${p.descripcion || ''} ${p.clientes?.nombre_cliente || ''} ${p.numero_factura || ''} ${p.numero_oc || ''}`.toLowerCase().includes(q));
  }, [filas, filtro, busca, tramo]);
  const porCobrar = filas.filter(p => p.etapa === 'facturado' && saldo(p) > 0);

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Finanzas" title="Por facturar y cobranza" /><FaltaSQL /></div>;

  return (
    <div className="anim-in">
      {abierta && <Ficha p={abierta} puedeEditar={puede('facturacion.gestionar')} empresa={empresa} onClose={() => setAbierta(null)} onGuardado={() => { setAbierta(null); cargar(); }} />}
      {conciliando && <Conciliacion cobros={filas} onClose={() => setConciliando(false)} onCambio={cargar} />}
      <PageHeader eyebrow="Finanzas" title="Por facturar y cobranza"
        subtitle="Cada cobro de un trabajo (anticipo, saldo) y cada OT cerrada llega aquí solo. Avánzalo hasta que esté pagado."
        actions={fase15 && puede('facturacion.gestionar') ? <button className="btn btn-ghost" onClick={() => setConciliando(true)}><Landmark size={14} /> Conciliar con el banco</button> : null} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 8, marginBottom: 12 }}>
        {kpis.map(k => (
          <button key={k.t} className="kpi-card" style={{ cursor: 'pointer', textAlign: 'left' }} onClick={() => { setFiltro(k.f); setTramo(''); }}>
            <p className="label-muted">{k.t}</p><p className="kpi-value" style={{ color: k.c }}>{formatCLP(k.v)}</p>
          </button>
        ))}
      </div>

      {porCobrar.length > 0 && (
        <div className="panel-y" style={{ padding: '0.8rem 1rem', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="label-muted" style={{ marginRight: 4 }}>Antigüedad de lo por cobrar (desde la factura)</span>
          {TRAMOS.map(t => {
            const enTramo = porCobrar.filter(p => tramoDe(p) === t.clave);
            const activo = filtro === 'por_cobrar' && tramo === t.clave;
            return (
              <button key={t.clave} type="button" onClick={() => { setFiltro('por_cobrar'); setTramo(activo ? '' : t.clave); }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '0.45rem 0.8rem', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${activo ? t.color : 'var(--border2)'}`, background: activo ? t.color + '14' : 'transparent' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{t.nombre} · {enTramo.length}</span>
                <b style={{ color: enTramo.length ? t.color : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{formatCLP(enTramo.reduce((s, p) => s + saldo(p), 0))}</b>
              </button>
            );
          })}
        </div>
      )}

      <div className="panel-y">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input className="input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, OT, factura u OC…" style={{ paddingLeft: '2.2rem' }} />
          </div>
          <select className="input" style={{ maxWidth: 200 }} value={filtro} onChange={e => { setFiltro(e.target.value as typeof filtro); setTramo(''); }}>
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
                  {p.etapa === 'facturado' && saldo(p) > 0 ? ` · facturada hace ${diasFactura(p)} d` : ''}
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
