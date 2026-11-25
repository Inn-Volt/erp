'use client';

/**
 * Registrar (o corregir) un abono de un trabajo: monto libre, fecha, medio, N° de operación, foto o
 * PDF del comprobante (en el celular abre la cámara) y una nota. Atajos: el saldo completo y lo que
 * el plan ya esperaba.
 */

import { useState } from 'react';
import { Camera, CheckCircle2, Loader2, Paperclip } from 'lucide-react';
import { Modal } from '@/components/cotizador/ui';
import NumeroInput from '@/components/NumeroInput';
import { MEDIOS_ABONO, type MedioAbono } from '@/lib/cobranza';
import { cobranzaService, type Abono } from '@/services/cobranza';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP } from '@/utils';

const lbl = { display: 'block', marginBottom: 4 } as const;

export default function RegistrarAbono({ cotId, folio, abono, saldo, atrasado, onCerrar, onListo }: {
  cotId: string; folio: string;
  /** Para corregir uno ya anotado. */
  abono?: Abono | null;
  saldo: number; atrasado: number;
  onCerrar: () => void; onListo: () => void;
}) {
  const { success, error: toastError } = useToast();
  const hoy = fechaLocal();
  const [monto, setMonto] = useState<number>(abono ? Number(abono.monto) : 0);
  const [fecha, setFecha] = useState(abono?.fecha || hoy);
  const [medio, setMedio] = useState<MedioAbono>(abono?.medio || 'transferencia');
  const [referencia, setReferencia] = useState(abono?.referencia || '');
  const [nota, setNota] = useState(abono?.nota || '');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!(monto > 0)) { toastError('Escribe el monto del abono.'); return; }
    if (fecha > hoy) { toastError('La fecha no puede ser futura.'); return; }
    setGuardando(true);
    try {
      const comprobante_path = archivo ? await cobranzaService.subirComprobante(archivo) : abono?.comprobante_path || null;
      await cobranzaService.guardarAbono({ cotizacion_id: cotId, fecha, monto: Math.round(monto), medio, referencia, nota, comprobante_path }, abono?.id);
      success(abono ? 'Abono corregido' : `Abono de ${formatCLP(monto)} registrado`);
      onListo();
    } catch (e) {
      toastError(e instanceof Error ? e.message : (e as { message?: string } | null)?.message || 'No se pudo guardar el abono');
    } finally { setGuardando(false); }
  };

  const atajos: [string, number][] = [
    ...(saldo > 0 ? [[`El saldo: ${formatCLP(saldo)}`, saldo] as [string, number]] : []),
    ...(atrasado > 0 && atrasado !== saldo ? [[`Lo esperado: ${formatCLP(atrasado)}`, atrasado] as [string, number]] : []),
  ];

  return (
    <Modal titulo={`${abono ? 'Corregir abono' : 'Registrar abono'} · ${folio}`} onCerrar={onCerrar} ancho={480} pie={<>
      <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
      <button className="btn btn-primary" disabled={guardando || !(monto > 0)} onClick={guardar}>
        {guardando ? <Loader2 size={14} className="iv-spin" /> : <CheckCircle2 size={14} />} {abono ? 'Guardar' : 'Registrar'}</button>
    </>}>
      <div>
        <label className="label-muted" style={lbl}>Monto recibido</label>
        <NumeroInput className="input" prefijo="$" decimales={0} value={monto} onChange={v => setMonto(Math.max(0, Math.round(v)))} ariaLabel="Monto del abono" autoFocus />
        {!abono && atajos.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {atajos.map(([t, v]) => <button key={t} type="button" className="btn btn-ghost btn-xs" onClick={() => setMonto(v)}>{t}</button>)}
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
        <div><label className="label-muted" style={lbl}>Fecha</label>
          <input className="input" type="date" value={fecha} max={hoy} onChange={e => setFecha(e.target.value)} /></div>
        <div><label className="label-muted" style={lbl}>Medio</label>
          <select className="input" value={medio} onChange={e => setMedio(e.target.value as MedioAbono)}>
            {MEDIOS_ABONO.map(m => <option key={m.clave} value={m.clave}>{m.nombre}</option>)}
          </select></div>
      </div>
      <div><label className="label-muted" style={lbl}>N° de operación o de cheque (opcional)</label>
        <input className="input" value={referencia} maxLength={60} onChange={e => setReferencia(e.target.value)} /></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
          <Camera size={14} /> Foto del comprobante
          <input type="file" hidden accept="image/*" capture="environment" onChange={e => setArchivo(e.target.files?.[0] || null)} />
        </label>
        <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
          <Paperclip size={14} /> Archivo
          <input type="file" hidden accept="image/*,application/pdf" onChange={e => setArchivo(e.target.files?.[0] || null)} />
        </label>
        {(archivo || abono?.comprobante_path) && (
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)', alignSelf: 'center', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
            {archivo ? archivo.name : 'Ya tiene comprobante'}</span>
        )}
      </div>
      <div><label className="label-muted" style={lbl}>Nota (opcional)</label>
        <textarea className="input" rows={2} value={nota} maxLength={300} onChange={e => setNota(e.target.value)} placeholder="Ej.: abono acordado por WhatsApp" /></div>
    </Modal>
  );
}
