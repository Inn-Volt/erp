'use client';

/**
 * Cotizaciones → Utilidad: cuánta utilidad poner en cada cotización para que a InnVolt le
 * quede plata.
 *   1. Gastos fijos del mes (lo que hay que pagar aunque no se venda nada).
 *   2. Cuánto se vende al mes (sugerido con las cotizaciones aprobadas de los últimos 6 meses).
 *   3. La ganancia que se quiere.
 *   → Utilidad mínima = gastos fijos ÷ ventas + ganancia. Con una calculadora de precio.
 * La utilidad por omisión de lo nuevo (por tipo) se guarda aquí y la usa el cotizador.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calculator, Loader2, Plus, Save, Trash2, TrendingUp } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import NumeroInput from '@/components/NumeroInput';
import { supabase } from '@/lib/supabase';
import { ajustesService, faltaFase4 } from '@/services/cotizador';
import { useToast } from '@/hooks/useToast';
import {
  GASTOS_SUGERIDOS, imprevistosPorOmision, precioConUtilidad, recomendacion, TIPOS, TIPOS_CON_IMPREVISTOS, TOPE_IMPREVISTOS, utilidadesDe,
  type EstructuraCostos, type GastoFijo, type ImprevistosPorTipo,
} from '@/lib/cotizador/utilidad';
import type { CategoriaItem } from '@/types';
import { formatCLP } from '@/utils';

const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('es-CL', { maximumFractionDigits: 1 })} %`);
const restarMeses = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString(); };

export default function UtilidadPage() {
  const { success, error: toastError } = useToast();
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState<null | 'fase4' | 'fase13'>(null);
  const [guardando, setGuardando] = useState(false);
  const [e, setE] = useState<EstructuraCostos>({ gastos: GASTOS_SUGERIDOS.map(nombre => ({ nombre, monto: 0 })), ventas_mensuales: 0, ganancia_deseada: 10 });
  const [porTipo, setPorTipo] = useState<Record<CategoriaItem, number>>(utilidadesDe(null));
  // Fase 18: imprevistos con que entra lo nuevo (null: la fase aún no está en la base).
  const [imprevistos, setImprevistos] = useState<ImprevistosPorTipo | null>(null);
  const [ventasSugeridas, setVentasSugeridas] = useState<{ promedio: number; cuantas: number } | null>(null);
  const [costoPrueba, setCostoPrueba] = useState<number>(60000);

  useEffect(() => {
    ajustesService.get().then(aj => {
      if (!('utilidad_por_tipo' in aj)) setFalta('fase13');
      const g = aj.estructura_costos || {};
      if (g.gastos?.length || g.ventas_mensuales) {
        setE({ gastos: g.gastos?.length ? g.gastos : e.gastos, ventas_mensuales: Number(g.ventas_mensuales) || 0, ganancia_deseada: Number(g.ganancia_deseada ?? 10) });
      }
      setPorTipo(utilidadesDe(aj.utilidad_por_tipo));
      if ('imprevistos_por_tipo' in aj) setImprevistos(aj.imprevistos_por_tipo || {});
    }).catch(err => { if (faltaFase4(err)) setFalta('fase4'); else toastError(err instanceof Error ? err.message : 'No se pudo cargar'); })
      .finally(() => setCargando(false));
    // Lo que se vendió: cotizaciones aprobadas de los últimos 6 meses (neto).
    supabase.from('cotizaciones').select('subtotal, total_clp, moneda, aceptada_at').eq('estado', 'Aprobada').gte('aceptada_at', restarMeses(6))
      .then(({ data, error }) => {
        if (error || !data) return;
        const neto = (data as { subtotal: number | null; total_clp: number | null; moneda: string | null }[])
          .reduce((s, c) => s + (c.moneda === 'UF' ? (Number(c.total_clp) || 0) / 1.19 : Number(c.subtotal) || 0), 0);
        setVentasSugeridas({ promedio: Math.round(neto / 6), cuantas: data.length });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const r = useMemo(() => recomendacion(e), [e]);
  const usada = r.recomendada ?? porTipo.material;
  const precio = precioConUtilidad(costoPrueba || 0, usada);
  const setGasto = (i: number, patch: Partial<GastoFijo>) => setE(x => ({ ...x, gastos: x.gastos.map((g, j) => (j === i ? { ...g, ...patch } : g)) }));

  const guardar = async () => {
    setGuardando(true);
    try {
      await ajustesService.guardar({
        estructura_costos: { ...e, gastos: e.gastos.filter(g => g.nombre.trim()).map(g => ({ nombre: g.nombre.trim(), monto: Number(g.monto) || 0 })) },
        utilidad_por_tipo: porTipo,
        ...(imprevistos ? { imprevistos_por_tipo: Object.fromEntries(TIPOS_CON_IMPREVISTOS.map(t => [t.clave, imprevistosPorOmision(imprevistos, t.clave)]).filter(([, v]) => Number(v) > 0)) } : {}),
      });
      success('Guardado: lo nuevo de las cotizaciones entra con estas utilidades');
    } catch (err) {
      const m = err instanceof Error ? err.message : '';
      toastError(/estructura_costos|utilidad_por_tipo|schema cache/i.test(m) ? 'Falta ejecutar supabase_fase13_utilidad.sql en Supabase.' : m || 'No se pudo guardar');
    } finally { setGuardando(false); }
  };

  if (falta === 'fase4') return <div className="anim-in"><PageHeader eyebrow="Comercial" title="Utilidad" /><FaltaSQL archivo="supabase_fase4_cotizador_tecapp.sql" /></div>;
  if (cargando) return <div className="anim-in"><PageHeader eyebrow="Comercial" title="Utilidad" /><div className="skeleton" style={{ height: 300, borderRadius: 12 }} /></div>;

  const tarjeta: React.CSSProperties = { padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 };
  return (
    <div className="anim-in" style={{ maxWidth: 1100 }}>
      <PageHeader eyebrow="Comercial" title="Utilidad"
        subtitle="Cuánta utilidad poner en cada cotización para pagar los gastos de InnVolt y que quede ganancia."
        actions={<Link href="/cotizador/ajustes" className="btn btn-ghost btn-sm"><ArrowLeft size={13} /> Ajustes</Link>} />
      {falta === 'fase13' && <div style={{ marginBottom: 12 }}><FaltaSQL archivo="supabase_fase13_utilidad.sql" /></div>}

      <div className="panel-y" style={{ ...tarjeta, marginBottom: 12, fontSize: '0.86rem', color: 'var(--text)' }}>
        <b>Utilidad = de lo que paga el cliente (neto), qué parte queda para InnVolt.</b>
        <span style={{ color: 'var(--muted)' }}>
          Ejemplo: una HH con costo $60.000 y 30 % de utilidad se vende en $85.714: de esos $85.714, $25.714 (el 30 %) quedan para InnVolt.
          Ojo: «sumarle 30 % al costo» ($78.000) deja en verdad solo un 23 %.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 12, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 1. Gastos fijos */}
          <div className="panel-y" style={tarjeta}>
            <p className="section-label" style={{ margin: 0 }}>1 · Gastos fijos del mes</p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>
              Lo que hay que pagar cada mes aunque no se venda nada. Si el sueldo de un técnico ya lo cobras como mano de obra en las cotizaciones (HH), no lo pongas aquí: se contaría dos veces.
            </p>
            {e.gastos.map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input className="input" style={{ flex: 1, minWidth: 0 }} value={g.nombre} onChange={ev => setGasto(i, { nombre: ev.target.value })} placeholder="Concepto" aria-label="Concepto" />
                <div style={{ width: 150 }}>
                  <NumeroInput className="input" value={g.monto || null} prefijo="$" onChange={v => setGasto(i, { monto: v ?? 0 })} onVacio={() => setGasto(i, { monto: 0 })} ariaLabel={`Monto de ${g.nombre}`} />
                </div>
                <button type="button" className="btn btn-ghost btn-xs" aria-label="Quitar" onClick={() => setE(x => ({ ...x, gastos: x.gastos.filter((_, j) => j !== i) }))}><Trash2 size={12} /></button>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setE(x => ({ ...x, gastos: [...x.gastos, { nombre: '', monto: 0 }] }))}><Plus size={13} /> Otro gasto</button>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: '0.9rem', color: 'var(--text)' }}>Total: <b>{formatCLP(r.gastos)}</b> / mes</span>
            </div>
          </div>

          {/* 2. Ventas y 3. ganancia */}
          <div className="panel-y" style={tarjeta}>
            <p className="section-label" style={{ margin: 0 }}>2 · Cuánto vende InnVolt al mes</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: 200 }}>
                <NumeroInput className="input" value={e.ventas_mensuales || null} prefijo="$" onChange={v => setE(x => ({ ...x, ventas_mensuales: v ?? 0 }))} onVacio={() => setE(x => ({ ...x, ventas_mensuales: 0 }))} ariaLabel="Ventas del mes" />
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>neto, sin IVA, promedio de un mes normal</span>
            </div>
            {ventasSugeridas && ventasSugeridas.cuantas > 0 && (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
                Según las {ventasSugeridas.cuantas} cotizaciones aprobadas de los últimos 6 meses: <b style={{ color: 'var(--text)' }}>{formatCLP(ventasSugeridas.promedio)}</b> al mes.{' '}
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setE(x => ({ ...x, ventas_mensuales: ventasSugeridas.promedio }))}>Usar</button>
              </p>
            )}
            <p className="section-label" style={{ margin: '6px 0 0' }}>3 · Ganancia que quieres</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ width: 110 }}>
                <NumeroInput className="input" value={e.ganancia_deseada} decimales={1} sufijo="%" mostrarCero onChange={v => setE(x => ({ ...x, ganancia_deseada: v ?? 0 }))} ariaLabel="Ganancia deseada" />
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>de lo que vendes, después de pagar los gastos fijos</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 12 }}>
          {/* Resultado */}
          <div className="panel-y" style={{ ...tarjeta, borderLeft: '4px solid var(--y-brand)' }}>
            <p className="section-label" style={{ margin: 0 }}><TrendingUp size={13} /> Utilidad mínima recomendada</p>
            {r.recomendada === null ? (
              <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted)' }}>Completa los gastos fijos y cuánto vendes al mes.</p>
            ) : <>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{pct(r.recomendada)}</div>
              <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text)' }}>
                Tus gastos fijos ({formatCLP(r.gastos)}) son el <b>{pct(r.pctGastos)}</b> de lo que vendes ({formatCLP(r.ventas)}). Más la ganancia que quieres ({pct(e.ganancia_deseada)}).
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
                De cada $100 que te paga un cliente, ${Math.round(r.pctGastos || 0)} pagan los gastos fijos y ${Math.round(e.ganancia_deseada)} son ganancia. Bajo {pct(r.pctGastos)} pierdes plata.
              </p>
              {(r.recomendada >= 70) && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--danger)' }}>Es muy alta: revisa los gastos o las ventas (los precios quedarían muy caros).</p>}
            </>}
          </div>

          {/* Calculadora */}
          <div className="panel-y" style={tarjeta}>
            <p className="section-label" style={{ margin: 0 }}><Calculator size={13} /> Probar un precio</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.86rem', color: 'var(--text)' }}>
              <span>Costo</span>
              <div style={{ width: 150 }}><NumeroInput className="input" value={costoPrueba || null} prefijo="$" onChange={v => setCostoPrueba(v ?? 0)} onVacio={() => setCostoPrueba(0)} ariaLabel="Costo de prueba" /></div>
              <span>con {pct(usada)} de utilidad</span>
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text)', display: 'grid', gridTemplateColumns: 'auto auto', gap: '4px 16px', justifyContent: 'start' }}>
              <span style={{ color: 'var(--muted)' }}>Precio neto</span><b>{formatCLP(Math.round(precio))}</b>
              <span style={{ color: 'var(--muted)' }}>Para InnVolt</span><span>{formatCLP(Math.round(precio - (costoPrueba || 0)))}</span>
              <span style={{ color: 'var(--muted)' }}>Precio con IVA</span><span>{formatCLP(Math.round(precio * 1.19))}</span>
            </div>
          </div>

          {/* Utilidad por omisión */}
          <div className="panel-y" style={tarjeta}>
            <p className="section-label" style={{ margin: 0 }}>Utilidad con que entra lo nuevo</p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>
              Lo que agregas a una cotización sin sacarlo de la biblioteca (y lo que agrega la IA) entra con esta utilidad. Después se puede cambiar en cada línea.
            </p>
            {TIPOS.map(t => (
              <div key={t.clave} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: '0.86rem', color: 'var(--text)' }}>{t.nombre}</span>
                <div style={{ width: 110 }}>
                  <NumeroInput className="input" value={porTipo[t.clave]} decimales={1} sufijo="%" mostrarCero max={95}
                    onChange={v => setPorTipo(x => ({ ...x, [t.clave]: Math.min(v ?? 0, 95) }))} ariaLabel={`Utilidad de ${t.nombre}`} />
                </div>
                {r.recomendada !== null && porTipo[t.clave] < r.recomendada - 0.05 && <span style={{ fontSize: '0.72rem', color: '#d97706' }} title="Bajo la recomendada">bajo</span>}
              </div>
            ))}
            {r.recomendada !== null && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
                onClick={() => setPorTipo(x => Object.fromEntries(TIPOS.map(t => [t.clave, Math.max(x[t.clave], Math.round(r.recomendada! * 10) / 10)])) as Record<CategoriaItem, number>)}>
                Subir a {pct(r.recomendada)} lo que esté bajo</button>
            )}
          </div>

          {imprevistos && (
            <div className="panel-y" style={tarjeta}>
              <p className="section-label" style={{ margin: 0 }}>Imprevistos con que entra lo nuevo</p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>
                Un colchón sobre el costo para lo que no se ve (mermas, cortes, sorpresas). Lo que tiene su propia utilidad sube su precio para mantenerla;
                lo de la biblioteca mantiene su precio y la utilidad que ves ya lo descuenta. Los traslados y los cargos no llevan. En cada cotización se cambian
                en el panel «Interno».
              </p>
              {TIPOS_CON_IMPREVISTOS.map(t => (
                <div key={t.clave} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: '0.86rem', color: 'var(--text)' }}>{t.nombre}</span>
                  <div style={{ width: 110 }}>
                    <NumeroInput className="input" value={imprevistos[t.clave] ?? null} decimales={1} sufijo="%" mostrarCero max={TOPE_IMPREVISTOS} placeholder="0"
                      onChange={v => setImprevistos(x => ({ ...(x || {}), [t.clave]: Math.min(v ?? 0, TOPE_IMPREVISTOS) }))}
                      onVacio={() => setImprevistos(x => ({ ...(x || {}), [t.clave]: 0 }))} ariaLabel={`Imprevistos de ${t.nombre}`} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <button className="btn btn-primary" onClick={guardar} disabled={guardando} style={{ alignSelf: 'flex-end' }}>
            {guardando ? <Loader2 size={14} className="iv-spin" /> : <Save size={14} />} Guardar</button>
        </div>
      </div>
    </div>
  );
}
