'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  RefreshCw, Search, Upload, Loader2,
  Zap, ArrowLeft, Trash2, Package, Hash, Check
} from 'lucide-react';
import Link from 'next/link';

export default function MaterialesPage() {
  const [materiales, setMateriales] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [proveedorFiltro, setProveedorFiltro] = useState('TODOS');
  const [userSession, setUserSession] = useState<any>(null);

  // --- LÓGICA DE SELECCIÓN PARA COTIZADOR ---
  const [seleccionados, setSeleccionados] = useState<any[]>([]);

  useEffect(() => {
    checkUser();
    const guardados = localStorage.getItem('cotizacion_temporal');
    if (guardados) setSeleccionados(JSON.parse(guardados));
  }, []);

  const toggleSeleccion = (m: any) => {
    let nuevaSeleccion;
    const existe = seleccionados.find(item => item.id === m.id);

    if (existe) {
      nuevaSeleccion = seleccionados.filter(item => item.id !== m.id);
    } else {
      nuevaSeleccion = [...seleccionados, { 
        id: m.id,
        descripcion: m.nombre, 
        precio: m.precio_venta, 
        cantidad: 1, 
        esMaterial: true 
      }];
    }
    setSeleccionados(nuevaSeleccion);
    localStorage.setItem('cotizacion_temporal', JSON.stringify(nuevaSeleccion));
  };

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUserSession(session.user);
      fetchMateriales();
    }
  }

  async function fetchMateriales() {
    setLoading(true);
    const { data, error } = await supabase
      .from('materiales')
      .select('*')
      .order('nombre');
    
    if (!error && data) setMateriales(data);
    setLoading(false);
  }

  const handleCSVUpload = async (e: any) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !userSession) return;

    setUploading(true);
    let totalProcesados = 0;

    try {
      for (const file of Array.from(files as FileList)) {
        const text = await file.text();
        const rows = text.split(/\r?\n/);
        if (rows.length < 2) continue;

        const headers = rows[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
        
        const idx = {
          nombre: headers.indexOf('title'),
          precio: headers.indexOf('data'),
          marcaAlternativa: headers.indexOf('title2'),
          brandOriginal: headers.indexOf('brand'),
          imagen: headers.indexOf('image'),
          url: headers.indexOf('web_scraper_start_url')
        };

        const rawItems = rows.slice(1).map(row => {
          const columns = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)?.map(col => col.replace(/"/g, '').trim()) || [];
          if (columns.length < 5) return null;

          const urlOrigen = columns[idx.url]?.toLowerCase() || "";
          let vendor = "GENERAL";
          if (urlOrigen.includes("sodimac.cl")) vendor = "SODIMAC";
          else if (urlOrigen.includes("easy.cl")) vendor = "EASY";

          const nombre = columns[idx.nombre]?.toUpperCase().trim();
          const precioRaw = columns[idx.precio] || "0";
          const precio = parseInt(precioRaw.replace(/[^0-9]/g, '')) || 0;
          
          const imgUrl = columns[idx.imagen] || "";
          let skuDetectado = "S/N";
          if (imgUrl) {
            const match = imgUrl.match(/\/(\d+)_/);
            if (match && match[1]) skuDetectado = match[1];
          }

          let marcaReal = columns[idx.marcaAlternativa];
          if (!marcaReal || marcaReal.includes('$') || marcaReal === "") {
            marcaReal = columns[idx.brandOriginal] !== "Por Sodimac" ? columns[idx.brandOriginal] : "GENÉRICO";
          }

          if (!nombre || precio === 0) return null;

          return {
            nombre,
            precio_venta: precio,
            marca: marcaReal?.toUpperCase().trim() || 'GENÉRICO',
            imagen_url: imgUrl,
            url_referencia: urlOrigen,
            sku: skuDetectado,
            user_id: userSession.id,
            categoria: vendor,
            unidad: 'Unidad'
          };
        });

        const uniqueItemsMap = new Map();

        rawItems.forEach(nuevoItem => {
          if (!nuevoItem) return;
          const itemExistente = uniqueItemsMap.get(nuevoItem.nombre);
          if (!itemExistente) {
            uniqueItemsMap.set(nuevoItem.nombre, nuevoItem);
          } else {
            const calcularPuntos = (item: any) => {
              let puntos = 0;
              if (item.imagen_url && item.imagen_url !== "") puntos += 2;
              if (item.sku && item.sku !== "S/N") puntos += 1;
              if (item.marca && item.marca !== "GENÉRICO") puntos += 1;
              if (item.precio_venta > 0) puntos += 1;
              return puntos;
            };
            if (calcularPuntos(nuevoItem) > calcularPuntos(itemExistente)) {
              uniqueItemsMap.set(nuevoItem.nombre, nuevoItem);
            }
          }
        });

        const processedItems = Array.from(uniqueItemsMap.values());
        if (processedItems.length > 0) {
          const { error } = await supabase
            .from('materiales')
            .upsert(processedItems, { onConflict: 'nombre' });
          if (error) throw error;
          totalProcesados += processedItems.length;
        }
      }
      alert(`✅ Sincronización Exitosa: ${totalProcesados} materiales.`);
      fetchMateriales();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const deleteMaterial = async (id: string) => {
    if(!confirm("¿Eliminar material permanentemente?")) return;
    try {
      const { error } = await supabase.from('materiales').delete().eq('id', id);
      if (error) throw error;
      setMateriales(prev => prev.filter(m => m.id !== id));
    } catch (err: any) {
      alert("No se pudo eliminar: " + err.message);
    }
  };

  const filtrados = materiales.filter(m => {
    const busqueda = filtro.toLowerCase().trim();
    const palabrasBusqueda = busqueda.split(/\s+/);
    const nombre = (m.nombre || "").toLowerCase();
    const marca = (m.marca || "").toLowerCase();
    const sku = (m.sku || "").toLowerCase();
    const textoCompleto = `${nombre} ${marca} ${sku}`;
    const coincideTodo = palabrasBusqueda.every(palabra => textoCompleto.includes(palabra));
    return coincideTodo && (proveedorFiltro === 'TODOS' || m.categoria === proveedorFiltro);
  });

  return (
    <div className="p-2 md:p-10 max-w-[1600px] mx-auto space-y-4 md:space-y-8 bg-[#fcfcfd] min-h-screen pb-32">
      
      {/* HEADER INDUSTRIAL RESPONSIVE */}
      <div className="bg-[#1e293b] rounded-[1.5rem] md:rounded-[3rem] p-6 md:p-10 shadow-2xl relative overflow-hidden border-b-4 md:border-b-8 border-[#ffc600]">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 md:gap-10">
          <div>
            <Link href="/cotizador" className="inline-flex items-center gap-2 text-[#ffc600] text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] mb-2 md:mb-4 hover:opacity-80 transition-all">
              <ArrowLeft size={14}/> Volver al cotizador
            </Link>
            <h2 className="text-3xl md:text-5xl font-black text-white uppercase italic tracking-tighter">
              Catalogo <span className="text-[#ffc600]">InnVolt</span>
            </h2>
          </div>

          <div className="flex w-full md:w-auto gap-2 md:gap-4">
            <label className="flex-1 md:flex-none cursor-pointer bg-[#ffc600] text-[#1e293b] px-4 md:px-10 py-3 md:py-5 rounded-xl md:rounded-3xl font-black text-[10px] md:text-xs uppercase tracking-widest flex items-center justify-center gap-2 md:gap-4 hover:bg-white transition-all shadow-xl active:scale-95">
              {uploading ? <Loader2 className="animate-spin" size={16}/> : <Upload size={16} />}
              <span className="hidden sm:inline">Subir CSV(s)</span>
              <span className="sm:hidden">Subir</span>
              <input type="file" accept=".csv" multiple onChange={handleCSVUpload} className="hidden" />
            </label>
            <button onClick={fetchMateriales} className="bg-slate-800 text-white p-3 md:p-5 rounded-xl md:rounded-3xl hover:bg-slate-700 transition-all shrink-0">
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* BUSCADOR RESPONSIVE */}
      <div className="relative group">
        <Search className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#ffc600] transition-colors w-5 h-5 md:w-6 md:h-6" />
        <input 
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="BUSCAR POR NOMBRE, MARCA O SKU..."
          className="w-full bg-white border-2 border-slate-100 rounded-2xl md:rounded-3xl p-4 md:p-6 pl-12 md:pl-16 text-xs md:text-sm font-black uppercase shadow-sm focus:border-[#ffc600] outline-none transition-all"
        />
      </div>

      {/* GRILLA DE MATERIALES RESPONSIVE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-6">
        {filtrados.map((m) => {
          const isSelected = seleccionados.some(item => item.id === m.id);
          return (
            <div 
              key={m.id} 
              onClick={() => toggleSeleccion(m)}
              className={`cursor-pointer bg-white rounded-[1.5rem] md:rounded-[2.5rem] border-2 p-4 md:p-6 transition-all group flex flex-col relative overflow-hidden active:scale-95 md:active:scale-100 ${
                isSelected ? 'border-[#ffc600] bg-amber-50/30 shadow-xl md:scale-[1.02]' : 'border-slate-50 hover:shadow-2xl'
              }`}
            >
              <div className="flex justify-between items-start mb-3 md:mb-4">
                <div className={`w-5 h-5 md:w-6 md:h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                  isSelected ? 'bg-[#ffc600] border-[#ffc600] text-slate-900' : 'border-slate-200 text-transparent'
                }`}>
                  <Check className="w-3 h-3 md:w-3.5 md:h-3.5" strokeWidth={4} />
                </div>
                <span className="flex items-center gap-1 text-[8px] md:text-[10px] text-slate-500 font-black bg-slate-100 px-2 py-0.5 md:py-1 rounded-lg">
                  <Hash size={10} className="text-[#ffc600]" /> {m.sku}
                </span>
              </div>

              <div className="aspect-square w-full bg-[#f8fafc] rounded-2xl md:rounded-3xl mb-3 md:mb-4 overflow-hidden flex items-center justify-center border border-slate-50">
                {m.imagen_url ? (
                  <img src={m.imagen_url} alt={m.nombre} className="h-full w-full object-contain p-2 md:p-4 mix-blend-multiply group-hover:scale-110 transition-transform duration-500" />
                ) : (
                  <Package className="w-8 h-8 md:w-12 md:h-12 text-slate-200" />
                )}
              </div>

              <div className="flex-1 space-y-1 md:space-y-2">
                <h4 className="text-[10px] md:text-[11px] font-black text-slate-800 uppercase leading-tight line-clamp-2 min-h-[2rem] md:min-h-[2.5rem]">
                  {m.nombre}
                </h4>
                <div className="flex flex-wrap items-center gap-1 md:gap-2">
                  <span className={`text-[7px] md:text-[8px] px-1.5 md:px-2 py-0.5 rounded font-black uppercase tracking-widest ${
                    m.categoria === 'SODIMAC' ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {m.categoria}
                  </span>
                  <span className="bg-[#1e293b] text-white text-[8px] md:text-[9px] px-1.5 md:px-2 py-0.5 rounded uppercase tracking-tighter">
                    {m.marca}
                  </span>
                </div>
              </div>

              <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-slate-50 flex justify-between items-end">
                <div>
                  <p className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase mb-0.5 md:mb-1">Precio Neto</p>
                  <p className="text-lg md:text-2xl font-black text-slate-900 tracking-tighter">
                    ${Number(m.precio_venta).toLocaleString('es-CL')}
                  </p>
                </div>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); deleteMaterial(m.id); }} 
                  className="p-2 md:p-3 bg-red-50 text-red-300 hover:bg-red-500 hover:text-white rounded-xl md:rounded-2xl transition-all shadow-sm"
                >
                  <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* BOTÓN FLOTANTE RESPONSIVE */}
      {seleccionados.length > 0 && (
        <div className="fixed bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 w-[95%] md:w-[90%] max-w-lg z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <Link 
            href="/cotizador" 
            className="bg-slate-900 text-white w-full py-4 md:py-5 rounded-2xl md:rounded-[2rem] font-black uppercase text-xs md:text-sm tracking-[0.1em] md:tracking-[0.2em] shadow-2xl flex items-center justify-center gap-3 md:gap-4 border-b-4 border-[#ffc600] hover:bg-black active:scale-95 transition-all"
          >
            <div className="bg-[#ffc600] text-slate-900 w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-[10px] md:text-xs">
              {seleccionados.length}
            </div>
            <span>Llevar al Cotizador</span>
            <Zap className="w-4 h-4 md:w-5 md:h-5 text-[#ffc600] fill-[#ffc600]" />
          </Link>
        </div>
      )}

      <div className="text-center py-6 md:py-10">
        <p className="text-[8px] md:text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] md:tracking-[0.4em]">
          {filtrados.length} suministros detectados
        </p>
      </div>
    </div>
  );
}