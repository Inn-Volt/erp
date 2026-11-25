'use client';

/**
 * Finanzas → Cobranza (fase 25). Cada trabajo aprobado es una cuenta: total, abonos libres y saldo.
 * La facturación queda en pausa: la pestaña «Facturas» (OC, HES, factura) aparece solo si se activa
 * en Ajustes de cotización. Sin la fase 25, la página de siempre (Por facturar y cobranza).
 */

import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Cobranza from '@/components/cobranza/Cobranza';
import Facturas from '@/components/facturacion/Facturas';
import { faseAplicada } from '@/lib/fases';
import { cobranzaService, type AjustesCobranza } from '@/services/cobranza';

type Vista = 'cobranza' | 'facturas';

export default function FacturacionPage() {
  const [fase25, setFase25] = useState<boolean | null>(null);
  const [aj, setAj] = useState<AjustesCobranza | null>(null);
  const [vista, setVista] = useState<Vista>('cobranza');
  useEffect(() => {
    faseAplicada(25).then(setFase25);
    cobranzaService.ajustes().then(setAj);
  }, []);

  if (fase25 === null || (fase25 && !aj)) return <div className="skeleton" style={{ height: 260 }} />;
  if (!fase25) {
    return (
      <div className="anim-in">
        <PageHeader eyebrow="Finanzas" title="Por facturar y cobranza"
          subtitle="Cada cobro de un trabajo (anticipo, saldo) y cada OT cerrada llega aquí solo. Anota el pago apenas llegue (queda pagado aunque falte la factura) y avanza la factura por sus etapas." />
        <Facturas />
      </div>
    );
  }
  const conFacturas = !!aj?.facturacionActiva;
  return (
    <div className="anim-in">
      <PageHeader eyebrow="Finanzas" title="Cobranza"
        subtitle="Lo que te deben de cada trabajo. Anota cada abono apenas llegue, del monto que sea: el saldo y lo atrasado según el plan de cobro se calculan solos." />
      {conFacturas && (
        <div role="tablist" aria-label="Cobranza y facturas" style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {([['cobranza', 'Cobranza'], ['facturas', 'Facturas']] as [Vista, string][]).map(([v, t]) => (
            <button key={v} role="tab" aria-selected={vista === v} className="btn btn-sm" onClick={() => setVista(v)}
              style={{ background: vista === v ? 'var(--y-brand)' : 'var(--bg3)', color: vista === v ? 'var(--on-accent)' : 'var(--muted)' }}>{t}</button>
          ))}
        </div>
      )}
      {conFacturas && vista === 'facturas' ? <Facturas conAbonos /> : <Cobranza />}
    </div>
  );
}
