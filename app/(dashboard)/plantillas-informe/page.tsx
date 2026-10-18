'use client';

/**
 * Mi empresa → Plantillas de informe: las planillas de levantamiento (como en TecApp).
 * Cada una trae código, versión, estado (borrador / activa / archivada), descripción, objetivo,
 * instrucciones para el técnico, introducción, secciones (cada sección es un paso al llenarla),
 * preguntas de muchos tipos —texto, número con unidad, sí/no/no aplica, opciones, fotos,
 * archivos, firma, listas con filas…— y un checklist final.
 * Fase 11: cada pregunta puede tener respuestas alternativas («No medido»), datos precargados
 * de la visita, origen del dato (medido, declarado…), valores que marcan un riesgo, etiquetas
 * para la cotización y ser interna (no sale en el PDF).
 *   · Visita  — informes de la cita de la agenda (varios por visita); pasan a la cotización.
 *   · Entrega — el acta al terminar el trabajo, con la firma del cliente.
 * Al guardar cambios en las preguntas sube la versión: los informes ya llenados guardan su
 * propia copia y no cambian. A la derecha se ve el formulario y se puede bajar el PDF de prueba.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, ArrowDown, ArrowUp, ClipboardCheck, Copy, Eye, FileDown, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import EditorFormato from '@/components/EditorFormato';
import FormularioInforme from '@/components/informes/FormularioInforme';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import { supabase } from '@/lib/supabase';
import {
  claveDe, ETIQUETAS_COT, informeDesde, NATURALEZAS, plantillasInformeServicio, PRECARGAS, SI_NO_NA, tipoDe, TIPOS_CAMPO, TIPOS_SUBCAMPO,
  type CampoInforme, type EstadoPlantilla, type EtiquetaCot, type Naturaleza, type PlantillaInformeCompleta, type Precarga, type TipoCampo, type TipoPlantillaInforme,
} from '@/services/informes';
import { TIPO_SERVICIO_OPCIONES } from '@/types/solicitud';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { fechaLocal } from '@/utils';

const NOMBRE_TIPO: Record<TipoPlantillaInforme, { nombre: string; ayuda: string }> = {
  visita: { nombre: 'Levantamiento / visita', ayuda: 'Informes de la cita de la agenda; lo respondido pasa a la cotización.' },
  entrega: { nombre: 'Acta de entrega', ayuda: 'El acta al terminar el trabajo, con la recepción conforme y la firma del cliente.' },
};
const ESTADOS: { clave: EstadoPlantilla; nombre: string }[] = [
  { clave: 'activa', nombre: 'Activas' }, { clave: 'borrador', nombre: 'Borradores' }, { clave: 'archivada', nombre: 'Archivadas' },
];
const CON_OPCIONES: TipoCampo[] = ['seleccion', 'multiseleccion'];
const nueva = (tipo: TipoPlantillaInforme): Partial<PlantillaInformeCompleta> => ({
  nombre: '', tipo, tipo_servicio: null, intro: '', campos: [], checklist: [], activa: false, estado: 'borrador', version: 1, codigo: '',
});
const contar = (cs: CampoInforme[]) => {
  const sec = cs.filter(c => c.tipo === 'seccion').length;
  const preg = cs.length - sec;
  return `${sec ? `${sec} paso${sec === 1 ? '' : 's'} · ` : ''}${preg} pregunta${preg === 1 ? '' : 's'}`;
};
const lista = (txt: string) => txt.split(',').map(o => o.trimStart());

/** Claves únicas y estables (también dentro de las listas), opciones limpias y solo lo que aplica. */
function limpiar(cs: CampoInforme[]): CampoInforme[] {
  const usadas = new Set<string>();
  return cs.filter(c => c.etiqueta.trim()).map(c => {
    let k = c.clave || claveDe(c.etiqueta); let n = 2;
    while (usadas.has(k)) k = `${claveDe(c.etiqueta)}_${n++}`;
    usadas.add(k);
    const t = tipoDe(c);
    const out: CampoInforme = { clave: k, etiqueta: c.etiqueta.trim(), tipo: t };
    const limpios = (xs?: string[]) => (xs || []).map(o => o.trim()).filter(Boolean);
    if (CON_OPCIONES.includes(t)) out.opciones = limpios(c.opciones);
    if (t === 'numero' && c.unidad?.trim()) out.unidad = c.unidad.trim();
    if (t === 'numero' && typeof c.min === 'number') out.min = c.min;
    if (t === 'numero' && typeof c.max === 'number') out.max = c.max;
    if (t === 'lista') out.subcampos = limpiar(c.subcampos || []);
    if (c.requerido && t !== 'seccion') out.requerido = true;
    if (c.ayuda?.trim()) out.ayuda = c.ayuda.trim();
    if (c.placeholder?.trim()) out.placeholder = c.placeholder.trim();
    if (c.mostrarSi?.campo && c.mostrarSi.valor) out.mostrarSi = c.mostrarSi;
    if (limpios(c.alternativas).length) out.alternativas = limpios(c.alternativas);
    if (limpios(c.alerta).length) out.alerta = limpios(c.alerta);
    if (c.precarga) out.precarga = c.precarga;
    if (c.naturaleza) out.naturaleza = c.naturaleza;
    if (c.cotizacion?.length) out.cotizacion = c.cotizacion;
    if (c.interno) out.interno = true;
    return out;
  });
}

export default function PlantillasInformePage() {
  const { puedeAlguno } = usePermisos();
  const { success, error: toastError } = useToast();
  const edita = puedeAlguno(['cotizaciones.aprobar', 'configuracion.gestionar']);
  const [todas, setTodas] = useState<PlantillaInformeCompleta[]>([]);
  const [tipo, setTipo] = useState<TipoPlantillaInforme>('visita');
  const [estado, setEstado] = useState<EstadoPlantilla>('activa');
  const [sel, setSel] = useState<Partial<PlantillaInformeCompleta> | null>(null);
  const original = useRef<string>('');
  const [guardando, setGuardando] = useState(false);
  const [falta, setFalta] = useState(false);
  const [vista, setVista] = useState(informeDesde(null));
  const [generando, setGenerando] = useState(false);

  const cargar = useCallback(async () => {
    try { setTodas(await plantillasInformeServicio.listar({ todas: true })); }
    catch (e) { if (/tipo|campos|schema cache|does not exist/i.test((e as Error).message || '')) setFalta(true); else toastError((e as Error).message); }
  }, [toastError]);
  useEffect(() => { cargar(); }, [cargar]);
  // La vista previa se rehace con cada cambio (conservando lo que se probó a llenar).
  useEffect(() => {
    const campos = (sel?.campos || []).map((c, i) => ({ ...c, clave: c.clave || claveDe(c.etiqueta) || `campo_${i}`,
      subcampos: c.subcampos?.map((x, j) => ({ ...x, clave: x.clave || `${claveDe(x.etiqueta)}_${j}` })) }));
    setVista(v => ({ ...informeDesde(sel ? { ...(nueva('visita') as PlantillaInformeCompleta), ...sel, campos } as PlantillaInformeCompleta : null,
      { cliente: 'Cliente de ejemplo', direccion: 'Av. Ejemplo 123, Santiago', contacto: 'Juan Pérez', telefono: '+56 9 1234 5678', fecha: fechaLocal(), tecnico: 'Técnico InnVolt' }),
      respuestas: { ...informeDesde(sel as PlantillaInformeCompleta, { cliente: 'Cliente de ejemplo' }).respuestas, ...v.respuestas } }));
  }, [sel]);

  const abrir = (p: Partial<PlantillaInformeCompleta>) => { original.current = JSON.stringify(p.campos || []); setVista(informeDesde(null)); setSel(p); };
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
    // Cambiaron las preguntas de una plantilla ya guardada: nueva versión.
    const cambio = !!sel.id && JSON.stringify(cs) !== original.current;
    const version = (sel.version || 1) + (cambio ? 1 : 0);
    setGuardando(true);
    try {
      await plantillasInformeServicio.guardar({ ...sel, nombre: sel.nombre.trim(), campos: cs, version, checklist: (sel.checklist || []).filter(c => c.texto.trim()) });
      success(cambio ? `Plantilla guardada como versión ${version}` : 'Plantilla guardada'); setSel(null); cargar();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };
  const cambiarEstado = async (p: PlantillaInformeCompleta, e: EstadoPlantilla) => {
    try { await plantillasInformeServicio.guardar({ ...p, estado: e }); success(e === 'archivada' ? 'Plantilla archivada' : e === 'activa' ? 'Plantilla activa' : 'Plantilla en borrador'); cargar(); }
    catch (err) { toastError(err instanceof Error ? err.message : 'No se pudo cambiar'); }
  };

  // PDF de prueba con lo que se llenó en la vista previa.
  const pdfPrueba = async () => {
    setGenerando(true);
    try {
      const [{ pdf }, { default: InformeGeneralPDF }] = await Promise.all([import('@react-pdf/renderer'), import('@/components/pdf/InformeGeneralPDF')]);
      const { data: emps } = await supabase.from('empresas').select('*').limit(1);
      const empresa = ((emps || [])[0] as EmpresaInfo | undefined) || ({ nombre: 'InnVolt SpA', rut: '', email: '', telefono: '' } as EmpresaInfo);
      const blob = await pdf(
        <InformeGeneralPDF empresa={empresa} tipo={sel?.tipo || 'visita'} folio="IN-0000" fecha={fechaLocal()} hora="10:00"
          cliente={{ nombre: 'Cliente de ejemplo', direccion: 'Av. Ejemplo 123, Santiago' }} referencia="Vista previa de la plantilla"
          responsable="Técnico InnVolt" informe={{ ...vista, plantilla_codigo: sel?.codigo || null, plantilla_version: sel?.version || 1, objetivo: sel?.objetivo || null }}
          fotos={[]} estadoInforme="borrador" />,
      ).toBlob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch { toastError('No se pudo generar el PDF de prueba'); }
    finally { setGenerando(false); }
  };

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Mi empresa" title="Plantillas de informe" /><FaltaSQL archivo="supabase_fase8_informes.sql" /></div>;
  const deTipo = todas.filter(p => p.tipo === tipo);
  const visibles = deTipo.filter(p => (p.estado || 'activa') === estado);
  const servicio = (k: string | null) => (k ? TIPO_SERVICIO_OPCIONES.find(t => t.key === k)?.label || k : 'Cualquier servicio');

  return (
    <div className="anim-in">
      <PageHeader eyebrow="Mi empresa" title="Plantillas de informe"
        subtitle="Una plantilla por tipo de levantamiento, y el acta de entrega. Lo que se cambie no altera los informes ya hechos."
        actions={edita && !sel ? <button className="btn btn-primary" onClick={() => abrir(nueva(tipo))}><Plus size={14} /> Nueva plantilla</button> : null} />

      {!sel && <>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {(Object.keys(NOMBRE_TIPO) as TipoPlantillaInforme[]).map(t => (
            <button key={t} className="btn btn-sm" onClick={() => setTipo(t)}
              style={{ background: tipo === t ? 'var(--y-brand)' : 'var(--bg3)', color: tipo === t ? '#111' : 'var(--muted)' }}>{NOMBRE_TIPO[t].nombre}</button>
          ))}
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)', marginLeft: 6 }}>{NOMBRE_TIPO[tipo].ayuda}</span>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          {ESTADOS.map(e => (
            <button key={e.clave} className="btn btn-ghost btn-xs" onClick={() => setEstado(e.clave)}
              style={{ borderColor: estado === e.clave ? 'var(--y-brand)' : undefined, fontWeight: estado === e.clave ? 700 : 400 }}>
              {e.nombre} ({deTipo.filter(p => (p.estado || 'activa') === e.clave).length})</button>
          ))}
        </div>
        <div className="panel-y">
          {visibles.length === 0 ? <p style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--muted)', margin: 0 }}>No hay plantillas acá.</p>
            : visibles.map(p => (
              <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '0.75rem 1rem', borderTop: '1px solid var(--border2)', flexWrap: 'wrap' }}>
                <ClipboardCheck size={16} color="var(--y)" style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 'min(100%, 220px)' }}>
                  <b style={{ color: 'var(--text)' }}>{p.nombre}</b>
                  {p.codigo && <span style={{ fontSize: '0.74rem', color: 'var(--muted)', marginLeft: 6 }}>{p.codigo} · v{p.version || 1}</span>}
                  {p.descripcion && <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text)' }}>{p.descripcion}</span>}
                  <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--muted)' }}>
                    {contar(p.campos)}{p.checklist.length ? ` · ${p.checklist.length} en el checklist` : ''} · {servicio(p.tipo_servicio)}</span>
                </span>
                {edita && <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost btn-sm" title="Duplicar como borrador" aria-label="Duplicar"
                    onClick={() => abrir({ ...p, id: undefined, nombre: `${p.nombre} (copia)`, codigo: p.codigo ? `${p.codigo}-2` : '', version: 1, estado: 'borrador' })}><Copy size={13} /></button>
                  {p.estado === 'archivada'
                    ? <button className="btn btn-ghost btn-sm" title="Volver a activar" aria-label="Activar" onClick={() => cambiarEstado(p, 'activa')}><RotateCcw size={13} /></button>
                    : <button className="btn btn-ghost btn-sm" title="Archivar (no se borra)" aria-label="Archivar" onClick={() => cambiarEstado(p, 'archivada')}><Archive size={13} /></button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => abrir({ ...p })}>Editar</button>
                </div>}
              </div>
            ))}
        </div>
      </>}

      {sel && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 12, alignItems: 'start' }}>
          <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10 }}>
              <label style={{ gridColumn: '1 / -1' }}><span className="label-muted">Nombre *</span><input className="input" value={sel.nombre || ''} onChange={e => setSel({ ...sel, nombre: e.target.value })} placeholder="Levantamiento eléctrico general" autoFocus /></label>
              <label><span className="label-muted">Código interno</span><input className="input" value={sel.codigo || ''} onChange={e => setSel({ ...sel, codigo: e.target.value.toUpperCase() })} placeholder="LEV-ELE" /></label>
              <label><span className="label-muted">Estado</span>
                <select className="input" value={sel.estado || 'activa'} onChange={e => setSel({ ...sel, estado: e.target.value as EstadoPlantilla })}>
                  <option value="borrador">Borrador (no se puede elegir)</option><option value="activa">Activa</option><option value="archivada">Archivada</option></select></label>
              <label><span className="label-muted">Tipo</span>
                <select className="input" value={sel.tipo} onChange={e => setSel({ ...sel, tipo: e.target.value as TipoPlantillaInforme })}>
                  {(Object.keys(NOMBRE_TIPO) as TipoPlantillaInforme[]).map(t => <option key={t} value={t}>{NOMBRE_TIPO[t].nombre}</option>)}</select></label>
              <label><span className="label-muted">Tipo de servicio</span>
                <select className="input" value={sel.tipo_servicio || ''} onChange={e => setSel({ ...sel, tipo_servicio: e.target.value || null })}>
                  <option value="">Cualquiera</option>{TIPO_SERVICIO_OPCIONES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
            </div>
            {sel.id && <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>Versión {sel.version || 1}. Si cambias las preguntas, se guarda como versión {(sel.version || 1) + 1}; los informes ya hechos no cambian.</p>}
            <label><span className="label-muted">Descripción (cuándo se usa)</span>
              <input className="input" value={sel.descripcion || ''} onChange={e => setSel({ ...sel, descripcion: e.target.value })} placeholder="Instalaciones nuevas, ampliaciones…" /></label>
            <label><span className="label-muted">Objetivo del levantamiento (sale en el informe)</span>
              <textarea className="input" rows={2} value={sel.objetivo || ''} onChange={e => setSel({ ...sel, objetivo: e.target.value })} style={{ resize: 'vertical' }} /></label>
            <label><span className="label-muted">Instrucciones para el técnico (solo en el formulario)</span>
              <textarea className="input" rows={2} value={sel.instrucciones || ''} onChange={e => setSel({ ...sel, instrucciones: e.target.value })} style={{ resize: 'vertical' }} /></label>
            <div><span className="label-muted">Introducción del informe</span>
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
              <span className="label-muted">Checklist de cierre</span>
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

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: 'var(--bg2)', padding: '0.5rem 0', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => setSel(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Save size={14} />} Guardar</button>
            </div>
          </div>

          <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 12, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <p className="section-label" style={{ margin: 0, flex: 1 }}><Eye size={13} /> Así se ve al llenarla (puedes probarla)</p>
              <button className="btn btn-ghost btn-sm" onClick={pdfPrueba} disabled={generando}>{generando ? <Loader2 size={13} className="iv-spin" /> : <FileDown size={13} />} PDF de prueba</button>
            </div>
            <div style={{ maxHeight: 'calc(100dvh - 140px)', overflowY: 'auto' }}>
              <FormularioInforme informe={vista} onCambiar={setVista} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const fila: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8rem', color: 'var(--muted)' };

/** Una pregunta de la planilla, con lo que pide según su tipo. */
function EditorCampo({ c, i, total, anteriores, onCambiar, onMover, onQuitar }: {
  c: CampoInforme; i: number; total: number; anteriores: CampoInforme[];
  onCambiar: (patch: Partial<CampoInforme>) => void; onMover: (d: -1 | 1) => void; onQuitar: () => void;
}) {
  const t = tipoDe(c);
  const esSeccion = t === 'seccion';
  const [mas, setMas] = useState(false);
  // Se puede condicionar a una pregunta anterior de sí/no u opciones.
  const condicionables = anteriores.filter(a => ['si_no', 'si_no_na', 'seleccion', 'multiseleccion'].includes(tipoDe(a)) && a.etiqueta.trim());
  const base = condicionables.find(a => (a.clave || claveDe(a.etiqueta)) === c.mostrarSi?.campo);
  const valoresBase = base ? (tipoDe(base) === 'si_no' ? ['Sí', 'No'] : tipoDe(base) === 'si_no_na' ? SI_NO_NA : (base.opciones || []).filter(Boolean)) : [];
  const marcas = [c.mostrarSi?.campo && 'condicional', c.cotizacion?.length && 'cotización', c.alerta?.length && 'alerta', c.interno && 'interna', c.precarga && 'precargada'].filter(Boolean);
  const togCot = (k: EtiquetaCot) => onCambiar({ cotizacion: (c.cotizacion || []).includes(k) ? (c.cotizacion || []).filter(x => x !== k) : [...(c.cotizacion || []), k] });

  return (
    <div style={{ border: `1px solid ${esSeccion ? 'var(--y-brand)' : 'var(--border2)'}`, background: esSeccion ? 'var(--y-soft)' : undefined, borderRadius: 8, padding: '0.5rem', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" style={{ flex: '1 1 160px', minWidth: 0, fontWeight: esSeccion ? 700 : undefined }} value={c.etiqueta}
          placeholder={esSeccion ? 'Nombre de la sección: Tableros' : t === 'lista' ? 'Qué es cada fila: Tablero' : 'Estado del tablero'}
          onChange={e => onCambiar({ etiqueta: e.target.value })} />
        <select className="input" style={{ flex: '1 1 150px', minWidth: 0, maxWidth: 220 }} value={t} onChange={e => onCambiar({ tipo: e.target.value as TipoCampo, ...(e.target.value === 'lista' && !c.subcampos?.length ? { subcampos: [{ clave: '', etiqueta: '', tipo: 'texto' }] } : {}) })}>
          {TIPOS_CAMPO.map(x => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}</select>
        <span style={{ display: 'flex', gap: 2 }}>
          <button type="button" className="btn btn-ghost btn-xs" aria-label="Subir" disabled={i === 0} onClick={() => onMover(-1)}><ArrowUp size={12} /></button>
          <button type="button" className="btn btn-ghost btn-xs" aria-label="Bajar" disabled={i === total - 1} onClick={() => onMover(1)}><ArrowDown size={12} /></button>
          <button type="button" className="btn btn-ghost btn-xs" aria-label="Quitar" onClick={onQuitar}><Trash2 size={12} /></button>
        </span>
      </div>

      {CON_OPCIONES.includes(t) && (
        <input className="input" value={(c.opciones || []).join(', ')} placeholder="Opciones separadas por coma: Bueno, Regular, Malo"
          onChange={e => onCambiar({ opciones: lista(e.target.value) })} />
      )}
      {t === 'numero' && (
        <div style={fila}>
          <input className="input" style={{ width: 130 }} value={c.unidad || ''} placeholder="Unidad (m, A, V…)" onChange={e => onCambiar({ unidad: e.target.value })} />
          <input className="input" style={{ width: 90 }} type="number" value={c.min ?? ''} placeholder="Mínimo" onChange={e => onCambiar({ min: e.target.value === '' ? undefined : Number(e.target.value) })} />
          <input className="input" style={{ width: 90 }} type="number" value={c.max ?? ''} placeholder="Máximo" onChange={e => onCambiar({ max: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </div>
      )}
      {t === 'lista' && (
        <div style={{ borderLeft: '2px solid var(--border2)', paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Columnas de cada fila</span>
          {(c.subcampos || []).map((s, j) => {
            const setSub = (patch: Partial<CampoInforme>) => onCambiar({ subcampos: (c.subcampos || []).map((x, k) => (k === j ? { ...x, ...patch } : x)) });
            return (
              <div key={j} style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                <input className="input" style={{ flex: '1 1 120px', minWidth: 0 }} value={s.etiqueta} placeholder="Protección general" onChange={e => setSub({ etiqueta: e.target.value })} />
                <select className="input" style={{ flex: '0 1 150px', minWidth: 0 }} value={tipoDe(s)} onChange={e => setSub({ tipo: e.target.value as TipoCampo })}>
                  {TIPOS_CAMPO.filter(x => TIPOS_SUBCAMPO.includes(x.clave)).map(x => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}</select>
                {tipoDe(s) === 'seleccion' && <input className="input" style={{ flexBasis: '100%' }} value={(s.opciones || []).join(', ')} placeholder="Opciones: Bueno, Regular, Malo"
                  onChange={e => setSub({ opciones: lista(e.target.value) })} />}
                {tipoDe(s) === 'seleccion' && <input className="input" style={{ flexBasis: '100%' }} value={(s.alerta || []).join(', ')} placeholder="Valores que marcan un riesgo (opcional)"
                  onChange={e => setSub({ alerta: lista(e.target.value) })} />}
                {tipoDe(s) === 'numero' && <input className="input" style={{ width: 90 }} value={s.unidad || ''} placeholder="Unidad" onChange={e => setSub({ unidad: e.target.value })} />}
                <button type="button" className="btn btn-ghost btn-xs" aria-label="Quitar columna" onClick={() => onCambiar({ subcampos: (c.subcampos || []).filter((_, k) => k !== j) })}><Trash2 size={12} /></button>
              </div>
            );
          })}
          <button type="button" className="btn btn-ghost btn-xs" style={{ alignSelf: 'flex-start' }}
            onClick={() => onCambiar({ subcampos: [...(c.subcampos || []), { clave: '', etiqueta: '', tipo: 'texto' }] })}><Plus size={12} /> Columna</button>
        </div>
      )}

      <div style={{ ...fila, gap: 12 }}>
        {!esSeccion && (
          <label style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!c.requerido} onChange={e => onCambiar({ requerido: e.target.checked })} style={{ accentColor: 'var(--y-brand)' }} /> Obligatoria</label>
        )}
        <button type="button" onClick={() => setMas(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--y)', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}>
          {mas ? 'Menos' : 'Más opciones'}{marcas.length ? ` · ${marcas.join(', ')}` : ''}</button>
      </div>
      {mas && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px dashed var(--border2)', paddingTop: 8 }}>
          {!esSeccion && <>
            <input className="input" value={c.ayuda || ''} placeholder="Ayuda bajo la pregunta" onChange={e => onCambiar({ ayuda: e.target.value })} />
            {['texto', 'parrafo'].includes(t) && <input className="input" value={c.placeholder || ''} placeholder="Texto de ejemplo dentro del campo" onChange={e => onCambiar({ placeholder: e.target.value })} />}
            {['texto', 'numero', 'seleccion'].includes(t) && (
              <input className="input" value={(c.alternativas || []).join(', ')} placeholder="Respuestas cuando no hay dato: No medido, No identificado"
                onChange={e => onCambiar({ alternativas: lista(e.target.value) })} />
            )}
            {['seleccion', 'multiseleccion', 'si_no_na', 'lista'].includes(t) && (
              <input className="input" value={(c.alerta || []).join(', ')} placeholder="Valores que marcan un riesgo destacado: Deficiente, Riesgo inmediato"
                onChange={e => onCambiar({ alerta: lista(e.target.value) })} />
            )}
            <div style={fila}>
              <span>Origen del dato</span>
              <select className="input" style={{ width: 190 }} value={c.naturaleza || ''} onChange={e => onCambiar({ naturaleza: (e.target.value || undefined) as Naturaleza | undefined })}>
                <option value="">(no indicar)</option>{NATURALEZAS.map(n => <option key={n.clave} value={n.clave}>{n.nombre}</option>)}</select>
              <span>Precargar desde la visita</span>
              <select className="input" style={{ width: 150 }} value={c.precarga || ''} onChange={e => onCambiar({ precarga: (e.target.value || undefined) as Precarga | undefined })}>
                <option value="">(no)</option>{PRECARGAS.map(n => <option key={n.clave} value={n.clave}>{n.nombre}</option>)}</select>
            </div>
            <div style={fila}>
              <span>Para cotizar:</span>
              {ETIQUETAS_COT.map(e => {
                const on = (c.cotizacion || []).includes(e.clave);
                return <button key={e.clave} type="button" onClick={() => togCot(e.clave)} aria-pressed={on}
                  style={{ cursor: 'pointer', fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: 99, border: `1px solid ${on ? 'var(--y-brand)' : 'var(--border2)'}`, background: on ? 'var(--y-soft)' : 'transparent', color: 'var(--text)' }}>{e.nombre}</button>;
              })}
            </div>
            <label style={{ ...fila, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!c.interno} onChange={e => onCambiar({ interno: e.target.checked || undefined })} style={{ accentColor: 'var(--y-brand)' }} />
              Interna: no sale en el PDF del cliente</label>
          </>}
          <div style={fila}>
            <span>Mostrar {esSeccion ? 'la sección' : ''} solo si</span>
            <select className="input" style={{ width: 190 }} value={c.mostrarSi?.campo || ''}
              onChange={e => onCambiar({ mostrarSi: e.target.value ? { campo: e.target.value, op: c.mostrarSi?.op || '=', valor: '' } : null })}>
              <option value="">(siempre)</option>
              {condicionables.map((a, k) => <option key={k} value={a.clave || claveDe(a.etiqueta)}>{a.etiqueta}</option>)}
            </select>
            {c.mostrarSi?.campo && <>
              <select className="input" style={{ width: 80 }} value={c.mostrarSi.op} onChange={e => onCambiar({ mostrarSi: { ...c.mostrarSi!, op: e.target.value as '=' | '≠' } })}>
                <option value="=">es</option><option value="≠">no es</option></select>
              <select className="input" style={{ width: 160 }} value={c.mostrarSi.valor} onChange={e => onCambiar({ mostrarSi: { ...c.mostrarSi!, valor: e.target.value } })}>
                <option value="">Elegir…</option>{valoresBase.map(v => <option key={v} value={v}>{v}</option>)}</select>
            </>}
          </div>
          {!condicionables.length && <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Para condicionar, antes debe haber una pregunta de sí/no u opciones.</span>}
        </div>
      )}
    </div>
  );
}
