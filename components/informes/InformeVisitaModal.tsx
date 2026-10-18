'use client';

/**
 * Un informe de la visita, a pantalla completa y por pasos (como los tickets de TecApp): cada
 * sección de la planilla es un paso; al final, el checklist. Se guarda solo mientras se escribe.
 * «Completar» revisa las obligatorias; completado se puede reabrir para corregir.
 * Fase 11:
 *   · Respaldo en el teléfono: si se cae la señal, lo escrito queda guardado en el navegador y
 *     se recupera al volver a abrir el informe (si es más nuevo que lo que hay en el servidor).
 *   · El primer paso muestra el objetivo del levantamiento y las instrucciones para el técnico.
 *   · Respeta el área segura del celular (muesca y barra de estado): antes el encabezado
 *     quedaba tapado arriba.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Download, Info, Loader2, RotateCcw, WifiOff, X } from 'lucide-react';
import FormularioInforme from '@/components/informes/FormularioInforme';
import TextoFormato from '@/components/TextoFormato';
import { conDatosFijos, faltantes, folioInforme, informesVisitaService, seccionesDe, type DatosPrecarga, type InformeLleno, type InformeVisita } from '@/services/informes';
import { useToast } from '@/hooks/useToast';

type Respaldo = { t: number; respuestas: InformeVisita['respuestas']; checklist: InformeVisita['checklist'] };
const claveRespaldo = (id: string) => `innvolt.informe.${id}`;
function leerRespaldo(id: string): Respaldo | null {
  try { const r = localStorage.getItem(claveRespaldo(id)); return r ? JSON.parse(r) as Respaldo : null; } catch { return null; }
}
function escribirRespaldo(id: string, r: Respaldo | null) {
  try { if (r) localStorage.setItem(claveRespaldo(id), JSON.stringify(r)); else localStorage.removeItem(claveRespaldo(id)); } catch { /* sin almacenamiento */ }
}

export default function InformeVisitaModal({ informe: inicial, editable, onCerrar, onPDF, fijos }: {
  informe: InformeVisita; editable: boolean; onCerrar: (actualizado: InformeVisita) => void; onPDF: (i: InformeVisita) => void;
  /** Los datos de la cita (cliente, dirección, contacto…): mandan sobre lo guardado en el informe. */
  fijos?: DatosPrecarga;
}) {
  const { success, error: toastError, warning } = useToast();
  const cambiado = useRef(false);
  // Si hay un respaldo local más nuevo que lo del servidor, se parte de él.
  const [d, setD] = useState<InformeVisita>(() => {
    const r = inicial.estado === 'borrador' ? leerRespaldo(inicial.id) : null;
    const servidor = new Date(inicial.updated_at || inicial.created_at).getTime();
    let base = inicial;
    if (r && r.t > servidor) { cambiado.current = true; base = { ...inicial, respuestas: r.respuestas, checklist: r.checklist }; }
    // Un informe en borrador se actualiza con los datos de la cita (si la cita cambió).
    if (fijos && base.estado === 'borrador' && editable) {
      const f = conDatosFijos(base, fijos);
      if (f.cambio) { cambiado.current = true; base = f.informe; }
    }
    return base;
  });
  const [paso, setPaso] = useState(0);
  const [marcar, setMarcar] = useState(false);
  const [estadoGuardado, setEstadoGuardado] = useState<'ok' | 'guardando' | 'pendiente' | 'sin_red'>(cambiado.current ? 'pendiente' : 'ok');
  const completado = d.estado === 'completado';
  const puedeEditar = editable && !completado;

  useEffect(() => { const a = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = a; }; }, []);
  useEffect(() => { if (cambiado.current) warning('Se recuperó lo que no alcanzó a guardarse.'); }, [warning]);

  const subir = useCallback(async (x: InformeVisita) => {
    setEstadoGuardado('guardando');
    try {
      await informesVisitaService.guardar(x.id, { respuestas: x.respuestas, checklist: x.checklist });
      cambiado.current = false; setEstadoGuardado('ok'); escribirRespaldo(x.id, null); return true;
    } catch { setEstadoGuardado('sin_red'); return false; }
  }, []);
  useEffect(() => {
    if (!cambiado.current) return;
    escribirRespaldo(d.id, { t: Date.now(), respuestas: d.respuestas, checklist: d.checklist });
    setEstadoGuardado(s => (s === 'sin_red' ? s : 'pendiente'));
    const t = setTimeout(() => { subir(d); }, 1200);
    return () => clearTimeout(t);
  }, [d, subir]);
  // Al volver la señal, reintenta.
  useEffect(() => {
    const alVolver = () => { if (cambiado.current) subir(d); };
    window.addEventListener('online', alVolver);
    return () => window.removeEventListener('online', alVolver);
  }, [d, subir]);

  // El paso activo, siempre a la vista en la barra de pasos (en el celular no caben todos).
  useEffect(() => {
    document.getElementById(`paso-informe-${paso}`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
    document.getElementById('informe-cuerpo')?.scrollTo({ top: 0 });
  }, [paso]);

  const secciones = seccionesDe(d);
  const conChecklist = d.checklist.length > 0;
  const total = secciones.length + (conChecklist ? 1 : 0);
  const pasoSeguro = Math.min(paso, Math.max(total - 1, 0));
  const titulos = [...secciones.map(s => s.titulo), ...(conChecklist ? ['Checklist'] : [])];
  const enChecklist = conChecklist && pasoSeguro === secciones.length;
  const faltan = marcar ? faltantes(d) : [];
  const faltanEn = (i: number) => (secciones[i] ? secciones[i].campos.filter(c => faltan.some(f => f.clave === c.clave)).length : 0);

  const cambiar = (i: InformeLleno) => { cambiado.current = true; setD(x => ({ ...x, respuestas: i.respuestas, checklist: i.checklist })); };
  const cerrar = async () => {
    if (cambiado.current && !(await subir(d))) warning('Sin conexión: lo escrito quedó guardado en este teléfono y se subirá al volver a abrirlo.');
    onCerrar(d);
  };

  const completar = async () => {
    const f = faltantes(d);
    if (f.length) {
      setMarcar(true);
      const i = secciones.findIndex(s => s.campos.some(c => c.clave === f[0].clave));
      if (i >= 0) setPaso(i);
      toastError(`Falta: ${f.slice(0, 3).map(c => c.etiqueta).join(', ')}${f.length > 3 ? '…' : ''}`);
      return;
    }
    try {
      await informesVisitaService.guardar(d.id, { respuestas: d.respuestas, checklist: d.checklist, estado: 'completado' });
      cambiado.current = false; escribirRespaldo(d.id, null);
      const listo = { ...d, estado: 'completado' as const };
      setD(listo); success('Informe completado'); onCerrar(listo);
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo completar (¿sin conexión?)'); }
  };
  const reabrir = async () => {
    try { await informesVisitaService.guardar(d.id, { estado: 'borrador' }); setD(x => ({ ...x, estado: 'borrador' })); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo reabrir'); }
  };

  const estadoTexto = completado ? 'Completado'
    : estadoGuardado === 'ok' ? 'Guardado' : estadoGuardado === 'guardando' ? 'Guardando…'
    : estadoGuardado === 'sin_red' ? 'Sin conexión · guardado en el teléfono' : 'Sin guardar';

  // En un portal: dentro del modal de la cita, «fixed» quedaría atrapado en su caja.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={d.plantilla_nombre || 'Informe de visita'}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '100dvh', zIndex: 10000, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 0.75rem', paddingTop: 'calc(0.6rem + env(safe-area-inset-top, 0px))', borderBottom: '1px solid var(--border2)', background: 'var(--bg2)', flexShrink: 0 }}>
        <button className="btn btn-ghost btn-sm" onClick={cerrar} aria-label="Cerrar" style={{ flexShrink: 0 }}><X size={16} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.plantilla_nombre || 'Informe de visita'}</p>
          <p style={{ margin: 0, fontSize: '0.72rem', color: estadoGuardado === 'sin_red' ? 'var(--danger)' : 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {estadoGuardado === 'sin_red' && <WifiOff size={11} style={{ verticalAlign: -1, marginRight: 3 }} />}
            {folioInforme(d.folio)}{d.plantilla_version ? ` · v${d.plantilla_version}` : ''} · {estadoTexto}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => onPDF(d)} title="Descargar el PDF de este informe" style={{ flexShrink: 0 }}><Download size={14} /><span className="hide-mobile"> PDF</span></button>
        {completado && editable && <button className="btn btn-ghost btn-sm" onClick={reabrir} title="Reabrir para corregir" style={{ flexShrink: 0 }}><RotateCcw size={13} /><span className="hide-mobile"> Reabrir</span></button>}
      </div>

      {total > 1 && (
        <div style={{ display: 'flex', gap: 6, padding: '0.5rem 0.75rem', overflowX: 'auto', borderBottom: '1px solid var(--border2)', flexShrink: 0, scrollbarWidth: 'none' }}>
          {titulos.map((t, i) => {
            const on = i === pasoSeguro; const n = faltanEn(i);
            return (
              <button key={i} id={`paso-informe-${i}`} type="button" onClick={() => setPaso(i)}
                style={{ flexShrink: 0, cursor: 'pointer', fontSize: '0.78rem', padding: '0.35rem 0.75rem', borderRadius: 999, whiteSpace: 'nowrap',
                  border: `1px solid ${on ? 'var(--y-brand)' : n ? 'var(--danger)' : 'var(--border2)'}`, background: on ? 'var(--y-soft)' : 'transparent', color: 'var(--text)', fontWeight: on ? 600 : 400 }}>
                {i + 1}. {t}{n ? ` (${n})` : ''}
              </button>
            );
          })}
        </div>
      )}

      <div id="informe-cuerpo" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '1rem 0.9rem', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', minWidth: 0 }}>
          {total > 1 && <p className="section-label" style={{ marginTop: 0 }}>{pasoSeguro + 1} de {total} · {titulos[pasoSeguro]}</p>}
          {pasoSeguro === 0 && !enChecklist && (d.objetivo?.trim() || d.instrucciones?.trim() || d.intro?.trim()) && (
            <div style={{ border: '1px solid var(--border2)', background: 'var(--bg3)', borderRadius: 10, padding: '0.6rem 0.75rem', marginBottom: 14, fontSize: '0.84rem', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {d.objetivo?.trim() && <span><b>Objetivo:</b> {d.objetivo}</span>}
              {d.instrucciones?.trim() && <span style={{ display: 'flex', gap: 6 }}><Info size={14} color="var(--y)" style={{ flexShrink: 0, marginTop: 2 }} /><span>{d.instrucciones}</span></span>}
              {!d.objetivo?.trim() && !d.instrucciones?.trim() && d.intro?.trim() && <TextoFormato texto={d.intro} style={{ color: 'var(--muted)' }} />}
            </div>
          )}
          <FormularioInforme informe={d} onCambiar={cambiar} editable={puedeEditar} grande seccion={total > 0 ? pasoSeguro : undefined}
            carpetaFotos={`visitas/${d.agendamiento_id}/informes`} marcarFaltantes={marcar} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '0.6rem 0.75rem', paddingBottom: 'calc(0.6rem + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--border2)', background: 'var(--bg2)', flexShrink: 0 }}>
        <button className="btn btn-ghost" disabled={pasoSeguro === 0} onClick={() => setPaso(pasoSeguro - 1)}><ArrowLeft size={14} /> Anterior</button>
        <span style={{ flex: 1 }} />
        {pasoSeguro < total - 1
          ? <button className="btn btn-primary" onClick={() => setPaso(pasoSeguro + 1)}>Siguiente <ArrowRight size={14} /></button>
          : puedeEditar
            ? <button className="btn btn-primary" onClick={completar}>{estadoGuardado === 'guardando' ? <Loader2 size={14} className="iv-spin" /> : <Check size={14} />} Completar</button>
            : <button className="btn btn-primary" onClick={cerrar}><CheckCircle2 size={14} /> Listo</button>}
      </div>
    </div>,
    document.body,
  );
}
