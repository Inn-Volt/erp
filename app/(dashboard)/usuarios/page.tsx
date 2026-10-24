'use client';

/**
 * Mi empresa → Usuarios (portado de TecApp y adaptado).
 * Quién entra al ERP y qué puede hacer: cada persona tiene uno o más roles que se
 * activan y desactivan con un interruptor, y la persona misma se puede desactivar.
 * Invitar genera un enlace de acceso que se comparte por WhatsApp o se copia.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, Loader2, Search, Link2, Copy, MessageCircle, X, ShieldCheck, UserX, UserCheck, ChevronDown } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { usuariosService, type Usuario, type Rol, type UsuarioRol, type EnlaceDeAcceso, type EmpresaBreve } from '@/services/usuarios';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import NumeroInput from '@/components/NumeroInput';
import { supabase } from '@/lib/supabase';
import { useFase } from '@/lib/fases';

const iniciales = (u: Usuario) =>
  (u.nombre || u.email || '?').split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();

function Interruptor({ activo, onChange, disabled, etiqueta }: { activo: boolean; onChange: () => void; disabled?: boolean; etiqueta: string }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} onClick={onChange} disabled={disabled}
      style={{
        width: 42, height: 24, borderRadius: 999, flexShrink: 0, position: 'relative', border: 'none',
        background: activo ? 'var(--y-brand)' : 'var(--bg3)', boxShadow: 'inset 0 0 0 1px var(--border2)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, transition: 'background .15s',
      }}>
      <span style={{ position: 'absolute', top: 3, left: activo ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: activo ? 'var(--on-accent)' : 'var(--muted)', transition: 'left .15s' }} />
    </button>
  );
}

/** Muestra un enlace de acceso con copiar y compartir por WhatsApp. */
function EnlaceCompartible({ enlace, nombre, onCerrar }: { enlace: string; nombre: string; onCerrar: () => void }) {
  const { success } = useToast();
  const texto = `Hola${nombre ? ' ' + nombre.split(' ')[0] : ''}, te doy acceso al ERP de InnVolt. Entra aquí para crear tu contraseña: ${enlace}`;
  return (
    <div style={{ background: 'var(--y-soft)', border: '1px solid var(--border2)', borderRadius: 12, padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}><Link2 size={15} /> Enlace de acceso</span>
        <button onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={15} /></button>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Compártelo con la persona: al abrirlo crea su contraseña y entra. Vence en unas horas; si se le pasa, genera uno nuevo.</p>
      <input readOnly value={enlace} className="input" onFocus={e => e.currentTarget.select()} style={{ fontSize: '0.78rem' }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(enlace); success('Enlace copiado'); } catch { /* sin portapapeles */ } }}><Copy size={13} /> Copiar</button>
        <a className="btn btn-primary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={13} /> Enviar por WhatsApp</a>
      </div>
    </div>
  );
}

function InvitarModal({ roles, onClose, onListo }: { roles: Rol[]; onClose: () => void; onListo: () => void }) {
  const { error: toastError } = useToast();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [elegidos, setElegidos] = useState<string[]>(() => roles.filter(r => r.clave === 'tecnico').map(r => r.id));
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<EnlaceDeAcceso | null>(null);

  const invitar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await usuariosService.invitar({ email, nombre, roles: elegidos });
      setResultado(r);
      onListo();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'No se pudo invitar');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}><UserPlus size={16} /> Invitar usuario</p>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>
        {resultado ? (
          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text)' }}><b>{nombre || email}</b> ya tiene usuario. Solo falta que cree su contraseña con este enlace.</p>
            {resultado.aviso && <p style={{ fontSize: '0.82rem', color: 'var(--danger)' }}>{resultado.aviso}</p>}
            {resultado.enlace && <EnlaceCompartible enlace={resultado.enlace} nombre={nombre} onCerrar={onClose} />}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-primary" onClick={onClose}>Listo</button></div>
          </div>
        ) : (
          <form onSubmit={invitar} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: 6 }}>Correo *</label>
                <input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@empresa.cl" autoFocus />
              </div>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: 6 }}>Nombre</label>
                <input className="input" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Joaquín Pérez" />
              </div>
              <div>
                <p className="label-muted" style={{ marginBottom: 6 }}>Roles</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {roles.filter(r => r.activo).map(r => (
                    <label key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '0.55rem 0.7rem', borderRadius: 10, border: `1px solid ${elegidos.includes(r.id) ? 'var(--y-brand)' : 'var(--border2)'}`, background: elegidos.includes(r.id) ? 'var(--y-soft)' : 'var(--bg2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={elegidos.includes(r.id)} onChange={() => setElegidos(p => p.includes(r.id) ? p.filter(x => x !== r.id) : [...p, r.id])} style={{ marginTop: 3, accentColor: 'var(--y-brand)' }} />
                      <span><span style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>{r.nombre}</span>
                        {r.descripcion && <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)' }}>{r.descripcion}</span>}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={enviando}>{enviando ? <Loader2 size={14} className="iv-spin" /> : <UserPlus size={14} />} Crear y obtener enlace</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** Fase 15: costo por hora de la persona (para el costo real de los trabajos). Solo lo ve y edita quien gestiona usuarios. */
function CostoHora({ usuarioId }: { usuarioId: string }) {
  const { success, error: toastError } = useToast();
  const [valor, setValor] = useState<number | null>(null);
  const [guardado, setGuardado] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    supabase.from('costos_hora').select('costo_hora').eq('usuario_id', usuarioId).maybeSingle()
      .then(({ data }) => { const v = (data as { costo_hora: number } | null)?.costo_hora ?? null; setValor(v === null ? null : Number(v)); setGuardado(v === null ? null : Number(v)); });
  }, [usuarioId]);
  const guardar = async () => {
    setGuardando(true);
    const { error } = valor
      ? await supabase.from('costos_hora').upsert({ usuario_id: usuarioId, costo_hora: valor, actualizado_at: new Date().toISOString() })
      : await supabase.from('costos_hora').delete().eq('usuario_id', usuarioId);
    setGuardando(false);
    if (error) { toastError(error.message); return; }
    setGuardado(valor); success('Costo por hora guardado');
  };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 220 }}>
        <span className="label-muted">Costo por hora (sueldo + leyes ÷ horas)</span>
        <NumeroInput className="input" prefijo="$" value={valor} onChange={setValor} onVacio={() => setValor(null)} placeholder="El general de los ajustes" />
      </label>
      {valor !== guardado && <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={13} className="iv-spin" /> : null} Guardar costo</button>}
      <span style={{ fontSize: '0.74rem', color: 'var(--muted)', flex: '1 1 200px' }}>Con esto, las horas que registre en los trabajos suman a su costo real. Solo lo ve quien gestiona usuarios o ve costos.</span>
    </div>
  );
}

function FichaUsuario({ u, roles, asignaciones, empresas, esYo, puedeGestionar, onCambio }: {
  u: Usuario; roles: Rol[]; asignaciones: UsuarioRol[]; empresas: EmpresaBreve[]; esYo: boolean; puedeGestionar: boolean; onCambio: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [datos, setDatos] = useState({ nombre: u.nombre || '', cargo: u.cargo || '', telefono: u.telefono || '', empresa_id: u.empresa_id || '' });
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [enlace, setEnlace] = useState<string | null>(null);
  const editable = puedeGestionar || esYo;
  const fase15 = useFase(15);
  const cambiado = datos.nombre !== (u.nombre || '') || datos.cargo !== (u.cargo || '') || datos.telefono !== (u.telefono || '')
    || datos.empresa_id !== (u.empresa_id || '');

  const correr = async (clave: string, fn: () => Promise<void>, ok?: string) => {
    setOcupado(clave);
    try { await fn(); if (ok) success(ok); onCambio(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setOcupado(null); }
  };

  const rolActivo = (rolId: string) => asignaciones.some(a => a.usuario_id === u.id && a.rol_id === rolId && a.activo);
  const visibles = roles.filter(r => r.activo || rolActivo(r.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0.25rem 0 0.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
        {(['nombre', 'cargo', 'telefono'] as const).map(k => (
          <div key={k}>
            <label className="label-muted" style={{ display: 'block', marginBottom: 6 }}>{k === 'nombre' ? 'Nombre' : k === 'cargo' ? 'Cargo' : 'Teléfono'}</label>
            <input className="input" value={datos[k]} disabled={!editable} onChange={e => setDatos(d => ({ ...d, [k]: e.target.value }))}
              placeholder={k === 'cargo' ? 'Técnico eléctrico' : k === 'telefono' ? '+56 9 …' : ''} />
          </div>
        ))}
        <div>
          <label className="label-muted" style={{ display: 'block', marginBottom: 6 }}>Cotiza como (empresa emisora)</label>
          <select className="input" value={datos.empresa_id} disabled={!editable} onChange={e => setDatos(d => ({ ...d, empresa_id: e.target.value }))}>
            <option value="">La primera de la lista</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: -6 }}>
        En el cotizador, «quién cotiza» se toma de esta cuenta: su empresa emisora y su nombre, cargo, teléfono y correo van en el PDF y en el mensaje al cliente.
      </p>
      {puedeGestionar && fase15 && <CostoHora usuarioId={u.id} />}
      {editable && cambiado && (
        <div><button className="btn btn-primary btn-sm" disabled={ocupado === 'datos'}
          onClick={() => correr('datos', () => usuariosService.guardarDatos(u.id, { nombre: datos.nombre.trim() || null, cargo: datos.cargo.trim() || null, telefono: datos.telefono.trim() || null, empresa_id: datos.empresa_id || null }), 'Datos guardados')}>
          {ocupado === 'datos' ? <Loader2 size={13} className="iv-spin" /> : null} Guardar datos</button></div>
      )}

      <div>
        <p className="label-muted" style={{ marginBottom: 8 }}>Roles {puedeGestionar ? '(actívalos o desactívalos)' : ''}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visibles.map(r => {
            const on = rolActivo(r.id);
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid var(--border2)', background: on ? 'var(--y-soft)' : 'var(--bg2)' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>
                    {r.protegido && <ShieldCheck size={14} color="var(--y)" />} {r.nombre}
                    {!r.activo && <span className="badge" style={{ background: 'var(--bg3)', color: 'var(--muted)' }}>Rol desactivado</span>}
                  </span>
                  {r.descripcion && <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)' }}>{r.descripcion}</span>}
                </span>
                {ocupado === r.id ? <Loader2 size={16} className="iv-spin" /> : (
                  <Interruptor activo={on} etiqueta={`Rol ${r.nombre}`} disabled={!puedeGestionar}
                    onChange={() => correr(r.id, () => usuariosService.setRol(u.id, r.id, !on), on ? `Rol «${r.nombre}» desactivado` : `Rol «${r.nombre}» activado`)} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {puedeGestionar && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {enlace && <EnlaceCompartible enlace={enlace} nombre={u.nombre || ''} onCerrar={() => setEnlace(null)} />}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" disabled={ocupado === 'enlace'}
              onClick={() => correr('enlace', async () => { const r = await usuariosService.nuevoEnlace(u.id); if (r.enlace) setEnlace(r.enlace); })}>
              {ocupado === 'enlace' ? <Loader2 size={13} className="iv-spin" /> : <Link2 size={13} />} Nuevo enlace de acceso
            </button>
            {!esYo && (
              <button className={u.activo ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm'} disabled={ocupado === 'activo'}
                onClick={() => {
                  if (u.activo && !confirm(`¿Desactivar a ${u.nombre || u.email}? No podrá entrar al ERP hasta que lo actives de nuevo.`)) return;
                  correr('activo', () => usuariosService.setActivo(u.id, !u.activo), u.activo ? 'Usuario desactivado' : 'Usuario activado');
                }}>
                {u.activo ? <><UserX size={13} /> Desactivar usuario</> : <><UserCheck size={13} /> Activar usuario</>}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function UsuariosPage() {
  const { perfil, puede, recargar: recargarMisPermisos } = usePermisos();
  const { error: toastError } = useToast();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [asignaciones, setAsignaciones] = useState<UsuarioRol[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaBreve[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busca, setBusca] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [invitando, setInvitando] = useState(false);
  const puedeGestionar = puede('usuarios.gestionar');

  const cargar = useCallback(async () => {
    try {
      const r = await usuariosService.listar();
      setUsuarios(r.usuarios); setRoles(r.roles); setAsignaciones(r.asignaciones); setEmpresas(r.empresas);
    } catch (e) {
      toastError('No se pudieron cargar los usuarios: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setCargando(false);
    }
  }, [toastError]);
  useEffect(() => { cargar(); }, [cargar]);

  const alCambiar = useCallback(() => { cargar(); recargarMisPermisos(); }, [cargar, recargarMisPermisos]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = [...usuarios].sort((a, b) => Number(b.activo) - Number(a.activo) || (a.nombre || a.email || '').localeCompare(b.nombre || b.email || ''));
    return q ? lista.filter(u => `${u.nombre || ''} ${u.email || ''} ${u.cargo || ''}`.toLowerCase().includes(q)) : lista;
  }, [usuarios, busca]);

  const rolesDe = (u: Usuario) => roles.filter(r => asignaciones.some(a => a.usuario_id === u.id && a.rol_id === r.id && a.activo) && r.activo);

  return (
    <div className="anim-in">
      {invitando && <InvitarModal roles={roles} onClose={() => setInvitando(false)} onListo={cargar} />}
      <PageHeader eyebrow="Mi empresa" title="Usuarios"
        subtitle="Quién entra al ERP y qué puede hacer. Activa o desactiva los roles de cada persona."
        actions={puedeGestionar ? <button className="btn btn-primary" onClick={() => setInvitando(true)}><UserPlus size={14} /> Invitar usuario</button> : null} />

      <div className="panel-y">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)' }}>
          <div style={{ position: 'relative', maxWidth: 420 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input className="input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nombre, correo o cargo…" style={{ paddingLeft: '2.2rem' }} />
          </div>
        </div>
        {cargando ? (
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 6 }}>{[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 60 }} />)}</div>
        ) : filtrados.length === 0 ? (
          <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>Sin usuarios que coincidan.</p>
        ) : filtrados.map(u => {
          const esYo = u.id === perfil?.id;
          const rs = rolesDe(u);
          const open = abierto === u.id;
          return (
            <div key={u.id} style={{ borderTop: '1px solid var(--border2)' }}>
              <button onClick={() => setAbierto(open ? null : u.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '0.85rem 1rem', background: open ? 'var(--bg3)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', opacity: u.activo ? 1 : 0.6 }}>
                <span style={{ width: 38, height: 38, borderRadius: '50%', background: u.activo ? 'var(--y-brand)' : 'var(--bg3)', color: u.activo ? 'var(--on-accent)' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}>{iniciales(u)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text)' }}>{u.nombre || u.email}</span>
                    {esYo && <span className="badge" style={{ background: 'var(--y-soft)', color: 'var(--y)' }}>Tú</span>}
                    {!u.activo && <span className="badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>Desactivado</span>}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}{u.cargo ? ` · ${u.cargo}` : ''}</span>
                  <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                    {rs.length ? rs.map(r => <span key={r.id} className="badge" style={{ background: 'var(--bg3)', color: 'var(--text)' }}>{r.nombre}</span>)
                      : <span className="badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>Sin rol: no ve nada</span>}
                  </span>
                </span>
                <ChevronDown size={16} style={{ color: 'var(--muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />
              </button>
              {open && (
                <div style={{ padding: '0.25rem 1rem 1rem', background: 'var(--bg3)' }}>
                  <FichaUsuario u={u} roles={roles} asignaciones={asignaciones} empresas={empresas} esYo={esYo} puedeGestionar={puedeGestionar} onCambio={alCambiar} />
                </div>
              )}
            </div>
          );
        })}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border2)', color: 'var(--muted)', fontSize: '0.78rem' }}>
          {usuarios.filter(u => u.activo).length} activos · {usuarios.filter(u => !u.activo).length} desactivados
        </div>
      </div>
    </div>
  );
}
