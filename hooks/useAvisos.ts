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
          try {
            if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
              new Notification(nuevo.titulo, { body: nuevo.cuerpo || '', icon: '/icon-192.png' });
            }
          } catch { /* sin notificaciones del sistema */ }
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
