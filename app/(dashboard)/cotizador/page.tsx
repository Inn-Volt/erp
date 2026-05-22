/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useMemo, useRef, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus, Trash2, Save, FileText, History, User, Download,
  Loader2, RefreshCcw, Check, FileUp, EyeOff, Eye,
  Copy, Package, Wrench, Settings2, X, ArrowUp, ArrowDown,
} from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

import { supabase } from '@/lib/supabase';
import { clientesService } from '@/services/clientes';
import { cotizacionesService } from '@/services/cotizaciones';
import { useToast } from '@/hooks/useToast';
import {
  formatCLP, formatFolio, cleanNumber, calcularTotals,
  newItem, precioDesdeMargen, margenDesdePrecio, itemsToExcelRows,
} from '@/utils';
import type { CotizacionItem, Cliente, CategoriaItem } from '@/types';
import { CATEGORIA_LABELS, UNIDADES } from '@/types';
import PresupuestoPDF from '@/components/pdf/PresupuestoPDF';
import ListadoInternoPDF from '@/components/pdf/ListadoInternoPDF';

// ─── Estilos base ─────────────────────────────────────────────────────────────
const panelY: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border2)', borderTop: '2px solid var(--y)',
};
const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.58rem',
  letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--y)',
  display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem',
};
const btnGhost: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'rgba(255,255,255,0.4)',
  cursor: 'pointer', padding: '0 0.875rem', height: 36,
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.68rem',
  letterSpacing: '0.12em', textTransform: 'uppercase',
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
};

const GARANTIA_DEFAULT =
  '• Garantía: 6 meses sobre la mano de obra instalada.\n• La garantía no cubre fallas por mal uso, sobrecargas o intervención de terceros.\n• Materiales: La garantía de los componentes es responsabilidad del fabricante.';
const CONDICIONES_DEFAULT =
  '• Validez de la oferta: 15 días corridos.\n• Forma de Pago: 50% anticipo al inicio y 50% al finalizar conforme.\n• Medios de pago: Transferencia electrónica o efectivo.';

const CAT_COLORS: Record<CategoriaItem, string> = {
  material: '#ffc600', mano_obra: '#60a5fa', servicio: '#a78bfa',
};
const CAT_ICONS: Record<CategoriaItem, React.ElementType> = {
  material: Package, mano_obra: Wrench, servicio: Settings2,
};

// ─── Componente PDF Modal ─────────────────────────────────────────────────────
function PDFModal({ folio, cliente, items, totals, descuentoPorcentajeMO, descripcionGeneral, garantia, condicionesComerciales, ocultarSuministros, onClose }: {
  folio: number; cliente: any; items: CotizacionItem[];
  totals: ReturnType<typeof calcularTotals>; descuentoPorcentajeMO: number;
  descripcionGeneral: string; garantia: string; condicionesComerciales: string;
  ocultarSuministros: boolean; onClose: () => void;
}) {
  const [gen, setGen] = useState(false);
  const folioStr = formatFolio(folio);

  const download = async (tipo: 'cliente' | 'interno') => {
    setGen(true);
    try {
      if (tipo === 'cliente') {
        const blob = await pdf(
          <PresupuestoPDF
            cliente={cliente} items={items} totals={totals}
            descuentoPorcentajeMO={descuentoPorcentajeMO} folio={folioStr}
            descripcionGeneral={descripcionGeneral} garantia={garantia}
            condicionesComerciales={condicionesComerciales}
            ocultarSuministros={ocultarSuministros}
          />
        ).toBlob();
        saveAs(blob, `Cotizacion_${folioStr}_${cliente.nombre_cliente}.pdf`);
      } else {
        const soloMat = items.filter(i => i.categoria === 'material' || i.esMaterial);
        const blob = await pdf(
          <ListadoInternoPDF
            items={soloMat} folio={folioStr}
            clienteNombre={cliente.nombre_cliente}
            descripcion={descripcionGeneral}
          />
        ).toBlob();
        saveAs(blob, `Interno_${folioStr}.pdf`);
      }
    } catch (e) { console.error(e); }
    finally { setGen(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 420 }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={sectionLabel as any}><Download size={13} /> Generar PDF</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ background: 'var(--bg3)', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1rem', color: 'var(--y)' }}>{folioStr}</p>
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.15rem' }}>{cliente.nombre_cliente}</p>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.2rem', color: '#fff', marginTop: '0.25rem' }}>{formatCLP(totals.total)}</p>
            </div>
            <div style={{ width: 36, height: 36, background: 'rgba(74,222,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={18} color="#4ade80" />
            </div>
          </div>

          <button onClick={() => download('cliente')} disabled={gen} style={{ ...btnGhost, width: '100%', justifyContent: 'center', height: 44, borderColor: 'rgba(74,222,128,0.3)', color: '#4ade80' }}>
            {gen ? <Loader2 size={14} className="iv-spin" /> : <FileText size={14} />}
            PDF Cliente (con IVA)
          </button>
          <button onClick={() => download('interno')} disabled={gen} style={{ ...btnGhost, width: '100%', justifyContent: 'center', height: 44 }}>
            {gen ? <Loader2 size={14} className="iv-spin" /> : <Package size={14} />}
            Listado interno de materiales
          </button>
          <div className="iv-divider" />
          <button onClick={onClose} style={{ ...btnGhost, width: '100%', justifyContent: 'center' }}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Item Row ─────────────────────────────────────────────────────────────────
function ItemRow({ item, index, total, onUpdate, onDelete, onDuplicate, onMoveUp, onMoveDown, isFirst, isLast }: {
  item: CotizacionItem; index: number; total: number;
  onUpdate: (i: number, u: Partial<CotizacionItem>) => void;
  onDelete: (i: number) => void;
  onDuplicate: (i: number) => void;
  onMoveUp: (i: number) => void;
  onMoveDown: (i: number) => void;
  isFirst: boolean; isLast: boolean;
}) {
  const CatIcon = CAT_ICONS[item.categoria];

  const handleCostoChange = (v: string) => {
    const costo = cleanNumber(v);
    const precio = precioDesdeMargen(costo, item.margen || 30);
    onUpdate(index, { costo, precio: Math.round(precio) });
  };

  const handleMargenChange = (v: string) => {
    const margen = parseFloat(v) || 0;
    const precio = precioDesdeMargen(item.costo || 0, margen);
    onUpdate(index, { margen, precio: Math.round(precio) });
  };

  const handlePrecioChange = (v: string) => {
    const precio = cleanNumber(v);
    const margen = margenDesdePrecio(item.costo || 0, precio);
    onUpdate(index, { precio, margen: Math.round(margen * 10) / 10 });
  };

  const inputStyle: React.CSSProperties = {
    background: 'transparent', border: 'none', color: '#fff',
    fontFamily: 'var(--font-body)', fontSize: '0.82rem',
    padding: '0.25rem 0.4rem', outline: 'none', width: '100%',
    textAlign: 'right',
  };

  return (
    <div style={{
      background: 'var(--bg3)', borderLeft: `3px solid ${CAT_COLORS[item.categoria]}`,
      marginBottom: 2, display: 'flex', flexDirection: 'column', gap: 0,
    }}>
      {/* Fila principal */}
      <div style={{ display: 'grid', alignItems: 'center', gap: 2, padding: '0.4rem 0.6rem', gridTemplateColumns: '1fr 60px 80px 90px 80px 80px 90px 100px auto' }}>

        {/* Descripción */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
          <CatIcon size={11} color={CAT_COLORS[item.categoria]} style={{ flexShrink: 0 }} />
          <input
            value={item.descripcion}
            onChange={e => onUpdate(index, { descripcion: e.target.value })}
            placeholder="Descripción..."
            style={{ ...inputStyle, textAlign: 'left', fontSize: '0.85rem', flex: 1 }}
          />
        </div>

        {/* Cantidad */}
        <input
          type="number" min="0" step="0.01"
          value={item.cantidad || ''}
          onChange={e => onUpdate(index, { cantidad: parseFloat(e.target.value) || 0 })}
          style={inputStyle}
          title="Cantidad"
        />

        {/* Unidad */}
        <select
          value={item.unidad}
          onChange={e => onUpdate(index, { unidad: e.target.value })}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
        </select>

        {/* Costo */}
        <input
          type="number" min="0" step="1"
          value={item.costo || ''}
          onChange={e => handleCostoChange(e.target.value)}
          placeholder="0"
          style={{ ...inputStyle, color: 'rgba(255,255,255,0.4)' }}
          title="Costo unitario (interno)"
        />

        {/* Margen % */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
          <input
            type="number" min="0" max="99" step="1"
            value={item.margen || ''}
            onChange={e => handleMargenChange(e.target.value)}
            placeholder="30"
            style={{ ...inputStyle, width: '52px', color: '#a78bfa' }}
            title="Margen %"
          />
          <span style={{ fontSize: '0.65rem', color: '#a78bfa' }}>%</span>
        </div>

        {/* Precio */}
        <input
          type="number" min="0" step="1"
          value={item.precio || ''}
          onChange={e => handlePrecioChange(e.target.value)}
          placeholder="0"
          style={{ ...inputStyle, color: 'var(--y)' }}
          title="Precio de venta"
        />

        {/* IVA toggle */}
        <button
          onClick={() => onUpdate(index, { iva_incluido: !item.iva_incluido })}
          style={{
            background: item.iva_incluido ? 'rgba(96,165,250,0.15)' : 'transparent',
            border: `1px solid ${item.iva_incluido ? 'rgba(96,165,250,0.4)' : 'var(--border2)'}`,
            cursor: 'pointer', padding: '0.15rem 0.4rem', fontSize: '0.58rem',
            fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.15em',
            color: item.iva_incluido ? '#60a5fa' : 'var(--muted)',
            whiteSpace: 'nowrap',
          }}
        >
          {item.iva_incluido ? '+IVA' : 'NETO'}
        </button>

        {/* Subtotal */}
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: '#fff', textAlign: 'right', whiteSpace: 'nowrap' }}>
          {formatCLP(total)}
        </span>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center', flexShrink: 0 }}>
          <button onClick={() => onMoveUp(index)} disabled={isFirst} title="Subir" style={{ background: 'none', border: 'none', cursor: isFirst ? 'default' : 'pointer', color: isFirst ? 'rgba(255,255,255,0.1)' : 'var(--muted)', padding: '0.2rem' }}>
            <ArrowUp size={10} />
          </button>
          <button onClick={() => onMoveDown(index)} disabled={isLast} title="Bajar" style={{ background: 'none', border: 'none', cursor: isLast ? 'default' : 'pointer', color: isLast ? 'rgba(255,255,255,0.1)' : 'var(--muted)', padding: '0.2rem' }}>
            <ArrowDown size={10} />
          </button>
          <button onClick={() => onDuplicate(index)} title="Duplicar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0.2rem' }}>
            <Copy size={10} />
          </button>
          <button onClick={() => onDelete(index)} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: '0.2rem' }}>
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {/* Categoría selector */}
      <div style={{ display: 'flex', gap: '2px', padding: '0 0.6rem 0.4rem', paddingLeft: '2rem' }}>
        {(['material', 'mano_obra', 'servicio'] as CategoriaItem[]).map(cat => (
          <button
            key={cat}
            onClick={() => onUpdate(index, { categoria: cat, esMaterial: cat === 'material' })}
            style={{
              background: item.categoria === cat ? `${CAT_COLORS[cat]}1a` : 'transparent',
              border: `1px solid ${item.categoria === cat ? CAT_COLORS[cat] : 'transparent'}`,
              cursor: 'pointer', padding: '0.1rem 0.45rem',
              fontSize: '0.55rem', fontFamily: 'var(--font-display)', fontWeight: 700,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              color: item.categoria === cat ? CAT_COLORS[cat] : 'rgba(255,255,255,0.2)',
              transition: 'all 0.1s',
            }}
          >
            {CATEGORIA_LABELS[cat]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Contenido principal (requiere useSearchParams) ───────────────────────────
function CotizadorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { success, error: toastError, warning } = useToast();

  const editId  = searchParams.get('edit');
  const cloneId = searchParams.get('clone');
  const clienteParam = searchParams.get('cliente');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado del formulario
  const [loading,               setLoading]               = useState(false);
  const [folioGenerado,         setFolioGenerado]         = useState<number | null>(null);
  const [proximoFolio,          setProximoFolio]          = useState<number | null>(null);
  const [clientes,              setClientes]              = useState<Cliente[]>([]);
  const [searchCliente,         setSearchCliente]         = useState('');
  const [showClienteDropdown,   setShowClienteDropdown]   = useState(false);
  const [clienteSeleccionado,   setClienteSeleccionado]   = useState<Cliente | null>(null);
  const [items,                 setItems]                 = useState<CotizacionItem[]>([]);
  const [descripcionGeneral,    setDescripcionGeneral]    = useState('');
  const [descuentoPorcentajeMO, setDescuentoPorcentajeMO] = useState(0);
  const [ocultarSuministros,    setOcultarSuministros]    = useState(false);
  const [ocultarCostos,         setOcultarCostos]         = useState(true);
  const [garantia,              setGarantia]              = useState(GARANTIA_DEFAULT);
  const [condicionesComerciales, setCondicionesComerciales] = useState(CONDICIONES_DEFAULT);
  const [showPDFModal,          setShowPDFModal]          = useState(false);

  // Cargar datos iniciales
  useEffect(() => {
    loadInitialData();
    if (editId)       cargarDatosEdicion(editId, false);
    else if (cloneId) cargarDatosEdicion(cloneId, true);
    else              obtenerUltimoFolio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, cloneId]);

  async function loadInitialData() {
    const data = await clientesService.getAll();
    setClientes(data);
    // Si viene cliente param, preseleccionarlo
    if (clienteParam) {
      const c = data.find(x => x.id === clienteParam);
      if (c) { setClienteSeleccionado(c); setSearchCliente(c.nombre_cliente); }
    }
  }

  async function obtenerUltimoFolio() {
    const f = await cotizacionesService.getNextFolio();
    setProximoFolio(f);
  }

  async function cargarDatosEdicion(id: string, isCloning: boolean) {
    setLoading(true);
    const cot = await cotizacionesService.getById(id);
    if (cot) {
      setClienteSeleccionado(cot.clientes || null);
      setSearchCliente(cot.clientes?.nombre_cliente || '');
      // Asegurar que los items tengan todos los campos nuevos
      const itemsNormalizados = (cot.items || []).map((item: any) => ({
        id: item.id || newItem().id,
        descripcion: item.descripcion || '',
        categoria: item.categoria || (item.esMaterial ? 'material' : 'mano_obra') as CategoriaItem,
        cantidad: item.cantidad || 1,
        unidad: item.unidad || 'un',
        costo: item.costo || 0,
        margen: item.margen || 0,
        precio: item.precio || 0,
        iva_incluido: item.iva_incluido !== undefined ? item.iva_incluido : true,
        esMaterial: item.esMaterial !== undefined ? item.esMaterial : true,
      }));
      setItems(itemsNormalizados);
      setDescripcionGeneral(cot.descripcion_general || '');
      setDescuentoPorcentajeMO(cot.descuento_global || 0);
      if (cot.condiciones_servicio)    setGarantia(cot.condiciones_servicio);
      if (cot.condiciones_comerciales) setCondicionesComerciales(cot.condiciones_comerciales);
      setOcultarSuministros(cot.ocultar_suministros ?? false);
      if (!isCloning) setFolioGenerado(cot.folio);
      else            obtenerUltimoFolio();
    }
    setLoading(false);
  }

  // Cálculos automáticos
  const totals = useMemo(() => calcularTotals(items, descuentoPorcentajeMO), [items, descuentoPorcentajeMO]);

  // Handlers de items
  const addItem = useCallback((categoria: CategoriaItem = 'material') => {
    setItems(prev => [newItem({ categoria, esMaterial: categoria === 'material' }), ...prev]);
  }, []);

  const updateItem = useCallback((index: number, updates: Partial<CotizacionItem>) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item));
  }, []);

  const deleteItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const duplicateItem = useCallback((index: number) => {
    setItems(prev => {
      const copy = { ...prev[index], id: newItem().id };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }, []);

  const moveItem = useCallback((index: number, direction: 'up' | 'down') => {
    setItems(prev => {
      const next = [...prev];
      const targetIdx = direction === 'up' ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= next.length) return prev;
      [next[index], next[targetIdx]] = [next[targetIdx], next[index]];
      return next;
    });
  }, []);

  // Import Excel
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: any[] = XLSX.utils.sheet_to_json(ws);
        const newItems: CotizacionItem[] = raw
          .filter(r => r['Descripcion'] || r['descripcion'])
          .map(r => newItem({
            descripcion: r['Descripcion'] || r['descripcion'] || '',
            cantidad:    cleanNumber(r['Cantidad']  || r['cantidad'] || 1),
            precio:      cleanNumber(r['Precio venta'] || r['precio'] || 0),
            costo:       cleanNumber(r['Costo unitario'] || r['costo'] || 0),
            margen:      parseFloat(r['Margen (%)'] || r['margen'] || '30') || 30,
            categoria:   (r['Categoria'] || r['categoria'] || 'material') as CategoriaItem,
            unidad:      r['Unidad'] || r['unidad'] || 'un',
            iva_incluido: true,
            esMaterial:  true,
          }));
        setItems(prev => [...newItems, ...prev]);
        success(`${newItems.length} ítems importados desde Excel`);
      } catch {
        toastError('Error al procesar el archivo Excel. Verifica el formato.');
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // Export Excel
  const exportExcel = () => {
    if (items.length === 0) { warning('Agrega ítems antes de exportar'); return; }
    const rows = itemsToExcelRows(items);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cotización');
    // Hoja de totales
    const totSheet = XLSX.utils.json_to_sheet([
      { Concepto: 'Neto Materiales',  Monto: totals.netoMateriales },
      { Concepto: 'IVA Materiales',   Monto: totals.ivaMateriales },
      { Concepto: 'Neto Mano de Obra',Monto: totals.netoMO },
      { Concepto: 'Neto Servicios',   Monto: totals.netoServicios },
      { Concepto: 'Total Neto',        Monto: totals.netoGeneral },
      { Concepto: 'IVA Total',         Monto: totals.ivaGeneral },
      { Concepto: 'TOTAL',             Monto: totals.total },
    ]);
    XLSX.utils.book_append_sheet(wb, totSheet, 'Totales');
    XLSX.writeFile(wb, `Cotizacion_${formatFolio(folioGenerado || proximoFolio)}.xlsx`);
  };

  // Guardar
  const handleGuardar = async () => {
    if (!clienteSeleccionado) { warning('Selecciona un cliente antes de guardar'); return; }
    if (items.length === 0) { warning('Agrega al menos un ítem'); return; }
    setLoading(true);
    const payload = {
      cliente_id: clienteSeleccionado.id,
      items,
      subtotal: totals.netoGeneral,
      iva: totals.ivaGeneral,
      total: totals.total,
      descuento_global: descuentoPorcentajeMO,
      descripcion_general: descripcionGeneral,
      condiciones_servicio: garantia,
      condiciones_comerciales: condicionesComerciales,
      estado: 'Pendiente' as const,
      ocultar_suministros: ocultarSuministros,
    };
    try {
      let result;
      if (editId && !cloneId) {
        result = await cotizacionesService.update(editId, payload);
        success('Cotización actualizada correctamente');
      } else {
        result = await cotizacionesService.create(payload);
        success('Cotización guardada correctamente');
      }
      setFolioGenerado(result.folio);
      if (!editId || cloneId) router.replace(`/cotizador?edit=${result.id}`);
    } catch (e: any) {
      toastError('Error al guardar: ' + (e?.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const nuevoPresupuesto = () => {
    setItems([]);
    setClienteSeleccionado(null);
    setSearchCliente('');
    setDescripcionGeneral('');
    setFolioGenerado(null);
    setDescuentoPorcentajeMO(0);
    setOcultarSuministros(false);
    setGarantia(GARANTIA_DEFAULT);
    setCondicionesComerciales(CONDICIONES_DEFAULT);
    obtenerUltimoFolio();
    router.push('/cotizador');
  };

  const setAllIVA = (v: boolean) => setItems(prev => prev.map(i => ({ ...i, iva_incluido: v })));

  // Busqueda de cliente filtrada
  const clientesFiltrados = useMemo(() => {
    if (!searchCliente) return clientes.slice(0, 8);
    const q = searchCliente.toLowerCase();
    return clientes.filter(c =>
      c.nombre_cliente.toLowerCase().includes(q) ||
      (c.empresa || '').toLowerCase().includes(q) ||
      c.rut.includes(q)
    ).slice(0, 8);
  }, [clientes, searchCliente]);

  const isEditing = !!(editId && !cloneId);
  const hasFolio  = folioGenerado !== null;

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }} className="anim-in">
      <input
        type="file" ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
      />

      {/* Modal PDF */}
      {showPDFModal && hasFolio && clienteSeleccionado && (
        <PDFModal
          folio={folioGenerado!}
          cliente={clienteSeleccionado}
          items={items}
          totals={totals}
          descuentoPorcentajeMO={descuentoPorcentajeMO}
          descripcionGeneral={descripcionGeneral}
          garantia={garantia}
          condicionesComerciales={condicionesComerciales}
          ocultarSuministros={ocultarSuministros}
          onClose={() => setShowPDFModal(false)}
        />
      )}

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div className="iv-page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <p className="label-muted" style={{ marginBottom: '0.35rem', letterSpacing: '0.4em' }}>
            {cloneId ? 'Clonando' : (isEditing ? 'Editando' : 'Nueva')} cotización
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(1.8rem,4vw,2.8rem)', textTransform: 'uppercase', lineHeight: 1, color: '#fff' }}>
              COTIZA<span style={{ color: 'var(--y)' }}>DOR</span>
            </h1>
            <span style={{ background: hasFolio ? 'var(--y)' : 'var(--bg3)', color: hasFolio ? '#000' : 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.8rem', letterSpacing: '0.15em', padding: '0.25rem 0.875rem', border: hasFolio ? 'none' : '1px solid var(--border2)' }}>
              {formatFolio(folioGenerado || proximoFolio)}
            </span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="iv-header-actions">
          <button onClick={nuevoPresupuesto} style={btnGhost}><RefreshCcw size={13} /> Nuevo</button>
          <Link href="/cotizador/historial" style={{ ...btnGhost, textDecoration: 'none' }}>
            <History size={13} /> Historial
          </Link>
          <button onClick={() => fileInputRef.current?.click()} style={btnGhost}>
            <FileUp size={13} /> Excel
          </button>
          {hasFolio && (
            <button onClick={() => setShowPDFModal(true)} style={{ ...btnGhost, color: '#4ade80', borderColor: 'rgba(74,222,128,0.3)' }}>
              <Download size={13} /> PDF
            </button>
          )}
          <button
            onClick={handleGuardar}
            disabled={loading}
            style={{ background: 'var(--y)', color: '#000', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', padding: '0 1.25rem', height: 36, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', opacity: loading ? 0.5 : 1 }}
          >
            {loading ? <Loader2 size={13} className="iv-spin" /> : <Save size={13} />}
            {isEditing ? 'Actualizar' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* ══ GRID PRINCIPAL ══════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gap: '2px', alignItems: 'start' }} className="cotizador-grid">

        {/* ── SIDEBAR ──────────────────────────────────────────────────── */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>

          {/* Cliente */}
          <div style={{ ...panelY, padding: '1.25rem' }}>
            <p style={sectionLabel}><User size={12} /> Cliente</p>
            <div style={{ position: 'relative' }}>
              <input
                className="input input-sm"
                value={searchCliente}
                onChange={e => { setSearchCliente(e.target.value); setShowClienteDropdown(true); if (!e.target.value) setClienteSeleccionado(null); }}
                onFocus={() => setShowClienteDropdown(true)}
                onBlur={() => setTimeout(() => setShowClienteDropdown(false), 200)}
                placeholder="Buscar cliente..."
              />
              {clienteSeleccionado && (
                <div style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)' }}>
                  <Check size={13} color="#4ade80" />
                </div>
              )}
              {showClienteDropdown && clientesFiltrados.length > 0 && (
                <div className="dropdown">
                  {clientesFiltrados.map(c => (
                    <div
                      key={c.id}
                      className="dropdown-item"
                      onMouseDown={() => { setClienteSeleccionado(c); setSearchCliente(c.nombre_cliente); setShowClienteDropdown(false); }}
                    >
                      <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>{c.nombre_cliente}</p>
                      {c.empresa && <p style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{c.empresa}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {clienteSeleccionado && (
              <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg3)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--y)', textTransform: 'uppercase' }}>{clienteSeleccionado.nombre_cliente}</p>
                {clienteSeleccionado.empresa && <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{clienteSeleccionado.empresa}</p>}
                {clienteSeleccionado.rut && <p style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'monospace' }}>RUT: {clienteSeleccionado.rut}</p>}
                {clienteSeleccionado.telefono && <p style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{clienteSeleccionado.telefono}</p>}
              </div>
            )}
          </div>

          {/* Descripción general */}
          <div style={{ ...panelY, padding: '1.25rem', borderTopColor: 'var(--border2)' }}>
            <p style={sectionLabel}><FileText size={12} /> Descripción general</p>
            <textarea
              className="input"
              value={descripcionGeneral}
              onChange={e => setDescripcionGeneral(e.target.value)}
              rows={3}
              placeholder="Descripción del proyecto o trabajo..."
              style={{ resize: 'vertical', fontSize: '0.85rem' }}
            />
          </div>

          {/* Opciones de visualización */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', padding: '1rem' }}>
            <p style={{ ...sectionLabel, marginBottom: '0.6rem' }}><Eye size={12} /> Opciones PDF</p>
            {[
              { label: 'Agrupar suministros (vista cliente)', key: 'ocultarSuministros', val: ocultarSuministros, set: setOcultarSuministros },
              { label: 'Ocultar costos internos', key: 'ocultarCostos', val: ocultarCostos, set: setOcultarCostos },
            ].map(({ label, key, val, set }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{label}</span>
                <button
                  onClick={() => set(!val)}
                  style={{ width: 36, height: 20, background: val ? 'var(--y)' : 'var(--bg3)', border: '1px solid var(--border2)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', borderRadius: 10 }}
                >
                  <span style={{ position: 'absolute', top: 2, left: val ? 18 : 2, width: 14, height: 14, background: val ? '#000' : 'var(--muted)', borderRadius: '50%', transition: 'all 0.2s' }} />
                </button>
              </div>
            ))}
          </div>

          {/* Descuento MO */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', padding: '1rem' }}>
            <p style={sectionLabel}><Settings2 size={12} /> Descuento MO</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="number" min="0" max="100" step="1"
                className="input input-sm"
                value={descuentoPorcentajeMO || ''}
                onChange={e => setDescuentoPorcentajeMO(parseFloat(e.target.value) || 0)}
                placeholder="0"
                style={{ width: '80px' }}
              />
              <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>% sobre mano de obra</span>
            </div>
            {descuentoPorcentajeMO > 0 && (
              <p style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '0.35rem' }}>
                — {formatCLP(totals.montoDescuentoMO)} de descuento
              </p>
            )}
          </div>

          {/* Garantía */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', padding: '1rem' }}>
            <p style={sectionLabel}><Check size={12} /> Garantía</p>
            <textarea
              className="input"
              value={garantia}
              onChange={e => setGarantia(e.target.value)}
              rows={4}
              style={{ resize: 'vertical', fontSize: '0.78rem', lineHeight: 1.6 }}
            />
          </div>

          {/* Condiciones */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', padding: '1rem' }}>
            <p style={sectionLabel}><FileText size={12} /> Condiciones comerciales</p>
            <textarea
              className="input"
              value={condicionesComerciales}
              onChange={e => setCondicionesComerciales(e.target.value)}
              rows={4}
              style={{ resize: 'vertical', fontSize: '0.78rem', lineHeight: 1.6 }}
            />
          </div>
        </aside>

        {/* ── ÁREA PRINCIPAL ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>

          {/* Toolbar de ítems */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderTop: '2px solid var(--y)', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.58rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--y)', marginRight: '0.5rem' }}>
              ÍTEMS ({items.length})
            </span>

            {/* Add buttons */}
            {(['material', 'mano_obra', 'servicio'] as CategoriaItem[]).map(cat => {
              const CatIcon = CAT_ICONS[cat];
              return (
                <button key={cat} onClick={() => addItem(cat)} style={{
                  ...btnGhost, height: 30, fontSize: '0.6rem', padding: '0 0.65rem',
                  color: CAT_COLORS[cat], borderColor: `${CAT_COLORS[cat]}40`,
                }}>
                  <Plus size={11} /><CatIcon size={11} /> {CATEGORIA_LABELS[cat]}
                </button>
              );
            })}

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
              {/* IVA bulk */}
              <button onClick={() => setAllIVA(true)}  style={{ ...btnGhost, height: 28, fontSize: '0.58rem', padding: '0 0.5rem' }}>Todo +IVA</button>
              <button onClick={() => setAllIVA(false)} style={{ ...btnGhost, height: 28, fontSize: '0.58rem', padding: '0 0.5rem' }}>Todo neto</button>
              <button onClick={exportExcel} style={{ ...btnGhost, height: 28, fontSize: '0.58rem', padding: '0 0.5rem' }}>
                <Download size={11} /> XLSX
              </button>
            </div>
          </div>

          {/* Header columnas */}
          {items.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px 90px 80px 80px 90px 100px auto', gap: 2, padding: '0.3rem 0.6rem', background: 'var(--bg3)' }}>
              {['Descripción', 'Cant.', 'Unid.', 'Costo', 'Margen', 'Precio', 'IVA', 'Subtotal', ''].map(h => (
                <span key={h} style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.52rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: h === 'Subtotal' ? 'right' : 'left' }}>{h}</span>
              ))}
            </div>
          )}

          {/* Items */}
          {items.length === 0 ? (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', padding: '3rem', textAlign: 'center' }}>
              <Package size={40} style={{ margin: '0 auto 1rem', opacity: 0.2, display: 'block' }} />
              <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>Sin ítems. Agrega materiales, mano de obra o servicios.</p>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                {(['material', 'mano_obra', 'servicio'] as CategoriaItem[]).map(cat => {
                  const CatIcon = CAT_ICONS[cat];
                  return (
                    <button key={cat} onClick={() => addItem(cat)} style={{ ...btnGhost, height: 38, color: CAT_COLORS[cat], borderColor: `${CAT_COLORS[cat]}40` }}>
                      <Plus size={13} /><CatIcon size={13} /> {CATEGORIA_LABELS[cat]}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              {items.map((item, idx) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  index={idx}
                  total={item.cantidad * item.precio}
                  onUpdate={updateItem}
                  onDelete={deleteItem}
                  onDuplicate={duplicateItem}
                  onMoveUp={i => moveItem(i, 'up')}
                  onMoveDown={i => moveItem(i, 'down')}
                  isFirst={idx === 0}
                  isLast={idx === items.length - 1}
                />
              ))}
            </div>
          )}

          {/* Botón agregar rápido */}
          {items.length > 0 && (
            <button
              onClick={() => addItem('material')}
              style={{ ...btnGhost, width: '100%', justifyContent: 'center', height: 38, borderStyle: 'dashed' }}
            >
              <Plus size={13} /> Agregar ítem
            </button>
          )}

          {/* ── RESUMEN FINANCIERO ── */}
          {items.length > 0 && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderTop: '2px solid var(--y)', padding: '1.25rem', marginTop: '2px' }}>
              <p style={sectionLabel}>Resumen financiero</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* Columna izquierda: desglose */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {[
                    { label: 'Neto Materiales', val: totals.netoMateriales, color: 'var(--y)' },
                    { label: 'IVA Materiales',  val: totals.ivaMateriales,  color: 'var(--muted)' },
                    { label: 'Neto Mano de Obra', val: totals.netoMO,      color: '#60a5fa' },
                    { label: 'Neto Servicios',   val: totals.netoServicios, color: '#a78bfa' },
                    { label: 'IVA Mano de Obra', val: totals.ivaMO,        color: 'var(--muted)' },
                    descuentoPorcentajeMO > 0 && { label: `Descuento MO (${descuentoPorcentajeMO}%)`, val: -totals.montoDescuentoMO, color: '#f87171' },
                  ].filter(Boolean).map((row: any) => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.3rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{row.label}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: row.color }}>
                        {formatCLP(Math.abs(row.val))}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Columna derecha: totales grandes */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '0.5rem', borderLeft: '1px solid var(--border2)', paddingLeft: '1rem' }}>
                  <div>
                    <p style={{ fontSize: '0.65rem', color: 'var(--muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '0.15rem' }}>Total neto</p>
                    <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'rgba(255,255,255,0.7)' }}>{formatCLP(totals.netoGeneral)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.65rem', color: 'var(--muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '0.15rem' }}>IVA (19%)</p>
                    <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'rgba(255,255,255,0.5)' }}>{formatCLP(totals.ivaGeneral)}</p>
                  </div>
                  <div style={{ padding: '0.75rem', background: 'var(--bg3)', borderTop: '2px solid var(--y)' }}>
                    <p style={{ fontSize: '0.6rem', color: 'var(--muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '0.15rem' }}>TOTAL FINAL</p>
                    <p style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(1.4rem,3vw,1.8rem)', color: 'var(--y)' }}>{formatCLP(totals.total)}</p>
                  </div>
                  {!ocultarCostos && totals.utilidadEstimada > 0 && (
                    <div style={{ padding: '0.5rem', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)' }}>
                      <p style={{ fontSize: '0.6rem', color: '#4ade80', fontFamily: 'var(--font-display)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Utilidad estimada</p>
                      <p style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1rem', color: '#4ade80', marginTop: '0.15rem' }}>
                        {formatCLP(totals.utilidadEstimada)} <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>({Math.round(totals.margenPromedio)}%)</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Export con Suspense para useSearchParams ─────────────────────────────────
export default function CotizadorPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <Loader2 size={24} color="var(--y)" className="iv-spin" />
      </div>
    }>
      <CotizadorContent />
    </Suspense>
  );
}
