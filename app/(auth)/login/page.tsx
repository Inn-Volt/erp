'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Zap, Loader2, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/dashboard');
      else setChecking(false);
    });
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Credenciales incorrectas. Verifica tu email y contraseña.'
        : err.message);
      setLoading(false);
    } else {
      router.replace('/dashboard');
    }
  };

  if (checking) {
    return (
      <div style={{ height: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        <Loader2 size={24} color="var(--y)" className="iv-spin" />
      </div>
    );
  }

  return (
    <div style={{
      height: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#000', position: 'relative', overflow: 'hidden',
    }}>
      {/* Background grid */}
      <div className="iv-grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.5 }} />
      <div className="iv-stripe" style={{ left: '30%', opacity: 0.08 }} />
      <div className="iv-stripe" style={{ right: '30%', opacity: 0.08 }} />

      {/* Glow */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,198,0,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div className="anim-in" style={{ width: '100%', maxWidth: 400, padding: '1rem' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
            <div style={{
              width: 40, height: 40, background: 'var(--y)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={20} color="#000" fill="#000" />
            </div>
            <span style={{
              fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.8rem',
              letterSpacing: '0.05em', color: '#fff', textTransform: 'uppercase',
            }}>
              Inn<span style={{ color: 'var(--y)' }}>Volt</span>
            </span>
          </div>
          <p className="label-muted" style={{ letterSpacing: '0.35em' }}>Cotizador</p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border2)',
          borderTop: '2px solid var(--y)', padding: '2rem',
        }}>
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
                background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
                padding: '0.65rem 0.875rem', color: '#f87171', fontSize: '0.82rem',
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
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--muted)', fontSize: '0.78rem' }}>
          InnVolt SpA
        </p>
      </div>
    </div>
  );
}
