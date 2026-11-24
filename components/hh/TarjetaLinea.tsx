'use client';

/** Un trabajo del cálculo, en una tarjeta simple: qué, quién, cuánto y su precio. */

import { ArrowDown, ArrowUp, Copy, Pencil, Trash2 } from 'lucide-react';
import { formatCLP } from '@/utils';
import { enUF, formatoHoras, formatoUF, type EstadoTarifa, type Indicadores, type ResultadoLinea } from '@/lib/hh/calculo';
import type { LineaHH } from '@/lib/hh/lineas';
import { AlertasTarifa, Cantidad } from './comun';
import s from './hh.module.css';

export default function TarjetaLinea({ l, i, total, r, ind, estado, onEditar, onCantidad, onDuplicar, onQuitar, onMover }: {
  l: LineaHH; i: number; total: number; r: ResultadoLinea; ind: Indicadores; estado: EstadoTarifa | null;
  onEditar: () => void; onCantidad: (v: number) => void; onDuplicar: () => void; onQuitar: () => void; onMover: (d: -1 | 1) => void;
}) {
  const unidad = l.unidad.trim();
  return (
    <article className={`panel ${s.linea}`} aria-label={`Trabajo ${i + 1}: ${l.descripcion}`}>
      <div style={{ minWidth: 0 }}>
        <p className={s.lineaTitulo}>{l.descripcion || 'Sin descripción'}</p>
        <p className={s.lineaSub}>{l.persona_nombre ?? 'Tarifa general'} · {l.cargo_nombre}</p>
      </div>
      <div className={s.lineaMonto}>
        <b>{formatCLP(r.subtotal)}</b>
        <span>{formatoUF(enUF(r.subtotal, ind.uf))}</span>
      </div>
      <div className={s.lineaPie}>
        <Cantidad valor={l.cantidad} onCambio={onCantidad} etiqueta={`cantidad de ${l.descripcion || 'este trabajo'}`} />
        {unidad && <span className={s.lineaDetalle}>{unidad}</span>}
        <span className={s.lineaDetalle}>
          · {formatoHoras(Number(l.horas_reales) || 0)} h{l.cantidad !== 1 ? ` c/u (${formatoHoras(r.horasReales)} h)` : ''}
          {l.multiplicador !== 1 && <> · se cobran {formatoHoras(r.horasCobradas)} HH</>}
          {l.cargo_apoyo_id && r.horasApoyo > 0 && <> · + ayudante {formatoHoras(r.horasApoyo)} h</>}
        </span>
        <span className={s.acciones}>
          <button type="button" className={s.iconoBtn} onClick={onEditar} aria-label="Editar"><Pencil size={15} /></button>
          <button type="button" className={s.iconoBtn} onClick={onDuplicar} aria-label="Duplicar"><Copy size={15} /></button>
          <button type="button" className={s.iconoBtn} onClick={() => onMover(-1)} disabled={i === 0} aria-label="Subir"><ArrowUp size={15} /></button>
          <button type="button" className={s.iconoBtn} onClick={() => onMover(1)} disabled={i === total - 1} aria-label="Bajar"><ArrowDown size={15} /></button>
          <button type="button" className={s.iconoBtn} onClick={onQuitar} aria-label="Quitar"><Trash2 size={15} /></button>
        </span>
      </div>
      {estado && (estado.bajoPiso || estado.mercado === 'bajo' || estado.mercado === 'sobre') && (
        <div style={{ gridColumn: '1 / -1' }}><AlertasTarifa e={estado} compacto /></div>
      )}
    </article>
  );
}
