'use client';

/**
 * Mi cuenta (TecApp): mis datos (nombre, teléfono, cargo), cambiar mi contraseña, avisos en
 * este equipo, mis roles y mis competencias. El correo y los roles los cambia quien administra usuarios.
 */

import { useEffect, useState } from 'react';
import { Award, Eye, EyeOff, KeyRound, Loader2, Save, UserRound } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AvisosCelular from '@/components/AvisosCelular';
import { supabase } from '@/lib/supabase';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { personasService, type Competencia, type UsuarioCompetencia } from '@/services/fase5';
import { formatDate } from '@/utils';

export default function MiCuentaPage() {
  const { perfil, roles, recargar } = usePermisos();
  const { success, error: toastError } = useToast();
  const [datos, setDatos] = useState({ nombre: '', telefono: '', cargo: '' });
  const [guardando, setGuardando] = useState(false);
  const [clave, setClave] = useState({ nueva: '', repetir: '' });
  const [ver, setVer] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [mias, setMias] = useState<(UsuarioCompetencia & { c?: Competencia })[]>([]);

  useEffect(() => {
    if (!perfil) return;
    setDatos({ nombre: perfil.nombre || '', telefono: (perfil as { telefono?: string | null }).telefono || '', cargo: (perfil as { cargo?: string | null }).cargo || '' });
    Promise.all([personasService.competencias(), personasService.deUsuarios()])
      .then(([c, a]) => setMias(a.filter(x => x.usuario_id === perfil.id).map(x => ({ ...x, c: c.find(y => y.id === x.competencia_id) }))))
      .catch(() => {});
  }, [perfil]);

  const guardar = async () => {
    if (!perfil) return;
    setGuardando(true);
    try {
      const { error } = await supabase.from('profiles').update({ nombre: datos.nombre.trim() || null, telefono: datos.telefono.trim() || null, cargo: datos.cargo.trim() || null }).eq('id', perfil.id);
      if (error) throw error;
      success('Tus datos quedaron guardados'); recargar();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  const cambiarClave = async () => {
    if (clave.nueva.length < 8) { toastError('La contraseña necesita al menos 8 caracteres'); return; }
    if (clave.nueva !== clave.repetir) { toastError('Las contraseñas no coinciden'); return; }
    setCambiando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: clave.nueva });
      if (error) throw error;
      setClave({ nueva: '', repetir: '' });
      success('Contraseña cambiada');
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo cambiar'); }
    finally { setCambiando(false); }
  };

  return (
    <div className="anim-in">
      <PageHeader eyebrow="Mi cuenta" title={perfil?.nombre || 'Mi cuenta'} subtitle={(perfil as { email?: string } | null)?.email || ''} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="section-label" style={{ margin: 0 }}><UserRound size={15} /> Mis datos</p>
          <label><span className="label-muted">Nombre</span><input className="input" value={datos.nombre} onChange={e => setDatos({ ...datos, nombre: e.target.value })} /></label>
          <label><span className="label-muted">Teléfono (sale en tus cotizaciones)</span><input className="input" value={datos.telefono} onChange={e => setDatos({ ...datos, telefono: e.target.value })} placeholder="+56 9 …" /></label>
          <label><span className="label-muted">Cargo</span><input className="input" value={datos.cargo} onChange={e => setDatos({ ...datos, cargo: e.target.value })} /></label>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Save size={14} />} Guardar</button>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>Mis roles: {roles.length ? roles.join(', ') : 'ninguno'}. El correo y los roles los cambia quien administra usuarios.</p>
        </div>
        <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="section-label" style={{ margin: 0 }}><KeyRound size={15} /> Cambiar mi contraseña</p>
          <label><span className="label-muted">Nueva contraseña (8 caracteres o más)</span>
            <div style={{ position: 'relative' }}>
              <input className="input" type={ver ? 'text' : 'password'} autoComplete="new-password" value={clave.nueva} onChange={e => setClave({ ...clave, nueva: e.target.value })} style={{ paddingRight: '2.5rem' }} />
              <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar' : 'Mostrar'} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>{ver ? <EyeOff size={15} /> : <Eye size={15} />}</button>
            </div></label>
          <label><span className="label-muted">Repetir</span><input className="input" type={ver ? 'text' : 'password'} autoComplete="new-password" value={clave.repetir} onChange={e => setClave({ ...clave, repetir: e.target.value })} /></label>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={cambiarClave} disabled={cambiando || !clave.nueva}>{cambiando ? <Loader2 size={14} className="iv-spin" /> : <KeyRound size={14} />} Cambiar</button>
        </div>
        <AvisosCelular />
        <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="section-label" style={{ margin: 0 }}><Award size={15} /> Mis competencias</p>
          {mias.length === 0 ? <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>Sin competencias anotadas.</p> : mias.map(m => (
            <div key={m.id} style={{ display: 'flex', gap: 8, fontSize: '0.86rem', color: 'var(--text)' }}>
              <span style={{ flex: 1 }}>{m.c?.nombre}{m.nivel ? ` · ${'★'.repeat(m.nivel)}` : ''}</span>
              {m.vence && <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>vence {formatDate(m.vence)}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
