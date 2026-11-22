'use client';

/**
 * Control de proyecto de un trabajo (fases 20 y 21), dentro del panel del trabajo y solo para quien
 * ve costos: tres capas por partida, lo que se COBRÓ, lo PRESUPUESTADO y lo REAL.
 *   · Resumen: KPIs, tabla por partida (cobrado, presupuesto, margen plan, real, desviación,
 *     proyectado y estado con semáforo) y por tipo de costo. Lo real se compara al peso con
 *     cotizacion_resultado.
 *   · Presupuesto: el anteproyecto, línea por línea (components/trabajos/Anteproyecto.tsx).
 *   · Flujo de caja: plan semanal vs real (components/trabajos/FlujoCaja.tsx).
 *   · Exportar control: Excel con las hojas Control, PorTipo, Flujo y Movimientos.
 * Las cuentas: lib/controlProyecto.ts y lib/anteproyecto.ts; los datos: services/controlProyecto.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { BarChart3, Download } from 'lucide-react';
import {
  control, cuadre, flujoSemanal, hojasControl, inicioPorDefecto, kpis, movimientos, nombreArchivoControl, normalizarPlan,
  planPorDefecto, presupuesto, NOMBRE_ESTADO, type EstadoControl, type FilaControl, type FlujoPlan,
} from '@/lib/controlProyecto';
import { ejecucionDe } from '@/lib/anteproyecto';
import { controlProyectoService, type DatosControl } from '@/services/controlProyecto';
import type { ResultadoTrabajo } from '@/services/trabajos';
import { CATEGORIAS_GASTO } from '@/services/operacion';
import { vendedoresService } from '@/services/vendedores';
import { descargarExcel } from '@/lib/excel';
import { useFase } from '@/lib/fases';
import type { HitoCobro } from '@/lib/cotizador/tipos';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP } from '@/utils';

const FlujoCaja = dynamic(() => import('@/components/trabajos/FlujoCaja'), {
  ssr: false, loading: () => <div className="skeleton" style={{ height: 160 }} />,
});
const Anteproyecto = dynamic(() => import('@/components/trabajos/Anteproyecto'), {
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
type Vista = 'resumen' | 'presupuesto' | 'flujo';

export default function ControlPresupuesto({ cotId, folio, plan, resultado, version, editaFlujo }: {
  cotId: string; folio: number;
  /** El plan de cobro de la cotización (o el de los ajustes). */
  plan: HitoCobro[];
  /** cotizacion_resultado del trabajo, para comprobar que todo cuadre al peso. */
  resultado: ResultadoTrabajo | null;
  /** Cambia cuando se rinde un gasto o se registran horas: se vuelve a leer. */
  version: number;
  /** Puede cambiar el presupuesto y el plan del flujo (cotizaciones.crear). */
  editaFlujo: boolean;
}) {
  const { error: toastError } = useToast();
  const fase21 = useFase(21);
  const [datos, setDatos] = useState<DatosControl | null>(null);
  const [fallo, setFallo] = useState('');
  const [vista, setVista] = useState<Vista>('resumen');
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
    const ejec = ejecucionDe(datos.presupuesto);
    const c = control(p, movs, ejec);
    const total = Number(datos.cot.total_clp ?? datos.cot.total ?? 0);
    const base = planPorDefecto({ inicio: inicioPorDefecto(datos.cot.trabajo_inicio, datos.cot.aceptada_at, fechaLocal()), presupuesto: p, planCobro: plan });
    const planFlujo: FlujoPlan = datos.cot.flujo_plan ? normalizarPlan(datos.cot.flujo_plan, base) : base;
    return {
      p, movs, c, ejec, total, base, planFlujo,
      k: kpis(c, movs, datos.cobros, total),
      dif: cuadre(c, resultado),
      flujo: flujoSemanal({ plan: planFlujo, presupuesto: p, planCobro: plan, totalCotizacion: total, cobros: datos.cobros, movimientos: movs, ejecucion: ejec }),
    };
  }, [datos, plan, resultado]);

  const exportar = async () => {
    if (!calc || !datos) return;
    try {
      await descargarExcel(hojasControl({
        control: calc.c, kpis: calc.k, flujo: calc.flujo, movimientos: calc.movs, presupuesto: calc.p, nombres,
        categorias: Object.fromEntries(CATEGORIAS_GASTO.map(c => [c.clave, c.nombre])),
        lineasPresupuesto: Object.fromEntries(datos.presupuesto.map(l => [l.id, l.descripcion])),
      }), nombreArchivoControl(folio, fechaLocal()));
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo exportar'); }
  };

  const guardarFlujo = async (nuevo: FlujoPlan) => {
    await controlProyectoService.guardarFlujo(cotId, nuevo);
    cargar();
  };

  if (fallo) return <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--danger)' }}>Control de proyecto: {fallo}</p>;
  if (!calc || !datos) return <div className="skeleton" style={{ height: 140 }} />;
  const { c, k, dif } = calc;
  const conAnteproyecto = datos.presupuesto.length > 0;

  const filaTabla = (f: FilaControl, total = false) => (
    <tr key={f.id || 'sin'} style={total ? { fontWeight: 700, borderTop: '2px solid var(--border2)' } : undefined}>
      <td style={{ color: 'var(--muted)' }}>{f.numero ?? ''}</td>
      <td style={{ minWidth: 160 }}>{f.nombre}</td>
      <td style={num}>{formatCLP(f.venta)}</td>
      <td style={num} title={f.presupuesto !== f.cotizado ? `Cotizado: ${formatCLP(f.cotizado)}` : undefined}>{formatCLP(f.presupuesto)}</td>
      <td style={{ ...num, color: (f.margenPlan ?? 0) < 0 ? 'var(--danger)' : undefined }}>{pct(f.margenPlan)}</td>
      <td style={num}>{formatCLP(f.real)}</td>
      <td style={{ ...num, color: f.desviacion > 0 ? 'var(--danger)' : 'var(--muted)' }}>{f.desviacion > 0 ? '+' : ''}{formatCLP(f.desviacion)}</td>
      <td style={num}>{pct(f.ejecutado)}</td>
      <td style={num}>{formatCLP(f.proyectado)}</td>
      <td style={{ ...num, color: (f.margenProyectado ?? 0) < 0 ? 'var(--danger)' : undefined }}>{pct(f.margenProyectado)}</td>
      <td>{total ? '' : <ChipEstado estado={f.estado} />}</td>
    </tr>
  );

  const tarjetas: [string, string, string?, string?][] = [
    ['Cobrado (venta neta)', formatCLP(k.venta)],
    ['Presupuesto', formatCLP(k.presupuesto), undefined, k.presupuesto !== k.cotizado ? `cotizado ${formatCLP(k.cotizado)}` : conAnteproyecto ? 'igual a lo cotizado' : 'el de la cotización'],
    ['Margen plan', `${formatCLP(k.margenPlan)} · ${pct(k.margenPlanPct)}`, k.margenPlan < 0 ? 'var(--danger)' : 'var(--success)'],
    ['Gasto real', formatCLP(k.real), k.real > k.presupuesto && k.presupuesto > 0 ? 'var(--danger)' : undefined, `${pct(k.pctGastado)} del presupuesto`],
    ['Margen proyectado', `${formatCLP(k.margenProyectado)} · ${pct(k.margenProyectadoPct)}`, k.margenProyectado < 0 ? 'var(--danger)' : 'var(--success)'],
    ['Pagado por el cliente', formatCLP(k.cobrado), 'var(--success)', `por cobrar ${formatCLP(k.porCobrar)}`],
    ['Caja del trabajo', formatCLP(k.caja), k.caja < 0 ? 'var(--danger)' : undefined, 'lo pagado − lo que salió'],
  ];
  const vistas: [Vista, string][] = [['resumen', 'Resumen'], ...(fase21 ? [['presupuesto', 'Presupuesto'] as [Vista, string]] : []), ['flujo', 'Flujo de caja']];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <p className="section-label" style={{ margin: 0 }}><BarChart3 size={15} /> Control de proyecto</p>
        <div style={{ display: 'flex', gap: 4 }}>
          {vistas.map(([v, t]) => (
            <button key={v} className="btn btn-sm" onClick={() => setVista(v)}
              style={{ background: vista === v ? 'var(--y-brand)' : 'var(--bg3)', color: vista === v ? '#111' : 'var(--muted)' }}>{t}</button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={exportar}><Download size={13} /> Exportar control</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 8 }}>
        {tarjetas.map(([t, v, color, sub]) => (
          <div key={t} className="kpi-card"><p className="label-muted">{t}</p><p className="kpi-value" style={{ fontSize: '1rem', color }}>{v}</p>
            {sub && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{sub}</span>}</div>
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

      {vista === 'resumen' && <>
        <div style={{ overflowX: 'auto' }}>
          <table className="iv-table" style={{ fontSize: '0.8rem', width: '100%' }}>
            <thead><tr>
              <th>N°</th><th>Partida</th><th style={num}>Cobrado</th><th style={num}>Presupuesto</th><th style={num}>Margen plan</th>
              <th style={num}>Real</th><th style={num}>Desviación</th><th style={num}>% ejecutado</th><th style={num}>Proyectado</th>
              <th style={num}>Margen proy.</th><th>Estado</th>
            </tr></thead>
            <tbody>{c.filas.map(f => filaTabla(f))}{filaTabla(c.total, true)}</tbody>
          </table>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="iv-table" style={{ fontSize: '0.8rem', width: '100%', maxWidth: 720 }}>
            <thead><tr><th>Tipo de costo</th><th style={num}>Cotizado</th><th style={num}>Presupuesto</th><th style={num}>Real</th><th style={num}>Desviación</th><th>Estado</th></tr></thead>
            <tbody>
              {c.porTipo.filter(t => t.cotizado || t.presupuesto || t.real).map(t => (
                <tr key={t.tipo}>
                  <td>{t.nombre}</td><td style={num}>{formatCLP(t.cotizado)}</td><td style={num}>{formatCLP(t.presupuesto)}</td><td style={num}>{formatCLP(t.real)}</td>
                  <td style={{ ...num, color: t.desviacion > 0 ? 'var(--danger)' : 'var(--muted)' }}>{t.desviacion > 0 ? '+' : ''}{formatCLP(t.desviacion)}</td>
                  <td><ChipEstado estado={t.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>
          Cobrado = la venta neta de la cotización. Presupuesto = el anteproyecto{conAnteproyecto ? '' : ' (aún es el costo de la cotización)'}.
          Real = gastos rendidos + compras (con factura, el neto) + mano de obra; una boleta o factura con detalle se reparte en sus partidas.
          ALERTA desde el 90 % del presupuesto; proyectado = el mayor entre presupuesto y real.
        </p>
      </>}
      {vista === 'presupuesto' && (
        <Anteproyecto key={datos.presupuesto.map(l => `${l.id}:${l.cantidad}:${l.costo_unitario}:${l.descripcion}:${l.partida_id}:${l.tipo}`).join('|')}
          cotId={cotId} presupuesto={calc.p} control={c} lineas={datos.presupuesto} movs={calc.movs} editable={editaFlujo} onCambio={cargar} />
      )}
      {vista === 'flujo' && (
        <FlujoCaja key={JSON.stringify(calc.planFlujo)} plan={calc.planFlujo} planPorOmision={calc.base} guardado={!!datos.cot.flujo_plan}
          presupuesto={calc.p} ejecucion={calc.ejec} planCobro={plan} totalCotizacion={calc.total} cobros={datos.cobros} movimientos={calc.movs}
          puedeEditar={editaFlujo} onGuardar={guardarFlujo} />
      )}
    </div>
  );
}
