'use client';

/**
 * Avisos del usuario (campana): UNA sola suscripción por sesión, aunque la campana
 * se muestre en varios lugares (menú, menú plegado, barra del celular).
 * Llegan al instante por Supabase Realtime y, de respaldo, se revisan cada minuto.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface Aviso {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  url: string | null;
  leida_at: string | null;
  created_at: string;
}

/**
 * Con la app abierta en segundo plano, el aviso se muestra en el sistema. Si este equipo tiene
 * los avisos al celular activos, ya lo muestra el push: no se repite.
 */
async function avisoDelSistema(a: Aviso): Promise<void> {
  try {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration('/');
    if (await reg?.pushManager?.getSubscription()) return;
    new Notification(a.titulo, { body: a.cuerpo || '', icon: '/icon-192.png', tag: a.id });
  } catch { /* sin notificaciones del sistema (Android solo las permite desde el service worker) */ }
}

export interface DatosAvisos {
  avisos: Aviso[];
  noLeidos: number;
  marcar: (ids: string[]) => Promise<void>;
}

export function useAvisos(userId: string | null): DatosAvisos {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('notificaciones')
      .select('id, tipo, titulo, cuerpo, url, leida_at, created_at')
      .order('created_at', { ascending: false }).limit(30);
    if (data) setAvisos(data as Aviso[]);
  }, []);

  useEffect(() => {
    if (!userId) { setAvisos([]); return; }
    cargar();
    // Nombre único por montaje: al desmontar y volver a montar (modo estricto de React),
    // el canal anterior todavía se está cerrando y no se puede reutilizar.
    const canal = supabase.channel(`avisos-${userId}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${userId}` },
        (p) => {
          const nuevo = p.new as Aviso;
          setAvisos(prev => (prev.some(a => a.id === nuevo.id) ? prev : [nuevo, ...prev].slice(0, 30)));
          avisoDelSistema(nuevo);
        })
      .subscribe();
    const t = setInterval(cargar, 60_000);
    return () => { clearInterval(t); supabase.removeChannel(canal); };
  }, [userId, cargar]);

  const marcar = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const ahora = new Date().toISOString();
    setAvisos(prev => prev.map(a => (ids.includes(a.id) ? { ...a, leida_at: a.leida_at || ahora } : a)));
    await supabase.from('notificaciones').update({ leida_at: ahora }).in('id', ids);
  }, []);

  return { avisos, noLeidos: avisos.filter(a => !a.leida_at).length, marcar };
}
