'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Inbox, Plus, Search, X, Loader2, Sparkles, Wand2, CalendarPlus,
  FileText, ExternalLink, Edit3, Trash2, ChevronRight, ClipboardList, HelpCircle,
} from 'lucide-react';
import { solicitudesService } from '@/services/solicitudes';
import { clientesService } from '@/services/clientes';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { formatDate } from '@/utils';
import { CATEGORIA_LABELS, CATEGORIA_COLORS } from '@/types';
import type { Cliente } from '@/types';
import type { Solicitud, EstadoSolicitud, PrioridadSolicitud, TipoServicio, AnalisisIA } from '@/types/solicitud';
import {
  TIPO_SERVICIO_OPCIONES, TIPO_SERVICIO_LABEL, PRIORIDAD_META,
  ESTADO_SOLICITUD_META, ESTADOS_SOLICITUD,
} from '@/types/solicitud';
import { fetchConSesion } from '@/lib/fetchConSesion';

const PRIORIDADES: PrioridadSolicitud[] = ['Baja', 'Media', 'Alta', 'Urgente'];

function folioSol(s: Solicitud): string {
  const year = new Date(s.created_at).getFullYear();
  return `SOL-${year}-${String(s.folio).padStart(4, '0')}`;
}

// ─── Modal crear / editar ─────────────────────────────────────────────────────
function SolicitudModal({ solicitud, clientes, createdBy, onClose, onSaved }: {
  solicitud: Solicitud | null;
  clientes: Cliente[];
  createdBy: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [clienteId, setClienteId] = useState(solicitud?.cliente_id || '');
  const [clienteSearch, setClienteSearch] = useState(() => {
    const c = clientes.find(x => x.id === solicitud?.cliente_id);
    return c ? c.nombre_cliente : '';
  });
  const [showClienteDrop, setShowClienteDrop] = useState(false);
  const [contacto, setContacto] = useState(solicitud?.contacto || '');
  const [descripcion, setDescripcion] = useState(solicitud?.descripcion || '');
  const [tipos, setTipos] = useState<TipoServicio[]>(solicitud?.tipos_servicio || []);
  const [prioridad, setPrioridad] = useState<PrioridadSolicitud>(solicitud?.prioridad || 'Media');
  const [fechaReq, setFechaReq] = useState(solicitud?.fecha_requerida || '');
  const [infoAdic, setInfoAdic] = useState(solicitud?.info_adicional || '');
  const [obs, setObs] = useState(solicitud?.observaciones || '');
  const [saving, setSaving] = useState(false);

  const toggleTipo = (t: TipoServicio) =>
    setTipos(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  // Selección desde el buscador: fija cliente y autocompleta contacto si está vacío.
  const elegirCliente = (c: Cliente) => {
    setClienteId(c.id);
    setClienteSearch(c.nombre_cliente);
    setShowClienteDrop(false);
    if (!contacto && c.contacto_nombre) setContacto(c.contacto_nombre);
  };

  const clientesFiltrados = (() => {
    const q = clienteSearch.trim().toLowerCase();
    const base = q
      ? clientes.filter(c =>
          c.nombre_cliente.toLowerCase().includes(q) ||
          (c.empresa || '').toLowerCase().includes(q) ||
          (c.rut || '').toLowerCase().includes(q))
      : clientes;
    return base.slice(0, 8);
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (descripcion.trim().length < 10) { toastError('Describe el requerimiento con más detalle'); return; }
    setSaving(true);
    try {
      const base = {
        cliente_id: clienteId || null,
        contacto: contacto.trim() || null,
        descripcion: descripcion.trim(),
        tipos_servicio: tipos,
        prioridad,
        fecha_requerida: fechaReq || null,
        info_adicional: infoAdic.trim() || null,
        observaciones: obs.trim() || null,
      };
      if (solicitud) {
        await solicitudesService.update(solicitud.id, base);
        success('Solicitud actualizada');
      } else {
        await solicitudesService.create({ ...base, estado: 'NUEVA', created_by: createdBy });
        success('Solicitud creada');
      }
      onSaved();
      onClose();
    } catch (err) {
      toastError('Error: ' + (err instanceof Error ? err.message : 'desconocido'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}><Inbox size={13} /> {solicitud ? 'Editar solicitud' : 'Nueva solicitud'}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ position: 'relative' }}>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Cliente</label>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
                <input
                  className="input"
                  value={clienteSearch}
                  onChange={e => { setClienteSearch(e.target.value); setShowClienteDrop(true); if (!e.target.value) setClienteId(''); }}
                  onFocus={() => setShowClienteDrop(true)}
                  onBlur={() => setTimeout(() => setShowClienteDrop(false), 150)}
                  placeholder="Buscar por nombre, empresa o RUT…"
                  style={{ paddingLeft: '1.9rem', paddingRight: clienteId ? '1.9rem' : undefined }}
                  autoComplete="off"
                />
                {clienteId && (
                  <button type="button" onClick={() => { setClienteId(''); setClienteSearch(''); }} title="Quitar cliente"
                    style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                    <X size={13} />
                  </button>
                )}
              </div>
              {showClienteDrop && clientesFiltrados.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 2, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', maxHeight: 240, overflowY: 'auto' }}>
                  {clientesFiltrados.map(c => (
                    <button key={c.id} type="button" onMouseDown={() => elegirCliente(c)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.7rem', background: c.id === clienteId ? 'var(--y-soft)' : 'transparent', border: 'none', cursor: 'pointer' }}>
                      <span style={{ fontSize: '0.84rem', color: 'var(--text)', fontWeight: 500 }}>{c.nombre_cliente}</span>
                      {(c.empresa || c.rut) && <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginLeft: 6 }}>{[c.empresa, c.rut].filter(Boolean).join(' · ')}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Contacto</label>
              <input className="input" value={contacto} onChange={e => setContacto(e.target.value)} placeholder="Nombre de contacto" />
            </div>
          </div>

          <div>
            <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Descripción del requerimiento *</label>
            <textarea className="input" value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={4} required
              placeholder="Ej: Cliente necesita instalar control de acceso para una entrada vehicular y dos puertas peatonales." style={{ resize: 'vertical' }} />
          </div>

          <div>
            <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Tipos de servicio</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {TIPO_SERVICIO_OPCIONES.map(t => {
                const on = tipos.includes(t.key);
                return (
                  <button key={t.key} type="button" onClick={() => toggleTipo(t.key)}
                    style={{ cursor: 'pointer', fontSize: '0.72rem', padding: '0.3rem 0.6rem', borderRadius: 999,
                      border: `1px solid ${on ? 'var(--y-brand)' : 'var(--border2)'}`,
                      background: on ? 'var(--y-soft)' : 'transparent', color: on ? 'var(--y)' : 'var(--muted)', fontWeight: on ? 600 : 400 }}>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Prioridad</label>
              <select className="input" value={prioridad} onChange={e => setPrioridad(e.target.value as PrioridadSolicitud)}>
                {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Fecha requerida</label>
              <input className="input" type="date" value={fechaReq} onChange={e => setFechaReq(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Información adicional</label>
            <textarea className="input" value={infoAdic} onChange={e => setInfoAdic(e.target.value)} rows={2}
              placeholder="Datos técnicos conocidos, condiciones del sitio, etc." style={{ resize: 'vertical' }} />
          </div>
          <div>
            <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Observaciones</label>
            <textarea className="input" value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Notas internas" style={{ resize: 'vertical' }} />
          </div>

          </div>{/* fin cuerpo scrollable */}
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border2)', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 size={13} className="iv-spin" /> : <Plus size={13} />}
              {solicitud ? 'Guardar cambios' : 'Crear solicitud'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Panel de detalle ─────────────────────────────────────────────────────────
function DetalleSolicitud({ sol, onClose, onChange, onEdit, onDelete }: {
  sol: Solicitud;
  onClose: () => void;
  onChange: (s: Solicitud) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [analizando, setAnalizando] = useState(false);
  const [infoExtra, setInfoExtra] = useState('');

  const analizar = async (reanalisis: boolean) => {
    setAnalizando(true);
    try {
      // Si el usuario agregó info nueva, se persiste y se combina con la original.
      let infoAdicional = sol.info_adicional || '';
      if (reanalisis && infoExtra.trim()) {
        infoAdicional = [infoAdicional, infoExtra.trim()].filter(Boolean).join('\n');
        await solicitudesService.update(sol.id, { info_adicional: infoAdicional });
        await solicitudesService.addHistorial(sol.id, 'Información adicional agregada.', sol.historial);
      }
      const res = await fetchConSesion('/api/solicitudes-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descripcion: sol.descripcion,
          info_adicional: infoAdicional,
          tipos_servicio: sol.tipos_servicio.map(t => TIPO_SERVICIO_LABEL[t]),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toastError(data?.error || 'No se pudo analizar.'); return; }
      const analisis = data.analisis as AnalisisIA;
      const actualizada = await solicitudesService.guardarAnalisis(sol.id, analisis, sol.historial, reanalisis);
      onChange({ ...actualizada, info_adicional: infoAdicional });
      setInfoExtra('');
      success(reanalisis ? 'Solicitud reanalizada' : 'Análisis completado');
    } catch {
      toastError('Error de conexión al analizar.');
    } finally {
      setAnalizando(false);
    }
  };

  const cambiarEstado = async (estado: EstadoSolicitud) => {
    try {
      const upd = await solicitudesService.updateEstado(sol.id, estado, sol.historial);
      onChange(upd);
    } catch (e) { toastError('Error: ' + (e instanceof Error ? e.message : '')); }
  };

  const generarBorrador = () => {
    // Reutiliza el cotizador existente; el enganche vincula la cotización.
    router.push(`/cotizador?solicitud=${sol.id}`);
  };

  const a = sol.analisis_ia;

  return (
    <div className="sol-detail" onClick={onClose}>
      <div className="sol-detail-panel" onClick={e => e.stopPropagation()}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p className="section-label" style={{ margin: 0 }}><Inbox size={12} /> {folioSol(sol)}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={14} /></button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Cabecera */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <EstadoBadge estado={sol.estado} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.55rem', borderRadius: 6, background: PRIORIDAD_META[sol.prioridad].bg, color: PRIORIDAD_META[sol.prioridad].color, fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {sol.prioridad}
            </span>
          </div>

          <div>
            <p className="label-muted" style={{ fontSize: '0.55rem', marginBottom: '0.15rem' }}>Cliente</p>
            <p style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 600 }}>{sol.clientes?.nombre_cliente || 'Sin cliente'}{sol.contacto ? ` · ${sol.contacto}` : ''}</p>
          </div>

          <div>
            <p className="label-muted" style={{ fontSize: '0.55rem', marginBottom: '0.15rem' }}>Requerimiento</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{sol.descripcion}</p>
          </div>

          {sol.tipos_servicio.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {sol.tipos_servicio.map(t => (
                <span key={t} style={{ fontSize: '0.66rem', padding: '0.2rem 0.5rem', borderRadius: 999, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--muted)' }}>{TIPO_SERVICIO_LABEL[t]}</span>
              ))}
            </div>
          )}

          {sol.fecha_requerida && (
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Fecha requerida: <b style={{ color: 'var(--text)' }}>{formatDate(sol.fecha_requerida)}</b></p>
          )}

          <div className="iv-divider" />

          {/* ── ANÁLISIS IA ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--y)' }}>
                <Sparkles size={13} /> Análisis IA
              </span>
              <button onClick={() => analizar(false)} disabled={analizando} className="btn btn-primary btn-sm">
                {analizando ? <Loader2 size={12} className="iv-spin" /> : <Wand2 size={12} />}
                {a ? 'Analizar de nuevo' : 'Analizar con IA'}
              </button>
            </div>

            {!a && !analizando && (
              <p style={{ fontSize: '0.78rem', color: 'var(--dim)' }}>Aún no analizada. La IA identifica necesidades técnicas, ítems sugeridos e información faltante — sin inventar precios.</p>
            )}

            {a && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {a.resumen && <p style={{ fontSize: '0.8rem', color: 'var(--muted)', fontStyle: 'italic', borderLeft: '2px solid var(--y-brand)', paddingLeft: '0.6rem' }}>{a.resumen}</p>}

                {a.necesidades.length > 0 && (
                  <div>
                    <p className="label-muted" style={{ fontSize: '0.55rem', marginBottom: '0.35rem' }}>Necesidades técnicas</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {a.necesidades.map((n, i) => (
                        <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text)' }}>
                          <b>{n.titulo}</b>{n.tipo_servicio ? <span style={{ color: 'var(--faint)', fontSize: '0.68rem' }}> · {n.tipo_servicio}</span> : null}
                          {n.detalle && <span style={{ color: 'var(--muted)' }}> — {n.detalle}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {a.items_sugeridos.length > 0 && (
                  <div>
                    <p className="label-muted" style={{ fontSize: '0.55rem', marginBottom: '0.35rem' }}>Ítems sugeridos (sin precio)</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {a.items_sugeridos.map((it, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.76rem' }}>
                          <span style={{ fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase', color: CATEGORIA_COLORS[it.categoria], border: `1px solid ${CATEGORIA_COLORS[it.categoria]}44`, padding: '0.05rem 0.3rem', borderRadius: 4, whiteSpace: 'nowrap' }}>{CATEGORIA_LABELS[it.categoria]}</span>
                          <span style={{ flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.descripcion}>{it.descripcion}</span>
                          <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{it.cantidad_sugerida} {it.unidad}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {a.informacion_faltante.length > 0 && (
                  <div style={{ background: 'rgba(255,198,0,0.06)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
                    <p style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--y)', marginBottom: '0.4rem' }}>
                      <HelpCircle size={12} /> Información faltante
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {a.informacion_faltante.map((f, i) => (
                        <div key={i} style={{ fontSize: '0.78rem' }}>
                          <span style={{ color: 'var(--text)' }}>• {f.pregunta}</span>
                          {f.por_que && <span style={{ color: 'var(--faint)', fontSize: '0.68rem' }}> ({f.por_que})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Agregar info y reanalizar */}
                <div>
                  <p className="label-muted" style={{ fontSize: '0.55rem', marginBottom: '0.3rem' }}>Agregar información y reanalizar</p>
                  <textarea className="input" value={infoExtra} onChange={e => setInfoExtra(e.target.value)} rows={2}
                    placeholder="Ej: son 2 puertas peatonales, cableado aprox. 30 m, hay canalización EMT existente…" style={{ resize: 'vertical' }} />
                  <button onClick={() => analizar(true)} disabled={analizando || !infoExtra.trim()} className="btn btn-ghost btn-sm" style={{ marginTop: '0.4rem' }}>
                    {analizando ? <Loader2 size={12} className="iv-spin" /> : <Sparkles size={12} />} Reanalizar con IA
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="iv-divider" />

          {/* Estado */}
          <div>
            <p className="label-muted" style={{ fontSize: '0.55rem', marginBottom: '0.3rem' }}>Estado</p>
            <select className="input" value={sol.estado} onChange={e => cambiarEstado(e.target.value as EstadoSolicitud)}>
              {ESTADOS_SOLICITUD.map(s => <option key={s} value={s}>{ESTADO_SOLICITUD_META[s].label}</option>)}
            </select>
          </div>

          {/* Historial */}
          {sol.historial?.length > 0 && (
            <div>
              <p className="label-muted" style={{ fontSize: '0.55rem', marginBottom: '0.35rem' }}>Historial</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {sol.historial.slice().reverse().map((h, i) => (
                  <div key={i} style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                    <span style={{ color: 'var(--faint)' }}>{formatDate(h.fecha)}</span> — {h.texto}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <button onClick={generarBorrador} className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
            <FileText size={13} /> Generar borrador de cotización
          </button>
          <button onClick={() => router.push(`/agenda?solicitud=${sol.id}${sol.cliente_id ? `&cliente=${sol.cliente_id}` : ''}`)} className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
            <CalendarPlus size={13} /> Agendar visita
          </button>
          {sol.cotizacion_id && (
            <button onClick={() => router.push(`/cotizador?edit=${sol.cotizacion_id}`)} className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
              <ExternalLink size={13} /> Ver cotización{sol.cotizaciones?.folio ? ` #${String(sol.cotizaciones.folio).padStart(4, '0')}` : ''}
            </button>
          )}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button onClick={onEdit} className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }}><Edit3 size={13} /> Editar</button>
            <button onClick={onDelete} className="btn btn-danger btn-sm" style={{ flex: 1, justifyContent: 'center' }}><Trash2 size={13} /> Eliminar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function SolicitudesPage() {
  const { user, userName } = useAuth(true);
  const { success, error: toastError } = useToast();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoSolicitud | ''>('');
  const [modal, setModal] = useState<{ open: boolean; sol: Solicitud | null }>({ open: false, sol: null });
  const [detalle, setDetalle] = useState<Solicitud | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([solicitudesService.getAll(), clientesService.getAll()]);
      setSolicitudes(s);
      setClientes(c);
    } catch (e) {
      toastError('No se pudieron cargar las solicitudes: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (s: Solicitud) => {
    if (!confirm(`¿Eliminar la solicitud ${folioSol(s)}? No se puede deshacer.`)) return;
    try {
      await solicitudesService.delete(s.id);
      success('Solicitud eliminada');
      if (detalle?.id === s.id) setDetalle(null);
      load();
    } catch (e) { toastError('Error: ' + (e instanceof Error ? e.message : '')); }
  };

  // Refleja en la lista los cambios hechos desde el detalle.
  const onDetalleChange = (s: Solicitud) => {
    setDetalle(s);
    setSolicitudes(prev => prev.map(x => x.id === s.id ? { ...x, ...s } : x));
  };

  const filtered = solicitudes.filter(s => {
    if (filtroEstado && s.estado !== filtroEstado) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return s.descripcion.toLowerCase().includes(q)
      || (s.clientes?.nombre_cliente || '').toLowerCase().includes(q)
      || String(s.folio).includes(q);
  });

  return (
    <div className="anim-in">
      {modal.open && (
        <SolicitudModal
          solicitud={modal.sol}
          clientes={clientes}
          createdBy={user?.email || userName}
          onClose={() => setModal({ open: false, sol: null })}
          onSaved={load}
        />
      )}
      <style>{`
        .sol-layout { display: grid; grid-template-columns: 1fr; gap: 2px; align-items: start; }
        @media (min-width: 900px) { .sol-layout.split { grid-template-columns: 1fr 420px; } }
        .sol-detail-panel { background: var(--bg2); border: 1px solid var(--border2); border-radius: var(--r); overflow: hidden; }
        @media (max-width: 899px) {
          .sol-detail { position: fixed; inset: 0; z-index: 80; background: rgba(0,0,0,0.6); display: flex; justify-content: flex-end; }
          .sol-detail-panel { width: min(480px,100vw); height: 100%; overflow-y: auto; border: none; border-left: 1px solid var(--border2); border-radius: 0; animation: slideInRight 0.2s ease both; }
        }
        @media (min-width: 900px) {
          .sol-detail-panel { position: sticky; top: 8px; max-height: calc(100svh - 90px); overflow-y: auto; }
        }
      `}</style>

      <div className="iv-page-header">
        <div>
          <p className="label-muted" style={{ marginBottom: '0.35rem', letterSpacing: '0.4em' }}>Requerimientos de clientes</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(2rem,5vw,3.2rem)', textTransform: 'uppercase', lineHeight: 0.9, color: 'var(--text)' }}>
            SOLICI<span style={{ color: 'var(--y)' }}>TUDES</span>
          </h1>
        </div>
        <div className="iv-header-actions">
          <button onClick={() => setModal({ open: true, sol: null })} className="btn btn-primary"><Plus size={14} /> Nueva solicitud</button>
        </div>
      </div>

      <div className={`sol-layout${detalle ? ' split' : ''}`}>
      <div className="panel-y">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente, requerimiento o folio…" style={{ paddingLeft: '2.25rem' }} />
          </div>
          <select className="input" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as EstadoSolicitud | '')} style={{ maxWidth: 200 }}>
            <option value="">Todos los estados</option>
            {ESTADOS_SOLICITUD.map(s => <option key={s} value={s}>{ESTADO_SOLICITUD_META[s].label}</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 58 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
            <ClipboardList size={36} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
            <p style={{ fontSize: '0.875rem' }}>{search || filtroEstado ? 'Sin resultados' : 'No hay solicitudes registradas'}</p>
            {!search && !filtroEstado && <button onClick={() => setModal({ open: true, sol: null })} className="btn btn-ghost" style={{ marginTop: '1rem' }}><Plus size={13} /> Crear la primera</button>}
          </div>
        ) : (
          <div>
            {filtered.map(s => (
              <div key={s.id} onClick={() => setDetalle(s)} className="clientes-list-row" style={{ cursor: 'pointer', gridTemplateColumns: '1fr auto auto auto', gap: '1rem' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 500, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: 'monospace', color: 'var(--muted)', marginRight: 6 }}>{folioSol(s)}</span>
                    {s.descripcion}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {s.clientes?.nombre_cliente || 'Sin cliente'} · {formatDate(s.created_at)}
                    {s.cotizacion_id && s.cotizaciones?.folio ? <span style={{ color: 'var(--success)' }}> · COT #{String(s.cotizaciones.folio).padStart(4, '0')}</span> : null}
                  </p>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.5rem', borderRadius: 6, background: PRIORIDAD_META[s.prioridad].bg, color: PRIORIDAD_META[s.prioridad].color, fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }} className="hide-mobile">{s.prioridad}</span>
                <EstadoBadge estado={s.estado} />
                <ChevronRight size={13} color="var(--muted)" />
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border2)', color: 'var(--muted)', fontSize: '0.75rem' }}>
          {filtered.length} solicitud{filtered.length !== 1 ? 'es' : ''}
        </div>
      </div>

      {detalle && (
        <DetalleSolicitud
          sol={detalle}
          onClose={() => setDetalle(null)}
          onChange={onDetalleChange}
          onEdit={() => { setModal({ open: true, sol: detalle }); setDetalle(null); }}
          onDelete={() => handleDelete(detalle)}
        />
      )}
      </div>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: EstadoSolicitud }) {
  const m = ESTADO_SOLICITUD_META[estado];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', borderRadius: 6, background: m.bg, color: m.color, fontSize: '0.66rem', fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color }} />
      {m.label}
    </span>
  );
}
