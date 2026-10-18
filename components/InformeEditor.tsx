'use client';

/**
 * Editor del informe técnico de una OT (traído de TecApp): trabajos, resultado,
 * checklist, materiales, fotos y firma de quien recibe. Al firmar queda cerrado
 * (solo quien puede cerrar OT lo vuelve a editar).
 */

import { useEffect, useRef, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { Camera, Check, FileDown, Loader2, PenLine, Plus, Save, Trash2, X } from 'lucide-react';
import FirmaPad from '@/components/FirmaPad';
import InformePDF from '@/components/pdf/InformePDF';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import {
  archivosOT, dataUriABlob, folioOT, informesService, RESULTADOS,
  type InformeOT, type ItemChecklist, type MaterialInforme, type OrdenTrabajo,
} from '@/services/operacion';
import { useToast } from '@/hooks/useToast';
import { formatDate, nombreArchivo } from '@/utils';

export const CHECKLIST_BASE: ItemChecklist[] = [
  { texto: 'Se verificó ausencia de tensión antes de intervenir', ok: false },
  { texto: 'Conexiones apretadas y sin calentamiento', ok: false },
  { texto: 'Protecciones probadas (disparo del diferencial)', ok: false },
  { texto: 'Lugar de trabajo limpio y ordenado', ok: false },
  { texto: 'Se explicó al cliente lo realizado', ok: false },
];

export const folioInforme = (n: number) => `INF-${String(n).padStart(4, '0')}`;

interface Props {
  ot: OrdenTrabajo;
  informe: InformeOT;
  empresa: EmpresaInfo | null;
  tecnicoNombre: string;
  puedeReabrir: boolean;
  onCambio: () => void;
}

export default function InformeEditor({ ot, informe, empresa, tecnicoNombre, puedeReabrir, onCambio }: Props) {
  const { success, error: toastError } = useToast();
  const [d, setD] = useState<InformeOT>(informe);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [firmando, setFirmando] = useState(false);
  const [firma, setFirma] = useState('');
  const [genPDF, setGenPDF] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const firmado = d.estado === 'firmado';
  const bloqueado = firmado;

  useEffect(() => { setD(informe); }, [informe]);
  useEffect(() => {
    archivosOT.urls([...d.fotos.map(f => f.path), d.firma_path || '']).then(setUrls).catch(() => {});
  }, [d.fotos, d.firma_path]);

  const set = (patch: Partial<InformeOT>) => setD(x => ({ ...x, ...patch }));

  const guardar = async (silencioso = false) => {
    setGuardando(true);
    try {
      await informesService.guardar(d.id, {
        trabajos: d.trabajos, resultado: d.resultado, observaciones: d.observaciones, fecha: d.fecha,
        checklist: d.checklist, materiales: d.materiales, fotos: d.fotos,
        recibido_por: d.recibido_por, recibido_rut: d.recibido_rut,
      });
      if (!silencioso) success('Informe guardado');
      return true;
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar'); return false; }
    finally { setGuardando(false); }
  };

  const subirFotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setSubiendo(true);
    try {
      const nuevas = [];
      for (const f of Array.from(files)) nuevas.push({ path: await archivosOT.subir(`${ot.id}/informes`, f), caption: '' });
      const fotos = [...d.fotos, ...nuevas];
      set({ fotos });
      await informesService.guardar(d.id, { fotos });
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo subir la foto'); }
    finally { setSubiendo(false); if (fotoRef.current) fotoRef.current.value = ''; }
  };

  const quitarFoto = async (path: string) => {
    const fotos = d.fotos.filter(f => f.path !== path);
    set({ fotos });
    try { await informesService.guardar(d.id, { fotos }); await archivosOT.eliminar(path); } catch { /* queda huérfana, no importa */ }
  };

  const firmar = async () => {
    if (!d.trabajos?.trim()) { toastError('Describe los trabajos realizados antes de firmar'); return; }
    if (!d.resultado) { toastError('Indica el resultado'); return; }
    if (!d.recibido_por?.trim()) { toastError('Indica quién recibe'); return; }
    if (!firma) { toastError('Falta la firma'); return; }
    setGuardando(true);
    try {
      if (!(await guardar(true))) return;
      const path = await archivosOT.subir(`${ot.id}/firmas`, dataUriABlob(firma), true);
      await informesService.guardar(d.id, { firma_path: path, estado: 'firmado', firmado_at: new Date().toISOString() });
      setFirmando(false); setFirma('');
      success('Informe firmado');
      onCambio();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo firmar'); }
    finally { setGuardando(false); }
  };

  const reabrir = async () => {
    try { await informesService.guardar(d.id, { estado: 'borrador' }); onCambio(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo reabrir'); }
  };

  const eliminar = async () => {
    if (!confirm('¿Eliminar este informe borrador?')) return;
    try { await informesService.eliminar(d.id); onCambio(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo eliminar'); }
  };

  const descargar = async () => {
    if (!empresa) { toastError('Falta configurar la empresa'); return; }
    setGenPDF(true);
    try {
      const blob = await pdf(
        <InformePDF
          empresa={empresa} folioOT={folioOT(ot.folio)} folioInforme={folioInforme(d.folio)} fecha={d.fecha}
          cliente={{ nombre: ot.clientes?.nombre_cliente || 'Sin cliente', rut: ot.clientes?.rut, direccion: ot.direccion || ot.clientes?.direccion }}
          tituloOT={ot.titulo} tecnico={tecnicoNombre}
          resultado={RESULTADOS.find(r => r.clave === d.resultado)?.nombre || '—'}
          trabajos={d.trabajos || ''} observaciones={d.observaciones}
          checklist={d.checklist} materiales={d.materiales}
          fotos={d.fotos.filter(f => urls[f.path]).map(f => ({ url: urls[f.path], caption: f.caption }))}
          recibidoPor={d.recibido_por} recibidoRut={d.recibido_rut}
          firmaUrl={d.firma_path ? urls[d.firma_path] : null} firmadoAt={d.firmado_at}
        />
      ).toBlob();
      saveAs(blob, `Informe_${folioInforme(d.folio)}_${folioOT(ot.folio)}_${nombreArchivo(ot.clientes?.nombre_cliente || 'cliente')}.pdf`);
    } catch (e) { console.error(e); toastError('No se pudo generar el PDF'); }
    finally { setGenPDF(false); }
  };

  const lbl = { display: 'block', marginBottom: 6 } as const;
  const setItem = (i: number, patch: Partial<MaterialInforme>) => set({ materiales: d.materiales.map((m, j) => j === i ? { ...m, ...patch } : m) });

  return (
    <div style={{ border: '1px solid var(--border2)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.7rem 0.9rem', background: 'var(--bg3)', flexWrap: 'wrap' }}>
        <strong style={{ color: 'var(--text)', fontSize: '0.9rem' }}>{folioInforme(d.folio)}</strong>
        <span className="badge" style={{ background: firmado ? 'var(--success-soft)' : 'var(--y-soft)', color: firmado ? 'var(--success)' : 'var(--text)' }}>
          {firmado ? `Firmado ${formatDate(d.firmado_at)}` : 'Borrador'}</span>
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={descargar} disabled={genPDF}>{genPDF ? <Loader2 size={14} className="iv-spin" /> : <FileDown size={14} />} PDF</button>
        {!bloqueado && <button className="btn btn-ghost" onClick={eliminar} aria-label="Eliminar informe"><Trash2 size={14} /></button>}
        {firmado && puedeReabrir && <button className="btn btn-ghost" onClick={reabrir}>Reabrir</button>}
      </div>

      <fieldset disabled={bloqueado} style={{ border: 'none', margin: 0, padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <div><label className="label-muted" style={lbl}>Fecha</label>
            <input className="input" type="date" value={d.fecha?.slice(0, 10) || ''} onChange={e => set({ fecha: e.target.value })} /></div>
          <div><label className="label-muted" style={lbl}>Resultado *</label>
            <select className="input" value={d.resultado || ''} onChange={e => set({ resultado: (e.target.value || null) as InformeOT['resultado'] })}>
              <option value="">Elegir…</option>
              {RESULTADOS.map(r => <option key={r.clave} value={r.clave}>{r.nombre}</option>)}
            </select></div>
        </div>
        <div><label className="label-muted" style={lbl}>Trabajos realizados *</label>
          <textarea className="input" rows={4} value={d.trabajos || ''} onChange={e => set({ trabajos: e.target.value })} placeholder="Qué se hizo, qué se cambió, mediciones…" /></div>
        <div><label className="label-muted" style={lbl}>Observaciones / recomendaciones</label>
          <textarea className="input" rows={2} value={d.observaciones || ''} onChange={e => set({ observaciones: e.target.value })} /></div>

        <div>
          <p className="label-muted" style={{ marginBottom: 6 }}>Verificaciones</p>
          {d.checklist.map((c, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.3rem 0', fontSize: '0.88rem', color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={c.ok} style={{ accentColor: 'var(--y-brand)', width: 16, height: 16 }}
                onChange={e => set({ checklist: d.checklist.map((x, j) => j === i ? { ...x, ok: e.target.checked } : x) })} />
              <span style={{ flex: 1 }}>{c.texto}</span>
              {!bloqueado && <button type="button" onClick={() => set({ checklist: d.checklist.filter((_, j) => j !== i) })} aria-label="Quitar" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={13} /></button>}
            </label>
          ))}
          {!bloqueado && <button type="button" className="btn btn-ghost" style={{ marginTop: 4 }} onClick={() => { const t = prompt('Nueva verificación'); if (t?.trim()) set({ checklist: [...d.checklist, { texto: t.trim(), ok: false }] }); }}><Plus size={13} /> Verificación</button>}
        </div>

        <div>
          <p className="label-muted" style={{ marginBottom: 6 }}>Materiales utilizados</p>
          {d.materiales.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input className="input" style={{ flex: 1 }} value={m.descripcion} onChange={e => setItem(i, { descripcion: e.target.value })} placeholder="Descripción" />
              <input className="input" style={{ width: 80 }} type="number" min={0} step="any" value={m.cantidad} onChange={e => setItem(i, { cantidad: Number(e.target.value) })} />
              <input className="input" style={{ width: 70 }} value={m.unidad} onChange={e => setItem(i, { unidad: e.target.value })} />
              {!bloqueado && <button type="button" className="btn btn-ghost" onClick={() => set({ materiales: d.materiales.filter((_, j) => j !== i) })} aria-label="Quitar material"><Trash2 size={13} /></button>}
            </div>
          ))}
          {!bloqueado && <button type="button" className="btn btn-ghost" onClick={() => set({ materiales: [...d.materiales, { descripcion: '', cantidad: 1, unidad: 'un' }] })}><Plus size={13} /> Material</button>}
        </div>

        <div>
          <p className="label-muted" style={{ marginBottom: 6 }}>Fotos ({d.fotos.length})</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
            {d.fotos.map((f, i) => (
              <div key={f.path} style={{ position: 'relative' }}>
                {urls[f.path]
                  ? <img src={urls[f.path]} alt={f.caption || 'Foto'} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                  : <div className="skeleton" style={{ aspectRatio: '4/3' }} />}
                <input className="input" style={{ marginTop: 4, fontSize: '0.78rem', padding: '0.3rem 0.5rem' }} placeholder="Leyenda" value={f.caption}
                  onChange={e => set({ fotos: d.fotos.map((x, j) => j === i ? { ...x, caption: e.target.value } : x) })} />
                {!bloqueado && <button type="button" onClick={() => quitarFoto(f.path)} aria-label="Quitar foto"
                  style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none', borderRadius: 99, width: 24, height: 24, cursor: 'pointer' }}><X size={13} /></button>}
              </div>
            ))}
          </div>
          {!bloqueado && <>
            <input ref={fotoRef} type="file" accept="image/*" multiple hidden onChange={e => subirFotos(e.target.files)} />
            <button type="button" className="btn btn-ghost" style={{ marginTop: 6 }} onClick={() => fotoRef.current?.click()} disabled={subiendo}>
              {subiendo ? <Loader2 size={13} className="iv-spin" /> : <Camera size={13} />} Agregar fotos</button>
          </>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <div><label className="label-muted" style={lbl}>Recibe (nombre) *</label>
            <input className="input" value={d.recibido_por || ''} onChange={e => set({ recibido_por: e.target.value })} /></div>
          <div><label className="label-muted" style={lbl}>RUT</label>
            <input className="input" value={d.recibido_rut || ''} onChange={e => set({ recibido_rut: e.target.value })} /></div>
        </div>

        {firmado && d.firma_path && urls[d.firma_path] && (
          <img src={urls[d.firma_path]} alt="Firma" style={{ height: 70, objectFit: 'contain', alignSelf: 'flex-start', background: '#fff', borderRadius: 6, padding: 4 }} />
        )}
      </fieldset>

      {!bloqueado && (
        <div style={{ padding: '0 0.9rem 0.9rem' }}>
          {firmando ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="label-muted">Firma de {d.recibido_por || 'quien recibe'}</p>
              <div style={{ background: '#fff', borderRadius: 8 }}><FirmaPad onChange={setFirma} /></div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => { setFirmando(false); setFirma(''); }}>Cancelar</button>
                <button className="btn btn-primary" onClick={firmar} disabled={guardando || !firma}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Check size={14} />} Confirmar firma</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => guardar()} disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Save size={14} />} Guardar</button>
              <button className="btn btn-primary" onClick={() => setFirmando(true)}><PenLine size={14} /> Firmar con el cliente</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
