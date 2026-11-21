'use client';

/**
 * Materiales de un trabajo (fase 15): se arman solos con las líneas de material de la cotización,
 * para seguir qué está por comprar, comprado, en obra o instalado, y lo que sobró.
 */

import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { ESTADOS_MATERIAL, trabajosService, type EstadoMaterial, type MaterialTrabajo } from '@/services/trabajos';
import { useToast } from '@/hooks/useToast';

const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const fila: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.84rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border2)', color: 'var(--text)' };

export default function MaterialesTrabajo({ cotId, editable }: { cotId: string; editable: boolean }) {
  const { error: toastError } = useToast();
  const [lista, setLista] = useState<MaterialTrabajo[] | null>(null);
  const [todos, setTodos] = useState(false);
  useEffect(() => { trabajosService.materiales(cotId).then(setLista); }, [cotId]);

  const cambiar = async (m: MaterialTrabajo, patch: Partial<Pick<MaterialTrabajo, 'estado' | 'sobrante'>>) => {
    setLista(x => (x || []).map(y => (y.id === m.id ? { ...y, ...patch } : y)));
    try { await trabajosService.actualizarMaterial(m.id, patch); }
    catch (e) {
      toastError(e instanceof Error ? e.message : 'No se pudo guardar');
      trabajosService.materiales(cotId).then(setLista);
    }
  };

  if (lista === null) return <div className="skeleton" style={{ height: 60 }} />;
  const instalados = lista.filter(m => m.estado === 'instalado').length;
  const porComprar = lista.filter(m => m.estado === 'pendiente').length;
  const visibles = todos ? lista : lista.slice(0, 8);

  return (
    <div>
      <p className="label-muted" style={{ margin: '0 0 6px' }}>
        Materiales · {instalados} de {lista.length} instalados{porComprar ? ` · ${porComprar} por comprar` : ''}</p>
      {lista.length === 0
        ? <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>La cotización no tiene líneas de material.</p>
        : visibles.map(m => {
          const e = ESTADOS_MATERIAL.find(x => x.clave === m.estado) || ESTADOS_MATERIAL[0];
          return (
            <div key={m.id} style={{ ...fila, flexWrap: 'wrap' }}>
              <Package size={13} style={{ color: e.color, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 160 }}>{m.descripcion} <span style={{ color: 'var(--muted)' }}>· {num(Number(m.cantidad))} {m.unidad || ''}</span></span>
              {m.estado === 'instalado' && editable && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.76rem', color: 'var(--muted)' }}>sobró
                  <input className="input" inputMode="decimal" defaultValue={m.sobrante ?? ''} style={{ width: 64, padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                    onBlur={ev => {
                      const v = ev.target.value.trim() === '' ? null : Number(ev.target.value.replace(',', '.'));
                      if (v !== m.sobrante && (v === null || Number.isFinite(v))) cambiar(m, { sobrante: v });
                    }} /></label>
              )}
              {editable
                ? <select className="input" value={m.estado} onChange={ev => cambiar(m, { estado: ev.target.value as EstadoMaterial })}
                    aria-label={`Estado de ${m.descripcion}`} style={{ width: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.78rem', color: e.color, fontWeight: 600 }}>
                    {ESTADOS_MATERIAL.map(x => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
                  </select>
                : <span className="badge" style={{ background: e.color + '1f', color: e.color, fontSize: '0.7rem' }}>{e.nombre}</span>}
            </div>
          );
        })}
      {lista.length > 8 && <button className="btn btn-ghost btn-xs" style={{ marginTop: 4 }} onClick={() => setTodos(x => !x)}>{todos ? 'Ver menos' : `Ver los ${lista.length}`}</button>}
    </div>
  );
}
