'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export const TEMA_KEY = 'innvolt-tema';

/**
 * Botón para alternar entre tema claro y oscuro (como el de TecApp).
 * Guarda la preferencia en el navegador; el layout raíz la aplica
 * antes del primer pintado para evitar el parpadeo.
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
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

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={dark ? 'Tema claro' : 'Tema oscuro'}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-content-muted transition hover:bg-surface-3 hover:text-content ${className}`}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
