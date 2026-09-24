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
  Calculator, Truck, Library, Sparkles, Inbox, ExternalLink, Send,
} from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

import { supabase } from '@/lib/supabase';
import { clientesService } from '@/services/clientes';
import { cotizacionesService } from '@/services/cotizaciones';
import { catalogoService } from '@/services/catalogo';
import { solicitudesService } from '@/services/solicitudes';
import { levantamientosService } from '@/services/levantamientos';
import type { Solicitud } from '@/types/solicitud';
import { useToast } from '@/hooks/useToast';
import { marcarSinGuardar, confirmarSalida } from '@/hooks/useSinGuardar';
import {
  formatMoneda, redondearMoneda, formatFolio, cleanNumber, calcularTotals, calcularItem,
  newItem, newId, normalizarItem, precioDesdeMargen,
  margenDesdePrecio, itemsToExcelRows, parseCategoria,
  calcularPartida, partidaDesdeReceta, borradorDesdeAnalisis,
  convertirItemsMoneda, formatMiles, nombreArchivo, formatDate,
} from '@/utils';
import type { CotizacionItem, Cliente, CategoriaItem, Supuestos, Moneda, Partida, RecetaConComponentes, PartidaIAResuelta, CatalogoItem, Cotizacion } from '@/types';
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
import NumeroInput from '@/components/NumeroInput';
import EnviarCotizacionModal from '@/components/EnviarCotizacionModal';
import { fotosService } from '@/services/fotos';
import { DescripcionModal, OpcionesModal } from '@/components/CotizadorModales';

// ─── Estilos base ─────────────────────────────────────────────────────────────
const panelY: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border2)', borderTop: '2px solid var(--y-brand)',
};
// Estilos compartidos (lenguaje TecApp: sobrio, sentence case, legible)
const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem',
  letterSpacing: '-0.01em', color: 'var(--text)',
  display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem',
};
const btnGhost: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text)',
  cursor: 'pointer', padding: '0 0.8rem', height: 36, borderRadius: 8,
  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '0.84rem',
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap',
};

// Textos base (editables por cotización en el modal Descripción/Condiciones).
// El PDF respeta su estructura: subtítulos "1. …", etiquetas en **negrita** y
// viñetas "- …". Se pueden modificar por cotización (o restaurar a esta base).
const GARANTIA_DEFAULT = [
  '1. Cobertura y plazos',
  '**Plazo de garantía:** 6 meses para la instalación y mano de obra, contados desde la fecha de entrega o puesta en servicio (salvo que la propuesta indique expresamente un plazo distinto).',
  '**Garantía del fabricante:** Los equipos, componentes y materiales suministrados cuentan exclusivamente con la garantía otorgada por sus respectivos fabricantes o distribuidores autorizados.',
  '**Alcance exclusivo:** La garantía cubre únicamente defectos atribuibles a errores de instalación, montaje o configuración realizados directamente por personal de InnVolt SpA.',
  '2. Exclusiones y anulación',
  '**Exclusiones generales:** La garantía no cubre daños provocados por:',
  '- Manipulación de terceros o modificaciones no autorizadas.',
  '- Vandalismo, robo, incendios, inundaciones o humedad.',
  '- Sobretensiones, descargas atmosféricas o fallas de suministro eléctrico.',
  '- Catástrofes naturales o uso indebido de los equipos.',
  '**Elementos preexistentes:** Equipos, materiales o instalaciones preexistentes propiedad del cliente y no suministrados por InnVolt SpA quedan expresamente excluidos de cualquier garantía.',
  '**Anulación de garantía:** Toda intervención realizada por terceros no autorizados dejará de inmediato sin efecto la garantía sobre el elemento intervenido.',
].join('\n');
const CONDICIONES_DEFAULT = [
  '1. Validez de la oferta y aceptación',
  '**Vigencia de la cotización:** La presente cotización tendrá una vigencia de 15 días corridos contados desde su fecha de emisión.',
  '**Aceptación de la propuesta:** La aceptación de esta propuesta implica la conformidad total del cliente con el alcance técnico, las condiciones comerciales y las cláusulas descritas en este documento.',
  '2. Formas y condiciones de pago',
  '**Proyectos superiores a UF 10:** Se establece un anticipo mínimo del 50% y el saldo restante contra entrega o según el cronograma de avance acordado.',
  '**Proyectos iguales o inferiores a UF 10:** Se podrá requerir el pago total anticipado previo al inicio de los trabajos.',
  '**Pedidos especiales:** Los materiales especiales, equipos importados o productos fabricados a pedido podrán requerir pago anticipado del 100%.',
  '3. Alcance de los servicios y modificaciones',
  '**Alcance contratado:** Los servicios cotizados consideran únicamente las actividades expresamente indicadas en el alcance de esta propuesta.',
  '**Partidas extraordinarias:** Materiales, equipos, obras civiles, canalizaciones, habilitaciones eléctricas, certificaciones o trabajos adicionales no especificados se cotizarán por separado.',
  '**Órdenes de cambio:** Toda modificación de alcance solicitada por el cliente tras la aprobación de la propuesta será evaluada y presupuestada mediante una orden de cambio.',
  '**Gastos extraordinarios:** Gastos no considerados originalmente (como traslados adicionales, visitas técnicas extraordinarias, permisos, certificaciones o materiales imprevistos) serán cotizados y facturados por separado.',
  '4. Plazos y logística de ejecución',
  '**Programación:** La programación de los trabajos estará sujeta a la disponibilidad operativa y a la recepción conforme del pago inicial acordado.',
  '**Variación de plazos:** Los plazos de ejecución podrán variar por fuerza mayor, condiciones climáticas adversas, restricciones de acceso, retrasos de proveedores o situaciones ajenas al control de la empresa.',
  '**Horario de atención:** Los servicios de soporte técnico se prestan en horario hábil de lunes a viernes, de 09:00 a 18:00 horas, salvo contratación de cobertura especial.',
  '**Trabajos fuera de la RM:** Los trabajos ejecutados fuera de la Región Metropolitana podrán considerar costos adicionales por traslado, alojamiento, alimentación y logística.',
].join('\n');

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
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', color: 'var(--y)', margin: 0 }}>
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
                fontSize: '0.78rem', fontFamily: 'var(--font-display)',
                fontWeight: 700,
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
  fechaEmision, hayCambios, onGuardar, levantamientoId, incluirFotos, onEnviar,
}: {
  folio: number; cliente: Cliente; items: CotizacionItem[];
  totals: ReturnType<typeof calcularTotals>; descuentoPorcentajeMO: number;
  descripcionGeneral: string; garantia: string; condicionesComerciales: string;
  ocultarSuministros: boolean; empresa: EmpresaInfo; moneda: Moneda; valorUF: number;
  partidas: Partida[]; mostrarDetalle: boolean; onClose: () => void;
  fechaEmision: string | null; hayCambios: boolean; onGuardar: () => void;
  levantamientoId: string | null; incluirFotos: boolean;
  /** Abre "Enviar al cliente" (link, WhatsApp, correo). */
  onEnviar?: () => void;
}) {
  const [gen, setGen] = useState(false);
  const { error: toastError } = useToast();
  const folioStr = formatFolio(folio);
  const fmt = (v: number) => formatMoneda(v, moneda);

  // Revisión previa: lo que un cliente notaría en el PDF.
  const avisos: string[] = [];
  const sinPrecio = items.filter(i => !(i.precio > 0)).length;
  if (sinPrecio > 0) avisos.push(`${sinPrecio} ítem${sinPrecio > 1 ? 's' : ''} con precio $0`);
  const sinDesc = items.filter(i => !i.descripcion.trim()).length;
  if (sinDesc > 0) avisos.push(`${sinDesc} ítem${sinDesc > 1 ? 's' : ''} sin descripción`);
  const partidasSinNombre = partidas.filter(p => !p.nombre.trim()).length;
  if (partidasSinNombre > 0) avisos.push(`${partidasSinNombre} partida${partidasSinNombre > 1 ? 's' : ''} sin nombre`);
  if (!cliente.rut) avisos.push('El cliente no tiene RUT');
  if (!cliente.email) avisos.push('El cliente no tiene correo');
  if (!descripcionGeneral.trim()) avisos.push('Falta la descripción del trabajo');

  const download = async (tipo: 'cliente' | 'interno') => {
    setGen(true);
    try {
      if (tipo === 'cliente') {
        // Fotos del levantamiento (links firmados temporales) si la opción está activa.
        let fotos: { url: string; caption: string }[] = [];
        if (incluirFotos && levantamientoId) {
          const lev = await levantamientosService.getById(levantamientoId);
          fotos = await fotosService.paraPDF(lev?.data.fotos);
        }
        const blob = await pdf(
          <PresupuestoPDF
            cliente={cliente} items={items} totals={totals}
            descuentoPorcentajeMO={descuentoPorcentajeMO} folio={folioStr}
            descripcionGeneral={descripcionGeneral} garantia={garantia}
            condicionesComerciales={condicionesComerciales}
            ocultarSuministros={ocultarSuministros}
            empresa={empresa} moneda={moneda} valorUF={valorUF}
            partidas={partidas} mostrarDetalle={mostrarDetalle}
            fechaEmision={fechaEmision} fotos={fotos}
          />
        ).toBlob();
        saveAs(blob, `Cotizacion_${folioStr}_${nombreArchivo(cliente.nombre_cliente)}.pdf`);
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
    } catch (e) {
      console.error(e);
      toastError('No se pudo generar el PDF: ' + (e instanceof Error ? e.message : 'error desconocido'));
    } finally { setGen(false); }
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

          {hayCambios && (
            <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 'var(--r-sm)', padding: '0.6rem 0.8rem', fontSize: '0.75rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
              <span>Hay cambios <b>sin guardar</b>: el PDF no coincidirá con el historial.</span>
              <button onClick={onGuardar} style={{ ...btnGhost, height: 28, padding: '0 0.6rem', whiteSpace: 'nowrap' }}><Save size={11} /> Guardar</button>
            </div>
          )}
          {avisos.length > 0 && (
            <div style={{ background: 'var(--y-soft)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0.6rem 0.8rem', fontSize: '0.74rem', color: 'var(--muted)' }}>
              <p style={{ margin: '0 0 0.3rem', fontWeight: 700, color: 'var(--y)' }}>Revisa antes de enviar al cliente:</p>
              {avisos.map(a => <p key={a} style={{ margin: 0 }}>• {a}</p>)}
            </div>
          )}

          {onEnviar && (
            <button onClick={onEnviar} style={{ ...btnGhost, width: '100%', justifyContent: 'center', height: 44, background: 'var(--y-brand)', color: 'var(--on-accent)', borderColor: 'transparent', fontWeight: 700 }}>
              <Send size={14} /> Enviar al cliente (link para aceptar online)
            </button>
          )}
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
  const calc = useMemo(() => calcularItem(item), [item]);
  /** Formatea según la moneda de la cotización (CLP o UF). */
  const fmt = (v: number) => formatMoneda(v, moneda);

  // Cadena del Excel: costo → (1+imprevistos) → ÷(1−margen) → ×(1+IVA)
  // El redondeo respeta la moneda: CLP a peso entero, UF a 2 decimales.
  const handleCostoChange = (costo: number) => {
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
  const handlePrecioChange = (precio: number) => {
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
            <NumeroInput value={item.cantidad || 0} onChange={v => onUpdate(index, { cantidad: v })} min={0} className="input-row-focus" style={{ ...inputStyle, textAlign: 'center', fontWeight: 'bold' }} placeholder="0" ariaLabel="Cantidad" />
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
              <NumeroInput value={item.costo || 0} onChange={handleCostoChange} min={0} formatear={fmt} className="input-row-focus" placeholder="$ 0" ariaLabel="Costo unitario" style={{ ...inputStyle, color: 'var(--muted)', fontSize: '0.8rem' }} />
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
            <NumeroInput value={item.precio || 0} onChange={handlePrecioChange} min={0} formatear={fmt} className="input-row-focus" placeholder="$ 0" ariaLabel="Precio de venta" style={{ ...inputStyle, color: 'var(--y)', fontWeight: '700' }} />
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
                fontSize: '0.78rem', fontFamily: 'var(--font-display)', fontWeight: 700,
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
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.74rem', color: 'var(--y)' }}>Partida de proyecto</span>
          <input value={partida.nombre} onChange={e => onUpdatePartida(partida.id, { nombre: e.target.value })} placeholder="Nombre comercial (ej. Habilitación de tableros)"
            style={{ ...inp, width: '100%', fontWeight: 700, fontSize: '0.95rem', marginTop: '0.2rem' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.4rem' }}>
          <div>
            <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--muted)', marginBottom: '0.15rem' }}>Cantidad</span>
            <div style={{ width: 70 }}>
              <NumeroInput value={partida.cantidad || 0} onChange={v => onUpdatePartida(partida.id, { cantidad: v })} min={0} ariaLabel="Cantidad de la partida"
                style={{ ...inp, width: '100%', textAlign: 'center', fontWeight: 700 }} />
            </div>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--muted)', marginBottom: '0.15rem' }}>Unidad</span>
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
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Precio</span>
          <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
            {(['items', 'margen'] as const).map(m => (
              <button key={m}
                onClick={() => m === 'margen'
                  ? onSetMargen(partida.id, { margen: partida.margen ?? 30, imprevistos: partida.imprevistos ?? 0, iva: partida.iva ?? 19 })
                  : onUpdatePartida(partida.id, { modoPrecio: 'items' })}
                style={{ background: modo === m ? 'var(--y-brand)' : 'transparent', color: modo === m ? 'var(--on-accent)' : 'var(--muted)', border: 'none', cursor: 'pointer', padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontWeight: 700 }}>
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
        <span style={{ fontSize: '0.72rem', color: 'var(--faint)', fontWeight: 700, marginRight: '0.1rem' }}>Agregar</span>
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
  const solicitudParam = searchParams.get('solicitud');
  const levantamientoParam = searchParams.get('levantamiento');
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
  // Solicitud de origen (flujo Solicitud → IA → Cotización). Vacío en cotización directa.
  const [solicitudOrigen,        setSolicitudOrigen]        = useState<Solicitud | null>(null);
  const [generandoIA,            setGenerandoIA]            = useState(false);
  // Levantamiento de origen (sus fotos pueden ir al PDF) y la fila guardada (para "Enviar").
  const [levantamientoId,        setLevantamientoId]        = useState<string | null>(null);
  const [incluirFotos,           setIncluirFotos]           = useState(false);
  const [cotGuardada,            setCotGuardada]            = useState<Cotizacion | null>(null);
  const [showEnviar,             setShowEnviar]             = useState(false);
  // Fecha de emisión real (created_at) para el PDF; null = cotización nueva (hoy).
  const [fechaEmision,           setFechaEmision]           = useState<string | null>(null);
  // Huella del contenido guardado, para detectar "cambios sin guardar".
  const [firmaGuardada,          setFirmaGuardada]          = useState<string | null>(null);
  const [capturarFirma,          setCapturarFirma]          = useState(false);
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

    // Flujo Solicitud → IA → Cotización: precarga cliente y abre el modal de IA
    // (el MISMO cotizador existente). No afecta la cotización directa.
    if (solicitudParam && !editId && !cloneId) {
      try {
        const sol = await solicitudesService.getById(solicitudParam);
        if (sol) {
          setSolicitudOrigen(sol);
          if (sol.cliente_id) {
            const c = dataClientes.find((x: Cliente) => x.id === sol.cliente_id);
            if (c) { setClienteSeleccionado(c); setSearchCliente(c.nombre_cliente); }
          }
          // Genera el borrador con IA y lo inserta directo (sin modal): el
          // usuario aterriza con las partidas cargadas para revisar/editar.
          await generarBorradorDesdeSolicitud(sol);
        }
      } catch { /* si falla la carga, el cotizador sigue funcionando normal */ }
    }

    // Flujo Levantamiento (visita técnica) → Cotización: precarga el cliente y
    // usa el alcance levantado en terreno como descripción del trabajo.
    if (levantamientoParam && !editId && !cloneId) {
      try {
        const lev = await levantamientosService.getById(levantamientoParam);
        if (lev) {
          setLevantamientoId(lev.id);
          setIncluirFotos((lev.data.fotos || []).length > 0);
          if (lev.cliente_id) {
            const c = dataClientes.find((x: Cliente) => x.id === lev.cliente_id);
            if (c) { setClienteSeleccionado(c); setSearchCliente(c.nombre_cliente); }
          }
          const d = lev.data;
          const lv = `LV-${String(lev.folio || 0).padStart(4, '0')}`;
          const partes = [`Según levantamiento técnico ${lv}${d.fecha ? ` del ${formatDate(d.fecha)}` : ''}${d.direccion ? `, ${d.direccion}` : ''}.`];
          if (d.alcance_trabajos?.trim()) partes.push(`**Trabajos a ejecutar:**\n${d.alcance_trabajos.trim()}`);
          if (d.alcance_mejoras?.trim())  partes.push(`**Mejoras recomendadas:**\n${d.alcance_mejoras.trim()}`);
          setDescripcionGeneral(partes.join('\n\n'));
          success(`Cotización iniciada desde el levantamiento ${lv}`);
        }
      } catch { /* sin levantamiento: cotización normal */ }
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
      // Relación inversa: si la cotización nació de una solicitud, la recuperamos
      // para conservar el vínculo al guardar y ofrecer "ver solicitud de origen".
      if (cot.solicitud_id && !isCloning) {
        try { const sol = await solicitudesService.getById(cot.solicitud_id); if (sol) setSolicitudOrigen(sol); } catch { /* opcional */ }
      }
      setLevantamientoId(cot.levantamiento_id || null);
      setIncluirFotos(!!cot.incluir_fotos);
      setCotGuardada(isCloning ? null : cot);
      if (!isCloning) { setFolioGenerado(cot.folio); setFechaEmision(cot.created_at); setCapturarFirma(true); }
      else            { obtenerUltimoFolio(); setFechaEmision(null); setFirmaGuardada(null); }
    }
    setLoading(false);
  }

  const totals = useMemo(() => calcularTotals(items, descuentoPorcentajeMO), [items, descuentoPorcentajeMO]);

  // ── Cambios sin guardar ──
  // Huella del contenido que importa. Si difiere de lo último guardado/cargado,
  // se avisa antes de cerrar la pestaña o salir por el menú (antes se perdía la
  // cotización sin aviso).
  const firmaContenido = useMemo(() => JSON.stringify({
    c: clienteSeleccionado?.id || null, items, partidas,
    d: descripcionGeneral, g: garantia, cc: condicionesComerciales,
    m: moneda, uf: valorUF, dmo: descuentoPorcentajeMO,
    os: ocultarSuministros, md: mostrarDetalle, s: supuestos,
  }), [clienteSeleccionado, items, partidas, descripcionGeneral, garantia, condicionesComerciales,
       moneda, valorUF, descuentoPorcentajeMO, ocultarSuministros, mostrarDetalle, supuestos]);

  // Tras cargar una cotización existente, su contenido cuenta como "guardado".
  useEffect(() => {
    if (capturarFirma && !loading) { setFirmaGuardada(firmaContenido); setCapturarFirma(false); }
  }, [capturarFirma, loading, firmaContenido]);

  const hayCambios = items.length > 0 && firmaGuardada !== firmaContenido;

  useEffect(() => {
    marcarSinGuardar(hayCambios);
    if (!hayCambios) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [hayCambios]);
  useEffect(() => () => marcarSinGuardar(false), []);

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

  /** Valor de la UF de hoy desde mindicador.cl (API pública, sin key). 0 si falla. */
  const obtenerUFHoy = useCallback(async (): Promise<number> => {
    try {
      const res = await fetch('https://mindicador.cl/api/uf');
      const data = await res.json();
      const v = Number(data?.serie?.[0]?.valor || 0);
      return v > 0 ? Math.round(v * 100) / 100 : 0;   // la UF tiene 2 decimales
    } catch {
      return 0;
    }
  }, []);

  const traerUF = useCallback(async () => {
    setCargandoUF(true);
    const val = await obtenerUFHoy();
    setCargandoUF(false);
    if (val > 0) { setValorUF(val); success(`UF de hoy: ${formatMoneda(val, 'CLP')} (${formatMiles(val)})`); }
    else warning('No se pudo obtener la UF; ingrésala manualmente.');
  }, [obtenerUFHoy, success, warning]);

  /**
   * Cambia la moneda CONVIRTIENDO los montos ya cargados con el valor de la UF.
   * Antes solo cambiaba la etiqueta: un ítem de $45.000 pasaba a mostrarse como
   * "UF 45.000,00". Si no hay valor de UF lo trae de internet o lo pide.
   */
  const cambiarMoneda = useCallback(async (nueva: Moneda) => {
    if (nueva === moneda) return;
    if (items.length === 0) { setMoneda(nueva); return; }
    let uf = valorUF;
    if (!(uf > 0)) {
      setCargandoUF(true);
      uf = await obtenerUFHoy();
      setCargandoUF(false);
      if (!(uf > 0)) {
        const txt = typeof window !== 'undefined' ? window.prompt('No se pudo obtener la UF de hoy. Ingresa el valor de la UF en pesos (ej: 39.485,65):') : null;
        uf = cleanNumber(txt || '');
      }
      if (!(uf > 0)) { warning('Sin valor de UF no se pueden convertir los montos. No se cambió la moneda.'); return; }
      setValorUF(uf);
    }
    setItems(prev => convertirItemsMoneda(prev, moneda, nueva, uf));
    setMoneda(nueva);
    success(`Montos convertidos a ${nueva} (UF = ${formatMoneda(uf, 'CLP')}). Revisa los precios.`);
  }, [moneda, items.length, valorUF, obtenerUFHoy, success, warning]);

  /**
   * Los precios de la biblioteca/recetas están en pesos. Si la cotización está en
   * UF se convierten; sin valor de UF se bloquea (evita mezclar monedas). Devuelve
   * null cuando no se debe insertar.
   */
  const aMonedaCotizacion = useCallback((nuevos: CotizacionItem[]): CotizacionItem[] | null => {
    if (moneda !== 'UF') return nuevos;
    if (!(valorUF > 0)) {
      warning('La cotización está en UF: carga el valor de la UF (botón "Hoy") antes de agregar desde la biblioteca.');
      return null;
    }
    return convertirItemsMoneda(nuevos, 'CLP', 'UF', valorUF);
  }, [moneda, valorUF, warning]);

  const addItem = useCallback((categoria: CategoriaItem = 'material') => {
    // Se agrega AL FINAL (donde están los botones), para que aparezca justo
    // donde hiciste clic y la vista no salte hacia arriba.
    setItems(prev => [...prev, newItem({ categoria }, supuestos)]);
  }, [supuestos]);

  /** Inserta ítems del catálogo (a una partida destino si hay, o sueltos). */
  const insertarDesdeBiblioteca = useCallback((nuevosCLP: CotizacionItem[], mensaje: string) => {
    if (nuevosCLP.length === 0) return;
    const nuevos = aMonedaCotizacion(nuevosCLP);
    if (!nuevos) return;
    const conPartida = partidaDestino ? nuevos.map(i => ({ ...i, partidaId: partidaDestino })) : nuevos;
    setItems(prev => [...prev, ...conPartida]);
    setShowBiblioteca(false);
    setPartidaDestino(null);
    success(mensaje);
  }, [success, partidaDestino, aMonedaCotizacion]);

  /** Inserta una receta: como partida nueva, o dentro de la partida destino. */
  const insertarReceta = useCallback((receta: RecetaConComponentes, cantidad: number) => {
    const { partida, items: nuevosCLP } = partidaDesdeReceta(receta, cantidad, supuestos);
    const nuevos = aMonedaCotizacion(nuevosCLP);
    if (!nuevos) return;
    if (partidaDestino) {
      const conPartida = nuevos.map(i => ({ ...i, partidaId: partidaDestino }));
      setItems(prev => [...prev, ...conPartida]);
      success(`${nuevos.length} materiales agregados a la partida`);
    } else {
      setPartidas(prev => [...prev, partida]);
      setItems(prev => [...prev, ...nuevos]);
      success(`Partida "${partida.nombre}" × ${cantidad} agregada (${nuevos.length} materiales internos)`);
    }
    setShowBiblioteca(false);
    setPartidaDestino(null);
  }, [partidaDestino, supuestos, success, aMonedaCotizacion]);

  /**
   * Inserta el borrador generado por IA: cada partida se crea como Partida de
   * proyecto y sus componentes como ítems internos. Los costos vienen en CLP; si
   * la cotización está en UF se convierten con el valor cargado. El precio de
   * venta se deriva con los márgenes/imprevistos de los supuestos por categoría.
   */
  const insertarDesdeIA = useCallback((partidasIA: PartidaIAResuelta[]) => {
    // Los costos vienen en pesos: en UF sin valor de UF se mezclarían monedas.
    if (moneda === 'UF' && !(valorUF > 0)) {
      warning('La cotización está en UF: carga el valor de la UF (botón "Hoy") y vuelve a insertar.');
      return;
    }
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
  }, [moneda, valorUF, supuestos, success, warning]);

  /**
   * Flujo Solicitud → Cotización: toma el ANÁLISIS de IA que YA hizo la solicitud
   * (necesidades + ítems sugeridos) y lo inserta directamente en el cotizador,
   * SIN volver a llamar a la IA. Matchea el catálogo para traer precios reales;
   * el usuario revisa, ajusta y guarda.
   */
  async function generarBorradorDesdeSolicitud(sol: Solicitud) {
    const analisis = sol.analisis_ia;
    if (!analisis || !analisis.items_sugeridos?.length) {
      toastError('La solicitud aún no tiene análisis de IA con ítems. Analízala primero, o cotiza manualmente.');
      return;
    }
    setGenerandoIA(true);
    try {
      let catalogo: CatalogoItem[] = [];
      try { catalogo = await catalogoService.getAll(false); } catch { /* sin catálogo: precios en 0 para completar */ }
      const nombre = analisis.necesidades?.[0]?.titulo || 'Propuesta técnica';
      const partidas = borradorDesdeAnalisis(analisis, catalogo, nombre);
      if (!partidas.length) { toastError('El análisis no tiene ítems para insertar.'); return; }
      insertarDesdeIA(partidas);
    } finally {
      setGenerandoIA(false);
    }
  }

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

        // Busca una columna por varios nombres posibles (tolerante al Excel origen)
        const pick = (r: any, ...claves: string[]) => {
          for (const k of claves) {
            if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k];
          }
          return undefined;
        };
        const pct = (v: unknown, fallback: number) => {
          if (v === undefined) return fallback;
          const n = cleanNumber(v);
          return n > 0 && n <= 1 ? n * 100 : n; // 0.2 → 20
        };
        const numOrU = (v: unknown) => (v === undefined || v === '' ? undefined : cleanNumber(v));

        // Hoja de ítems (la que no es Partidas/Resumen/Supuestos) y hoja de Partidas.
        const nombreItems = wb.SheetNames.find(n => /cotiz|item|presup/i.test(n))
          || wb.SheetNames.find(n => !/partida|resumen|supuesto/i.test(n))
          || wb.SheetNames[0];
        const nombrePartidasHoja = wb.SheetNames.find(n => /partida/i.test(n));
        const raw: any[] = XLSX.utils.sheet_to_json(wb.Sheets[nombreItems]);
        const rawPartidas: any[] = nombrePartidasHoja ? XLSX.utils.sheet_to_json(wb.Sheets[nombrePartidasHoja]) : [];

        // ── Partidas: se crean por NOMBRE (metadata desde la hoja "Partidas" si existe) ──
        const partidasPorNombre = new Map<string, Partida>();
        const nuevasPartidas: Partida[] = [];
        const asegurarPartida = (nombre: string): Partida => {
          const key = nombre.trim().toLowerCase();
          let p = partidasPorNombre.get(key);
          if (p) return p;
          const meta = rawPartidas.find(rp => String(pick(rp, 'Partida', 'Nombre', 'partida') ?? '').trim().toLowerCase() === key);
          p = {
            id: newId(),
            nombre: nombre.trim(),
            cantidad: meta ? (cleanNumber(pick(meta, 'Cantidad', 'cantidad')) || 1) : 1,
            unidad: meta ? String(pick(meta, 'Unidad', 'unidad') ?? 'un') : 'un',
            descripcion: meta ? (String(pick(meta, 'Descripción', 'Descripcion', 'descripcion') ?? '') || undefined) : undefined,
            modoPrecio: (meta && /marg/i.test(String(pick(meta, 'Modo precio', 'ModoPrecio', 'modo') ?? ''))) ? 'margen' : 'items',
            margen: meta ? numOrU(pick(meta, 'Margen (%)', 'Margen', 'margen')) : undefined,
            imprevistos: meta ? numOrU(pick(meta, '% Imprevistos', 'Imprevistos', 'imprevistos')) : undefined,
            iva: meta ? numOrU(pick(meta, 'IVA (%)', 'IVA', 'iva')) : undefined,
          };
          partidasPorNombre.set(key, p);
          nuevasPartidas.push(p);
          return p;
        };
        // Registra primero las partidas de la hoja "Partidas" (aunque no tengan ítems)
        for (const rp of rawPartidas) {
          const nombre = String(pick(rp, 'Partida', 'Nombre', 'partida') ?? '').trim();
          if (nombre) asegurarPartida(nombre);
        }

        // ── Ítems ──
        const newItems: CotizacionItem[] = raw
          .map(r => {
            const descripcion = String(pick(r, 'Descripcion', 'Descripción', 'Descripción / Ítem', 'descripcion') ?? '').trim();
            if (!descripcion) return null;

            const categoria = parseCategoria(pick(r, 'Categoria', 'Categoría', 'categoria'));
            const s = supuestos[categoria];
            const costo    = cleanNumber(pick(r, 'Costo unitario', 'Costo Unit. (CLP)', 'Costo Unit.', 'costo'));
            const cantidad = cleanNumber(pick(r, 'Cantidad', 'cantidad')) || 1;
            const imprevistos = pct(pick(r, '% Imprevistos', 'Imprevistos', 'imprevistos'), s.imprevistos);
            const margen      = pct(pick(r, 'Margen (%)', 'Margen %', 'margen'), s.margen);
            const ivaRaw      = pick(r, 'IVA (%)', 'IVA %', 'iva');
            const iva         = ivaRaw !== undefined ? pct(ivaRaw, s.iva) : s.iva;
            const precioRaw   = cleanNumber(pick(r, 'Precio venta', 'Precio Venta', 'precio'));
            const precio      = precioRaw > 0 ? precioRaw : Math.round(precioDesdeMargen(costo, margen, imprevistos));

            // Partida (columna "Partida"): si viene, se agrupa y se enlaza.
            const nombrePartida = String(pick(r, 'Partida', 'partida') ?? '').trim();
            const extra: Partial<CotizacionItem> = {};
            if (nombrePartida) {
              const p = asegurarPartida(nombrePartida);
              extra.partidaId = p.id;
              extra.cantidadPorUnidad = (p.cantidad && p.cantidad > 0) ? cantidad / p.cantidad : cantidad;
            }

            return newItem({
              descripcion, categoria, cantidad, costo, imprevistos, margen, iva, precio,
              unidad: String(pick(r, 'Unidad', 'unidad') ?? 'un'), ...extra,
            }, supuestos);
          })
          .filter((x): x is CotizacionItem => x !== null);

        if (newItems.length === 0 && nuevasPartidas.length === 0) {
          warning('No se encontraron ítems válidos. Descarga la plantilla para ver el formato.');
          return;
        }
        if (nuevasPartidas.length > 0) setPartidas(prev => [...prev, ...nuevasPartidas]);
        setItems(prev => [...prev, ...newItems]);
        success(`Importado: ${nuevasPartidas.length} partida${nuevasPartidas.length === 1 ? '' : 's'} y ${newItems.length} ítems`);
      } catch {
        toastError('Error al procesar el archivo Excel. Verifica el formato.');
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  /** Descarga una plantilla Excel con el formato de partidas + ítems. */
  const descargarPlantilla = () => {
    const wb = XLSX.utils.book_new();
    const ejItems = [
      { Partida: 'Habilitación de tablero', Descripcion: 'Tablero eléctrico 12 polos', Categoria: 'material', Cantidad: 1, Unidad: 'un', 'Costo unitario': 45000, '% Imprevistos': 10, 'Margen (%)': 20, 'IVA (%)': 19 },
      { Partida: 'Habilitación de tablero', Descripcion: 'Instalación y conexionado', Categoria: 'mano_obra', Cantidad: 1, Unidad: 'global', 'Costo unitario': 60000, '% Imprevistos': 15, 'Margen (%)': 40, 'IVA (%)': 19 },
      { Partida: 'Puntos de enchufe', Descripcion: 'Enchufe doble 10A', Categoria: 'material', Cantidad: 8, Unidad: 'un', 'Costo unitario': 3500, '% Imprevistos': 10, 'Margen (%)': 20, 'IVA (%)': 19 },
      { Partida: '', Descripcion: 'Flete y movilización (ítem suelto)', Categoria: 'operacion', Cantidad: 1, Unidad: 'global', 'Costo unitario': 20000, '% Imprevistos': 0, 'Margen (%)': 15, 'IVA (%)': 19 },
    ];
    const ejPartidas = [
      { Partida: 'Habilitación de tablero', Cantidad: 1, Unidad: 'un', 'Descripción': 'Suministro y montaje de tablero eléctrico', 'Modo precio': 'items', 'Margen (%)': '', '% Imprevistos': '', 'IVA (%)': '' },
      { Partida: 'Puntos de enchufe', Cantidad: 8, Unidad: 'un', 'Descripción': 'Suministro e instalación de puntos de enchufe', 'Modo precio': 'items', 'Margen (%)': '', '% Imprevistos': '', 'IVA (%)': '' },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ejItems), 'Cotización');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ejPartidas), 'Partidas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Campo: 'Partida', Detalle: 'Nombre de la partida a la que pertenece el ítem. Déjalo vacío para "ítems sueltos".' },
      { Campo: 'Categoria', Detalle: 'material, mano_obra, servicio u operacion.' },
      { Campo: 'Hoja Partidas', Detalle: 'Opcional: define cantidad/unidad/descripción de cada partida. Si falta, se asume cantidad 1, unidad "un".' },
    ]), 'Instrucciones');
    XLSX.writeFile(wb, 'Plantilla_cotizacion_InnVolt.xlsx');
  };

  const exportExcel = () => {
    if (items.length === 0) { warning('Agrega ítems antes de exportar'); return; }
    const wb = XLSX.utils.book_new();

    // Hoja 1 — Detalle de ítems (incluye columna Partida) con la cadena de costeo
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemsToExcelRows(items, partidas)), 'Cotización');

    // Hoja Partidas — metadatos de cada partida (para reimportar tal cual)
    if (partidas.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        partidas.map(p => ({
          'Partida': p.nombre || 'Partida',
          'Cantidad': p.cantidad || 1,
          'Unidad': p.unidad || 'un',
          'Descripción': p.descripcion || '',
          'Modo precio': p.modoPrecio || 'items',
          'Margen (%)': p.margen ?? '',
          '% Imprevistos': p.imprevistos ?? '',
          'IVA (%)': p.iva ?? '',
        })),
      ), 'Partidas');
    }

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
    // Sin valor de UF el total en pesos quedaba en 0 y la venta no contaba en el dashboard.
    if (moneda === 'UF' && !(valorUF > 0)) { warning('Ingresa el valor de la UF (botón "Hoy") antes de guardar.'); return; }
    setLoading(true);
    const firmaAlGuardar = firmaContenido;
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
      // OJO: el estado NO va aquí. Al editar se conserva el actual; antes se
      // forzaba 'Pendiente' y una cotización Aceptada (venta) volvía a Pendiente.
      ocultar_suministros: ocultarSuministros,
      // Relación con la solicitud de origen (solo si vino de ese flujo).
      ...(solicitudOrigen ? { solicitud_id: solicitudOrigen.id } : {}),
    };
    // Campos nuevos (requieren supabase_mejoras_comerciales.sql). Si la base aún no
    // los tiene, se guarda igual sin ellos y se avisa.
    const extras = levantamientoId ? { levantamiento_id: levantamientoId, incluir_fotos: incluirFotos } : {};
    const esEdicion = !!(editId && !cloneId);
    const persistir = (p: typeof payload & Partial<typeof extras>) =>
      esEdicion ? cotizacionesService.update(editId as string, p) : cotizacionesService.create({ ...p, estado: 'Pendiente' });
    try {
      let result: Cotizacion;
      try {
        result = await persistir({ ...payload, ...extras });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message || '');
        if (!Object.keys(extras).length || !/column|schema cache/i.test(msg)) throw err;
        result = await persistir(payload);
        warning('Guardada sin el vínculo al levantamiento: ejecuta supabase_mejoras_comerciales.sql en Supabase.');
      }
      setCotGuardada(result);
      if (esEdicion) {
        success('Cotización actualizada correctamente');
      } else {
        success('Cotización guardada correctamente');
        // Vincula la cotización recién creada a su solicitud de origen.
        if (solicitudOrigen) {
          try {
            await solicitudesService.vincularCotizacion(solicitudOrigen.id, result.id, result.folio, solicitudOrigen.historial);
            setSolicitudOrigen({ ...solicitudOrigen, cotizacion_id: result.id, estado: 'COTIZACION_GENERADA' });
          } catch { /* la cotización ya quedó guardada; el vínculo es best-effort */ }
        }
      }
      setFolioGenerado(result.folio);
      setFirmaGuardada(firmaAlGuardar);
      if (!fechaEmision) setFechaEmision(result.created_at);
      if (!editId || cloneId) router.replace(`/cotizador?edit=${result.id}`);
    } catch (e: any) {
      toastError('Error al guardar: ' + (e?.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const nuevoPresupuesto = () => {
    if (!confirmarSalida()) return;
    setFechaEmision(null);
    setFirmaGuardada(null);
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
    setSolicitudOrigen(null);
    setLevantamientoId(null);
    setIncluirFotos(false);
    setCotGuardada(null);
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
          fechaEmision={fechaEmision} hayCambios={hayCambios} onGuardar={handleGuardar}
          levantamientoId={levantamientoId} incluirFotos={incluirFotos}
          onEnviar={cotGuardada ? () => { setShowPDFModal(false); setShowEnviar(true); } : undefined}
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

      {generandoIA && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '1.5rem 1.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', maxWidth: 340 }}>
            <Loader2 size={20} className="iv-spin" style={{ color: 'var(--y)', flexShrink: 0 }} />
            <span style={{ color: 'var(--text)', fontSize: '0.9rem' }}>Generando borrador desde el análisis de la solicitud…</span>
          </div>
        </div>
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
          onRestaurarBase={() => { setGarantia(defGarantia); setCondicionesComerciales(defCondiciones); }}
        />
      )}

      {showEnviar && cotGuardada && clienteSeleccionado && (
        <EnviarCotizacionModal
          cot={{ ...cotGuardada, total: totals.total, moneda, clientes: clienteSeleccionado }}
          empresaNombre={empresaSelec?.nombre || 'InnVolt'}
          onClose={() => setShowEnviar(false)}
          onCambio={() => { if (editId) cotizacionesService.getById(editId).then(c => c && setCotGuardada(c)); }}
        />
      )}

      {showOpciones && (
        <OpcionesModal
          ocultarSuministros={ocultarSuministros}
          ocultarCostos={ocultarCostos}
          mostrarDetalle={mostrarDetalle}
          incluirFotos={levantamientoId ? incluirFotos : null}
          onToggle={(campo) => {
            if (campo === 'ocultarSuministros') setOcultarSuministros(v => !v);
            else if (campo === 'ocultarCostos') setOcultarCostos(v => !v);
            else if (campo === 'incluirFotos') setIncluirFotos(v => !v);
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
      <div className="pg-header">
        <div style={{ minWidth: 0 }}>
          <p className="pg-eyebrow">{cloneId ? 'Clonando' : (isEditing ? 'Editando' : 'Nueva')} cotización</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <h1 className="pg-title">Cotizador</h1>
            <span className="tabular" style={{ marginTop: 4, background: hasFolio ? 'var(--y-brand)' : 'var(--bg3)', color: hasFolio ? 'var(--on-accent)' : 'var(--muted)', fontWeight: 700, fontSize: '0.8rem', padding: '0.25rem 0.65rem', borderRadius: 999, border: hasFolio ? 'none' : '1px solid var(--border2)' }}>
              {formatFolio(folioGenerado || proximoFolio)}
            </span>
          </div>
          {clienteSeleccionado && <p className="pg-subtitle">{clienteSeleccionado.nombre_cliente}{clienteSeleccionado.empresa ? ` · ${clienteSeleccionado.empresa}` : ''}</p>}
        </div>

        <div className="pg-actions">
          <button onClick={nuevoPresupuesto} className="btn btn-ghost btn-sm"><RefreshCcw size={13} /> Nuevo</button>
          <Link href="/cotizador/historial" onClick={e => { if (!confirmarSalida()) e.preventDefault(); }} className="btn btn-ghost btn-sm">
            <History size={13} /> Historial
          </Link>
          <button onClick={() => fileInputRef.current?.click()} className="btn btn-ghost btn-sm" title="Importar partidas e ítems desde Excel">
            <FileUp size={13} /> Excel
          </button>
          <button onClick={descargarPlantilla} className="btn btn-ghost btn-sm" title="Descargar plantilla Excel (partidas + ítems)">
            <FileText size={13} /> Plantilla
          </button>
          {hasFolio && (
            <button
              onClick={() => {
                if (!empresaSelec) { warning('Selecciona una empresa emisora primero'); return; }
                setShowPDFModal(true);
              }}
              className="btn btn-ghost btn-sm"
            >
              <Download size={13} /> PDF y envío
            </button>
          )}
          <button onClick={handleGuardar} disabled={loading} className="btn btn-primary btn-sm">
            {loading ? <Loader2 size={13} className="iv-spin" /> : <Save size={13} />}
            {isEditing ? 'Actualizar' : 'Guardar cotización'}
            {hayCambios && !loading && (
              <span title="Hay cambios sin guardar" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--danger)', boxShadow: '0 0 0 2px var(--on-accent)', marginLeft: 2 }} />
            )}
          </button>
        </div>
      </div>

      {/* Origen: solicitud que dio pie a esta cotización (flujo Solicitud → IA). */}
      {solicitudOrigen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', background: 'var(--y-soft)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '0.5rem 0.8rem', marginBottom: '1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
          <Inbox size={13} style={{ color: 'var(--y)', flexShrink: 0 }} />
          <span>Cotización originada por la solicitud <b style={{ color: 'var(--text)' }}>SOL-{new Date(solicitudOrigen.created_at).getFullYear()}-{String(solicitudOrigen.folio).padStart(4, '0')}</b></span>
          <Link href="/solicitudes" style={{ marginLeft: 'auto', color: 'var(--y)', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            Ver solicitud <ExternalLink size={12} />
          </Link>
        </div>
      )}

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
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', color: 'var(--y)', margin: 0 }}>{clienteSeleccionado.nombre_cliente}</p>
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
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.76rem', color: 'var(--muted)' }}>Moneda</span>
            <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
              {(['CLP', 'UF'] as Moneda[]).map(m => (
                <button key={m} onClick={() => cambiarMoneda(m)} disabled={cargandoUF} style={{
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
                <div style={{ width: 96 }}>
                  <NumeroInput value={valorUF} onChange={setValorUF} min={0} placeholder="39.485,65" title="Valor de la UF en pesos (para la equivalencia en CLP)"
                    style={{ width: '100%', height: 32, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: 'var(--r-sm)', padding: '0 0.5rem', fontSize: '0.8rem', textAlign: 'right' }} />
                </div>
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
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.78rem', color: 'var(--y)' }}>
              Presupuesto
            </span>

            {/* ── Acción principal: por partida ── */}
            <button
              onClick={addPartida}
              title="Crear una partida de proyecto (agrupa materiales/MO/servicios en una línea comercial)"
              style={{ background: 'var(--y-brand)', color: 'var(--on-accent)', border: 'none', cursor: 'pointer', height: 32, borderRadius: 'var(--r-sm)', padding: '0 0.85rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
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
              <span style={{ fontSize: '0.72rem', color: 'var(--faint)', fontWeight: 700 }}>Sueltos</span>
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
                <button onClick={addPartida} style={{ background: 'var(--y-brand)', color: 'var(--on-accent)', border: 'none', cursor: 'pointer', height: 40, borderRadius: 'var(--r-sm)', padding: '0 1.1rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
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
                <span style={{ fontSize: '0.74rem', color: 'var(--faint)', alignSelf: 'center', fontWeight: 700 }}>o suelto:</span>
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
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.74rem', color: 'var(--muted)', marginTop: '0.3rem' }}>Ítems sueltos</span>
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
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', color: CAT_COLORS[cat] }}>
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
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>Costo directo</span>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--muted)' }}>{fmt(totals.costoTotal)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--orange)', fontFamily: 'var(--font-display)' }}>+ Imprevistos</span>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--orange)' }}>{fmt(totals.montoImprevistos)}</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>Total neto</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>{fmt(totals.netoGeneral)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>IVA</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--muted)' }}>{fmt(totals.ivaGeneral)}</span>
                  </div>
                  <div style={{ padding: '0.6rem 0.75rem', background: 'var(--bg3)', borderTop: '2px solid var(--y-brand)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 'var(--r-sm)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>Total final</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.4rem', color: 'var(--y)' }}>{fmt(totals.total)}</span>
                  </div>
                  {!ocultarCostos && totals.utilidadEstimada > 0 && (
                    <div style={{ padding: '0.4rem 0.6rem', background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 'var(--r-sm)' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--success)', fontFamily: 'var(--font-display)' }}>Utilidad estimada</span>
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
