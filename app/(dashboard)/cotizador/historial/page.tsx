/* eslint-disable jsx-a11y/alt-text */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { 
  ArrowLeft, Search, Calendar, Download, 
  Trash2, Loader2, Hash, Edit3, User, 
  ChevronRight, Package, Copy
} from 'lucide-react';

// --- IMPORTACIONES PARA PDF ---
import { PresupuestoPDF } from '@/components/PresupuestoPDF';
import { ListadoInternoPDF } from '@/components/ListadoInternoPDF';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';

// --- UTILIDADES ---
const formatFolio = (num: number | null) => {
  if (!num) return "IV-0000";
  return `IV-${num.toString().padStart(4, '0')}`;
};

const formatCLP = (valor: number) => {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0
  }).format(valor || 0);
};

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

export default function HistorialPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCotizacion, setSelectedCotizacion] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const datosInnVolt = {
    nombre: "InnVolt SpA",
    rut: "78.299.986-9", 
    direccion: "Santiago, Chile",
    giro: "Servicios Eléctricos"
  };

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data: res, error } = await supabase
      .from('cotizaciones')
      .select('*, clientes(*)')
      .order('folio', { ascending: false });

    if (!error && res) setData(res);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('historial_realtime')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'cotizaciones' }, 
        () => fetchData(true)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const updateEstado = async (id: string, nuevoEstado: string) => {
    try {
      const { error } = await supabase
        .from('cotizaciones')
        .update({ estado: nuevoEstado }) 
        .eq('id', id);
      
      if (error) throw error;
      
      setData(prev => prev.map(c => c.id === id ? { ...c, estado: nuevoEstado } : c));
    } catch (e: any) {
      console.error("Error al actualizar:", e.message);
    }
  };

  // --- LÓGICA DE ITEMS PARA CLIENTE ---
  const prepareItemsForClientPDF = (itemsArray: any[]) => {
    if (!itemsArray) return [];
    
    // Separar materiales y mano de obra
    const materiales = itemsArray.filter(i => i.esMaterial);
    const manoDeObra = itemsArray.filter(i => !i.esMaterial);
    
    if (materiales.length === 0) return itemsArray;
    
    // Calcular total de materiales bruto para agrupar
    const totalSoloMateriales = materiales.reduce((acc, curr) => {
      return acc + (Number(curr.precio) * Number(curr.cantidad));
    }, 0);
    
    return [
      ...manoDeObra,
      {
        descripcion: "SUMINISTROS Y MATERIALES ELÉCTRICOS SEGÚN PROYECTO",
        cantidad: 1,
        precio: totalSoloMateriales,
        esMaterial: true,
        iva_incluido: true
      }
    ];
  };

  // --- FUNCIÓN DE DESCARGA PDF CORREGIDA ---
  const descargarPDF = async (tipo: 'cliente' | 'interno') => {
    if (!selectedCotizacion || isGenerating) return;
    setIsGenerating(true);
    
    try {
      const c = selectedCotizacion;
      const folioFormateado = formatFolio(c.folio);
      const clienteNombre = c.clientes?.nombre_cliente || 'Cliente';

      // --- BLINDAJE DE DATOS ---
      const itemsEstructurados = (c.items || []).map((item: any) => ({
        ...item,
        precio: Number(item.precio) || 0,
        cantidad: Number(item.cantidad) || 0,
        iva_incluido: item.iva_incluido !== undefined ? item.iva_incluido : true 
      }));

      // --- CÁLCULO REUTILIZANDO LÓGICA COMPARTIDA ---
      // 1. Obtenemos el porcentaje desde la BD (ej: 10)
      const porcDesc = Number(c.descuento_global) || 0;
      
      // 2. Calculamos el subtotal real de la Mano de Obra (sin aplicar el descuento aún)
      // Esto asegura que si se guardó mal, al menos aquí se recalcula bien.
      const subtotalMO = itemsEstructurados
        .filter((item: any) => !item.esMaterial)
        .reduce((acc: number, curr: any) => acc + (curr.cantidad * curr.precio), 0);
      
      // 3. Calculamos el monto real del descuento
      const montoDesc = (subtotalMO * porcDesc) / 100;

      if (tipo === 'cliente') {
        const itemsAgrupados = prepareItemsForClientPDF(itemsEstructurados);

        const doc = (
          <PresupuestoPDF 
            cliente={c.clientes} 
            items={itemsAgrupados} 
            // Pasamos los totales finales que guardamos en la DB
            subtotal={Number(c.subtotal) || 0}
            iva={Number(c.iva) || 0}
            total={Number(c.total) || 0}
            folio={folioFormateado}
            descripcionGeneral={c.descripcion_general}
            garantia={c.condiciones_servicio}
            condicionesComerciales={c.condiciones_comerciales}
            
            // --- DATOS DE DESCUENTO ---
            descuentoPorcentajeMO={porcDesc}
            montoDescuentoMO={montoDesc}
          />
        );
        const blob = await pdf(doc).toBlob();
        saveAs(blob, `Cotizacion_${folioFormateado}_${clienteNombre}.pdf`);
      } else {
        // ... Lógica reporte interno igual
        const soloMateriales = itemsEstructurados.filter((i: any) => i.esMaterial);
        const doc = (
          <ListadoInternoPDF
            cliente={datosInnVolt} 
            items={soloMateriales} 
            subtotal={Number(c.subtotal) || 0}
            iva={Number(c.iva) || 0}
            total={Number(c.total) || 0}
            folio={folioFormateado} 
            descripcionGeneral={`Listado materiales: ${clienteNombre}`}
          />
        );
        const blob = await pdf(doc).toBlob();
        saveAs(blob, `Interno_${folioFormateado}.pdf`);
      }
    } catch (error) { 
      console.error("Error generando PDF:", error); 
    } finally { 
      setIsGenerating(false); 
      setSelectedCotizacion(null);
    }
  };

  const handleEliminar = async (id: string, folio: number) => {
    if (!confirm(`¿Eliminar permanentemente folio ${formatFolio(folio)}?`)) return;
    const { error } = await supabase.from('cotizaciones').delete().eq('id', id);
    if (!error) setData(data.filter(c => c.id !== id));
  };

  const filtered = data.filter(c => 
    c.clientes?.nombre_cliente?.toLowerCase().includes(search.toLowerCase()) ||
    formatFolio(c.folio).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-slate-900 pb-20 md:pb-10 font-sans">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-3 md:py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Link href="/dashboard" className="bg-slate-900 p-2 md:p-3 rounded-xl shadow-lg hover:rotate-[-5deg] transition-all">
              <ArrowLeft className="text-[#ffc600]" size={20} />
            </Link>
            <div>
              <h1 className="text-lg md:text-xl font-black text-slate-900 leading-tight uppercase">
                Historial <span className="text-[#ffc600]">InnVolt</span>
              </h1>
              <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase italic">Registro Maestro</p>
            </div>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              placeholder="BUSCAR CLIENTE O FOLIO..." 
              className="w-full bg-slate-100 pl-11 pr-4 py-3 rounded-2xl text-[11px] font-black uppercase outline-none border-2 border-transparent focus:border-[#ffc600] focus:bg-white transition-all shadow-inner"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden">
          {loading ? (
            <div className="p-24 text-center flex flex-col items-center gap-4">
              <Loader2 className="animate-spin text-[#ffc600]" size={40} />
              <p className="font-black text-slate-400 uppercase text-[10px] tracking-widest">Sincronizando registros...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse hidden md:table">
                <thead>
                  <tr className="bg-slate-900 text-[10px] font-black uppercase text-[#ffc600] tracking-widest">
                    <th className="p-6">Documento</th>
                    <th className="p-6">Cliente</th>
                    <th className="p-6">Estado</th>
                    <th className="p-6 text-right">Monto Total</th>
                    <th className="p-6 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(c => (
                    <tr key={c.id} className={`group hover:bg-slate-50 transition-colors ${c.estado === 'Rechazado' ? 'opacity-60' : ''}`}>
                      <td className="p-6">
                        <div className="flex items-center gap-3">
                          <div className="p-3 bg-slate-100 rounded-xl group-hover:bg-[#ffc600] group-hover:text-slate-900 transition-all">
                            <Hash size={16} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800 tracking-tighter">{formatFolio(c.folio)}</p>
                            <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Calendar size={10}/> {new Date(c.created_at).toLocaleDateString('es-CL')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-6">
                        <p className="text-xs font-black uppercase italic text-slate-800 truncate max-w-[200px]">{c.clientes?.nombre_cliente}</p>
                        <p className="text-[9px] font-bold text-slate-400">RUT: {c.clientes?.rut}</p>
                      </td>
                      <td className="p-6">
                        <select 
                          value={c.estado || 'Pendiente'} 
                          onChange={(e) => updateEstado(c.id, e.target.value)}
                          className={`text-[10px] font-black uppercase py-1.5 px-3 rounded-xl border-2 outline-none cursor-pointer transition-all ${getEstadoStyle(c.estado || 'Pendiente')}`}
                        >
                          <option value="Pendiente">Pendiente</option>
                          <option value="Aceptado">Aceptado</option>
                          <option value="Realizado">Realizado</option>
                          <option value="Rechazado">Rechazado</option>
                        </select>
                      </td>
                      <td className="p-6 text-right">
                        <p className="font-black text-slate-900 text-sm">{formatCLP(c.total)}</p>
                      </td>
                      <td className="p-6">
                        <div className="flex justify-center gap-1">
                          <Link href={`/cotizador?edit=${c.id}`} className="p-2.5 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl transition-all border border-blue-100">
                            <Edit3 size={16}/>
                          </Link>
                          <Link href={`/cotizador?clone=${c.id}`} className="p-2.5 text-amber-600 hover:bg-amber-600 hover:text-white rounded-xl transition-all border border-amber-100">
                            <Copy size={16}/>
                          </Link>
                          <button onClick={() => setSelectedCotizacion(c)} className="p-2.5 text-green-600 hover:bg-green-600 hover:text-white rounded-xl transition-all border border-green-100">
                            <Download size={16}/>
                          </button>
                          <button onClick={() => handleEliminar(c.id, c.folio)} className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* VISTA MÓVIL */}
              <div className="md:hidden divide-y divide-slate-100">
                {filtered.map(c => (
                  <div key={c.id} className={`p-6 space-y-4 ${c.estado === 'Rechazado' ? 'bg-slate-50 opacity-80' : ''}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-black text-slate-800">{formatFolio(c.folio)}</span>
                      <select 
                        value={c.estado || 'Pendiente'} 
                        onChange={(e) => updateEstado(c.id, e.target.value)}
                        className={`text-[9px] font-black uppercase py-1 px-3 rounded-xl border-2 outline-none ${getEstadoStyle(c.estado || 'Pendiente')}`}
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="Aceptado">Aceptado</option>
                        <option value="Realizado">Realizado</option>
                        <option value="Rechazado">Rechazado</option>
                      </select>
                    </div>
                    <p className="text-xs font-black uppercase text-slate-800">{c.clientes?.nombre_cliente}</p>
                    <div className="flex gap-2">
                      <Link href={`/cotizador?edit=${c.id}`} className="flex-1 flex justify-center py-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100"><Edit3 size={18}/></Link>
                      <Link href={`/cotizador?clone=${c.id}`} className="flex-1 flex justify-center py-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-100"><Copy size={18}/></Link>
                      <button onClick={() => setSelectedCotizacion(c)} className="flex-1 flex justify-center py-3 bg-green-50 text-green-600 rounded-xl border border-green-100"><Download size={18}/></button>
                      <button onClick={() => handleEliminar(c.id, c.folio)} className="flex-1 flex justify-center py-3 bg-red-50 text-red-500 rounded-xl"><Trash2 size={18}/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAL DE DESCARGA */}
      {selectedCotizacion && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelectedCotizacion(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-[3rem] sm:rounded-[3rem] overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="relative p-10 text-center bg-slate-50 border-b border-slate-100">
              <div className="w-20 h-20 bg-[#ffc600] text-slate-900 rounded-[2rem] flex items-center justify-center mx-auto mb-4 shadow-xl"><Download size={40} /></div>
              <h3 className="font-black text-2xl uppercase italic text-slate-900">Generar Documentos</h3>
              <p className="text-[10px] font-black text-slate-400 mt-2">{formatFolio(selectedCotizacion.folio)}</p>
            </div>
            <div className="p-8 space-y-3">
              <button onClick={() => descargarPDF('cliente')} disabled={isGenerating} className="w-full flex items-center gap-4 p-5 bg-slate-900 text-white rounded-2xl active:scale-95 transition-all">
                <div className="bg-[#ffc600] p-3 rounded-xl text-slate-900"><User size={20} /></div>
                <div className="text-left flex-1"><p className="text-[10px] font-black uppercase text-[#ffc600]">Oficial</p><p className="text-sm font-black uppercase">Presupuesto Cliente</p></div>
                {isGenerating ? <Loader2 className="animate-spin" size={18}/> : <ChevronRight size={18} />}
              </button>
              <button onClick={() => descargarPDF('interno')} disabled={isGenerating} className="w-full flex items-center gap-4 p-5 bg-white border-2 border-slate-100 text-slate-900 rounded-2xl active:scale-95 transition-all">
                <div className="bg-slate-100 p-3 rounded-xl text-slate-600"><Package size={20} /></div>
                <div className="text-left flex-1"><p className="text-[10px] font-black uppercase text-slate-400">Logística</p><p className="text-sm font-black uppercase">Listado de Materiales</p></div>
                {isGenerating ? <Loader2 className="animate-spin" size={18}/> : <ChevronRight size={18} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}