'use client';

/**
 * Campana de avisos (portada de TecApp): cuando el cliente abre, acepta o rechaza
 * una cotización, la base de datos crea un aviso para cada usuario con permiso
 * (supabase_fase1_usuarios_permisos.sql → notificar). Llega al instante por
 * Supabase Realtime; si Realtime no está activo, se revisa cada minuto.
 */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, X, Eye, CircleCheck, CircleX } from 'lucide-react';
import { confirmarSalida } from '@/hooks/useSinGuardar';
import type { Aviso, DatosAvisos } from '@/hooks/useAvisos';

function haceCuanto(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 172800) return 'ayer';
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
}

const ICONO: Record<string, { Icon: React.ElementType; color: string }> = {
  cotizacion_vista: { Icon: Eye, color: 'var(--info)' },
  cotizacion_aceptada: { Icon: CircleCheck, color: 'var(--success)' },
  cotizacion_rechazada: { Icon: CircleX, color: 'var(--danger)' },
};

/** Botón de la campana + lista. Los datos vienen de useAvisos (una sola suscripción). */
export default function CampanaAvisos({ datos }: { datos: DatosAvisos }) {
  const router = useRouter();
  const { avisos, noLeidos, marcar } = datos;
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const boton = useRef<HTMLButtonElement>(null);

  const abrir = () => {
    const r = boton.current?.getBoundingClientRect();
    if (r) {
      const ancho = Math.min(380, window.innerWidth - 16);
      // Escritorio: a la derecha de la campana; celular: bajo la barra, centrado.
      const left = window.innerWidth >= 768 ? Math.min(r.right + 8, window.innerWidth - ancho - 8) : (window.innerWidth - ancho) / 2;
      const top = window.innerWidth >= 768 ? Math.max(8, r.top) : r.bottom + 8;
      setPos({ top, left });
    }
    setAbierto(a => !a);
  };

  const ir = (a: Aviso) => {
    marcar([a.id]);
    setAbierto(false);
    if (a.url && confirmarSalida()) router.push(a.url);
  };

  const pedirPermisoSistema = async () => {
    try { if ('Notification' in window) await Notification.requestPermission(); } catch { /* ok */ }
  };

  return (
    <>
      <button ref={boton} onClick={abrir} aria-label={noLeidos ? `${noLeidos} avisos sin leer` : 'Avisos'} title="Avisos"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-content-muted hover:bg-surface-3 hover:text-content">
        <Bell size={17} />
        {noLeidos > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-innvolt px-1 text-[10px] font-bold text-innvolt-ink">
            {noLeidos > 9 ? '9+' : noLeidos}
          </span>
        )}
      </button>

      {abierto && pos && (
        <div className="fixed inset-0 z-[210]" onClick={() => setAbierto(false)}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Avisos"
            className="absolute flex max-h-[70vh] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xl"
            style={{ top: pos.top, left: pos.left, width: Math.min(380, typeof window !== 'undefined' ? window.innerWidth - 16 : 380) }}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-sm font-semibold text-content">Avisos</span>
              <span className="flex items-center gap-1">
                {noLeidos > 0 && (
                  <button onClick={() => marcar(avisos.filter(a => !a.leida_at).map(a => a.id))}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-content-muted hover:bg-surface-3 hover:text-content">
                    <CheckCheck size={13} /> Marcar todo leído
                  </button>
                )}
                <button onClick={() => setAbierto(false)} aria-label="Cerrar" className="rounded-md p-1 text-content-muted hover:bg-surface-3"><X size={15} /></button>
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {avisos.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-content-muted">Sin avisos todavía. Aquí verás cuando un cliente abra, acepte o rechace una cotización.</p>
              ) : avisos.map(a => {
                const ic = ICONO[a.tipo] || { Icon: Bell, color: 'var(--muted)' };
                return (
                  <button key={a.id} onClick={() => ir(a)}
                    className={`flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition hover:bg-surface-3 ${a.leida_at ? '' : 'bg-surface-2'}`}>
                    <ic.Icon size={17} style={{ color: ic.color, flexShrink: 0, marginTop: 2 }} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${a.leida_at ? 'text-content' : 'font-semibold text-content'}`}>{a.titulo}</span>
                      {a.cuerpo && <span className="mt-0.5 block text-xs text-content-muted">{a.cuerpo}</span>}
                      <span className="mt-1 block text-[11px] text-content-muted">{haceCuanto(a.created_at)}</span>
                    </span>
                    {!a.leida_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-innvolt" aria-label="Sin leer" />}
                  </button>
                );
              })}
            </div>
            {typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default' && (
              <button onClick={pedirPermisoSistema} className="border-t border-line px-4 py-2.5 text-left text-xs text-content-muted hover:bg-surface-3 hover:text-content">
                Avisarme también con notificaciones del sistema en este equipo
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
