'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend, LineChart, Line, Cell, AreaChart, Area 
} from 'recharts';
import { 
  BarChart3, Calendar, Download, Filter, 
  Search, Info, TrendingUp, TrendingDown, 
  DollarSign, Package, Briefcase, ChevronRight, CheckCircle
} from 'lucide-react';

// Formateador de moneda CLP estricto
const fCLP = (v: number) => new Intl.NumberFormat('es-CL', { 
  style: 'currency', 
  currency: 'CLP',
  minimumFractionDigits: 0 
}).format(v || 0);

// --- COMPONENTE TOOLTIP PERSONALIZADO ---
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-5 rounded-2xl shadow-2xl border border-slate-100 animate-in zoom-in duration-200">
        <p className="text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest border-b pb-2">{label}</p>
        <div className="space-y-2">
          <div className="flex justify-between items-center gap-8">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Venta Bruta:</span>
            <span className="text-sm font-black text-slate-900 italic">{fCLP(payload[0].value)}</span>
          </div>
          <div className="flex justify-between items-center gap-8">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Utilidad Neta:</span>
            <span className="text-sm font-black text-[#ffc600] italic">{fCLP(payload[1].value)}</span>
          </div>
        </div>
        <div className="mt-3 pt-2 border-t border-slate-50">
          <p className="text-[9px] font-black text-emerald-500 uppercase">
            Eficiencia: {payload[0].value > 0 ? ((payload[1].value / payload[0].value) * 100).toFixed(1) : 0}%
          </p>
        </div>
      </div>
    );
  }
  return null;
};

export default function ReportesPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'financiero' | 'operativo' | 'inventario'>('financiero');
  const [filterText, setFilterText] = useState('');
  const [data, setData] = useState<any>({
    resumen: { totalVentas: 0, utilidadTotal: 0, margenPromedio: 0, costoTotal: 0 },
    proyectos: [],
    ventasGrafico: [],
    inventarioCritico: []
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [cots, rentas, inv] = await Promise.all([
        supabase.from('cotizaciones').select('*, clientes(nombre_cliente)').order('created_at', { ascending: false }),
        supabase.from('analisis_rentabilidad').select('*'),
        supabase.from('inventario_innvolt').select('*')
      ]);

      if (cots.data && rentas.data) {
        const totalVentas = cots.data.reduce((acc, c) => acc + Number(c.total), 0);
        const utilidadTotal = rentas.data.reduce((acc, r) => acc + Number(r.utilidad_neta), 0);
        const costoTotal = rentas.data.reduce((acc, r) => acc + Number(r.costo_total_real), 0);
        
        const ultimosMeses = cots.data.slice(0, 12).reverse().map(c => ({
          name: new Date(c.created_at).toLocaleDateString('es-CL', { month: 'short' }).toUpperCase(),
          Venta: c.total,
          Utilidad: rentas.data.find(r => r.cotizacion_id === c.id)?.utilidad_neta || 0
        }));

        const proyectosPro = cots.data.map(c => {
          const r = rentas.data.find(rent => rent.cotizacion_id === c.id);
          return {
            ...c,
            utilidad: r?.utilidad_neta || 0,
            margen: r?.margen_real || 0,
            costos: r?.costo_total_real || 0
          };
        });

        setData({
          resumen: {
            totalVentas,
            utilidadTotal,
            margenPromedio: totalVentas > 0 ? (utilidadTotal / (totalVentas / 1.19)) * 100 : 0,
            costoTotal
          },
          proyectos: proyectosPro,
          ventasGrafico: ultimosMeses,
          inventarioCritico: inv.data?.filter(i => i.cantidad_actual <= i.cantidad_minima) || []
        });
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  const proyectosFiltrados = data.proyectos.filter((p: any) => 
    p.clientes?.nombre_cliente?.toLowerCase().includes(filterText.toLowerCase()) ||
    p.folio?.toString().includes(filterText)
  );

  if (loading) return <div className="h-screen flex items-center justify-center font-black italic text-[#ffc600] animate-pulse">CARGANDO REPORTES...</div>;

  return (
    <div className="p-4 md:p-10 space-y-6 md:space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-700 max-w-[1600px] mx-auto">
      
      {/* HEADER TÉCNICO RESPONSIVE */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 border-b border-slate-100 pb-8">
        <div>
          <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">
            Centro de <span className="text-[#ffc600]">Reportes</span>
          </h2>
          <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-[0.4em] mt-3">Análisis detallado de operaciones</p>
        </div>
        
        {/* Tab Selector con Scroll en móviles */}
        <div className="flex w-full lg:w-auto bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner overflow-x-auto no-scrollbar">
          <Tab active={activeTab === 'financiero'} onClick={() => setActiveTab('financiero')} label="Financiero" />
          <Tab active={activeTab === 'operativo'} onClick={() => setActiveTab('operativo')} label="Proyectos" />
          <Tab active={activeTab === 'inventario'} onClick={() => setActiveTab('inventario')} label="Inventario" />
        </div>
      </div>

      {/* KPI GRID: Adaptable 1, 2 o 4 columnas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <ReportCard title="Ingreso Bruto Total" value={fCLP(data.resumen.totalVentas)} icon={<DollarSign/>} trend="+12%" color="blue" />
        <ReportCard title="Utilidad Real" value={fCLP(data.resumen.utilidadTotal)} icon={<TrendingUp/>} trend={`${data.resumen.margenPromedio.toFixed(1)}%`} color="yellow" />
        <ReportCard title="Inversión en Costos" value={fCLP(data.resumen.costoTotal)} icon={<Briefcase/>} trend="Gastos" color="slate" />
        <ReportCard title="Alertas de Stock" value={data.inventarioCritico.length} icon={<Package/>} trend="Crítico" color="red" alert={data.inventarioCritico.length > 0} />
      </div>

      {/* VISTA FINANCIERA */}
      {activeTab === 'financiero' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          <div className="lg:col-span-2 bg-white p-5 md:p-8 rounded-[2rem] md:rounded-[3rem] border border-slate-100 shadow-xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between items-start mb-10 gap-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest italic flex items-center gap-2">
                  <TrendingUp size={18} className="text-[#ffc600]" /> Flujo de Ingresos vs Utilidad
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Historial de rendimiento CLP</p>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#0f172a]" />
                  <span className="text-[9px] font-black uppercase">Ventas</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#ffc600]" />
                  <span className="text-[9px] font-black uppercase">Utilidad</span>
                </div>
              </div>
            </div>

            <div className="h-[300px] md:h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.ventasGrafico} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVenta" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0f172a" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#0f172a" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorUtilidad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ffc600" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ffc600" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#64748b'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#cbd5e1'}} tickFormatter={(v) => `$${v/1000000}M`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="Venta" stroke="#0f172a" strokeWidth={4} fillOpacity={1} fill="url(#colorVenta)" />
                  <Area type="monotone" dataKey="Utilidad" stroke="#ffc600" strokeWidth={4} fillOpacity={1} fill="url(#colorUtilidad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-[#0f172a] p-8 rounded-[2rem] md:rounded-[3rem] shadow-2xl text-white flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#ffc600] mb-8">Resumen de Eficiencia</h3>
              <div className="space-y-6">
                <EfficiencyRow label="Mano de Obra" value="35%" percent={35} color="bg-blue-400" />
                <EfficiencyRow label="Materiales" value="45%" percent={45} color="bg-yellow-400" />
                <EfficiencyRow label="Margen Neto" value={`${data.resumen.margenPromedio.toFixed(1)}%`} percent={data.resumen.margenPromedio} color="bg-emerald-400" />
              </div>
            </div>
            <div className="mt-10 p-6 bg-white/5 rounded-[2rem] border border-white/10">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Nota de auditoría</p>
              <p className="text-xs mt-2 text-slate-200">Los valores presentados consideran IVA (19%) en el monto bruto de venta.</p>
            </div>
          </div>
        </div>
      )}

      {/* VISTA OPERATIVA */}
      {activeTab === 'operativo' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm gap-4">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input 
                type="text" 
                placeholder="Filtrar por cliente o folio..." 
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-[#ffc600]"
                onChange={(e) => setFilterText(e.target.value)}
              />
            </div>
            <button className="w-full sm:w-auto px-6 py-3 bg-[#0f172a] text-[#ffc600] rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
              <Download size={16} /> Exportar Excel
            </button>
          </div>

          {/* TABLA CON SCROLL HORIZONTAL PARA MÓVILES */}
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-left min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Folio</th>
                  <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Cliente</th>
                  <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Monto (CLP)</th>
                  <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Utilidad (CLP)</th>
                  <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Salud Proyecto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {proyectosFiltrados.map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-6 font-black text-slate-900 italic">#{p.folio}</td>
                    <td className="p-6">
                      <p className="text-sm font-black text-slate-800 uppercase leading-none">{p.clientes?.nombre_cliente}</p>
                      <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase">{new Date(p.created_at).toLocaleDateString()}</p>
                    </td>
                    <td className="p-6 text-sm font-black text-slate-900 text-right">{fCLP(p.total)}</td>
                    <td className={`p-6 text-sm font-black text-right ${p.utilidad > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {fCLP(p.utilidad)}
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${p.margen > 25 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(p.margen, 100)}%` }}></div>
                        </div>
                        <span className="text-[10px] font-black">{Number(p.margen || 0).toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VISTA INVENTARIO */}
      {activeTab === 'inventario' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.inventarioCritico.length > 0 ? (
            data.inventarioCritico.map((item: any) => (
              <div key={item.id} className="bg-white p-6 rounded-[2rem] border-2 border-rose-100 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-rose-500 uppercase">Stock Crítico</p>
                  <h4 className="text-sm font-black text-slate-900 uppercase italic mt-1">{item.nombre}</h4>
                  <p className="text-[10px] text-slate-400 font-bold mt-1">Mínimo: {item.cantidad_minima} | Actual: <span className="text-rose-600">{item.cantidad_actual}</span></p>
                </div>
                <div className="bg-rose-50 p-3 rounded-2xl">
                  <Package className="text-rose-500" />
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-1 sm:col-span-2 lg:col-span-3 py-20 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200 flex flex-col items-center">
              <CheckCircle size={40} className="text-emerald-500 mb-4" />
              <p className="text-sm font-black text-slate-500 uppercase tracking-widest italic text-center">Todo el stock está en niveles óptimos</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- SUBCOMPONENTES ---

function ReportCard({ title, value, icon, trend, color, alert }: any) {
  const colors: any = {
    blue: 'bg-blue-500',
    yellow: 'bg-[#ffc600]',
    slate: 'bg-slate-800',
    red: 'bg-rose-500'
  };
  return (
    <div className={`p-6 md:p-8 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm transition-all hover:shadow-xl group`}>
      <div className="flex justify-between items-start mb-6">
        <div className={`p-3 rounded-2xl text-white ${colors[color] || 'bg-slate-100'} shadow-lg shadow-black/5`}>{icon}</div>
        <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${alert ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}`}>{trend}</span>
      </div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{title}</p>
      <h3 className="text-xl md:text-2xl font-black text-slate-900 mt-2 tracking-tighter italic">{value}</h3>
    </div>
  );
}

function EfficiencyRow({ label, value, percent, color }: any) {
  return (
    <div>
      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-2">
        <span>{label}</span>
        <span className="text-[#ffc600]">{value}</span>
      </div>
      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${percent}%` }}></div>
      </div>
    </div>
  );
}

function Tab({ active, onClick, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`px-6 md:px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap ${
        active ? 'bg-[#0f172a] text-[#ffc600] shadow-lg shadow-black/20' : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      {label}
    </button>
  );
}