'use client';

/**
 * Finanzas → Equipo y costos (fase 20): de quién sale la mano de obra de los trabajos.
 *   · Personal interno: su sueldo líquido y sus descuentos (AFP, salud, cesantía y otros, los de cada
 *     uno) dan el bruto; con los aportes del empleador y su jornada (horas, días del mes, colación,
 *     movilización…), el costo de un día y de una hora. Con cuenta en el ERP registra sus horas.
 *   · Externos y subcontratos: lo que se les paga líquido por jornada y si dan boleta de honorarios
 *     (entonces el costo incluye la retención que se paga al SII; el % está aquí mismo).
 * Lo ve y lo cambia quien paga las rendiciones o configura el sistema (los sueldos no los ve nadie más).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, HardHat, Loader2, Pencil, Plus, UserRound } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import NumeroInput from '@/components/NumeroInput';
import { Modal } from '@/components/cotizador/ui';
import { fichaVacia, manoObraService, type NuevoTrabajador, type TipoTrabajador, type Trabajador } from '@/services/manoObra';
import { vendedoresService } from '@/services/vendedores';
import { costoDia, costoExterno, costoHora, descuentos, RETENCION_HONORARIOS } from '@/lib/manoObra';
import { avisoRut, formatearRut } from '@/lib/rut';
import { useToast } from '@/hooks/useToast';
import { formatCLP } from '@/utils';

const lbl = { display: 'block', marginBottom: 5 } as const;
const pctTxt = (v: number) => String(v).replace('.', ',');

function FormFicha({ ficha, retencion, cuentas, onCerrar, onListo }: {
  ficha: Trabajador | NuevoTrabajador; retencion: number; cuentas: { id: string; nombre: string }[]; onCerrar: () => void; onListo: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [d, setD] = useState<NuevoTrabajador>(() => { const { id: _id, ...resto } = ficha as Trabajador; void _id; return resto; });
  const [guardando, setGuardando] = useState(false);
  const set = (p: Partial<NuevoTrabajador>) => setD(x => ({ ...x, ...p }));
  const id = 'id' in ficha ? ficha.id : null;
  const interno = d.tipo === 'interno';

  const guardar = async () => {
    if (!d.nombre.trim()) { toastError('Indica el nombre'); return; }
    if (d.rut && avisoRut(d.rut)) { toastError(avisoRut(d.rut) || 'RUT inválido'); return; }
    if (interno && d.afp_pct + d.salud_pct + d.cesantia_pct >= 100) { toastError('Los descuentos (AFP + salud + cesantía) deben sumar menos de 100 %.'); return; }
    setGuardando(true);
    try {
      await manoObraService.guardarFicha(id, { ...d, rut: d.rut ? formatearRut(d.rut) : null, usuario_id: interno ? d.usuario_id : null });
      success(id ? 'Ficha actualizada' : 'Agregado al equipo');
      onListo();
    } catch (e) { toastError(e instanceof Error && /duplicate|usuario_id/.test(e.message) ? 'Esa cuenta ya está ligada a otra ficha.' : e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  const dia = costoDia(d), hora = costoHora(d), desc = descuentos(d);
  const bruto = costoExterno(d.valor_jornada, d.honorarios, retencion);
  return (
    <Modal titulo={<>{interno ? <UserRound size={15} /> : <HardHat size={15} />} {id ? 'Editar' : 'Nuevo'} {interno ? 'interno' : 'externo o subcontrato'}</>}
      onCerrar={onCerrar} ancho={600} pie={<>
        <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Check size={14} />} Guardar</button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12 }}>
        <div style={{ gridColumn: 'span 2' }}><label className="label-muted" style={lbl}>Nombre *</label>
          <input className="input" autoFocus value={d.nombre} onChange={e => set({ nombre: e.target.value })} placeholder={interno ? 'Joaquín Soto' : 'Pedro Rojas / Eléctrica Sur SpA'} /></div>
        <div><label className="label-muted" style={lbl}>RUT</label>
          <input className="input" value={d.rut || ''} onChange={e => set({ rut: e.target.value })} onBlur={() => d.rut && set({ rut: formatearRut(d.rut) })} placeholder="12.345.678-5" />
          {d.rut && avisoRut(d.rut) && <span style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>{avisoRut(d.rut)}</span>}</div>
        <div><label className="label-muted" style={lbl}>{interno ? 'Cargo' : 'Oficio'}</label>
          <input className="input" value={d.oficio || ''} onChange={e => set({ oficio: e.target.value })} placeholder={interno ? 'Maestro eléctrico' : 'Ayudante, subcontrato…'} /></div>
        {interno ? <>
          <div><label className="label-muted" style={lbl} title="Lo que recibe al mes, sin colación ni movilización">Sueldo líquido mensual</label>
            <NumeroInput className="input" prefijo="$" value={d.sueldo_liquido} onChange={v => set({ sueldo_liquido: v })} /></div>
          <div><label className="label-muted" style={lbl} title="10 % + la comisión de su AFP">AFP (%)</label>
            <NumeroInput className="input" sufijo="%" mostrarCero value={d.afp_pct} onChange={v => set({ afp_pct: v })} max={30} /></div>
          <div><label className="label-muted" style={lbl} title="7 % (Fonasa o lo legal de la Isapre)">Salud (%)</label>
            <NumeroInput className="input" sufijo="%" mostrarCero value={d.salud_pct} onChange={v => set({ salud_pct: v })} max={30} /></div>
          <div><label className="label-muted" style={lbl} title="0,6 % con contrato indefinido; 0 % a plazo fijo">Seguro de cesantía (%)</label>
            <NumeroInput className="input" sufijo="%" mostrarCero value={d.cesantia_pct} onChange={v => set({ cesantia_pct: v })} max={10} /></div>
          <div><label className="label-muted" style={lbl} title="Plan adicional de la Isapre, impuesto único, otros descuentos fijos">Otros descuentos ($ al mes)</label>
            <NumeroInput className="input" prefijo="$" value={d.otros_descuentos} onChange={v => set({ otros_descuentos: v })} /></div>
          <div><label className="label-muted" style={lbl} title="Seguro de cesantía del empleador, SIS, mutual… (lo que paga la empresa sobre el bruto)">Aportes del empleador (%)</label>
            <NumeroInput className="input" sufijo="%" value={d.aportes_pct} onChange={v => set({ aportes_pct: v })} max={100} /></div>
          <div><label className="label-muted" style={lbl}>Días trabajados al mes</label>
            <NumeroInput className="input" value={d.dias_mes} onChange={v => set({ dias_mes: v })} min={1} max={31} /></div>
          <div><label className="label-muted" style={lbl}>Horas de la jornada</label>
            <NumeroInput className="input" sufijo="h" value={d.horas_dia} onChange={v => set({ horas_dia: v })} min={1} max={24} /></div>
          <div><label className="label-muted" style={lbl}>Colación por día</label>
            <NumeroInput className="input" prefijo="$" value={d.colacion_dia} onChange={v => set({ colacion_dia: v })} /></div>
          <div><label className="label-muted" style={lbl}>Movilización por día</label>
            <NumeroInput className="input" prefijo="$" value={d.movilizacion_dia} onChange={v => set({ movilizacion_dia: v })} /></div>
          <div><label className="label-muted" style={lbl}>Otros por día</label>
            <NumeroInput className="input" prefijo="$" value={d.otros_dia} onChange={v => set({ otros_dia: v })} /></div>
          <div><label className="label-muted" style={lbl}>Cuenta en el ERP</label>
            <select className="input" value={d.usuario_id || ''} onChange={e => set({ usuario_id: e.target.value || null })}>
              <option value="">Sin cuenta</option>
              {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></div>
          <p style={{ gridColumn: '1 / -1', margin: 0, padding: '0.55rem 0.8rem', borderRadius: 8, background: 'var(--bg3)', fontSize: '0.84rem', color: 'var(--text)' }}>
            Sueldo bruto <b>{formatCLP(desc.bruto)}</b> · un día cuesta <b>{formatCLP(dia)}</b> · la hora <b>{formatCLP(hora)}</b>
            <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--muted)' }}>
              Bruto = {formatCLP(d.sueldo_liquido)} líquido + AFP {formatCLP(desc.afp)} + salud {formatCLP(desc.salud)} + cesantía {formatCLP(desc.cesantia)}
              {desc.otros ? ` + otros ${formatCLP(desc.otros)}` : ''}. Día = bruto × (1 + {pctTxt(d.aportes_pct)} %) ÷ {pctTxt(d.dias_mes)} días + colación, movilización y otros.
              Con cuenta en el ERP puede registrar sus propias horas.</span>
          </p>
        </> : <>
          <div><label className="label-muted" style={lbl}>Valor por jornada (líquido)</label>
            <NumeroInput className="input" prefijo="$" value={d.valor_jornada} onChange={v => set({ valor_jornada: v })} /></div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem', color: 'var(--text)', cursor: 'pointer', alignSelf: 'end', paddingBottom: '0.5rem' }}>
            <input type="checkbox" checked={d.honorarios} onChange={e => set({ honorarios: e.target.checked })} style={{ accentColor: 'var(--y-brand)', width: 16, height: 16 }} />
            Da boleta de honorarios</label>
          <p style={{ gridColumn: '1 / -1', margin: 0, padding: '0.55rem 0.8rem', borderRadius: 8, background: 'var(--bg3)', fontSize: '0.84rem', color: 'var(--text)' }}>
            Una jornada cuesta <b>{formatCLP(bruto)}</b>
            <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--muted)' }}>
              {d.honorarios ? `${formatCLP(d.valor_jornada)} líquidos + ${formatCLP(bruto - d.valor_jornada)} de retención (${pctTxt(retencion)} %) que se paga al SII.`
                : 'Sin boleta: el costo es lo que se le paga.'} Al registrar se puede cambiar el monto de cada día.</span>
          </p>
        </>}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem', color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={d.activo} onChange={e => set({ activo: e.target.checked })} style={{ accentColor: 'var(--y-brand)', width: 16, height: 16 }} /> Activo</label>
        <div style={{ gridColumn: '1 / -1' }}><label className="label-muted" style={lbl}>Nota</label>
          <input className="input" value={d.nota || ''} onChange={e => set({ nota: e.target.value })} placeholder="Banco y cuenta, especialidad…" /></div>
      </div>
    </Modal>
  );
}

export default function EquipoPage() {
  const { success, error: toastError } = useToast();
  const [lista, setLista] = useState<Trabajador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  const [vista, setVista] = useState<TipoTrabajador>('interno');
  const [ficha, setFicha] = useState<Trabajador | NuevoTrabajador | null>(null);
  const [retencion, setRetencion] = useState(RETENCION_HONORARIOS);
  const [retGuardada, setRetGuardada] = useState(RETENCION_HONORARIOS);
  const [cuentas, setCuentas] = useState<{ id: string; nombre: string }[]>([]);

  const cargar = useCallback(async () => {
    try { setLista(await manoObraService.equipo()); }
    catch (e) {
      const x = e as { code?: string; message?: string };
      if (x.code === '42P01' || x.code === 'PGRST205' || /trabajadores/.test(x.message || '')) setFalta(true);
      else toastError('No se pudo cargar el equipo: ' + (x.message || ''));
    } finally { setCargando(false); }
  }, [toastError]);
  useEffect(() => {
    cargar();
    manoObraService.retencion().then(v => { if (v !== null) { setRetencion(v); setRetGuardada(v); } });
    vendedoresService.mapa().then(m => setCuentas(Object.entries(m).filter(([, v]) => v.activo !== false).map(([id, v]) => ({ id, nombre: v.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))));
  }, [cargar]);

  const guardarRetencion = async () => {
    try { await manoObraService.guardarRetencion(retencion); setRetGuardada(retencion); success('Retención guardada'); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar'); }
  };
  const visibles = useMemo(() => lista.filter(t => t.tipo === vista), [lista, vista]);
  const cuentaDe = (id: string | null) => cuentas.find(c => c.id === id)?.nombre;

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Finanzas" title="Equipo y costos" /><FaltaSQL archivo="supabase_fase20_control_proyecto.sql" /></div>;

  return (
    <div className="anim-in">
      {ficha && <FormFicha ficha={ficha} retencion={retencion} cuentas={cuentas} onCerrar={() => setFicha(null)} onListo={() => { setFicha(null); cargar(); }} />}
      <PageHeader eyebrow="Finanzas" title="Equipo y costos"
        subtitle="El costo de la mano de obra: el personal interno por su sueldo y jornada, y los externos por lo que se les paga."
        actions={<button className="btn btn-primary" onClick={() => setFicha(fichaVacia(vista))}><Plus size={14} /> {vista === 'interno' ? 'Nuevo interno' : 'Nuevo externo'}</button>} />

      <div className="panel-y">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {([['interno', 'Personal interno'], ['externo', 'Externos y subcontratos']] as const).map(([v, t]) => (
            <button key={v} className="btn btn-sm" onClick={() => setVista(v)}
              style={{ background: vista === v ? 'var(--y-brand)' : 'var(--bg3)', color: vista === v ? '#111' : 'var(--muted)' }}>
              {t} · {lista.filter(x => x.tipo === v && x.activo).length}</button>
          ))}
          <span style={{ flex: 1 }} />
          {vista === 'externo' && (
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.82rem', color: 'var(--muted)' }}>
              Retención boleta de honorarios
              <NumeroInput className="input" sufijo="%" value={retencion} onChange={setRetencion} max={99} envoltura={{ width: 100 }} />
              {retencion !== retGuardada && <button className="btn btn-ghost btn-sm" onClick={guardarRetencion}><Check size={13} /> Guardar</button>}
            </span>
          )}
        </div>
        {cargando ? <div style={{ padding: '1.5rem' }}><div className="skeleton" style={{ height: 120 }} /></div>
          : visibles.length === 0 ? (
            <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>
              {vista === 'interno' ? 'Agrega al personal contratado: con su sueldo y jornada, cada hora registrada en un trabajo suma su costo real.'
                : 'Agrega a los externos y subcontratos que trabajan por jornada: al registrarlos en un trabajo, su pago suma al costo real.'}
              <br /><button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setFicha(fichaVacia(vista))}><Plus size={13} /> Agregar</button></p>
          ) : visibles.map(t => (
            <div key={t.id} style={{ display: 'flex', gap: 12, padding: '0.8rem 1rem', borderTop: '1px solid var(--border2)', alignItems: 'center', flexWrap: 'wrap', opacity: t.activo ? 1 : 0.55 }}>
              <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)' }}>{t.nombre}{!t.activo && <span className="badge" style={{ marginLeft: 6, fontSize: '0.68rem' }}>Inactivo</span>}</span>
                <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)' }}>
                  {[t.oficio, t.rut, t.tipo === 'interno' && t.usuario_id ? `cuenta: ${cuentaDe(t.usuario_id) || 'ligada'}` : null].filter(Boolean).join(' · ') || '—'}</span>
              </span>
              <span style={{ textAlign: 'right', minWidth: 170, fontSize: '0.8rem', color: 'var(--muted)' }}>
                {t.tipo === 'interno' ? <>
                  <b style={{ display: 'block', color: 'var(--text)', fontSize: '0.92rem' }}>{formatCLP(costoDia(t))} al día</b>
                  {formatCLP(costoHora(t))} la hora · {pctTxt(Number(t.horas_dia))} h
                </> : <>
                  <b style={{ display: 'block', color: 'var(--text)', fontSize: '0.92rem' }}>{formatCLP(costoExterno(t.valor_jornada, t.honorarios, retGuardada))} la jornada</b>
                  {formatCLP(Number(t.valor_jornada))} líquido · {t.honorarios ? 'con boleta de honorarios' : 'sin boleta'}
                </>}
              </span>
              <button className="btn btn-ghost btn-xs" aria-label={`Editar ${t.nombre}`} onClick={() => setFicha(t)}><Pencil size={13} /></button>
            </div>
          ))}
      </div>
    </div>
  );
}
