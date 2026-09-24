'use client';

/**
 * Cotización pública para el CLIENTE (/c/<token>).
 * ─────────────────────────────────────────────────────────────────────────────
 * Sin login: el token del link es la llave. El cliente revisa la propuesta,
 * descarga el PDF y la ACEPTA (o indica por qué no) desde su celular.
 * Diseño fijo en claro (como el PDF), independiente del tema del ERP.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Download, XCircle, Loader2, Clock, AlertTriangle, MessageCircle, Mail, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import type { CotizacionPublica } from '@/types/publico';
import { MOTIVOS_PERDIDA } from '@/types';
import { calcularTotals, formatMoneda, formatDate, formatFolio, nombreArchivo, boldPorLinea } from '@/utils';

const C = {
  bg: '#f3f3f1', paper: '#ffffff', ink: '#1a1a1a', muted: '#5c5c5c', faint: '#8d8d8d',
  line: '#e5e5e3', dark: '#1f1f1f', spark: '#ffc600', ok: '#15803d', okBg: '#ecfdf3', bad: '#b91c1c', badBg: '#fef2f2',
};
const LOGO_INNVOLT = '/InnVolt-transparente-claro.png';
const esInnVolt = (n: string) => n.toLowerCase().replace(/[^a-z]/g, '').includes('innvolt');

/** Texto con **negrita** y viñetas (-, •, *), como en el PDF. */
function Texto({ texto }: { texto: string }) {
  const lineas = boldPorLinea(texto || '').split('\n');
  const inline = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    seg.startsWith('**') && seg.endsWith('**') ? <strong key={i}>{seg.slice(2, -2)}</strong> : <span key={i}>{seg}</span>);
  return (
    <div style={{ fontSize: 14, lineHeight: 1.6, color: '#333' }}>
      {lineas.map((l, i) => {
        const t = l.replace(/\s+$/, '');
        if (!t.trim()) return <div key={i} style={{ height: 6 }} />;
        const b = /^\s*[-•*]\s+/.test(t);
        if (b) return <div key={i} style={{ display: 'flex', gap: 8, paddingLeft: 4 }}><span style={{ color: C.faint }}>•</span><span>{inline(t.replace(/^\s*[-•*]\s+/, ''))}</span></div>;
        if (/^\d+[.)]\s/.test(t.trim())) return <p key={i} style={{ fontWeight: 700, marginTop: 8 }}>{t.trim()}</p>;
        return <p key={i}>{inline(t)}</p>;
      })}
    </div>
  );
}

function Tarjeta({ children, titulo }: { children: React.ReactNode; titulo?: string }) {
  return (
    <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: '18px 18px', marginBottom: 12 }}>
      {titulo && <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.6, textTransform: 'uppercase', color: C.ink, marginBottom: 10 }}>{titulo}</p>}
      {children}
    </section>
  );
}

export default function CotizacionClientePage() {
  const { token } = useParams<{ token: string }>();
  const [cot, setCot] = useState<CotizacionPublica | null>(null);
  const [error, setError] = useState('');
  const [modo, setModo] = useState<'ver' | 'aceptar' | 'rechazar' | 'listo'>('ver');
  const [enviando, setEnviando] = useState(false);
  const [genPDF, setGenPDF] = useState(false);
  const [verCond, setVerCond] = useState(false);
  const [form, setForm] = useState({ nombre: '', rut: '', comentario: '', motivo: '', acepto: false });
  const [msgFinal, setMsgFinal] = useState('');

  const cargar = useCallback(async () => {
    try {
      const interno = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('interno') === '1';
      const res = await fetch(`/api/publico/cotizacion/${token}${interno ? '?interno=1' : ''}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'No se pudo cargar la cotización.'); return; }
      setCot(data);
      setForm(f => ({ ...f, nombre: f.nombre || data.cliente.contacto_nombre || data.cliente.nombre_cliente || '', rut: f.rut || data.cliente.rut || '' }));
    } catch { setError('Error de conexión. Revisa tu internet e intenta de nuevo.'); }
  }, [token]);
  useEffect(() => { cargar(); }, [cargar]);

  // Totales con el mismo motor del ERP; cifras redondeadas que cuadran como en el PDF.
  const t = useMemo(() => {
    if (!cot) return null;
    const tot = calcularTotals(cot.items, cot.descuento_global);
    const red = (v: number) => (cot.moneda === 'UF' ? Math.round(v * 100) / 100 : Math.round(v));
    const subtotal = red(cot.items.reduce((s, i) => s + (i.precio || 0) * (i.cantidad || 0), 0));
    const neto = red(tot.netoGeneral); const total = red(tot.total);
    return { tot, subtotal, neto, total, descuento: Math.max(0, red(subtotal - neto)), iva: red(total - neto) };
  }, [cot]);

  const fmt = (v: number) => formatMoneda(v, cot?.moneda || 'CLP');

  const descargarPDF = async () => {
    if (!cot || !t) return;
    setGenPDF(true);
    try {
      const [{ pdf }, { default: PresupuestoPDF }, { saveAs }] = await Promise.all([
        import('@react-pdf/renderer'), import('@/components/pdf/PresupuestoPDF'), import('file-saver'),
      ]);
      const cliente = { id: '', estado: 'activo' as const, ...cot.cliente };
      const blob = await pdf(
        <PresupuestoPDF
          cliente={cliente} items={cot.items} totals={t.tot} descuentoPorcentajeMO={cot.descuento_global}
          folio={formatFolio(cot.folio)} descripcionGeneral={cot.descripcion_general}
          garantia={cot.condiciones_servicio} condicionesComerciales={cot.condiciones_comerciales}
          ocultarSuministros={cot.ocultar_suministros} empresa={cot.empresa}
          moneda={cot.moneda} valorUF={cot.valor_uf || 0} partidas={cot.partidas}
          mostrarDetalle={cot.mostrar_detalle} fechaEmision={cot.created_at} fotos={cot.fotos}
        />,
      ).toBlob();
      saveAs(blob, `Cotizacion_${formatFolio(cot.folio)}_${nombreArchivo(cot.cliente.nombre_cliente)}.pdf`);
    } catch { alert('No se pudo generar el PDF. Intenta nuevamente.'); }
    finally { setGenPDF(false); }
  };

  const responder = async (accion: 'aceptar' | 'rechazar') => {
    setEnviando(true);
    try {
      const res = await fetch(`/api/publico/cotizacion/${token}/responder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, nombre: form.nombre, rut: form.rut, comentario: form.comentario, motivo: form.motivo }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data?.error || 'No se pudo enviar tu respuesta.'); return; }
      setMsgFinal(accion === 'aceptar'
        ? '¡Gracias! Recibimos tu aceptación. Te contactaremos para coordinar el inicio de los trabajos.'
        : 'Gracias por tu respuesta. Si más adelante quieres retomar el proyecto, estaremos disponibles.');
      setModo('listo');
      cargar();
    } catch { alert('Error de conexión. Intenta nuevamente.'); }
    finally { setEnviando(false); }
  };

  // ── Estados de carga / error ──
  if (error) {
    return (
      <main style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 28, maxWidth: 420, textAlign: 'center' }}>
          <AlertTriangle size={30} color={C.bad} />
          <p style={{ marginTop: 10, color: C.ink, fontWeight: 700 }}>{error}</p>
        </div>
      </main>
    );
  }
  if (!cot || !t) {
    return (
      <main style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} className="iv-spin" color={C.ink} />
      </main>
    );
  }

  const logo = cot.empresa.logo_url || (esInnVolt(cot.empresa.nombre) ? LOGO_INNVOLT : '');
  const pendiente = cot.estado === 'Pendiente';
  const aceptada = ['Aceptado', 'Realizado', 'Entregado'].includes(cot.estado);
  const telEmpresa = (cot.empresa.telefono || '').replace(/\D/g, '');
  const wa = telEmpresa ? `https://wa.me/${telEmpresa.startsWith('56') ? telEmpresa : '56' + telEmpresa}?text=${encodeURIComponent(`Hola, tengo una consulta sobre la cotización ${formatFolio(cot.folio)}.`)}` : '';
  const sueltos = cot.items.filter(i => !i.partidaId);

  const input: React.CSSProperties = { width: '100%', padding: '11px 12px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 15, color: C.ink, background: '#fff', outline: 'none', fontFamily: 'inherit' };
  const btnPrim: React.CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 10, border: 'none', background: C.dark, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' };
  const btnSec: React.CSSProperties = { ...btnPrim, background: '#fff', color: C.ink, border: `1px solid ${C.line}` };

  return (
    <main style={{ minHeight: '100svh', background: C.bg, color: C.ink, fontFamily: 'var(--font-body, system-ui, -apple-system, Segoe UI, Roboto, sans-serif)', paddingBottom: pendiente && cot.vigente && modo === 'ver' ? 96 : 24 }}>
      {/* Barra de marca */}
      <div style={{ display: 'flex', height: 5 }}><div style={{ flex: 1, background: C.ink }} /><div style={{ width: 90, background: C.spark }} /></div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '18px 14px 0' }}>
        {/* Encabezado */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            { }
            {logo ? <img src={logo} alt={cot.empresa.nombre} style={{ height: 42, width: 'auto' }} /> : <strong style={{ fontSize: 20 }}>{cot.empresa.nombre}</strong>}
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: C.muted }}>
            <div style={{ fontWeight: 800, color: C.ink, fontSize: 15 }}>Cotización {formatFolio(cot.folio)}</div>
            <div>Emitida {formatDate(cot.created_at)}</div>
          </div>
        </header>

        {/* Estado */}
        {modo === 'listo' ? (
          <div style={{ background: C.okBg, border: `1px solid ${C.ok}33`, color: C.ok, borderRadius: 12, padding: 16, marginBottom: 12, display: 'flex', gap: 10 }}>
            <CheckCircle2 size={22} style={{ flexShrink: 0 }} /> <span style={{ fontWeight: 600 }}>{msgFinal}</span>
          </div>
        ) : aceptada ? (
          <div style={{ background: C.okBg, border: `1px solid ${C.ok}33`, color: C.ok, borderRadius: 12, padding: 14, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <CheckCircle2 size={18} /> <span style={{ fontWeight: 600 }}>Cotización aceptada{cot.respondida_por ? ` por ${cot.respondida_por}` : ''}{cot.respondida_at ? ` el ${formatDate(cot.respondida_at)}` : ''}.</span>
          </div>
        ) : cot.estado === 'Rechazado' ? (
          <div style={{ background: '#f4f4f4', border: `1px solid ${C.line}`, color: C.muted, borderRadius: 12, padding: 14, marginBottom: 12 }}>Esta cotización fue marcada como no aceptada.</div>
        ) : !cot.vigente ? (
          <div style={{ background: C.badBg, border: `1px solid ${C.bad}33`, color: C.bad, borderRadius: 12, padding: 14, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <AlertTriangle size={18} /> <span>Esta cotización venció el {formatDate(cot.vence)}. Escríbenos y la actualizamos.</span>
          </div>
        ) : (
          <div style={{ background: '#fffbea', border: '1px solid #f5d97a', color: '#7a5b00', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <Clock size={16} /> Oferta válida hasta el <strong>{formatDate(cot.vence)}</strong>
          </div>
        )}

        {/* Inversión total */}
        <section style={{ background: C.dark, color: '#fff', borderRadius: 14, padding: '20px 20px', marginBottom: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.2, color: C.spark }}>INVERSIÓN TOTAL</p>
          <p style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.15, marginTop: 4 }}>{fmt(t.total)}</p>
          <p style={{ fontSize: 13, color: '#cfcfcf', marginTop: 4 }}>
            {t.iva > 0 ? `Neto ${fmt(t.neto)} + IVA ${fmt(t.iva)}` : 'Valor neto'}
            {t.descuento > 0 ? ` · Incluye un ahorro de ${fmt(t.descuento)}` : ''}
          </p>
          <p style={{ fontSize: 13, color: '#cfcfcf', marginTop: 8 }}>Preparada para <strong style={{ color: '#fff' }}>{cot.cliente.nombre_cliente}</strong>{cot.cliente.empresa ? ` · ${cot.cliente.empresa}` : ''}</p>
        </section>

        {cot.descripcion_general.trim() && (
          <Tarjeta titulo="Descripción del trabajo"><Texto texto={cot.descripcion_general} /></Tarjeta>
        )}

        {/* Detalle: tarjetas apiladas (se leen bien en celular) */}
        <Tarjeta titulo="Detalle">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {cot.partidas.map(p => {
              const its = cot.items.filter(i => i.partidaId === p.id);
              const bruto = its.reduce((s, i) => s + (i.precio || 0) * (i.cantidad || 0), 0);
              return (
                <div key={p.id} style={{ padding: '12px 0', borderBottom: `1px solid ${C.line}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <strong style={{ fontSize: 15 }}>{p.nombre || 'Partida'}</strong>
                    <strong style={{ whiteSpace: 'nowrap' }}>{fmt(bruto)}</strong>
                  </div>
                  {p.descripcion && <p style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{p.descripcion}</p>}
                  <p style={{ fontSize: 12, color: C.faint, marginTop: 3 }}>{p.cantidad} {p.unidad}</p>
                  {cot.mostrar_detalle && its.length > 0 && (
                    <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12, color: C.muted }}>
                      {its.map(i => <li key={i.id}>{i.descripcion} — {i.cantidad} {i.unidad}</li>)}
                    </ul>
                  )}
                </div>
              );
            })}
            {sueltos.map(i => (
              <div key={i.id} style={{ padding: '12px 0', borderBottom: `1px solid ${C.line}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: 14 }}>{i.descripcion}</span>
                  <strong style={{ whiteSpace: 'nowrap' }}>{fmt((i.precio || 0) * (i.cantidad || 0))}</strong>
                </div>
                <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{i.cantidad} {i.unidad} × {fmt(i.precio || 0)}{(i.descuento || 0) > 0 ? ` · descuento ${i.descuento}%` : ''}</p>
              </div>
            ))}
          </div>
          {/* Totales */}
          <div style={{ marginTop: 12, marginLeft: 'auto', maxWidth: 320, fontSize: 14 }}>
            {[
              ['Subtotal', fmt(t.subtotal)],
              ...(t.descuento > 0 ? [['Descuento', `- ${fmt(t.descuento)}`]] : []),
              ['Neto', fmt(t.neto)],
              ...(t.iva > 0 ? [['IVA', fmt(t.iva)]] : []),
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', color: C.muted }}><span>{k}</span><span style={{ color: C.ink, fontWeight: 600 }}>{v}</span></div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', marginTop: 6, background: C.dark, color: '#fff', borderRadius: 8, borderTop: `3px solid ${C.spark}` }}>
              <strong>TOTAL</strong><strong>{fmt(t.total)}</strong>
            </div>
          </div>
        </Tarjeta>

        {cot.fotos.length > 0 && (
          <Tarjeta titulo="Registro fotográfico de la visita">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
              {cot.fotos.map((f, i) => (
                <figure key={i} style={{ margin: 0 }}>
                  { }
                  <img src={f.url} alt={f.caption || `Foto ${i + 1}`} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.line}` }} />
                  {f.caption && <figcaption style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{f.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </Tarjeta>
        )}

        {(cot.condiciones_servicio.trim() || cot.condiciones_comerciales.trim()) && (
          <Tarjeta>
            <button onClick={() => setVerCond(v => !v)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C.ink }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.6, textTransform: 'uppercase' }}>Garantía y condiciones</span>
              {verCond ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            {verCond && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {cot.condiciones_servicio.trim() && <div><p style={{ fontWeight: 700, marginBottom: 4 }}>Garantía</p><Texto texto={cot.condiciones_servicio} /></div>}
                {cot.condiciones_comerciales.trim() && <div><p style={{ fontWeight: 700, marginBottom: 4 }}>Condiciones comerciales</p><Texto texto={cot.condiciones_comerciales} /></div>}
              </div>
            )}
          </Tarjeta>
        )}

        {/* Formularios de respuesta */}
        {modo === 'aceptar' && (
          <Tarjeta titulo="Aceptar cotización">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input style={input} placeholder="Nombre de quien acepta *" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              <input style={input} placeholder="RUT (opcional)" value={form.rut} onChange={e => setForm(f => ({ ...f, rut: e.target.value }))} />
              <textarea style={{ ...input, resize: 'vertical' }} rows={3} placeholder="Comentario o fecha preferida de inicio (opcional)" value={form.comentario} onChange={e => setForm(f => ({ ...f, comentario: e.target.value }))} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: C.muted }}>
                <input type="checkbox" checked={form.acepto} onChange={e => setForm(f => ({ ...f, acepto: e.target.checked }))} style={{ marginTop: 3 }} />
                Acepto la cotización {formatFolio(cot.folio)} por {fmt(t.total)} y sus condiciones comerciales.
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnSec} onClick={() => setModo('ver')}>Volver</button>
                <button style={{ ...btnPrim, background: C.ok, opacity: form.acepto && form.nombre.trim().length >= 3 ? 1 : 0.5 }} disabled={!form.acepto || form.nombre.trim().length < 3 || enviando} onClick={() => responder('aceptar')}>
                  {enviando ? <Loader2 size={18} className="iv-spin" /> : <CheckCircle2 size={18} />} Confirmar aceptación
                </button>
              </div>
            </div>
          </Tarjeta>
        )}
        {modo === 'rechazar' && (
          <Tarjeta titulo="¿Por qué no avanzas con esta propuesta?">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MOTIVOS_PERDIDA.filter(m => m !== 'Sin respuesta del cliente').map(m => (
                <button key={m} onClick={() => setForm(f => ({ ...f, motivo: m }))}
                  style={{ textAlign: 'left', padding: '11px 12px', borderRadius: 8, fontSize: 14, cursor: 'pointer', border: `1px solid ${form.motivo === m ? C.ink : C.line}`, background: form.motivo === m ? '#f4f4f4' : '#fff', fontWeight: form.motivo === m ? 700 : 400, color: C.ink }}>
                  {m}
                </button>
              ))}
              <textarea style={{ ...input, resize: 'vertical' }} rows={2} placeholder="Comentario (opcional): nos ayuda a mejorar" value={form.comentario} onChange={e => setForm(f => ({ ...f, comentario: e.target.value }))} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnSec} onClick={() => setModo('ver')}>Volver</button>
                <button style={{ ...btnPrim, opacity: form.motivo ? 1 : 0.5 }} disabled={!form.motivo || enviando} onClick={() => responder('rechazar')}>
                  {enviando ? <Loader2 size={18} className="iv-spin" /> : <XCircle size={18} />} Enviar respuesta
                </button>
              </div>
            </div>
          </Tarjeta>
        )}

        {/* Contacto */}
        <Tarjeta titulo="¿Dudas?">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ ...btnSec, flex: '1 1 160px', textDecoration: 'none', background: '#1f8f4e', color: '#fff', border: 'none' }}><MessageCircle size={18} /> WhatsApp</a>}
            {cot.empresa.email && <a href={`mailto:${cot.empresa.email}?subject=${encodeURIComponent(`Cotización ${formatFolio(cot.folio)}`)}`} style={{ ...btnSec, flex: '1 1 160px', textDecoration: 'none' }}><Mail size={18} /> Correo</a>}
            <button onClick={descargarPDF} disabled={genPDF} style={{ ...btnSec, flex: '1 1 160px' }}>
              {genPDF ? <Loader2 size={18} className="iv-spin" /> : <Download size={18} />} Descargar PDF
            </button>
          </div>
          <p style={{ fontSize: 12, color: C.faint, marginTop: 10 }}>{cot.empresa.nombre}{cot.empresa.rut ? ` · RUT ${cot.empresa.rut}` : ''}{cot.empresa.telefono ? ` · ${cot.empresa.telefono}` : ''}</p>
        </Tarjeta>
      </div>

      {/* Barra fija de acciones (celular): aceptar es la acción principal */}
      {pendiente && cot.vigente && modo === 'ver' && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.97)', borderTop: `1px solid ${C.line}`, padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px))', zIndex: 20 }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', gap: 8 }}>
            <button style={{ ...btnSec, flex: '0 0 auto', padding: '0 14px' }} onClick={() => setModo('rechazar')} title="No me interesa"><XCircle size={18} /></button>
            <button style={{ ...btnSec, flex: '0 0 auto', padding: '0 14px' }} onClick={descargarPDF} disabled={genPDF} title="Descargar PDF">{genPDF ? <Loader2 size={18} className="iv-spin" /> : <FileText size={18} />}</button>
            <button style={{ ...btnPrim, background: C.ok }} onClick={() => setModo('aceptar')}><CheckCircle2 size={18} /> Aceptar cotización</button>
          </div>
        </div>
      )}
    </main>
  );
}
