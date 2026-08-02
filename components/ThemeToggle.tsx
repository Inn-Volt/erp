'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export const TEMA_KEY = 'innvolt-tema';

/**
 * Botón para alternar entre tema claro y oscuro.
 * Guarda la preferencia en el navegador; el layout raíz la aplica
 * antes del primer pintado para evitar el parpadeo.
 */
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const siguiente = !dark;
    setDark(siguiente);
    document.documentElement.classList.toggle('dark', siguiente);
    try {
      localStorage.setItem(TEMA_KEY, siguiente ? 'dark' : 'light');
    } catch {
      /* almacenamiento no disponible: el tema dura solo esta sesión */
    }
  }

  const size = compact ? 32 : 36;

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={dark ? 'Tema claro' : 'Tema oscuro'}
      style={{
        width: size, height: size,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg3)',
        border: '1px solid var(--border2)',
        color: 'var(--muted)',
        cursor: 'pointer',
        borderRadius: 6,
        transition: 'color 0.15s, border-color 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = 'var(--y)';
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = 'var(--muted)';
        e.currentTarget.style.borderColor = 'var(--border2)';
      }}
    >
      {dark ? <Sun size={compact ? 14 : 16} /> : <Moon size={compact ? 14 : 16} />}
    </button>
  );
}
