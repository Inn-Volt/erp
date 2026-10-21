'use client';

/**
 * Cotizar con IA, conversando (para cualquier servicio de InnVolt).
 *   1. El vendedor escribe el requerimiento; la IA pregunta lo que mueve el precio (opciones de
 *      un toque) y propone un plan de partidas.
 *   2. Cada partida se arma por separado con la biblioteca: productos y recetas (las recetas se
 *      arman con el motor de recetas). Se ve el avance y una partida que falle se reintenta.
 *   3. Resumen antes de agregar: total como quedaría la cotización, qué sale de la biblioteca
 *      (precio real o receta) y qué es nuevo (estimado por la IA); todo se puede corregir.
 * La conversación se guarda en este navegador: si se cierra sin querer, se retoma.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Bot, BookOpen, CheckCircle2, Library, Loader2, PackagePlus, RotateCcw, Send, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { fetchConSesion } from '@/lib/fetchConSesion';
import { formatMonto } from '@/lib/cotizador/calculo';
import type { ArticuloCatalogo } from '@/lib/cotizador/tipos';
import type { RecetaCompleta } from '@/lib/cotizador/recetas';
import {
  MAX_RONDAS_PREGUNTAS, partidasDelPlan, preseleccionar, revisarComponentes,
  type ComponenteIA, type ComponenteRevisado, type MensajeIA, type PartidaRevisada, type PreguntaIA, type TurnoIA,
} from '@/lib/cotizador/iaConversacion';
import { CATEGORIA_COLORS, CATEGORIA_LABELS, type CategoriaItem, type Moneda, type PartidaIAResuelta } from '@/types';

export interface VistaPrevia { neto: number; iva: number; total: number; porPartida: number[] }
interface Burbuja { rol: 'usuario' | 'asistente'; texto: string; preguntas?: PreguntaIA[] }
interface Guardado { chat: Burbuja[]; partidas: PartidaRevisada[] | null; resumen: string; supuestos: string[] }

const CLAVE = 'innvolt.cotizarIA.conversa.v2';
const EJEMPLOS = [
  'Requerimiento: Instalación de tablero',
  'Requerimiento: habilitación eléctrica de un local comercial',
  'Requerimiento: 8 cámaras CCTV para una bodega',
  'Requerimiento: 20 puntos de red cat 6 en oficina',
  'Requerimiento: cargador para auto eléctrico en una casa',
  'Requerimiento: sistema fotovoltaico para una casa',
  'Requerimiento: control de acceso para 3 puertas',
  'Requerimiento: iluminación LED con cinta y perfiles',
];
const leer = (clave: string): Guardado | null => {
  try {
    const r = localStorage.getItem(`${CLAVE}.${clave}`);
    if (!r) return null;
    const g = JSON.parse(r) as Guardado;
    // Lo que quedó a medio armar se vuelve a armar.
    return { ...g, partidas: g.partidas?.map(p => (p.estado === 'armando' ? { ...p, estado: 'pendiente' as const } : p)) || null };
  } catch { return null; }
};
const guardar = (clave: string, g: Guardado | null) => { try { if (g) localStorage.setItem(`${CLAVE}.${clave}`, JSON.stringify(g)); else localStorage.removeItem(`${CLAVE}.${clave}`); } catch { /* sin almacenamiento */ } };

/** Lo que le decimos a la IA que preguntó (para que no repita). */
const textoDe = (b: Burbuja) => [b.texto, ...(b.preguntas || []).map((q, i) => `${i + 1}) ${q.pregunta}${q.opciones.length ? ` (opciones: ${q.opciones.join(' / ')})` : ''}`)].filter(Boolean).join('\n');

export function aResueltas(ps: PartidaRevisada[]): PartidaIAResuelta[] {
  return ps.filter(p => p.estado === 'lista').map(p => ({
    nombre: p.nombre, descripcion: p.descripcion, cantidad: p.cantidad, unidad: p.unidad,
    componentes: p.componentes.filter(c => c.incluir).map(c => ({
      descripcion: c.descripcion, categoria: c.categoria, unidad: c.unidad, cantidad: c.cantidad, costo: c.costo,
      codigo: c.codigo || undefined, matched: c.origen === 'biblioteca' && !!c.itemId, itemId: c.itemId,
    })),
  })).filter(p => p.componentes.length);
}

export default function CotizarIAConversa({ moneda, catalogo, recetas, previsualizar, onInsertar, onClose, contexto = '', guardarComo = 'nueva' }: {
  moneda: Moneda; catalogo: ArticuloCatalogo[]; recetas: RecetaCompleta[];
  previsualizar: (p: PartidaIAResuelta[]) => VistaPrevia;
  onInsertar: (p: PartidaIAResuelta[], supuestos: string[]) => void; onClose: () => void;
  /** Lo que ya tiene la cotización (visita, solicitud…), para partir de ahí. */
  contexto?: string;
  /** La conversación se guarda por cotización (su id, o «nueva»). */
  guardarComo?: string;
}) {
  const previo = useRef<Guardado | null>(leer(guardarComo));
  const [chat, setChat] = useState<Burbuja[]>(previo.current?.chat || []);
  const [partidas, setPartidas] = useState<PartidaRevisada[] | null>(previo.current?.partidas || null);
  const [resumen, setResumen] = useState(previo.current?.resumen || '');
  const [supuestos, setSupuestos] = useState<string[]>(previo.current?.supuestos || []);
  const [verResumen, setVerResumen] = useState(!!previo.current?.partidas);
  const [texto, setTexto] = useState(previo.current ? '' : 'Requerimiento: ');
  const [respuestas, setRespuestas] = useState<Record<number, string>>({});
  const [otras, setOtras] = useState<Record<number, string>>({});
  const [cargando, setCargando] = useState(false);
  const [armando, setArmando] = useState(false);
  const [error, setError] = useState<{ msg: string; reintentar?: () => void } | null>(null);
  const finChat = useRef<HTMLDivElement>(null);
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  useEffect(() => { guardar(guardarComo, chat.length ? { chat, partidas, resumen, supuestos } : null); }, [guardarComo, chat, partidas, resumen, supuestos]);
  useEffect(() => { finChat.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [chat, cargando]);

  const catMap = useMemo(() => new Map(catalogo.map(a => [a.id, a])), [catalogo]);
  const nombreDeItem = useCallback((id: string) => catMap.get(id)?.descripcion || '', [catMap]);
  const nombresRecetas = useMemo(() => recetas.filter(r => r.activo !== false).map(r => r.nombre), [recetas]);

  const rondas = chat.filter(b => b.rol === 'asistente' && b.preguntas?.length).length;
  const ultima = chat[chat.length - 1];
  const preguntasAbiertas = !cargando && ultima?.rol === 'asistente' && ultima.preguntas?.length ? ultima.preguntas : null;

  const post = async (body: object) => {
    const res = await fetchConSesion('/api/cotizar-ia/conversar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || 'No se pudo hablar con la IA.');
    return data;
  };

  // ── Armar las partidas, una tras otra (en paralelo agotarían el cupo de la IA) ──
  const contextoDe = useCallback((c: Burbuja[], res: string, sup: string[]) =>
    [c.map(b => `${b.rol === 'usuario' ? 'Vendedor' : 'IA'}: ${textoDe(b)}`).join('\n'), res && `Resumen: ${res}`, sup.length ? `Supuestos: ${sup.join('; ')}` : '']
      .filter(Boolean).join('\n'), []);
  const setP = (id: string, patch: Partial<PartidaRevisada>) => setPartidas(ps => ps && ps.map(p => (p.id === id ? { ...p, ...patch } : p)));

  async function armarUna(p: PartidaRevisada, ctx: string) {
    setP(p.id, { estado: 'armando', error: undefined });
    const { productos, recetas: recs, porRef } = preseleccionar(`${p.nombre} ${p.descripcion} ${p.alcance}`, catalogo, recetas, nombreDeItem);
    let ultimo = '';
    for (let intento = 0; intento < 2; intento++) {
      try {
        if (intento) await new Promise(r => setTimeout(r, 1500));
        const data = await post({ modo: 'partida', contexto: ctx, partida: { nombre: p.nombre, descripcion: p.descripcion, cantidad: p.cantidad, unidad: p.unidad, alcance: p.alcance }, productos, recetas: recs });
        if (!vivo.current) return;
        const { componentes, avisos } = revisarComponentes(data.componentes as ComponenteIA[], porRef, catMap);
        setP(p.id, { estado: 'lista', componentes, avisos });
        return;
      } catch (e) { ultimo = e instanceof Error ? e.message : 'Error de conexión'; }
    }
    if (vivo.current) setP(p.id, { estado: 'error', error: ultimo });
  }
  async function armarTodas(ps: PartidaRevisada[], ctx: string) {
    setArmando(true);
    for (const p of ps) {
      if (!vivo.current) return;
      if (p.estado !== 'lista') await armarUna(p, ctx);
    }
    if (vivo.current) setArmando(false);
  }
  const rearmar = (p: PartidaRevisada) => { setArmando(true); armarUna(p, ctxActual()).finally(() => { if (vivo.current) setArmando(false); }); };

  // ── Conversar ──
  async function conversar(nuevo: Burbuja | null, generarYa = false) {
    const conversacion = nuevo ? [...chat, nuevo] : chat;
    if (nuevo) setChat(conversacion);
    setCargando(true); setError(null); setRespuestas({}); setOtras({});
    try {
      const data = await post({ modo: 'conversar', mensajes: conversacion.map(b => ({ rol: b.rol, texto: textoDe(b) }) as MensajeIA), generarYa, recetas: nombresRecetas });
      if (!vivo.current) return;
      const t = data.turno as TurnoIA;
      if (t.tipo === 'plan' && t.plan) {
        const conRespuesta = [...conversacion, { rol: 'asistente' as const, texto: t.mensaje || 'Listo, armé el plan. Ahora armo cada partida con tu biblioteca.' }];
        setChat(conRespuesta);
        const ps = partidasDelPlan(t.plan);
        setPartidas(ps); setResumen(t.plan.resumen); setSupuestos(t.plan.supuestos); setVerResumen(true);
        setCargando(false);
        await armarTodas(ps, contextoDe(conRespuesta, t.plan.resumen, t.plan.supuestos));
        return;
      }
      setChat(c => [...c, { rol: 'asistente', texto: t.mensaje, preguntas: t.preguntas }]);
    } catch (e) {
      if (vivo.current) setError({ msg: e instanceof Error ? e.message : 'Error de conexión', reintentar: () => conversar(null, generarYa) });
    } finally { if (vivo.current) setCargando(false); }
  }

  const empezar = (generarYa = false) => {
    const t = texto.trim();
    if (t.replace(/^requerimiento:\s*/i, '').length < 4) { setError({ msg: 'Escribe el requerimiento (ej. «Requerimiento: Instalación de tablero»).' }); return; }
    setTexto('');
    conversar({ rol: 'usuario', texto: t }, generarYa);
  };
  const responder = (generarYa = false) => {
    if (!preguntasAbiertas) return;
    const extra = texto.trim();
    setTexto('');
    const lineas = preguntasAbiertas.map((q, i) => `${q.pregunta} → ${(otras[i]?.trim() || respuestas[i] || '(no sé: asume lo habitual)')}`);
    conversar({ rol: 'usuario', texto: [...lineas, extra].filter(Boolean).join('\n') }, generarYa);
  };
  const escribir = (generarYa = false) => {
    const t = texto.trim();
    if (!t && !generarYa) return;
    setTexto('');
    conversar(t ? { rol: 'usuario', texto: t } : null, generarYa);
  };
  const reiniciar = () => {
    if (chat.length && !confirm('¿Empezar una conversación nueva? Se pierde la actual.')) return;
    setChat([]); setPartidas(null); setResumen(''); setSupuestos([]); setVerResumen(false); setTexto('Requerimiento: '); setError(null); guardar(guardarComo, null);
  };

  // ── Resumen ──
  const setComp = (pid: string, cid: string, patch: Partial<ComponenteRevisado>) =>
    setPartidas(ps => ps && ps.map(p => (p.id !== pid ? p : { ...p, componentes: p.componentes.map(c => (c.id === cid ? { ...c, ...patch } : c)) })));
  const resueltas = useMemo(() => (partidas ? aResueltas(partidas) : []), [partidas]);
  const posicion = useMemo(() => {
    let k = 0;
    return Object.fromEntries((partidas || []).map(p => [p.id, p.estado === 'lista' && p.componentes.some(c => c.incluir) ? k++ : -1]));
  }, [partidas]);
  const vista = useMemo(() => (resueltas.length ? previsualizar(resueltas) : null), [resueltas, previsualizar]);
  const incluidos = (partidas || []).filter(p => p.estado === 'lista').flatMap(p => p.componentes.filter(c => c.incluir));
  const deBiblio = incluidos.filter(c => c.origen === 'biblioteca');
  const deRecetas = deBiblio.filter(c => c.receta);
  const nuevos = incluidos.filter(c => c.origen === 'nuevo');
  const costo = (xs: ComponenteRevisado[]) => xs.reduce((s, c) => s + c.costo * c.cantidad, 0);
  const sinCosto = nuevos.filter(c => !c.costo).length;
  const conError = (partidas || []).filter(p => p.estado === 'error');
  const faltan = (partidas || []).filter(p => p.estado === 'pendiente' || p.estado === 'armando');
  const listas = (partidas || []).filter(p => p.estado === 'lista' || p.estado === 'error').length;
  const ctxActual = () => contextoDe(chat, resumen, supuestos);

  const chipCat = (cat: CategoriaItem) => (
    <span style={{ fontSize: '0.66rem', fontWeight: 700, color: CATEGORIA_COLORS[cat], border: `1px solid ${CATEGORIA_COLORS[cat]}55`, padding: '0 0.3rem', borderRadius: 4, whiteSpace: 'nowrap' }}>{CATEGORIA_LABELS[cat]}</span>
  );
  const etiqueta = (c: ComponenteRevisado) => (c.origen === 'nuevo'
    ? <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#d97706', border: '1px solid #d97706', borderRadius: 4, padding: '0 0.3rem' }}>NUEVO · ESTIMADO IA</span>
    : c.receta
      ? <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--info)', border: '1px solid var(--info)', borderRadius: 4, padding: '0 0.3rem' }}>RECETA · {c.receta}</span>
      : <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--success)', border: '1px solid var(--success)', borderRadius: 4, padding: '0 0.3rem' }}>BIBLIOTECA{c.codigo ? ` · ${c.codigo}` : ''}</span>);

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 880, width: 'min(96vw, 880px)', display: 'flex', flexDirection: 'column', height: 'min(88dvh, 840px)' }}>
        <div style={{ padding: '0.9rem 1.2rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', color: 'var(--y)' }}>
            <Sparkles size={15} /> Cotizar con IA {verResumen ? '· resumen antes de agregar' : '· conversación'}
          </span>
          {chat.length > 0 && <button className="btn btn-ghost btn-xs" onClick={reiniciar} disabled={cargando || armando} title="Empezar otra conversación"><RotateCcw size={12} /> Nueva</button>}
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>

        {!verResumen ? (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {chat.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)' }}>
                    Escribe el requerimiento —de cualquier servicio: electricidad, iluminación, CCTV, redes, control de acceso, domótica, cargadores, fotovoltaico, mantención…— y te haré las preguntas necesarias para cotizar. Uso los productos y recetas de <b>tu biblioteca</b>; lo que no esté, lo estimo y te lo marco como <b>nuevo</b>. Antes de agregar nada verás un resumen.
                  </p>
                  {contexto.trim() && (
                    <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', borderColor: 'var(--y-brand)' }} onClick={() => setTexto(`Requerimiento: ${contexto.trim()}`)}>
                      <BookOpen size={13} /> Partir con lo que ya tiene esta cotización (visita / solicitud)</button>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {EJEMPLOS.map(e => <button key={e} className="btn btn-ghost btn-xs" onClick={() => setTexto(e)}>{e.replace('Requerimiento: ', '')}</button>)}
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
                    <span style={{ flex: 1, fontSize: '0.74rem', color: 'var(--muted)', alignSelf: 'center', minWidth: 160 }}>Ronda {rondas} de {MAX_RONDAS_PREGUNTAS}. Lo que no respondas, lo asumo y te lo dejo anotado.</span>
                    <button className="btn btn-primary btn-sm" onClick={() => responder()}><Send size={13} /> Responder</button>
                  </div>
                </div>
              )}

              {error && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: 'var(--danger)', padding: '0.55rem 0.75rem', borderRadius: 8, fontSize: '0.8rem' }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span style={{ flex: 1 }}>{error.msg}</span>
                  {error.reintentar && <button className="btn btn-ghost btn-xs" onClick={error.reintentar}><RotateCcw size={12} /> Reintentar</button>}
                </div>
              )}
              <div ref={finChat} />
            </div>

            <div style={{ padding: '0.8rem 1.2rem', borderTop: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea className="input" rows={chat.length ? 2 : 3} value={texto} onChange={e => setTexto(e.target.value)} disabled={cargando || armando}
                placeholder={chat.length ? 'Escribe algo más o pide un cambio… (Enter para enviar)' : 'Requerimiento: Instalación de tablero…'}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!chat.length) empezar(); else if (preguntasAbiertas) responder(); else escribir(); } }}
                style={{ resize: 'none' }} autoFocus />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {partidas && <button className="btn btn-ghost btn-sm" onClick={() => setVerResumen(true)}><ArrowLeft size={13} /> Volver al resumen</button>}
                <span style={{ flex: 1 }} />
                {!chat.length ? <>
                  <button className="btn btn-ghost btn-sm" disabled={cargando} onClick={() => empezar(true)} title="Sin preguntas: asume lo habitual">Generar directo</button>
                  <button className="btn btn-primary btn-sm" disabled={cargando} onClick={() => empezar()}><Send size={13} /> Empezar</button>
                </> : <>
                  {!preguntasAbiertas && <button className="btn btn-ghost btn-sm" disabled={cargando || armando || !texto.trim()} onClick={() => escribir()}><Send size={13} /> Enviar</button>}
                  <button className="btn btn-primary btn-sm" disabled={cargando || armando} onClick={() => (preguntasAbiertas ? responder(true) : escribir(true))}>
                    <Wand2 size={13} /> {partidas ? 'Rehacer la cotización' : 'Generar cotización'}</button>
                </>}
              </div>
            </div>
          </>
        ) : partidas && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 8 }}>
                <div style={{ border: '1px solid var(--border2)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
                  <span className="label-muted">Así quedaría (neto)</span>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>{vista ? formatMonto(vista.neto, moneda) : '—'}</div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Total con IVA {vista ? formatMonto(vista.total, moneda) : '—'}</span>
                </div>
                <div style={{ border: '1px solid var(--success)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
                  <span className="label-muted" style={{ color: 'var(--success)' }}><Library size={11} /> De tu biblioteca</span>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>{deBiblio.length} ítem{deBiblio.length === 1 ? '' : 's'}</div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{deRecetas.length ? `${deRecetas.length} de recetas · ` : ''}costo {formatMonto(costo(deBiblio), 'CLP')}</span>
                </div>
                <div style={{ border: '1px solid #d97706', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
                  <span className="label-muted" style={{ color: '#d97706' }}><Sparkles size={11} /> Nuevos (estimó la IA)</span>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>{nuevos.length} ítem{nuevos.length === 1 ? '' : 's'}</div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Costo estimado {formatMonto(costo(nuevos), 'CLP')}{sinCosto ? ` · ${sinCosto} sin costo` : ''}</span>
                </div>
              </div>
              {armando && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.84rem', color: 'var(--text)', background: 'var(--bg3)', borderRadius: 8, padding: '0.5rem 0.7rem' }}>
                  <Loader2 size={14} className="iv-spin" /> Armando las partidas con tu biblioteca… ({listas} de {partidas.length} listas)</div>
              )}
              {!armando && faltan.length > 0 && (
                <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => armarTodas(partidas, ctxActual())}><Wand2 size={13} /> Armar lo que falta ({faltan.length})</button>
              )}
              {resumen && <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text)', borderLeft: '3px solid var(--y-brand)', paddingLeft: 10 }}>{resumen}</p>}
              {supuestos.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  <b style={{ color: 'var(--text)' }}>Supuestos de la IA</b> (revisa que sean correctos):
                  <ul style={{ margin: '4px 0 0', paddingLeft: '1.1rem', listStyle: 'disc' }}>{supuestos.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}

              {partidas.map(p => (
                <div key={p.id} style={{ border: '1px solid var(--border2)', borderLeft: `3px solid ${p.estado === 'error' ? 'var(--danger)' : 'var(--y-brand)'}`, borderRadius: 10, padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 6, opacity: p.estado === 'pendiente' ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input className="input" style={{ flex: '1 1 220px', minWidth: 0, fontWeight: 700 }} value={p.nombre} onChange={e => setP(p.id, { nombre: e.target.value })} aria-label="Nombre de la partida" />
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{p.cantidad} {p.unidad}</span>
                    {vista && posicion[p.id] >= 0 && <b style={{ fontSize: '0.86rem', color: 'var(--text)' }}>{formatMonto(vista.porPartida[posicion[p.id]] ?? 0, moneda)}</b>}
                    {p.estado === 'armando' && <span style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'flex', gap: 5, alignItems: 'center' }}><Loader2 size={13} className="iv-spin" /> armando…</span>}
                    {p.estado === 'pendiente' && <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>en espera</span>}
                    {p.estado === 'lista' && <CheckCircle2 size={15} color="var(--success)" />}
                  </div>
                  {p.descripcion && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>{p.descripcion}</p>}
                  {p.estado === 'error' && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.8rem', color: 'var(--danger)', flexWrap: 'wrap' }}>
                      <AlertTriangle size={14} /> <span style={{ flex: 1 }}>No se pudo armar: {p.error}</span>
                      <button className="btn btn-ghost btn-xs" disabled={armando} onClick={() => rearmar(p)}><RotateCcw size={12} /> Reintentar</button>
                    </div>
                  )}
                  {p.componentes.map(c => (
                    <div key={c.id} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 8, alignItems: 'start', opacity: c.incluir ? 1 : 0.45, borderTop: '1px dashed var(--border2)', paddingTop: 6 }}>
                      <input type="checkbox" checked={c.incluir} onChange={e => setComp(p.id, c.id, { incluir: e.target.checked })} aria-label="Incluir" style={{ accentColor: 'var(--y-brand)', width: 17, height: 17, marginTop: 4 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          {etiqueta(c)} {chipCat(c.categoria)}
                          {c.refInvalida && <span style={{ fontSize: '0.7rem', color: 'var(--danger)' }}>la IA citó un artículo que no existe</span>}
                        </div>
                        {c.origen === 'nuevo'
                          ? <input className="input" style={{ fontSize: '0.84rem', padding: '0.3rem 0.5rem' }} value={c.descripcion} onChange={e => setComp(p.id, c.id, { descripcion: e.target.value })} aria-label="Descripción" />
                          : <span style={{ fontSize: '0.86rem', color: 'var(--text)' }}>{c.descripcion}</span>}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ width: 120 }}><NumeroInput className="input" value={c.cantidad} decimales={2} mostrarCero sufijo={c.unidad} onChange={v => setComp(p.id, c.id, { cantidad: v ?? 0 })} onVacio={() => setComp(p.id, c.id, { cantidad: 0 })} style={{ fontSize: '0.82rem', padding: '0.3rem 0.5rem' }} /></div>
                          {c.origen === 'nuevo'
                            ? <><div style={{ width: 150 }}><NumeroInput className="input" value={c.costo} prefijo="$" mostrarCero onChange={v => setComp(p.id, c.id, { costo: v ?? 0 })} onVacio={() => setComp(p.id, c.id, { costo: 0 })} style={{ fontSize: '0.82rem', padding: '0.3rem 0.5rem' }} /></div>
                              <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>costo neto c/u</span></>
                            : <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>costo {formatMonto(c.costo, 'CLP')} c/u</span>}
                          {c.nota && <span style={{ fontSize: '0.74rem', color: 'var(--muted)', flex: '1 1 160px' }}>· {c.nota}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {p.avisos.length > 0 && (
                    <details style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                      <summary style={{ cursor: 'pointer' }}>Lo que las recetas no agregaron ({p.avisos.length})</summary>
                      <ul style={{ margin: '4px 0 0', paddingLeft: '1.1rem', listStyle: 'disc' }}>{p.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
                    </details>
                  )}
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    {p.estado === 'lista' && <button className="btn btn-ghost btn-xs" disabled={armando} onClick={() => rearmar(p)} title="Volver a armar esta partida"><RotateCcw size={11} /> Rehacer</button>}
                    <button className="btn btn-ghost btn-xs" disabled={p.estado === 'armando'} onClick={() => setPartidas(ps => ps && ps.filter(x => x.id !== p.id))}><Trash2 size={11} /> Quitar partida</button>
                  </div>
                </div>
              ))}
              {conError.length > 0 && !armando && (
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--danger)' }}>
                  {conError.length === 1 ? 'Una partida quedó sin armar: reinténtala o quítala (si agregas así, no entra).' : `${conError.length} partidas quedaron sin armar: reinténtalas o quítalas (si agregas así, no entran).`}</p>
              )}
              <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>
                El precio de venta lo calcula el cotizador con tus márgenes por categoría. Lo nuevo entra «fuera de biblioteca» con el costo estimado: revísalo.
              </p>
            </div>
            <div style={{ padding: '0.8rem 1.2rem', borderTop: '1px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-ghost btn-sm" disabled={armando} onClick={() => setVerResumen(false)}><ArrowLeft size={13} /> Seguir conversando / pedir cambios</button>
              <span style={{ flex: 1 }} />
              <button className="btn btn-primary" disabled={!resueltas.length || armando} onClick={() => { onInsertar(resueltas, supuestos); guardar(guardarComo, null); }}>
                <PackagePlus size={14} /> Agregar a la cotización</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
