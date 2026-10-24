'use client';

/**
 * Factura electrónica del SII con OpenFactura (fase 15).
 * - ConfigDTE: en Configuración, la clave de la API y los datos del emisor que pide el SII.
 * - EmitirDTE: en cada cobro, emitir la factura (o ver la ya emitida y su PDF).
 * La clave se guarda en la base y solo la usa el servidor: nunca vuelve al navegador.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, FileCheck2, FileText, Loader2, Receipt, Save } from 'lucide-react';
import { fetchConSesion } from '@/lib/fetchConSesion';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/useToast';
import type { PorFacturar } from '@/services/operacion';

interface EstadoDTE { configurado: boolean; tieneClave?: boolean; ambiente?: 'prueba' | 'produccion'; acteco?: string | null; comuna?: string | null; sucursal?: string | null; motivo?: string }

let cache: Promise<EstadoDTE> | null = null;
export function estadoDTE(fresco = false): Promise<EstadoDTE> {
  if (fresco || !cache) cache = fetchConSesion('/api/dte').then(r => (r.ok ? r.json() : { configurado: false })).catch(() => ({ configurado: false }));
  return cache;
}

export function ConfigDTE() {
  const { success, error: toastError } = useToast();
  const [e, setE] = useState<EstadoDTE | null>(null);
  const [clave, setClave] = useState('');
  const [d, setD] = useState({ ambiente: 'prueba', acteco: '', comuna: '', sucursal: '' });
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    estadoDTE(true).then(x => { setE(x); setD({ ambiente: x.ambiente || 'prueba', acteco: x.acteco || '', comuna: x.comuna || '', sucursal: x.sucursal || '' }); });
  }, []);
  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await fetchConSesion('/api/dte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'configurar', apiKey: clave, ...d }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      setClave(''); setE(await estadoDTE(true)); success('Factura electrónica guardada');
    } catch (err) { toastError(err instanceof Error ? err.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };
  const titulo: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--y)', margin: 0 };
  if (!e) return null;
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={titulo}><Receipt size={13} /> Factura electrónica (SII)</p>
      {e.motivo && !e.tieneClave ? <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>{e.motivo}</p> : <>
        <p style={{ margin: 0, fontSize: '0.82rem', color: e.configurado ? 'var(--success)' : 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
          {e.configurado ? <><CheckCircle2 size={14} /> Lista: en cada cobro aparece «Emitir factura electrónica»{e.ambiente === 'prueba' ? ' (ambiente de prueba, no vale ante el SII)' : ''}.</>
            : 'Con OpenFactura (Haulmer) las facturas se emiten desde aquí, con folio del SII y su PDF. Pide la API key en tu cuenta de OpenFactura.'}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 8 }}>
          <label><span className="label-muted">API key de OpenFactura</span>
            <input className="input input-sm" type="password" autoComplete="off" value={clave} onChange={x => setClave(x.target.value)} placeholder={e.tieneClave ? '•••••• (guardada)' : 'Pégala aquí'} /></label>
          <label><span className="label-muted">Ambiente</span>
            <select className="input input-sm" value={d.ambiente} onChange={x => setD({ ...d, ambiente: x.target.value })}>
              <option value="prueba">Prueba (no vale ante el SII)</option><option value="produccion">Producción</option></select></label>
          <label><span className="label-muted">Código de actividad (Acteco)</span>
            <input className="input input-sm" inputMode="numeric" value={d.acteco} onChange={x => setD({ ...d, acteco: x.target.value })} placeholder="432100" /></label>
          <label><span className="label-muted">Comuna de la empresa</span>
            <input className="input input-sm" value={d.comuna} onChange={x => setD({ ...d, comuna: x.target.value })} placeholder="Santiago" /></label>
          <label><span className="label-muted">Código sucursal SII (opcional)</span>
            <input className="input input-sm" inputMode="numeric" value={d.sucursal} onChange={x => setD({ ...d, sucursal: x.target.value })} /></label>
        </div>
        <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted)' }}>RUT, razón social, giro y dirección salen de «Mi empresa». Al cliente se le pide RUT, giro, dirección y comuna (en su ficha).</p>
        <div><button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={13} className="iv-spin" /> : <Save size={13} />} Guardar</button></div>
      </>}
    </div>
  );
}

export function EmitirDTE({ p, puedeEmitir, onEmitida }: { p: PorFacturar; puedeEmitir: boolean; onEmitida: () => void }) {
  const { success, warning, error: toastError } = useToast();
  const [e, setE] = useState<EstadoDTE | null>(null);
  const [tipo, setTipo] = useState<33 | 34>(33);
  const [emitiendo, setEmitiendo] = useState(false);
  useEffect(() => { estadoDTE().then(setE); }, []);

  const verPDF = async () => {
    if (!p.dte_pdf) return;
    const { data } = await supabase.storage.from('dte').createSignedUrl(p.dte_pdf, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank'); else toastError('No se pudo abrir el PDF');
  };
  const emitir = async () => {
    if (!confirm(`¿Emitir la ${tipo === 33 ? 'factura electrónica' : 'factura exenta electrónica'} ante el SII? No se puede deshacer (se anula con una nota de crédito).`)) return;
    setEmitiendo(true);
    try {
      const r = await fetchConSesion('/api/dte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'emitir', id: p.id, tipo }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      if (j.aviso) warning(j.aviso); else success(`Factura electrónica N° ${j.folio} emitida`);
      onEmitida();
    } catch (err) { toastError(err instanceof Error ? err.message : 'No se pudo emitir'); }
    finally { setEmitiendo(false); }
  };

  if (p.dte_folio) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '0.6rem 0.7rem', background: 'var(--success-soft)', borderRadius: 8 }}>
        <FileCheck2 size={15} color="var(--success)" />
        <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text)' }}>
          {p.dte_tipo === 34 ? 'Factura exenta' : 'Factura'} electrónica N° <b>{p.dte_folio}</b>{p.dte_emitido_at ? ` · ${new Date(p.dte_emitido_at).toLocaleDateString('es-CL')}` : ''}</span>
        {p.dte_pdf && <button type="button" className="btn btn-ghost btn-sm" onClick={verPDF}><FileText size={13} /> PDF</button>}
      </div>
    );
  }
  if (!e?.configurado || !puedeEmitir || p.etapa === 'sin_cobro') return null;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '0.6rem 0.7rem', background: 'var(--bg3)', borderRadius: 8 }}>
      <Receipt size={15} color="var(--y)" />
      <span style={{ flex: 1, fontSize: '0.84rem', color: 'var(--text)', minWidth: 160 }}>Emitir la factura ante el SII{e.ambiente === 'prueba' ? ' (prueba)' : ''}: queda con su folio, fecha y PDF.</span>
      <select className="input input-sm" value={tipo} onChange={x => setTipo(Number(x.target.value) as 33 | 34)} style={{ width: 'auto' }} aria-label="Tipo de factura">
        <option value={33}>Factura (33)</option><option value={34}>Factura exenta (34)</option></select>
      <button type="button" className="btn btn-primary btn-sm" onClick={emitir} disabled={emitiendo}>{emitiendo ? <Loader2 size={13} className="iv-spin" /> : <Receipt size={13} />} Emitir</button>
    </div>
  );
}
