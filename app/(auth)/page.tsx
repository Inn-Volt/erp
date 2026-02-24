'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Zap, Mail, Lock, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  // MEJORA: Si ya está logueado, redirigir al dashboard automáticamente
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.push('/dashboard');
    };
    checkUser();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message === 'Invalid login credentials' 
          ? 'Credenciales inválidas. Revisa tu correo y contraseña.' 
          : error.message);
      } else {
        router.push('/dashboard'); 
      }
    } catch (err) {
      setErrorMsg('Ocurrió un error inesperado de conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Fondo decorativo sutil */}
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-[#ffc600] opacity-[0.03] blur-[100px] rounded-full"></div>
      
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-4 bg-white/5 rounded-3xl mb-4 border border-white/10">
            <Zap className={`text-[#ffc600] ${loading ? 'animate-pulse' : ''}`} size={40} fill="#ffc600" />
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">
            INN<span className="text-[#ffc600] font-outline-2">VOLT</span>
          </h1>
          <p className="text-[10px] text-slate-500 font-bold tracking-[0.4em] uppercase mt-3">
            Sistemas de Gestión de Energía
          </p>
        </div>

        <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl border-t-[10px] border-[#ffc600] relative">
          <h2 className="text-2xl font-black text-slate-900 mb-8 text-center uppercase italic tracking-tight">
            Acceso <span className="text-[#ffc600]">Terminal</span>
          </h2>

          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="text-red-500 shrink-0" size={18} />
              <p className="text-[11px] font-bold text-red-600 uppercase leading-tight">{errorMsg}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Email Corporativo</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#ffc600] transition-colors" size={18} />
                <input 
                  type="email" 
                  required
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-[#ffc600] focus:bg-white transition-all text-sm font-bold text-slate-800"
                  placeholder="usuario@innvolt.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Llave de Acceso</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#ffc600] transition-colors" size={18} />
                <input 
                  type="password" 
                  required
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-[#ffc600] focus:bg-white transition-all text-sm font-bold text-slate-800"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-[#0f172a] hover:bg-black text-[#ffc600] rounded-2xl font-black text-[13px] uppercase tracking-[0.2em] transition-all mt-6 flex items-center justify-center gap-3 shadow-xl active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#ffc600] border-t-transparent rounded-full animate-spin"></div>
                  Validando...
                </>
              ) : (
                'Entrar al Sistema'
              )}
            </button>
          </form>
        </div>
        
        <div className="flex justify-between px-4 mt-8">
            <p className="text-[9px] text-slate-600 font-bold uppercase tracking-[0.2em]">InnVolt OS v2.0</p>
            <p className="text-[9px] text-slate-600 font-bold uppercase tracking-[0.2em]">© 2026</p>
        </div>
      </div>
    </main>
  );
}