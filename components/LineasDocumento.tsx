'use client';

/**
 * Detalle de una compra o de un gasto (fase 21): lo comprado, línea por línea. Lo trae «Leer con IA»
 * (o se escribe a mano) y se revisa antes de guardar: cada línea va a su partida y a la línea del
 * presupuesto que compra; si no estaba presupuestada queda «no cotizada» (un adicional). Sugiere a
 * qué corresponde cada una comparando palabras, y avisa si las líneas no suman lo del documento.
 * El costo del documento se reparte entre sus líneas en proporción a sus montos.
 */

import { useEffect, useMemo, useState } from 'react';
import { ListPlus, Plus, X } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { cuadreDocumento, sugerirLinea } from '@/lib/anteproyecto';
import { TIPOS_COSTO, type PartidaOpcion } from '@/lib/controlProyecto';
import { anteproyectoService, type LineaAsignable, type LineaDocumentoEdit } from '@/services/anteproyecto';
import { formatCLP } from '@/utils';

let sec = 0;
export const nuevaLineaDocumento = (p: Partial<LineaDocumentoEdit> = {}): LineaDocumentoEdit => ({
  clave: `d${Date.now()}${sec++}`, descripcion: '', cantidad: null, unidad: '', monto: 0, partida_id: undefined, presupuesto_linea_id: undefined, tipo: 'material', ...p,
});

export default function LineasDocumento({ cotId, partidas, partidaPorOmision, lineas, onChange, costo, total }: {
  /** El trabajo del documento. */
  cotId: string;
  partidas: PartidaOpcion[];
  /** La partida del documento: la de las líneas que no se asignan a otra. */
  partidaPorOmision: string | null;
  lineas: LineaDocumentoEdit[];
  onChange: (l: LineaDocumentoEdit[]) => void;
  /** Lo que cuesta el documento (neto de la factura o total de la boleta) y su total con IVA. */
  costo: number; total: number;
}) {
  const [candidatas, setCandidatas] = useState<{ cotId: string; lista: LineaAsignable[] } | null>(null);
  useEffect(() => {
    let vivo = true;
    anteproyectoService.paraAsignar(cotId).catch(() => []).then(lista => { if (vivo) setCandidatas({ cotId, lista }); });
    return () => { vivo = false; };
  }, [cotId]);
  const lista = useMemo(() => (candidatas?.cotId === cotId ? candidatas.lista : []), [candidatas, cotId]);
  const listas = candidatas?.cotId === cotId;

  // Lo que aún no se decidió (recién leído) toma la sugerencia: la línea del presupuesto y su partida.
  useEffect(() => {
    if (!listas || !lineas.some(l => l.presupuesto_linea_id === undefined || l.partida_id === undefined)) return;
    onChange(lineas.map(l => {
      if (l.presupuesto_linea_id !== undefined && l.partida_id !== undefined) return l;
      const id = l.presupuesto_linea_id === undefined ? sugerirLinea(l.descripcion, lista) : l.presupuesto_linea_id;
      const c = lista.find(x => x.id === id);
      return { ...l, presupuesto_linea_id: id ?? null, partida_id: l.partida_id !== undefined ? l.partida_id : c?.partida_id ?? partidaPorOmision, tipo: c?.tipo || l.tipo };
    }));
  }, [lineas, lista, listas, partidaPorOmision, onChange]);

  const opciones = useMemo(() => lista.map(c => {
    const p = partidas.find(x => x.id === c.partida_id);
    return { ...c, etiqueta: `${c.descripcion}${c.unidad ? ` (${c.cantidad} ${c.unidad})` : ''} · ${p ? `${p.numero}. ${p.nombre}` : 'Sin partida'}` };
  }), [lista, partidas]);
  const cambiar = (clave: string, p: Partial<LineaDocumentoEdit>) => onChange(lineas.map(l => (l.clave === clave ? { ...l, ...p } : l)));
  const asignar = (l: LineaDocumentoEdit, id: string) => {
    const c = lista.find(x => x.id === id);
    cambiar(l.clave, { presupuesto_linea_id: id || null, ...(c ? { partida_id: c.partida_id, tipo: c.tipo } : {}) });
  };
  const q = cuadreDocumento(lineas.map(l => l.monto), costo, total);

  if (!lineas.length) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
        onClick={() => onChange([nuevaLineaDocumento({ partida_id: partidaPorOmision, presupuesto_linea_id: null })])}>
        <ListPlus size={13} /> Detallar lo comprado (por partida y material)</button>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0.6rem', borderRadius: 8, background: 'var(--bg3)' }}>
      <span className="label-muted">Detalle de lo comprado: revisa a qué material y partida va cada línea</span>
      {lineas.map(l => (
        <div key={l.clave} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 6, alignItems: 'center', paddingBottom: 6, borderBottom: '1px solid var(--border2)' }}>
          <input className="input" aria-label="Descripción" value={l.descripcion} onChange={e => cambiar(l.clave, { descripcion: e.target.value })}
            placeholder="Cable 6 mm²" style={{ gridColumn: 'span 2' }} />
          <NumeroInput className="input" ariaLabel="Cantidad" value={l.cantidad} onChange={v => cambiar(l.clave, { cantidad: v })} onVacio={() => cambiar(l.clave, { cantidad: null })} decimales={3} placeholder="Cant." />
          <input className="input" aria-label="Unidad" value={l.unidad} onChange={e => cambiar(l.clave, { unidad: e.target.value })} placeholder="m, un…" />
          <NumeroInput className="input" prefijo="$" ariaLabel="Monto" value={l.monto} onChange={v => cambiar(l.clave, { monto: v })} />
          <select className="input" aria-label="Del presupuesto" value={l.presupuesto_linea_id || ''} onChange={e => asignar(l, e.target.value)} style={{ gridColumn: 'span 2' }}>
            <option value="">No cotizado (adicional)</option>
            {opciones.map(c => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
          </select>
          <select className="input" aria-label="Partida" value={l.partida_id || ''} onChange={e => cambiar(l.clave, { partida_id: e.target.value || null })}>
            <option value="">Sin partida</option>
            {partidas.map(p => <option key={p.id} value={p.id}>{p.numero}. {p.nombre}</option>)}
          </select>
          <span style={{ display: 'flex', gap: 4 }}>
            <select className="input" aria-label="Tipo de costo" value={l.tipo} onChange={e => cambiar(l.clave, { tipo: e.target.value })}>
              {TIPOS_COSTO.map(t => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-xs" aria-label="Quitar línea" onClick={() => onChange(lineas.filter(x => x.clave !== l.clave))}><X size={12} /></button>
          </span>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.8rem' }}>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => onChange([...lineas, nuevaLineaDocumento({ partida_id: partidaPorOmision, presupuesto_linea_id: null })])}>
          <Plus size={12} /> Línea</button>
        <span style={{ flex: 1 }} />
        <span style={{ color: q.cuadra ? 'var(--success)' : 'var(--y)' }}>
          Las líneas suman {formatCLP(q.suma)}{q.cuadra ? ' ✓' : ` · el documento: ${formatCLP(costo)}${total !== costo ? ` (con IVA ${formatCLP(total)})` : ''}`}</span>
      </div>
      {!q.cuadra && <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Igual se puede guardar: el costo del documento se reparte entre las líneas en proporción a sus montos.</span>}
    </div>
  );
}
