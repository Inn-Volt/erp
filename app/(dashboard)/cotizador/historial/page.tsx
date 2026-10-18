'use client';

/**
 * Comercial → Cotizaciones (historial, como TecApp): tarjetas por estado, vencidas y
 * «por seguir» (enviadas sin movimiento hace 3 días o más), búsqueda y filtros.
 * Una cotización no se borra: se anula desde su ficha.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BellRing, Copy, FileText, Layers, Plus, Search, Settings2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { EstadoPill } from '@/components/cotizador/ui';
import { supabase } from '@/lib/supabase';
import { aDoc, cotizadorService } from '@/services/cotizador';
import { cotizacionesService, diasSinMovimiento } from '@/services/cotizaciones';
import { vendedoresService } from '@/services/vendedores';
import { folioOT } from '@/services/operacion';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { ESTADOS_COT, type CotizacionDoc, type EstadoCot } from '@/lib/cotizador/tipos';
import { formatMonto } from '@/lib/cotizador/calculo';
import { DIAS_SEGUIMIENTO, type Vendedor } from '@/types';
import { fechaLocal, formatDate } from '@/utils';

type Filtro = 'abiertas' | 'todas' | 'vencidas' | 'seguir' | EstadoCot;
const folioDe = (n: number) => `IV-${String(n || 0).padStart(4, '0')}`;
const montoClp = (c: CotizacionDoc) => Number(c.total_clp ?? c.total ?? 0);

export default function HistorialCotizacionesPage() {
  const router = useRouter();
  const { puede } = usePermisos();
  const { success, error: toastError } = useToast();
  const [cots, setCots] = useState<CotizacionDoc[]>([]);
  const [equipo, setEquipo] = useState<Record<string, Vendedor>>({});
  const [otDe, setOtDe] = useState<Record<string, { id: string; folio: number }>>({});
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('abiertas');
  const [busca, setBusca] = useState('');
  const [quien, setQuien] = useState('');
  const hoy = fechaLocal();

  const cargar = useCallback(async () => {
    try {
      const filas: CotizacionDoc[] = [];
      for (let desde = 0; ; desde += 1000) {
        const { data, error } = await supabase.from('cotizaciones').select('*, clientes(id, nombre_cliente, empresa, rut, telefono, email)')
          .order('folio', { ascending: false }).range(desde, desde + 999);
        if (error) throw error;
        filas.push(...(data || []).map(f => aDoc(f as Record<string, unknown>)));
        if (!data || data.length < 1000) break;
      }
      setCots(filas);
      vendedoresService.mapa().then(setEquipo);
      supabase.from('ordenes_trabajo').select('id, folio, cotizacion_id').not('cotizacion_id', 'is', null)
        .then(({ data }) => setOtDe(Object.fromEntries((data || []).map(x => [x.cotizacion_id as string, { id: x.id as string, folio: x.folio as number }]))));
    } catch (e) { toastError('No se pudo cargar: ' + (e instanceof Error ? e.message : '')); }
    finally { setCargando(false); }
  }, [toastError]);
  useEffect(() => { cargar(); }, [cargar]);

  const vencida = (c: CotizacionDoc) => c.estado === 'Enviada' && !!c.valida_hasta && c.valida_hasta < hoy;
  const porSeguir = (c: CotizacionDoc) => c.estado === 'Enviada' && diasSinMovimiento({ seguimiento_at: c.seguimiento_at ?? null, enviada_at: c.enviada_at ?? null, created_at: c.created_at }) >= DIAS_SEGUIMIENTO;

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return cots.filter(c =>
      filtro === 'todas' ? true : filtro === 'abiertas' ? ['Borrador', 'Enviada'].includes(c.estado)
        : filtro === 'vencidas' ? vencida(c) : filtro === 'seguir' ? porSeguir(c) : c.estado === filtro)
      .filter(c => !quien || c.vendedor_id === quien)
      .filter(c => !q || `${folioDe(c.folio)} ${c.folio} ${c.titulo} ${c.clientes?.nombre_cliente || ''} ${c.clientes?.empresa || ''} ${c.clientes?.rut || ''}`.toLowerCase().includes(q));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cots, filtro, busca, quien]);

  const mesActual = hoy.slice(0, 7);
  const aprobadasMes = cots.filter(c => c.estado === 'Aprobada' && (c.aceptada_at || '').slice(0, 7) === mesActual);
  const decididas = cots.filter(c => ['Aprobada', 'Rechazada'].includes(c.estado));
  const tarjetas: { f: Filtro; t: string; n: number; monto?: number; color: string }[] = [
    { f: 'Borrador', t: 'Borradores', n: cots.filter(c => c.estado === 'Borrador').length, color: '#64748b' },
    { f: 'Enviada', t: 'Esperando al cliente', n: cots.filter(c => c.estado === 'Enviada').length, monto: cots.filter(c => c.estado === 'Enviada').reduce((s, c) => s + montoClp(c), 0), color: '#2563eb' },
    { f: 'seguir', t: 'Por seguir', n: cots.filter(porSeguir).length, color: '#ea580c' },
    { f: 'vencidas', t: 'Vencidas', n: cots.filter(vencida).length, color: '#d97706' },
    { f: 'Aprobada', t: 'Aprobadas este mes', n: aprobadasMes.length, monto: aprobadasMes.reduce((s, c) => s + montoClp(c), 0), color: '#16a34a' },
  ];

  const seguir = async (c: CotizacionDoc) => {
    try {
      await cotizacionesService.registrarSeguimiento(c.id, c.seguimientos || 0);
      const tel = (c.clientes?.telefono || '').replace(/[^\d]/g, '');
      if (tel) window.open(`https://wa.me/${tel}?text=${encodeURIComponent(`Hola ${c.clientes?.nombre_cliente || ''}, ¿pudiste revisar la cotización ${folioDe(c.folio)}: ${c.titulo}? Quedo atento a tus comentarios.`)}`, '_blank');
      success('Seguimiento anotado');
      cargar();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
  };

  const clonar = async (c: CotizacionDoc) => {
    try { const id = await cotizadorService.clonar(c.id); router.push(`/cotizador?edit=${id}`); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo clonar'); }
  };

  return (
    <div className="anim-in">
      <PageHeader eyebrow="Comercial" title="Cotizaciones"
        subtitle={`${cots.length} en total · tasa de cierre ${decididas.length ? Math.round((cots.filter(c => c.estado === 'Aprobada').length / decididas.length) * 100) : 0} %`}
        actions={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {puede('cotizaciones.aprobar') && <Link href="/cotizador/plantillas" className="btn btn-ghost"><FileText size={14} /> Plantillas</Link>}
          {puede('biblioteca.ver') && <Link href="/biblioteca" className="btn btn-ghost"><Layers size={14} /> Recetas y catálogo</Link>}
          {puede('cotizaciones.aprobar') && <Link href="/cotizador/ajustes" className="btn btn-ghost"><Settings2 size={14} /> Ajustes</Link>}
          {puede('cotizaciones.crear') && <Link href="/cotizador" className="btn btn-primary"><Plus size={14} /> Nueva cotización</Link>}
        </div>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 8, marginBottom: 12 }}>
        {tarjetas.map(t => (
          <button key={t.t} className="kpi-card" onClick={() => setFiltro(filtro === t.f ? 'abiertas' : t.f)}
            style={{ cursor: 'pointer', textAlign: 'left', border: filtro === t.f ? `1px solid ${t.color}` : undefined }}>
            <p className="label-muted">{t.t}</p>
            <p className="kpi-value" style={{ color: t.color }}>{t.n}</p>
            {t.monto !== undefined && <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0 }}>{formatMonto(t.monto, 'CLP')}</p>}
          </button>
        ))}
      </div>

      <div className="panel-y">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input className="input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar N°, título, cliente o RUT…" style={{ paddingLeft: '2.2rem' }} />
          </div>
          <select className="input" style={{ maxWidth: 190 }} value={filtro} onChange={e => setFiltro(e.target.value as Filtro)}>
            <option value="abiertas">Abiertas (borrador y enviadas)</option><option value="todas">Todas</option>
            <option value="seguir">Por seguir</option><option value="vencidas">Vencidas</option>
            {ESTADOS_COT.map(e => <option key={e.clave} value={e.clave}>{e.clave}</option>)}
          </select>
          <select className="input" style={{ maxWidth: 190 }} value={quien} onChange={e => setQuien(e.target.value)}>
            <option value="">Todos los que cotizan</option>
            {Object.values(equipo).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
        </div>
        {cargando ? <div style={{ padding: '1.5rem' }}><div className="skeleton" style={{ height: 160 }} /></div>
          : lista.length === 0 ? <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>No hay cotizaciones en esta vista.</p>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead><tr>
                  {['N°', 'Cotización', 'Estado', 'Total', 'Fecha', 'Cotiza', ''].map(h => (
                    <th key={h} style={{ padding: '0.6rem 0.9rem', textAlign: h === 'Total' ? 'right' : 'left', fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {lista.map(c => (
                    <tr key={c.id} onClick={() => router.push(`/cotizador?edit=${c.id}`)} style={{ cursor: 'pointer', borderTop: '1px solid var(--border2)' }}>
                      <td style={{ padding: '0.65rem 0.9rem', fontWeight: 700, color: 'var(--y)', whiteSpace: 'nowrap' }}>{folioDe(c.folio)}{c.revision > 0 && <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 400 }}>Rev. {c.revision}</span>}</td>
                      <td style={{ padding: '0.65rem 0.9rem', maxWidth: 380 }}>
                        <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.titulo}</span>
                        <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{c.clientes?.nombre_cliente || 'Sin cliente'}{c.clientes?.empresa ? ` · ${c.clientes.empresa}` : ''}</span>
                        {otDe[c.id] && <Link href={`/ordenes/${otDe[c.id].id}`} onClick={e => e.stopPropagation()} style={{ marginLeft: 6, fontSize: '0.72rem' }}>{folioOT(otDe[c.id].folio)}</Link>}
                      </td>
                      <td style={{ padding: '0.65rem 0.9rem' }}>
                        <EstadoPill estado={c.estado} vencida={vencida(c)} />
                        {c.estado === 'Enviada' && c.vista_at && <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--info)' }}>La abrió el {formatDate(c.vista_at)}</span>}
                        {porSeguir(c) && <span style={{ display: 'block', fontSize: '0.68rem', color: '#ea580c' }}>Sin respuesta hace {diasSinMovimiento({ seguimiento_at: c.seguimiento_at ?? null, enviada_at: c.enviada_at ?? null, created_at: c.created_at })} días</span>}
                        {c.estado === 'Rechazada' && c.motivo_perdida && <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--muted)' }}>{c.motivo_perdida}</span>}
                      </td>
                      <td style={{ padding: '0.65rem 0.9rem', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatMonto(c.total, c.moneda)}</td>
                      <td style={{ padding: '0.65rem 0.9rem', fontSize: '0.8rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatDate(c.fecha_emision || c.created_at)}</td>
                      <td style={{ padding: '0.65rem 0.9rem', fontSize: '0.8rem', color: 'var(--muted)' }}>{c.vendedor_id ? equipo[c.vendedor_id]?.nombre?.split(' ')[0] || '—' : '—'}</td>
                      <td style={{ padding: '0.65rem 0.9rem' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {porSeguir(c) && puede('cotizaciones.crear') && <button className="btn btn-ghost btn-xs" title="Hacer seguimiento" onClick={() => seguir(c)} style={{ color: '#ea580c' }}><BellRing size={12} /></button>}
                          {puede('cotizaciones.crear') && <button className="btn btn-ghost btn-xs" title="Clonar" onClick={() => clonar(c)}><Copy size={12} /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border2)', color: 'var(--muted)', fontSize: '0.78rem' }}>
          {lista.length} cotizaciones · {formatMonto(lista.reduce((s, c) => s + montoClp(c), 0), 'CLP')}
        </div>
      </div>
    </div>
  );
}
