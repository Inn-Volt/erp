'use client';

/**
 * Configuración → Avisos al celular: deja los avisos push listos con un clic y muestra qué
 * está bien y qué falta (servidor, base, claves, reintentos), los equipos registrados de
 * todo el equipo y cómo les fue a los últimos avisos. Ninguna clave pasa por aquí.
 */

import { useCallback, useEffect, useState } from 'react';
import { BellRing, CheckCircle2, CircleAlert, Loader2, RefreshCw, Send, Wrench } from 'lucide-react';
import { fetchConSesion } from '@/lib/fetchConSesion';
import { probarPush } from '@/lib/push';
import { useToast } from '@/hooks/useToast';

interface Estado {
  serviceRole: boolean;
  fase14?: boolean; pgNet?: boolean; pgCron?: boolean; reintentos?: boolean; disparador?: boolean;
  claves?: 'netlify' | 'base' | null; secreto?: 'netlify' | 'base' | null;
  url?: string | null; urlEsperada?: string; urlOk?: boolean;
  equipos?: { usuario: string; dispositivo: string | null; created_at: string; ultimo_ok_at?: string | null; fallos?: number; ultimo_error?: string | null }[];
  avisos?: { usuario: string; titulo: string; tipo: string; created_at: string; push_estado: string; push_intentos: number; push_detalle: string | null }[];
  resumen?: Record<string, number>;
}

const ESTADO_AVISO: Record<string, { texto: string; color: string }> = {
  enviado: { texto: 'Llegó', color: 'var(--success)' },
  enviando: { texto: 'Enviando…', color: 'var(--muted)' },
  sin_equipos: { texto: 'Sin equipos', color: 'var(--muted)' },
  sin_config: { texto: 'Sin configurar', color: '#d97706' },
  leida: { texto: 'Ya lo vio en la app', color: 'var(--muted)' },
  error: { texto: 'Falló', color: 'var(--danger)' },
};

const EN_RESUMEN: Record<string, [string, string]> = {
  enviado: ['llegó', 'llegaron'], enviando: ['enviándose', 'enviándose'], sin_equipos: ['sin equipos', 'sin equipos'],
  sin_config: ['sin configurar', 'sin configurar'], leida: ['ya visto en la app', 'ya vistos en la app'], error: ['falló', 'fallaron'],
};

const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

function Punto({ ok, texto, ayuda }: { ok: boolean; texto: string; ayuda?: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.85rem', padding: '0.2rem 0' }}>
      {ok ? <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0, marginTop: 1 }} /> : <CircleAlert size={16} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />}
      <span style={{ color: 'var(--text)' }}>{texto}{!ok && ayuda ? <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--muted)' }}>{ayuda}</span> : null}</span>
    </div>
  );
}

export default function AvisosCelularAdmin() {
  const { success, error: toastError } = useToast();
  const [e, setE] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<null | 'configurar' | 'probar'>(null);

  const leer = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetchConSesion('/api/push/estado');
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || 'No se pudo revisar');
      setE(j);
    } catch (err) { toastError(err instanceof Error ? err.message : 'No se pudo revisar'); }
    finally { setCargando(false); }
  }, [toastError]);
  useEffect(() => { leer(); }, [leer]);

  const configurar = async () => {
    setOcupado('configurar');
    try {
      const r = await fetchConSesion('/api/push/configurar', { method: 'POST' });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || 'No se pudo configurar');
      success('Avisos al celular configurados. Ahora actívalos en cada equipo (Mi cuenta o Inicio).');
    } catch (err) { toastError(err instanceof Error ? err.message : 'No se pudo configurar'); }
    finally { setOcupado(null); leer(); }
  };
  const probar = async () => {
    setOcupado('probar');
    try { const r = await probarPush(); success(`Prueba enviada a ${r.enviados} de ${r.dispositivos} equipo${r.dispositivos === 1 ? '' : 's'} tuyos`); }
    catch (err) { toastError(err instanceof Error ? err.message : 'No se pudo enviar'); }
    finally { setOcupado(null); leer(); }
  };

  const listo = !!e && e.serviceRole && !!e.fase14 && !!e.claves && !!e.secreto && !!e.urlOk;
  const resumen = Object.entries(e?.resumen || {});

  return (
    <div id="avisos-celular" className="panel-y" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <p className="section-label" style={{ margin: 0, flex: 1 }}><BellRing size={15} /> Avisos al celular (iPhone, Android y computador)</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={leer} disabled={cargando} aria-label="Revisar de nuevo">
          {cargando ? <Loader2 size={13} className="iv-spin" /> : <RefreshCw size={13} />} Revisar</button>
      </div>
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
        Todo aviso de la campana (visitas, cotizaciones, OT, tareas, pedidos, gastos, pagos, solicitudes…) llega también a los equipos de la persona, aunque la app esté cerrada. Si un envío falla, la base lo reintenta sola.
      </p>

      {e && !cargando && (
        <div>
          <Punto ok={e.serviceRole} texto="Servidor con acceso a la base" ayuda="Falta SUPABASE_SERVICE_ROLE_KEY en Netlify (Site configuration → Environment variables)." />
          {e.serviceRole && <>
            <Punto ok={!!e.fase14} texto="Base actualizada (fase 14)" ayuda="Ejecuta supabase_fase14_push.sql en Supabase → SQL Editor." />
            <Punto ok={!!e.claves && !!e.secreto && !!e.urlOk} texto={e.claves && e.secreto && e.urlOk ? `Envío configurado${e.claves === 'netlify' ? ' (claves de Netlify)' : ''}` : 'Envío configurado'}
              ayuda={e.url && !e.urlOk ? `La base llama a ${e.url}; debería ser ${e.urlEsperada}. Toca «Configurar».` : 'Toca «Configurar»: se generan las claves y se conecta la base con este ERP.'} />
            <Punto ok={!!e.pgNet && !!e.disparador} texto="La base puede llamar al servidor (pg_net)" ayuda="Activa pg_net en Supabase → Database → Extensions y vuelve a ejecutar la fase 14." />
            <Punto ok={!!e.reintentos} texto="Reintentos automáticos cada minuto (pg_cron)" ayuda="Activa pg_cron en Supabase → Database → Extensions y vuelve a ejecutar la fase 14. Sin esto, un aviso que falla no se reintenta." />
          </>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {e?.serviceRole && <button type="button" className={listo ? 'btn btn-ghost' : 'btn btn-primary'} onClick={configurar} disabled={!!ocupado || !e.fase14}>
          {ocupado === 'configurar' ? <Loader2 size={14} className="iv-spin" /> : <Wrench size={14} />} {listo ? 'Volver a configurar' : 'Configurar'}</button>}
        {listo && <button type="button" className="btn btn-ghost" onClick={probar} disabled={!!ocupado}>
          {ocupado === 'probar' ? <Loader2 size={14} className="iv-spin" /> : <Send size={14} />} Enviarme una prueba</button>}
      </div>

      {e?.equipos && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '0.84rem', color: 'var(--text)' }}>Equipos con avisos activos ({e.equipos.length})</summary>
          {e.equipos.length === 0 ? <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '6px 0' }}>Nadie los ha activado todavía. Cada persona los activa en su equipo desde Inicio o Mi cuenta.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', marginTop: 6 }}>
                <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}><th style={{ padding: 4 }}>Persona</th><th style={{ padding: 4 }}>Equipo</th><th style={{ padding: 4 }}>Último recibido</th><th style={{ padding: 4 }}>Fallos</th></tr></thead>
                <tbody>
                  {e.equipos.map((q, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border2)' }}>
                      <td style={{ padding: 4 }}>{q.usuario}</td>
                      <td style={{ padding: 4 }}>{q.dispositivo || '—'}</td>
                      <td style={{ padding: 4, whiteSpace: 'nowrap' }}>{fecha(q.ultimo_ok_at)}</td>
                      <td style={{ padding: 4, color: (q.fallos || 0) > 2 ? '#d97706' : 'var(--muted)' }} title={q.ultimo_error || ''}>{q.fallos || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      )}

      {e?.avisos && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '0.84rem', color: 'var(--text)' }}>
            Últimos avisos{resumen.length ? ` · 24 h: ${resumen.map(([k, n]) => `${n} ${EN_RESUMEN[k]?.[n === 1 ? 0 : 1] || k}`).join(', ')}` : ''}
          </summary>
          {e.avisos.length === 0 ? <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '6px 0' }}>Todavía no hay avisos con envío al celular.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', marginTop: 6 }}>
                <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}><th style={{ padding: 4 }}>Cuándo</th><th style={{ padding: 4 }}>Para</th><th style={{ padding: 4 }}>Aviso</th><th style={{ padding: 4 }}>Celular</th></tr></thead>
                <tbody>
                  {e.avisos.map((a, i) => {
                    const est = ESTADO_AVISO[a.push_estado] || { texto: a.push_estado, color: 'var(--muted)' };
                    return (
                      <tr key={i} style={{ borderTop: '1px solid var(--border2)' }}>
                        <td style={{ padding: 4, whiteSpace: 'nowrap' }}>{fecha(a.created_at)}</td>
                        <td style={{ padding: 4 }}>{a.usuario}</td>
                        <td style={{ padding: 4 }}>{a.titulo}</td>
                        <td style={{ padding: 4, color: est.color, whiteSpace: 'nowrap' }} title={a.push_detalle || ''}>
                          {est.texto}{a.push_intentos > 1 ? ` (${a.push_intentos} intentos)` : ''}
                          {a.push_estado === 'error' && a.push_detalle ? <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)', whiteSpace: 'normal' }}>{a.push_detalle}</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </details>
      )}
    </div>
  );
}
