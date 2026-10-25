'use client';

/**
 * Cotización pública para el CLIENTE (/c/<token>).
 * ─────────────────────────────────────────────────────────────────────────────
 * Sin login: el token del link es la llave. El cliente revisa la propuesta,
 * descarga el PDF y la ACEPTA (o indica por qué no) desde su celular.
 * Diseño fijo en claro (como el PDF), independiente del tema del ERP.
 */

import { planEnPalabras } from '@/lib/cotizador/tipos';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Download, XCircle, Loader2, Clock, AlertTriangle, MessageCircle, Mail, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import type { CotizacionPublica } from '@/types/publico';
import { MOTIVOS_PERDIDA } from '@/types';
import { formatMoneda, formatDate, formatFolio } from '@/utils';
import TextoFormato from '@/components/TextoFormato';
import { calcular } from '@/lib/cotizador/calculo';
import type { CotizacionDoc } from '@/lib/cotizador/tipos';
import FirmaPad from '@/components/FirmaPad';
import { logoDocumento } from '@/lib/logoMarca';

const C = {
  bg: '#f6f4ee', paper: '#ffffff', ink: '#1a1813', muted: '#5f5b50', faint: '#8a8578',
  line: '#e3dfd4', dark: '#1a1813', spark: '#f6c21c', ok: '#15803d', okBg: '#ecfdf3', bad: '#b91c1c', badBg: '#fef2f2',
};

/** Texto con formato (negrita, cursiva, títulos, listas), como en el PDF. */
function Texto({ texto }: { texto: string }) {
  return <TextoFormato texto={texto} style={{ fontSize: 14, lineHeight: 1.6, color: '#333' }} />;
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
  const [form, setForm] = useState({ nombre: '', rut: '', comentario: '', motivo: '', acepto: false, firma: '' });
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

  // La cotización como la arma el ERP (con los precios congelados) y sus cuentas.
  const doc: CotizacionDoc | null = useMemo(() => cot ? {
    id: '', folio: cot.folio, estado: cot.estado, revision: cot.revision || 0, titulo: cot.titulo, cliente_id: null,
    items: cot.items, partidas: cot.partidas, moneda: cot.moneda, valor_uf: cot.valor_uf, fecha_valor_uf: cot.fecha_valor_uf,
    que_ve_cliente: cot.que_ve_cliente, titulo_valorizacion: cot.titulo_valorizacion, descripcion_general: cot.descripcion_general,
    aclaraciones: cot.aclaraciones, secciones: cot.secciones, fecha_emision: cot.fecha_emision, valida_hasta: cot.vence,
    subtotal: 0, iva: 0, total: 0, created_at: cot.created_at, incluir_fotos: cot.fotos.length > 0,
  } : null, [cot]);
  const t = useMemo(() => {
    if (!doc) return null;
    const r = calcular(doc.items, doc.partidas, doc.moneda, doc.valor_uf);
    return { r, subtotal: r.totales.subtotal, neto: r.totales.neto, total: r.totales.total, descuento: r.totales.descuento, iva: r.totales.iva,
      afecto: r.totales.afecto, exento: r.totales.exento };
  }, [doc]);

  const fmt = (v: number) => formatMoneda(v, cot?.moneda || 'CLP');

  const descargarPDF = async () => {
    if (!cot || !doc) return;
    setGenPDF(true);
    try {
      const [{ pdf }, { default: CotizacionPDF, nombrePDF }, { saveAs }] = await Promise.all([
        import('@react-pdf/renderer'), import('@/components/pdf/CotizacionPDF'), import('file-saver'),
      ]);
      const cliente = { id: '', estado: 'activo' as const, ...cot.cliente };
      const blob = await pdf(
        <CotizacionPDF doc={doc} cliente={cliente} empresa={cot.empresa} vendedor={cot.vendedor}
          sucursal={cot.sucursal} contacto={cot.contacto} importante={cot.importante} correoAceptar={cot.correo_aceptar}
          enlace={typeof window !== 'undefined' ? window.location.href.split('?')[0] : null}
          marca={cot.estado === 'Anulada' ? 'ANULADA' : null} fotos={cot.fotos} planCobro={cot.plan_cobro} diseno={cot.pdf_diseno}
          aceptacion={cot.estado === 'Aprobada' && cot.respondida_por && cot.respondida_at
            ? { nombre: cot.respondida_por, rut: cot.respondida_rut, fecha: cot.respondida_at, firma: cot.respuesta_firma }
            : null} />,
      ).toBlob();
      saveAs(blob, nombrePDF(doc, cot.cliente.nombre_cliente));
    } catch { alert('No se pudo generar el PDF. Intenta nuevamente.'); }
    finally { setGenPDF(false); }
  };

  const responder = async (accion: 'aceptar' | 'rechazar') => {
    setEnviando(true);
    try {
      const res = await fetch(`/api/publico/cotizacion/${token}/responder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, nombre: form.nombre, rut: form.rut, comentario: form.comentario, motivo: form.motivo, firma: accion === 'aceptar' ? form.firma : '' }),
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

  const logo = logoDocumento(cot.empresa);
  const pendiente = cot.estado === 'Enviada' && cot.responde_en_linea;
  const aceptada = cot.estado === 'Aprobada';
  // WhatsApp de quien cotizó (si tiene teléfono); si no, el de la empresa.
  const telEmpresa = (cot.vendedor?.telefono || cot.empresa.telefono || '').replace(/\D/g, '');
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
            {logo ? <img src={logo} alt={cot.empresa.nombre} style={{ height: 30, width: 'auto', maxWidth: '70vw' }} /> : <strong style={{ fontSize: 20 }}>{cot.empresa.nombre}</strong>}
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: C.muted }}>
            <div style={{ fontWeight: 800, color: C.ink, fontSize: 15 }}>Cotización {formatFolio(cot.folio)}</div>
            <div>Emitida {formatDate(cot.fecha_emision || cot.created_at)}{cot.revision ? ` · Revisión ${cot.revision}` : ''}</div>
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
        ) : cot.estado === 'Rechazada' ? (
          <div style={{ background: '#f4f4f4', border: `1px solid ${C.line}`, color: C.muted, borderRadius: 12, padding: 14, marginBottom: 12 }}>Esta cotización fue marcada como no aceptada.</div>
        ) : cot.estado === 'Anulada' ? (
          <div style={{ background: '#f4f4f4', border: `1px solid ${C.line}`, color: C.muted, borderRadius: 12, padding: 14, marginBottom: 12 }}>Esta cotización fue anulada: ya no corresponde.</div>
        ) : cot.estado === 'Borrador' ? (
          <div style={{ background: '#fffbea', border: '1px solid #f5d97a', color: '#7a5b00', borderRadius: 12, padding: 14, marginBottom: 12 }}>Esta cotización se está actualizando: te enviaremos la nueva versión.</div>
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

        <h1 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.25, margin: '4px 0 12px' }}>{cot.titulo}</h1>
        {cot.descripcion_general.trim() && (
          <Tarjeta titulo="Introducción"><Texto texto={cot.descripcion_general} /></Tarjeta>
        )}
        {cot.secciones.filter(x => x.tipo === 'texto' && x.texto.trim()).map(x => (
          <Tarjeta key={x.clave} titulo={x.titulo || undefined}><Texto texto={x.texto} /></Tarjeta>
        ))}

        {/* Detalle: tarjetas apiladas (se leen bien en celular) */}
        <Tarjeta titulo="Detalle">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {cot.partidas.map(p => {
              const its = cot.items.filter(i => i.partidaId === p.id);
              const bruto = t.r.partidas.get(p.id)?.subtotal || 0;
              return (
                <div key={p.id} style={{ padding: '12px 0', borderBottom: `1px solid ${C.line}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <strong style={{ fontSize: 15 }}>{p.nombre || 'Partida'}</strong>
                    {cot.que_ve_cliente !== 'total' && <strong style={{ whiteSpace: 'nowrap' }}>{fmt(bruto)}</strong>}
                  </div>
                  {p.descripcion && <TextoFormato texto={p.descripcion} style={{ fontSize: 13, color: C.muted, marginTop: 3 }} />}
                  <p style={{ fontSize: 12, color: C.faint, marginTop: 3 }}>{p.cantidad} {p.unidad}</p>
                  {cot.que_ve_cliente === 'detalle' && its.length > 0 && (
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
              ...(t.exento > 0 ? [['Neto afecto', fmt(t.afecto)], ['Exento (sin IVA)', fmt(t.exento)]] : [['Neto', fmt(t.neto)]]),
              ...(t.iva > 0 ? [['IVA 19 %', fmt(t.iva)]] : []),
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 150px), 1fr))', gap: 8 }}>
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

        {(cot.plan_cobro || []).some(h => h.porcentaje > 0) && (
          <Tarjeta titulo="Forma de pago">
            <p style={{ fontSize: 14, color: '#333', margin: 0 }}>{(() => { const t = planEnPalabras(cot.plan_cobro || []); return t[0].toUpperCase() + t.slice(1) + '.'; })()}</p>
          </Tarjeta>
        )}

        {cot.aclaraciones.trim() && (
          <Tarjeta>
            <button onClick={() => setVerCond(v => !v)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C.ink }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.6, textTransform: 'uppercase' }}>Aclaraciones y garantías</span>
              {verCond ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            {verCond && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Texto texto={cot.aclaraciones} />
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
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 6 }}>Firma <span style={{ fontWeight: 400, color: C.muted }}>(opcional)</span></p>
                <FirmaPad onChange={firma => setForm(f => ({ ...f, firma }))} colorBorde="#c4c4c0" colorTexto={C.muted} />
              </div>
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
          {cot.vendedor?.nombre && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ width: 42, height: 42, borderRadius: '50%', background: C.spark, color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>
                {cot.vendedor.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()}
              </span>
              <span>
                <span style={{ display: 'block', fontSize: 12, color: C.faint }}>Te atiende</span>
                <span style={{ display: 'block', fontWeight: 700 }}>{cot.vendedor.nombre}</span>
                {cot.vendedor.cargo && <span style={{ display: 'block', fontSize: 13, color: C.muted }}>{cot.vendedor.cargo}</span>}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ ...btnSec, flex: '1 1 160px', textDecoration: 'none', background: '#1f8f4e', color: '#fff', border: 'none' }}><MessageCircle size={18} /> WhatsApp</a>}
            {(cot.vendedor?.email || cot.empresa.email) && <a href={`mailto:${cot.vendedor?.email || cot.empresa.email}?subject=${encodeURIComponent(`Cotización ${formatFolio(cot.folio)}`)}`} style={{ ...btnSec, flex: '1 1 160px', textDecoration: 'none' }}><Mail size={18} /> Correo</a>}
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
