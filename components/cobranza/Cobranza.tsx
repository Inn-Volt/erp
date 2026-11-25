'use client';

/**
 * Finanzas → Cobranza (fase 25): cada trabajo aprobado con lo abonado, el saldo y lo atrasado según
 * su plan de cobro. Arriba: por cobrar, atrasado y lo cobrado este mes. Al tocar un trabajo se abre
 * su cuenta para registrar abonos (libres) o recordar el saldo por WhatsApp.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Landmark, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useFase } from '@/lib/fases';
import { mesDe } from '@/lib/meses';
import { cuentaTrabajo, diasEntre, NOMBRE_ESTADO_CUENTA, type Cuenta } from '@/lib/cobranza';
import { enMonedaExtranjera } from '@/lib/cotizador/planCobro';
import { cobranzaService, ivaRatio, planDeTrabajo, totalPesos, type AjustesCobranza, type TrabajoCobranza } from '@/services/cobranza';
import { useValoresDia } from '@/hooks/useValoresDia';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { Modal } from '@/components/cotizador/ui';
import Conciliacion from '@/components/facturacion/Conciliacion';
import type { EmpresaInfo } from '@/types';
import { fechaLocal, formatCLP } from '@/utils';
import CuentaTrabajo, { Barra, COLOR_ESTADO, folioIV } from './CuentaTrabajo';

type Filtro = 'con_saldo' | 'atrasados' | 'pagados' | 'todos';
const FILTROS: [Filtro, string][] = [['con_saldo', 'Con saldo'], ['atrasados', 'Atrasados'], ['pagados', 'Pagados'], ['todos', 'Todos']];

export default function Cobranza() {
  const { puede } = usePermisos();
  const { error: toastError } = useToast();
  const fase15 = useFase(15);
  const puedeAnotar = puede('facturacion.gestionar');
  const [trabajos, setTrabajos] = useState<TrabajoCobranza[] | null>(null);
  const [abonos, setAbonos] = useState<{ cotizacion_id: string; fecha: string; monto: number }[]>([]);
  const [aj, setAj] = useState<AjustesCobranza | null>(null);
  const [empresa, setEmpresa] = useState<EmpresaInfo | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('con_saldo');
  const [busca, setBusca] = useState('');
  const [abierto, setAbierto] = useState<TrabajoCobranza | null>(null);
  const [conciliando, setConciliando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [t, a, j] = await Promise.all([cobranzaService.trabajos(), cobranzaService.abonos(), cobranzaService.ajustes()]);
      setTrabajos(t); setAbonos(a); setAj(j);
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo cargar la cobranza'); setTrabajos([]); }
  }, [toastError]);
  useEffect(() => {
    cargar();
    supabase.from('empresas').select('*').limit(1).then(({ data }) => setEmpresa(((data || [])[0] as EmpresaInfo | undefined) || null));
  }, [cargar]);

  const enMonedas = !!trabajos && !!aj && trabajos.some(t => planDeTrabajo(t, aj.plan).some(enMonedaExtranjera));
  const valores = useValoresDia(enMonedas) ?? undefined;
  const filas = useMemo(() => {
    if (!trabajos || !aj) return [];
    const porTrabajo = new Map<string, { fecha: string; monto: number }[]>();
    for (const a of abonos) porTrabajo.set(a.cotizacion_id, [...(porTrabajo.get(a.cotizacion_id) || []), a]);
    return trabajos.map(t => ({
      t, c: cuentaTrabajo({
        total: totalPesos(t), ivaRatio: ivaRatio(t), plan: planDeTrabajo(t, aj.plan), valores,
        abonos: porTrabajo.get(t.id) || [], terminado: t.trabajo_estado === 'terminado', ppmPct: aj.ppmPct,
      }),
    }));
  }, [trabajos, abonos, aj, valores]);

  if (!trabajos || !aj) return <div className="skeleton" style={{ height: 200 }} />;

  const hoy = fechaLocal();
  const mes = mesDe(hoy);
  const suma = (f: (c: Cuenta) => number) => filas.reduce((s, x) => s + f(x.c), 0);
  const kpis: { t: string; v: number; c: string; f?: Filtro; sub?: string }[] = [
    { t: 'Por cobrar', v: suma(c => c.saldo), c: '#2563eb', f: 'con_saldo', sub: `${filas.filter(x => x.c.saldo > 0).length} trabajos con saldo` },
    { t: 'Atrasado', v: suma(c => c.atrasado), c: '#dc2626', f: 'atrasados', sub: 'lo que el plan ya esperaba' },
    { t: 'Cobrado este mes', v: abonos.filter(a => mesDe(a.fecha) === mes).reduce((s, a) => s + a.monto, 0), c: 'var(--success)' },
  ];
  const q = busca.trim().toLowerCase();
  const lista = filas
    .filter(({ c }) => filtro === 'todos' ? true : filtro === 'con_saldo' ? c.saldo > 0 : filtro === 'atrasados' ? c.atrasado > 0 : c.saldo === 0)
    .filter(({ t }) => !q || `${folioIV(t.folio)} ${t.titulo || ''} ${t.clientes?.nombre_cliente || ''}`.toLowerCase().includes(q))
    .sort((a, b) => b.c.atrasado - a.c.atrasado || b.c.saldo - a.c.saldo || b.t.folio - a.t.folio);
  const cuentasConciliacion = filas.filter(x => x.c.saldo > 0)
    .map(({ t, c }) => ({ id: t.id, saldo: c.saldo, numero_factura: folioIV(t.folio), cliente: t.clientes?.nombre_cliente || null }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {abierto && (
        <Modal titulo={`${folioIV(abierto.folio)} · ${abierto.titulo || 'Trabajo'}`} onCerrar={() => setAbierto(null)} ancho={600}
          pie={<Link className="btn btn-ghost" href={`/cotizador?edit=${abierto.id}`}>Ver el trabajo</Link>}>
          {abierto.clientes?.nombre_cliente && <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>{abierto.clientes.nombre_cliente}</span>}
          <CuentaTrabajo cotId={abierto.id} trabajo={abierto} ajustes={aj} puedeAnotar={puedeAnotar} empresa={empresa} onCambio={cargar} />
        </Modal>
      )}
      {conciliando && <Conciliacion cuentas={cuentasConciliacion} onClose={() => setConciliando(false)} onCambio={cargar} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 8 }}>
        {kpis.map(k => (
          <button key={k.t} className="kpi-card" style={{ cursor: k.f ? 'pointer' : 'default', textAlign: 'left' }} onClick={() => k.f && setFiltro(k.f)}>
            <p className="label-muted">{k.t}</p><p className="kpi-value" style={{ color: k.c }}>{formatCLP(k.v)}</p>
            {k.sub && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{k.sub}</span>}
          </button>
        ))}
      </div>

      <div className="panel-y">
        <div style={{ padding: '0.8rem 1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 200px' }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input className="input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar trabajo o cliente…" style={{ paddingLeft: '2.2rem' }} />
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {FILTROS.map(([v, t]) => (
              <button key={v} type="button" className="btn btn-xs" onClick={() => setFiltro(v)}
                style={{ background: filtro === v ? 'var(--y-brand)' : 'var(--bg3)', color: filtro === v ? 'var(--on-accent)' : 'var(--muted)' }}>{t}</button>
            ))}
          </div>
          {fase15 && puedeAnotar && <button className="btn btn-ghost btn-sm" onClick={() => setConciliando(true)}><Landmark size={14} /> Conciliar con el banco</button>}
        </div>
        {lista.length === 0 ? (
          <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)', margin: 0 }}>
            {filtro === 'con_saldo' ? 'Ningún trabajo con saldo pendiente.' : 'Nada en esta vista.'}</p>
        ) : lista.map(({ t, c }) => (
          <button key={t.id} onClick={() => setAbierto(t)}
            style={{ display: 'flex', width: '100%', gap: 12, padding: '0.8rem 1rem', background: 'none', border: 'none', borderTop: '1px solid var(--border2)', cursor: 'pointer', textAlign: 'left', alignItems: 'center' }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {folioIV(t.folio)} · {t.titulo || 'Trabajo'}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                {t.clientes?.nombre_cliente || 'Sin cliente'} · abonado {formatCLP(c.abonado)} de {formatCLP(c.total)}
                {c.ultimoAbono ? ` · último abono hace ${Math.max(diasEntre(c.ultimoAbono, hoy), 0)} d` : ''}
                {t.trabajo_estado === 'terminado' ? ' · terminado' : ''}
              </span>
              <Barra pct={c.pct} color={COLOR_ESTADO[c.estado]} />
            </span>
            <span style={{ textAlign: 'right', flexShrink: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{c.saldo > 0 ? formatCLP(c.saldo) : formatCLP(c.abonado)}</span>
              <span className="badge" style={{ background: c.atrasado > 0 ? '#dc2626' : 'var(--bg3)', color: c.atrasado > 0 ? '#fff' : COLOR_ESTADO[c.estado], fontSize: '0.7rem' }}>
                {c.atrasado > 0 ? `Atrasado ${formatCLP(c.atrasado)}` : c.saldo > 0 ? 'Saldo' : NOMBRE_ESTADO_CUENTA[c.estado]}</span>
            </span>
          </button>
        ))}
        <div style={{ padding: '0.7rem 1rem', borderTop: '1px solid var(--border2)', color: 'var(--muted)', fontSize: '0.78rem' }}>{lista.length} trabajos</div>
      </div>
    </div>
  );
}
