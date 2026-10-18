'use client';

/**
 * Visitas de una OT (como las del ticket de TecApp): cada visita con su fecha, hora y
 * técnicos. Al programarla, sus técnicos pasan a la OT y reciben aviso (lo hace la base).
 * Se puede llevar a la Agenda y marcar realizada o cancelada.
 */

import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Check, Loader2, Plus, X } from 'lucide-react';
import { visitasService, type Visita } from '@/services/fase5';
import { agendaService } from '@/services/agenda';
import { folioOT, type OrdenTrabajo } from '@/services/operacion';
import { useToast } from '@/hooks/useToast';
import { formatDate, fechaLocal } from '@/utils';
import type { Vendedor } from '@/types';

export default function VisitasOT({ ot, equipo, puedeProgramar, puedeEjecutar, uid, onCambio }: {
  ot: OrdenTrabajo; equipo: Record<string, Vendedor>; puedeProgramar: boolean; puedeEjecutar: boolean; uid?: string; onCambio: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [visitas, setVisitas] = useState<Visita[] | null>(null);
  const [nueva, setNueva] = useState<{ fecha: string; hora_inicio: string; hora_fin: string; tecnicos: string[]; nota: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(() => {
    visitasService.deOT(ot.id).then(setVisitas).catch(() => setVisitas([]));
  }, [ot.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const programar = async () => {
    if (!nueva?.fecha) { toastError('Elige la fecha'); return; }
    setOcupado(true);
    try {
      await visitasService.crear({ ot_id: ot.id, fecha: nueva.fecha, hora_inicio: nueva.hora_inicio || null, hora_fin: nueva.hora_fin || null, tecnicos: nueva.tecnicos, nota: nueva.nota || null });
      success('Visita programada; los técnicos reciben aviso');
      setNueva(null); cargar(); onCambio();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo programar'); }
    finally { setOcupado(false); }
  };

  const agendar = async (v: Visita) => {
    try {
      const a = await agendaService.create({
        cliente_id: ot.cliente_id, solicitud_id: ot.solicitud_id, titulo: `${folioOT(ot.folio)} · ${ot.titulo}`, direccion: ot.direccion,
        fecha: v.fecha, hora_inicio: v.hora_inicio, hora_fin: v.hora_fin, responsable: 'Ambos', tipos_servicio: [], estado: 'Agendada',
        notas: v.tecnicos.length ? `Técnicos: ${v.tecnicos.map(t => equipo[t]?.nombre || '').filter(Boolean).join(', ')}` : null,
        created_by: uid || null, ot_id: ot.id,
      });
      await visitasService.actualizar(v.id, { agendamiento_id: a.id });
      success('Quedó en la agenda'); cargar();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo agendar'); }
  };

  const cambiar = async (v: Visita, estado: Visita['estado']) => {
    try { await visitasService.actualizar(v.id, { estado }); cargar(); onCambio(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
  };

  const hoy = fechaLocal();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {visitas === null ? <Loader2 size={16} className="iv-spin" /> : visitas.length === 0 && !nueva && (
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.86rem' }}>Sin visitas programadas.</p>
      )}
      {visitas?.map(v => {
        const mia = !!uid && v.tecnicos.includes(uid);
        return (
          <div key={v.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '0.5rem 0.6rem', border: '1px solid var(--border2)', borderRadius: 8,
            opacity: v.estado === 'cancelada' ? 0.5 : 1, borderLeft: `3px solid ${v.estado === 'realizada' ? 'var(--success)' : v.estado === 'cancelada' ? 'var(--muted)' : v.fecha < hoy ? '#d97706' : 'var(--y-brand)'}` }}>
            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)', minWidth: 120 }}>
              {formatDate(v.fecha)}{v.hora_inicio ? ` · ${v.hora_inicio.slice(0, 5)}` : ''}{v.hora_fin ? `–${v.hora_fin.slice(0, 5)}` : ''}
            </span>
            <span style={{ flex: 1, minWidth: 140, fontSize: '0.82rem', color: 'var(--muted)' }}>
              {v.tecnicos.map(t => equipo[t]?.nombre?.split(' ')[0] || '…').join(', ') || 'Sin técnicos'}{v.nota ? ` · ${v.nota}` : ''}
            </span>
            <span className="badge" style={{ fontSize: '0.7rem', background: 'var(--bg3)', color: v.estado === 'realizada' ? 'var(--success)' : 'var(--muted)' }}>{v.estado}</span>
            {v.estado === 'programada' && puedeProgramar && !v.agendamiento_id && <button className="btn btn-ghost btn-xs" onClick={() => agendar(v)} title="Crear la cita en la agenda"><CalendarPlus size={12} /></button>}
            {v.estado === 'programada' && (puedeProgramar || (mia && puedeEjecutar)) && <button className="btn btn-ghost btn-xs" onClick={() => cambiar(v, 'realizada')} title="Marcar realizada"><Check size={12} /></button>}
            {v.estado === 'programada' && puedeProgramar && <button className="btn btn-ghost btn-xs" onClick={() => cambiar(v, 'cancelada')} title="Cancelar visita"><X size={12} /></button>}
          </div>
        );
      })}
      {nueva ? (
        <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 8 }}>
            <label><span className="label-muted">Fecha</span><input className="input" type="date" value={nueva.fecha} onChange={e => setNueva({ ...nueva, fecha: e.target.value })} /></label>
            <label><span className="label-muted">Desde</span><input className="input" type="time" value={nueva.hora_inicio} onChange={e => setNueva({ ...nueva, hora_inicio: e.target.value })} /></label>
            <label><span className="label-muted">Hasta</span><input className="input" type="time" value={nueva.hora_fin} onChange={e => setNueva({ ...nueva, hora_fin: e.target.value })} /></label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.values(equipo).map(p => { const on = nueva.tecnicos.includes(p.id!); return (
              <button key={p.id} type="button" onClick={() => setNueva({ ...nueva, tecnicos: on ? nueva.tecnicos.filter(x => x !== p.id) : [...nueva.tecnicos, p.id!] })} className="badge"
                style={{ cursor: 'pointer', padding: '0.35rem 0.7rem', background: on ? 'var(--y-soft)' : 'var(--bg2)', color: on ? 'var(--text)' : 'var(--muted)', border: `1px solid ${on ? 'var(--y-brand)' : 'var(--border2)'}` }}>{p.nombre}</button>); })}
          </div>
          <input className="input" value={nueva.nota} onChange={e => setNueva({ ...nueva, nota: e.target.value })} placeholder="Nota (opcional): llevar escalera, pedir acceso…" />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setNueva(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={programar} disabled={ocupado}>{ocupado ? <Loader2 size={14} className="iv-spin" /> : <Plus size={14} />} Programar</button>
          </div>
        </div>
      ) : puedeProgramar && !['cerrada', 'anulada'].includes(ot.estado) && (
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
          onClick={() => setNueva({ fecha: ot.fecha_programada || fechaLocal(), hora_inicio: (ot.hora_programada || '').slice(0, 5), hora_fin: '', tecnicos: ot.tecnicos, nota: '' })}>
          <Plus size={13} /> Programar visita</button>
      )}
    </div>
  );
}
