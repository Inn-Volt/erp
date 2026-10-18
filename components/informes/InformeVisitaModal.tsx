'use client';

/**
 * Un informe de la visita, a pantalla completa y por pasos (como los tickets de TecApp): cada
 * sección de la planilla es un paso; al final, el checklist. Se guarda solo mientras se escribe.
 * «Completar» revisa las obligatorias; completado se puede reabrir para corregir.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Download, Loader2, RotateCcw, X } from 'lucide-react';
import FormularioInforme from '@/components/informes/FormularioInforme';
import TextoFormato from '@/components/TextoFormato';
import { faltantes, folioInforme, informesVisitaService, seccionesDe, type InformeLleno, type InformeVisita } from '@/services/informes';
import { useToast } from '@/hooks/useToast';

export default function InformeVisitaModal({ informe: inicial, editable, onCerrar, onPDF }: {
  informe: InformeVisita; editable: boolean; onCerrar: (actualizado: InformeVisita) => void; onPDF: (i: InformeVisita) => void;
}) {
  const { success, error: toastError } = useToast();
  const [d, setD] = useState<InformeVisita>(inicial);
  const [paso, setPaso] = useState(0);
  const [marcar, setMarcar] = useState(false);
  const [estadoGuardado, setEstadoGuardado] = useState<'ok' | 'guardando' | 'pendiente'>('ok');
  const cambiado = useRef(false);
  const completado = d.estado === 'completado';
  const puedeEditar = editable && !completado;

  useEffect(() => { const a = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = a; }; }, []);

  const subir = useCallback(async (x: InformeVisita) => {
    setEstadoGuardado('guardando');
    try {
      await informesVisitaService.guardar(x.id, { respuestas: x.respuestas, checklist: x.checklist });
      cambiado.current = false; setEstadoGuardado('ok'); return true;
    } catch { setEstadoGuardado('pendiente'); return false; }
  }, []);
  useEffect(() => {
    if (!cambiado.current) return;
    setEstadoGuardado('pendiente');
    const t = setTimeout(() => { subir(d); }, 1200);
    return () => clearTimeout(t);
  }, [d, subir]);

  // El paso activo, siempre a la vista en la barra de pasos (en el celular no caben todos).
  useEffect(() => { document.getElementById(`paso-informe-${paso}`)?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [paso]);

  const secciones = seccionesDe(d);
  const conChecklist = d.checklist.length > 0;
  const total = secciones.length + (conChecklist ? 1 : 0);
  const pasoSeguro = Math.min(paso, Math.max(total - 1, 0));
  const titulos = [...secciones.map(s => s.titulo), ...(conChecklist ? ['Checklist'] : [])];
  const enChecklist = conChecklist && pasoSeguro === secciones.length;
  const faltanEn = (i: number) => (secciones[i] ? secciones[i].campos.filter(c => faltantes(d).some(f => f.clave === c.clave)).length : 0);

  const cambiar = (i: InformeLleno) => { cambiado.current = true; setD(x => ({ ...x, respuestas: i.respuestas, checklist: i.checklist })); };
  const cerrar = async () => { if (cambiado.current) await subir(d); onCerrar(d); };

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
      cambiado.current = false;
      const listo = { ...d, estado: 'completado' as const };
      setD(listo); success('Informe completado'); onCerrar(listo);
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo completar'); }
  };
  const reabrir = async () => {
    try { await informesVisitaService.guardar(d.id, { estado: 'borrador' }); setD(x => ({ ...x, estado: 'borrador' })); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo reabrir'); }
  };

  // En un portal: dentro del modal de la cita, «fixed» quedaría atrapado en su caja.
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem 1rem', borderBottom: '1px solid var(--border2)', background: 'var(--bg2)' }}>
        <button className="btn btn-ghost btn-sm" onClick={cerrar} aria-label="Cerrar"><X size={16} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.plantilla_nombre || 'Informe de visita'}</p>
          <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted)' }}>
            {folioInforme(d.folio)} · {completado ? 'Completado' : estadoGuardado === 'ok' ? 'Guardado' : estadoGuardado === 'guardando' ? 'Guardando…' : 'Sin guardar'}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => onPDF(d)} title="Descargar el PDF de este informe"><Download size={14} /> PDF</button>
        {completado && editable && <button className="btn btn-ghost btn-sm" onClick={reabrir}><RotateCcw size={13} /> Reabrir</button>}
      </div>

      {total > 1 && (
        <div style={{ display: 'flex', gap: 6, padding: '0.6rem 1rem', overflowX: 'auto', borderBottom: '1px solid var(--border2)' }}>
          {titulos.map((t, i) => {
            const on = i === pasoSeguro; const n = marcar ? faltanEn(i) : 0;
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          {total > 1 && <p className="section-label" style={{ marginTop: 0 }}>{titulos[pasoSeguro]}</p>}
          {pasoSeguro === 0 && !enChecklist && d.intro?.trim() && <TextoFormato texto={d.intro} style={{ fontSize: '0.86rem', color: 'var(--muted)', marginBottom: 12 }} />}
          <FormularioInforme informe={d} onCambiar={cambiar} editable={puedeEditar} grande seccion={total > 0 ? pasoSeguro : undefined}
            carpetaFotos={`visitas/${d.agendamiento_id}/informes`} marcarFaltantes={marcar} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '0.75rem 1rem', borderTop: '1px solid var(--border2)', background: 'var(--bg2)' }}>
        <button className="btn btn-ghost" disabled={pasoSeguro === 0} onClick={() => setPaso(pasoSeguro - 1)}><ArrowLeft size={14} /> Anterior</button>
        <span style={{ flex: 1 }} />
        {pasoSeguro < total - 1
          ? <button className="btn btn-primary" onClick={() => setPaso(pasoSeguro + 1)}>Siguiente <ArrowRight size={14} /></button>
          : puedeEditar
            ? <button className="btn btn-primary" onClick={completar}>{estadoGuardado === 'guardando' ? <Loader2 size={14} className="iv-spin" /> : <Check size={14} />} Completar informe</button>
            : <button className="btn btn-primary" onClick={cerrar}><CheckCircle2 size={14} /> Listo</button>}
      </div>
    </div>,
    document.body,
  );
}
