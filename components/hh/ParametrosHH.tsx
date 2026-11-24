'use client';

/**
 * Ajustes (hh.configurar): los parámetros del cálculo (horas facturables, costo empresa, gastos
 * generales, utilidad mínima, urgencia, IVA, respaldos y redondeos), los tipos de tarea con su
 * multiplicador sugerido, y fijar a mano la UF y el dólar de un día.
 */

import { useEffect, useState } from 'react';
import { Check, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { useToast } from '@/hooks/useToast';
import { formatoIndicador, type ParametrosHH as Parametros } from '@/lib/hh/calculo';
import { NOMBRE_FUENTE, RANGOS, hoyEnChile } from '@/lib/hh/indicadores';
import { hhService, mensajeHH, type IndicadorGuardado, type TipoTareaHH } from '@/services/hh';
import { Campo, Interruptor, fechaCL, type PropsPestana } from './comun';
import s from './hh.module.css';

/** Los que se editan como porcentaje (0,25 ↔ 25 %). */
const PORCENTAJES: (keyof Parametros)[] = ['gastos_generales', 'utilidad_minima', 'recargo_urgencia', 'iva', 'gestion_proyecto'];
const CAMPOS: [keyof Parametros, string, string?][] = [
  ['horas_facturables_mes', 'Horas facturables al mes', 'Las que de verdad se cobran en un mes'],
  ['factor_costo_empresa', 'Factor costo empresa', 'Leyes sociales, seguros, EPP (1,35 = +35 %)'],
  ['gastos_generales', 'Gastos generales', 'Vehículo, bencina, herramientas, software'],
  ['utilidad_minima', 'Utilidad mínima'],
  ['recargo_urgencia', 'Recargo por urgencia', 'Urgencia o fin de semana'],
  ['iva', 'IVA'],
  ['gestion_proyecto', 'Gestión de proyecto', 'Lo que se suma por coordinación y trámites (10 a 15 %)'],
  ['uf_respaldo', 'UF de respaldo', 'Si mindicador no responde y no hay nada guardado'],
  ['usd_respaldo', 'Dólar de respaldo'],
  ['redondeo_tarifa', 'Redondear tarifas a', 'Ej.: 100 → $28.945 queda en $28.900'],
  ['redondeo_total', 'Redondear el total a'],
  ['validez_dias', 'Validez de la cotización (días)'],
];

export default function ParametrosHH({ cat, onCambio, onIndicadores }: PropsPestana & { onIndicadores: () => void }) {
  return (
    <div className={s.tarjetas}>
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
    <div className={`panel-y ${s.tarjeta}`}>
      <div className={s.tarjetaCabeza}>
        <p className="section-label" style={{ margin: 0, flex: 1 }}>Parámetros del cálculo</p>
        {updated_at && <span className={s.ayuda}>Último cambio: {fechaCL(hoyEnChile(new Date(updated_at)))}</span>}
      </div>
      <div className={s.rejilla}>
        {CAMPOS.map(([k, nombre, ayuda]) => {
          const pct = PORCENTAJES.includes(k);
          const pesos = k === 'uf_respaldo' || k === 'usd_respaldo' || k === 'redondeo_tarifa' || k === 'redondeo_total';
          return (
            <Campo key={k} etiqueta={nombre} ayuda={ayuda}>
              <NumeroInput className="input input-sm" value={pct ? Math.round(p[k] * 1000) / 10 : p[k]} sufijo={pct ? '%' : undefined}
                prefijo={pesos ? '$' : undefined} min={0}
                decimales={k === 'factor_costo_empresa' ? 3 : pct || k === 'uf_respaldo' || k === 'usd_respaldo' ? 2 : 0}
                onChange={v => setP({ ...p, [k]: pct ? v / 100 : v })} mostrarCero ariaLabel={nombre} />
            </Campo>
          );
        })}
      </div>
      {cambiado && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
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
    <div className={`panel-y ${s.tarjeta}`}>
      <div className={s.tarjetaCabeza}>
        <p className="section-label" style={{ margin: 0, flex: 1 }}>Tipos de tarea y multiplicadores</p>
        <button className="btn btn-primary btn-sm" disabled={!!nuevo}
          onClick={() => setNuevo({ clave: '', nombre: '', multiplicador: 1, descripcion: null, activo: true, orden: tipos.length + 1 })}><Plus size={13} /> Nuevo tipo</button>
      </div>
      <p className={s.ayuda}>Horas que se cobran = horas trabajadas × multiplicador. En terreno es × 1; donde la IA acelera (software) se cobran las horas de mercado aunque te tome menos.</p>
      <div>
        {nuevo && <FilaTipo key="nuevo" inicial={nuevo} nuevo onListo={async () => { setNuevo(null); await onCambio(); }} onDescartar={() => setNuevo(null)} />}
        {tipos.map(t => <FilaTipo key={`${t.clave}:${JSON.stringify(t)}`} inicial={t} onListo={onCambio} />)}
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
    try {
      await hhService.guardarTipo({ clave: x.clave, nombre: x.nombre, multiplicador: x.multiplicador, descripcion: x.descripcion, activo: x.activo, orden: x.orden }, !!nuevo);
      success(nuevo ? 'Tipo de tarea creado.' : 'Tipo de tarea guardado.'); await onListo();
    } catch (e) { toastError(mensajeHH(e)); }
  };
  const borrar = async () => {
    if (!confirm(`¿Borrar «${t.nombre}»? Los trabajos tipo que lo usan quedan sin tipo; los cálculos guardados no cambian.`)) return;
    try { await hhService.eliminarTipo(t.clave); success('Tipo de tarea borrado.'); await onListo(); }
    catch (e) { toastError(mensajeHH(e, 'No se pudo borrar.')); }
  };
  return (
    <div className={s.subtarjeta} style={{ opacity: t.activo ? 1 : 0.55 }}>
      <Interruptor activo={t.activo} etiqueta={`${t.nombre || 'Tipo'} activo`} onChange={() => (cambiado ? setT({ ...t, activo: !t.activo }) : guardar({ activo: !t.activo }))} />
      <div style={{ flex: '1 1 260px', minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 96px', gap: 6 }}>
        <input className="input input-sm" value={t.nombre} onChange={e => setT({ ...t, nombre: e.target.value })} aria-label="Nombre del tipo de tarea" placeholder="Nombre" />
        <NumeroInput className="input input-sm" prefijo="×" value={t.multiplicador} decimales={2} min={0} onChange={v => setT({ ...t, multiplicador: v })} ariaLabel="Multiplicador" />
        <input className="input input-sm" style={{ gridColumn: '1 / -1' }} value={t.descripcion ?? ''} onChange={e => setT({ ...t, descripcion: e.target.value })} aria-label="Descripción" placeholder="Descripción" />
      </div>
      <span style={{ display: 'inline-flex', gap: 4, marginLeft: 'auto' }}>
        {cambiado && <button className="btn btn-primary btn-xs" onClick={() => guardar()} aria-label="Guardar el tipo de tarea"><Check size={12} /></button>}
        {cambiado && <button className="btn btn-ghost btn-xs" onClick={() => (nuevo ? onDescartar?.() : setT(inicial))} aria-label="Descartar los cambios"><RotateCcw size={12} /></button>}
        {!nuevo && !cambiado && <button className={s.iconoBtn} onClick={borrar} aria-label={`Borrar ${t.nombre}`}><Trash2 size={15} /></button>}
      </span>
    </div>
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
    <div className={`panel-y ${s.tarjeta}`}>
      <p className="section-label" style={{ margin: 0 }}>Fijar la UF y el dólar a mano</p>
      <p className={s.ayuda}>Para un día en que mindicador falle o dé un valor raro. El valor fijado manda ese día.</p>
      <div className={s.rejilla}>
        <Campo etiqueta="Día"><input className="input input-sm" type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></Campo>
        <Campo etiqueta="UF"><NumeroInput className="input input-sm" prefijo="$" decimales={2} value={f.uf} onChange={v => setF({ ...f, uf: v })} ariaLabel="UF" /></Campo>
        <Campo etiqueta="Dólar"><NumeroInput className="input input-sm" prefijo="$" decimales={2} value={f.usd} onChange={v => setF({ ...f, usd: v })} ariaLabel="Dólar" /></Campo>
      </div>
      <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }} disabled={ocupado || !f.fecha} onClick={fijar}>
        {ocupado ? <Loader2 size={13} className="iv-spin" /> : <Save size={13} />} Fijar
      </button>
      {ultimos && ultimos.length > 0 && (
        <div>
          <p className="label-muted" style={{ margin: '4px 0' }}>Últimos valores guardados</p>
          {ultimos.map(u => (
            <div key={u.fecha} className={s.fila} style={{ padding: '6px 0', borderTop: '1px solid var(--border2)' }}>
              <span>{fechaCL(u.fecha)} · {NOMBRE_FUENTE[u.fuente]}</span>
              <span>UF {formatoIndicador(u.uf)} · US$ {formatoIndicador(u.usd)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
