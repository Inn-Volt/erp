'use client';

/**
 * Resumen del análisis de proyecto (fase 22): las partidas en filas y los tipos de costo en columnas;
 * cada celda dice «gastado de presupuestado» con su barra (verde, amarilla desde el 90 %, roja si se
 * pasó) y al final el total. Arriba, «Para mirar»: lo pasado de presupuesto y lo pendiente.
 */

import { AlertTriangle, CircleAlert, Info } from 'lucide-react';
import { TIPOS_COSTO } from '@/lib/controlProyecto';
import type { Analisis } from '@/lib/analisisProyecto';
import { CeldaGasto } from '@/components/trabajos/analisis/comun';

const ICONO = { sobre: CircleAlert, alerta: AlertTriangle, info: Info };
const COLOR = { sobre: 'var(--danger)', alerta: 'var(--y)', info: 'var(--muted)' };

export default function Resumen({ a }: { a: Analisis }) {
  // Solo los tipos con algo presupuestado o gastado (siempre al menos material).
  const tipos = TIPOS_COSTO.filter(t => t.clave === 'material' || a.porTipo[t.clave].presupuesto || a.porTipo[t.clave].gastado);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {a.paraMirar.length > 0 && (
        <div style={{ padding: '0.6rem 0.8rem', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', fontSize: '0.82rem' }}>
          <b style={{ color: 'var(--text)' }}>Para mirar</b>
          <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {a.paraMirar.map(x => {
              const Icono = ICONO[x.nivel];
              return <li key={x.clave} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', color: 'var(--text)' }}>
                <Icono size={14} style={{ color: COLOR[x.nivel], flexShrink: 0, marginTop: 2 }} aria-hidden /> {x.texto}</li>;
            })}
          </ul>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="iv-table" style={{ fontSize: '0.8rem', width: '100%' }}>
          <thead><tr>
            <th>Partida</th>
            {tipos.map(t => <th key={t.clave}>{t.nombre}</th>)}
            <th>Total</th>
          </tr></thead>
          <tbody>
            {a.partidas.map(f => (
              <tr key={f.id || 'sin'}>
                <td style={{ minWidth: 150 }}>{f.numero !== null && <span style={{ color: 'var(--muted)' }}>{f.numero}. </span>}{f.nombre}</td>
                {tipos.map(t => <td key={t.clave}><CeldaGasto c={f.celdas[t.clave]} compacta /></td>)}
                <td><CeldaGasto c={f.total} /></td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--border2)', fontWeight: 700 }}>
              <td>Total</td>
              {tipos.map(t => <td key={t.clave}><CeldaGasto c={a.porTipo[t.clave]} compacta /></td>)}
              <td><CeldaGasto c={a.total} /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>
        Cada celda: lo gastado de lo presupuestado. Gastado = gastos rendidos + compras (con factura, el neto) + mano de obra y servicios;
        una boleta o factura con detalle se reparte en sus partidas. La barra se pone amarilla desde el 90 % y roja cuando se pasa.
      </p>
    </div>
  );
}
