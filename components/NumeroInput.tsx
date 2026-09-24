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
  value: number;
  onChange: (v: number) => void;
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
const aTextoEditable = (n: number) => (n ? String(n).replace('.', ',') : '');

export default function NumeroInput({
  value, onChange, prefijo, sufijo, placeholder, style, className, title, min, max, ariaLabel, formatear,
}: Props) {
  const [foco, setFoco] = useState(false);
  const [raw, setRaw] = useState('');

  const display = foco
    ? raw
    : (value ? (formatear ? formatear(value) : formatMiles(value)) : '');

  const adorno: React.CSSProperties = {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    color: 'var(--muted)', fontSize: '0.82rem', pointerEvents: 'none',
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {prefijo && <span style={{ ...adorno, left: 10 }}>{prefijo}</span>}
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={display}
        placeholder={placeholder}
        title={title}
        aria-label={ariaLabel}
        onFocus={e => {
          setRaw(aTextoEditable(value));
          setFoco(true);
          const el = e.currentTarget;
          requestAnimationFrame(() => { try { el.select(); } catch { /* sin selección */ } });
        }}
        onBlur={() => setFoco(false)}
        onChange={e => {
          const texto = e.target.value;
          setRaw(texto);
          let n = cleanNumber(texto);
          if (typeof min === 'number') n = Math.max(min, n);
          if (typeof max === 'number') n = Math.min(max, n);
          onChange(n);
        }}
        className={className}
        style={{
          ...style,
          paddingLeft: prefijo ? '1.5rem' : style?.paddingLeft,
          paddingRight: sufijo ? '1.5rem' : style?.paddingRight,
        }}
      />
      {sufijo && <span style={{ ...adorno, right: 10 }}>{sufijo}</span>}
    </div>
  );
}
