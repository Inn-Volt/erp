'use client';

/**
 * Finanzas → Contabilidad e IVA (fase 15). Lo que pide el contador cada mes:
 * - Libro de ventas: lo facturado en el mes (neto, exento e IVA de cada factura).
 * - Libro de compras: las facturas y boletas de proveedores del mes.
 * - IVA estimado: débito − crédito (referencial: no incluye PPM ni retenciones).
 * Todo se descarga en un Excel para el contador.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Download, Info } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import { supabase } from '@/lib/supabase';
import { desglosarCobro, ivaDelMes, type Desglose } from '@/lib/contabilidad';
import { descargarExcel } from '@/lib/excel';
import { finDeMes, mesDe, moverMes, nombreMes } from '@/lib/meses';
import { comprasService, faltaFase15, tipoDoc, type Compra } from '@/services/compras';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP, formatDate } from '@/utils';

interface Venta extends Desglose {
  id: string; fecha: string; factura: string; cliente: string; rut: string; detalle: string; pagado: number; cotizacion_id: string | null;
}
interface FilaPF {
  id: string; fecha_factura: string | null; numero_factura: string | null; monto: number; monto_pagado: number | null; descripcion: string | null;
  cotizacion_id: string | null; clientes?: { nombre_cliente: string; rut: string | null } | null;
  cotizaciones?: { folio: number; subtotal: number | null; iva: number | null; total: number | null } | null;
}

const th: React.CSSProperties = { textAlign: 'right', padding: '0.45rem 0.6rem', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { textAlign: 'right', padding: '0.45rem 0.6rem', fontSize: '0.82rem', color: 'var(--text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', borderTop: '1px solid var(--border2)' };
const tdL: React.CSSProperties = { ...td, textAlign: 'left', whiteSpace: 'normal' };

function Kpi({ t, v, c, sub }: { t: string; v: number; c?: string; sub?: string }) {
  return (
    <div className="kpi-card"><p className="label-muted">{t}</p><p className="kpi-value" style={{ color: c }}>{formatCLP(v)}</p>{sub && <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{sub}</span>}</div>
  );
}

export default function ContabilidadPage() {
  const { puede } = usePermisos();
  const { error: toastError } = useToast();
  const [mes, setMes] = useState(mesDe(fechaLocal()));
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [gastos, setGastos] = useState(0);
  const [sinCompras, setSinCompras] = useState(false);
  const [falta, setFalta] = useState(false);
  const [cargando, setCargando] = useState(true);
  const verCompras = puede('compras.ver') || puede('compras.gestionar');

  const cargar = useCallback(async () => {
    setCargando(true);
    const desde = `${mes}-01`, hasta = finDeMes(mes);
    try {
      const [pf, g] = await Promise.all([
        supabase.from('por_facturar').select('id, fecha_factura, numero_factura, monto, monto_pagado, descripcion, cotizacion_id, clientes(nombre_cliente, rut), cotizaciones(folio, subtotal, iva, total)')
          .eq('etapa', 'facturado').gte('fecha_factura', desde).lte('fecha_factura', hasta).order('fecha_factura'),
        supabase.from('gastos').select('monto').gte('fecha', desde).lte('fecha', hasta).neq('estado', 'rechazado'),
      ]);
      if (pf.error) throw pf.error;
      setVentas(((pf.data || []) as unknown as FilaPF[]).map(p => ({
        ...desglosarCobro(Number(p.monto), p.cotizaciones),
        id: p.id, fecha: p.fecha_factura || desde, factura: p.numero_factura || '—', cliente: p.clientes?.nombre_cliente || 'Sin cliente',
        rut: p.clientes?.rut || '', detalle: p.descripcion || (p.cotizaciones ? `IV-${String(p.cotizaciones.folio).padStart(4, '0')}` : ''),
        pagado: Number(p.monto_pagado || 0), cotizacion_id: p.cotizacion_id,
      })));
      setGastos(((g.data || []) as { monto: number }[]).reduce((s, x) => s + Number(x.monto), 0));
      if (verCompras) {
        try { setCompras(await comprasService.listar({ desde, hasta })); setSinCompras(false); }
        catch (e) { if (faltaFase15(e)) setFalta(true); else { setCompras([]); setSinCompras(true); } }
      } else { setCompras([]); setSinCompras(true); }
    } catch (e) { toastError('No se pudo cargar el mes: ' + (e instanceof Error ? e.message : (e as { message?: string })?.message || '')); }
    finally { setCargando(false); }
  }, [mes, verCompras, toastError]);
  useEffect(() => { cargar(); }, [cargar]);

  const signo = (c: Compra) => (c.tipo_doc === 'nota_credito' ? -1 : 1);
  const tot = useMemo(() => {
    const v = ventas.reduce((s, x) => ({ neto: s.neto + x.neto, exento: s.exento + x.exento, iva: s.iva + x.iva, total: s.total + x.total }), { neto: 0, exento: 0, iva: 0, total: 0 });
    const conCredito = compras.filter(c => tipoDoc(c.tipo_doc).conIva || c.tipo_doc === 'factura_exenta');
    const k = conCredito.reduce((s, c) => ({ neto: s.neto + signo(c) * Number(c.neto), exento: s.exento + signo(c) * Number(c.exento), iva: s.iva + signo(c) * Number(c.iva), total: s.total + signo(c) * Number(c.total) }), { neto: 0, exento: 0, iva: 0, total: 0 });
    const sinCredito = compras.filter(c => !conCredito.includes(c)).reduce((s, c) => s + Number(c.total), 0);
    return { v, k, sinCredito, iva: ivaDelMes(v.iva, k.iva) };
  }, [ventas, compras]);

  const exportar = () => descargarExcel([
    { nombre: 'Ventas', filas: ventas.map(x => ({ Fecha: x.fecha, 'N° factura': x.factura, RUT: x.rut, Cliente: x.cliente, Detalle: x.detalle, Neto: x.neto, Exento: x.exento, IVA: x.iva, Total: x.total, Pagado: x.pagado })) },
    { nombre: 'Compras', filas: compras.map(c => ({ Fecha: c.fecha, Documento: tipoDoc(c.tipo_doc).nombre, 'N°': c.folio || '', 'RUT proveedor': c.proveedor_rut || '', Proveedor: c.proveedor_nombre,
      Neto: signo(c) * Number(c.neto), Exento: signo(c) * Number(c.exento), IVA: signo(c) * Number(c.iva), Total: signo(c) * Number(c.total), Categoría: c.categoria || '', Pagada: c.pagada ? 'Sí' : 'No' })) },
    { nombre: 'Resumen', filas: [
      { Concepto: 'Ventas netas (afecto + exento)', Monto: tot.v.neto + tot.v.exento },
      { Concepto: 'IVA débito (ventas)', Monto: tot.iva.debito },
      { Concepto: 'Compras netas con factura', Monto: tot.k.neto + tot.k.exento },
      { Concepto: 'IVA crédito (compras)', Monto: tot.iva.credito },
      { Concepto: 'IVA a pagar (estimado, sin PPM ni retenciones)', Monto: tot.iva.aPagar },
      { Concepto: 'Remanente de IVA crédito', Monto: tot.iva.remanente },
      { Concepto: 'Compras sin IVA crédito (boletas y otros)', Monto: tot.sinCredito },
      { Concepto: 'Gastos rendidos por el equipo', Monto: gastos },
    ] },
  ], `Contabilidad_${mes}.xlsx`);

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Finanzas" title="Contabilidad e IVA" /><FaltaSQL archivo="supabase_fase15_revision.sql" /></div>;

  return (
    <div className="anim-in">
      <PageHeader eyebrow="Finanzas" title="Contabilidad e IVA"
        subtitle="Libro de ventas, libro de compras e IVA del mes, listos para el contador."
        actions={<button className="btn btn-primary" onClick={exportar} disabled={cargando}><Download size={14} /> Excel para el contador</button>} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setMes(m => moverMes(m, -1))} aria-label="Mes anterior"><ChevronLeft size={15} /></button>
        <input className="input" type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} style={{ width: 170 }} aria-label="Mes" />
        <button className="btn btn-ghost btn-sm" onClick={() => setMes(m => moverMes(m, 1))} aria-label="Mes siguiente" disabled={mes >= mesDe(fechaLocal())}><ChevronRight size={15} /></button>
        <b style={{ color: 'var(--text)', textTransform: 'capitalize' }}>{nombreMes(mes)}</b>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 8, marginBottom: 12 }}>
        <Kpi t="Ventas netas" v={tot.v.neto + tot.v.exento} sub={`${ventas.length} factura${ventas.length === 1 ? '' : 's'}`} />
        <Kpi t="IVA débito" v={tot.iva.debito} />
        <Kpi t="IVA crédito" v={tot.iva.credito} c="var(--success)" sub={sinCompras ? 'sin acceso a compras' : `${compras.length} documento${compras.length === 1 ? '' : 's'}`} />
        {tot.iva.remanente > 0
          ? <Kpi t="Remanente de crédito" v={tot.iva.remanente} c="var(--success)" sub="pasa al mes siguiente" />
          : <Kpi t="IVA a pagar (estimado)" v={tot.iva.aPagar} c="#d97706" sub="sin PPM ni retenciones" />}
      </div>

      <p style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 12px' }}>
        <Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />
        Ventas = cobros marcados «Facturado» con fecha de factura en el mes (el neto y el IVA salen en la proporción de su cotización).
        Compras = lo ingresado en <Link href="/compras">Compras a proveedores</Link>. Es una referencia para el contador, no reemplaza la declaración en el SII.
      </p>

      <div className="panel-y" style={{ marginBottom: 12 }}>
        <p className="section-label" style={{ margin: 0, padding: '0.9rem 1rem' }}>Libro de ventas</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>Fecha</th><th style={{ ...th, textAlign: 'left' }}>N°</th><th style={{ ...th, textAlign: 'left' }}>Cliente</th>
              <th style={th}>Neto</th><th style={th}>Exento</th><th style={th}>IVA</th><th style={th}>Total</th></tr></thead>
            <tbody>
              {cargando ? <tr><td colSpan={7} style={td}><div className="skeleton" style={{ height: 60 }} /></td></tr>
                : ventas.length === 0 ? <tr><td colSpan={7} style={{ ...tdL, textAlign: 'center', color: 'var(--muted)', padding: '1.5rem' }}>No hay facturas con fecha en {nombreMes(mes)}.</td></tr>
                : ventas.map(x => (
                  <tr key={x.id}>
                    <td style={{ ...tdL, whiteSpace: 'nowrap' }}>{formatDate(x.fecha)}</td><td style={tdL}>{x.factura}</td>
                    <td style={tdL}>{x.cliente}{x.rut ? <span style={{ color: 'var(--muted)' }}> · {x.rut}</span> : null}{x.detalle ? <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--muted)' }}>{x.detalle}</span> : null}</td>
                    <td style={td}>{formatCLP(x.neto)}</td><td style={td}>{x.exento ? formatCLP(x.exento) : '—'}</td><td style={td}>{formatCLP(x.iva)}</td><td style={{ ...td, fontWeight: 700 }}>{formatCLP(x.total)}</td>
                  </tr>
                ))}
              {ventas.length > 0 && (
                <tr><td colSpan={3} style={{ ...tdL, fontWeight: 700 }}>Total</td><td style={{ ...td, fontWeight: 700 }}>{formatCLP(tot.v.neto)}</td><td style={{ ...td, fontWeight: 700 }}>{formatCLP(tot.v.exento)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{formatCLP(tot.v.iva)}</td><td style={{ ...td, fontWeight: 700 }}>{formatCLP(tot.v.total)}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel-y">
        <p className="section-label" style={{ margin: 0, padding: '0.9rem 1rem' }}>Libro de compras</p>
        {sinCompras ? <p style={{ padding: '0 1rem 1rem', margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>No tienes permiso para ver las compras (pídelo en Usuarios: «Ver compras, libros e IVA del mes»).</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead><tr><th style={{ ...th, textAlign: 'left' }}>Fecha</th><th style={{ ...th, textAlign: 'left' }}>Documento</th><th style={{ ...th, textAlign: 'left' }}>Proveedor</th>
                <th style={th}>Neto</th><th style={th}>Exento</th><th style={th}>IVA</th><th style={th}>Total</th></tr></thead>
              <tbody>
                {cargando ? <tr><td colSpan={7} style={td}><div className="skeleton" style={{ height: 60 }} /></td></tr>
                  : compras.length === 0 ? <tr><td colSpan={7} style={{ ...tdL, textAlign: 'center', color: 'var(--muted)', padding: '1.5rem' }}>No hay compras en {nombreMes(mes)}. <Link href="/compras">Ingresar compras</Link></td></tr>
                  : compras.map(c => (
                    <tr key={c.id} style={{ opacity: tipoDoc(c.tipo_doc).conIva || c.tipo_doc === 'factura_exenta' ? 1 : 0.7 }}>
                      <td style={{ ...tdL, whiteSpace: 'nowrap' }}>{formatDate(c.fecha)}</td><td style={tdL}>{tipoDoc(c.tipo_doc).nombre}{c.folio ? ` ${c.folio}` : ''}</td>
                      <td style={tdL}>{c.proveedor_nombre}{c.proveedor_rut ? <span style={{ color: 'var(--muted)' }}> · {c.proveedor_rut}</span> : null}</td>
                      <td style={td}>{c.neto ? formatCLP(signo(c) * Number(c.neto)) : '—'}</td><td style={td}>{c.exento ? formatCLP(signo(c) * Number(c.exento)) : '—'}</td>
                      <td style={td}>{c.iva ? formatCLP(signo(c) * Number(c.iva)) : '—'}</td><td style={{ ...td, fontWeight: 700 }}>{formatCLP(signo(c) * Number(c.total))}</td>
                    </tr>
                  ))}
                {compras.length > 0 && (
                  <tr><td colSpan={3} style={{ ...tdL, fontWeight: 700 }}>Total con IVA crédito{tot.sinCredito ? <span style={{ fontWeight: 400, color: 'var(--muted)' }}> (más {formatCLP(tot.sinCredito)} en boletas y otros, sin crédito)</span> : null}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{formatCLP(tot.k.neto)}</td><td style={{ ...td, fontWeight: 700 }}>{formatCLP(tot.k.exento)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{formatCLP(tot.k.iva)}</td><td style={{ ...td, fontWeight: 700 }}>{formatCLP(tot.k.total)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {gastos > 0 && <p style={{ margin: 0, padding: '0.75rem 1rem', borderTop: '1px solid var(--border2)', fontSize: '0.8rem', color: 'var(--muted)' }}>
          Además, el equipo rindió {formatCLP(gastos)} en gastos este mes (<Link href="/gastos">ver rendiciones</Link>). Si alguno tiene factura, ingrésala también en Compras para recuperar el IVA.</p>}
      </div>
    </div>
  );
}
