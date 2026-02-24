'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { 
  ArrowLeft, Search, Calendar, Download, 
  Trash2, Loader2, Hash, FileText, Edit3, FileBox, X, User, ShieldCheck,
  ChevronRight, Calculator, History, Package, ExternalLink
} from 'lucide-react';

import { PresupuestoPDF } from '@/components/PresupuestoPDF';
import { ListadoInternoPDF } from '@/components/ListadoInternoPDF';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';

const formatFolio = (num: number | null) => {
  if (!num) return "IV-0000";
  return `IV-${num.toString().padStart(4, '0')}`;
};

const formatCLP = (valor: number) => {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0
  }).format(valor);
};

export default function HistorialPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCotizacion, setSelectedCotizacion] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const datosInnVolt = {
    nombre: "InnVolt SpA",
    nombre_cliente: "InnVolt SpA",
    rut: "78.299.986-9", 
    direccion: "Santiago, Chile",
    giro: "Servicios Eléctricos"
  };

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const { data: res, error } = await supabase
      .from('cotizaciones')
      .select('*, clientes(*)')
      .order('folio', { ascending: false });

    if (!error && res) setData(res);
    setLoading(false);
  }

  // --- FUNCIÓN CRÍTICA: IGUALAR VISTA CLIENTE ---
  const getItemsVistaCliente = (itemsArray: any[]) => {
    const materiales = itemsArray.filter(i => i.esMaterial);
    const otrosItems = itemsArray.filter(i => !i.esMaterial);
    if (materiales.length === 0) return itemsArray;

    const totalSoloMateriales = materiales.reduce((acc, curr) => acc + (curr.precio * curr.cantidad), 0);
    return [
      ...otrosItems,
      {
        descripcion: "SUMINISTROS Y MATERIALES ELÉCTRICOS SEGÚN PROYECTO",
        cantidad: 1,
        precio: totalSoloMateriales,
        esMaterial: true
      }
    ];
  };

  const descargarPDF = async (tipo: 'cliente' | 'interno') => {
    if (!selectedCotizacion || isGenerating) return;
    setIsGenerating(true);
    
    try {
      const folioFormateado = formatFolio(selectedCotizacion.folio);
      const clienteNombre = selectedCotizacion.clientes?.nombre_cliente || 'Cliente';

      if (tipo === 'cliente') {
        const doc = (
          <PresupuestoPDF 
            cliente={selectedCotizacion.clientes} 
            items={getItemsVistaCliente(selectedCotizacion.items || [])} 
            subtotal={selectedCotizacion.subtotal} 
            iva={selectedCotizacion.iva} 
            total={selectedCotizacion.total} 
            folio={folioFormateado}
            descripcionGeneral={selectedCotizacion.descripcion_general}
            garantia={selectedCotizacion.condiciones_servicio}
            condicionesComerciales={selectedCotizacion.condiciones_comerciales}
          />
        );
        const blob = await pdf(doc).toBlob();
        saveAs(blob, `Cotizacion_${folioFormateado}_${clienteNombre}.pdf`);
      } else {
        const soloMateriales = (selectedCotizacion.items || []).filter((i: any) => i.esMaterial);
        const subtotalM = soloMateriales.reduce((acc: number, curr: any) => acc + (curr.precio * curr.cantidad), 0);
        
        const doc = (
          <ListadoInternoPDF
            cliente={datosInnVolt} 
            items={soloMateriales} 
            subtotal={subtotalM} 
            iva={Math.round(subtotalM * 0.19)} 
            total={subtotalM + Math.round(subtotalM * 0.19)} 
            folio={folioFormateado} 
            descripcionGeneral="LISTADO INTERNO DE MATERIALES (DETALLE TÉCNICO)" 
          />
        );
        const blob = await pdf(doc).toBlob();
        saveAs(blob, `Interno_${folioFormateado}.pdf`);
      }
    } catch (error) {
      console.error("Error al generar PDF:", error);
    } finally {
      setIsGenerating(false);
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
            <Link href="/cotizador" className="bg-slate-900 p-2 md:p-3 rounded-xl shadow-lg hover:bg-black transition-all group">
              <ArrowLeft className="text-[#ffc600]" size={20} />
            </Link>
            <div>
              <h1 className="text-lg md:text-xl font-black text-slate-900 leading-tight flex items-center gap-2">
                HISTORIAL DE <span className="text-[#ffc600]">COTIZACIONES</span>
              </h1>
              <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">InnVolt SpA · Registro</p>
            </div>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              placeholder="BUSCAR CLIENTE O FOLIO..." 
              className="w-full bg-slate-100 pl-11 pr-4 py-2.5 rounded-2xl text-[11px] font-black uppercase outline-none border-2 border-transparent focus:border-[#ffc600] focus:bg-white transition-all"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-24 text-center flex flex-col items-center gap-4">
              <Loader2 className="animate-spin text-[#ffc600]" size={40} />
              <p className="font-black text-slate-400 uppercase text-[10px]">Sincronizando...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse hidden md:table">
                <thead>
                  <tr className="bg-slate-50/50 text-[10px] font-black uppercase text-slate-400 border-b border-slate-100">
                    <th className="p-6">Folio / Fecha</th>
                    <th className="p-6">Cliente</th>
                    <th className="p-6 text-right">Monto Total</th>
                    <th className="p-6 text-center">Gestión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(c => (
                    <tr key={c.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="p-6">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-slate-900 rounded-xl"><Hash size={14} className="text-[#ffc600]" /></div>
                          <div>
                            <p className="text-sm font-black text-slate-800">{formatFolio(c.folio)}</p>
                            <p className="text-[10px] font-bold text-slate-400">{new Date(c.created_at).toLocaleDateString('es-CL')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-6">
                        <p className="text-xs font-black uppercase italic text-slate-800 truncate max-w-[250px]">{c.clientes?.nombre_cliente}</p>
                        <p className="text-[9px] font-bold text-slate-400">RUT: {c.clientes?.rut}</p>
                      </td>
                      <td className="p-6 text-right font-black text-slate-900">
                        <span className="bg-slate-100 px-3 py-1.5 rounded-lg text-sm italic">{formatCLP(c.total)}</span>
                      </td>
                      <td className="p-6 text-center">
                        <div className="flex justify-center gap-2">
                          <Link href={`/cotizador?edit=${c.id}`} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Edit3 size={18}/></Link>
                          <button onClick={() => setSelectedCotizacion(c)} className="p-2.5 bg-green-50 text-green-600 rounded-xl hover:bg-green-600 hover:text-white transition-all"><Download size={18}/></button>
                          <button onClick={() => handleEliminar(c.id, c.folio)} className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 size={18}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-slate-50">
                {filtered.map(c => (
                  <div key={c.id} className="p-6 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-black text-slate-800">{formatFolio(c.folio)}</span>
                      <span className="text-[10px] font-bold text-slate-400">{new Date(c.created_at).toLocaleDateString('es-CL')}</span>
                    </div>
                    <p className="text-xs font-black uppercase italic text-slate-800">{c.clientes?.nombre_cliente}</p>
                    <p className="text-lg font-black text-[#ffc600]">{formatCLP(c.total)}</p>
                    <div className="flex gap-2">
                      <Link href={`/cotizador?edit=${c.id}`} className="flex-1 flex justify-center py-3 bg-slate-50 text-slate-600 rounded-2xl border border-slate-200"><Edit3 size={18}/></Link>
                      <button onClick={() => setSelectedCotizacion(c)} className="flex-1 flex justify-center py-3 bg-green-50 text-green-600 rounded-2xl border border-green-100"><Download size={18}/></button>
                      <button onClick={() => handleEliminar(c.id, c.folio)} className="flex-1 flex justify-center py-3 bg-red-50 text-red-400 rounded-2xl border border-red-100"><Trash2 size={18}/></button>
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
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelectedCotizacion(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-[3rem] sm:rounded-[3rem] overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="relative p-8 text-center bg-slate-50/80 border-b border-slate-100">
              <button onClick={() => setSelectedCotizacion(null)} className="absolute top-4 right-4 p-2 text-slate-400"><X size={20}/></button>
              <div className="w-16 h-16 bg-[#ffc600] text-slate-900 rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 shadow-lg rotate-6"><Download size={32} /></div>
              <h3 className="font-black text-xl uppercase italic text-slate-900">Generar <span className="text-[#ffc600]">Documentos</span></h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Folio: {formatFolio(selectedCotizacion.folio)}</p>
            </div>
            <div className="p-8 space-y-4">
              <button onClick={() => descargarPDF('cliente')} disabled={isGenerating} className="w-full flex items-center gap-4 p-5 bg-slate-900 text-white rounded-[2rem] active:scale-95 transition-all shadow-xl group">
                <div className="bg-[#ffc600] p-3 rounded-2xl text-slate-900"><User size={24} /></div>
                <div className="text-left flex-1">
                  <p className="text-[10px] font-black uppercase text-[#ffc600] leading-none mb-1">Copia Oficial</p>
                  <p className="text-sm font-black uppercase">PDF Cliente</p>
                </div>
                {isGenerating ? <Loader2 className="animate-spin" size={20}/> : <ChevronRight size={20} />}
              </button>
              <button onClick={() => descargarPDF('interno')} disabled={isGenerating || !selectedCotizacion.items.some((i: any) => i.esMaterial)} className="w-full flex items-center gap-4 p-5 bg-white border-2 border-slate-100 text-slate-900 rounded-[2rem] active:scale-95 transition-all group">
                <div className="bg-slate-100 p-3 rounded-2xl text-slate-600"><Package size={24} /></div>
                <div className="text-left flex-1">
                  <p className="text-[10px] font-black uppercase text-slate-400 leading-none mb-1">Uso Técnico</p>
                  <p className="text-sm font-black uppercase">Listado Interno</p>
                </div>
                {isGenerating ? <Loader2 className="animate-spin" size={20}/> : <ChevronRight size={20} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}