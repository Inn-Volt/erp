'use client';

/**
 * Presupuesto de ejecución (anteproyecto) de un trabajo (fase 21). Nace copiando la cotización y se
 * edita libremente, partida por partida: cantidades y costos, materiales no cotizados (adicionales),
 * mano de obra en días por persona del equipo (con su costo real) y otros gastos estimados.
 * Cada partida muestra lo que se cobró, lo presupuestado y lo real; cada material, cuánto se ha
 * comprado (de las boletas y facturas asignadas a él) y cada persona, lo registrado.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { realDeLineas, totalLinea, type LineaPresupuesto } from '@/lib/anteproyecto';
import { costoExterno, RETENCION_HONORARIOS } from '@/lib/manoObra';
import { SIN_PARTIDA, TIPOS_COSTO, type Control, type Movimiento, type Presupuesto, type TipoCosto } from '@/lib/controlProyecto';
import { anteproyectoService, type LineaPresupuestoBD } from '@/services/anteproyecto';
import { manoObraService, type TrabajadorElegible } from '@/services/manoObra';
import { useToast } from '@/hooks/useToast';
import { formatCLP } from '@/utils';

type Fila = LineaPresupuesto & { clave: string; id?: string };
const num: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const cant = (v: number) => (Math.round(v * 1000) / 1000).toLocaleString('es-CL');
const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1).replace('.', ',')} %`);
let sec = 0;
const clave = () => `n${Date.now()}${sec++}`;

export default function Anteproyecto({ cotId, presupuesto, control, lineas, movs, editable, onCambio }: {
  cotId: string;
  /** La cotización calculada (partidas, venta). */
  presupuesto: Presupuesto;
  /** El control (cobrado, presupuesto y real por partida). */
  control: Control;
  lineas: LineaPresupuestoBD[];
  movs: Movimiento[];
  /** Puede cambiar el presupuesto (cotizaciones.crear). */
  editable: boolean;
  onCambio: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [filas, setFilas] = useState<Fila[]>(() => lineas.map(l => ({ ...l, clave: l.id })));
  const [quitadas, setQuitadas] = useState<string[]>([]);
  const [cambiado, setCambiado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [armando, setArmando] = useState(false);
  const [equipo, setEquipo] = useState<TrabajadorElegible[]>([]);
  const [retencion, setRetencion] = useState(RETENCION_HONORARIOS);

  // La primera vez, el presupuesto se arma copiando la cotización.
  useEffect(() => {
    if (lineas.length || !editable) return;
    setArmando(true);
    anteproyectoService.asegurar(cotId).then(() => onCambio()).catch(e => toastError(e instanceof Error ? e.message : 'No se pudo armar el presupuesto'))
      .finally(() => setArmando(false));
  }, [cotId, lineas.length, editable, onCambio, toastError]);
  useEffect(() => {
    manoObraService.elegibles().then(setEquipo);
    manoObraService.retencion().then(v => { if (v !== null) setRetencion(v); });
  }, []);

  const real = useMemo(() => realDeLineas(lineas, movs), [lineas, movs]);
  const costoPersona = (t: TrabajadorElegible) => (t.tipo === 'interno' ? t.costo_dia ?? 0 : costoExterno(t.valor_jornada, t.honorarios, retencion));
  const ids = new Set(presupuesto.partidas.map(p => p.id));
  const grupos = [
    ...presupuesto.partidas.map(p => ({ id: p.id, titulo: `${p.numero}. ${p.nombre}` })),
    { id: SIN_PARTIDA, titulo: 'Sin partida' },
  ];
  const deGrupo = (g: string) => filas.filter(f => (g === SIN_PARTIDA ? !f.partida_id || !ids.has(f.partida_id) : f.partida_id === g));

  const cambiar = (c: string, p: Partial<Fila>) => { setFilas(x => x.map(f => (f.clave === c ? { ...f, ...p } : f))); setCambiado(true); };
  const agregar = (partida: string, tipo: TipoCosto) => {
    setFilas(x => [...x, {
      clave: clave(), partida_id: partida || null, tipo, descripcion: '', unidad: tipo === 'mano_obra' ? 'día' : 'un', cantidad: 1, costo_unitario: 0,
      linea_id: null, trabajador_id: null, orden: x.length,
    }]);
    setCambiado(true);
  };
  const quitar = (f: Fila) => { setFilas(x => x.filter(y => y.clave !== f.clave)); if (f.id) setQuitadas(q => [...q, f.id!]); setCambiado(true); };
  const elegirPersona = (f: Fila, id: string) => {
    const t = equipo.find(x => x.id === id);
    cambiar(f.clave, t ? { trabajador_id: t.id, descripcion: t.nombre, unidad: 'día', costo_unitario: costoPersona(t) } : { trabajador_id: null });
  };

  const guardar = async () => {
    if (filas.some(f => !f.descripcion.trim())) { toastError('Cada línea necesita una descripción.'); return; }
    setGuardando(true);
    try {
      const originales = new Map(lineas.map(l => [l.id, l]));
      const iguales = (a: Fila, b: LineaPresupuestoBD) => a.descripcion === b.descripcion && a.cantidad === b.cantidad && a.costo_unitario === b.costo_unitario
        && a.unidad === b.unidad && a.tipo === b.tipo && a.partida_id === b.partida_id && a.trabajador_id === b.trabajador_id;
      await anteproyectoService.guardar(cotId, {
        nuevas: filas.filter(f => !f.id),
        cambiadas: filas.filter(f => f.id && !iguales(f, originales.get(f.id)!)).map(f => ({ ...f, id: f.id!, cotizacion_id: cotId })),
        quitadas,
      });
      success('Presupuesto guardado');
      setCambiado(false); setQuitadas([]);
      onCambio();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };
  const restablecer = async () => {
    if (!confirm('¿Volver a copiar la cotización? Se pierden los cambios hechos al presupuesto.')) return;
    setGuardando(true);
    try { await anteproyectoService.restablecer(cotId); success('Presupuesto copiado de nuevo desde la cotización'); onCambio(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
    finally { setGuardando(false); }
  };

  if (armando) return <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}><Loader2 size={13} className="iv-spin" /> Armando el presupuesto desde la cotización…</p>;
  if (!filas.length && !editable) {
    return <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>Aún no hay presupuesto de ejecución: se compara contra el costo de la cotización.</p>;
  }

  const totalFilas = filas.reduce((s, f) => s + totalLinea(f), 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>
        El presupuesto de ejecución: cómo se va a hacer el trabajo. Nace de la cotización; ajusta cantidades y costos, agrega lo no cotizado y la mano de obra por persona.
        Las boletas y facturas con detalle se descuentan de cada material.</p>
      {grupos.map(g => {
        const lista = deGrupo(g.id);
        const fc = control.filas.find(f => f.id === g.id);
        if (!lista.length && !fc) return null;
        const subtotal = lista.reduce((s, f) => s + totalLinea(f), 0);
        return (
          <div key={g.id || 'sin'} style={{ border: '1px solid var(--border2)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', padding: '0.5rem 0.7rem', background: 'var(--bg3)', fontSize: '0.8rem' }}>
              <b style={{ flex: '1 1 200px', color: 'var(--text)' }}>{g.titulo}</b>
              <span>Cobrado <b>{formatCLP(fc?.venta ?? 0)}</b></span>
              <span>Presupuesto <b>{formatCLP(Math.round(subtotal))}</b></span>
              <span>Real <b style={{ color: (fc?.real ?? 0) > subtotal && subtotal > 0 ? 'var(--danger)' : undefined }}>{formatCLP(fc?.real ?? 0)}</b></span>
              {fc && fc.venta > 0 && <span style={{ color: 'var(--muted)' }}>margen plan {pct(((fc.venta - subtotal) / fc.venta) * 100)}</span>}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="iv-table" style={{ fontSize: '0.78rem', width: '100%' }}>
                <thead><tr><th>Tipo</th><th>Descripción</th><th style={num}>Cantidad</th><th>Unidad</th><th style={num}>Costo unitario</th><th style={num}>Total</th><th>Real</th>{editable && <th />}</tr></thead>
                <tbody>
                  {lista.map(f => {
                    const r = f.id ? real.get(f.id) : undefined;
                    const persona = f.tipo === 'mano_obra';
                    return (
                      <tr key={f.clave}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {editable
                            ? <select className="input" aria-label="Tipo" value={f.tipo} onChange={e => cambiar(f.clave, { tipo: e.target.value as TipoCosto })} style={{ padding: '0.2rem 0.35rem', fontSize: '0.76rem', width: 'auto' }}>
                                {TIPOS_COSTO.map(t => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}</select>
                            : TIPOS_COSTO.find(t => t.clave === f.tipo)?.nombre}
                          {!f.linea_id && <span className="badge" style={{ marginLeft: 4, fontSize: '0.64rem', background: 'var(--y-soft)', color: 'var(--text)' }}>no cotizado</span>}
                        </td>
                        <td style={{ minWidth: 180 }}>
                          {editable && persona && (
                            <select className="input" aria-label="Persona" value={f.trabajador_id || ''} onChange={e => elegirPersona(f, e.target.value)}
                              style={{ padding: '0.2rem 0.35rem', fontSize: '0.76rem', marginBottom: 3 }}>
                              <option value="">Sin persona (monto)</option>
                              {equipo.map(t => <option key={t.id} value={t.id}>{t.nombre} · {t.tipo === 'interno' ? 'interno' : 'externo'}</option>)}
                            </select>
                          )}
                          {editable ? <input className="input" aria-label="Descripción" value={f.descripcion} onChange={e => cambiar(f.clave, { descripcion: e.target.value })}
                              style={{ padding: '0.25rem 0.4rem', fontSize: '0.78rem' }} />
                            : f.descripcion}
                        </td>
                        <td style={num}>{editable ? <NumeroInput className="input" value={f.cantidad} onChange={v => cambiar(f.clave, { cantidad: v })} decimales={3} envoltura={{ width: 80 }} ariaLabel="Cantidad" /> : cant(f.cantidad)}</td>
                        <td>{editable ? <input className="input" aria-label="Unidad" value={f.unidad || ''} onChange={e => cambiar(f.clave, { unidad: e.target.value })} style={{ width: 56, padding: '0.25rem 0.4rem', fontSize: '0.78rem' }} /> : f.unidad}</td>
                        <td style={num}>{editable ? <NumeroInput className="input" prefijo="$" value={f.costo_unitario} onChange={v => cambiar(f.clave, { costo_unitario: v })} envoltura={{ width: 120 }} ariaLabel="Costo unitario" /> : formatCLP(f.costo_unitario)}</td>
                        <td style={{ ...num, fontWeight: 600 }}>{formatCLP(Math.round(totalLinea(f)))}</td>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                          {f.tipo === 'material' && r ? <>comprado {cant(r.cantidad)} de {cant(f.cantidad)} · <b style={{ color: r.monto > totalLinea(f) ? 'var(--danger)' : 'var(--text)' }}>{formatCLP(r.monto)}</b></>
                            : persona && f.trabajador_id && r ? <>{cant(r.cantidad)} h · <b style={{ color: 'var(--text)' }}>{formatCLP(r.monto)}</b></>
                            : f.tipo === 'material' ? 'sin compras' : '—'}
                        </td>
                        {editable && <td><button className="btn btn-ghost btn-xs" aria-label={`Quitar ${f.descripcion}`} onClick={() => quitar(f)}><Trash2 size={12} /></button></td>}
                      </tr>
                    );
                  })}
                  {!lista.length && <tr><td colSpan={editable ? 8 : 7} style={{ color: 'var(--muted)' }}>Sin líneas presupuestadas.</td></tr>}
                </tbody>
              </table>
            </div>
            {editable && (
              <div style={{ display: 'flex', gap: 6, padding: '0.4rem 0.6rem', flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-xs" onClick={() => agregar(g.id, 'material')}><Plus size={12} /> Material</button>
                <button className="btn btn-ghost btn-xs" onClick={() => agregar(g.id, 'mano_obra')}><Plus size={12} /> Mano de obra</button>
                <button className="btn btn-ghost btn-xs" onClick={() => agregar(g.id, 'operacion')}><Plus size={12} /> Operación</button>
              </div>
            )}
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.86rem', color: 'var(--text)' }}>Presupuesto total <b>{formatCLP(Math.round(totalFilas))}</b>
          <span style={{ color: 'var(--muted)' }}> · cotizado {formatCLP(control.total.cotizado)}</span></span>
        <span style={{ flex: 1 }} />
        {editable && <>
          <button className="btn btn-ghost btn-sm" onClick={restablecer} disabled={guardando}><RotateCcw size={13} /> Copiar de nuevo la cotización</button>
          <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando || !cambiado}>{guardando ? <Loader2 size={13} className="iv-spin" /> : <Save size={13} />} Guardar presupuesto</button>
        </>}
      </div>
    </div>
  );
}
