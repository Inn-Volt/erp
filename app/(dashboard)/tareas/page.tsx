'use client';

/**
 * Operación → Tareas (traído de TecApp): pendientes internos con responsable y fecha.
 * Cualquiera se anota las suyas; con «Crear y asignar» se le asignan a otros (le llega aviso).
 */

import { encendido } from '@/lib/modulos';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, ListTodo, Loader2, Plus, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import { faltaFase2, folioOT, otService, tareasService, type OrdenTrabajo, type Tarea } from '@/services/operacion';
import { vendedoresService } from '@/services/vendedores';
import AvancesTarea from '@/components/AvancesTarea';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatDate } from '@/utils';
import type { Vendedor } from '@/types';

const COLOR_PRIO: Record<Tarea['prioridad'], string> = { Baja: 'var(--muted)', Media: 'var(--text)', Alta: '#d97706', Urgente: '#dc2626' };

function NuevaTarea({ equipo, ots, yo, asignaOtros, onClose, onListo }: {
  equipo: Vendedor[]; ots: OrdenTrabajo[]; yo: string; asignaOtros: boolean; onClose: () => void; onListo: () => void;
}) {
  const { error: toastError } = useToast();
  const [f, setF] = useState({ titulo: '', descripcion: '', asignado_id: yo, fecha_limite: '', prioridad: 'Media', ot_id: '' });
  const [guardando, setGuardando] = useState(false);
  const lbl = { display: 'block', marginBottom: 6 } as const;
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.titulo.trim()) { toastError('Escribe la tarea'); return; }
    setGuardando(true);
    try {
      await tareasService.crear({
        titulo: f.titulo.trim(), descripcion: f.descripcion.trim() || null, asignado_id: f.asignado_id || yo,
        fecha_limite: f.fecha_limite || null, prioridad: f.prioridad as Tarea['prioridad'], ot_id: f.ot_id || null,
      });
      onListo();
    } catch (err) { toastError(err instanceof Error ? err.message : 'No se pudo crear'); }
    finally { setGuardando(false); }
  };
  return (
    <div className="modal-overlay">
      <form onSubmit={guardar} className="modal-box" style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}><ListTodo size={16} /> Nueva tarea</p>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div><label className="label-muted" style={lbl}>Qué hay que hacer *</label><input className="input" autoFocus value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="Llamar al cliente para confirmar visita" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label-muted" style={lbl}>Responsable</label>
              <select className="input" value={f.asignado_id} onChange={e => setF({ ...f, asignado_id: e.target.value })} disabled={!asignaOtros}>
                {equipo.map(p => <option key={p.id} value={p.id}>{p.id === yo ? `${p.nombre} (yo)` : p.nombre}</option>)}</select></div>
            <div><label className="label-muted" style={lbl}>Para cuándo</label><input className="input" type="date" value={f.fecha_limite} onChange={e => setF({ ...f, fecha_limite: e.target.value })} /></div>
            <div><label className="label-muted" style={lbl}>Prioridad</label>
              <select className="input" value={f.prioridad} onChange={e => setF({ ...f, prioridad: e.target.value })}>{['Baja', 'Media', 'Alta', 'Urgente'].map(p => <option key={p}>{p}</option>)}</select></div>
            {ots.length > 0 && <div><label className="label-muted" style={lbl}>OT</label>
              <select className="input" value={f.ot_id} onChange={e => setF({ ...f, ot_id: e.target.value })}>
                <option value="">—</option>{ots.map(o => <option key={o.id} value={o.id}>{folioOT(o.folio)} · {o.titulo}</option>)}</select></div>}
          </div>
          <div><label className="label-muted" style={lbl}>Detalle</label><textarea className="input" rows={3} value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} /></div>
        </div>
        <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Plus size={14} />} Crear</button>
        </div>
      </form>
    </div>
  );
}

export default function TareasPage() {
  const { perfil, puede } = usePermisos();
  const { error: toastError } = useToast();
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [equipo, setEquipo] = useState<Record<string, Vendedor>>({});
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  const [vista, setVista] = useState<'mias' | 'asignadas' | 'todas'>('mias');
  const [verHechas, setVerHechas] = useState(false);
  const [nueva, setNueva] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [t, e] = await Promise.all([tareasService.listar(), vendedoresService.mapa()]);
      setTareas(t); setEquipo(e);
      if (encendido('ot')) otService.listar().then(o => setOts(o.filter(x => !['cerrada', 'anulada'].includes(x.estado)))).catch(() => {});
    } catch (err) { if (faltaFase2(err)) setFalta(true); else toastError('No se pudieron cargar las tareas: ' + (err instanceof Error ? err.message : '')); }
    finally { setCargando(false); }
  }, [toastError]);
  useEffect(() => { cargar(); }, [cargar]);
  // ?nueva=1 (accesos rápidos) abre el formulario.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('nueva') === '1') { setNueva(true); window.history.replaceState(null, '', '/tareas'); }
  }, []);

  const hoy = fechaLocal();
  const lista = useMemo(() => tareas
    .filter(t => vista === 'mias' ? t.asignado_id === perfil?.id : vista === 'asignadas' ? t.creado_por === perfil?.id && t.asignado_id !== perfil?.id : true)
    .filter(t => verHechas || ['pendiente', 'en_progreso'].includes(t.estado))
    .sort((a, b) => (a.estado === 'hecha' ? 1 : 0) - (b.estado === 'hecha' ? 1 : 0) || (a.fecha_limite || '9999').localeCompare(b.fecha_limite || '9999')),
  [tareas, vista, verHechas, perfil]);

  const alternar = async (t: Tarea) => {
    const estado = t.estado === 'hecha' ? 'pendiente' : 'hecha';
    setTareas(x => x.map(y => y.id === t.id ? { ...y, estado } : y));
    try { await tareasService.actualizar(t.id, { estado }); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo actualizar'); cargar(); }
  };

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Operación" title="Tareas" /><FaltaSQL /></div>;
  const pendientesMias = tareas.filter(t => t.asignado_id === perfil?.id && ['pendiente', 'en_progreso'].includes(t.estado));

  return (
    <div className="anim-in">
      {nueva && perfil && <NuevaTarea equipo={Object.values(equipo)} ots={ots} yo={perfil.id} asignaOtros={puede('tareas.gestionar')}
        onClose={() => setNueva(false)} onListo={() => { setNueva(false); cargar(); }} />}
      <PageHeader eyebrow="Operación" title="Tareas" subtitle="Pendientes del equipo, con responsable y fecha."
        actions={<button className="btn btn-primary" onClick={() => setNueva(true)}><Plus size={14} /> Nueva tarea</button>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 8, marginBottom: 12 }}>
        <div className="kpi-card"><p className="label-muted">Mis pendientes</p><p className="kpi-value">{pendientesMias.length}</p></div>
        <div className="kpi-card"><p className="label-muted">Atrasadas</p><p className="kpi-value" style={{ color: '#dc2626' }}>{pendientesMias.filter(t => t.fecha_limite && t.fecha_limite < hoy).length}</p></div>
        <div className="kpi-card"><p className="label-muted">Para hoy</p><p className="kpi-value" style={{ color: '#d97706' }}>{pendientesMias.filter(t => t.fecha_limite === hoy).length}</p></div>
      </div>

      <div className="panel-y">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {([['mias', 'Mías'], ['asignadas', 'Que asigné'], ...(puede('tareas.ver') ? [['todas', 'Todas']] : [])] as [typeof vista, string][]).map(([k, t]) => (
              <button key={k} className="btn btn-sm" onClick={() => setVista(k)} style={{ background: vista === k ? 'var(--y-brand)' : 'var(--bg3)', color: vista === k ? '#111' : 'var(--muted)' }}>{t}</button>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.86rem', color: 'var(--text)', cursor: 'pointer', marginLeft: 'auto' }}>
            <input type="checkbox" checked={verHechas} onChange={e => setVerHechas(e.target.checked)} style={{ accentColor: 'var(--y-brand)' }} /> Ver terminadas
          </label>
        </div>
        {cargando ? <div style={{ padding: '1.5rem' }}><div className="skeleton" style={{ height: 120 }} /></div>
          : lista.length === 0 ? <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>Nada pendiente por aquí. 🎉</p>
          : lista.map(t => {
            const hecha = t.estado === 'hecha';
            const atrasada = !hecha && !!t.fecha_limite && t.fecha_limite < hoy;
            return (
              <div key={t.id} style={{ display: 'flex', gap: 10, padding: '0.8rem 1rem', borderTop: '1px solid var(--border2)', alignItems: 'flex-start', opacity: hecha ? 0.55 : 1 }}>
                <button onClick={() => alternar(t)} aria-label={hecha ? 'Marcar pendiente' : 'Marcar hecha'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: hecha ? 'var(--success)' : 'var(--muted)', padding: 0, marginTop: 1 }}>
                  {hecha ? <CheckCircle2 size={19} /> : <Circle size={19} />}
                </button>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', textDecoration: hecha ? 'line-through' : 'none' }}>{t.titulo}</span>
                  {t.descripcion && <span style={{ display: 'block', fontSize: '0.82rem', color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>{t.descripcion}</span>}
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem 0.8rem', fontSize: '0.76rem', color: 'var(--muted)', marginTop: 3 }}>
                    {t.fecha_limite && <span style={{ color: atrasada ? '#dc2626' : undefined }}>{atrasada ? 'Atrasada · ' : ''}{formatDate(t.fecha_limite)}</span>}
                    {t.prioridad !== 'Media' && <span style={{ color: COLOR_PRIO[t.prioridad] }}>{t.prioridad}</span>}
                    {t.asignado_id !== perfil?.id && <span>Responsable: {equipo[t.asignado_id || '']?.nombre || '—'}</span>}
                    {t.creado_por && t.creado_por !== t.asignado_id && t.asignado_id === perfil?.id && <span>De: {equipo[t.creado_por]?.nombre || '—'}</span>}
                    {t.ot_id && <Link href={`/ordenes/${t.ot_id}`}>{folioOT(t.ordenes_trabajo?.folio)}</Link>}
                    {t.clientes?.nombre_cliente && <span>{t.clientes.nombre_cliente}</span>}
                    <button type="button" onClick={() => setAbierta(abierta === t.id ? null : t.id)} style={{ background: 'none', border: 'none', color: 'var(--y)', cursor: 'pointer', fontSize: '0.76rem', padding: 0 }}>
                      {abierta === t.id ? 'Ocultar avances' : 'Avances'}</button>
                  </span>
                  {abierta === t.id && <AvancesTarea tareaId={t.id} equipo={equipo} />}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
