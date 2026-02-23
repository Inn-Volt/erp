'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { 
  Plus, Trash2, Save, Search, FileText, Calculator, History,
  Package, X, Check, User, Download, AlertCircle, UserPlus, Loader2, RefreshCcw,
  Settings, ShieldCheck
} from 'lucide-react';
import { PresupuestoPDF } from '@/components/PresupuestoPDF';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { ListadoInternoPDF } from '@/components/ListadoInternoPDF';

// --- FUNCIÓN PARA FORMATO FOLIO IV-0001 ---
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

const cleanNumber = (val: string): number => {
  return Number(val.replace(/\D/g, '')) || 0;
};

function CotizadorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const editId = searchParams.get('edit'); 

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [folioGenerado, setFolioGenerado] = useState<number | null>(null);
  const [proximoFolio, setProximoFolio] = useState<number | null>(null);
  
  const [clientes, setClientes] = useState<any[]>([]);
  const [catalogo, setCatalogo] = useState<any[]>([]);
  const [showMaterialSelector, setShowMaterialSelector] = useState(false);
  
  const [searchCliente, setSearchCliente] = useState('');
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<any>(null);
  
  const [items, setItems] = useState<any[]>([]);
  const [descripcionGeneral, setDescripcionGeneral] = useState(''); 

  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const datosInnVolt = {
    nombre: "InnVolt SpA",
    nombre_cliente: "InnVolt SpA",
    rut: "78.299.986-9", 
    direccion: "",
    giro: "Servicios Eléctricos"
  };

  useEffect(() => {
    loadInitialData();
    if (editId) {
      cargarDatosEdicion(editId);
    } else {
      obtenerUltimoFolio();
    }
  }, [editId]);

  useEffect(() => {
    const saved = localStorage.getItem('cotizacion_temporal');
    if (saved) {
      try {
        const materialesNuevos = JSON.parse(saved);
        if (Array.isArray(materialesNuevos) && materialesNuevos.length > 0) {
          setItems(prev => [...prev, ...materialesNuevos]);
          localStorage.removeItem('cotizacion_temporal');
        }
      } catch (e) {
        console.error("Error cargando materiales temporales", e);
      }
    }
  }, []);

  async function loadInitialData() {
    const { data: c } = await supabase.from('clientes').select('*').order('nombre_cliente');
    const { data: m } = await supabase.from('materiales').select('*').order('nombre');
    if (c) setClientes(c);
    if (m) setCatalogo(m);
  }

  async function obtenerUltimoFolio() {
    const { data, error } = await supabase
      .from('cotizaciones')
      .select('folio')
      .order('folio', { ascending: false })
      .limit(1)
      .single();
    
    if (data) {
      setProximoFolio(data.folio + 1);
    } else {
      setProximoFolio(1);
    }
  }

  async function cargarDatosEdicion(id: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from('cotizaciones')
      .select('*, clientes(*)')
      .eq('id', id)
      .single();

    if (data) {
      setClienteSeleccionado(data.clientes);
      setSearchCliente(data.clientes.nombre_cliente);
      setItems(data.items || []);
      setDescripcionGeneral(data.descripcion_general || '');
      setFolioGenerado(data.folio);
    }
    setLoading(false);
  }

  const subtotal = items.reduce((acc, item) => acc + (item.cantidad * item.precio), 0);
  const iva = Math.round(subtotal * 0.19);
  const total = subtotal + iva;

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
    if (!folioGenerado || !clienteSeleccionado) return;
    setLoading(true);
    try {
      const folioFormateado = formatFolio(folioGenerado);
      if (tipo === 'cliente') {
        const docCliente = <PresupuestoPDF 
          cliente={clienteSeleccionado} 
          items={getItemsVistaCliente(items)} 
          subtotal={subtotal} iva={iva} total={total} 
          folio={folioFormateado} 
          descripcionGeneral={descripcionGeneral} 
        />;
        const blobCliente = await pdf(docCliente).toBlob();
        saveAs(blobCliente, `Cotizacion_${folioFormateado}_${clienteSeleccionado.nombre_cliente}.pdf`);
      } else {
        const soloMateriales = items.filter(i => i.esMaterial);
        const subtotalM = soloMateriales.reduce((acc, curr) => acc + (curr.precio * curr.cantidad), 0);
        const ivaM = Math.round(subtotalM * 0.19);

        const docInterno = <ListadoInternoPDF
          cliente={datosInnVolt} 
          items={soloMateriales} 
          subtotal={subtotalM} 
          iva={ivaM} 
          total={subtotalM + ivaM} 
          folio={folioFormateado} 
          descripcionGeneral="LISTADO INTERNO DE MATERIALES (DETALLE TÉCNICO)" 
        />;
        const blobInterno = await pdf(docInterno).toBlob();
        saveAs(blobInterno, `Interno_${folioFormateado}.pdf`);
      }
    } catch (error) {
      alert("Error al generar el archivo");
    } finally {
      setLoading(false);
    }
  };

  const handleGuardar = async () => {
    if (!clienteSeleccionado) return alert("Selecciona un cliente");
    if (items.length === 0) return alert("Agrega al menos un item");

    setLoading(true);
    const payload = {
      cliente_id: clienteSeleccionado.id,
      items,
      subtotal,
      iva,
      total,
      descripcion_general: descripcionGeneral 
    };

    let result;
    try {
      if (editId) {
        result = await supabase.from('cotizaciones').update(payload).eq('id', editId).select().single();
      } else {
        result = await supabase.from('cotizaciones').insert([payload]).select().single();
      }
      if (result.error) throw result.error;
      setFolioGenerado(result.data.folio);
      setSuccess(true);
      setShowSuccessModal(true);
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const nuevoPresupuesto = () => {
    setItems([]);
    setClienteSeleccionado(null);
    setSearchCliente('');
    setDescripcionGeneral('');
    setSuccess(false);
    setFolioGenerado(null);
    setShowSuccessModal(false);
    obtenerUltimoFolio();
    router.push('/cotizador');
  };

  return (
    <div className="p-2 md:p-8 max-w-7xl mx-auto space-y-4 md:space-y-6 bg-[#f8fafc] min-h-screen">
      
      {/* HEADER RESPONSIVE */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-slate-100 gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="bg-[#ffc600] p-3 rounded-2xl shadow-lg shadow-[#ffc600]/20 shrink-0">
            <Calculator className="text-[#1e293b]" size={24} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-[#1e293b] uppercase italic tracking-tight">
              {editId ? 'Editando' : 'Nueva'} <span className="text-[#ffc600]">Cotización</span>
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">SISTEMA PROFESIONAL</p>
          </div>
        </div>

        {/* FOLIO RESPONSIVE */}
        <div className="w-full md:w-auto bg-slate-900 text-white px-6 py-2 rounded-2xl flex flex-col items-center justify-center shadow-xl border-b-4 border-[#ffc600]">
            <span className="text-[8px] font-black uppercase tracking-[0.3em] text-[#ffc600]">
             {folioGenerado ? 'Folio Confirmado' : 'Folio Asignado'}
            </span>
            <span className="text-lg font-black tracking-tighter">
             {formatFolio(folioGenerado || proximoFolio)}
            </span>
        </div>

        {/* ACCIONES RESPONSIVE */}
        <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 w-full md:w-auto">
          <button onClick={nuevoPresupuesto} className="flex items-center gap-2 px-3 py-2 md:px-5 md:py-3 bg-slate-100 hover:bg-slate-200 rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase transition-all text-slate-600">
            <RefreshCcw size={14}/> Nueva
          </button>
          <Link href="/cotizador/historial" className="flex items-center gap-2 px-3 py-2 md:px-5 md:py-3 bg-slate-100 hover:bg-slate-200 rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase transition-all text-slate-600">
            <History size={14}/> Historial
          </Link>
          <Link href="/materiales" className="flex items-center gap-2 px-3 py-2 md:px-5 md:py-3 bg-slate-900 text-[#ffc600] hover:bg-black rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase transition-all">
            <Settings size={14}/> Materiales
          </Link>
          {success && folioGenerado ? (
            <button onClick={() => setShowSuccessModal(true)} className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-green-600 text-white rounded-xl md:rounded-2xl font-black text-[10px] uppercase hover:bg-green-700 transition-all shadow-xl shadow-green-200">
                <Download size={16}/> PDFs
            </button>
          ) : (
            <button onClick={handleGuardar} disabled={loading} className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl md:rounded-2xl font-black text-[10px] uppercase hover:scale-105 transition-all shadow-xl shadow-blue-200 disabled:opacity-50">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16}/> {editId ? 'Actualizar' : 'Guardar'}</>}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        {/* PANEL LATERAL RESPONSIVE */}
        <div className="lg:col-span-4 space-y-4 md:space-y-6 order-2 lg:order-1">
          <div className="bg-white p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-100 shadow-sm relative">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <UserPlus size={14} className="text-[#ffc600]" /> Datos del Cliente
            </h3>
            {!clienteSeleccionado ? (
              <div className="relative">
                <input type="text" value={searchCliente} onChange={(e) => { setSearchCliente(e.target.value); setShowClienteDropdown(true); }} placeholder="Buscar cliente..." className="text-slate-900 w-full bg-slate-50 p-4 rounded-2xl text-sm font-bold outline-none border-2 border-transparent focus:border-[#ffc600] transition-all" />
                {showClienteDropdown && searchCliente && (
                  <div className="text-slate-900 absolute z-20 top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl max-h-48 overflow-y-auto p-2">
                    {clientes.filter(c => c.nombre_cliente.toLowerCase().includes(searchCliente.toLowerCase())).map(c => (
                      <button key={c.id} onClick={() => { setClienteSeleccionado(c); setSearchCliente(c.nombre_cliente); setShowClienteDropdown(false); }} className="w-full text-left p-3 hover:bg-slate-50 rounded-xl text-xs font-bold uppercase transition-colors">{c.nombre_cliente}</button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-slate-900 rounded-2xl text-white relative group">
                <button onClick={() => { setClienteSeleccionado(null); setSearchCliente(''); }} className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full hover:scale-110 transition-all shadow-lg"><X size={16} /></button>
                <p className="text-[9px] font-black text-[#ffc600] uppercase tracking-tighter">Cliente Seleccionado</p>
                <p className="text-sm font-black italic uppercase mt-1 truncate">{clienteSeleccionado.nombre_cliente}</p>
                <p className="text-[10px] text-slate-400 mt-1">RUT: {clienteSeleccionado.rut}</p>
              </div>
            )}
          </div>

          <div className="bg-white p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase mb-4 flex items-center gap-2"><FileText size={14} className="text-[#ffc600]" /> Alcance</h3>
              <textarea value={descripcionGeneral} onChange={(e) => setDescripcionGeneral(e.target.value)} className="text-slate-900 w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold h-32 resize-none outline-none focus:border-[#ffc600] border-2 border-transparent transition-all" placeholder="Descripción..." />
          </div>

          <div className="bg-slate-900 p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform"><Calculator size={80} /></div>
            <p className="text-[#ffc600] font-black text-[10px] uppercase tracking-[0.2em]">Total Neto</p>
            <h3 className="text-3xl md:text-4xl font-black mt-2 tracking-tighter">{formatCLP(subtotal)}</h3>
            <div className="mt-6 pt-6 border-t border-white/10 flex justify-between">
              <div><p className="text-[9px] font-bold text-slate-400 uppercase">IVA 19%</p><p className="font-black text-sm">{formatCLP(iva)}</p></div>
              <div className="text-right"><p className="text-[9px] font-bold text-[#ffc600] uppercase">Total Final</p><p className="font-black text-lg md:text-xl text-[#ffc600]">{formatCLP(total)}</p></div>
            </div>
          </div>
        </div>

        {/* ÁREA DE ITEMS RESPONSIVE */}
        <div className="lg:col-span-8 bg-white rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col order-1 lg:order-2">
          <div className="p-6 md:p-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center bg-slate-50/30 gap-4">
            <h3 className="font-black text-[10px] uppercase text-slate-400 tracking-widest w-full md:w-auto">Desglose</h3>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <button onClick={() => setShowMaterialSelector(true)} className="flex-1 md:flex-none bg-[#ffc600] text-[#1e293b] px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2"><Package size={14}/> Catálogo</button>
              
              <button onClick={() => setItems([...items, { descripcion: '', cantidad: 1, precio: 0, esMaterial: true }])} className="flex-1 md:flex-none bg-amber-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2">
                <Plus size={14}/> Agregar Material
              </button>

              <button onClick={() => setItems([...items, { descripcion: '', cantidad: 1, precio: 0, esMaterial: false }])} className="flex-1 md:flex-none bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2">
                <Plus size={14}/> Agregar Item
              </button>
            </div>
          </div>

          <div className="p-4 md:p-8 flex-1 space-y-3 max-h-[500px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="h-full py-20 flex flex-col items-center justify-center text-slate-300 gap-4 opacity-50"><FileText size={48} strokeWidth={1} /><p className="text-[10px] font-black uppercase tracking-widest">Sin items</p></div>
            ) : (
              items.map((item, i) => (
                <div key={i} className={`flex flex-col md:flex-row gap-4 md:items-center p-4 rounded-2xl border transition-all group ${item.esMaterial ? 'bg-amber-50/50 border-amber-100' : 'bg-slate-50 border-transparent hover:border-slate-200'}`}>
                  <div className="flex-1">
                    <input className="text-slate-900 w-full bg-transparent text-xs font-black uppercase text-slate-700 outline-none" value={item.descripcion} onChange={(e) => { const n = [...items]; n[i].descripcion = e.target.value; setItems(n); }} />
                  </div>
                  <div className="flex items-center gap-3 justify-between md:justify-end">
                    <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-xl shadow-sm">
                      <span className="text-[9px] font-black text-slate-400 uppercase">Cant.</span>
                      <input type="text" className="text-slate-900 w-10 bg-transparent text-center text-xs font-black outline-none" value={item.cantidad === 0 ? "" : item.cantidad} onChange={(e) => { const n = [...items]; n[i].cantidad = cleanNumber(e.target.value); setItems(n); }} />
                    </div>
                    <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-xl shadow-sm">
                      <span className="text-[9px] font-black text-slate-400 uppercase">$ Unit.</span>
                      <input type="text" className="text-slate-900 w-20 md:w-24 bg-transparent text-right text-xs font-black outline-none" value={item.precio === 0 ? "" : item.precio.toLocaleString('es-CL')} onChange={(e) => { const n = [...items]; n[i].precio = cleanNumber(e.target.value); setItems(n); }} />
                    </div>
                    <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={16}/></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* SELECTOR MATERIALES RESPONSIVE */}
      {showMaterialSelector && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
          <div className="bg-white w-full max-w-xl rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 md:p-8 border-b border-slate-50 flex justify-between items-center shrink-0">
              <h3 className="font-black text-lg uppercase italic">Materiales <span className="text-[#ffc600]">InnVolt</span></h3>
              <button onClick={() => setShowMaterialSelector(false)} className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:text-red-500"><X size={20}/></button>
            </div>
            <div className="p-4 border-b border-slate-50 shrink-0">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input className="text-slate-900 w-full bg-slate-50 p-4 pl-12 rounded-2xl text-xs font-bold outline-none" placeholder="Filtrar materiales..." />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2">
              {catalogo.map(m => (
                <button key={m.id} onClick={() => { setItems([...items, { descripcion: m.nombre, cantidad: 1, precio: m.precio_venta, esMaterial: true }]); setShowMaterialSelector(false); }} className="w-full flex justify-between items-center p-4 hover:bg-slate-50 rounded-2xl border border-slate-50 hover:border-[#ffc600] transition-all group">
                  <div className="text-left max-w-[70%]">
                    <span className="text-[10px] font-black uppercase text-slate-700 block group-hover:text-[#1e293b] truncate">{m.nombre}</span>
                    <span className="text-[8px] text-slate-400 font-bold uppercase">{m.categoria}</span>
                  </div>
                  <span className="text-[11px] font-black text-slate-900 bg-slate-50 px-3 py-1 rounded-lg shrink-0">{formatCLP(m.precio_venta)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ÉXITO Y DESCARGA */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[9999] flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setShowSuccessModal(false)}>
          <div className="bg-white w-full md:max-w-sm rounded-t-[2.5rem] md:rounded-[2.5rem] overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-50 text-center bg-slate-50/50">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldCheck size={32} />
              </div>
              <h3 className="font-black text-lg uppercase italic text-slate-800">¡Acción Exitosa!</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{formatFolio(folioGenerado)}</p>
            </div>
            
            <div className="p-6 space-y-4">
              <button onClick={() => descargarPDF('cliente')} disabled={loading} className="w-full flex items-center gap-4 p-5 bg-blue-600 text-white rounded-3xl active:scale-95 transition-all">
                <div className="bg-white/20 p-2 rounded-xl"><User size={24} /></div>
                <div className="text-left flex-1">
                  <p className="text-[10px] font-black uppercase opacity-70 leading-none mb-1">Documento Oficial</p>
                  <p className="text-sm font-black uppercase">PDF Cliente</p>
                </div>
                {loading ? <Loader2 className="animate-spin" size={20}/> : <Download size={20} />}
              </button>

              <button onClick={() => descargarPDF('interno')} disabled={loading || !items.some((i: any) => i.esMaterial)} className="w-full flex items-center gap-4 p-5 bg-slate-900 text-white rounded-3xl active:scale-95 transition-all disabled:opacity-40">
                <div className="bg-[#ffc600] p-2 rounded-xl text-slate-900"><ShieldCheck size={24} /></div>
                <div className="text-left flex-1">
                  <p className="text-[10px] font-black uppercase text-[#ffc600] leading-none mb-1">Detalle Técnico</p>
                  <p className="text-sm font-black uppercase">Listado Interno</p>
                </div>
                {loading ? <Loader2 className="animate-spin" size={20}/> : <Download size={20} />}
              </button>

              <button onClick={nuevoPresupuesto} className="w-full flex justify-center py-4 text-slate-400 font-bold text-xs uppercase hover:text-slate-600 transition-all">
                Cerrar y Nuevo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CotizadorPage() {
  return (
    <Suspense fallback={<div className="p-24 text-center"><Loader2 className="animate-spin mx-auto text-[#ffc600]" size={40} /></div>}>
      <CotizadorContent />
    </Suspense>
  );
}