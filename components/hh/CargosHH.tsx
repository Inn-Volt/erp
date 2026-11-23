'use client';

/**
 * Cargos HH (hh.configurar): nombre, moneda, tarifa base, rango y sueldo de mercado, notas, orden
 * y activo. Muestra en vivo la tarifa de hoy en pesos, el piso según costos y las alertas. Un cargo
 * usado (en un trabajo tipo o en un cálculo guardado) no se borra: se desactiva.
 */

import { useState } from 'react';
import { Check, Plus, RotateCcw, Trash2 } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { useToast } from '@/hooks/useToast';
import { formatCLP } from '@/utils';
import { estadoTarifa, formatoUF, type CargoHH, type Indicadores, type MonedaHH, type ParametrosHH } from '@/lib/hh/calculo';
import { hhService, mensajeHH } from '@/services/hh';
import { AlertasTarifa, Interruptor, tdEstilo, thEstilo, type PropsPestana } from './comun';

const vacio = (orden: number): CargoHH => ({
  id: '', nombre: '', moneda_base: 'UF', tarifa_base: 0, mercado_min: null, mercado_max: null, sueldo_mercado_clp: null, notas: null, activo: true, orden,
});

export default function CargosHH({ cat, valores, onCambio }: PropsPestana) {
  const [nuevo, setNuevo] = useState<CargoHH | null>(null);
  const siguiente = Math.max(0, ...cat.cargos.map(c => c.orden)) + 1;
  return (
    <div className="panel-y">
      <div style={{ padding: '0.8rem 1rem', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--border2)' }}>
        <p className="section-label" style={{ margin: 0 }}>Cargos HH</p>
        <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Tarifas por hora en la moneda base. Piso = sueldo × costo empresa ÷ horas facturables × gastos generales × utilidad mínima.</span>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" disabled={!!nuevo} onClick={() => setNuevo(vacio(siguiente))}><Plus size={13} /> Nuevo cargo</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1080, fontSize: '0.82rem' }}>
          <thead><tr>
            {['Activo', 'Cargo', 'Moneda', 'Tarifa base /h', 'Mercado mín.', 'Mercado máx.', 'Sueldo mercado', 'Hoy', 'Notas', 'Orden', ''].map(h => (
              <th key={h} style={{ ...thEstilo, textAlign: h === 'Hoy' ? 'right' : 'left' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {nuevo && <FilaCargo key="nuevo" inicial={nuevo} p={cat.parametros} valores={valores} onListo={async () => { setNuevo(null); await onCambio(); }} onDescartar={() => setNuevo(null)} />}
            {/* La clave cambia cuando cambia lo guardado: la fila vuelve a partir de lo que hay en la base. */}
            {cat.cargos.map(c => <FilaCargo key={`${c.id}:${JSON.stringify(c)}`} inicial={c} p={cat.parametros} valores={valores} onListo={onCambio} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaCargo({ inicial, p, valores, onListo, onDescartar }: {
  inicial: CargoHH; p: ParametrosHH; valores: Indicadores; onListo: () => Promise<void> | void; onDescartar?: () => void;
}) {
  const { success, error: toastError, warning } = useToast();
  const [c, setC] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const esNuevo = !inicial.id;
  const cambiado = esNuevo || JSON.stringify(c) !== JSON.stringify(inicial);
  const e = estadoTarifa(c, valores, p);
  const dec = c.moneda_base === 'UF' ? 4 : 2;

  const guardar = async (cambios?: Partial<CargoHH>) => {
    const x = { ...c, ...cambios };
    if (!x.nombre.trim()) { warning('Escribe el nombre del cargo.'); return; }
    if (!(x.tarifa_base > 0)) { warning('La tarifa base tiene que ser mayor que 0.'); return; }
    if (x.mercado_min !== null && x.mercado_max !== null && x.mercado_min > x.mercado_max) { warning('El mínimo de mercado es mayor que el máximo.'); return; }
    setOcupado(true);
    try {
      const { id, ...datos } = { ...x, nombre: x.nombre.trim(), notas: x.notas?.trim() || null };
      await hhService.guardarCargo(esNuevo ? datos : { id, ...datos });
      success(esNuevo ? 'Cargo creado.' : 'Cargo guardado.');
      await onListo();
    } catch (err) { toastError(mensajeHH(err)); }
    finally { setOcupado(false); }
  };
  const borrar = async () => {
    if (!confirm(`¿Borrar el cargo «${c.nombre}»? Si ya se usa, mejor desactívalo.`)) return;
    try { await hhService.eliminarCargo(c.id); success('Cargo borrado.'); await onListo(); }
    catch (err) { toastError(mensajeHH(err, 'No se pudo borrar.')); }
  };
  const num = (k: keyof CargoHH, nulo = true) => ({
    value: c[k] as number | null,
    onChange: (v: number) => setC({ ...c, [k]: v }),
    onVacio: nulo ? () => setC({ ...c, [k]: null }) : undefined,
  });

  return (
    <tr style={{ borderTop: '1px solid var(--border2)', opacity: c.activo ? 1 : 0.55, background: esNuevo ? 'var(--y-soft)' : undefined }}>
      <td style={tdEstilo}>
        <Interruptor activo={c.activo} etiqueta={`${c.nombre || 'Cargo'} activo`} disabled={ocupado}
          onChange={() => (esNuevo || cambiado ? setC({ ...c, activo: !c.activo }) : guardar({ activo: !c.activo }))} />
      </td>
      <td style={{ ...tdEstilo, minWidth: 220 }}>
        <input className="input input-sm" value={c.nombre} onChange={ev => setC({ ...c, nombre: ev.target.value })} placeholder="Nombre del cargo" aria-label="Nombre del cargo" />
      </td>
      <td style={tdEstilo}>
        <select className="input input-sm" style={{ width: 76 }} value={c.moneda_base} onChange={ev => setC({ ...c, moneda_base: ev.target.value as MonedaHH })} aria-label="Moneda base">
          <option value="UF">UF</option><option value="USD">USD</option>
        </select>
      </td>
      <td style={tdEstilo}><NumeroInput className="input input-sm" envoltura={{ width: 96 }} decimales={dec} min={0} {...num('tarifa_base', false)} ariaLabel="Tarifa base" /></td>
      <td style={tdEstilo}><NumeroInput className="input input-sm" envoltura={{ width: 90 }} decimales={dec} min={0} {...num('mercado_min')} ariaLabel="Mercado mínimo" /></td>
      <td style={tdEstilo}><NumeroInput className="input input-sm" envoltura={{ width: 90 }} decimales={dec} min={0} {...num('mercado_max')} ariaLabel="Mercado máximo" /></td>
      <td style={tdEstilo}><NumeroInput className="input input-sm" envoltura={{ width: 120 }} prefijo="$" decimales={0} min={0} {...num('sueldo_mercado_clp')} ariaLabel="Sueldo de mercado" /></td>
      <td style={{ ...tdEstilo, textAlign: 'right', whiteSpace: 'nowrap', minWidth: 150 }}>
        <b style={{ color: 'var(--text)' }}>{c.tarifa_base > 0 ? `${formatCLP(e.clp)}/h` : '—'}</b>
        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)' }}>{formatoUF(e.uf)} · piso {e.piso !== null ? formatCLP(e.piso) : '—'}</span>
        <AlertasTarifa e={e} compacto />
      </td>
      <td style={{ ...tdEstilo, minWidth: 200 }}>
        <textarea className="input input-sm" rows={1} value={c.notas ?? ''} onChange={ev => setC({ ...c, notas: ev.target.value })} aria-label="Notas" style={{ height: 'auto', minHeight: 34, resize: 'vertical' }} />
      </td>
      <td style={tdEstilo}><NumeroInput className="input input-sm" envoltura={{ width: 60 }} decimales={0} value={c.orden} onChange={v => setC({ ...c, orden: Math.round(v) })} mostrarCero ariaLabel="Orden" /></td>
      <td style={{ ...tdEstilo, whiteSpace: 'nowrap', textAlign: 'right' }}>
        {cambiado && <button className="btn btn-primary btn-xs" disabled={ocupado} onClick={() => guardar()} aria-label="Guardar el cargo"><Check size={12} /></button>}{' '}
        {cambiado && <button className="btn btn-ghost btn-xs" onClick={() => (esNuevo ? onDescartar?.() : setC(inicial))} aria-label="Descartar los cambios"><RotateCcw size={12} /></button>}
        {!esNuevo && !cambiado && <button className="btn btn-ghost btn-xs" onClick={borrar} aria-label={`Borrar ${c.nombre}`}><Trash2 size={12} /></button>}
      </td>
    </tr>
  );
}
