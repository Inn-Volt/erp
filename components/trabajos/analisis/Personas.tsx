'use client';

/**
 * Mano de obra (POR DÍA) y servicios (POR HORA) del análisis de proyecto (fase 22).
 *   · La línea: personas × días × valor del día, o horas × valor de la hora. Tres modalidades:
 *     interno (el costo sale de su ficha), externo (líquido; con boleta de honorarios suma la
 *     retención) y líquido (el monto tal cual: los socios cuando no reciben sueldo).
 *   · La tabla: jornadas u horas hechas, cuántas faltan, gastado y queda.
 *   · Los registros: «Registrar días / horas» (e «Igual que el día…»), marcar pagado o por pagar a
 *     externos y líquidos (con el total por pagar), corregir y borrar.
 */

import { useState } from 'react';
import { CalendarPlus, Copy, HardHat, Pencil, Plus, Trash2 } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { SIN_PARTIDA, type ManoObraCP, type ModalidadPago, type PartidaOpcion } from '@/lib/controlProyecto';
import { diasDeLinea, HORAS_JORNADA, valorDeLinea, type Analisis, type LineaEntrada } from '@/lib/analisisProyecto';
import type { TrabajadorElegible } from '@/services/manoObra';
import { cant, inputTabla, Marca, num, Queda } from '@/components/trabajos/analisis/comun';
import { nombrePartida, porPartida, SelectPartida } from '@/components/trabajos/analisis/Materiales';
import type { EdicionPresupuesto } from '@/components/trabajos/analisis/tipos';
import { formatCLP, formatDate } from '@/utils';

export const MODALIDADES: { clave: ModalidadPago; nombre: string; ayuda: string }[] = [
  { clave: 'interno', nombre: 'Interno', ayuda: 'El costo sale de su ficha (sueldo y jornada)' },
  { clave: 'externo', nombre: 'Externo', ayuda: 'Se ingresa lo líquido; con boleta de honorarios el costo suma la retención' },
  { clave: 'liquido', nombre: 'Líquido', ayuda: 'El monto tal cual, sin descuentos ni retención' },
];
const nombreModalidad = (m: string | null | undefined) => MODALIDADES.find(x => x.clave === m)?.nombre || '—';

export default function Personas({ clase, a, partidas, edicion, equipo, retencion, registros, registraOtros, onRegistrar, onCorregir, onPagar, onBorrar }: {
  clase: 'mano_obra' | 'servicio';
  a: Analisis; partidas: PartidaOpcion[]; edicion: EdicionPresupuesto;
  equipo: TrabajadorElegible[]; retencion: number;
  /** Lo registrado de esta clase (lo más nuevo primero). */
  registros: ManoObraCP[];
  registraOtros: boolean;
  /** Abre «Registrar»; con un día, copia a la gente de ese día. */
  onRegistrar: (dia?: string) => void;
  onCorregir: (r: ManoObraCP) => void;
  onPagar: (r: ManoObraCP) => void;
  onBorrar: (r: ManoObraCP) => void;
}) {
  const porDia = clase === 'mano_obra';
  const [partidaNueva, setPartidaNueva] = useState<string | null>(partidas[0]?.id ?? null);
  const filas = a.lineas.filter(x => x.linea.tipo === clase).sort(porPartida(partidas));
  const sueltas = a.sinLinea.filter(s => s.tipo === clase);
  const t = a.porTipo[clase];
  const ed = edicion.activa;
  const fichaDe = (id: string | null) => equipo.find(x => x.id === id) || null;
  const unidad = porDia ? 'días' : 'h';

  // Cambia la línea y recalcula su costo por día u hora si cambió algo que lo define.
  const cambiar = (l: LineaEntrada, cambios: Partial<LineaEntrada>) => {
    const nueva = { ...l, ...cambios };
    const valor = valorDeLinea(nueva, fichaDe(nueva.trabajador_id), retencion);
    edicion.cambiar(l.clave, valor === null ? cambios : { ...cambios, costo_unitario: valor });
  };
  const elegirPersona = (l: LineaEntrada, id: string) => {
    const f = fichaDe(id);
    if (!f) { cambiar(l, { trabajador_id: null }); return; }
    const porHora = Math.round(f.valor_jornada / (f.horas_dia || HORAS_JORNADA));
    cambiar(l, {
      trabajador_id: f.id, descripcion: l.descripcion.trim() ? l.descripcion : f.nombre, modalidad: f.tipo,
      ...(f.tipo === 'externo' ? { valor_liquido: porDia ? f.valor_jornada : porHora, honorarios: f.honorarios } : {}),
    });
  };

  const porPagar = registros.filter(r => r.tipo !== 'interno' && !r.pagado).reduce((s, r) => s + r.costo, 0);
  const dias = [...new Set(registros.map(r => r.fecha))];
  const lineaDe = (id: string | null | undefined) => a.lineas.find(x => x.linea.id === id)?.linea.descripcion;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ fontSize: '0.84rem', color: 'var(--text)' }}>
        {porDia ? 'Mano de obra (por día)' : 'Servicios (por hora)'}: <b>{formatCLP(t.gastado)}</b> gastados de {formatCLP(t.presupuesto)} · queda <Queda v={t.queda} /></span>
      <div style={{ overflowX: 'auto' }}>
        <table className="iv-table" style={{ fontSize: '0.8rem', width: '100%' }}>
          <thead><tr>
            <th>{porDia ? 'Quién o qué' : 'Servicio'}</th><th>Partida</th><th>Modalidad</th>
            {porDia && <th style={num}>Personas</th>}
            <th style={num}>{porDia ? 'Días' : 'Horas'}</th><th style={num}>{porDia ? 'Valor día' : 'Valor hora'}</th>
            <th style={num}>Presupuesto</th><th style={num}>{porDia ? 'Jornadas hechas' : 'Horas hechas'}</th><th style={num}>Faltan</th>
            <th style={num}>Gastado</th><th style={num}>Queda</th>{ed && <th />}
          </tr></thead>
          <tbody>
            {filas.map(x => {
              const l = x.linea;
              const ficha = fichaDe(l.trabajador_id);
              const internoSinCosto = l.modalidad === 'interno' && (!ficha || ficha.costo_dia === null);
              return (
                <tr key={l.clave}>
                  <td style={{ minWidth: 180 }}>
                    {ed && (
                      <select className="input" aria-label="Persona" value={l.trabajador_id || ''} onChange={e => elegirPersona(l, e.target.value)} style={{ ...inputTabla, marginBottom: 3 }}>
                        <option value="">Sin persona del equipo</option>
                        {equipo.map(f => <option key={f.id} value={f.id}>{f.nombre} · {f.tipo}</option>)}
                      </select>
                    )}
                    {ed ? <input className="input" aria-label="Descripción" value={l.descripcion} onChange={e => edicion.cambiar(l.clave, { descripcion: e.target.value })} style={inputTabla} />
                      : l.descripcion}
                    {!l.linea_id && <Marca texto="no cotizado" />}
                  </td>
                  <td>{ed ? <SelectPartida partidas={partidas} value={l.partida_id} onChange={v => edicion.cambiar(l.clave, { partida_id: v })} />
                    : <span style={{ color: 'var(--muted)' }}>{nombrePartida(partidas, l.partida_id)}</span>}</td>
                  <td>
                    {ed ? <select className="input" aria-label="Modalidad" value={l.modalidad || ''} onChange={e => cambiar(l, { modalidad: (e.target.value || null) as ModalidadPago | null })} style={{ ...inputTabla, width: 'auto' }}>
                      <option value="">—</option>
                      {MODALIDADES.map(m => <option key={m.clave} value={m.clave} title={m.ayuda}>{m.nombre}</option>)}
                    </select> : nombreModalidad(l.modalidad)}
                    {ed && l.modalidad === 'externo' && (
                      <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: '0.72rem', marginTop: 3, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!l.honorarios} onChange={e => cambiar(l, { honorarios: e.target.checked })} style={{ accentColor: 'var(--y-brand)' }} /> boleta</label>
                    )}
                    {!ed && l.modalidad === 'externo' && l.honorarios && <span style={{ color: 'var(--muted)' }}> · con boleta</span>}
                  </td>
                  {porDia && <td style={num}>{ed
                    ? <NumeroInput className="input" ariaLabel="Personas" value={l.personas ?? 1} decimales={2} envoltura={{ width: 64 }}
                        onChange={v => edicion.cambiar(l.clave, { personas: v > 0 ? v : 1, cantidad: (v > 0 ? v : 1) * diasDeLinea(l) })} />
                    : cant(l.personas ?? 1)}</td>}
                  <td style={num}>{ed
                    ? <NumeroInput className="input" ariaLabel={porDia ? 'Días' : 'Horas'} value={porDia ? diasDeLinea(l) : l.cantidad} decimales={2} envoltura={{ width: 72 }}
                        onChange={v => edicion.cambiar(l.clave, { cantidad: porDia ? v * (l.personas || 1) : v })} />
                    : cant(porDia ? diasDeLinea(l) : l.cantidad)}</td>
                  <td style={num}>
                    {ed && (l.modalidad === 'externo' || l.modalidad === 'liquido')
                      ? <NumeroInput className="input" prefijo="$" ariaLabel={l.modalidad === 'externo' ? 'Líquido' : 'Monto'} value={l.valor_liquido ?? 0} envoltura={{ width: 110 }}
                          onChange={v => cambiar(l, { valor_liquido: v })} />
                      : ed && (internoSinCosto || !l.modalidad)
                        ? <NumeroInput className="input" prefijo="$" ariaLabel="Costo" value={l.costo_unitario} envoltura={{ width: 110 }} onChange={v => edicion.cambiar(l.clave, { costo_unitario: v })} />
                        : formatCLP(l.costo_unitario)}
                    {ed && l.modalidad === 'externo' && l.honorarios && <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>costo {formatCLP(l.costo_unitario)}</div>}
                    {ed && l.modalidad === 'interno' && !internoSinCosto && <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>de su ficha</div>}
                  </td>
                  <td style={num}>{formatCLP(x.presupuesto)}</td>
                  <td style={num}>{cant(x.hecho)} {unidad}</td>
                  <td style={num}>{x.pendiente > 0 ? `${cant(x.pendiente)} ${unidad}` : x.demas > 0 ? <span style={{ color: 'var(--danger)' }}>+{cant(x.demas)} {unidad}</span> : '—'}</td>
                  <td style={num}>{formatCLP(x.gastado)}</td>
                  <td style={num}><Queda v={x.queda} /></td>
                  {ed && <td><button className="btn btn-ghost btn-xs" aria-label={`Quitar ${l.descripcion}`} onClick={() => edicion.quitar(l.clave)}><Trash2 size={12} /></button></td>}
                </tr>
              );
            })}
            {sueltas.map(s => (
              <tr key={s.clave}>
                <td>{s.etiqueta}<Marca texto="sin línea" tono="muted" /></td>
                <td><span style={{ color: 'var(--muted)' }}>{nombrePartida(partidas, s.partidaId === SIN_PARTIDA ? null : s.partidaId)}</span></td>
                <td />{porDia && <td />}<td /><td />
                <td style={num}>{formatCLP(0)}</td>
                <td style={num}>{cant(s.hecho)} {unidad}</td>
                <td />
                <td style={num}>{formatCLP(s.gastado)}</td>
                <td style={num}><Queda v={-s.gastado} /></td>
                {ed && <td />}
              </tr>
            ))}
            {!filas.length && !sueltas.length && <tr><td colSpan={porDia ? 12 : 11} style={{ color: 'var(--muted)' }}>
              {porDia ? 'Sin mano de obra presupuestada ni registrada.' : 'Sin servicios presupuestados ni registrados (ingeniería, planos…).'}</td></tr>}
          </tbody>
        </table>
      </div>
      {ed && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <SelectPartida partidas={partidas} value={partidaNueva} onChange={setPartidaNueva} etiqueta="Partida de la línea nueva" />
          <button className="btn btn-ghost btn-xs" onClick={() => edicion.agregar(clase, partidaNueva)}><Plus size={12} /> {porDia ? 'Mano de obra' : 'Servicio'}</button>
        </div>
      )}

      {/* Lo registrado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <p className="label-muted" style={{ margin: 0, flex: 1 }}>
          {porDia ? 'Días registrados' : 'Horas registradas'}{porPagar > 0 ? <span style={{ color: 'var(--y)' }}> · por pagar {formatCLP(porPagar)}</span> : null}</p>
        {registraOtros && dias[0] && <button className="btn btn-ghost btn-xs" onClick={() => onRegistrar(dias[0])} title={`Copia a la gente del ${formatDate(dias[0])}`}>
          <Copy size={12} /> Igual que el {formatDate(dias[0])}</button>}
        {registraOtros && <button className="btn btn-primary btn-xs" onClick={() => onRegistrar()}><CalendarPlus size={12} /> {porDia ? 'Registrar días' : 'Registrar horas'}</button>}
      </div>
      {!registros.length ? <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>
        {porDia ? 'Sin días registrados. Registra quién trabajó y cuántos días: suma al gastado de su línea.' : 'Sin horas registradas.'}</p>
        : dias.map(dia => {
          const lista = registros.filter(r => r.fecha === dia);
          return (
            <div key={dia}>
              <p style={{ margin: '4px 0 0', fontSize: '0.76rem', color: 'var(--muted)', fontWeight: 600 }}>
                {formatDate(dia)} · {formatCLP(lista.reduce((s, r) => s + r.costo, 0))}</p>
              {lista.map(r => {
                const linea = lineaDe(r.presupuesto_linea_id);
                return (
                  <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.82rem', padding: '0.3rem 0', borderBottom: '1px solid var(--border2)', color: 'var(--text)' }}>
                    <HardHat size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    <span style={{ flex: '1 1 220px', minWidth: 0 }}>{r.nombre}
                      <span style={{ color: 'var(--muted)' }}>
                        {' · '}{nombreModalidad(r.tipo)}{r.jornadas !== null && r.jornadas !== undefined ? ` · ${cant(r.jornadas)} ${r.jornadas === 1 ? 'día' : 'días'}` : r.horas !== null ? ` · ${cant(r.horas)} h` : ''}
                        {r.tipo !== 'interno' && r.monto_liquido !== null ? ` · ${formatCLP(r.monto_liquido)} líquido${r.tipo === 'externo' && r.honorarios ? ' con boleta' : ''}` : ''}
                        {linea ? ` · ${linea}` : ` · ${nombrePartida(partidas, r.partida_id || null)}`}</span></span>
                    <span style={{ ...num, color: 'var(--muted)' }}>{formatCLP(r.costo)}</span>
                    {r.tipo !== 'interno' && (
                      <button className="badge" disabled={!registraOtros} onClick={() => onPagar(r)} title={registraOtros ? 'Cambiar' : undefined}
                        style={{ border: 'none', cursor: registraOtros ? 'pointer' : 'default', fontSize: '0.68rem', background: r.pagado ? 'var(--success-soft)' : 'var(--y-soft)', color: r.pagado ? 'var(--success)' : 'var(--text)' }}>
                        {r.pagado ? `Pagado${r.documento ? ` · BH ${r.documento}` : ''}` : 'Por pagar'}</button>
                    )}
                    {registraOtros && <>
                      <button className="btn btn-ghost btn-xs" onClick={() => onCorregir(r)} aria-label={`Corregir ${r.nombre}`}><Pencil size={12} /></button>
                      <button className="btn btn-ghost btn-xs" onClick={() => onBorrar(r)} aria-label={`Quitar ${r.nombre}`}><Trash2 size={12} /></button>
                    </>}
                  </div>
                );
              })}
            </div>
          );
        })}
    </div>
  );
}
