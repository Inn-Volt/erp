'use client';

/**
 * Llena un informe a partir de su plantilla (fase 8): las preguntas (texto, número, sí/no,
 * opciones) y el checklist. Lo usan la visita de la agenda y el acta de entrega.
 * `grande`: campos de 16 px para el celular en terreno.
 */

import NumeroInput from '@/components/NumeroInput';
import TextoFormato from '@/components/TextoFormato';
import { valorLegible, type InformeLleno, type ValorCampo } from '@/services/informes';

export default function FormularioInforme({ informe, onCambiar, editable = true, grande = false }: {
  informe: InformeLleno; onCambiar: (i: InformeLleno) => void; editable?: boolean; grande?: boolean;
}) {
  const responder = (clave: string, v: ValorCampo) => onCambiar({ ...informe, respuestas: { ...informe.respuestas, [clave]: v } });
  const tam = grande ? { fontSize: 16, padding: '0.65rem 0.8rem' } : {};

  if (!informe.campos.length && !informe.checklist.length) {
    return <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>Esta plantilla no tiene preguntas ni checklist.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {informe.intro?.trim() && <TextoFormato texto={informe.intro} style={{ fontSize: '0.86rem', color: 'var(--muted)' }} />}

      {informe.campos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {informe.campos.map((c, ci) => {
            const v = informe.respuestas[c.clave];
            return (
              <label key={`${c.clave || 'campo'}-${ci}`} style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: c.tipo === 'texto' ? '1 / -1' : undefined }}>
                <span className="label-muted">{c.etiqueta}</span>
                {!editable ? <span style={{ fontSize: '0.9rem', color: 'var(--text)' }}>{valorLegible(c, v)}</span>
                  : c.tipo === 'texto' ? (
                    <textarea className="input" rows={2} value={(v as string) || ''} onChange={e => responder(c.clave, e.target.value)} style={tam} />
                  ) : c.tipo === 'numero' ? (
                    <NumeroInput className="input" value={typeof v === 'number' ? v : null} mostrarCero decimales={3} sufijo={c.unidad}
                      onChange={n => responder(c.clave, n)} onVacio={() => responder(c.clave, null)} style={tam} />
                  ) : c.tipo === 'si_no' ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {([['Sí', true], ['No', false]] as [string, boolean][]).map(([t, b]) => (
                        <button key={t} type="button" onClick={() => responder(c.clave, v === b ? null : b)} aria-pressed={v === b}
                          className="btn btn-sm" style={{ flex: 1, background: v === b ? 'var(--y-soft)' : 'transparent', border: `1px solid ${v === b ? 'var(--y-brand)' : 'var(--border2)'}`, color: 'var(--text)', height: grande ? 42 : undefined }}>{t}</button>
                      ))}
                    </div>
                  ) : (
                    <select className="input" value={(v as string) || ''} onChange={e => responder(c.clave, e.target.value || null)} style={tam}>
                      <option value="">Elegir…</option>
                      {(c.opciones || []).filter(Boolean).map((o, oi) => <option key={`${o}-${oi}`} value={o}>{o}</option>)}
                    </select>
                  )}
              </label>
            );
          })}
        </div>
      )}

      {informe.checklist.length > 0 && (
        <div style={{ border: '1px solid var(--border2)', borderRadius: 10, padding: '0.5rem 0.75rem' }}>
          <span className="label-muted">Checklist</span>
          {informe.checklist.map((it, i) => (
            <label key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: grande ? '0.5rem 0' : '0.3rem 0', fontSize: grande ? 15 : '0.88rem', color: 'var(--text)', cursor: editable ? 'pointer' : 'default' }}>
              <input type="checkbox" checked={it.ok} disabled={!editable} style={{ accentColor: 'var(--y-brand)', width: grande ? 20 : 16, height: grande ? 20 : 16 }}
                onChange={e => onCambiar({ ...informe, checklist: informe.checklist.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)) })} />
              <span>{it.texto}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
