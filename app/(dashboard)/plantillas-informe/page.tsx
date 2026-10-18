'use client';

/**
 * Mi empresa → Plantillas de informe: las planillas (como en TecApp). Cada una trae una
 * introducción, secciones (cada sección es un paso al llenarla), preguntas de muchos tipos
 * —texto, número con unidad, sí/no, opciones, fotos, firma, listas con filas…—, que pueden ser
 * obligatorias o mostrarse solo si otra pregunta tiene cierto valor, y un checklist.
 *   · Visita  — informes de la cita de la agenda (varios por visita); pasan a la cotización.
 *   · Entrega — el acta al terminar el trabajo, con la firma del cliente.
 * A la derecha se ve cómo queda el formulario mientras se edita.
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ClipboardCheck, Copy, Eye, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import EditorFormato from '@/components/EditorFormato';
import FormularioInforme from '@/components/informes/FormularioInforme';
import {
  claveDe, informeDesde, plantillasInformeServicio, tipoDe, TIPOS_CAMPO, TIPOS_SUBCAMPO,
  type CampoInforme, type PlantillaInformeCompleta, type TipoCampo, type TipoPlantillaInforme,
} from '@/services/informes';
import { TIPO_SERVICIO_OPCIONES } from '@/types/solicitud';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';

const NOMBRE_TIPO: Record<TipoPlantillaInforme, { nombre: string; ayuda: string }> = {
  visita: { nombre: 'Visita', ayuda: 'Informes de la cita de la agenda (levantamiento, checklist…); lo respondido pasa a la cotización.' },
  entrega: { nombre: 'Entrega', ayuda: 'El acta al terminar el trabajo, con la recepción conforme y la firma del cliente.' },
};
const CON_OPCIONES: TipoCampo[] = ['seleccion', 'multiseleccion'];
const nueva = (tipo: TipoPlantillaInforme): Partial<PlantillaInformeCompleta> => ({ nombre: '', tipo, tipo_servicio: null, intro: '', campos: [], checklist: [], activa: true });
const contar = (cs: CampoInforme[]) => {
  const sec = cs.filter(c => c.tipo === 'seccion').length;
  const preg = cs.length - sec;
  return `${sec ? `${sec} sección${sec === 1 ? '' : 'es'} · ` : ''}${preg} pregunta${preg === 1 ? '' : 's'}`;
};

/** Claves únicas y estables (también dentro de las listas) y opciones limpias. */
function limpiar(cs: CampoInforme[]): CampoInforme[] {
  const usadas = new Set<string>();
  return cs.filter(c => c.etiqueta.trim()).map(c => {
    let k = c.clave || claveDe(c.etiqueta); let n = 2;
    while (usadas.has(k)) k = `${claveDe(c.etiqueta)}_${n++}`;
    usadas.add(k);
    const t = tipoDe(c);
    const out: CampoInforme = { clave: k, etiqueta: c.etiqueta.trim(), tipo: t };
    if (CON_OPCIONES.includes(t)) out.opciones = (c.opciones || []).map(o => o.trim()).filter(Boolean);
    if (t === 'numero' && c.unidad?.trim()) out.unidad = c.unidad.trim();
    if (t === 'lista') out.subcampos = limpiar(c.subcampos || []);
    if (c.requerido && t !== 'seccion') out.requerido = true;
    if (c.ayuda?.trim()) out.ayuda = c.ayuda.trim();
    if (c.mostrarSi?.campo && c.mostrarSi.valor) out.mostrarSi = c.mostrarSi;
    return out;
  });
}

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
  // La vista previa se rehace con cada cambio (conservando lo que se probó a llenar).
  useEffect(() => {
    const campos = (sel?.campos || []).map((c, i) => ({ ...c, clave: c.clave || claveDe(c.etiqueta) || `campo_${i}`,
      subcampos: c.subcampos?.map((x, j) => ({ ...x, clave: x.clave || `${claveDe(x.etiqueta)}_${j}` })) }));
    setVista(v => ({ ...informeDesde(sel ? { ...(nueva('visita') as PlantillaInformeCompleta), ...sel, campos } as PlantillaInformeCompleta : null), respuestas: v.respuestas }));
  }, [sel]);

  const campos = sel?.campos || [];
  const setCampos = (f: (cs: CampoInforme[]) => CampoInforme[]) => setSel(s => s && { ...s, campos: f(s.campos || []) });
  const setCampo = (i: number, patch: Partial<CampoInforme>) => setCampos(cs => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const moverCampo = (i: number, d: -1 | 1) => setCampos(cs => {
    const j = i + d; if (j < 0 || j >= cs.length) return cs;
    const x = [...cs]; [x[i], x[j]] = [x[j], x[i]]; return x;
  });
  const agregar = (t: TipoCampo) => setCampos(cs => [...cs, { clave: '', etiqueta: '', tipo: t, ...(t === 'lista' ? { subcampos: [{ clave: '', etiqueta: '', tipo: 'texto' as TipoCampo }] } : {}) }]);

  const guardar = async () => {
    if (!sel?.nombre?.trim()) { toastError('Ponle nombre a la plantilla'); return; }
    const cs = limpiar(campos);
    const sinOpc = [...cs, ...cs.flatMap(c => c.subcampos || [])].find(c => CON_OPCIONES.includes(c.tipo) && !(c.opciones || []).length);
    if (sinOpc) { toastError(`«${sinOpc.etiqueta}» no tiene opciones`); return; }
    const listaVacia = cs.find(c => c.tipo === 'lista' && !(c.subcampos || []).length);
    if (listaVacia) { toastError(`La lista «${listaVacia.etiqueta}» no tiene columnas`); return; }
    setGuardando(true);
    try {
      await plantillasInformeServicio.guardar({ ...sel, nombre: sel.nombre.trim(), campos: cs, checklist: (sel.checklist || []).filter(c => c.texto.trim()) });
      success('Plantilla guardada'); setSel(null); cargar();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Mi empresa" title="Plantillas de informe" /><FaltaSQL archivo="supabase_fase8_informes.sql" /></div>;
  const deTipo = lista.filter(p => p.tipo === tipo);

  return (
    <div className="anim-in">
      <PageHeader eyebrow="Mi empresa" title="Plantillas de informe"
        subtitle="Las planillas de los informes de visita (levantamiento, checklist…) y del acta de entrega."
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
                    {contar(p.campos)}{p.checklist.length ? ` · ${p.checklist.length} en el checklist` : ''}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12, alignItems: 'start' }}>
          <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              <label><span className="label-muted">Nombre *</span><input className="input" value={sel.nombre || ''} onChange={e => setSel({ ...sel, nombre: e.target.value })} placeholder="Levantamiento eléctrico, Entrega cargador…" autoFocus /></label>
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
              <span className="label-muted">Preguntas — una «Sección» parte un paso nuevo</span>
              {campos.map((c, i) => (
                <EditorCampo key={i} c={c} i={i} total={campos.length} anteriores={campos.slice(0, i)}
                  onCambiar={patch => setCampo(i, patch)} onMover={d => moverCampo(i, d)} onQuitar={() => setCampos(cs => cs.filter((_, j) => j !== i))} />
              ))}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => agregar('texto')}><Plus size={13} /> Pregunta</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => agregar('seccion')}><Plus size={13} /> Sección</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => agregar('lista')}><Plus size={13} /> Lista</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => agregar('foto')}><Plus size={13} /> Fotos</button>
              </div>
            </div>

            <div>
              <span className="label-muted">Checklist (va al final)</span>
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
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: 'var(--bg2)', padding: '0.5rem 0' }}>
              <button className="btn btn-ghost" onClick={() => setSel(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Save size={14} />} Guardar</button>
            </div>
          </div>

          <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 12 }}>
            <p className="section-label" style={{ margin: 0 }}><Eye size={13} /> Así se ve al llenarla (puedes probarla)</p>
            <div style={{ maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
              <FormularioInforme informe={vista} onCambiar={setVista} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Una pregunta de la planilla, con lo que pide según su tipo. */
function EditorCampo({ c, i, total, anteriores, onCambiar, onMover, onQuitar }: {
  c: CampoInforme; i: number; total: number; anteriores: CampoInforme[];
  onCambiar: (patch: Partial<CampoInforme>) => void; onMover: (d: -1 | 1) => void; onQuitar: () => void;
}) {
  const t = tipoDe(c);
  const esSeccion = t === 'seccion';
  const [masOpciones, setMasOpciones] = useState(!!(c.ayuda || c.mostrarSi));
  // Se puede condicionar a una pregunta anterior de sí/no u opciones.
  const condicionables = anteriores.filter(a => ['si_no', 'seleccion', 'multiseleccion'].includes(tipoDe(a)) && a.etiqueta.trim());
  const base = condicionables.find(a => (a.clave || claveDe(a.etiqueta)) === c.mostrarSi?.campo);
  const valoresBase = base ? (tipoDe(base) === 'si_no' ? ['Sí', 'No'] : (base.opciones || []).filter(Boolean)) : [];

  return (
    <div style={{ border: `1px solid ${esSeccion ? 'var(--y-brand)' : 'var(--border2)'}`, background: esSeccion ? 'var(--y-soft)' : undefined, borderRadius: 8, padding: '0.5rem', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" style={{ flex: 1, minWidth: 160, fontWeight: esSeccion ? 700 : undefined }} value={c.etiqueta}
          placeholder={esSeccion ? 'Nombre de la sección: Tableros' : t === 'lista' ? 'Qué es cada fila: Tablero' : 'Estado del tablero'}
          onChange={e => onCambiar({ etiqueta: e.target.value })} />
        <select className="input" style={{ width: 170 }} value={t} onChange={e => onCambiar({ tipo: e.target.value as TipoCampo, ...(e.target.value === 'lista' && !c.subcampos?.length ? { subcampos: [{ clave: '', etiqueta: '', tipo: 'texto' }] } : {}) })}>
          {TIPOS_CAMPO.map(x => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}</select>
        <button type="button" className="btn btn-ghost btn-xs" aria-label="Subir" disabled={i === 0} onClick={() => onMover(-1)}><ArrowUp size={12} /></button>
        <button type="button" className="btn btn-ghost btn-xs" aria-label="Bajar" disabled={i === total - 1} onClick={() => onMover(1)}><ArrowDown size={12} /></button>
        <button type="button" className="btn btn-ghost btn-xs" aria-label="Quitar" onClick={onQuitar}><Trash2 size={12} /></button>
      </div>

      {CON_OPCIONES.includes(t) && (
        <input className="input" value={(c.opciones || []).join(', ')} placeholder="Opciones separadas por coma: Bueno, Regular, Malo"
          onChange={e => onCambiar({ opciones: e.target.value.split(',').map(o => o.trimStart()) })} />
      )}
      {t === 'numero' && (
        <input className="input" style={{ maxWidth: 180 }} value={c.unidad || ''} placeholder="Unidad (m, A, V, kW…)" onChange={e => onCambiar({ unidad: e.target.value })} />
      )}
      {t === 'lista' && (
        <div style={{ borderLeft: '2px solid var(--border2)', paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Columnas de cada fila</span>
          {(c.subcampos || []).map((s, j) => {
            const setSub = (patch: Partial<CampoInforme>) => onCambiar({ subcampos: (c.subcampos || []).map((x, k) => (k === j ? { ...x, ...patch } : x)) });
            return (
              <div key={j} style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                <input className="input" style={{ flex: 1, minWidth: 120 }} value={s.etiqueta} placeholder="Protección general" onChange={e => setSub({ etiqueta: e.target.value })} />
                <select className="input" style={{ width: 130 }} value={tipoDe(s)} onChange={e => setSub({ tipo: e.target.value as TipoCampo })}>
                  {TIPOS_CAMPO.filter(x => TIPOS_SUBCAMPO.includes(x.clave)).map(x => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}</select>
                {tipoDe(s) === 'seleccion' && <input className="input" style={{ flexBasis: '100%' }} value={(s.opciones || []).join(', ')} placeholder="Opciones: Bueno, Regular, Malo"
                  onChange={e => setSub({ opciones: e.target.value.split(',').map(o => o.trimStart()) })} />}
                {tipoDe(s) === 'numero' && <input className="input" style={{ width: 90 }} value={s.unidad || ''} placeholder="Unidad" onChange={e => setSub({ unidad: e.target.value })} />}
                <button type="button" className="btn btn-ghost btn-xs" aria-label="Quitar columna" onClick={() => onCambiar({ subcampos: (c.subcampos || []).filter((_, k) => k !== j) })}><Trash2 size={12} /></button>
              </div>
            );
          })}
          <button type="button" className="btn btn-ghost btn-xs" style={{ alignSelf: 'flex-start' }}
            onClick={() => onCambiar({ subcampos: [...(c.subcampos || []), { clave: '', etiqueta: '', tipo: 'texto' }] })}><Plus size={12} /> Columna</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--muted)' }}>
        {!esSeccion && (
          <label style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!c.requerido} onChange={e => onCambiar({ requerido: e.target.checked })} style={{ accentColor: 'var(--y-brand)' }} /> Obligatoria</label>
        )}
        <button type="button" onClick={() => setMasOpciones(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--y)', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}>
          {masOpciones ? 'Menos' : 'Ayuda y condición'}{c.mostrarSi?.campo ? ' · condicional' : ''}</button>
      </div>
      {masOpciones && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!esSeccion && <input className="input" value={c.ayuda || ''} placeholder="Ayuda bajo la pregunta (opcional)" onChange={e => onCambiar({ ayuda: e.target.value })} />}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
            <span>Mostrar {esSeccion ? 'la sección' : ''} solo si</span>
            <select className="input" style={{ width: 190 }} value={c.mostrarSi?.campo || ''}
              onChange={e => onCambiar({ mostrarSi: e.target.value ? { campo: e.target.value, op: c.mostrarSi?.op || '=', valor: '' } : null })}>
              <option value="">(siempre)</option>
              {condicionables.map((a, k) => <option key={k} value={a.clave || claveDe(a.etiqueta)}>{a.etiqueta}</option>)}
            </select>
            {c.mostrarSi?.campo && <>
              <select className="input" style={{ width: 70 }} value={c.mostrarSi.op} onChange={e => onCambiar({ mostrarSi: { ...c.mostrarSi!, op: e.target.value as '=' | '≠' } })}>
                <option value="=">es</option><option value="≠">no es</option></select>
              <select className="input" style={{ width: 150 }} value={c.mostrarSi.valor} onChange={e => onCambiar({ mostrarSi: { ...c.mostrarSi!, valor: e.target.value } })}>
                <option value="">Elegir…</option>{valoresBase.map(v => <option key={v} value={v}>{v}</option>)}</select>
            </>}
          </div>
          {!condicionables.length && <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Para condicionar, antes debe haber una pregunta de sí/no u opciones.</span>}
        </div>
      )}
    </div>
  );
}
