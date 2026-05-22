'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Search, Edit3, Trash2, X, Loader2, ChevronRight, Building2, Phone, Mail, MapPin, FileText } from 'lucide-react';
import { clientesService } from '@/services/clientes';
import type { Cliente } from '@/types';
import { useToast } from '@/hooks/useToast';
import { formatDate } from '@/utils';
import { useRouter } from 'next/navigation';

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

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre_cliente.trim()) return;
    setSaving(true);
    await onSave(form as Omit<Cliente, 'id' | 'created_at' | 'updated_at'>);
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}>
            <Users size={13} /> {cliente?.id ? 'Editar cliente' : 'Nuevo cliente'}
          </p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
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
              <input className="input" value={form.rut} onChange={set('rut')} placeholder="12.345.678-9" />
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
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; cliente: Partial<Cliente> | null }>({ open: false, cliente: null });
  const [selected, setSelected] = useState<Cliente | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await clientesService.getAll();
    setClientes(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

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

      <div className="iv-page-header">
        <div>
          <p className="label-muted" style={{ marginBottom: '0.35rem', letterSpacing: '0.4em' }}>Base de datos</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(2rem,5vw,3.2rem)', textTransform: 'uppercase', lineHeight: 0.9, color: '#fff' }}>
            CLIEN<span style={{ color: 'var(--y)' }}>TES</span>
          </h1>
        </div>
        <div className="iv-header-actions">
          <button onClick={() => setModal({ open: true, cliente: null })} className="btn btn-primary">
            <Plus size={14} /> Nuevo cliente
          </button>
        </div>
      </div>

      {/* ── Detail panel: mobile overlay / desktop inline ── */}
      {selected && (
        <div className="cliente-detail-overlay open" onClick={() => setSelected(null)}>
          <div className="cliente-detail-panel-mobile" onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="section-label" style={{ margin: 0 }}><Users size={12} /> Detalle</p>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.2rem', textTransform: 'uppercase', color: '#fff', lineHeight: 1.1 }}>{selected.nombre_cliente}</p>
                {selected.empresa && <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.25rem' }}>{selected.empresa}</p>}
              </div>
              <div className="iv-divider" />
              {[
                [<Building2 size={12} />, 'RUT', selected.rut || '—'],
                [<Phone size={12} />, 'Teléfono', selected.telefono || '—'],
                [<Mail size={12} />, 'Correo', selected.email || '—'],
                [<MapPin size={12} />, 'Dirección', selected.direccion || '—'],
              ].map(([icon, label, val]) => (
                <div key={label as string} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--y)', marginTop: 2, flexShrink: 0 }}>{icon as React.ReactNode}</span>
                  <div>
                    <p className="label-muted" style={{ fontSize: '0.55rem', marginBottom: '0.15rem' }}>{label as string}</p>
                    <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)', wordBreak: 'break-all' }}>{val as string}</p>
                  </div>
                </div>
              ))}
              {selected.notas && (
                <div style={{ background: 'var(--bg3)', padding: '0.75rem', borderLeft: '2px solid rgba(255,198,0,0.3)' }}>
                  <p className="label-muted" style={{ fontSize: '0.55rem', marginBottom: '0.35rem' }}>Notas</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5 }}>{selected.notas}</p>
                </div>
              )}
              {selected.created_at && (
                <p style={{ fontSize: '0.72rem', color: 'var(--dim)' }}>Creado: {formatDate(selected.created_at)}</p>
              )}
            </div>
            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <button onClick={() => router.push(`/cotizador?cliente=${selected.id}`)} className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                <FileText size={13} /> Nueva cotización
              </button>
              <button onClick={() => setModal({ open: true, cliente: selected })} className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                <Edit3 size={13} /> Editar cliente
              </button>
              <button onClick={() => handleDelete(selected.id, selected.nombre_cliente)} className="btn btn-danger btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                <Trash2 size={13} /> Eliminar
              </button>
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
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.estado === 'activo' ? '#4ade80' : '#f87171', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.72rem', color: c.estado === 'activo' ? '#4ade80' : '#f87171', fontFamily: 'var(--font-display)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>{c.estado}</span>
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
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
              <div>
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.2rem', textTransform: 'uppercase', color: '#fff', lineHeight: 1.1 }}>{selected.nombre_cliente}</p>
                {selected.empresa && <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.25rem' }}>{selected.empresa}</p>}
              </div>
              <div className="iv-divider" />
              {[
                [<Building2 size={12} />, 'RUT', selected.rut || '—'],
                [<Phone size={12} />, 'Teléfono', selected.telefono || '—'],
                [<Mail size={12} />, 'Correo', selected.email || '—'],
                [<MapPin size={12} />, 'Dirección', selected.direccion || '—'],
              ].map(([icon, label, val]) => (
                <div key={label as string} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--y)', marginTop: 2, flexShrink: 0 }}>{icon as React.ReactNode}</span>
                  <div>
                    <p className="label-muted" style={{ fontSize: '0.55rem', marginBottom: '0.15rem' }}>{label as string}</p>
                    <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)', wordBreak: 'break-all' }}>{val as string}</p>
                  </div>
                </div>
              ))}
              {selected.notas && (
                <div style={{ background: 'var(--bg3)', padding: '0.75rem', borderLeft: '2px solid rgba(255,198,0,0.3)' }}>
                  <p className="label-muted" style={{ fontSize: '0.55rem', marginBottom: '0.35rem' }}>Notas</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5 }}>{selected.notas}</p>
                </div>
              )}
              {selected.created_at && (
                <p style={{ fontSize: '0.72rem', color: 'var(--dim)' }}>Creado: {formatDate(selected.created_at)}</p>
              )}
            </div>
            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <button onClick={() => router.push(`/cotizador?cliente=${selected.id}`)} className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                <FileText size={13} /> Nueva cotización
              </button>
              <button onClick={() => setModal({ open: true, cliente: selected })} className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                <Edit3 size={13} /> Editar cliente
              </button>
              <button onClick={() => handleDelete(selected.id, selected.nombre_cliente)} className="btn btn-danger btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                <Trash2 size={13} /> Eliminar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
