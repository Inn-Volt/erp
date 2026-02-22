'use client';

import { 
  Zap, 
  LayoutDashboard, 
  FileText, 
  Package, 
  Users, 
  LogOut, 
  Menu,
  X,
  Wrench,
  ChevronRight,
  BarChart3,
  TrendingUp,
  ShoppingBag
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useState } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [showHeader, setShowHeader] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);

  const handleContentScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollY = e.currentTarget.scrollTop;
    if (currentScrollY > lastScrollY && currentScrollY > 100) {
      setShowHeader(false); 
    } else {
      setShowHeader(true);
    }
    setIsScrolled(currentScrollY > 10);
    setLastScrollY(currentScrollY);
  };

  // --- MENÚ COMPLETO RESTAURADO ---
  const menuItems = [
    { name: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/dashboard' },
    { name: 'Clientes', icon: <Users size={20} />, path: '/clientes' },
    { name: 'Cotizador', icon: <FileText size={20} />, path: '/cotizador' },
    { name: 'Rentabilidad', icon: <TrendingUp size={20} />, path: '/rentabilidad' },
    { name: 'Catalogo', icon: <ShoppingBag size={20} />, path: '/materiales' },
    { name: 'Inventario', icon: <Package size={20} />, path: '/inventario' }, // Restaurado
    { name: 'Reportes', icon: <BarChart3 size={20} />, path: '/reportes' },         // Restaurado
    { name: 'Herramientas', icon: <Wrench size={20} />, path: '/herramientas' },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <div className="h-screen w-full bg-[#f8fafc] flex overflow-hidden font-sans">
      
      {/* SIDEBAR ESCRITORIO */}
      <aside className="hidden lg:flex w-72 bg-[#0f172a] flex-col h-full z-50 shadow-[20px_0_60px_-15px_rgba(0,0,0,0.1)] shrink-0">
        <div className="p-10 flex items-center gap-3 shrink-0 cursor-pointer" onClick={() => router.push('/dashboard')}>
          <Zap className="text-[#ffc600] fill-[#ffc600]" size={28} />
          <h1 className="text-2xl font-black tracking-tighter text-white uppercase italic">
            INN<span className="text-[#ffc600]">VOLT</span>
          </h1>
        </div>

        <nav className="flex-1 px-6 space-y-2 overflow-y-auto pt-4 custom-scrollbar">
          {menuItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => router.push(item.path)}
                className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 group ${
                  isActive 
                  ? 'bg-[#ffc600] text-[#0f172a] shadow-lg shadow-yellow-500/20' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className={isActive ? 'text-[#0f172a]' : 'group-hover:text-[#ffc600] transition-colors'}>
                    {item.icon}
                  </span>
                  {item.name}
                </div>
                {isActive && <ChevronRight size={14} className="opacity-50" />}
              </button>
            );
          })}
        </nav>

        <div className="p-8 border-t border-white/5 shrink-0">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-[11px] font-black text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all uppercase tracking-widest group"
          >
            <div className="p-2 rounded-lg bg-white/5 group-hover:bg-red-500/20 transition-colors">
              <LogOut size={18} />
            </div>
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* ÁREA DE CONTENIDO */}
      <div 
        className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto scroll-smooth"
        onScroll={handleContentScroll}
      >
        
        {/* HEADER INTELIGENTE */}
        <header className={`h-24 shrink-0 flex items-center justify-between px-6 md:px-12 sticky top-0 z-40 transition-all duration-500 transform ${
          showHeader ? 'translate-y-0' : '-translate-y-full'
        } ${
          isScrolled ? 'bg-white/80 backdrop-blur-xl border-b border-slate-100 shadow-sm' : 'bg-transparent'
        }`}>
          
          <button 
            className="lg:hidden p-3 bg-white shadow-md rounded-2xl text-[#0f172a]"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu size={24} />
          </button>

          <div className="hidden lg:block italic font-black text-slate-300 text-[10px] uppercase tracking-[0.3em]">
            ERP
          </div>

          <div className="flex items-center gap-4 group">
            <div className="text-right hidden sm:block">
              <p className="text-[11px] font-black text-slate-900 uppercase tracking-tighter leading-none">Administrador</p>
              <p className="text-[9px] font-bold text-emerald-500 uppercase mt-1 flex items-center justify-end gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Sincronizado
              </p>
            </div>
            <div className="relative">
              <div className="w-11 h-11 bg-[#0f172a] rounded-2xl flex items-center justify-center font-black text-[#ffc600] text-sm shadow-xl border-2 border-white ring-4 ring-slate-50">
                IV
              </div>
            </div>
          </div>
        </header>

        {/* MAIN CONTENIDO */}
        <main className="flex-1 px-6 pb-12 md:px-12 pt-4">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* MENÚ MÓVIL (Con scroll interno) */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-[100] bg-[#0f172a] animate-in fade-in duration-300">
           <div className="p-8 flex flex-col h-full">
              <div className="flex justify-between items-center mb-10">
                 <div className="flex items-center gap-3">
                   <Zap className="text-[#ffc600] fill-[#ffc600]" size={28} />
                   <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter">INNVOLT</h1>
                 </div>
                 <button onClick={() => setIsMobileMenuOpen(false)} className="p-3 bg-white/10 rounded-2xl text-white">
                   <X size={28} />
                 </button>
              </div>
              <nav className="space-y-2 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                 {menuItems.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => { router.push(item.path); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-5 p-5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
                        pathname === item.path ? 'bg-[#ffc600] text-[#0f172a]' : 'text-slate-400 border border-white/5 bg-white/5'
                      }`}
                    >
                      {item.icon} {item.name}
                    </button>
                 ))}
              </nav>
              <button 
                onClick={handleLogout}
                className="mt-6 shrink-0 flex items-center justify-center gap-4 p-5 rounded-2xl text-[10px] font-black text-red-400 bg-red-500/10 uppercase tracking-[0.2em]"
              >
                <LogOut size={20} /> Cerrar Sesión
              </button>
           </div>
        </div>
      )}
    </div>
  );
}