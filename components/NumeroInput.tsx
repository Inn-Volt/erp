'use client';

/**
 * NumeroInput
 * ─────────────────────────────────────────────────────────────────────────────
 * Input numérico pensado para Chile (y para el teclado del celular):
 *   · type="text" + inputMode="decimal": abre el teclado numérico en iPhone y
 *     Android y acepta la COMA decimal ("2,5"), que un <input type="number">
 *     rechaza (dejaba el valor en 0).
 *   · Mientras escribes se conserva EXACTAMENTE tu texto ("1,25", "45.000"):
 *     antes se reconstruía desde el número y la coma o el punto desaparecían,
 *     lo que impedía ingresar decimales (UF, metros).
 *   · Al salir del campo se muestra formateado ("45.000", "$45.000", "UF 1,25").
 *   · Al entrar se selecciona el contenido: tipeas y reemplazas, sin borrar.
 * Admite prefijo ($) y sufijo (%), y un formateador propio para la vista.
 */

import { useState } from 'react';
import { cleanNumber, formatMiles } from '@/utils';

interface Props {
  /** Vacío (null/undefined) se muestra en blanco. */
  value: number | null | undefined;
  onChange: (v: number) => void;
  /** Si se pasa, borrar el campo llama a esto (el valor queda vacío) en vez de onChange(0). */
  onVacio?: () => void;
  /** Muestra el 0 (por omisión un 0 se ve en blanco). */
  mostrarCero?: boolean;
  /** Decimales al mostrarlo sin foco (por omisión 2; en UF los costos llevan hasta 6). */
  decimales?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  /** Estilo del contenedor (p. ej. un ancho fijo dentro de una fila). */
  envoltura?: React.CSSProperties;
  prefijo?: string;
  sufijo?: string;
  placeholder?: string;
  style?: React.CSSProperties;
  className?: string;
  title?: string;
  min?: number;
  max?: number;
  ariaLabel?: string;
  /** Cómo se muestra el valor cuando el campo NO tiene foco (por defecto "45.000"). */
  formatear?: (v: number) => string;
}

/** Número → texto editable en formato chileno (1.25 → "1,25"; 45000 → "45000"). */
const aTextoEditable = (n: number | null | undefined, cero = false) =>
  (n || (cero && n === 0) ? String(Math.round(Number(n) * 1e6) / 1e6).replace('.', ',') : '');

export default function NumeroInput({
  value, onChange, prefijo, sufijo, placeholder, style, className, title, min, max, ariaLabel, formatear,
  onVacio, mostrarCero, decimales = 2, disabled, autoFocus, onKeyDown, envoltura,
}: Props) {
  const [foco, setFoco] = useState(false);
  const [raw, setRaw] = useState('');

  const hay = typeof value === 'number' && Number.isFinite(value) && (value !== 0 || !!mostrarCero);
  const display = foco
    ? raw
    : (hay ? (formatear ? formatear(value as number) : decimales === 2 ? formatMiles(value as number)
      : new Intl.NumberFormat('es-CL', { maximumFractionDigits: decimales }).format(value as number)) : '');

  const adorno: React.CSSProperties = {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    color: 'var(--muted)', fontSize: '0.78rem', pointerEvents: 'none',
  };

  return (
    <div style={{ position: 'relative', width: '100%', ...envoltura }}>
      {prefijo && <span style={{ ...adorno, left: 8 }}>{prefijo}</span>}
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={display}
        placeholder={placeholder}
        title={title}
        aria-label={ariaLabel}
        disabled={disabled}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        onFocus={e => {
          setRaw(aTextoEditable(value, mostrarCero));
          setFoco(true);
          const el = e.currentTarget;
          requestAnimationFrame(() => { try { el.select(); } catch { /* sin selección */ } });
        }}
        onBlur={() => setFoco(false)}
        onChange={e => {
          const texto = e.target.value;
          setRaw(texto);
          if (onVacio && texto.trim() === '') { onVacio(); return; }
          let n = cleanNumber(texto);
          if (typeof min === 'number') n = Math.max(min, n);
          if (typeof max === 'number') n = Math.min(max, n);
          onChange(n);
        }}
        className={className}
        style={{
          ...style,
          // El espacio del adorno según su largo ($ · UF · %), para que el número nunca lo pise.
          paddingLeft: prefijo ? `${0.85 + prefijo.length * 0.5}rem` : style?.paddingLeft,
          paddingRight: sufijo ? `${0.85 + sufijo.length * 0.5}rem` : style?.paddingRight,
        }}
      />
      {sufijo && <span style={{ ...adorno, right: 8 }}>{sufijo}</span>}
    </div>
  );
}
