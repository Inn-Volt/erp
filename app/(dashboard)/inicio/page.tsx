'use client';

/**
 * Inicio → Mi día (el «inicio en terreno» de TecApp): lo mío de hoy y de los próximos días.
 * Visitas, OT asignadas, tareas, pedidos de material, mi bodega y anticipos por rendir.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ClipboardList, HandCoins, ListTodo, Package, Send } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ChipEstadoOT from '@/components/ChipEstadoOT';
import LinksMapa from '@/components/LinksMapa';
import { supabase } from '@/lib/supabase';
import { anticiposService, folioPedido, pedidosService, visitasService, type Anticipo, type Pedido, type Visita } from '@/services/fase5';
import { folioOT, type OrdenTrabajo, type Tarea } from '@/services/operacion';
import { usePermisos } from '@/hooks/usePermisos';
import { fechaLocal, formatCLP, formatDate, sumarDias } from '@/utils';

function Caja({ titulo, icono, href, children, vacio }: { titulo: string; icono: React.ReactNode; href?: string; children: React.ReactNode; vacio?: boolean }) {
  return (
    <div className="panel-y" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border2)' }}>
        <p className="section-label" style={{ margin: 0, flex: 1 }}>{icono} {titulo}</p>
        {href && <Link href={href} style={{ fontSize: '0.78rem' }}>Ver todo</Link>}
      </div>
      <div style={{ padding: '0.6rem 1rem', display: 'flex', flexDirection: 'column', gap: 6 }}>{vacio ? <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>Nada por ahora.</p> : children}</div>
    </div>
  );
}

export default function MiDiaPage() {
  const { perfil, puede } = usePermisos();
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [anticipos, setAnticipos] = useState<Anticipo[]>([]);
  const [stock, setStock] = useState<{ descripcion: string; unidad: string; cantidad: number }[] | null>(null);
  const hoy = fechaLocal();

  useEffect(() => {
    if (!perfil) return;
    const uid = perfil.id;
    visitasService.mias(uid, hoy, sumarDias(hoy, 7)).then(setVisitas).catch(() => {});
    supabase.from('ordenes_trabajo').select('*, clientes(id, nombre_cliente, telefono, direccion, email, rut)').contains('tecnicos', [uid])
      .not('estado', 'in', '(cerrada,anulada)').order('fecha_programada', { ascending: true, nullsFirst: false })
      .then(({ data }) => setOts((data || []) as OrdenTrabajo[]));
    supabase.from('tareas').select('*').eq('asignado_id', uid).in('estado', ['pendiente', 'en_progreso']).order('fecha_limite', { ascending: true, nullsFirst: false })
      .then(({ data }) => setTareas((data || []) as Tarea[]));
    pedidosService.listar({ mios: uid }).then(p => setPedidos(p.filter(x => ['pendiente', 'parcial'].includes(x.estado) || (x.estado === 'despachado' && (x.despachado_at || '') >= sumarDias(hoy, -3))))).catch(() => {});
    anticiposService.listar(uid).then(a => setAnticipos(a.filter(x => x.estado === 'entregado'))).catch(() => {});
    (async () => {
      const { data: b } = await supabase.from('bodegas').select('id').eq('responsable_id', uid).eq('activo', true);
      if (!b?.length) { setStock(null); return; }
      const { data: s } = await supabase.from('stock_bodega').select('articulo_id, cantidad').in('bodega_id', b.map(x => x.id)).neq('cantidad', 0);
      const ids = (s || []).map(x => x.articulo_id as string);
      const { data: c } = ids.length ? await supabase.from('catalogo_items').select('id, descripcion, unidad').in('id', ids) : { data: [] };
      const nom = new Map((c || []).map(x => [x.id as string, x]));
      setStock((s || []).map(x => ({ descripcion: (nom.get(x.articulo_id as string)?.descripcion as string) || 'Artículo', unidad: (nom.get(x.articulo_id as string)?.unidad as string) || '', cantidad: Number(x.cantidad) })));
    })().catch(() => setStock(null));
  }, [perfil, hoy]);

  const deHoy = visitas.filter(v => v.fecha === hoy);
  const proximas = visitas.filter(v => v.fecha > hoy);
  const fila: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.86rem', color: 'var(--text)', borderBottom: '1px solid var(--border2)', paddingBottom: 6 };

  const VisitaFila = ({ v }: { v: Visita }) => (
    <div style={fila}>
      <span style={{ fontWeight: 700, minWidth: 70 }}>{v.fecha === hoy ? 'Hoy' : formatDate(v.fecha).slice(0, 5)}{v.hora_inicio ? ` ${v.hora_inicio.slice(0, 5)}` : ''}</span>
      <span style={{ flex: 1 }}>
        <Link href={`/ordenes/${v.ot_id}`} style={{ fontWeight: 600 }}>{v.ordenes_trabajo ? folioOT(v.ordenes_trabajo.folio) : 'OT'}</Link> {v.ordenes_trabajo?.titulo}
        <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--muted)' }}>{v.ordenes_trabajo?.clientes?.nombre_cliente}{v.ordenes_trabajo?.direccion ? ` · ${v.ordenes_trabajo.direccion}` : ''}</span>
        {v.ordenes_trabajo?.direccion && <LinksMapa direccion={v.ordenes_trabajo.direccion} compacto />}
      </span>
    </div>
  );

  return (
    <div className="anim-in">
      <PageHeader eyebrow="Inicio" title={`Hola${perfil?.nombre ? `, ${perfil.nombre.split(' ')[0]}` : ''}`} subtitle={`Lo tuyo de hoy, ${formatDate(hoy)}.`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <Caja titulo={`Visitas de hoy (${deHoy.length})`} icono={<CalendarDays size={15} />} vacio={!deHoy.length}>
          {deHoy.map(v => <VisitaFila key={v.id} v={v} />)}
        </Caja>
        <Caja titulo="Próximos 7 días" icono={<CalendarDays size={15} />} href="/agenda" vacio={!proximas.length}>
          {proximas.map(v => <VisitaFila key={v.id} v={v} />)}
        </Caja>
        <Caja titulo={`Mis OT abiertas (${ots.length})`} icono={<ClipboardList size={15} />} href="/ordenes" vacio={!ots.length}>
          {ots.slice(0, 8).map(o => (
            <Link key={o.id} href={`/ordenes/${o.id}`} style={{ ...fila, textDecoration: 'none' }}>
              <span style={{ fontWeight: 700, color: 'var(--y)', minWidth: 64 }}>{folioOT(o.folio)}</span>
              <span style={{ flex: 1 }}>{o.titulo}<span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--muted)' }}>{o.clientes?.nombre_cliente}{o.fecha_programada ? ` · ${formatDate(o.fecha_programada)}` : ''}</span></span>
              <ChipEstadoOT estado={o.estado} />
            </Link>
          ))}
        </Caja>
        <Caja titulo={`Mis tareas (${tareas.length})`} icono={<ListTodo size={15} />} href="/tareas" vacio={!tareas.length}>
          {tareas.slice(0, 8).map(t => (
            <div key={t.id} style={fila}>
              <span style={{ flex: 1 }}>{t.titulo}</span>
              {t.fecha_limite && <span style={{ fontSize: '0.76rem', color: t.fecha_limite < hoy ? 'var(--danger)' : 'var(--muted)' }}>{formatDate(t.fecha_limite)}</span>}
            </div>
          ))}
        </Caja>
        {(pedidos.length > 0 || puede('ot.ejecutar')) && (
          <Caja titulo="Mis pedidos de material" icono={<Send size={15} />} href="/bodega?tab=pedidos" vacio={!pedidos.length}>
            {pedidos.map(p => (
              <div key={p.id} style={fila}>
                <b style={{ minWidth: 64 }}>{folioPedido(p.folio)}</b>
                <span style={{ flex: 1, fontSize: '0.8rem' }}>{(p.pedido_lineas || []).map(l => `${Number(l.cantidad)} ${l.catalogo_items?.descripcion || ''}`).join(', ')}</span>
                <span style={{ fontSize: '0.76rem', color: p.estado === 'despachado' ? 'var(--success)' : '#d97706' }}>{p.estado}</span>
              </div>
            ))}
          </Caja>
        )}
        {stock !== null && (
          <Caja titulo="Mi bodega" icono={<Package size={15} />} href="/bodega" vacio={!stock.length}>
            {stock.slice(0, 12).map((s, i) => (
              <div key={i} style={fila}><span style={{ flex: 1 }}>{s.descripcion}</span><b style={{ fontVariantNumeric: 'tabular-nums' }}>{s.cantidad} {s.unidad}</b></div>
            ))}
          </Caja>
        )}
        {anticipos.length > 0 && (
          <Caja titulo="Anticipos por rendir" icono={<HandCoins size={15} />} href="/gastos">
            {anticipos.map(a => (
              <div key={a.id} style={fila}><span style={{ flex: 1 }}>AN-{String(a.folio).padStart(4, '0')}{a.motivo ? ` · ${a.motivo}` : ''}</span><b>{formatCLP(a.saldo ?? a.monto)}</b></div>
            ))}
          </Caja>
        )}
      </div>
    </div>
  );
}
