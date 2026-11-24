'use client';

/**
 * Cargos HH (hh.configurar): cada cargo en una tarjeta con su tarifa de hoy en pesos, el piso según
 * costos y las alertas; se abre para editar (nombre, moneda, tarifa base, rango y sueldo de
 * mercado, notas y orden). Un cargo usado (en un trabajo tipo o en un cálculo guardado) no se
 * borra: se desactiva.
 */

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Plus, RotateCcw, Trash2 } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { useToast } from '@/hooks/useToast';
import { formatCLP } from '@/utils';
import { estadoTarifa, formatoMonedaHH, formatoUF, type CargoHH, type Indicadores, type MonedaHH, type ParametrosHH } from '@/lib/hh/calculo';
import { hhService, mensajeHH } from '@/services/hh';
import { AlertasTarifa, Campo, Interruptor, type PropsPestana } from './comun';
import s from './hh.module.css';

const vacio = (orden: number): CargoHH => ({
  id: '', nombre: '', moneda_base: 'UF', tarifa_base: 0, mercado_min: null, mercado_max: null, sueldo_mercado_clp: null, notas: null, activo: true, orden,
});

export default function CargosHH({ cat, valores, onCambio }: PropsPestana) {
  const [nuevo, setNuevo] = useState<CargoHH | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const siguiente = Math.max(0, ...cat.cargos.map(c => c.orden)) + 1;
  return (
    <div className={s.tarjetas}>
      <div className={`panel ${s.barraHerramientas}`}>
        <p className={s.ayuda} style={{ flex: '1 1 260px' }}>
          Tarifa por hora en UF (o USD para software). El <b>piso</b> es lo mínimo para cubrir el sueldo de mercado, los costos de empresa,
          los gastos generales y la utilidad mínima.
        </p>
        <button className="btn btn-primary btn-sm" disabled={!!nuevo} onClick={() => { setNuevo(vacio(siguiente)); setAbierto('nuevo'); }}><Plus size={13} /> Nuevo cargo</button>
      </div>
      {nuevo && (
        <TarjetaCargo key="nuevo" inicial={nuevo} p={cat.parametros} valores={valores} abierto onAlternar={() => {}}
          onListo={async () => { setNuevo(null); await onCambio(); }} onDescartar={() => setNuevo(null)} />
      )}
      {/* La clave cambia cuando cambia lo guardado: la tarjeta vuelve a partir de lo que hay en la base. */}
      {cat.cargos.map(c => (
        <TarjetaCargo key={`${c.id}:${JSON.stringify(c)}`} inicial={c} p={cat.parametros} valores={valores}
          abierto={abierto === c.id} onAlternar={() => setAbierto(a => (a === c.id ? null : c.id))} onListo={onCambio} />
      ))}
    </div>
  );
}

function TarjetaCargo({ inicial, p, valores, abierto, onAlternar, onListo, onDescartar }: {
  inicial: CargoHH; p: ParametrosHH; valores: Indicadores; abierto: boolean; onAlternar: () => void;
  onListo: () => Promise<void> | void; onDescartar?: () => void;
}) {
  const { success, error: toastError, warning } = useToast();
  const [c, setC] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const esNuevo = !inicial.id;
  const cambiado = esNuevo || JSON.stringify(c) !== JSON.stringify(inicial);
  const e = estadoTarifa(c, valores, p);
  const dec = c.moneda_base === 'UF' ? 4 : 2;
  const rango = c.mercado_min !== null || c.mercado_max !== null
    ? `mercado ${c.mercado_min !== null ? formatoMonedaHH(c.mercado_min, c.moneda_base) : '—'} a ${c.mercado_max !== null ? formatoMonedaHH(c.mercado_max, c.moneda_base) : '—'}` : null;

  const guardar = async (cambios?: Partial<CargoHH>) => {
    const x = { ...c, ...cambios };
    if (!x.nombre.trim()) { warning('Escribe el nombre del cargo.'); return; }
    if (!(x.tarifa_base > 0)) { warning('La tarifa base tiene que ser mayor que 0.'); return; }
    if (x.mercado_min !== null && x.mercado_max !== null && x.mercado_min > x.mercado_max) { warning('El mínimo de mercado es mayor que el máximo.'); return; }
    setOcupado(true);
    try {
      const datos = {
        nombre: x.nombre.trim(), moneda_base: x.moneda_base, tarifa_base: x.tarifa_base, mercado_min: x.mercado_min, mercado_max: x.mercado_max,
        sueldo_mercado_clp: x.sueldo_mercado_clp, notas: x.notas?.trim() || null, activo: x.activo, orden: x.orden,
      };
      await hhService.guardarCargo(esNuevo ? datos : { id: x.id, ...datos });
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
  const num = (k: 'tarifa_base' | 'mercado_min' | 'mercado_max' | 'sueldo_mercado_clp', nulo = true) => ({
    value: c[k], onChange: (v: number) => setC({ ...c, [k]: v }), onVacio: nulo ? () => setC({ ...c, [k]: null }) : undefined,
  });

  return (
    <div className={`panel-y ${s.tarjeta}`} style={{ opacity: c.activo ? 1 : 0.6 }}>
      <div className={s.tarjetaCabeza}>
        <button type="button" className={s.expandir} onClick={onAlternar} aria-expanded={abierto} disabled={esNuevo}>
          {abierto ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
          <span className={s.tarjetaTitulo}>
            <b>{c.nombre || 'Cargo nuevo'}</b>
            <small>{c.tarifa_base > 0 ? `${formatoMonedaHH(c.tarifa_base, c.moneda_base)}/h` : 'Sin tarifa'}{rango ? ` · ${rango}` : ''}</small>
          </span>
          <span className={s.precio}>
            <b>{c.tarifa_base > 0 ? `${formatCLP(e.clp)}/h` : '—'}</b>
            <small>piso {e.piso !== null ? formatCLP(e.piso) : '—'}</small>
          </span>
        </button>
        <Interruptor activo={c.activo} etiqueta={`${c.nombre || 'Cargo'} activo`} disabled={ocupado}
          onChange={() => (esNuevo || cambiado ? setC({ ...c, activo: !c.activo }) : guardar({ activo: !c.activo }))} />
      </div>
      <AlertasTarifa e={e} />

      {abierto && (
        <>
          <div className={s.rejilla}>
            <Campo etiqueta="Nombre del cargo">
              <input className="input input-sm" value={c.nombre} onChange={ev => setC({ ...c, nombre: ev.target.value })} placeholder="Ej.: Maestro electricista" />
            </Campo>
            <Campo etiqueta="Moneda base">
              <select className="input input-sm" value={c.moneda_base} onChange={ev => setC({ ...c, moneda_base: ev.target.value as MonedaHH })}>
                <option value="UF">UF</option><option value="USD">USD (software)</option>
              </select>
            </Campo>
            <Campo etiqueta="Tarifa base por hora" ayuda={c.tarifa_base > 0 ? `Hoy: ${formatCLP(e.clp)} (${formatoUF(e.uf)})` : undefined}>
              <NumeroInput className="input input-sm" decimales={dec} min={0} sufijo={c.moneda_base} {...num('tarifa_base', false)} ariaLabel="Tarifa base" />
            </Campo>
            <Campo etiqueta="Mercado mínimo"><NumeroInput className="input input-sm" decimales={dec} min={0} sufijo={c.moneda_base} {...num('mercado_min')} ariaLabel="Mercado mínimo" /></Campo>
            <Campo etiqueta="Mercado máximo"><NumeroInput className="input input-sm" decimales={dec} min={0} sufijo={c.moneda_base} {...num('mercado_max')} ariaLabel="Mercado máximo" /></Campo>
            <Campo etiqueta="Sueldo de mercado (mes)" ayuda={e.piso !== null ? `Piso: ${formatCLP(e.piso)}/h` : 'Para calcular el piso'}>
              <NumeroInput className="input input-sm" prefijo="$" decimales={0} min={0} {...num('sueldo_mercado_clp')} ariaLabel="Sueldo de mercado" />
            </Campo>
            <Campo etiqueta="Orden en las listas">
              <NumeroInput className="input input-sm" decimales={0} value={c.orden} onChange={v => setC({ ...c, orden: Math.round(v) })} mostrarCero ariaLabel="Orden" />
            </Campo>
          </div>
          <Campo etiqueta="Notas">
            <textarea className="input input-sm" rows={2} value={c.notas ?? ''} onChange={ev => setC({ ...c, notas: ev.target.value })} style={{ height: 'auto', resize: 'vertical' }} />
          </Campo>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {!esNuevo && <button className="btn btn-ghost btn-sm" onClick={borrar} style={{ marginRight: 'auto' }}><Trash2 size={13} /> Borrar</button>}
            {cambiado && <button className="btn btn-ghost btn-sm" onClick={() => (esNuevo ? onDescartar?.() : setC(inicial))}><RotateCcw size={13} /> Descartar</button>}
            <button className="btn btn-primary btn-sm" disabled={ocupado || !cambiado} onClick={() => guardar()}><Check size={13} /> Guardar</button>
          </div>
        </>
      )}
    </div>
  );
}
