'use client';

/**
 * Inicio → Mi día: lo que toca hoy en el flujo administrativo, en orden.
 *   Mis visitas (las que tengo a cargo como técnico: se abren en su panel) ·
 *   Agenda de hoy y de la semana · solicitudes por atender · cotizaciones esperando al
 *   cliente (para hacer seguimiento) · trabajos en curso · cobros por facturar o vencidos ·
 *   mis tareas · anticipos por rendir.
 * Cada caja se ve solo si la persona tiene el permiso de esa parte.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, MapPinned, ClipboardCheck, FileText, HandCoins, Inbox, ListTodo, Wallet } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import LinksMapa from '@/components/LinksMapa';
import { ChipTrabajo } from '@/components/trabajos/TrabajoPanel';
import AvisosCelular from '@/components/AvisosCelular';
import { supabase } from '@/lib/supabase';
import { anticiposService, type Anticipo } from '@/services/fase5';
import type { Tarea } from '@/services/operacion';
import { usePermisos } from '@/hooks/usePermisos';
import { fechaLocal, formatCLP, formatDate, sumarDias } from '@/utils';
import { vendedoresService } from '@/services/vendedores';
import { ESTADO_SOLICITUD_META, type EstadoSolicitud } from '@/types/solicitud';

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

interface Cita { id: string; titulo: string; fecha: string; hora_inicio: string | null; direccion: string | null; estado: string; responsable: string; tecnico_id?: string | null; clientes?: { nombre_cliente: string } | null }
interface Sol { id: string; folio: number; descripcion: string; prioridad: string; estado: string; created_at: string; clientes?: { nombre_cliente: string } | null }
interface CotEsp { id: string; folio: number; titulo: string | null; total: number; total_clp: number | null; enviada_at: string | null; vista_at: string | null; valida_hasta: string | null; clientes?: { nombre_cliente: string } | null }
interface TrabajoFila { id: string; folio: number; titulo: string | null; trabajo_estado: string | null; clientes?: { nombre_cliente: string } | null }
interface Cobro { id: string; descripcion: string | null; monto: number; monto_pagado: number; etapa: string; vencimiento: string | null }

const diasDesde = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null);

export default function MiDiaPage() {
  const { perfil, puede } = usePermisos();
  const [citas, setCitas] = useState<Cita[]>([]);
  const [misVisitas, setMisVisitas] = useState<Cita[]>([]);
  const [sols, setSols] = useState<Sol[]>([]);
  const [esperando, setEsperando] = useState<CotEsp[]>([]);
  const [trabajos, setTrabajos] = useState<TrabajoFila[]>([]);
  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [anticipos, setAnticipos] = useState<Anticipo[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const hoy = fechaLocal();
  // Mi día según el rol: lo comercial (solicitudes, cotizaciones esperando, agenda de todos) a quien
  // vende o administra; el técnico ve sus visitas, sus trabajos, sus tareas y sus anticipos.
  const comercial = puede('solicitudes.crear') || puede('cotizaciones.crear') || puede('configuracion.gestionar');
  useEffect(() => { vendedoresService.mapa().then(m => setNombres(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.nombre.split(' ')[0]])))); }, []);

  useEffect(() => {
    if (!perfil) return;
    const uid = perfil.id;
    // Fase 10: las visitas que tengo a cargo (ayer en adelante, sin las canceladas).
    supabase.from('agendamientos').select('id, titulo, fecha, hora_inicio, direccion, estado, responsable, clientes(nombre_cliente)')
      .eq('tecnico_id', uid).gte('fecha', sumarDias(hoy, -1)).neq('estado', 'Cancelada')
      .order('fecha').order('hora_inicio', { nullsFirst: true }).limit(20)
      .then(({ data, error }) => { if (!error) setMisVisitas((data || []) as unknown as Cita[]); });
    if (puede('agenda.ver') && comercial) {
      supabase.from('agendamientos').select('id, titulo, fecha, hora_inicio, direccion, estado, responsable, tecnico_id, clientes(nombre_cliente)')
        .gte('fecha', hoy).lte('fecha', sumarDias(hoy, 7)).not('estado', 'in', '(Cancelada,Realizada)')
        .order('fecha').order('hora_inicio', { nullsFirst: true })
        .then(({ data }) => setCitas((data || []) as unknown as Cita[]));
    }
    if (puede('solicitudes.ver') && comercial) {
      // Primero las que ya tuvieron visita: son las que hay que cotizar.
      supabase.from('solicitudes').select('id, folio, descripcion, prioridad, estado, created_at, clientes(nombre_cliente)')
        .in('estado', ['NUEVA', 'EN_REVISION', 'ANALIZADA_IA', 'PENDIENTE_INFO', 'VISITA_AGENDADA', 'LISTA_COTIZAR']).order('created_at', { ascending: false }).limit(12)
        .then(({ data }) => setSols(((data || []) as unknown as Sol[]).sort((a, b) => Number(b.estado === 'LISTA_COTIZAR') - Number(a.estado === 'LISTA_COTIZAR'))));
    }
    if (puede('cotizaciones.ver')) {
      if (comercial) supabase.from('cotizaciones').select('id, folio, titulo, total, total_clp, enviada_at, vista_at, valida_hasta, clientes(nombre_cliente)')
        .eq('estado', 'Enviada').order('enviada_at', { ascending: true }).limit(10)
        .then(({ data }) => setEsperando((data || []) as unknown as CotEsp[]));
      supabase.from('cotizaciones').select('id, folio, titulo, trabajo_estado, clientes(nombre_cliente)')
        .eq('estado', 'Aprobada').in('trabajo_estado', ['por_iniciar', 'en_ejecucion']).order('aceptada_at').limit(10)
        .then(({ data, error }) => { if (!error) setTrabajos((data || []) as unknown as TrabajoFila[]); });
    }
    if (puede('facturacion.ver') || puede('facturacion.gestionar')) {
      supabase.from('por_facturar').select('id, descripcion, monto, monto_pagado, etapa, vencimiento')
        .neq('etapa', 'sin_cobro').order('created_at').limit(50)
        .then(({ data }) => setCobros(((data || []) as Cobro[]).filter(c => Number(c.monto_pagado) < Number(c.monto))));
    }
    supabase.from('tareas').select('*').eq('asignado_id', uid).in('estado', ['pendiente', 'en_progreso']).order('fecha_limite', { ascending: true, nullsFirst: false })
      .then(({ data }) => setTareas((data || []) as Tarea[]));
    anticiposService.listar(uid).then(a => setAnticipos(a.filter(x => x.estado === 'entregado'))).catch(() => {});
  }, [perfil, hoy, puede, comercial]);

  const fila: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.86rem', color: 'var(--text)', borderBottom: '1px solid var(--border2)', paddingBottom: 6, textDecoration: 'none' };
  const sub: React.CSSProperties = { display: 'block', fontSize: '0.76rem', color: 'var(--muted)' };
  const deHoy = citas.filter(c => c.fecha === hoy);
  const semana = citas.filter(c => c.fecha > hoy);
  const porFacturar = cobros.filter(c => c.etapa !== 'facturado');
  const vencidos = cobros.filter(c => c.etapa === 'facturado' && c.vencimiento && c.vencimiento < hoy);

  const CitaFila = ({ c }: { c: Cita }) => (
    <div style={fila}>
      <span style={{ fontWeight: 700, minWidth: 64 }}>{c.fecha === hoy ? 'Hoy' : formatDate(c.fecha).slice(0, 5)}{c.hora_inicio ? ` ${c.hora_inicio.slice(0, 5)}` : ''}</span>
      <span style={{ flex: 1 }}>
        <Link href={`/visita/${c.id}`} style={{ fontWeight: 600 }}>{c.titulo}</Link>
        <span style={sub}>{c.clientes?.nombre_cliente || ''}{c.direccion ? ` · ${c.direccion}` : ''}{c.tecnico_id && nombres[c.tecnico_id] ? ` · ${nombres[c.tecnico_id]}` : ''}</span>
        {c.direccion && <LinksMapa direccion={c.direccion} compacto />}
      </span>
    </div>
  );

  return (
    <div className="anim-in">
      <PageHeader eyebrow="Inicio" title={`Hola${perfil?.nombre ? `, ${perfil.nombre.split(' ')[0]}` : ''}`} subtitle={`Lo que toca hoy, ${formatDate(hoy)}.`} />
      <div style={{ marginBottom: 12 }}><AvisosCelular compacto /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 12 }}>
        {misVisitas.length > 0 && (
          <Caja titulo={`Mis visitas (${misVisitas.length})`} icono={<MapPinned size={15} />}>
            {misVisitas.map(c => (
              <Link key={c.id} href={`/visita/${c.id}`} style={{ ...fila, alignItems: 'center' }}>
                <span style={{ fontWeight: 700, minWidth: 64 }}>{c.fecha === hoy ? 'Hoy' : formatDate(c.fecha).slice(0, 5)}{c.hora_inicio ? ` ${c.hora_inicio.slice(0, 5)}` : ''}</span>
                <span style={{ flex: 1 }}>{c.titulo}
                  <span style={sub}>{c.clientes?.nombre_cliente || ''}{c.direccion ? ` · ${c.direccion}` : ''}</span></span>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: c.estado === 'Realizada' ? 'var(--success)' : 'var(--y)' }}>{c.estado}</span>
              </Link>
            ))}
          </Caja>
        )}
        {puede('agenda.ver') && comercial && <>
          <Caja titulo={`Agenda de hoy (${deHoy.length})`} icono={<CalendarDays size={15} />} href="/agenda" vacio={!deHoy.length}>
            {deHoy.map(c => <CitaFila key={c.id} c={c} />)}
          </Caja>
          <Caja titulo="Próximos 7 días" icono={<CalendarDays size={15} />} href="/agenda" vacio={!semana.length}>
            {semana.map(c => <CitaFila key={c.id} c={c} />)}
          </Caja>
        </>}

        {puede('solicitudes.ver') && comercial && (
          <Caja titulo={`Solicitudes por atender (${sols.length})`} icono={<Inbox size={15} />} href="/solicitudes" vacio={!sols.length}>
            {sols.map(s => {
              const m = ESTADO_SOLICITUD_META[s.estado as EstadoSolicitud];
              return (
                <Link key={s.id} href="/solicitudes" style={fila}>
                  <span style={{ fontWeight: 700, color: 'var(--y)', minWidth: 64 }}>SOL-{String(s.folio).padStart(4, '0')}</span>
                  <span style={{ flex: 1 }}>{s.descripcion.slice(0, 80)}
                    <span style={sub}>{s.clientes?.nombre_cliente || 'Sin cliente'} · {s.prioridad} · hace {diasDesde(s.created_at)} d</span></span>
                  {m && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: m.color, background: m.bg, borderRadius: 6, padding: '0.1rem 0.4rem', whiteSpace: 'nowrap' }}>
                    {s.estado === 'LISTA_COTIZAR' ? 'Por cotizar' : m.label}</span>}
                </Link>
              );
            })}
          </Caja>
        )}

        {puede('cotizaciones.ver') && <>
          {comercial && <Caja titulo={`Esperando al cliente (${esperando.length})`} icono={<FileText size={15} />} href="/cotizador/historial" vacio={!esperando.length}>
            {esperando.map(c => {
              const d = diasDesde(c.enviada_at);
              const vence = c.valida_hasta && c.valida_hasta <= sumarDias(hoy, 3);
              return (
                <Link key={c.id} href={`/cotizador?edit=${c.id}`} style={fila}>
                  <span style={{ fontWeight: 700, color: 'var(--y)', minWidth: 64 }}>IV-{String(c.folio).padStart(4, '0')}</span>
                  <span style={{ flex: 1 }}>{c.titulo || 'Cotización'}
                    <span style={sub}>{c.clientes?.nombre_cliente || ''} · {c.vista_at ? 'la abrió' : 'no la ha abierto'} · enviada hace {d} d
                      {vence ? <b style={{ color: 'var(--danger)' }}> · vence {formatDate(c.valida_hasta)}</b> : null}</span></span>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCLP(Number(c.total_clp ?? c.total))}</b>
                </Link>
              );
            })}
            {esperando.length > 0 && <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted)' }}>Las más antiguas primero: son las que piden un llamado de seguimiento.</p>}
          </Caja>}
          <Caja titulo={`Trabajos en curso (${trabajos.length})`} icono={<ClipboardCheck size={15} />} href="/trabajos" vacio={!trabajos.length}>
            {trabajos.map(t => (
              <Link key={t.id} href={`/cotizador?edit=${t.id}`} style={fila}>
                <span style={{ fontWeight: 700, color: 'var(--y)', minWidth: 64 }}>IV-{String(t.folio).padStart(4, '0')}</span>
                <span style={{ flex: 1 }}>{t.titulo || 'Cotización'}<span style={sub}>{t.clientes?.nombre_cliente || ''}</span></span>
                <ChipTrabajo estado={t.trabajo_estado} />
              </Link>
            ))}
          </Caja>
        </>}

        {(puede('facturacion.ver') || puede('facturacion.gestionar')) && (
          <Caja titulo="Cobranza" icono={<Wallet size={15} />} href="/facturacion" vacio={!porFacturar.length && !vencidos.length}>
            {porFacturar.length > 0 && <p style={{ margin: 0, fontSize: '0.84rem' }}><b>{porFacturar.length}</b> por facturar · {formatCLP(porFacturar.reduce((s, c) => s + Number(c.monto), 0))}</p>}
            {vencidos.map(c => (
              <Link key={c.id} href="/facturacion" style={fila}>
                <span style={{ flex: 1 }}>{c.descripcion || 'Cobro'}<span style={{ ...sub, color: 'var(--danger)' }}>vencida el {formatDate(c.vencimiento)}</span></span>
                <b>{formatCLP(Number(c.monto) - Number(c.monto_pagado))}</b>
              </Link>
            ))}
          </Caja>
        )}

        <Caja titulo={`Mis tareas (${tareas.length})`} icono={<ListTodo size={15} />} href="/tareas" vacio={!tareas.length}>
          {tareas.slice(0, 8).map(t => {
            // Las tareas de seguimiento traen el enlace a su cotización.
            const enlace = (t.descripcion || '').match(/\/cotizador\?edit=[0-9a-f-]{36}/)?.[0];
            const contenido = <>
              <span style={{ flex: 1 }}>{t.titulo}</span>
              {t.fecha_limite && <span style={{ fontSize: '0.76rem', color: t.fecha_limite < hoy ? 'var(--danger)' : 'var(--muted)' }}>{formatDate(t.fecha_limite)}</span>}
            </>;
            return enlace ? <Link key={t.id} href={enlace} style={fila}>{contenido}</Link> : <div key={t.id} style={fila}>{contenido}</div>;
          })}
        </Caja>
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
