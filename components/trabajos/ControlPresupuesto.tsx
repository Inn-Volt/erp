'use client';

/**
 * Control de proyecto de un trabajo (fase 20), dentro del panel del trabajo y solo para quien ve
 * costos: dónde se gana o se pierde plata.
 *   · Presupuesto vs real: KPIs, tabla por partida (cotizado, real, desviación, proyectado y estado
 *     con semáforo) y por tipo de costo. Los totales se comparan al peso con cotizacion_resultado.
 *   · Flujo de caja: plan semanal vs real (components/trabajos/FlujoCaja.tsx).
 *   · Exportar control: Excel con las hojas Control, PorTipo, Flujo y Movimientos.
 * Las cuentas están en lib/controlProyecto.ts; los datos, en services/controlProyecto.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { BarChart3, Download } from 'lucide-react';
import {
  control, cuadre, flujoSemanal, hojasControl, inicioPorDefecto, kpis, movimientos, nombreArchivoControl, normalizarPlan,
  planPorDefecto, presupuesto, NOMBRE_ESTADO, type EstadoControl, type FilaControl, type FlujoPlan,
} from '@/lib/controlProyecto';
import { controlProyectoService, type DatosControl } from '@/services/controlProyecto';
import type { ResultadoTrabajo } from '@/services/trabajos';
import { CATEGORIAS_GASTO } from '@/services/operacion';
import { vendedoresService } from '@/services/vendedores';
import { descargarExcel } from '@/lib/excel';
import type { HitoCobro } from '@/lib/cotizador/tipos';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP } from '@/utils';

const FlujoCaja = dynamic(() => import('@/components/trabajos/FlujoCaja'), {
  ssr: false, loading: () => <div className="skeleton" style={{ height: 160 }} />,
});

const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1).replace('.', ',')} %`);
const COLOR: Record<EstadoControl, { fondo: string; texto: string }> = {
  ok: { fondo: 'var(--success-soft)', texto: 'var(--success)' },
  alerta: { fondo: 'var(--y-soft)', texto: 'var(--y)' },
  sobre: { fondo: 'var(--danger-soft)', texto: 'var(--danger)' },
  sin_presupuesto: { fondo: 'var(--danger-soft)', texto: 'var(--danger)' },
};
export function ChipEstado({ estado }: { estado: EstadoControl }) {
  const c = COLOR[estado];
  return <span className="badge" style={{ background: c.fondo, color: c.texto, fontWeight: 700, fontSize: '0.68rem', whiteSpace: 'nowrap' }}>{NOMBRE_ESTADO[estado]}</span>;
}
const num: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

export default function ControlPresupuesto({ cotId, folio, plan, resultado, version, editaFlujo }: {
  cotId: string; folio: number;
  /** El plan de cobro de la cotización (o el de los ajustes). */
  plan: HitoCobro[];
  /** cotizacion_resultado del trabajo, para comprobar que todo cuadre al peso. */
  resultado: ResultadoTrabajo | null;
  /** Cambia cuando se rinde un gasto o se registran horas: se vuelve a leer. */
  version: number;
  /** Puede cambiar el plan del flujo (cotizaciones.crear). */
  editaFlujo: boolean;
}) {
  const { error: toastError } = useToast();
  const [datos, setDatos] = useState<DatosControl | null>(null);
  const [fallo, setFallo] = useState('');
  const [vista, setVista] = useState<'control' | 'flujo'>('control');
  const [nombres, setNombres] = useState<Record<string, string>>({});

  const cargar = useCallback(() => {
    controlProyectoService.datos(cotId).then(d => { setDatos(d); setFallo(''); })
      .catch(e => setFallo(e instanceof Error ? e.message : 'No se pudo leer el trabajo'));
  }, [cotId]);
  useEffect(() => { cargar(); }, [cargar, version]);
  useEffect(() => { vendedoresService.mapa().then(m => setNombres(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.nombre])))).catch(() => {}); }, []);

  const calc = useMemo(() => {
    if (!datos) return null;
    const p = presupuesto(datos.cot);
    const movs = movimientos(datos);
    const c = control(p, movs);
    const total = Number(datos.cot.total_clp ?? datos.cot.total ?? 0);
    const base = planPorDefecto({ inicio: inicioPorDefecto(datos.cot.trabajo_inicio, datos.cot.aceptada_at, fechaLocal()), presupuesto: p, planCobro: plan });
    const planFlujo: FlujoPlan = datos.cot.flujo_plan ? normalizarPlan(datos.cot.flujo_plan, base) : base;
    return {
      p, movs, c, total, base, planFlujo,
      k: kpis(c, movs, datos.cobros, total),
      dif: cuadre(c, resultado),
      flujo: flujoSemanal({ plan: planFlujo, presupuesto: p, planCobro: plan, totalCotizacion: total, cobros: datos.cobros, movimientos: movs }),
    };
  }, [datos, plan, resultado]);

  const exportar = async () => {
    if (!calc) return;
    try {
      await descargarExcel(hojasControl({
        control: calc.c, kpis: calc.k, flujo: calc.flujo, movimientos: calc.movs, presupuesto: calc.p, nombres,
        categorias: Object.fromEntries(CATEGORIAS_GASTO.map(c => [c.clave, c.nombre])),
      }), nombreArchivoControl(folio, fechaLocal()));
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo exportar'); }
  };

  const guardarFlujo = async (nuevo: FlujoPlan) => {
    await controlProyectoService.guardarFlujo(cotId, nuevo);
    cargar();
  };

  if (fallo) return <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--danger)' }}>Control de proyecto: {fallo}</p>;
  if (!calc) return <div className="skeleton" style={{ height: 140 }} />;
  const { c, k, dif } = calc;

  const filaTabla = (f: FilaControl, total = false) => (
    <tr key={f.id || 'sin'} style={total ? { fontWeight: 700, borderTop: '2px solid var(--border2)' } : undefined}>
      <td style={{ color: 'var(--muted)' }}>{f.numero ?? ''}</td>
      <td style={{ minWidth: 160 }}>{f.nombre}</td>
      <td style={num}>{formatCLP(f.venta)}</td>
      <td style={num}>{formatCLP(f.cotizado)}</td>
      <td style={num}>{pct(f.margenCotizado)}</td>
      <td style={num}>{formatCLP(f.real)}</td>
      <td style={{ ...num, color: f.desviacion > 0 ? 'var(--danger)' : 'var(--muted)' }}>{f.desviacion > 0 ? '+' : ''}{formatCLP(f.desviacion)}</td>
      <td style={num}>{pct(f.ejecutado)}</td>
      <td style={num}>{formatCLP(f.proyectado)}</td>
      <td style={{ ...num, color: (f.margenProyectado ?? 0) < 0 ? 'var(--danger)' : undefined }}>{pct(f.margenProyectado)}</td>
      <td>{total ? '' : <ChipEstado estado={f.estado} />}</td>
    </tr>
  );

  const tarjetas: [string, string, string?][] = [
    ['Venta neta', formatCLP(k.venta)],
    ['Costo cotizado', formatCLP(k.cotizado)],
    ['Gasto real', formatCLP(k.real), k.real > k.cotizado && k.cotizado > 0 ? 'var(--danger)' : undefined],
    ['% gastado', pct(k.pctGastado), (k.pctGastado ?? 0) > 100 ? 'var(--danger)' : (k.pctGastado ?? 0) >= 90 ? 'var(--y)' : undefined],
    ['Margen proyectado', `${formatCLP(k.margenProyectado)} · ${pct(k.margenProyectadoPct)}`, k.margenProyectado < 0 ? 'var(--danger)' : 'var(--success)'],
    ['Cobrado', formatCLP(k.cobrado), 'var(--success)'],
    ['Por cobrar', formatCLP(k.porCobrar)],
    ['Caja del trabajo', formatCLP(k.caja), k.caja < 0 ? 'var(--danger)' : undefined],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <p className="section-label" style={{ margin: 0 }}><BarChart3 size={15} /> Control de proyecto</p>
        <div style={{ display: 'flex', gap: 4 }}>
          {([['control', 'Presupuesto vs real'], ['flujo', 'Flujo de caja']] as const).map(([v, t]) => (
            <button key={v} className="btn btn-sm" onClick={() => setVista(v)}
              style={{ background: vista === v ? 'var(--y-brand)' : 'var(--bg3)', color: vista === v ? '#111' : 'var(--muted)' }}>{t}</button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={exportar}><Download size={13} /> Exportar control</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 8 }}>
        {tarjetas.map(([t, v, color]) => (
          <div key={t} className="kpi-card"><p className="label-muted">{t}</p><p className="kpi-value" style={{ fontSize: '1rem', color }}>{v}</p></div>
        ))}
      </div>

      {dif.length > 0 && (
        <div style={{ padding: '0.6rem 0.8rem', borderRadius: 8, background: 'var(--y-soft)', fontSize: '0.8rem', color: 'var(--text)' }}>
          <b>No cuadra al peso con el resultado guardado del trabajo:</b>
          <ul style={{ margin: '4px 0', paddingLeft: '1.1rem' }}>
            {dif.map(d => <li key={d.campo}>{d.nombre}: aquí {formatCLP(d.aqui)}, guardado {formatCLP(d.base)} (diferencia {formatCLP(d.diferencia)})</li>)}
          </ul>
          <span style={{ color: 'var(--muted)' }}>
            Suele pasar con cotizaciones guardadas con una versión anterior del cotizador (descuento global, imprevistos): la venta y el costo
            de cada partida se recalculan con las reglas de hoy. Los montos reales salen de los mismos registros, así que una diferencia ahí es un error: avísanos.
          </span>
        </div>
      )}

      {vista === 'control' ? <>
        <div style={{ overflowX: 'auto' }}>
          <table className="iv-table" style={{ fontSize: '0.8rem', width: '100%' }}>
            <thead><tr>
              <th>N°</th><th>Partida</th><th style={num}>Venta neta</th><th style={num}>Costo cotizado</th><th style={num}>Margen cot.</th>
              <th style={num}>Gasto real</th><th style={num}>Desviación</th><th style={num}>% ejecutado</th><th style={num}>Costo proyectado</th>
              <th style={num}>Margen proy.</th><th>Estado</th>
            </tr></thead>
            <tbody>{c.filas.map(f => filaTabla(f))}{filaTabla(c.total, true)}</tbody>
          </table>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="iv-table" style={{ fontSize: '0.8rem', width: '100%', maxWidth: 640 }}>
            <thead><tr><th>Tipo de costo</th><th style={num}>Cotizado</th><th style={num}>Real</th><th style={num}>Desviación</th><th>Estado</th></tr></thead>
            <tbody>
              {c.porTipo.filter(t => t.cotizado || t.real).map(t => (
                <tr key={t.tipo}>
                  <td>{t.nombre}</td><td style={num}>{formatCLP(t.cotizado)}</td><td style={num}>{formatCLP(t.real)}</td>
                  <td style={{ ...num, color: t.desviacion > 0 ? 'var(--danger)' : 'var(--muted)' }}>{t.desviacion > 0 ? '+' : ''}{formatCLP(t.desviacion)}</td>
                  <td><ChipEstado estado={t.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>
          Real = gastos rendidos + compras (con factura, el neto) + mano de obra (internos por su jornada; externos con la retención si dan boleta).
          Lo que no dice partida queda en «Sin partida»: elígela al rendir, al ingresar la compra o al registrar el día.
          ALERTA desde el 90 % de lo cotizado; costo proyectado = el mayor entre lo cotizado y lo real.
        </p>
      </> : (
        <FlujoCaja key={JSON.stringify(calc.planFlujo)} plan={calc.planFlujo} planPorOmision={calc.base} guardado={!!datos?.cot.flujo_plan}
          presupuesto={calc.p} planCobro={plan} totalCotizacion={calc.total} cobros={datos?.cobros || []} movimientos={calc.movs}
          puedeEditar={editaFlujo} onGuardar={guardarFlujo} />
      )}
    </div>
  );
}
