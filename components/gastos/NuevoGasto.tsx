'use client';

/**
 * Rendir un gasto: monto, fecha, tipo, detalle, foto de la boleta y a qué corresponde
 * (obligatorio): un trabajo (cotización aprobada) o un proyecto — así suma al costo real y
 * se compara con lo cotizado. Si la persona tiene un anticipo vigente, se rinde contra él.
 * No se aprueba: queda «rendido».
 */

import { useState } from 'react';
import { Camera, Loader2, Plus, Receipt, X } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { archivosOT, CATEGORIAS_GASTO, gastosService, type CategoriaGasto, type Gasto } from '@/services/operacion';
import type { Anticipo } from '@/services/fase5';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP } from '@/utils';

/** A qué va el gasto: «cot:<id>» (trabajo), «proy:<id>» (proyecto) u «ot:<id>» (de antes). */
export interface DestinoGasto { valor: string; etiqueta: string; grupo: 'Trabajos' | 'Proyectos' | 'OT' }

export default function NuevoGasto({ destinos, destinoInicial, anticipos, onClose, onListo }: {
  destinos: DestinoGasto[]; destinoInicial: string; anticipos: Anticipo[]; onClose: () => void; onListo: () => void;
}) {
  const { success, error: toastError } = useToast();
  const vigentes = anticipos.filter(a => a.estado === 'entregado');
  const [f, setF] = useState({ fecha: fechaLocal(), monto: 0, categoria: 'combustible' as CategoriaGasto, descripcion: '', destino: destinoInicial, anticipo_id: vigentes[0]?.id || '' });
  const [boleta, setBoleta] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const lbl = { display: 'block', marginBottom: 6 } as const;
  const fijo = !!destinoInicial && destinos.some(o => o.valor === destinoInicial);

  const guardar = async () => {
    if (!(f.monto > 0)) { toastError('Ingresa el monto'); return; }
    if (!f.destino) { toastError('Elige el trabajo o el proyecto del gasto'); return; }
    const [tipo, id] = f.destino.split(':');
    setGuardando(true);
    try {
      const boleta_path = boleta ? await archivosOT.subir('gastos', boleta) : null;
      await gastosService.crear({
        fecha: f.fecha, monto: f.monto, categoria: f.categoria, descripcion: f.descripcion.trim() || null, boleta_path,
        ...(tipo === 'cot' ? { cotizacion_id: id } : tipo === 'proy' ? { proyecto_id: id } : { ot_id: id }),
        ...(f.anticipo_id ? { anticipo_id: f.anticipo_id } : {}),
      } as Partial<Gasto>);
      success('Gasto rendido'); onListo();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo rendir'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 260 }}>
      <div className="modal-box" style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}><Receipt size={16} /> Rendir un gasto</p>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div><label className="label-muted" style={lbl}>¿De qué trabajo o proyecto? *</label>
            <select className="input" value={f.destino} disabled={fijo} onChange={e => setF({ ...f, destino: e.target.value })}>
              <option value="">Elegir…</option>
              {(['Trabajos', 'Proyectos', 'OT'] as const).map(g => destinos.some(d => d.grupo === g) && (
                <optgroup key={g} label={g}>
                  {destinos.filter(d => d.grupo === g).map(d => <option key={d.valor} value={d.valor}>{d.etiqueta}</option>)}
                </optgroup>
              ))}
            </select>
            {destinos.length === 0 && <p style={{ margin: '4px 0 0', fontSize: '0.76rem', color: 'var(--muted)' }}>Aún no hay trabajos aprobados ni proyectos.</p>}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label-muted" style={lbl}>Monto *</label><NumeroInput className="input" prefijo="$" value={f.monto} onChange={v => setF({ ...f, monto: v })} /></div>
            <div><label className="label-muted" style={lbl}>Fecha</label><input className="input" type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></div>
          </div>
          <div><label className="label-muted" style={lbl}>Tipo</label>
            <select className="input" value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value as CategoriaGasto })}>
              {CATEGORIAS_GASTO.map(c => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}</select></div>
          <div><label className="label-muted" style={lbl}>Detalle</label><input className="input" value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} placeholder="Bencina camioneta, peaje Ruta 68…" /></div>
          {vigentes.length > 0 && (
            <div><label className="label-muted" style={lbl}>Rendir contra el anticipo</label>
              <select className="input" value={f.anticipo_id} onChange={e => setF({ ...f, anticipo_id: e.target.value })}>
                <option value="">No (lo pagué yo: me lo reembolsan)</option>
                {vigentes.map(a => <option key={a.id} value={a.id}>AN-{String(a.folio).padStart(4, '0')} · saldo {formatCLP(a.saldo ?? a.monto)}{a.motivo ? ` · ${a.motivo}` : ''}</option>)}
              </select></div>
          )}
          <label className="btn btn-ghost" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
            <Camera size={14} /> {boleta ? boleta.name : 'Foto de la boleta'}
            <input type="file" accept="image/*" capture="environment" hidden onChange={e => setBoleta(e.target.files?.[0] || null)} />
          </label>
        </div>
        <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Plus size={14} />} Rendir</button>
        </div>
      </div>
    </div>
  );
}
