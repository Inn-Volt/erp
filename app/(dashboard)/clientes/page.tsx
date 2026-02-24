/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { 
  UserPlus, Search, Trash2, Building2, 
  Mail, Phone, MapPin, Loader2, Edit3, 
  FileText, X, Save, Copy, CheckCircle2,
  ExternalLink, AlertCircle, Check, 
  Globe, User as UserIcon, FilterX,
  Power, PowerOff
} from 'lucide-react';

// --- UTILIDADES DE VALIDACIÓN Y FORMATO ---

const validateRut = (rut: string) => {
  if (!rut) return false;
  const cleanRut = rut.replace(/\./g, '').replace(/-/g, '');
  if (cleanRut.length < 8) return false;
  const cuerpo = cleanRut.slice(0, -1);
  const dv = cleanRut.slice(-1).toLowerCase();
  let suma = 0;
  let multiplo = 2;
  for (let i = 1; i <= cuerpo.length; i++) {
    suma += multiplo * parseInt(cleanRut.charAt(cuerpo.length - i));
    if (multiplo < 7) multiplo = multiplo + 1; else multiplo = 2;
  }
  const dvEsperado = 11 - (suma % 11);
  const dvFinal = dvEsperado === 11 ? '0' : dvEsperado === 10 ? 'k' : dvEsperado.toString();
  return dv === dvFinal;
};

const formatRut = (value: string) => {
  const clean = value.replace(/[^0-9kK]/g, '');
  if (clean.length <= 1) return clean;
  const cuerpo = clean.slice(0, -1).slice(0, 8);
  const dv = clean.slice(-1).toUpperCase();
  return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + '-' + dv;
};

const formatPhone = (value: string) => {
  const clean = value.replace(/\D/g, '');
  if (clean.length <= 2) return clean.length > 0 ? `+${clean}` : '';
  if (clean.length <= 4) return `+${clean.slice(0, 2)} ${clean.slice(2)}`;
  return `+${clean.slice(0, 2)} ${clean.slice(2, 3)} ${clean.slice(3, 7)} ${clean.slice(7, 11)}`;
};

export default function ClientesPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  
  const [rutError, setRutError] = useState(false);
  const [notification, setNotification] = useState<{show: boolean, msg: string, type: 'success' | 'error'}>({
    show: false, msg: '', type: 'success'
  });

  const [formData, setFormData] = useState({
    nombre_cliente: '',
    rut: '',
    email: '',
    telefono: '',
    direccion: '',
    contacto_nombre: '',
    estado: 'activo'
  });

  useEffect(() => {
    fetchClientes();
  }, []);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setNotification({ show: true, msg, type });
    setTimeout(() => setNotification(prev => ({ ...prev, show: false })), 4000);
  };

  async function fetchClientes() {
    setLoading(true);
    const { data, error } = await supabase.from('clientes').select('*').order('nombre_cliente');
    if (error) showToast("Error al cargar datos", "error");
    if (data) setClientes(data);
    setLoading(false);
  }

  const handleOpenModal = (cliente?: any) => {
    setRutError(false);
    if (cliente) {
      setEditingId(cliente.id);
      setFormData({
        nombre_cliente: cliente.nombre_cliente,
        rut: cliente.rut,
        email: cliente.email || '',
        telefono: cliente.telefono || '',
        direccion: cliente.direccion || '',
        contacto_nombre: cliente.contacto_nombre || '',
        estado: cliente.estado || 'activo'
      });
    } else {
      setEditingId(null);
      setFormData({ nombre_cliente: '', rut: '', email: '', telefono: '', direccion: '', contacto_nombre: '', estado: 'activo' });
    }
    setShowModal(true);
  };

  const toggleEstado = async (id: string, estadoActual: string) => {
    const nuevoEstado = estadoActual === 'activo' ? 'inactivo' : 'activo';
    const { error } = await supabase.from('clientes').update({ estado: nuevoEstado }).eq('id', id);
    if (error) showToast("Error al cambiar estado", "error");
    else {
      showToast(`Cliente ${nuevoEstado.toUpperCase()}`, "success");
      fetchClientes();
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (formData.rut && !validateRut(formData.rut)) {
      setRutError(true);
      showToast("RUT Chileno no válido", "error");
      return;
    }

    setIsSubmitting(true);
    const normalizedData = {
      ...formData,
      nombre_cliente: formData.nombre_cliente.trim().toUpperCase(),
      email: formData.email.trim().toLowerCase(),
      contacto_nombre: formData.contacto_nombre.trim()
    };

    try {
      if (editingId) {
        const { error } = await supabase.from('clientes').update(normalizedData).eq('id', editingId);
        if (error) throw error;
        showToast("Cliente actualizado correctamente", "success");
      } else {
        const { error } = await supabase.from('clientes').insert([normalizedData]);
        if (error) throw error;
        showToast("Nuevo cliente registrado", "success");
      }
      setShowModal(false);
      fetchClientes();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  // --- LÓGICA DE ELIMINACIÓN REFORZADA ---
  const handleEliminar = async (id: string, nombre: string) => {
    if(window.confirm(`¿Estás seguro de eliminar permanentemente a "${nombre}"?`)) {
        try {
            const { error } = await supabase.from('clientes').delete().eq('id', id);
            
            if (error) {
                // El error 23503 es "violación de llave foránea" en Postgres
                if (error.code === '23503') {
                    showToast("No se puede borrar: Este cliente tiene cotizaciones o registros asociados. Desactívalo en su lugar.", "error");
                } else {
                    showToast(`Error: ${error.message}`, "error");
                }
            } else {
                showToast("Cliente eliminado de la base de datos", "success");
                fetchClientes();
            }
        } catch (err) {
            showToast("Ocurrió un error inesperado al intentar eliminar", "error");
        }
    }
  };

  const clientesFiltrados = clientes.filter(c => {
    const search = searchTerm.toLowerCase();
    const cleanSearch = search.replace(/\./g, '').replace(/-/g, '');
    const cleanRut = c.rut?.replace(/\./g, '').replace(/-/g, '').toLowerCase();
    return (
      c.nombre_cliente.toLowerCase().includes(search) ||
      cleanRut?.includes(cleanSearch) ||
      c.contacto_nombre?.toLowerCase().includes(search)
    );
  });

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-10 lg:p-14 max-w-[1600px] mx-auto space-y-10 animate-in fade-in duration-500">
      
      {/* TOAST NOTIFICATION */}
      {notification.show && (
        <div className={`fixed top-10 right-10 z-[200] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-right duration-300 ${notification.type === 'success' ? 'bg-slate-900 text-[#ffc600]' : 'bg-red-600 text-white'}`}>
          {notification.type === 'success' ? <Check size={20}/> : <AlertCircle size={20}/>}
          <span className="text-xs font-black uppercase tracking-widest">{notification.msg}</span>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-[#ffc600] p-2 rounded-xl shadow-lg shadow-[#ffc600]/20">
              <Globe size={18} className="text-[#0f172a]" />
            </div>
            <span className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400">InnVolt OS • Cartera Mandantes</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">
            CLIENTES <span className="text-[#ffc600] font-outline-2">CRM</span>
          </h1>
        </div>

        <button 
          onClick={() => handleOpenModal()}
          className="w-full md:w-auto bg-[#0f172a] text-[#ffc600] px-10 py-5 rounded-[2rem] font-black text-[12px] uppercase tracking-widest hover:bg-black transition-all shadow-2xl flex items-center justify-center gap-3 border-b-4 border-[#ffc600]/30 active:scale-95"
        >
          <UserPlus size={20} /> Nuevo Cliente
        </button>
      </div>

      {/* STATS & SEARCH */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center justify-between">
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base de Datos</p>
                <p className="text-4xl font-black text-slate-900">{clientesFiltrados.length}</p>
            </div>
            <div className="h-14 w-14 bg-slate-50 rounded-3xl flex items-center justify-center text-[#ffc600]">
                <Building2 size={28} />
            </div>
        </div>
        <div className="md:col-span-3 relative group">
          <Search className="absolute left-8 top-1/2 -translate-y-6 text-slate-300 group-focus-within:text-[#ffc600] transition-colors" size={24} />
          <input 
            type="text"
            placeholder="Buscar por Empresa, RUT o Contacto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border-2 border-slate-100 rounded-[2.5rem] py-8 pl-20 pr-8 text-sm font-bold outline-none focus:border-[#ffc600] transition-all shadow-sm placeholder:text-slate-900"
          />
        </div>
      </div>

      {/* CARDS LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {loading ? (
          Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-96 bg-white border border-slate-100 rounded-[3rem] animate-pulse p-10 space-y-6">
              <div className="h-16 w-16 bg-slate-100 rounded-2xl" />
              <div className="h-8 w-3/4 bg-slate-100 rounded-lg" />
              <div className="h-20 w-full bg-slate-50 rounded-2xl" />
            </div>
          ))
        ) : clientesFiltrados.length > 0 ? (
          clientesFiltrados.map((c) => (
            <div key={c.id} className={`bg-white rounded-[3rem] p-10 border transition-all group relative overflow-hidden shadow-sm hover:shadow-2xl flex flex-col justify-between min-h-[440px] ${c.estado === 'inactivo' ? 'bg-slate-50/50' : 'hover:border-[#ffc600] border-slate-100'}`}>
              
              <div className="absolute top-8 right-8 flex gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                <button 
                  onClick={() => toggleEstado(c.id, c.estado)}
                  className={`p-3 rounded-2xl transition-all ${c.estado === 'activo' ? 'bg-green-100 text-green-600 hover:bg-green-600 hover:text-white' : 'bg-red-100 text-red-600 hover:bg-red-600 hover:text-white'}`}
                  title={c.estado === 'activo' ? 'Desactivar' : 'Activar'}
                >
                  {c.estado === 'activo' ? <Power size={16} /> : <PowerOff size={16} />}
                </button>
                <button onClick={() => handleOpenModal(c)} className="p-3 bg-slate-100 rounded-2xl text-slate-500 hover:bg-slate-900 hover:text-[#ffc600] transition-all">
                  <Edit3 size={16} />
                </button>
                <button onClick={() => handleEliminar(c.id, c.nombre_cliente)} className="p-3 bg-slate-100 rounded-2xl text-slate-500 hover:bg-red-500 hover:text-white transition-all">
                  <Trash2 size={16} />
                </button>
              </div>

              <div>
                <div className={`h-16 w-16 rounded-2xl flex items-center justify-center mb-6 transition-all shadow-inner ${c.estado === 'activo' ? 'bg-slate-900 text-[#ffc600] group-hover:scale-110' : 'bg-slate-200 text-slate-400'}`}>
                  <Building2 size={30} />
                </div>
                
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${c.estado === 'activo' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {c.estado}
                  </span>
                </div>

                <h3 className={`text-2xl font-black uppercase italic leading-tight line-clamp-2 min-h-[4rem] ${c.estado === 'inactivo' ? 'text-slate-400' : 'text-slate-900'}`}>
                  {c.nombre_cliente}
                </h3>
                
                <div className="flex flex-wrap gap-2 mt-4">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(c.rut);
                      setCopyStatus(c.id);
                      setTimeout(() => setCopyStatus(null), 2000);
                    }}
                    className="text-[10px] font-black text-slate-400 tracking-widest flex items-center gap-2 hover:text-[#ffc600] transition-colors bg-slate-50 px-3 py-1.5 rounded-xl border border-transparent hover:border-slate-200"
                  >
                    {copyStatus === c.id ? <CheckCircle2 size={12} className="text-green-500"/> : <Copy size={12}/>}
                    {c.rut || 'SIN RUT'}
                  </button>
                  {c.contacto_nombre && (
                    <span className="text-[9px] font-bold text-slate-500 uppercase bg-slate-100 px-3 py-1.5 rounded-xl flex items-center gap-1">
                      <UserIcon size={10} /> {c.contacto_nombre}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-4 border-t border-slate-50 pt-8 mt-8">
                <div className="flex items-center gap-4 text-slate-500 text-xs font-bold">
                  <div className="h-8 w-8 bg-slate-50 rounded-lg flex items-center justify-center text-[#ffc600]"><Mail size={14}/></div>
                  <span className="truncate lowercase">{c.email || 'Sin correo'}</span>
                </div>
                <div className="flex items-center gap-4 text-slate-500 text-xs font-bold">
                  <div className="h-8 w-8 bg-slate-50 rounded-lg flex items-center justify-center text-[#ffc600]"><Phone size={14}/></div>
                  {c.telefono || 'Sin teléfono'}
                </div>
                
                <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.direccion || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-4 text-slate-400 text-[11px] font-bold hover:text-red-500 transition-colors group/map"
                >
                  <div className="h-8 w-8 bg-slate-50 rounded-lg flex items-center justify-center text-red-400 shrink-0 group-hover/map:bg-red-50 transition-all"><MapPin size={14}/></div>
                  <span className="line-clamp-2 pt-1 uppercase leading-tight">{c.direccion || 'Sin dirección'}</span>
                  <ExternalLink size={10} className="mt-2 opacity-0 group-hover/map:opacity-100" />
                </a>
              </div>

              <button 
                disabled={c.estado === 'inactivo'}
                onClick={() => router.push(`/cotizador?clienteId=${c.id}`)}
                className="mt-10 w-full py-5 bg-slate-900 text-[#ffc600] rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all disabled:opacity-20 disabled:cursor-not-allowed group"
              >
                <FileText size={16} className="group-hover:rotate-12 transition-transform" /> Nueva Cotización
              </button>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-300 space-y-4">
            <FilterX size={64} strokeWidth={1} />
            <p className="font-black uppercase tracking-widest text-sm">No se encontraron clientes</p>
          </div>
        )}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in duration-300">
            <div className="bg-slate-900 p-10 text-white flex justify-between items-center relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-3xl font-black uppercase italic tracking-tighter">
                  {editingId ? 'Editar' : 'Nuevo'} <span className="text-[#ffc600]">Cliente</span>
                </h2>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em]">Gestión de Mandantes InnVolt</p>
              </div>
              <button onClick={() => setShowModal(false)} className="relative z-10 p-4 bg-white/10 rounded-2xl hover:bg-red-500 transition-all">
                <X size={20} />
              </button>
              <Building2 className="absolute -right-4 -bottom-4 text-white/5" size={150} />
            </div>

            <form onSubmit={handleSubmit} className="p-10 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Razón Social</label>
                <input required placeholder="EJ: INGENIERÍA ELÉCTRICA SPA" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-[#ffc600] transition-all uppercase" value={formData.nombre_cliente} onChange={e => setFormData({...formData, nombre_cliente: e.target.value})} />
              </div>

              <div className="space-y-2">
                <label className={`text-[10px] font-black uppercase ml-2 tracking-widest ${rutError ? 'text-red-500' : 'text-slate-400'}`}>
                  RUT {rutError && '• (INVÁLIDO)'}
                </label>
                <input required placeholder="12.345.678-9" className={`w-full bg-slate-50 border-2 rounded-2xl p-4 font-bold outline-none transition-all ${rutError ? 'border-red-500' : 'border-slate-100 focus:border-[#ffc600]'}`} value={formData.rut} onChange={e => { setRutError(false); setFormData({...formData, rut: formatRut(e.target.value)}); }} />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Estado</label>
                <select 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-[#ffc600] appearance-none cursor-pointer"
                  value={formData.estado}
                  onChange={e => setFormData({...formData, estado: e.target.value})}
                >
                  <option value="activo">ACTIVO</option>
                  <option value="inactivo">INACTIVO</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Contacto Directo</label>
                <input placeholder="Nombre de la persona" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-[#ffc600] transition-all" value={formData.contacto_nombre} onChange={e => setFormData({...formData, contacto_nombre: e.target.value})} />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Email</label>
                <input type="email" placeholder="correo@empresa.cl" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-[#ffc600] transition-all" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Teléfono</label>
                <input placeholder="+56 9 ..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-[#ffc600] transition-all" value={formData.telefono} onChange={e => setFormData({...formData, telefono: formatPhone(e.target.value)})} />
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Dirección Fiscal / Obra</label>
                <input placeholder="Av. Ejemplo 123, Ciudad" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-[#ffc600] transition-all" value={formData.direccion} onChange={e => setFormData({...formData, direccion: e.target.value})} />
              </div>

              <div className="md:col-span-2 pt-6">
                <button 
                  disabled={isSubmitting}
                  type="submit"
                  className="w-full bg-slate-900 text-[#ffc600] py-6 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : <><Save size={20} /> {editingId ? 'Actualizar' : 'Guardar'} Cliente</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}