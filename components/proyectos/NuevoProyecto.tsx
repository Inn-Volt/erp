'use client';

/** Crear o editar un proyecto (nombre, cliente, responsable, estado, fechas y presupuesto). */

import { useEffect, useState } from 'react';
import { FolderKanban, Loader2, Plus, X } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { ESTADOS_PROYECTO, proyectosService, type Proyecto } from '@/services/fase5';
import { clientesService } from '@/services/clientes';
import { vendedoresService } from '@/services/vendedores';
import { useToast } from '@/hooks/useToast';
import type { Cliente, Vendedor } from '@/types';

export default function NuevoProyecto({ inicial, onCerrar, onListo }: { inicial?: Partial<Proyecto>; onCerrar: () => void; onListo: (id: string) => void }) {
  const { error: toastError } = useToast();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [equipo, setEquipo] = useState<Record<string, Vendedor>>({});
  const [f, setF] = useState<Partial<Proyecto>>({ nombre: '', estado: 'planificado', ...inicial });
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { clientesService.getAll().then(setClientes).catch(() => {}); vendedoresService.mapa().then(setEquipo); }, []);
  const guardar = async () => {
    if (!f.nombre?.trim()) { toastError('Ponle nombre al proyecto'); return; }
    setOcupado(true);
    try { onListo(await proyectosService.guardar({ ...f, nombre: f.nombre.trim() })); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setOcupado(false); }
  };
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 560, width: '95%', display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}><FolderKanban size={15} /> {f.id ? 'Editar proyecto' : 'Nuevo proyecto'}</p>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: '1.1rem 1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label><span className="label-muted">Nombre *</span><input className="input" autoFocus value={f.nombre || ''} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Edificio Los Andes: normalización eléctrica" /></label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <label><span className="label-muted">Cliente</span>
              <select className="input" value={f.cliente_id || ''} onChange={e => setF({ ...f, cliente_id: e.target.value || null })}>
                <option value="">Sin cliente</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre_cliente}</option>)}</select></label>
            <label><span className="label-muted">Responsable</span>
              <select className="input" value={f.responsable_id || ''} onChange={e => setF({ ...f, responsable_id: e.target.value || null })}>
                <option value="">—</option>{Object.values(equipo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
            <label><span className="label-muted">Estado</span>
              <select className="input" value={f.estado} onChange={e => setF({ ...f, estado: e.target.value as Proyecto['estado'] })}>
                {ESTADOS_PROYECTO.map(x => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}</select></label>
            <label><span className="label-muted">Inicio</span><input className="input" type="date" value={f.fecha_inicio || ''} onChange={e => setF({ ...f, fecha_inicio: e.target.value || null })} /></label>
            <label><span className="label-muted">Término</span><input className="input" type="date" value={f.fecha_fin || ''} onChange={e => setF({ ...f, fecha_fin: e.target.value || null })} /></label>
            <label><span className="label-muted">Presupuesto (costo)</span><NumeroInput className="input" prefijo="$" value={Number(f.presupuesto) || 0} onChange={v => setF({ ...f, presupuesto: v || null })} /></label>
          </div>
          <label><span className="label-muted">Descripción</span><textarea className="input" rows={3} value={f.descripcion || ''} onChange={e => setF({ ...f, descripcion: e.target.value })} /></label>
        </div>
        <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={ocupado}>{ocupado ? <Loader2 size={14} className="iv-spin" /> : <Plus size={14} />} Guardar</button>
        </div>
      </div>
    </div>
  );
}
