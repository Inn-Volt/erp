'use client';

/**
 * Forma de pago (plan de cobro por hitos, fases 7 y 24): cada cobro es un % del total, un monto fijo
 * en pesos, UF o dólares, o «el resto». Cada hito cae solo en «Por facturar» cuando corresponde (al
 * aprobar o al terminar); uno en UF o dólares pasa a pesos con el valor de ese día.
 * Con `total` (en una cotización) muestra cuánto es cada cobro en pesos hoy.
 */

import { Plus, Trash2 } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { CUANDO_COBRO, type HitoCobro, type TipoHito } from '@/lib/cotizador/tipos';
import { enMonedaExtranjera, montosHitos, planEnPalabras, revisarPlan, sumaPct, tipoHito, TIPOS_HITO } from '@/lib/cotizador/planCobro';
import { useValoresDia } from '@/hooks/useValoresDia';
import { useFase } from '@/lib/fases';
import { formatCLP } from '@/utils';

/** La UF o el dólar con sus decimales: «$41.398,57». */
const valorDia = (v: number) => `$${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(v)}`;

const ATAJOS: { nombre: string; plan: HitoCobro[] }[] = [
  { nombre: '50 / 50', plan: [{ nombre: 'Anticipo', porcentaje: 50, cuando: 'aprobar' }, { nombre: 'Saldo', porcentaje: 50, cuando: 'terminar' }] },
  { nombre: '30 / 70', plan: [{ nombre: 'Anticipo', porcentaje: 30, cuando: 'aprobar' }, { nombre: 'Saldo', porcentaje: 70, cuando: 'terminar' }] },
  { nombre: 'Anticipo fijo + saldo', plan: [{ nombre: 'Anticipo', porcentaje: 0, cuando: 'aprobar', tipo: 'CLP', valor: 0 }, { nombre: 'Saldo', porcentaje: 0, cuando: 'terminar', tipo: 'resto' }] },
  { nombre: 'Todo al terminar', plan: [{ nombre: 'Total', porcentaje: 100, cuando: 'terminar' }] },
  { nombre: 'Todo al aprobar', plan: [{ nombre: 'Total', porcentaje: 100, cuando: 'aprobar' }] },
];

/** El campo del monto según cómo se fija el cobro. */
function Monto({ h, onCambiar }: { h: HitoCobro; onCambiar: (patch: Partial<HitoCobro>) => void }) {
  const t = tipoHito(h);
  if (t === 'resto') return <span style={{ fontSize: '0.8rem', color: 'var(--muted)', alignSelf: 'center' }}>lo que falte</span>;
  if (t === 'pct') return <NumeroInput className="input" sufijo="%" min={0} max={100} mostrarCero value={h.porcentaje} ariaLabel="Porcentaje" onChange={v => onCambiar({ porcentaje: v })} />;
  return (
    <NumeroInput className="input" min={0} mostrarCero value={Number(h.valor) || 0} decimales={t === 'CLP' ? 0 : 2}
      prefijo={t === 'CLP' ? '$' : t === 'USD' ? 'US$' : undefined} sufijo={t === 'UF' ? 'UF' : undefined}
      ariaLabel={t === 'CLP' ? 'Monto en pesos' : t === 'UF' ? 'Monto en UF' : 'Monto en dólares'} onChange={v => onCambiar({ valor: v })} />
  );
}

export default function PlanCobro({ plan, onCambiar, editable = true, total, valorUF }: {
  plan: HitoCobro[]; onCambiar: (p: HitoCobro[]) => void; editable?: boolean;
  /** El total de la cotización (con IVA, en pesos): muestra cuánto es cada cobro. */
  total?: number;
  /** La UF de la cotización: si no llega la del día, para los cobros en UF. */
  valorUF?: number | null;
}) {
  // Sin la fase 24 la base solo crea cobros en %: no se ofrece lo demás.
  const fase24 = useFase(24);
  const conTotal = Number(total) > 0;
  const hoy = useValoresDia(conTotal && plan.some(enMonedaExtranjera));
  const set = (i: number, patch: Partial<HitoCobro>) => onCambiar(plan.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const cambiarTipo = (i: number, tipo: TipoHito) =>
    set(i, tipo === 'pct' ? { tipo: undefined, valor: undefined } : { tipo, porcentaje: 0, valor: tipo === 'resto' ? undefined : Number(plan[i].valor) || 0 });
  const agregar = () => {
    const soloPct = plan.every(h => tipoHito(h) === 'pct');
    const nuevo: HitoCobro = soloPct
      ? { nombre: `Cuota ${plan.length + 1}`, porcentaje: Math.max(0, 100 - sumaPct(plan)), cuando: 'terminar' }
      : { nombre: `Cuota ${plan.length + 1}`, porcentaje: 0, cuando: 'terminar', tipo: 'CLP', valor: 0 };
    // Antes de «el resto», que queda al final.
    const iResto = plan.findIndex(h => tipoHito(h) === 'resto');
    onCambiar(iResto >= 0 ? [...plan.slice(0, iResto), nuevo, ...plan.slice(iResto)] : [...plan, nuevo]);
  };

  if (!editable) {
    return <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)' }}>{planEnPalabras(plan) || 'Sin plan de cobro'}</p>;
  }
  const problema = revisarPlan(plan);
  const valores = { uf: hoy?.uf ?? (Number(valorUF) || null), usd: hoy?.usd ?? null };
  const montos = conTotal && !problema ? montosHitos(Number(total), plan, valores) : [];
  const usa = (t: TipoHito) => plan.some(h => tipoHito(h) === t);
  const faltaValor = (usa('UF') && !valores.uf) || (usa('USD') && !valores.usd);
  const pasaTotal = montos.length > 0 && montos.filter(h => tipoHito(h) !== 'resto').reduce((s, h) => s + h.monto, 0) > Math.round(Number(total));
  const conValores = [usa('UF') && valores.uf ? `UF ${valorDia(valores.uf)}` : '', usa('USD') && valores.usd ? `dólar ${valorDia(valores.usd)}` : ''].filter(Boolean).join(', ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ATAJOS.filter(a => fase24 || a.plan.every(h => tipoHito(h) === 'pct')).map(a => (
          <button key={a.nombre} type="button" className="btn btn-ghost btn-xs" onClick={() => onCambiar(a.plan.map(h => ({ ...h })))}>{a.nombre}</button>
        ))}
      </div>
      {plan.map((h, i) => (
        <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'stretch', paddingBottom: 6, borderBottom: '1px dashed var(--border2)' }}>
          <input className="input" style={{ flex: '1 1 130px', minWidth: 0 }} value={h.nombre} maxLength={40} aria-label="Nombre del cobro" placeholder="Anticipo"
            onChange={e => set(i, { nombre: e.target.value })} />
          <div style={{ display: 'flex', gap: 6, flex: '1 1 190px', minWidth: 0 }}>
            <select className="input" style={{ flex: '0 0 96px' }} value={tipoHito(h)} aria-label="Cómo se fija el cobro"
              onChange={e => cambiarTipo(i, e.target.value as TipoHito)}>
              {TIPOS_HITO.filter(t => fase24 || t.clave === 'pct' || t.clave === tipoHito(h)).map(t => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
            </select>
            <div style={{ flex: 1, minWidth: 0, display: 'flex' }}><Monto h={h} onCambiar={p => set(i, p)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 6, flex: '1 1 190px', minWidth: 0 }}>
            <select className="input" style={{ flex: 1, minWidth: 0 }} value={h.cuando} aria-label="Cuándo se cobra"
              onChange={e => set(i, { cuando: e.target.value as HitoCobro['cuando'] })}>
              {(Object.keys(CUANDO_COBRO) as HitoCobro['cuando'][]).map(k => <option key={k} value={k}>{CUANDO_COBRO[k]}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-xs" aria-label="Quitar cobro" disabled={plan.length === 1}
              onClick={() => onCambiar(plan.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {plan.length < 6 && <button type="button" className="btn btn-ghost btn-xs" onClick={agregar}><Plus size={12} /> Cobro</button>}
        <span style={{ fontSize: '0.78rem', color: problema ? 'var(--danger)' : 'var(--muted)', fontWeight: problema ? 700 : 400 }}>
          {problema ?? `El cliente lee: «${planEnPalabras(plan)}».`}
        </span>
      </div>
      {montos.length > 0 && (
        <span style={{ fontSize: '0.78rem', color: pasaTotal ? 'var(--danger)' : 'var(--muted)' }}>
          {pasaTotal ? 'Los montos fijos pasan el total de la cotización. ' : 'Hoy son: '}
          {montos.filter(h => h.monto > 0 || tipoHito(h) === 'resto').map(h => `${h.nombre} ${formatCLP(h.monto)}`).join(' · ')}
          {faltaValor ? ' (falta el valor de la UF o del dólar de hoy para pasarlos a pesos)'
            : conValores ? ` (con ${conValores}; al cobrar se usa el valor de ese día)` : ''}
        </span>
      )}
    </div>
  );
}
