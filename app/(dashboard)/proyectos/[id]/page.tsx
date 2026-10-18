'use client';

/**
 * Detalle de un proyecto: lo vendido (cotizaciones aprobadas), lo que espera respuesta,
 * los costos (materiales de bodega y gastos de sus OT), el avance y sus cotizaciones,
 * OT y tareas. Se le unen cotizaciones u OT existentes, o se crean nuevas.
 */

import { ChipTrabajo } from '@/components/trabajos/TrabajoPanel';
import { encendido } from '@/lib/modulos';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ClipboardList, Edit3, FileText, ListTodo, Plus, Receipt } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ChipEstadoOT from '@/components/ChipEstadoOT';
import NuevoProyecto from '@/components/proyectos/NuevoProyecto';
import { EstadoPill } from '@/components/cotizador/ui';
import { supabase } from '@/lib/supabase';
import { ESTADOS_PROYECTO, folioProyecto, proyectosService, type Proyecto, type ResumenProyecto } from '@/services/fase5';
import { folioOT, type EstadoOT } from '@/services/operacion';
import { normalizarEstado } from '@/lib/cotizador/tipos';
import { vendedoresService } from '@/services/vendedores';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { formatCLP, formatDate } from '@/utils';
import type { Vendedor } from '@/types';

interface CotFila { id: string; folio: number; titulo: string | null; estado: string; total: number; total_clp: number | null; enviada_at: string | null; proyecto_id: string | null; cliente_id: string | null; trabajo_estado?: string | null }
interface OTFila { id: string; folio: number; titulo: string; estado: EstadoOT; fecha_programada: string | null; proyecto_id: string | null }
interface TareaFila { id: string; titulo: string; estado: string; asignado_id: string | null; fecha_limite: string | null }

export default function DetalleProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const { puede } = usePermisos();
  const { success, error: toastError } = useToast();
  const [p, setP] = useState<Proyecto | null>(null);
  const [r, setR] = useState<ResumenProyecto | null>(null);
  const [cots, setCots] = useState<CotFila[]>([]);
  const [ots, setOts] = useState<OTFila[]>([]);
  const [tareas, setTareas] = useState<TareaFila[]>([]);
  const [sueltas, setSueltas] = useState<{ cots: CotFila[]; ots: OTFila[] }>({ cots: [], ots: [] });
  const [equipo, setEquipo] = useState<Record<string, Vendedor>>({});
  const [editar, setEditar] = useState(false);
  const gestiona = puede('proyectos.gestionar');

  const cargar = useCallback(async () => {
    const pr = await proyectosService.get(id).catch(() => null);
    setP(pr);
    if (!pr) return;
    const [res, c, o, t] = await Promise.all([
      proyectosService.resumenes(),
      supabase.from('cotizaciones').select('*').eq('proyecto_id', id).order('folio'),
      supabase.from('ordenes_trabajo').select('id, folio, titulo, estado, fecha_programada, proyecto_id').eq('proyecto_id', id).order('folio'),
      supabase.from('tareas').select('id, titulo, estado, asignado_id, fecha_limite').eq('proyecto_id', id).order('fecha_limite'),
    ]);
    setR(res[id] || null);
    setCots((c.data || []) as CotFila[]); setOts((o.data || []) as OTFila[]); setTareas((t.data || []) as TareaFila[]);
    if (pr.cliente_id) {
      const [sc, so] = await Promise.all([
        supabase.from('cotizaciones').select('id, folio, titulo, estado, total, total_clp, enviada_at, proyecto_id, cliente_id').eq('cliente_id', pr.cliente_id).is('proyecto_id', null).order('folio', { ascending: false }).limit(50),
        supabase.from('ordenes_trabajo').select('id, folio, titulo, estado, fecha_programada, proyecto_id').eq('cliente_id', pr.cliente_id).is('proyecto_id', null).order('folio', { ascending: false }).limit(50),
      ]);
      setSueltas({ cots: (sc.data || []) as CotFila[], ots: (so.data || []) as OTFila[] });
    }
  }, [id]);
  useEffect(() => { cargar(); vendedoresService.mapa().then(setEquipo); }, [cargar]);

  const unir = async (tabla: 'cotizaciones' | 'ordenes_trabajo', fila: string, proyecto: string | null) => {
    const { error } = await supabase.from(tabla).update({ proyecto_id: proyecto }).eq('id', fila);
    if (error) toastError(error.message); else { success(proyecto ? 'Unida al proyecto' : 'Quitada del proyecto'); cargar(); }
  };
  const nuevaTarea = async () => {
    const titulo = prompt('Nueva tarea del proyecto');
    if (!titulo?.trim()) return;
    const { error } = await supabase.from('tareas').insert({ titulo: titulo.trim(), proyecto_id: id, asignado_id: p?.responsable_id || null, cliente_id: p?.cliente_id || null });
    if (error) toastError(error.message); else cargar();
  };

  if (!p) return <div className="anim-in"><div className="skeleton" style={{ height: 240 }} /></div>;
  const e = ESTADOS_PROYECTO.find(x => x.clave === p.estado)!;
  // Fase 7: el avance son sus trabajos terminados; la venta y el costo cotizado, la suma de sus trabajos.
  const conTrabajos = r?.trabajos !== undefined;
  const costo = Number(r?.costo_materiales || 0) + Number(r?.gastos || 0);
  const ventaNeta = conTrabajos ? Number(r?.venta_neta || 0) : Number(r?.venta || 0) / 1.19;
  const avance = conTrabajos ? (r?.trabajos ? Math.round((Number(r.trabajos_terminados) / Number(r.trabajos)) * 100) : 0)
    : r && r.ots ? Math.round((r.ots_terminadas / r.ots) * 100) : 0;
  const verCostos = puede('cotizaciones.ver_costos');
  const fila: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '0.55rem 1rem', borderTop: '1px solid var(--border2)', fontSize: '0.86rem' };

  return (
    <div className="anim-in">
      {editar && <NuevoProyecto inicial={p} onCerrar={() => setEditar(false)} onListo={() => { setEditar(false); cargar(); }} />}
      <Link href="/proyectos" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 6 }}><ArrowLeft size={14} /> Proyectos</Link>
      <PageHeader eyebrow={folioProyecto(p.folio)} title={p.nombre}
        subtitle={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge" style={{ background: e.color, color: '#fff' }}>{e.nombre}</span>
          {p.clientes?.nombre_cliente || 'Sin cliente'}{p.responsable_id ? ` · responsable ${equipo[p.responsable_id]?.nombre || ''}` : ''}
          {p.fecha_inicio ? ` · ${formatDate(p.fecha_inicio)}` : ''}{p.fecha_fin ? ` → ${formatDate(p.fecha_fin)}` : ''}</span>}
        actions={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {gestiona && <button className="btn btn-ghost" onClick={() => setEditar(true)}><Edit3 size={14} /> Editar</button>}
          {puede('cotizaciones.crear') && <Link className="btn btn-primary" href={`/cotizador?cliente=${p.cliente_id || ''}&proyecto=${p.id}`}><Plus size={14} /> Cotización del proyecto</Link>}
        </div>} />
      {p.descripcion && <p style={{ color: 'var(--muted)', marginTop: -6 }}>{p.descripcion}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
        <div className="kpi-card"><p className="label-muted">Vendido (aprobado)</p><p className="kpi-value">{formatCLP(Number(r?.venta || 0))}</p></div>
        <div className="kpi-card"><p className="label-muted">Esperando al cliente</p><p className="kpi-value" style={{ color: '#2563eb' }}>{formatCLP(Number(r?.por_aprobar || 0))}</p></div>
        {verCostos && conTrabajos && <div className="kpi-card"><p className="label-muted">Costo cotizado</p><p className="kpi-value">{formatCLP(Number(r?.costo_cotizado || 0))}</p></div>}
        {verCostos && <div className="kpi-card"><p className="label-muted">{conTrabajos ? 'Gastos reales' : 'Costo (materiales + gastos)'}</p><p className="kpi-value">{formatCLP(costo)}</p>
          {p.presupuesto ? <p style={{ fontSize: '0.74rem', margin: 0, color: costo > Number(p.presupuesto) ? 'var(--danger)' : 'var(--muted)' }}>de {formatCLP(Number(p.presupuesto))} presupuestado</p> : null}</div>}
        {conTrabajos && <div className="kpi-card"><p className="label-muted">Cobrado</p><p className="kpi-value" style={{ color: 'var(--success)' }}>{formatCLP(Number(r?.cobrado || 0))}</p></div>}
        {verCostos && <div className="kpi-card"><p className="label-muted">Margen real (venta neta − gastos)</p><p className="kpi-value" style={{ color: ventaNeta - costo >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCLP(ventaNeta - costo)}</p></div>}
        <div className="kpi-card"><p className="label-muted">Avance</p><p className="kpi-value">{avance} %</p><p style={{ fontSize: '0.74rem', margin: 0, color: 'var(--muted)' }}>{conTrabajos ? `${r?.trabajos_terminados || 0} de ${r?.trabajos || 0} trabajos terminados` : `${r?.ots_terminadas || 0} de ${r?.ots || 0} OT terminadas`}</p></div>
      </div>

      <div className="panel-y" style={{ marginBottom: 12 }}>
        <p className="section-label" style={{ margin: 0, padding: '0.8rem 1rem' }}><FileText size={15} /> Cotizaciones ({cots.length})</p>
        {cots.map(c => (
          <div key={c.id} style={fila}>
            <Link href={`/cotizador?edit=${c.id}`} style={{ fontWeight: 700 }}>IV-{String(c.folio).padStart(4, '0')}</Link>
            <span style={{ flex: 1, color: 'var(--text)' }}>{c.titulo || 'Cotización'}</span>
            <EstadoPill estado={normalizarEstado(c.estado, !!c.enviada_at)} />
            {c.estado === 'Aprobada' && c.trabajo_estado && <ChipTrabajo estado={c.trabajo_estado} />}
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCLP(Number(c.total_clp ?? c.total))}</b>
            {gestiona && <button className="btn btn-ghost btn-xs" onClick={() => unir('cotizaciones', c.id, null)}>Quitar</button>}
          </div>
        ))}
        {gestiona && sueltas.cots.length > 0 && (
          <div style={{ ...fila, background: 'var(--bg3)' }}>
            <span style={{ color: 'var(--muted)' }}>Unir una cotización del cliente:</span>
            <select className="input" style={{ maxWidth: 360 }} value="" onChange={ev => ev.target.value && unir('cotizaciones', ev.target.value, id)}>
              <option value="">Elegir…</option>{sueltas.cots.map(c => <option key={c.id} value={c.id}>IV-{String(c.folio).padStart(4, '0')} · {c.titulo || ''} · {c.estado}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="panel-y" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0.8rem 1rem', gap: 8, flexWrap: 'wrap' }}>
          <p className="section-label" style={{ margin: 0, flex: 1 }}><Receipt size={15} /> Gastos del proyecto · {formatCLP(Number(r?.gastos || 0))}</p>
          {puede('gastos.crear') && <Link className="btn btn-ghost btn-sm" href={`/gastos?proyecto=${p.id}`}><Plus size={13} /> Rendir gasto</Link>}
        </div>
        <p style={{ margin: 0, padding: '0 1rem 0.8rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
          Suma lo rendido en cada trabajo del proyecto y lo rendido directo en el proyecto (visitas, trámites, lo que es de toda la obra).</p>
      </div>

      {encendido('ot') && <div className="panel-y" style={{ marginBottom: 12 }}>
        <p className="section-label" style={{ margin: 0, padding: '0.8rem 1rem' }}><ClipboardList size={15} /> Órdenes de trabajo ({ots.length})</p>
        {ots.map(o => (
          <div key={o.id} style={fila}>
            <Link href={`/ordenes/${o.id}`} style={{ fontWeight: 700 }}>{folioOT(o.folio)}</Link>
            <span style={{ flex: 1, color: 'var(--text)' }}>{o.titulo}</span>
            {o.fecha_programada && <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{formatDate(o.fecha_programada)}</span>}
            <ChipEstadoOT estado={o.estado} />
            {gestiona && <button className="btn btn-ghost btn-xs" onClick={() => unir('ordenes_trabajo', o.id, null)}>Quitar</button>}
          </div>
        ))}
        {gestiona && sueltas.ots.length > 0 && (
          <div style={{ ...fila, background: 'var(--bg3)' }}>
            <span style={{ color: 'var(--muted)' }}>Unir una OT del cliente:</span>
            <select className="input" style={{ maxWidth: 360 }} value="" onChange={ev => ev.target.value && unir('ordenes_trabajo', ev.target.value, id)}>
              <option value="">Elegir…</option>{sueltas.ots.map(o => <option key={o.id} value={o.id}>{folioOT(o.folio)} · {o.titulo}</option>)}
            </select>
          </div>
        )}
        <p style={{ margin: 0, padding: '0.5rem 1rem', fontSize: '0.74rem', color: 'var(--muted)', borderTop: '1px solid var(--border2)' }}>Las OT que nacen de una cotización del proyecto entran solas.</p>
      </div>}

      <div className="panel-y">
        <div style={{ display: 'flex', alignItems: 'center', padding: '0.8rem 1rem' }}>
          <p className="section-label" style={{ margin: 0, flex: 1 }}><ListTodo size={15} /> Tareas ({tareas.length})</p>
          <button className="btn btn-ghost btn-sm" onClick={nuevaTarea}><Plus size={13} /> Tarea</button>
        </div>
        {tareas.map(t => (
          <div key={t.id} style={{ ...fila, opacity: t.estado === 'hecha' ? 0.55 : 1 }}>
            <span style={{ flex: 1, color: 'var(--text)', textDecoration: t.estado === 'hecha' ? 'line-through' : 'none' }}>{t.titulo}</span>
            <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{t.asignado_id ? equipo[t.asignado_id]?.nombre : ''}{t.fecha_limite ? ` · ${formatDate(t.fecha_limite)}` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
