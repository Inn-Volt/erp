'use client';

/**
 * Agregar un traslado a la partida de cargos operacionales: km de ida × 2 × $/km + peajes + horas de
 * viaje del equipo. Entra como una línea de operación con ese valor por visita (se cobra tal cual).
 * Los valores se recuerdan en este navegador. (La lista de traslados por comuna se eliminó: el
 * traslado es un gasto de operación.)
 */

import NumeroInput from '@/components/NumeroInput';
import { useState } from 'react';
import { Car, Plus } from 'lucide-react';
import { Modal } from './ui';
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
  const [visitas, setVisitas] = useState(1);
  const [destino, setDestino] = useState('');
  const [km, setKm] = useState<TrasladoKm>(() => {
    const b: TrasladoKm = { km: 30, valorKm: 350, peajes: 0, horas: 1, personas: 2, valorHora: Number(costoHora) || 8000 };
    try { return { ...b, ...(JSON.parse(localStorage.getItem(CLAVE_KM) || 'null') || {}), km: b.km, peajes: 0 }; } catch { return b; }
  });

  const porKm = costoTrasladoKm(km);
  const setK = (patch: Partial<TrasladoKm>) => setKm(x => ({ ...x, ...patch }));
  const agregar = () => {
    if (!(porKm > 0)) return;
    try { localStorage.setItem(CLAVE_KM, JSON.stringify({ valorKm: km.valorKm, horas: km.horas, personas: km.personas, valorHora: km.valorHora })); } catch { /* opcional */ }
    onAgregar({ descripcion: `Traslado${destino.trim() ? ` a ${destino.trim()}` : ''} (${String(km.km).replace('.', ',')} km)`, porVisita: porKm, visitas });
  };

  const campo: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
  return (
    <Modal titulo={<><Car size={15} /> Agregar traslado</>} onCerrar={onCerrar} ancho={500} pie={<>
      <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
      <button className="btn btn-primary" disabled={!(porKm > 0)} onClick={agregar}><Plus size={14} /> Agregar a la partida</button>
    </>}>
      <label style={campo}><span className="label-muted">Destino (opcional, sale en la descripción)</span>
        <input className="input" autoFocus value={destino} maxLength={80} onChange={e => setDestino(e.target.value)} placeholder="Faena Los Bronces" /></label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 8 }}>
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
    </Modal>
  );
}
