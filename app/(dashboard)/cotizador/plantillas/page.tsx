'use client';

/**
 * Comercial → Plantillas de cotización (TecApp): traen la introducción, qué ve el cliente,
 * el título de la valorización y las secciones de la presentación. Las aclaraciones y
 * garantías NO: son las mismas para todas y se editan en Cotizaciones → Ajustes. No traen partidas (para eso están las recetas). La versión sube solo si
 * cambia algo que se imprime. No se borran: se desactivan; «la de siempre» no.
 */

import EditorFormato from '@/components/EditorFormato';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { pdf } from '@react-pdf/renderer';
import { ArrowLeft, Copy, Eye, Loader2, Plus, Save, Star } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import CotizacionPDF from '@/components/pdf/CotizacionPDF';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import { supabase } from '@/lib/supabase';
import { ajustesService, faltaFase4, plantillasCotService } from '@/services/cotizador';
import { useToast } from '@/hooks/useToast';
import { usePermisos } from '@/hooks/usePermisos';
import { PLAN_COBRO_BASE, QUE_VE, TITULO_VALORIZACION, type Plantilla, type Seccion } from '@/lib/cotizador/tipos';
import PlanCobro, { sumaPlan } from '@/components/cotizador/PlanCobro';
import { nuevoId } from '@/lib/cotizador/calculo';

const VACIA: Plantilla = { id: '', nombre: '', para_que: '', descripcion: '', aclaraciones: '', que_ve_cliente: 'partidas', titulo_valorizacion: '', secciones: [], es_la_de_siempre: false, activa: true, version: 1 };

export default function PlantillasPage() {
  const { puede } = usePermisos();
  const { success, error: toastError } = useToast();
  const [lista, setLista] = useState<Plantilla[]>([]);
  const [sel, setSel] = useState<Plantilla | null>(null);
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try { setLista(await plantillasCotService.listar(true)); }
    catch (e) { if (faltaFase4(e)) setFalta(true); else toastError(e instanceof Error ? e.message : 'No se pudo cargar'); }
    finally { setCargando(false); }
  }, [toastError]);
  useEffect(() => { cargar(); }, [cargar]);

  // Fase 8: la forma de pago propia de la plantilla (solo si la base ya tiene la columna).
  const conPlan = lista.some(p => 'plan_cobro' in p);
  const guardar = async () => {
    if (!sel?.nombre.trim()) { toastError('Ponle nombre a la plantilla'); return; }
    if (sel.plan_cobro && sel.plan_cobro.length && sumaPlan(sel.plan_cobro) !== 100) { toastError('La forma de pago tiene que sumar 100 %.'); return; }
    setGuardando(true);
    try {
      const id = await plantillasCotService.guardar({
        ...(sel.id ? { id: sel.id } : {}), nombre: sel.nombre.trim(), para_que: sel.para_que || null, descripcion: sel.descripcion || null,
        aclaraciones: null, que_ve_cliente: sel.que_ve_cliente, titulo_valorizacion: sel.titulo_valorizacion || null,
        ...(conPlan ? { plan_cobro: sel.plan_cobro && sel.plan_cobro.length ? sel.plan_cobro : null } : {}),
        secciones: sel.secciones, activa: sel.activa,
      });
      if (!lista.length) await plantillasCotService.deSiempre(id);
      success('Plantilla guardada');
      await cargar();
      setSel(s => (s ? { ...s, id } : s));
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  const vistaPrevia = async () => {
    if (!sel) return;
    const { data } = await supabase.from('empresas').select('*').order('nombre').limit(1);
    const empresa = (data?.[0] || { nombre: 'InnVolt', rut: '', email: '', telefono: '' }) as EmpresaInfo;
    const aj = await ajustesService.get().catch(() => null);
    const pid = 'p1';
    const blob = await pdf(
      <CotizacionPDF marca="EJEMPLO" empresa={empresa} diseno={aj?.pdf_diseno} planCobro={sel.plan_cobro && sel.plan_cobro.length ? sel.plan_cobro : aj?.plan_cobro} cliente={{ id: 'x', nombre_cliente: 'Cliente de ejemplo', empresa: 'Empresa de ejemplo SpA', rut: '76.000.000-0' } as never}
        doc={{
          id: 'x', folio: 0, estado: 'Borrador', revision: 0, titulo: 'Título de la cotización', cliente_id: 'x', moneda: 'CLP',
          que_ve_cliente: sel.que_ve_cliente, titulo_valorizacion: sel.titulo_valorizacion, descripcion_general: sel.descripcion || '',
          aclaraciones: aj?.aclaraciones || '', secciones: sel.secciones, subtotal: 0, iva: 0, total: 0, created_at: new Date().toISOString(),
          partidas: [{ id: pid, nombre: 'Partida de ejemplo', cantidad: 1, unidad: 'global', tipo: 'instalacion' }],
          items: [{ id: 'l1', partidaId: pid, descripcion: 'Producto de ejemplo', categoria: 'material', unidad: 'un', cantidad: 2, costo: 0, imprevistos: 0, margen: 0, precio: 100000, iva: 19, descuento: 0 }],
        }} />,
    ).toBlob();
    window.open(URL.createObjectURL(blob), '_blank');
  };

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Comercial" title="Plantillas" /><FaltaSQL /></div>;
  const editable = puede('cotizaciones.aprobar');

  return (
    <div className="anim-in">
      <Link href="/cotizador/historial" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 6 }}><ArrowLeft size={14} /> Cotizaciones</Link>
      <PageHeader eyebrow="Comercial" title="Plantillas de cotización"
        subtitle="Los textos con que parte cada cotización. No llevan partidas: para eso están las recetas."
        actions={editable ? <button className="btn btn-primary" onClick={() => setSel({ ...VACIA })}><Plus size={14} /> Nueva plantilla</button> : null} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 12, alignItems: 'start' }}>
        <div className="panel-y">
          {cargando ? <div className="skeleton" style={{ height: 120, margin: 12 }} /> : lista.length === 0 ? <p style={{ padding: '1.5rem', color: 'var(--muted)' }}>Aún no hay plantillas.</p> : lista.map(p => (
            <button key={p.id} onClick={() => setSel({ ...p })}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.75rem 1rem', background: sel?.id === p.id ? 'var(--y-soft)' : 'none', border: 'none', borderBottom: '1px solid var(--border2)', cursor: 'pointer', opacity: p.activa ? 1 : 0.55 }}>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 700, color: 'var(--text)' }}>
                {p.es_la_de_siempre && <Star size={13} color="var(--y)" fill="var(--y)" />}{p.nombre}
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 400 }}>v{p.version}{p.activa ? '' : ' · desactivada'}</span>
              </span>
              {p.para_que && <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{p.para_que}</span>}
            </button>
          ))}
        </div>
        {sel && (
          <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10, gridColumn: 'span 2' }}>
            <fieldset disabled={!editable} style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 10 }}>
                <label><span className="label-muted">Nombre *</span><input className="input" value={sel.nombre} onChange={e => setSel({ ...sel, nombre: e.target.value })} placeholder="Instalaciones eléctricas" /></label>
                <label><span className="label-muted">Para qué sirve (se ve al elegirla)</span><input className="input" value={sel.para_que || ''} onChange={e => setSel({ ...sel, para_que: e.target.value })} /></label>
              </div>
              <div><span className="label-muted">Introducción base</span>
                <EditorFormato valor={sel.descripcion || ''} editable={editable} alto={110} etiqueta="Introducción base" onCambiar={t => setSel(x => x && { ...x, descripcion: t })} /></div>
              <div><span className="label-muted">Aclaraciones y garantías</span>
                <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'var(--muted)', border: '1px dashed var(--border2)', borderRadius: 8, padding: '0.55rem 0.7rem' }}>
                  Son las mismas para todas las cotizaciones, con o sin plantilla. Se editan en{' '}
                  <Link href="/cotizador/ajustes" style={{ color: 'var(--y)' }}>Cotizaciones → Ajustes</Link>.</p></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 10 }}>
                <label><span className="label-muted">Qué ve el cliente</span>
                  <select className="input" value={sel.que_ve_cliente} onChange={e => setSel({ ...sel, que_ve_cliente: e.target.value as Plantilla['que_ve_cliente'] })}>
                    {QUE_VE.map(q => <option key={q.valor} value={q.valor}>{q.nombre}</option>)}</select></label>
                <label><span className="label-muted">Título de la valorización</span><input className="input" value={sel.titulo_valorizacion || ''} placeholder={TITULO_VALORIZACION} onChange={e => setSel({ ...sel, titulo_valorizacion: e.target.value })} /></label>
              </div>
              {conPlan && (
                <div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem', color: 'var(--text)' }}>
                    <input type="checkbox" checked={!!(sel.plan_cobro && sel.plan_cobro.length)} style={{ accentColor: 'var(--y-brand)' }}
                      onChange={e => setSel({ ...sel, plan_cobro: e.target.checked ? PLAN_COBRO_BASE.map(h => ({ ...h })) : null })} />
                    Forma de pago propia (si no, la de los ajustes)</label>
                  {sel.plan_cobro && sel.plan_cobro.length > 0 && <div style={{ marginTop: 6 }}><PlanCobro plan={sel.plan_cobro} onCambiar={pc => setSel({ ...sel, plan_cobro: pc })} /></div>}
                </div>
              )}
              <div>
                <span className="label-muted">Presentación: portada y secciones</span>
                {sel.secciones.map((s, i) => (
                  <div key={s.clave} style={{ border: '1px solid var(--border2)', borderRadius: 8, padding: '0.6rem', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span className="badge" style={{ background: 'var(--bg3)', color: 'var(--muted)' }}>{s.tipo === 'portada' ? 'Portada' : 'Sección'}</span>
                      <input className="input" value={s.titulo} placeholder="Título" onChange={e => setSel({ ...sel, secciones: sel.secciones.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)) })} />
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSel({ ...sel, secciones: sel.secciones.filter((_, j) => j !== i) })}>✕</button>
                    </div>
                    <EditorFormato valor={s.texto} editable={editable} alto={70} etiqueta={s.titulo || 'Texto de la sección'}
                      onCambiar={t => setSel(y => y && { ...y, secciones: y.secciones.map((x, j) => (j === i ? { ...x, texto: t } : x)) })} />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  {!sel.secciones.some(s => s.tipo === 'portada') && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSel({ ...sel, secciones: [{ clave: nuevoId(), tipo: 'portada', titulo: '', subtitulo: '', texto: '' } as Seccion, ...sel.secciones] })}><Plus size={12} /> Portada</button>}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSel({ ...sel, secciones: [...sel.secciones, { clave: nuevoId(), tipo: 'texto', titulo: '', texto: '' }] })}><Plus size={12} /> Sección</button>
                </div>
              </div>
            </fieldset>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', borderTop: '1px solid var(--border2)', paddingTop: 10 }}>
              <button className="btn btn-ghost" onClick={vistaPrevia}><Eye size={14} /> Vista previa</button>
              {editable && sel.id && <button className="btn btn-ghost" onClick={() => setSel({ ...sel, id: '', nombre: `${sel.nombre} (copia)`, es_la_de_siempre: false })}><Copy size={14} /> Duplicar</button>}
              {editable && sel.id && !sel.es_la_de_siempre && <button className="btn btn-ghost" onClick={async () => { try { await plantillasCotService.deSiempre(sel.id); success('Ahora es la de siempre'); cargar(); setSel({ ...sel, es_la_de_siempre: true, activa: true }); } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); } }}><Star size={14} /> Usar como la de siempre</button>}
              {editable && sel.id && !sel.es_la_de_siempre && <button className="btn btn-ghost" onClick={async () => {
                const motivo = prompt(sel.activa ? '¿Por qué se desactiva?' : '¿Por qué se reactiva?');
                if (!motivo?.trim()) return;
                try { await plantillasCotService.guardar({ id: sel.id, activa: !sel.activa }); success(sel.activa ? 'Desactivada' : 'Reactivada'); cargar(); setSel({ ...sel, activa: !sel.activa }); }
                catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
              }}>{sel.activa ? 'Desactivar' : 'Reactivar'}</button>}
              {editable && <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Save size={14} />} Guardar</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
