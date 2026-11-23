'use client';

/** Una línea de la Calculadora HH: quién, con qué cargo, cuántas horas reales y con qué multiplicador. */

import { ArrowDown, ArrowUp, Info, Trash2 } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { formatCLP } from '@/utils';
import { enUF, formatoHoras, formatoMonedaHH, formatoUF, type EstadoTarifa, type Indicadores, type ResultadoLinea } from '@/lib/hh/calculo';
import type { LineaHH } from '@/lib/hh/lineas';
import type { TrabajoTipoHH } from '@/services/hh';
import { AlertasTarifa, Campo } from './comun';
import { conApoyo, conCargo, conMultiplicador, conPersona, conTipo, conTrabajo, horasDeReferencia, type Ayudas } from './catalogo';

const GENERAL = '__general';

export default function LineaHHEditor({ l, i, total, ay, trabajos, r, tarifas, estado, ind, onCambio, onQuitar, onMover }: {
  l: LineaHH; i: number; total: number; ay: Ayudas; trabajos: TrabajoTipoHH[];
  r: ResultadoLinea; tarifas: { principal: number; apoyo: number | null }; estado: EstadoTarifa | null; ind: Indicadores;
  onCambio: (l: LineaHH) => void; onQuitar: () => void; onMover: (delta: -1 | 1) => void;
}) {
  const cargosActivos = [...ay.cargo.values()].filter(c => c.activo);
  const opcionesCargo = l.persona_id ? ay.asignaciones(l.persona_id).map(a => ay.cargo.get(a.cargo_id)!).filter(Boolean) : cargosActivos;
  const conCargoActual = l.cargo_id ? ay.personasCon(l.cargo_id) : [];
  const otras = ay.personasActivas.filter(p => !conCargoActual.some(x => x.id === p.id));
  const personaFuera = l.persona_id && !ay.personasActivas.some(p => p.id === l.persona_id);
  const categorias = [...new Set(trabajos.map(t => t.categoria))];
  const trabajoFuera = l.trabajo_tipo_id && !trabajos.some(t => t.id === l.trabajo_tipo_id);
  const tiposActivos = [...ay.tipo.values()].filter(t => t.activo);
  const horasRef = horasDeReferencia(l);
  const nadieTiene = !!l.cargo_id && !l.persona_id && conCargoActual.length === 0;
  const tieneTarifaPropia = !!l.persona_id && !!l.cargo_id && ay.asignacion(l.persona_id, l.cargo_id)?.tarifa_base_propia != null;
  const sinHoras = !(Number(l.horas_reales) > 0);

  return (
    <div className="panel" style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span className="badge" style={{ background: 'var(--bg3)', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
        <input className="input" value={l.descripcion} onChange={e => onCambio({ ...l, descripcion: e.target.value })}
          placeholder="Entregable (así lo verá el cliente)" aria-label={`Entregable de la línea ${i + 1}`} style={{ flex: 1, minWidth: 0 }} />
        <button className="btn btn-ghost btn-xs" disabled={i === 0} onClick={() => onMover(-1)} aria-label="Subir la línea"><ArrowUp size={12} /></button>
        <button className="btn btn-ghost btn-xs" disabled={i === total - 1} onClick={() => onMover(1)} aria-label="Bajar la línea"><ArrowDown size={12} /></button>
        <button className="btn btn-ghost btn-xs" onClick={onQuitar} aria-label={`Quitar la línea ${i + 1}`}><Trash2 size={12} /></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 8 }}>
        <Campo etiqueta="Trabajo tipo (opcional)">
          <select className="input input-sm" value={l.trabajo_tipo_id ?? ''} onChange={e => onCambio(conTrabajo(l, e.target.value || null, ay))}>
            <option value="">— Sin trabajo tipo —</option>
            {categorias.map(cat => (
              <optgroup key={cat} label={cat}>
                {trabajos.filter(t => t.categoria === cat).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </optgroup>
            ))}
            {trabajoFuera && <option value={l.trabajo_tipo_id!}>(trabajo tipo inactivo)</option>}
          </select>
        </Campo>
        <Campo etiqueta="Quién lo hace">
          <select className="input input-sm" value={l.persona_id ?? GENERAL} onChange={e => onCambio(conPersona(l, e.target.value === GENERAL ? null : e.target.value, ay))}>
            <option value={GENERAL}>Tarifa general del cargo</option>
            {l.cargo_id && conCargoActual.length > 0 && (
              <optgroup label="Con este cargo">{conCargoActual.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</optgroup>
            )}
            {otras.length > 0 && (
              <optgroup label={l.cargo_id ? 'Otras personas' : 'Equipo'}>{otras.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</optgroup>
            )}
            {personaFuera && <option value={l.persona_id!}>{l.persona_nombre} (inactiva)</option>}
          </select>
        </Campo>
        <Campo etiqueta="Cargo HH">
          <select className="input input-sm" value={l.cargo_id} onChange={e => onCambio(conCargo(l, e.target.value, ay))}
            aria-invalid={!l.cargo_id}>
            <option value="" disabled>{opcionesCargo.length ? 'Elige el cargo…' : 'Sin cargos HH activos'}</option>
            {opcionesCargo.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            {l.cargo_id && !opcionesCargo.some(c => c.id === l.cargo_id) && <option value={l.cargo_id}>{l.cargo_nombre} (guardado)</option>}
          </select>
        </Campo>
        <Campo etiqueta="Tipo de tarea">
          <select className="input input-sm" value={l.tipo_tarea_clave ?? ''} onChange={e => onCambio(conTipo(l, e.target.value || null, ay))}>
            <option value="">— Sin tipo (× 1) —</option>
            {tiposActivos.map(t => <option key={t.clave} value={t.clave}>{t.nombre} (× {String(t.multiplicador).replace('.', ',')})</option>)}
            {l.tipo_tarea_clave && !tiposActivos.some(t => t.clave === l.tipo_tarea_clave) && <option value={l.tipo_tarea_clave}>{l.tipo_tarea_clave} (inactivo)</option>}
          </select>
        </Campo>
        <Campo etiqueta={l.multiplicador_editado ? 'Multiplicador · editado' : 'Multiplicador'} ayuda="Sugerido por el tipo de tarea; se puede cambiar">
          <NumeroInput className="input input-sm" value={l.multiplicador} min={0} decimales={2} onChange={v => onCambio(conMultiplicador(l, v, ay))}
            ariaLabel={`Multiplicador de la línea ${i + 1}`} prefijo="×" style={l.multiplicador_editado ? { boxShadow: 'inset 0 0 0 1px var(--y-brand)' } : undefined} />
        </Campo>
        <Campo etiqueta="Cantidad">
          <NumeroInput className="input input-sm" value={l.cantidad} min={0} decimales={2} onChange={v => onCambio({ ...l, cantidad: v })} ariaLabel={`Cantidad de la línea ${i + 1}`} />
        </Campo>
        <Campo etiqueta="Unidad">
          <input className="input input-sm" value={l.unidad} onChange={e => onCambio({ ...l, unidad: e.target.value })} placeholder="punto, proyecto, visita…" />
        </Campo>
        <Campo etiqueta="Horas reales (por unidad)" ayuda="Las que de verdad toma hacerlo (obligatorias)">
          <NumeroInput className="input input-sm" value={l.horas_reales} min={0} decimales={2} onChange={v => onCambio({ ...l, horas_reales: v })}
            onVacio={() => onCambio({ ...l, horas_reales: null })} ariaLabel={`Horas reales de la línea ${i + 1}`} placeholder="Obligatorias"
            style={sinHoras ? { boxShadow: 'inset 0 0 0 1px var(--danger)' } : undefined} />
        </Campo>
        <Campo etiqueta="Apoyo (sin multiplicador)">
          <select className="input input-sm" value={l.cargo_apoyo_id ?? ''} onChange={e => onCambio(conApoyo(l, e.target.value || null, ay))}>
            <option value="">— Sin apoyo —</option>
            {cargosActivos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            {l.cargo_apoyo_id && !cargosActivos.some(c => c.id === l.cargo_apoyo_id) && <option value={l.cargo_apoyo_id}>{l.cargo_apoyo_nombre} (guardado)</option>}
          </select>
        </Campo>
        <Campo etiqueta="Horas de apoyo (por unidad)">
          <NumeroInput className="input input-sm" value={l.horas_apoyo} min={0} decimales={2} disabled={!l.cargo_apoyo_id} onChange={v => onCambio({ ...l, horas_apoyo: v })}
            ariaLabel={`Horas de apoyo de la línea ${i + 1}`} />
        </Campo>
      </div>

      {(horasRef !== null || nadieTiene) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.78rem', color: 'var(--muted)' }}>
          {horasRef !== null && (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <Info size={12} aria-hidden /> Referencia de mercado: {formatoHoras(l.hh_referencia!)} HH por unidad
              {l.multiplicador !== 1 && <> ({formatoHoras(l.hh_referencia!)} ÷ {formatoHoras(l.multiplicador)} = {formatoHoras(horasRef)} h reales)</>}
              {l.horas_reales !== horasRef && (
                <button className="btn btn-ghost btn-xs" onClick={() => onCambio({ ...l, horas_reales: horasRef })}>Usar {formatoHoras(horasRef)} h</button>
              )}
            </span>
          )}
          {nadieTiene && (
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: 'var(--text)' }}>
              <Info size={12} aria-hidden /> Nadie del equipo tiene este cargo: se usa la tarifa general del cargo.
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.4rem 1.2rem', flexWrap: 'wrap', alignItems: 'baseline', paddingTop: 8, borderTop: '1px solid var(--border2)', fontSize: '0.82rem' }}>
        <span><span className="label-muted">Tarifa </span>
          <b style={{ color: 'var(--text)' }}>{l.cargo_id ? `${formatCLP(tarifas.principal)}/h` : '—'}</b>
          {l.cargo_id && <span style={{ color: 'var(--muted)' }}> · {formatoUF(enUF(tarifas.principal, ind.uf))} · base {formatoMonedaHH(l.cargo_tarifa_base, l.cargo_moneda)}{tieneTarifaPropia ? ' (propia)' : ''}</span>}
        </span>
        <span><span className="label-muted">Horas cobradas </span><b style={{ color: 'var(--text)' }}>{formatoHoras(r.horasCobradas)}</b></span>
        {l.cargo_apoyo_id && tarifas.apoyo !== null && (
          <span><span className="label-muted">Apoyo </span><span style={{ color: 'var(--text)' }}>{formatoHoras(r.horasApoyo)} h × {formatCLP(tarifas.apoyo)} = {formatCLP(r.apoyo)}</span></span>
        )}
        <span style={{ marginLeft: 'auto' }}><span className="label-muted">Subtotal </span><b style={{ color: 'var(--text)', fontSize: '0.95rem' }}>{formatCLP(r.subtotal)}</b></span>
      </div>
      {(estado || r.referencia !== null) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.76rem', color: 'var(--muted)' }}>
          {estado && <AlertasTarifa e={estado} compacto />}
          {r.referencia !== null && r.diferenciaReferencia !== null && (
            <span>Mercado: {formatCLP(r.referencia)} · {r.diferenciaReferencia === 0 ? 'igual a la referencia'
              : `${r.diferenciaReferencia > 0 ? 'cobras' : 'te quedas'} ${formatCLP(Math.abs(r.diferenciaReferencia))} ${r.diferenciaReferencia > 0 ? 'más' : 'bajo la referencia'}`}</span>
          )}
        </div>
      )}
    </div>
  );
}
