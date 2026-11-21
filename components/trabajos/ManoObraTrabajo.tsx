'use client';

/**
 * Mano de obra de un trabajo, día a día (fase 20). «Registrar día»: la fecha, la partida (opcional),
 * las horas de cada interno (por omisión su jornada completa) y lo que se les paga a los externos
 * (líquido, con o sin boleta de honorarios). Muestra cuánto cuesta antes de guardar; el costo que
 * queda lo calcula la base. Los gastos de operación del día (bencina, comida…) se rinden aparte.
 * Quien paga o edita cotizaciones registra a todos; quien tiene ficha en el equipo, sus propias horas.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarPlus, Copy, HardHat, Loader2, Plus, Receipt, Trash2, X } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import SelectorPartida, { usePartidasDe } from '@/components/trabajos/SelectorPartida';
import { manoObraService, type NuevoRegistro, type RegistroManoObra, type TrabajadorElegible } from '@/services/manoObra';
import { costoExterno, costoHoras, RETENCION_HONORARIOS } from '@/lib/manoObra';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP, formatDate } from '@/utils';

interface FilaExterno { clave: number; trabajador_id: string; nombre: string; monto: number; honorarios: boolean; pagado: boolean; documento: string }
const num = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
const fila: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.84rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border2)', color: 'var(--text)' };

export default function ManoObraTrabajo({ cotId, verCostos, registraOtros, onCambio, onRendirGasto }: {
  cotId: string; verCostos: boolean;
  /** Paga o edita cotizaciones: registra a todo el equipo y marca pagos. */
  registraOtros: boolean;
  onCambio: () => void;
  onRendirGasto?: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [equipo, setEquipo] = useState<TrabajadorElegible[]>([]);
  const [registros, setRegistros] = useState<RegistroManoObra[]>([]);
  const [retencion, setRetencion] = useState(RETENCION_HONORARIOS);
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(fechaLocal());
  const [partida, setPartida] = useState('');
  const [horas, setHoras] = useState<Record<string, number | null>>({});   // interno → horas (null = no vino)
  const [externos, setExternos] = useState<FilaExterno[]>([]);
  const [guardando, setGuardando] = useState(false);
  const partidas = usePartidasDe(cotId, true);

  const cargar = useCallback(() => { manoObraService.registros(cotId).then(setRegistros); }, [cotId]);
  useEffect(() => {
    cargar();
    manoObraService.elegibles().then(setEquipo);
    manoObraService.retencion().then(v => { if (v !== null) setRetencion(v); });
  }, [cargar]);

  const internos = useMemo(() => equipo.filter(t => t.tipo === 'interno'), [equipo]);
  const fichasExternas = useMemo(() => equipo.filter(t => t.tipo === 'externo'), [equipo]);
  const yo = equipo.find(t => t.es_yo)?.id;
  const ultimoDia = registros[0]?.fecha;

  const abrir = (base?: string) => {
    const delDia = base ? registros.filter(r => r.fecha === base) : [];
    setHoras(Object.fromEntries(internos.map(t => {
      const r = delDia.find(x => x.trabajador_id === t.id);
      return [t.id, base ? (r ? Number(r.horas) : null) : (internos.length === 1 ? t.horas_dia : null)];
    })));
    setExternos(delDia.filter(r => r.tipo === 'externo').map((r, i) => ({
      clave: i, trabajador_id: r.trabajador_id || '', nombre: r.nombre, monto: Number(r.monto_liquido) || 0, honorarios: r.honorarios, pagado: false, documento: '',
    })));
    setPartida(base ? delDia[0]?.partida_id || '' : '');
    setFecha(fechaLocal());
    setAbierto(true);
  };
  const agregarExterno = () => {
    const f = fichasExternas[0];
    setExternos(x => [...x, { clave: Date.now(), trabajador_id: f?.id || '', nombre: '', monto: f ? f.valor_jornada : 0, honorarios: f ? f.honorarios : false, pagado: false, documento: '' }]);
  };
  const cambiarExterno = (clave: number, p: Partial<FilaExterno>) => setExternos(x => x.map(e => (e.clave === clave ? { ...e, ...p } : e)));
  const elegirFicha = (clave: number, id: string) => {
    const f = fichasExternas.find(t => t.id === id);
    cambiarExterno(clave, { trabajador_id: id, ...(f ? { monto: f.valor_jornada, honorarios: f.honorarios } : {}) });
  };

  // Lo que va a costar el día (solo quien ve costos).
  const costoInterno = (t: TrabajadorElegible, h: number) => (t.costo_dia === null ? 0 : costoHoras(t.costo_dia, h, t.horas_dia));
  const totalDia = internos.reduce((s, t) => s + (horas[t.id] ? costoInterno(t, horas[t.id]!) : 0), 0)
    + externos.reduce((s, e) => s + costoExterno(e.monto, e.honorarios, retencion), 0);

  const guardar = async () => {
    const filas: NuevoRegistro[] = [
      ...internos.filter(t => (horas[t.id] || 0) > 0).map(t => ({
        cotizacion_id: cotId, fecha, tipo: 'interno' as const, trabajador_id: t.id, horas: horas[t.id]!, partida_id: partida || null,
      })),
      ...externos.filter(e => e.monto > 0 && (e.trabajador_id || e.nombre.trim())).map(e => ({
        cotizacion_id: cotId, fecha, tipo: 'externo' as const, trabajador_id: e.trabajador_id || null, nombre: e.trabajador_id ? undefined : e.nombre.trim(),
        monto_liquido: e.monto, honorarios: e.honorarios, pagado: e.pagado, documento: e.documento.trim() || null, partida_id: partida || null,
      })),
    ];
    if (!filas.length) { toastError('Marca quién trabajó (con sus horas) o agrega un pago a un externo.'); return; }
    if (internos.some(t => (horas[t.id] || 0) > 24)) { toastError('Las horas de un día van hasta 24.'); return; }
    setGuardando(true);
    try {
      await manoObraService.registrar(filas);
      success(`Día registrado: ${filas.length} ${filas.length === 1 ? 'registro' : 'registros'}`);
      setAbierto(false); cargar(); onCambio();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo registrar'); }
    finally { setGuardando(false); }
  };
  const pagar = async (r: RegistroManoObra) => {
    const doc = !r.pagado && r.honorarios && !r.documento ? prompt('N° de la boleta de honorarios (opcional)') : undefined;
    try { await manoObraService.marcarPagado(r.id, !r.pagado, doc ?? undefined); cargar(); onCambio(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
  };
  const borrar = async (r: RegistroManoObra) => {
    if (!confirm(`¿Quitar ${r.nombre} del ${formatDate(r.fecha)}?`)) return;
    try { await manoObraService.eliminar(r.id); cargar(); onCambio(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo quitar'); }
  };

  const dias = useMemo(() => {
    const m = new Map<string, RegistroManoObra[]>();
    for (const r of registros) m.set(r.fecha, [...(m.get(r.fecha) || []), r]);
    return [...m.entries()];
  }, [registros]);
  const total = registros.reduce((s, r) => s + Number(r.costo), 0);
  const porPagar = registros.filter(r => r.tipo === 'externo' && !r.pagado).reduce((s, r) => s + Number(r.costo), 0);
  const etiquetaPartida = (id: string | null) => { const p = partidas.find(x => x.id === id); return p ? ` · partida ${p.numero}` : ''; };

  if (!equipo.length && !registros.length) {
    return (
      <div>
        <p className="label-muted" style={{ marginBottom: 6 }}>Mano de obra</p>
        <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>
          {registraOtros ? <>Para registrar horas y pagos, agrega al personal y a los externos en <Link href="/equipo">Equipo y costos</Link>.</>
            : 'Para registrar tus horas, pide que te agreguen al equipo.'}</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, gap: 8, flexWrap: 'wrap' }}>
        <p className="label-muted" style={{ margin: 0, flex: 1 }}>
          Mano de obra{verCostos && total > 0 ? ` · ${formatCLP(total)}` : ''}{verCostos && porPagar > 0 ? <span style={{ color: 'var(--y)' }}> · por pagar {formatCLP(porPagar)}</span> : null}</p>
        {!abierto && equipo.length > 0 && <>
          {ultimoDia && <button className="btn btn-ghost btn-xs" onClick={() => abrir(ultimoDia)} title={`Copia a la gente del ${formatDate(ultimoDia)}`}><Copy size={12} /> Igual que el {formatDate(ultimoDia)}</button>}
          <button className="btn btn-ghost btn-xs" onClick={() => abrir()}><CalendarPlus size={12} /> Registrar día</button>
        </>}
      </div>

      {abierto && (
        <div style={{ padding: '0.7rem', background: 'var(--bg3)', borderRadius: 8, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span className="label-muted">Fecha</span>
              <input className="input" type="date" value={fecha} max={fechaLocal()} onChange={e => setFecha(e.target.value)} /></label>
            <SelectorPartida partidas={partidas} value={partida} onChange={setPartida} />
          </div>

          {internos.length > 0 && (
            <div>
              <p className="label-muted" style={{ margin: '0 0 4px' }}>{yo && internos.length === 1 ? 'Mis horas' : 'Personal interno: marca quién vino'}</p>
              {internos.map(t => {
                const h = horas[t.id];
                return (
                  <div key={t.id} style={{ ...fila, borderBottom: '1px solid var(--border2)' }}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 0, cursor: 'pointer' }}>
                      <input type="checkbox" checked={h !== null && h !== undefined} style={{ accentColor: 'var(--y-brand)' }}
                        onChange={e => setHoras(x => ({ ...x, [t.id]: e.target.checked ? t.horas_dia : null }))} />
                      <span>{t.nombre}{t.oficio ? <span style={{ color: 'var(--muted)' }}> · {t.oficio}</span> : null}</span>
                    </label>
                    {h !== null && h !== undefined && <>
                      <NumeroInput className="input" sufijo="h" value={h} onChange={v => setHoras(x => ({ ...x, [t.id]: v }))} envoltura={{ width: 90 }} ariaLabel={`Horas de ${t.nombre}`} />
                      {verCostos && t.costo_dia !== null && <span style={{ minWidth: 80, textAlign: 'right', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{formatCLP(costoInterno(t, h))}</span>}
                    </>}
                  </div>
                );
              })}
            </div>
          )}

          {registraOtros && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <p className="label-muted" style={{ margin: 0, flex: 1 }}>Externos y subcontratos (lo que se les paga líquido)</p>
                <button className="btn btn-ghost btn-xs" onClick={agregarExterno}><Plus size={12} /> Externo</button>
              </div>
              {externos.map(e => (
                <div key={e.clave} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 6, alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid var(--border2)' }}>
                  <select className="input" aria-label="Externo" value={e.trabajador_id} onChange={ev => elegirFicha(e.clave, ev.target.value)}>
                    {fichasExternas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    <option value="">Otro (sin ficha)</option>
                  </select>
                  {!e.trabajador_id && <input className="input" aria-label="Nombre" value={e.nombre} onChange={ev => cambiarExterno(e.clave, { nombre: ev.target.value })} placeholder="Nombre o empresa" />}
                  <NumeroInput className="input" prefijo="$" ariaLabel="Líquido" value={e.monto} onChange={v => cambiarExterno(e.clave, { monto: v })} />
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', color: 'var(--text)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={e.honorarios} onChange={ev => cambiarExterno(e.clave, { honorarios: ev.target.checked })} style={{ accentColor: 'var(--y-brand)' }} /> Boleta de honorarios</label>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', color: 'var(--text)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={e.pagado} onChange={ev => cambiarExterno(e.clave, { pagado: ev.target.checked })} style={{ accentColor: 'var(--y-brand)' }} /> Ya se pagó</label>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                    {verCostos && <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}
                      title={e.honorarios ? `Incluye la retención de ${String(retencion).replace('.', ',')} % que se paga al SII` : 'Sin boleta: el costo es lo que se le paga'}>
                      costo {formatCLP(costoExterno(e.monto, e.honorarios, retencion))}</span>}
                    <button className="btn btn-ghost btn-xs" aria-label="Quitar" onClick={() => setExternos(x => x.filter(y => y.clave !== e.clave))}><X size={12} /></button>
                  </span>
                </div>
              ))}
              {externos.length === 0 && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>Ninguno este día.</p>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {onRendirGasto && <button className="btn btn-ghost btn-sm" onClick={onRendirGasto} title="Bencina, peajes, comida, materiales en terreno…"><Receipt size={13} /> Gasto de operación</button>}
            <span style={{ flex: 1 }} />
            {verCostos && totalDia > 0 && <span style={{ fontSize: '0.84rem', color: 'var(--text)' }}>El día cuesta <b>{formatCLP(totalDia)}</b></span>}
            <button className="btn btn-ghost btn-sm" onClick={() => setAbierto(false)}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={13} className="iv-spin" /> : <HardHat size={13} />} Guardar día</button>
          </div>
        </div>
      )}

      {dias.length === 0 ? <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>Sin mano de obra todavía. Registra cada día quién trabajó: suma al costo real del trabajo.</p>
        : dias.map(([dia, lista]) => (
          <div key={dia} style={{ marginBottom: 6 }}>
            <p style={{ margin: '4px 0 0', fontSize: '0.76rem', color: 'var(--muted)', fontWeight: 600 }}>
              {formatDate(dia)}{verCostos ? ` · ${formatCLP(lista.reduce((s, r) => s + Number(r.costo), 0))}` : ''}</p>
            {lista.map(r => (
              <div key={r.id} style={fila}>
                {r.tipo === 'externo' ? <HardHat size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} /> : <CalendarPlus size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
                <span style={{ flex: 1, minWidth: 0 }}>{r.nombre}
                  <span style={{ color: 'var(--muted)' }}> · {r.tipo === 'interno' ? `${num(Number(r.horas))} h` : `${formatCLP(Number(r.monto_liquido))} líquido${r.honorarios ? ' con boleta' : ''}`}{etiquetaPartida(r.partida_id)}</span></span>
                {verCostos && <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{formatCLP(Number(r.costo))}</span>}
                {r.tipo === 'externo' && (
                  <button className="badge" disabled={!registraOtros} onClick={() => pagar(r)} title={registraOtros ? 'Cambiar' : undefined}
                    style={{ border: 'none', cursor: registraOtros ? 'pointer' : 'default', fontSize: '0.68rem', background: r.pagado ? 'var(--success-soft)' : 'var(--y-soft)', color: r.pagado ? 'var(--success)' : 'var(--text)' }}>
                    {r.pagado ? `Pagado${r.documento ? ` · BH ${r.documento}` : ''}` : 'Por pagar'}</button>
                )}
                {(registraOtros || (r.trabajador_id === yo && !r.pagado)) &&
                  <button className="btn btn-ghost btn-xs" onClick={() => borrar(r)} aria-label={`Quitar ${r.nombre}`}><Trash2 size={12} /></button>}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
