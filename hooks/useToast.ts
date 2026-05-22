'use client';

import { useState, useCallback, useRef } from 'react';
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

  return {
    success: (message: string) => show({ type: 'success', message }),
    error: (message: string) => show({ type: 'error', message }),
    warning: (message: string) => show({ type: 'warning', message }),
    info: (message: string) => show({ type: 'info', message }),
  };
}
