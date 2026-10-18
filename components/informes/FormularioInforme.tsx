'use client';

/**
 * Llena un informe a partir de su planilla (como en TecApp): secciones, texto, párrafo, número
 * con unidad, fecha, hora, sí/no, una o varias opciones, fotos, firma y listas (filas con sus
 * columnas: tableros, circuitos…). Las preguntas condicionales se muestran solo si se cumple
 * su condición. Lo usan los informes de la visita, el acta de entrega y la vista previa.
 *   · `seccion`: muestra solo ese paso (el formulario por pasos); sin él, todo seguido.
 *   · `carpetaFotos`: dónde se suben fotos y firmas (sin ella, no se pueden subir).
 *   · `grande`: campos de 16 px para el celular en terreno.
 */

import { useEffect, useState } from 'react';
import { Camera, Loader2, Plus, Trash2, X } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import TextoFormato from '@/components/TextoFormato';
import FirmaPad from '@/components/FirmaPad';
import { supabase } from '@/lib/supabase';
import { BUCKET_FOTOS, fotosService } from '@/services/fotos';
import { dataUriABlob } from '@/services/operacion';
import {
  filaLegible, pathsDe, seccionesDe, tipoDe, valorLegible,
  type CampoInforme, type FilaLista, type FotoInforme, type InformeLleno, type ValorCampo, type ValorSimple,
} from '@/services/informes';

interface Props {
  informe: InformeLleno; onCambiar: (i: InformeLleno) => void; editable?: boolean; grande?: boolean;
  seccion?: number; carpetaFotos?: string; sinChecklist?: boolean; marcarFaltantes?: boolean;
}

const chip = (on: boolean, grande: boolean): React.CSSProperties => ({
  cursor: 'pointer', fontSize: grande ? 15 : '0.82rem', padding: grande ? '0.55rem 0.85rem' : '0.35rem 0.7rem', borderRadius: 999,
  border: `1px solid ${on ? 'var(--y-brand)' : 'var(--border2)'}`, background: on ? 'var(--y-soft)' : 'transparent',
  color: 'var(--text)', fontWeight: on ? 600 : 400,
});

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

  if (!secciones.length && !informe.checklist.length) {
    return <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>Esta plantilla no tiene preguntas ni checklist.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {seccion === undefined && informe.intro?.trim() && <TextoFormato texto={informe.intro} style={{ fontSize: '0.86rem', color: 'var(--muted)' }} />}

      {visibles.map(s => (
        <div key={s.clave} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(seccion === undefined && (secciones.length > 1 || s.clave !== '_general')) && (
            <p className="section-label" style={{ margin: 0, paddingBottom: 4, borderBottom: '1px solid var(--border2)' }}>{s.titulo}</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {s.campos.map((c, ci) => {
              const t = tipoDe(c);
              const ancho = ['parrafo', 'lista', 'foto', 'firma', 'multiseleccion'].includes(t) || (t === 'seleccion' && (c.opciones || []).length > 3);
              const falta = marcarFaltantes && c.requerido && (informe.respuestas[c.clave] === undefined || informe.respuestas[c.clave] === null || informe.respuestas[c.clave] === '' || (Array.isArray(informe.respuestas[c.clave]) && !(informe.respuestas[c.clave] as unknown[]).length));
              return (
                <div key={`${c.clave || 'campo'}-${ci}`} style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: ancho ? '1 / -1' : undefined }}>
                  <span className="label-muted" style={{ color: falta ? 'var(--danger)' : undefined }}>
                    {c.etiqueta}{c.requerido && editable ? <span style={{ color: 'var(--danger)' }}> *</span> : null}
                  </span>
                  {c.ayuda && editable && <span style={{ fontSize: '0.76rem', color: 'var(--muted)', marginTop: -3 }}>{c.ayuda}</span>}
                  <Campo c={c} v={informe.respuestas[c.clave]} editable={editable} grande={grande} tam={tam} urls={urls}
                    carpeta={carpetaFotos} onUrl={(p, u) => setUrls(x => ({ ...x, [p]: u }))} onValor={v => responder(c.clave, v)} />
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
              <input type="checkbox" checked={it.ok} disabled={!editable} style={{ accentColor: 'var(--y-brand)', width: grande ? 20 : 16, height: grande ? 20 : 16 }}
                onChange={e => onCambiar({ ...informe, checklist: informe.checklist.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)) })} />
              <span>{it.texto}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Campo({ c, v, editable, grande, tam, urls, carpeta, onUrl, onValor }: {
  c: CampoInforme; v: ValorCampo | undefined; editable: boolean; grande: boolean; tam: React.CSSProperties;
  urls: Record<string, string>; carpeta?: string; onUrl: (path: string, url: string) => void; onValor: (v: ValorCampo) => void;
}) {
  const t = tipoDe(c);
  if (t === 'foto') return <CampoFotos fotos={(v as FotoInforme[]) || []} editable={editable} urls={urls} carpeta={carpeta} onUrl={onUrl} onValor={onValor} />;
  if (t === 'firma') return <CampoFirma path={typeof v === 'string' ? v : ''} editable={editable} urls={urls} carpeta={carpeta} onUrl={onUrl} onValor={onValor} />;
  if (t === 'lista') return <CampoLista c={c} filas={(v as FilaLista[]) || []} editable={editable} grande={grande} tam={tam} onValor={onValor} />;
  if (!editable) return <span style={{ fontSize: '0.9rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{valorLegible(c, v)}</span>;
  return <CampoSimple c={c} v={v as ValorSimple | string[] | undefined} grande={grande} tam={tam} onValor={onValor} />;
}

function CampoSimple({ c, v, grande, tam, onValor }: {
  c: CampoInforme; v: ValorSimple | string[] | undefined; grande: boolean; tam: React.CSSProperties; onValor: (v: ValorCampo) => void;
}) {
  const t = tipoDe(c);
  const ops = (c.opciones || []).filter(Boolean);
  switch (t) {
    case 'parrafo':
      return <textarea className="input" rows={3} value={(v as string) || ''} onChange={e => onValor(e.target.value)} style={{ ...tam, resize: 'vertical' }} />;
    case 'numero':
      return <NumeroInput className="input" value={typeof v === 'number' ? v : null} mostrarCero decimales={3} sufijo={c.unidad}
        onChange={n => onValor(n)} onVacio={() => onValor(null)} style={tam} />;
    case 'fecha': return <input className="input" type="date" value={(v as string) || ''} onChange={e => onValor(e.target.value || null)} style={tam} />;
    case 'hora': return <input className="input" type="time" value={(v as string) || ''} onChange={e => onValor(e.target.value || null)} style={tam} />;
    case 'si_no':
      return (
        <div style={{ display: 'flex', gap: 6 }}>
          {([['Sí', true], ['No', false]] as [string, boolean][]).map(([txt, b]) => (
            <button key={txt} type="button" onClick={() => onValor(v === b ? null : b)} aria-pressed={v === b}
              className="btn btn-sm" style={{ flex: 1, background: v === b ? 'var(--y-soft)' : 'transparent', border: `1px solid ${v === b ? 'var(--y-brand)' : 'var(--border2)'}`, color: 'var(--text)', height: grande ? 42 : undefined }}>{txt}</button>
          ))}
        </div>
      );
    case 'seleccion':
      return ops.length <= 6 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ops.map((o, oi) => <button key={`${o}-${oi}`} type="button" aria-pressed={v === o} style={chip(v === o, grande)} onClick={() => onValor(v === o ? null : o)}>{o}</button>)}
        </div>
      ) : (
        <select className="input" value={(v as string) || ''} onChange={e => onValor(e.target.value || null)} style={tam}>
          <option value="">Elegir…</option>
          {ops.map((o, oi) => <option key={`${o}-${oi}`} value={o}>{o}</option>)}
        </select>
      );
    case 'multiseleccion': {
      const sel = Array.isArray(v) ? v : [];
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
      return <input className="input" value={(v as string) || ''} onChange={e => onValor(e.target.value)} style={tam} />;
  }
}

function CampoLista({ c, filas, editable, grande, tam, onValor }: {
  c: CampoInforme; filas: FilaLista[]; editable: boolean; grande: boolean; tam: React.CSSProperties; onValor: (v: ValorCampo) => void;
}) {
  const sub = c.subcampos || [];
  if (!editable) {
    if (!filas.length) return <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>—</span>;
    return (
      <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.88rem', color: 'var(--text)' }}>
        {filas.map((f, i) => <li key={i}>{filaLegible(sub, f) || '—'}</li>)}
      </ol>
    );
  }
  const setFila = (i: number, clave: string, val: ValorCampo) => onValor(filas.map((f, j) => (j === i ? { ...f, [clave]: val as ValorSimple } : f)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {filas.map((f, i) => (
        <div key={i} style={{ border: '1px solid var(--border2)', borderRadius: 10, padding: '0.6rem 0.7rem', background: 'var(--bg3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <b style={{ flex: 1, fontSize: '0.8rem', color: 'var(--y)' }}>{c.etiqueta} {i + 1}</b>
            <button type="button" className="btn btn-ghost btn-xs" aria-label={`Quitar ${c.etiqueta} ${i + 1}`}
              onClick={() => { if (!filaLegible(sub, f) || confirm(`¿Quitar ${c.etiqueta.toLowerCase()} ${i + 1}?`)) onValor(filas.filter((_, j) => j !== i)); }}><Trash2 size={12} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            {sub.map((s, si) => (
              <label key={`${s.clave}-${si}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="label-muted" style={{ fontSize: '0.72rem' }}>{s.etiqueta}</span>
                <CampoSimple c={s} v={f[s.clave] ?? undefined} grande={grande} tam={tam} onValor={val => setFila(i, s.clave, val)} />
              </label>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onValor([...filas, {}])}>
        <Plus size={13} /> Agregar {c.etiqueta.toLowerCase()}</button>
    </div>
  );
}

function CampoFotos({ fotos, editable, urls, carpeta, onUrl, onValor }: {
  fotos: FotoInforme[]; editable: boolean; urls: Record<string, string>; carpeta?: string;
  onUrl: (path: string, url: string) => void; onValor: (v: ValorCampo) => void;
}) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {fotos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {fotos.map((f, i) => (
            <div key={f.path} style={{ position: 'relative' }}>
              {urls[f.path] ? <img src={urls[f.path]} alt={f.caption || 'Foto'} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                : <div className="skeleton" style={{ aspectRatio: '4/3' }} />}
              {editable ? (
                <>
                  <input className="input" style={{ marginTop: 4, fontSize: '0.78rem', padding: '0.3rem 0.5rem' }} placeholder="Descripción" value={f.caption}
                    onChange={e => onValor(fotos.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} />
                  <button type="button" aria-label="Quitar foto" onClick={() => onValor(fotos.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none', borderRadius: 99, width: 24, height: 24, cursor: 'pointer', display: 'grid', placeItems: 'center' }}><X size={13} /></button>
                </>
              ) : f.caption ? <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{f.caption}</span> : null}
            </div>
          ))}
        </div>
      )}
      {!editable && !fotos.length && <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>—</span>}
      {editable && (carpeta ? (
        <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', alignSelf: 'flex-start' }}>
          {subiendo ? <Loader2 size={13} className="iv-spin" /> : <Camera size={13} />} Agregar fotos
          <input type="file" accept="image/*" capture="environment" multiple hidden onChange={e => { subir(e.target.files); e.target.value = ''; }} />
        </label>
      ) : <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Aquí se sacan o suben las fotos.</span>)}
      {error && <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}

function CampoFirma({ path, editable, urls, carpeta, onUrl, onValor }: {
  path: string; editable: boolean; urls: Record<string, string>; carpeta?: string;
  onUrl: (path: string, url: string) => void; onValor: (v: ValorCampo) => void;
}) {
  const [trazo, setTrazo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  if (path) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {urls[path] ? <img src={urls[path]} alt="Firma" style={{ height: 70, background: '#fff', borderRadius: 6, border: '1px solid var(--border2)', padding: 4 }} />
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 460 }}>
      <FirmaPad onChange={setTrazo} alto={150} />
      <button type="button" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} disabled={!trazo || guardando} onClick={guardar}>
        {guardando ? <Loader2 size={13} className="iv-spin" /> : null} Guardar firma</button>
      {error && <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}
