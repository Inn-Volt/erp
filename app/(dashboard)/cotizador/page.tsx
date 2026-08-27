/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useMemo, useRef, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus, Trash2, Save, FileText, History, User, Download,
  Loader2, RefreshCcw, Check, FileUp,
  Copy, Package, Settings2, X, ArrowUp, ArrowDown,
  Building2, ChevronDown, Pencil, Handshake, HardHat, BrickWall,
  Calculator, Truck, Library, Sparkles,
} from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

import { supabase } from '@/lib/supabase';
import { clientesService } from '@/services/clientes';
import { cotizacionesService } from '@/services/cotizaciones';
import { useToast } from '@/hooks/useToast';
import {
  formatCLP, formatMoneda, redondearMoneda, formatFolio, cleanNumber, calcularTotals, calcularItem,
  newItem, newId, normalizarItem, precioDesdeMargen,
  margenDesdePrecio, itemsToExcelRows, parseCategoria,
  calcularPartida, partidaDesdeReceta,
} from '@/utils';
import type { CotizacionItem, Cliente, CategoriaItem, Supuestos, Moneda, Partida, RecetaConComponentes, PartidaIAResuelta } from '@/types';
import {
  CATEGORIA_LABELS, CATEGORIAS_ORDEN, CATEGORIA_COLORS,
  SUPUESTOS_DEFAULT, UNIDADES,
} from '@/types';
import PresupuestoPDF from '@/components/pdf/PresupuestoPDF';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import ListadoInternoPDF from '@/components/pdf/ListadoInternoPDF';
import EmpresaModal from '@/components/EmpresaModal';
import CalculadoraHH from '@/components/CalculadoraHH';
import BuscadorBiblioteca from '@/components/BuscadorBiblioteca';
import CotizarIAModal from '@/components/CotizarIAModal';
import { DescripcionModal, OpcionesModal } from '@/components/CotizadorModales';

// ─── Estilos base ─────────────────────────────────────────────────────────────
const panelY: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border2)', borderTop: '2px solid var(--y-brand)',
};
const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.58rem',
  letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--y)',
  display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem',
};
const btnGhost: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--muted)',
  cursor: 'pointer', padding: '0 0.875rem', height: 36,
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.68rem',
  letterSpacing: '0.12em', textTransform: 'uppercase',
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
};

const GARANTIA_DEFAULT =
  '• Garantía: 6 meses sobre la mano de obra instalada.\n• La garantía no cubre fallas por mal uso, sobrecargas o intervención de terceros.\n• Materiales: La garantía de los componentes es responsabilidad del fabricante.';
const CONDICIONES_DEFAULT =
  '• Validez de la oferta: 15 días corridos.\n• Forma de Pago: 50% anticipo al inicio y 50% al finalizar conforme.\n• Medios de pago: Transferencia electrónica o efectivo.';

const CAT_COLORS = CATEGORIA_COLORS;
const CAT_ICONS: Record<CategoriaItem, React.ElementType> = {
  material: BrickWall, mano_obra: HardHat, servicio: Handshake, operacion: Truck,
};

// ─── Empresa Selector ─────────────────────────────────────────────────────────
function EmpresaSelector({
  empresas, selected, onSelect, onNew, onEdit,
}: {
  empresas: EmpresaInfo[];
  selected: EmpresaInfo | null;
  onSelect: (e: EmpresaInfo) => void;
  onNew: () => void;
  onEdit: (e: EmpresaInfo) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ ...panelY, padding: '1rem', borderRadius: 'var(--r)' }}>
      <p style={sectionLabel}><Building2 size={12} /> Empresa Emisora</p>

      {/* Dropdown selector */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            width: '100%', background: 'var(--input-bg)',
            border: '1px solid var(--input-border)', color: selected ? 'var(--text)' : 'var(--faint)',
            padding: '0.5rem 0.7rem', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: '0.82rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderRadius: 'var(--r)',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected ? selected.nombre : 'Seleccionar empresa...'}
          </span>
          <ChevronDown size={14} style={{ flexShrink: 0, marginLeft: '0.4rem', opacity: 0.5 }} />
        </button>

        {open && (
          <div
            style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              background: 'var(--bg3)', border: '1px solid var(--border2)',
              zIndex: 50, maxHeight: 200, overflowY: 'auto',
              borderRadius: '0 0 var(--r) var(--r)',
            }}
            onBlur={() => setOpen(false)}
          >
            {empresas.length === 0 && (
              <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'center' }}>
                Sin empresas registradas
              </div>
            )}
            {empresas.map(emp => (
              <div
                key={emp.id}
                onClick={() => { onSelect(emp); setOpen(false); }}
                style={{
                  padding: '0.55rem 0.75rem', cursor: 'pointer',
                  borderBottom: '1px solid var(--border-soft)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: selected?.id === emp.id ? 'var(--y-soft)' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = selected?.id === emp.id ? 'var(--y-soft)' : 'transparent')}
              >
                <div>
                  <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600 }}>{emp.nombre}</p>
                  <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--muted)' }}>RUT: {emp.rut}</p>
                </div>
                {selected?.id === emp.id && <Check size={13} color="var(--y)" />}
              </div>
            ))}
            {/* Nueva empresa */}
            <div
              onClick={() => { onNew(); setOpen(false); }}
              style={{
                padding: '0.55rem 0.75rem', cursor: 'pointer',
                borderTop: '1px solid var(--border2)',
                color: 'var(--y)', fontSize: '0.78rem',
                fontFamily: 'var(--font-display)', fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: '0.4rem',
              }}
            >
              <Plus size={12} /> Nueva empresa
            </div>
          </div>
        )}
      </div>

      {/* Info de la empresa seleccionada */}
      {selected && (
        <div style={{
          marginTop: '0.6rem', padding: '0.6rem 0.75rem',
          background: 'var(--bg3)', borderRadius: 'var(--r-sm)',
          display: 'flex', flexDirection: 'column', gap: '0.2rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
            <div style={{ minWidth: 0 }}>
              {selected.logo_url && (
                <img
                  src={selected.logo_url}
                  alt="Logo"
                  style={{
                    height: 30, maxWidth: 120, objectFit: 'contain',
                    display: 'block', marginBottom: '0.4rem',
                  }}
                />
              )}
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', color: 'var(--y)', textTransform: 'uppercase', margin: 0 }}>
                {selected.nombre}
              </p>
              {selected.slogan && <p style={{ fontSize: '0.68rem', color: 'var(--muted)', margin: '0.1rem 0 0' }}>{selected.slogan}</p>}
              <p style={{ fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'monospace', margin: '0.1rem 0 0' }}>
                RUT: {selected.rut}
              </p>
              {selected.telefono && <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '0.1rem 0 0' }}>{selected.telefono}</p>}
              {selected.email    && <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '0.1rem 0 0' }}>{selected.email}</p>}
            </div>
            <button
              onClick={() => onEdit(selected)}
              style={{
                background: 'none', border: '1px solid var(--border2)',
                cursor: 'pointer', color: 'var(--muted)',
                padding: '0.25rem 0.5rem', borderRadius: 'var(--r-sm)',
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                fontSize: '0.6rem', fontFamily: 'var(--font-display)',
                fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              <Pencil size={10} /> Editar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente PDF Modal ─────────────────────────────────────────────────────
function PDFModal({
  folio, cliente, items, totals, descuentoPorcentajeMO,
  descripcionGeneral, garantia, condicionesComerciales,
  ocultarSuministros, empresa, moneda, valorUF, partidas, mostrarDetalle, onClose,
}: {
  folio: number; cliente: any; items: CotizacionItem[];
  totals: ReturnType<typeof calcularTotals>; descuentoPorcentajeMO: number;
  descripcionGeneral: string; garantia: string; condicionesComerciales: string;
  ocultarSuministros: boolean; empresa: EmpresaInfo; moneda: Moneda; valorUF: number;
  partidas: Partida[]; mostrarDetalle: boolean; onClose: () => void;
}) {
  const [gen, setGen] = useState(false);
  const folioStr = formatFolio(folio);
  const fmt = (v: number) => formatMoneda(v, moneda);

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
            empresa={empresa} moneda={moneda} valorUF={valorUF}
            partidas={partidas} mostrarDetalle={mostrarDetalle}
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
            empresa={empresa}
          />
        ).toBlob();
        saveAs(blob, `Interno_${folioStr}.pdf`);
      }
    } catch (e) { console.error(e); }
    finally { setGen(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 420, width: '90%', margin: '0 auto' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={sectionLabel as any}><Download size={13} /> Generar PDF</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ background: 'var(--bg3)', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1rem', color: 'var(--y)' }}>{folioStr}</p>
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.15rem' }}>{cliente.nombre_cliente}</p>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.2rem', color: 'var(--text)', marginTop: '0.25rem' }}>{fmt(totals.total)}</p>
            </div>
            <div style={{ width: 36, height: 36, background: 'rgba(74,222,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={18} color="var(--success)" />
            </div>
          </div>

          {/* Info empresa emisora */}
          <div style={{ background: 'var(--y-soft)', border: '1px solid var(--border)', padding: '0.6rem 0.8rem', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {empresa.logo_url && (
              <img src={empresa.logo_url} alt="" style={{ height: 22, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
            )}
            <div>
              <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: 'var(--y)', fontFamily: 'var(--font-display)' }}>{empresa.nombre}</p>
              <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--muted)' }}>RUT {empresa.rut}</p>
            </div>
          </div>

          <button onClick={() => download('cliente')} disabled={gen} style={{ ...btnGhost, width: '100%', justifyContent: 'center', height: 44, borderColor: 'rgba(74,222,128,0.3)', color: 'var(--success)' }}>
            {gen ? <Loader2 size={14} className="iv-spin" /> : <FileText size={14} />}
            PDF Cliente (con IVA)
          </button>
          <button onClick={() => download('interno')} disabled={gen} style={{ ...btnGhost, width: '100%', justifyContent: 'center', height: 44 }}>
            {gen ? <Loader2 size={14} className="iv-spin" /> : <Package size={14} />}
            Solicitud de materiales (proveedor)
          </button>
          <div className="iv-divider" />
          <button onClick={onClose} style={{ ...btnGhost, width: '100%', justifyContent: 'center' }}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Item Row ─────────────────────────────────────────────────────────────────
function ItemRow({ item, index, onUpdate, onDelete, onDuplicate, onMoveUp, onMoveDown, isFirst, isLast, ocultarCostos, moneda }: {
  item: CotizacionItem; index: number;
  onUpdate: (i: number, u: Partial<CotizacionItem>) => void;
  onDelete: (i: number) => void;
  onDuplicate: (i: number) => void;
  onMoveUp: (i: number) => void;
  onMoveDown: (i: number) => void;
  isFirst: boolean; isLast: boolean; ocultarCostos: boolean; moneda: Moneda;
}) {
  const CatIcon = CAT_ICONS[item.categoria];
  const [isEditingCosto, setIsEditingCosto] = useState(false);
  const [isEditingPrecio, setIsEditingPrecio] = useState(false);
  const calc = useMemo(() => calcularItem(item), [item]);
  /** Formatea según la moneda de la cotización (CLP o UF). */
  const fmt = (v: number) => formatMoneda(v, moneda);

  // Cadena del Excel: costo → (1+imprevistos) → ÷(1−margen) → ×(1+IVA)
  // El redondeo respeta la moneda: CLP a peso entero, UF a 2 decimales.
  const handleCostoChange = (v: string) => {
    const costo = cleanNumber(v);
    const precio = precioDesdeMargen(costo, item.margen, item.imprevistos);
    onUpdate(index, { costo, precio: redondearMoneda(precio, moneda) });
  };
  const handleImprevistosChange = (v: string) => {
    const imprevistos = parseFloat(v) || 0;
    const precio = precioDesdeMargen(item.costo || 0, item.margen, imprevistos);
    onUpdate(index, { imprevistos, precio: redondearMoneda(precio, moneda) });
  };
  const handleMargenChange = (v: string) => {
    const margen = parseFloat(v) || 0;
    const precio = precioDesdeMargen(item.costo || 0, margen, item.imprevistos);
    onUpdate(index, { margen, precio: redondearMoneda(precio, moneda) });
  };
  const handlePrecioChange = (v: string) => {
    const precio = cleanNumber(v);
    const margen = margenDesdePrecio(item.costo || 0, precio, item.imprevistos);
    onUpdate(index, { precio, margen: Math.round(margen * 10) / 10 });
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)',
    fontFamily: 'var(--font-body)', fontSize: '0.85rem',
    padding: '0.45rem 0.5rem', outline: 'none', width: '100%',
    textAlign: 'right', transition: 'all 0.15s ease', borderRadius: 'var(--r)',
  };

  return (
    <div className="iv-item-row" style={{
      background: 'var(--bg3)', borderLeft: `4px solid ${CAT_COLORS[item.categoria]}`,
      marginBottom: '6px', display: 'flex', flexDirection: 'column', gap: 0,
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)', borderRadius: 'var(--r)',
    }}>
      <div className="iv-item-grid-container">
        <div className="cell-desc" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CatIcon size={14} color={CAT_COLORS[item.categoria]} style={{ flexShrink: 0, opacity: 0.8 }} />
          <input
            value={item.descripcion}
            onChange={e => onUpdate(index, { descripcion: e.target.value })}
            placeholder="Descripción del ítem o servicio..."
            className="input-row-focus"
            style={{ ...inputStyle, textAlign: 'left', fontSize: '0.88rem', background: 'transparent', border: 'none', paddingLeft: 0 }}
          />
        </div>

        <div className="iv-item-inputs-group">
          <div className="input-field-wrapper min-w-50">
            <span className="mobile-label">Cant.</span>
            <input type="number" min="0" step="0.01" value={item.cantidad || ''} onChange={e => onUpdate(index, { cantidad: parseFloat(e.target.value) || 0 })} className="no-spin-arrows input-row-focus" style={{ ...inputStyle, textAlign: 'center', fontWeight: 'bold' }} placeholder="0" />
          </div>
          <div className="input-field-wrapper min-w-60">
            <span className="mobile-label">Unid.</span>
            <select value={item.unidad} onChange={e => onUpdate(index, { unidad: e.target.value })} className="input-row-focus" style={{ ...inputStyle, cursor: 'pointer', textAlign: 'center', padding: '0.45rem 0.2rem' }}>
              {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          {!ocultarCostos && (
            <div className="input-field-wrapper">
              <span className="mobile-label">Costo Unit.</span>
              <input type={isEditingCosto ? 'number' : 'text'} className="no-spin-arrows input-row-focus" value={isEditingCosto ? (item.costo || '') : fmt(item.costo || 0)} onChange={e => handleCostoChange(e.target.value)} onFocus={() => setIsEditingCosto(true)} onBlur={() => setIsEditingCosto(false)} placeholder="$ 0" style={{ ...inputStyle, color: 'var(--muted)', fontSize: '0.8rem' }} />
            </div>
          )}
          {!ocultarCostos && (
            <div className="input-field-wrapper min-w-55">
              <span className="mobile-label">Imprev.</span>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: '100%' }}>
                <input type="number" min="0" max="100" step="1" value={item.imprevistos ?? ''} onChange={e => handleImprevistosChange(e.target.value)} className="no-spin-arrows input-row-focus" placeholder="0" style={{ ...inputStyle, paddingRight: '1.1rem', color: 'var(--orange)', fontWeight: '500' }} title="% de imprevistos / contingencia" />
                <span style={{ fontSize: '0.7rem', color: 'var(--orange)', position: 'absolute', right: '0.4rem', pointerEvents: 'none' }}>%</span>
              </div>
            </div>
          )}
          {!ocultarCostos && (
            <div className="input-field-wrapper min-w-55">
              <span className="mobile-label">Margen</span>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: '100%' }}>
                <input type="number" min="0" max="99" step="1" value={item.margen || ''} onChange={e => handleMargenChange(e.target.value)} className="no-spin-arrows input-row-focus" placeholder="30" style={{ ...inputStyle, paddingRight: '1.1rem', color: 'var(--purple)', fontWeight: '500' }} />
                <span style={{ fontSize: '0.7rem', color: 'var(--purple)', position: 'absolute', right: '0.4rem', pointerEvents: 'none' }}>%</span>
              </div>
            </div>
          )}
          <div className="input-field-wrapper">
            <span className="mobile-label">Precio Venta</span>
            <input type={isEditingPrecio ? 'number' : 'text'} className="no-spin-arrows input-row-focus" value={isEditingPrecio ? (item.precio || '') : fmt(item.precio || 0)} onChange={e => handlePrecioChange(e.target.value)} onFocus={() => setIsEditingPrecio(true)} onBlur={() => setIsEditingPrecio(false)} placeholder="$ 0" style={{ ...inputStyle, color: 'var(--y)', fontWeight: '700' }} />
          </div>
          <div className="input-field-wrapper min-w-55">
            <span className="mobile-label">Desc.</span>
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: '100%' }}>
              <input type="number" min="0" max="100" step="1" value={item.descuento || ''} onChange={e => onUpdate(index, { descuento: parseFloat(e.target.value) || 0 })} className="no-spin-arrows input-row-focus" placeholder="0" style={{ ...inputStyle, paddingRight: '1.1rem', color: 'var(--danger)', fontWeight: '500' }} title="% de descuento de esta línea" />
              <span style={{ fontSize: '0.7rem', color: 'var(--danger)', position: 'absolute', right: '0.4rem', pointerEvents: 'none' }}>%</span>
            </div>
          </div>
          <div className="input-field-wrapper min-w-65">
            <span className="mobile-label">IVA</span>
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: '100%' }}>
              <input type="number" min="0" max="100" step="1" value={item.iva ?? ''} onChange={e => onUpdate(index, { iva: parseFloat(e.target.value) || 0 })} className="no-spin-arrows input-row-focus" placeholder="0" style={{ ...inputStyle, paddingRight: '1.1rem', color: 'var(--info)', fontWeight: '500' }} title="% de IVA aplicado a este ítem" />
              <span style={{ fontSize: '0.7rem', color: 'var(--info)', position: 'absolute', right: '0.4rem', pointerEvents: 'none' }}>%</span>
            </div>
          </div>
          <div className="input-field-wrapper cell-subtotal">
            <span className="mobile-label">Subtotal</span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', textAlign: 'right', display: 'block', padding: '0.45rem 0' }}>
              {fmt(calc.precioVenta)}
            </span>
            {(item.descuento || 0) > 0 && (
              <span style={{ fontSize: '0.6rem', color: 'var(--danger)', textAlign: 'right', display: 'block' }}>−{fmt(calc.montoDescuento)}</span>
            )}
          </div>
        </div>

        <div className="cell-actions">
          <button onClick={() => onMoveUp(index)}   disabled={isFirst} title="Subir" style={{ background: 'none', border: 'none', cursor: isFirst ? 'default' : 'pointer', color: isFirst ? 'var(--faint)' : 'var(--faint)', padding: '4px' }}><ArrowUp size={12} /></button>
          <button onClick={() => onMoveDown(index)} disabled={isLast}  title="Bajar" style={{ background: 'none', border: 'none', cursor: isLast ? 'default' : 'pointer', color: isLast ? 'var(--faint)' : 'var(--faint)', padding: '4px' }}><ArrowDown size={12} /></button>
          <button onClick={() => onDuplicate(index)} title="Duplicar"  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', padding: '4px' }}><Copy size={12} /></button>
          <button onClick={() => onDelete(index)}    title="Eliminar"  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(248,113,113,0.5)', padding: '4px' }}><Trash2 size={12} /></button>
        </div>
      </div>

      {/* Selector categoría + desglose de costeo */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '0.5rem', padding: '0 0.75rem 0.5rem', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: '1px' }}>
          {CATEGORIAS_ORDEN.map(cat => (
            <button key={cat} onClick={() => onUpdate(index, { categoria: cat })}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem 0.5rem',
                fontSize: '0.6rem', fontFamily: 'var(--font-display)', fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: item.categoria === cat ? CAT_COLORS[cat] : 'var(--faint)',
                transition: 'all 0.1s ease',
              }}
            >
              {CATEGORIA_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Trazabilidad del cálculo (igual al Excel) */}
        {!ocultarCostos && item.costo > 0 && (
          <span style={{
            fontSize: '0.6rem', color: 'var(--muted)', fontFamily: 'monospace',
            display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap',
          }}>
            <span title="Costo total">{fmt(calc.costoTotal)}</span>
            <span style={{ opacity: 0.4 }}>→</span>
            <span title="Costo con imprevistos" style={{ color: 'var(--orange)' }}>{fmt(calc.costoConImprev)}</span>
            <span style={{ opacity: 0.4 }}>→</span>
            <span title="Precio de venta neto" style={{ color: 'var(--y)' }}>{fmt(calc.precioVenta)}</span>
            {item.iva > 0 && (
              <>
                <span style={{ opacity: 0.4 }}>→</span>
                <span title={`Con IVA ${item.iva}%`} style={{ color: 'var(--info)' }}>{fmt(calc.precioConIva)}</span>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Tarjeta de Partida de Proyecto ───────────────────────────────────────────
function PartidaCard({
  partida, itemsPartida, indexOf,
  onUpdatePartida, onDeletePartida, onSetMargen, onAddItem, onBuscar, onCalcHH,
  updateItem, deleteItem, duplicateItem, moveItem,
  moneda, ocultarCostos, fmt,
}: {
  partida: Partida;
  itemsPartida: CotizacionItem[];
  indexOf: (id: string) => number;
  onUpdatePartida: (id: string, patch: Partial<Partida>) => void;
  onDeletePartida: (id: string) => void;
  onSetMargen: (id: string, cfg: { margen: number; imprevistos: number; iva: number }) => void;
  onAddItem: (id: string, categoria: CategoriaItem) => void;
  onBuscar: (id: string) => void;
  onCalcHH: (id: string) => void;
  updateItem: (i: number, u: Partial<CotizacionItem>) => void;
  deleteItem: (i: number) => void;
  duplicateItem: (i: number) => void;
  moveItem: (i: number, dir: 'up' | 'down') => void;
  moneda: Moneda;
  ocultarCostos: boolean;
  fmt: (v: number) => string;
}) {
  const calc = useMemo(() => calcularPartida(itemsPartida), [itemsPartida]);
  const modo = partida.modoPrecio || 'items';
  const inp: React.CSSProperties = { background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: 'var(--r-sm)', padding: '0.4rem 0.5rem', outline: 'none', fontSize: '0.85rem' };

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderLeft: '3px solid var(--y-brand)', borderRadius: 'var(--r)', padding: '0.85rem', marginBottom: '8px' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.55rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--y)' }}>Partida de proyecto</span>
          <input value={partida.nombre} onChange={e => onUpdatePartida(partida.id, { nombre: e.target.value })} placeholder="Nombre comercial (ej. Habilitación de tableros)"
            style={{ ...inp, width: '100%', fontWeight: 700, fontSize: '0.95rem', marginTop: '0.2rem' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.4rem' }}>
          <div>
            <span style={{ display: 'block', fontSize: '0.55rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.15rem' }}>Cantidad</span>
            <input type="number" min="0" step="1" value={partida.cantidad || ''} onChange={e => onUpdatePartida(partida.id, { cantidad: parseFloat(e.target.value) || 0 })}
              className="no-spin-arrows" style={{ ...inp, width: 70, textAlign: 'center', fontWeight: 700 }} />
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '0.55rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.15rem' }}>Unidad</span>
            <select value={partida.unidad} onChange={e => onUpdatePartida(partida.id, { unidad: e.target.value })} style={{ ...inp, cursor: 'pointer' }}>
              {['local', 'un', 'global', 'm²', 'depto', 'piso', 'mes'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <button onClick={() => onDeletePartida(partida.id)} title="Eliminar partida (y sus materiales)" style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--r-sm)', color: 'var(--danger)', cursor: 'pointer', padding: '0.4rem', height: 34 }}><Trash2 size={13} /></button>
        </div>
      </div>

      {/* Descripción comercial (lo que ve el cliente) */}
      <textarea value={partida.descripcion || ''} onChange={e => onUpdatePartida(partida.id, { descripcion: e.target.value })} rows={2}
        placeholder="Descripción comercial: suministro, montaje, alcance… (lo que ve el cliente)"
        style={{ ...inp, width: '100%', resize: 'vertical', lineHeight: 1.45, marginBottom: '0.6rem' }} />

      {/* Modo de precio (interno) */}
      {!ocultarCostos && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Precio</span>
          <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
            {(['items', 'margen'] as const).map(m => (
              <button key={m}
                onClick={() => m === 'margen'
                  ? onSetMargen(partida.id, { margen: partida.margen ?? 30, imprevistos: partida.imprevistos ?? 0, iva: partida.iva ?? 19 })
                  : onUpdatePartida(partida.id, { modoPrecio: 'items' })}
                style={{ background: modo === m ? 'var(--y-brand)' : 'transparent', color: modo === m ? 'var(--on-accent)' : 'var(--muted)', border: 'none', cursor: 'pointer', padding: '0.3rem 0.6rem', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {m === 'items' ? 'Por ítem' : 'Margen único'}
              </button>
            ))}
          </div>
          {modo === 'margen' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {([['margen', 'Margen', 'var(--purple)'], ['imprevistos', 'Imprev.', 'var(--orange)'], ['iva', 'IVA', 'var(--info)']] as const).map(([k, lbl, col]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.6rem', color: col }}>
                  {lbl}
                  <input type="number" min="0" max="100" value={partida[k] ?? 0}
                    onChange={e => {
                      const v = parseFloat(e.target.value) || 0;
                      const cfg = { margen: partida.margen ?? 30, imprevistos: partida.imprevistos ?? 0, iva: partida.iva ?? 19 };
                      onSetMargen(partida.id, { ...cfg, [k]: v });
                    }}
                    className="no-spin-arrows" style={{ ...inp, width: 46, padding: '0.25rem', textAlign: 'center', color: col }} />%
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ítems internos de la partida */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {itemsPartida.length === 0 ? (
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', padding: '0.4rem 0' }}>Sin materiales aún. Agrégalos desde la biblioteca o con los botones de abajo.</p>
        ) : itemsPartida.map(it => (
          <ItemRow key={it.id} item={it} index={indexOf(it.id)}
            onUpdate={updateItem} onDelete={deleteItem} onDuplicate={duplicateItem}
            onMoveUp={i => moveItem(i, 'up')} onMoveDown={i => moveItem(i, 'down')}
            isFirst={false} isLast={false} ocultarCostos={ocultarCostos} moneda={moneda} />
        ))}
      </div>

      {/* Acciones para agregar a la partida */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '0.4rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.5rem', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginRight: '0.1rem' }}>Agregar</span>
        {CATEGORIAS_ORDEN.map(cat => {
          const CatIcon = CAT_ICONS[cat];
          return (
            <button key={cat} onClick={() => onAddItem(partida.id, cat)} style={{ ...btnGhost, height: 28, fontSize: '0.56rem', padding: '0 0.5rem', color: CAT_COLORS[cat], borderColor: `${CAT_COLORS[cat]}33` }}>
              <Plus size={10} /><CatIcon size={10} /> {CATEGORIA_LABELS[cat]}
            </button>
          );
        })}
        <button onClick={() => onCalcHH(partida.id)} title="Calcular mano de obra por horas hombre" style={{ ...btnGhost, height: 28, fontSize: '0.56rem', padding: '0 0.5rem', color: 'var(--success)' }}><Calculator size={10} /> HH</button>
        <button onClick={() => onBuscar(partida.id)} style={{ ...btnGhost, height: 28, fontSize: '0.56rem', padding: '0 0.5rem', color: 'var(--y)' }}><Library size={11} /> Biblioteca</button>
      </div>

      {/* Panel interno / resumen de la partida */}
      <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        {!ocultarCostos ? (
          <span style={{ fontSize: '0.62rem', color: 'var(--muted)', fontFamily: 'monospace', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span>mat {fmt(calc.costoMateriales)}</span>
            <span style={{ color: 'var(--info)' }}>MO {fmt(calc.costoManoObra)}</span>
            <span>otros {fmt(calc.costoOtros)}</span>
            <span style={{ color: 'var(--success)' }}>util {fmt(calc.utilidad)} ({Math.round(calc.margenEfectivo)}%)</span>
          </span>
        ) : <span />}
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--y)' }}>
          {fmt(calc.neto)} <span style={{ fontSize: '0.6rem', color: 'var(--muted)', fontWeight: 400 }}>neto{calc.iva > 0 ? ` + IVA ${fmt(calc.iva)}` : ''}</span>
        </span>
      </div>
    </div>
  );
}

// ─── Contenido principal ──────────────────────────────────────────────────────
function CotizadorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { success, error: toastError, warning } = useToast();

  const editId        = searchParams.get('edit');
  const cloneId       = searchParams.get('clone');
  const clienteParam  = searchParams.get('cliente');
  const fileInputRef  = useRef<HTMLInputElement>(null);

  // ── Estado formulario ──
  const [loading,                setLoading]                = useState(false);
  const [folioGenerado,          setFolioGenerado]          = useState<number | null>(null);
  const [proximoFolio,           setProximoFolio]           = useState<number | null>(null);
  const [clientes,               setClientes]               = useState<Cliente[]>([]);
  const [searchCliente,          setSearchCliente]          = useState('');
  const [showClienteDropdown,    setShowClienteDropdown]    = useState(false);
  const [clienteSeleccionado,    setClienteSeleccionado]    = useState<Cliente | null>(null);
  const [items,                  setItems]                  = useState<CotizacionItem[]>([]);
  const [descripcionGeneral,     setDescripcionGeneral]     = useState('');
  const [descuentoPorcentajeMO,  setDescuentoPorcentajeMO] = useState(0);
  const [ocultarSuministros,     setOcultarSuministros]     = useState(false);
  const [ocultarCostos,          setOcultarCostos]          = useState(false);
  const [garantia,               setGarantia]               = useState(GARANTIA_DEFAULT);
  const [condicionesComerciales, setCondicionesComerciales] = useState(CONDICIONES_DEFAULT);
  // Textos por defecto tomados de Configuración (si existen). Se usan al crear
  // una cotización nueva y al limpiar el formulario.
  const [defGarantia,            setDefGarantia]            = useState(GARANTIA_DEFAULT);
  const [defCondiciones,         setDefCondiciones]         = useState(CONDICIONES_DEFAULT);
  const [showPDFModal,           setShowPDFModal]           = useState(false);
  const [supuestos,              setSupuestos]              = useState<Supuestos>({ ...SUPUESTOS_DEFAULT });
  const [showHHModal,            setShowHHModal]            = useState(false);
  const [showBiblioteca,         setShowBiblioteca]         = useState(false);
  const [showIA,                 setShowIA]                 = useState(false);
  const [showDescripcion,        setShowDescripcion]        = useState(false);
  const [showOpciones,           setShowOpciones]           = useState(false);
  const [moneda,                 setMoneda]                 = useState<Moneda>('CLP');
  const [valorUF,                setValorUF]                = useState(0);
  const [cargandoUF,             setCargandoUF]             = useState(false);
  const [partidas,               setPartidas]               = useState<Partida[]>([]);
  const [mostrarDetalle,         setMostrarDetalle]         = useState(false);
  // Si al abrir la biblioteca hay una partida destino, lo insertado se le asocia.
  const [partidaDestino,         setPartidaDestino]         = useState<string | null>(null);
  // Partida destino al calcular HH (si viene desde una partida).
  const [hhDestino,              setHhDestino]              = useState<string | null>(null);

// ── Estado empresa ──
const [empresas, setEmpresas] = useState<EmpresaInfo[]>([]);
const [empresaSelec, setEmpresaSelec] = useState<EmpresaInfo | null>(null);
const [showEmpresaModal, setShowEmpresaModal] = useState(false);
const [empresaEditing, setEmpresaEditing] = useState<EmpresaInfo | null>(null);
  // ── Cargar datos iniciales ──
  useEffect(() => {
    loadInitialData();
    if (editId)       cargarDatosEdicion(editId, false);
    else if (cloneId) cargarDatosEdicion(cloneId, true);
    else              obtenerUltimoFolio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, cloneId]);

  async function loadInitialData() {
    // loadEmpresas ya guarda las empresas en su propio estado
    const [dataClientes] = await Promise.all([
      clientesService.getAll(),
      loadEmpresas(),
      cargarDefaultsConfig(),
    ]);
    setClientes(dataClientes);
    if (clienteParam) {
      const c = dataClientes.find((x: Cliente) => x.id === clienteParam);
      if (c) { setClienteSeleccionado(c); setSearchCliente(c.nombre_cliente); }
    }
  }

  /**
   * Trae los textos por defecto de la página Configuración y, SOLO para
   * cotizaciones nuevas (no al editar/clonar), los usa como garantía y
   * condiciones iniciales. Así lo que se edita en Configuración sí tiene efecto.
   */
  async function cargarDefaultsConfig() {
    try {
      const { data } = await supabase
        .from('configuracion_empresa')
        .select('garantia_default, condiciones_default')
        .limit(1).single();
      if (!data) return;
      if (data.garantia_default)     setDefGarantia(data.garantia_default);
      if (data.condiciones_default)  setDefCondiciones(data.condiciones_default);
      if (!editId && !cloneId) {
        if (data.garantia_default)    setGarantia(data.garantia_default);
        if (data.condiciones_default) setCondicionesComerciales(data.condiciones_default);
      }
    } catch { /* sin config: se usan los textos por defecto del código */ }
  }

  async function loadEmpresas(): Promise<EmpresaInfo[]> {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .order('nombre');
      if (error) throw error;
      const list = (data || []) as EmpresaInfo[];
      setEmpresas(list);
      // Auto-seleccionar la primera si no hay ninguna seleccionada
      if (list.length > 0 && !empresaSelec) {
        setEmpresaSelec(list[0]);
      }
      return list;
    } catch {
      return [];
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
      // Supuestos guardados con la cotización (o los del Excel por defecto)
      const sup: Supuestos = { ...SUPUESTOS_DEFAULT, ...(cot.supuestos || {}) };
      setSupuestos(sup);
      // Normaliza ítems antiguos (sin imprevistos/IVA %) sin alterar sus precios
      setItems((cot.items || []).map((item: any) => normalizarItem(item, sup)));
      setDescripcionGeneral(cot.descripcion_general || '');
      setDescuentoPorcentajeMO(cot.descuento_global || 0);
      if (cot.condiciones_servicio)    setGarantia(cot.condiciones_servicio);
      if (cot.condiciones_comerciales) setCondicionesComerciales(cot.condiciones_comerciales);
      setOcultarSuministros(cot.ocultar_suministros ?? false);
      setMoneda((cot.moneda as Moneda) || 'CLP');
      setValorUF(cot.valor_uf || 0);
      setPartidas(cot.partidas || []);
      setMostrarDetalle(cot.mostrar_detalle ?? false);
      // Restaurar la empresa emisora original (si la cotización la guardó)
      if (cot.empresa_id) {
        const lista = await loadEmpresas();
        const emp = lista.find(e => e.id === cot.empresa_id);
        if (emp) setEmpresaSelec(emp);
      }
      if (!isCloning) setFolioGenerado(cot.folio);
      else            obtenerUltimoFolio();
    }
    setLoading(false);
  }

  const totals = useMemo(() => calcularTotals(items, descuentoPorcentajeMO), [items, descuentoPorcentajeMO]);

  /** Formatea un monto en la moneda seleccionada (CLP o UF). */
  const fmt = useCallback((v: number) => formatMoneda(v, moneda), [moneda]);

  // ── Agrupación por partidas (los ítems viven en el arreglo plano `items`) ──
  const idxById = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((it, i) => m.set(it.id, i));
    return m;
  }, [items]);
  const indexOf = useCallback((id: string) => idxById.get(id) ?? -1, [idxById]);
  const itemsSueltos = useMemo(() => items.filter(i => !i.partidaId), [items]);
  const itemsDe = useCallback((pid: string) => items.filter(i => i.partidaId === pid), [items]);

  /** Trae el valor de la UF de hoy desde mindicador.cl (API pública, sin key). */
  const traerUF = useCallback(async () => {
    setCargandoUF(true);
    try {
      const res = await fetch('https://mindicador.cl/api/uf');
      const data = await res.json();
      const val = Math.round((data?.serie?.[0]?.valor || 0));
      if (val > 0) { setValorUF(val); success(`UF de hoy: ${formatCLP(val)}`); }
      else warning('No se pudo obtener la UF; ingrésala manualmente.');
    } catch {
      warning('No se pudo obtener la UF; ingrésala manualmente.');
    } finally {
      setCargandoUF(false);
    }
  }, [success, warning]);

  const addItem = useCallback((categoria: CategoriaItem = 'material') => {
    // Se agrega AL FINAL (donde están los botones), para que aparezca justo
    // donde hiciste clic y la vista no salte hacia arriba.
    setItems(prev => [...prev, newItem({ categoria }, supuestos)]);
  }, [supuestos]);

  /** Inserta ítems del catálogo (a una partida destino si hay, o sueltos). */
  const insertarDesdeBiblioteca = useCallback((nuevos: CotizacionItem[], mensaje: string) => {
    if (nuevos.length === 0) return;
    const conPartida = partidaDestino ? nuevos.map(i => ({ ...i, partidaId: partidaDestino })) : nuevos;
    setItems(prev => [...prev, ...conPartida]);
    setShowBiblioteca(false);
    setPartidaDestino(null);
    success(mensaje);
  }, [success, partidaDestino]);

  /** Inserta una receta: como partida nueva, o dentro de la partida destino. */
  const insertarReceta = useCallback((receta: RecetaConComponentes, cantidad: number) => {
    if (partidaDestino) {
      const { items: nuevos } = partidaDesdeReceta(receta, cantidad, supuestos);
      const conPartida = nuevos.map(i => ({ ...i, partidaId: partidaDestino }));
      setItems(prev => [...prev, ...conPartida]);
      success(`${nuevos.length} materiales agregados a la partida`);
    } else {
      const { partida, items: nuevos } = partidaDesdeReceta(receta, cantidad, supuestos);
      setPartidas(prev => [...prev, partida]);
      setItems(prev => [...prev, ...nuevos]);
      success(`Partida "${partida.nombre}" × ${cantidad} agregada (${nuevos.length} materiales internos)`);
    }
    setShowBiblioteca(false);
    setPartidaDestino(null);
  }, [partidaDestino, supuestos, success]);

  /**
   * Inserta el borrador generado por IA: cada partida se crea como Partida de
   * proyecto y sus componentes como ítems internos. Los costos vienen en CLP; si
   * la cotización está en UF se convierten con el valor cargado. El precio de
   * venta se deriva con los márgenes/imprevistos de los supuestos por categoría.
   */
  const insertarDesdeIA = useCallback((partidasIA: PartidaIAResuelta[]) => {
    const nuevasPartidas: Partida[] = [];
    const nuevosItems: CotizacionItem[] = [];
    for (const p of partidasIA) {
      const pid = newId();
      const cant = p.cantidad || 1;
      nuevasPartidas.push({ id: pid, nombre: p.nombre, descripcion: p.descripcion, cantidad: cant, unidad: p.unidad || 'un', modoPrecio: 'items' });
      for (const c of p.componentes) {
        // Costo en la moneda de la cotización (la IA entrega CLP).
        const costoBase = (moneda === 'UF' && valorUF > 0) ? c.costo / valorUF : c.costo;
        const costo = redondearMoneda(costoBase, moneda);
        const it = newItem({
          categoria: c.categoria,
          descripcion: c.descripcion,
          unidad: c.unidad || 'un',
          cantidad: c.cantidad || 0,
          costo,
          partidaId: pid,
          cantidadPorUnidad: cant > 0 ? (c.cantidad || 0) / cant : (c.cantidad || 0),
        }, supuestos);
        // Precio de venta neto respetando la moneda (UF con 2 decimales).
        it.precio = redondearMoneda(precioDesdeMargen(it.costo, it.margen, it.imprevistos), moneda);
        nuevosItems.push(it);
      }
    }
    setPartidas(prev => [...prev, ...nuevasPartidas]);
    setItems(prev => [...prev, ...nuevosItems]);
    setShowIA(false);
    success(`IA: ${nuevasPartidas.length} ${nuevasPartidas.length === 1 ? 'partida' : 'partidas'} y ${nuevosItems.length} ítems agregados`);
  }, [moneda, valorUF, supuestos, success]);

  // ── Handlers de PARTIDAS ──
  const addPartida = useCallback(() => {
    setPartidas(prev => [...prev, { id: newId(), nombre: '', descripcion: '', cantidad: 1, unidad: 'un', modoPrecio: 'items' }]);
  }, []);

  /** Actualiza campos de la partida; si cambia la cantidad, recalcula sus ítems. */
  const updatePartida = useCallback((id: string, patch: Partial<Partida>) => {
    setPartidas(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    if (patch.cantidad != null) {
      setItems(prev => prev.map(it =>
        it.partidaId === id && it.cantidadPorUnidad != null
          ? { ...it, cantidad: (it.cantidadPorUnidad || 0) * (patch.cantidad || 0) }
          : it));
    }
  }, []);

  /** Modo 'margen': fija un margen/imprevistos/IVA único y lo aplica a todos los ítems. */
  const setMargenPartida = useCallback((id: string, cfg: { margen: number; imprevistos: number; iva: number }) => {
    setPartidas(prev => prev.map(p => p.id === id ? { ...p, modoPrecio: 'margen', ...cfg } : p));
    setItems(prev => prev.map(it =>
      it.partidaId === id
        ? { ...it, imprevistos: cfg.imprevistos, margen: cfg.margen, iva: cfg.iva, precio: redondearMoneda(precioDesdeMargen(it.costo || 0, cfg.margen, cfg.imprevistos), moneda) }
        : it));
  }, [moneda]);

  const deletePartida = useCallback((id: string) => {
    setPartidas(prev => prev.filter(p => p.id !== id));
    setItems(prev => prev.filter(it => it.partidaId !== id));
  }, []);

  /** Agrega un ítem vacío a una partida (heredando su margen si es modo 'margen'). */
  const addItemAPartida = useCallback((pid: string, categoria: CategoriaItem = 'material') => {
    // Importante: NO anidar setItems dentro de setPartidas — en React Strict Mode
    // los updaters corren dos veces y duplicarían el ítem. Leemos la partida del
    // closure (está en deps) y hacemos una sola actualización de items.
    const p = partidas.find(x => x.id === pid);
    const base = newItem({ categoria, partidaId: pid }, supuestos);
    const it = (p?.modoPrecio === 'margen')
      ? { ...base, margen: p.margen ?? base.margen, imprevistos: p.imprevistos ?? base.imprevistos, iva: p.iva ?? base.iva }
      : base;
    setItems(prevI => [...prevI, it]);
  }, [supuestos, partidas]);

  /** Abre la biblioteca para insertar dentro de una partida. */
  const buscarParaPartida = useCallback((pid: string) => {
    setPartidaDestino(pid);
    setShowBiblioteca(true);
  }, []);

  /** Crea un ítem de Mano de Obra a partir de la calculadora HH (a una partida si aplica). */
  const agregarDesdeHH = useCallback((costo: number, descripcion: string, horas: number) => {
    const it = newItem({ categoria: 'mano_obra', descripcion, costo, cantidad: 1, unidad: 'global', ...(hhDestino ? { partidaId: hhDestino } : {}) }, supuestos);
    setItems(prev => [...prev, it]);
    setShowHHModal(false);
    setHhDestino(null);
    success(`Mano de obra agregada — ${horas} h por persona`);
  }, [supuestos, success, hhDestino]);

  /** Abre la calculadora HH para agregar dentro de una partida. */
  const calcHHParaPartida = useCallback((pid: string) => {
    setHhDestino(pid);
    setShowHHModal(true);
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

        // Busca una columna por varios nombres posibles (tolerante al Excel origen)
        const pick = (r: any, ...claves: string[]) => {
          for (const k of claves) {
            if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k];
          }
          return undefined;
        };

        const newItems: CotizacionItem[] = raw
          .map(r => {
            const descripcion = String(
              pick(r, 'Descripcion', 'Descripción', 'Descripción / Ítem', 'descripcion') ?? ''
            ).trim();
            if (!descripcion) return null;

            const categoria = parseCategoria(pick(r, 'Categoria', 'Categoría', 'categoria'));
            const s = supuestos[categoria];

            const costo    = cleanNumber(pick(r, 'Costo unitario', 'Costo Unit. (CLP)', 'Costo Unit.', 'costo'));
            const cantidad = cleanNumber(pick(r, 'Cantidad', 'cantidad')) || 1;

            const impRaw = pick(r, '% Imprevistos', 'Imprevistos', 'imprevistos');
            const margRaw = pick(r, 'Margen (%)', 'Margen %', 'margen');
            const ivaRaw  = pick(r, 'IVA (%)', 'IVA %', 'iva');

            // El Excel guarda porcentajes como fracción (0.2) → normalizar a 20
            const pct = (v: unknown, fallback: number) => {
              if (v === undefined) return fallback;
              const n = cleanNumber(v);
              return n > 0 && n <= 1 ? n * 100 : n;
            };

            const imprevistos = pct(impRaw, s.imprevistos);
            const margen      = pct(margRaw, s.margen);
            const iva         = ivaRaw !== undefined ? pct(ivaRaw, s.iva) : s.iva;

            // Si el archivo trae precio de venta, respetarlo; si no, derivarlo
            const precioRaw = cleanNumber(pick(r, 'Precio venta', 'Precio Venta', 'precio'));
            const precio = precioRaw > 0
              ? precioRaw
              : Math.round(precioDesdeMargen(costo, margen, imprevistos));

            return newItem({
              descripcion, categoria, cantidad, costo,
              imprevistos, margen, iva, precio,
              unidad: String(pick(r, 'Unidad', 'unidad') ?? 'un'),
            }, supuestos);
          })
          .filter((x): x is CotizacionItem => x !== null);

        if (newItems.length === 0) {
          warning('No se encontraron ítems válidos. Revisa que exista la columna "Descripcion".');
          return;
        }
        setItems(prev => [...prev, ...newItems]);
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

  const exportExcel = () => {
    if (items.length === 0) { warning('Agrega ítems antes de exportar'); return; }
    const wb = XLSX.utils.book_new();

    // Hoja 1 — Detalle de ítems con toda la cadena de costeo
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemsToExcelRows(items)), 'Cotización');

    // Hoja 2 — Resumen por categoría (equivale a "Presupuesto Resumen")
    const resumen = CATEGORIAS_ORDEN
      .filter(cat => totals.porCategoria[cat].cantidadItems > 0)
      .map(cat => {
        const c = totals.porCategoria[cat];
        return {
          'Categoría':       CATEGORIA_LABELS[cat],
          'Ítems':           c.cantidadItems,
          'Costo Total':     Math.round(c.costoTotal),
          'Costo c/Imprev':  Math.round(c.costoConImprev),
          'Precio Venta':    Math.round(c.neto),
          'IVA':             Math.round(c.iva),
          'P.V. + IVA':      Math.round(c.total),
          'Utilidad':        Math.round(c.utilidad),
          'Margen %':        Math.round(c.margenEfectivo * 10) / 10,
        };
      });
    resumen.push({
      'Categoría': 'TOTAL PROYECTO', 'Ítems': items.length,
      'Costo Total':    Math.round(totals.costoTotal),
      'Costo c/Imprev': Math.round(totals.costoConImprev),
      'Precio Venta':   Math.round(totals.netoGeneral),
      'IVA':            Math.round(totals.ivaGeneral),
      'P.V. + IVA':     Math.round(totals.total),
      'Utilidad':       Math.round(totals.utilidadEstimada),
      'Margen %':       Math.round(totals.margenPromedio * 10) / 10,
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');

    // Hoja 3 — Supuestos globales aplicados
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      CATEGORIAS_ORDEN.map(cat => ({
        'Categoría': CATEGORIA_LABELS[cat],
        'Margen Utilidad %': supuestos[cat].margen,
        '% Imprevistos':     supuestos[cat].imprevistos,
        'IVA %':             supuestos[cat].iva,
      })),
    ), 'Supuestos');

    XLSX.writeFile(wb, `Cotizacion_${formatFolio(folioGenerado || proximoFolio)}.xlsx`);
  };

  const handleGuardar = async () => {
    if (!clienteSeleccionado) { warning('Selecciona un cliente antes de guardar'); return; }
    if (items.length === 0)   { warning('Agrega al menos un ítem'); return; }
    if (!empresaSelec)        { warning('Selecciona una empresa emisora'); return; }
    setLoading(true);
    const payload = {
      cliente_id: clienteSeleccionado.id,
      empresa_id: empresaSelec.id ?? null,
      items,
      partidas,
      mostrar_detalle: mostrarDetalle,
      supuestos,
      subtotal: totals.netoGeneral,
      iva: totals.ivaGeneral,
      total: totals.total,
      // Para KPIs/dashboard sin mezclar monedas: total convertido a CLP.
      total_clp: moneda === 'UF' ? Math.round(totals.total * (valorUF || 0)) : totals.total,
      moneda,
      valor_uf: moneda === 'UF' ? (valorUF || null) : null,
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
    setPartidas([]);
    setMostrarDetalle(false);
    setClienteSeleccionado(null);
    setSearchCliente('');
    setDescripcionGeneral('');
    setFolioGenerado(null);
    setDescuentoPorcentajeMO(0);
    setOcultarSuministros(false);
    setGarantia(defGarantia);
    setCondicionesComerciales(defCondiciones);
    setSupuestos({ ...SUPUESTOS_DEFAULT });
    obtenerUltimoFolio();
    router.push('/cotizador');
  };

  /** Fija el mismo % de IVA en todos los ítems (0 = exento). */
  const setAllIVA = (v: number) => setItems(prev => prev.map(i => ({ ...i, iva: v })));

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

  // ── Empresa fallback (para PDF siempre tener algo) ──
  const empresaPDF: EmpresaInfo = empresaSelec || {
    nombre: 'InnVolt SpA',
    slogan: 'Servicios Eléctricos y Tecnológicos',
    rut: '78.299.986-9',
    giro: 'Ingeniería Eléctrica',
    email: 'inn-volt@outlook.cl',
    telefono: '+56 9 8920 3902',
    direccion: 'Santiago, Chile',
    website: 'www.innvolt.cl',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '0 4px' }} className="anim-in">

      {/* Estilos globales */}
      <style dangerouslySetInnerHTML={{__html: `
        .no-spin-arrows::-webkit-outer-spin-button,
        .no-spin-arrows::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spin-arrows { -moz-appearance: textfield; appearance: textfield; }
        .input-row-focus:focus { border-color: var(--y) !important; background: var(--input-bg-focus) !important; }
        .cotizador-grid-responsive { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; }
        .cotizador-context { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: start; }
        @media (max-width: 760px) { .cotizador-context { grid-template-columns: 1fr; } }
        .input-field-wrapper { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 75px; }
        .min-w-50 { min-width: 50px !important; }
        .min-w-55 { min-width: 55px !important; }
        .min-w-60 { min-width: 60px !important; }
        .min-w-65 { min-width: 65px !important; }
        .mobile-label { display: none; font-family: var(--font-display); font-size: 0.55rem; text-transform: uppercase; color: var(--muted); letter-spacing: 0.05em; }
        .iv-item-grid-container { display: grid; grid-template-columns: 1.5fr 4fr auto; align-items: center; gap: 10px; padding: 0.6rem 0.75rem; }
        .iv-item-inputs-group { display: flex; align-items: center; gap: 6px; width: 100%; }
        .cell-actions { display: flex; gap: 1px; align-items: center; background: var(--hover-bg); padding: 0.25rem; border-radius: var(--r-sm); justify-content: center; }
        .desktop-header-columns { display: grid; grid-template-columns: 1.5fr 4fr auto; gap: 10px; padding: 0.4rem 0.75rem; background: var(--bg3); }
        @media (min-width: 1025px) { .cotizador-grid-responsive { grid-template-columns: 300px 1fr; } }
        @media (max-width: 1024px) {
          .desktop-header-columns { display: none !important; }
          .iv-item-grid-container { grid-template-columns: 1fr !important; gap: 12px !important; padding: 1rem !important; }
          .iv-item-inputs-group { display: grid !important; grid-template-columns: repeat(auto-fit, minmax(95px, 1fr)) !important; gap: 10px !important; }
          .cell-subtotal span { text-align: right !important; font-size: 1.05rem !important; }
          .cell-actions { width: 100%; justify-content: space-around; padding: 0.5rem; }
          .mobile-label { display: block !important; }
          .iv-header-actions { width: 100%; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)) !important; }
        }
        @media (min-width: 1025px) { .iv-financial-layout { flex-direction: row !important; } .iv-financial-layout > * { flex: 1; } }
      `}} />

      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls,.csv" style={{ display: 'none' }} />

      {/* Modales */}
      {showPDFModal && hasFolio && clienteSeleccionado && (
        <PDFModal
          folio={folioGenerado!} cliente={clienteSeleccionado}
          items={items} totals={totals}
          descuentoPorcentajeMO={descuentoPorcentajeMO}
          descripcionGeneral={descripcionGeneral}
          garantia={garantia} condicionesComerciales={condicionesComerciales}
          ocultarSuministros={ocultarSuministros}
          empresa={empresaPDF} moneda={moneda} valorUF={valorUF}
          partidas={partidas} mostrarDetalle={mostrarDetalle}
          onClose={() => setShowPDFModal(false)}
        />
      )}

      {showHHModal && (
        <CalculadoraHH
          onConfirm={agregarDesdeHH}
          onClose={() => { setShowHHModal(false); setHhDestino(null); }}
        />
      )}

      {showBiblioteca && (
        <BuscadorBiblioteca
          supuestos={supuestos}
          onInsertar={insertarDesdeBiblioteca}
          onInsertarReceta={insertarReceta}
          partidaDestino={partidaDestino ? (partidas.find(p => p.id === partidaDestino)?.nombre || 'Partida sin nombre') : null}
          onClose={() => { setShowBiblioteca(false); setPartidaDestino(null); }}
        />
      )}

      {showIA && (
        <CotizarIAModal
          moneda={moneda}
          onInsertar={insertarDesdeIA}
          onClose={() => setShowIA(false)}
        />
      )}

      {showDescripcion && (
        <DescripcionModal
          descripcion={descripcionGeneral}
          garantia={garantia}
          condiciones={condicionesComerciales}
          empresa={empresaSelec}
          onChange={(campo, v) => {
            if (campo === 'descripcion') setDescripcionGeneral(v);
            else if (campo === 'garantia') setGarantia(v);
            else setCondicionesComerciales(v);
          }}
          onClose={() => setShowDescripcion(false)}
        />
      )}

      {showOpciones && (
        <OpcionesModal
          ocultarSuministros={ocultarSuministros}
          ocultarCostos={ocultarCostos}
          mostrarDetalle={mostrarDetalle}
          onToggle={(campo) => {
            if (campo === 'ocultarSuministros') setOcultarSuministros(v => !v);
            else if (campo === 'ocultarCostos') setOcultarCostos(v => !v);
            else setMostrarDetalle(v => !v);
          }}
          onClose={() => setShowOpciones(false)}
        />
      )}

      {showEmpresaModal && (
        <EmpresaModal
          empresa={empresaEditing}
          onSave={async (emp) => {
            setShowEmpresaModal(false);
            setEmpresaEditing(null);
            await loadEmpresas();
            setEmpresaSelec(emp);
            success(emp.id ? 'Empresa actualizada' : 'Empresa creada correctamente');
          }}
          onClose={() => { setShowEmpresaModal(false); setEmpresaEditing(null); }}
        />
      )}

      {/* ══ HEADER ══ */}
      <div className="iv-page-header" style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ width: '100%' }}>
          <p className="label-muted" style={{ marginBottom: '0.25rem', letterSpacing: '0.4em', fontSize: '0.65rem' }}>
            {cloneId ? 'Clonando' : (isEditing ? 'Editando' : 'Nueva')} cotización
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(1.6rem, 5vw, 2.4rem)', textTransform: 'uppercase', lineHeight: 1, color: 'var(--text)', margin: 0 }}>
              COTIZA<span style={{ color: 'var(--y)' }}>DOR</span>
            </h1>
            <span style={{ background: hasFolio ? 'var(--y-brand)' : 'var(--bg3)', color: hasFolio ? 'var(--on-accent)' : 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.75rem', letterSpacing: '0.12em', padding: '0.3rem 0.75rem', borderRadius: 'var(--r)', border: hasFolio ? 'none' : '1px solid var(--border2)' }}>
              {formatFolio(folioGenerado || proximoFolio)}
            </span>
          </div>
        </div>

        <div className="iv-header-actions" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '6px', width: '100%' }}>
          <button onClick={nuevoPresupuesto} style={{ ...btnGhost, justifyContent: 'center', margin: 0 }}><RefreshCcw size={12} /> Nuevo</button>
          <Link href="/cotizador/historial" style={{ ...btnGhost, textDecoration: 'none', justifyContent: 'center', margin: 0 }}>
            <History size={12} /> Historial
          </Link>
          <button onClick={() => fileInputRef.current?.click()} style={{ ...btnGhost, justifyContent: 'center', margin: 0 }}>
            <FileUp size={12} /> Excel
          </button>
          {hasFolio && (
            <button
              onClick={() => {
                if (!empresaSelec) { warning('Selecciona una empresa emisora primero'); return; }
                setShowPDFModal(true);
              }}
              style={{ ...btnGhost, color: 'var(--success)', borderColor: 'rgba(74,222,128,0.3)', justifyContent: 'center', margin: 0 }}
            >
              <Download size={12} /> PDF
            </button>
          )}
          <button
            onClick={handleGuardar} disabled={loading}
            style={{ background: 'var(--y-brand)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--r)', cursor: loading ? 'not-allowed' : 'pointer', padding: '0 0.75rem', height: 36, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', opacity: loading ? 0.5 : 1, gridColumn: 'span 2 / auto' }}
          >
            {loading ? <Loader2 size={12} className="iv-spin" /> : <Save size={12} />}
            {isEditing ? 'Actualizar' : 'Guardar Cotización'}
          </button>
        </div>
      </div>

      {/* ══ COTIZADOR (ancho completo) ══ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

        {/* ── Empresa + Cliente arriba ── */}
        <div className="cotizador-context">

          {/* ★ EMPRESA EMISORA ★ */}
          <EmpresaSelector
            empresas={empresas}
            selected={empresaSelec}
            onSelect={setEmpresaSelec}
            onNew={() => { setEmpresaEditing(null); setShowEmpresaModal(true); }}
            onEdit={(emp) => { setEmpresaEditing(emp); setShowEmpresaModal(true); }}
          />

          {/* Cliente */}
          <div style={{ ...panelY, padding: '1rem', borderRadius: 'var(--r)' }}>
            <p style={sectionLabel}><User size={12} /> Cliente</p>
            <div style={{ position: 'relative' }}>
              <input
                className="input input-sm"
                value={searchCliente}
                onChange={e => { setSearchCliente(e.target.value); setShowClienteDropdown(true); if (!e.target.value) setClienteSeleccionado(null); }}
                onFocus={() => setShowClienteDropdown(true)}
                onBlur={() => setTimeout(() => setShowClienteDropdown(false), 200)}
                placeholder="Buscar o seleccionar cliente..."
                style={{ width: '100%', padding: '0.5rem' }}
              />
              {clienteSeleccionado && (
                <div style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)' }}>
                  <Check size={13} color="var(--success)" />
                </div>
              )}
              {showClienteDropdown && clientesFiltrados.length > 0 && (
                <div className="dropdown" style={{ width: '100%', zIndex: 50 }}>
                  {clientesFiltrados.map(c => (
                    <div key={c.id} className="dropdown-item"
                      onMouseDown={() => { setClienteSeleccionado(c); setSearchCliente(c.nombre_cliente); setShowClienteDropdown(false); }}
                    >
                      <p style={{ fontSize: '0.85rem', fontWeight: 500, margin: 0 }}>{c.nombre_cliente}</p>
                      {c.empresa && <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: 0 }}>{c.empresa}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {clienteSeleccionado && (
              <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--bg3)', borderRadius: 'var(--r-sm)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', color: 'var(--y)', textTransform: 'uppercase', margin: 0 }}>{clienteSeleccionado.nombre_cliente}</p>
                {clienteSeleccionado.empresa   && <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: 0 }}>{clienteSeleccionado.empresa}</p>}
                {clienteSeleccionado.rut       && <p style={{ fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'monospace', margin: 0 }}>RUT: {clienteSeleccionado.rut}</p>}
              </div>
            )}
          </div>

        </div>{/* /context */}

        {/* Botones de contexto (funciones en modal) */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowDescripcion(true)} style={{ ...btnGhost, color: descripcionGeneral.trim() ? 'var(--y)' : undefined, borderColor: descripcionGeneral.trim() ? 'var(--border)' : undefined }}>
            <FileText size={13} /> Descripción y condiciones {descripcionGeneral.trim() ? '✓' : ''}
          </button>
          <button onClick={() => setShowOpciones(true)} style={btnGhost}>
            <Settings2 size={13} /> Opciones
          </button>

          {/* ── Moneda (CLP / UF) ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.58rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--muted)' }}>Moneda</span>
            <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
              {(['CLP', 'UF'] as Moneda[]).map(m => (
                <button key={m} onClick={() => setMoneda(m)} style={{
                  background: moneda === m ? 'var(--y-brand)' : 'transparent',
                  color: moneda === m ? 'var(--on-accent)' : 'var(--muted)',
                  border: 'none', cursor: 'pointer', padding: '0 0.75rem', height: 32,
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.66rem', letterSpacing: '0.08em',
                }}>{m}</button>
              ))}
            </div>
            {moneda === 'UF' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>UF = $</span>
                <input type="number" min="0" step="1" value={valorUF || ''} onChange={e => setValorUF(parseFloat(e.target.value) || 0)} placeholder="0" title="Valor de la UF en pesos (para la equivalencia en CLP)"
                  style={{ width: 82, height: 32, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: 'var(--r-sm)', padding: '0 0.5rem', fontSize: '0.8rem', textAlign: 'right' }} />
                <button onClick={traerUF} disabled={cargandoUF} title="Traer valor UF de hoy" style={{ ...btnGhost, height: 32, padding: '0 0.6rem', fontSize: '0.58rem' }}>
                  {cargandoUF ? <Loader2 size={11} className="iv-spin" /> : <RefreshCcw size={11} />} Hoy
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── ÁREA ÍTEMS ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>

          {/* Toolbar ítems */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderTop: '2px solid var(--y-brand)', padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', borderRadius: 'var(--r)' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--y)' }}>
              Presupuesto
            </span>

            {/* ── Acción principal: por partida ── */}
            <button
              onClick={addPartida}
              title="Crear una partida de proyecto (agrupa materiales/MO/servicios en una línea comercial)"
              style={{ background: 'var(--y-brand)', color: 'var(--on-accent)', border: 'none', cursor: 'pointer', height: 32, borderRadius: 'var(--r-sm)', padding: '0 0.85rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.64rem', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Plus size={13} /><Package size={13} /> Nueva partida
            </button>
            <button
              onClick={() => setShowIA(true)}
              title="Generar un borrador de partidas con IA a partir de una descripción del proyecto"
              style={{ ...btnGhost, height: 32, fontSize: '0.62rem', padding: '0 0.7rem', color: 'var(--y)', borderColor: 'var(--border)', background: 'var(--y-soft)' }}
            >
              <Sparkles size={12} /> Cotizar con IA
            </button>
            <button
              onClick={() => { setPartidaDestino(null); setShowBiblioteca(true); }}
              title="Insertar recetas (como partida) o ítems desde la biblioteca"
              style={{ ...btnGhost, height: 32, fontSize: '0.62rem', padding: '0 0.7rem', color: 'var(--y)', borderColor: 'var(--border)' }}
            >
              <Library size={12} /> Biblioteca
            </button>

            {/* ── Secundario: ítems sueltos (fuera de partida) ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', paddingLeft: '0.5rem', marginLeft: '0.15rem', borderLeft: '1px solid var(--border2)' }}>
              <span style={{ fontSize: '0.5rem', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 700 }}>Sueltos</span>
              {CATEGORIAS_ORDEN.map(cat => {
                const CatIcon = CAT_ICONS[cat];
                return (
                  <button key={cat} onClick={() => addItem(cat)} title={`Agregar ${CATEGORIA_LABELS[cat]} suelto`} style={{ ...btnGhost, height: 26, fontSize: '0.55rem', padding: '0 0.45rem', color: CAT_COLORS[cat], borderColor: `${CAT_COLORS[cat]}33` }}>
                    <Plus size={9} /><CatIcon size={9} /> {CATEGORIA_LABELS[cat]}
                  </button>
                );
              })}
              <button
                onClick={() => { setHhDestino(null); setShowHHModal(true); }}
                title="Calcular mano de obra por horas hombre (ítem suelto)"
                style={{ ...btnGhost, height: 26, fontSize: '0.55rem', padding: '0 0.45rem', color: 'var(--success)', borderColor: 'var(--border2)' }}
              >
                <Calculator size={9} /> HH
              </button>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
              <button onClick={() => setAllIVA(19)} style={{ ...btnGhost, height: 26, fontSize: '0.55rem', padding: '0 0.4rem' }}>IVA 19%</button>
              <button onClick={() => setAllIVA(0)}  style={{ ...btnGhost, height: 26, fontSize: '0.55rem', padding: '0 0.4rem' }}>Exento</button>
              <button onClick={exportExcel}             style={{ ...btnGhost, height: 26, fontSize: '0.55rem', padding: '0 0.4rem' }}><Download size={10} /> XLSX</button>
            </div>
          </div>

          {/* Partidas de proyecto (agrupación comercial) */}
          {partidas.map(p => (
            <PartidaCard
              key={p.id} partida={p} itemsPartida={itemsDe(p.id)} indexOf={indexOf}
              onUpdatePartida={updatePartida} onDeletePartida={deletePartida} onSetMargen={setMargenPartida}
              onAddItem={addItemAPartida} onBuscar={buscarParaPartida} onCalcHH={calcHHParaPartida}
              updateItem={updateItem} deleteItem={deleteItem} duplicateItem={duplicateItem} moveItem={moveItem}
              moneda={moneda} ocultarCostos={ocultarCostos} fmt={fmt}
            />
          ))}

          {/* Header columnas desktop (solo para ítems sueltos) */}
          {itemsSueltos.length > 0 && (
            <div className="desktop-header-columns">
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--muted)' }}>DESCRIPCIÓN</span>
              <div style={{ display: 'flex', width: '100%', gap: '6px' }}>
                <span style={{ flex: 1, minWidth: '50px', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.55rem', color: 'var(--muted)' }}>CANT.</span>
                <span style={{ flex: 1, minWidth: '60px', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.55rem', color: 'var(--muted)' }}>UNID.</span>
                {!ocultarCostos && <span style={{ flex: 1, textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.55rem', color: 'var(--muted)' }}>COSTO UNIT</span>}
                {!ocultarCostos && <span style={{ flex: 1, minWidth: '55px', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.55rem', color: 'var(--orange)' }}>IMPREV.</span>}
                {!ocultarCostos && <span style={{ flex: 1, minWidth: '55px', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.55rem', color: 'var(--purple)' }}>MARGEN</span>}
                <span style={{ flex: 1, textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.55rem', color: 'var(--y)' }}>P. VENTA</span>
                <span style={{ flex: 1, minWidth: '55px', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.55rem', color: 'var(--danger)' }}>DESC.</span>
                <span style={{ flex: 1, minWidth: '65px', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.55rem', color: 'var(--info)' }}>IVA %</span>
                <span style={{ flex: 1, textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.55rem', color: 'var(--muted)' }}>SUBTOTAL</span>
              </div>
              <span style={{ width: '68px' }}></span>
            </div>
          )}

          {/* Estado vacío (sin partidas ni ítems) — el flujo principal es por partida */}
          {items.length === 0 && partidas.length === 0 && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', padding: '2.5rem 1rem', textAlign: 'center', borderRadius: 'var(--r)' }}>
              <Package size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.25, display: 'block', color: 'var(--y-brand)' }} />
              <p style={{ color: 'var(--text)', marginBottom: '0.35rem', fontSize: '0.9rem', fontWeight: 600 }}>Empieza por una partida de proyecto</p>
              <p style={{ color: 'var(--muted)', marginBottom: '1.25rem', fontSize: '0.78rem' }}>Agrupa materiales, mano de obra y servicios en una línea comercial. También puedes agregar ítems sueltos.</p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={addPartida} style={{ background: 'var(--y-brand)', color: 'var(--on-accent)', border: 'none', cursor: 'pointer', height: 40, borderRadius: 'var(--r-sm)', padding: '0 1.1rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Plus size={14} /><Package size={14} /> Nueva partida
                </button>
                <button onClick={() => setShowIA(true)} style={{ ...btnGhost, height: 40, color: 'var(--y)', borderColor: 'var(--border)', background: 'var(--y-soft)' }}>
                  <Sparkles size={13} /> Cotizar con IA
                </button>
                <button onClick={() => { setPartidaDestino(null); setShowBiblioteca(true); }} style={{ ...btnGhost, height: 40, color: 'var(--y)', borderColor: 'var(--border)' }}>
                  <Library size={13} /> Desde biblioteca
                </button>
              </div>
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '0.9rem' }}>
                <span style={{ fontSize: '0.55rem', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.12em', alignSelf: 'center', fontWeight: 700 }}>o suelto:</span>
                {CATEGORIAS_ORDEN.map(cat => {
                  const CatIcon = CAT_ICONS[cat];
                  return (
                    <button key={cat} onClick={() => addItem(cat)} style={{ ...btnGhost, height: 30, fontSize: '0.58rem', padding: '0 0.55rem', color: CAT_COLORS[cat], borderColor: `${CAT_COLORS[cat]}33` }}>
                      <Plus size={11} /><CatIcon size={11} /> {CATEGORIA_LABELS[cat]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ítems sueltos (fuera de partidas) — comportamiento clásico */}
          {itemsSueltos.length > 0 && (
            <>
              {partidas.length > 0 && (
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.55rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: '0.3rem' }}>Ítems sueltos</span>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {itemsSueltos.map((item, i) => (
                  <ItemRow
                    key={item.id} item={item} index={indexOf(item.id)}
                    onUpdate={updateItem} onDelete={deleteItem} onDuplicate={duplicateItem}
                    onMoveUp={j => moveItem(j, 'up')} onMoveDown={j => moveItem(j, 'down')}
                    isFirst={i === 0} isLast={i === itemsSueltos.length - 1}
                    ocultarCostos={ocultarCostos} moneda={moneda}
                  />
                ))}
              </div>
            </>
          )}

          {(items.length > 0 || partidas.length > 0) && (
            <button onClick={() => addItem('material')} style={{ ...btnGhost, width: '100%', justifyContent: 'center', height: 38, borderStyle: 'dashed', marginTop: '2px', borderRadius: 'var(--r)' }}>
              <Plus size={13} /> Agregar ítem suelto
            </button>
          )}

          {/* Resumen financiero */}
          {items.length > 0 && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderTop: '2px solid var(--y-brand)', padding: '1rem', marginTop: '6px', borderRadius: 'var(--r)' }}>
              <p style={sectionLabel}>Resumen Financiero</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="iv-financial-layout">
                {/* Desglose por categoría — equivale a "Presupuesto Resumen" del Excel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                  {CATEGORIAS_ORDEN.filter(cat => totals.porCategoria[cat].cantidadItems > 0).map(cat => {
                    const c = totals.porCategoria[cat];
                    const CatIcon = CAT_ICONS[cat];
                    return (
                      <div key={cat} style={{ background: 'var(--bg3)', padding: '0.55rem 0.7rem', borderLeft: `3px solid ${CAT_COLORS[cat]}`, borderRadius: 'var(--r-sm)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: CAT_COLORS[cat] }}>
                            <CatIcon size={11} /> {CATEGORIA_LABELS[cat]}
                            <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({c.cantidadItems})</span>
                          </span>
                          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)' }}>
                            {fmt(c.neto)}
                          </span>
                        </div>
                        {c.montoDescuento > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--danger)' }}>
                            <span>descuento prom. {Math.round(c.descuentoPromedio * 10) / 10}%</span>
                            <span>− {fmt(c.montoDescuento)}</span>
                          </div>
                        )}
                        {!ocultarCostos && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--muted)', fontFamily: 'monospace' }}>
                            <span>costo {fmt(c.costoTotal)}</span>
                            <span style={{ color: 'var(--orange)' }}>+imp {fmt(c.costoConImprev)}</span>
                            <span style={{ color: 'var(--success)' }}>util {fmt(c.utilidad)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {descuentoPorcentajeMO > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.7rem', background: 'rgba(248,113,113,0.06)', borderRadius: 'var(--r-sm)' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>Descuento MO ({descuentoPorcentajeMO}%)</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', color: 'var(--danger)' }}>− {fmt(totals.montoDescuentoMO)}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%', paddingTop: '0.5rem', borderTop: '1px dashed var(--border2)' }}>
                  {/* Cadena de costeo global (visible solo internamente) */}
                  {!ocultarCostos && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Costo Directo</span>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--muted)' }}>{fmt(totals.costoTotal)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--orange)', fontFamily: 'var(--font-display)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>+ Imprevistos</span>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--orange)' }}>{fmt(totals.montoImprevistos)}</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Total Neto</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>{fmt(totals.netoGeneral)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>IVA</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--muted)' }}>{fmt(totals.ivaGeneral)}</span>
                  </div>
                  <div style={{ padding: '0.6rem 0.75rem', background: 'var(--bg3)', borderTop: '2px solid var(--y-brand)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 'var(--r-sm)' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>TOTAL FINAL</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.4rem', color: 'var(--y)' }}>{fmt(totals.total)}</span>
                  </div>
                  {!ocultarCostos && totals.utilidadEstimada > 0 && (
                    <div style={{ padding: '0.4rem 0.6rem', background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 'var(--r-sm)' }}>
                      <span style={{ fontSize: '0.6rem', color: 'var(--success)', fontFamily: 'var(--font-display)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Utilidad Estimada</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.95rem', color: 'var(--success)' }}>
                        {fmt(totals.utilidadEstimada)} <span style={{ fontSize: '0.68rem', opacity: 0.8, fontWeight: 'normal' }}>({Math.round(totals.margenPromedio)}%)</span>
                      </span>
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

// ─── Export con Suspense ──────────────────────────────────────────────────────
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
