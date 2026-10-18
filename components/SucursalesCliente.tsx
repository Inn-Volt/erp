'use client';

/**
 * Sucursales (direcciones de trabajo) y contactos de un cliente (traído de TecApp).
 * Una empresa puede tener varias obras/locales y varias personas a quien llamar.
 */

import { useCallback, useEffect, useState } from 'react';
import { MapPin, Phone, Plus, Star, Trash2, UserRound, X, Check } from 'lucide-react';
import LinksMapa from '@/components/LinksMapa';
import { faltaFase2, sucursalesService, type Contacto, type Sucursal } from '@/services/operacion';
import { useToast } from '@/hooks/useToast';

type Edit = { tipo: 'sucursal'; d: Partial<Sucursal> } | { tipo: 'contacto'; d: Partial<Contacto> } | null;

export default function SucursalesCliente({ clienteId, editable }: { clienteId: string; editable: boolean }) {
  const { error: toastError } = useToast();
  const [suc, setSuc] = useState<Sucursal[]>([]);
  const [con, setCon] = useState<Contacto[]>([]);
  const [falta, setFalta] = useState(false);
  const [edit, setEdit] = useState<Edit>(null);

  const cargar = useCallback(async () => {
    try { const r = await sucursalesService.deCliente(clienteId); setSuc(r.sucursales); setCon(r.contactos); setFalta(false); }
    catch (e) { if (faltaFase2(e)) setFalta(true); }
  }, [clienteId]);
  useEffect(() => { cargar(); setEdit(null); }, [cargar]);

  if (falta) return null;

  const guardar = async () => {
    if (!edit) return;
    if (!edit.d.nombre?.trim()) { toastError('Falta el nombre'); return; }
    try {
      if (edit.tipo === 'sucursal') await sucursalesService.guardarSucursal({ ...edit.d, cliente_id: clienteId });
      else await sucursalesService.guardarContacto({ ...edit.d, cliente_id: clienteId });
      setEdit(null); cargar();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar'); }
  };
  const quitar = async (tipo: 'sucursal' | 'contacto', id: string) => {
    if (!confirm('¿Quitar?')) return;
    try {
      if (tipo === 'sucursal') await sucursalesService.guardarSucursal({ id, activo: false });
      else await sucursalesService.guardarContacto({ id, activo: false });
      cargar();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo quitar'); }
  };

  const campo = (k: string, ph: string) => (
    <input className="input" style={{ padding: '0.4rem 0.6rem', fontSize: '0.84rem' }} placeholder={ph}
      value={String((edit?.d as Record<string, unknown>)?.[k] ?? '')}
      onChange={e => setEdit(x => x ? { ...x, d: { ...x.d, [k]: e.target.value } } as Edit : x)} />
  );
  const fila = { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.84rem', color: 'var(--text)' } as const;
  const boton = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <p className="label-muted" style={{ flex: 1 }}>Sucursales / obras ({suc.length})</p>
          {editable && <button style={boton} onClick={() => setEdit({ tipo: 'sucursal', d: {} })} aria-label="Agregar sucursal"><Plus size={14} /></button>}
        </div>
        {suc.map(s => (
          <div key={s.id} style={{ ...fila, padding: '0.35rem 0', borderBottom: '1px solid var(--border2)' }}>
            <MapPin size={13} style={{ marginTop: 3, color: 'var(--muted)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 600 }}>{s.nombre}</p>
              {s.direccion && <p style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{s.direccion}{s.comuna ? `, ${s.comuna}` : ''}</p>}
              {(s.contacto || s.telefono) && <p style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{s.contacto}{s.telefono ? ` · ${s.telefono}` : ''}</p>}
              {s.direccion && <div style={{ marginTop: 4 }}><LinksMapa direccion={`${s.direccion}${s.comuna ? ', ' + s.comuna : ''}`} compacto /></div>}
            </div>
            {editable && <>
              <button style={boton} onClick={() => setEdit({ tipo: 'sucursal', d: s })} aria-label="Editar">✎</button>
              <button style={boton} onClick={() => quitar('sucursal', s.id)} aria-label="Quitar"><Trash2 size={12} /></button>
            </>}
          </div>
        ))}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <p className="label-muted" style={{ flex: 1 }}>Contactos ({con.length})</p>
          {editable && <button style={boton} onClick={() => setEdit({ tipo: 'contacto', d: {} })} aria-label="Agregar contacto"><Plus size={14} /></button>}
        </div>
        {con.map(c => (
          <div key={c.id} style={{ ...fila, padding: '0.35rem 0', borderBottom: '1px solid var(--border2)' }}>
            {c.principal ? <Star size={13} style={{ marginTop: 3, color: 'var(--y)', flexShrink: 0 }} /> : <UserRound size={13} style={{ marginTop: 3, color: 'var(--muted)', flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 600 }}>{c.nombre}{c.cargo ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {c.cargo}</span> : null}</p>
              <p style={{ color: 'var(--muted)', fontSize: '0.78rem', wordBreak: 'break-word' }}>
                {c.telefono && <a href={`tel:${c.telefono.replace(/[^\d+]/g, '')}`}><Phone size={10} /> {c.telefono}</a>}
                {c.telefono && c.email ? ' · ' : ''}{c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
              </p>
            </div>
            {editable && <>
              <button style={boton} onClick={() => setEdit({ tipo: 'contacto', d: c })} aria-label="Editar">✎</button>
              <button style={boton} onClick={() => quitar('contacto', c.id)} aria-label="Quitar"><Trash2 size={12} /></button>
            </>}
          </div>
        ))}
      </div>

      {edit && (
        <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p className="label-muted">{edit.d.id ? 'Editar' : 'Nueva'} {edit.tipo === 'sucursal' ? 'sucursal' : 'persona de contacto'}</p>
          {edit.tipo === 'sucursal' ? <>
            {campo('nombre', 'Nombre (ej. Local Providencia) *')}{campo('direccion', 'Dirección')}{campo('comuna', 'Comuna')}
            {campo('contacto', 'Encargado en el lugar')}{campo('telefono', 'Teléfono')}
          </> : <>
            {campo('nombre', 'Nombre *')}{campo('cargo', 'Cargo')}{campo('telefono', 'Teléfono')}{campo('email', 'Correo')}
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.82rem', color: 'var(--text)' }}>
              <input type="checkbox" checked={!!(edit.d as Partial<Contacto>).principal} style={{ accentColor: 'var(--y-brand)' }}
                onChange={e => setEdit({ tipo: 'contacto', d: { ...edit.d, principal: e.target.checked } as Partial<Contacto> })} /> Contacto principal
            </label>
          </>}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setEdit(null)}><X size={12} /> Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={guardar}><Check size={12} /> Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}
