'use client';

/**
 * Materiales del análisis de proyecto (fase 22): por material, lo cotizado, lo comprado, lo
 * pendiente (comprar 5 de 10 deja 5), el presupuesto, lo gastado y lo que queda. Comprar de más se
 * marca «de más»; lo comprado que no estaba en la cotización aparece como «no cotizado / adicional»
 * y una compra sin detalle, como tal. «Registrar compra (IA)» lee la boleta, la factura o una lista
 * pegada y la cruza con estos materiales.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { SIN_PARTIDA, type PartidaOpcion } from '@/lib/controlProyecto';
import type { Analisis, LineaAnalisis } from '@/lib/analisisProyecto';
import { cant, inputTabla, Marca, num, Queda } from '@/components/trabajos/analisis/comun';
import type { EdicionPresupuesto } from '@/components/trabajos/analisis/tipos';
import { formatCLP } from '@/utils';

export function SelectPartida({ partidas, value, onChange, etiqueta = 'Partida' }: {
  partidas: PartidaOpcion[]; value: string | null; onChange: (id: string | null) => void; etiqueta?: string;
}) {
  return (
    <select className="input" aria-label={etiqueta} value={value || ''} onChange={e => onChange(e.target.value || null)} style={{ ...inputTabla, width: 'auto', maxWidth: 160 }}>
      <option value="">Sin partida</option>
      {partidas.map(p => <option key={p.id} value={p.id}>{p.numero}. {p.nombre}</option>)}
    </select>
  );
}

/** Orden de las filas: por partida (como en la cotización) y dentro de ella, por su orden. */
export const porPartida = (partidas: PartidaOpcion[]) => {
  const pos = new Map(partidas.map((p, i) => [p.id, i]));
  const de = (id: string | null) => (id && pos.has(id) ? pos.get(id)! : partidas.length);
  return (a: LineaAnalisis, b: LineaAnalisis) => de(a.linea.partida_id) - de(b.linea.partida_id) || a.linea.orden - b.linea.orden;
};
export const nombrePartida = (partidas: PartidaOpcion[], id: string | null) => {
  const p = partidas.find(x => x.id === id);
  return p ? `${p.numero}. ${p.nombre}` : 'Sin partida';
};

export default function Materiales({ a, partidas, edicion, cotId, onRegistrarCompra }: {
  a: Analisis; partidas: PartidaOpcion[]; edicion: EdicionPresupuesto; cotId: string;
  onRegistrarCompra?: () => void;
}) {
  const [partidaNueva, setPartidaNueva] = useState<string | null>(partidas[0]?.id ?? null);
  const filas = a.lineas.filter(x => x.linea.tipo === 'material').sort(porPartida(partidas));
  const sueltas = a.sinLinea.filter(s => s.tipo === 'material');
  const t = a.porTipo.material;
  const ed = edicion.activa;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.84rem', color: 'var(--text)' }}>
          Materiales: <b>{formatCLP(t.gastado)}</b> gastados de {formatCLP(t.presupuesto)} · queda <Queda v={t.queda} /></span>
        <span style={{ flex: 1 }} />
        <Link href={`/compras?trabajo=${cotId}`} style={{ fontSize: '0.8rem' }}>Ver las compras del trabajo</Link>
        {onRegistrarCompra && <button className="btn btn-primary btn-sm" onClick={onRegistrarCompra}><Sparkles size={13} /> Registrar compra (IA)</button>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="iv-table" style={{ fontSize: '0.8rem', width: '100%' }}>
          <thead><tr>
            <th>Material</th><th>Partida</th><th style={num}>Cotizado</th><th style={num}>Comprado</th><th style={num}>Pendiente</th>
            {ed && <th style={num}>Costo unitario</th>}
            <th style={num}>Presupuesto</th><th style={num}>Gastado</th><th style={num}>Queda</th>{ed && <th />}
          </tr></thead>
          <tbody>
            {filas.map(x => {
              const l = x.linea, u = l.unidad || '';
              return (
                <tr key={l.clave}>
                  <td style={{ minWidth: 180 }}>
                    {ed ? <input className="input" aria-label="Material" value={l.descripcion} onChange={e => edicion.cambiar(l.clave, { descripcion: e.target.value })} style={inputTabla} />
                      : l.descripcion}
                    {!l.linea_id && <Marca texto="no cotizado" />}
                    {x.demas > 0 && <Marca texto="de más" tono="danger" />}
                  </td>
                  <td>{ed ? <SelectPartida partidas={partidas} value={l.partida_id} onChange={v => edicion.cambiar(l.clave, { partida_id: v })} />
                    : <span style={{ color: 'var(--muted)' }}>{nombrePartida(partidas, l.partida_id)}</span>}</td>
                  <td style={num}>{x.cotizado === null ? <span style={{ color: 'var(--faint)' }}>—</span> : `${cant(x.cotizado)} ${u}`}</td>
                  <td style={num}>
                    {ed ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>{cant(x.hecho)} de
                      <NumeroInput className="input" ariaLabel="Cantidad presupuestada" value={l.cantidad} onChange={v => edicion.cambiar(l.clave, { cantidad: v })} decimales={3} envoltura={{ width: 72 }} />
                      <input className="input" aria-label="Unidad" value={u} onChange={e => edicion.cambiar(l.clave, { unidad: e.target.value })} style={{ ...inputTabla, width: 48 }} /></span>
                      : `${cant(x.hecho)} de ${cant(l.cantidad)} ${u}`}
                  </td>
                  <td style={num}>
                    {x.pendiente > 0 ? <b style={{ color: 'var(--y)' }}>{cant(x.pendiente)} {u}</b>
                      : x.demas > 0 ? <span style={{ color: 'var(--danger)' }}>+{cant(x.demas)} {u} de más</span>
                      : <span style={{ color: 'var(--success)' }}>completo</span>}
                  </td>
                  {ed && <td style={num}><NumeroInput className="input" prefijo="$" ariaLabel="Costo unitario" value={l.costo_unitario} onChange={v => edicion.cambiar(l.clave, { costo_unitario: v })} envoltura={{ width: 110 }} /></td>}
                  <td style={num}>{formatCLP(x.presupuesto)}</td>
                  <td style={num}>{formatCLP(x.gastado)}</td>
                  <td style={num}><Queda v={x.queda} /></td>
                  {ed && <td><button className="btn btn-ghost btn-xs" aria-label={`Quitar ${l.descripcion}`} onClick={() => edicion.quitar(l.clave)}><Trash2 size={12} /></button></td>}
                </tr>
              );
            })}
            {sueltas.map(s => (
              <tr key={s.clave}>
                <td style={{ minWidth: 180 }}>{s.etiqueta}{s.sinDetalle ? <Marca texto="sin detalle" tono="muted" /> : <Marca texto="no cotizado · adicional" />}</td>
                <td><span style={{ color: 'var(--muted)' }}>{nombrePartida(partidas, s.partidaId === SIN_PARTIDA ? null : s.partidaId)}</span></td>
                <td style={num}><span style={{ color: 'var(--faint)' }}>—</span></td>
                <td style={num}>{s.sinDetalle || !s.hecho ? <span style={{ color: 'var(--faint)' }}>—</span> : cant(s.hecho)}</td>
                <td style={num}><span style={{ color: 'var(--faint)' }}>—</span></td>
                {ed && <td />}
                <td style={num}>{formatCLP(0)}</td>
                <td style={num}>{formatCLP(s.gastado)}</td>
                <td style={num}><Queda v={-s.gastado} /></td>
                {ed && <td />}
              </tr>
            ))}
            {!filas.length && !sueltas.length && <tr><td colSpan={ed ? 10 : 8} style={{ color: 'var(--muted)' }}>Sin materiales presupuestados ni compras.</td></tr>}
          </tbody>
        </table>
      </div>
      {ed && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <SelectPartida partidas={partidas} value={partidaNueva} onChange={setPartidaNueva} etiqueta="Partida del material nuevo" />
          <button className="btn btn-ghost btn-xs" onClick={() => edicion.agregar('material', partidaNueva)}><Plus size={12} /> Material</button>
        </div>
      )}
      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>
        Comprado = lo de las boletas y facturas con detalle asignado a cada material (en su unidad). Una compra sin detalle suma a lo gastado de su
        partida pero no a lo comprado de un material: regístrala con «Registrar compra (IA)» o detállala en Compras.
      </p>
    </div>
  );
}
