'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Calendar, Plus, X, Loader2, Search, Trash2, MapPin, User,
  CalendarPlus, Download, Inbox, AlertTriangle,
} from 'lucide-react';
import { agendaService } from '@/services/agenda';
import { clientesService } from '@/services/clientes';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import type { Cliente } from '@/types';
import type { Agendamiento, ResponsableAgenda, EstadoAgenda } from '@/types/agenda';
import {
  RESPONSABLE_OPCIONES, RESPONSABLE_LABEL, RESPONSABLE_META,
  ESTADOS_AGENDA, ESTADO_AGENDA_META,
} from '@/types/agenda';
import { TIPO_SERVICIO_OPCIONES } from '@/types/solicitud';
import type { TipoServicio } from '@/types/solicitud';
import { googleCalendarUrl, descargarICS, type EventoCalendario } from '@/lib/calendario';
import { fechaLocal } from '@/utils';
import PageHeader from '@/components/PageHeader';
import LinksMapa from '@/components/LinksMapa';
import { tipoDia } from '@/lib/feriados';

// ─── Utilidades de fecha ──────────────────────────────────────────────────────
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// Fecha LOCAL: toISOString() es UTC y de noche en Chile ya da "mañana".
const hoyStr = () => fechaLocal();

function etiquetaDia(fecha: string): string {
  const hoy = hoyStr();
  const d = new Date(fecha + 'T00:00:00');
  const man = new Date(); man.setDate(man.getDate() + 1);
  const manStr = fechaLocal(man);
  if (fecha === hoy) return 'Hoy';
  if (fecha === manStr) return 'Mañana';
  return `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function hhmm(h?: string | null): string { return h ? h.slice(0, 5) : ''; }

function eventoDe(a: { titulo: string; direccion?: string | null; fecha: string; hora_inicio?: string | null; hora_fin?: string | null; notas?: string | null; folio?: number }): EventoCalendario {
  return { titulo: a.titulo, direccion: a.direccion, fecha: a.fecha, horaInicio: a.hora_inicio, horaFin: a.hora_fin, notas: a.notas, folio: a.folio };
}

const btnCal: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem',
  padding: '0.4rem 0.7rem', borderRadius: 8, border: '1px solid var(--border2)',
  background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', textDecoration: 'none',
};

// ─── Modal crear / editar ─────────────────────────────────────────────────────
function AgendaModal({ cita, clientes, createdBy, prefill, onClose, onSaved, onDeleted }: {
  cita: Agendamiento | null;
  clientes: Cliente[];
  createdBy: string;
  prefill?: { cliente_id?: string; solicitud_id?: string };
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { success, error: toastError } = useToast();
  const initCliente = cita?.cliente_id || prefill?.cliente_id || '';
  const [clienteId, setClienteId] = useState(initCliente);
  const [clienteSearch, setClienteSearch] = useState(() => {
    const c = clientes.find(x => x.id === initCliente);
    return c ? c.nombre_cliente : '';
  });
  const [showDrop, setShowDrop] = useState(false);
  const [titulo, setTitulo] = useState(cita?.titulo || 'Visita técnica');
  const [direccion, setDireccion] = useState(cita?.direccion || (clientes.find(c => c.id === initCliente)?.direccion || ''));
  const [fecha, setFecha] = useState(cita?.fecha || hoyStr());
  const [horaIni, setHoraIni] = useState(hhmm(cita?.hora_inicio));
  const [horaFin, setHoraFin] = useState(hhmm(cita?.hora_fin));
  const [responsable, setResponsable] = useState<ResponsableAgenda>(cita?.responsable || 'Ambos');
  const [tipos, setTipos] = useState<TipoServicio[]>(cita?.tipos_servicio || []);
  const [estado, setEstado] = useState<EstadoAgenda>(cita?.estado || 'Agendada');
  const [notas, setNotas] = useState(cita?.notas || '');
  const [saving, setSaving] = useState(false);

  const toggleTipo = (t: TipoServicio) => setTipos(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);

  const elegirCliente = (c: Cliente) => {
    setClienteId(c.id);
    setClienteSearch(c.nombre_cliente);
    setShowDrop(false);
    if (!direccion && c.direccion) setDireccion(c.direccion);
    if ((titulo === 'Visita técnica' || !titulo)) setTitulo(`Visita técnica · ${c.nombre_cliente}`);
  };

  const clientesFiltrados = (() => {
    const q = clienteSearch.trim().toLowerCase();
    const base = q ? clientes.filter(c =>
      c.nombre_cliente.toLowerCase().includes(q) ||
      (c.empresa || '').toLowerCase().includes(q) ||
      (c.rut || '').toLowerCase().includes(q)) : clientes;
    return base.slice(0, 8);
  })();

  const evento = eventoDe({ titulo, direccion, fecha, hora_inicio: horaIni, hora_fin: horaFin, notas, folio: cita?.folio });
  const diaFecha = fecha ? tipoDia(fecha) : { tipo: 'laboral' as const, nombre: null };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) { toastError('Ponle un título a la cita'); return; }
    if (!fecha) { toastError('Selecciona una fecha'); return; }
    setSaving(true);
    try {
      const payload = {
        cliente_id: clienteId || null,
        solicitud_id: cita?.solicitud_id || prefill?.solicitud_id || null,
        titulo: titulo.trim(),
        direccion: direccion.trim() || null,
        fecha,
        hora_inicio: horaIni || null,
        hora_fin: horaFin || null,
        responsable,
        tipos_servicio: tipos,
        estado,
        notas: notas.trim() || null,
        created_by: cita?.created_by || createdBy,
      };
      if (cita) { await agendaService.update(cita.id, payload); success('Cita actualizada'); }
      else { await agendaService.create(payload); success('Cita agendada'); }
      onSaved();
      onClose();
    } catch (err) {
      toastError('Error: ' + (err instanceof Error ? err.message : 'desconocido'));
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async () => {
    if (!cita) return;
    if (!confirm('¿Eliminar esta cita? No se puede deshacer.')) return;
    try { await agendaService.delete(cita.id); success('Cita eliminada'); onDeleted(); onClose(); }
    catch (err) { toastError('Error: ' + (err instanceof Error ? err.message : '')); }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}><Calendar size={13} /> {cita ? 'Editar cita' : 'Nueva cita'}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
            <div style={{ position: 'relative' }}>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Cliente</label>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
                <input className="input" value={clienteSearch} autoComplete="off"
                  onChange={e => { setClienteSearch(e.target.value); setShowDrop(true); if (!e.target.value) setClienteId(''); }}
                  onFocus={() => setShowDrop(true)} onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                  placeholder="Buscar por nombre, empresa o RUT…" style={{ paddingLeft: '1.9rem' }} />
              </div>
              {showDrop && clientesFiltrados.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 2, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', maxHeight: 220, overflowY: 'auto' }}>
                  {clientesFiltrados.map(c => (
                    <button key={c.id} type="button" onMouseDown={() => elegirCliente(c)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.7rem', background: c.id === clienteId ? 'var(--y-soft)' : 'transparent', border: 'none', cursor: 'pointer' }}>
                      <span style={{ fontSize: '0.84rem', color: 'var(--text)', fontWeight: 500 }}>{c.nombre_cliente}</span>
                      {(c.empresa || c.direccion) && <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginLeft: 6 }}>{[c.empresa, c.direccion].filter(Boolean).join(' · ')}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Título *</label>
              <input className="input" value={titulo} onChange={e => setTitulo(e.target.value)} required placeholder="Visita técnica" />
            </div>

            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Dirección</label>
              <input className="input" value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Dónde es la visita" />
              {direccion.trim() && <div style={{ marginTop: '0.45rem' }}><LinksMapa direccion={direccion} compacto /></div>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Fecha *</label>
                <input className="input" type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
              </div>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Inicio</label>
                <input className="input" type="time" value={horaIni} onChange={e => setHoraIni(e.target.value)} />
              </div>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Fin</label>
                <input className="input" type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} />
              </div>
            </div>
            {(diaFecha.tipo === 'feriado' || diaFecha.tipo === 'domingo') && (
              <p style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: 'var(--text)', background: 'var(--y-soft)', border: '1px solid var(--border2)', borderRadius: 8, padding: '0.5rem 0.7rem', marginTop: '-0.25rem' }}>
                <AlertTriangle size={14} color="var(--y)" style={{ flexShrink: 0 }} />
                {diaFecha.tipo === 'feriado' ? `Es feriado: ${diaFecha.nombre}.` : 'Es domingo.'} Confirma que el cliente pueda recibirlos.
              </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Responsable</label>
                <select className="input" value={responsable} onChange={e => setResponsable(e.target.value as ResponsableAgenda)}>
                  {RESPONSABLE_OPCIONES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Estado</label>
                <select className="input" value={estado} onChange={e => setEstado(e.target.value as EstadoAgenda)}>
                  {ESTADOS_AGENDA.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Tipos de servicio</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {TIPO_SERVICIO_OPCIONES.map(t => {
                  const on = tipos.includes(t.key);
                  return (
                    <button key={t.key} type="button" onClick={() => toggleTipo(t.key)}
                      style={{ cursor: 'pointer', fontSize: '0.72rem', padding: '0.3rem 0.6rem', borderRadius: 999, border: `1px solid ${on ? 'var(--y-brand)' : 'var(--border2)'}`, background: on ? 'var(--y-soft)' : 'transparent', color: on ? 'var(--y)' : 'var(--muted)', fontWeight: on ? 600 : 400 }}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Notas</label>
              <textarea className="input" value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Detalles, contacto en sitio, materiales a llevar…" style={{ resize: 'vertical' }} />
            </div>

            {/* Exportar a calendario */}
            <div style={{ borderTop: '1px dashed var(--border2)', paddingTop: '0.9rem' }}>
              <p className="label-muted" style={{ marginBottom: '0.5rem' }}>Agregar a mi calendario (recordatorio en el teléfono)</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <a href={googleCalendarUrl(evento)} target="_blank" rel="noreferrer" style={btnCal}><CalendarPlus size={14} /> Google Calendar</a>
                <button type="button" onClick={() => descargarICS(evento)} style={btnCal}><Download size={14} /> Apple / .ics</button>
              </div>
            </div>
          </div>

          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border2)', display: 'flex', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center' }}>
            {cita
              ? <button type="button" onClick={eliminar} className="btn btn-danger btn-sm"><Trash2 size={13} /> Eliminar</button>
              : <span />}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={onClose} className="btn btn-ghost">Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Loader2 size={13} className="iv-spin" /> : <Plus size={13} />}
                {cita ? 'Guardar' : 'Agendar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
function AgendaContent() {
  const { user, userName } = useAuth(true);
  const { error: toastError } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillCliente = searchParams.get('cliente') || undefined;
  const prefillSolicitud = searchParams.get('solicitud') || undefined;
  const abrirNueva = searchParams.get('nueva') === '1' || !!prefillSolicitud || !!prefillCliente;

  const [citas, setCitas] = useState<Agendamiento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; cita: Agendamiento | null; prefill?: { cliente_id?: string; solicitud_id?: string } }>({ open: false, cita: null });
  const [fResp, setFResp] = useState<ResponsableAgenda | ''>('');
  const [fEstado, setFEstado] = useState<EstadoAgenda | ''>('');
  const [rango, setRango] = useState<'proximas' | 'hoy' | 'semana' | 'todas'>('proximas');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([agendaService.getAll(), clientesService.getAll()]);
      setCitas(a);
      setClientes(c);
    } catch (e) {
      toastError('No se pudo cargar la agenda: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { load(); }, [load]);

  // Abrir "nueva cita" prellenada al llegar con ?solicitud/&cliente/&nueva.
  useEffect(() => {
    if (abrirNueva && !loading) {
      setModal({ open: true, cita: null, prefill: { cliente_id: prefillCliente, solicitud_id: prefillSolicitud } });
      // limpia la query para no reabrir al recargar
      router.replace('/agenda');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirNueva, loading]);

  const hoy = hoyStr();
  const finSemana = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return fechaLocal(d); })();

  const filtradas = citas.filter(c => {
    if (fResp && c.responsable !== fResp) return false;
    if (fEstado && c.estado !== fEstado) return false;
    if (rango === 'hoy' && c.fecha !== hoy) return false;
    if (rango === 'semana' && (c.fecha < hoy || c.fecha > finSemana)) return false;
    if (rango === 'proximas' && c.fecha < hoy) return false;
    return true;
  });

  // Agrupar por fecha (ya vienen ordenadas por fecha/hora)
  const grupos: { fecha: string; items: Agendamiento[] }[] = [];
  for (const c of filtradas) {
    const g = grupos.find(x => x.fecha === c.fecha);
    if (g) g.items.push(c); else grupos.push({ fecha: c.fecha, items: [c] });
  }

  return (
    <div className="anim-in">
      {modal.open && (
        <AgendaModal
          cita={modal.cita}
          clientes={clientes}
          createdBy={user?.email || userName}
          prefill={modal.prefill}
          onClose={() => setModal({ open: false, cita: null })}
          onSaved={load}
          onDeleted={load}
        />
      )}

      <PageHeader
        eyebrow="Visitas y citas"
        title="Agenda"
        subtitle="Visitas técnicas y citas de César y Joaquín"
        actions={<>
          <button onClick={() => setModal({ open: true, cita: null })} className="btn btn-primary"><Plus size={14} /> Nueva cita</button>
        </>}
      />

      <div className="panel-y">
        {/* Filtros */}
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg3)', borderRadius: 8, padding: 2 }}>
            {([['proximas', 'Próximas'], ['hoy', 'Hoy'], ['semana', 'Semana'], ['todas', 'Todas']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setRango(k)}
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem', borderRadius: 6, border: 'none', cursor: 'pointer', background: rango === k ? 'var(--y-brand)' : 'transparent', color: rango === k ? 'var(--on-accent)' : 'var(--muted)', fontWeight: rango === k ? 700 : 400 }}>
                {label}
              </button>
            ))}
          </div>
          <select className="input" value={fResp} onChange={e => setFResp(e.target.value as ResponsableAgenda | '')} style={{ maxWidth: 150 }}>
            <option value="">Todos</option>
            {RESPONSABLE_OPCIONES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <select className="input" value={fEstado} onChange={e => setFEstado(e.target.value as EstadoAgenda | '')} style={{ maxWidth: 160 }}>
            <option value="">Todos los estados</option>
            {ESTADOS_AGENDA.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 64 }} />)}
          </div>
        ) : grupos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
            <Calendar size={36} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
            <p style={{ fontSize: '0.875rem' }}>No hay citas {rango === 'todas' ? '' : 'en este rango'}</p>
            <button onClick={() => setModal({ open: true, cita: null })} className="btn btn-ghost" style={{ marginTop: '1rem' }}><Plus size={13} /> Agendar la primera</button>
          </div>
        ) : (
          <div style={{ padding: '0.5rem 0' }}>
            {grupos.map(g => (
              <div key={g.fecha}>
                <div style={{ padding: '0.65rem 1rem 0.45rem', position: 'sticky', top: 0, background: 'var(--bg2)', zIndex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.88rem', color: g.fecha === hoy ? 'var(--y)' : 'var(--text)' }}>
                    {etiquetaDia(g.fecha)}
                  </span>
                  {(() => {
                    const d = tipoDia(g.fecha);
                    if (d.tipo !== 'feriado') return null;
                    return <span className="badge" style={{ background: 'var(--y-soft)', color: 'var(--y)' }}>Feriado · {d.nombre}</span>;
                  })()}
                </div>
                {g.items.map(c => {
                  const rm = RESPONSABLE_META[c.responsable];
                  const em = ESTADO_AGENDA_META[c.estado];
                  return (
                    <div key={c.id} onClick={() => setModal({ open: true, cita: c })}
                      style={{ display: 'flex', gap: '0.85rem', padding: '0.8rem 1rem', borderTop: '1px solid var(--border2)', cursor: 'pointer', alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 52, textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)' }}>{hhmm(c.hora_inicio) || '—'}</div>
                        {c.hora_fin && <div style={{ fontSize: '0.66rem', color: 'var(--faint)' }}>{hhmm(c.hora_fin)}</div>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.titulo}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.75rem', marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
                          {c.clientes?.nombre_cliente && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><User size={11} /> {c.clientes.nombre_cliente}</span>}
                          {c.direccion && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}><MapPin size={11} /> {c.direccion}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 999, background: rm.bg, color: rm.color }}>{RESPONSABLE_LABEL[c.responsable]}</span>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 999, background: em.bg, color: em.color }}>{c.estado}</span>
                          {c.solicitudes?.folio && <span style={{ fontSize: '0.7rem', color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Inbox size={10} /> SOL #{String(c.solicitudes.folio).padStart(4, '0')}</span>}
                          {c.direccion && c.estado !== 'Realizada' && c.estado !== 'Cancelada' && <LinksMapa direccion={c.direccion} compacto />}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <a href={googleCalendarUrl(eventoDe(c))} target="_blank" rel="noreferrer" title="Agregar a Google Calendar" style={{ color: 'var(--muted)', display: 'inline-flex', padding: 4 }}><CalendarPlus size={15} /></a>
                        <button onClick={() => descargarICS(eventoDe(c))} title="Descargar .ics (Apple)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><Download size={15} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border2)', color: 'var(--muted)', fontSize: '0.75rem' }}>
          {filtradas.length} cita{filtradas.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}

export default function AgendaPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--muted)' }}><Loader2 size={20} className="iv-spin" /></div>}>
      <AgendaContent />
    </Suspense>
  );
}
