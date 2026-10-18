'use client';

/**
 * Crear o cambiar la contraseña.
 * Aquí llegan el enlace de invitación (usuario nuevo) y el de recuperación. El
 * cliente de Supabase lee la sesión del enlace solo (detectSessionInUrl); con esa
 * sesión la persona elige su contraseña y entra al ERP.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { LogoImg } from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';

export default function RestablecerPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'sin_sesion' | 'hecho'>('cargando');
  const [email, setEmail] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [ver, setVer] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let resuelto = false;
    const marcar = (hayUsuario: boolean, correo?: string | null) => {
      if (resuelto && !hayUsuario) return;
      resuelto = true;
      if (correo) setEmail(correo);
      setEstado(hayUsuario ? 'listo' : 'sin_sesion');
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      if (session?.user) marcar(true, session.user.email);
    });
    // El cliente procesa el enlace al cargar; si no trae sesión, se avisa tras un momento.
    supabase.auth.getSession().then(({ data }) => { if (data.session?.user) marcar(true, data.session.user.email); });
    const t = setTimeout(() => { if (!resuelto) marcar(false); }, 3500);
    // Enlace vencido o ya usado: Supabase lo indica en el fragmento de la URL.
    if (typeof window !== 'undefined' && /error_code=|error=/.test(window.location.hash + window.location.search)) {
      clearTimeout(t); resuelto = true; setEstado('sin_sesion');
    }
    return () => { clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (nueva.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (nueva !== repetir) { setError('Las dos contraseñas no coinciden.'); return; }
    setGuardando(true);
    const { error: err } = await supabase.auth.updateUser({ password: nueva });
    setGuardando(false);
    if (err) {
      setError(/same|different/i.test(err.message) ? 'Usa una contraseña distinta a la anterior.' : err.message);
      return;
    }
    setEstado('hecho');
    setTimeout(() => router.replace('/dashboard'), 1200);
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-surface-2 px-6">
      <div className="absolute right-5 top-5"><ThemeToggle /></div>
      <div className="anim-in w-full max-w-sm">
        <div className="mb-8 flex justify-center"><LogoImg height={72} /></div>
        <div className="rounded-2xl border border-line bg-surface p-8 shadow-sm">
          {estado === 'cargando' && (
            <p style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', justifyContent: 'center' }}><Loader2 size={16} className="iv-spin" /> Verificando el enlace…</p>
          )}
          {estado === 'sin_sesion' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>El enlace venció o ya se usó</p>
              <p style={{ fontSize: '0.88rem', color: 'var(--muted)', marginBottom: 16 }}>Pídele al administrador un enlace nuevo de acceso, o recupera tu contraseña desde el inicio de sesión.</p>
              <Link href="/login" className="btn btn-primary">Ir a iniciar sesión</Link>
            </div>
          )}
          {estado === 'hecho' && (
            <p style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--success)', justifyContent: 'center', fontWeight: 600 }}><CheckCircle2 size={18} /> Contraseña guardada. Entrando…</p>
          )}
          {estado === 'listo' && (
            <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}><KeyRound size={17} /> Crea tu contraseña</p>
                {email && <p style={{ fontSize: '0.84rem', color: 'var(--muted)', marginTop: 4 }}>Para {email}</p>}
              </div>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Contraseña nueva</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" type={ver ? 'text' : 'password'} value={nueva} onChange={e => setNueva(e.target.value)} autoComplete="new-password" required minLength={8} style={{ paddingRight: '2.5rem' }} />
                  <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar' : 'Mostrar'} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                    {ver ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p style={{ fontSize: '0.76rem', color: 'var(--muted)', marginTop: 4 }}>Mínimo 8 caracteres.</p>
              </div>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Repítela</label>
                <input className="input" type={ver ? 'text' : 'password'} value={repetir} onChange={e => setRepetir(e.target.value)} autoComplete="new-password" required />
              </div>
              {error && <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', padding: '0.65rem 0.875rem', color: 'var(--danger)', fontSize: '0.82rem', borderRadius: 8 }}>{error}</div>}
              <button type="submit" className="btn btn-primary" disabled={guardando} style={{ width: '100%', justifyContent: 'center' }}>
                {guardando ? <Loader2 size={15} className="iv-spin" /> : null} Guardar y entrar
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
