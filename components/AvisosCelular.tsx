'use client';

/**
 * «Avisos en este equipo» (como en TecApp): activa los avisos al celular o al computador
 * para que lleguen aunque InnVolt esté cerrada. Explica qué falta cuando no se puede
 * (iPhone sin instalar la app, permiso bloqueado, servidor sin configurar).
 * `compacto`: franja para «Mis OT» que solo se ve si todavía no están activos.
 */

import { useCallback, useEffect, useState } from 'react';
import { BellRing, BellOff, Loader2, Send, Smartphone } from 'lucide-react';
import { activarPush, desactivarPush, estadoPush, probarPush, resincronizarPush, type EstadoPush } from '@/lib/push';
import { useToast } from '@/hooks/useToast';

const AYUDA: Record<EstadoPush, string> = {
  'no-soportado': 'Este navegador no recibe avisos. En Android usa Chrome; en iPhone, la app instalada.',
  'no-seguro': 'Los avisos solo funcionan con la dirección segura (https) del ERP.',
  'instalar-ios': 'En iPhone: toca Compartir → «Agregar a pantalla de inicio», abre InnVolt desde ese ícono y actívalos ahí.',
  'sin-servidor': 'Falta configurar el envío en el servidor (claves VAPID en Netlify). Avísale al administrador.',
  bloqueado: 'Bloqueaste los avisos para InnVolt. Actívalos en los ajustes del navegador o del teléfono (Notificaciones).',
  inactivo: 'Actívalos para que te llegue al celular cuando entre una solicitud, el cliente responda una cotización o te asignen algo, aunque la app esté cerrada.',
  activo: 'Activos en este equipo. Te llegan aunque InnVolt esté cerrada.',
};

export default function AvisosCelular({ compacto = false }: { compacto?: boolean }) {
  const { success, error: toastError } = useToast();
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const leer = useCallback(() => { estadoPush().then(setEstado).catch(() => setEstado('no-soportado')); }, []);
  useEffect(() => { leer(); resincronizarPush(); }, [leer]);

  const activar = async () => {
    setOcupado(true);
    try { await activarPush(); success('Avisos activados en este equipo'); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudieron activar'); }
    finally { setOcupado(false); leer(); }
  };
  const desactivar = async () => {
    setOcupado(true);
    try { await desactivarPush(); success('Avisos desactivados en este equipo'); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudieron desactivar'); }
    finally { setOcupado(false); leer(); }
  };
  const probar = async () => {
    setOcupado(true);
    try { const r = await probarPush(); success(`Aviso de prueba enviado a ${r.enviados} de ${r.dispositivos} equipo${r.dispositivos === 1 ? '' : 's'}`); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo enviar'); }
    finally { setOcupado(false); }
  };

  if (!estado) return null;

  if (compacto) {
    if (estado === 'activo' || estado === 'no-soportado' || estado === 'no-seguro' || estado === 'sin-servidor') return null;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-content">
        <BellRing size={18} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">{AYUDA[estado]}</span>
        {estado === 'inactivo' && (
          <button className="btn btn-primary btn-sm" onClick={activar} disabled={ocupado}>
            {ocupado ? <Loader2 size={13} className="iv-spin" /> : <BellRing size={13} />} Activar avisos</button>
        )}
      </div>
    );
  }

  return (
    <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="section-label" style={{ margin: 0 }}><Smartphone size={15} /> Avisos en este equipo</p>
      <p style={{ margin: 0, fontSize: '0.86rem', color: estado === 'activo' ? 'var(--success)' : 'var(--muted)' }}>{AYUDA[estado]}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {estado === 'inactivo' && <button className="btn btn-primary" onClick={activar} disabled={ocupado}>
          {ocupado ? <Loader2 size={14} className="iv-spin" /> : <BellRing size={14} />} Activar avisos</button>}
        {estado === 'activo' && <>
          <button className="btn btn-ghost" onClick={probar} disabled={ocupado}><Send size={14} /> Probar</button>
          <button className="btn btn-ghost" onClick={desactivar} disabled={ocupado}><BellOff size={14} /> Desactivar</button>
        </>}
      </div>
    </div>
  );
}
