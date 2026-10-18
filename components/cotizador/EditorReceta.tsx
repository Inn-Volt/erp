'use client';

/**
 * Editor de recetas (TecApp): nombre, preguntas (número, elegir un producto, sí o no) y
 * componentes. Cada componente agrega un producto fijo o el elegido en una pregunta, con
 * una cantidad fija, «por cada» respuesta o «uno cada N», y puede ir solo si se cumple una
 * condición o un rango. Cada regla se lee como frase, con un ejemplo, y los avisos no bloquean.
 */

import { useMemo, useState } from 'react';
import { Layers, Loader2, Plus, Save, Search, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { Modal } from './ui';
import type { ArticuloCatalogo, OpcionPregunta, PreguntaReceta, ReglaComponente } from '@/lib/cotizador/tipos';
import { armar, avisosDeReceta, fraseDeRegla, respuestasIniciales, type ComponenteReceta, type RecetaCompleta } from '@/lib/cotizador/recetas';
import { nuevoId, formatMonto } from '@/lib/cotizador/calculo';
import { recetasCotService } from '@/services/cotizador';
import { useToast } from '@/hooks/useToast';
import { fetchConSesion } from '@/lib/fetchConSesion';
import { mejorMatchCatalogo } from '@/utils';
import { CATEGORIA_LABELS, UNIDADES, type CatalogoItem, type RecetaIA } from '@/types';

const TOPES = { preguntas: 20, opciones: 30, componentes: 60 };
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

function BuscarArticulo({ catalogo, onElegir, placeholder }: { catalogo: ArticuloCatalogo[]; onElegir: (a: ArticuloCatalogo) => void; placeholder?: string }) {
  const [t, setT] = useState('');
  const res = useMemo(() => {
    const q = t.trim().toLowerCase();
    if (!q) return [];
    return catalogo.filter(a => a.activo !== false && `${a.codigo || ''} ${a.descripcion} ${a.marca || ''}`.toLowerCase().includes(q)).slice(0, 8);
  }, [t, catalogo]);
  return (
    <div style={{ position: 'relative' }}>
      <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
      <input className="input" value={t} onChange={e => setT(e.target.value)} placeholder={placeholder || 'Buscar en el catálogo…'} style={{ paddingLeft: '1.9rem' }} />
      {res.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, marginTop: 4, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, overflow: 'hidden' }}>
          {res.map(a => (
            <button key={a.id} type="button" onClick={() => { onElegir(a); setT(''); }}
              style={{ display: 'flex', width: '100%', gap: 8, justifyContent: 'space-between', padding: '0.45rem 0.7rem', background: 'none', border: 'none', borderBottom: '1px solid var(--border2)', cursor: 'pointer', color: 'var(--text)', fontSize: '0.84rem', textAlign: 'left' }}>
              <span>{a.descripcion} <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>{CATEGORIA_LABELS[a.categoria]}{a.codigo ? ` · ${a.codigo}` : ''}</span></span>
              <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{a.precio_venta !== null ? formatMonto(a.precio_venta, 'CLP') : 'sin precio'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EditorReceta({ receta, catalogo, onCerrar, onGuardada, onUsarAqui, puedeGuardar = true }: {
  receta: RecetaCompleta | null; catalogo: ArticuloCatalogo[]; onCerrar: () => void;
  /** Recibe el id con que quedó guardada en la biblioteca. */
  onGuardada: (id: string) => void;
  /** Desde el cotizador: usarla solo en esta cotización, sin guardarla en la biblioteca. */
  onUsarAqui?: (r: RecetaCompleta) => void;
  puedeGuardar?: boolean;
}) {
  const { success, error: toastError } = useToast();
  const [r, setR] = useState<RecetaCompleta>(() => receta ? JSON.parse(JSON.stringify(receta)) : { id: '', nombre: '', descripcion: '', unidad: 'un', preguntas: [], componentes: [], activo: true });
  const [guardando, setGuardando] = useState(false);
  const [iaTexto, setIaTexto] = useState('');
  const [iaCargando, setIaCargando] = useState(false);
  const catMap = useMemo(() => new Map(catalogo.map(a => [a.id, a])), [catalogo]);
  const avisos = useMemo(() => avisosDeReceta(r, catMap), [r, catMap]);
  const ejemplo = useMemo(() => armar(r, respuestasIniciales(r), 1, catMap), [r, catMap]);

  const setP = (i: number, patch: Partial<PreguntaReceta>) => setR(x => ({ ...x, preguntas: x.preguntas.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const setC = (i: number, patch: Partial<ComponenteReceta>) => setR(x => ({ ...x, componentes: x.componentes.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const setRegla = (i: number, patch: Partial<ReglaComponente>) => setR(x => ({ ...x, componentes: x.componentes.map((c, j) => (j === i ? { ...c, regla: { ...(c.regla || {}), ...patch } } : c)) }));

  const agregarComponente = (a: ArticuloCatalogo) => {
    if (r.componentes.length >= TOPES.componentes) { toastError(`Hasta ${TOPES.componentes} componentes.`); return; }
    setR(x => ({ ...x, componentes: [...x.componentes, { id: nuevoId(), item_id: a.id, descripcion: a.descripcion, categoria: a.categoria, unidad: a.unidad, costo: a.costo, cantidad: 1, regla: null }] }));
  };

  const generarIA = async () => {
    if (iaTexto.trim().length < 4) return;
    setIaCargando(true);
    try {
      const res = await fetchConSesion('/api/receta-ia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ descripcion: iaTexto.trim() }) });
      const data = await res.json();
      if (!res.ok) { toastError(data?.error || 'No se pudo generar la receta.'); return; }
      const ia = data.receta as RecetaIA;
      const comps: ComponenteReceta[] = ia.componentes.map(c => {
        const m = mejorMatchCatalogo(c.descripcion, c.categoria, catalogo.map(a => ({ ...a, familia: a.familia || undefined })) as unknown as CatalogoItem[]);
        return m ? { id: nuevoId(), item_id: m.id, descripcion: m.descripcion, categoria: m.categoria, unidad: m.unidad, costo: m.costo, cantidad: c.cantidad, regla: null }
          : { id: nuevoId(), item_id: null, descripcion: c.descripcion, categoria: c.categoria, unidad: c.unidad, costo: c.costoEstimado, cantidad: c.cantidad, regla: null };
      });
      setR(x => ({ ...x, nombre: x.nombre || ia.nombre, unidad: ia.unidad || x.unidad, descripcion: x.descripcion || ia.descripcion || '', componentes: [...x.componentes, ...comps] }));
      setIaTexto('');
      success(`IA: ${comps.length} componentes (${comps.filter(c => c.item_id).length} del catálogo)`);
    } catch { toastError('Error de conexión con la IA.'); }
    finally { setIaCargando(false); }
  };

  const valida = () => {
    if (!r.nombre.trim()) { toastError('Ponle nombre a la receta'); return false; }
    if (!r.componentes.length) { toastError('Agrega al menos un componente'); return false; }
    for (const p of r.preguntas) {
      if (!p.texto.trim()) { toastError('Hay una pregunta sin texto'); return false; }
      if (p.tipo === 'producto' && !(p.opciones || []).length) { toastError(`«${p.texto}» no tiene opciones`); return false; }
    }
    for (const c of r.componentes) {
      if (c.regla?.cada !== undefined && c.regla?.cada !== null && !(c.regla.cada > 0)) { toastError('«Cada» tiene que ser más que 0: «1 cada 4 puertas».'); return false; }
    }
    return true;
  };

  const guardar = async () => {
    if (!valida()) return;
    setGuardando(true);
    try { const id = await recetasCotService.guardar(r); success('Receta guardada en la biblioteca'); onGuardada(id); }
    catch (e) { toastError('No se pudo guardar: ' + (e instanceof Error ? e.message : '')); }
    finally { setGuardando(false); }
  };

  const numericas = r.preguntas.filter(p => p.tipo === 'numero');
  const condicionales = r.preguntas.filter(p => p.tipo !== 'numero');
  const elegibles = r.preguntas.filter(p => p.tipo === 'producto');

  return (
    <Modal titulo={<><Layers size={15} /> {receta?.id ? 'Editar receta' : 'Nueva receta'}</>} onCerrar={onCerrar} ancho={980} pie={<>
      <span style={{ marginRight: 'auto', fontSize: '0.8rem', color: 'var(--muted)' }}>
        Con las respuestas por omisión: {ejemplo.lineas.length} línea{ejemplo.lineas.length === 1 ? '' : 's'}{ejemplo.noVan.length ? ` · ${ejemplo.noVan.length} no van` : ''}
      </span>
      <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
      {onUsarAqui && <button className={puedeGuardar ? 'btn btn-ghost' : 'btn btn-primary'} disabled={guardando}
        title="Se agrega a esta cotización y la biblioteca no cambia" onClick={() => { if (valida()) onUsarAqui({ ...r, id: r.id || `aqui-${Date.now()}` }); }}>
        Usar solo en esta cotización</button>}
      {puedeGuardar && <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Save size={14} />} {onUsarAqui ? 'Guardar en la biblioteca y usar' : 'Guardar'}</button>}
    </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
        <label><span className="label-muted">Nombre *</span><input className="input" autoFocus value={r.nombre} onChange={e => setR({ ...r, nombre: e.target.value })} placeholder="Puerta con control de acceso" /></label>
        <label><span className="label-muted">Unidad</span>
          <select className="input" value={r.unidad} onChange={e => setR({ ...r, unidad: e.target.value })}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select></label>
      </div>
      <label><span className="label-muted">Descripción (se ve al elegirla)</span><input className="input" value={r.descripcion || ''} onChange={e => setR({ ...r, descripcion: e.target.value })} /></label>

      <div style={{ background: 'var(--y-soft)', borderRadius: 8, padding: '0.6rem 0.75rem', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Sparkles size={14} color="var(--y)" />
        <input className="input" style={{ flex: 1, minWidth: 200 }} value={iaTexto} onChange={e => setIaTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') generarIA(); }}
          placeholder="Generar componentes con IA: «punto de enchufe embutido en tabique»" />
        <button type="button" className="btn btn-primary btn-sm" onClick={generarIA} disabled={iaCargando}>{iaCargando ? <Loader2 size={13} className="iv-spin" /> : <Wand2 size={13} />} Generar</button>
      </div>

      {/* Preguntas */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span className="section-label" style={{ margin: 0 }}>Preguntas ({r.preguntas.length})</span>
          <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Sin preguntas, la receta es fija y al usarla pregunta «¿Cuántas?».</span>
        </div>
        {r.preguntas.map((p, i) => (
          <div key={p.clave} style={{ border: '1px solid var(--border2)', borderRadius: 8, padding: '0.6rem', marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <select className="input" style={{ width: 170 }} value={p.tipo} onChange={e => setP(i, { tipo: e.target.value as PreguntaReceta['tipo'], defecto: null, opciones: e.target.value === 'producto' ? (p.opciones || []) : undefined })}>
                <option value="numero">Número</option><option value="producto">Elegir un producto</option><option value="sino">Sí o no</option>
              </select>
              <input className="input" style={{ flex: 1, minWidth: 200 }} value={p.texto} onChange={e => setP(i, { texto: e.target.value })}
                placeholder={p.tipo === 'numero' ? '¿Cuántas puertas?' : p.tipo === 'producto' ? '¿Qué lector?' : '¿Lleva botón de salida?'} />
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setR(x => ({ ...x, preguntas: x.preguntas.filter((_, j) => j !== i) }))} aria-label="Quitar pregunta"><Trash2 size={13} /></button>
            </div>
            {p.tipo === 'numero' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
                Mín. <input className="input" style={{ width: 80 }} type="number" value={p.minimo ?? ''} onChange={e => setP(i, { minimo: num(e.target.value) })} />
                Máx. <input className="input" style={{ width: 80 }} type="number" value={p.maximo ?? ''} onChange={e => setP(i, { maximo: num(e.target.value) })} />
                Por omisión <input className="input" style={{ width: 80 }} type="number" value={typeof p.defecto === 'number' ? p.defecto : ''} onChange={e => setP(i, { defecto: num(e.target.value) })} />
                Unidad <input className="input" style={{ width: 90 }} value={p.unidad || ''} onChange={e => setP(i, { unidad: e.target.value })} placeholder="puertas" />
                <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={p.entero !== false} onChange={e => setP(i, { entero: e.target.checked })} style={{ accentColor: 'var(--y-brand)' }} /> Solo enteros</label>
              </div>
            )}
            {p.tipo === 'sino' && (
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
                Por omisión:
                <select className="input" style={{ width: 90 }} value={p.defecto === false ? 'no' : 'si'} onChange={e => setP(i, { defecto: e.target.value === 'si' })}>
                  <option value="si">Sí</option><option value="no">No</option></select>
              </label>
            )}
            {p.tipo === 'producto' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(p.opciones || []).map((o: OpcionPregunta, k) => (
                  <div key={o.item_id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.82rem' }}>
                    <input type="radio" checked={!!o.defecto} onChange={() => setP(i, { opciones: (p.opciones || []).map((x, m) => ({ ...x, defecto: m === k })) })} title="Por omisión" style={{ accentColor: 'var(--y-brand)' }} />
                    <span style={{ flex: 1, color: 'var(--text)' }}>{catMap.get(o.item_id)?.descripcion || 'Ya no está en el catálogo'}</span>
                    <input className="input" style={{ width: 160 }} value={o.etiqueta || ''} placeholder="Etiqueta (opcional)" onChange={e => setP(i, { opciones: (p.opciones || []).map((x, m) => (m === k ? { ...x, etiqueta: e.target.value } : x)) })} />
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setP(i, { opciones: (p.opciones || []).filter((_, m) => m !== k) })}>✕</button>
                  </div>
                ))}
                {(p.opciones || []).length < TOPES.opciones && <BuscarArticulo catalogo={catalogo} placeholder="Agregar una opción del catálogo…"
                  onElegir={a => setP(i, { opciones: [...(p.opciones || []), { item_id: a.id, defecto: !(p.opciones || []).length }] })} />}
              </div>
            )}
          </div>
        ))}
        {r.preguntas.length < TOPES.preguntas && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setR(x => ({ ...x, preguntas: [...x.preguntas, { clave: `p${Date.now().toString(36)}`, tipo: 'numero', texto: '', minimo: 0, maximo: 100, defecto: 1, entero: true }] }))}>
            <Plus size={13} /> Pregunta</button>
        )}
      </div>

      {/* Componentes */}
      <div>
        <span className="section-label" style={{ margin: '0 0 6px', display: 'block' }}>Componentes ({r.componentes.length})</span>
        {r.componentes.map((c, i) => {
          const g = c.regla || {};
          const a = c.item_id ? catMap.get(c.item_id) : null;
          return (
            <div key={c.id} style={{ border: '1px solid var(--border2)', borderRadius: 8, padding: '0.6rem', marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {!g.elegido_en && !c.item_id ? (
                  // Fuera de la biblioteca: se escribe aquí qué es, su tipo, su unidad y su costo.
                  <span style={{ flex: 1, minWidth: 260, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <input className="input" style={{ flex: 1, minWidth: 180 }} value={c.descripcion} placeholder="Qué es: soporte especial, cableado…"
                      aria-label="Descripción del componente" onChange={e => setC(i, { descripcion: e.target.value })} />
                    <select className="input" style={{ width: 130 }} value={c.categoria} aria-label="Tipo" onChange={e => setC(i, { categoria: e.target.value })}>
                      {Object.entries(CATEGORIA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input className="input" style={{ width: 70 }} value={c.unidad} aria-label="Unidad" placeholder="un" onChange={e => setC(i, { unidad: e.target.value })} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.76rem', color: 'var(--muted)' }}>Costo
                      <input className="input" style={{ width: 100 }} type="number" min={0} step="any" value={c.costo || ''} onChange={e => setC(i, { costo: Number(e.target.value) || 0 })} /></label>
                    <span style={{ fontSize: '0.7rem', color: '#d97706' }}>fuera de la biblioteca</span>
                  </span>
                ) : (
                  <span style={{ flex: 1, minWidth: 200, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>
                    {g.elegido_en ? `El producto elegido en «${r.preguntas.find(p => p.clave === g.elegido_en)?.texto || '…'}»` : (a?.descripcion || c.descripcion)}
                  </span>
                )}
                {elegibles.length > 0 && (
                  <select className="input" style={{ width: 230 }} value={g.elegido_en || ''} onChange={e => setRegla(i, { elegido_en: e.target.value || null })}>
                    <option value="">Producto fijo</option>
                    {elegibles.map(p => <option key={p.clave} value={p.clave}>El elegido en «{p.texto || '…'}»</option>)}
                  </select>
                )}
                <button type="button" className="btn btn-ghost btn-xs" disabled={i === 0} onClick={() => setR(x => { const cs = [...x.componentes]; [cs[i - 1], cs[i]] = [cs[i], cs[i - 1]]; return { ...x, componentes: cs }; })}>↑</button>
                <button type="button" className="btn btn-ghost btn-xs" disabled={i === r.componentes.length - 1} onClick={() => setR(x => { const cs = [...x.componentes]; [cs[i + 1], cs[i]] = [cs[i], cs[i + 1]]; return { ...x, componentes: cs }; })}>↓</button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setR(x => ({ ...x, componentes: x.componentes.filter((_, j) => j !== i) }))} aria-label="Quitar"><Trash2 size={13} /></button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
                Fija <input className="input" style={{ width: 80 }} type="number" step="any" min={0} value={c.cantidad} onChange={e => setC(i, { cantidad: Number(e.target.value) || 0 })} />
                {numericas.length > 0 && <>
                  + <input className="input" style={{ width: 70 }} type="number" step="any" min={0} value={g.por_pregunta ? (g.por_cada ?? 1) : ''} disabled={!g.por_pregunta}
                    onChange={e => setRegla(i, { por_cada: num(e.target.value) })} />
                  <select className="input" style={{ width: 90 }} value={g.cada ? 'cada' : 'por'} disabled={!g.por_pregunta} onChange={e => setRegla(i, { cada: e.target.value === 'cada' ? (g.cada || 4) : null })}>
                    <option value="por">por cada</option><option value="cada">cada</option>
                  </select>
                  {g.cada ? <input className="input" style={{ width: 60 }} type="number" min={1} value={g.cada} onChange={e => setRegla(i, { cada: num(e.target.value) })} /> : null}
                  <select className="input" style={{ width: 200 }} value={g.por_pregunta || ''} onChange={e => setRegla(i, { por_pregunta: e.target.value || null, por_cada: g.por_cada ?? 1 })}>
                    <option value="">(ninguna pregunta)</option>
                    {numericas.map(p => <option key={p.clave} value={p.clave}>{p.texto || '…'}</option>)}
                  </select>
                </>}
              </div>
              {(condicionales.length > 0 || numericas.length > 0) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
                  {condicionales.length > 0 && <>
                    Solo si
                    <select className="input" style={{ width: 200 }} value={g.si_pregunta || ''} onChange={e => setRegla(i, { si_pregunta: e.target.value || null, si_es: true, si_opcion: null })}>
                      <option value="">(siempre)</option>
                      {condicionales.map(p => <option key={p.clave} value={p.clave}>{p.texto || '…'}</option>)}
                    </select>
                    {g.si_pregunta && r.preguntas.find(p => p.clave === g.si_pregunta)?.tipo === 'sino' && (
                      <select className="input" style={{ width: 80 }} value={g.si_es === false ? 'no' : 'si'} onChange={e => setRegla(i, { si_es: e.target.value === 'si' })}><option value="si">es Sí</option><option value="no">es No</option></select>
                    )}
                    {g.si_pregunta && r.preguntas.find(p => p.clave === g.si_pregunta)?.tipo === 'producto' && (
                      <select className="input" style={{ width: 200 }} value={g.si_opcion || ''} onChange={e => setRegla(i, { si_opcion: e.target.value || null })}>
                        <option value="">Elige la opción…</option>
                        {(r.preguntas.find(p => p.clave === g.si_pregunta)?.opciones || []).map(o => <option key={o.item_id} value={o.item_id}>{o.etiqueta || catMap.get(o.item_id)?.descripcion}</option>)}
                      </select>
                    )}
                  </>}
                  {numericas.length > 0 && <>
                    · rango
                    <select className="input" style={{ width: 180 }} value={g.rango_pregunta || ''} onChange={e => setRegla(i, { rango_pregunta: e.target.value || null })}>
                      <option value="">(sin rango)</option>
                      {numericas.map(p => <option key={p.clave} value={p.clave}>{p.texto || '…'}</option>)}
                    </select>
                    {g.rango_pregunta && <>
                      desde <input className="input" style={{ width: 64 }} type="number" value={g.desde ?? ''} onChange={e => setRegla(i, { desde: num(e.target.value) })} />
                      hasta <input className="input" style={{ width: 64 }} type="number" value={g.hasta ?? ''} onChange={e => setRegla(i, { hasta: num(e.target.value) })} />
                    </>}
                  </>}
                </div>
              )}
              <span style={{ fontSize: '0.74rem', color: 'var(--y)' }}>{fraseDeRegla(c, r.preguntas)}</span>
            </div>
          );
        })}
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}><BuscarArticulo catalogo={catalogo} onElegir={agregarComponente} placeholder="Agregar un componente del catálogo…" /></div>
          <button type="button" className="btn btn-ghost" title="Un componente que no está en la biblioteca"
            onClick={() => {
              if (r.componentes.length >= TOPES.componentes) { toastError(`Hasta ${TOPES.componentes} componentes.`); return; }
              setR(x => ({ ...x, componentes: [...x.componentes, { id: nuevoId(), item_id: null, descripcion: '', categoria: 'material', unidad: 'un', costo: 0, cantidad: 1, regla: null }] }));
            }}><Plus size={14} /> Nuevo</button>
        </div>
      </div>

      {avisos.length > 0 && (
        <div style={{ border: '1px solid #d97706', borderRadius: 8, padding: '0.5rem 0.75rem', background: 'rgba(217,119,6,.07)' }}>
          {avisos.map((a, i) => <p key={i} style={{ margin: 0, fontSize: '0.8rem', color: '#d97706' }}>• {a}</p>)}
        </div>
      )}
      {ejemplo.lineas.length > 0 && (
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          <b style={{ color: 'var(--text)' }}>Ejemplo con las respuestas por omisión:</b>{' '}
          {ejemplo.lineas.map(l => `${l.cantidad.toLocaleString('es-CL')} ${l.articulo?.unidad || l.componente.unidad} ${l.articulo?.descripcion || l.componente.descripcion}`).join(' · ')}
        </div>
      )}
    </Modal>
  );
}
