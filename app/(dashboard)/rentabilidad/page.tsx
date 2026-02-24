/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Users, ArrowLeft, ChevronRight, TrendingUp, Search, Briefcase, 
  Activity, Receipt, ShieldCheck, Layers, Trash2, UserPlus, Zap, 
  Save, LayoutDashboard, Target, AlertTriangle, CheckCircle2, Plus,
  Fuel, Utensils, DollarSign, ShieldAlert, Wallet, Clock
} from 'lucide-react';

// --- UTILIDADES ---
const formatCLP = (valor: number) => {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', 
    currency: 'CLP', 
    minimumFractionDigits: 0
  }).format(valor);
};

export default function RentabilidadPro() {
  // --- ESTADOS PRINCIPALES ---
  const [clientes, setClientes] = useState<any[]>([]);
  const [cotizaciones, setCotizaciones] = useState<any[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<any>(null);
  const [selectedCotizacion, setSelectedCotizacion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // --- ESTADOS DE ANÁLISIS ---
  const [personal, setPersonal] = useState<{rol: string, hh: number, costo_hh: number, pago_dia?: number, dias_trabajados?: number}[]>([]);
  const [gastosAdicionales, setGastosAdicionales] = useState<number>(0);
  const [factorRiesgo, setFactorRiesgo] = useState<number>(0.05);

  // --- GASTOS OPERACIONALES DETALLADOS ---
  const [calculoBencina, setCalculoBencina] = useState({
    distanciaDiaria: 0,
    dias: 0,
    rendimiento: 10,
    precioLitro: 1300
  });
  const [calculoColacion, setCalculoColacion] = useState({
    montoPorPersona: 0,
    dias: 0
  });

  // --- LÓGICA DE PERSONAL ---
  const agregarPersonal = () => setPersonal([...personal, { rol: '', hh: 0, costo_hh: 0, pago_dia: 0, dias_trabajados: 0 }]);
  
  const updatePersonal = (index: number, field: string, value: any) => {
    const newPersonal = [...personal];
    const item = { ...newPersonal[index] };

    if (field === 'rol') {
      item.rol = value;
    } else {
      const numValue = Number(value);
      (item as any)[field] = numValue;

      if (field === 'pago_dia' || field === 'dias_trabajados') {
        const pDia = field === 'pago_dia' ? numValue : (item.pago_dia || 0);
        const dias = field === 'dias_trabajados' ? numValue : (item.dias_trabajados || 0);
        
        item.hh = dias * 9; 
        item.costo_hh = item.hh > 0 ? Math.round((pDia * dias) / item.hh) : 0;
      }
    }
    
    newPersonal[index] = item;
    setPersonal(newPersonal);
  };

  const eliminarPersonal = (index: number) => setPersonal(personal.filter((_, i) => i !== index));

  // --- FETCHING ---
  useEffect(() => { 
    fetchClientes(); 
  }, []);

  async function fetchClientes() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('clientes')
        .select('*')
        .order('nombre_cliente', { ascending: true });
      setClientes(data || []);
    } catch (error) {
      console.error("Error al cargar clientes:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCotizacionesCliente(cliente: any) {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('cotizaciones')
        .select('*')
        .eq('cliente_id', cliente.id)
        .order('created_at', { ascending: false });
      setCotizaciones(data || []);
      setSelectedCliente(cliente);
    } catch (error) {
      console.error("Error al cargar cotizaciones:", error);
    } finally {
      setLoading(false);
    }
  }

  const seleccionarCotizacionConDatos = async (cot: any) => {
    setLoading(true);
    setPersonal([]);
    setGastosAdicionales(0);
    setCalculoBencina({ distanciaDiaria: 0, dias: 0, rendimiento: 10, precioLitro: 1300 });
    setCalculoColacion({ montoPorPersona: 0, dias: 0 });
    setIsEditing(false);

    try {
      const { data, error } = await supabase
        .from('analisis_rentabilidad')
        .select('*')
        .eq('cotizacion_id', cot.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setPersonal(data.detalle_personal || []);
        if (data.metadata_gastos) {
            setCalculoBencina(data.metadata_gastos.bencina);
            setCalculoColacion(data.metadata_gastos.colacion);
            setGastosAdicionales(data.metadata_gastos.otros || 0);
        } else {
            setGastosAdicionales(data.gastos_extra || 0);
        }
        setIsEditing(true);
      }
      setSelectedCotizacion(cot);
    } catch (error) {
      console.error("Error al buscar análisis previo:", error);
      alert("Error al recuperar datos del servidor.");
    } finally {
      setLoading(false);
    }
  };

  // --- CÁLCULOS BI (MÉTRICAS ACTUALIZADAS) ---
  const metricas = useMemo(() => {
    if (!selectedCotizacion) return null;
    const items = selectedCotizacion.items || [];
    
    const totalBencina = (calculoBencina.distanciaDiaria * calculoBencina.dias / Math.max(calculoBencina.rendimiento, 1)) * calculoBencina.precioLitro;
    const totalColacion = calculoColacion.montoPorPersona * calculoColacion.dias * personal.length;
    const gastosOperativosTotales = totalBencina + totalColacion + gastosAdicionales;

    const factorCostoEmpresa = 1.25;
    const costoMOReal = personal.reduce((acc, curr) => acc + (curr.hh * (curr.costo_hh * factorCostoEmpresa)), 0);
    const totalHhReales = personal.reduce((acc, curr) => acc + curr.hh, 0);
    
    const materialesPresupuestados = items
      .filter((i: any) => i.esMaterial)
      .reduce((acc: number, curr: any) => acc + (Number(curr.precio) * Number(curr.cantidad)), 0);
    
    const moPresupuestada = items
      .filter((i: any) => !i.esMaterial)
      .reduce((acc: number, curr: any) => acc + (Number(curr.precio) * Number(curr.cantidad)), 0);

    const subtotalNetoSII = Number(selectedCotizacion.subtotal);
    const ivaRetenido = subtotalNetoSII * 0.19;

    const costosDirectos = materialesPresupuestados + costoMOReal + gastosOperativosTotales;
    const reservaImprevistos = costosDirectos * factorRiesgo;
    const costoTotalReal = costosDirectos + reservaImprevistos;

    const utilidadNeta = subtotalNetoSII - costoTotalReal;

    // --- NUEVO CÁLCULO DE MARGEN ---
    // El margen se calcula sobre (Venta Neta - Costo Materiales) para ver rentabilidad de ejecución
    const baseCalculoMargen = subtotalNetoSII - materialesPresupuestados;
    const margenReal = baseCalculoMargen > 0 ? (utilidadNeta / baseCalculoMargen) * 100 : 0;
    
    const desviacionMO = moPresupuestada - (costoMOReal / factorCostoEmpresa);

    return {
      materialesPresupuestados, 
      moPresupuestada, 
      subtotalNetoSII,
      ivaRetenido,
      costoMOReal, 
      costoTotalReal, 
      utilidadNeta, 
      margenReal, 
      desviacionMO, 
      reservaImprevistos,
      items, 
      totalHhReales,
      totalBencina,
      totalColacion,
      gastosOperativosTotales,
      baseCalculoMargen
    };
  }, [selectedCotizacion, personal, gastosAdicionales, calculoBencina, calculoColacion, factorRiesgo]);

  const guardarAnalisis = async () => {
    if (!selectedCotizacion || personal.length === 0) {
      alert("Debes asignar al menos un técnico para guardar el análisis.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        cotizacion_id: selectedCotizacion.id,
        folio: selectedCotizacion.folio,
        folio_cotizacion: selectedCotizacion.folio,
        cliente_id: selectedCliente.id,
        costo_mo_real: metricas?.costoMOReal,
        costo_total_real: metricas?.costoTotalReal,
        utilidad_neta: metricas?.utilidadNeta,
        margen_real: metricas?.margenReal,
        detalle_personal: personal,
        gastos_extra: metricas?.gastosOperativosTotales,
        metadata_gastos: {
            bencina: calculoBencina,
            colacion: calculoColacion,
            otros: gastosAdicionales
        },
        fecha_auditoria: new Date().toISOString()
      };

      const { error } = await supabase
        .from('analisis_rentabilidad')
        .upsert(payload, { onConflict: 'cotizacion_id' });

      if (error) throw error;
      
      alert("✅ Análisis sincronizado correctamente.");
      setIsEditing(true);
    } catch (error: any) {
      alert("Error al guardar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (selectedCotizacion && metricas) {
    return (
      <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500">
        
        <header className="bg-slate-900 border border-slate-800 p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] shadow-2xl flex flex-col lg:flex-row justify-between items-center gap-6">
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 w-full lg:w-auto text-center md:text-left">
            <button onClick={() => { setSelectedCotizacion(null); setPersonal([]); }} 
                    className="p-3 md:p-4 bg-slate-800 text-[#ffc600] rounded-2xl hover:scale-105 transition-all border border-slate-700">
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                <span className="bg-[#ffc600] text-black text-[9px] font-black px-2 py-0.5 rounded">FOLIO #{selectedCotizacion.folio}</span>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded ${isEditing ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                  {isEditing ? 'MODO EDICIÓN' : 'REGISTRO NUEVO'}
                </span>
              </div>
              <h2 className="text-lg md:text-2xl font-black text-white italic uppercase tracking-tighter">
                Rentabilidad: <span className="text-[#ffc600]">{selectedCliente.nombre_cliente}</span>
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 w-full lg:w-auto">
            <div className="text-center md:text-right px-4 border-r border-slate-800">
              <p className="text-[9px] font-black text-slate-500 uppercase">Costo Materiales</p>
              <p className="font-black text-rose-400 uppercase text-xs">{formatCLP(metricas.materialesPresupuestados)}</p>
            </div>
            <button 
              onClick={guardarAnalisis}
              disabled={saving}
              className="w-full sm:w-auto bg-[#ffc600] hover:bg-white text-black px-6 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-xs flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 shadow-lg"
            >
              {saving ? <div className="w-4 h-4 border-2 border-black border-t-transparent animate-spin rounded-full"></div> : <Save size={18}/>}
              {saving ? 'PROCESANDO...' : 'GUARDAR CAMBIOS'}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
          <div className="lg:col-span-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] p-5 md:p-8 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-slate-900 font-black text-base md:text-lg uppercase italic leading-none">Ingreso de Personal</h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter mt-1">Calcula HH x Día laborado</p>
                  </div>
                  <button onClick={agregarPersonal} className="p-2 md:p-3 bg-slate-900 text-[#ffc600] rounded-xl hover:rotate-90 transition-all">
                    <Plus size={18}/>
                  </button>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                  {personal.map((p, idx) => (
                    <div key={idx} className="flex flex-col gap-3 bg-slate-50 p-4 rounded-xl md:rounded-2xl border border-transparent hover:border-[#ffc600] transition-all">
                      <div className="flex justify-between items-center">
                        <label className="text-[8px] font-black text-slate-400 uppercase">Cargo / Nombre</label>
                        <button onClick={() => eliminarPersonal(idx)} className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={14}/></button>
                      </div>
                      <input value={p.rol} onChange={(e) => updatePersonal(idx, 'rol', e.target.value)} placeholder="Ej: Maestro Liniero" className="text-slate-900 w-full bg-transparent font-black text-xs uppercase outline-none border-b border-slate-200 pb-1 focus:border-[#ffc600]"/>
                      
                      <div className="grid grid-cols-2 gap-3 mt-1">
                        <div>
                          <label className="text-[8px] font-black text-slate-400 uppercase">Pago x Día ($)</label>
                          <input type="number" value={p.pago_dia || ''} onChange={(e) => updatePersonal(idx, 'pago_dia', e.target.value)} className="text-slate-900 w-full bg-white rounded-lg p-2 font-black text-xs border border-slate-200" placeholder="0"/>
                        </div>
                        <div>
                          <label className="text-[8px] font-black text-slate-400 uppercase">Días Trabajados</label>
                          <input type="number" value={p.dias_trabajados || ''} onChange={(e) => updatePersonal(idx, 'dias_trabajados', e.target.value)} className="text-slate-900 w-full bg-white rounded-lg p-2 font-black text-xs border border-slate-200" placeholder="0"/>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-slate-200/50">
                        <div className="text-[8px] font-bold text-slate-400 uppercase">Desglose: <span className="text-slate-600">{p.hh} HH Totales</span></div>
                        <div className="text-[8px] font-bold text-slate-400 uppercase">Valor HH: <span className="text-emerald-600">{formatCLP(p.costo_hh)}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-900 rounded-[1.5rem] md:rounded-[2.5rem] p-6 md:p-8 text-white relative overflow-hidden">
                  <ShieldAlert size={80} className="absolute -right-5 -bottom-5 opacity-10" />
                  <h3 className="font-black uppercase italic mb-4">Gestión de Imprevistos</h3>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {[0, 0.05, 0.10, 0.15].map(v => (
                      <button key={v} onClick={() => setFactorRiesgo(v)} className={`py-2 rounded-xl text-[10px] font-black transition-all ${factorRiesgo === v ? 'bg-[#ffc600] text-black' : 'bg-white/10'}`}>
                        {v*100}%
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-400 uppercase font-bold">Reserva: {formatCLP(metricas.reservaImprevistos)}</p>
                </div>

                <div className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] p-5 md:p-8 border border-slate-100 shadow-sm">
                  <h3 className="text-slate-900 font-black text-base md:text-lg uppercase italic mb-6">Gastos Operativos</h3>
                  <div className="space-y-4">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                      <div className="flex items-center gap-2 text-slate-800">
                        <Fuel size={16} className="text-[#ffc600]"/>
                        <span className="text-[10px] font-black uppercase">Cálculo Combustible</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <label className="text-[7px] font-black text-slate-400 uppercase ml-1">KM/Día</label>
                            <input type="number" value={calculoBencina.distanciaDiaria || ''} onChange={(e) => setCalculoBencina({...calculoBencina, distanciaDiaria: Number(e.target.value)})} className="w-full p-2 bg-white rounded-lg border border-slate-200 text-[10px] font-bold outline-none text-slate-900"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[7px] font-black text-slate-400 uppercase ml-1">Días Viaje</label>
                            <input type="number" value={calculoBencina.dias || ''} onChange={(e) => setCalculoBencina({...calculoBencina, dias: Number(e.target.value)})} className="w-full p-2 bg-white rounded-lg border border-slate-200 text-[10px] font-bold outline-none text-slate-900"/>
                        </div>
                        <div className="col-span-2 flex items-center justify-end px-2 text-emerald-600 font-black text-[10px] pt-2">
                          {formatCLP(metricas.totalBencina)}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                      <div className="flex items-center gap-2 text-slate-800">
                        <Utensils size={16} className="text-[#ffc600]"/>
                        <span className="text-[10px] font-black uppercase">Cálculo Colación</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <label className="text-[7px] font-black text-slate-400 uppercase ml-1">$ p/p</label>
                            <input type="number" value={calculoColacion.montoPorPersona || ''} onChange={(e) => setCalculoColacion({...calculoColacion, montoPorPersona: Number(e.target.value)})} className="text-slate-900 w-full p-2 bg-white rounded-lg border border-slate-200 text-[10px] font-bold outline-none"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[7px] font-black text-slate-400 uppercase ml-1">Días</label>
                            <input type="number" value={calculoColacion.dias || ''} onChange={(e) => setCalculoColacion({...calculoColacion, dias: Number(e.target.value)})} className="text-slate-900 w-full p-2 bg-white rounded-lg border border-slate-200 text-[10px] font-bold outline-none"/>
                        </div>
                      </div>
                    </div>

                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-slate-100 rounded-lg text-slate-400 group-focus-within:bg-[#ffc600] group-focus-within:text-black transition-all">
                        <Briefcase size={18}/>
                      </div>
                      <input 
                        type="number" 
                        placeholder="OTROS VIÁTICOS / GASTOS..." 
                        value={gastosAdicionales || ''}
                        onChange={(e) => setGastosAdicionales(Number(e.target.value))}
                        className="text-slate-900 w-full bg-slate-50 rounded-2xl py-4 pl-14 pr-4 font-black text-sm outline-none border-2 border-transparent focus:border-[#ffc600] transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* --- TABLA DE TRANSPARENCIA --- */}
            <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 mb-6">
                    <Wallet className="text-[#ffc600]" size={24} />
                    <h3 className="text-slate-900 font-black text-lg uppercase italic leading-none">Resumen de Pagos y Transparencia</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-100">
                                <th className="pb-4 text-[10px] font-black text-slate-400 uppercase">Item / Técnico</th>
                                <th className="pb-4 text-[10px] font-black text-slate-400 uppercase text-center">Cálculo</th>
                                <th className="pb-4 text-[10px] font-black text-slate-400 uppercase text-right">Total a Pagar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {personal.map((p, i) => (
                                <tr key={i} className="group">
                                    <td className="py-4">
                                        <p className="text-xs font-black text-slate-800 uppercase italic">{p.rol || 'Sin Nombre'}</p>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase">Mano de Obra Directa</p>
                                    </td>
                                    <td className="py-4 text-center text-[10px] font-bold text-slate-500">
                                        {p.dias_trabajados} días x {formatCLP(p.pago_dia || 0)}
                                    </td>
                                    <td className="py-4 text-right text-xs font-black text-emerald-600">
                                        {formatCLP((p.pago_dia || 0) * (p.dias_trabajados || 0))}
                                    </td>
                                </tr>
                            ))}
                            <tr>
                                <td className="py-4">
                                    <p className="text-xs font-black text-slate-800 uppercase italic">Combustible</p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">Logística</p>
                                </td>
                                <td className="py-4 text-center text-[10px] font-bold text-slate-500">
                                    {calculoBencina.dias} días operando
                                </td>
                                <td className="py-4 text-right text-xs font-black text-slate-800">
                                    {formatCLP(metricas.totalBencina)}
                                </td>
                            </tr>
                            <tr>
                                <td className="py-4">
                                    <p className="text-xs font-black text-slate-800 uppercase italic">Colaciones</p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">Alimentación</p>
                                </td>
                                <td className="py-4 text-center text-[10px] font-bold text-slate-500">
                                    {personal.length} pers. x {calculoColacion.dias} días
                                </td>
                                <td className="py-4 text-right text-xs font-black text-slate-800">
                                    {formatCLP(metricas.totalColacion)}
                                </td>
                            </tr>
                            {gastosAdicionales > 0 && (
                                <tr>
                                    <td className="py-4">
                                        <p className="text-xs font-black text-slate-800 uppercase italic">Otros Gastos</p>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase">Insumos/Viáticos</p>
                                    </td>
                                    <td className="py-4 text-center text-[10px] font-bold text-slate-500">-</td>
                                    <td className="py-4 text-right text-xs font-black text-slate-800">
                                        {formatCLP(gastosAdicionales)}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-900 text-white">
                                <td colSpan={2} className="p-4 rounded-l-2xl text-[10px] font-black uppercase italic">Costo Operativo Directo (Sin Materiales)</td>
                                <td className="p-4 rounded-r-2xl text-right text-sm font-black text-[#ffc600]">
                                    {formatCLP((metricas.costoMOReal / 1.25) + metricas.gastosOperativosTotales)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
          </div>
          
          <div className="lg:col-span-4 space-y-6">
            <div className={`rounded-[2rem] md:rounded-[3.5rem] p-6 md:p-10 shadow-2xl transition-all duration-700 relative overflow-hidden ${metricas.utilidadNeta > 0 ? 'bg-slate-900' : 'bg-rose-950'}`}>
              <div className="relative z-10 text-center space-y-6 md:space-y-8">
                <div>
                  <p className="text-[10px] md:text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Utilidad Neta Final</p>
                  <h4 className={`text-4xl md:text-5xl font-black italic tracking-tighter ${metricas.utilidadNeta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatCLP(metricas.utilidadNeta)}
                  </h4>
                </div>
                <div className="space-y-4">
                  <div className="bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/10 text-center">
                    <p className="text-[10px] font-black text-[#ffc600] uppercase mb-1 italic">Margen sobre Ejecución</p>
                    <p className="text-3xl md:text-4xl font-black text-white">{metricas.margenReal.toFixed(1)}%</p>
                    <p className="text-[8px] text-slate-400 uppercase mt-2">* Calculado sobre Venta Neta - Costo Materiales</p>
                  </div>
                  <div className="bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10 flex justify-between items-center px-6">
                    <p className="text-[9px] font-black text-slate-400 uppercase">Costo Total Real</p>
                    <p className="text-xs font-black text-white">{formatCLP(metricas.costoTotalReal)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] border border-slate-100 shadow-xl space-y-6">
              <div className="flex items-center gap-4">
                <div className={`p-3 md:p-4 rounded-xl md:rounded-2xl ${metricas.desviacionMO >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  {metricas.desviacionMO >= 0 ? <CheckCircle2 size={24}/> : <AlertTriangle size={24}/>}
                </div>
                <div>
                  <p className="text-xs font-black text-slate-900 uppercase italic">Eficiencia MO</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Análisis</p>
                </div>
              </div>
              <p className="text-[11px] md:text-xs font-bold text-slate-600 leading-relaxed uppercase">
                {metricas.desviacionMO >= 0 
                  ? `Eficiencia: Ahorro de ${formatCLP(metricas.desviacionMO)} en MO.`
                  : `Alerta: Sobrecosto de ${formatCLP(Math.abs(metricas.desviacionMO))} en MO.`}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- RESTO DEL COMPONENTE (SELECCION CLIENTE/BUSCADOR) SE MANTIENE IGUAL ---
  const filteredClientes = clientes.filter(c => 
    c.nombre_cliente.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.rut?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (selectedCliente) {
    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 md:space-y-8 animate-in slide-in-from-bottom duration-700">
        <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 text-center md:text-left">
          <button onClick={() => setSelectedCliente(null)} className="p-4 bg-white rounded-2xl shadow-lg hover:bg-slate-900 hover:text-white transition-all border border-slate-100 group">
            <ArrowLeft size={24}/>
          </button>
          <div>
            <p className="text-[10px] font-black text-[#ffc600] uppercase tracking-[0.3em]">Seleccionar Proyecto</p>
            <h2 className="text-3xl md:text-5xl font-black text-slate-900 uppercase italic tracking-tighter line-clamp-2">{selectedCliente.nombre_cliente}</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {cotizaciones.length === 0 ? (
            <div className="col-span-full py-16 bg-slate-50 rounded-[2rem] text-center border-2 border-dashed border-slate-200">
              <Receipt size={40} className="mx-auto text-slate-300 mb-4"/>
              <p className="text-xs text-slate-400 font-black uppercase px-4">No hay cotizaciones registradas</p>
            </div>
          ) : cotizaciones.map((cot) => (
            <button key={cot.id} onClick={() => seleccionarCotizacionConDatos(cot)} 
                    className="group p-6 md:p-8 bg-white border border-slate-100 rounded-[2rem] md:rounded-[3.5rem] hover:border-[#ffc600] transition-all flex flex-col sm:flex-row justify-between items-center shadow-sm hover:shadow-xl text-center sm:text-left relative overflow-hidden gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6 relative z-10">
                <div className="p-4 bg-slate-900 text-[#ffc600] rounded-2xl group-hover:scale-110 transition-transform"><Receipt size={24}/></div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Proyecto</p>
                  <p className="text-xl md:text-2xl font-black text-slate-800 italic">#{cot.folio}</p>
                </div>
              </div>
              <div className="text-center sm:text-right relative z-10">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Venta Neta</p>
                <p className="text-lg md:text-xl font-black text-emerald-600">{formatCLP(cot.subtotal)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-7xl mx-auto space-y-8 md:space-y-12 animate-in fade-in duration-1000">
      <div className="flex flex-col lg:flex-row justify-between items-center lg:items-end gap-8">
        <div className="space-y-3 md:space-y-4 text-center lg:text-left">
          <div className="flex items-center justify-center lg:justify-start gap-3 text-[#ffc600]">
            <div className="w-10 h-[2px] bg-[#ffc600]"></div>
            <span className="text-[10px] md:text-[12px] font-black uppercase tracking-[0.4em]">Audit & BI Control</span>
          </div>
          <h2 className="text-4xl md:text-6xl lg:text-7xl font-black text-slate-900 uppercase italic tracking-tighter leading-[0.9]">
            Gestión de <br /> <span className="text-[#ffc600]">Rentabilidad</span>
          </h2>
        </div>
        <div className="relative w-full lg:w-[450px] group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#ffc600] transition-all" size={24} />
          <input 
            placeholder="BUSCAR CLIENTE O RUT..." 
            className="text-slate-900 w-full bg-white border-2 border-slate-100 rounded-[2rem] py-6 md:py-8 pl-16 pr-6 text-[10px] md:text-xs font-black uppercase outline-none focus:border-[#ffc600] shadow-xl transition-all"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="h-64 md:h-80 bg-slate-50 animate-pulse rounded-[3rem]" />)
        ) : filteredClientes.map((c) => (
          <button key={c.id} onClick={() => fetchCotizacionesCliente(c)} 
                  className="group bg-white border border-slate-100 p-8 md:p-12 rounded-[2.5rem] md:rounded-[4rem] hover:border-[#ffc600] hover:shadow-2xl transition-all text-left relative overflow-hidden h-72 md:h-80 flex flex-col justify-between">
            <div className="relative z-10">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-50 rounded-[1.5rem] md:rounded-[2rem] flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-[#ffc600] transition-all mb-6 shadow-inner border border-slate-100">
                <Users size={28} />
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-slate-800 uppercase italic leading-tight group-hover:text-slate-900 transition-colors line-clamp-2">
                {c.nombre_cliente}
              </h3>
              <p className="text-[10px] md:text-[11px] font-bold text-slate-300 mt-2 tracking-[0.1em] group-hover:text-slate-500">{c.rut}</p>
            </div>
            <div className="flex items-center gap-2 text-[9px] md:text-[10px] font-black uppercase text-[#ffc600] opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all">
              Ver proyectos <ChevronRight size={14}/>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}