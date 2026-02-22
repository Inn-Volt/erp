'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  UserPlus, Search, Trash2, Building2, 
  Mail, Phone, MapPin, Loader2 
} from 'lucide-react';

// --- FUNCIONES DE FORMATEO ---
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
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre_cliente: '',
    rut: '',
    email: '',
    telefono: '',
    direccion: ''
  });

  useEffect(() => {
    fetchClientes();
  }, []);

  async function fetchClientes() {
    setLoading(true);
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nombre_cliente', { ascending: true });
    
    if (data) setClientes(data);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoCliente.nombre_cliente) return alert("El nombre es obligatorio");
    
    setIsSubmitting(true);
    const { error } = await supabase.from('clientes').insert([nuevoCliente]);

    if (!error) {
      setNuevoCliente({ nombre_cliente: '', rut: '', email: '', telefono: '', direccion: '' });
      fetchClientes();
    } else {
      alert("Error al registrar: " + error.message);
    }
    setIsSubmitting(false);
  }

  async function eliminarCliente(id: string) {
    if (!confirm('¿Seguro que deseas eliminar este cliente?')) return;
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (!error) fetchClientes();
  }

  const clientesFiltrados = clientes.filter(c => 
    c.nombre_cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.rut.includes(searchTerm)
  );

  return (
    <div className="p-4 md:p-10 max-w-7xl mx-auto space-y-6 md:space-y-10">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-3xl md:text-4xl font-black text-slate-800 uppercase italic tracking-tighter">
            Clientes Inn<span className="text-[#ffc600]">Volt</span>
          </h2>
          <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-[0.3em] mt-1 italic">Base de Datos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10">
        
        {/* FORMULARIO DE REGISTRO */}
        <div className="lg:col-span-4 order-2 lg:order-1">
          <form onSubmit={handleSubmit} className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-slate-200 shadow-xl space-y-4 lg:sticky lg:top-28">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2 md:mb-4 flex items-center gap-2">
              <UserPlus size={18} className="text-[#ffc600]"/> Nuevo Registro
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-tighter">Nombre / Razón Social</label>
                <input 
                  type="text"
                  required
                  placeholder="CONSTRUCTORA SPA"
                  value={nuevoCliente.nombre_cliente}
                  onChange={(e) => setNuevoCliente({...nuevoCliente, nombre_cliente: e.target.value.toUpperCase()})}
                  className="text-slate-900 w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-[#ffc600] transition-all outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-tighter">RUT</label>
                  <input 
                    type="text"
                    placeholder="12.345.678-9"
                    value={nuevoCliente.rut}
                    onChange={(e) => setNuevoCliente({...nuevoCliente, rut: formatRut(e.target.value)})}
                    className="text-slate-900 w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-[#ffc600] transition-all outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-tighter">Teléfono</label>
                  <input 
                    type="text"
                    placeholder="+56 9..."
                    value={nuevoCliente.telefono}
                    onChange={(e) => setNuevoCliente({...nuevoCliente, telefono: formatPhone(e.target.value)})}
                    className="text-slate-900 w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-[#ffc600] transition-all outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-tighter">Email Corporativo</label>
                <input 
                  type="email"
                  placeholder="correo@empresa.cl"
                  value={nuevoCliente.email}
                  onChange={(e) => setNuevoCliente({...nuevoCliente, email: e.target.value.toLowerCase()})}
                  className="text-slate-900 w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-[#ffc600] transition-all outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-tighter">Dirección Fiscal</label>
                <input 
                  type="text"
                  placeholder="Av. Principal 123..."
                  value={nuevoCliente.direccion}
                  onChange={(e) => setNuevoCliente({...nuevoCliente, direccion: e.target.value})}
                  className="text-slate-900 w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-[#ffc600] transition-all outline-none"
                />
              </div>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#1e293b] text-[#ffc600] py-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-black transition-all shadow-xl shadow-yellow-500/10 mt-4 flex justify-center items-center active:scale-95"
              >
                {isSubmitting ? <Loader2 className="animate-spin" /> : 'Registrar Cliente'}
              </button>
            </div>
          </form>
        </div>

        {/* LISTA DE CLIENTES */}
        <div className="lg:col-span-8 space-y-4 order-1 lg:order-2">
          <div className="bg-white border border-slate-200 rounded-[2rem] md:rounded-[2.5rem] overflow-hidden shadow-sm">
            
            {/* BARRA DE BÚSQUEDA */}
            <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="relative w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nombre o RUT..." 
                  className="text-slate-900 w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-[11px] md:text-xs font-bold outline-none focus:ring-2 focus:ring-[#ffc600] transition-all shadow-sm"
                />
              </div>
            </div>

            {/* TABLA RESPONSIVE */}
            <div className="overflow-x-auto">
              {/* Vista Mobile (Cards que aparecen solo en pequeño) */}
              <div className="block md:hidden divide-y divide-slate-100">
                {clientesFiltrados.map((c) => (
                  <div key={c.id} className="p-4 space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#ffc600] rounded-xl flex items-center justify-center text-[#1e293b]">
                          <Building2 size={18} />
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-800 uppercase leading-none">{c.nombre_cliente}</p>
                          <p className="text-[10px] text-slate-400 font-bold mt-1">{c.rut || 'SIN RUT'}</p>
                        </div>
                      </div>
                      <button onClick={() => eliminarCliente(c.id)} className="p-2 text-red-400">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 pl-12">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                        <Mail size={12} className="text-[#ffc600]"/> {c.email || 'N/A'}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                        <Phone size={12} className="text-[#ffc600]"/> {c.telefono || 'N/A'}
                      </div>
                      <div className="flex items-start gap-2 text-[10px] font-bold text-slate-500">
                        <MapPin size={12} className="text-red-400 shrink-0"/> {c.direccion || 'No registrada'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Vista Desktop (Tabla clásica para pantallas medianas/grandes) */}
              <table className="hidden md:table w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Mandante / RUT</th>
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contacto</th>
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ubicación</th>
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan={4} className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-[#ffc600]"/></td></tr>
                  ) : clientesFiltrados.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-all group">
                      <td className="p-6">
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 bg-slate-100 rounded-2xl flex items-center justify-center text-[#1e293b] font-black group-hover:bg-[#ffc600] group-hover:text-[#1e293b] transition-all shadow-sm">
                            <Building2 size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800 uppercase leading-none tracking-tight">{c.nombre_cliente}</p>
                            <p className="text-[10px] text-slate-400 font-bold mt-1.5">{c.rut || 'SIN RUT'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                            <Mail size={13} className="text-[#ffc600]"/> {c.email || 'N/A'}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                            <Phone size={13} className="text-[#ffc600]"/> {c.telefono || 'N/A'}
                          </div>
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="flex items-start gap-2 text-[11px] font-bold text-slate-500 max-w-[200px]">
                          <MapPin size={13} className="text-red-400 mt-0.5 shrink-0"/> 
                          <span className="line-clamp-2">{c.direccion || 'No registrada'}</span>
                        </div>
                      </td>
                      <td className="p-6">
                        <button 
                          onClick={() => eliminarCliente(c.id)}
                          className="p-3 text-slate-300 hover:text-white hover:bg-red-500 rounded-xl transition-all shadow-sm"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {!loading && clientesFiltrados.length === 0 && (
                <div className="p-10 md:p-20 text-center space-y-4">
                   <Search size={40} className="mx-auto text-slate-200" />
                   <p className="text-slate-400 font-black uppercase text-xs tracking-widest">No hay resultados</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}