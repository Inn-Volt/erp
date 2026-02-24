'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { 
  FileText, Settings, Users, BarChart3, Plus,
  TrendingUp, Clock, Package, ChevronRight, Activity, Zap,
  ArrowUpRight, AlertCircle, Calendar, CheckCircle2, DollarSign,
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
    fetchDashboardFullData();
  }, []);

  async function fetchDashboardFullData() {
    setLoading(true);
    try {
      const [cotsRes, clientesRes, stockRes, rentRes] = await Promise.all([
        supabase.from('cotizaciones').select('*').order('created_at', { ascending: false }),
        supabase.from('clientes').select('id, nombre_cliente'),
        supabase.from('inventario_innvolt').select('*'),
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
        
        // Lógica Híbrida: Si hay análisis usa real, si no usa estimado del 30%
        const venta = Number(cot.total) || 0;
        const utilidad = analisis ? Number(analisis.utilidad_neta) : (venta * 0.30);
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
      alert("Error al sincronizar estado");
    }
  }

  if (loading) return <LoadingScreen />;

  const porcUtilidad = ((data.margenEmpresa / (data.montoTotal || 1)) * 100);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-10 lg:p-14 max-w-[1750px] mx-auto space-y-10 animate-in fade-in duration-700">
      
      {/* HEADER PRO */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-[#ffc600] p-2 rounded-xl shadow-lg shadow-[#ffc600]/20">
              <Zap size={18} className="text-[#0f172a] fill-current" />
            </div>
            <div className="h-px w-8 bg-slate-300"></div>
            <span className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400">Control de Mando</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tighter uppercase italic leading-[0.85]">
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

      {/* KPI GRID DINÁMICO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard 
          title="Revenue Operativo" 
          value={fCLP(data.montoTotal)} 
          icon={<TrendingUp size={20} />} 
          color="blue" 
          trend="+12.5%" 
          desc="Volumen de Venta Total" 
        />
        <KpiCard 
          title="Margen Neto" 
          value={fCLP(data.margenEmpresa)} 
          icon={<DollarSign size={20} />} 
          color={porcUtilidad < 20 ? "red" : "green"} 
          trend={`${porcUtilidad.toFixed(1)}%`}
          desc="Utilidad Acumulada" 
        />
        <KpiCard 
          title="Base Clientes" 
          value={data.clientesTotales} 
          icon={<Users size={20} />} 
          color="yellow" 
          trend="Activos" 
          desc="Crecimiento Mensual" 
        />
        <KpiCard 
          title="Alertas Stock" 
          value={data.stockBajo} 
          icon={<Package size={20} />} 
          color="red" 
          alert={data.stockBajo > 0} 
          trend="Crítico" 
          desc="Items bajo el mínimo" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* PANEL IZQUIERDO */}
        <div className="lg:col-span-8 space-y-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <ActionBtn icon={<FileText size={24} />} label="Cotizador" desc="Generar PDF" onClick={() => router.push('/cotizador')} />
            <ActionBtn icon={<Settings size={24} />} label="Stock" desc="Logística" onClick={() => router.push('/inventario')} />
            <ActionBtn icon={<Users size={24} />} label="CRM" desc="Directorio" onClick={() => router.push('/clientes')} />
            <ActionBtn icon={<BarChart3 size={24} />} label="Finanzas" desc="Métricas" onClick={() => router.push('/reportes')} />
          </div>

          <div className="bg-white rounded-[3rem] p-10 shadow-xl shadow-slate-200/40 border border-slate-100 group relative overflow-hidden">
            <div className="flex justify-between items-end mb-12">
              <div className="space-y-1">
                <h3 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-3 text-slate-800">
                  <Activity size={24} className="text-[#ffc600] animate-pulse" /> Movimientos Recientes
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Últimas 8 operaciones sincronizadas</p>
              </div>
              <button className="text-[10px] font-black uppercase text-[#ffc600] border-b-2 border-[#ffc600] pb-1 hover:text-black hover:border-black transition-colors">Ver Historial Completo</button>
            </div>

            <div className="space-y-3">
              {data.proyectos.length === 0 ? (
                <EmptyState icon={<Search size={48} />} message="No se encontraron registros activos" />
              ) : (
                data.proyectos.map((proy, idx) => (
                  <div key={proy.id} 
                    className="flex flex-wrap md:flex-nowrap items-center justify-between p-6 rounded-3xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100 group/item animate-in fade-in slide-in-from-left-4 duration-500"
                    style={{ animationDelay: `${idx * 80}ms`, animationFillMode: 'both' }}
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-xs font-black text-slate-500 group-hover/item:bg-[#0f172a] group-hover/item:text-[#ffc600] transition-all duration-300">
                        #{proy.folio}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-base font-black text-slate-800 uppercase leading-none tracking-tight">{proy.cliente_nombre}</p>
                          {proy.es_real && <ShieldCheck size={14} className="text-blue-500" title="Auditado" />}
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          <p className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase ${proy.es_real ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400 italic'}`}>
                            {proy.es_real ? 'Auditado' : 'Proyectado'}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Utilidad: <span className={proy.utilidad_proyecto < 0 ? 'text-red-500' : 'text-emerald-600'}>{fCLP(proy.utilidad_proyecto)}</span></p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 mt-4 md:mt-0">
                      <div className="text-right">
                        <p className="text-lg font-black text-slate-900 leading-none">{fCLP(proy.total)}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">Monto Final</p>
                      </div>

                      <select 
                        value={proy.estado || 'Pendiente'}
                        onChange={(e) => updateEstado(proy.id, e.target.value)}
                        className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.1em] border-2 outline-none cursor-pointer transition-all shadow-sm ${getEstadoStyle(proy.estado || 'Pendiente')}`}
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="Aceptado">Aceptado</option>
                        <option value="Realizado">Realizado</option>
                        <option value="Rechazado">Rechazado</option>
                      </select>

                      <button onClick={() => router.push(`/cotizador?folio=${proy.folio}`)} className="p-3 bg-slate-50 text-slate-300 rounded-xl hover:bg-[#ffc600] hover:text-[#0f172a] transition-all group-hover/item:shadow-lg">
                        <ChevronRight size={20} strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* PANEL DERECHO: ANALÍTICA AVANZADA */}
        <div className="lg:col-span-4 space-y-8">
          <div className="bg-[#0f172a] rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden flex flex-col min-h-[500px] animate-in slide-in-from-right-8 duration-1000">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#ffc600] opacity-[0.03] blur-[100px] -mr-20 -mt-20"></div>
            
            <h3 className="text-[11px] font-black uppercase tracking-[0.5em] text-[#ffc600] mb-12">Performance Tracker</h3>
            
            <div className="space-y-12 relative z-10 flex-1">
              <div className="space-y-6">
                <AnalyticRow label="Costos Operativos" value={data.costoTotalOperativo} total={data.montoTotal} color="bg-red-500" />
                <AnalyticRow label="Margen Bruto Real" value={data.margenEmpresa} total={data.montoTotal} color="bg-[#ffc600]" />
              </div>

              <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${porcUtilidad > 25 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {porcUtilidad > 25 ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                  </div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-white/90">Estatus del Margen</p>
                </div>
                <p className="text-sm font-medium text-white/60 leading-relaxed italic">
                  "El margen neto es del <span className="text-white font-black underline decoration-[#ffc600]">{porcUtilidad.toFixed(1)}%</span>. 
                  {porcUtilidad > 25 ? " Estás operando en zona de alta eficiencia financiera." : " Se recomienda optimizar costos de proveedores."}"
                </p>
              </div>
            </div>

            <div className="mt-auto pt-10 border-t border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-white/30 tracking-widest">InnVolt OS Core v2.0.4</span>
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50"></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-emerald-600 rounded-[2.5rem] p-8 text-white flex items-center justify-between group hover:bg-emerald-700 transition-colors cursor-pointer" onClick={() => router.push('/reportes')}>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Exportar Balance</p>
              <h4 className="text-xl font-black italic tracking-tighter">Cierre de Mes</h4>
            </div>
            <div className="bg-white/20 p-4 rounded-2xl group-hover:scale-110 transition-transform">
              <CheckCircle2 size={24} />
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
    blue: 'border-blue-600 shadow-blue-200/20 text-blue-600',
    yellow: 'border-[#ffc600] shadow-[#ffc600]/10 text-[#ffc600]',
    red: 'border-red-600 shadow-red-200/20 text-red-600',
    green: 'border-emerald-600 shadow-emerald-200/20 text-emerald-600'
  };
  
  return (
    <div className={`bg-white p-8 rounded-[2.5rem] border-t-8 shadow-2xl shadow-slate-200/60 transition-all hover:-translate-y-2 hover:shadow-slate-300/60 ${themes[color]}`}>
      <div className="flex justify-between items-start mb-8">
        <div className="p-4 bg-slate-50 rounded-2xl text-slate-400 group-hover:text-inherit transition-colors">{icon}</div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-black text-slate-800 uppercase bg-slate-100 px-3 py-1 rounded-full">{trend}</span>
        </div>
      </div>
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">{title}</p>
      <h3 className={`text-4xl font-black tracking-tighter italic leading-none text-slate-900`}>{value}</h3>
      <div className="h-1 w-12 bg-slate-100 my-4 rounded-full overflow-hidden">
        <div className={`h-full w-1/2 ${color === 'red' ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
      </div>
      <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2">
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
      <div className="h-3 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
        <div 
          className={`h-full ${color} rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(255,198,0,0.3)]`} 
          style={{ width: `${percent}%` }}
        ></div>
      </div>
    </div>
  );
}

function ActionBtn({ icon, label, desc, onClick }: any) {
  return (
    <button onClick={onClick} className="flex flex-col items-start p-8 bg-white border-2 border-slate-50 rounded-[2.5rem] hover:border-[#ffc600] hover:shadow-2xl transition-all group w-full relative overflow-hidden active:scale-95 shadow-sm">
      <div className="mb-6 text-slate-400 group-hover:text-[#ffc600] transition-all p-4 bg-slate-50 rounded-2xl group-hover:bg-[#ffc600]/10 group-hover:rotate-12">
        {icon}
      </div>
      <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-800">{label}</span>
      <span className="text-[9px] font-bold text-slate-400 uppercase mt-2 opacity-60 group-hover:opacity-100 transition-opacity">{desc}</span>
    </button>
  );
}

function LoadingScreen() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0f172a] overflow-hidden">
      <div className="relative">
        <div className="w-32 h-32 border-[3px] border-[#ffc600]/10 rounded-full"></div>
        <div className="w-32 h-32 border-t-[3px] border-[#ffc600] rounded-full animate-spin absolute top-0 left-0 shadow-[0_0_20px_rgba(255,198,0,0.2)]"></div>
        <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#ffc600] animate-pulse" size={40} />
      </div>
      <div className="mt-12 text-center space-y-2">
        <p className="text-[#ffc600] font-black uppercase tracking-[0.6em] text-xs animate-pulse">InnVolt Intelligence</p>
        <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Sincronizando flujos financieros...</p>
      </div>
    </div>
  );
}

function EmptyState({ icon, message }: any) {
  return (
    <div className="flex flex-col items-center justify-center py-24 bg-slate-50/50 rounded-[3rem] border-4 border-dashed border-slate-100">
      <div className="text-slate-200 mb-6 scale-125">{icon}</div>
      <p className="text-xs font-black uppercase text-slate-400 tracking-[0.3em] italic">{message}</p>
    </div>
  );
}