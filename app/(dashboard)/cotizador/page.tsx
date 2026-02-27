/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, Suspense, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Plus, Trash2, Save, FileText, Calculator, History,
  Package, X, User, Download, UserPlus, Loader2, RefreshCcw,
  Percent, Check, FileUp, ChevronRight, Tags 
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

// --- ESTRUCTURA DE ITEM ---
interface CotizacionItem {
  descripcion: string;
  cantidad: number;
  precio: number; 
  esMaterial: boolean;
  // --- LÓGICA DE IVA ---
  // Materiales: 
  //    TRUE: Precio ingresado es BRUTO (1000 con iva incluido -> neto es 840)
  //    FALSE: Precio ingresado es NETO (1000 sin iva -> total es 1190)
  // Mano de Obra:
  //    TRUE: Precio ingresado es NETO (1000 + iva)
  //    FALSE: Precio ingresado es FINAL (1000 exento)
  iva_incluido: boolean; 
}

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
  
  const [items, setItems] = useState<CotizacionItem[]>([]);
  const [descripcionGeneral, setDescripcionGeneral] = useState(''); 

  const [descuentoPorcentajeMO, setDescuentoPorcentajeMO] = useState(0);
  
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

  // --- LÓGICA DE CÁLCULO CORREGIDA ---
  const totals = useMemo(() => {
    let subtotalNetoMateriales = 0;
    let ivaMateriales = 0;
    
    let subtotalNetoMO = 0; 
    let ivaMO = 0;

    items.forEach(item => {
      const totalLinea = item.cantidad * item.precio;

      if (item.esMaterial) {
        if (item.iva_incluido) {
          // TRUE: Ingresado es BRUTO -> Desglosar Neto e IVA
          const neto = totalLinea / 1.19;
          subtotalNetoMateriales += neto;
          ivaMateriales += (totalLinea - neto);
        } else {
          // FALSE: Ingresado es NETO -> Neto es total, sumar IVA
          subtotalNetoMateriales += totalLinea;
          ivaMateriales += (totalLinea * 0.19);
        }
      } else {
        if (item.iva_incluido) {
          // TRUE: Ingresado es NETO (se suma IVA)
          subtotalNetoMO += totalLinea;
          ivaMO += (totalLinea * 0.19);
        } else {
          // FALSE: Ingresado es FINAL (exento)
          subtotalNetoMO += totalLinea;
          // ivaMO se mantiene igual
        }
      }
    });

    // Aplicar descuento sobre la base NETA de Mano de Obra
    const montoDescuentoTotalMO = subtotalNetoMO * (descuentoPorcentajeMO / 100);
    const netoMOConDescuento = subtotalNetoMO - montoDescuentoTotalMO;

    // Recalcular IVA MO proporcionalmente al descuento
    const ivaMOFinal = ivaMO * (1 - (descuentoPorcentajeMO / 100));

    const totalNetoFinal = subtotalNetoMateriales + netoMOConDescuento;
    const totalIVA = ivaMateriales + ivaMOFinal;

    return {
      netoMateriales: subtotalNetoMateriales,
      ivaMateriales,
      netoMO: netoMOConDescuento,
      ivaMO: ivaMOFinal,
      netoGeneral: totalNetoFinal,
      ivaGeneral: totalIVA,
      total: totalNetoFinal + totalIVA,
      montoDescuentoMO: montoDescuentoTotalMO
    };
  }, [items, descuentoPorcentajeMO]);

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
        const newItems: CotizacionItem[] = data.map(row => ({
          descripcion: row['Descripcion'] || row['descripcion'] || 'Sin descripción',
          cantidad: cleanNumber(row['Cantidad'] || row['cantidad'] || 0),
          precio: cleanNumber(row['Precio unitario'] || row['precio unitario'] || 0),
          esMaterial: true,
          iva_incluido: true // Por defecto materiales llevan IVA
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

  const descargarPDF = async (tipo: 'cliente' | 'interno') => {
    if (!folioGenerado || !clienteSeleccionado) return;
    setLoading(true);
    try {
      const folioFormateado = formatFolio(folioGenerado);
      if (tipo === 'cliente') {
        const docCliente = (
          <PresupuestoPDF 
            cliente={clienteSeleccionado} 
            items={items} // Enviamos los items originales para que el PDF los liste
            
            // Enviamos los totales calculados por el cotizador
            totalNetoMat={totals.netoMateriales}
            totalIvaMat={totals.ivaMateriales}
            totalNetoMO={totals.netoMO}
            totalIvaMO={totals.ivaMO}
            montoDescuentoMO={totals.montoDescuentoMO}
            descuentoPorcentajeMO={descuentoPorcentajeMO}
            totalFinal={totals.total}
            
            folio={folioFormateado} 
            descripcionGeneral={descripcionGeneral} 
            garantia={garantia} 
            condicionesComerciales={condicionesComerciales}
          />
        );
        const blobCliente = await pdf(docCliente).toBlob();
        saveAs(blobCliente, `Cotizacion_${folioFormateado}_${clienteSeleccionado.nombre_cliente}.pdf`);
      } else {
        // Lógica PDF Interno (Solo materiales)
        const soloMateriales = items.filter(i => i.esMaterial);
        
        // El PDF interno usualmente necesita el total por item ya calculado
        const itemsConTotal = soloMateriales.map(item => ({
          ...item,
          total: item.iva_incluido 
            ? (item.cantidad * item.precio) // Ingresado es Bruto
            : (item.cantidad * item.precio * 1.19) // Ingresado es Neto
        }));
        
        const totalM = itemsConTotal.reduce((acc, item) => acc + item.total, 0);
        
        const docInterno = (
          <ListadoInternoPDF
            cliente={datosInnVolt} 
            items={itemsConTotal} 
            subtotal={totalM / 1.19} 
            iva={totalM - (totalM / 1.19)} 
            total={totalM} 
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
      subtotal: totals.netoGeneral,
      iva: totals.ivaGeneral,
      total: totals.total,
      descuento_global: descuentoPorcentajeMO,
      descripcion_general: descripcionGeneral,
      condiciones_servicio: garantia,
      condiciones_comerciales: condicionesComerciales,
      estado: 'Pendiente'
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
      setItems([{ descripcion: '', cantidad: 1, precio: 0, esMaterial: true, iva_incluido: true }, ...items]);
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

  const setAllIVA = (incluye: boolean) => {
    setItems(prevItems => prevItems.map(item => ({
      ...item,
      iva_incluido: incluye
    })));
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

          {/* --- RESUMEN ECONÓMICO DETALLADO --- */}
          <section className="bottom-4 lg:relative lg:bottom-0 bg-slate-900 p-6 rounded-3xl text-white shadow-2xl border-b-4 border-[#ffc600]">
            <div className="flex justify-between items-start">
              <p className="text-[#ffc600] font-black text-[11px] uppercase tracking-widest">Resumen Económico</p>
              <Calculator size={20} className="opacity-20" />
            </div>
            
            <h3 className="text-3xl font-black mt-3 tracking-tighter">{formatCLP(totals.total)}</h3>
            
            <div className="mt-6 space-y-4">
               {/* Desglose detallado */}
               <div className="space-y-1 text-[10px] font-bold border-b border-white/10 pb-4">
                  <div className="flex justify-between text-slate-400"><span>Neto Materiales:</span> <span>{formatCLP(totals.netoMateriales)}</span></div>
                  <div className="flex justify-between text-slate-400"><span>IVA Materiales:</span> <span>{formatCLP(totals.ivaMateriales)}</span></div>
                  <div className="flex justify-between text-slate-400"><span>Neto Mano de Obra:</span> <span>{formatCLP(totals.netoMO + totals.montoDescuentoMO)}</span></div>
                  <div className="flex justify-between text-red-400"><span>Descuento ({descuentoPorcentajeMO}%):</span> <span>-{formatCLP(totals.montoDescuentoMO)}</span></div>
                  <div className="flex justify-between text-slate-400"><span>IVA Mano de Obra:</span> <span>{formatCLP(totals.ivaMO)}</span></div>
               </div>

               <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-2">
                    <Percent size={14} className="text-[#ffc600]" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Desc. Mano de Obra</span>
                  </div>
                  <div className="flex items-center bg-slate-800 rounded-lg px-2">
                    <input 
                      type="text" 
                      className="w-12 bg-transparent text-lg font-black outline-none"
                      value={descuentoPorcentajeMO}
                      onChange={(e) => setDescuentoPorcentajeMO(cleanNumber(e.target.value))}
                    />
                    <span className="text-[10px] font-black">%</span>
                  </div>
               </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Neto Total</p>
                <p className="font-black text-sm">{formatCLP(totals.netoGeneral)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">IVA Total</p>
                <p className="font-black text-sm">{formatCLP(totals.ivaGeneral)}</p>
              </div>
            </div>
          </section>

          <section className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div>
              <header className="flex items-center gap-2 mb-3">
                <span className="text-blue-500">🛡️</span>
                <h3 className="text-[11px] font-black uppercase text-slate-500 tracking-widest">3. Garantía</h3>
              </header>
              <textarea value={garantia} onChange={(e) => setGarantia(e.target.value)} className="w-full bg-slate-50 p-4 rounded-xl text-[10px] font-bold h-24 resize-none border-2 border-transparent focus:border-[#ffc600] transition-all outline-none" />
            </div>
            <div>
              <header className="flex items-center gap-2 mb-3">
                <span className="text-green-500">📋</span>
                <h3 className="text-[11px] font-black uppercase text-slate-500 tracking-widest">4. Condiciones Comerciales</h3>
              </header>
              <textarea value={condicionesComerciales} onChange={(e) => setCondicionesComerciales(e.target.value)} className="w-full bg-slate-50 p-4 rounded-xl text-[10px] font-bold h-32 resize-none border-2 border-transparent focus:border-[#ffc600] transition-all outline-none" />
            </div>
          </section>
        </aside>

        <div className="lg:col-span-8 flex flex-col gap-6">
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col min-h-[600px] overflow-hidden">
            <header className="p-6 md:p-8 bg-slate-50/50 border-b border-slate-100 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full">
                    <h3 className="font-black text-[12px] uppercase text-slate-800 tracking-widest flex items-center gap-2">
                    <Package size={16} className="text-[#ffc600]" /> 2. Detalle de Presupuesto
                    </h3>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        <button onClick={() => fileInputRef.current?.click()} className="flex-1 sm:flex-none bg-[#ffc600] text-slate-900 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:scale-105 transition-all shadow-sm">
                        <FileUp size={14}/> Importar Excel
                        </button>
                        <button onClick={() => setItems([{ descripcion: '', cantidad: 1, precio: 0, esMaterial: true, iva_incluido: true}, ...items])} className="flex-1 sm:flex-none bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2">
                        <Plus size={14}/> Material
                        </button>
                        <button onClick={() => setItems([{ descripcion: '', cantidad: 1, precio: 0, esMaterial: false, iva_incluido: true}, ...items])} className="flex-1 sm:flex-none bg-slate-900 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2">
                        <Plus size={14}/> Mano de Obra
                        </button>
                    </div>
                </div>

                {/* --- BARRA DE ACCIONES RÁPIDAS --- */}
                <div className="flex items-center gap-2 p-3 bg-white rounded-2xl border border-slate-100 shadow-inner">
                    <Tags size={16} className="text-slate-400" />
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mr-2">Acción Rápida IVA:</span>
                    <button onClick={() => setAllIVA(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 text-[9px] font-black uppercase transition-all">
                        <Check size={12}/> Todo Con IVA
                    </button>
                    <button onClick={() => setAllIVA(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[9px] font-black uppercase transition-all">
                        <X size={12}/> Todo Exento
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
                      placeholder="Ej: Cable eléctrico..." 
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
                    
                    <div className="w-24">
                        <label className="text-[8px] font-black text-slate-400 text-center block mb-1">Tipo</label>
                        <button 
                          onClick={() => { const n = [...items]; n[i].iva_incluido = !n[i].iva_incluido; setItems(n); }}
                          className={`w-full p-2 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1 transition-all ${item.iva_incluido ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}
                        >
                          {item.iva_incluido ? <Check size={12}/> : null}
                          {item.iva_incluido ? 'Con IVA' : 'Exento'}
                        </button>
                    </div>
                    
                    <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="mb-1 p-2 text-slate-300 hover:text-red-500 transition-all"><Trash2 size={16}/></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* MODAL DE ÉXITO */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowSuccessModal(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-[3rem] sm:rounded-[3rem] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="relative p-10 text-center bg-slate-50/80">
                <div className="absolute top-0 left-0 w-full h-2 bg-[#ffc600]"></div>
                <div className="w-20 h-20 bg-green-500 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl rotate-12">
                  <Check size={40} />
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
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Guardar'}
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