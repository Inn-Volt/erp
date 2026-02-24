/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend, LineChart, Line, Cell, AreaChart, Area, PieChart, Pie 
} from 'recharts';
import { 
  BarChart3, Calendar, Download, Filter, 
  Search, Info, TrendingUp, TrendingDown, 
  DollarSign, Package, Briefcase, ChevronRight, CheckCircle,
  Target, AlertTriangle, Users, Wallet, Settings, Edit3, FileText
} from 'lucide-react';

// Formateador de moneda CLP
const fCLP = (v?: number) => new Intl.NumberFormat('es-CL', { 
  style: 'currency', 
  currency: 'CLP',
  minimumFractionDigits: 0 
}).format(v || 0);

const COLORS = ['#ffc600', '#0f172a', '#3b82f6', '#10b981', '#f43f5e'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-5 rounded-2xl shadow-2xl border border-slate-100 animate-in zoom-in duration-200">
        <p className="text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest border-b pb-2">{label}</p>
        <div className="space-y-2">
          {payload.map((p: any, i: number) => (
            <div key={i} className="flex justify-between items-center gap-8">
              <span className="text-[10px] font-bold text-slate-500 uppercase">{p.name}:</span>
              <span className="text-sm font-black italic" style={{ color: p.color }}>{fCLP(p.value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export default function ReportesPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'financiero' | 'operativo' | 'clientes' | 'inventario'>('financiero');
  const [filterText, setFilterText] = useState('');
  
  const [dateRange, setDateRange] = useState({
    inicio: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    fin: new Date().toISOString().split('T')[0]
  });

  const [gastosFijos, setGastosFijos] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('innvolt_gastos_fijos');
      return saved ? Number(saved) : 5000000;
    }
    return 5000000;
  });
  const [isEditingPE, setIsEditingPE] = useState(false);

  const [data, setData] = useState<any>({
    resumen: { 
      totalVentas: 0, 
      utilidadTotal: 0, 
      margenPromedio: 0, 
      costoTotal: 0, 
      faltaParaMeta: 0,
      porcentajeCobertura: 0
    },
    proyectos: [],
    ventasGrafico: [],
    inventarioCritico: [],
    analisisClientes: []
  });

  useEffect(() => {
    localStorage.setItem('innvolt_gastos_fijos', gastosFijos.toString());
    fetchData();
  }, [gastosFijos, dateRange]);

  async function fetchData() {
    setLoading(true);
    try {
      const [cots, rentas, inv] = await Promise.all([
        supabase.from('cotizaciones').select('*, clientes(nombre_cliente)').gte('created_at', dateRange.inicio).lte('created_at', dateRange.fin).order('created_at', { ascending: true }),
        supabase.from('analisis_rentabilidad').select('*'),
        supabase.from('inventario_innvolt').select('*')
      ]);

      if (cots.data && rentas.data) {
        const totalVentas = cots.data.reduce((acc, c) => acc + Number(c.total), 0);
        const rentasFiltradas = rentas.data.filter(r => cots.data?.some(c => c.id === r.cotizacion_id));
        
        // La "utilidadTotal" es la suma de los márgenes de cada proyecto
        const utilidadTotal = rentasFiltradas.reduce((acc, r) => acc + Number(r.utilidad_neta), 0);
        const costoTotal = rentasFiltradas.reduce((acc, r) => acc + Number(r.costo_total_real), 0);

        // Lógica: Si el margen total es menor que la meta (Gastos Fijos), calculamos cuánto falta
        // Si hay un margen negativo en un proyecto, la utilidadTotal baja automáticamente, 
        // alejándote más de la meta de 5M.
        const faltaParaMeta = gastosFijos - utilidadTotal;
        const porcentajeCobertura = (utilidadTotal / gastosFijos) * 100;

        const mesesMap = new Map();
        cots.data.forEach(c => {
          const mes = new Date(c.created_at).toLocaleDateString('es-CL', { month: 'short' }).toUpperCase();
          const utilidad = rentas.data.find(r => r.cotizacion_id === c.id)?.utilidad_neta || 0;
          const actual = mesesMap.get(mes) || { Venta: 0, Utilidad: 0 };
          mesesMap.set(mes, {
            Venta: actual.Venta + Number(c.total),
            Utilidad: actual.Utilidad + Number(utilidad)
          });
        });

        const ventasGrafico = Array.from(mesesMap, ([name, values]) => ({ name, ...values }));

        const clientesMap = new Map();
        cots.data.forEach(c => {
          const nombre = c.clientes?.nombre_cliente || 'Sin Nombre';
          clientesMap.set(nombre, (clientesMap.get(nombre) || 0) + Number(c.total));
        });

        const analisisClientes = Array.from(clientesMap, ([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value).slice(0, 5);

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
            margenPromedio: totalVentas > 0 ? (utilidadTotal / totalVentas) * 100 : 0, 
            costoTotal, 
            faltaParaMeta: faltaParaMeta > 0 ? faltaParaMeta : 0,
            porcentajeCobertura
          },
          proyectos: proyectosPro,
          ventasGrafico,
          inventarioCritico: inv.data?.filter(i => i.cantidad_actual <= i.cantidad_minima) || [],
          analisisClientes
        });
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  const exportToCSV = () => {
    const headers = ["Folio,Cliente,Venta,Utilidad,Margen%\n"];
    const rows = data.proyectos.map((p: any) => 
      `${p.folio},${p.clientes?.nombre_cliente},${p.total},${p.utilidad},${p.margen.toFixed(2)}`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Auditoria_${dateRange.inicio}.csv`;
    a.click();
  };

  const proyectosFiltrados = data.proyectos.filter((p: any) => 
    p.clientes?.nombre_cliente?.toLowerCase().includes(filterText.toLowerCase()) ||
    p.folio?.toString().includes(filterText)
  );

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50">
      <div className="w-16 h-16 border-4 border-[#ffc600] border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="font-black italic text-slate-900 animate-pulse uppercase tracking-[0.3em]">Calculando Cobertura de Margen...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-10 space-y-8 animate-in fade-in duration-700 max-w-[1600px] mx-auto">
      
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 border-b border-slate-100 pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
             <div className="w-8 h-1 bg-[#ffc600]"></div>
             <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Innvolt Intelligence Unit</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">
            Business <span className="text-[#ffc600]">Control</span>
          </h2>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            <input type="date" value={dateRange.inicio} onChange={(e) => setDateRange({...dateRange, inicio: e.target.value})} className="text-slate-900 text-[10px] font-bold p-2 outline-none" />
            <span className="flex items-center text-slate-900">|</span>
            <input type="date" value={dateRange.fin} onChange={(e) => setDateRange({...dateRange, fin: e.target.value})} className="text-slate-900 text-[10px] font-bold p-2 outline-none" />
          </div>
          <button onClick={exportToCSV} className="flex items-center gap-2 bg-slate-900 text-white px-6 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#ffc600] hover:text-slate-900 transition-all shadow-lg">
            <Download size={16}/> Exportar CSV
          </button>
        </div>
      </div>

      <div className="flex w-full bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner overflow-x-auto">
          <Tab active={activeTab === 'financiero'} onClick={() => setActiveTab('financiero')} label="Análisis Financiero" />
          <Tab active={activeTab === 'operativo'} onClick={() => setActiveTab('operativo')} label="Rendimiento Proyectos" />
          <Tab active={activeTab === 'clientes'} onClick={() => setActiveTab('clientes')} label="Cartera" />
          <Tab active={activeTab === 'inventario'} onClick={() => setActiveTab('inventario')} label="Bodega" />
      </div>

      {/* KPI GRID - AQUÍ ESTÁ LA LÓGICA QUE PEDISTE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <ReportCard title="Margen Acumulado" value={fCLP(data.resumen.utilidadTotal)} icon={<TrendingUp/>} trend="Utilidad Real" color="yellow" />
        
        <div className="relative group">
          <ReportCard 
            title="Falta para la Meta" 
            value={fCLP(data.resumen.faltaParaMeta)} 
            icon={<Target/>} 
            trend={`Meta: ${fCLP(gastosFijos)}`} 
            color={data.resumen.faltaParaMeta > 0 ? 'red' : 'blue'} 
            alert={data.resumen.faltaParaMeta > 0}
          />
          <button onClick={() => setIsEditingPE(!isEditingPE)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-[#ffc600] rounded-full text-blue-500 hover:text-slate-900 transition-all opacity-0 group-hover:opacity-100"><Settings size={14} /></button>
          {isEditingPE && (
            <div className="absolute top-24 left-0 w-full p-6 bg-slate-900 shadow-2xl rounded-[2rem] border border-slate-700 z-50 animate-in fade-in slide-in-from-top-4">
               <p className="text-[10px] font-black uppercase mb-4 text-[#ffc600] tracking-widest flex items-center gap-2"><Edit3 size={12}/> Meta de Margen Mensual (Gastos)</p>
               <input type="number" value={gastosFijos} onChange={(e) => setGastosFijos(Number(e.target.value))} className="w-full bg-transparent border-b border-slate-700 py-2 font-black text-2xl text-white outline-none focus:border-[#ffc600] transition-colors"/>
               <button onClick={() => setIsEditingPE(false)} className="mt-6 w-full py-3 bg-[#ffc600] text-slate-900 text-[10px] font-black uppercase rounded-xl">Guardar Meta</button>
            </div>
          )}
        </div>

        <ReportCard title="Ventas Totales" value={fCLP(data.resumen.totalVentas)} icon={<Wallet/>} trend="Facturación" color="slate" />
        
        <ReportCard title="Cobertura de Gastos" value={`${data.resumen.porcentajeCobertura.toFixed(1)}%`} icon={<CheckCircle/>} trend="Progreso" color="blue" />
      </div>

      {/* VISTA FINANCIERA */}
      {activeTab === 'financiero' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl">
            <h3 className="text-sm font-black text-slate-800 uppercase italic flex items-center gap-2 mb-10">
               <BarChart3 size={18} className="text-[#ffc600]" /> Progreso de Utilidad Mensual
            </h3>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.ventasGrafico}>
                  <defs>
                    <linearGradient id="colorUtilidad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ffc600" stopOpacity={0.3}/><stop offset="95%" stopColor="#ffc600" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#64748b'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#cbd5e1'}} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="Utilidad" name="Utilidad Neta" stroke="#ffc600" strokeWidth={4} fill="url(#colorUtilidad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl text-white flex flex-col">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#ffc600] mb-8">Estado de Cobertura</h3>
            <div className="space-y-10 flex-grow">
              <HealthMetric label="Margen vs Gastos" percent={data.resumen.porcentajeCobertura} color="bg-[#ffc600]" value={fCLP(data.resumen.utilidadTotal)} />
              <HealthMetric label="Pendiente por Generar" percent={100 - data.resumen.porcentajeCobertura} color="bg-rose-400" value={fCLP(data.resumen.faltaParaMeta)} />
            </div>
            <div className="mt-12 p-6 bg-white/5 rounded-[2rem] border border-white/10 italic text-[11px] text-slate-400">
              <p className="flex items-center gap-2 text-[#ffc600] mb-2 font-black uppercase tracking-widest"><Info size={14}/> Nota de Auditoría</p>
              <p>Si un proyecto tiene margen negativo, se restará de tu "Margen Acumulado", haciendo que el valor de "Falta para la Meta" aumente automáticamente. Esto te obliga a compensar las pérdidas con nuevos proyectos rentables.</p>
            </div>
          </div>
        </div>
      )}

      {/* RESTO DEL CÓDIGO (TABLAS, CLIENTES, INVENTARIO) SE MANTIENE IGUAL... */}
      {activeTab === 'operativo' && (
        <div className="space-y-6">
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input type="text" placeholder="Filtrar por cliente o folio..." className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-2xl text-xs font-black uppercase outline-none shadow-sm" onChange={(e) => setFilterText(e.target.value)} />
          </div>
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="p-8 text-[10px] font-black uppercase text-slate-400">Folio / Cliente</th>
                    <th className="p-8 text-[10px] font-black uppercase text-slate-400 text-right">Venta</th>
                    <th className="p-8 text-[10px] font-black uppercase text-slate-400 text-right">Utilidad Neta</th>
                    <th className="p-8 text-[10px] font-black uppercase text-slate-400 text-center">Estado Margen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {proyectosFiltrados.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-8">
                        <p className="font-black text-slate-900 italic text-xl">#{p.folio}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{p.clientes?.nombre_cliente}</p>
                      </td>
                      <td className="p-8 text-sm font-black text-slate-900 text-right">{fCLP(p.total)}</td>
                      <td className={`p-8 text-lg font-black text-right italic ${p.utilidad < 0 ? 'text-rose-500 underline decoration-2' : 'text-emerald-500'}`}>{fCLP(p.utilidad)}</td>
                      <td className="p-8 text-center">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase ${p.margen < 0 ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-900 text-[#ffc600]'}`}>
                          {p.margen.toFixed(1)}% {p.margen < 0 ? 'PÉRDIDA' : 'MARGEN'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'clientes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl">
             <h3 className="text-sm font-black text-slate-800 uppercase italic mb-8">Concentración de Cartera</h3>
             <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.analisisClientes} innerRadius={80} outerRadius={140} paddingAngle={5} dataKey="value">
                      {data.analisisClientes.map((_: any, index: number) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value: any) => fCLP(value)} />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
             </div>
          </div>
          <div className="space-y-4">
            {data.analisisClientes.map((c: any, i: number) => (
              <div key={i} className="bg-white p-6 rounded-3xl border border-slate-50 flex items-center justify-between shadow-sm hover:translate-x-2 transition-transform">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-900 text-[#ffc600] rounded-full flex items-center justify-center font-black">0{i+1}</div>
                  <div><p className="font-black text-slate-900 uppercase italic">{c.name}</p><p className="text-[10px] text-slate-400 font-bold uppercase">Aporte a Facturación</p></div>
                </div>
                <p className="text-lg font-black text-slate-900 italic">{fCLP(c.value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'inventario' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.inventarioCritico.length === 0 ? (
            <div className="col-span-full py-20 text-center bg-emerald-50 rounded-[3rem] border-2 border-dashed border-emerald-200">
              <CheckCircle size={48} className="mx-auto text-emerald-500 mb-4"/>
              <p className="text-emerald-700 font-black uppercase italic">Niveles de stock saludables</p>
            </div>
          ) : (
            data.inventarioCritico.map((item: any) => (
              <div key={item.id} className="bg-white p-8 rounded-[2.5rem] border-2 border-rose-100 flex items-center justify-between group">
                <div>
                  <p className="text-[9px] font-black text-rose-500 uppercase">Solicitud de Compra</p>
                  <h4 className="text-base font-black text-slate-900 uppercase italic leading-tight">{item.nombre}</h4>
                  <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase">Stock Actual: <span className="text-rose-600">{item.cantidad_actual}</span></p>
                </div>
                <div className="bg-rose-50 p-4 rounded-3xl text-rose-500"><Package /></div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// COMPONENTES DE APOYO
function ReportCard({ title, value, icon, trend, color, alert }: any) {
  const bg = color === 'yellow' ? 'bg-[#ffc600] text-slate-900' : color === 'blue' ? 'bg-blue-600 text-white' : color === 'red' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white';
  return (
    <div className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm transition-all hover:shadow-2xl group relative overflow-hidden">
      {alert && <div className="absolute top-0 right-0 w-2 h-full bg-rose-500 animate-pulse" />}
      <div className="flex justify-between items-start mb-6">
        <div className={`p-4 rounded-2xl shadow-lg ${bg}`}>{icon}</div>
        <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase italic ${alert ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}`}>{trend}</span>
      </div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
      <h3 className="text-2xl font-black text-slate-900 mt-1 tracking-tighter italic">{value}</h3>
    </div>
  );
}

function HealthMetric({ label, percent, color, value }: any) {
  const safePercent = Math.min(Math.max(percent || 0, 0), 100);
  return (
    <div>
      <div className="flex justify-between text-[10px] font-black uppercase mb-3">
        <span className="text-slate-400">{label}</span>
        <span className="text-[#ffc600] italic">{value}</span>
      </div>
      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
        <div className={`h-full ${color} transition-all duration-1000`} style={{ width: `${safePercent}%` }}></div>
      </div>
    </div>
  );
}

function Tab({ active, onClick, label }: any) {
  return (
    <button onClick={onClick} className={`px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${active ? 'bg-slate-900 text-[#ffc600] shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}>
      {label}
    </button>
  );
}