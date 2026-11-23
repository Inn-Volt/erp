'use client';

/**
 * Parámetros y multiplicadores (hh.configurar): los parámetros del cálculo (horas facturables,
 * costo empresa, gastos generales, utilidad mínima, urgencia, IVA, respaldos y redondeos), los
 * tipos de tarea con su multiplicador sugerido, y fijar a mano la UF y el dólar de un día.
 */

import { useEffect, useState } from 'react';
import { Check, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { useToast } from '@/hooks/useToast';
import { formatoIndicador, type ParametrosHH as Parametros } from '@/lib/hh/calculo';
import { NOMBRE_FUENTE, RANGOS, hoyEnChile } from '@/lib/hh/indicadores';
import { hhService, mensajeHH, type IndicadorGuardado, type TipoTareaHH } from '@/services/hh';
import { Campo, Interruptor, fechaCL, tdEstilo, thEstilo, type PropsPestana } from './comun';

/** Los que se editan como porcentaje (0,25 ↔ 25 %). */
const PORCENTAJES: (keyof Parametros)[] = ['gastos_generales', 'utilidad_minima', 'recargo_urgencia', 'iva'];
const CAMPOS: [keyof Parametros, string, string?][] = [
  ['horas_facturables_mes', 'Horas facturables al mes'],
  ['factor_costo_empresa', 'Factor costo empresa', 'Leyes sociales, seguros, EPP (1,35 = +35 %)'],
  ['gastos_generales', 'Gastos generales', 'Vehículo, bencina, herramientas, software'],
  ['utilidad_minima', 'Utilidad mínima'],
  ['recargo_urgencia', 'Recargo urgencia', 'Urgencia o fin de semana'],
  ['iva', 'IVA'],
  ['uf_respaldo', 'UF de respaldo', 'Si mindicador no responde y no hay nada guardado'],
  ['usd_respaldo', 'Dólar de respaldo'],
  ['redondeo_tarifa', 'Redondeo de la tarifa ($)'],
  ['redondeo_total', 'Redondeo del total ($)'],
  ['validez_dias', 'Validez de la cotización (días)'],
];

export default function ParametrosHH({ cat, onCambio, onIndicadores }: PropsPestana & { onIndicadores: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FormParametros key={JSON.stringify(cat.parametros)} inicial={cat.parametros} onCambio={onCambio} />
      <TiposTarea tipos={cat.tipos} onCambio={onCambio} />
      <IndicadorManual onIndicadores={onIndicadores} />
    </div>
  );
}

function FormParametros({ inicial, onCambio }: { inicial: Parametros & { updated_at: string | null }; onCambio: () => Promise<void> | void }) {
  const { success, error: toastError } = useToast();
  const { updated_at, ...base } = inicial;
  const [p, setP] = useState<Parametros>(base);
  const [ocupado, setOcupado] = useState(false);
  const cambiado = JSON.stringify(p) !== JSON.stringify(base);
  const guardar = async () => {
    setOcupado(true);
    try { await hhService.guardarParametros(p); success('Parámetros guardados.'); await onCambio(); }
    catch (e) { toastError(mensajeHH(e)); }
    finally { setOcupado(false); }
  };
  return (
    <div className="panel-y" style={{ padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <p className="section-label" style={{ margin: 0 }}>Parámetros</p>
        {updated_at && <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>Último cambio: {fechaCL(hoyEnChile(new Date(updated_at)))}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 8 }}>
        {CAMPOS.map(([k, nombre, ayuda]) => {
          const pct = PORCENTAJES.includes(k);
          return (
            <Campo key={k} etiqueta={nombre} ayuda={ayuda}>
              <NumeroInput className="input input-sm" value={pct ? Math.round(p[k] * 1000) / 10 : p[k]} sufijo={pct ? '%' : undefined}
                prefijo={k === 'uf_respaldo' || k === 'usd_respaldo' ? '$' : undefined} min={0}
                decimales={k === 'factor_costo_empresa' ? 3 : pct || k === 'uf_respaldo' || k === 'usd_respaldo' ? 2 : 0}
                onChange={v => setP({ ...p, [k]: pct ? v / 100 : v })} mostrarCero ariaLabel={nombre} title={ayuda} />
            </Campo>
          );
        })}
      </div>
      {cambiado && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setP(base)}><RotateCcw size={13} /> Descartar</button>
          <button className="btn btn-primary btn-sm" disabled={ocupado} onClick={guardar}>{ocupado ? <Loader2 size={13} className="iv-spin" /> : <Save size={13} />} Guardar parámetros</button>
        </div>
      )}
    </div>
  );
}

/** «Reuniones y pruebas» → «reuniones_y_pruebas». */
const claveDe = (nombre: string) => nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

function TiposTarea({ tipos, onCambio }: { tipos: TipoTareaHH[]; onCambio: () => Promise<void> | void }) {
  const [nuevo, setNuevo] = useState<TipoTareaHH | null>(null);
  return (
    <div className="panel-y">
      <div style={{ padding: '0.8rem 1rem', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--border2)' }}>
        <p className="section-label" style={{ margin: 0 }}>Tipos de tarea y multiplicadores</p>
        <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Horas cobradas = horas reales × multiplicador (lo que la IA acelera se cobra a valor de mercado).</span>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" disabled={!!nuevo}
          onClick={() => setNuevo({ clave: '', nombre: '', multiplicador: 1, descripcion: null, activo: true, orden: tipos.length + 1 })}><Plus size={13} /> Nuevo tipo</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720, fontSize: '0.82rem' }}>
          <thead><tr>{['Activo', 'Tipo de tarea', 'Multiplicador', 'Descripción', 'Orden', ''].map(h => <th key={h} style={thEstilo}>{h}</th>)}</tr></thead>
          <tbody>
            {nuevo && <FilaTipo key="nuevo" inicial={nuevo} nuevo onListo={async () => { setNuevo(null); await onCambio(); }} onDescartar={() => setNuevo(null)} />}
            {tipos.map(t => <FilaTipo key={`${t.clave}:${JSON.stringify(t)}`} inicial={t} onListo={onCambio} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaTipo({ inicial, nuevo, onListo, onDescartar }: { inicial: TipoTareaHH; nuevo?: boolean; onListo: () => Promise<void> | void; onDescartar?: () => void }) {
  const { success, error: toastError, warning } = useToast();
  const [t, setT] = useState(inicial);
  const cambiado = nuevo || JSON.stringify(t) !== JSON.stringify(inicial);
  const guardar = async (cambios?: Partial<TipoTareaHH>) => {
    const x = { ...t, ...cambios, nombre: t.nombre.trim(), descripcion: t.descripcion?.trim() || null };
    if (!x.nombre) { warning('Escribe el nombre del tipo de tarea.'); return; }
    if (!(x.multiplicador > 0)) { warning('El multiplicador tiene que ser mayor que 0.'); return; }
    if (nuevo) x.clave = claveDe(x.nombre);
    if (!x.clave) { warning('El nombre necesita letras o números.'); return; }
    try { await hhService.guardarTipo(x, !!nuevo); success(nuevo ? 'Tipo de tarea creado.' : 'Tipo de tarea guardado.'); await onListo(); }
    catch (e) { toastError(mensajeHH(e)); }
  };
  const borrar = async () => {
    if (!confirm(`¿Borrar «${t.nombre}»? Los trabajos tipo que lo usan quedan sin tipo; los cálculos guardados no cambian.`)) return;
    try { await hhService.eliminarTipo(t.clave); success('Tipo de tarea borrado.'); await onListo(); }
    catch (e) { toastError(mensajeHH(e, 'No se pudo borrar.')); }
  };
  return (
    <tr style={{ borderTop: '1px solid var(--border2)', opacity: t.activo ? 1 : 0.55, background: nuevo ? 'var(--y-soft)' : undefined }}>
      <td style={tdEstilo}><Interruptor activo={t.activo} etiqueta={`${t.nombre || 'Tipo'} activo`} onChange={() => (cambiado ? setT({ ...t, activo: !t.activo }) : guardar({ activo: !t.activo }))} /></td>
      <td style={{ ...tdEstilo, minWidth: 240 }}><input className="input input-sm" value={t.nombre} onChange={e => setT({ ...t, nombre: e.target.value })} aria-label="Nombre del tipo de tarea" /></td>
      <td style={tdEstilo}><NumeroInput className="input input-sm" envoltura={{ width: 90 }} prefijo="×" value={t.multiplicador} decimales={2} min={0} onChange={v => setT({ ...t, multiplicador: v })} ariaLabel="Multiplicador" /></td>
      <td style={{ ...tdEstilo, minWidth: 240 }}><input className="input input-sm" value={t.descripcion ?? ''} onChange={e => setT({ ...t, descripcion: e.target.value })} aria-label="Descripción" /></td>
      <td style={tdEstilo}><NumeroInput className="input input-sm" envoltura={{ width: 60 }} value={t.orden} decimales={0} mostrarCero onChange={v => setT({ ...t, orden: Math.round(v) })} ariaLabel="Orden" /></td>
      <td style={{ ...tdEstilo, whiteSpace: 'nowrap', textAlign: 'right' }}>
        {cambiado && <button className="btn btn-primary btn-xs" onClick={() => guardar()} aria-label="Guardar el tipo de tarea"><Check size={12} /></button>}{' '}
        {cambiado && <button className="btn btn-ghost btn-xs" onClick={() => (nuevo ? onDescartar?.() : setT(inicial))} aria-label="Descartar los cambios"><RotateCcw size={12} /></button>}
        {!nuevo && !cambiado && <button className="btn btn-ghost btn-xs" onClick={borrar} aria-label={`Borrar ${t.nombre}`}><Trash2 size={12} /></button>}
      </td>
    </tr>
  );
}

function IndicadorManual({ onIndicadores }: { onIndicadores: () => void }) {
  const { success, error: toastError, warning } = useToast();
  const [f, setF] = useState({ fecha: hoyEnChile(), uf: 0, usd: 0 });
  const [ultimos, setUltimos] = useState<IndicadorGuardado[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cargar = async () => {
    try { setUltimos(await hhService.ultimosIndicadores()); }
    catch (e) { toastError(mensajeHH(e, 'No se pudieron leer los valores guardados.')); }
  };
  useEffect(() => {
    hhService.ultimosIndicadores().then(setUltimos).catch(e => toastError(mensajeHH(e, 'No se pudieron leer los valores guardados.')));
  }, [toastError]);
  const fijar = async () => {
    const [ufMin, ufMax] = RANGOS.uf, [usdMin, usdMax] = RANGOS.usd;
    if (!(f.uf >= ufMin && f.uf <= ufMax)) { warning(`La UF tiene que estar entre ${formatoIndicador(ufMin)} y ${formatoIndicador(ufMax)}.`); return; }
    if (!(f.usd >= usdMin && f.usd <= usdMax)) { warning(`El dólar tiene que estar entre ${formatoIndicador(usdMin)} y ${formatoIndicador(usdMax)}.`); return; }
    setOcupado(true);
    try { await hhService.fijarIndicador(f.fecha, f.uf, f.usd); success('UF y dólar fijados.'); await cargar(); onIndicadores(); }
    catch (e) { toastError(mensajeHH(e)); }
    finally { setOcupado(false); }
  };
  return (
    <div className="panel-y" style={{ padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="section-label" style={{ margin: 0 }}>Fijar la UF y el dólar a mano</p>
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>Para un día en que mindicador falle o dé un valor raro. El valor fijado manda ese día.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Campo etiqueta="Día" ancho={160}><input className="input input-sm" type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></Campo>
        <Campo etiqueta="UF" ancho={150}><NumeroInput className="input input-sm" prefijo="$" decimales={2} value={f.uf} onChange={v => setF({ ...f, uf: v })} ariaLabel="UF" /></Campo>
        <Campo etiqueta="Dólar" ancho={130}><NumeroInput className="input input-sm" prefijo="$" decimales={2} value={f.usd} onChange={v => setF({ ...f, usd: v })} ariaLabel="Dólar" /></Campo>
        <button className="btn btn-primary btn-sm" disabled={ocupado || !f.fecha} onClick={fijar}>{ocupado ? <Loader2 size={13} className="iv-spin" /> : <Save size={13} />} Fijar</button>
      </div>
      {ultimos && ultimos.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420, fontSize: '0.8rem' }}>
            <thead><tr>{['Día', 'UF', 'Dólar', 'Fuente'].map(h => <th key={h} style={thEstilo}>{h}</th>)}</tr></thead>
            <tbody>{ultimos.map(u => (
              <tr key={u.fecha} style={{ borderTop: '1px solid var(--border2)' }}>
                <td style={tdEstilo}>{fechaCL(u.fecha)}</td>
                <td style={{ ...tdEstilo, fontVariantNumeric: 'tabular-nums' }}>{formatoIndicador(u.uf)}</td>
                <td style={{ ...tdEstilo, fontVariantNumeric: 'tabular-nums' }}>{formatoIndicador(u.usd)}</td>
                <td style={{ ...tdEstilo, color: 'var(--muted)' }}>{NOMBRE_FUENTE[u.fuente]}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
