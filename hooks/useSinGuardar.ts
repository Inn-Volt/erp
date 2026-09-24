'use client';

/**
 * Registro global (en memoria) de "hay cambios sin guardar".
 * ─────────────────────────────────────────────────────────────────────────────
 * El cotizador marca cuando tiene cambios pendientes y el menú lateral pregunta
 * antes de navegar a otra sección, para no perder una cotización a medio hacer.
 * (El cierre/recarga de pestaña lo cubre `beforeunload` en el propio cotizador.)
 */

let sinGuardar = false;

export function marcarSinGuardar(v: boolean): void {
  sinGuardar = v;
}

/** true si se puede salir (no hay cambios o el usuario confirmó). */
export function confirmarSalida(): boolean {
  if (!sinGuardar || typeof window === 'undefined') return true;
  const ok = window.confirm('Tienes cambios sin guardar en la cotización. ¿Salir de todos modos?');
  if (ok) sinGuardar = false;
  return ok;
}
