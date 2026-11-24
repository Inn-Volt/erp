'use client';

/**
 * Lo que se suma a la mano de obra en el resumen del cálculo:
 *   · Materiales: el costo neto y la utilidad del cotizador (sobre el precio). Se puede cambiar la
 *     utilidad o fijar el precio de venta; con el precio fijo, si el material sale más caro, se ve
 *     cuánto queda de verdad (la utilidad real).
 *   · Operación: traslado, peajes, estacionamiento… Se cobran tal cual, como los cargos
 *     operacionales del cotizador.
 */

import { Plus, Trash2 } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { formatCLP } from '@/utils';
import { precioConUtilidad, utilidadDe, type GastoOperacion } from '@/lib/hh/calculo';
import { Campo, pctCL } from './comun';
import s from './hh.module.css';

const RAPIDOS = ['Traslado', 'Peajes', 'Estacionamiento', 'Viático', 'Flete', 'Arriendo de equipos'];
const pct1 = (f: number) => Math.round(f * 1000) / 10;

export function Materiales({ costo, utilidad, venta, utilidadCotizador, onCambio }: {
  costo: number; utilidad: number; venta: number | null; utilidadCotizador: number;
  onCambio: (c: { materiales?: number; margen?: number; ventaMateriales?: number | null }) => void;
}) {
  const precio = venta ?? precioConUtilidad(costo, utilidad);
  const real = utilidadDe(costo, precio);
  const comoCotizador = venta === null && Math.abs(utilidad - utilidadCotizador) < 1e-6;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Campo etiqueta="Costo de los materiales (neto, sin IVA)">
        <NumeroInput className="input input-sm" prefijo="$" value={costo} decimales={0} mostrarCero onChange={v => onCambio({ materiales: v })} ariaLabel="Costo de los materiales" />
      </Campo>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)', gap: 8 }}>
        <Campo etiqueta="Utilidad">
          <NumeroInput className="input input-sm" sufijo="%" value={pct1(venta === null ? utilidad : real)} decimales={1}
            onChange={v => onCambio({ margen: Math.min(Math.max(v, 0), 95) / 100, ventaMateriales: null })} ariaLabel="Utilidad de los materiales" />
        </Campo>
        <Campo etiqueta="Precio de venta">
          <NumeroInput className="input input-sm" prefijo="$" value={precio} decimales={0} mostrarCero
            onChange={v => onCambio({ ventaMateriales: v > 0 ? v : null })} ariaLabel="Precio de venta de los materiales" />
        </Campo>
      </div>
      {(costo > 0 || precio > 0) && (
        <p className={s.ayuda} style={{ color: real < 0 ? 'var(--danger)' : undefined }}>
          Te queda <b style={{ color: real < 0 ? 'var(--danger)' : 'var(--text)' }}>{formatCLP(precio - costo)}</b> ({pctCL(real)} real)
          {venta !== null ? ' con el precio fijo: si el material sale más caro, sube el costo y verás cuánto queda de verdad.' : '.'}
        </p>
      )}
      {!comoCotizador && (
        <button type="button" className="btn btn-ghost btn-xs" style={{ alignSelf: 'flex-start' }}
          onClick={() => onCambio({ margen: utilidadCotizador, ventaMateriales: null })}>
          Usar la utilidad del cotizador ({pctCL(utilidadCotizador)})
        </button>
      )}
    </div>
  );
}

export function Operacion({ gastos, onCambio }: { gastos: GastoOperacion[]; onCambio: (g: GastoOperacion[]) => void }) {
  const cambiar = (i: number, g: Partial<GastoOperacion>) => onCambio(gastos.map((x, j) => (j === i ? { ...x, ...g } : x)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {gastos.map((g, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px auto', gap: 6, alignItems: 'center' }}>
          <input className="input input-sm" value={g.descripcion} onChange={e => cambiar(i, { descripcion: e.target.value })} aria-label="Qué es" placeholder="Qué es" />
          <NumeroInput className="input input-sm" prefijo="$" value={g.monto} decimales={0} onChange={v => cambiar(i, { monto: v })} ariaLabel={`Monto de ${g.descripcion || 'el gasto'}`} />
          <button type="button" className={s.iconoBtn} onClick={() => onCambio(gastos.filter((_, j) => j !== i))} aria-label={`Quitar ${g.descripcion || 'el gasto'}`}><Trash2 size={15} /></button>
        </div>
      ))}
      <div className={`${s.chips} ${s.chipsEnvueltas}`} role="group" aria-label="Agregar un gasto de operación">
        {RAPIDOS.map(r => (
          <button key={r} type="button" className={s.chip} onClick={() => onCambio([...gastos, { descripcion: r, monto: 0 }])}><Plus size={12} /> {r}</button>
        ))}
        <button type="button" className={s.chip} onClick={() => onCambio([...gastos, { descripcion: '', monto: 0 }])}><Plus size={12} /> Otro</button>
      </div>
      <p className={s.ayuda}>Se cobran tal cual, sin utilidad (como los cargos operacionales del cotizador).</p>
    </div>
  );
}
