'use client';

/**
 * Agregar el traslado a una partida. Dos formas:
 *   · Por comuna (TecApp): se elige la comuna (y, si el técnico sale de otra base, esa base);
 *     la lista de traslados dice cuánto se cobra.
 *   · Por km (el cotizador de antes): km de ida × 2 × $/km + peajes + horas de viaje del equipo,
 *     para lo que no está en la lista. Los valores se recuerdan en este navegador.
 * Entra como una línea de operación con ese valor por visita.
 */

import NumeroInput from '@/components/NumeroInput';
import { useEffect, useState } from 'react';
import { Car, Loader2, Plus } from 'lucide-react';
import { Modal } from './ui';
import { trasladosService, type BaseSalida, type CotizacionTraslado, type Tarifa, type Traslado } from '@/services/fase5';
import { costoTrasladoKm, type TrasladoKm } from '@/lib/cotizador/herramientas';
import { formatCLP } from '@/utils';

export interface TrasladoElegido { descripcion: string; porVisita: number; visitas: number }
const CLAVE_KM = 'innvolt.traslado-km.v1';

export default function TrasladoModal({ costoHora, onCerrar, onAgregar }: {
  /** Costo por hora general (Ajustes): las horas de viaje del equipo, la primera vez. */
  costoHora?: number | null;
  onCerrar: () => void;
  onAgregar: (t: TrasladoElegido) => void;
}) {
  const [modo, setModo] = useState<'comuna' | 'km'>('comuna');
  const [lista, setLista] = useState<{ bases: BaseSalida[]; traslados: Traslado[]; tarifa: Tarifa | null } | null>(null);
  const [comuna, setComuna] = useState('');
  const [base, setBase] = useState('');
  const [visitas, setVisitas] = useState(1);
  const [res, setRes] = useState<CotizacionTraslado | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [destino, setDestino] = useState('');
  const [km, setKm] = useState<TrasladoKm>(() => {
    const b: TrasladoKm = { km: 30, valorKm: 350, peajes: 0, horas: 1, personas: 2, valorHora: Number(costoHora) || 8000 };
    try { return { ...b, ...(JSON.parse(localStorage.getItem(CLAVE_KM) || 'null') || {}), km: b.km, peajes: 0 }; } catch { return b; }
  });

  useEffect(() => {
    trasladosService.todo().then(l => {
      setLista(l);
      // Sin valores propios guardados, el $/km de la tarifa (Comercial → Traslados).
      let guardado = false;
      try { guardado = !!localStorage.getItem(CLAVE_KM); } catch { /* opcional */ }
      if (!guardado && l.tarifa?.valor_por_km) setKm(x => ({ ...x, valorKm: Number(l.tarifa!.valor_por_km) }));
    }).catch(e => setError(e instanceof Error ? e.message : 'Falta la lista de traslados'));
  }, []);
  useEffect(() => {
    setRes(null); setError('');
    if (modo !== 'comuna' || !comuna.trim()) return;
    const t = setTimeout(async () => {
      setOcupado(true);
      try { setRes(await trasladosService.cotizar(comuna, base || null)); }
      catch (e) { setError(e instanceof Error ? e.message : 'No se pudo calcular'); }
      finally { setOcupado(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [comuna, base, modo]);

  const porKm = costoTrasladoKm(km);
  const setK = (patch: Partial<TrasladoKm>) => setKm(x => ({ ...x, ...patch }));
  const listo = modo === 'comuna' ? !!res : porKm > 0;
  const agregar = () => {
    if (modo === 'comuna' && res) {
      onAgregar({ descripcion: `Traslado a ${res.comuna}${res.desde_otra_base ? ` (desde ${res.sale_desde})` : ''}`, porVisita: res.total, visitas });
    } else if (modo === 'km' && porKm > 0) {
      try { localStorage.setItem(CLAVE_KM, JSON.stringify({ valorKm: km.valorKm, horas: km.horas, personas: km.personas, valorHora: km.valorHora })); } catch { /* opcional */ }
      onAgregar({ descripcion: `Traslado${destino.trim() ? ` a ${destino.trim()}` : ''} (${String(km.km).replace('.', ',')} km)`, porVisita: porKm, visitas });
    }
  };

  const comunas = Array.from(new Set((lista?.traslados || []).filter(t => t.activo).map(t => t.comuna))).sort();
  const campo: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
  return (
    <Modal titulo={<><Car size={15} /> Agregar traslado</>} onCerrar={onCerrar} ancho={500} pie={<>
      <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
      <button className="btn btn-primary" disabled={!listo} onClick={agregar}><Plus size={14} /> Agregar a la partida</button>
    </>}>
      <div role="group" aria-label="Cómo se calcula" style={{ display: 'inline-flex', alignSelf: 'flex-start', border: '1px solid var(--border2)', borderRadius: 8, padding: 2 }}>
        {(['comuna', 'km'] as const).map(m => (
          <button key={m} type="button" className="btn btn-xs" aria-pressed={modo === m} onClick={() => setModo(m)}
            style={{ background: modo === m ? 'var(--y-brand)' : 'transparent', color: modo === m ? '#111' : 'var(--muted)' }}>
            {m === 'comuna' ? 'Por comuna' : 'Por km'}</button>
        ))}
      </div>
      {modo === 'comuna' ? (<>
        <label style={campo}><span className="label-muted">Comuna de destino</span>
          <input className="input" list="comunas-traslado" autoFocus value={comuna} onChange={e => setComuna(e.target.value)} placeholder="Rancagua" />
          <datalist id="comunas-traslado">{comunas.map(c => <option key={c} value={c} />)}</datalist></label>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
          <label style={campo}><span className="label-muted">Sale desde</span>
            <select className="input" value={base} onChange={e => setBase(e.target.value)}>
              <option value="">Su base habitual (la más cercana)</option>
              {(lista?.bases || []).filter(b => b.activo).map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
          <label style={campo}><span className="label-muted">Visitas</span><NumeroInput className="input" min={1} value={visitas} onChange={v => setVisitas(Math.max(1, Math.round(v) || 1))} /></label>
        </div>
        {ocupado && <Loader2 size={16} className="iv-spin" />}
        {error && <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.84rem' }}>{error} <button type="button" className="btn btn-ghost btn-xs" onClick={() => setModo('km')}>Calcularlo por km</button></p>}
        {res && (
          <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '0.6rem 0.8rem', fontSize: '0.85rem', color: 'var(--text)' }}>
            <p style={{ margin: 0 }}>{res.comuna}: <b>{formatCLP(res.total)}</b> por visita{visitas > 1 ? ` · ${formatCLP(res.total * visitas)} por ${visitas}` : ''}</p>
            <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '0.78rem' }}>{res.detalle}{res.desde_otra_base ? ` · sale desde ${res.sale_desde} (+ ${formatCLP(res.recargo)} de recargo)` : ` · desde ${res.sale_desde}`}</p>
          </div>
        )}
        <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted)' }}>La lista de comunas, bases y el valor por km se editan en Comercial → Traslados. ¿No está la comuna? Usa «Por km».</p>
      </>) : (<>
        <label style={campo}><span className="label-muted">Destino (opcional, sale en la descripción)</span>
          <input className="input" autoFocus value={destino} maxLength={80} onChange={e => setDestino(e.target.value)} placeholder="Faena Los Bronces" /></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <label style={campo}><span className="label-muted">Km de ida</span><NumeroInput className="input" min={0} decimales={1} value={km.km} onChange={v => setK({ km: v })} /></label>
          <label style={campo}><span className="label-muted">$ por km</span><NumeroInput className="input" prefijo="$" min={0} decimales={0} value={km.valorKm} onChange={v => setK({ valorKm: v })} /></label>
          <label style={campo}><span className="label-muted">Peajes (ida y vuelta)</span><NumeroInput className="input" prefijo="$" min={0} decimales={0} mostrarCero value={km.peajes} onChange={v => setK({ peajes: v })} /></label>
          <label style={campo}><span className="label-muted">Horas de viaje</span><NumeroInput className="input" min={0} decimales={1} mostrarCero value={km.horas} onChange={v => setK({ horas: v })} /></label>
          <label style={campo}><span className="label-muted">Personas</span><NumeroInput className="input" min={0} decimales={0} mostrarCero value={km.personas} onChange={v => setK({ personas: Math.round(v) })} /></label>
          <label style={campo}><span className="label-muted">$ por hora</span><NumeroInput className="input" prefijo="$" min={0} decimales={0} value={km.valorHora} onChange={v => setK({ valorHora: v })} /></label>
        </div>
        <label style={{ ...campo, maxWidth: 140 }}><span className="label-muted">Visitas</span><NumeroInput className="input" min={1} value={visitas} onChange={v => setVisitas(Math.max(1, Math.round(v) || 1))} /></label>
        <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '0.6rem 0.8rem', fontSize: '0.85rem', color: 'var(--text)' }}>
          <p style={{ margin: 0 }}><b>{formatCLP(porKm)}</b> por visita{visitas > 1 ? ` · ${formatCLP(porKm * visitas)} por ${visitas}` : ''}</p>
          <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '0.78rem' }}>
            {String(km.km).replace('.', ',')} km × 2 × {formatCLP(km.valorKm)} + {formatCLP(km.peajes)} de peajes + {String(km.horas).replace('.', ',')} h × {km.personas} × {formatCLP(km.valorHora)}
          </p>
        </div>
      </>)}
    </Modal>
  );
}
