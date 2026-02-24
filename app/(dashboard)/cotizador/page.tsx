/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, Suspense, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Plus, Trash2, Save, FileText, Calculator, History,
  Package, X, User, Download, UserPlus, Loader2, RefreshCcw,
  Settings, ShieldCheck, ClipboardCheck, ChevronRight, FileUp,
  Info, Percent, Clock, Copy
} from 'lucide-react';
import { PresupuestoPDF } from '@/components/PresupuestoPDF';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { ListadoInternoPDF } from '@/components/ListadoInternoPDF';
import * as XLSX from 'xlsx';

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
  }).format(valor);
};

const cleanNumber = (val: any): number => {
  if (typeof val === 'number') return val;
  return Number(String(val).replace(/\D/g, '')) || 0;
};

function CotizadorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const editId = searchParams.get('edit'); 
  const cloneId = searchParams.get('clone');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [folioGenerado, setFolioGenerado] = useState<number | null>(null);
  const [proximoFolio, setProximoFolio] = useState<number | null>(null);
  
  const [clientes, setClientes] = useState<any[]>([]);
  const [searchCliente, setSearchCliente] = useState('');
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<any>(null);
  
  const [items, setItems] = useState<any[]>([]);
  const [descripcionGeneral, setDescripcionGeneral] = useState(''); 

  const [materialAfecto, setMaterialAfecto] = useState(true);
  const [moAfecto, setMoAfecto] = useState(true);

  // Descuento exclusivo para Mano de Obra
  const [descuentoPorcentajeMO, setDescuentoPorcentajeMO] = useState(0);
  const [validezOferta, setValidezOferta] = useState("15 DÍAS CORRIDOS");
  
  const [garantia, setGarantia] = useState(
    "• Garantía: 6 meses sobre la mano de obra instalada.\n• La garantía no cubre fallas por mal uso, sobrecargas o intervención de terceros.\n• Materiales: La garantía de los componentes es responsabilidad del fabricante según sus políticas."
  );
  const [condicionesComerciales, setCondicionesComerciales] = useState(
    "• Validez de la oferta: 15 días corridos.\n• Forma de Pago: 50% de anticipo para el inicio de los trabajos y 50% restante al finalizar y entregar conforme.\n• Medios de pago: Transferencia electrónica o efectivo."
  );

  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const datosInnVolt = {
    nombre: "InnVolt SpA",
    nombre_cliente: "InnVolt SpA",
    rut: "78.299.986-9", 
    direccion: "Santiago, Chile",
    giro: "Servicios Eléctricos"
  };

  useEffect(() => {
    loadInitialData();
    if (editId) cargarDatosEdicion(editId, false);
    else if (cloneId) cargarDatosEdicion(cloneId, true);
    else obtenerUltimoFolio();
  }, [editId, cloneId]);

  async function loadInitialData() {
    const { data: c } = await supabase.from('clientes').select('*').order('nombre_cliente');
    if (c) setClientes(c);
  }

  async function obtenerUltimoFolio() {
    const { data } = await supabase.from('cotizaciones').select('folio').order('folio', { ascending: false }).limit(1).single();
    if (data) setProximoFolio(data.folio + 1);
    else setProximoFolio(1);
  }

  async function cargarDatosEdicion(id: string, isCloning: boolean) {
    setLoading(true);
    const { data } = await supabase.from('cotizaciones').select('*, clientes(*)').eq('id', id).single();
    if (data) {
      setClienteSeleccionado(data.clientes);
      setSearchCliente(data.clientes.nombre_cliente);
      setItems(data.items || []);
      setDescripcionGeneral(data.descripcion_general || '');
      setDescuentoPorcentajeMO(data.descuento_global || 0);
      if (data.condiciones_servicio) setGarantia(data.condiciones_servicio);
      if (data.condiciones_comerciales) setCondicionesComerciales(data.condiciones_comerciales);
      if (!isCloning) setFolioGenerado(data.folio);
      else obtenerUltimoFolio();
    }
    setLoading(false);
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);
        const newItems = data.map(row => ({
          descripcion: row['Descripcion'] || row['descripcion'] || 'Sin descripción',
          cantidad: cleanNumber(row['Cantidad'] || row['cantidad'] || 0),
          precio: cleanNumber(row['Precio unitario'] || row['precio unitario'] || 0),
          esMaterial: true
        })).filter(item => item.descripcion !== 'Sin descripción');
        setItems([...newItems, ...items]);
      } catch (error) {
        alert("Error al procesar el archivo Excel.");
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- LÓGICA DE CÁLCULO: DESCUENTO SOLO A MANO DE OBRA ---
  const totals = useMemo(() => {
    const rawNetoMateriales = items.filter(i => i.esMaterial).reduce((acc, item) => acc + (item.cantidad * item.precio), 0);
    const rawNetoMO = items.filter(i => !i.esMaterial).reduce((acc, item) => acc + (item.cantidad * item.precio), 0);
    
    // Aplicar descuento solo a MO
    const montoDescuentoMO = Math.round(rawNetoMO * (descuentoPorcentajeMO / 100));
    const netoMOConDescuento = rawNetoMO - montoDescuentoMO;

    const subtotalNetoFinal = rawNetoMateriales + netoMOConDescuento;

    // Cálculo de IVA independiente por categoría post-descuento
    const ivaMateriales = materialAfecto ? Math.round(rawNetoMateriales * 0.19) : 0;
    const ivaMO = moAfecto ? Math.round(netoMOConDescuento * 0.19) : 0;
    
    const ivaTotal = ivaMateriales + ivaMO;

    return {
      netoMateriales: rawNetoMateriales,
      netoMOOriginal: rawNetoMO,
      descuentoMO: montoDescuentoMO,
      netoMOFinal: netoMOConDescuento,
      subtotalNeto: subtotalNetoFinal,
      iva: ivaTotal,
      total: subtotalNetoFinal + ivaTotal
    };
  }, [items, materialAfecto, moAfecto, descuentoPorcentajeMO]);

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
        const docCliente = (
          <PresupuestoPDF 
            cliente={clienteSeleccionado} 
            items={getItemsVistaCliente(items)} 
            subtotal={totals.subtotalNeto} 
            iva={totals.iva} 
            total={totals.total} 
            folio={folioFormateado} 
            descripcionGeneral={descripcionGeneral} 
            garantia={garantia} 
            condicionesComerciales={condicionesComerciales}
          />
        );
        const blobCliente = await pdf(docCliente).toBlob();
        saveAs(blobCliente, `Cotizacion_${folioFormateado}_${clienteSeleccionado.nombre_cliente}.pdf`);
      } else {
        const soloMateriales = items.filter(i => i.esMaterial);
        const subtotalM = soloMateriales.reduce((acc, curr) => acc + (curr.precio * curr.cantidad), 0);
        const docInterno = (
          <ListadoInternoPDF
            cliente={datosInnVolt} 
            items={soloMateriales} 
            subtotal={subtotalM} 
            iva={materialAfecto ? Math.round(subtotalM * 0.19) : 0} 
            total={subtotalM + (materialAfecto ? Math.round(subtotalM * 0.19) : 0)} 
            folio={folioFormateado} 
            descripcionGeneral="LISTADO INTERNO DE MATERIALES (DETALLE TÉCNICO)" 
          />
        );
        const blobInterno = await pdf(docInterno).toBlob();
        saveAs(blobInterno, `Interno_${folioFormateado}.pdf`);
      }
    } catch (error) {
      console.error("Error al generar PDF:", error);
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
      subtotal: totals.subtotalNeto,
      iva: totals.iva,
      total: totals.total,
      descuento_global: descuentoPorcentajeMO,
      descripcion_general: descripcionGeneral,
      condiciones_servicio: garantia,
      condiciones_comerciales: condicionesComerciales,
      estado: 'pendiente'
    };
    try {
      let result;
      if (editId && !cloneId) {
        result = await supabase.from('cotizaciones').update(payload).eq('id', editId).select().single();
      } else {
        result = await supabase.from('cotizaciones').insert([payload]).select().single();
      }
      if (result.error) throw result.error;
      setFolioGenerado(result.data.folio);
      setShowSuccessModal(true);
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter' && items[index].descripcion !== '') {
      setItems([{ descripcion: '', cantidad: 1, precio: 0, esMaterial: true }, ...items]);
    }
  };

  const nuevoPresupuesto = () => {
    setItems([]);
    setClienteSeleccionado(null);
    setSearchCliente('');
    setDescripcionGeneral('');
    setFolioGenerado(null);
    setShowSuccessModal(false);
    setDescuentoPorcentajeMO(0);
    obtenerUltimoFolio();
    router.push('/cotizador');
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-slate-900 pb-20 md:pb-10">
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls, .csv" className="hidden" />

      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-3 md:py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="bg-[#ffc600] p-2 md:p-3 rounded-xl shadow-lg shadow-yellow-500/20">
              <Calculator className="text-slate-900" size={20} />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-black text-slate-900 leading-tight flex items-center gap-2">
                {cloneId ? 'CLONAR' : (folioGenerado || editId ? 'EDITAR' : 'NUEVA')} <span className="text-[#ffc600]">COTIZACIÓN</span>
              </h1>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Folio:</span>
                <span className="text-[10px] font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                  {formatFolio(folioGenerado || proximoFolio)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
            <button onClick={nuevoPresupuesto} className="shrink-0 flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl font-bold text-[10px] uppercase transition-all shadow-sm">
              <RefreshCcw size={14}/> Nuevo
            </button>
            <Link href="/cotizador/historial" className="shrink-0 flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl font-bold text-[10px] uppercase transition-all shadow-sm">
              <History size={14}/> Historial
            </Link>
            <button onClick={handleGuardar} disabled={loading} className="shrink-0 flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 bg-slate-900 text-[#ffc600] rounded-xl font-black text-[10px] uppercase hover:bg-black transition-all shadow-md shadow-slate-200 disabled:opacity-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <><Save size={14}/> Guardar</>}
            </button>
            {(folioGenerado || editId) && (
              <button onClick={() => setShowSuccessModal(true)} className="shrink-0 flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl font-black text-[10px] uppercase hover:bg-green-700 transition-all shadow-md">
                <Download size={14}/> PDF
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-4 space-y-6">
          <section className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm ">
            <header className="flex items-center gap-2 mb-4">
              <User size={16} className="text-[#ffc600]" />
              <h3 className="text-[11px] font-black uppercase text-slate-500 tracking-widest">Información del Cliente</h3>
            </header>

            <div className="relative">
              <div className="absolute inset-y-0 left-4 flex items-center text-slate-400">
                <UserPlus size={18} />
              </div>
              <input 
                type="text" 
                value={searchCliente}
                onFocus={() => setShowClienteDropdown(true)} 
                onChange={(e) => { setSearchCliente(e.target.value); setShowClienteDropdown(true); }} 
                placeholder="Buscar cliente..." 
                className="w-full bg-slate-50 pl-12 pr-4 py-4 rounded-2xl text-sm font-bold border-2 border-transparent focus:border-[#ffc600] focus:bg-white transition-all outline-none" 
              />
              {showClienteDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto">
                  {clientes.filter(c => c.nombre_cliente.toLowerCase().includes(searchCliente.toLowerCase())).map(c => (
                    <button key={c.id} onClick={() => { setClienteSeleccionado(c); setSearchCliente(c.nombre_cliente); setShowClienteDropdown(false); }} className="w-full text-left p-4 hover:bg-slate-50 flex items-center justify-between group">
                      <div>
                        <p className="text-xs font-black uppercase text-slate-800">{c.nombre_cliente}</p>
                        <p className="text-[10px] text-slate-400 font-bold tracking-tighter">{c.rut}</p>
                      </div>
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-[#ffc600]" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {clienteSeleccionado && (
               <div className="relative p-5 mt-4 bg-slate-900 rounded-2xl text-white shadow-lg border-b-4 border-[#ffc600]">
                  <button onClick={() => { setClienteSeleccionado(null); setSearchCliente(''); }} className="absolute top-2 right-2 bg-white/10 hover:bg-red-500 text-white p-1.5 rounded-full transition-all"><X size={14} /></button>
                  <span className="text-[9px] font-black text-[#ffc600] uppercase tracking-widest">Seleccionado</span>
                  <h4 className="text-sm font-black uppercase mt-1 truncate pr-6 italic">{clienteSeleccionado.nombre_cliente}</h4>
                  <p className="text-[10px] font-bold opacity-70 mt-1">RUT: {clienteSeleccionado.rut}</p>
               </div>
            )}
          </section>

          <section className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <header className="flex items-center gap-2 mb-4">
              <FileText size={16} className="text-[#ffc600]" />
              <h3 className="text-[11px] font-black uppercase text-slate-500 tracking-widest">1. Alcance Técnico</h3>
            </header>
            <textarea 
              value={descripcionGeneral} 
              onChange={(e) => setDescripcionGeneral(e.target.value)} 
              className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold h-32 resize-none border-2 border-transparent focus:border-[#ffc600] focus:bg-white transition-all outline-none" 
              placeholder="Describa el objetivo..." 
            />
          </section>

          {/* TOTALES CON DESCUENTO SOLO EN MANO DE OBRA */}
          <section className="sticky bottom-4 lg:relative lg:bottom-0 bg-slate-900 p-6 rounded-3xl text-white shadow-2xl border-b-4 border-[#ffc600]">
            <div className="flex justify-between items-start">
              <p className="text-[#ffc600] font-black text-[11px] uppercase tracking-widest">Resumen Económico</p>
              <Calculator size={20} className="opacity-20" />
            </div>
            
            <h3 className="text-3xl font-black mt-3 tracking-tighter">{formatCLP(totals.total)}</h3>
            
            <div className="mt-6 space-y-3">
               <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-2">
                    <Percent size={14} className="text-[#ffc600]" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Desc. Mano de Obra</span>
                  </div>
                  <div className="flex items-center bg-slate-800 rounded-lg px-2">
                    <input 
                      type="number" 
                      className="w-10 bg-transparent text-right text-[11px] font-black outline-none p-1"
                      value={descuentoPorcentajeMO}
                      onChange={(e) => setDescuentoPorcentajeMO(cleanNumber(e.target.value))}
                    />
                    <span className="text-[10px] font-black">%</span>
                  </div>
               </div>

               <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-2">
                    <Package size={14} className="text-amber-500" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Materiales</span>
                  </div>
                  <button onClick={() => setMaterialAfecto(!materialAfecto)} className={`px-3 py-1 rounded-full text-[9px] font-black uppercase transition-all ${materialAfecto ? 'bg-amber-500' : 'bg-slate-700'}`}>{materialAfecto ? 'Afecto' : 'Exento'}</button>
               </div>

               <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-2">
                    <Settings size={14} className="text-blue-400" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Mano de Obra</span>
                  </div>
                  <button onClick={() => setMoAfecto(!moAfecto)} className={`px-3 py-1 rounded-full text-[9px] font-black uppercase transition-all ${moAfecto ? 'bg-blue-500' : 'bg-slate-700'}`}>{moAfecto ? 'Afecto' : 'Exento'}</button>
               </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Neto Total</p>
                <p className="font-black text-sm">{formatCLP(totals.subtotalNeto)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">IVA Total</p>
                <p className="font-black text-sm">{formatCLP(totals.iva)}</p>
              </div>
            </div>
          </section>

          <section className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div>
              <header className="flex items-center gap-2 mb-3">
                <ShieldCheck size={16} className="text-blue-500" />
                <h3 className="text-[11px] font-black uppercase text-slate-500 tracking-widest">3. Garantía</h3>
              </header>
              <textarea value={garantia} onChange={(e) => setGarantia(e.target.value)} className="w-full bg-slate-50 p-4 rounded-xl text-[10px] font-bold h-24 resize-none border-2 border-transparent focus:border-[#ffc600] transition-all outline-none" />
            </div>
            <div>
              <header className="flex items-center gap-2 mb-3">
                <ClipboardCheck size={16} className="text-green-500" />
                <h3 className="text-[11px] font-black uppercase text-slate-500 tracking-widest">4. Condiciones Comerciales</h3>
              </header>
              <textarea value={condicionesComerciales} onChange={(e) => setCondicionesComerciales(e.target.value)} className="w-full bg-slate-50 p-4 rounded-xl text-[10px] font-bold h-32 resize-none border-2 border-transparent focus:border-[#ffc600] transition-all outline-none" />
            </div>
          </section>
        </aside>

        <div className="lg:col-span-8 flex flex-col gap-6">
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col min-h-[600px] overflow-hidden">
            <header className="p-6 md:p-8 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div>
                <h3 className="font-black text-[12px] uppercase text-slate-800 tracking-widest flex items-center gap-2">
                  <Package size={16} className="text-[#ffc600]" /> 2. Detalle de Presupuesto
                </h3>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button onClick={() => fileInputRef.current?.click()} className="flex-1 sm:flex-none bg-[#ffc600] text-slate-900 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:scale-105 transition-all shadow-sm">
                  <FileUp size={14}/> Importar Excel
                </button>
                <button onClick={() => setItems([{ descripcion: '', cantidad: 1, precio: 0, esMaterial: true}, ...items])} className="flex-1 sm:flex-none bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2">
                  <Plus size={14}/> Material
                </button>
                <button onClick={() => setItems([{ descripcion: '', cantidad: 1, precio: 0, esMaterial: false}, ...items])} className="flex-1 sm:flex-none bg-slate-900 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2">
                  <Plus size={14}/> Mano de Obra
                </button>
              </div>
            </header>

            <div className="p-4 md:p-6 space-y-4 flex-1">
              {items.map((item, i) => (
                <div key={i} className={`group relative flex flex-col md:flex-row gap-4 p-5 rounded-2xl border transition-all ${item.esMaterial ? 'bg-amber-50/30 border-amber-100' : 'bg-white border-slate-100'}`}>
                  <div className={`absolute top-0 left-6 -translate-y-1/2 px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${item.esMaterial ? 'bg-amber-500 text-white' : 'bg-slate-900 text-white'}`}>
                    {item.esMaterial ? 'Material' : 'Mano de Obra'}
                  </div>
                  <div className="flex-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase mb-1.5 block tracking-widest">Descripción</label>
                    <input 
                      className="w-full bg-transparent text-[11px] font-black uppercase outline-none focus:text-blue-600" 
                      value={item.descripcion} 
                      onKeyDown={(e) => handleKeyDown(e, i)}
                      onChange={(e) => { const n = [...items]; n[i].descripcion = e.target.value; setItems(n); }} 
                      placeholder="Ej: Instalación eléctrica..." 
                    />
                  </div>
                  <div className="flex items-end gap-3 justify-between md:justify-end">
                    <div className="w-16">
                      <label className="text-[8px] font-black text-slate-400 text-center block mb-1">Cant.</label>
                      <input type="text" className="w-full bg-slate-100 p-2 rounded-xl text-center text-[11px] font-black outline-none" value={item.cantidad || ""} onChange={(e) => { const n = [...items]; n[i].cantidad = cleanNumber(e.target.value); setItems(n); }} />
                    </div>
                    <div className="w-32">
                      <label className="text-[8px] font-black text-slate-400 text-right block mb-1">Precio Unit.</label>
                      <input type="text" className="w-full bg-slate-100 p-2 rounded-xl text-right text-[11px] font-black outline-none" value={item.precio ? item.precio.toLocaleString('es-CL') : ""} onChange={(e) => { const n = [...items]; n[i].precio = cleanNumber(e.target.value); setItems(n); }} />
                    </div>
                    <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="mb-1 p-2 text-slate-300 hover:text-red-500 transition-all"><Trash2 size={16}/></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      {showSuccessModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowSuccessModal(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-[3rem] sm:rounded-[3rem] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="relative p-10 text-center bg-slate-50/80">
                <div className="absolute top-0 left-0 w-full h-2 bg-[#ffc600]"></div>
                <div className="w-20 h-20 bg-green-500 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl rotate-12">
                  <ShieldCheck size={40} />
                </div>
                <h3 className="font-black text-2xl uppercase italic text-slate-900 leading-tight">¡Documento <br/><span className="text-[#ffc600]">Generado!</span></h3>
            </div>
            <div className="p-8 space-y-4">
              <button onClick={() => descargarPDF('cliente')} className="w-full flex items-center gap-4 p-5 bg-slate-900 text-white rounded-[2rem] hover:bg-black group">
                <div className="bg-[#ffc600] p-3 rounded-2xl text-slate-900 group-hover:rotate-12 transition-transform"><User size={24} /></div>
                <div className="text-left flex-1"><p className="text-[10px] font-black uppercase text-[#ffc600]">Cliente</p><p className="text-sm font-black uppercase">Descargar Presupuesto</p></div>
                <Download size={20} />
              </button>
              <button onClick={() => descargarPDF('interno')} className="w-full flex items-center gap-4 p-5 bg-white border-2 border-slate-100 text-slate-900 rounded-[2rem]">
                <div className="bg-slate-100 p-3 rounded-2xl text-slate-600"><Package size={24} /></div>
                <div className="text-left flex-1"><p className="text-[10px] font-black uppercase text-slate-400">Interno</p><p className="text-sm font-black uppercase">Listado de Compra</p></div>
                <Download size={20} />
              </button>
              <button onClick={() => setShowSuccessModal(false)} className="w-full py-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest">Seguir Editando</button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER MÓVIL */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-between items-center z-40">
        <div className="flex flex-col">
            <span className="text-[8px] font-black text-slate-400 uppercase">Total Final</span>
            <span className="text-lg font-black text-slate-900">{formatCLP(totals.total)}</span>
        </div>
        <button onClick={handleGuardar} className="bg-slate-900 text-[#ffc600] px-8 py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg">
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Guardar Cotización'}
        </button>
      </div>
    </div>
  );
}

export default function CotizadorPage() {
  return (
    <Suspense fallback={<div className="h-screen flex flex-col items-center justify-center bg-white gap-4"><Loader2 className="animate-spin text-[#ffc600]" size={48} /><p className="font-black text-xs uppercase tracking-widest text-slate-400">Preparando Cotizador...</p></div>}>
      <CotizadorContent />
    </Suspense>
  );
}