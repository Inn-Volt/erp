'use client';

/**
 * Rendir un gasto: monto, fecha, tipo, detalle, foto de la boleta y a qué corresponde
 * (obligatorio): un trabajo (cotización aprobada) o un proyecto — así suma al costo real y
 * se compara con lo cotizado. No se aprueba: queda «rendido».
 *   · Sin la fase 19: si la persona tiene un anticipo vigente, se rinde contra él.
 *   · Con la fase 19 (fondos): «¿Con qué pagaste?» sale del fondo lo que alcance y el resto se le
 *     debe; la boleta es obligatoria salvo «no me la dieron»; quien paga puede usar la tarjeta de
 *     la empresa. Con `gasto`, corrige uno ya rendido (lo observado vuelve a «rendido»).
 */

import { useEffect, useState } from 'react';
import { Camera, Loader2, Plus, Receipt, X } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { archivosOT, CATEGORIAS_GASTO, gastosService, type CategoriaGasto, type Gasto } from '@/services/operacion';
import type { Anticipo } from '@/services/fase5';
import { fondosService } from '@/services/fondos';
import { opcionesDePago, repartoPrevisto } from '@/lib/fondos';
import { useFase } from '@/lib/fases';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP } from '@/utils';

/** A qué va el gasto: «cot:<id>» (trabajo), «proy:<id>» (proyecto) u «ot:<id>» (de antes). */
export interface DestinoGasto { valor: string; etiqueta: string; grupo: 'Trabajos' | 'Proyectos' | 'OT' }

const destinoDe = (g: Gasto) => (g.cotizacion_id ? `cot:${g.cotizacion_id}` : g.proyecto_id ? `proy:${g.proyecto_id}` : g.ot_id ? `ot:${g.ot_id}` : '');

export default function NuevoGasto({ destinos, destinoInicial, anticipos, gasto, onClose, onListo }: {
  destinos: DestinoGasto[]; destinoInicial: string; anticipos: Anticipo[];
  /** Corregir un gasto ya rendido (o observado). */
  gasto?: Gasto | null;
  onClose: () => void; onListo: () => void;
}) {
  const { success, error: toastError } = useToast();
  const { puede } = usePermisos();
  const fondos = useFase(19);
  const vigentes = anticipos.filter(a => a.estado === 'entregado');
  const [f, setF] = useState({
    fecha: gasto?.fecha || fechaLocal(), monto: gasto ? Number(gasto.monto) : 0, categoria: (gasto?.categoria || 'combustible') as CategoriaGasto,
    descripcion: gasto?.descripcion || '', destino: gasto ? destinoDe(gasto) : destinoInicial, anticipo_id: vigentes[0]?.id || '',
    pagado_con: (gasto?.pagado_con === 'empresa' ? 'empresa' : 'fondo') as 'fondo' | 'empresa', sin_boleta: !!gasto?.sin_boleta,
  });
  const [boleta, setBoleta] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Lo disponible en el fondo (al corregir, cuenta también lo que este gasto ya tomaba).
  const [disponible, setDisponible] = useState<number | null>(null);
  useEffect(() => {
    if (!fondos) return;
    fondosService.situacion().then(c => setDisponible(c.disponible + (gasto ? Number(gasto.monto_fondo) || 0 : 0))).catch(() => setDisponible(null));
  }, [fondos, gasto]);
  const lbl = { display: 'block', marginBottom: 6 } as const;
  const fijo = !!destinoInicial && destinos.some(o => o.valor === destinoInicial);
  const puedeTarjeta = puede('gastos.aprobar');
  const reparto = repartoPrevisto(f.monto, disponible ?? 0);
  const opciones = opcionesDePago(f.monto, disponible ?? 0, puedeTarjeta);
  const tieneBoleta = !!boleta || !!gasto?.boleta_path;

  const guardar = async () => {
    if (!(f.monto > 0)) { toastError('Ingresa el monto'); return; }
    if (!f.destino) { toastError('Elige el trabajo o el proyecto del gasto'); return; }
    if (fondos && !tieneBoleta && !f.sin_boleta) { toastError('Agrega la foto de la boleta (o marca que no te la dieron)'); return; }
    const [tipo, id] = f.destino.split(':');
    setGuardando(true);
    try {
      const boleta_path = boleta ? await archivosOT.subir('gastos', boleta) : gasto?.boleta_path ?? null;
      const datos = {
        fecha: f.fecha, monto: f.monto, categoria: f.categoria, descripcion: f.descripcion.trim() || null, boleta_path,
        cotizacion_id: tipo === 'cot' ? id : null, proyecto_id: tipo === 'proy' ? id : null, ot_id: tipo === 'ot' ? id : null,
        ...(fondos ? { pagado_con: f.pagado_con, sin_boleta: f.sin_boleta && !boleta_path } : f.anticipo_id && !gasto ? { anticipo_id: f.anticipo_id } : {}),
      } as Partial<Gasto>;
      if (gasto) {
        await gastosService.actualizar(gasto.id, datos);
        if (boleta && gasto.boleta_path) archivosOT.eliminar(gasto.boleta_path);
        success(gasto.estado === 'observado' ? 'Gasto corregido: vuelve a «rendido»' : 'Gasto actualizado');
      } else {
        await gastosService.crear(datos);
        success(fondos && f.pagado_con !== 'empresa' && reparto.propio > 0 ? `Gasto rendido: te debemos ${formatCLP(reparto.propio)}` : 'Gasto rendido');
      }
      onListo();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo rendir'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 260 }}>
      <div className="modal-box" style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}><Receipt size={16} /> {gasto ? (gasto.estado === 'observado' ? 'Corregir el gasto observado' : 'Corregir el gasto') : 'Rendir un gasto'}</p>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          {gasto?.estado === 'observado' && gasto.motivo_rechazo && (
            <p style={{ margin: 0, padding: '0.5rem 0.7rem', borderRadius: 8, background: 'rgba(220,38,38,.08)', color: 'var(--danger)', fontSize: '0.84rem' }}>
              Observado: {gasto.motivo_rechazo}</p>
          )}
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

          {fondos ? (
            <div>
              <label className="label-muted" style={lbl}>¿Con qué pagaste?</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {opciones.map(o => (
                  <label key={o.valor} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem', color: 'var(--text)', cursor: 'pointer' }}>
                    <input type="radio" name="pagado_con" checked={f.pagado_con === o.valor} onChange={() => setF({ ...f, pagado_con: o.valor })} style={{ accentColor: 'var(--y-brand)' }} /> {o.texto}
                  </label>
                ))}
              </div>
              {f.monto > 0 && f.pagado_con === 'fondo' && disponible !== null && (
                <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--text)', background: 'var(--bg3)', borderRadius: 8, padding: '0.45rem 0.7rem' }}>
                  {reparto.como === 'fondo' ? <>Sale <b>{formatCLP(reparto.delFondo)}</b> de tu fondo (te quedan {formatCLP((disponible ?? 0) - reparto.delFondo)}).</>
                    : reparto.como === 'mixto' ? <>Sale <b>{formatCLP(reparto.delFondo)}</b> de tu fondo y te devolvemos <b>{formatCLP(reparto.propio)}</b> que pusiste.</>
                    : <>No tienes fondo: te devolvemos <b>{formatCLP(reparto.propio)}</b>.</>}
                </p>
              )}
              {f.pagado_con === 'empresa' && <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>No sale de ningún fondo ni se le debe a nadie: suma al costo del trabajo.</p>}
            </div>
          ) : vigentes.length > 0 && !gasto && (
            <div><label className="label-muted" style={lbl}>Rendir contra el anticipo</label>
              <select className="input" value={f.anticipo_id} onChange={e => setF({ ...f, anticipo_id: e.target.value })}>
                <option value="">No (lo pagué yo: me lo reembolsan)</option>
                {vigentes.map(a => <option key={a.id} value={a.id}>AN-{String(a.folio).padStart(4, '0')} · saldo {formatCLP(a.saldo ?? a.monto)}{a.motivo ? ` · ${a.motivo}` : ''}</option>)}
              </select></div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="btn btn-ghost" style={{ cursor: 'pointer', borderColor: fondos && !tieneBoleta && !f.sin_boleta ? 'var(--y-brand)' : undefined }}>
              <Camera size={14} /> {boleta ? boleta.name : gasto?.boleta_path ? 'Cambiar la foto de la boleta' : `Foto de la boleta${fondos ? ' *' : ''}`}
              <input type="file" accept="image/*" capture="environment" hidden onChange={e => { setBoleta(e.target.files?.[0] || null); setF(x => ({ ...x, sin_boleta: false })); }} />
            </label>
            {fondos && !tieneBoleta && (
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', color: 'var(--muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={f.sin_boleta} onChange={e => setF({ ...f, sin_boleta: e.target.checked })} style={{ accentColor: 'var(--y-brand)' }} />
                No me entregaron boleta ni voucher</label>
            )}
          </div>
        </div>
        <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Plus size={14} />} {gasto ? 'Guardar' : 'Rendir'}</button>
        </div>
      </div>
    </div>
  );
}
