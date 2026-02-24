'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { 
  FileText, Settings, Users, BarChart3, Plus,
  TrendingUp, Clock, Package, ChevronRight, Activity, Zap,
  ArrowUpRight, AlertCircle, CheckCircle2, DollarSign,
  ArrowDownRight, ShieldCheck, Search
} from 'lucide-react';

// --- UTILIDADES ---
const fCLP = (v: number) => new Intl.NumberFormat('es-CL', { 
  style: 'currency', currency: 'CLP', minimumFractionDigits: 0 
}).format(v || 0);

const getEstadoStyle = (estado: string) => {
  switch (estado) {
    case 'Realizado': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
    case 'Aceptado': return 'bg-blue-50 text-blue-600 border-blue-100';
    case 'Entregado': return 'bg-purple-50 text-purple-600 border-purple-100';
    case 'Pendiente': return 'bg-amber-50 text-amber-600 border-amber-100';
    case 'Rechazado': return 'bg-red-50 text-red-600 border-red-100';
    default: return 'bg-slate-50 text-slate-600 border-slate-100';
  }
};

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    montoTotal: 0,
    margenEmpresa: 0,
    costoTotalOperativo: 0,
    clientesTotales: 0,
    cotizacionesContador: 0,
    stockBajo: 0,
    proyectos: [] as any[]
  });

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) router.push('/login');
    };
    
    checkUser();
    fetchDashboardFullData();
  }, []);

  async function fetchDashboardFullData() {
    setLoading(true);
    try {
      const [cotsRes, clientesRes, stockRes, rentRes] = await Promise.all([
        supabase.from('cotizaciones').select('*').order('created_at', { ascending: false }).limit(50), 
        supabase.from('clientes').select('id, nombre_cliente'),
        supabase.from('inventario_innvolt').select('cantidad_actual, cantidad_minima'),
        supabase.from('analisis_rentabilidad').select('*')
      ]);

      const rawCots = cotsRes.data || [];
      const rawClientes = clientesRes.data || [];
      const rawRentabilidad = rentRes.data || [];
      const rawStock = stockRes.data || [];
      
      let totalVentaAcumulada = 0;
      let totalUtilidadAcumulada = 0;
      let totalCostoAcumulado = 0;

      const proyectosProcesados = rawCots.map(cot => {
        const cliente = rawClientes.find(c => c.id === cot.cliente_id);
        const analisis = rawRentabilidad.find(r => 
          String(r.cotizacion_id) === String(cot.id) || String(r.folio) === String(cot.folio)
        );
        
        const venta = Number(cot.total) || 0;
        const utilidad = analisis ? Number(analisis.utilidad_neta) : 0;
        const costo = analisis ? Number(analisis.costo_total_real) : (venta * 0.70);

        totalVentaAcumulada += venta;
        totalUtilidadAcumulada += utilidad;
        totalCostoAcumulado += costo;

        return {
          ...cot,
          cliente_nombre: cliente?.nombre_cliente || 'Cliente no identificado',
          utilidad_proyecto: utilidad,
          es_real: !!analisis
        };
      });

      setData({
        montoTotal: totalVentaAcumulada,
        margenEmpresa: totalUtilidadAcumulada,
        costoTotalOperativo: totalCostoAcumulado,
        clientesTotales: rawClientes.length,
        cotizacionesContador: rawCots.length,
        stockBajo: rawStock.filter((s: any) => s.cantidad_actual <= s.cantidad_minima).length,
        proyectos: proyectosProcesados.slice(0, 8)
      });

    } catch (e) {
      console.error("Critical Dashboard Error:", e);
    } finally {
      setTimeout(() => setLoading(false), 800);
    }
  }

  async function updateEstado(id: string, nuevoEstado: string) {
    try {
      const { error } = await supabase.from('cotizaciones').update({ estado: nuevoEstado }).eq('id', id);
      if (error) throw error;
      
      setData(prev => ({
        ...prev,
        proyectos: prev.proyectos.map(p => p.id === id ? { ...p, estado: nuevoEstado } : p)
      }));
    } catch (e) {
      console.error(e);
    }
  }

  if (loading) return <LoadingScreen />;

  const porcUtilidad = ((data.margenEmpresa / (data.montoTotal || 1)) * 100);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-10 lg:p-14 max-w-[1750px] mx-auto space-y-10 animate-in fade-in duration-700 overflow-x-hidden">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-[#ffc600] p-2 rounded-xl shadow-lg shadow-[#ffc600]/20">
              <Zap size={18} className="text-[#0f172a] fill-current" />
            </div>
            <div className="h-px w-8 bg-slate-300 hidden sm:block"></div>
            <span className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400">Control de Mando</span>
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black text-slate-900 tracking-tighter uppercase italic leading-[0.85]">
            InnVolt <span className="text-[#ffc600] drop-shadow-sm font-outline-2">OS</span>
          </h1>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <button onClick={() => fetchDashboardFullData()} className="group p-5 bg-white border-2 border-slate-100 rounded-3xl text-slate-400 hover:border-[#ffc600] hover:text-[#ffc600] transition-all active:scale-90 shadow-sm">
            <Clock size={24} className="group-hover:rotate-180 transition-transform duration-700" />
          </button>
          <button onClick={() => router.push('/cotizador')} className="flex-1 md:flex-none bg-[#0f172a] text-[#ffc600] px-10 py-5 rounded-3xl font-black text-[13px] uppercase tracking-[0.15em] hover:bg-black transition-all shadow-2xl hover:-translate-y-1 flex items-center justify-center gap-4 border-b-4 border-[#ffc600]/30 active:translate-y-0">
            <Plus size={20} strokeWidth={3} /> Nueva Operación
          </button>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard title="Revenue Operativo" value={fCLP(data.montoTotal)} icon={<TrendingUp size={20} />} color="blue" trend="Global" desc="Facturación total" />
        <KpiCard title="Margen Real" value={fCLP(data.margenEmpresa)} icon={<DollarSign size={20} />} color={porcUtilidad < 15 ? "red" : "green"} trend={`${porcUtilidad.toFixed(1)}%`} desc="Basado en análisis" />
        <KpiCard title="Base Clientes" value={data.clientesTotales} icon={<Users size={20} />} color="yellow" trend="Registrados" desc="Directorio InnVolt" />
        <KpiCard title="Alertas Stock" value={data.stockBajo} icon={<Package size={20} />} color="red" alert={data.stockBajo > 0} trend="Stock Crítico" desc="Items por reponer" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* PANEL IZQUIERDO */}
        <div className="lg:col-span-8 space-y-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <ActionBtn icon={<FileText size={24} />} label="Cotizador" desc="Ventas" onClick={() => router.push('/cotizador')} />
            <ActionBtn icon={<Settings size={24} />} label="Inventario" desc="Stock" onClick={() => router.push('/inventario')} />
            <ActionBtn icon={<Users size={24} />} label="Clientes" desc="CRM" onClick={() => router.push('/clientes')} />
            <ActionBtn icon={<BarChart3 size={24} />} label="Reportes" desc="Finanzas" onClick={() => router.push('/reportes')} />
          </div>

          <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-6 md:p-10 shadow-xl shadow-slate-200/40 border border-slate-100 group relative overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-12 gap-4">
              <div className="space-y-1">
                <h3 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-3 text-slate-800">
                  <Activity size={24} className="text-[#ffc600] animate-pulse" /> Últimos Movimientos
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sincronizado con base de datos</p>
              </div>
            </div>

            <div className="space-y-3">
              {data.proyectos.length === 0 ? (
                <EmptyState icon={<Search size={48} />} message="Sin registros activos" />
              ) : (
                data.proyectos.map((proy) => (
                  <div key={proy.id} 
                    className="flex flex-col md:flex-row items-start md:items-center justify-between p-6 rounded-3xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100 group/item gap-6"
                  >
                    <div className="flex items-center gap-6 w-full md:w-auto">
                      <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 group-hover/item:bg-[#0f172a] group-hover/item:text-[#ffc600] transition-all">
                        #{proy.folio}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-slate-800 uppercase truncate group-hover/item:text-[#0f172a] transition-colors">{proy.cliente_nombre}</p>
                          {proy.es_real && <ShieldCheck size={14} className="text-blue-500" />}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                           <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${proy.es_real ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                              {proy.es_real ? 'Auditado' : 'Sin Analizar'}
                           </span>
                           <p className="text-[10px] font-bold text-slate-400 uppercase">Margen: <span className={proy.utilidad_proyecto <= 0 ? 'text-red-400' : 'text-emerald-500'}>{fCLP(proy.utilidad_proyecto)}</span></p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto border-t md:border-none pt-4 md:pt-0">
                      <div className="text-left md:text-right">
                        <p className="text-base font-black text-slate-900 leading-none">{fCLP(proy.total)}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Monto Total</p>
                      </div>

                      <select 
                        value={proy.estado || 'Pendiente'}
                        onChange={(e) => updateEstado(proy.id, e.target.value)}
                        className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase border-2 outline-none cursor-pointer transition-all ${getEstadoStyle(proy.estado || 'Pendiente')}`}
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="Aceptado">Aceptado</option>
                        <option value="Realizado">Realizado</option>
                        <option value="Rechazado">Rechazado</option>
                      </select>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* PANEL DERECHO */}
        <div className="lg:col-span-4 space-y-8">
          <div className="bg-[#0f172a] rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden flex flex-col min-h-[450px]">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#ffc600] opacity-[0.03] blur-[100px] -mr-20 -mt-20"></div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-[#ffc600] mb-12">Rendimiento Real</h3>
            <div className="space-y-10 relative z-10 flex-1">
              <AnalyticRow label="Costo Operativo" value={data.costoTotalOperativo} total={data.montoTotal} color="bg-red-500" />
              <AnalyticRow label="Utilidad Neta" value={data.margenEmpresa} total={data.montoTotal} color="bg-[#ffc600]" />
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2 rounded-lg ${porcUtilidad > 20 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {porcUtilidad > 20 ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white">Salud Financiera</p>
                </div>
                <p className="text-xs font-medium text-white/50 leading-relaxed italic">
                  "Tu margen real es de <span className="text-white font-black">{porcUtilidad.toFixed(1)}%</span>. 
                  {porcUtilidad < 15 ? " Es vital revisar los costos de materiales." : " Estás en un rango de operación saludable."}"
                </p>
              </div>
            </div>
          </div>

          <div className="p-8 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] flex items-center justify-center opacity-50 grayscale hover:grayscale-0 transition-all cursor-not-allowed">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic font-bold">Módulo Administrativo</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- COMPONENTES ATÓMICOS ---
function KpiCard({ title, value, icon, color, alert, trend, desc }: any) {
  const themes: any = {
    blue: 'border-blue-600 text-blue-600',
    yellow: 'border-[#ffc600] text-[#ffc600]',
    red: 'border-red-600 text-red-600',
    green: 'border-emerald-600 text-emerald-600'
  };
  return (
    <div className={`bg-white p-8 rounded-[2.5rem] border-t-8 shadow-2xl shadow-slate-200/60 transition-all hover:-translate-y-2 ${themes[color]}`}>
      <div className="flex justify-between items-start mb-8">
        <div className="p-4 bg-slate-50 rounded-2xl text-slate-400">{icon}</div>
        <span className="text-[9px] font-black text-slate-800 uppercase bg-slate-100 px-3 py-1 rounded-full">{trend}</span>
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">{title}</p>
      <h3 className="text-3xl font-black tracking-tighter italic text-slate-900 leading-none">{value}</h3>
      <p className="text-[10px] font-bold text-slate-400 uppercase mt-4 flex items-center gap-2">
        {desc} {alert && <AlertCircle size={12} className="text-red-500 animate-bounce" />}
      </p>
    </div>
  );
}

function AnalyticRow({ label, value, total, color }: any) {
  const percent = Math.min(100, (value / (total || 1)) * 100);
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-end">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</p>
        <p className="text-sm font-black text-white">{fCLP(value)}</p>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-1000`} style={{ width: `${percent}%` }}></div>
      </div>
    </div>
  );
}

function ActionBtn({ icon, label, desc, onClick }: any) {
  return (
    <button onClick={onClick} className="flex flex-col items-start p-8 bg-white border-2 border-slate-50 rounded-[2.5rem] hover:border-[#ffc600] hover:shadow-2xl transition-all group w-full relative overflow-hidden active:scale-95 shadow-sm">
      <div className="mb-6 text-slate-400 group-hover:text-[#ffc600] transition-all p-4 bg-slate-50 rounded-2xl group-hover:bg-[#ffc600]/10">
        {icon}
      </div>
      <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-800">{label}</span>
      <span className="text-[9px] font-bold text-slate-400 uppercase mt-2 opacity-60 group-hover:opacity-100 transition-opacity">{desc}</span>
    </button>
  );
}

function LoadingScreen() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0f172a]">
      <div className="relative">
        <div className="w-24 h-24 border-[3px] border-[#ffc600]/10 rounded-full"></div>
        <div className="w-24 h-24 border-t-[3px] border-[#ffc600] rounded-full animate-spin absolute top-0 left-0"></div>
        <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#ffc600]" size={30} />
      </div>
      <p className="text-[#ffc600] font-black uppercase tracking-[0.6em] text-[10px] mt-8 animate-pulse">Sincronizando InnVolt OS</p>
    </div>
  );
}

function EmptyState({ icon, message }: any) {
  return (
    <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-[3rem] border-4 border-dashed border-slate-100">
      <div className="text-slate-200 mb-6">{icon}</div>
      <p className="text-xs font-black uppercase text-slate-400 tracking-[0.3em]">{message}</p>
    </div>
  );
}