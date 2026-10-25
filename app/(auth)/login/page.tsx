'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2, Eye, EyeOff, KeyRound } from 'lucide-react';
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
      if (data.session) router.replace('/inicio');
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
      router.replace('/inicio');
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
      <div className="flex h-dvh items-center justify-center bg-surface-2">
        <Loader2 size={24} className="iv-spin text-accent" />
      </div>
    );
  }

  const errorBox = error && (
    <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-sm font-medium" style={{ color: 'var(--danger)' }}>{error}</p>
  );

  // Como el acceso de TecApp: tarjeta sola al centro, la marca arriba y el tema arriba a la derecha.
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-surface-2 px-6">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <div className="anim-in w-full max-w-sm">
        {/* Marca */}
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoImg height={40} />
          <p className="mt-3 font-display text-xs font-bold uppercase tracking-[0.14em] text-accent">Electricidad y energía · ERP</p>
        </div>

        <div className="panel-y p-8">
          {recuperar ? (
            <form onSubmit={handleRecuperar} className="flex flex-col gap-4">
              <div>
                <h2 className="flex items-center gap-2 font-display text-lg font-bold text-content"><KeyRound size={17} /> Recuperar contraseña</h2>
                <p className="mt-1 text-sm text-content-muted">Te enviamos un enlace para crear una contraseña nueva.</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-content">Correo</label>
                <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.cl" required autoComplete="email" />
              </div>
              {errorBox}
              {aviso && <p className="rounded-lg border border-line px-3.5 py-2.5 text-sm text-content" style={{ background: 'var(--y-soft)' }}>{aviso}</p>}
              <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                {loading && <Loader2 size={15} className="iv-spin" />} Enviarme el enlace
              </button>
              <button type="button" onClick={() => { setRecuperar(false); setError(''); setAviso(''); }}
                className="text-sm text-content-muted transition hover:text-content">Volver a iniciar sesión</button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-content">Correo</label>
                <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="tu@innvolt.cl" required autoComplete="email" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-content">Contraseña</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} className="input" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required autoComplete="current-password" style={{ paddingRight: '2.5rem' }} />
                  <button type="button" onClick={() => setShowPass(p => !p)} aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content">
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              {errorBox}
              <button type="submit" className="btn btn-primary mt-1 w-full" disabled={loading}>
                {loading && <Loader2 size={15} className="iv-spin" />}
                {loading ? 'Ingresando…' : 'Iniciar sesión'}
              </button>
              <button type="button" onClick={() => { setRecuperar(true); setError(''); }}
                className="text-sm text-content-muted transition hover:text-content">Olvidé mi contraseña</button>
            </form>
          )}
        </div>

        <p className="mt-8 text-center text-sm text-content-muted">InnVolt SpA</p>
      </div>
    </main>
  );
}
