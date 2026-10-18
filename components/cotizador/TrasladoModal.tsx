'use client';

/**
 * Agregar el traslado a una partida (TecApp): se elige la comuna (y, si el técnico sale de
 * otra base, esa base); la lista de traslados dice cuánto se cobra. Entra como una línea de
 * operación con ese valor.
 */

import { useEffect, useState } from 'react';
import { Car, Loader2, Plus } from 'lucide-react';
import { Modal } from './ui';
import { trasladosService, type BaseSalida, type CotizacionTraslado, type Traslado } from '@/services/fase5';
import { formatCLP } from '@/utils';

export default function TrasladoModal({ onCerrar, onAgregar }: { onCerrar: () => void; onAgregar: (t: CotizacionTraslado, visitas: number) => void }) {
  const [lista, setLista] = useState<{ bases: BaseSalida[]; traslados: Traslado[] } | null>(null);
  const [comuna, setComuna] = useState('');
  const [base, setBase] = useState('');
  const [visitas, setVisitas] = useState(1);
  const [res, setRes] = useState<CotizacionTraslado | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { trasladosService.todo().then(setLista).catch(e => setError(e instanceof Error ? e.message : 'Falta la lista de traslados')); }, []);
  useEffect(() => {
    setRes(null); setError('');
    if (!comuna.trim()) return;
    const t = setTimeout(async () => {
      setOcupado(true);
      try { setRes(await trasladosService.cotizar(comuna, base || null)); }
      catch (e) { setError(e instanceof Error ? e.message : 'No se pudo calcular'); }
      finally { setOcupado(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [comuna, base]);

  const comunas = Array.from(new Set((lista?.traslados || []).filter(t => t.activo).map(t => t.comuna))).sort();
  return (
    <Modal titulo={<><Car size={15} /> Agregar traslado</>} onCerrar={onCerrar} ancho={480} pie={<>
      <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
      <button className="btn btn-primary" disabled={!res} onClick={() => res && onAgregar(res, visitas)}><Plus size={14} /> Agregar a la partida</button>
    </>}>
      <label><span className="label-muted">Comuna de destino</span>
        <input className="input" list="comunas-traslado" autoFocus value={comuna} onChange={e => setComuna(e.target.value)} placeholder="Rancagua" />
        <datalist id="comunas-traslado">{comunas.map(c => <option key={c} value={c} />)}</datalist></label>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
        <label><span className="label-muted">Sale desde</span>
          <select className="input" value={base} onChange={e => setBase(e.target.value)}>
            <option value="">Su base habitual (la más cercana)</option>
            {(lista?.bases || []).filter(b => b.activo).map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
        <label><span className="label-muted">Visitas</span><input className="input" type="number" min={1} value={visitas} onChange={e => setVisitas(Math.max(1, parseInt(e.target.value) || 1))} /></label>
      </div>
      {ocupado && <Loader2 size={16} className="iv-spin" />}
      {error && <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.84rem' }}>{error}</p>}
      {res && (
        <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '0.6rem 0.8rem', fontSize: '0.85rem', color: 'var(--text)' }}>
          <p style={{ margin: 0 }}>{res.comuna}: <b>{formatCLP(res.total)}</b> por visita{visitas > 1 ? ` · ${formatCLP(res.total * visitas)} por ${visitas}` : ''}</p>
          <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '0.78rem' }}>{res.detalle}{res.desde_otra_base ? ` · sale desde ${res.sale_desde} (+ ${formatCLP(res.recargo)} de recargo)` : ` · desde ${res.sale_desde}`}</p>
        </div>
      )}
      <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted)' }}>La lista de comunas, bases y el valor por km se editan en Comercial → Traslados.</p>
    </Modal>
  );
}
