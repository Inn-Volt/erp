'use client';

/**
 * «Avisos en este equipo» (como en TecApp): activa los avisos al celular o al computador
 * para que lleguen aunque InnVolt esté cerrada. Explica qué falta cuando no se puede
 * (iPhone sin instalar la app, permiso bloqueado, avisos sin configurar).
 * Completo (Mi cuenta): también lista los equipos de la persona, con el último aviso que
 * recibió cada uno, deja quitar los que ya no usa y revisar este equipo paso a paso.
 * Un equipo recibe los avisos de una sola cuenta: la última que los activó en él.
 * `compacto`: franja para Inicio y «Mis OT» que solo se ve si todavía no están activos.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BellRing, BellOff, CheckCircle2, CircleAlert, CircleHelp, Loader2, Send, Smartphone, Trash2 } from 'lucide-react';
import { activarPush, desactivarPush, diagnosticoEquipo, estadoPush, probarPush, resincronizarPush, type DiagnosticoEquipo, type EstadoPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/useToast';
import { usePermisos } from '@/hooks/usePermisos';

const AYUDA: Record<EstadoPush, string> = {
  'no-soportado': 'Este navegador no recibe avisos. En Android usa Chrome; en el computador, Chrome, Edge o Firefox; en iPhone, la app instalada.',
  'no-seguro': 'Los avisos solo funcionan con la dirección segura (https) del ERP.',
  'instalar-ios': 'En iPhone: toca Compartir → «Agregar a pantalla de inicio», abre InnVolt desde ese ícono y actívalos ahí.',
  'sin-servidor': 'Los avisos al celular todavía no están configurados. El administrador los activa en Configuración → Avisos al celular.',
  bloqueado: 'Bloqueaste los avisos para InnVolt. Actívalos en los ajustes del navegador o del teléfono (Notificaciones) y vuelve aquí.',
  inactivo: 'Actívalos para que te llegue al celular o al computador cuando te asignen una visita, el cliente responda una cotización o pase algo tuyo, aunque la app esté cerrada.',
  'otra-cuenta': 'Este equipo recibe los avisos de otra cuenta. Si los activas aquí, pasan a la tuya (la otra cuenta deja de recibirlos en este equipo).',
  activo: 'Activos en este equipo. Te llegan aunque InnVolt esté cerrada.',
};

interface Equipo { id: string; endpoint: string; dispositivo: string | null; created_at: string; ultimo_ok_at?: string | null; fallos?: number | null }

const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null);

export default function AvisosCelular({ compacto = false }: { compacto?: boolean }) {
  const { success, error: toastError } = useToast();
  const { puede } = usePermisos();
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [este, setEste] = useState<string | null>(null);
  const [fallo, setFallo] = useState('');
  const [revision, setRevision] = useState<DiagnosticoEquipo[] | null>(null);
  const revisar = async () => { setRevision(null); setRevision(await diagnosticoEquipo().catch(() => [])); };

  const leer = useCallback(() => { estadoPush().then(setEstado).catch(() => setEstado('no-soportado')); }, []);
  const leerEquipos = useCallback(async () => {
    if (compacto) return;
    let r = await supabase.from('push_suscripciones').select('id, endpoint, dispositivo, created_at, ultimo_ok_at, fallos').order('created_at', { ascending: false });
    if (r.error) r = await supabase.from('push_suscripciones').select('id, endpoint, dispositivo, created_at').order('created_at', { ascending: false }) as typeof r;
    setEquipos((r.data || []) as Equipo[]);
    try {
      const reg = await navigator.serviceWorker?.getRegistration('/');
      setEste((await reg?.pushManager.getSubscription())?.endpoint || null);
    } catch { setEste(null); }
  }, [compacto]);
  useEffect(() => { resincronizarPush().finally(() => { leer(); leerEquipos(); }); }, [leer, leerEquipos]);

  const activar = async () => {
    setOcupado(true);
    setFallo('');
    try { await activarPush(); success('Avisos activados en este equipo'); }
    catch (e) { const m = e instanceof Error ? e.message : 'No se pudieron activar'; setFallo(m); toastError(m); }
    finally { setOcupado(false); leer(); leerEquipos(); if (revision) revisar(); }
  };
  const desactivar = async () => {
    setOcupado(true);
    try { await desactivarPush(); success('Avisos desactivados en este equipo'); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudieron desactivar'); }
    finally { setOcupado(false); leer(); leerEquipos(); }
  };
  const probar = async () => {
    setOcupado(true);
    try { const r = await probarPush(); success(`Aviso de prueba enviado a ${r.enviados} de ${r.dispositivos} equipo${r.dispositivos === 1 ? '' : 's'}`); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo enviar'); }
    finally { setOcupado(false); leerEquipos(); }
  };
  const quitar = async (eq: Equipo) => {
    if (!confirm(`¿Dejar de mandar avisos a «${eq.dispositivo || 'este equipo'}»?`)) return;
    const { error } = await supabase.rpc('push_quitar', { p_endpoint: eq.endpoint });
    if (error) toastError(error.message); else success('Equipo quitado');
    leerEquipos();
  };

  if (!estado) return null;

  const puedeActivar = estado === 'inactivo' || estado === 'otra-cuenta';
  const textoActivar = estado === 'otra-cuenta' ? 'Activar en mi cuenta' : 'Activar avisos';

  if (compacto) {
    if (estado === 'activo' || estado === 'no-soportado' || estado === 'no-seguro' || estado === 'sin-servidor') return null;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-content">
        <BellRing size={18} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">{AYUDA[estado]}{fallo && <span style={{ display: 'block', color: 'var(--danger)', marginTop: 4 }}>{fallo}</span>}</span>
        {puedeActivar && (
          <button className="btn btn-primary btn-sm" onClick={activar} disabled={ocupado}>
            {ocupado ? <Loader2 size={13} className="iv-spin" /> : <BellRing size={13} />} {textoActivar}</button>
        )}
      </div>
    );
  }

  return (
    <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="section-label" style={{ margin: 0 }}><Smartphone size={15} /> Avisos en este equipo</p>
      <p style={{ margin: 0, fontSize: '0.86rem', color: estado === 'activo' ? 'var(--success)' : 'var(--muted)' }}>
        {AYUDA[estado]}
        {estado === 'sin-servidor' && puede('configuracion.gestionar') && <> <Link href="/configuracion#avisos-celular" style={{ color: 'var(--y)' }}>Configurarlos ahora</Link></>}
      </p>
      {fallo && <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--danger)' }}>{fallo}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {puedeActivar && <button className="btn btn-primary" onClick={activar} disabled={ocupado}>
          {ocupado ? <Loader2 size={14} className="iv-spin" /> : <BellRing size={14} />} {textoActivar}</button>}
        {estado === 'activo' && <button className="btn btn-ghost" onClick={desactivar} disabled={ocupado}><BellOff size={14} /> Desactivar aquí</button>}
        {equipos.length > 0 && <button className="btn btn-ghost" onClick={probar} disabled={ocupado}>
          {ocupado ? <Loader2 size={14} className="iv-spin" /> : <Send size={14} />} Enviarme una prueba</button>}
      </div>
      {equipos.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border2)', paddingTop: 8 }}>
          <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Tus equipos con avisos ({equipos.length})</span>
          {equipos.map(eq => (
            <div key={eq.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.35rem 0', fontSize: '0.84rem', borderBottom: '1px solid var(--border2)' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', color: 'var(--text)' }}>{eq.dispositivo || 'Equipo'}{eq.endpoint === este ? ' · este' : ''}</span>
                <span style={{ display: 'block', fontSize: '0.72rem', color: (eq.fallos || 0) > 2 ? '#d97706' : 'var(--muted)' }}>
                  {eq.ultimo_ok_at ? `Último aviso recibido: ${fecha(eq.ultimo_ok_at)}` : `Activado el ${fecha(eq.created_at)}`}
                  {(eq.fallos || 0) > 2 ? ` · ${eq.fallos} envíos fallidos` : ''}
                </span>
              </span>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => quitar(eq)} aria-label={`Quitar ${eq.dispositivo || 'equipo'}`} title="Dejar de mandar avisos a este equipo"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
      <details onToggle={e => { if ((e.target as HTMLDetailsElement).open && !revision) revisar(); }}>
        <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--muted)' }}>Revisar este equipo (si no llegan o no se pueden activar)</summary>
        {!revision ? <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '6px 0' }}><Loader2 size={12} className="iv-spin" /> Revisando…</p> : (
          <div style={{ marginTop: 6 }}>
            {revision.map(r => (
              <div key={r.punto} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.8rem', padding: '0.15rem 0' }}>
                {r.ok === true ? <CheckCircle2 size={14} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} />
                  : r.ok === false ? <CircleAlert size={14} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />
                  : <CircleHelp size={14} color="var(--muted)" style={{ flexShrink: 0, marginTop: 2 }} />}
                <span style={{ color: 'var(--text)' }}>{r.punto}: <span style={{ color: 'var(--muted)' }}>{r.detalle}</span></span>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-xs" onClick={revisar} style={{ marginTop: 4 }}>Revisar de nuevo</button>
          </div>
        )}
      </details>
    </div>
  );
}
