'use client';

/**
 * Calculadora de traslado (traído de TecApp): cobra el viaje a obra como un ítem
 * de operación. Km de ida × 2 × $/km + peajes + horas de viaje del equipo.
 * Los valores por defecto ($/km, $/hora) se recuerdan en este navegador.
 */

import { useEffect, useState } from 'react';
import { Car, Check, X } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { formatCLP } from '@/utils';

const CLAVE = 'innvolt.traslado.v1';
interface Valores { km: number; viajes: number; valorKm: number; peajes: number; horas: number; personas: number; valorHora: number; destino: string }
const BASE: Valores = { km: 30, viajes: 1, valorKm: 350, peajes: 0, horas: 1, personas: 2, valorHora: 8000, destino: '' };

export function costoTraslado(v: Valores) {
  const porViaje = v.km * 2 * v.valorKm + v.peajes + v.horas * v.personas * v.valorHora;
  return { porViaje: Math.round(porViaje), total: Math.round(porViaje * Math.max(1, v.viajes)) };
}

export default function CalculadoraTraslado({ onConfirm, onClose }: {
  /** costo por viaje (CLP), cantidad de viajes y descripción para el ítem. */
  onConfirm: (costoPorViaje: number, viajes: number, descripcion: string) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState<Valores>(BASE);
  useEffect(() => {
    try { const g = JSON.parse(localStorage.getItem(CLAVE) || 'null'); if (g) setV(x => ({ ...x, valorKm: g.valorKm ?? x.valorKm, valorHora: g.valorHora ?? x.valorHora, personas: g.personas ?? x.personas })); }
    catch { /* sin almacenamiento: valores base */ }
  }, []);
  const set = (p: Partial<Valores>) => setV(x => ({ ...x, ...p }));
  const { porViaje, total } = costoTraslado(v);

  const confirmar = () => {
    try { localStorage.setItem(CLAVE, JSON.stringify({ valorKm: v.valorKm, valorHora: v.valorHora, personas: v.personas })); } catch { /* opcional */ }
    const destino = v.destino.trim() ? ` a ${v.destino.trim()}` : '';
    const desc = `Traslado${destino}: ${v.km} km ida (${v.km * 2} km ida y vuelta)${v.peajes ? ', peajes' : ''}${v.horas ? `, ${v.horas} h de viaje × ${v.personas} pers.` : ''}`;
    onConfirm(porViaje, Math.max(1, v.viajes), desc);
  };

  const lbl = { display: 'block', marginBottom: 6, fontSize: '0.72rem' } as const;
  const num = (k: keyof Valores, paso = 1) => (
    <input className="input" type="number" min={0} step={paso} value={v[k] as number} onChange={e => set({ [k]: Number(e.target.value) || 0 })} />
  );

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 200 }}>
      <div className="modal-box" style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.4rem', borderBottom: '1px solid var(--border2)' }}>
          <span className="section-label" style={{ margin: 0 }}><Car size={13} /> Traslado a obra</span>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '1.1rem 1.4rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><label className="label-muted" style={lbl}>Destino (opcional)</label>
            <input className="input" value={v.destino} onChange={e => set({ destino: e.target.value })} placeholder="Rancagua" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label-muted" style={lbl}>Km de ida</label>{num('km')}</div>
            <div><label className="label-muted" style={lbl}>Viajes / visitas</label>{num('viajes')}</div>
            <div><label className="label-muted" style={lbl}>Costo por km</label><NumeroInput className="input" prefijo="$" value={v.valorKm} onChange={x => set({ valorKm: x })} /></div>
            <div><label className="label-muted" style={lbl}>Peajes por viaje (ida y vuelta)</label><NumeroInput className="input" prefijo="$" value={v.peajes} onChange={x => set({ peajes: x })} /></div>
            <div><label className="label-muted" style={lbl}>Horas de viaje por visita</label>{num('horas', 0.5)}</div>
            <div><label className="label-muted" style={lbl}>Personas</label>{num('personas')}</div>
            <div style={{ gridColumn: '1 / -1' }}><label className="label-muted" style={lbl}>Costo hora de viaje (por persona)</label><NumeroInput className="input" prefijo="$" value={v.valorHora} onChange={x => set({ valorHora: x })} /></div>
          </div>
          <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r-sm)', padding: '0.7rem 0.9rem', fontSize: '0.8rem', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span>Combustible y desgaste: {formatCLP(v.km * 2 * v.valorKm)} · Peajes: {formatCLP(v.peajes)} · Horas: {formatCLP(v.horas * v.personas * v.valorHora)}</span>
            <span style={{ color: 'var(--text)' }}>Costo por viaje <b>{formatCLP(porViaje)}</b> · Total {v.viajes} viaje{v.viajes === 1 ? '' : 's'} <b style={{ color: 'var(--y)' }}>{formatCLP(total)}</b></span>
            <span style={{ fontSize: '0.72rem' }}>Se agrega como ítem de operación (costo). El margen e IVA se aplican como al resto.</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0.9rem 1.4rem', borderTop: '1px solid var(--border2)' }}>
          <button onClick={onClose} className="btn btn-ghost">Cancelar</button>
          <button onClick={confirmar} className="btn btn-primary" disabled={!(porViaje > 0)}><Check size={14} /> Agregar traslado</button>
        </div>
      </div>
    </div>
  );
}
