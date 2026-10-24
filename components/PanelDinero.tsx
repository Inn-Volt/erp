'use client';

/**
 * Panel de dinero del dashboard (fase 15): lo que pregunta el gerente.
 * - Cobrado este mes, por cobrar y vencido (con su antigüedad).
 * - Costos del mes: gastos rendidos + compras a proveedores.
 * - Caja de los próximos 30 días: lo que debería entrar menos lo que hay que pagar.
 * - Margen real de los trabajos terminados (solo los que tienen costos cargados) y por cliente.
 * - Punto de equilibrio: cuánto hay que vender al mes para cubrir los gastos fijos.
 * Cada bloque se muestra solo si la persona tiene el permiso y la tabla existe.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Banknote, Scale, TrendingUp, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { finDeMes, mesDe } from '@/lib/meses';
import { costoReal, type ResultadoTrabajo } from '@/services/trabajos';
import { usePermisos } from '@/hooks/usePermisos';
import { fechaLocal, formatCLP, sumarDias } from '@/utils';

interface Datos {
  cobradoMes: number; porCobrar: number; vencido: number; tramos: [number, number, number];
  gastosMes: number; comprasMes: number | null;
  entra30: number; sale30: number | null;
  margen: { venta: number; costo: number; trabajos: number; sinCostos: number } | null;
  porCliente: { cliente: string; venta: number; costo: number }[];
  gastosFijos: number; ventaNetaMes: number; margenContribucion: number | null;
}

const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1).replace('.', ',')} %`);

export default function PanelDinero({ ventaNetaMes }: { ventaNetaMes: number }) {
  const { puede, cargando } = usePermisos();
  const [d, setD] = useState<Datos | null>(null);
  const verCobros = puede('facturacion.ver') || puede('facturacion.gestionar');
  const verCostos = puede('cotizaciones.ver_costos');

  useEffect(() => {
    if (cargando || (!verCobros && !verCostos)) return;
    const hoy = fechaLocal(), mes = mesDe(hoy), desde = `${mes}-01`, hasta = finDeMes(mes), en30 = sumarDias(hoy, 30);
    (async () => {
      const [pf, gastos, compras, comprasImpagas, res, ajustes] = await Promise.all([
        verCobros ? supabase.from('por_facturar').select('etapa, monto, monto_pagado, fecha_pago, fecha_factura, vencimiento, created_at') : Promise.resolve({ data: null }),
        verCostos ? supabase.from('gastos').select('monto').gte('fecha', desde).lte('fecha', hasta).neq('estado', 'rechazado') : Promise.resolve({ data: null }),
        supabase.from('compras').select('tipo_doc, neto, exento, total').gte('fecha', desde).lte('fecha', hasta),
        supabase.from('compras').select('total, vencimiento').eq('pagada', false).neq('tipo_doc', 'nota_credito'),
        verCostos ? supabase.from('cotizacion_resultado').select('*') : Promise.resolve({ data: null }),
        verCostos ? supabase.from('ajustes_cotizacion').select('estructura_costos').eq('id', 1).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      type PF = { etapa: string; monto: number; monto_pagado: number | null; fecha_pago: string | null; fecha_factura: string | null; vencimiento: string | null; created_at: string };
      const filas = (pf.data || []) as PF[];
      const saldo = (p: PF) => Math.max(0, Number(p.monto) - Number(p.monto_pagado || 0));
      const abiertas = filas.filter(p => p.etapa === 'facturado' && saldo(p) > 0);
      const dias = (p: PF) => Math.floor((Date.parse(hoy) - Date.parse(p.fecha_factura || p.created_at.slice(0, 10))) / 864e5);
      const tramos: [number, number, number] = [0, 0, 0];
      for (const p of abiertas) tramos[dias(p) <= 30 ? 0 : dias(p) <= 60 ? 1 : 2] += saldo(p);

      const costoCompra = (c: { tipo_doc: string; neto: number; exento: number; total: number }) =>
        (c.tipo_doc === 'nota_credito' ? -1 : 1) * (['factura', 'factura_exenta', 'nota_credito'].includes(c.tipo_doc) ? Number(c.neto) + Number(c.exento) : Number(c.total));

      // Margen real: trabajos terminados con costos cargados.
      let margen: Datos['margen'] = null;
      let porCliente: Datos['porCliente'] = [];
      if (res.data) {
        const resultados = res.data as ResultadoTrabajo[];
        const { data: terminados } = await supabase.from('cotizaciones').select('id, clientes(nombre_cliente)').eq('estado', 'Aprobada').eq('trabajo_estado', 'terminado');
        const term = (terminados || []) as unknown as { id: string; clientes?: { nombre_cliente: string } | null }[];
        const mapa = new Map(resultados.map(r => [r.cotizacion_id, r]));
        const conCostos = term.filter(t => costoReal(mapa.get(t.id)) > 0);
        margen = {
          venta: conCostos.reduce((s, t) => s + Number(mapa.get(t.id)?.venta_neta || 0), 0),
          costo: conCostos.reduce((s, t) => s + costoReal(mapa.get(t.id)), 0),
          trabajos: conCostos.length, sinCostos: term.length - conCostos.length,
        };
        const agrupado = new Map<string, { venta: number; costo: number }>();
        for (const t of conCostos) {
          const k = t.clientes?.nombre_cliente || 'Sin cliente';
          const a = agrupado.get(k) || { venta: 0, costo: 0 };
          a.venta += Number(mapa.get(t.id)?.venta_neta || 0); a.costo += costoReal(mapa.get(t.id));
          agrupado.set(k, a);
        }
        porCliente = [...agrupado.entries()].map(([cliente, v]) => ({ cliente, ...v })).sort((a, b) => b.venta - a.venta).slice(0, 5);
      }
      const est = (ajustes.data as { estructura_costos?: { gastos?: { monto: number }[] } | null } | null)?.estructura_costos;
      const gastosFijos = (est?.gastos || []).reduce((s, g) => s + (Number(g.monto) || 0), 0);

      setD({
        cobradoMes: filas.filter(p => p.fecha_pago && p.fecha_pago >= desde && p.fecha_pago <= hasta).reduce((s, p) => s + Number(p.monto_pagado || 0), 0),
        porCobrar: abiertas.reduce((s, p) => s + saldo(p), 0),
        vencido: abiertas.filter(p => p.vencimiento && p.vencimiento < hoy).reduce((s, p) => s + saldo(p), 0),
        tramos,
        gastosMes: ((gastos.data || []) as { monto: number }[]).reduce((s, g) => s + Number(g.monto), 0),
        comprasMes: compras.error ? null : ((compras.data || []) as { tipo_doc: string; neto: number; exento: number; total: number }[]).reduce((s, c) => s + costoCompra(c), 0),
        entra30: abiertas.filter(p => !p.vencimiento || p.vencimiento <= en30).reduce((s, p) => s + saldo(p), 0),
        sale30: comprasImpagas.error ? null : ((comprasImpagas.data || []) as { total: number; vencimiento: string | null }[])
          .filter(c => !c.vencimiento || c.vencimiento <= en30).reduce((s, c) => s + Number(c.total), 0) + gastosFijos,
        margen, porCliente, gastosFijos, ventaNetaMes,
        margenContribucion: margen && margen.venta > 0 ? (margen.venta - margen.costo) / margen.venta : null,
      });
    })().catch(() => setD(null));
  }, [cargando, verCobros, verCostos, ventaNetaMes]);

  if (!d || (!verCobros && !verCostos)) return null;
  const equilibrio = d.gastosFijos > 0 && d.margenContribucion && d.margenContribucion > 0 ? d.gastosFijos / d.margenContribucion : null;
  const caja = d.sale30 === null ? null : d.entra30 - d.sale30;
  const caja2: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, padding: '0.8rem 0.9rem', background: 'var(--bg3)', borderRadius: 'var(--r)', border: '1px solid var(--border2)', minWidth: 0 };
  const titulo: React.CSSProperties = { fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 5 };
  const valor: React.CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.2rem', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' };
  const sub: React.CSSProperties = { fontSize: '0.74rem', color: 'var(--muted)' };

  return (
    <div className="panel-y" style={{ padding: '1rem 1.25rem', marginBottom: '2px' }}>
      <p className="section-label" style={{ marginBottom: '0.75rem' }}><Banknote size={12} /> Dinero</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 6 }}>
        {verCobros && (
          <Link href="/facturacion" style={{ ...caja2, textDecoration: 'none' }}>
            <span style={titulo}><Wallet size={12} /> Cobrado este mes</span>
            <span style={{ ...valor, color: 'var(--success)' }}>{formatCLP(d.cobradoMes)}</span>
            <span style={sub}>por cobrar {formatCLP(d.porCobrar)}{d.vencido > 0 ? <> · <b style={{ color: 'var(--danger)' }}>vencido {formatCLP(d.vencido)}</b></> : null}</span>
            {d.porCobrar > 0 && (
              <span style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', background: 'var(--bg2)', marginTop: 2 }}
                title={`0-30 días ${formatCLP(d.tramos[0])} · 31-60 ${formatCLP(d.tramos[1])} · +60 ${formatCLP(d.tramos[2])}`}>
                {d.tramos.map((t, i) => <span key={i} style={{ width: `${(t / d.porCobrar) * 100}%`, background: ['#2563eb', '#d97706', '#dc2626'][i] }} />)}
              </span>
            )}
          </Link>
        )}
        {verCostos && (
          <Link href={d.comprasMes !== null ? '/compras' : '/gastos'} style={{ ...caja2, textDecoration: 'none' }}>
            <span style={titulo}><TrendingUp size={12} style={{ transform: 'scaleY(-1)' }} /> Costos del mes</span>
            <span style={valor}>{formatCLP(d.gastosMes + (d.comprasMes || 0))}</span>
            <span style={sub}>rendiciones {formatCLP(d.gastosMes)}{d.comprasMes !== null ? ` · compras ${formatCLP(d.comprasMes)}` : ''}</span>
          </Link>
        )}
        {verCobros && caja !== null && (
          <div style={caja2} title="Lo facturado que vence en 30 días (o ya vencido) menos las compras impagas que vencen en 30 días y los gastos fijos del mes">
            <span style={titulo}><Banknote size={12} /> Caja próximos 30 días</span>
            <span style={{ ...valor, color: caja >= 0 ? 'var(--success)' : 'var(--danger)' }}>{caja >= 0 ? '+' : '−'}{formatCLP(Math.abs(caja))}</span>
            <span style={sub}>entra {formatCLP(d.entra30)} · sale {formatCLP(d.sale30 || 0)}{d.gastosFijos ? ' (con gastos fijos)' : ''}</span>
          </div>
        )}
        {verCostos && d.margen && (
          <Link href="/trabajos" style={{ ...caja2, textDecoration: 'none' }}>
            <span style={titulo}><Scale size={12} /> Margen real (terminados)</span>
            <span style={valor}>{pct(d.margenContribucion === null ? null : d.margenContribucion * 100)}</span>
            <span style={sub}>{d.margen.trabajos} trabajo{d.margen.trabajos === 1 ? '' : 's'} con costos{d.margen.sinCostos ? <> · <span style={{ color: 'var(--y)' }}>{d.margen.sinCostos} sin costos cargados</span></> : ''}</span>
          </Link>
        )}
        {verCostos && (
          <Link href="/cotizador/ajustes" style={{ ...caja2, textDecoration: 'none' }}>
            <span style={titulo}><Scale size={12} /> Punto de equilibrio</span>
            {equilibrio
              ? <>
                  <span style={valor}>{formatCLP(Math.round(equilibrio))}<span style={{ ...sub, fontWeight: 400 }}> /mes</span></span>
                  <span style={sub}>{d.ventaNetaMes >= equilibrio ? <b style={{ color: 'var(--success)' }}>Cubierto este mes</b>
                    : <>faltan <b style={{ color: 'var(--danger)' }}>{formatCLP(Math.round(equilibrio - d.ventaNetaMes))}</b> de venta neta este mes</>}</span>
                </>
              : <span style={sub}>{d.gastosFijos ? 'Falta el margen real de trabajos terminados.' : 'Carga tus gastos fijos en Ajustes del cotizador → calculadora de utilidad.'}</span>}
          </Link>
        )}
      </div>
      {d.porCliente.length > 1 && (
        <div style={{ marginTop: 10 }}>
          <p style={{ ...titulo, marginBottom: 6 }}>Margen real por cliente (trabajos terminados)</p>
          {d.porCliente.map(c => {
            const m = c.venta > 0 ? ((c.venta - c.costo) / c.venta) * 100 : null;
            return (
              <div key={c.cliente} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.82rem', padding: '0.3rem 0', borderTop: '1px solid var(--border2)', color: 'var(--text)' }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cliente}</span>
                <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{formatCLP(c.venta)}</span>
                <b style={{ minWidth: 64, textAlign: 'right', color: m !== null && m < 20 ? 'var(--danger)' : 'var(--success)' }}>{pct(m)}</b>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
