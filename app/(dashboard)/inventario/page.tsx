'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Database, Trash2, Save, Edit2, 
  Download, FileText, X, FileDown, MapPin, User
} from 'lucide-react';
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from '@react-pdf/renderer';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface ItemInventario {
  id: string;
  nombre: string;
  tipo: 'HERRAMIENTA' | 'MATERIAL';
  cantidad_actual: number;
  cantidad_minima: number;
  precio_unitario: number;
  responsable: string;
  ubicacion: string;
  estado: string;
}

const stylesPDF = StyleSheet.create({
  page: { padding: 40, backgroundColor: '#FFFFFF', fontFamily: 'Helvetica' },
  header: { backgroundColor: '#1e293b', margin: -40, marginBottom: 30, padding: 30, borderBottomWidth: 4, borderBottomColor: '#ffc600' },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: 'bold' },
  subtitle: { color: '#ffc600', fontSize: 9, marginTop: 5, fontWeight: 'bold' },
  table: { display: 'flex', width: 'auto', marginTop: 20 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 8, alignItems: 'center' },
  tableHeader: { backgroundColor: '#f8fafc', borderBottomWidth: 2, borderBottomColor: '#1e293b' },
  colDesc: { width: '55%', fontSize: 9 },
  colCant: { width: '15%', fontSize: 9, textAlign: 'center' },
  colPrice: { width: '15%', fontSize: 9, textAlign: 'right' },
  colTotal: { width: '15%', fontSize: 9, textAlign: 'right', fontWeight: 'bold' },
  headerLabel: { fontWeight: 'bold', color: '#64748b', fontSize: 7, textTransform: 'uppercase' },
  totalBox: { marginTop: 30, padding: 15, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalText: { fontSize: 14, fontWeight: 'bold', color: '#1e293b' }
});

const OrdenCompraPDF = ({ items, total }: { items: ItemInventario[], total: number }) => (
  <Document>
    <Page size="A4" style={stylesPDF.page}>
      <View style={stylesPDF.header}>
        <Text style={stylesPDF.title}>ORDEN DE COMPRA INNVOLT</Text>
        <Text style={stylesPDF.subtitle}>DOCUMENTO INTERNO DE REPOSICIÓN | FECHA: {new Date().toLocaleDateString()}</Text>
      </View>
      <View style={stylesPDF.table}>
        <View style={[stylesPDF.tableRow, stylesPDF.tableHeader]}>
          <Text style={[stylesPDF.colDesc, stylesPDF.headerLabel]}>Descripción del Ítem</Text>
          <Text style={[stylesPDF.colCant, stylesPDF.headerLabel]}>Cant.</Text>
          <Text style={[stylesPDF.colPrice, stylesPDF.headerLabel]}>P. Unit</Text>
          <Text style={[stylesPDF.colTotal, stylesPDF.headerLabel]}>Total</Text>
        </View>
        {items.map((item) => (
          <View key={item.id} style={stylesPDF.tableRow}>
            <Text style={stylesPDF.colDesc}>{item.nombre.toUpperCase()}</Text>
            <Text style={stylesPDF.colCant}>{item.cantidad_minima - item.cantidad_actual}</Text>
            <Text style={stylesPDF.colPrice}>${item.precio_unitario.toLocaleString()}</Text>
            <Text style={stylesPDF.colTotal}>${((item.cantidad_minima - item.cantidad_actual) * item.precio_unitario).toLocaleString()}</Text>
          </View>
        ))}
      </View>
      <View style={stylesPDF.totalBox}>
        <Text style={{ fontSize: 9, color: '#64748b', fontWeight: 'bold' }}>TOTAL ESTIMADO COMPRA:</Text>
        <Text style={stylesPDF.totalText}>${total.toLocaleString()}</Text>
      </View>
    </Page>
  </Document>
);

export default function InnVoltCloudERP() {
  const [items, setItems] = useState<ItemInventario[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState('TODOS');
  const [mostrarOC, setMostrarOC] = useState(false);

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = async () => {
    const { data, error } = await supabase.from('inventario_innvolt').select('*').order('nombre', { ascending: true });
    if (data) setItems(data);
  };

  const handleUpdate = async (id: string, field: keyof ItemInventario, value: string | number) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    await supabase.from('inventario_innvolt').update({ [field]: value }).eq('id', id);
  };

  const addItem = async () => {
    const newItem = { nombre: 'NUEVO ARTÍCULO', tipo: 'HERRAMIENTA', cantidad_actual: 0, cantidad_minima: 1, precio_unitario: 0, responsable: '', ubicacion: 'BODEGA', estado: 'OK' };
    const { data } = await supabase.from('inventario_innvolt').insert([newItem]).select();
    if (data) { setItems([data[0], ...items]); setEditandoId(data[0].id); }
  };

  const deleteItem = async (id: string) => {
    if(confirm('¿Eliminar registro?')) {
      await supabase.from('inventario_innvolt').delete().eq('id', id);
      setItems(items.filter(i => i.id !== id));
    }
  };

  const exportarExcel = () => {
    const encabezados = "Nombre;Tipo;Stock Actual;Stock Minimo;Precio Unitario;Responsable\n";
    const filas = items.map(i => `${i.nombre};${i.tipo};${i.cantidad_actual};${i.cantidad_minima};${i.precio_unitario};${i.responsable}`).join("\n");
    const blob = new Blob(["\ufeff" + encabezados + filas], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Inventario_InnVolt.csv`;
    link.click();
  };

  const filtrados = items.filter(i => {
    const matchBusqueda = (i.nombre || '').toLowerCase().includes(busqueda.toLowerCase());
    const matchTipo = filtroTipo === 'TODOS' || i.tipo === filtroTipo;
    return matchBusqueda && matchTipo;
  });

  const faltantes = items.filter(i => (i.cantidad_actual || 0) < (i.cantidad_minima || 0));
  const totalCotizacion = faltantes.reduce((acc, i) => acc + (((i.cantidad_minima || 0) - (i.cantidad_actual || 0)) * (i.precio_unitario || 0)), 0);

  return (
    <div className="min-h-screen bg-[#f1f5f9] p-2 md:p-6 lg:p-10 text-slate-900 font-sans">
      {/* HEADER RESPONSIVE */}
      <header className="max-w-7xl mx-auto mb-6 bg-[#1e293b] p-6 md:p-8 rounded-[1.5rem] md:rounded-[2rem] shadow-2xl flex flex-col md:flex-row justify-between items-center gap-6 border-b-4 border-[#ffc600]">
        <div className="flex items-center gap-4">
          <div className="bg-[#ffc600] p-3 md:p-4 rounded-2xl shadow-lg rotate-2"><Database size={28} className="text-[#1e293b]" /></div>
          <div>
            <h1 className="text-white text-2xl md:text-4xl font-black italic tracking-tighter">Inventario <span className="text-[#ffc600]"></span></h1>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button onClick={addItem} className="flex-1 md:flex-none bg-emerald-500 text-white px-4 py-3 rounded-xl font-black uppercase text-[10px] flex items-center justify-center gap-2 hover:bg-emerald-600 shadow-lg transition-all">
            <Plus size={18}/> Nuevo
          </button>
          <button onClick={exportarExcel} className="flex-1 md:flex-none bg-white/10 text-white px-4 py-3 rounded-xl font-black uppercase text-[10px] flex items-center justify-center gap-2 hover:bg-white/20 transition-all">
            <Download size={18}/> Excel
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-9 space-y-4">
          {/* BUSCADOR RESPONSIVE */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="text" placeholder="Buscar..." className="w-full bg-white border-none rounded-xl py-4 pl-14 pr-4 shadow-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#ffc600]" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}/>
            </div>
            <select className="bg-slate-800 text-white px-4 py-4 rounded-xl font-black text-[10px] uppercase outline-none cursor-pointer" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="TODOS">Categorías</option>
              <option value="HERRAMIENTA">🔧 Herramientas</option>
              <option value="MATERIAL">📦 Materiales</option>
            </select>
          </div>

          {/* TABLA / CARDS RESPONSIVE */}
          <div className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden">
            {/* Versión Desktop (Visible en md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 uppercase text-[10px] font-black text-slate-400">
                    <th className="p-6">Registro</th>
                    <th className="p-6 text-center">Tipo</th>
                    <th className="p-6 text-center">Stock / Min</th>
                    <th className="p-6 text-center">Precio Unit.</th>
                    <th className="p-6 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtrados.map((item) => (
                    <tr key={item.id} className={`${editandoId === item.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                      <td className="p-6">
                        {editandoId === item.id ? (
                          <div className="flex flex-col gap-2">
                            <input className="w-full border-2 border-blue-200 rounded-lg p-2 font-black text-sm uppercase outline-none" value={item.nombre} onChange={(e) => handleUpdate(item.id, 'nombre', e.target.value)}/>
                            <div className="flex gap-2">
                              <input className="flex-1 border border-slate-200 rounded-lg p-2 text-[10px] font-bold uppercase outline-none" value={item.responsable || ''} onChange={(e) => handleUpdate(item.id, 'responsable', e.target.value)} placeholder="Responsable"/>
                              <input className="flex-1 border border-slate-200 rounded-lg p-2 text-[10px] font-bold uppercase outline-none" value={item.ubicacion || ''} onChange={(e) => handleUpdate(item.id, 'ubicacion', e.target.value)} placeholder="Ubicación"/>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="font-black text-slate-900 text-sm uppercase">{item.nombre}</p>
                            <div className="flex flex-col gap-0.5 mt-1 text-[9px] font-bold text-slate-400 uppercase italic">
                              <span>👤 {item.responsable || 'SIN ASIGNAR'}</span>
                              <span>📍 {item.ubicacion || 'SIN UBICACIÓN'}</span>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="p-6 text-center">
                         <span className={`text-[9px] font-black px-3 py-1.5 rounded-lg ${item.tipo === 'HERRAMIENTA' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{item.tipo}</span>
                      </td>
                      <td className="p-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <input type="number" className={`w-12 text-center font-black rounded-lg p-2 text-sm ${item.cantidad_actual < item.cantidad_minima ? 'bg-red-500 text-white' : 'bg-slate-100'}`} value={item.cantidad_actual} onChange={(e) => handleUpdate(item.id, 'cantidad_actual', parseInt(e.target.value) || 0)}/>
                          <span className="text-slate-300">/</span>
                          <input type="number" className="w-12 text-center font-black bg-slate-50 text-slate-400 rounded-lg p-2 text-sm" value={item.cantidad_minima} onChange={(e) => handleUpdate(item.id, 'cantidad_minima', parseInt(e.target.value) || 0)}/>
                        </div>
                      </td>
                      <td className="p-6 text-center font-black text-sm text-slate-600">${item.precio_unitario.toLocaleString()}</td>
                      <td className="p-6 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditandoId(editandoId === item.id ? null : item.id)} className="p-3 bg-slate-100 rounded-xl hover:bg-slate-900 hover:text-[#ffc600] transition-all"><Edit2 size={16}/></button>
                          <button onClick={() => deleteItem(item.id)} className="p-3 bg-red-50 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all"><Trash2 size={16}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Versión Mobile (Visible en < md) */}
            <div className="md:hidden divide-y divide-slate-100">
              {filtrados.map((item) => (
                <div key={item.id} className="p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase ${item.tipo === 'HERRAMIENTA' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{item.tipo}</span>
                      <h4 className="font-black text-slate-900 uppercase text-sm mt-1">{item.nombre}</h4>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditandoId(editandoId === item.id ? null : item.id)} className="p-2 bg-slate-100 rounded-lg"><Edit2 size={14}/></button>
                      <button onClick={() => deleteItem(item.id)} className="p-2 bg-red-50 text-red-500 rounded-lg"><Trash2 size={14}/></button>
                    </div>
                  </div>
                  
                  {editandoId === item.id ? (
                    <div className="space-y-2">
                      <input className="w-full border-2 border-blue-200 rounded-lg p-2 text-xs uppercase" value={item.nombre} onChange={(e) => handleUpdate(item.id, 'nombre', e.target.value)} placeholder="Nombre"/>
                      <input className="w-full border border-slate-200 rounded-lg p-2 text-xs uppercase" value={item.responsable || ''} onChange={(e) => handleUpdate(item.id, 'responsable', e.target.value)} placeholder="Responsable"/>
                      <input className="w-full border border-slate-200 rounded-lg p-2 text-xs uppercase" value={item.ubicacion || ''} onChange={(e) => handleUpdate(item.id, 'ubicacion', e.target.value)} placeholder="Ubicación"/>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="bg-slate-50 p-2 rounded-lg flex items-center gap-2 font-bold text-slate-500 italic"><User size={12}/> {item.responsable || 'S.A'}</div>
                      <div className="bg-slate-50 p-2 rounded-lg flex items-center gap-2 font-bold text-slate-500 italic"><MapPin size={12}/> {item.ubicacion || 'S.U'}</div>
                    </div>
                  )}

                  <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl">
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] font-black text-slate-400 uppercase">Stock:</span>
                       <input type="number" className={`w-10 text-center font-black rounded-md text-xs py-1 ${item.cantidad_actual < item.cantidad_minima ? 'bg-red-500 text-white' : 'bg-white'}`} value={item.cantidad_actual} onChange={(e) => handleUpdate(item.id, 'cantidad_actual', parseInt(e.target.value) || 0)}/>
                    </div>
                    <div className="text-right">
                       <p className="text-[8px] text-slate-400 uppercase font-black">Precio Unit.</p>
                       <p className="text-white font-black text-xs">${item.precio_unitario.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ASIDE RESPONSIVE */}
        <aside className="lg:col-span-3">
          <div className="sticky top-4 bg-[#1e293b] p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] shadow-2xl text-white border-t-8 border-[#ffc600]">
            <h3 className="text-[10px] font-black text-[#ffc600] uppercase tracking-widest mb-2 italic">Faltante Est.</h3>
            <div className="text-3xl md:text-4xl font-black tracking-tighter">${totalCotizacion.toLocaleString()}</div>
            <button onClick={() => setMostrarOC(true)} className="w-full mt-6 bg-[#ffc600] text-[#1e293b] py-4 rounded-xl font-black uppercase text-[11px] shadow-xl hover:scale-105 transition-all flex items-center justify-center gap-2">
              <FileText size={16}/> Orden Compra
            </button>
          </div>
        </aside>
      </div>

      {/* MODAL RESPONSIVE */}
      {mostrarOC && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm z-50 flex items-center justify-center p-2 md:p-4">
          <div className="bg-white w-full max-w-lg rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden shadow-2xl">
            <div className="bg-slate-900 p-6 md:p-8 text-white flex justify-between items-center">
              <h2 className="text-xl font-black italic uppercase">ORDEN <span className="text-[#ffc600]">INNVOLT</span></h2>
              <button onClick={() => setMostrarOC(false)} className="bg-white/10 p-2 rounded-full hover:bg-white/20"><X size={20}/></button>
            </div>
            <div className="p-6 md:p-8 space-y-6">
              <div className="bg-slate-50 p-6 rounded-2xl flex justify-between items-center border-2 border-dashed border-slate-200">
                <span className="font-black uppercase text-slate-500 text-xs">Total Compra:</span>
                <span className="text-2xl font-black text-slate-900 tracking-tighter">${totalCotizacion.toLocaleString()}</span>
              </div>
              <div className="flex flex-col md:flex-row gap-3">
                <PDFDownloadLink document={<OrdenCompraPDF items={faltantes} total={totalCotizacion} />} fileName={`OC_INNVOLT.pdf`} className="flex-1 bg-slate-900 text-white py-4 rounded-xl font-black uppercase text-[10px] flex items-center justify-center gap-2">
                  {({ loading }) => loading ? 'Cargando...' : <><FileDown size={18}/> Descargar PDF</>}
                </PDFDownloadLink>
                <button onClick={() => setMostrarOC(false)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-xl font-black uppercase text-[10px]">Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}