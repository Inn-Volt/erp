'use client';

import { filaClicable } from '@/lib/a11y';
import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Search, Edit3, Trash2, X, Loader2, ChevronRight, Building2, Phone, Mail, MapPin, FileText } from 'lucide-react';
import { clientesService } from '@/services/clientes';
import type { Cliente } from '@/types';
import { useToast } from '@/hooks/useToast';
import { formatDate } from '@/utils';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import LinksMapa from '@/components/LinksMapa';
import SucursalesCliente from '@/components/SucursalesCliente';
import { usePermisos } from '@/hooks/usePermisos';
import { useFase } from '@/lib/fases';
import { avisoRut, formatearRut } from '@/lib/rut';
import { ORIGENES } from '@/types/solicitud';

const EMPTY_CLIENTE: Omit<Cliente, 'id' | 'created_at' | 'updated_at'> = {
  nombre_cliente: '',
  empresa: '',
  rut: '',
  email: '',
  telefono: '',
  direccion: '',
  notas: '',
  estado: 'activo',
};

function ClienteModal({ cliente, onClose, onSave }: {
  cliente: Partial<Cliente> | null;
  onClose: () => void;
  onSave: (data: Omit<Cliente, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
}) {
  const [form, setForm] = useState({ ...EMPTY_CLIENTE, ...cliente });
  const [saving, setSaving] = useState(false);
  // Fase 15: ficha tributaria, origen y «cliente de confianza». Sin la fase no se mandan.
  const fase15 = useFase(15);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre_cliente.trim()) return;
    setSaving(true);
    const datos = { ...form, rut: form.rut ? formatearRut(form.rut) : form.rut };
    if (!fase15) for (const k of ['giro', 'comuna', 'ciudad', 'correo_dte', 'tipo_persona', 'origen', 'sin_anticipo'] as const) delete (datos as Record<string, unknown>)[k];
    await onSave(datos as Omit<Cliente, 'id' | 'created_at' | 'updated_at'>);
    setSaving(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 560, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}>
            <Users size={13} /> {cliente?.id ? 'Editar cliente' : 'Nuevo cliente'}
          </p>
          <button aria-label="Cerrar" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <style dangerouslySetInnerHTML={{__html: `.cliente-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; } @media (max-width: 500px) { .cliente-form-grid { grid-template-columns: 1fr !important; } }`}} />
          <div className="cliente-form-grid">
            <div style={{ gridColumn: '1/-1' }}>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Nombre / Razón social *</label>
              <input className="input" value={form.nombre_cliente} onChange={set('nombre_cliente')} required placeholder="Ej: Juan Pérez" />
            </div>
            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Empresa</label>
              <input className="input" value={form.empresa || ''} onChange={set('empresa')} placeholder="Empresa Ltda." />
            </div>
            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>RUT</label>
              <input className="input" value={form.rut} onChange={set('rut')} onBlur={() => form.rut && setForm(p => ({ ...p, rut: formatearRut(p.rut) }))} placeholder="12.345.678-9" />
              {avisoRut(form.rut) && <span style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>{avisoRut(form.rut)}</span>}
            </div>
            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Teléfono</label>
              <input className="input" value={form.telefono || ''} onChange={set('telefono')} placeholder="+56 9 XXXX XXXX" />
            </div>
            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Correo</label>
              <input className="input" type="email" value={form.email || ''} onChange={set('email')} placeholder="cliente@empresa.cl" />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Dirección</label>
              <input className="input" value={form.direccion || ''} onChange={set('direccion')} placeholder="Av. Ejemplo 123, Santiago" />
            </div>
            {fase15 && <>
              <p className="label-muted" style={{ gridColumn: '1/-1', margin: '0.4rem 0 -0.4rem', fontWeight: 700 }}>Datos para facturar</p>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Giro</label>
                <input className="input" value={form.giro || ''} onChange={e => setForm(p => ({ ...p, giro: e.target.value }))} placeholder="Servicios odontológicos" />
              </div>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Es</label>
                <select className="input" value={form.tipo_persona || ''} onChange={e => setForm(p => ({ ...p, tipo_persona: (e.target.value || null) as Cliente['tipo_persona'] }))}>
                  <option value="">Sin indicar</option><option value="empresa">Empresa (factura)</option><option value="persona">Persona (boleta o factura)</option>
                </select>
              </div>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Comuna</label>
                <input className="input" value={form.comuna || ''} onChange={e => setForm(p => ({ ...p, comuna: e.target.value }))} placeholder="Providencia" />
              </div>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Ciudad</label>
                <input className="input" value={form.ciudad || ''} onChange={e => setForm(p => ({ ...p, ciudad: e.target.value }))} placeholder="Santiago" />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Correo para la factura (intercambio DTE)</label>
                <input className="input" type="email" value={form.correo_dte || ''} onChange={e => setForm(p => ({ ...p, correo_dte: e.target.value }))} placeholder="dte@empresa.cl (si es otro)" />
              </div>
              <p className="label-muted" style={{ gridColumn: '1/-1', margin: '0.4rem 0 -0.4rem', fontWeight: 700 }}>Comercial</p>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>¿Cómo llegó?</label>
                <select className="input" value={form.origen || ''} onChange={e => setForm(p => ({ ...p, origen: e.target.value || null }))}>
                  <option value="">Sin indicar</option>
                  {ORIGENES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.84rem', color: 'var(--text)', cursor: 'pointer', alignSelf: 'end', paddingBottom: '0.5rem' }}>
                <input type="checkbox" checked={!!form.sin_anticipo} onChange={e => setForm(p => ({ ...p, sin_anticipo: e.target.checked }))} style={{ accentColor: 'var(--y-brand)', width: 16, height: 16 }} />
                Cliente de confianza: puede partir sin anticipo
              </label>
            </>}
            {cliente?.estado_pago !== undefined && (
              <div style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: '180px 1fr', gap: '0.6rem' }}>
                <div>
                  <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Estado de pago</label>
                  <select className="input" value={form.estado_pago || 'al_dia'} onChange={e => setForm(p => ({ ...p, estado_pago: e.target.value as Cliente['estado_pago'] }))}>
                    <option value="al_dia">Al día</option><option value="atrasado">Atrasado (avisa al cotizar)</option><option value="bloqueado">Bloqueado (no se le envían cotizaciones)</option>
                  </select>
                </div>
                <div>
                  <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Nota de pago</label>
                  <input className="input" value={form.nota_pago || ''} onChange={e => setForm(p => ({ ...p, nota_pago: e.target.value }))} placeholder="Factura 1234 vencida hace 60 días" />
                </div>
              </div>
            )}
            <div style={{ gridColumn: '1/-1' }}>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Notas</label>
              <textarea className="input" value={form.notas || ''} onChange={set('notas')} rows={2} placeholder="Observaciones internas..." style={{ resize: 'vertical' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 size={13} className="iv-spin" /> : null}
              {cliente?.id ? 'Actualizar' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ClientesPage() {
  const { success, error: toastError } = useToast();
  const { puede } = usePermisos();
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; cliente: Partial<Cliente> | null }>({ open: false, cliente: null });
  const [selected, setSelected] = useState<Cliente | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await clientesService.getAll();
      setClientes(data);
    } catch (e) {
      console.error('Error al cargar clientes:', e);
      toastError('No se pudieron cargar los clientes');
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { load(); }, [load]);

  // Enlaces directos (buscador y accesos rápidos): ?nuevo=1 abre el formulario; ?ver=<id>, la ficha.
  const [pedido, setPedido] = useState<{ nuevo: boolean; ver: string | null } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('nuevo') || q.get('ver')) { setPedido({ nuevo: q.get('nuevo') === '1', ver: q.get('ver') }); window.history.replaceState(null, '', '/clientes'); }
  }, []);
  useEffect(() => {
    if (!pedido || loading) return;
    if (pedido.nuevo && puede('clientes.crear')) setModal({ open: true, cliente: null });
    if (pedido.ver) { const c = clientes.find(x => x.id === pedido.ver); if (c) setSelected(c); }
    setPedido(null);
  }, [pedido, loading, clientes, puede]);

  const filtered = clientes.filter(c =>
    !search ||
    c.nombre_cliente.toLowerCase().includes(search.toLowerCase()) ||
    (c.empresa || '').toLowerCase().includes(search.toLowerCase()) ||
    c.rut.includes(search)
  );

  const handleSave = async (data: Omit<Cliente, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      if (modal.cliente?.id) {
        await clientesService.update(modal.cliente.id, data);
        success('Cliente actualizado');
      } else {
        await clientesService.create(data);
        success('Cliente creado');
      }
      setModal({ open: false, cliente: null });
      load();
    } catch (e: unknown) {
      toastError('Error al guardar: ' + (e instanceof Error ? e.message : 'Error desconocido'));
    }
  };

  const handleDelete = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar cliente "${nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await clientesService.delete(id);
      success('Cliente eliminado');
      if (selected?.id === id) setSelected(null);
      load();
    } catch (e: unknown) {
      toastError('Error: ' + (e instanceof Error ? e.message : 'Error'));
    }
  };

  return (
    <div className="anim-in">
      {modal.open && (
        <ClienteModal
          cliente={modal.cliente}
          onClose={() => setModal({ open: false, cliente: null })}
          onSave={handleSave}
        />
      )}

      <PageHeader
        eyebrow="Base de datos"
        title="Clientes"
        actions={<>
          {puede('clientes.crear') && <button onClick={() => setModal({ open: true, cliente: null })} className="btn btn-primary">
            <Plus size={14} /> Nuevo cliente
          </button>}
        </>}
      />

      {/* ── Detail panel: mobile overlay / desktop inline ── */}
      {selected && (
        <div className="cliente-detail-overlay open" onClick={() => setSelected(null)}>
          <div className="cliente-detail-panel-mobile" onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="section-label" style={{ margin: 0 }}><Users size={12} /> Detalle</p>
              <button aria-label="Cerrar" onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.2rem', letterSpacing: '-0.01em', color: 'var(--text)', lineHeight: 1.2 }}>{selected.nombre_cliente}</p>
                {selected.empresa && <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.25rem' }}>{selected.empresa}</p>}
              </div>
              <div className="iv-divider" />
              {[
                { Icon: Building2, label: 'RUT',       val: selected.rut       || '—', href: '' },
                { Icon: Phone,     label: 'Teléfono',  val: selected.telefono  || '—', href: selected.telefono ? `tel:${selected.telefono.replace(/[^\d+]/g, '')}` : '' },
                { Icon: Mail,      label: 'Correo',    val: selected.email     || '—', href: selected.email ? `mailto:${selected.email}` : '' },
                { Icon: MapPin,    label: 'Dirección', val: [selected.direccion, selected.comuna, selected.ciudad].filter(Boolean).join(', ') || '—', href: '' },
                ...(selected.giro || selected.correo_dte ? [{ Icon: FileText, label: 'Para facturar', val: [selected.giro, selected.correo_dte].filter(Boolean).join(' · '), href: '' }] : []),
                ...(selected.origen ? [{ Icon: Users, label: 'Llegó por', val: selected.origen, href: '' }] : []),
              ].map(({ Icon, label, val, href }) => (
                <div key={label} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--muted)', marginTop: 3, flexShrink: 0, display: 'flex' }}><Icon size={14} /></span>
                  <div style={{ minWidth: 0 }}>
                    <p className="label-muted" style={{ marginBottom: '0.15rem' }}>{label}</p>
                    {href
                      ? <a href={href} style={{ fontSize: '0.88rem', color: 'var(--text)', wordBreak: 'break-word', textDecoration: 'underline', textDecorationColor: 'var(--border2)', textUnderlineOffset: 3 }}>{val}</a>
                      : <p style={{ fontSize: '0.88rem', color: 'var(--text)', wordBreak: 'break-word' }}>{val}</p>}
                    {label === 'Dirección' && selected.direccion && <div style={{ marginTop: '0.45rem' }}><LinksMapa direccion={selected.direccion} compacto /></div>}
                  </div>
                </div>
              ))}
              {selected.rut && avisoRut(selected.rut) && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--danger)' }}>{avisoRut(selected.rut)} Corrígelo antes de facturar.</p>}
              {selected.sin_anticipo && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--success)' }}>Cliente de confianza: sus trabajos pueden partir sin anticipo.</p>}
              {selected.notas && (
                <div style={{ background: 'var(--bg3)', padding: '0.75rem', borderRadius: 10 }}>
                  <p className="label-muted" style={{ marginBottom: '0.35rem' }}>Notas</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5 }}>{selected.notas}</p>
                </div>
              )}
              <div className="iv-divider" />
              <SucursalesCliente clienteId={selected.id} editable={puede('clientes.crear')} />
              {selected.created_at && (
                <p style={{ fontSize: '0.72rem', color: 'var(--dim)' }}>Creado: {formatDate(selected.created_at)}</p>
              )}
            </div>
            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <button onClick={() => router.push(`/cotizador?cliente=${selected.id}`)} className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                <FileText size={13} /> Nueva cotización
              </button>
              {puede('clientes.crear') && <button onClick={() => setModal({ open: true, cliente: selected })} className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                <Edit3 size={13} /> Editar cliente
              </button>}
              {puede('clientes.anular') && <button onClick={() => handleDelete(selected.id, selected.nombre_cliente)} className="btn btn-danger btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                <Trash2 size={13} /> Eliminar
              </button>}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 320px' : '1fr', gap: '2px' }} className={selected ? 'clientes-layout clientes-layout-split' : 'clientes-layout'}>
        {/* Lista */}
        <div className="panel-y">
          {/* Search bar */}
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                className="input"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre, empresa o RUT..."
                style={{ paddingLeft: '2.25rem' }}
              />
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 60 }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
              <Users size={36} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
              <p style={{ fontSize: '0.875rem' }}>{search ? 'Sin resultados' : 'No hay clientes registrados'}</p>
              {!search && (
                <button onClick={() => setModal({ open: true, cliente: null })} className="btn btn-ghost" style={{ marginTop: '1rem' }}>
                  <Plus size={13} /> Agregar primero
                </button>
              )}
            </div>
          ) : (
            <div>
              {/* Table header — hidden on mobile via CSS */}
              <div className="clientes-list-header">
                {['Cliente', 'RUT', 'Teléfono', 'Estado', ''].map(h => (
                  <span key={h} className="label-muted" style={{ fontSize: '0.55rem' }}>{h}</span>
                ))}
              </div>
              {filtered.map(c => (
                <div
                  key={c.id}
                  {...filaClicable}
                  onClick={() => setSelected(selected?.id === c.id ? null : c)}
                  className={`clientes-list-row${selected?.id === c.id ? ' active' : ''}`}
                  style={{
                    borderLeft: `3px solid ${selected?.id === c.id ? 'var(--y)' : 'transparent'}`,
                  }}
                >
                  {/* Name + company always shown */}
                  <div>
                    <p style={{ fontWeight: 500, fontSize: '0.875rem' }}>{c.nombre_cliente}</p>
                    {c.empresa && <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{c.empresa}</p>}
                    {c.estado_pago && c.estado_pago !== 'al_dia' && <p style={{ fontSize: '0.7rem', fontWeight: 700, color: c.estado_pago === 'bloqueado' ? 'var(--danger)' : '#d97706' }}>{c.estado_pago === 'bloqueado' ? 'Bloqueado por pagos' : 'Pagos atrasados'}</p>}
                    {/* Mobile-only: show RUT + phone inline */}
                    <p className="mobile-meta" style={{ fontSize: '0.72rem', color: 'var(--dim)', marginTop: '0.2rem' }}>
                      {c.rut && <span style={{ fontFamily: 'monospace' }}>{c.rut}</span>}
                      {c.rut && c.telefono && <span> · </span>}
                      {c.telefono && <span>{c.telefono}</span>}
                    </p>
                  </div>
                  {/* Desktop-only columns */}
                  <span style={{ fontSize: '0.82rem', color: 'var(--muted)', fontFamily: 'monospace' }}>{c.rut || '—'}</span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{c.telefono || '—'}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.estado === 'activo' ? 'var(--success)' : 'var(--danger)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.72rem', color: c.estado === 'activo' ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--font-display)' }}>{c.estado}</span>
                  </span>
                  <ChevronRight size={13} color="var(--muted)" style={{ marginLeft: 'auto' }} />
                </div>
              ))}
            </div>
          )}
          <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border2)', color: 'var(--muted)', fontSize: '0.75rem' }}>
            {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Detail panel — desktop inline, hidden on mobile (shown as overlay above) */}
        {selected && (
          <div className="panel-y anim-in" style={{ display: 'none' }} id="cliente-detail-desktop">
            <style dangerouslySetInnerHTML={{__html: `@media (min-width: 769px) { #cliente-detail-desktop { display: flex !important; flex-direction: column; } }`}} />
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="section-label" style={{ margin: 0 }}><Users size={12} /> Detalle</p>
              <button aria-label="Cerrar" onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
              <div>
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.2rem', letterSpacing: '-0.01em', color: 'var(--text)', lineHeight: 1.2 }}>{selected.nombre_cliente}</p>
                {selected.empresa && <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.25rem' }}>{selected.empresa}</p>}
              </div>
              <div className="iv-divider" />
              {[
                { Icon: Building2, label: 'RUT',       val: selected.rut       || '—', href: '' },
                { Icon: Phone,     label: 'Teléfono',  val: selected.telefono  || '—', href: selected.telefono ? `tel:${selected.telefono.replace(/[^\d+]/g, '')}` : '' },
                { Icon: Mail,      label: 'Correo',    val: selected.email     || '—', href: selected.email ? `mailto:${selected.email}` : '' },
                { Icon: MapPin,    label: 'Dirección', val: [selected.direccion, selected.comuna, selected.ciudad].filter(Boolean).join(', ') || '—', href: '' },
                ...(selected.giro || selected.correo_dte ? [{ Icon: FileText, label: 'Para facturar', val: [selected.giro, selected.correo_dte].filter(Boolean).join(' · '), href: '' }] : []),
                ...(selected.origen ? [{ Icon: Users, label: 'Llegó por', val: selected.origen, href: '' }] : []),
              ].map(({ Icon, label, val, href }) => (
                <div key={label} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--muted)', marginTop: 3, flexShrink: 0, display: 'flex' }}><Icon size={14} /></span>
                  <div style={{ minWidth: 0 }}>
                    <p className="label-muted" style={{ marginBottom: '0.15rem' }}>{label}</p>
                    {href
                      ? <a href={href} style={{ fontSize: '0.88rem', color: 'var(--text)', wordBreak: 'break-word', textDecoration: 'underline', textDecorationColor: 'var(--border2)', textUnderlineOffset: 3 }}>{val}</a>
                      : <p style={{ fontSize: '0.88rem', color: 'var(--text)', wordBreak: 'break-word' }}>{val}</p>}
                    {label === 'Dirección' && selected.direccion && <div style={{ marginTop: '0.45rem' }}><LinksMapa direccion={selected.direccion} compacto /></div>}
                  </div>
                </div>
              ))}
              {selected.rut && avisoRut(selected.rut) && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--danger)' }}>{avisoRut(selected.rut)} Corrígelo antes de facturar.</p>}
              {selected.sin_anticipo && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--success)' }}>Cliente de confianza: sus trabajos pueden partir sin anticipo.</p>}
              {selected.notas && (
                <div style={{ background: 'var(--bg3)', padding: '0.75rem', borderRadius: 10 }}>
                  <p className="label-muted" style={{ marginBottom: '0.35rem' }}>Notas</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5 }}>{selected.notas}</p>
                </div>
              )}
              <div className="iv-divider" />
              <SucursalesCliente clienteId={selected.id} editable={puede('clientes.crear')} />
              {selected.created_at && (
                <p style={{ fontSize: '0.72rem', color: 'var(--dim)' }}>Creado: {formatDate(selected.created_at)}</p>
              )}
            </div>
            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <button onClick={() => router.push(`/cotizador?cliente=${selected.id}`)} className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                <FileText size={13} /> Nueva cotización
              </button>
              {puede('clientes.crear') && <button onClick={() => setModal({ open: true, cliente: selected })} className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                <Edit3 size={13} /> Editar cliente
              </button>}
              {puede('clientes.anular') && <button onClick={() => handleDelete(selected.id, selected.nombre_cliente)} className="btn btn-danger btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                <Trash2 size={13} /> Eliminar
              </button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
