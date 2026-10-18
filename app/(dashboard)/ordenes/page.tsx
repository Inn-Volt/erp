'use client';

/**
 * Operación → Órdenes de trabajo (como los tickets de TecApp).
 * La visita técnica es una OT: se crea a mano o desde una solicitud (/ordenes?solicitud=<id>),
 * el técnico recibe el aviso en el celular, hace el informe y desde la OT se cotiza. Una
 * cotización aprobada sin OT genera la suya sola. El técnico ve solo las suyas.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, Plus, Search, Loader2, X, CalendarDays, User, MapPin } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import ChipEstadoOT from '@/components/ChipEstadoOT';
import PlantillasInforme from '@/components/ot/PlantillasInforme';
import { otService, sucursalesService, ESTADOS_OT, folioOT, faltaFase2, type OrdenTrabajo, type EstadoOT, type Sucursal } from '@/services/operacion';
import { clientesService } from '@/services/clientes';
import { solicitudesService } from '@/services/solicitudes';
import { tituloCorto } from '@/lib/textoFormato';
import { vendedoresService } from '@/services/vendedores';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { formatDate } from '@/utils';
import type { Cliente, Vendedor } from '@/types';

const ABIERTAS: EstadoOT[] = ['por_coordinar', 'coordinada', 'en_progreso', 'en_pausa', 'ejecutada'];

interface InicialOT { titulo?: string; descripcion?: string; cliente_id?: string | null; direccion?: string | null; solicitud_id?: string | null; prioridad?: string }

function NuevaOT({ clientes, equipo, inicial, onClose, onCreada }: { clientes: Cliente[]; equipo: Vendedor[]; inicial?: InicialOT | null; onClose: () => void; onCreada: (id: string) => void }) {
  const { error: toastError } = useToast();
  const [f, setF] = useState({ titulo: inicial?.titulo || '', descripcion: inicial?.descripcion || '', cliente_id: inicial?.cliente_id || '', direccion: inicial?.direccion || '',
    prioridad: inicial?.prioridad || 'Media', fecha_programada: '', tecnicos: [] as string[], sucursal_id: '' });
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  useEffect(() => {
    setSucursales([]);
    if (f.cliente_id) sucursalesService.deCliente(f.cliente_id).then(r => setSucursales(r.sucursales)).catch(() => {});
  }, [f.cliente_id]);
  const [guardando, setGuardando] = useState(false);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.titulo.trim()) { toastError('Ponle un título a la OT'); return; }
    setGuardando(true);
    try {
      const ot = await otService.crear({
        titulo: f.titulo.trim(), descripcion: f.descripcion.trim() || null, cliente_id: f.cliente_id || null,
        direccion: f.direccion.trim() || null, sucursal_id: f.sucursal_id || null, prioridad: f.prioridad as OrdenTrabajo['prioridad'],
        fecha_programada: f.fecha_programada || null, tecnicos: f.tecnicos, solicitud_id: inicial?.solicitud_id || null,
        estado: f.fecha_programada && f.tecnicos.length ? 'coordinada' : 'por_coordinar',
      });
      onCreada(ot.id);
    } catch (err) { toastError(err instanceof Error ? err.message : 'No se pudo crear'); }
    finally { setGuardando(false); }
  };
  return (
    <div className="modal-overlay">
      <form onSubmit={enviar} className="modal-box" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}><ClipboardList size={16} /> {inicial?.solicitud_id ? 'OT de visita técnica (desde la solicitud)' : 'Nueva orden de trabajo'}</p>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div><label className="label-muted" style={{ display: 'block', marginBottom: 6 }}>Qué hay que hacer *</label>
            <input className="input" value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="Mantención tablero general" autoFocus /></div>
          <div><label className="label-muted" style={{ display: 'block', marginBottom: 6 }}>Cliente</label>
            <select className="input" value={f.cliente_id} onChange={e => { const c = clientes.find(x => x.id === e.target.value); setF({ ...f, cliente_id: e.target.value, sucursal_id: '', direccion: f.direccion || c?.direccion || '' }); }}>
              <option value="">Sin cliente</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre_cliente}</option>)}
            </select></div>
          {sucursales.length > 0 && <div><label className="label-muted" style={{ display: 'block', marginBottom: 6 }}>Sucursal / obra</label>
            <select className="input" value={f.sucursal_id} onChange={e => { const s = sucursales.find(x => x.id === e.target.value); setF({ ...f, sucursal_id: e.target.value, direccion: s?.direccion ? `${s.direccion}${s.comuna ? ', ' + s.comuna : ''}` : f.direccion }); }}>
              <option value="">Casa matriz / otra</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select></div>}
          <div><label className="label-muted" style={{ display: 'block', marginBottom: 6 }}>Dirección</label>
            <input className="input" value={f.direccion} onChange={e => setF({ ...f, direccion: e.target.value })} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label-muted" style={{ display: 'block', marginBottom: 6 }}>Prioridad</label>
              <select className="input" value={f.prioridad} onChange={e => setF({ ...f, prioridad: e.target.value })}>
                {['Baja', 'Media', 'Alta', 'Urgente'].map(p => <option key={p}>{p}</option>)}</select></div>
            <div><label className="label-muted" style={{ display: 'block', marginBottom: 6 }}>Fecha</label>
              <input className="input" type="date" value={f.fecha_programada} onChange={e => setF({ ...f, fecha_programada: e.target.value })} /></div>
          </div>
          <div><p className="label-muted" style={{ marginBottom: 6 }}>Técnicos</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {equipo.map(p => { const on = f.tecnicos.includes(p.id!); return (
                <button type="button" key={p.id} onClick={() => setF({ ...f, tecnicos: on ? f.tecnicos.filter(x => x !== p.id) : [...f.tecnicos, p.id!] })}
                  className="badge" style={{ cursor: 'pointer', padding: '0.35rem 0.7rem', background: on ? 'var(--y-soft)' : 'var(--bg3)', color: on ? 'var(--text)' : 'var(--muted)', border: `1px solid ${on ? 'var(--y-brand)' : 'var(--border2)'}` }}>{p.nombre}</button>); })}
            </div></div>
          <div><label className="label-muted" style={{ display: 'block', marginBottom: 6 }}>Detalle</label>
            <textarea className="input" rows={3} value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} /></div>
        </div>
        <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Plus size={14} />} Crear OT</button>
        </div>
      </form>
    </div>
  );
}

export default function OrdenesPage() {
  const router = useRouter();
  const { perfil, puede } = usePermisos();
  const { error: toastError } = useToast();
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [equipo, setEquipo] = useState<Record<string, Vendedor>>({});
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  const [filtro, setFiltro] = useState<'abiertas' | 'todas' | EstadoOT>('abiertas');
  const [mias, setMias] = useState(false);
  const [busca, setBusca] = useState('');
  const [nueva, setNueva] = useState(false);
  const [plantillas, setPlantillas] = useState(false);
  const [inicial, setInicial] = useState<InicialOT | null>(null);

  // /ordenes?nueva=1 abre el formulario; /ordenes?solicitud=<id> lo llena con la solicitud.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const sol = q.get('solicitud');
    if (sol) {
      solicitudesService.getById(sol).then(x => {
        if (!x) return;
        setInicial({
          titulo: `Visita técnica: ${tituloCorto(x.descripcion, 60)}`, descripcion: x.descripcion, cliente_id: x.cliente_id,
          direccion: x.clientes?.direccion || null, solicitud_id: x.id, prioridad: x.prioridad,
        });
        setNueva(true);
      }).catch(() => setNueva(true));
    } else if (q.get('nueva')) setNueva(true);
  }, []);

  const cargar = useCallback(async () => {
    try {
      const [o, e] = await Promise.all([otService.listar(), vendedoresService.mapa()]);
      setOts(o); setEquipo(e);
    } catch (err) {
      if (faltaFase2(err)) setFalta(true); else toastError('No se pudieron cargar las OT: ' + (err instanceof Error ? err.message : ''));
    } finally { setCargando(false); }
  }, [toastError]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (nueva && !clientes.length) clientesService.getAll().then(setClientes).catch(() => {}); }, [nueva, clientes.length]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ots.filter(o => (filtro === 'todas' ? true : filtro === 'abiertas' ? ABIERTAS.includes(o.estado) : o.estado === filtro))
      .filter(o => !mias || (perfil && o.tecnicos.includes(perfil.id)))
      .filter(o => !q || `${folioOT(o.folio)} ${o.titulo} ${o.clientes?.nombre_cliente || ''} ${o.direccion || ''}`.toLowerCase().includes(q));
  }, [ots, filtro, mias, busca, perfil]);

  const cuenta = (e: EstadoOT) => ots.filter(o => o.estado === e).length;

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Operación" title="Órdenes de trabajo" /><FaltaSQL /></div>;

  return (
    <div className="anim-in">
      {nueva && <NuevaOT clientes={clientes} equipo={Object.values(equipo)} inicial={inicial} onClose={() => { setNueva(false); setInicial(null); }} onCreada={id => router.push(`/ordenes/${id}`)} />}
      <PageHeader eyebrow="Operación" title="Órdenes de trabajo"
        subtitle="Lo que hay que ejecutar. Cada cotización aceptada crea su OT sola."
        actions={puede('ot.crear') ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => setPlantillas(true)}>Plantillas de informe</button>
          <button className="btn btn-primary" onClick={() => setNueva(true)}><Plus size={14} /> Nueva OT</button></div> : null} />
      {plantillas && <PlantillasInforme onCerrar={() => setPlantillas(false)} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 8, marginBottom: 12 }}>
        {ESTADOS_OT.filter(e => ABIERTAS.includes(e.clave)).map(e => (
          <button key={e.clave} onClick={() => setFiltro(filtro === e.clave ? 'abiertas' : e.clave)} className="kpi-card"
            style={{ cursor: 'pointer', textAlign: 'left', border: filtro === e.clave ? `1px solid ${e.color}` : undefined }}>
            <p className="label-muted">{e.nombre}</p>
            <p className="kpi-value" style={{ color: e.color }}>{cuenta(e.clave)}</p>
          </button>
        ))}
      </div>

      <div className="panel-y">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input className="input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar OT, cliente o dirección…" style={{ paddingLeft: '2.2rem' }} />
          </div>
          <select className="input" style={{ maxWidth: 190 }} value={filtro} onChange={e => setFiltro(e.target.value as typeof filtro)}>
            <option value="abiertas">Abiertas</option><option value="todas">Todas</option>
            {ESTADOS_OT.map(e => <option key={e.clave} value={e.clave}>{e.nombre}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.86rem', color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={mias} onChange={e => setMias(e.target.checked)} style={{ accentColor: 'var(--y-brand)' }} /> Solo las mías
          </label>
        </div>
        {cargando ? <div style={{ padding: '1.5rem' }}><div className="skeleton" style={{ height: 120 }} /></div>
          : lista.length === 0 ? <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>No hay órdenes en esta vista.</p>
          : lista.map(o => (
            <Link key={o.id} href={`/ordenes/${o.id}`} style={{ display: 'flex', gap: 12, padding: '0.85rem 1rem', borderTop: '1px solid var(--border2)', textDecoration: 'none', alignItems: 'flex-start' }}>
              <span style={{ fontWeight: 700, color: 'var(--y)', fontSize: '0.86rem', minWidth: 64, fontVariantNumeric: 'tabular-nums' }}>{folioOT(o.folio)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.titulo}</span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.8rem', fontSize: '0.78rem', color: 'var(--muted)', marginTop: 3 }}>
                  {o.clientes?.nombre_cliente && <span><User size={11} style={{ verticalAlign: -1 }} /> {o.clientes.nombre_cliente}</span>}
                  {o.direccion && <span style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><MapPin size={11} style={{ verticalAlign: -1 }} /> {o.direccion}</span>}
                  {o.fecha_programada && <span><CalendarDays size={11} style={{ verticalAlign: -1 }} /> {formatDate(o.fecha_programada)}</span>}
                  {o.tecnicos.length > 0 && <span>{o.tecnicos.map(t => equipo[t]?.nombre?.split(' ')[0] || '…').join(', ')}</span>}
                </span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <ChipEstadoOT estado={o.estado} />
                {o.prioridad !== 'Media' && <span style={{ fontSize: '0.72rem', color: o.prioridad === 'Urgente' || o.prioridad === 'Alta' ? 'var(--danger)' : 'var(--muted)' }}>{o.prioridad}</span>}
              </span>
            </Link>
          ))}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border2)', color: 'var(--muted)', fontSize: '0.78rem' }}>{lista.length} órdenes</div>
      </div>
    </div>
  );
}
