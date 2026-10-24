'use client';

/**
 * Comercial → Ajustes de cotización (TecApp): validez, aclaraciones y garantías (las mismas
 * para todas las cotizaciones, con o sin plantilla), «Importante», correo de «Cómo aceptar», mensajes de envío, presentación,
 * respuesta en línea y el próximo N° (con motivo; nunca baja). Los datos de la empresa
 * (nombre, RUT, logo, giro, banco) siguen en Configuración → Empresas.
 */

import PlanCobro, { sumaPlan } from '@/components/cotizador/PlanCobro';
import { PLAN_COBRO_BASE } from '@/lib/cotizador/tipos';
import EditorFormato from '@/components/EditorFormato';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import NumeroInput from '@/components/NumeroInput';
import { ajustesService, faltaFase4 } from '@/services/cotizador';
import { useToast } from '@/hooks/useToast';
import type { AjustesCot } from '@/lib/cotizador/tipos';

export default function AjustesCotPage() {
  const { success, error: toastError } = useToast();
  const [a, setA] = useState<AjustesCot | null>(null);
  const [ultimo, setUltimo] = useState(0);
  const [proximo, setProximo] = useState('');
  const [falta, setFalta] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    Promise.all([ajustesService.get(), ajustesService.ultimoNumero()])
      .then(([x, n]) => { setA(x); setUltimo(n); })
      .catch(e => { if (faltaFase4(e)) setFalta(true); else toastError(e instanceof Error ? e.message : 'No se pudo cargar'); });
  }, [toastError]);

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Comercial" title="Ajustes de cotización" /><FaltaSQL /></div>;
  if (!a) return <div className="skeleton" style={{ height: 300 }} />;

  const guardar = async () => {
    if (a.plan_cobro && sumaPlan(a.plan_cobro) !== 100) { toastError('Los cobros de la forma de pago tienen que sumar 100 %.'); return; }
    setGuardando(true);
    try {
      await ajustesService.guardar({
        dias_validez: Math.min(Math.max(Number(a.dias_validez) || 15, 1), 365), aclaraciones: a.aclaraciones || null, importante: a.importante || null,
        correo_aceptar: a.correo_aceptar || null, usa_presentacion: a.usa_presentacion, responde_en_linea: a.responde_en_linea,
        asunto_correo: a.asunto_correo, mensaje_correo: a.mensaje_correo, mensaje_whatsapp: a.mensaje_whatsapp,
        ...('plan_cobro' in a ? { plan_cobro: a.plan_cobro && a.plan_cobro.length ? a.plan_cobro : PLAN_COBRO_BASE } : {}),
        ...('pdf_diseno' in a ? { pdf_diseno: a.pdf_diseno || {} } : {}),
        ...('exigir_anticipo' in a ? {
          exigir_anticipo: a.exigir_anticipo !== false, costo_hora: Math.max(0, Number(a.costo_hora) || 0),
          descuento_max: a.descuento_max ?? null, utilidad_min: a.utilidad_min ?? null,
        } : {}),
      });
      success('Ajustes guardados. Las cotizaciones ya hechas no cambian.');
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  const cambiarNumero = async () => {
    const n = parseInt(proximo);
    if (!(n > ultimo)) { toastError(`Tiene que ser mayor que ${ultimo}`); return; }
    const motivo = prompt('¿Por qué cambias el próximo N°?');
    if (!motivo?.trim()) return;
    try { await ajustesService.proximoNumero(n, motivo.trim()); success(`La próxima cotización será IV-${String(n).padStart(4, '0')}`); setProximo(''); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
  };

  const fila = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 } as const;
  return (
    <div className="anim-in">
      <Link href="/cotizador/historial" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 6 }}><ArrowLeft size={14} /> Cotizaciones</Link>
      <PageHeader eyebrow="Comercial" title="Ajustes de cotización" subtitle="Valen para las cotizaciones nuevas. Los datos de la empresa (logo, RUT, giro, banco) están en Configuración."
        actions={<button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Save size={14} />} Guardar</button>} />
      <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={fila}>
          <label><span className="label-muted">Días de validez (1 a 365)</span>
            <input className="input" type="number" min={1} max={365} value={a.dias_validez} onChange={e => setA({ ...a, dias_validez: Number(e.target.value) })} /></label>
          <label><span className="label-muted">Correo de «Cómo aceptar»</span>
            <input className="input" type="email" value={a.correo_aceptar || ''} onChange={e => setA({ ...a, correo_aceptar: e.target.value })} placeholder="El de la empresa si se deja vacío" /></label>
        </div>
        <div><span className="label-muted">Aclaraciones y garantías (las mismas para todas las cotizaciones, con o sin plantilla)</span>
          <EditorFormato valor={a.aclaraciones || ''} onCambiar={t => setA({ ...a, aclaraciones: t })} alto={150} etiqueta="Aclaraciones y garantías por omisión"
            ia={{ tipo: 'aclaraciones', contexto: () => 'Son las aclaraciones y garantías base: las mismas para todas las cotizaciones.' }} /></div>
        <div><span className="label-muted">Texto «Importante» (va con la inversión total; vacío usa el de la empresa)</span>
          <EditorFormato valor={a.importante || ''} onCambiar={t => setA({ ...a, importante: t })} alto={70} etiqueta="Texto Importante"
            ia={{ tipo: 'importante' }} /></div>
        {'plan_cobro' in a && (
          <div><span className="label-muted">Forma de pago de las cotizaciones nuevas (cobros por hitos; cada cotización la puede cambiar)</span>
            <PlanCobro plan={a.plan_cobro && a.plan_cobro.length ? a.plan_cobro : PLAN_COBRO_BASE} onCambiar={p => setA({ ...a, plan_cobro: p })} /></div>
        )}
        {'exigir_anticipo' in a && <>
          <p className="section-label" style={{ margin: '6px 0 0' }}>Control del negocio</p>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
            <input type="checkbox" checked={a.exigir_anticipo !== false} onChange={e => setA({ ...a, exigir_anticipo: e.target.checked })} style={{ accentColor: 'var(--y-brand)', width: 16, height: 16 }} />
            Un trabajo no parte sin el anticipo pagado (se puede partir igual indicando el motivo; los clientes de confianza no lo piden)</label>
          <div style={fila}>
            <label><span className="label-muted">Costo por hora general (sueldo + leyes ÷ horas)</span>
              <NumeroInput className="input" prefijo="$" value={a.costo_hora ?? 0} onChange={v => setA({ ...a, costo_hora: v })} placeholder="Ej.: 9.500" />
              <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Para las horas de quien no tiene un costo propio (en Usuarios).</span></label>
            <label><span className="label-muted">Descuento máximo sin aprobación (%)</span>
              <NumeroInput className="input" sufijo="%" value={a.descuento_max ?? null} onChange={v => setA({ ...a, descuento_max: v })} onVacio={() => setA({ ...a, descuento_max: null })} placeholder="Sin límite" />
              <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Sobre esto, el vendedor pide aprobación antes de enviar.</span></label>
            <label><span className="label-muted">Utilidad mínima sin aprobación (%)</span>
              <NumeroInput className="input" sufijo="%" value={a.utilidad_min ?? null} onChange={v => setA({ ...a, utilidad_min: v })} onVacio={() => setA({ ...a, utilidad_min: null })} placeholder="Sin mínimo" />
              <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Bajo esto, también se pide aprobación. Aprueba quien tiene el permiso «Autorizar descuentos y utilidad baja».</span></label>
          </div>
        </>}
        <div style={fila}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
            <input type="checkbox" checked={a.usa_presentacion} onChange={e => setA({ ...a, usa_presentacion: e.target.checked })} style={{ accentColor: 'var(--y-brand)', width: 16, height: 16 }} />
            Usar la presentación (portada y secciones antes de la valorización)</label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
            <input type="checkbox" checked={a.responde_en_linea} onChange={e => setA({ ...a, responde_en_linea: e.target.checked })} style={{ accentColor: 'var(--y-brand)', width: 16, height: 16 }} />
            Los clientes responden en línea (aceptar o rechazar desde el enlace)</label>
        </div>
        {'pdf_diseno' in a && (() => {
          const dz = a.pdf_diseno || {};
          const setDz = (patch: Record<string, unknown>) => setA({ ...a, pdf_diseno: { ...dz, ...patch } });
          const bloques: [keyof typeof dz, string][] = [
            ['mostrar_forma_pago', 'Forma de pago'], ['mostrar_importante', 'Importante'], ['mostrar_como_aceptar', 'Cómo aceptar'],
            ['mostrar_banco', 'Datos para transferencia'], ['mostrar_firmas', 'Firmas'],
          ];
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="section-label" style={{ margin: '6px 0 0' }}>Diseño del PDF</p>
              <div style={fila}>
                <label><span className="label-muted">Color de acento</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="color" value={dz.color || '#ffc600'} onChange={e => setDz({ color: e.target.value })} style={{ width: 44, height: 36, border: 'none', background: 'none', cursor: 'pointer' }} />
                    <input className="input" value={dz.color || '#ffc600'} onChange={e => setDz({ color: e.target.value })} style={{ maxWidth: 120 }} />
                    {dz.color && <button type="button" className="btn btn-ghost btn-xs" onClick={() => setDz({ color: undefined })}>Amarillo InnVolt</button>}
                  </span></label>
                <label><span className="label-muted">Título del documento</span>
                  <input className="input" value={dz.titulo || ''} placeholder="COTIZACIÓN" onChange={e => setDz({ titulo: e.target.value })} maxLength={30} /></label>
              </div>
              <label><span className="label-muted">Texto del pie de página (vacío: «InnVolt · Cotización IV-0001»)</span>
                <input className="input" value={dz.pie || ''} onChange={e => setDz({ pie: e.target.value })} maxLength={120} placeholder="InnVolt SpA · Instalaciones eléctricas certificadas SEC" /></label>
              <div>
                <span className="label-muted">Bloques que se muestran</span>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
                  {bloques.map(([k, t]) => (
                    <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.86rem', color: 'var(--text)' }}>
                      <input type="checkbox" checked={dz[k] !== false} onChange={e => setDz({ [k]: e.target.checked })} style={{ accentColor: 'var(--y-brand)' }} /> {t}</label>
                  ))}
                </div>
              </div>
              <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>Para ver cómo queda, abre una plantilla en Cotizaciones → Plantillas y usa «Vista previa».</p>
            </div>
          );
        })()}
        <p className="section-label" style={{ margin: '6px 0 0' }}>Mensajes de envío</p>
        <p style={{ fontSize: '0.76rem', color: 'var(--muted)', margin: 0 }}>Puedes usar {'{cliente} {numero} {titulo} {total} {enlace} {vendedor} {empresa}'}.</p>
        <label><span className="label-muted">Asunto del correo</span><input className="input" value={a.asunto_correo || ''} onChange={e => setA({ ...a, asunto_correo: e.target.value })} /></label>
        <label><span className="label-muted">Mensaje del correo</span><textarea className="input" rows={5} value={a.mensaje_correo || ''} onChange={e => setA({ ...a, mensaje_correo: e.target.value })} /></label>
        <label><span className="label-muted">Mensaje de WhatsApp</span><textarea className="input" rows={3} value={a.mensaje_whatsapp || ''} onChange={e => setA({ ...a, mensaje_whatsapp: e.target.value })} /></label>
        <p className="section-label" style={{ margin: '6px 0 0' }}>Numeración</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label><span className="label-muted">Próximo N° (la última es IV-{String(ultimo).padStart(4, '0')})</span>
            <input className="input" type="number" min={ultimo + 1} value={proximo} onChange={e => setProximo(e.target.value)} placeholder={String(ultimo + 1)} style={{ width: 160 }} /></label>
          <button className="btn btn-ghost" onClick={cambiarNumero} disabled={!proximo}>Fijar el próximo N°</button>
        </div>
      </div>
    </div>
  );
}
