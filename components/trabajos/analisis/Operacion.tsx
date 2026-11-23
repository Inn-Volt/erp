'use client';

/**
 * Operación del análisis de proyecto (fase 22): almuerzo, combustible, peajes, estacionamiento…
 * Lo presupuestado contra los gastos rendidos, con un desglose por categoría. Los gastos sin línea
 * van solos a la línea de operación de su partida. «Agregar gasto» abre el formulario de rendir con
 * la partida y la categoría elegidas (se mantiene el flujo de fondos y boleta para que la caja cuadre).
 */

import { useState } from 'react';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { SIN_PARTIDA, type PartidaOpcion } from '@/lib/controlProyecto';
import type { Analisis } from '@/lib/analisisProyecto';
import { CATEGORIAS_GASTO, type CategoriaGasto } from '@/services/operacion';
import { cant, inputTabla, Marca, num, Queda } from '@/components/trabajos/analisis/comun';
import { nombrePartida, porPartida, SelectPartida } from '@/components/trabajos/analisis/Materiales';
import type { EdicionPresupuesto } from '@/components/trabajos/analisis/tipos';
import { formatCLP } from '@/utils';

export default function Operacion({ a, partidas, edicion, onAgregarGasto }: {
  a: Analisis; partidas: PartidaOpcion[]; edicion: EdicionPresupuesto;
  onAgregarGasto?: (partida: string | null, categoria: CategoriaGasto) => void;
}) {
  const [partida, setPartida] = useState<string | null>(partidas[0]?.id ?? null);
  const [categoria, setCategoria] = useState<CategoriaGasto>('combustible');
  const filas = a.lineas.filter(x => x.linea.tipo === 'operacion').sort(porPartida(partidas));
  const sueltas = a.sinLinea.filter(s => s.tipo === 'operacion');
  const t = a.porTipo.operacion;
  const ed = edicion.activa;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.84rem', color: 'var(--text)' }}>
          Operación: <b>{formatCLP(t.gastado)}</b> gastados de {formatCLP(t.presupuesto)} · queda <Queda v={t.queda} /></span>
        <span style={{ flex: 1 }} />
        {onAgregarGasto && <>
          <SelectPartida partidas={partidas} value={partida} onChange={setPartida} etiqueta="Partida del gasto" />
          <select className="input" aria-label="Categoría del gasto" value={categoria} onChange={e => setCategoria(e.target.value as CategoriaGasto)} style={{ ...inputTabla, width: 'auto' }}>
            {CATEGORIAS_GASTO.map(c => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => onAgregarGasto(partida, categoria)}><Receipt size={13} /> Agregar gasto</button>
        </>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="iv-table" style={{ fontSize: '0.8rem', width: '100%' }}>
          <thead><tr>
            <th>Gasto de operación</th><th>Partida</th>
            {ed && <><th style={num}>Cantidad</th><th style={num}>Costo unitario</th></>}
            <th style={num}>Presupuesto</th><th style={num}>Gastado</th><th style={num}>Queda</th>{ed && <th />}
          </tr></thead>
          <tbody>
            {filas.map(x => {
              const l = x.linea;
              return (
                <tr key={l.clave}>
                  <td style={{ minWidth: 180 }}>
                    {ed ? <input className="input" aria-label="Gasto" value={l.descripcion} onChange={e => edicion.cambiar(l.clave, { descripcion: e.target.value })} style={inputTabla} />
                      : l.descripcion}
                    {!ed && x.movimientos.length > 0 && <span style={{ color: 'var(--muted)' }}> · {x.movimientos.length} {x.movimientos.length === 1 ? 'gasto' : 'gastos'}</span>}
                  </td>
                  <td>{ed ? <SelectPartida partidas={partidas} value={l.partida_id} onChange={v => edicion.cambiar(l.clave, { partida_id: v })} />
                    : <span style={{ color: 'var(--muted)' }}>{nombrePartida(partidas, l.partida_id)}</span>}</td>
                  {ed && <>
                    <td style={num}><NumeroInput className="input" ariaLabel="Cantidad" value={l.cantidad} decimales={3} envoltura={{ width: 72 }} onChange={v => edicion.cambiar(l.clave, { cantidad: v })} /></td>
                    <td style={num}><NumeroInput className="input" prefijo="$" ariaLabel="Costo unitario" value={l.costo_unitario} envoltura={{ width: 110 }} onChange={v => edicion.cambiar(l.clave, { costo_unitario: v })} /></td>
                  </>}
                  <td style={num}>{formatCLP(x.presupuesto)}</td>
                  <td style={num}>{formatCLP(x.gastado)}</td>
                  <td style={num}><Queda v={x.queda} /></td>
                  {ed && <td><button className="btn btn-ghost btn-xs" aria-label={`Quitar ${l.descripcion}`} onClick={() => edicion.quitar(l.clave)}><Trash2 size={12} /></button></td>}
                </tr>
              );
            })}
            {sueltas.map(s => (
              <tr key={s.clave}>
                <td>{s.etiqueta}<Marca texto="sin línea" tono="muted" />
                  <span style={{ color: 'var(--muted)' }}> · {s.movimientos.length} {s.movimientos.length === 1 ? 'gasto' : 'gastos'}</span></td>
                <td><span style={{ color: 'var(--muted)' }}>{nombrePartida(partidas, s.partidaId === SIN_PARTIDA ? null : s.partidaId)}</span></td>
                {ed && <><td /><td /></>}
                <td style={num}>{formatCLP(0)}</td>
                <td style={num}>{formatCLP(s.gastado)}</td>
                <td style={num}><Queda v={-s.gastado} /></td>
                {ed && <td />}
              </tr>
            ))}
            {!filas.length && !sueltas.length && <tr><td colSpan={ed ? 8 : 5} style={{ color: 'var(--muted)' }}>Sin gastos de operación presupuestados ni rendidos.</td></tr>}
          </tbody>
        </table>
      </div>
      {ed && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <SelectPartida partidas={partidas} value={partida} onChange={setPartida} etiqueta="Partida de la línea nueva" />
          <button className="btn btn-ghost btn-xs" onClick={() => edicion.agregar('operacion', partida)}><Plus size={12} /> Gasto de operación</button>
        </div>
      )}
      {a.operacionPorCategoria.length > 0 && (
        <div>
          <p className="label-muted" style={{ margin: '4px 0' }}>Gastado por categoría</p>
          <table className="iv-table" style={{ fontSize: '0.8rem', width: '100%', maxWidth: 420 }}>
            <tbody>
              {a.operacionPorCategoria.map(c => (
                <tr key={c.categoria}><td>{c.nombre}</td><td style={num}>{formatCLP(c.monto)}</td>
                  <td style={{ ...num, color: 'var(--muted)', width: 60 }}>{t.gastado > 0 ? `${cant((c.monto / t.gastado) * 100)} %` : ''}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>
        Un gasto rendido sin línea va solo a la línea de operación de su partida; si la partida no tiene, queda «sin línea».
      </p>
    </div>
  );
}
