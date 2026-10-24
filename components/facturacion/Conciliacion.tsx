'use client';

/**
 * Conciliación bancaria (fase 15): se sube la cartola del banco (CSV o Excel), se guardan sus
 * movimientos (una vez cada uno, aunque se suba de nuevo) y cada abono se cruza con un cobro
 * facturado y cada cargo con una compra impaga. Confirmar marca el cobro (o la compra) pagado.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, EyeOff, Landmark, Loader2, Upload, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { parsearCartola, sugerirCobro, sugerirCompra, type CobroAbierto, type CompraAbierta } from '@/lib/cartola';
import type { PorFacturar } from '@/services/operacion';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { formatCLP, formatDate } from '@/utils';

interface MovBanco { id: string; fecha: string; descripcion: string | null; monto: number; referencia: string | null }

const saldo = (p: PorFacturar) => Math.max(0, Number(p.monto) - Number(p.monto_pagado || 0));

export default function Conciliacion({ cobros, onClose, onCambio }: { cobros: PorFacturar[]; onClose: () => void; onCambio: () => void }) {
  const { perfil, puede } = usePermisos();
  const { success, error: toastError } = useToast();
  const [movs, setMovs] = useState<MovBanco[] | null>(null);
  const [compras, setCompras] = useState<CompraAbierta[]>([]);
  const [eleccion, setEleccion] = useState<Record<string, string>>({});
  const [subiendo, setSubiendo] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verCargos, setVerCargos] = useState(false);

  const abiertos: CobroAbierto[] = useMemo(() => cobros.filter(p => p.etapa === 'facturado' && saldo(p) > 0)
    .map(p => ({ id: p.id, saldo: saldo(p), numero_factura: p.numero_factura, cliente: p.clientes?.nombre_cliente || null })), [cobros]);

  const cargar = useCallback(async () => {
    const [m, k] = await Promise.all([
      supabase.from('movimientos_banco').select('id, fecha, descripcion, monto, referencia')
        .is('conciliado_at', null).eq('ignorado', false).order('fecha', { ascending: false }).limit(300),
      puede('compras.ver')
        ? supabase.from('compras').select('id, total, folio, proveedor_nombre').eq('pagada', false).neq('tipo_doc', 'nota_credito')
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (m.error) { toastError('No se pudieron leer los movimientos: ' + m.error.message); setMovs([]); return; }
    setMovs((m.data || []) as MovBanco[]);
    setCompras(((k.data || []) as { id: string; total: number; folio: string | null; proveedor_nombre: string }[])
      .map(c => ({ id: c.id, total: Number(c.total), folio: c.folio, proveedor: c.proveedor_nombre })));
  }, [puede, toastError]);
  useEffect(() => { cargar(); }, [cargar]);

  // Sugerencias (lo que el usuario elige manda).
  const sugerencias = useMemo(() => Object.fromEntries((movs || []).map(m => {
    const s = m.monto > 0 ? sugerirCobro({ monto: Number(m.monto), descripcion: m.descripcion || '', referencia: m.referencia }, abiertos)
      : sugerirCompra({ monto: Number(m.monto), descripcion: m.descripcion || '' }, compras);
    return [m.id, s];
  })), [movs, abiertos, compras]);

  const subir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setSubiendo(true);
    try {
      let texto: string;
      if (/\.(xlsx?|ods)$/i.test(archivo.name)) {
        const XLSX = await import('xlsx');
        const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: false, raw: false });
        texto = XLSX.utils.sheet_to_csv(libro.Sheets[libro.SheetNames[0]], { FS: ';' });
      } else {
        const buf = await archivo.arrayBuffer();
        // Muchos bancos bajan el CSV en Latin-1: si UTF-8 trae caracteres rotos, se relee.
        texto = new TextDecoder('utf-8').decode(buf);
        if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf);
      }
      const { movimientos, avisos } = parsearCartola(texto);
      if (!movimientos.length) { toastError(avisos[0] || 'La cartola no trae movimientos.'); return; }
      const { data, error } = await supabase.from('movimientos_banco')
        .upsert(movimientos.map(m => ({ fecha: m.fecha, descripcion: m.descripcion || null, monto: m.monto, referencia: m.referencia, huella: m.huella })),
          { onConflict: 'huella', ignoreDuplicates: true })
        .select('id');
      if (error) throw error;
      const nuevos = data?.length || 0;
      success(`${nuevos} movimiento${nuevos === 1 ? '' : 's'} nuevo${nuevos === 1 ? '' : 's'}${movimientos.length > nuevos ? ` (${movimientos.length - nuevos} ya estaban)` : ''}`);
      cargar();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo leer la cartola'); }
    finally { setSubiendo(false); }
  };

  const conciliar = async (m: MovBanco) => {
    const destino = eleccion[m.id] ?? sugerencias[m.id]?.id ?? '';
    if (!destino) { toastError(m.monto > 0 ? 'Elige a qué cobro corresponde' : 'Elige a qué compra corresponde'); return; }
    setOcupado(m.id);
    try {
      if (m.monto > 0) {
        const p = cobros.find(x => x.id === destino);
        if (!p) throw new Error('El cobro ya no está');
        const pagado = Math.min(Number(p.monto), Number(p.monto_pagado || 0) + Number(m.monto));
        const { error } = await supabase.from('por_facturar').update({ monto_pagado: pagado, fecha_pago: m.fecha }).eq('id', p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('compras').update({ pagada: true, fecha_pago: m.fecha }).eq('id', destino);
        if (error) throw error;
      }
      const { error } = await supabase.from('movimientos_banco').update({
        ...(m.monto > 0 ? { por_facturar_id: destino } : { compra_id: destino }), conciliado_at: new Date().toISOString(), conciliado_por: perfil?.id || null,
      }).eq('id', m.id);
      if (error) throw error;
      success(m.monto > 0 ? 'Cobro marcado como pagado' : 'Compra marcada como pagada');
      setMovs(x => (x || []).filter(y => y.id !== m.id));
      onCambio();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo conciliar'); }
    finally { setOcupado(null); }
  };

  const ignorar = async (m: MovBanco) => {
    setOcupado(m.id);
    const { error } = await supabase.from('movimientos_banco').update({ ignorado: true }).eq('id', m.id);
    setOcupado(null);
    if (error) toastError(error.message); else setMovs(x => (x || []).filter(y => y.id !== m.id));
  };

  const abonos = (movs || []).filter(m => m.monto > 0);
  const cargos = (movs || []).filter(m => m.monto < 0);
  const visibles = verCargos ? cargos : abonos;

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 820, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)', gap: 8 }}>
          <p className="section-label" style={{ margin: 0, flex: 1 }}><Landmark size={15} /> Conciliar con la cartola del banco</p>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
              {subiendo ? <Loader2 size={13} className="iv-spin" /> : <Upload size={13} />} Subir cartola (CSV o Excel)
              <input type="file" accept=".csv,.txt,.xls,.xlsx" hidden onChange={e => { subir(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)', flex: 1, minWidth: 220 }}>
              Bájala desde el banco (movimientos de la cuenta). Puedes subir la misma varias veces: cada movimiento se guarda una sola vez.</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-sm" onClick={() => setVerCargos(false)} style={{ background: !verCargos ? 'var(--y-brand)' : 'var(--bg3)', color: !verCargos ? '#111' : 'var(--muted)' }}>
              Abonos (pagos de clientes) · {abonos.length}</button>
            <button className="btn btn-sm" onClick={() => setVerCargos(true)} style={{ background: verCargos ? 'var(--y-brand)' : 'var(--bg3)', color: verCargos ? '#111' : 'var(--muted)' }}>
              Cargos (pagos a proveedores) · {cargos.length}</button>
          </div>
          {movs === null ? <div className="skeleton" style={{ height: 120 }} />
            : visibles.length === 0 ? <p style={{ margin: 0, padding: '1.5rem 0', textAlign: 'center', color: 'var(--muted)', fontSize: '0.88rem' }}>
                {movs.length ? 'Nada pendiente en esta vista.' : 'Sube la cartola para empezar.'}</p>
            : visibles.map(m => {
              const sug = sugerencias[m.id];
              const valor = eleccion[m.id] ?? sug?.id ?? '';
              return (
                <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '0.6rem 0', borderTop: '1px solid var(--border2)' }}>
                  <span style={{ flex: '1 1 220px', minWidth: 0, fontSize: '0.85rem', color: 'var(--text)' }}>
                    {m.descripcion || 'Movimiento'}
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>{formatDate(m.fecha)}{m.referencia ? ` · doc. ${m.referencia}` : ''}{sug && !eleccion[m.id] ? ` · sugerido: ${sug.razon}` : ''}</span>
                  </span>
                  <b style={{ fontVariantNumeric: 'tabular-nums', color: m.monto > 0 ? 'var(--success)' : 'var(--danger)', minWidth: 100, textAlign: 'right' }}>{formatCLP(Number(m.monto))}</b>
                  <select className="input" value={valor} onChange={e => setEleccion(x => ({ ...x, [m.id]: e.target.value }))} style={{ flex: '1 1 220px', fontSize: '0.8rem' }}
                    aria-label="A qué corresponde">
                    <option value="">{m.monto > 0 ? '¿Qué cobro es?' : '¿Qué compra es?'}</option>
                    {m.monto > 0
                      ? abiertos.map(c => <option key={c.id} value={c.id}>{c.cliente || 'Sin cliente'}{c.numero_factura ? ` · fact. ${c.numero_factura}` : ''} · saldo {formatCLP(c.saldo)}</option>)
                      : compras.map(c => <option key={c.id} value={c.id}>{c.proveedor}{c.folio ? ` · N° ${c.folio}` : ''} · {formatCLP(c.total)}</option>)}
                  </select>
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-primary btn-xs" disabled={!valor || ocupado === m.id} onClick={() => conciliar(m)} title="Marcar pagado">
                      {ocupado === m.id ? <Loader2 size={12} className="iv-spin" /> : <Check size={12} />} Pagado</button>
                    <button className="btn btn-ghost btn-xs" disabled={ocupado === m.id} onClick={() => ignorar(m)} title="No corresponde a un cobro ni a una compra (comisiones, traspasos…)">
                      <EyeOff size={12} /> Ignorar</button>
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
