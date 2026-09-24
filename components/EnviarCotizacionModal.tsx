'use client';

/**
 * Enviar la cotización al cliente y registrar seguimientos.
 * ─────────────────────────────────────────────────────────────────────────────
 *  · Link público (/c/<token>) donde el cliente la revisa, descarga y ACEPTA.
 *  · WhatsApp y correo con el mensaje ya redactado (envío o seguimiento).
 *  · "Marcar seguimiento hecho" para que salga de la lista de pendientes.
 * Al copiar/enviar se registra la fecha de envío (solo la primera vez).
 */

import { useState } from 'react';
import { X, Send, Copy, MessageCircle, Mail, CheckCircle2, Loader2, Eye, Clock } from 'lucide-react';
import { cotizacionesService, linkPublico, diasSinMovimiento } from '@/services/cotizaciones';
import { useToast } from '@/hooks/useToast';
import { formatMoneda, formatFolio, formatDate } from '@/utils';
import type { Cotizacion, Moneda } from '@/types';

/** Normaliza un teléfono chileno para wa.me (solo dígitos, con 56). */
function telefonoWhatsApp(tel?: string | null): string {
  const d = (tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('56')) return d;
  if (d.length === 9 && d.startsWith('9')) return `56${d}`;
  if (d.length === 8) return `569${d}`;
  return d;
}

export default function EnviarCotizacionModal({ cot, empresaNombre, onClose, onCambio }: {
  cot: Cotizacion;
  empresaNombre: string;
  onClose: () => void;
  /** Se llama tras registrar envío o seguimiento (para recargar la lista). */
  onCambio?: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [guardando, setGuardando] = useState(false);
  const folio = formatFolio(cot.folio);
  const total = formatMoneda(cot.total, (cot.moneda as Moneda) || 'CLP');
  const link = cot.token_publico ? linkPublico(cot.token_publico) : '';
  const nombre = cot.clientes?.contacto_nombre || cot.clientes?.nombre_cliente || '';
  const esSeguimiento = !!cot.enviada_at && cot.estado === 'Pendiente';
  const dias = diasSinMovimiento(cot);

  const mensaje = esSeguimiento
    ? `Hola ${nombre}, ¿pudiste revisar la cotización ${folio} de ${empresaNombre} por ${total}? ` +
      (link ? `La puedes ver y aceptar aquí: ${link} ` : '') +
      'Si tienes dudas o quieres ajustar algo, conversemos. ¡Saludos!'
    : `Hola ${nombre}, te envío la cotización ${folio} de ${empresaNombre} por ${total}. ` +
      (link ? `Puedes revisarla, descargarla y aceptarla aquí: ${link} ` : '') +
      'Quedo atento a tus comentarios. ¡Saludos!';

  const registrarEnvio = async () => {
    if (cot.enviada_at) return;
    try { await cotizacionesService.marcarEnviada(cot.id); onCambio?.(); } catch { /* sin columna: no bloquea el envío */ }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      success('Link copiado');
      registrarEnvio();
    } catch { toastError('No se pudo copiar el link'); }
  };

  const tel = telefonoWhatsApp(cot.clientes?.telefono);
  const waUrl = `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
  const mailUrl = `mailto:${cot.clientes?.email || ''}?subject=${encodeURIComponent(`Cotización ${folio} — ${empresaNombre}`)}&body=${encodeURIComponent(mensaje)}`;

  const marcarSeguimiento = async () => {
    setGuardando(true);
    try {
      await cotizacionesService.registrarSeguimiento(cot.id, cot.seguimientos || 0);
      success('Seguimiento registrado');
      onCambio?.();
      onClose();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'No se pudo registrar');
    } finally { setGuardando(false); }
  };

  const fila: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--muted)' };
  const btn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', width: '100%', height: 42, borderRadius: 'var(--r)', border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none' };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 440, width: '92%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}><Send size={13} /> {esSeguimiento ? 'Seguimiento' : 'Enviar al cliente'} · {folio}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>

        <div style={{ padding: '1.2rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '0.75rem 0.9rem' }}>
            <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9rem' }}>{cot.clientes?.nombre_cliente || '—'}</p>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--y)', fontSize: '1.1rem' }}>{total}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
              <span style={fila}><Send size={12} /> {cot.enviada_at ? `Enviada el ${formatDate(cot.enviada_at)}` : 'Aún no enviada'}</span>
              <span style={fila}><Eye size={12} /> {cot.vista_at ? `El cliente la abrió el ${formatDate(cot.vista_at)}` : 'El cliente aún no la abre'}</span>
              {cot.estado === 'Pendiente' && (
                <span style={fila}><Clock size={12} /> {dias} día{dias !== 1 ? 's' : ''} sin movimiento · {cot.seguimientos || 0} seguimiento{(cot.seguimientos || 0) !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>

          {!link && (
            <p style={{ fontSize: '0.74rem', color: 'var(--danger)' }}>
              El link para el cliente se habilita al ejecutar <code>supabase_mejoras_comerciales.sql</code> en Supabase.
            </p>
          )}

          {link && (
            <button onClick={copiar} style={btn}><Copy size={15} /> Copiar link para el cliente</button>
          )}
          <a href={waUrl} target="_blank" rel="noreferrer" onClick={registrarEnvio} style={{ ...btn, background: '#1f8f4e', borderColor: '#1f8f4e', color: '#fff' }}>
            <MessageCircle size={15} /> {esSeguimiento ? 'Seguimiento por WhatsApp' : 'Enviar por WhatsApp'}
          </a>
          <a href={mailUrl} onClick={registrarEnvio} style={btn}><Mail size={15} /> {esSeguimiento ? 'Seguimiento por correo' : 'Enviar por correo'}</a>

          {cot.estado === 'Pendiente' && (
            <>
              <div className="iv-divider" />
              <button onClick={marcarSeguimiento} disabled={guardando} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                {guardando ? <Loader2 size={14} className="iv-spin" /> : <CheckCircle2 size={14} />} Marcar seguimiento hecho
              </button>
              <p style={{ fontSize: '0.7rem', color: 'var(--faint)', textAlign: 'center' }}>
                Si no responde, en unos días volverá a aparecer en «Por seguir».
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
