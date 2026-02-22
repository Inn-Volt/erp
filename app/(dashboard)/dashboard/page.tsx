'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { 
  FileText, Settings, Users, BarChart3, Plus,
  TrendingUp, Clock, Package, ChevronRight, Activity, Zap,
  ArrowUpRight, AlertCircle, Calendar
} from 'lucide-react';

const fCLP = (v: number) => new Intl.NumberFormat('es-CL', { 
  style: 'currency', currency: 'CLP', minimumFractionDigits: 0 
}).format(v || 0);

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    montoTotal: 0,
    clientesTotales: 0,
    cotizacionesContador: 0,
    stockBajo: 0,
    proyectos: [] as any[]
  });

  useEffect(() => {
    fetchDashboardFullData();
  }, []);

  async function fetchDashboardFullData() {
    setLoading(true);
    try {
      const [cotsRes, clientesRes, stockRes] = await Promise.all([
        supabase.from('cotizaciones').select('*').order('created_at', { ascending: false }),
        supabase.from('clientes').select('id, nombre_cliente'),
        supabase.from('inventario_innvolt').select('*').filter('cantidad_actual', 'lte', 'cantidad_minima')
      ]);

      if (cotsRes.error) throw cotsRes.error;

      const rawCots = cotsRes.data || [];
      const rawClientes = clientesRes.data || [];
      
      const proyectosProcesados = rawCots.map(cot => ({
        ...cot,
        cliente_nombre: rawClientes.find(c => c.id === cot.cliente_id)?.nombre_cliente || 'Cliente no identificado'
      }));

      const totalMonto = rawCots.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);

      setData({
        montoTotal: totalMonto,
        clientesTotales: rawClientes.length,
        cotizacionesContador: rawCots.length,
        stockBajo: stockRes.data?.length || 0,
        proyectos: proyectosProcesados.slice(0, 8) // Aumentamos a 8 para mejor visualización
      });

    } catch (e) {
      console.error("Error cargando Dashboard InnVolt:", e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0f172a]">
      <div className="relative">
        <div className="w-20 h-20 border-2 border-[#ffc600]/20 rounded-full"></div>
        <div className="w-20 h-20 border-t-2 border-[#ffc600] rounded-full animate-spin absolute top-0 left-0"></div>
        <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#ffc600] animate-pulse" size={24} />
      </div>
      <p className="text-[#ffc600] font-black uppercase tracking-[0.4em] text-[10px] mt-6 animate-pulse">Sincronizando InnVolt OS</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-10 lg:p-14 max-w-[1700px] mx-auto space-y-10 animate-in fade-in zoom-in-95 duration-1000">
      
      {/* HEADER DINÁMICO */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="bg-[#ffc600] p-1.5 rounded-lg">
              <Zap size={16} className="text-[#0f172a] fill-current" />
            </div>
            <span className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Panel de Control General</span>
          </div>
          <h1 className="text-6xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">
            Status <span className="text-[#ffc600] drop-shadow-sm">Global</span>
          </h1>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <button 
            onClick={() => fetchDashboardFullData()}
            className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-900 hover:border-slate-400 transition-all shadow-sm"
          >
            <Clock size={20} />
          </button>
          <button 
            onClick={() => router.push('/cotizador')}
            className="flex-1 md:flex-none bg-[#0f172a] text-[#ffc600] px-8 py-4 rounded-2xl font-black text-[12px] uppercase tracking-widest hover:bg-black transition-all shadow-xl hover:-translate-y-1 flex items-center justify-center gap-3 border-b-4 border-[#ffc600]/20"
          >
            <Plus size={18} strokeWidth={3} /> Nueva Cotización
          </button>
        </div>
      </div>

      {/* KPI GRID CON GRADIENTES SUTILES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard 
          title="Revenue Total" 
          value={fCLP(data.montoTotal)} 
          icon={<TrendingUp />} 
          color="blue" 
          trend="+12.5%"
          desc="Volumen acumulado"
        />
        <KpiCard 
          title="Cartera Clientes" 
          value={data.clientesTotales} 
          icon={<Users />} 
          color="yellow" 
          trend="Activos"
          desc="Empresas registradas"
        />
        <KpiCard 
          title="Stock Crítico" 
          value={data.stockBajo} 
          icon={<Package />} 
          color="red" 
          alert={data.stockBajo > 0}
          trend="Alerta"
          desc="Materiales bajo mínimo"
        />
        <KpiCard 
          title="Presupuestos" 
          value={data.cotizacionesContador} 
          icon={<FileText />} 
          color="green" 
          trend="Total"
          desc="Emitidos este año"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* SECCIÓN PRINCIPAL IZQUIERDA */}
        <div className="lg:col-span-8 space-y-10">
          
          {/* ACCESOS RÁPIDOS MODERNOS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ActionBtn icon={<FileText size={22} />} label="Cotizador" desc="Crear oferta" onClick={() => router.push('/cotizador')} />
            <ActionBtn icon={<Settings size={22} />} label="Inventario" desc="Control stock" onClick={() => router.push('/inventario')} />
            <ActionBtn icon={<Users size={22} />} label="Clientes" desc="Gestión CRM" onClick={() => router.push('/clientes')} />
            <ActionBtn icon={<BarChart3 size={22} />} label="Reportes" desc="Analítica" onClick={() => router.push('/reportes')} />
          </div>

          {/* TABLA DE OPERACIONES MEJORADA */}
          <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100 relative overflow-hidden group">
            <div className="flex justify-between items-center mb-10">
              <div>
                <h3 className="text-xl font-black uppercase italic tracking-tighter flex items-center gap-3 text-slate-800">
                  <Activity size={22} className="text-[#ffc600]" /> Últimos Movimientos
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Sincronizado con Supabase Realtime</p>
              </div>
              <button className="text-[10px] font-black uppercase text-blue-600 hover:underline">Ver todo</button>
            </div>

            <div className="space-y-2">
              {data.proyectos.length > 0 ? (
                data.proyectos.map((proy, idx) => (
                  <div key={proy.id} 
                    className="flex items-center justify-between p-5 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100 group/item"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400 group-hover/item:bg-[#ffc600] group-hover/item:text-[#0f172a] transition-colors">
                        #{proy.folio}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800 uppercase leading-none">{proy.cliente_nombre}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Calendar size={10} className="text-slate-300" />
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                            {new Date(proy.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <p className="text-sm font-black text-slate-900 leading-none">{fCLP(proy.total)}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Monto Neto</p>
                      </div>
                      <div className={`hidden md:block px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                        proy.estado === 'Finalizado' 
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                        : 'bg-blue-50 text-blue-600 border-blue-100'
                      }`}>
                        {proy.estado || 'Procesando'}
                      </div>
                      <ChevronRight size={18} className="text-slate-200 group-hover/item:text-[#ffc600] group-hover/item:translate-x-1 transition-all" />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState icon={<FileText size={40} />} message="No hay registros disponibles" />
              )}
            </div>
          </div>
        </div>

        {/* SIDEBAR DERECHO: SYSTEM LOG */}
        <div className="lg:col-span-4 h-full">
          <div className="bg-[#0f172a] rounded-[2.5rem] p-10 text-white h-full shadow-2xl border border-white/5 relative overflow-hidden flex flex-col">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-[#ffc600] opacity-5 blur-[80px]"></div>
            
            <div className="flex items-center justify-between mb-12 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[#ffc600] animate-pulse"></div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-white/80">Bitácora</h3>
              </div>
              <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Live Log</span>
            </div>
            
            <div className="space-y-10 relative z-10 flex-1">
              <div className="absolute left-[9px] top-2 bottom-2 w-[1px] bg-gradient-to-b from-[#ffc600]/50 via-white/10 to-transparent"></div>
              
              {data.proyectos.slice(0, 6).map((proy, idx) => (
                <div key={`log-${proy.id}`} className="flex gap-6 group/log cursor-default">
                  <div className="relative mt-1">
                    <div className="w-[20px] h-[20px] rounded-full bg-[#0f172a] border-2 border-[#ffc600] flex items-center justify-center group-hover/log:scale-125 transition-transform">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#ffc600]"></div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-black uppercase tracking-tight text-white group-hover/log:text-[#ffc600] transition-colors">
                      Registro de Folio #{proy.folio}
                    </p>
                    <p className="text-[10px] text-white/40 italic font-medium">
                      Vinculado a <span className="text-white/70">{proy.cliente_nombre}</span>
                    </p>
                    <p className="text-[8px] font-black text-[#ffc600]/60 uppercase tracking-widest flex items-center gap-2">
                      <Clock size={8} /> {new Date(proy.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 p-6 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-2">
                <AlertCircle size={14} className="text-[#ffc600]" />
                <p className="text-[10px] font-black text-white uppercase tracking-widest">Resumen IA</p>
              </div>
              <p className="text-[10px] text-white/50 leading-relaxed italic">
                El sistema detecta un flujo estable. {data.stockBajo > 0 ? `Hay ${data.stockBajo} ítems que requieren reposición inmediata.` : 'Los niveles de inventario son óptimos.'}
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// --- COMPONENTES ATÓMICOS ---

function KpiCard({ title, value, icon, color, alert, trend, desc }: any) {
  const themes: any = {
    blue: 'border-blue-500 shadow-blue-100',
    yellow: 'border-[#ffc600] shadow-yellow-100',
    red: 'border-red-500 shadow-red-100',
    green: 'border-emerald-500 shadow-emerald-100'
  };
  
  return (
    <div className={`bg-white p-8 rounded-[2rem] border-t-4 shadow-xl shadow-slate-200/50 transition-all hover:-translate-y-1 ${themes[color]}`}>
      <div className="flex justify-between items-start mb-6">
        <div className="p-3 bg-slate-50 rounded-2xl text-slate-400">{icon}</div>
        <div className="text-right">
           <span className="text-[10px] font-black text-slate-800 uppercase bg-slate-100 px-2 py-1 rounded-lg">{trend}</span>
        </div>
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">{title}</p>
      <h3 className="text-3xl font-black text-slate-900 tracking-tighter italic leading-none">{value}</h3>
      <p className="text-[9px] font-bold text-slate-400 uppercase mt-3 flex items-center gap-1">
        {desc} {alert && <ArrowUpRight size={10} className="text-red-500" />}
      </p>
    </div>
  );
}

function ActionBtn({ icon, label, desc, onClick }: any) {
  return (
    <button onClick={onClick} className="flex flex-col items-start p-6 bg-white border border-slate-100 rounded-[2rem] hover:border-[#ffc600] hover:shadow-2xl hover:shadow-[#ffc600]/10 transition-all group w-full relative overflow-hidden text-left">
      <div className="absolute top-0 right-0 p-4 text-slate-50 group-hover:text-[#ffc600]/10 transition-colors">
        {icon}
      </div>
      <div className="mb-4 text-slate-400 group-hover:text-[#ffc600] transition-colors p-3 bg-slate-50 rounded-2xl group-hover:bg-[#ffc600]/10">
        {icon}
      </div>
      <span className="text-[11px] font-black uppercase tracking-widest text-slate-800">{label}</span>
      <span className="text-[9px] font-bold text-slate-400 uppercase mt-1 opacity-0 group-hover:opacity-100 transition-opacity tracking-tighter">{desc}</span>
    </button>
  );
}

function EmptyState({ icon, message }: any) {
  return (
    <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-[2rem] border-2 border-dashed border-slate-100">
      <div className="text-slate-200 mb-4">{icon}</div>
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">{message}</p>
    </div>
  );
}