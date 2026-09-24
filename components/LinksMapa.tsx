'use client';

import { MapPin, Navigation } from 'lucide-react';

/** URLs de navegación para una dirección (o coordenadas "lat,lng"). */
export function urlsMapa(direccion: string) {
  const q = encodeURIComponent(direccion.trim());
  return {
    maps: `https://www.google.com/maps/search/?api=1&query=${q}`,
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
  };
}

/**
 * Botones "Maps" y "Waze" para llegar a la dirección (portado de TecApp).
 * Pensado para el teléfono en terreno: en Android/iPhone abren la app instalada.
 */
export default function LinksMapa({ direccion, compacto }: { direccion?: string | null; compacto?: boolean }) {
  if (!direccion?.trim()) return null;
  const { maps, waze } = urlsMapa(direccion);
  const cls = compacto ? 'btn btn-ghost btn-xs' : 'btn btn-ghost btn-sm';
  const size = compacto ? 12 : 14;
  // stopPropagation: suelen ir dentro de filas clicables (abrir cita / cliente).
  return (
    <span style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
      <a href={maps} target="_blank" rel="noopener noreferrer" className={cls} title="Abrir en Google Maps"><MapPin size={size} /> Maps</a>
      <a href={waze} target="_blank" rel="noopener noreferrer" className={cls} title="Abrir en Waze"><Navigation size={size} /> Waze</a>
    </span>
  );
}
