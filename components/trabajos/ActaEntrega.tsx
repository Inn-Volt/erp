'use client';

/**
 * Acta de entrega del trabajo (fase 8), a pantalla completa y pensada también para el celular:
 *   1. Contenido: la plantilla de entrega (preguntas y checklist), qué se hizo, fotos y observaciones.
 *   2. Recepción: nombre, RUT y correo de quien recibe, y su firma con el dedo.
 * Se guarda sola mientras se escribe. Al firmarla, el trabajo queda terminado (y caen los
 * cobros «al terminar»). Firmada no se edita: quien aprueba cotizaciones la puede reabrir.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, FileDown, Loader2, PenLine, RotateCcw, Trash2 } from 'lucide-react';
import FirmaPad from '@/components/FirmaPad';
import FormularioInforme from '@/components/informes/FormularioInforme';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import { supabase } from '@/lib/supabase';
import { BUCKET_FOTOS, fotosService } from '@/services/fotos';
import { dataUriABlob } from '@/services/operacion';
import {
  pathsDe, entregasService, folioActa, informeDesde, plantillasInformeServicio,
  type EntregaTrabajo, type InformeLleno, type PlantillaInformeCompleta,
} from '@/services/informes';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { formatDate } from '@/utils';

const campo = 'w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-base text-content outline-none focus:border-[var(--y-brand)]';
type Cot = { id: string; folio: number; titulo: string; cliente?: { nombre: string; rut?: string | null; direccion?: string | null } };

/** El PDF del acta. */
export async function descargarActaPDF(acta: EntregaTrabajo, cot: Cot, responsable: string | null) {
  const [{ pdf }, { default: InformeGeneralPDF }, { saveAs }] = await Promise.all([
    import('@react-pdf/renderer'), import('@/components/pdf/InformeGeneralPDF'), import('file-saver'),
  ]);
  const { data: emps } = await supabase.from('empresas').select('*').limit(1);
  const empresa = (emps || [])[0] as EmpresaInfo | undefined;
  if (!empresa) throw new Error('Falta configurar la empresa');
  const urls = await fotosService.urls([...acta.fotos.map(f => f.path), acta.firma_path || '', ...pathsDe(acta)].filter(Boolean));
  const blob = await pdf(
    <InformeGeneralPDF empresa={empresa} tipo="entrega" folio={folioActa(acta.folio)} fecha={acta.fecha}
      cliente={{ nombre: cot.cliente?.nombre || 'Sin cliente', rut: cot.cliente?.rut, direccion: cot.cliente?.direccion }}
      referencia={`IV-${String(cot.folio).padStart(4, '0')} · ${cot.titulo}`} responsable={responsable}
      informe={acta} trabajos={acta.trabajos} observaciones={acta.observaciones}
      fotos={acta.fotos.filter(f => urls[f.path]).map(f => ({ url: urls[f.path], caption: f.caption }))}
      urls={urls} recibidoPor={acta.recibido_por} recibidoRut={acta.recibido_rut} firmaUrl={acta.firma_path ? urls[acta.firma_path] : null} firmadoAt={acta.firmado_at} />,
  ).toBlob();
  saveAs(blob, `Acta_${folioActa(acta.folio)}_IV-${String(cot.folio).padStart(4, '0')}.pdf`);
}

export default function ActaEntrega({ cot, acta: inicial, responsable, onCerrar, onCambio }: {
  cot: Cot; acta: EntregaTrabajo; responsable: string | null; onCerrar: () => void; onCambio: () => void;
}) {
  const { puede } = usePermisos();
  const { success, error: toastError } = useToast();
  const [d, setD] = useState<EntregaTrabajo>(inicial);
  const [fase, setFase] = useState<'contenido' | 'firma'>('contenido');
  const [plantillas, setPlantillas] = useState<PlantillaInformeCompleta[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [subiendo, setSubiendo] = useState(false);
  const [firma, setFirma] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [estadoGuardado, setEstadoGuardado] = useState<'ok' | 'guardando' | 'pendiente'>('ok');
  const cambiado = useRef(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const firmado = d.estado === 'firmado';

  useEffect(() => { plantillasInformeServicio.listar({ tipo: 'entrega' }).then(setPlantillas).catch(() => {}); }, []);
  useEffect(() => {
    const paths = [...d.fotos.map(f => f.path), d.firma_path || ''].filter(Boolean);
    if (paths.length) fotosService.urls(paths).then(u => setUrls(x => ({ ...x, ...u }))).catch(() => {});
  }, [d.fotos, d.firma_path]);
  useEffect(() => { const a = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = a; }; }, []);

  const subir = useCallback(async (x: EntregaTrabajo) => {
    setEstadoGuardado('guardando');
    try {
      await entregasService.guardar(x.id, {
        plantilla_id: x.plantilla_id, plantilla_nombre: x.plantilla_nombre, intro: x.intro, campos: x.campos, respuestas: x.respuestas,
        checklist: x.checklist, trabajos: x.trabajos, observaciones: x.observaciones, fotos: x.fotos,
        recibido_por: x.recibido_por, recibido_rut: x.recibido_rut, recibido_email: x.recibido_email,
      });
      cambiado.current = false; setEstadoGuardado('ok'); return true;
    } catch { setEstadoGuardado('pendiente'); return false; }
  }, []);
  useEffect(() => {
    if (!cambiado.current || firmado) return;
    setEstadoGuardado('pendiente');
    const t = setTimeout(() => { subir(d); }, 1500);
    return () => clearTimeout(t);
  }, [d, firmado, subir]);

  const set = (patch: Partial<EntregaTrabajo>) => { cambiado.current = true; setD(x => ({ ...x, ...patch })); };
  const setInforme = (i: InformeLleno) => set({ ...i });
  const elegirPlantilla = (pid: string) => {
    if (Object.keys(d.respuestas || {}).length && !confirm('Cambiar de plantilla borra lo respondido. ¿Seguir?')) return;
    set(informeDesde(plantillas.find(p => p.id === pid) || null));
  };
  const cerrar = async () => { if (cambiado.current && !firmado) await subir(d); onCambio(); onCerrar(); };

  const agregarFotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setSubiendo(true);
    try {
      const nuevas = [];
      for (const f of Array.from(files).slice(0, 12)) nuevas.push({ path: await fotosService.subir(`entregas/${cot.id}`, f), caption: '' });
      set({ fotos: [...d.fotos, ...nuevas] });
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo subir la foto'); }
    finally { setSubiendo(false); if (fotoRef.current) fotoRef.current.value = ''; }
  };

  const firmar = async () => {
    if (!d.recibido_por?.trim()) { toastError('Escribe el nombre de quien recibe.'); return; }
    if (!firma) { toastError('Falta la firma del cliente.'); return; }
    setOcupado(true);
    try {
      if (!(await subir(d))) throw new Error('No se pudo guardar el acta. Revisa la conexión.');
      const path = `entregas/${cot.id}/firma_${d.id}_${Date.now()}.png`;
      const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(path, dataUriABlob(firma), { contentType: 'image/png' });
      if (error) throw error;
      const firmadoAt = new Date().toISOString();
      await entregasService.guardar(d.id, { firma_path: path, estado: 'firmado', firmado_at: firmadoAt });
      setD(x => ({ ...x, firma_path: path, estado: 'firmado', firmado_at: firmadoAt }));
      success('Acta firmada: el trabajo queda terminado.');
      onCambio();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo firmar'); }
    finally { setOcupado(false); }
  };

  const reabrir = async () => {
    try { await entregasService.guardar(d.id, { estado: 'borrador' }); setD(x => ({ ...x, estado: 'borrador' })); setFase('contenido'); onCambio(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo reabrir'); }
  };
  const pdfActa = async () => {
    setOcupado(true);
    try { await descargarActaPDF(d, cot, responsable); } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo generar el PDF'); }
    finally { setOcupado(false); }
  };

  const Rotulo = ({ children }: { children: React.ReactNode }) => <span className="mb-1.5 block text-sm font-medium text-content">{children}</span>;

  return (
    <div className="fixed inset-0 z-[250] flex flex-col bg-surface-2" role="dialog" aria-modal="true" aria-label={`Acta ${folioActa(d.folio)}`}>
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}>
        <button onClick={cerrar} aria-label="Volver" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-content-muted hover:bg-surface-3"><ArrowLeft size={18} /></button>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-content">Acta de entrega {folioActa(d.folio)} · IV-{String(cot.folio).padStart(4, '0')}</p>
          <p className="truncate text-xs text-content-muted">{cot.cliente?.nombre || ''} · {cot.titulo}</p>
        </div>
        {!firmado && <span className="shrink-0 rounded-full bg-surface-3 px-2.5 py-1 text-xs font-medium text-content-muted">
          {estadoGuardado === 'ok' ? '✓ Guardado' : estadoGuardado === 'guardando' ? 'Guardando…' : 'Por guardar'}</span>}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
          {firmado ? (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-[var(--success)]"><Check size={16} /> Firmada por {d.recibido_por} el {formatDate(d.firmado_at)}</p>
              <div className="mt-3"><FormularioInforme informe={d} onCambiar={() => {}} editable={false} /></div>
              {d.trabajos && <p className="mt-3 whitespace-pre-wrap text-sm text-content"><b>Trabajos realizados:</b> {d.trabajos}</p>}
              {d.fotos.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2">{d.fotos.map(f => urls[f.path] ? <img key={f.path} src={urls[f.path]} alt={f.caption || 'Foto'} className="aspect-square w-full rounded-lg object-cover" /> : null)}</div>}
              {d.firma_path && urls[d.firma_path] && <img src={urls[d.firma_path]} alt="Firma" className="mt-3 h-16 rounded bg-white p-1" />}
            </div>
          ) : fase === 'firma' ? (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="mb-3 text-sm font-bold text-content">Recepción conforme del cliente</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label><Rotulo>Nombre de quien recibe *</Rotulo><input className={campo} value={d.recibido_por || ''} onChange={e => set({ recibido_por: e.target.value })} autoFocus /></label>
                <label><Rotulo>RUT (opcional)</Rotulo><input className={campo} value={d.recibido_rut || ''} onChange={e => set({ recibido_rut: e.target.value })} /></label>
                <label className="sm:col-span-2"><Rotulo>Correo (opcional)</Rotulo><input className={campo} type="email" value={d.recibido_email || ''} onChange={e => set({ recibido_email: e.target.value })} /></label>
              </div>
              <p className="mb-1.5 mt-4 text-sm text-content-muted">Pídele al cliente que firme aquí 👇</p>
              <div className="rounded-xl bg-white"><FirmaPad onChange={setFirma} /></div>
            </div>
          ) : (
            <>
              <label><Rotulo>Plantilla del acta</Rotulo>
                <select className={campo} value={d.plantilla_id || ''} onChange={e => elegirPlantilla(e.target.value)}>
                  <option value="">{plantillas.length ? 'Sin plantilla' : 'Sin plantillas de entrega: créalas en Mi empresa → Plantillas de informe'}</option>
                  {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select></label>
              {(d.campos.length > 0 || d.checklist.length > 0) && <div className="rounded-2xl border border-line bg-surface p-3"><FormularioInforme informe={d} onCambiar={setInforme} grande carpetaFotos={`entregas/${cot.id}`} /></div>}
              <label><Rotulo>Trabajos realizados *</Rotulo>
                <textarea className={campo} rows={4} value={d.trabajos || ''} onChange={e => set({ trabajos: e.target.value })} placeholder="Qué se instaló, qué se probó, qué se entrega." /></label>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-content">Fotos ({d.fotos.length})</span>
                  <button type="button" onClick={() => fotoRef.current?.click()} disabled={subiendo} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-accent">
                    {subiendo ? <Loader2 size={14} className="iv-spin" /> : <Camera size={14} />} Agregar</button>
                  <input ref={fotoRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={e => agregarFotos(e.target.files)} />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {d.fotos.map((f, i) => (
                    <div key={f.path} className="flex gap-2 rounded-xl border border-line bg-surface p-2">
                      {urls[f.path] ? <img src={urls[f.path]} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" /> : <div className="skeleton h-20 w-20 shrink-0" />}
                      <textarea className={`${campo} flex-1`} rows={2} value={f.caption} placeholder="Descripción breve"
                        onChange={e => set({ fotos: d.fotos.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)) })} />
                      <button type="button" onClick={() => set({ fotos: d.fotos.filter(x => x.path !== f.path) })} aria-label="Quitar foto" className="shrink-0 px-1 text-content-muted hover:text-[var(--danger)]"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>
              <label><Rotulo>Observaciones (van en el acta)</Rotulo>
                <textarea className={campo} rows={2} value={d.observaciones || ''} onChange={e => set({ observaciones: e.target.value })} placeholder="Garantía, recomendaciones de uso…" /></label>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface px-4 py-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        {firmado ? <>
          <button className="btn btn-ghost" onClick={pdfActa} disabled={ocupado}>{ocupado ? <Loader2 size={14} className="iv-spin" /> : <FileDown size={14} />} PDF</button>
          {puede('cotizaciones.aprobar') && <button className="btn btn-ghost" onClick={reabrir}><RotateCcw size={14} /> Reabrir</button>}
          <button className="btn btn-primary" onClick={cerrar}>Listo</button>
        </> : fase === 'firma' ? <>
          <button className="btn btn-ghost" onClick={() => setFase('contenido')}><ArrowLeft size={14} /> Volver al acta</button>
          <button className="btn btn-primary" onClick={firmar} disabled={ocupado || !firma}>{ocupado ? <Loader2 size={14} className="iv-spin" /> : <Check size={14} />} Firmar y terminar el trabajo</button>
        </> : <>
          <button className="btn btn-ghost" onClick={pdfActa} disabled={ocupado}><FileDown size={14} /> PDF borrador</button>
          <button className="btn btn-ghost" onClick={cerrar}>Guardar y salir</button>
          <button className="btn btn-primary" onClick={() => { if (!d.trabajos?.trim()) { toastError('Cuenta qué trabajos se realizaron.'); return; } setFase('firma'); }}><PenLine size={14} /> Firma del cliente</button>
        </>}
      </div>
    </div>
  );
}
