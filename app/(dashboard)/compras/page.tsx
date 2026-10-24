'use client';

/**
 * Finanzas → Compras a proveedores (fase 15). Cada factura, boleta o nota de crédito de lo que
 * se compra, con su neto e IVA (libro de compras), a qué trabajo o proyecto va (costo real) y si
 * ya se pagó. Desde un trabajo se llega con ?trabajo=<id>.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Download, FileText, Loader2, Paperclip, Pencil, Plus, Search, ShoppingCart, Trash2, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import NumeroInput from '@/components/NumeroInput';
import {
  CATEGORIAS_COMPRA, TIPOS_DOC, comprasService, desdeNeto, desdeTotal, faltaFase15, mensajeCompra, tipoDoc,
  type Compra, type NuevaCompra, type TipoDoc,
} from '@/services/compras';
import { trabajosService } from '@/services/trabajos';
import { folioProyecto, proyectosService } from '@/services/fase5';
import { avisoRut, formatearRut } from '@/lib/rut';
import { descargarExcel } from '@/lib/excel';
import { finDeMes, mesDe, nombreMes } from '@/lib/meses';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP, formatDate } from '@/utils';

interface Destino { valor: string; etiqueta: string; grupo: 'Trabajos' | 'Proyectos' }
const lbl = { display: 'block', marginBottom: 5 } as const;

function FormCompra({ compra, destinos, proveedores, destinoInicial, onClose, onListo }: {
  compra: Compra | null; destinos: Destino[]; proveedores: { nombre: string; rut: string | null }[]; destinoInicial: string;
  onClose: () => void; onListo: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [d, setD] = useState<NuevaCompra>(() => compra ? { ...compra } : {
    fecha: fechaLocal(), tipo_doc: 'factura', folio: '', proveedor_rut: '', proveedor_nombre: '', neto: 0, exento: 0, iva: 0, total: 0,
    categoria: 'Materiales eléctricos', descripcion: '', cotizacion_id: null, proyecto_id: null, pagada: false, fecha_pago: null, vencimiento: null, archivo_path: null,
  });
  const [destino, setDestino] = useState(() => compra?.cotizacion_id ? `cot:${compra.cotizacion_id}` : compra?.proyecto_id ? `proy:${compra.proyecto_id}` : destinoInicial);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const set = (p: Partial<NuevaCompra>) => setD(x => ({ ...x, ...p }));
  const conIva = tipoDoc(d.tipo_doc).conIva;

  const elegirProveedor = (nombre: string) => {
    const p = proveedores.find(x => x.nombre.toLowerCase() === nombre.trim().toLowerCase());
    set({ proveedor_nombre: nombre, ...(p?.rut && !d.proveedor_rut ? { proveedor_rut: p.rut } : {}) });
  };
  const cambiarTipo = (t: TipoDoc) => {
    // Al pasar a un documento sin IVA, el total queda y el neto/IVA se limpian (y al revés).
    if (tipoDoc(t).conIva) set({ tipo_doc: t, ...desdeTotal(d.total, d.exento) });
    else set({ tipo_doc: t, neto: 0, iva: 0, exento: t === 'factura_exenta' ? d.total : 0, total: d.total });
  };

  const guardar = async () => {
    if (!d.proveedor_nombre.trim()) { toastError('Indica el proveedor'); return; }
    if (!(d.total > 0)) { toastError('Indica el monto'); return; }
    if (d.proveedor_rut && avisoRut(d.proveedor_rut)) { toastError(avisoRut(d.proveedor_rut) || 'RUT inválido'); return; }
    setGuardando(true);
    try {
      const archivo_path = archivo ? await comprasService.subirArchivo(archivo) : d.archivo_path;
      await comprasService.guardar(compra?.id || null, {
        ...d, archivo_path, folio: d.folio?.trim() || null, proveedor_nombre: d.proveedor_nombre.trim(),
        proveedor_rut: d.proveedor_rut ? formatearRut(d.proveedor_rut) : null, descripcion: d.descripcion?.trim() || null,
        cotizacion_id: destino.startsWith('cot:') ? destino.slice(4) : null, proyecto_id: destino.startsWith('proy:') ? destino.slice(5) : null,
        fecha_pago: d.pagada ? d.fecha_pago || d.fecha : null, vencimiento: d.vencimiento || null,
      });
      success(compra ? 'Compra actualizada' : 'Compra ingresada');
      onListo();
    } catch (e) { toastError(mensajeCompra(e)); }
    finally { setGuardando(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 620, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0, flex: 1 }}><ShoppingCart size={15} /> {compra ? 'Editar compra' : 'Nueva compra'}</p>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: '1.1rem 1.25rem', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12 }}>
          <div><label className="label-muted" style={lbl}>Documento</label>
            <select aria-label="Documento" className="input" value={d.tipo_doc} onChange={e => cambiarTipo(e.target.value as TipoDoc)}>
              {TIPOS_DOC.map(t => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
            </select></div>
          <div><label className="label-muted" style={lbl}>N° (folio)</label>
            <input aria-label="N° (folio)" className="input" value={d.folio || ''} onChange={e => set({ folio: e.target.value })} placeholder="12345" /></div>
          <div><label className="label-muted" style={lbl}>Fecha del documento</label>
            <input aria-label="Fecha del documento" className="input" type="date" value={d.fecha} onChange={e => set({ fecha: e.target.value })} /></div>
          <div style={{ gridColumn: 'span 2' }}><label className="label-muted" style={lbl}>Proveedor *</label>
            <input aria-label="Proveedor" className="input" list="proveedores" value={d.proveedor_nombre} onChange={e => elegirProveedor(e.target.value)} placeholder="Electro Sur Ltda." />
            <datalist id="proveedores">{proveedores.map(p => <option key={p.nombre} value={p.nombre} />)}</datalist></div>
          <div><label className="label-muted" style={lbl}>RUT proveedor</label>
            <input aria-label="RUT proveedor" className="input" value={d.proveedor_rut || ''} onChange={e => set({ proveedor_rut: e.target.value })}
              onBlur={() => d.proveedor_rut && set({ proveedor_rut: formatearRut(d.proveedor_rut) })} placeholder="76.123.456-7" />
            {d.proveedor_rut && avisoRut(d.proveedor_rut) && <span style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>{avisoRut(d.proveedor_rut)}</span>}</div>

          {conIva ? <>
            <div><label className="label-muted" style={lbl}>Neto</label>
              <NumeroInput ariaLabel="Neto" className="input" prefijo="$" value={d.neto} onChange={v => set(desdeNeto(v, d.exento))} /></div>
            <div><label className="label-muted" style={lbl}>IVA 19 %</label>
              <NumeroInput ariaLabel="IVA 19 %" className="input" prefijo="$" value={d.iva} onChange={v => set({ iva: v, total: d.neto + d.exento + v })} /></div>
            <div><label className="label-muted" style={lbl}>Exento</label>
              <NumeroInput ariaLabel="Exento" className="input" prefijo="$" value={d.exento} onChange={v => set(desdeNeto(d.neto, v))} /></div>
            <div><label className="label-muted" style={lbl}>Total</label>
              <NumeroInput ariaLabel="Total" className="input" prefijo="$" value={d.total} onChange={v => set(desdeTotal(v, d.exento))} title="Si escribes el total, el neto y el IVA se calculan solos" /></div>
          </> : (
            <div><label className="label-muted" style={lbl}>Total</label>
              <NumeroInput ariaLabel="Total" className="input" prefijo="$" value={d.total} onChange={v => set({ total: v, neto: 0, iva: 0, exento: d.tipo_doc === 'factura_exenta' ? v : 0 })} /></div>
          )}
          <p style={{ gridColumn: '1 / -1', margin: '-4px 0 0', fontSize: '0.74rem', color: 'var(--muted)' }}>
            {conIva ? 'Escribe el neto o el total: lo demás se calcula. Con factura, el costo del trabajo es el neto (el IVA se recupera).'
              : 'Sin IVA recuperable: el costo del trabajo es el total.'}</p>

          <div style={{ gridColumn: '1 / -1' }}><label className="label-muted" style={lbl}>¿Para qué es? (centro de costo)</label>
            <select aria-label="¿Para qué es? (centro de costo)" className="input" value={destino} onChange={e => setDestino(e.target.value)}>
              <option value="">Gasto general de la empresa</option>
              {(['Trabajos', 'Proyectos'] as const).map(g => destinos.some(x => x.grupo === g) && (
                <optgroup key={g} label={g}>{destinos.filter(x => x.grupo === g).map(x => <option key={x.valor} value={x.valor}>{x.etiqueta}</option>)}</optgroup>
              ))}
            </select></div>
          <div><label className="label-muted" style={lbl}>Categoría</label>
            <input aria-label="Categoría" className="input" list="categorias-compra" value={d.categoria || ''} onChange={e => set({ categoria: e.target.value })} />
            <datalist id="categorias-compra">{CATEGORIAS_COMPRA.map(c => <option key={c} value={c} />)}</datalist></div>
          <div style={{ gridColumn: 'span 2' }}><label className="label-muted" style={lbl}>Detalle</label>
            <input aria-label="Detalle" className="input" value={d.descripcion || ''} onChange={e => set({ descripcion: e.target.value })} placeholder="Cable 6 mm², automáticos, canaleta…" /></div>
          <div><label className="label-muted" style={lbl}>Vence (pago al proveedor)</label>
            <input aria-label="Vence (pago al proveedor)" className="input" type="date" value={d.vencimiento || ''} onChange={e => set({ vencimiento: e.target.value })} /></div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem', color: 'var(--text)', cursor: 'pointer', alignSelf: 'end', paddingBottom: '0.5rem' }}>
            <input type="checkbox" checked={d.pagada} onChange={e => set({ pagada: e.target.checked, fecha_pago: e.target.checked ? d.fecha_pago || fechaLocal() : null })}
              style={{ accentColor: 'var(--y-brand)', width: 16, height: 16 }} /> Ya está pagada</label>
          {d.pagada && <div><label className="label-muted" style={lbl}>Fecha de pago</label>
            <input aria-label="Fecha de pago" className="input" type="date" value={d.fecha_pago || ''} onChange={e => set({ fecha_pago: e.target.value })} /></div>}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}><Paperclip size={13} /> {archivo ? archivo.name : d.archivo_path ? 'Cambiar respaldo' : 'Adjuntar foto o PDF'}
              <input type="file" accept="image/*,application/pdf" hidden onChange={e => setArchivo(e.target.files?.[0] || null)} /></label>
            {d.archivo_path && !archivo && <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { const u = await comprasService.urlArchivo(d.archivo_path!); if (u) window.open(u, '_blank'); }}>
              <FileText size={13} /> Ver respaldo</button>}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border2)' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Check size={14} />} Guardar</button>
        </div>
      </div>
    </div>
  );
}

function ComprasContent() {
  const { puede } = usePermisos();
  const { success, error: toastError } = useToast();
  const params = useSearchParams();
  const trabajoParam = params.get('trabajo');
  const gestiona = puede('compras.gestionar');
  const [mes, setMes] = useState(() => (trabajoParam ? '' : mesDe(fechaLocal())));
  const [vista, setVista] = useState<'mes' | 'por_pagar'>('mes');
  const [destinoF, setDestinoF] = useState(trabajoParam ? `cot:${trabajoParam}` : '');
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<Compra[]>([]);
  const [porPagar, setPorPagar] = useState<Compra[]>([]);
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [proveedores, setProveedores] = useState<{ nombre: string; rut: string | null }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  // ?nueva=1 (accesos rápidos) abre el formulario.
  const [form, setForm] = useState<{ compra: Compra | null } | null>(() => (params.get('nueva') === '1' ? { compra: null } : null));

  const cargar = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([
        comprasService.listar(mes ? { desde: `${mes}-01`, hasta: finDeMes(mes) } : {}),
        comprasService.porPagar(),
      ]);
      setLista(l); setPorPagar(p);
    } catch (e) { if (faltaFase15(e)) setFalta(true); else toastError('No se pudieron cargar las compras: ' + (e instanceof Error ? e.message : '')); }
    finally { setCargando(false); }
  }, [mes, toastError]);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    Promise.all([trabajosService.listar().catch(() => []), proyectosService.listar().catch(() => [])]).then(([t, p]) => setDestinos([
      ...t.map(x => ({ valor: `cot:${x.id}`, etiqueta: `IV-${String(x.folio).padStart(4, '0')} · ${x.titulo || 'Cotización'}${x.clientes?.nombre_cliente ? ` · ${x.clientes.nombre_cliente}` : ''}`, grupo: 'Trabajos' as const })),
      ...p.map(x => ({ valor: `proy:${x.id}`, etiqueta: `${folioProyecto(x.folio)} · ${x.nombre}`, grupo: 'Proyectos' as const })),
    ]));
    // Proveedores ya usados, para autocompletar nombre y RUT.
    comprasService.listar().then(cs => {
      const m = new Map<string, { nombre: string; rut: string | null }>();
      for (const c of cs) if (!m.has(c.proveedor_nombre.toLowerCase())) m.set(c.proveedor_nombre.toLowerCase(), { nombre: c.proveedor_nombre, rut: c.proveedor_rut });
      setProveedores([...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    }).catch(() => {});
  }, []);

  const etiquetaDestino = (c: Compra) => c.cotizacion_id ? destinos.find(d => d.valor === `cot:${c.cotizacion_id}`)?.etiqueta || 'Trabajo'
    : c.proyecto_id ? destinos.find(d => d.valor === `proy:${c.proyecto_id}`)?.etiqueta || 'Proyecto' : 'General';

  const base = vista === 'por_pagar' ? porPagar : lista;
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return base
      .filter(c => !destinoF || (destinoF === 'general' ? !c.cotizacion_id && !c.proyecto_id : destinoF === `cot:${c.cotizacion_id}` || destinoF === `proy:${c.proyecto_id}`))
      .filter(c => !q || `${c.proveedor_nombre} ${c.proveedor_rut || ''} ${c.folio || ''} ${c.descripcion || ''} ${c.categoria || ''}`.toLowerCase().includes(q));
  }, [base, destinoF, busca]);

  const signo = (c: Compra) => (c.tipo_doc === 'nota_credito' ? -1 : 1);
  const netoMes = lista.reduce((s, c) => s + signo(c) * (Number(c.neto) + Number(c.exento) + (tipoDoc(c.tipo_doc).conIva ? 0 : Number(c.total))), 0);
  const ivaMes = lista.reduce((s, c) => s + signo(c) * Number(c.iva), 0);
  const deudaTotal = porPagar.reduce((s, c) => s + Number(c.total), 0);
  const vencidas = porPagar.filter(c => c.vencimiento && c.vencimiento < fechaLocal());

  const togglePagada = async (c: Compra) => {
    try { await comprasService.marcarPagada(c.id, !c.pagada, fechaLocal()); success(c.pagada ? 'Marcada por pagar' : 'Marcada pagada'); cargar(); }
    catch (e) { toastError(mensajeCompra(e)); }
  };
  const eliminar = async (c: Compra) => {
    if (!confirm(`¿Eliminar ${tipoDoc(c.tipo_doc).nombre.toLowerCase()} ${c.folio || ''} de ${c.proveedor_nombre}? No se puede deshacer.`)) return;
    try { await comprasService.eliminar(c); success('Compra eliminada'); cargar(); }
    catch (e) { toastError(mensajeCompra(e)); }
  };
  const exportar = () => descargarExcel([{
    nombre: mes ? `Compras ${mes}` : 'Compras',
    filas: filtradas.map(c => ({
      Fecha: c.fecha, Documento: tipoDoc(c.tipo_doc).nombre, 'N°': c.folio || '', 'RUT proveedor': c.proveedor_rut || '', Proveedor: c.proveedor_nombre,
      Neto: signo(c) * Number(c.neto), Exento: signo(c) * Number(c.exento), IVA: signo(c) * Number(c.iva), Total: signo(c) * Number(c.total),
      Categoría: c.categoria || '', Detalle: c.descripcion || '', 'Centro de costo': etiquetaDestino(c), Pagada: c.pagada ? 'Sí' : 'No', 'Fecha pago': c.fecha_pago || '',
    })),
  }], `Compras_${mes || 'todas'}.xlsx`);

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Finanzas" title="Compras a proveedores" /><FaltaSQL archivo="supabase_fase15_revision.sql" /></div>;

  return (
    <div className="anim-in">
      {form && <FormCompra compra={form.compra} destinos={destinos} proveedores={proveedores} destinoInicial={destinoF.startsWith('cot:') || destinoF.startsWith('proy:') ? destinoF : ''}
        onClose={() => setForm(null)} onListo={() => { setForm(null); cargar(); }} />}
      <PageHeader eyebrow="Finanzas" title="Compras a proveedores"
        subtitle="Facturas y boletas de lo que se compra: IVA crédito, costo real de cada trabajo y lo que falta pagar."
        actions={<>
          <button className="btn btn-ghost" onClick={exportar} disabled={!filtradas.length}><Download size={14} /> Excel</button>
          {gestiona && <button className="btn btn-primary" onClick={() => setForm({ compra: null })}><Plus size={14} /> Nueva compra</button>}
        </>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 8, marginBottom: 12 }}>
        <div className="kpi-card"><p className="label-muted">Costo {mes ? `de ${nombreMes(mes)}` : 'total'} (neto)</p><p className="kpi-value">{formatCLP(netoMes)}</p></div>
        <div className="kpi-card" title="IVA de las facturas de compra: se descuenta del IVA de las ventas"><p className="label-muted">IVA crédito {mes ? 'del mes' : ''}</p><p className="kpi-value" style={{ color: 'var(--success)' }}>{formatCLP(ivaMes)}</p></div>
        <button className="kpi-card" style={{ textAlign: 'left', cursor: 'pointer', borderColor: vista === 'por_pagar' ? '#d97706' : undefined }} onClick={() => setVista(v => (v === 'por_pagar' ? 'mes' : 'por_pagar'))}>
          <p className="label-muted">Por pagar a proveedores · {porPagar.length}</p><p className="kpi-value" style={{ color: '#d97706' }}>{formatCLP(deudaTotal)}</p>
          {vencidas.length > 0 && <span style={{ fontSize: '0.74rem', color: 'var(--danger)' }}>{vencidas.length} vencida{vencidas.length === 1 ? '' : 's'}</span>}
        </button>
      </div>

      <div className="panel-y">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-sm" onClick={() => setVista('mes')} style={{ background: vista === 'mes' ? 'var(--y-brand)' : 'var(--bg3)', color: vista === 'mes' ? '#111' : 'var(--muted)' }}>Por mes</button>
            <button className="btn btn-sm" onClick={() => setVista('por_pagar')} style={{ background: vista === 'por_pagar' ? 'var(--y-brand)' : 'var(--bg3)', color: vista === 'por_pagar' ? '#111' : 'var(--muted)' }}>Por pagar</button>
          </div>
          {vista === 'mes' && (
            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input className="input" type="month" value={mes} onChange={e => setMes(e.target.value)} style={{ width: 160 }} aria-label="Mes" />
              {mes && <button className="btn btn-ghost btn-sm" onClick={() => setMes('')}>Todos los meses</button>}
            </span>
          )}
          <select className="input" value={destinoF} onChange={e => setDestinoF(e.target.value)} style={{ maxWidth: 260 }} aria-label="Centro de costo">
            <option value="">Todos los centros de costo</option>
            <option value="general">Gasto general</option>
            {destinos.map(d => <option key={d.valor} value={d.valor}>{d.etiqueta}</option>)}
          </select>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input className="input" style={{ paddingLeft: '2rem' }} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Proveedor, RUT, N° o detalle…" />
          </div>
        </div>

        {cargando ? <div style={{ padding: '1.5rem' }}><div className="skeleton" style={{ height: 140 }} /></div>
          : filtradas.length === 0 ? <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>
              {vista === 'por_pagar' ? 'No hay compras por pagar.' : 'No hay compras en esta vista.'}
              {gestiona && vista === 'mes' && <><br /><button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setForm({ compra: null })}><Plus size={13} /> Ingresar una compra</button></>}</p>
          : filtradas.map(c => {
            const t = tipoDoc(c.tipo_doc);
            const vencida = !c.pagada && c.vencimiento && c.vencimiento < fechaLocal();
            return (
              <div key={c.id} style={{ display: 'flex', gap: 12, padding: '0.8rem 1rem', borderTop: '1px solid var(--border2)', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem' }}>{c.proveedor_nombre}
                    <span style={{ fontWeight: 400, color: 'var(--muted)' }}> · {t.corto}{c.folio ? ` ${c.folio}` : ''}</span></span>
                  <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)' }}>
                    {formatDate(c.fecha)} · {etiquetaDestino(c)}{c.categoria ? ` · ${c.categoria}` : ''}{c.descripcion ? ` · ${c.descripcion}` : ''}</span>
                </span>
                <span style={{ textAlign: 'right', minWidth: 130 }}>
                  <span style={{ display: 'block', fontWeight: 700, color: c.tipo_doc === 'nota_credito' ? 'var(--success)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                    {c.tipo_doc === 'nota_credito' ? '−' : ''}{formatCLP(Number(c.total))}</span>
                  {t.conIva && <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>neto {formatCLP(Number(c.neto) + Number(c.exento))} · IVA {formatCLP(Number(c.iva))}</span>}
                </span>
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {c.tipo_doc !== 'nota_credito' && (
                    <button className="badge" disabled={!gestiona} onClick={() => togglePagada(c)} title={gestiona ? 'Cambiar' : undefined}
                      style={{ border: 'none', cursor: gestiona ? 'pointer' : 'default', background: c.pagada ? 'var(--success-soft)' : vencida ? 'rgba(220,38,38,0.1)' : 'var(--y-soft)', color: c.pagada ? 'var(--success)' : vencida ? 'var(--danger)' : 'var(--text)' }}>
                      {c.pagada ? `Pagada${c.fecha_pago ? ` ${formatDate(c.fecha_pago)}` : ''}` : vencida ? `Vencida ${formatDate(c.vencimiento)}` : c.vencimiento ? `Vence ${formatDate(c.vencimiento)}` : 'Por pagar'}</button>
                  )}
                  {c.archivo_path && <button className="btn btn-ghost btn-xs" aria-label="Ver respaldo" title="Ver respaldo"
                    onClick={async () => { const u = await comprasService.urlArchivo(c.archivo_path!); if (u) window.open(u, '_blank'); }}><FileText size={13} /></button>}
                  {gestiona && <button className="btn btn-ghost btn-xs" aria-label="Editar" onClick={() => setForm({ compra: c })}><Pencil size={13} /></button>}
                  {gestiona && <button className="btn btn-ghost btn-xs" aria-label="Eliminar" onClick={() => eliminar(c)}><Trash2 size={13} /></button>}
                </span>
              </div>
            );
          })}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border2)', color: 'var(--muted)', fontSize: '0.78rem' }}>{filtradas.length} documento{filtradas.length === 1 ? '' : 's'}</div>
      </div>
    </div>
  );
}

export default function ComprasPage() {
  return <Suspense fallback={<div className="skeleton" style={{ height: 200 }} />}><ComprasContent /></Suspense>;
}
