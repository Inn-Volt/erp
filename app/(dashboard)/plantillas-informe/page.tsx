'use client';

/**
 * Mi empresa → Plantillas de informe (fase 8). Cada plantilla trae una introducción, preguntas
 * (texto, número, sí/no u opciones) y un checklist, y es de uno de dos tipos:
 *   · Visita  — se llena en la cita de la agenda; lo respondido pasa a la cotización.
 *   · Entrega — el acta al terminar el trabajo, con la firma del cliente.
 * A la derecha se ve cómo queda el formulario mientras se edita.
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ClipboardCheck, Copy, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import EditorFormato from '@/components/EditorFormato';
import FormularioInforme from '@/components/informes/FormularioInforme';
import {
  claveDe, informeDesde, plantillasInformeServicio, TIPOS_CAMPO,
  type CampoInforme, type PlantillaInformeCompleta, type TipoPlantillaInforme,
} from '@/services/informes';
import { TIPO_SERVICIO_OPCIONES } from '@/types/solicitud';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';

const NOMBRE_TIPO: Record<TipoPlantillaInforme, { nombre: string; ayuda: string }> = {
  visita: { nombre: 'Visita', ayuda: 'Se llena en la cita de la agenda; lo respondido pasa a la cotización.' },
  entrega: { nombre: 'Entrega', ayuda: 'El acta al terminar el trabajo, con la recepción conforme y la firma del cliente.' },
};

const nueva = (tipo: TipoPlantillaInforme): Partial<PlantillaInformeCompleta> => ({ nombre: '', tipo, tipo_servicio: null, intro: '', campos: [], checklist: [], activa: true });

export default function PlantillasInformePage() {
  const { puedeAlguno } = usePermisos();
  const { success, error: toastError } = useToast();
  const edita = puedeAlguno(['cotizaciones.aprobar', 'configuracion.gestionar']);
  const [lista, setLista] = useState<PlantillaInformeCompleta[]>([]);
  const [tipo, setTipo] = useState<TipoPlantillaInforme>('visita');
  const [sel, setSel] = useState<Partial<PlantillaInformeCompleta> | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [falta, setFalta] = useState(false);
  const [vista, setVista] = useState(informeDesde(null));

  const cargar = useCallback(async () => {
    try { setLista(await plantillasInformeServicio.listar({ todas: true })); }
    catch (e) { if (/tipo|campos|schema cache|does not exist/i.test((e as Error).message || '')) setFalta(true); else toastError((e as Error).message); }
  }, [toastError]);
  useEffect(() => { cargar(); }, [cargar]);
  // La vista previa se rehace con cada cambio de la plantilla.
  useEffect(() => {
    // Mientras se edita, las preguntas nuevas aún no tienen clave: la vista previa las numera.
    const campos = (sel?.campos || []).map((c, i) => ({ ...c, clave: c.clave || `${claveDe(c.etiqueta)}_${i}` }));
    setVista(informeDesde(sel ? { ...(nueva('visita') as PlantillaInformeCompleta), ...sel, campos } as PlantillaInformeCompleta : null));
  }, [sel]);

  const setCampo = (i: number, patch: Partial<CampoInforme>) =>
    setSel(s => s && { ...s, campos: (s.campos || []).map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const moverCampo = (i: number, d: -1 | 1) => setSel(s => {
    if (!s) return s;
    const cs = [...(s.campos || [])]; const j = i + d;
    if (j < 0 || j >= cs.length) return s;
    [cs[i], cs[j]] = [cs[j], cs[i]]; return { ...s, campos: cs };
  });

  const guardar = async () => {
    if (!sel?.nombre?.trim()) { toastError('Ponle nombre a la plantilla'); return; }
    // Claves únicas y estables para cada pregunta.
    const usadas = new Set<string>();
    const campos = (sel.campos || []).filter(c => c.etiqueta.trim()).map(c => {
      let k = c.clave || claveDe(c.etiqueta); let n = 2;
      while (usadas.has(k)) k = `${claveDe(c.etiqueta)}_${n++}`;
      usadas.add(k);
      return { ...c, clave: k, etiqueta: c.etiqueta.trim(), opciones: c.tipo === 'opciones' ? (c.opciones || []).map(o => o.trim()).filter(Boolean) : undefined };
    });
    if (campos.some(c => c.tipo === 'opciones' && !(c.opciones || []).length)) { toastError('Una pregunta de opciones no tiene opciones'); return; }
    setGuardando(true);
    try {
      await plantillasInformeServicio.guardar({ ...sel, nombre: sel.nombre.trim(), campos, checklist: (sel.checklist || []).filter(c => c.texto.trim()) });
      success('Plantilla guardada'); setSel(null); cargar();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Mi empresa" title="Plantillas de informe" /><FaltaSQL archivo="supabase_fase8_informes.sql" /></div>;
  const deTipo = lista.filter(p => p.tipo === tipo);

  return (
    <div className="anim-in">
      <PageHeader eyebrow="Mi empresa" title="Plantillas de informe"
        subtitle="El formulario de la visita y el acta de entrega: preguntas, checklist e introducción, por tipo de trabajo."
        actions={edita && !sel ? <button className="btn btn-primary" onClick={() => setSel(nueva(tipo))}><Plus size={14} /> Nueva plantilla</button> : null} />

      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {(Object.keys(NOMBRE_TIPO) as TipoPlantillaInforme[]).map(t => (
          <button key={t} className="btn btn-sm" onClick={() => { setTipo(t); setSel(null); }}
            style={{ background: tipo === t ? 'var(--y-brand)' : 'var(--bg3)', color: tipo === t ? '#111' : 'var(--muted)' }}>{NOMBRE_TIPO[t].nombre}</button>
        ))}
        <span style={{ fontSize: '0.8rem', color: 'var(--muted)', marginLeft: 6 }}>{NOMBRE_TIPO[tipo].ayuda}</span>
      </div>

      {!sel ? (
        <div className="panel-y">
          {deTipo.length === 0 ? <p style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--muted)', margin: 0 }}>Aún no hay plantillas de {NOMBRE_TIPO[tipo].nombre.toLowerCase()}.</p>
            : deTipo.map(p => (
              <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '0.75rem 1rem', borderTop: '1px solid var(--border2)', opacity: p.activa ? 1 : 0.55, flexWrap: 'wrap' }}>
                <ClipboardCheck size={16} color="var(--y)" />
                <span style={{ flex: 1, minWidth: 200 }}>
                  <b style={{ color: 'var(--text)' }}>{p.nombre}</b>{!p.activa && <span style={{ color: 'var(--muted)' }}> · inactiva</span>}
                  <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)' }}>
                    {p.campos.length} pregunta{p.campos.length === 1 ? '' : 's'} · {p.checklist.length} en el checklist
                    {p.tipo_servicio ? ` · ${TIPO_SERVICIO_OPCIONES.find(t => t.key === p.tipo_servicio)?.label || p.tipo_servicio}` : ''}</span>
                </span>
                {edita && <>
                  <button className="btn btn-ghost btn-sm" title="Duplicar" onClick={() => setSel({ ...p, id: undefined, nombre: `${p.nombre} (copia)` })}><Copy size={13} /></button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSel({ ...p })}>Editar</button>
                </>}
              </div>
            ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, alignItems: 'start' }}>
          <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              <label><span className="label-muted">Nombre *</span><input className="input" value={sel.nombre || ''} onChange={e => setSel({ ...sel, nombre: e.target.value })} placeholder="Visita tablero, Entrega cargador…" autoFocus /></label>
              <label><span className="label-muted">Tipo</span>
                <select className="input" value={sel.tipo} onChange={e => setSel({ ...sel, tipo: e.target.value as TipoPlantillaInforme })}>
                  {(Object.keys(NOMBRE_TIPO) as TipoPlantillaInforme[]).map(t => <option key={t} value={t}>{NOMBRE_TIPO[t].nombre}</option>)}</select></label>
              <label><span className="label-muted">Tipo de servicio (opcional)</span>
                <select className="input" value={sel.tipo_servicio || ''} onChange={e => setSel({ ...sel, tipo_servicio: e.target.value || null })}>
                  <option value="">Cualquiera</option>{TIPO_SERVICIO_OPCIONES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
            </div>
            <div><span className="label-muted">Introducción (sale al comienzo del informe y del PDF)</span>
              <EditorFormato valor={sel.intro || ''} onCambiar={t => setSel(s => s && { ...s, intro: t })} alto={60} etiqueta="Introducción" /></div>

            <div>
              <span className="label-muted">Preguntas</span>
              {(sel.campos || []).map((c, i) => (
                <div key={i} style={{ border: '1px solid var(--border2)', borderRadius: 8, padding: '0.5rem', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <input className="input" style={{ flex: 1, minWidth: 160 }} value={c.etiqueta} placeholder="Estado del tablero" onChange={e => setCampo(i, { etiqueta: e.target.value })} />
                    <select className="input" style={{ width: 150 }} value={c.tipo} onChange={e => setCampo(i, { tipo: e.target.value as CampoInforme['tipo'] })}>
                      {TIPOS_CAMPO.map(t => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}</select>
                    <button type="button" className="btn btn-ghost btn-xs" aria-label="Subir" disabled={i === 0} onClick={() => moverCampo(i, -1)}><ArrowUp size={12} /></button>
                    <button type="button" className="btn btn-ghost btn-xs" aria-label="Bajar" disabled={i === (sel.campos || []).length - 1} onClick={() => moverCampo(i, 1)}><ArrowDown size={12} /></button>
                    <button type="button" className="btn btn-ghost btn-xs" aria-label="Quitar pregunta" onClick={() => setSel(s => s && { ...s, campos: (s.campos || []).filter((_, j) => j !== i) })}><Trash2 size={12} /></button>
                  </div>
                  {c.tipo === 'opciones' && (
                    <input className="input" value={(c.opciones || []).join(', ')} placeholder="Opciones separadas por coma: Bueno, Regular, Malo"
                      onChange={e => setCampo(i, { opciones: e.target.value.split(',').map(o => o.trimStart()) })} />
                  )}
                  {c.tipo === 'numero' && (
                    <input className="input" style={{ maxWidth: 160 }} value={c.unidad || ''} placeholder="Unidad (m, kW, A…)" onChange={e => setCampo(i, { unidad: e.target.value })} />
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }}
                onClick={() => setSel(s => s && { ...s, campos: [...(s.campos || []), { clave: '', etiqueta: '', tipo: 'texto' }] })}><Plus size={13} /> Pregunta</button>
            </div>

            <div>
              <span className="label-muted">Checklist</span>
              {(sel.checklist || []).map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input className="input" value={c.texto} placeholder="Se probaron las protecciones"
                    onChange={e => setSel(s => s && { ...s, checklist: (s.checklist || []).map((x, j) => (j === i ? { texto: e.target.value } : x)) })} />
                  <button type="button" className="btn btn-ghost btn-xs" aria-label="Quitar" onClick={() => setSel(s => s && { ...s, checklist: (s.checklist || []).filter((_, j) => j !== i) })}><Trash2 size={12} /></button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }}
                onClick={() => setSel(s => s && { ...s, checklist: [...(s.checklist || []), { texto: '' }] })}><Plus size={13} /> Ítem del checklist</button>
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem', color: 'var(--text)' }}>
              <input type="checkbox" checked={sel.activa ?? true} onChange={e => setSel({ ...sel, activa: e.target.checked })} style={{ accentColor: 'var(--y-brand)' }} /> Activa (se puede elegir)</label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setSel(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Save size={14} />} Guardar</button>
            </div>
          </div>

          <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="section-label" style={{ margin: 0 }}>Así se ve al llenarla</p>
            <FormularioInforme informe={vista} onCambiar={setVista} />
          </div>
        </div>
      )}
    </div>
  );
}
