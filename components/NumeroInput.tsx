'use client';

/**
 * NumeroInput
 * ─────────────────────────────────────────────────────────────────────────────
 * Input numérico que MUESTRA separador de miles chileno (60000 → "60.000").
 * Un <input type="number"> no admite el punto, así que usa type="text":
 *   · al salir del campo se ve formateado ("60.000")
 *   · al escribir se ven los dígitos limpios (sin saltos de cursor)
 * Admite prefijo ($) y sufijo (%).
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
}

export default function NumeroInput({
  value, onChange, prefijo, sufijo, placeholder, style, className, title, min, max, ariaLabel,
}: Props) {
  const [foco, setFoco] = useState(false);
  const display = foco
    ? (value ? String(value) : '')
    : (value ? formatMiles(value) : '');

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
        value={display}
        placeholder={placeholder}
        title={title}
        aria-label={ariaLabel}
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
        onChange={e => {
          let n = cleanNumber(e.target.value);
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
