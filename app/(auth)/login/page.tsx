'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Zap, Loader2, Eye, EyeOff, KeyRound } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { LogoImg } from '@/components/Logo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const [recuperar, setRecuperar] = useState(false);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let listo = false;
    supabase.auth.getSession().then(({ data }) => {
      listo = true;
      if (data.session) router.replace('/dashboard');
      else setChecking(false);
    }).catch(() => { listo = true; setChecking(false); });
    // Red lenta / sin respuesta (típico en móvil): no dejar el spinner infinito.
    const t = setTimeout(() => { if (!listo) setChecking(false); }, 4000);
    return () => clearTimeout(t);
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Credenciales incorrectas. Verifica tu email y contraseña.'
        : /banned/i.test(err.message)
          ? 'Tu usuario está desactivado. Habla con el administrador.'
          : err.message);
      setLoading(false);
    } else {
      router.replace('/dashboard');
    }
  };

  /** Envía el correo para crear una contraseña nueva (y entrar con ella). */
  const handleRecuperar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setAviso('');
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/restablecer` });
    setLoading(false);
    if (err && !/rate|seconds/i.test(err.message)) { setError(err.message); return; }
    setAviso(err ? 'Ya se envió un enlace hace poco. Espera un momento y revisa tu correo.'
      : 'Si ese correo tiene usuario, te llegará un enlace para crear una contraseña nueva. Si no llega en unos minutos, pídele al administrador un «enlace de acceso» (Mi empresa → Usuarios).');
  };

  if (checking) {
    return (
      <div style={{ height: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <Loader2 size={24} color="var(--y)" className="iv-spin" />
      </div>
    );
  }

  return (
    <div style={{
      height: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', position: 'relative', overflow: 'hidden',
    }}>
      {/* Background grid */}
      {/* Capas decorativas: nunca deben capturar clics ni tapar el formulario. */}
      <div className="iv-grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none' }} />
      <div className="iv-stripe" style={{ left: '30%', opacity: 0.08, pointerEvents: 'none' }} />
      <div className="iv-stripe" style={{ right: '30%', opacity: 0.08, pointerEvents: 'none' }} />

      {/* Glow */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, var(--y-soft) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Selector de tema */}
      <div style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', zIndex: 10 }}>
        <ThemeToggle />
      </div>

      <div className="anim-in" style={{ width: '100%', maxWidth: 400, padding: '1rem' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
            <LogoImg height={104} />
          </div>
          <p className="label-muted" style={{ letterSpacing: '0.35em' }}>Cotizador</p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border2)',
          borderTop: '2px solid var(--y-brand)', padding: '2rem',
        }}>
          {recuperar ? (
            <form onSubmit={handleRecuperar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><KeyRound size={16} /> Recuperar contraseña</p>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Correo electrónico</label>
                <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.cl" required autoComplete="email" />
              </div>
              {error && <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', padding: '0.65rem 0.875rem', color: 'var(--danger)', fontSize: '0.82rem' }}>{error}</div>}
              {aviso && <div style={{ background: 'var(--y-soft)', border: '1px solid var(--border2)', padding: '0.65rem 0.875rem', color: 'var(--text)', fontSize: '0.82rem', borderRadius: 8 }}>{aviso}</div>}
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? <Loader2 size={15} className="iv-spin" /> : null} Enviarme el enlace
              </button>
              <button type="button" onClick={() => { setRecuperar(false); setError(''); setAviso(''); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.84rem', cursor: 'pointer' }}>Volver a ingresar</button>
            </form>
          ) : (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>
                Correo electrónico
              </label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@innvolt.cl"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>
                Contraseña
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  className="input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  style={{
                    position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
                  }}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)',
                padding: '0.65rem 0.875rem', color: 'var(--danger)', fontSize: '0.82rem',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
            >
              {loading ? <Loader2 size={15} className="iv-spin" /> : <Zap size={15} />}
              {loading ? 'Ingresando...' : 'Ingresar al sistema'}
            </button>
            <button type="button" onClick={() => { setRecuperar(true); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.84rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              ¿Olvidaste tu contraseña?
            </button>
          </form>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--muted)', fontSize: '0.78rem' }}>
          InnVolt SpA
        </p>
      </div>
    </div>
  );
}
