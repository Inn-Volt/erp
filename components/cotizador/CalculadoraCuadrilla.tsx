'use client';

/**
 * Mano de obra por cuadrilla (del cotizador de antes, la hoja «Presupuesto Mano de Obra» del
 * Excel de InnVolt): cuántos técnicos y ayudantes, cuántos días y lo que cuesta el día de cada
 * uno. Entra como una línea de mano de obra «días × costo del día de la cuadrilla», con la
 * utilidad de siempre para la mano de obra. Los costos por día se recuerdan en este navegador.
 */

import NumeroInput from '@/components/NumeroInput';
import { useState } from 'react';
import { HardHat, Plus } from 'lucide-react';
import { Modal } from './ui';
import { costoCuadrilla, descripcionCuadrilla, type Cuadrilla } from '@/lib/cotizador/herramientas';
import { formatCLP } from '@/utils';

const CLAVE = 'innvolt.cuadrilla.v1';

function inicial(costoHora?: number | null): Cuadrilla {
  const tecnico = Math.round(((Number(costoHora) || 7500) * 8) / 1000) * 1000;
  const base: Cuadrilla = { tecnicos: 2, ayudantes: 1, dias: 1, costoDiaTecnico: tecnico, costoDiaAyudante: Math.round((tecnico * 2) / 3 / 1000) * 1000, extra: 0 };
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || 'null') as Partial<Cuadrilla> | null;
    return g ? { ...base, ...g, dias: 1 } : base;
  } catch { return base; }
}

export default function CalculadoraCuadrilla({ costoHora, onCerrar, onAgregar }: {
  /** Costo por hora general (Ajustes): de ahí sale el día del técnico la primera vez. */
  costoHora?: number | null;
  onCerrar: () => void;
  onAgregar: (l: { descripcion: string; dias: number; porDia: number }) => void;
}) {
  const [c, setC] = useState<Cuadrilla>(() => inicial(costoHora));
  const [descripcion, setDescripcion] = useState('');
  const r = costoCuadrilla(c);
  const set = (patch: Partial<Cuadrilla>) => setC(x => ({ ...x, ...patch }));
  const texto = descripcion.trim() || descripcionCuadrilla(c);
  const agregar = () => {
    try { localStorage.setItem(CLAVE, JSON.stringify({ tecnicos: c.tecnicos, ayudantes: c.ayudantes, costoDiaTecnico: c.costoDiaTecnico, costoDiaAyudante: c.costoDiaAyudante, extra: c.extra })); } catch { /* opcional */ }
    onAgregar({ descripcion: texto, dias: c.dias, porDia: r.porDia });
  };
  const campo: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
  return (
    <Modal titulo={<><HardHat size={15} /> Mano de obra por cuadrilla</>} onCerrar={onCerrar} ancho={520} pie={<>
      <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
      <button className="btn btn-primary" disabled={!(r.total > 0)} onClick={agregar}><Plus size={14} /> Agregar a la partida</button>
    </>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <label style={campo}><span className="label-muted">Técnicos</span>
          <NumeroInput className="input" min={0} decimales={0} mostrarCero autoFocus value={c.tecnicos} onChange={v => set({ tecnicos: Math.max(0, Math.round(v)) })} /></label>
        <label style={campo}><span className="label-muted">Ayudantes</span>
          <NumeroInput className="input" min={0} decimales={0} mostrarCero value={c.ayudantes} onChange={v => set({ ayudantes: Math.max(0, Math.round(v)) })} /></label>
        <label style={campo}><span className="label-muted">Días de trabajo</span>
          <NumeroInput className="input" min={0} decimales={1} value={c.dias} onChange={v => set({ dias: Math.max(0, v) })} /></label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <label style={campo}><span className="label-muted" title="Sueldo + leyes sociales ÷ días trabajados">Costo día técnico</span>
          <NumeroInput className="input" prefijo="$" min={0} decimales={0} value={c.costoDiaTecnico} onChange={v => set({ costoDiaTecnico: v })} /></label>
        <label style={campo}><span className="label-muted">Costo día ayudante</span>
          <NumeroInput className="input" prefijo="$" min={0} decimales={0} value={c.costoDiaAyudante} onChange={v => set({ costoDiaAyudante: v })} /></label>
        <label style={campo}><span className="label-muted" title="Colación, movilización, herramientas…">Extra</span>
          <NumeroInput className="input" sufijo="%" min={0} max={200} mostrarCero value={c.extra} onChange={v => set({ extra: v })} /></label>
      </div>
      <label style={campo}><span className="label-muted">Descripción (lo que lee el cliente)</span>
        <input className="input" value={descripcion} maxLength={200} onChange={e => setDescripcion(e.target.value)} placeholder={descripcionCuadrilla(c)} /></label>
      <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '0.6rem 0.8rem', fontSize: '0.86rem', color: 'var(--text)' }}>
        <p style={{ margin: 0 }}>Costo de la cuadrilla: <b>{formatCLP(r.porDia)}</b> por día · <b>{formatCLP(r.total)}</b> en {String(c.dias).replace('.', ',')} día{c.dias === 1 ? '' : 's'}</p>
        <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '0.78rem' }}>
          {r.personas} persona{r.personas === 1 ? '' : 's'} · {r.hh.toLocaleString('es-CL')} horas hombre (jornada de 8 h). Entra como «{c.dias} día × costo del día», con la utilidad de la mano de obra; después se ajusta en la línea.
        </p>
      </div>
    </Modal>
  );
}
