'use client';

/**
 * Comercial → Proyectos (TecApp): agrupan las cotizaciones y las OT de un mismo trabajo
 * grande, con lo vendido, lo gastado y el avance (OT terminadas sobre el total).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import NuevoProyecto from '@/components/proyectos/NuevoProyecto';
import { ESTADOS_PROYECTO, faltaFase5, folioProyecto, proyectosService, type Proyecto, type ResumenProyecto } from '@/services/fase5';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { formatCLP, formatDate } from '@/utils';

export default function ProyectosPage() {
  const router = useRouter();
  const { puede } = usePermisos();
  const { error: toastError } = useToast();
  const [lista, setLista] = useState<Proyecto[]>([]);
  const [res, setRes] = useState<Record<string, ResumenProyecto>>({});
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'activos' | 'todos' | Proyecto['estado']>('activos');

  const cargar = useCallback(async () => {
    try { const [p, r] = await Promise.all([proyectosService.listar(), proyectosService.resumenes()]); setLista(p); setRes(r); }
    catch (e) { if (faltaFase5(e)) setFalta(true); else toastError(e instanceof Error ? e.message : 'No se pudo cargar'); }
    finally { setCargando(false); }
  }, [toastError]);
  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter(p => filtro === 'todos' ? true : filtro === 'activos' ? ['planificado', 'en_curso', 'en_pausa'].includes(p.estado) : p.estado === filtro)
      .filter(p => !q || `${folioProyecto(p.folio)} ${p.nombre} ${p.clientes?.nombre_cliente || ''}`.toLowerCase().includes(q));
  }, [lista, filtro, busca]);

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Comercial" title="Proyectos" /><FaltaSQL /></div>;

  return (
    <div className="anim-in">
      {nuevo && <NuevoProyecto onCerrar={() => setNuevo(false)} onListo={id => router.push(`/proyectos/${id}`)} />}
      <PageHeader eyebrow="Comercial" title="Proyectos" subtitle="Trabajos grandes con varias cotizaciones y órdenes de trabajo."
        actions={puede('proyectos.gestionar') ? <button className="btn btn-primary" onClick={() => setNuevo(true)}><Plus size={14} /> Nuevo proyecto</button> : null} />
      <div className="panel-y">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input className="input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar proyecto o cliente…" style={{ paddingLeft: '2.2rem' }} />
          </div>
          <select className="input" style={{ maxWidth: 190 }} value={filtro} onChange={e => setFiltro(e.target.value as typeof filtro)}>
            <option value="activos">Activos</option><option value="todos">Todos</option>
            {ESTADOS_PROYECTO.map(e => <option key={e.clave} value={e.clave}>{e.nombre}</option>)}
          </select>
        </div>
        {cargando ? <div style={{ padding: '1.5rem' }}><div className="skeleton" style={{ height: 120 }} /></div>
          : filtrados.length === 0 ? <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>No hay proyectos en esta vista.</p>
          : filtrados.map(p => {
            const r = res[p.id];
            const e = ESTADOS_PROYECTO.find(x => x.clave === p.estado)!;
            const avance = r && r.ots ? Math.round((r.ots_terminadas / r.ots) * 100) : 0;
            return (
              <Link key={p.id} href={`/proyectos/${p.id}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '0.85rem 1rem', borderTop: '1px solid var(--border2)', textDecoration: 'none', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: 'var(--y)', minWidth: 70 }}>{folioProyecto(p.folio)}</span>
                <span style={{ flex: 1, minWidth: 200 }}>
                  <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)' }}>{p.nombre}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{p.clientes?.nombre_cliente || 'Sin cliente'}{p.fecha_fin ? ` · término ${formatDate(p.fecha_fin)}` : ''}</span>
                </span>
                <span style={{ minWidth: 140 }}>
                  <span style={{ display: 'block', height: 6, borderRadius: 3, background: 'var(--bg3)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${avance}%`, background: 'var(--success)' }} /></span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{r?.ots_terminadas || 0}/{r?.ots || 0} OT · {avance} %</span>
                </span>
                <span style={{ textAlign: 'right', minWidth: 110 }}>
                  <b style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{formatCLP(Number(r?.venta || 0))}</b>
                  <span className="badge" style={{ display: 'block', marginTop: 2, background: e.color, color: '#fff', fontSize: '0.68rem' }}>{e.nombre}</span>
                </span>
              </Link>
            );
          })}
      </div>
    </div>
  );
}
