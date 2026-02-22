'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { 
  ArrowLeft, Search, Calendar, Download, 
  Trash2, Loader2, Hash, FileText, Edit3, FileBox, X, User, ShieldCheck
} from 'lucide-react';

// Componentes de PDF y utilerías de generación
import { PresupuestoPDF } from '@/components/PresupuestoPDF';
import { ListadoInternoPDF } from '@/components/ListadoInternoPDF';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';

// --- UTILIDADES DE FORMATO ---
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
  
  // ESTADOS PARA EL SELECTOR DE DESCARGA
  const [selectedCotizacion, setSelectedCotizacion] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const datosInnVolt = {
    nombre_cliente: "InnVolt SpA",
    rut: "78.299.986-9", 
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

  // --- LÓGICA DE GENERACIÓN INDIVIDUAL ---
  const descargarPDF = async (tipo: 'cliente' | 'interno') => {
    if (!selectedCotizacion || isGenerating) return;
    setIsGenerating(true);
    
    try {
      const folioFormateado = formatFolio(selectedCotizacion.folio);
      const clienteNombre = selectedCotizacion.clientes?.nombre_cliente || 'Cliente';

      if (tipo === 'cliente') {
        const materiales = selectedCotizacion.items.filter((i: any) => i.esMaterial);
        const otrosItems = selectedCotizacion.items.filter((i: any) => !i.esMaterial);
        const totalM = materiales.reduce((acc: number, curr: any) => acc + (curr.precio * curr.cantidad), 0);
        
        const itemsVista = [...otrosItems];
        if (totalM > 0) {
          itemsVista.push({
            descripcion: "SUMINISTROS Y MATERIALES ELÉCTRICOS SEGÚN PROYECTO",
            cantidad: 1,
            precio: totalM,
            esMaterial: true
          });
        }

        const doc = (
          <PresupuestoPDF 
            cliente={selectedCotizacion.clientes} 
            items={itemsVista} 
            subtotal={selectedCotizacion.subtotal} 
            iva={selectedCotizacion.iva} 
            total={selectedCotizacion.total} 
            folio={folioFormateado}
            descripcionGeneral={selectedCotizacion.descripcion_general}
          />
        );
        const blob = await pdf(doc).toBlob();
        saveAs(blob, `Cotizacion_${folioFormateado}_${clienteNombre}.pdf`);
      } else {
        const materiales = selectedCotizacion.items.filter((i: any) => i.esMaterial);
        const subM = materiales.reduce((acc: number, curr: any) => acc + (curr.precio * curr.cantidad), 0);
        
        const doc = (
          <ListadoInternoPDF
            cliente={datosInnVolt} 
            items={materiales} 
            subtotal={subM} 
            iva={Math.round(subM * 0.19)} 
            total={Math.round(subM * 1.19)} 
            folio={folioFormateado} 
            descripcionGeneral="LISTADO INTERNO DE MATERIALES (DETALLE TÉCNICO)" 
          />
        );
        const blob = await pdf(doc).toBlob();
        saveAs(blob, `Interno_${folioFormateado}.pdf`);
      }
    } catch (error) {
      alert("No se pudo generar el archivo.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEliminar = async (id: string, folio: number) => {
    const confirmar = confirm(`¿Estás seguro de eliminar permanentemente la cotización ${formatFolio(folio)}?`);
    if (!confirmar) return;

    const { error } = await supabase.from('cotizaciones').delete().eq('id', id);
    if (!error) setData(data.filter(c => c.id !== id));
  };

  const filtered = data.filter(c => 
    c.clientes?.nombre_cliente?.toLowerCase().includes(search.toLowerCase()) ||
    formatFolio(c.folio).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-2 md:p-8 max-w-7xl mx-auto space-y-4 md:space-y-6 bg-[#f8fafc] min-h-screen font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] shadow-sm border border-slate-100 gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <Link href="/cotizador" className="p-3 bg-slate-50 text-slate-600 rounded-2xl hover:bg-[#ffc600] transition-all group">
            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          </Link>
          <div>
            <h2 className="text-xl md:text-2xl font-black uppercase italic text-[#1e293b] leading-none">
              Historial <span className="text-[#ffc600]">InnVolt</span>
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Registro Central</p>
          </div>
        </div>

        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
          <input 
            placeholder="Buscar cliente o folio..." 
            className="text-slate-900 w-full bg-slate-50 pl-11 pr-4 py-3 rounded-2xl text-sm font-bold outline-none border-2 border-transparent focus:border-[#ffc600] transition-all shadow-inner"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* TABLA / CARDS */}
      <div className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm overflow-hidden border border-slate-100">
        {loading ? (
          <div className="p-20 text-center flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-[#ffc600]" size={40} />
            <p className="font-black text-slate-400 uppercase text-[10px] tracking-widest">Sincronizando...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-20 text-center flex flex-col items-center gap-4 text-slate-300">
            <FileBox size={64} strokeWidth={1} />
            <p className="font-bold uppercase text-[10px] tracking-widest">Sin registros</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Desktop Table (Restaurada columna FECHA) */}
            <table className="w-full text-left border-collapse hidden md:table">
              <thead>
                <tr className="bg-slate-50/50 text-[10px] font-black uppercase text-slate-400 border-b border-slate-50">
                  <th className="p-6">Folio</th>
                  <th className="p-6">Fecha</th>
                  <th className="p-6">Cliente</th>
                  <th className="p-6 text-right">Total</th>
                  <th className="p-6 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-6">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-slate-900 rounded-lg"><Hash size={12} className="text-[#ffc600]" /></div>
                        <span className="text-sm font-black text-slate-700">{formatFolio(c.folio)}</span>
                      </div>
                    </td>
                    <td className="p-6 text-[11px] font-bold text-slate-500 uppercase">
                      {new Date(c.created_at).toLocaleDateString('es-CL')}
                    </td>
                    <td className="p-6">
                      <p className="text-xs font-black uppercase italic text-slate-800 truncate max-w-[200px]">{c.clientes?.nombre_cliente}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">RUT: {c.clientes?.rut}</p>
                    </td>
                    <td className="p-6 text-right font-black text-slate-900">{formatCLP(c.total)}</td>
                    <td className="p-6">
                      <div className="flex justify-center gap-2">
                        <Link href={`/cotizador?edit=${c.id}`} className="p-2.5 text-slate-400 hover:text-blue-600 rounded-xl transition-all"><Edit3 size={18}/></Link>
                        <button onClick={() => setSelectedCotizacion(c)} className="p-2.5 bg-green-50 text-green-600 rounded-xl hover:bg-green-600 hover:text-white transition-all"><Download size={18}/></button>
                        <button onClick={() => handleEliminar(c.id, c.folio)} className="p-2.5 text-slate-300 hover:text-red-500 transition-all"><Trash2 size={18}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile Cards (Restaurados botones EDITAR y ELIMINAR) */}
            <div className="md:hidden divide-y divide-slate-50">
              {filtered.map(c => (
                <div key={c.id} className="p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-slate-900 rounded-md"><Hash size={10} className="text-[#ffc600]" /></div>
                      <span className="text-sm font-black text-slate-700">{formatFolio(c.folio)}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">{new Date(c.created_at).toLocaleDateString('es-CL')}</span>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase italic text-slate-800">{c.clientes?.nombre_cliente}</p>
                    <p className="text-sm font-black text-[#ffc600] mt-1">{formatCLP(c.total)}</p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Link href={`/cotizador?edit=${c.id}`} className="flex-1 flex justify-center py-2.5 bg-slate-50 text-slate-600 rounded-xl border border-slate-100"><Edit3 size={18}/></Link>
                    <button onClick={() => setSelectedCotizacion(c)} className="flex-1 flex justify-center py-2.5 bg-green-50 text-green-600 rounded-xl border border-green-100"><Download size={18}/></button>
                    <button onClick={() => handleEliminar(c.id, c.folio)} className="flex-1 flex justify-center py-2.5 bg-red-50 text-red-400 rounded-xl border border-red-100"><Trash2 size={18}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SELECTOR DE DESCARGA (Z-INDEX ALTO PARA MÓVIL) */}
      {selectedCotizacion && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[9999] flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setSelectedCotizacion(null)}>
          <div className="bg-white w-full md:max-w-sm rounded-t-[2.5rem] md:rounded-[2.5rem] overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-black text-sm uppercase italic text-slate-800">Generar Documentos</h3>
                <p className="text-[10px] font-bold text-[#ffc600] uppercase tracking-widest">{formatFolio(selectedCotizacion.folio)}</p>
              </div>
              <button onClick={() => setSelectedCotizacion(null)} className="p-2 bg-white rounded-full text-slate-400 shadow-sm hover:text-red-500"><X size={20}/></button>
            </div>
            
            <div className="p-6 space-y-4">
              <button onClick={() => descargarPDF('cliente')} disabled={isGenerating} className="w-full flex items-center gap-4 p-5 bg-blue-600 text-white rounded-3xl active:scale-95 transition-all">
                <div className="bg-white/20 p-2 rounded-xl"><User size={24} /></div>
                <div className="text-left flex-1">
                  <p className="text-[10px] font-black uppercase opacity-70 leading-none mb-1">Documento Oficial</p>
                  <p className="text-sm font-black uppercase">PDF Cliente</p>
                </div>
                {isGenerating ? <Loader2 className="animate-spin" size={20}/> : <Download size={20} />}
              </button>

              <button onClick={() => descargarPDF('interno')} disabled={isGenerating || !selectedCotizacion.items.some((i: any) => i.esMaterial)} className="w-full flex items-center gap-4 p-5 bg-slate-900 text-white rounded-3xl active:scale-95 transition-all disabled:opacity-40">
                <div className="bg-[#ffc600] p-2 rounded-xl text-slate-900"><ShieldCheck size={24} /></div>
                <div className="text-left flex-1">
                  <p className="text-[10px] font-black uppercase text-[#ffc600] leading-none mb-1">Detalle Técnico</p>
                  <p className="text-sm font-black uppercase">Listado Interno</p>
                </div>
                {isGenerating ? <Loader2 className="animate-spin" size={20}/> : <Download size={20} />}
              </button>
            </div>
            <div className="p-4 bg-slate-50 text-center text-[9px] font-bold text-slate-300 uppercase tracking-widest">InnVolt SpA © 2026</div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-2 px-6">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Registros Totales: {filtered.length}</p>
        <p className="text-[9px] font-bold text-slate-300 uppercase italic">InnVolt SpA - Sistema de Cotizaciones</p>
      </div>
    </div>
  );
}