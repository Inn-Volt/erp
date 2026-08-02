'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import type { ToastMessage } from '@/types';

let globalToast: ((msg: Omit<ToastMessage, 'id'>) => void) | null = null;

export function useToastProvider() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback((msg: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${++counterRef.current}`;
    setToasts(p => [...p, { ...msg, id }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  // Register globally
  globalToast = addToast;

  const removeToast = useCallback((id: string) => {
    setToasts(p => p.filter(t => t.id !== id));
  }, []);

  return { toasts, removeToast };
}

export function useToast() {
  const show = useCallback((msg: Omit<ToastMessage, 'id'>) => {
    globalToast?.(msg);
  }, []);

  // IMPORTANTE: el objeto se memoiza para que success/error/warning/info
  // conserven su identidad entre renders. Si no, cualquier useCallback/useEffect
  // que dependa de ellos se recrea en cada render → bucle de recarga (la
  // pestaña parpadea y los datos nunca terminan de cargar).
  return useMemo(() => ({
    success: (message: string) => show({ type: 'success', message }),
    error:   (message: string) => show({ type: 'error', message }),
    warning: (message: string) => show({ type: 'warning', message }),
    info:    (message: string) => show({ type: 'info', message }),
  }), [show]);
}
