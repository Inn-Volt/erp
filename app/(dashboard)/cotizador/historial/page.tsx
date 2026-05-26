'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  History, Search, Trash2, Copy, Edit3, FileText, ChevronDown,
  ChevronUp, Download, Loader2, X, Filter, ArrowUpDown,
} from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';

import { cotizacionesService } from '@/services/cotizaciones';
import { useToast } from '@/hooks/useToast';
import { formatCLP, formatFolio, formatDate, calcularTotals } from '@/utils';
import type { Cotizacion, EstadoCotizacion } from '@/types';
import { ESTADO_COLORS, ESTADOS_TODOS } from '@/types';
import PresupuestoPDF from '@/components/pdf/PresupuestoPDF';
import { supabase } from '@/lib/supabase';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';

type SortKey = 'folio' | 'cliente' | 'total' | 'fecha' | 'estado';
type SortDir = 'asc' | 'desc';

const ESTADO_OPTIONS: EstadoCotizacion[] = ESTADOS_TODOS;

export default function HistorialPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<EstadoCotizacion | 'Todos'>('Todos');
  const [sortKey, setSortKey] = useState<SortKey>('folio');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [genPDF, setGenPDF] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

 const load = useCallback(async () => {
  setLoading(true);
  const data = await cotizacionesService.getAll();
  setCotizaciones(data);
  setLoading(false);
}, []);

useEffect(() => {
  load();
}, [load]);

useEffect(() => {
  const loadEmpresa = async () => {
    const { data, error } = await supabase
      .from('empresas')
      .select('*')
      .single();

    if (!error && data) {
      setEmpresa(data);
    }
  };

  loadEmpresa();
}, []);

  const handleDelete = async (id: string, folio: number) => {
    if (!confirm(`¿Eliminar cotización ${formatFolio(folio)}? Esta acción no se puede deshacer.`)) return;
    try {
      await cotizacionesService.delete(id);
      success('Cotización eliminada');
      load();
    } catch (e: unknown) {
      toastError('Error al eliminar: ' + (e instanceof Error ? e.message : 'Error'));
    }
  };

  const handleEstado = async (id: string, estado: EstadoCotizacion) => {
    try {
      await cotizacionesService.updateEstado(id, estado);
      success(`Estado actualizado a ${estado}`);
      load();
    } catch {
      toastError('Error al actualizar estado');
    }
  };
const [empresa, setEmpresa] = useState<EmpresaInfo | null>(null);

  const handleDownloadPDF = async (cot: Cotizacion) => {
    if (!empresa) {
  toastError('No existe empresa configurada');
  return;
}
    if (!cot.clientes) { toastError('Cliente no cargado'); return; }
    setGenPDF(cot.id);
    try {
      const totals = calcularTotals(cot.items || [], cot.descuento_global || 0);
      const blob = await pdf(
        <PresupuestoPDF
          cliente={cot.clientes}
          items={cot.items || []}
          totals={totals}
          descuentoPorcentajeMO={cot.descuento_global || 0}
          folio={formatFolio(cot.folio)}
          descripcionGeneral={cot.descripcion_general || ''}
          garantia={cot.condiciones_servicio || ''}
          condicionesComerciales={cot.condiciones_comerciales || ''}
          ocultarSuministros={cot.ocultar_suministros || false}
          empresa={empresa}
        />
      ).toBlob();
      saveAs(blob, `Cotizacion_${formatFolio(cot.folio)}_${cot.clientes.nombre_cliente}.pdf`);
    } catch (e) {
      console.error(e);
      toastError('Error al generar PDF');
    } finally {
      setGenPDF(null);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filtered = useMemo(() => {
    let list = [...cotizaciones];
    if (filterEstado !== 'Todos') list = list.filter(c => c.estado === filterEstado);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        formatFolio(c.folio).toLowerCase().includes(q) ||
        (c.clientes?.nombre_cliente || '').toLowerCase().includes(q) ||
        (c.clientes?.empresa || '').toLowerCase().includes(q) ||
        (c.descripcion_general || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let va: string | number = 0, vb: string | number = 0;
      if (sortKey === 'folio')   { va = a.folio; vb = b.folio; }
      if (sortKey === 'cliente') { va = a.clientes?.nombre_cliente || ''; vb = b.clientes?.nombre_cliente || ''; }
      if (sortKey === 'total')   { va = a.total; vb = b.total; }
      if (sortKey === 'fecha')   { va = a.created_at; vb = b.created_at; }
      if (sortKey === 'estado')  { va = a.estado; vb = b.estado; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [cotizaciones, filterEstado, search, sortKey, sortDir]);

  // Resumen rápido
  const resumen = useMemo(() => ({
    total: filtered.length,
    montoTotal: filtered.reduce((a, c) => a + (c.total || 0), 0),
    aceptadas: filtered.filter(c => ['Aceptado', 'Realizado', 'Entregado'].includes(c.estado)).length,
  }), [filtered]);

  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k
    ? (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
    : <ArrowUpDown size={10} style={{ opacity: 0.3 }} />;

  const thStyle: React.CSSProperties = {
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.55rem',
    letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--muted)',
    padding: '0.5rem 0.875rem', textAlign: 'left', whiteSpace: 'nowrap',
    cursor: 'pointer', userSelect: 'none', borderBottom: '1px solid var(--border2)',
    background: 'var(--bg3)',
  };

  return (
    <div className="anim-in">
      {/* Header */}
      <div className="iv-page-header">
        <div>
          <p className="label-muted" style={{ marginBottom: '0.35rem', letterSpacing: '0.4em' }}>Registro completo</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(2rem,5vw,3.2rem)', textTransform: 'uppercase', lineHeight: 0.9, color: '#fff' }}>
            HISTO<span style={{ color: 'var(--y)' }}>RIAL</span>
          </h1>
        </div>
        <div className="iv-header-actions">
          <button onClick={() => router.push('/cotizador')} style={{ background: 'var(--y)', color: '#000', border: 'none', cursor: 'pointer', padding: '0 1.25rem', height: 36, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <FileText size={13} /> Nueva cotización
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="historial-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', marginBottom: '2px' }}>
        {[
          { label: 'Cotizaciones', value: resumen.total, color: 'var(--y)' },
          { label: 'Monto filtrado', value: formatCLP(resumen.montoTotal), color: '#4ade80' },
          { label: 'Aceptadas', value: resumen.aceptadas, color: '#60a5fa' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="label-muted" style={{ fontSize: '0.55rem' }}>{k.label}</span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1rem', color: k.color }}>{k.value}</span>
          </div>
        ))}
      </div>

      {/* Search & filter */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderTop: '2px solid var(--y)', padding: '0.875rem 1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '2px' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            className="input input-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por folio, cliente, descripción..."
            style={{ paddingLeft: '2.25rem' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
              <X size={12} />
            </button>
          )}
        </div>

        <button onClick={() => setShowFilters(f => !f)} style={{ background: showFilters ? 'rgba(255,198,0,0.1)' : 'var(--bg3)', border: `1px solid ${showFilters ? 'rgba(255,198,0,0.3)' : 'var(--border2)'}`, cursor: 'pointer', padding: '0 0.75rem', height: 32, display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: showFilters ? 'var(--y)' : 'var(--muted)' }}>
          <Filter size={12} /> Filtros
        </button>

        {filterEstado !== 'Todos' && (
          <button onClick={() => setFilterEstado('Todos')} style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', cursor: 'pointer', padding: '0 0.75rem', height: 32, display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#f87171' }}>
            <X size={11} /> {filterEstado}
          </button>
        )}
      </div>

      {/* Estado filter */}
      {showFilters && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderTop: 'none', padding: '0.75rem 1rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '2px' }}>
          {(['Todos', ...ESTADO_OPTIONS] as const).map(est => {
            const active = filterEstado === est;
            const ec = est !== 'Todos' ? ESTADO_COLORS[est as EstadoCotizacion] : null;
            return (
              <button
                key={est}
                onClick={() => setFilterEstado(est as EstadoCotizacion | 'Todos')}
                style={{
                  background: active ? (ec ? ec.bg : 'rgba(255,198,0,0.1)') : 'transparent',
                  border: `1px solid ${active ? (ec ? ec.color : 'var(--y)') : 'var(--border2)'}`,
                  color: active ? (ec ? ec.color : 'var(--y)') : 'var(--muted)',
                  cursor: 'pointer', padding: '0.2rem 0.75rem',
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.6rem',
                  letterSpacing: '0.15em', textTransform: 'uppercase',
                }}
              >
                {est}
              </button>
            );
          })}
        </div>
      )}

      {/* Tabla */}
      <div className="historial-table-wrap" style={{ background: 'var(--bg2)', border: '1px solid var(--border2)' }}>
        {loading ? (
          <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 52 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted)' }}>
            <History size={40} style={{ margin: '0 auto 1rem', opacity: 0.2, display: 'block' }} />
            <p style={{ fontSize: '0.875rem' }}>Sin cotizaciones{search || filterEstado !== 'Todos' ? ' con estos filtros' : ' registradas'}</p>
          </div>
        ) : (
          <table className="iv-table" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 90 }} onClick={() => toggleSort('folio')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>Folio <SortIcon k="folio" /></span>
                </th>
                <th style={{ ...thStyle }} onClick={() => toggleSort('cliente')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>Cliente <SortIcon k="cliente" /></span>
                </th>
                <th className="col-descripcion" style={{ ...thStyle, width: 200 }}>Descripción</th>
                <th style={{ ...thStyle, width: 100 }} onClick={() => toggleSort('fecha')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>Fecha <SortIcon k="fecha" /></span>
                </th>
                <th style={{ ...thStyle, width: 110 }} onClick={() => toggleSort('estado')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>Estado <SortIcon k="estado" /></span>
                </th>
                <th style={{ ...thStyle, width: 120, textAlign: 'right' }} onClick={() => toggleSort('total')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end' }}>Total <SortIcon k="total" /></span>
                </th>
                <th style={{ ...thStyle, width: 130, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(cot => {
                const ec = ESTADO_COLORS[cot.estado];
                return (
                  <tr key={cot.id} style={{ cursor: 'pointer' }}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.85rem', color: 'var(--y)' }}>
                        {formatFolio(cot.folio)}
                      </span>
                    </td>
                    <td>
                      <p style={{ fontWeight: 500, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cot.clientes?.nombre_cliente || '—'}
                      </p>
                      {cot.clientes?.empresa && (
                        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cot.clientes.empresa}
                        </p>
                      )}
                    </td>
                    <td className="col-descripcion" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--muted)' }}>
                      {cot.descripcion_general || '—'}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(cot.created_at)}
                    </td>
                    <td>
                      <select
                        value={cot.estado}
                        onChange={e => handleEstado(cot.id, e.target.value as EstadoCotizacion)}
                        onClick={e => e.stopPropagation()}
                        style={{
                          background: ec.bg, border: `1px solid ${ec.color}40`,
                          color: ec.color, cursor: 'pointer', padding: '0.15rem 0.4rem',
                          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.58rem',
                          letterSpacing: '0.15em', textTransform: 'uppercase', outline: 'none',
                        }}
                      >
                        {ESTADO_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                      {formatCLP(cot.total)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                        <button
                          onClick={() => router.push(`/cotizador?edit=${cot.id}`)}
                          title="Editar"
                          style={{ background: 'none', border: '1px solid var(--border2)', cursor: 'pointer', padding: '0.25rem 0.4rem', color: 'var(--muted)' }}
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          onClick={() => router.push(`/cotizador?clone=${cot.id}`)}
                          title="Clonar"
                          style={{ background: 'none', border: '1px solid var(--border2)', cursor: 'pointer', padding: '0.25rem 0.4rem', color: 'var(--muted)' }}
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          onClick={() => handleDownloadPDF(cot)}
                          title="Descargar PDF"
                          disabled={genPDF === cot.id}
                          style={{ background: 'none', border: '1px solid rgba(74,222,128,0.2)', cursor: 'pointer', padding: '0.25rem 0.4rem', color: '#4ade80' }}
                        >
                          {genPDF === cot.id ? <Loader2 size={12} className="iv-spin" /> : <Download size={12} />}
                        </button>
                        <button
                          onClick={() => handleDelete(cot.id, cot.folio)}
                          title="Eliminar"
                          style={{ background: 'none', border: '1px solid rgba(248,113,113,0.2)', cursor: 'pointer', padding: '0.25rem 0.4rem', color: '#f87171' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <div style={{ padding: '0.6rem 1rem', background: 'var(--bg3)', border: '1px solid var(--border2)', borderTop: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{filtered.length} cotización{filtered.length !== 1 ? 'es' : ''}</span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--y)' }}>{formatCLP(resumen.montoTotal)}</span>
        </div>
      )}
    </div>
  );
  
}
