'use client';

/**
 * Informe de visita (como el de TecApp), a pantalla completa y pensado para el celular:
 *   1. Contenido: falla observada, trabajos realizados, verificaciones, materiales (con N° de
 *      serie), fotos con su descripción y resultado (si no quedó resuelto, qué quedó pendiente).
 *   2. Recepción: nombre, RUT y correo de quien recibe, y su firma con el dedo.
 * Se guarda solo mientras se escribe (y una copia en el equipo, por si se corta la señal).
 * Firmado, queda cerrado: solo quien cierra OT lo reabre.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { ArrowLeft, Camera, Check, FileDown, Loader2, PenLine, RotateCcw, Trash2, X } from 'lucide-react';
import FirmaPad from '@/components/FirmaPad';
import NumeroInput from '@/components/NumeroInput';
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

// Campos grandes y legibles (terreno, al sol, con guantes); 16 px evita el zoom del iPhone.
const campo = 'w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-base text-content outline-none focus:border-[var(--y-brand)]';
const EDITABLES: (keyof InformeOT)[] = ['fecha', 'falla_observada', 'trabajos', 'observaciones', 'resultado', 'pendiente', 'checklist', 'materiales', 'fotos', 'recibido_por', 'recibido_rut', 'recibido_email'];

/** El PDF del informe (lo usan el editor y la lista de informes de la OT). */
export async function descargarInformePDF(ot: OrdenTrabajo, d: InformeOT, empresa: EmpresaInfo, tecnico: string) {
  const urls = await archivosOT.urls([...d.fotos.map(f => f.path), d.firma_path || '']);
  const blob = await pdf(
    <InformePDF
      empresa={empresa} folioOT={folioOT(ot.folio)} folioInforme={folioInforme(d.folio)} fecha={d.fecha}
      cliente={{ nombre: ot.clientes?.nombre_cliente || 'Sin cliente', rut: ot.clientes?.rut, direccion: ot.direccion || ot.clientes?.direccion }}
      tituloOT={ot.titulo} tecnico={tecnico}
      resultado={RESULTADOS.find(r => r.clave === d.resultado)?.nombre || '—'}
      fallaObservada={d.falla_observada} trabajos={d.trabajos || ''} pendiente={d.pendiente} observaciones={d.observaciones}
      checklist={d.checklist} materiales={d.materiales}
      fotos={d.fotos.filter(f => urls[f.path]).map(f => ({ url: urls[f.path], caption: f.caption }))}
      recibidoPor={d.recibido_por} recibidoRut={d.recibido_rut}
      firmaUrl={d.firma_path ? urls[d.firma_path] : null} firmadoAt={d.firmado_at}
    />,
  ).toBlob();
  saveAs(blob, `Informe_${folioInforme(d.folio)}_${folioOT(ot.folio)}_${nombreArchivo(ot.clientes?.nombre_cliente || 'cliente')}.pdf`);
}

export default function InformeVisita({ ot, informe, empresa, tecnicoNombre, puedeReabrir, onCerrar, onCambio }: {
  ot: OrdenTrabajo; informe: InformeOT; empresa: EmpresaInfo | null; tecnicoNombre: string; puedeReabrir: boolean;
  onCerrar: () => void; onCambio: () => void;
}) {
  const { success, error: toastError } = useToast();
  const claveLocal = `innvolt-informe-${informe.id}`;
  const [d, setD] = useState<InformeOT>(() => {
    // Lo que quedó en el equipo sin subir (sin señal) manda sobre lo del servidor.
    try {
      const raw = informe.estado === 'borrador' ? localStorage.getItem(claveLocal) : null;
      if (raw) return { ...informe, ...JSON.parse(raw) };
    } catch { /* sin almacenamiento */ }
    return informe;
  });
  const [fase, setFase] = useState<'contenido' | 'firma'>('contenido');
  const [estadoGuardado, setEstadoGuardado] = useState<'ok' | 'guardando' | 'pendiente' | 'sin-senal'>('ok');
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [subiendo, setSubiendo] = useState(false);
  const [firma, setFirma] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const cambiado = useRef(false);
  const firmado = d.estado === 'firmado';

  useEffect(() => {
    archivosOT.urls([...d.fotos.map(f => f.path), d.firma_path || '']).then(u => setUrls(x => ({ ...x, ...u }))).catch(() => {});
  }, [d.fotos, d.firma_path]);

  // Bloquea el scroll de la página de atrás mientras está abierto.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = antes; };
  }, []);

  const subir = useCallback(async (x: InformeOT) => {
    const patch: Partial<InformeOT> = {};
    EDITABLES.forEach(k => { (patch as Record<string, unknown>)[k] = x[k]; });
    setEstadoGuardado('guardando');
    try {
      await informesService.guardar(x.id, patch);
      try { localStorage.removeItem(claveLocal); } catch { /* ok */ }
      cambiado.current = false;
      setEstadoGuardado('ok');
      return true;
    } catch {
      setEstadoGuardado(navigator.onLine ? 'pendiente' : 'sin-senal');
      return false;
    }
  }, [claveLocal]);

  // Cada cambio: copia en el equipo al tiro y al servidor a los 2 segundos.
  useEffect(() => {
    if (!cambiado.current || firmado) return;
    try {
      const copia: Partial<InformeOT> = {};
      EDITABLES.forEach(k => { (copia as Record<string, unknown>)[k] = d[k]; });
      localStorage.setItem(claveLocal, JSON.stringify(copia));
    } catch { /* ok */ }
    setEstadoGuardado('pendiente');
    const t = setTimeout(() => { subir(d); }, 2000);
    return () => clearTimeout(t);
  }, [d, firmado, subir, claveLocal]);

  const set = (patch: Partial<InformeOT>) => { cambiado.current = true; setD(x => ({ ...x, ...patch })); };
  const setMat = (i: number, patch: Partial<MaterialInforme>) => set({ materiales: d.materiales.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  const cerrar = async () => {
    if (cambiado.current && !firmado) await subir(d);
    onCambio();
    onCerrar();
  };

  const agregarFotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setSubiendo(true);
    try {
      const nuevas = [];
      for (const f of Array.from(files).slice(0, 12)) nuevas.push({ path: await archivosOT.subir(`${ot.id}/informes`, f), caption: '' });
      set({ fotos: [...d.fotos, ...nuevas] });
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo subir la foto'); }
    finally { setSubiendo(false); if (fotoRef.current) fotoRef.current.value = ''; }
  };
  const quitarFoto = (path: string) => {
    set({ fotos: d.fotos.filter(f => f.path !== path) });
    archivosOT.eliminar(path).catch(() => {});
  };

  const aFirma = () => {
    if (!d.trabajos?.trim()) { toastError('Describe los trabajos realizados.'); return; }
    if (!d.resultado) { toastError('Elige el resultado de la visita.'); return; }
    if (d.resultado !== 'solucionado' && !d.pendiente?.trim()) { toastError('Cuenta qué quedó pendiente y por qué.'); return; }
    setFase('firma');
  };

  const firmar = async () => {
    if (!d.recibido_por?.trim()) { toastError('Escribe el nombre de quien recibe.'); return; }
    if (!firma) { toastError('Falta la firma del cliente.'); return; }
    setOcupado(true);
    try {
      if (!(await subir(d))) throw new Error('Sin conexión: el informe quedó guardado en este equipo. Firma cuando vuelva la señal.');
      const path = await archivosOT.subir(`${ot.id}/firmas`, dataUriABlob(firma), true);
      const firmadoAt = new Date().toISOString();
      await informesService.guardar(d.id, { firma_path: path, estado: 'firmado', firmado_at: firmadoAt });
      setD(x => ({ ...x, firma_path: path, estado: 'firmado', firmado_at: firmadoAt }));
      setFirma('');
      success('Informe firmado. Coordinación recibe el aviso.');
      onCambio();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo firmar'); }
    finally { setOcupado(false); }
  };

  const reabrir = async () => {
    try { await informesService.guardar(d.id, { estado: 'borrador' }); setD(x => ({ ...x, estado: 'borrador' })); setFase('contenido'); onCambio(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo reabrir'); }
  };

  const pdfInforme = async () => {
    if (!empresa) { toastError('Falta configurar la empresa'); return; }
    setOcupado(true);
    try { await descargarInformePDF(ot, d, empresa, tecnicoNombre); }
    catch { toastError('No se pudo generar el PDF'); }
    finally { setOcupado(false); }
  };

  const Rotulo = ({ children }: { children: React.ReactNode }) => <span className="mb-1.5 block text-sm font-medium text-content">{children}</span>;
  const pideDetalle = !!d.resultado && d.resultado !== 'solucionado';

  return (
    <div className="fixed inset-0 z-[250] flex flex-col bg-surface-2" role="dialog" aria-modal="true" aria-label={`Informe ${folioInforme(d.folio)}`}>
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}>
        <button onClick={cerrar} aria-label="Volver" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-content-muted hover:bg-surface-3">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-content">Informe {folioInforme(d.folio)} · {folioOT(ot.folio)}</p>
          <p className="truncate text-xs text-content-muted">{ot.clientes?.nombre_cliente || 'Sin cliente'}{ot.direccion ? ` · ${ot.direccion}` : ''}</p>
        </div>
        {!firmado && (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${estadoGuardado === 'sin-senal' ? 'bg-red-500/10 text-[var(--danger)]' : 'bg-surface-3 text-content-muted'}`}>
            {estadoGuardado === 'ok' ? '✓ Guardado' : estadoGuardado === 'guardando' ? 'Guardando…' : estadoGuardado === 'sin-senal' ? 'Sin señal: guardado en el equipo' : 'Por guardar'}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
          {firmado ? (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-[var(--success)]"><Check size={16} /> Firmado por {d.recibido_por || 'el cliente'} el {formatDate(d.firmado_at)}</p>
              <dl className="mt-3 flex flex-col gap-3 text-sm text-content">
                {d.falla_observada && <div><dt className="text-content-muted">Falla observada</dt><dd className="whitespace-pre-wrap">{d.falla_observada}</dd></div>}
                <div><dt className="text-content-muted">Trabajos realizados</dt><dd className="whitespace-pre-wrap">{d.trabajos}</dd></div>
                <div><dt className="text-content-muted">Resultado</dt><dd className="font-medium">{RESULTADOS.find(r => r.clave === d.resultado)?.nombre || '—'}</dd></div>
                {d.pendiente && <div><dt className="text-content-muted">Pendiente</dt><dd className="whitespace-pre-wrap">{d.pendiente}</dd></div>}
                {d.materiales.length > 0 && <div><dt className="text-content-muted">Materiales</dt><dd>{d.materiales.map(m => `${m.cantidad} ${m.unidad} ${m.descripcion}${m.serie ? ` (S/N ${m.serie})` : ''}`).join(' · ')}</dd></div>}
              </dl>
              {d.fotos.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {d.fotos.map(f => urls[f.path] ? <img key={f.path} src={urls[f.path]} alt={f.caption || 'Foto'} className="aspect-square w-full rounded-lg object-cover" /> : null)}
                </div>
              )}
              {d.firma_path && urls[d.firma_path] && <img src={urls[d.firma_path]} alt="Firma" className="mt-3 h-16 rounded bg-white p-1" />}
            </div>
          ) : fase === 'firma' ? (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="mb-3 text-sm font-bold text-content">Recepción del cliente</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label><Rotulo>Nombre de quien recibe *</Rotulo>
                  <input className={campo} value={d.recibido_por || ''} onChange={e => set({ recibido_por: e.target.value })} autoFocus /></label>
                <label><Rotulo>RUT (opcional)</Rotulo>
                  <input className={campo} value={d.recibido_rut || ''} onChange={e => set({ recibido_rut: e.target.value })} /></label>
                <label className="sm:col-span-2"><Rotulo>Correo de quien recibe (opcional)</Rotulo>
                  <input className={campo} type="email" inputMode="email" value={d.recibido_email || ''} onChange={e => set({ recibido_email: e.target.value })} /></label>
              </div>
              <p className="mb-1.5 mt-4 text-sm text-content-muted">Pídele al cliente que firme aquí 👇</p>
              <div className="rounded-xl bg-white"><FirmaPad onChange={setFirma} /></div>
            </div>
          ) : (
            <>
              <label><Rotulo>Falla observada</Rotulo>
                <textarea className={campo} rows={2} value={d.falla_observada || ''} onChange={e => set({ falla_observada: e.target.value })}
                  placeholder="Qué se encontró al llegar (estado inicial)." /></label>
              <label><Rotulo>Trabajos realizados *</Rotulo>
                <textarea className={campo} rows={4} value={d.trabajos || ''} onChange={e => set({ trabajos: e.target.value })}
                  placeholder="Qué se hizo, qué se cambió, mediciones…" /></label>

              {d.checklist.length > 0 && (
                <div className="rounded-2xl border border-line bg-surface p-3">
                  <Rotulo>Verificaciones</Rotulo>
                  {d.checklist.map((c, i) => (
                    <label key={i} className="flex cursor-pointer items-center gap-3 py-2 text-[15px] text-content">
                      <input type="checkbox" checked={c.ok} className="h-5 w-5 shrink-0" style={{ accentColor: 'var(--y-brand)' }}
                        onChange={e => set({ checklist: d.checklist.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)) })} />
                      <span>{c.texto}</span>
                    </label>
                  ))}
                </div>
              )}

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-content">Materiales usados</span>
                  <button type="button" className="text-sm font-medium text-accent" onClick={() => set({ materiales: [...d.materiales, { descripcion: '', cantidad: 1, unidad: 'un', serie: '' }] })}>+ Agregar</button>
                </div>
                {d.materiales.length === 0 && <p className="text-xs text-content-muted">Sin materiales. Agrega los que usaste.</p>}
                <div className="flex flex-col gap-2">
                  {d.materiales.map((m, i) => (
                    <div key={i} className="rounded-xl border border-line bg-surface p-2">
                      <div className="flex gap-2">
                        <input className={`${campo} flex-1`} value={m.descripcion} placeholder="Material / equipo" onChange={e => setMat(i, { descripcion: e.target.value })} />
                        <button type="button" onClick={() => set({ materiales: d.materiales.filter((_, j) => j !== i) })} aria-label="Quitar material" className="shrink-0 px-2 text-content-muted hover:text-[var(--danger)]"><X size={18} /></button>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <NumeroInput className={campo} decimales={3} min={0} value={m.cantidad} placeholder="Cant." ariaLabel="Cantidad"
                          onChange={v => setMat(i, { cantidad: v })} />
                        <input className={campo} value={m.unidad} placeholder="Unidad" onChange={e => setMat(i, { unidad: e.target.value })} />
                        <input className={campo} value={m.serie || ''} placeholder="N° serie" onChange={e => setMat(i, { serie: e.target.value })} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-content">Fotos ({d.fotos.length})</span>
                  <button type="button" onClick={() => fotoRef.current?.click()} disabled={subiendo}
                    className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-accent">
                    {subiendo ? <Loader2 size={14} className="iv-spin" /> : <Camera size={14} />} Agregar</button>
                  <input ref={fotoRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={e => agregarFotos(e.target.files)} />
                </div>
                {d.fotos.length === 0 && <p className="text-xs text-content-muted">Fotos del antes y el después, con una descripción breve: van en el PDF y en la cotización.</p>}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {d.fotos.map((f, i) => (
                    <div key={f.path} className="flex gap-2 rounded-xl border border-line bg-surface p-2">
                      {urls[f.path] ? <img src={urls[f.path]} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" /> : <div className="skeleton h-20 w-20 shrink-0" />}
                      <textarea className={`${campo} flex-1`} rows={2} value={f.caption} placeholder="Descripción breve"
                        onChange={e => set({ fotos: d.fotos.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)) })} />
                      <button type="button" onClick={() => quitarFoto(f.path)} aria-label="Quitar foto" className="shrink-0 px-1 text-content-muted hover:text-[var(--danger)]"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Rotulo>Resultado *</Rotulo>
                <div className="grid grid-cols-2 gap-2">
                  {RESULTADOS.map(r => {
                    const activo = d.resultado === r.clave;
                    return (
                      <button key={r.clave} type="button" onClick={() => set({ resultado: r.clave })} aria-pressed={activo}
                        className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${activo ? 'border-[var(--y-brand)] bg-[var(--y-soft)] text-content' : 'border-line text-content-muted hover:bg-surface-3'}`}>
                        {r.nombre}
                      </button>
                    );
                  })}
                </div>
              </div>
              {pideDetalle && (
                <label><Rotulo>¿Qué quedó pendiente y por qué? *</Rotulo>
                  <textarea className={campo} rows={3} value={d.pendiente || ''} onChange={e => set({ pendiente: e.target.value })}
                    placeholder="Falta material, hay que cotizar el cambio del tablero, el cliente no estaba…" /></label>
              )}
              <label><Rotulo>Observaciones internas (no van al cliente)</Rotulo>
                <textarea className={campo} rows={2} value={d.observaciones || ''} onChange={e => set({ observaciones: e.target.value })} /></label>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface px-4 py-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        {firmado ? <>
          <button className="btn btn-ghost" onClick={pdfInforme} disabled={ocupado}>{ocupado ? <Loader2 size={14} className="iv-spin" /> : <FileDown size={14} />} PDF</button>
          {puedeReabrir && <button className="btn btn-ghost" onClick={reabrir}><RotateCcw size={14} /> Reabrir</button>}
          <button className="btn btn-primary" onClick={cerrar}>Listo</button>
        </> : fase === 'firma' ? <>
          <button className="btn btn-ghost" onClick={() => setFase('contenido')}><ArrowLeft size={14} /> Volver al informe</button>
          <button className="btn btn-primary" onClick={firmar} disabled={ocupado || !firma}>{ocupado ? <Loader2 size={14} className="iv-spin" /> : <Check size={14} />} Firmar y cerrar el informe</button>
        </> : <>
          <button className="btn btn-ghost" onClick={cerrar}>Guardar y salir</button>
          <button className="btn btn-primary" onClick={aFirma}><PenLine size={14} /> Firma del cliente</button>
        </>}
      </div>
    </div>
  );
}
