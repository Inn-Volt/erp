'use client';

/**
 * «Partida (opcional)» al rendir un gasto, ingresar una compra o registrar horas (fase 20): de qué
 * partida de la cotización es, para comparar lo real con lo cotizado partida por partida. Nunca es
 * obligatorio (vacío = «Sin partida») y solo aparece si el trabajo tiene partidas y la fase 20 está
 * aplicada.
 */

import { useEffect, useState } from 'react';
import { controlProyectoService } from '@/services/controlProyecto';
import type { PartidaOpcion } from '@/lib/controlProyecto';

/** Las partidas del trabajo elegido (vacío mientras carga, sin trabajo o sin la fase 20). */
export function usePartidasDe(cotId: string | null | undefined, activo: boolean): PartidaOpcion[] {
  const [lista, setLista] = useState<{ cotId: string; partidas: PartidaOpcion[] } | null>(null);
  useEffect(() => {
    if (!activo || !cotId) return;
    let vivo = true;
    controlProyectoService.partidasDe(cotId).then(p => { if (vivo) setLista({ cotId, partidas: p }); });
    return () => { vivo = false; };
  }, [cotId, activo]);
  return activo && cotId && lista?.cotId === cotId ? lista.partidas : [];
}

export default function SelectorPartida({ partidas, value, onChange, etiqueta = 'Partida (opcional)' }: {
  partidas: PartidaOpcion[]; value: string | null | undefined; onChange: (id: string) => void; etiqueta?: string;
}) {
  if (!partidas.length) return null;
  return (
    <div>
      <label className="label-muted" style={{ display: 'block', marginBottom: 6 }}>{etiqueta}</label>
      <select className="input" aria-label={etiqueta} value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="">Sin partida</option>
        {partidas.map(p => <option key={p.id} value={p.id}>{p.numero}. {p.nombre}</option>)}
      </select>
    </div>
  );
}
