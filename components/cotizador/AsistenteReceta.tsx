'use client';

/**
 * Asistente de receta (TecApp): las preguntas a la izquierda y la lista que resulta a la
 * derecha. Solo una receta sin preguntas pregunta «¿Cuántas?». En una partida de venta no
 * entra nada de servicios; lo que no tiene precio o está desactivado va a «No se agregará».
 */

import NumeroInput from '@/components/NumeroInput';
import { useMemo, useState } from 'react';
import { Layers, Plus } from 'lucide-react';
import { Modal } from './ui';
import type { ArticuloCatalogo, Linea, Moneda, PartidaCot } from '@/lib/cotizador/tipos';
import { IVA } from '@/lib/cotizador/tipos';
import { armar, respuestasIniciales, type RecetaCompleta, type Respuestas } from '@/lib/cotizador/recetas';
import { aMoneda, calcular, formatMonto, lineasDeArticulo, nuevoId } from '@/lib/cotizador/calculo';
import type { CategoriaItem } from '@/types';

/** Ganancia para un componente que no está en el catálogo (recetas viejas de la hoja). */
const GANANCIA_POR_TIPO: Record<string, number> = { material: 33, mano_obra: 92, servicio: 41, operacion: 41 };

export function lineasDeLaReceta(
  receta: RecetaCompleta, respuestas: Respuestas, veces: number, partida: PartidaCot,
  catalogo: Map<string, ArticuloCatalogo>, moneda: Moneda, valorUf?: number | null,
): { lineas: Linea[]; noVan: { nombre: string; porque: string }[] } {
  const armado = armar(receta, respuestas, veces, catalogo);
  const venta = (partida.tipo || 'instalacion') === 'venta';
  const lineas: Linea[] = [];
  const noVan = armado.noVan.map(n => ({ nombre: n.nombre, porque: n.porque }));
  for (const a of armado.lineas) {
    const categoria = (a.articulo?.categoria || a.componente.categoria || 'material') as CategoriaItem;
    if (venta && categoria !== 'material') {
      noVan.push({ nombre: a.articulo?.descripcion || a.componente.descripcion, porque: 'Es un servicio: en una partida de venta no se agrega.' });
      continue;
    }
    if (a.articulo) {
      lineas.push(...lineasDeArticulo(a.articulo, a.cantidad, partida, catalogo, moneda, valorUf));
    } else {
      lineas.push({
        id: nuevoId(), partidaId: partida.id, descripcion: a.componente.descripcion, categoria,
        unidad: a.componente.unidad || 'un', cantidad: a.cantidad, costo: aMoneda(a.componente.costo || 0, moneda, valorUf, true),
        imprevistos: 0, margen: 0, precio: 0, iva: IVA, descuento: 0, fuera: true, ganancia: GANANCIA_POR_TIPO[categoria] ?? 33,
      });
    }
  }
  return { lineas, noVan };
}

export default function AsistenteReceta({ receta, partida, catalogo, moneda, valorUf, recordadas, onAgregar, onCerrar }: {
  receta: RecetaCompleta;
  partida: PartidaCot;
  catalogo: Map<string, ArticuloCatalogo>;
  moneda: Moneda;
  valorUf?: number | null;
  recordadas?: Respuestas;
  onAgregar: (lineas: Linea[], respuestas: Respuestas) => void;
  onCerrar: () => void;
}) {
  const [resp, setResp] = useState<Respuestas>(() => respuestasIniciales(receta, recordadas));
  const [veces, setVeces] = useState(1);
  const { lineas, noVan } = useMemo(() => lineasDeLaReceta(receta, resp, veces, partida, catalogo, moneda, valorUf),
    [receta, resp, veces, partida, catalogo, moneda, valorUf]);
  const r = useMemo(() => calcular(lineas, [], moneda, valorUf), [lineas, moneda, valorUf]);
  const fija = receta.preguntas.length === 0;
  const set = (k: string, v: number | boolean | string) => setResp(x => ({ ...x, [k]: v }));

  return (
    <Modal titulo={<><Layers size={15} /> {receta.nombre}</>} onCerrar={onCerrar} ancho={860} pie={<>
      <span style={{ marginRight: 'auto', fontSize: '0.85rem', color: 'var(--muted)' }}>
        {lineas.length} línea{lineas.length === 1 ? '' : 's'} · {formatMonto(r.totales.neto, moneda)} neto
      </span>
      <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
      <button className="btn btn-primary" disabled={!lineas.length} onClick={() => onAgregar(lineas, resp)}><Plus size={14} /> Agregar a la partida</button>
    </>}>
      {receta.descripcion && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>{receta.descripcion}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fija && (
            <label style={{ display: 'block' }}>
              <span className="label-muted" style={{ display: 'block', marginBottom: 6 }}>¿Cuántas? ({receta.unidad})</span>
              <NumeroInput className="input" min={1} max={1000} value={veces} autoFocus
                onChange={v => setVeces(Math.min(Math.max(Math.round(v) || 1, 1), 1000))} />
            </label>
          )}
          {receta.preguntas.map((p, i) => (
            <div key={p.clave}>
              <span className="label-muted" style={{ display: 'block', marginBottom: 6 }}>{p.texto}</span>
              {p.tipo === 'numero' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <NumeroInput className="input" autoFocus={i === 0} mostrarCero decimales={p.entero === false ? 3 : 0}
                    value={Number(resp[p.clave]) || 0} envoltura={{ maxWidth: 140 }}
                    onChange={n => {
                      let v = n;
                      if (p.entero !== false) v = Math.round(v);
                      v = Math.min(Math.max(v, p.minimo ?? 0), p.maximo ?? 10000);
                      set(p.clave, v);
                    }} />
                  {p.unidad && <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>{p.unidad}</span>}
                </div>
              )}
              {p.tipo === 'sino' && (
                <div style={{ display: 'inline-flex', border: '1px solid var(--border2)', borderRadius: 8, padding: 2 }}>
                  {[true, false].map(v => (
                    <button key={String(v)} type="button" onClick={() => set(p.clave, v)} className="btn btn-sm"
                      style={{ background: resp[p.clave] === v ? 'var(--y-brand)' : 'transparent', color: resp[p.clave] === v ? '#111' : 'var(--muted)' }}>{v ? 'Sí' : 'No'}</button>
                  ))}
                </div>
              )}
              {p.tipo === 'producto' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(p.opciones || []).map(o => {
                    const a = catalogo.get(o.item_id);
                    return (
                      <label key={o.item_id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem', color: 'var(--text)', cursor: 'pointer' }}>
                        <input type="radio" name={`p-${p.clave}`} checked={resp[p.clave] === o.item_id} onChange={() => set(p.clave, o.item_id)} style={{ accentColor: 'var(--y-brand)' }} />
                        <span style={{ flex: 1 }}>{o.etiqueta || a?.descripcion || 'Producto'}</span>
                        <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{a?.precio_venta !== null && a?.precio_venta !== undefined ? formatMonto(moneda === 'UF' && valorUf ? a.precio_venta / valorUf : a.precio_venta, moneda, true) : 'sin precio'}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {p.ayuda && <p style={{ fontSize: '0.74rem', color: 'var(--muted)', margin: '4px 0 0' }}>{p.ayuda}</p>}
            </div>
          ))}
          {!fija && <p style={{ fontSize: '0.76rem', color: 'var(--muted)', margin: 0 }}>Una receta con preguntas se inserta una vez: las cantidades salen de las respuestas.</p>}
        </div>
        <div>
          <p className="label-muted" style={{ marginBottom: 6 }}>Lo que se agrega</p>
          <div style={{ border: '1px solid var(--border2)', borderRadius: 8 }}>
            {lineas.length === 0 && <p style={{ padding: '0.7rem', color: 'var(--muted)', fontSize: '0.84rem', margin: 0 }}>Con esas respuestas no sale nada.</p>}
            {lineas.map(l => (
              <div key={l.id} style={{ display: 'flex', gap: 8, padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border2)', fontSize: '0.84rem', color: l.ligadoA ? 'var(--muted)' : 'var(--text)' }}>
                <span style={{ flex: 1, minWidth: 0 }}>{l.ligadoA ? '↳ ' : ''}{l.descripcion}{l.fuera ? <span style={{ color: '#d97706', fontSize: '0.7rem' }}> · fuera del catálogo</span> : null}</span>
                <span style={{ whiteSpace: 'nowrap' }}>{Number(l.cantidad).toLocaleString('es-CL')} {l.unidad}</span>
                <span style={{ whiteSpace: 'nowrap', minWidth: 80, textAlign: 'right' }}>{formatMonto(r.lineas.get(l.id)?.neto, moneda)}</span>
              </div>
            ))}
          </div>
          {noVan.length > 0 && (
            <>
              <p className="label-muted" style={{ margin: '10px 0 6px' }}>No se agregará</p>
              {noVan.map((n, i) => (
                <p key={i} style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 4px' }}><b style={{ color: 'var(--text)' }}>{n.nombre}</b>: {n.porque}</p>
              ))}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
