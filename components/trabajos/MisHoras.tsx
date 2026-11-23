'use client';

/**
 * «Mis horas» (fase 22): lo único de costos que ve un técnico en el trabajo. Registra sus propias
 * horas internas (su ficha del equipo) y elige en qué línea del presupuesto las carga
 * (presupuesto_para_asignar: sin costos). Ve y puede quitar lo suyo mientras no esté pagado (la
 * base deja quitar hasta 7 días después). Sin ficha en el equipo no aparece.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Loader2, Trash2 } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { anteproyectoService, type LineaAsignable } from '@/services/anteproyecto';
import { manoObraService, type RegistroManoObra, type TrabajadorElegible } from '@/services/manoObra';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatDate } from '@/utils';

const fila: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.84rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border2)', color: 'var(--text)' };
const horasTxt = (r: RegistroManoObra) => (r.horas !== null ? `${String(Number(r.horas)).replace('.', ',')} h` : `${String(Number(r.jornadas)).replace('.', ',')} días`);

export default function MisHoras({ cotId }: { cotId: string }) {
  const { success, error: toastError } = useToast();
  const [yo, setYo] = useState<TrabajadorElegible | null | undefined>(undefined);
  const [lineas, setLineas] = useState<LineaAsignable[]>([]);
  const [registros, setRegistros] = useState<RegistroManoObra[]>([]);
  const [fecha, setFecha] = useState(fechaLocal());
  const [lineaElegida, setLineaId] = useState<string | null>(null);
  const [horas, setHoras] = useState(0);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    manoObraService.registros(cotId).then(setRegistros).catch(() => setRegistros([]));
  }, [cotId]);
  useEffect(() => {
    manoObraService.elegibles().then(eq => {
      const f = eq.find(t => t.es_yo && t.tipo === 'interno') || null;
      setYo(f);
      if (f) setHoras(f.horas_dia);
    });
    anteproyectoService.paraAsignar(cotId).then(ls => {
      const suyas = ls.filter(l => l.tipo === 'mano_obra' || l.tipo === 'servicio');
      setLineas(suyas);
    }).catch(() => setLineas([]));
    cargar();
  }, [cotId, cargar]);
  // La línea por omisión: la que es de uno; si hay una sola, esa.
  const porOmision = useMemo(() => (yo && lineas.find(l => l.trabajador_id === yo.id)?.id) || (lineas.length === 1 ? lineas[0].id : ''), [yo, lineas]);
  const lineaId = lineaElegida ?? porOmision;

  if (!yo) return null;
  const mios = registros.filter(r => r.trabajador_id === yo.id);
  const linea = lineas.find(l => l.id === lineaId);

  const guardar = async () => {
    if (!(horas > 0) || horas > 24) { toastError('Las horas de un registro van de 0 a 24.'); return; }
    setGuardando(true);
    try {
      await manoObraService.registrar([{
        cotizacion_id: cotId, fecha, tipo: 'interno', trabajador_id: yo.id, horas,
        presupuesto_linea_id: linea?.id || null, partida_id: linea?.partida_id || null, clase: linea?.tipo === 'servicio' ? 'servicio' : 'mano_obra',
      }]);
      success('Horas registradas');
      cargar();
    } catch (e) { toastError(e instanceof Error ? e.message : (e as { message?: string })?.message || 'No se pudo registrar'); }
    finally { setGuardando(false); }
  };
  const quitar = async (r: RegistroManoObra) => {
    if (!confirm(`¿Quitar tus ${horasTxt(r)} del ${formatDate(r.fecha)}?`)) return;
    try { await manoObraService.eliminar(r.id); cargar(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo quitar (pasados 7 días, pídeselo a quien paga)'); }
  };

  return (
    <div>
      <p className="label-muted" style={{ margin: '0 0 6px' }}><Clock size={12} /> Mis horas en este trabajo</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 8, alignItems: 'end', padding: '0.6rem', background: 'var(--bg3)', borderRadius: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span className="label-muted">Fecha</span>
          <input className="input" type="date" value={fecha} max={fechaLocal()} onChange={e => setFecha(e.target.value)} /></label>
        {lineas.length > 0 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, gridColumn: 'span 2' }}><span className="label-muted">¿En qué trabajaste?</span>
            <select className="input" value={lineaId} onChange={e => setLineaId(e.target.value)}>
              <option value="">Otro (sin línea)</option>
              {lineas.map(l => <option key={l.id} value={l.id}>{l.descripcion}</option>)}
            </select></label>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span className="label-muted">Horas</span>
          <NumeroInput className="input" value={horas} decimales={2} sufijo="h" ariaLabel="Horas" onChange={setHoras} /></label>
        <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={13} className="iv-spin" /> : <Clock size={13} />} Registrar</button>
      </div>
      {mios.length === 0 ? <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>Aún no registras horas en este trabajo.</p>
        : mios.map(r => (
          <div key={r.id} style={fila}>
            <span style={{ flex: 1 }}>{formatDate(r.fecha)} · {horasTxt(r)}
              <span style={{ color: 'var(--muted)' }}>{(() => { const l = lineas.find(x => x.id === r.presupuesto_linea_id); return l ? ` · ${l.descripcion}` : ''; })()}</span></span>
            {!r.pagado && <button className="btn btn-ghost btn-xs" onClick={() => quitar(r)} aria-label="Quitar"><Trash2 size={12} /></button>}
          </div>
        ))}
    </div>
  );
}
