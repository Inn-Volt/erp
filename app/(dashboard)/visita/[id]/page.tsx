'use client';

/**
 * La visita, para el técnico encargado (fase 10): se llega desde Inicio o desde el aviso.
 * Muestra la información SIN editar (cliente, contacto, dirección con mapa, hora, qué pidió,
 * notas de coordinación) y deja crear los informes de la visita —con sus fotos— y marcarla
 * como realizada. Editar la cita se hace en la Agenda.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Calendar, CheckCircle2, Clock, Loader2, Mail, MapPin, Pencil, Phone, User } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import LinksMapa from '@/components/LinksMapa';
import InformesDeVisita from '@/components/informes/InformesDeVisita';
import { supabase } from '@/lib/supabase';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import type { Cliente } from '@/types';
import { ESTADO_AGENDA_META, RESPONSABLE_LABEL, type Agendamiento } from '@/types/agenda';
import { TIPO_SERVICIO_OPCIONES } from '@/types/solicitud';
import { formatDate } from '@/utils';

type Visita = Agendamiento & {
  clientes?: Cliente | null;
  solicitudes?: { id: string; folio: number; descripcion: string | null } | null;
  tecnico?: { nombre: string | null; email: string | null } | null;
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export default function VisitaPage() {
  const { id } = useParams<{ id: string }>();
  const { perfil, puede } = usePermisos();
  const { success, error: toastError } = useToast();
  const [v, setV] = useState<Visita | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cerrando, setCerrando] = useState(false);

  const cargar = useCallback(async () => {
    const conTecnico = await supabase.from('agendamientos')
      .select('*, clientes(*), solicitudes:solicitud_id(id, folio, descripcion), tecnico:tecnico_id(nombre, email)').eq('id', id).maybeSingle();
    // Sin la fase 10 no existe tecnico_id: se pide sin él.
    const r = conTecnico.error
      ? await supabase.from('agendamientos').select('*, clientes(*), solicitudes:solicitud_id(id, folio, descripcion)').eq('id', id).maybeSingle()
      : conTecnico;
    setV((r.data as Visita) || null);
    setCargando(false);
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return <div className="anim-in"><div className="skeleton" style={{ height: 220, borderRadius: 12 }} /></div>;
  if (!v) {
    return (
      <div className="anim-in">
        <PageHeader eyebrow="Visita" title="Visita no encontrada" subtitle="No existe o no tienes acceso a ella." />
        <Link href="/inicio" className="btn btn-ghost"><ArrowLeft size={14} /> Volver a Inicio</Link>
      </div>
    );
  }

  const soyTecnico = !!perfil && v.tecnico_id === perfil.id;
  const gestiona = puede('agenda.gestionar');
  const puedeTrabajar = soyTecnico || gestiona;
  const cli = v.clientes;
  const fecha = new Date(`${v.fecha}T00:00:00`);
  const hora = [v.hora_inicio?.slice(0, 5), v.hora_fin?.slice(0, 5)].filter(Boolean).join(' a ');
  const direccion = v.direccion || cli?.direccion || '';
  const meta = ESTADO_AGENDA_META[v.estado];
  const tel = cli?.telefono?.replace(/[^\d+]/g, '');
  const cerrada = v.estado === 'Realizada' || v.estado === 'Cancelada';

  const marcarRealizada = async () => {
    if (!confirm('¿Marcar la visita como realizada? Se avisa para cotizar.')) return;
    setCerrando(true);
    try {
      const { error } = await supabase.rpc('visita_realizada', { p_agenda: v.id });
      if (error) throw new Error(/visita_realizada|schema cache/i.test(error.message) ? 'Falta ejecutar supabase_fase10_visita_tecnico.sql en Supabase.' : error.message);
      success('Visita realizada'); cargar();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo cerrar la visita'); }
    finally { setCerrando(false); }
  };

  const fila: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.92rem', color: 'var(--text)' };
  const icono: React.CSSProperties = { flexShrink: 0, marginTop: 2, color: 'var(--y)' };
  const sub: React.CSSProperties = { display: 'block', fontSize: '0.78rem', color: 'var(--muted)' };

  return (
    <div className="anim-in" style={{ maxWidth: 860 }}>
      <PageHeader eyebrow={`Visita VT-${String(v.folio).padStart(4, '0')}`} title={v.titulo}
        subtitle={cli?.nombre_cliente || 'Sin cliente'}
        actions={gestiona ? <Link href={`/agenda?cita=${v.id}`} className="btn btn-ghost btn-sm"><Pencil size={13} /> Editar en la agenda</Link> : null} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
        <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: 99, color: meta.color, background: meta.bg }}>{v.estado}</span>
            {v.tecnico?.nombre || v.tecnico?.email
              ? <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Encargado: {v.tecnico.nombre || v.tecnico.email}{soyTecnico ? ' (tú)' : ''}</span>
              : <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{RESPONSABLE_LABEL[v.responsable]}</span>}
          </div>
          <div style={fila}><Calendar size={16} style={icono} />
            <span>{DIAS[fecha.getDay()]} {formatDate(v.fecha)}{hora ? <span style={sub}><Clock size={11} /> {hora}</span> : null}</span></div>
          {direccion && (
            <div style={fila}><MapPin size={16} style={icono} />
              <span style={{ flex: 1 }}>{direccion}<span style={{ display: 'block', marginTop: 6 }}><LinksMapa direccion={direccion} /></span></span></div>
          )}
          {cli && (
            <div style={fila}><User size={16} style={icono} />
              <span style={{ flex: 1 }}>{cli.contacto_nombre || cli.nombre_cliente}
                {cli.empresa && <span style={sub}>{cli.empresa}</span>}
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {tel && <a href={`tel:${tel}`} className="btn btn-ghost btn-sm"><Phone size={13} /> {cli.telefono}</a>}
                  {tel && <a href={`https://wa.me/${tel.replace(/^\+/, '')}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">WhatsApp</a>}
                  {cli.email && <a href={`mailto:${cli.email}`} className="btn btn-ghost btn-sm"><Mail size={13} /> Correo</a>}
                </span>
              </span></div>
          )}
          {v.tipos_servicio?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {v.tipos_servicio.map(t => <span key={t} style={{ fontSize: '0.74rem', padding: '0.2rem 0.6rem', borderRadius: 99, border: '1px solid var(--border2)', color: 'var(--muted)' }}>{TIPO_SERVICIO_OPCIONES.find(x => x.key === t)?.label || t}</span>)}
            </div>
          )}
        </div>

        <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {v.solicitudes?.descripcion && (
            <div><span className="label-muted">Qué pidió el cliente (SOL-{String(v.solicitudes.folio).padStart(4, '0')})</span>
              <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{v.solicitudes.descripcion}</p></div>
          )}
          <div><span className="label-muted">Notas de coordinación</span>
            <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: v.notas ? 'var(--text)' : 'var(--muted)', whiteSpace: 'pre-wrap' }}>{v.notas || 'Sin notas.'}</p></div>
          {cli?.notas && <div><span className="label-muted">Sobre el cliente</span>
            <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{cli.notas}</p></div>}
        </div>
      </div>

      <div className="panel-y" style={{ padding: '1rem', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="section-label" style={{ margin: 0 }}>Informes de la visita</p>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>Elige la planilla (levantamiento, checklist…), llénala por pasos y agrega las fotos dentro del informe.</p>
        <InformesDeVisita agendaId={v.id} editable={puedeTrabajar} tiposServicio={v.tipos_servicio}
          datos={() => ({ fecha: v.fecha, titulo: v.titulo, responsable: v.tecnico?.nombre || v.tecnico?.email || RESPONSABLE_LABEL[v.responsable],
            hora: v.hora_inicio?.slice(0, 5) || null, contacto: cli?.contacto_nombre || cli?.nombre_cliente, telefono: cli?.telefono,
            cliente: { nombre: cli?.nombre_cliente || 'Sin cliente', rut: cli?.rut, direccion } })} />
      </div>

      {puedeTrabajar && !cerrada && (
        <button className="btn btn-primary" style={{ marginTop: 12, width: '100%', justifyContent: 'center', height: 46 }} onClick={marcarRealizada} disabled={cerrando}>
          {cerrando ? <Loader2 size={15} className="iv-spin" /> : <CheckCircle2 size={15} />} Marcar visita realizada</button>
      )}
    </div>
  );
}
