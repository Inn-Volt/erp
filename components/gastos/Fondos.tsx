'use client';

/**
 * Fondos por persona (fase 19, las «Rendiciones 2.0» de TecApp).
 *   · MiFondo: lo que tengo para el día a día, lo que me deben y mis devoluciones.
 *   · FondosEquipo (quien ve todas las rendiciones): una fila por persona, con entregar, recibir una
 *     devolución, pagar lo que puso (por transferencia o descontándolo del fondo) y su libro; arriba,
 *     las devoluciones que esperan confirmación.
 *   · LibroFondo: cada movimiento y cada gasto con el saldo que deja; quien paga revierte con motivo.
 * La pantalla no suma: las cuentas las hace la base (fondo_cuentas).
 */

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Camera, Check, FileDown, HandCoins, Loader2, Plus, Undo2, Wallet, X } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { Modal } from '@/components/cotizador/ui';
import { fondosService, type CuentasDe } from '@/services/fondos';
import { archivosOT } from '@/services/operacion';
import { folioMovimiento, libroDelFondo, NOMBRE_MOVIMIENTO, type Cuentas, type FilaLibro, type MovimientoFondo } from '@/lib/fondos';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP, formatDate } from '@/utils';
import type { Vendedor } from '@/types';

const tarjeta: React.CSSProperties = { border: '1px solid var(--border2)', borderRadius: 10, padding: '0.6rem 0.8rem', background: 'var(--bg2)' };
const etiqueta: React.CSSProperties = { display: 'block', fontSize: '0.72rem', color: 'var(--muted)' };
const valor: React.CSSProperties = { display: 'block', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' };

/** Abre un archivo guardado (boleta o comprobante) en otra pestaña. */
export async function verArchivo(path: string, onError: (m: string) => void) {
  const u = await archivosOT.urls([path]).catch(() => ({} as Record<string, string>));
  if (u[path]) window.open(u[path], '_blank'); else onError('No se pudo abrir el archivo');
}

// ── Mi fondo ──
export function MiFondo({ uid, cuentas, porConfirmar, onCambio, onLibro, onPdf }: {
  uid: string; cuentas: Cuentas; porConfirmar: MovimientoFondo[]; onCambio: () => void; onLibro: () => void; onPdf: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [devolver, setDevolver] = useState(false);
  const retirar = async (m: MovimientoFondo) => {
    if (!confirm(`¿Retirar la devolución de ${formatCLP(m.monto)}? Vuelve a tu fondo.`)) return;
    try { await fondosService.descartar(m.id, 'La retiró quien la declaró'); success('Devolución retirada'); onCambio(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
  };
  return (
    <div className="panel-y" style={{ marginBottom: 12, padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <p className="section-label" style={{ margin: 0, flex: 1 }}><Wallet size={15} /> Mi fondo</p>
        <button className="btn btn-ghost btn-sm" onClick={onLibro}><BookOpen size={13} /> Mi libro</button>
        <button className="btn btn-ghost btn-sm" onClick={onPdf}><FileDown size={13} /> Rendición en PDF</button>
        {cuentas.disponible > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setDevolver(true)}><Undo2 size={13} /> Devolví plata</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 8 }}>
        <div style={tarjeta}><span style={etiqueta}>Tienes para el día a día</span><span style={valor}>{formatCLP(cuentas.disponible)}</span></div>
        <div style={tarjeta}><span style={etiqueta}>Te debemos (lo que pusiste)</span><span style={{ ...valor, color: cuentas.debemos > 0 ? '#2563eb' : 'var(--text)' }}>{formatCLP(cuentas.debemos)}</span></div>
        {cuentas.por_confirmar > 0 && <div style={tarjeta}><span style={etiqueta}>Devoluciones por confirmar</span><span style={valor}>{formatCLP(cuentas.por_confirmar)}</span></div>}
        {cuentas.en_revision > 0 && <div style={tarjeta}><span style={etiqueta}>En gastos observados</span><span style={{ ...valor, color: 'var(--danger)' }}>{formatCLP(cuentas.en_revision)}</span></div>}
      </div>
      {cuentas.en_revision > 0 && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--danger)' }}>Tienes gastos observados: corrígelos abajo para que se te paguen.</p>}
      {porConfirmar.map(m => (
        <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.82rem', color: 'var(--text)', background: 'var(--bg3)', borderRadius: 8, padding: '0.4rem 0.7rem' }}>
          <span style={{ flex: 1 }}>Declaraste una devolución de <b>{formatCLP(m.monto)}</b> el {formatDate(m.fecha)}: espera que la confirmen.</span>
          <button className="btn btn-ghost btn-xs" onClick={() => retirar(m)}>Retirar</button>
        </div>
      ))}
      {devolver && <FormularioPlata tipo="declarar" uid={uid} nombre="tu fondo" maximo={cuentas.disponible}
        onCerrar={() => setDevolver(false)} onListo={() => { setDevolver(false); onCambio(); }} />}
    </div>
  );
}

// ── Fondos del equipo ──
export function FondosEquipo({ filas, equipo, porConfirmar, paga, yo, onCambio, onLibro, onPdf }: {
  filas: CuentasDe[]; equipo: Record<string, Vendedor>; porConfirmar: MovimientoFondo[]; paga: boolean; yo?: string;
  onCambio: () => void; onLibro: (uid: string) => void; onPdf: (uid: string) => void;
}) {
  const { success, error: toastError } = useToast();
  const [form, setForm] = useState<{ tipo: 'entregar' | 'recibir' | 'pagar'; uid: string } | null>(null);
  const nombre = (uid: string) => equipo[uid]?.nombre || 'Usuario';
  const filasOrden = useMemo(() => [...filas].sort((a, b) => (b.debemos - a.debemos) || (b.disponible - a.disponible)), [filas]);
  const total = (k: 'disponible' | 'debemos') => filas.reduce((s, f) => s + f[k], 0);
  const cuentasDe = (uid: string) => filas.find(f => f.usuario_id === uid);

  const confirmar = async (m: MovimientoFondo) => {
    try { await fondosService.confirmar(m.id); success('Devolución confirmada'); onCambio(); } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
  };
  const noLlego = async (m: MovimientoFondo) => {
    const motivo = prompt('¿Qué pasó con la devolución? (no llegó, monto distinto…)');
    if (!motivo?.trim()) return;
    try { await fondosService.descartar(m.id, motivo.trim()); success('Marcada como no llegada'); onCambio(); } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
  };

  return (
    <div className="panel-y" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.8rem 1rem', borderBottom: '1px solid var(--border2)', flexWrap: 'wrap' }}>
        <p className="section-label" style={{ margin: 0, flex: 1 }}><HandCoins size={15} /> Fondos del equipo · {formatCLP(total('disponible'))} en fondos · {formatCLP(total('debemos'))} por pagar</p>
        {paga && <button className="btn btn-ghost btn-sm" onClick={() => setForm({ tipo: 'entregar', uid: '' })}><Plus size={13} /> Entregar dinero</button>}
      </div>
      {porConfirmar.length > 0 && (
        <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid var(--border2)', background: 'var(--y-soft)' }}>
          <p style={{ margin: '0 0 4px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>Devoluciones por confirmar</p>
          {porConfirmar.map(m => (
            <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.84rem', padding: '0.25rem 0', color: 'var(--text)' }}>
              <span style={{ flex: 1, minWidth: 200 }}>{nombre(m.usuario_id)} devolvió <b>{formatCLP(m.monto)}</b> el {formatDate(m.fecha)}{m.nota ? ` · ${m.nota}` : ''}</span>
              {m.comprobante_path && <button className="btn btn-ghost btn-xs" onClick={() => verArchivo(m.comprobante_path!, toastError)}><Camera size={12} /> Comprobante</button>}
              {paga && <>
                <button className="btn btn-primary btn-xs" onClick={() => confirmar(m)}><Check size={12} /> Llegó</button>
                <button className="btn btn-ghost btn-xs" onClick={() => noLlego(m)}><X size={12} /> No llegó</button>
              </>}
            </div>
          ))}
        </div>
      )}
      {filasOrden.length === 0 ? <p style={{ padding: '0.8rem 1rem', margin: 0, color: 'var(--muted)', fontSize: '0.84rem' }}>Nadie tiene fondo ni gastos por pagar. Entrega dinero para abrir el fondo de una persona.</p>
        : filasOrden.map(f => (
          <div key={f.usuario_id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '0.6rem 1rem', borderTop: '1px solid var(--border2)' }}>
            <span style={{ flex: 1, minWidth: 160 }}>
              <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem' }}>{nombre(f.usuario_id)}{f.usuario_id === yo ? ' (tú)' : ''}</span>
              <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                {formatCLP(f.disponible)} en su fondo{f.por_confirmar > 0 ? ` · ${formatCLP(f.por_confirmar)} por confirmar` : ''}{f.en_revision > 0 ? ` · ${formatCLP(f.en_revision)} observado` : ''}
              </span>
            </span>
            {f.debemos > 0 && <span style={{ fontSize: '0.84rem', color: '#2563eb', fontWeight: 700, whiteSpace: 'nowrap' }}>Le debes {formatCLP(f.debemos)}</span>}
            <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {paga && f.debemos > 0 && <button className="btn btn-primary btn-xs" onClick={() => setForm({ tipo: 'pagar', uid: f.usuario_id })}>Pagar</button>}
              {paga && <button className="btn btn-ghost btn-xs" onClick={() => setForm({ tipo: 'entregar', uid: f.usuario_id })}>Entregar</button>}
              {paga && f.disponible > 0 && <button className="btn btn-ghost btn-xs" onClick={() => setForm({ tipo: 'recibir', uid: f.usuario_id })}>Me devolvió</button>}
              <button className="btn btn-ghost btn-xs" onClick={() => onLibro(f.usuario_id)}><BookOpen size={12} /> Libro</button>
              <button className="btn btn-ghost btn-xs" onClick={() => onPdf(f.usuario_id)} aria-label="Rendición en PDF" title="Rendición en PDF"><FileDown size={12} /></button>
            </span>
          </div>
        ))}
      {form && (
        <FormularioPlata tipo={form.tipo} uid={form.uid} equipo={form.uid ? undefined : equipo}
          nombre={form.uid ? nombre(form.uid) : ''}
          maximo={form.tipo === 'recibir' ? cuentasDe(form.uid)?.disponible : form.tipo === 'pagar' ? cuentasDe(form.uid)?.debemos : undefined}
          disponible={cuentasDe(form.uid)?.disponible}
          onCerrar={() => setForm(null)} onListo={() => { setForm(null); onCambio(); }} />
      )}
    </div>
  );
}

// ── Formulario de plata: entregar, recibir o declarar una devolución, pagar ──
function FormularioPlata({ tipo, uid: uidInicial, nombre, maximo, disponible, equipo, onCerrar, onListo }: {
  tipo: 'entregar' | 'recibir' | 'declarar' | 'pagar'; uid: string; nombre: string; maximo?: number; disponible?: number;
  /** Para elegir a quién (entregar desde arriba). */
  equipo?: Record<string, Vendedor>;
  onCerrar: () => void; onListo: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [uid, setUid] = useState(uidInicial);
  const [monto, setMonto] = useState<number>(maximo && tipo !== 'entregar' ? maximo : 0);
  const [fecha, setFecha] = useState(fechaLocal());
  const [texto, setTexto] = useState('');
  const [como, setComo] = useState<'pago' | 'compensacion'>('pago');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const tope = tipo === 'pagar' && como === 'compensacion' ? Math.min(maximo ?? 0, disponible ?? 0) : maximo;
  const titulo = tipo === 'entregar' ? `Entregar dinero${nombre ? ` a ${nombre}` : ''}` : tipo === 'recibir' ? `${nombre} me devolvió`
    : tipo === 'declarar' ? 'Devolví plata de mi fondo' : `Pagarle a ${nombre} lo que puso`;
  const guardar = async () => {
    if (!uid) { toastError('Elige a quién'); return; }
    if (!(monto > 0)) { toastError('Escribe el monto'); return; }
    if (tope !== undefined && monto > tope + 0.001) { toastError(`El monto no puede pasar ${formatCLP(tope)}`); return; }
    if (tipo === 'declarar' && !archivo) { toastError('Adjunta el comprobante de la devolución'); return; }
    if (tipo === 'recibir' && !texto.trim()) { toastError('Di cómo la recibiste (en mano, transferencia…)'); return; }
    setOcupado(true);
    try {
      const comprobante = archivo ? await archivosOT.subir('fondos', archivo) : null;
      const t = texto.trim() || null;
      if (tipo === 'entregar') await fondosService.entregar(uid, monto, fecha, t, comprobante);
      else if (tipo === 'recibir') await fondosService.recibirDevolucion(uid, monto, fecha, texto.trim(), comprobante);
      else if (tipo === 'declarar') await fondosService.declararDevolucion(uid, monto, fecha, t, comprobante!);
      else await fondosService.pagar(uid, monto, como, fecha, t, comprobante);
      success(tipo === 'entregar' ? 'Entregado: se suma a su fondo y le llega el aviso' : tipo === 'declarar' ? 'Devolución declarada: espera que la confirmen'
        : tipo === 'recibir' ? 'Devolución registrada' : como === 'pago' ? 'Pago registrado: le llega el aviso' : 'Descontado de su fondo');
      onListo();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setOcupado(false); }
  };
  const campo: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
  return (
    <Modal titulo={<><HandCoins size={15} /> {titulo}</>} onCerrar={onCerrar} ancho={460} pie={<>
      <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
      <button className="btn btn-primary" onClick={guardar} disabled={ocupado}>{ocupado ? <Loader2 size={14} className="iv-spin" /> : <Check size={14} />} Guardar</button>
    </>}>
      {equipo && (
        <label style={campo}><span className="label-muted">A quién</span>
          <select className="input" value={uid} onChange={e => setUid(e.target.value)} autoFocus>
            <option value="">Elegir…</option>{Object.values(equipo).filter(p => p.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select></label>
      )}
      {tipo === 'pagar' && (
        <div role="group" aria-label="Cómo se paga" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem', color: 'var(--text)' }}>
            <input type="radio" checked={como === 'pago'} onChange={() => setComo('pago')} style={{ accentColor: 'var(--y-brand)' }} /> Por transferencia</label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem', color: (disponible ?? 0) > 0 ? 'var(--text)' : 'var(--muted)' }}>
            <input type="radio" checked={como === 'compensacion'} disabled={!((disponible ?? 0) > 0)} onChange={() => { setComo('compensacion'); setMonto(Math.min(monto, disponible ?? 0)); }} style={{ accentColor: 'var(--y-brand)' }} />
            Descontarlo de su fondo {(disponible ?? 0) > 0 ? `(tiene ${formatCLP(disponible ?? 0)})` : '(no tiene fondo)'}</label>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={campo}><span className="label-muted">Monto{tope !== undefined ? ` (hasta ${formatCLP(tope)})` : ''}</span>
          <NumeroInput className="input" prefijo="$" min={0} decimales={0} value={monto} onChange={setMonto} autoFocus={!equipo} /></label>
        <label style={campo}><span className="label-muted">Fecha</span><input className="input" type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></label>
      </div>
      <label style={campo}><span className="label-muted">{tipo === 'recibir' ? 'Cómo la recibiste *' : tipo === 'pagar' ? 'N° de operación o nota' : tipo === 'entregar' ? 'Para qué (opcional)' : 'Nota (opcional)'}</span>
        <input className="input" value={texto} maxLength={200} onChange={e => setTexto(e.target.value)}
          placeholder={tipo === 'recibir' ? 'En mano, en la oficina' : tipo === 'pagar' ? 'Transferencia N° 12345' : tipo === 'entregar' ? 'Bencina y peajes de la semana' : 'Transferí a la cuenta de la empresa'} /></label>
      <label className="btn btn-ghost" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
        <Camera size={14} /> {archivo ? archivo.name : tipo === 'declarar' ? 'Foto del comprobante *' : 'Comprobante (opcional)'}
        <input type="file" accept="image/*" hidden onChange={e => setArchivo(e.target.files?.[0] || null)} />
      </label>
      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>
        {tipo === 'entregar' ? 'Se suma a su fondo (o lo abre). No hace falta elegir trabajo: el gasto dice a qué trabajo va.'
          : tipo === 'declarar' ? 'Queda reservada en tu fondo hasta que quien paga la confirme.'
          : tipo === 'recibir' ? 'Sale de su fondo y queda confirmada.'
          : como === 'pago' ? 'Queda anotado y, pagado todo, sus gastos quedan «reembolsados».' : 'Lo que se le debía se paga con lo que tiene en el fondo.'}
      </p>
    </Modal>
  );
}

// ── El libro de una persona ──
export function LibroFondo({ uid, nombre, paga, onCerrar, onCambio }: {
  uid: string; nombre: string; paga: boolean; onCerrar: () => void; onCambio: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [filas, setFilas] = useState<FilaLibro[] | null>(null);
  const [cuentas, setCuentas] = useState<Cuentas | null>(null);
  const cargar = async () => {
    try {
      const [m, g, c] = await Promise.all([fondosService.movimientos(uid), fondosService.gastosDe(uid), fondosService.situacion(uid)]);
      setFilas(libroDelFondo(m, g).reverse()); setCuentas(c);
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo cargar el libro'); setFilas([]); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [uid]);
  const revertir = async (m: MovimientoFondo) => {
    const motivo = prompt(`¿Por qué se revierte ${folioMovimiento(m.folio)} (${NOMBRE_MOVIMIENTO[m.tipo].toLowerCase()} de ${formatCLP(m.monto)})?`);
    if (!motivo?.trim()) return;
    try { await fondosService.revertir(m, motivo.trim()); success('Movimiento revertido'); cargar(); onCambio(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo revertir'); }
  };
  const monto = (v: number) => (v ? `${v > 0 ? '+' : '−'} ${formatCLP(Math.abs(v))}` : '');
  return (
    <Modal titulo={<><BookOpen size={15} /> Libro del fondo · {nombre}</>} onCerrar={onCerrar} ancho={760}>
      {cuentas && <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text)' }}>
        Hoy: <b>{formatCLP(cuentas.disponible)}</b> disponible en el fondo{cuentas.debemos > 0 ? <> · se le deben <b>{formatCLP(cuentas.debemos)}</b></> : ''}
        {cuentas.por_confirmar > 0 ? ` · ${formatCLP(cuentas.por_confirmar)} por confirmar` : ''}</p>}
      {!filas ? <div className="skeleton" style={{ height: 160 }} /> : filas.length === 0 ? <p style={{ color: 'var(--muted)', margin: 0 }}>Sin movimientos todavía.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 620 }}>
            <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
              <th style={{ padding: '0.3rem' }}>Fecha</th><th style={{ padding: '0.3rem' }}>Qué</th>
              <th style={{ padding: '0.3rem', textAlign: 'right' }}>Fondo</th><th style={{ padding: '0.3rem', textAlign: 'right' }}>Saldo fondo</th>
              <th style={{ padding: '0.3rem', textAlign: 'right' }}>Se le debe</th><th />
            </tr></thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.clave} style={{ borderTop: '1px solid var(--border2)', color: f.tachada ? 'var(--muted)' : 'var(--text)', textDecoration: f.tachada ? 'line-through' : undefined }}>
                  <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{formatDate(f.fecha)}</td>
                  <td style={{ padding: '0.35rem 0.3rem' }}>
                    <b style={{ fontWeight: 600 }}>{f.texto}</b>{f.enCamino ? <span style={{ color: '#d97706' }}> · en camino</span> : null}
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)' }}>{f.detalle}</span>
                  </td>
                  <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{monto(f.fondo)}</td>
                  <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{formatCLP(f.saldoFondo)}</td>
                  <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatCLP(f.saldoDeuda)}</td>
                  <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {f.movimiento?.comprobante_path && <button className="btn btn-ghost btn-xs" onClick={() => verArchivo(f.movimiento!.comprobante_path!, toastError)} aria-label="Comprobante"><Camera size={12} /></button>}
                    {paga && f.movimiento && f.movimiento.estado === 'confirmado' && f.movimiento.tipo !== 'reversa' && !f.movimiento.revertido && (
                      <button className="btn btn-ghost btn-xs" onClick={() => revertir(f.movimiento!)}>Revertir</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted)' }}>Los movimientos no se editan: si algo se registró mal, se revierte con su motivo y queda a la vista.</p>
    </Modal>
  );
}
