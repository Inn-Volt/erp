'use client';

/**
 * Plan de cobro por hitos (fase 7): «Anticipo 50 % al aprobar · Saldo 50 % al terminar».
 * Cada hito cae solo en «Por facturar» cuando corresponde. Los porcentajes suman 100.
 */

import { Plus, Trash2 } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { CUANDO_COBRO, planEnPalabras, type HitoCobro } from '@/lib/cotizador/tipos';

const ATAJOS: { nombre: string; plan: HitoCobro[] }[] = [
  { nombre: '50 / 50', plan: [{ nombre: 'Anticipo', porcentaje: 50, cuando: 'aprobar' }, { nombre: 'Saldo', porcentaje: 50, cuando: 'terminar' }] },
  { nombre: '30 / 70', plan: [{ nombre: 'Anticipo', porcentaje: 30, cuando: 'aprobar' }, { nombre: 'Saldo', porcentaje: 70, cuando: 'terminar' }] },
  { nombre: 'Todo al terminar', plan: [{ nombre: 'Total', porcentaje: 100, cuando: 'terminar' }] },
  { nombre: 'Todo al aprobar', plan: [{ nombre: 'Total', porcentaje: 100, cuando: 'aprobar' }] },
];

export const sumaPlan = (plan: HitoCobro[]) => Math.round(plan.reduce((s, h) => s + (Number(h.porcentaje) || 0), 0) * 100) / 100;

export default function PlanCobro({ plan, onCambiar, editable = true }: {
  plan: HitoCobro[]; onCambiar: (p: HitoCobro[]) => void; editable?: boolean;
}) {
  const suma = sumaPlan(plan);
  const set = (i: number, patch: Partial<HitoCobro>) => onCambiar(plan.map((h, j) => (j === i ? { ...h, ...patch } : h)));

  if (!editable) {
    return <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)' }}>{planEnPalabras(plan) || 'Sin plan de cobro'}</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ATAJOS.map(a => (
          <button key={a.nombre} type="button" className="btn btn-ghost btn-xs" onClick={() => onCambiar(a.plan.map(h => ({ ...h })))}>{a.nombre}</button>
        ))}
      </div>
      {plan.map((h, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 90px minmax(150px, 1fr) 32px', gap: 6, alignItems: 'center' }}>
          <input className="input" value={h.nombre} maxLength={40} aria-label="Nombre del cobro" placeholder="Anticipo" onChange={e => set(i, { nombre: e.target.value })} />
          <NumeroInput className="input" sufijo="%" min={0} max={100} mostrarCero value={h.porcentaje} ariaLabel="Porcentaje" onChange={v => set(i, { porcentaje: v })} />
          <select className="input" value={h.cuando} aria-label="Cuándo se cobra" onChange={e => set(i, { cuando: e.target.value as HitoCobro['cuando'] })}>
            {(Object.keys(CUANDO_COBRO) as HitoCobro['cuando'][]).map(k => <option key={k} value={k}>{CUANDO_COBRO[k]}</option>)}
          </select>
          <button type="button" className="btn btn-ghost btn-xs" aria-label="Quitar cobro" disabled={plan.length === 1} onClick={() => onCambiar(plan.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {plan.length < 6 && <button type="button" className="btn btn-ghost btn-xs" onClick={() => onCambiar([...plan, { nombre: `Cuota ${plan.length + 1}`, porcentaje: Math.max(0, 100 - suma), cuando: 'terminar' }])}><Plus size={12} /> Cobro</button>}
        <span style={{ fontSize: '0.78rem', color: suma === 100 ? 'var(--muted)' : 'var(--danger)', fontWeight: suma === 100 ? 400 : 700 }}>
          {suma === 100 ? `El cliente lee: «${planEnPalabras(plan)}».` : `Los porcentajes suman ${String(suma).replace('.', ',')} %: tienen que sumar 100 %.`}
        </span>
      </div>
    </div>
  );
}
