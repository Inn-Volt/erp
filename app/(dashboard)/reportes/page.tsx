/* eslint-disable jsx-a11y/alt-text */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BarChart3, Download, Search, TrendingUp, 
  Package, Briefcase, Landmark, 
  Users, Wallet, Receipt, Clock, Scale, Plus, Trash2, Fuel, Car, Building
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// --- CONFIGURACIÓN Y UTILIDADES ---
const fCLP = (v?: number) => new Intl.NumberFormat('es-CL', { 
  style: 'currency', 
  currency: 'CLP',
  minimumFractionDigits: 0 
}).format(v || 0);

const COLORS = ['#ffc600', '#0f172a', '#3b82f6', '#10b981', '#f43f5e'];

// --- COMPONENTES AUXILIARES ---
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

function ReportCard({ title, value, icon, trend, color, alert }: any) {
  const colorMap: any = {
    yellow: 'bg-[#ffc600] text-slate-900', blue: 'bg-blue-600 text-white',
    red: 'bg-rose-600 text-white', green: 'bg-emerald-600 text-white',
    slate: 'bg-slate-900 text-[#ffc600]'
  };
  return (
    <div className="p-8 rounded-[2.5rem] bg-white border border-slate-100 shadow-xl transition-all hover:-translate-y-1 group relative overflow-hidden">
      {alert && <div className="absolute top-0 right-0 w-2 h-full bg-rose-500 animate-pulse" />}
      <div className="flex justify-between items-start mb-8">
        <div className={`p-4 rounded-2xl shadow-xl transition-transform group-hover:scale-110 ${colorMap[color]}`}>{icon}</div>
        <span className="text-[9px] font-black px-3 py-1.5 rounded-lg uppercase italic bg-slate-50 text-slate-400">{trend}</span>
      </div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{title}</p>
      <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter italic truncate">{value}</h3>
    </div>
  );
}

function HealthMetric({ label, percent, color, value }: any) {
  const safePercent = Math.min(Math.max(percent || 0, 0), 100);
  return (
    <div className="group">
      <div className="flex justify-between text-[10px] font-black uppercase mb-3 tracking-widest">
        <span className="text-slate-400 group-hover:text-white transition-colors">{label}</span>
        <span className="text-[#ffc600] italic text-xs">{value}</span>
      </div>
      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-[2px] border border-white/10">
        <div className={`h-full ${color} rounded-full transition-all duration-1000 ease-out`} style={{ width: `${safePercent}%` }}></div>
      </div>
    </div>
  );
}

function Tab({ active, onClick, label, icon }: any) {
  return (
    <button onClick={onClick} className={`flex items-center gap-3 px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex-1 justify-center ${active ? 'bg-slate-900 text-[#ffc600] shadow-2xl scale-[1.02]' : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-700'}`}>
      {icon} {label}
    </button>
  );
}

// --- COMPONENTE PRINCIPAL ---
export default function ReportesPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'financiero' | 'operativo' | 'clientes' | 'impuestos' | 'opex'>('impuestos');
  const [filterText, setFilterText] = useState('');
  
  const [dateRange, setDateRange] = useState({
    inicio: '2024-01-01', 
    fin: new Date().toISOString().split('T')[0]
  });

  // --- ESTADO Y LÓGICA DE NEGOCIO ---
  const [opexItems, setOpexItems] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('innvolt_opex_detallado');
      return saved ? JSON.parse(saved) : [
        { id: 1, categoria: 'Sueldos y Honorarios', monto: 3000000 },
        { id: 2, categoria: 'Arriendo y Oficina', monto: 1200000 },
        { id: 3, categoria: 'Marketing Digital', monto: 500000 },
        { id: 4, categoria: 'Software y Suscripciones', monto: 300000 }
      ];
    }
    return [];
  });

  const [gastosIvaExtra, setGastosIvaExtra] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('innvolt_iva_extra');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const gastosFijosTotales = useMemo(() => opexItems.reduce((acc: number, curr: any) => acc + curr.monto, 0), [opexItems]);
  
  const totalIvaCreditoExtra = useMemo(() => {
    return gastosIvaExtra.reduce((acc: number, curr: any) => acc + curr.montoIva, 0);
  }, [gastosIvaExtra]);

  const [data, setData] = useState<any>({
    resumen: { totalVentas: 0, utilidadTotal: 0, margenPromedio: 0, costoTotal: 0, faltaParaMeta: 0, porcentajeCobertura: 0, pipelinePendiente: 0, ivaDebito: 0, ivaCreditoProyectos: 0, ivaNeto: 0, remanente: 0 },
    proyectos: [],
    ventasGrafico: [],
    inventarioCritico: [],
    analisisClientes: [],
    agingReport: { alDia: 0, mora30: 0, mora60: 0 }
  });

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [cots, rentas, inv] = await Promise.all([
        supabase.from('cotizaciones').select('*, clientes(nombre_cliente)').order('created_at', { ascending: true }),
        supabase.from('analisis_rentabilidad').select('*'),
        supabase.from('inventario_innvolt').select('*')
      ]);

      if (cots.data && rentas.data) {
        const cotsAceptadas = cots.data.filter(c => 
            ['Aceptada', 'Realizado', 'Finalizado', 'Enviada'].includes(c.estado) &&
            c.created_at >= dateRange.inicio && c.created_at <= dateRange.fin
        );

        const pipelinePendiente = cots.data.filter(c => c.estado === 'Pendiente').reduce((acc, c) => acc + Number(c.total), 0);
        const totalVentasNetas = cotsAceptadas.reduce((acc, c) => acc + Number(c.subtotal || 0), 0);
        const ivaDebitoTotal = cotsAceptadas.reduce((acc, c) => acc + Number(c.iva || 0), 0);
        
        // --- CÁLCULO IVA PROYECTOS ---
        let ivaCreditoProyectos = 0;
        cotsAceptadas.forEach((c: any) => {
            if (c.items && Array.isArray(c.items)) {
                c.items.forEach((item: any) => {
                    if (item.esMaterial) {
                        const subtotalItem = item.cantidad * item.precio;
                        if (item.iva_incluido) {
                            ivaCreditoProyectos += (subtotalItem - (subtotalItem / 1.19));
                        } else {
                            ivaCreditoProyectos += (subtotalItem * 0.19);
                        }
                    }
                });
            }
        });

        const rentasFiltradas = rentas.data.filter(r => cotsAceptadas.some(c => c.id === r.cotizacion_id));
        const utilidadTotal = rentasFiltradas.reduce((acc, r) => acc + Number(r.utilidad_neta), 0);
        const costoTotalNeto = rentasFiltradas.reduce((acc, r) => acc + Number(r.costo_total_real), 0);

        // --- CÁLCULO F29 FINAL (SII) ---
        const ivaNetoCalculado = ivaDebitoTotal - (ivaCreditoProyectos + totalIvaCreditoExtra);

        // Aging Report
        let alDia = 0, mora30 = 0, mora60 = 0;
        const hoy = new Date();
        cotsAceptadas.forEach(c => {
          const dias = Math.floor((hoy.getTime() - new Date(c.created_at).getTime()) / (1000 * 3600 * 24));
          const valorBruto = Number(c.total);
          if (dias > 60) mora60 += valorBruto;
          else if (dias > 30) mora30 += valorBruto;
          else alDia += valorBruto;
        });

        const mesesMap = new Map();
        cotsAceptadas.forEach(c => {
          const mes = new Date(c.created_at).toLocaleDateString('es-CL', { month: 'short' }).toUpperCase();
          const u = rentas.data.find(r => r.cotizacion_id === c.id)?.utilidad_neta || 0;
          const actual = mesesMap.get(mes) || { Venta: 0, Utilidad: 0 };
          mesesMap.set(mes, { Venta: actual.Venta + Number(c.subtotal), Utilidad: actual.Utilidad + Number(u) });
        });

        const clientesMap = new Map();
        cotsAceptadas.forEach(c => {
          const nombre = c.clientes?.nombre_cliente || 'Sin Nombre';
          clientesMap.set(nombre, (clientesMap.get(nombre) || 0) + Number(c.total));
        });

        setData({
          resumen: { 
            totalVentas: totalVentasNetas, 
            utilidadTotal, 
            margenPromedio: totalVentasNetas > 0 ? (utilidadTotal / totalVentasNetas) * 100 : 0, 
            costoTotal: costoTotalNeto, 
            faltaParaMeta: Math.max(0, gastosFijosTotales - utilidadTotal),
            porcentajeCobertura: (utilidadTotal / gastosFijosTotales) * 100,
            pipelinePendiente,
            ivaDebito: ivaDebitoTotal,
            ivaCreditoProyectos, 
            ivaNeto: ivaNetoCalculado > 0 ? ivaNetoCalculado : 0,
            remanente: ivaNetoCalculado < 0 ? Math.abs(ivaNetoCalculado) : 0
          },
          proyectos: cotsAceptadas.map(c => ({
            ...c,
            utilidad: rentas.data.find(r => r.cotizacion_id === c.id)?.utilidad_neta || 0,
            margen: rentas.data.find(r => r.cotizacion_id === c.id)?.margen_real || 0
          })),
          ventasGrafico: Array.from(mesesMap, ([name, values]) => ({ name, ...values })),
          inventarioCritico: inv.data?.filter(i => i.cantidad_actual <= i.cantidad_minima) || [],
          analisisClientes: Array.from(clientesMap, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5),
          agingReport: { alDia, mora30, mora60 }
        });
      }
    } catch (e) { console.error(e); } finally { if (!silent) setLoading(false); }
  }, [dateRange, gastosFijosTotales, totalIvaCreditoExtra]);

  // --- EFECTOS ---
  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('db_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizaciones' }, () => fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analisis_rentabilidad' }, () => fetchData(true))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  useEffect(() => {
    localStorage.setItem('innvolt_opex_detallado', JSON.stringify(opexItems));
    localStorage.setItem('innvolt_iva_extra', JSON.stringify(gastosIvaExtra));
  }, [opexItems, gastosIvaExtra]);

  const proyectosFiltrados = useMemo(() => {
    return data.proyectos.filter((p: any) => 
      p.clientes?.nombre_cliente?.toLowerCase().includes(filterText.toLowerCase()) ||
      p.folio?.toString().includes(filterText)
    );
  }, [data.proyectos, filterText]);

  // Función auxiliar para formatear inputs de dinero en tiempo real
  const handleCurrencyInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value === "") {
      e.target.value = "";
      return;
    }
    e.target.value = new Intl.NumberFormat('es-CL').format(Number(value));
  };

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50">
      <div className="w-16 h-16 border-4 border-[#ffc600] border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="font-black italic text-slate-900 animate-pulse uppercase tracking-[0.3em]">Auditoría en Tiempo Real...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-10 space-y-6 md:space-y-8 max-w-[1600px] mx-auto bg-slate-50/50 min-h-screen">
      
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 border-b border-slate-200 pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
             <div className="w-8 h-1 bg-[#ffc600]"></div>
             <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Financial Auditor Intel</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">
            Executive <span className="text-[#ffc600]">Audit</span>
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-4 items-center">
          <div className="flex w-full sm:w-auto bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm">
            <input type="date" value={dateRange.inicio} onChange={(e) => setDateRange({...dateRange, inicio: e.target.value})} className="flex-1 text-slate-900 text-[11px] font-black p-2 outline-none bg-transparent" />
            <span className="flex items-center text-slate-300 px-2">/</span>
            <input type="date" value={dateRange.fin} onChange={(e) => setDateRange({...dateRange, fin: e.target.value})} className="flex-1 text-slate-900 text-[11px] font-black p-2 outline-none bg-transparent" />
          </div>
          <button className="w-full sm:w-auto flex items-center justify-center gap-3 bg-slate-900 text-[#ffc600] px-8 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-[#ffc600] hover:text-slate-900 transition-all shadow-xl group">
            <Download size={18} /> Exportar Reporte
          </button>
        </div>
      </div>

      {/* TABS NAVEGACIÓN */}
      <div className="flex w-full bg-slate-200/50 p-1.5 rounded-2xl border border-slate-200 shadow-inner overflow-x-auto no-scrollbar gap-2">
          <Tab active={activeTab === 'financiero'} onClick={() => setActiveTab('financiero')} label="Dashboard" icon={<Landmark size={14}/>} />
          <Tab active={activeTab === 'impuestos'} onClick={() => setActiveTab('impuestos')} label="IVA & Créditos" icon={<Receipt size={14}/>} />
          <Tab active={activeTab === 'opex'} onClick={() => setActiveTab('opex')} label="Gastos OpEx" icon={<Scale size={14}/>} />
          <Tab active={activeTab === 'operativo'} onClick={() => setActiveTab('operativo')} label="Proyectos & Aging" icon={<Clock size={14}/>} />
          <Tab active={activeTab === 'clientes'} onClick={() => setActiveTab('clientes')} label="Clientes" icon={<Users size={14}/>} />
      </div>

      {/* --- CONTENIDO TABS --- */}
      
      {/* 1. FINANCIERO */}
      {activeTab === 'financiero' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <ReportCard title="Utilidad Bruta" value={fCLP(data.resumen.utilidadTotal)} icon={<TrendingUp/>} trend="Resultado Real" color="yellow" />
            <ReportCard title="Ventas Netas" value={fCLP(data.resumen.totalVentas)} icon={<Wallet/>} trend="Sin IVA" color="slate" />
            <ReportCard title="Costo Insumos" value={fCLP(data.resumen.costoTotal)} icon={<Package/>} trend="Neto Compra" color="blue" />
            <ReportCard title="Pipeline Pendiente" value={fCLP(data.resumen.pipelinePendiente)} icon={<Briefcase/>} trend="Por Cerrar" color="slate" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white p-6 md:p-10 rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
              <h3 className="text-sm font-black text-slate-800 uppercase italic flex items-center gap-3 mb-10">
                <BarChart3 size={18} className="text-[#ffc600]" /> Rendimiento Histórico
              </h3>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.ventasGrafico}>
                    <defs>
                      <linearGradient id="colorU" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ffc600" stopOpacity={0.3}/><stop offset="95%" stopColor="#ffc600" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900}} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="Utilidad" stroke="#ffc600" strokeWidth={4} fill="url(#colorU)" />
                    <Area type="monotone" dataKey="Venta" stroke="#0f172a" strokeWidth={1} fill="#f1f5f9" strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white flex flex-col justify-between shadow-2xl">
              <div>
                <h3 className="text-xs font-black uppercase text-[#ffc600] tracking-widest mb-10 flex items-center gap-2"><Clock size={16}/> Cartera por Cobrar</h3>
                <div className="space-y-8">
                  <HealthMetric label="En Plazo (0-30)" value={fCLP(data.agingReport.alDia)} percent={(data.agingReport.alDia/data.resumen.totalVentas)*100} color="bg-emerald-400" />
                  <HealthMetric label="Mora Media (31-60)" value={fCLP(data.agingReport.mora30)} percent={(data.agingReport.mora30/data.resumen.totalVentas)*100} color="bg-orange-400" />
                  <HealthMetric label="Mora Crítica (+61)" value={fCLP(data.agingReport.mora60)} percent={(data.agingReport.mora60/data.resumen.totalVentas)*100} color="bg-rose-500" />
                </div>
              </div>
              <div className="mt-10 pt-10 border-t border-white/10">
                  <p className="text-[10px] font-black uppercase text-slate-500 mb-2 tracking-widest">Cobertura OpEx Actual</p>
                  <div className="flex items-end gap-3">
                    <span className="text-4xl font-black italic text-[#ffc600]">{data.resumen.porcentajeCobertura.toFixed(1)}%</span>
                    <span className={`text-[10px] font-bold mb-2 uppercase ${data.resumen.porcentajeCobertura >= 100 ? 'text-emerald-400' : 'text-rose-500'}`}>
                      {data.resumen.porcentajeCobertura >= 100 ? 'Punto de Equilibrio Alcanzado' : `Faltan ${fCLP(data.resumen.faltaParaMeta)}`}
                    </span>
                  </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. IMPUESTOS (SII) */}
      {activeTab === 'impuestos' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-8 rounded-[2.5rem] border-l-4 border-rose-500 shadow-lg">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">IVA Débito (Ventas)</p>
              <h4 className="text-3xl font-black text-rose-600 italic">{fCLP(data.resumen.ivaDebito)}</h4>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] border-l-4 border-emerald-500 shadow-lg">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">IVA Crédito Total</p>
              <h4 className="text-3xl font-black text-emerald-600 italic">{fCLP(data.resumen.ivaCreditoProyectos + totalIvaCreditoExtra)}</h4>
              <p className="text-[9px] text-slate-400 mt-2 italic">Proyectos: {fCLP(data.resumen.ivaCreditoProyectos)} + Extras: {fCLP(totalIvaCreditoExtra)}</p>
            </div>
            <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white">
              <p className="text-[10px] font-black text-[#ffc600] uppercase tracking-widest mb-2">F29 Proyectado</p>
              <h4 className="text-3xl font-black italic">{data.resumen.ivaNeto > 0 ? fCLP(data.resumen.ivaNeto) : "SIN IVA A PAGAR"}</h4>
              {data.resumen.remanente > 0 && <p className="text-[10px] text-emerald-400 font-bold mt-2 uppercase italic">Remanente: {fCLP(data.resumen.remanente)}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl">
                <h3 className="text-slate-900 text-sm font-black uppercase italic mb-6 flex items-center gap-2"><Plus className="text-[#ffc600]"/> Cargar Gasto Crédito (SII)</h3>
                <form className="text-slate-900 grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={(e: any) => {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    const tipo = formData.get('tipo');
                    const detalle = formData.get('detalle');
                    let montoIva = 0;
                    let depreciacion = 0;
                    let esActivo = false;
                    let baseImponible = 0;

                    if (tipo === 'Combustible') {
                        // Quitar puntos antes de calcular
                        const montoTotal = Number(formData.get('montoTotal')?.toString().replace(/\./g, ""));
                        montoIva = montoTotal - (montoTotal / 1.19);
                        baseImponible = montoTotal / 1.19;
                    } else if (tipo === 'Activo') {
                        const valorNeto = Number(formData.get('valorNeto')?.toString().replace(/\./g, ""));
                        montoIva = valorNeto * 0.19;
                        depreciacion = valorNeto / 60; // 5 años
                        esActivo = true;
                        baseImponible = valorNeto;
                    } else {
                        montoIva = Number(formData.get('montoIva')?.toString().replace(/\./g, ""));
                        baseImponible = montoIva / 0.19;
                    }

                    const nuevo = { id: Date.now(), tipo, detalle, montoIva, depreciacion, esActivo, baseImponible };
                    setGastosIvaExtra([...gastosIvaExtra, nuevo]);
                    e.target.reset();
                    e.target.querySelector('#combustible-fields').style.display = 'none';
                    e.target.querySelector('#activo-fields').style.display = 'none';
                    e.target.querySelector('#general-fields').style.display = 'none';
                }}>
                    <select name="tipo" className="p-4 bg-slate-50 rounded-xl font-bold text-xs border border-slate-100 shadow-inner md:col-span-2" onChange={(e) => {
                        const form = e.target.form;
                        if (!form) return;
                        const combustibleFields = form.querySelector('#combustible-fields') as HTMLElement;
                        const activoFields = form.querySelector('#activo-fields') as HTMLElement;
                        const generalFields = form.querySelector('#general-fields') as HTMLElement;
                        
                        if (combustibleFields) combustibleFields.style.display = e.target.value === 'Combustible' ? 'block' : 'none';
                        if (activoFields) activoFields.style.display = e.target.value === 'Activo' ? 'block' : 'none';
                        if (generalFields) generalFields.style.display = (e.target.value === 'Insumos' || e.target.value === 'Servicios') ? 'block' : 'none';
                    }}>
                        <option value="">Seleccione Tipo de Gasto</option>
                        <option value="Combustible">Combustible</option>
                        <option value="Activo">Activo Fijo (Vehículo/Maquinaria)</option>
                        <option value="Insumos">Insumos Varios / Materiales Stock</option>
                        <option value="Servicios">Servicios Básicos / Honorarios</option>
                    </select>

                    <input name="detalle" placeholder="Ej: Camioneta Operativa o Copec" className="md:col-span-2 p-4 bg-slate-50 rounded-xl font-bold text-xs border border-slate-100" required />
                    
                    {/* Campos Dinámicos con formato de puntos */}
                    <div id="combustible-fields" className="hidden md:col-span-2">
                        <input name="montoTotal" type="text" placeholder="Total Boleta (IVA Incluido)" className="w-full p-4 bg-slate-50 rounded-xl font-bold text-xs border border-slate-100" onChange={handleCurrencyInput} />
                    </div>
                    
                    <div id="activo-fields" className="hidden md:col-span-2">
                        <input name="valorNeto" type="text" placeholder="Valor Neto Activo" className="w-full p-4 bg-slate-50 rounded-xl font-bold text-xs border border-slate-100" onChange={handleCurrencyInput} />
                    </div>

                    <div id="general-fields" className="hidden md:col-span-2">
                        <input name="montoIva" type="text" placeholder="Monto IVA" className="w-full p-4 bg-slate-50 rounded-xl font-bold text-xs border border-slate-100" onChange={handleCurrencyInput} />
                    </div>
                    
                    <button type="submit" className="md:col-span-2 bg-slate-900 text-[#ffc600] p-4 rounded-xl font-black uppercase text-[10px] hover:bg-[#ffc600] hover:text-slate-900 transition-all shadow-lg">Registrar Gasto</button>
                </form>
              </div>

              <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl overflow-hidden">
                <h3 className="text-[10px] font-black uppercase text-[#ffc600] tracking-widest mb-6 italic">Otros Créditos Registrados</h3>
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
                    {gastosIvaExtra.map((g: any) => (
                        <div key={g.id} className="bg-white/5 border border-white/10 p-6 rounded-3xl grid grid-cols-3 gap-4 items-center">
                            <div className="col-span-2 flex items-center gap-4">
                                <div className="p-3 bg-white/10 rounded-2xl text-[#ffc600]">
                                    {g.tipo === 'Combustible' && <Fuel size={20}/>}
                                    {g.tipo === 'Activo' && <Car size={20}/>}
                                    {g.tipo === 'Insumos' && <Package size={20}/>}
                                    {g.tipo === 'Servicios' && <Building size={20}/>}
                                </div>
                                <div>
                                    <p className="text-white font-black text-[12px] uppercase tracking-tighter">{g.detalle}</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">{g.tipo}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-emerald-400 font-black italic text-base">{fCLP(g.montoIva)}</span>
                                <button onClick={() => setGastosIvaExtra(gastosIvaExtra.filter(i => i.id !== g.id))} className="ml-3 text-white/20 hover:text-rose-500"><Trash2 size={14}/></button>
                            </div>
                            
                            {/* --- DETALLE DE CÁLCULO SII --- */}
                            <div className="col-span-3 bg-slate-800/50 p-4 rounded-xl text-[9px] text-slate-300 font-mono space-y-1 border border-white/5">
                                <p className="text-[#ffc600] font-bold">Detalle SII:</p>
                                {g.tipo === 'Combustible' && (
                                    <>
                                        <p>IVA = <span className='text-white'>Total</span> - (<span className='text-white'>Total</span> / 1.19)</p>
                                        <p>Base Imponible: <span className='text-white'>{fCLP(g.baseImponible)}</span></p>
                                    </>
                                )}
                                {g.tipo === 'Activo' && (
                                    <>
                                        <p>IVA = <span className='text-white'>Valor Neto</span> * 0.19</p>
                                        <p>Base Imponible: <span className='text-white'>{fCLP(g.baseImponible)}</span></p>
                                        <p>Depreciación Mensual (Lineal 5 años): <span className='text-emerald-400'>{fCLP(g.depreciacion)}</span></p>
                                    </>
                                )}
                                {['Insumos', 'Servicios'].includes(g.tipo) && (
                                    <p>IVA directo ingresado. Base Imponible: <span className='text-white'>{fCLP(g.baseImponible)}</span></p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
              </div>
          </div>
        </div>
      )}

      {/* 3. OPEX */}
      {activeTab === 'opex' && (
        <div className="space-y-8 animate-in zoom-in-95">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {opexItems.map((op: any) => (
              <div key={op.id} className="bg-white p-8 rounded-[2rem] border shadow-sm flex flex-col justify-between group hover:border-[#ffc600] transition-all">
                <div className="flex justify-between items-start">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{op.categoria}</p>
                  <button onClick={() => setOpexItems(opexItems.filter((i:any) => i.id !== op.id))} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100"><Trash2 size={14}/></button>
                </div>
                <h4 className="text-2xl font-black italic mt-6 text-slate-900">{fCLP(op.monto)}</h4>
              </div>
            ))}
            <button 
              onClick={() => {
                const cat = prompt("Categoría:");
                const mont = prompt("Monto:");
                if(cat && mont) setOpexItems([...opexItems, { id: Date.now(), categoria: cat, monto: Number(mont) }]);
              }}
              className="bg-slate-100 border-2 border-dashed border-slate-300 p-8 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-slate-400 font-black uppercase text-[10px] hover:bg-slate-200"
            >
              <Plus size={20}/> Agregar OpEx
            </button>
          </div>
          <div className="p-12 bg-slate-900 rounded-[3rem] text-white flex justify-between items-center shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-10 opacity-5"><Landmark size={200}/></div>
             <div className="z-10"><p className="text-[#ffc600] font-black uppercase text-[10px] tracking-[0.4em] mb-4">Gasto Mensual Estimado</p><h4 className="text-6xl font-black italic tracking-tighter">{fCLP(gastosFijosTotales)}</h4></div>
          </div>
        </div>
      )}

      {/* 4. PROYECTOS (OPERATIVO) */}
      {activeTab === 'operativo' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="relative max-w-xl">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input type="text" placeholder="BUSCAR POR FOLIO O CLIENTE..." className="text-slate-400 w-full pl-14 pr-6 py-5 bg-white border rounded-2xl text-[11px] font-black uppercase shadow-sm outline-none focus:ring-2 ring-[#ffc600]" onChange={(e) => setFilterText(e.target.value)} />
          </div>
          <div className="bg-white rounded-[2.5rem] border shadow-xl overflow-hidden">
              <table className="w-full text-left">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="p-7 text-[10px] font-black uppercase tracking-widest">Folio / Proyecto</th>
                      <th className="p-7 text-[10px] font-black uppercase tracking-widest text-right">Subtotal</th>
                      <th className="p-7 text-[10px] font-black uppercase tracking-widest text-right">Utilidad</th>
                      <th className="p-7 text-[10px] font-black uppercase tracking-widest text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {proyectosFiltrados.map((p: any) => (
                        <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="p-7">
                             <div className="flex items-center gap-4">
                               <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center font-black group-hover:bg-[#ffc600]">#{p.folio}</div>
                               <div><p className="font-black text-slate-900 uppercase italic text-sm">{p.clientes?.nombre_cliente}</p><p className="text-[9px] text-slate-400 font-bold">{new Date(p.created_at).toLocaleDateString()}</p></div>
                             </div>
                          </td>
                          <td className="p-7 text-right font-bold text-slate-700">{fCLP(p.subtotal)}</td>
                          <td className="p-7 text-right font-black text-emerald-600 italic">{fCLP(p.utilidad)}</td>
                          <td className="p-7 text-center"><span className="bg-slate-100 px-3 py-1 rounded-lg text-[10px] font-black uppercase italic">{p.estado}</span></td>
                        </tr>
                    ))}
                  </tbody>
              </table>
          </div>
        </div>
      )}

      {/* 5. CLIENTES */}
      {activeTab === 'clientes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in zoom-in-95">
            <div className="bg-white p-10 rounded-[2.5rem] border shadow-xl flex flex-col items-center">
                <h3 className="text-sm font-black text-slate-800 uppercase italic mb-10 self-start">Facturación por Cliente</h3>
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.analisisClientes} innerRadius={80} outerRadius={120} paddingAngle={8} dataKey="value" stroke="none">
                        {data.analisisClientes.map((_: any, index: number) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
            </div>
            <div className="space-y-4">
               {data.analisisClientes.map((c: any, i: number) => (
                 <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 flex items-center justify-between shadow-lg hover:translate-x-2 transition-transform">
                    <div className="flex items-center gap-6"><div className="text-3xl font-black text-slate-200 italic">0{i+1}</div><p className="font-black text-slate-900 uppercase italic text-sm">{c.name}</p></div>
                    <p className="text-xl font-black text-slate-900 italic">{fCLP(c.value)}</p>
                 </div>
               ))}
            </div>
        </div>
      )}

      {/* FOOTER */}
      <div className="pt-10 border-t border-slate-200">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Innvolt ERP © 2026 | Live Audit Sync Active</p>
      </div>
    </div>
  );
}