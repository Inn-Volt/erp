'use client';

/**
 * Comercial → Ajustes de cotización (TecApp): validez, aclaraciones para una cotización
 * sin plantilla, «Importante», correo de «Cómo aceptar», mensajes de envío, presentación,
 * respuesta en línea y el próximo N° (con motivo; nunca baja). Los datos de la empresa
 * (nombre, RUT, logo, giro, banco) siguen en Configuración → Empresas.
 */

import EditorFormato from '@/components/EditorFormato';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
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
    setGuardando(true);
    try {
      await ajustesService.guardar({
        dias_validez: Math.min(Math.max(Number(a.dias_validez) || 15, 1), 365), aclaraciones: a.aclaraciones || null, importante: a.importante || null,
        correo_aceptar: a.correo_aceptar || null, usa_presentacion: a.usa_presentacion, responde_en_linea: a.responde_en_linea,
        asunto_correo: a.asunto_correo, mensaje_correo: a.mensaje_correo, mensaje_whatsapp: a.mensaje_whatsapp,
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

  const fila = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 } as const;
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
        <div><span className="label-muted">Aclaraciones y garantías para una cotización «sin plantilla»</span>
          <EditorFormato valor={a.aclaraciones || ''} onCambiar={t => setA({ ...a, aclaraciones: t })} alto={150} etiqueta="Aclaraciones y garantías por omisión" /></div>
        <div><span className="label-muted">Texto «Importante» (va con la inversión total; vacío usa el de la empresa)</span>
          <EditorFormato valor={a.importante || ''} onCambiar={t => setA({ ...a, importante: t })} alto={70} etiqueta="Texto Importante" /></div>
        <div style={fila}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
            <input type="checkbox" checked={a.usa_presentacion} onChange={e => setA({ ...a, usa_presentacion: e.target.checked })} style={{ accentColor: 'var(--y-brand)', width: 16, height: 16 }} />
            Usar la presentación (portada y secciones antes de la valorización)</label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
            <input type="checkbox" checked={a.responde_en_linea} onChange={e => setA({ ...a, responde_en_linea: e.target.checked })} style={{ accentColor: 'var(--y-brand)', width: 16, height: 16 }} />
            Los clientes responden en línea (aceptar o rechazar desde el enlace)</label>
        </div>
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
