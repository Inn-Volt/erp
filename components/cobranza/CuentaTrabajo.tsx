'use client';

/**
 * La cuenta de un trabajo (fase 25): abonado de total, saldo, lo que el plan esperaba (guía), los
 * impuestos de lo abonado y cada abono con su comprobante. Quien tiene «facturacion.gestionar»
 * registra, corrige o borra abonos. Va en el panel del trabajo y en la ficha de Cobranza.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { cuentaTrabajo, MEDIOS_ABONO, NOMBRE_ESTADO_CUENTA, recordatorioSaldo, type Cuenta, type EstadoCuenta } from '@/lib/cobranza';
import { CUANDO_COBRO } from '@/lib/cotizador/tipos';
import { enMonedaExtranjera } from '@/lib/cotizador/planCobro';
import { cobranzaService, ivaRatio, planDeTrabajo, totalPesos, type Abono, type AjustesCobranza, type TrabajoCobranza } from '@/services/cobranza';
import { useValoresDia } from '@/hooks/useValoresDia';
import { useToast } from '@/hooks/useToast';
import { formatCLP, formatDate } from '@/utils';
import RegistrarAbono from './RegistrarAbono';

export const folioIV = (folio: number) => `IV-${String(folio).padStart(4, '0')}`;

export const COLOR_ESTADO: Record<EstadoCuenta, string> = {
  sin_abonos: 'var(--muted)', parcial: '#2563eb', pagado: 'var(--success)', de_mas: '#7c3aed',
};

/** La cuenta de un trabajo con la UF y el dólar de hoy (para los cobros del plan en esas monedas). */
export function useCuenta(t: TrabajoCobranza | null, aj: AjustesCobranza | null, abonos: { fecha: string; monto: number }[]): Cuenta | null {
  const plan = useMemo(() => (t && aj ? planDeTrabajo(t, aj.plan) : []), [t, aj]);
  const valores = useValoresDia(plan.some(enMonedaExtranjera)) ?? undefined;
  return useMemo(() => (t && aj ? cuentaTrabajo({
    total: totalPesos(t), ivaRatio: ivaRatio(t), plan, valores, abonos, terminado: t.trabajo_estado === 'terminado', ppmPct: aj.ppmPct,
  }) : null), [t, aj, plan, valores, abonos]);
}

export function Barra({ pct, color }: { pct: number; color: string }) {
  return (
    <span style={{ display: 'block', height: 6, borderRadius: 4, background: 'var(--bg3)', overflow: 'hidden' }} aria-hidden>
      <span style={{ display: 'block', height: '100%', width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color }} />
    </span>
  );
}

export default function CuentaTrabajo({ cotId, trabajo, ajustes, puedeAnotar, empresa, onCambio }: {
  cotId: string;
  /** Si ya se tienen (la lista de Cobranza); si no, se cargan. */
  trabajo?: TrabajoCobranza | null; ajustes?: AjustesCobranza | null;
  puedeAnotar: boolean;
  /** Para el recordatorio del saldo (datos para transferir). */
  empresa?: Parameters<typeof recordatorioSaldo>[0]['empresa'];
  onCambio?: () => void;
}) {
  const { error: toastError } = useToast();
  const [t, setT] = useState<TrabajoCobranza | null>(trabajo ?? null);
  const [aj, setAj] = useState<AjustesCobranza | null>(ajustes ?? null);
  const [abonos, setAbonos] = useState<Abono[] | null>(null);
  const [editando, setEditando] = useState<Abono | null | 'nuevo'>(null);

  const cargar = useCallback(async () => {
    try {
      const [tt, aa, ab] = await Promise.all([
        trabajo ? Promise.resolve(trabajo) : cobranzaService.trabajo(cotId),
        ajustes ? Promise.resolve(ajustes) : cobranzaService.ajustes(),
        cobranzaService.abonosDe(cotId),
      ]);
      setT(tt); setAj(aa); setAbonos(ab);
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo cargar la cuenta del trabajo'); setAbonos([]); }
  }, [cotId, trabajo, ajustes, toastError]);
  useEffect(() => { cargar(); }, [cargar]);

  const c = useCuenta(t, aj, abonos || []);
  if (!t || !aj || !abonos || !c) return <div className="skeleton" style={{ height: 90 }} />;

  const folio = folioIV(t.folio);
  const listo = () => { setEditando(null); cargar(); onCambio?.(); };
  const borrar = async (a: Abono) => {
    if (!confirm(`¿Borrar el abono de ${formatCLP(a.monto)} del ${formatDate(a.fecha)}?`)) return;
    try { await cobranzaService.eliminarAbono(a); listo(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo borrar'); }
  };
  const verComprobante = async (path: string) => {
    const url = await cobranzaService.urlComprobante(path);
    if (url) window.open(url, '_blank', 'noopener'); else toastError('No se pudo abrir el comprobante');
  };
  const tel = (t.clientes?.telefono || '').replace(/[^\d]/g, '');
  const mensaje = recordatorioSaldo({ contacto: t.clientes?.contacto_nombre || t.clientes?.nombre_cliente, folio, titulo: t.titulo, abonado: c.abonado, total: c.total, saldo: c.saldo, empresa });
  const fila = { display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.84rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border2)', color: 'var(--text)' } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {editando && (
        <RegistrarAbono cotId={cotId} folio={folio} abono={editando === 'nuevo' ? null : editando} saldo={c.saldo} atrasado={c.atrasado}
          onCerrar={() => setEditando(null)} onListo={listo} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.86rem', color: 'var(--text)' }}>
            Abonado <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCLP(c.abonado)}</b> de {formatCLP(c.total)}
          </span>
          <span className="badge" style={{ background: 'var(--bg3)', color: COLOR_ESTADO[c.estado], fontSize: '0.7rem' }}>{NOMBRE_ESTADO_CUENTA[c.estado]}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: '0.86rem', color: 'var(--text)' }}>
            {c.deMas > 0 ? <>Pagó de más <b>{formatCLP(c.deMas)}</b></> : <>Saldo <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCLP(c.saldo)}</b></>}
          </span>
        </div>
        <Barra pct={c.pct} color={COLOR_ESTADO[c.estado]} />
        {c.atrasado > 0 && (
          <span style={{ fontSize: '0.8rem', color: 'var(--y)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <AlertTriangle size={13} aria-hidden /> Según el plan ya debería haber entrado {formatCLP(c.atrasado)} más.
          </span>
        )}
      </div>

      {c.hitos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="label-muted">Plan de cobro (guía)</span>
          {c.hitos.map(h => (
            <div key={h.nombre} style={{ ...fila, borderBottomStyle: 'dashed', color: h.estado === 'por_venir' ? 'var(--muted)' : 'var(--text)' }}>
              <span style={{ flex: 1, minWidth: 0 }}>{h.nombre} <span style={{ color: 'var(--muted)' }}>· {CUANDO_COBRO[h.cuando]}</span></span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCLP(h.monto)}</span>
              <span style={{ fontSize: '0.74rem', minWidth: 92, textAlign: 'right', color: h.estado === 'cubierto' ? 'var(--success)' : h.estado === 'pendiente' ? 'var(--y)' : 'var(--muted)' }}>
                {h.estado === 'cubierto' ? <><CheckCircle2 size={12} style={{ verticalAlign: '-2px' }} aria-hidden /> Cubierto</>
                  : h.estado === 'parcial' ? `${formatCLP(h.cubierto)} de ${formatCLP(h.monto)}`
                  : h.estado === 'pendiente' ? 'Pendiente' : 'Más adelante'}
              </span>
            </div>
          ))}
        </div>
      )}

      {c.abonado > 0 && (c.iva > 0 || c.ppm > 0) && (
        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          De lo abonado: IVA {formatCLP(c.iva)} (va al SII){c.ppm > 0 ? ` · PPM ${formatCLP(c.ppm)}` : ''} · <b style={{ color: 'var(--text)' }}>queda {formatCLP(c.queda)}</b>
        </span>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="label-muted" style={{ flex: 1 }}>Abonos ({abonos.length})</span>
          {puedeAnotar && <button className="btn btn-primary btn-sm" onClick={() => setEditando('nuevo')}><Plus size={13} /> Registrar abono</button>}
        </div>
        {abonos.length === 0 ? (
          <p style={{ margin: '6px 0 0', fontSize: '0.84rem', color: 'var(--muted)' }}>Todavía no hay abonos. Anota cada pago apenas llegue, del monto que sea.</p>
        ) : abonos.map(a => (
          <div key={a.id} style={fila}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block' }}>{formatDate(a.fecha)} · {MEDIOS_ABONO.find(m => m.clave === a.medio)?.nombre}{a.referencia ? ` · ${a.referencia}` : ''}</span>
              {(a.nota || a.profiles?.nombre) && <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{[a.nota, a.profiles?.nombre ? `anotó ${a.profiles.nombre}` : ''].filter(Boolean).join(' · ')}</span>}
            </span>
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCLP(a.monto)}</b>
            {a.comprobante_path && <button className="btn btn-ghost btn-xs" aria-label="Ver comprobante" title="Ver comprobante" onClick={() => verComprobante(a.comprobante_path!)}><FileText size={13} /></button>}
            {puedeAnotar && <>
              <button className="btn btn-ghost btn-xs" aria-label="Corregir abono" title="Corregir" onClick={() => setEditando(a)}><Pencil size={13} /></button>
              <button className="btn btn-ghost btn-xs" aria-label="Borrar abono" title="Borrar" onClick={() => borrar(a)}><Trash2 size={13} /></button>
            </>}
          </div>
        ))}
      </div>

      {c.saldo > 0 && tel && (
        <a className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} target="_blank" rel="noreferrer"
          href={`https://wa.me/${tel.length === 9 ? `56${tel}` : tel}?text=${encodeURIComponent(mensaje)}`}>
          <MessageCircle size={13} /> Recordar el saldo por WhatsApp</a>
      )}
    </div>
  );
}
