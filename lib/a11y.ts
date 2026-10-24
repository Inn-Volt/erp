import type { KeyboardEvent } from 'react';

/**
 * Para filas o tarjetas que se abren con un clic (div o tr con onClick): que también se
 * puedan abrir con el teclado (Tab para llegar, Enter o Espacio para abrir).
 */
export const filaClicable = {
  role: 'button' as const,
  tabIndex: 0,
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); }
  },
};
