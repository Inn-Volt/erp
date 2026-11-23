'use client';

/**
 * Registrar días de mano de obra o horas de servicio de un trabajo (fase 22), o corregir un registro.
 * La fecha, la línea del presupuesto (o «sin línea» y la partida) y una o varias personas, cada una
 * con su modalidad (interno: su ficha; externo: líquido y boleta; líquido: tal cual), días u horas
 * (máximo 24 h por registro), valor por día u hora y «ya se pagó». Antes de guardar se ve el costo;
 * el que queda lo calcula la base (mano_obra_reglas). Lo usa quien paga o edita cotizaciones; el
 * técnico registra sus horas en «Mis horas».
 */

import { useState } from 'react';
import { HardHat, Loader2, Plus, X } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import type { ManoObraCP, ModalidadPago, PartidaOpcion } from '@/lib/controlProyecto';
import { costoRegistro, HORAS_JORNADA, type LineaEntrada } from '@/lib/analisisProyecto';
import { manoObraService, type NuevoRegistro, type TrabajadorElegible } from '@/services/manoObra';
import { MODALIDADES } from '@/components/trabajos/analisis/Personas';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP } from '@/utils';

interface Fila {
  clave: number; trabajador_id: string; nombre: string; modalidad: ModalidadPago;
  /** Días (mano de obra) u horas (servicio). */
  cantidad: number;
  /** Externo o líquido: lo que se paga por día u hora. */
  valor: number;
  honorarios: boolean; pagado: boolean; documento: string;
}
const lbl = { display: 'flex', flexDirection: 'column', gap: 3 } as const;
let sec = 0;

export default function RegistrarTrabajo({ cotId, clase, lineas, partidas, equipo, retencion, registro, base, onCerrar, onListo }: {
  cotId: string; clase: 'mano_obra' | 'servicio';
  /** Las líneas del presupuesto de esta clase (guardadas). */
  lineas: LineaEntrada[];
  partidas: PartidaOpcion[]; equipo: TrabajadorElegible[]; retencion: number;
  /** Corregir este registro (en vez de registrar uno nuevo). */
  registro?: ManoObraCP;
  /** «Igual que el día…»: la gente de ese día. */
  base?: ManoObraCP[];
  onCerrar: () => void; onListo: () => void;
}) {
  const { success, error: toastError } = useToast();
  const porDia = clase === 'mano_obra';
  const unidad = porDia ? 'días' : 'horas';
  const fichaDe = (id: string | null | undefined) => equipo.find(t => t.id === id) || null;
  const jornadaDe = (id: string | null | undefined) => fichaDe(id)?.horas_dia || HORAS_JORNADA;

  const desdeRegistro = (r: ManoObraCP, conPago: boolean): Fila => {
    const cantidad = porDia ? r.jornadas ?? (r.horas !== null ? r.horas / jornadaDe(r.trabajador_id) : 1)
      : r.horas ?? (r.jornadas !== null && r.jornadas !== undefined ? r.jornadas * jornadaDe(r.trabajador_id) : 1);
    return {
      clave: sec++, trabajador_id: r.trabajador_id || '', nombre: r.trabajador_id ? '' : r.nombre, modalidad: r.tipo,
      cantidad: Math.round(cantidad * 100) / 100, valor: r.monto_liquido !== null && cantidad > 0 ? Math.round(r.monto_liquido / cantidad) : 0,
      honorarios: r.honorarios, pagado: conPago && r.pagado, documento: conPago ? r.documento || '' : '',
    };
  };
  const desdeLinea = (l: LineaEntrada | undefined): Fila => {
    const f = fichaDe(l?.trabajador_id);
    const modalidad: ModalidadPago = l?.modalidad || f?.tipo || 'externo';
    return {
      clave: sec++, trabajador_id: f?.id || '', nombre: '', modalidad, cantidad: porDia ? 1 : f?.horas_dia || 1,
      valor: modalidad === 'interno' ? 0 : l?.valor_liquido ?? (f ? (porDia ? f.valor_jornada : Math.round(f.valor_jornada / (f.horas_dia || HORAS_JORNADA))) : 0),
      honorarios: l?.honorarios ?? f?.honorarios ?? false, pagado: false, documento: '',
    };
  };

  const [fecha, setFecha] = useState(registro?.fecha || fechaLocal());
  const [lineaId, setLineaId] = useState<string>(() => registro ? registro.presupuesto_linea_id || '' : base?.[0]?.presupuesto_linea_id || (lineas.length === 1 ? lineas[0].id! : ''));
  const [partida, setPartida] = useState<string>(registro?.partida_id || base?.[0]?.partida_id || '');
  const [filas, setFilas] = useState<Fila[]>(() => registro ? [desdeRegistro(registro, true)]
    : base?.length ? base.map(r => desdeRegistro(r, false))
    : [desdeLinea(lineas.find(l => l.id === (lineas.length === 1 ? lineas[0].id : '')))]);
  const [guardando, setGuardando] = useState(false);
  const linea = lineas.find(l => l.id === lineaId);

  const cambiar = (clave: number, p: Partial<Fila>) => setFilas(x => x.map(f => (f.clave === clave ? { ...f, ...p } : f)));
  const elegirPersona = (f: Fila, id: string) => {
    const t = fichaDe(id);
    if (!t) { cambiar(f.clave, { trabajador_id: '', modalidad: f.modalidad === 'interno' ? 'externo' : f.modalidad }); return; }
    cambiar(f.clave, {
      trabajador_id: id, nombre: '', modalidad: f.modalidad === 'liquido' ? 'liquido' : t.tipo, honorarios: t.honorarios,
      valor: t.tipo === 'externo' ? (porDia ? t.valor_jornada : Math.round(t.valor_jornada / (t.horas_dia || HORAS_JORNADA))) : f.valor,
      ...(!porDia && t.tipo === 'interno' && f.cantidad === 1 ? { cantidad: t.horas_dia } : {}),
    });
  };
  const elegirLinea = (id: string) => {
    setLineaId(id);
    const l = lineas.find(x => x.id === id);
    // Si la línea es de una persona y aún no está en la lista, se agrega (reemplaza una fila vacía).
    if (l?.trabajador_id && !filas.some(f => f.trabajador_id === l.trabajador_id)) {
      const vacias = filas.filter(f => !f.trabajador_id && !f.nombre.trim());
      setFilas(x => [...x.filter(f => !vacias.includes(f)), desdeLinea(l)]);
    }
  };

  const costo = (f: Fila) => costoRegistro({ modalidad: f.modalidad, clase, cantidad: f.cantidad, valor: f.valor, honorarios: f.honorarios }, fichaDe(f.trabajador_id), retencion);
  const total = filas.reduce((s, f) => s + costo(f), 0);

  const guardar = async () => {
    const validas = filas.filter(f => f.trabajador_id || f.nombre.trim());
    if (!validas.length) { toastError('Agrega a quién se le registra.'); return; }
    for (const f of validas) {
      const quien = fichaDe(f.trabajador_id)?.nombre || f.nombre.trim();
      if (!(f.cantidad > 0)) { toastError(`Indica los ${unidad} de ${quien}.`); return; }
      if (!porDia && f.cantidad > 24) { toastError(`Las horas de un registro van hasta 24 (${quien}).`); return; }
      if (f.modalidad === 'interno' && fichaDe(f.trabajador_id)?.tipo !== 'interno') { toastError(`${quien}: «interno» es para el personal con ficha interna.`); return; }
      if (f.modalidad !== 'interno' && !(f.valor > 0)) { toastError(`Indica cuánto se le paga a ${quien} por ${porDia ? 'día' : 'hora'}.`); return; }
    }
    const fila = (f: Fila): NuevoRegistro => ({
      cotizacion_id: cotId, fecha, tipo: f.modalidad, clase,
      trabajador_id: f.trabajador_id || null, ...(f.trabajador_id ? {} : { nombre: f.nombre.trim() }),
      presupuesto_linea_id: linea?.id || null, partida_id: linea ? linea.partida_id : partida || null,
      jornadas: porDia ? f.cantidad : null, horas: porDia ? null : f.cantidad,
      monto_liquido: f.modalidad === 'interno' ? null : Math.round(f.valor * f.cantidad),
      honorarios: f.modalidad === 'externo' && f.honorarios,
      pagado: f.modalidad !== 'interno' && f.pagado, documento: f.modalidad === 'externo' && f.documento.trim() ? f.documento.trim() : null,
    });
    setGuardando(true);
    try {
      if (registro) {
        await manoObraService.corregir(registro.id, fila(validas[0]));
        success('Registro corregido');
      } else {
        await manoObraService.registrar(validas.map(fila));
        success(`${porDia ? 'Días' : 'Horas'} registrados: ${validas.length} ${validas.length === 1 ? 'persona' : 'personas'}`);
      }
      onListo();
    } catch (e) { toastError(e instanceof Error ? e.message : (e as { message?: string })?.message || 'No se pudo registrar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 250 }}>
      <div className="modal-box" style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0, flex: 1 }}><HardHat size={15} />
            {registro ? ' Corregir el registro' : porDia ? ' Registrar días de mano de obra' : ' Registrar horas de servicio'}</p>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
            <label style={lbl}><span className="label-muted">Fecha</span>
              <input className="input" type="date" value={fecha} max={fechaLocal()} onChange={e => setFecha(e.target.value)} /></label>
            <label style={{ ...lbl, gridColumn: 'span 2' }}><span className="label-muted">Línea del presupuesto</span>
              <select className="input" value={lineaId} onChange={e => elegirLinea(e.target.value)}>
                <option value="">Sin línea (elegir la partida)</option>
                {lineas.map(l => <option key={l.id} value={l.id}>{l.descripcion}{(() => { const p = partidas.find(x => x.id === l.partida_id); return p ? ` · ${p.numero}. ${p.nombre}` : ''; })()}</option>)}
              </select></label>
            {!lineaId && partidas.length > 0 && (
              <label style={lbl}><span className="label-muted">Partida</span>
                <select className="input" value={partida} onChange={e => setPartida(e.target.value)}>
                  <option value="">Sin partida</option>
                  {partidas.map(p => <option key={p.id} value={p.id}>{p.numero}. {p.nombre}</option>)}
                </select></label>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filas.map(f => {
              const ficha = fichaDe(f.trabajador_id);
              return (
                <div key={f.clave} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 6, alignItems: 'end', padding: '0.6rem', borderRadius: 8, background: 'var(--bg3)' }}>
                  <label style={{ ...lbl, gridColumn: 'span 2' }}><span className="label-muted">Persona</span>
                    <select className="input" value={f.trabajador_id} onChange={e => elegirPersona(f, e.target.value)}>
                      <option value="">Otra persona (sin ficha)</option>
                      {equipo.map(t => <option key={t.id} value={t.id}>{t.nombre} · {t.tipo}{t.oficio ? ` · ${t.oficio}` : ''}</option>)}
                    </select></label>
                  {!f.trabajador_id && <label style={lbl}><span className="label-muted">Nombre</span>
                    <input className="input" value={f.nombre} onChange={e => cambiar(f.clave, { nombre: e.target.value })} placeholder="Nombre o empresa" /></label>}
                  <label style={lbl}><span className="label-muted">Modalidad</span>
                    <select className="input" value={f.modalidad} onChange={e => cambiar(f.clave, { modalidad: e.target.value as ModalidadPago })}>
                      {MODALIDADES.map(m => <option key={m.clave} value={m.clave} disabled={m.clave === 'interno' && ficha?.tipo !== 'interno'} title={m.ayuda}>{m.nombre}</option>)}
                    </select></label>
                  <label style={lbl}><span className="label-muted">{porDia ? 'Días' : 'Horas'}</span>
                    <NumeroInput className="input" value={f.cantidad} decimales={2} sufijo={porDia ? 'd' : 'h'} ariaLabel={porDia ? 'Días' : 'Horas'} onChange={v => cambiar(f.clave, { cantidad: v })} /></label>
                  {f.modalidad !== 'interno' && <label style={lbl}><span className="label-muted">{f.modalidad === 'externo' ? 'Líquido' : 'Monto'} por {porDia ? 'día' : 'hora'}</span>
                    <NumeroInput className="input" prefijo="$" value={f.valor} ariaLabel="Valor" onChange={v => cambiar(f.clave, { valor: v })} /></label>}
                  {f.modalidad === 'externo' && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', color: 'var(--text)', cursor: 'pointer', paddingBottom: 8 }}>
                    <input type="checkbox" checked={f.honorarios} onChange={e => cambiar(f.clave, { honorarios: e.target.checked })} style={{ accentColor: 'var(--y-brand)' }} /> Boleta de honorarios</label>}
                  {f.modalidad === 'externo' && f.honorarios && f.pagado && <label style={lbl}><span className="label-muted">N° de la boleta</span>
                    <input className="input" value={f.documento} onChange={e => cambiar(f.clave, { documento: e.target.value })} placeholder="Opcional" /></label>}
                  {f.modalidad !== 'interno' && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', color: 'var(--text)', cursor: 'pointer', paddingBottom: 8 }}>
                    <input type="checkbox" checked={f.pagado} onChange={e => cambiar(f.clave, { pagado: e.target.checked })} style={{ accentColor: 'var(--y-brand)' }} /> Ya se pagó</label>}
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 8 }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}
                      title={f.modalidad === 'externo' && f.honorarios ? `Incluye la retención de ${String(retencion).replace('.', ',')} % que se paga al SII` : undefined}>
                      {f.modalidad === 'interno' && ficha?.costo_dia === null ? 'costo de su ficha' : `costo ${formatCLP(costo(f))}`}</span>
                    {!registro && filas.length > 1 && <button className="btn btn-ghost btn-xs" aria-label="Quitar" onClick={() => setFilas(x => x.filter(y => y.clave !== f.clave))}><X size={12} /></button>}
                  </span>
                </div>
              );
            })}
            {!registro && <button className="btn btn-ghost btn-xs" style={{ alignSelf: 'flex-start' }} onClick={() => setFilas(x => [...x, desdeLinea(undefined)])}><Plus size={12} /> Persona</button>}
          </div>
        </div>
        <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.86rem', color: 'var(--text)' }}>Cuesta <b>{formatCLP(total)}</b></span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <HardHat size={14} />} {registro ? 'Guardar' : 'Registrar'}</button>
        </div>
      </div>
    </div>
  );
}
