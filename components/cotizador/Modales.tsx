'use client';

/** Ventanas del cotizador: revisar y enviar, aprobar, rechazar e historial. */

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, Mail, MessageCircle, Paperclip, Send, XCircle } from 'lucide-react';
import { Modal } from './ui';
import type { Aviso } from '@/lib/cotizador/revision';
import { MOTIVOS_RECHAZO, type CotizacionDoc, type EventoCot } from '@/lib/cotizador/tipos';
import { cotizadorService } from '@/services/cotizador';

export type Canal = 'whatsapp' | 'correo' | 'ambos' | 'descarga';

export function RevisarYEnviar({ avisos, para, telefono, mensajeWhatsapp, asunto, mensajeCorreo, reenvio, onIrA, onCerrar, onEnviar }: {
  avisos: Aviso[]; para: string; telefono: string; mensajeWhatsapp: string; asunto: string; mensajeCorreo: string; reenvio?: boolean;
  onIrA: (id: string) => void; onCerrar: () => void;
  onEnviar: (canal: Canal, datos: { para: string; telefono: string; mensajeWhatsapp: string; asunto: string; mensajeCorreo: string }) => Promise<void>;
}) {
  // Lo rojo que se puede enviar igual confirmándolo (vender con pérdida a sabiendas).
  const [conPerdida, setConPerdida] = useState(false);
  const perdidas = avisos.filter(a => a.nivel === 'rojo' && a.confirmar === 'perdida');
  const rojos = avisos.filter(a => a.nivel === 'rojo' && !(a.confirmar === 'perdida' && conPerdida));
  const ambar = avisos.filter(a => a.nivel === 'ambar');
  const [canal, setCanal] = useState<Canal>(telefono ? 'whatsapp' : para ? 'correo' : 'descarga');
  const [d, setD] = useState({ para, telefono, mensajeWhatsapp, asunto, mensajeCorreo });
  const [ocupado, setOcupado] = useState(false);
  const enviar = async () => { setOcupado(true); try { await onEnviar(canal, d); } finally { setOcupado(false); } };
  const CANALES: { c: Canal; t: string; ayuda: string; icono: React.ReactNode }[] = [
    { c: 'whatsapp', t: 'WhatsApp', ayuda: 'Abre tu WhatsApp con el mensaje y el enlace; tú aprietas enviar.', icono: <MessageCircle size={15} /> },
    { c: 'correo', t: 'Correo', ayuda: 'Abre tu correo con el asunto, el mensaje y el enlace; adjunta el PDF que se descarga.', icono: <Mail size={15} /> },
    { c: 'ambos', t: 'Los dos', ayuda: 'WhatsApp y correo.', icono: <Send size={15} /> },
    { c: 'descarga', t: 'La mando yo', ayuda: 'Solo descarga el PDF.', icono: <Download size={15} /> },
  ];
  return (
    <Modal titulo={reenvio ? 'Reenviar la cotización' : 'Revisar y enviar'} onCerrar={onCerrar} ancho={620} pie={<>
      <button className="btn btn-ghost" onClick={onCerrar}>{rojos.length ? 'Volver a corregir' : 'Cancelar'}</button>
      {!rojos.length && <button className="btn btn-primary" onClick={enviar} disabled={ocupado}>
        {ocupado ? <Loader2 size={14} className="iv-spin" /> : <Send size={14} />} {reenvio ? 'Reenviar' : 'Marcar enviada y mandar'}</button>}
    </>}>
      {rojos.length > 0 && (
        <div style={{ border: '1px solid var(--danger)', borderRadius: 8, padding: '0.6rem 0.8rem', background: 'rgba(220,38,38,.07)' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--danger)', fontSize: '0.88rem' }}><XCircle size={14} style={{ verticalAlign: -2 }} /> No se puede enviar todavía</p>
          {rojos.map((a, i) => <AvisoFila key={i} a={a} onIrA={id => { onCerrar(); onIrA(id); }} />)}
        </div>
      )}
      {perdidas.length > 0 && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.84rem', color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={conPerdida} onChange={e => setConPerdida(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--danger)' }} />
          <span>Sé que {perdidas.length === 1 ? 'esa línea queda' : `esas ${perdidas.length} líneas quedan`} bajo el costo y la envío igual (vendo con pérdida).
            {conPerdida && <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--muted)' }}>{perdidas.map(a => a.texto.replace(/ \(solo lo ves tú\)\.$/, '')).join(' · ')}</span>}</span>
        </label>
      )}
      {ambar.length > 0 && (
        <div style={{ border: '1px solid #d97706', borderRadius: 8, padding: '0.6rem 0.8rem', background: 'rgba(217,119,6,.07)' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#d97706', fontSize: '0.88rem' }}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> Revisa antes de enviar (se puede enviar igual)</p>
          {ambar.map((a, i) => <AvisoFila key={i} a={a} onIrA={id => { onCerrar(); onIrA(id); }} />)}
        </div>
      )}
      {!avisos.length && <p style={{ margin: 0, color: 'var(--success)', fontSize: '0.88rem' }}><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> Todo en orden.</p>}
      {!rojos.length && (
        <>
          <p className="label-muted" style={{ margin: 0 }}>¿Cómo la mandas?</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 8 }}>
            {CANALES.map(x => (
              <button key={x.c} type="button" onClick={() => setCanal(x.c)} title={x.ayuda}
                style={{ textAlign: 'left', border: `1px solid ${canal === x.c ? 'var(--y-brand)' : 'var(--border2)'}`, background: canal === x.c ? 'var(--y-soft)' : 'var(--bg2)', borderRadius: 10, padding: '0.55rem 0.7rem', cursor: 'pointer', color: 'var(--text)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.86rem' }}>{x.icono} {x.t}</span>
                <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{x.ayuda}</span>
              </button>
            ))}
          </div>
          {(canal === 'whatsapp' || canal === 'ambos') && (
            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: 4 }}>WhatsApp de</label>
              <input className="input" value={d.telefono} onChange={e => setD({ ...d, telefono: e.target.value })} placeholder="+56 9 …" />
              <textarea className="input" rows={3} value={d.mensajeWhatsapp} onChange={e => setD({ ...d, mensajeWhatsapp: e.target.value })} style={{ marginTop: 6, fontSize: '0.84rem' }} />
            </div>
          )}
          {(canal === 'correo' || canal === 'ambos') && (
            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: 4 }}>Para</label>
              <input className="input" value={d.para} onChange={e => setD({ ...d, para: e.target.value })} placeholder="correo@cliente.cl" />
              <input className="input" value={d.asunto} onChange={e => setD({ ...d, asunto: e.target.value })} style={{ marginTop: 6 }} />
              <textarea className="input" rows={5} value={d.mensajeCorreo} onChange={e => setD({ ...d, mensajeCorreo: e.target.value })} style={{ marginTop: 6, fontSize: '0.84rem' }} />
            </div>
          )}
          <p style={{ fontSize: '0.76rem', color: 'var(--muted)', margin: 0 }}>
            {reenvio ? 'Se anota el reenvío y se descarga el mismo PDF.'
              : 'Al enviar: la fecha pasa a hoy y la validez se cuenta desde hoy (salvo una «válida hasta» escrita a mano), queda Enviada y se guarda el PDF tal cual lo recibe el cliente.'}
          </p>
        </>
      )}
    </Modal>
  );
}

function AvisoFila({ a, onIrA }: { a: Aviso; onIrA: (id: string) => void }) {
  return (
    <p style={{ margin: '0 0 4px', fontSize: '0.84rem', color: 'var(--text)' }}>
      • {a.texto} {a.ir && <button type="button" onClick={() => onIrA(a.ir!)} style={{ background: 'none', border: 'none', color: 'var(--y)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem' }}>ir</button>}
    </p>
  );
}

export function AprobarModal({ cot, vencida, onCerrar, onListo }: { cot: CotizacionDoc; vencida: boolean; onCerrar: () => void; onListo: () => void }) {
  const [como, setComo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const aprobar = async () => {
    setOcupado(true); setError('');
    try {
      const doc = archivo ? await cotizadorService.subirArchivo(cot.id, archivo) : null;
      await cotizadorService.aprobar(cot.id, como.trim(), doc, motivo.trim() || null);
      onListo();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo aprobar'); }
    finally { setOcupado(false); }
  };
  return (
    <Modal titulo="Aprobada por el cliente" onCerrar={onCerrar} ancho={500} pie={<>
      <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
      <button className="btn btn-primary" disabled={!como.trim() || (vencida && !motivo.trim()) || ocupado} onClick={aprobar}>
        {ocupado ? <Loader2 size={14} className="iv-spin" /> : <CheckCircle2 size={14} />} Aprobar</button>
    </>}>
      <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>Anota que el cliente aprobó la revisión {cot.revision}. Nace su orden de trabajo y queda para facturar al cerrarla.</p>
      <div><label className="label-muted" style={{ display: 'block', marginBottom: 4 }}>Quién aprobó del lado del cliente y cómo *</label>
        <input className="input" autoFocus value={como} onChange={e => setComo(e.target.value)} placeholder="Juan Pérez, correo del 06-10" /></div>
      <label className="btn btn-ghost" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
        <Paperclip size={14} /> {archivo ? archivo.name : 'Adjuntar el correo u orden de compra (opcional)'}
        <input type="file" hidden accept=".pdf,image/*,.eml,.msg" onChange={e => setArchivo(e.target.files?.[0] || null)} />
      </label>
      {vencida && <div><label className="label-muted" style={{ display: 'block', marginBottom: 4 }}>Está vencida: motivo para aprobarla igual *</label>
        <input className="input" value={motivo} onChange={e => setMotivo(e.target.value)} /></div>}
      {error && <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.84rem' }}>{error}</p>}
    </Modal>
  );
}

export function RechazarModal({ cot, onCerrar, onListo }: { cot: CotizacionDoc; onCerrar: () => void; onListo: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const rechazar = async () => {
    setOcupado(true); setError('');
    try { await cotizadorService.rechazar(cot.id, motivo, nota.trim() || null); onListo(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo'); }
    finally { setOcupado(false); }
  };
  return (
    <Modal titulo="Rechazada" onCerrar={onCerrar} ancho={460} pie={<>
      <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
      <button className="btn btn-danger" disabled={!motivo || (motivo === 'Otro' && !nota.trim()) || ocupado} onClick={rechazar}>
        {ocupado && <Loader2 size={14} className="iv-spin" />} Marcar rechazada</button>
    </>}>
      <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>Es final: para cotizar de nuevo se clona. El motivo alimenta el análisis de ventas perdidas.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {MOTIVOS_RECHAZO.map(m => (
          <button key={m} type="button" onClick={() => setMotivo(m)} className="badge"
            style={{ cursor: 'pointer', padding: '0.35rem 0.7rem', border: `1px solid ${motivo === m ? 'var(--y-brand)' : 'var(--border2)'}`, background: motivo === m ? 'var(--y-soft)' : 'var(--bg3)', color: 'var(--text)' }}>{m}</button>
        ))}
      </div>
      <div><label className="label-muted" style={{ display: 'block', marginBottom: 4 }}>Nota{motivo === 'Otro' ? ' *' : ' (opcional)'}</label>
        <textarea className="input" rows={2} value={nota} onChange={e => setNota(e.target.value)} /></div>
      {cot.estado !== 'Enviada' && <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.84rem' }}>Solo se rechaza una enviada.</p>}
      {error && <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.84rem' }}>{error}</p>}
    </Modal>
  );
}

const TIPO_EVENTO: Record<string, string> = {
  creada: 'Creada', clonada: 'Creada como copia', enviada: 'Enviada al cliente', reenviada: 'Reenviada',
  aprobada: 'Aprobada por el cliente', rechazada: 'Rechazada', borrador: 'Volvió a borrador', anulada: 'Anulada',
};

export function HistorialModal({ cot, onCerrar }: { cot: CotizacionDoc; onCerrar: () => void }) {
  const [eventos, setEventos] = useState<EventoCot[] | null>(null);
  useEffect(() => { cotizadorService.eventos(cot.id).then(setEventos).catch(() => setEventos([])); }, [cot.id]);
  return (
    <Modal titulo={`Historial de IV-${String(cot.folio).padStart(4, '0')}`} onCerrar={onCerrar} ancho={520}>
      {eventos === null ? <Loader2 size={16} className="iv-spin" /> : eventos.length === 0 ? <p style={{ color: 'var(--muted)', margin: 0 }}>Sin movimientos registrados.</p> : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {eventos.map(e => (
            <li key={e.id} style={{ borderLeft: '2px solid var(--y-brand)', padding: '0.2rem 0 0.7rem 0.8rem', position: 'relative' }}>
              <span style={{ position: 'absolute', left: -5, top: 6, width: 8, height: 8, borderRadius: 4, background: 'var(--y-brand)' }} />
              <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--text)' }}>{TIPO_EVENTO[e.tipo] || e.tipo}{e.revision ? ` · revisión ${e.revision}` : ''}</p>
              <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>
                {new Date(e.created_at).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}{e.usuario_nombre ? ` · ${e.usuario_nombre}` : ''}
              </p>
              {e.motivo && <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text)' }}>{e.motivo}</p>}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
