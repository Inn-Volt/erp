'use client';

/**
 * Llena un informe a partir de su planilla (como en TecApp): secciones, texto, párrafo, número
 * con unidad, fecha, hora, sí/no (y sí/no/no aplica/no verificado), una o varias opciones,
 * fotos, archivos, firma y listas (filas con sus columnas, que pueden llevar foto). Las
 * preguntas condicionales se muestran solo si se cumple su condición.
 * Fase 11: respuestas alternativas («No medido», «No identificado»: nunca hay que inventar un
 * dato), aviso de valores fuera de rango, y aviso cuando una respuesta marca un riesgo.
 *   · `seccion`: muestra solo ese paso (el formulario por pasos); sin él, todo seguido.
 *   · `carpetaFotos`: dónde se suben fotos, archivos y firmas (sin ella, no se pueden subir).
 *   · `grande`: campos de 16 px para el celular en terreno.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Camera, FileText, Loader2, Paperclip, Plus, Trash2, X } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import TextoFormato from '@/components/TextoFormato';
import FirmaPad from '@/components/FirmaPad';
import { supabase } from '@/lib/supabase';
import { BUCKET_FOTOS, fotosService } from '@/services/fotos';
import { dataUriABlob } from '@/services/operacion';
import {
  filaLegible, fueraDeRango, NATURALEZAS, pathsDe, seccionesDe, SI_NO_NA, tipoDe, vacio, valorLegible,
  type CampoInforme, type FilaLista, type FotoInforme, type InformeLleno, type ValorCampo,
} from '@/services/informes';

interface Props {
  informe: InformeLleno; onCambiar: (i: InformeLleno) => void; editable?: boolean; grande?: boolean;
  seccion?: number; carpetaFotos?: string; sinChecklist?: boolean; marcarFaltantes?: boolean;
}
type Valor = ValorCampo | FotoInforme[] | undefined;

const chip = (on: boolean, grande: boolean, color = 'var(--y-brand)'): React.CSSProperties => ({
  cursor: 'pointer', fontSize: grande ? 15 : '0.82rem', padding: grande ? '0.5rem 0.8rem' : '0.35rem 0.7rem', borderRadius: 999,
  border: `1px solid ${on ? color : 'var(--border2)'}`, background: on ? 'var(--y-soft)' : 'transparent',
  color: 'var(--text)', fontWeight: on ? 600 : 400, maxWidth: '100%', textAlign: 'left',
});
const esAlerta = (c: CampoInforme, v: Valor) =>
  !!c.alerta?.length && (Array.isArray(v) ? v.some(x => typeof x === 'string' && c.alerta!.includes(x)) : typeof v === 'string' && c.alerta.includes(v));

export default function FormularioInforme({ informe, onCambiar, editable = true, grande = false, seccion, carpetaFotos, sinChecklist, marcarFaltantes }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const paths = pathsDe(informe).join('|');
  useEffect(() => {
    const faltan = paths.split('|').filter(p => p && !urls[p]);
    if (faltan.length) fotosService.urls(faltan).then(u => setUrls(x => ({ ...x, ...u }))).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths]);

  const responder = (clave: string, v: ValorCampo) => onCambiar({ ...informe, respuestas: { ...informe.respuestas, [clave]: v } });
  const secciones = seccionesDe(informe);
  const visibles = seccion === undefined ? secciones : secciones.slice(seccion, seccion + 1);
  const tam: React.CSSProperties = grande ? { fontSize: 16, padding: '0.65rem 0.8rem' } : {};
  const verChecklist = !sinChecklist && informe.checklist.length > 0 && (seccion === undefined || seccion >= secciones.length);
  const ctx: Ctx = { editable, grande, tam, urls, carpeta: carpetaFotos, onUrl: (p, u) => setUrls(x => ({ ...x, [p]: u })) };

  if (!secciones.length && !informe.checklist.length) {
    return <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>Esta plantilla no tiene preguntas ni checklist.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      {seccion === undefined && informe.intro?.trim() && <TextoFormato texto={informe.intro} style={{ fontSize: '0.86rem', color: 'var(--muted)' }} />}

      {visibles.map(s => (
        <div key={s.clave} style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          {(seccion === undefined && (secciones.length > 1 || s.clave !== '_general')) && (
            <p className="section-label" style={{ margin: 0, paddingBottom: 4, borderBottom: '1px solid var(--border2)' }}>{s.titulo}</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
            {s.campos.map((c, ci) => {
              const t = tipoDe(c);
              const v = informe.respuestas[c.clave];
              const ancho = ['parrafo', 'lista', 'foto', 'archivo', 'firma', 'multiseleccion', 'si_no_na'].includes(t)
                || (t === 'seleccion' && (c.opciones || []).length > 3) || !!c.alternativas?.length;
              const falta = marcarFaltantes && c.requerido && vacio(v);
              const nat = c.naturaleza ? NATURALEZAS.find(n => n.clave === c.naturaleza)?.nombre : null;
              return (
                <div key={`${c.clave || 'campo'}-${ci}`} style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: ancho ? '1 / -1' : undefined, minWidth: 0 }}>
                  <span className="label-muted" style={{ color: falta ? 'var(--danger)' : undefined, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <span>{c.etiqueta}{c.requerido && editable ? <span style={{ color: 'var(--danger)' }}> *</span> : null}</span>
                    {editable && nat && <span style={{ fontSize: '0.66rem', fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--muted)', border: '1px solid var(--border2)', borderRadius: 99, padding: '0 0.4rem' }}>{nat}</span>}
                    {editable && c.interno && <span style={{ fontSize: '0.66rem', fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--muted)' }}>· no sale en el PDF</span>}
                  </span>
                  {c.ayuda && editable && <span style={{ fontSize: '0.76rem', color: 'var(--muted)', marginTop: -3 }}>{c.ayuda}</span>}
                  <Campo c={c} v={v} ctx={ctx} onValor={x => responder(c.clave, x)} />
                  {editable && esAlerta(c, v) && (
                    <span style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: '0.76rem', color: 'var(--danger)' }}>
                      <AlertTriangle size={13} /> Se destacará como riesgo en el informe.</span>
                  )}
                  {editable && fueraDeRango(c, v) && (
                    <span style={{ fontSize: '0.76rem', color: 'var(--danger)' }}>Fuera del rango esperado ({c.min ?? '—'} a {c.max ?? '—'}{c.unidad ? ` ${c.unidad}` : ''}). Revisa el valor.</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {verChecklist && (
        <div style={{ border: '1px solid var(--border2)', borderRadius: 10, padding: '0.5rem 0.75rem' }}>
          <span className="label-muted">Checklist</span>
          {informe.checklist.map((it, i) => (
            <label key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: grande ? '0.5rem 0' : '0.3rem 0', fontSize: grande ? 15 : '0.88rem', color: 'var(--text)', cursor: editable ? 'pointer' : 'default' }}>
              <input type="checkbox" checked={it.ok} disabled={!editable} style={{ accentColor: 'var(--y-brand)', width: grande ? 20 : 16, height: grande ? 20 : 16, flexShrink: 0 }}
                onChange={e => onCambiar({ ...informe, checklist: informe.checklist.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)) })} />
              <span>{it.texto}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface Ctx {
  editable: boolean; grande: boolean; tam: React.CSSProperties; urls: Record<string, string>; carpeta?: string;
  onUrl: (path: string, url: string) => void;
}

function Campo({ c, v, ctx, onValor }: { c: CampoInforme; v: Valor; ctx: Ctx; onValor: (v: ValorCampo) => void }) {
  const t = tipoDe(c);
  if (t === 'foto') return <CampoFotos fotos={(v as FotoInforme[]) || []} ctx={ctx} onValor={onValor} />;
  if (t === 'archivo') return <CampoArchivos archivos={(v as FotoInforme[]) || []} ctx={ctx} onValor={onValor} />;
  if (t === 'firma') return <CampoFirma path={typeof v === 'string' ? v : ''} ctx={ctx} onValor={onValor} />;
  if (t === 'lista') return <CampoLista c={c} filas={(v as FilaLista[]) || []} ctx={ctx} onValor={onValor} />;
  if (!ctx.editable) return <span style={{ fontSize: '0.9rem', color: 'var(--text)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{valorLegible(c, v)}</span>;
  // Respuestas alternativas: «No medido», «No identificado»… (en vez de inventar un valor)
  const alt = c.alternativas || [];
  const enAlt = typeof v === 'string' && alt.includes(v);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      {!enAlt && <CampoSimple c={c} v={v} ctx={ctx} onValor={onValor} />}
      {alt.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {alt.map(a => (
            <button key={a} type="button" aria-pressed={v === a} onClick={() => onValor(v === a ? null : a)}
              style={{ ...chip(v === a, ctx.grande, 'var(--muted)'), fontSize: ctx.grande ? 13 : '0.76rem', padding: '0.25rem 0.65rem' }}>{a}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function CampoSimple({ c, v, ctx, onValor }: { c: CampoInforme; v: Valor; ctx: Ctx; onValor: (v: ValorCampo) => void }) {
  const { grande, tam } = ctx;
  const t = tipoDe(c);
  const ops = (c.opciones || []).filter(Boolean);
  const chips = (lista: string[]) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {lista.map((o, oi) => <button key={`${o}-${oi}`} type="button" aria-pressed={v === o} style={chip(v === o, grande)} onClick={() => onValor(v === o ? null : o)}>{o}</button>)}
    </div>
  );
  switch (t) {
    case 'parrafo':
      return <textarea className="input" rows={3} value={typeof v === 'string' ? v : ''} placeholder={c.placeholder} onChange={e => onValor(e.target.value)} style={{ ...tam, resize: 'vertical' }} />;
    case 'numero':
      return <NumeroInput className="input" value={typeof v === 'number' ? v : null} mostrarCero decimales={3} sufijo={c.unidad}
        onChange={n => onValor(n)} onVacio={() => onValor(null)} style={tam} />;
    case 'fecha': return <input className="input" type="date" value={typeof v === 'string' ? v : ''} onChange={e => onValor(e.target.value || null)} style={tam} />;
    case 'hora': return <input className="input" type="time" value={typeof v === 'string' ? v : ''} onChange={e => onValor(e.target.value || null)} style={tam} />;
    case 'si_no':
      return (
        <div style={{ display: 'flex', gap: 6 }}>
          {([['Sí', true], ['No', false]] as [string, boolean][]).map(([txt, b]) => (
            <button key={txt} type="button" onClick={() => onValor(v === b ? null : b)} aria-pressed={v === b}
              className="btn btn-sm" style={{ flex: 1, background: v === b ? 'var(--y-soft)' : 'transparent', border: `1px solid ${v === b ? 'var(--y-brand)' : 'var(--border2)'}`, color: 'var(--text)', height: grande ? 42 : undefined }}>{txt}</button>
          ))}
        </div>
      );
    case 'si_no_na': return chips(SI_NO_NA);
    case 'seleccion':
      return ops.length <= 7 ? chips(ops) : (
        <select className="input" value={typeof v === 'string' ? v : ''} onChange={e => onValor(e.target.value || null)} style={tam}>
          <option value="">Elegir…</option>
          {ops.map((o, oi) => <option key={`${o}-${oi}`} value={o}>{o}</option>)}
        </select>
      );
    case 'multiseleccion': {
      const sel = Array.isArray(v) ? (v as string[]) : [];
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ops.map((o, oi) => {
            const on = sel.includes(o);
            return <button key={`${o}-${oi}`} type="button" aria-pressed={on} style={chip(on, grande)}
              onClick={() => onValor(on ? sel.filter(x => x !== o) : [...sel, o])}>{on ? '✓ ' : ''}{o}</button>;
          })}
        </div>
      );
    }
    default:
      return <input className="input" value={typeof v === 'string' ? v : ''} placeholder={c.placeholder} onChange={e => onValor(e.target.value)} style={tam} />;
  }
}

function CampoLista({ c, filas, ctx, onValor }: { c: CampoInforme; filas: FilaLista[]; ctx: Ctx; onValor: (v: ValorCampo) => void }) {
  const sub = c.subcampos || [];
  if (!ctx.editable) {
    if (!filas.length) return <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>—</span>;
    return (
      <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.88rem', color: 'var(--text)' }}>
        {filas.map((f, i) => {
          const fotos = sub.filter(s => tipoDe(s) === 'foto').flatMap(s => (f[s.clave] as FotoInforme[]) || []);
          return (
            <li key={i} style={{ marginBottom: 6, overflowWrap: 'anywhere' }}>{filaLegible(sub, f) || '—'}
              {fotos.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {fotos.map(x => (ctx.urls[x.path] ? <img key={x.path} src={ctx.urls[x.path]} alt={x.caption || 'Foto'} style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 4 }} /> : null))}</div>}
            </li>
          );
        })}
      </ol>
    );
  }
  const setFila = (i: number, clave: string, val: ValorCampo) => onValor(filas.map((f, j) => (j === i ? { ...f, [clave]: val as FilaLista[string] } : f)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      {filas.map((f, i) => (
        <div key={i} style={{ border: '1px solid var(--border2)', borderRadius: 10, padding: '0.6rem 0.7rem', background: 'var(--bg3)', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <b style={{ flex: 1, fontSize: '0.8rem', color: 'var(--y)' }}>{c.etiqueta} {i + 1}</b>
            <button type="button" className="btn btn-ghost btn-xs" aria-label={`Quitar ${c.etiqueta} ${i + 1}`}
              onClick={() => { if (!filaLegible(sub, f) || confirm(`¿Quitar ${c.etiqueta.toLowerCase()} ${i + 1}?`)) onValor(filas.filter((_, j) => j !== i)); }}><Trash2 size={12} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 10 }}>
            {sub.map((s, si) => {
              const ts = tipoDe(s);
              const ancha = ts === 'foto' || ts === 'si_no_na' || (ts === 'seleccion' && (s.opciones || []).length > 3);
              return (
                <div key={`${s.clave}-${si}`} style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: ancha ? '1 / -1' : undefined, minWidth: 0 }}>
                  <span className="label-muted" style={{ fontSize: '0.72rem' }}>{s.etiqueta}</span>
                  {ts === 'foto'
                    ? <CampoFotos fotos={(f[s.clave] as FotoInforme[]) || []} ctx={ctx} onValor={val => setFila(i, s.clave, val)} chico />
                    : <CampoSimple c={s} v={f[s.clave] as Valor} ctx={ctx} onValor={val => setFila(i, s.clave, val)} />}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onValor([...filas, {}])}>
        <Plus size={13} /> Agregar {c.etiqueta.toLowerCase()}</button>
    </div>
  );
}

function CampoFotos({ fotos, ctx, onValor, chico }: { fotos: FotoInforme[]; ctx: Ctx; onValor: (v: ValorCampo) => void; chico?: boolean }) {
  const { editable, urls, carpeta, onUrl } = ctx;
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const subir = async (files: FileList | null) => {
    if (!files?.length || !carpeta) return;
    setSubiendo(true); setError('');
    try {
      const nuevas: FotoInforme[] = [];
      for (const f of Array.from(files).slice(0, 12)) {
        const path = await fotosService.subir(carpeta, f);
        nuevas.push({ path, caption: '' });
        onUrl(path, URL.createObjectURL(f));
      }
      onValor([...fotos, ...nuevas]);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo subir la foto'); }
    finally { setSubiendo(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      {fotos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${chico ? 96 : 120}px, 1fr))`, gap: 8 }}>
          {fotos.map((f, i) => (
            <div key={f.path} style={{ position: 'relative', minWidth: 0 }}>
              {urls[f.path] ? <img src={urls[f.path]} alt={f.caption || 'Foto'} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                : <div className="skeleton" style={{ aspectRatio: '4/3' }} />}
              {editable ? (
                <>
                  <input className="input" style={{ marginTop: 4, fontSize: '0.78rem', padding: '0.3rem 0.5rem', width: '100%' }} placeholder="Descripción y ubicación" value={f.caption}
                    onChange={e => onValor(fotos.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} />
                  <button type="button" aria-label="Quitar foto" onClick={() => onValor(fotos.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none', borderRadius: 99, width: 26, height: 26, cursor: 'pointer', display: 'grid', placeItems: 'center' }}><X size={13} /></button>
                </>
              ) : f.caption ? <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{f.caption}</span> : null}
            </div>
          ))}
        </div>
      )}
      {!editable && !fotos.length && <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>—</span>}
      {editable && (carpeta ? (
        <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', alignSelf: 'flex-start' }}>
          {subiendo ? <Loader2 size={13} className="iv-spin" /> : <Camera size={13} />} {fotos.length ? 'Más fotos' : 'Agregar fotos'}
          <input type="file" accept="image/*" multiple hidden onChange={e => { subir(e.target.files); e.target.value = ''; }} />
        </label>
      ) : <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Aquí se sacan o suben las fotos.</span>)}
      {error && <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}

const MAX_ARCHIVO = 15 * 1024 * 1024;
function CampoArchivos({ archivos, ctx, onValor }: { archivos: FotoInforme[]; ctx: Ctx; onValor: (v: ValorCampo) => void }) {
  const { editable, urls, carpeta } = ctx;
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const subir = async (files: FileList | null) => {
    if (!files?.length || !carpeta) return;
    setSubiendo(true); setError('');
    try {
      const nuevos: FotoInforme[] = [];
      for (const f of Array.from(files).slice(0, 10)) {
        if (f.size > MAX_ARCHIVO) throw new Error(`«${f.name}» pesa más de 15 MB.`);
        const limpio = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);
        const path = `${carpeta}/adjuntos/${Date.now()}_${limpio}`;
        const { error: e } = await supabase.storage.from(BUCKET_FOTOS).upload(path, f, { contentType: f.type || 'application/octet-stream' });
        if (e) throw e;
        nuevos.push({ path, caption: '', nombre: f.name });
      }
      onValor([...archivos, ...nuevos]);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo subir el archivo'); }
    finally { setSubiendo(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      {archivos.map((a, i) => (
        <div key={a.path} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', minWidth: 0 }}>
          <FileText size={15} color="var(--y)" style={{ flexShrink: 0 }} />
          {urls[a.path] ? <a href={urls[a.path]} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre || a.path.split('/').pop()}</a>
            : <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{a.nombre || a.path.split('/').pop()}</span>}
          {editable && <button type="button" className="btn btn-ghost btn-xs" aria-label="Quitar archivo" onClick={() => onValor(archivos.filter((_, j) => j !== i))}><X size={12} /></button>}
        </div>
      ))}
      {!editable && !archivos.length && <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>—</span>}
      {editable && (carpeta ? (
        <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', alignSelf: 'flex-start' }}>
          {subiendo ? <Loader2 size={13} className="iv-spin" /> : <Paperclip size={13} />} Adjuntar archivos
          <input type="file" multiple hidden accept=".pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx,.csv,image/*" onChange={e => { subir(e.target.files); e.target.value = ''; }} />
        </label>
      ) : <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Aquí se adjuntan planos, boletas o fichas.</span>)}
      {error && <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}

function CampoFirma({ path, ctx, onValor }: { path: string; ctx: Ctx; onValor: (v: ValorCampo) => void }) {
  const { editable, urls, carpeta, onUrl } = ctx;
  const [trazo, setTrazo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  if (path) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {urls[path] ? <img src={urls[path]} alt="Firma" style={{ height: 70, maxWidth: '100%', background: '#fff', borderRadius: 6, border: '1px solid var(--border2)', padding: 4 }} />
          : <span style={{ fontSize: '0.86rem', color: 'var(--text)' }}>Firmado</span>}
        {editable && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onValor(null)}>Rehacer firma</button>}
      </div>
    );
  }
  if (!editable) return <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>Sin firma</span>;
  if (!carpeta) return <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Aquí se firma con el dedo.</span>;
  const guardar = async () => {
    if (!trazo) return;
    setGuardando(true); setError('');
    try {
      const p = `${carpeta}/firma_${Date.now()}.png`;
      const { error: e } = await supabase.storage.from(BUCKET_FOTOS).upload(p, dataUriABlob(trazo), { contentType: 'image/png' });
      if (e) throw e;
      onUrl(p, trazo); onValor(p);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la firma'); }
    finally { setGuardando(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 460, width: '100%' }}>
      <FirmaPad onChange={setTrazo} alto={150} />
      <button type="button" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} disabled={!trazo || guardando} onClick={guardar}>
        {guardando ? <Loader2 size={13} className="iv-spin" /> : null} Guardar firma</button>
      {error && <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}
