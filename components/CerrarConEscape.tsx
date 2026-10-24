'use client';

/**
 * Esc cierra la ventana emergente de arriba (cualquier .modal-overlay de la app), apretando su
 * botón de cerrar. Si en esa ventana se escribió algo, primero pregunta, para no perderlo.
 * No muestra nada; va una vez en el armazón de la app.
 */

import { useEffect } from 'react';

const BOTON_CERRAR = 'button[aria-label="Cerrar"], button[aria-label^="Cerrar "], button:has(> svg.lucide-x:only-child)';

export default function CerrarConEscape() {
  useEffect(() => {
    // Lo que se escribe dentro de una ventana la marca como «con cambios».
    const marcar = (e: Event) => {
      const o = (e.target as HTMLElement | null)?.closest?.('.modal-overlay');
      if (o) o.setAttribute('data-con-cambios', '1');
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      const ventanas = document.querySelectorAll<HTMLElement>('.modal-overlay');
      const arriba = ventanas[ventanas.length - 1];
      if (!arriba) return;
      // Un menú desplegable abierto dentro de la ventana se cierra primero (lo maneja el navegador).
      if ((document.activeElement as HTMLElement | null)?.tagName === 'SELECT') return;
      let cerrar: HTMLButtonElement | null = null;
      try { cerrar = arriba.querySelector<HTMLButtonElement>(BOTON_CERRAR); } catch { cerrar = arriba.querySelector<HTMLButtonElement>('button[aria-label="Cerrar"]'); }
      if (!cerrar || cerrar.disabled) return;
      if (arriba.dataset.conCambios && !confirm('¿Cerrar sin guardar lo que escribiste?')) { e.preventDefault(); return; }
      e.preventDefault();
      cerrar.click();
    };
    document.addEventListener('input', marcar, true);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('input', marcar, true);
      document.removeEventListener('keydown', tecla);
    };
  }, []);
  return null;
}
