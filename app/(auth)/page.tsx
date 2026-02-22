'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Zap } from 'lucide-react'; // Importamos el rayo

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert("Error: " + error.message);
    } else {
      router.push('/dashboard'); 
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-[#1e293b] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase flex items-center justify-center gap-2">
            <Zap className="text-[#ffc600] fill-[#ffc600]" size={32} />
            INN<span className="text-[#ffc600]">VOLT</span>
          </h1>
          <p className="text-[10px] text-slate-400 font-bold tracking-[0.3em] uppercase mt-2">
            
          </p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-2xl border-t-8 border-[#ffc600]">
          <h2 className="text-xl font-black text-slate-800 mb-6 text-center uppercase">
            Acceso Sistema
          </h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Email</label>
              <input 
                type="email" 
                required
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-[#ffc600] text-sm text-slate-800"
                placeholder="usuario@innvolt.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Contraseña</label>
              <input 
                type="password" 
                required
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-[#ffc600] text-sm text-slate-800"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button 
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-[#1e293b] hover:bg-black text-[#ffc600] rounded-2xl font-black text-xs uppercase tracking-widest transition-all mt-4 flex items-center justify-center gap-2"
            >
              {loading ? 'Validando...' : 'Iniciar Sesión'}
            </button>
          </form>
        </div>
        
        <p className="text-center mt-8 text-[9px] text-slate-500 font-bold uppercase tracking-widest">
          © 2026 INNVOLT ERP
        </p>
      </div>
    </main>
  );
}