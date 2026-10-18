'use client';

/** Plantillas de informe (TecApp): el checklist que trae cada informe según el tipo de trabajo. */

import { useEffect, useState } from 'react';
import { ClipboardCheck, Plus, Save, Trash2, X } from 'lucide-react';
import { plantillasInformeService, type PlantillaInforme } from '@/services/fase5';
import { TIPO_SERVICIO_OPCIONES } from '@/types/solicitud';
import { useToast } from '@/hooks/useToast';

export default function PlantillasInforme({ onCerrar }: { onCerrar: () => void }) {
  const { success, error: toastError } = useToast();
  const [lista, setLista] = useState<PlantillaInforme[]>([]);
  const [sel, setSel] = useState<Partial<PlantillaInforme> | null>(null);
  const cargar = () => plantillasInformeService.listar().then(setLista).catch(e => toastError(e instanceof Error ? e.message : 'Falta el SQL de la fase 5'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, []);
  const guardar = async () => {
    if (!sel?.nombre?.trim()) { toastError('Ponle nombre'); return; }
    try {
      await plantillasInformeService.guardar({ ...sel, nombre: sel.nombre.trim(), checklist: (sel.checklist || []).filter(c => c.texto.trim()) });
      success('Plantilla guardada'); setSel(null); cargar();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
  };
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="modal-box" style={{ maxWidth: 620, width: '95%', display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}><ClipboardCheck size={15} /> Plantillas de informe</p>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!sel ? (<>
            {lista.map(p => (
              <button key={p.id} type="button" onClick={() => setSel({ ...p, checklist: [...p.checklist] })}
                style={{ textAlign: 'left', border: '1px solid var(--border2)', borderRadius: 8, padding: '0.55rem 0.75rem', background: 'var(--bg2)', cursor: 'pointer', color: 'var(--text)' }}>
                <b>{p.nombre}</b> <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{p.tipo_servicio ? `· ${TIPO_SERVICIO_OPCIONES.find(t => t.key === p.tipo_servicio)?.label || p.tipo_servicio} · ` : '· '}{p.checklist.length} verificaciones</span>
              </button>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSel({ nombre: '', tipo_servicio: null, checklist: [{ texto: '' }], activa: true })}><Plus size={13} /> Nueva plantilla</button>
            <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>Al crear un informe, la OT usa la plantilla de su tipo de servicio (o la que elijas).</p>
          </>) : (<>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
              <label><span className="label-muted">Nombre</span><input className="input" value={sel.nombre || ''} onChange={e => setSel({ ...sel, nombre: e.target.value })} /></label>
              <label><span className="label-muted">Tipo de servicio</span>
                <select className="input" value={sel.tipo_servicio || ''} onChange={e => setSel({ ...sel, tipo_servicio: e.target.value || null })}>
                  <option value="">Cualquiera</option>{TIPO_SERVICIO_OPCIONES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
            </div>
            <span className="label-muted">Verificaciones</span>
            {(sel.checklist || []).map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 6 }}>
                <input className="input" value={c.texto} onChange={e => setSel({ ...sel, checklist: (sel.checklist || []).map((x, j) => (j === i ? { texto: e.target.value } : x)) })} />
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSel({ ...sel, checklist: (sel.checklist || []).filter((_, j) => j !== i) })}><Trash2 size={12} /></button>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSel({ ...sel, checklist: [...(sel.checklist || []), { texto: '' }] })}><Plus size={13} /> Verificación</button>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {sel.id && <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={async () => {
                try { await plantillasInformeService.guardar({ id: sel.id, activa: false }); setSel(null); cargar(); } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
              }}>Desactivar</button>}
              <button className="btn btn-ghost" onClick={() => setSel(null)}>Volver</button>
              <button className="btn btn-primary" onClick={guardar}><Save size={14} /> Guardar</button>
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}
