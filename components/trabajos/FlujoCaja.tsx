'use client';

/**
 * Flujo de caja semanal del trabajo (fase 20): plan vs real.
 *   · Plan: los cobros del plan de cobro en su semana (redondeo por acumulado, como en Por facturar)
 *     y lo presupuestado de cada partida (el anteproyecto; sin él, lo cotizado) repartido por semana.
 *   · Real: lo cobrado en su fecha de pago; gastos y horas en su fecha; compras en su fecha de pago
 *     si están pagadas (si no, en la del documento).
 *   · La semana 1 recibe todo lo anterior al inicio; «Posterior», lo que cae después de la última.
 * Quien edita cotizaciones cambia el inicio, las semanas, la semana de cada cobro y la matriz
 * partida × semana (cada partida debe sumar 100 %). Se guarda en cotizaciones.flujo_plan.
 * Ingresos con IVA (lo que paga el cliente) y egresos a costo (con factura, el neto).
 */

import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Loader2, RotateCcw, Save } from 'lucide-react';
import {
  ajustarSemanas, distribucionInvalida, etiquetaPartida, flujoSemanal, montosHitos, presupuestoPorPartida, sumaPct, SEMANAS_MAX, SIN_PARTIDA,
  type CobroCP, type FlujoPlan, type Movimiento, type Presupuesto, type PresupuestoEjecucion,
} from '@/lib/controlProyecto';
import type { HitoCobro } from '@/lib/cotizador/tipos';
import { useToast } from '@/hooks/useToast';
import { formatCLP, formatDate } from '@/utils';

// Colores de las dos series (validados para daltonismo en claro y oscuro): plan azul (punteado), real naranjo.
const SERIES = { claro: { plan: '#2a78d6', real: '#eb6834', grilla: '#e7e3d9', eje: '#77705f' }, oscuro: { plan: '#3987e5', real: '#d95926', grilla: '#38352d', eje: '#a39d8e' } };
function useOscuro() {
  const [oscuro, setOscuro] = useState(false);
  useEffect(() => {
    const ver = () => setOscuro(document.documentElement.classList.contains('dark'));
    ver();
    const obs = new MutationObserver(ver);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return oscuro;
}
const millones = (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1).replace('.', ',')} M` : `$${Math.round(v / 1000)} mil`);
const num: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const pctTxt = (v: number) => String(v).replace('.', ',');

export default function FlujoCaja({ plan, planPorOmision, guardado, presupuesto, ejecucion, planCobro, totalCotizacion, cobros, movimientos, puedeEditar, onGuardar }: {
  plan: FlujoPlan; planPorOmision: FlujoPlan; guardado: boolean; presupuesto: Presupuesto;
  /** El anteproyecto (fase 21): de él sale el egreso plan; sin él, de lo cotizado. */
  ejecucion: PresupuestoEjecucion | null; planCobro: HitoCobro[];
  totalCotizacion: number; cobros: CobroCP[]; movimientos: Movimiento[]; puedeEditar: boolean; onGuardar: (p: FlujoPlan) => Promise<void>;
}) {
  const { success, error: toastError } = useToast();
  const oscuro = useOscuro();
  const col = oscuro ? SERIES.oscuro : SERIES.claro;
  const [borrador, setBorrador] = useState<FlujoPlan>(plan);
  const [guardando, setGuardando] = useState(false);
  const cambiado = JSON.stringify(borrador) !== JSON.stringify(plan);

  const filas = useMemo(() => flujoSemanal({ plan: borrador, presupuesto, planCobro, totalCotizacion, cobros, movimientos, ejecucion }),
    [borrador, presupuesto, planCobro, totalCotizacion, cobros, movimientos, ejecucion]);
  // Las partidas con algo presupuestado: cada una debe repartir el 100 % en las semanas.
  const costos = useMemo(() => presupuestoPorPartida(presupuesto, ejecucion), [presupuesto, ejecucion]);
  const conCosto = [...presupuesto.partidas, presupuesto.sinPartida].map(p => ({ ...p, costo: costos.get(p.id) || 0 })).filter(p => p.costo > 0);
  const invalidas = new Set(distribucionInvalida(borrador, costos).map(x => x.id));
  const hitos = montosHitos(totalCotizacion, planCobro).filter(h => h.monto);
  const semanas = Array.from({ length: borrador.semanas }, (_, i) => i + 1);

  const ponPct = (id: string, i: number, v: string) => {
    const n = Number(v.replace(',', '.'));
    setBorrador(b => ({ ...b, distribucion: { ...b.distribucion, [id]: (b.distribucion[id] || []).map((x, k) => (k === i ? (Number.isFinite(n) ? Math.max(0, n) : 0) : x)) } }));
  };
  const guardar = async () => {
    if (invalidas.size) { toastError('Cada partida debe sumar 100 % (las marcadas en rojo).'); return; }
    setGuardando(true);
    try { await onGuardar(borrador); success('Plan del flujo guardado'); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar el plan'); }
    finally { setGuardando(false); }
  };

  const datosGrafico = filas.map(f => ({ semana: f.semana ? `S${f.semana}` : 'Post.', plan: f.acumPlan, real: f.acumReal }));
  const ultimo = datosGrafico.length - 1;
  const etiquetaFin = (serie: 'plan' | 'real', color: string) => function Etiqueta(p: { x?: number | string; y?: number | string; index?: number }) {
    if (p.index !== ultimo || p.x === undefined || p.y === undefined) return <g />;
    return <text x={Number(p.x) + 6} y={Number(p.y) + 4} fontSize={11} fill={col.eje} style={{ fontWeight: 600 }}>
      <tspan fill={color}>●</tspan> {serie === 'plan' ? 'Plan' : 'Real'}</text>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {puedeEditar && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span className="label-muted">Inicio</span>
            <input className="input" type="date" value={borrador.inicio} onChange={e => e.target.value && setBorrador(b => ({ ...b, inicio: e.target.value }))} style={{ width: 160 }} /></label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span className="label-muted">Semanas</span>
            <input className="input" type="number" min={1} max={SEMANAS_MAX} value={borrador.semanas} style={{ width: 90 }}
              onChange={e => setBorrador(b => ajustarSemanas(b, Number(e.target.value) || 1))} /></label>
          {hitos.map(h => (
            <label key={h.nombre} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="label-muted">{h.nombre} ({formatCLP(h.monto)})</span>
              <select className="input" value={borrador.hitos[h.nombre] || 1} style={{ width: 130 }}
                onChange={e => setBorrador(b => ({ ...b, hitos: { ...b.hitos, [h.nombre]: Number(e.target.value) } }))}>
                {semanas.map(s => <option key={s} value={s}>Semana {s}</option>)}
              </select></label>
          ))}
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={() => setBorrador(planPorOmision)} title="Volver al plan por omisión"><RotateCcw size={13} /> Por omisión</button>
          <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando || !cambiado}>
            {guardando ? <Loader2 size={13} className="iv-spin" /> : <Save size={13} />} Guardar plan</button>
        </div>
      )}
      {!guardado && !cambiado && (
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>
          Plan por omisión (sin guardar): {borrador.semanas} semanas desde el {formatDate(borrador.inicio)}; partidas solo de materiales en la semana 1, el resto parejo;
          los cobros «al aprobar» en la semana 1 y «al terminar» en la última.</p>
      )}

      <div style={{ width: '100%', height: 230 }} role="img" aria-label="Flujo de caja acumulado: plan vs real por semana">
        <ResponsiveContainer>
          <LineChart data={datosGrafico} margin={{ top: 8, right: 56, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={col.grilla} vertical={false} />
            <XAxis dataKey="semana" tick={{ fontSize: 11, fill: col.eje }} axisLine={{ stroke: col.grilla }} tickLine={false} />
            <YAxis tickFormatter={millones} tick={{ fontSize: 11, fill: col.eje }} axisLine={false} tickLine={false} width={64} />
            <Tooltip formatter={(v: number, n: string) => [formatCLP(Number(v)), n === 'plan' ? 'Acumulado plan' : 'Acumulado real']}
              contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }}
              labelStyle={{ color: 'var(--muted)' }} cursor={{ stroke: col.eje, strokeDasharray: '3 3' }} />
            <Legend formatter={(n: string) => <span style={{ color: 'var(--text)', fontSize: 12 }}>{n === 'plan' ? 'Acumulado plan' : 'Acumulado real'}</span>} />
            <Line type="monotone" dataKey="plan" stroke={col.plan} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 4, strokeWidth: 2, fill: col.plan }}
              activeDot={{ r: 5 }} label={etiquetaFin('plan', col.plan)} isAnimationActive={false} />
            <Line type="monotone" dataKey="real" stroke={col.real} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: col.real }}
              activeDot={{ r: 5 }} label={etiquetaFin('real', col.real)} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="iv-table" style={{ fontSize: '0.78rem', width: '100%' }}>
          <thead><tr>
            <th>Semana</th><th>Desde</th><th>Hasta</th><th style={num}>Ingreso plan</th><th style={num}>Egreso plan</th><th style={num}>Neto plan</th>
            <th style={num}>Acum. plan</th><th style={num}>Ingreso real</th><th style={num}>Egreso real</th><th style={num}>Neto real</th>
            <th style={num}>Acum. real</th><th style={num}>Desv. egreso</th>
          </tr></thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.semana}>
                <td style={{ whiteSpace: 'nowrap' }}>{f.nombre}</td>
                <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>{f.semana === 1 ? `hasta ${formatDate(f.hasta)}` : formatDate(f.desde)}</td>
                <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>{f.semana === 1 ? '' : f.hasta ? formatDate(f.hasta) : 'en adelante'}</td>
                <td style={num}>{formatCLP(f.ingresoPlan)}</td><td style={num}>{formatCLP(f.egresoPlan)}</td>
                <td style={{ ...num, color: f.netoPlan < 0 ? 'var(--danger)' : undefined }}>{formatCLP(f.netoPlan)}</td>
                <td style={{ ...num, fontWeight: 600, color: f.acumPlan < 0 ? 'var(--danger)' : undefined }}>{formatCLP(f.acumPlan)}</td>
                <td style={num}>{formatCLP(f.ingresoReal)}</td><td style={num}>{formatCLP(f.egresoReal)}</td>
                <td style={{ ...num, color: f.netoReal < 0 ? 'var(--danger)' : undefined }}>{formatCLP(f.netoReal)}</td>
                <td style={{ ...num, fontWeight: 600, color: f.acumReal < 0 ? 'var(--danger)' : undefined }}>{formatCLP(f.acumReal)}</td>
                <td style={{ ...num, color: f.desvEgreso > 0 ? 'var(--danger)' : 'var(--muted)' }}>{f.desvEgreso > 0 ? '+' : ''}{formatCLP(f.desvEgreso)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <p className="label-muted" style={{ margin: '0 0 6px' }}>Cuánto se gasta de cada partida por semana (%)</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="iv-table" style={{ fontSize: '0.78rem' }}>
            <thead><tr><th>Partida</th><th style={num}>Costo</th>{semanas.map(s => <th key={s} style={num}>S{s}</th>)}<th style={num}>Suma</th></tr></thead>
            <tbody>
              {conCosto.map(p => {
                const arr = borrador.distribucion[p.id] || [];
                const mal = invalidas.has(p.id);
                return (
                  <tr key={p.id || 'sin'}>
                    <td style={{ minWidth: 150 }}>{p.id === SIN_PARTIDA ? 'Sin partida' : etiquetaPartida(p)}</td>
                    <td style={num}>{formatCLP(p.costo)}</td>
                    {semanas.map((s, i) => (
                      <td key={s} style={{ padding: '2px 4px' }}>
                        {puedeEditar
                          ? <input className="input" inputMode="decimal" aria-label={`${p.nombre}, semana ${s}`} value={pctTxt(arr[i] ?? 0)}
                              onChange={e => ponPct(p.id, i, e.target.value)} style={{ width: 62, textAlign: 'right', padding: '0.25rem 0.4rem' }} />
                          : <span style={{ display: 'block', ...num }}>{pctTxt(arr[i] ?? 0)}</span>}
                      </td>
                    ))}
                    <td style={{ ...num, fontWeight: 700, color: mal ? 'var(--danger)' : 'var(--success)' }}>{pctTxt(sumaPct(arr))} %</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {invalidas.size > 0 && <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--danger)' }}>Cada partida debe sumar 100 %.</p>}
      </div>
      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>
        Ingresos = lo que paga el cliente (con IVA); egresos = costo (con factura, el neto). La semana 1 incluye lo anterior al inicio.</p>
    </div>
  );
}
