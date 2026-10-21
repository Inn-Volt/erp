'use client';

/**
 * Cotizar con IA, conversando. El vendedor escribe el requerimiento («Requerimiento:
 * instalación de tablero»), la IA pregunta lo que falta (con opciones para responder con un
 * toque) y propone las partidas usando la biblioteca. Antes de agregar nada se muestra el
 * resumen: qué sale de la biblioteca (con su precio real) y qué es nuevo (estimado por la
 * IA), el total como quedaría la cotización, y se puede corregir o quitar cada cosa.
 * La conversación se guarda en este navegador: si se cierra sin querer, se retoma.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Bot, Library, Loader2, PackagePlus, RotateCcw, Send, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { fetchConSesion } from '@/lib/fetchConSesion';
import { formatMonto } from '@/lib/cotizador/calculo';
import type { ArticuloCatalogo } from '@/lib/cotizador/tipos';
import {
  MAX_RONDAS_PREGUNTAS, preseleccionar, revisarPropuesta,
  type ComponenteRevisado, type MensajeIA, type PartidaRevisada, type PreguntaIA, type TurnoIA,
} from '@/lib/cotizador/iaConversacion';
import { CATEGORIA_COLORS, CATEGORIA_LABELS, type CategoriaItem, type Moneda, type PartidaIAResuelta } from '@/types';

export interface VistaPrevia { neto: number; iva: number; total: number; porPartida: number[] }
interface Burbuja { rol: 'usuario' | 'asistente'; texto: string; preguntas?: PreguntaIA[] }
interface Guardado { chat: Burbuja[]; revision: PartidaRevisada[] | null; resumen: string; supuestos: string[] }

const CLAVE = 'innvolt.cotizarIA.conversa';
const EJEMPLOS = [
  'Requerimiento: Instalación de tablero',
  'Requerimiento: 10 puntos de red cat 6 en oficina',
  'Requerimiento: cargador para auto eléctrico en una casa',
  'Requerimiento: 8 cámaras CCTV para una bodega',
];
const leer = (): Guardado | null => { try { const r = localStorage.getItem(CLAVE); return r ? JSON.parse(r) as Guardado : null; } catch { return null; } };
const guardar = (g: Guardado | null) => { try { if (g) localStorage.setItem(CLAVE, JSON.stringify(g)); else localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ } };

/** Lo que le decimos a la IA que preguntó (para que no repita). */
const textoDe = (b: Burbuja) => [b.texto, ...(b.preguntas || []).map((q, i) => `${i + 1}) ${q.pregunta}${q.opciones.length ? ` (opciones: ${q.opciones.join(' / ')})` : ''}`)].filter(Boolean).join('\n');

export function aResueltas(rev: PartidaRevisada[]): PartidaIAResuelta[] {
  return rev.map(p => ({
    nombre: p.nombre, descripcion: p.descripcion, cantidad: p.cantidad, unidad: p.unidad,
    componentes: p.componentes.filter(c => c.incluir).map(c => ({
      descripcion: c.descripcion, categoria: c.categoria, unidad: c.unidad, cantidad: c.cantidad, costo: c.costo,
      codigo: c.codigo || undefined, matched: c.origen === 'biblioteca', itemId: c.itemId,
    })),
  })).filter(p => p.componentes.length);
}

export default function CotizarIAConversa({ moneda, catalogo, previsualizar, onInsertar, onClose, descripcionInicial = '' }: {
  moneda: Moneda; catalogo: ArticuloCatalogo[];
  previsualizar: (p: PartidaIAResuelta[]) => VistaPrevia;
  onInsertar: (p: PartidaIAResuelta[], supuestos: string[]) => void; onClose: () => void; descripcionInicial?: string;
}) {
  const previo = useRef<Guardado | null>(descripcionInicial ? null : leer());
  const [chat, setChat] = useState<Burbuja[]>(previo.current?.chat || []);
  const [revision, setRevision] = useState<PartidaRevisada[] | null>(previo.current?.revision || null);
  const [resumen, setResumen] = useState(previo.current?.resumen || '');
  const [supuestos, setSupuestos] = useState<string[]>(previo.current?.supuestos || []);
  const [verResumen, setVerResumen] = useState(!!previo.current?.revision);
  const [texto, setTexto] = useState(descripcionInicial || (previo.current ? '' : 'Requerimiento: '));
  const [respuestas, setRespuestas] = useState<Record<number, string>>({});
  const [otras, setOtras] = useState<Record<number, string>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<{ msg: string; reintentar: () => void } | null>(null);
  const finChat = useRef<HTMLDivElement>(null);
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  useEffect(() => { guardar(chat.length ? { chat, revision, resumen, supuestos } : null); }, [chat, revision, resumen, supuestos]);
  useEffect(() => { finChat.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [chat, cargando]);

  const rondas = chat.filter(b => b.rol === 'asistente' && b.preguntas?.length).length;
  const ultima = chat[chat.length - 1];
  const preguntasAbiertas = !cargando && ultima?.rol === 'asistente' && ultima.preguntas?.length ? ultima.preguntas : null;

  // ── Hablar con la IA ──
  async function enviar(nuevo: Burbuja | null, generarYa = false) {
    const conversacion = nuevo ? [...chat, nuevo] : chat;
    if (nuevo) setChat(conversacion);
    setCargando(true); setError(null); setRespuestas({}); setOtras({});
    // La preselección de la biblioteca se arma con todo lo conversado.
    const { candidatos, porRef } = preseleccionar(conversacion.map(b => b.texto).join(' '), catalogo);
    const mensajes: MensajeIA[] = conversacion.map(b => ({ rol: b.rol, texto: textoDe(b) }));
    try {
      const res = await fetchConSesion('/api/cotizar-ia/conversar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensajes, candidatos, generarYa }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.turno) throw new Error(data?.error || 'No se pudo hablar con la IA.');
      if (!vivo.current) return;
      const t = data.turno as TurnoIA;
      if (t.tipo === 'propuesta' && t.propuesta) {
        const rev = revisarPropuesta(t.propuesta, porRef);
        setChat(c => [...c, { rol: 'asistente', texto: t.mensaje || 'Listo, armé la propuesta. Revísala antes de agregarla.' }]);
        setRevision(rev); setResumen(t.propuesta.resumen); setSupuestos(t.propuesta.supuestos); setVerResumen(true);
      } else {
        setChat(c => [...c, { rol: 'asistente', texto: t.mensaje, preguntas: t.preguntas }]);
      }
    } catch (e) {
      if (!vivo.current) return;
      setError({ msg: e instanceof Error ? e.message : 'Error de conexión', reintentar: () => enviar(null, generarYa) });
    } finally { if (vivo.current) setCargando(false); }
  }

  const empezar = (generarYa = false) => {
    const t = texto.trim();
    if (t.replace(/^requerimiento:\s*/i, '').length < 4) { setError({ msg: 'Escribe el requerimiento (ej. «Requerimiento: Instalación de tablero»).', reintentar: () => setError(null) }); return; }
    setTexto('');
    enviar({ rol: 'usuario', texto: t }, generarYa);
  };
  const responder = () => {
    if (!preguntasAbiertas) return;
    const lineas = preguntasAbiertas.map((q, i) => {
      const r = (otras[i]?.trim() || respuestas[i] || '').trim();
      return r ? `${q.pregunta} → ${r}` : `${q.pregunta} → (no sé / asume lo habitual)`;
    });
    const extra = texto.trim();
    setTexto('');
    enviar({ rol: 'usuario', texto: [...lineas, extra].filter(Boolean).join('\n') });
  };
  const escribir = (generarYa = false) => {
    const t = texto.trim();
    if (!t && !generarYa) return;
    setTexto('');
    enviar(t ? { rol: 'usuario', texto: t } : null, generarYa);
  };
  const reiniciar = () => {
    if (chat.length && !confirm('¿Empezar una conversación nueva? Se pierde la actual.')) return;
    setChat([]); setRevision(null); setResumen(''); setSupuestos([]); setVerResumen(false); setTexto('Requerimiento: '); setError(null); guardar(null);
  };

  // ── Resumen ──
  const setComp = (pid: string, cid: string, patch: Partial<ComponenteRevisado>) =>
    setRevision(r => r && r.map(p => (p.id !== pid ? p : { ...p, componentes: p.componentes.map(c => (c.id === cid ? { ...c, ...patch } : c)) })));
  const setPartida = (pid: string, patch: Partial<PartidaRevisada>) => setRevision(r => r && r.map(p => (p.id === pid ? { ...p, ...patch } : p)));
  const resueltas = useMemo(() => (revision ? aResueltas(revision) : []), [revision]);
  // Posición de cada partida entre las que quedan (una partida sin nada incluido no entra).
  const posicion = useMemo(() => {
    let k = 0;
    return Object.fromEntries((revision || []).map(p => [p.id, p.componentes.some(c => c.incluir) ? k++ : -1]));
  }, [revision]);
  const vista = useMemo(() => (resueltas.length ? previsualizar(resueltas) : null), [resueltas, previsualizar]);
  const incluidos = (revision || []).flatMap(p => p.componentes.filter(c => c.incluir));
  const deBiblio = incluidos.filter(c => c.origen === 'biblioteca');
  const nuevos = incluidos.filter(c => c.origen === 'nuevo');
  const costo = (xs: ComponenteRevisado[]) => xs.reduce((s, c) => s + c.costo * c.cantidad, 0);
  const sinCosto = nuevos.filter(c => !c.costo).length;

  const chipCat = (cat: CategoriaItem) => (
    <span style={{ fontSize: '0.66rem', fontWeight: 700, color: CATEGORIA_COLORS[cat], border: `1px solid ${CATEGORIA_COLORS[cat]}55`, padding: '0 0.3rem', borderRadius: 4, whiteSpace: 'nowrap' }}>{CATEGORIA_LABELS[cat]}</span>
  );

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 860, width: 'min(96vw, 860px)', display: 'flex', flexDirection: 'column', height: 'min(88dvh, 820px)' }}>
        <div style={{ padding: '0.9rem 1.2rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', color: 'var(--y)' }}>
            <Sparkles size={15} /> Cotizar con IA {verResumen ? '· resumen antes de agregar' : '· conversación'}
          </span>
          {chat.length > 0 && <button className="btn btn-ghost btn-xs" onClick={reiniciar} title="Empezar otra conversación"><RotateCcw size={12} /> Nueva</button>}
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>

        {!verResumen ? (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {chat.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)' }}>
                    Escribe el requerimiento y te haré las preguntas necesarias para cotizar. Uso los artículos y precios de <b>tu biblioteca</b>; lo que no esté, lo estimo y te lo marco como <b>nuevo</b>. Antes de agregar nada a la cotización verás un resumen.
                  </p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {EJEMPLOS.map(e => <button key={e} className="btn btn-ghost btn-xs" onClick={() => setTexto(e)}>{e}</button>)}
                  </div>
                </div>
              )}
              {chat.map((b, i) => (
                <div key={i} style={{ alignSelf: b.rol === 'usuario' ? 'flex-end' : 'flex-start', maxWidth: '88%', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  {b.rol === 'asistente' && <Bot size={18} color="var(--y)" style={{ flexShrink: 0, marginTop: 6 }} />}
                  <div style={{ background: b.rol === 'usuario' ? 'var(--y-soft)' : 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 12, padding: '0.55rem 0.8rem', fontSize: '0.88rem', color: 'var(--text)', whiteSpace: 'pre-wrap', minWidth: 0, overflowWrap: 'anywhere' }}>
                    {b.texto}
                    {b.preguntas?.length && !(i === chat.length - 1 && preguntasAbiertas) ? (
                      <ol style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', listStyle: 'decimal' }}>{b.preguntas.map((q, j) => <li key={j}>{q.pregunta}</li>)}</ol>
                    ) : null}
                  </div>
                </div>
              ))}
              {cargando && <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--muted)', fontSize: '0.84rem' }}><Loader2 size={15} className="iv-spin" /> Pensando…</div>}

              {preguntasAbiertas && (
                <div style={{ border: '1px solid var(--y-brand)', borderRadius: 12, padding: '0.7rem 0.8rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {preguntasAbiertas.map((q, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text)' }}>{i + 1}. {q.pregunta}</span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {q.opciones.map(o => {
                          const on = respuestas[i] === o && !otras[i];
                          return <button key={o} type="button" onClick={() => { setRespuestas(r => ({ ...r, [i]: on ? '' : o })); setOtras(x => ({ ...x, [i]: '' })); }}
                            style={{ cursor: 'pointer', fontSize: '0.8rem', padding: '0.3rem 0.7rem', borderRadius: 999, border: `1px solid ${on ? 'var(--y-brand)' : 'var(--border2)'}`, background: on ? 'var(--y-soft)' : 'transparent', color: 'var(--text)', fontWeight: on ? 600 : 400 }}>{o}</button>;
                        })}
                        <input className="input" style={{ flex: '1 1 160px', minWidth: 0, fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} placeholder="Otra respuesta…" value={otras[i] || ''}
                          onChange={e => setOtras(x => ({ ...x, [i]: e.target.value }))} />
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={{ flex: 1, fontSize: '0.74rem', color: 'var(--muted)', alignSelf: 'center' }}>Ronda {rondas} de {MAX_RONDAS_PREGUNTAS}. Lo que no respondas, lo asumo y te lo dejo anotado.</span>
                    <button className="btn btn-primary btn-sm" onClick={responder}><Send size={13} /> Responder</button>
                  </div>
                </div>
              )}

              {error && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: 'var(--danger)', padding: '0.55rem 0.75rem', borderRadius: 8, fontSize: '0.8rem' }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span style={{ flex: 1 }}>{error.msg}</span>
                  {chat.length > 0 && <button className="btn btn-ghost btn-xs" onClick={error.reintentar}><RotateCcw size={12} /> Reintentar</button>}
                </div>
              )}
              <div ref={finChat} />
            </div>

            <div style={{ padding: '0.8rem 1.2rem', borderTop: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea className="input" rows={chat.length ? 2 : 3} value={texto} onChange={e => setTexto(e.target.value)} disabled={cargando}
                placeholder={chat.length ? 'Escribe algo más o pide un cambio… (Enter para enviar)' : 'Requerimiento: Instalación de tablero…'}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!chat.length) empezar(); else if (preguntasAbiertas) responder(); else escribir(); } }}
                style={{ resize: 'none' }} autoFocus />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {revision && <button className="btn btn-ghost btn-sm" onClick={() => setVerResumen(true)}><ArrowLeft size={13} /> Volver al resumen</button>}
                <span style={{ flex: 1 }} />
                {!chat.length ? <>
                  <button className="btn btn-ghost btn-sm" disabled={cargando} onClick={() => empezar(true)} title="Sin preguntas: asume lo habitual">Generar directo</button>
                  <button className="btn btn-primary btn-sm" disabled={cargando} onClick={() => empezar()}><Send size={13} /> Empezar</button>
                </> : <>
                  {!preguntasAbiertas && <button className="btn btn-ghost btn-sm" disabled={cargando || !texto.trim()} onClick={() => escribir()}><Send size={13} /> Enviar</button>}
                  <button className="btn btn-primary btn-sm" disabled={cargando} onClick={() => (preguntasAbiertas ? enviar({ rol: 'usuario', texto: [preguntasAbiertas.map((q, i) => `${q.pregunta} → ${(otras[i]?.trim() || respuestas[i] || 'asume lo habitual')}`).join('\n'), texto.trim()].filter(Boolean).join('\n') }, true) : escribir(true))}>
                    <Wand2 size={13} /> {revision ? 'Regenerar propuesta' : 'Generar cotización'}</button>
                </>}
              </div>
            </div>
          </>
        ) : revision && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Totales y origen */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 8 }}>
                <div style={{ border: '1px solid var(--border2)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
                  <span className="label-muted">Así quedaría (neto)</span>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>{vista ? formatMonto(vista.neto, moneda) : '—'}</div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Total con IVA {vista ? formatMonto(vista.total, moneda) : '—'}</span>
                </div>
                <div style={{ border: '1px solid var(--success)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
                  <span className="label-muted" style={{ color: 'var(--success)' }}><Library size={11} /> De tu biblioteca</span>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>{deBiblio.length} ítem{deBiblio.length === 1 ? '' : 's'}</div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Precio real · costo {formatMonto(costo(deBiblio), 'CLP')}</span>
                </div>
                <div style={{ border: '1px solid #d97706', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
                  <span className="label-muted" style={{ color: '#d97706' }}><Sparkles size={11} /> Nuevos (estimó la IA)</span>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>{nuevos.length} ítem{nuevos.length === 1 ? '' : 's'}</div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Costo estimado {formatMonto(costo(nuevos), 'CLP')}{sinCosto ? ` · ${sinCosto} sin costo` : ''}</span>
                </div>
              </div>
              {resumen && <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text)', borderLeft: '3px solid var(--y-brand)', paddingLeft: 10 }}>{resumen}</p>}
              {supuestos.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  <b style={{ color: 'var(--text)' }}>Supuestos de la IA</b> (revisa que sean correctos):
                  <ul style={{ margin: '4px 0 0', paddingLeft: '1.1rem', listStyle: 'disc' }}>{supuestos.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}

              {revision.map(p => (
                <div key={p.id} style={{ border: '1px solid var(--border2)', borderLeft: '3px solid var(--y-brand)', borderRadius: 10, padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input className="input" style={{ flex: '1 1 220px', minWidth: 0, fontWeight: 700 }} value={p.nombre} onChange={e => setPartida(p.id, { nombre: e.target.value })} aria-label="Nombre de la partida" />
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{p.cantidad} {p.unidad}</span>
                    {vista && posicion[p.id] >= 0 && <b style={{ fontSize: '0.86rem', color: 'var(--text)' }}>{formatMonto(vista.porPartida[posicion[p.id]] ?? 0, moneda)}</b>}
                  </div>
                  {p.descripcion && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>{p.descripcion}</p>}
                  {p.componentes.map(c => (
                    <div key={c.id} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 8, alignItems: 'start', opacity: c.incluir ? 1 : 0.45, borderTop: '1px dashed var(--border2)', paddingTop: 6 }}>
                      <input type="checkbox" checked={c.incluir} onChange={e => setComp(p.id, c.id, { incluir: e.target.checked })} aria-label="Incluir" style={{ accentColor: 'var(--y-brand)', width: 17, height: 17, marginTop: 4 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          {c.origen === 'biblioteca'
                            ? <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--success)', border: '1px solid var(--success)', borderRadius: 4, padding: '0 0.3rem' }}>BIBLIOTECA{c.codigo ? ` · ${c.codigo}` : ''}</span>
                            : <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#d97706', border: '1px solid #d97706', borderRadius: 4, padding: '0 0.3rem' }}>NUEVO · ESTIMADO IA</span>}
                          {chipCat(c.categoria)}
                          {c.refInvalida && <span style={{ fontSize: '0.7rem', color: 'var(--danger)' }}>la IA citó un artículo que no existe</span>}
                        </div>
                        {c.origen === 'nuevo'
                          ? <input className="input" style={{ fontSize: '0.84rem', padding: '0.3rem 0.5rem' }} value={c.descripcion} onChange={e => setComp(p.id, c.id, { descripcion: e.target.value })} aria-label="Descripción" />
                          : <span style={{ fontSize: '0.86rem', color: 'var(--text)' }}>{c.descripcion}</span>}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ width: 120 }}><NumeroInput className="input" value={c.cantidad} decimales={2} mostrarCero sufijo={c.unidad} onChange={v => setComp(p.id, c.id, { cantidad: v ?? 0 })} onVacio={() => setComp(p.id, c.id, { cantidad: 0 })} style={{ fontSize: '0.82rem', padding: '0.3rem 0.5rem' }} /></div>
                          {c.origen === 'nuevo'
                            ? <div style={{ width: 150 }}><NumeroInput className="input" value={c.costo} prefijo="$" mostrarCero onChange={v => setComp(p.id, c.id, { costo: v ?? 0 })} onVacio={() => setComp(p.id, c.id, { costo: 0 })} style={{ fontSize: '0.82rem', padding: '0.3rem 0.5rem' }} /></div>
                            : <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>costo {formatMonto(c.costo, 'CLP')} c/u</span>}
                          <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{c.origen === 'nuevo' ? 'costo neto c/u' : ''}</span>
                          {c.nota && <span style={{ fontSize: '0.74rem', color: 'var(--muted)', flex: '1 1 160px' }}>· {c.nota}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-xs" style={{ alignSelf: 'flex-end' }} onClick={() => setRevision(r => r && r.filter(x => x.id !== p.id))}><Trash2 size={11} /> Quitar partida</button>
                </div>
              ))}
              <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>
                El precio de venta lo calcula el cotizador con tus márgenes por categoría. Los nuevos entran «fuera de biblioteca» con el costo estimado: revísalos.
              </p>
            </div>
            <div style={{ padding: '0.8rem 1.2rem', borderTop: '1px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setVerResumen(false)}><ArrowLeft size={13} /> Seguir conversando / pedir cambios</button>
              <span style={{ flex: 1 }} />
              <button className="btn btn-primary" disabled={!resueltas.length} onClick={() => { onInsertar(resueltas, supuestos); guardar(null); }}>
                <PackagePlus size={14} /> Agregar a la cotización</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
