'use client';

/** Piezas chicas del cotizador TecApp: estado, bloque plegable, menú ⋯, modal y motivo. */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Loader2, MoreHorizontal, X } from 'lucide-react';
import { estadoCot } from '@/lib/cotizador/tipos';

export function EstadoPill({ estado, vencida }: { estado: string; vencida?: boolean }) {
  const e = estadoCot(estado);
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <span className="badge" style={{ background: e.fondo, color: e.color, fontWeight: 700, fontSize: '0.72rem' }} title={e.ayuda}>{e.clave}</span>
      {vencida && <span className="badge" style={{ background: 'rgba(217,119,6,.15)', color: '#d97706', fontWeight: 700, fontSize: '0.72rem' }}>Vencida</span>}
    </span>
  );
}

export function BloquePlegable({ id, titulo, resumen, abierto, onAlternar, children, marcado }: {
  id: string; titulo: string; resumen?: string; abierto: boolean; onAlternar: () => void; children: React.ReactNode; marcado?: boolean;
}) {
  return (
    <section id={id} className="panel-y" style={{ border: marcado ? '1px solid var(--danger)' : undefined }}>
      <button type="button" onClick={onAlternar} aria-expanded={abierto}
        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '0.75rem 1rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        {abierto ? <ChevronDown size={15} color="var(--muted)" /> : <ChevronRight size={15} color="var(--muted)" />}
        <span className="section-label" style={{ margin: 0 }}>{titulo}</span>
        {!abierto && resumen && <span style={{ flex: 1, minWidth: 0, fontSize: '0.82rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resumen}</span>}
      </button>
      {abierto && <div style={{ padding: '0 1rem 1rem' }}>{children}</div>}
    </section>
  );
}

/**
 * Menú ⋯ que se cierra al tocar fuera. `children` recibe `cerrar`.
 * Se dibuja sobre toda la página (portal, posición fija): una tabla con scroll o una
 * tarjeta con `overflow: hidden` no lo recortan. Se abre hacia abajo, o hacia arriba
 * si no cabe.
 */
export function MenuAcciones({ etiqueta, children, ancho = 230 }: { etiqueta: string; children: (cerrar: () => void) => React.ReactNode; ancho?: number }) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxH: number } | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const abierto = pos !== null;
  const cerrar = () => setPos(null);

  const abrir = () => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.right - ancho, window.innerWidth - ancho - 8));
    const abajo = window.innerHeight - r.bottom - 8;
    const arriba = r.top - 8;
    setPos(abajo >= 260 || abajo >= arriba
      ? { top: r.bottom + 4, left, maxH: abajo - 4 }
      : { bottom: window.innerHeight - r.top + 4, left, maxH: arriba - 4 });
  };

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !boton.current?.contains(t)) setPos(null);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null); };
    // Al desplazar la página (no el propio menú) o cambiar el tamaño, se cierra: quedaría flotando lejos del botón.
    const mover = (e: Event) => { if (!menu.current?.contains(e.target as Node)) setPos(null); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', mover, true);
    window.addEventListener('resize', cerrar);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', mover, true);
      window.removeEventListener('resize', cerrar);
    };
  }, [abierto]);

  return (
    <>
      <button ref={boton} type="button" aria-label={etiqueta} title={etiqueta} aria-expanded={abierto} aria-haspopup="menu"
        onClick={() => (abierto ? cerrar() : abrir())} className="btn btn-ghost btn-xs" style={{ padding: '0.25rem 0.4rem' }}>
        <MoreHorizontal size={14} />
      </button>
      {pos && createPortal(
        <div ref={menu} role="menu" className="menu-cot" style={{
          position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, zIndex: 300, width: ancho, maxHeight: pos.maxH, overflowY: 'auto',
          background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.25)',
        }}>
          {children(cerrar)}
        </div>,
        document.body,
      )}
    </>
  );
}

export const opcionMenu: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '0.55rem 0.85rem', background: 'none', border: 'none',
  color: 'var(--text)', fontSize: '0.84rem', cursor: 'pointer',
};

export function Modal({ titulo, onCerrar, children, pie, ancho = 520 }: {
  titulo: React.ReactNode; onCerrar: () => void; children: React.ReactNode; pie?: React.ReactNode; ancho?: number;
}) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }} style={{ zIndex: 220 }}>
      <div className="modal-box" style={{ maxWidth: ancho, width: '95%', display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)', gap: 8 }}>
          <p className="section-label" style={{ margin: 0 }}>{titulo}</p>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: '1.1rem 1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
        {pie && <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>{pie}</div>}
      </div>
    </div>
  );
}

/** Pide un motivo (volver a borrador, anular, cambiar ganancias…). */
export function PedirMotivo({ titulo, ayuda, accion, peligro, onCerrar, onConfirmar }: {
  titulo: string; ayuda?: string; accion: string; peligro?: boolean; onCerrar: () => void; onConfirmar: (motivo: string) => Promise<void> | void;
}) {
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const confirmar = async () => {
    if (!motivo.trim()) return;
    setOcupado(true);
    try { await onConfirmar(motivo.trim()); } finally { setOcupado(false); }
  };
  return (
    <Modal titulo={titulo} onCerrar={onCerrar} ancho={460} pie={<>
      <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
      <button className={peligro ? 'btn btn-danger' : 'btn btn-primary'} disabled={!motivo.trim() || ocupado} onClick={confirmar}>
        {ocupado && <Loader2 size={14} className="iv-spin" />} {accion}</button>
    </>}>
      {ayuda && <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>{ayuda}</p>}
      <label className="label-muted">Motivo *</label>
      <textarea className="input" rows={3} autoFocus value={motivo} onChange={e => setMotivo(e.target.value)} />
    </Modal>
  );
}

export const etiqueta: React.CSSProperties = { display: 'block', marginBottom: 6, fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600 };
export const campoChico: React.CSSProperties = { padding: '0.35rem 0.5rem', fontSize: '0.84rem' };
