import React from 'react';
import {
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer';
import type { CotizacionItem, Cliente, Partida } from '@/types';
import { boldPorLinea, formatDate, fechaLocal, sumarDias, diasValidez, type Totals } from '@/utils';

/** Logo con tinta oscura: es el que contrasta sobre el papel blanco del PDF. */
const LOGO_PDF = '/InnVolt-transparente-claro.png';

/** Solo se aplica el logo por defecto si la empresa emisora es InnVolt. */
const esInnVolt = (nombre: string) =>
  nombre.toLowerCase().replace(/[^a-z]/g, '').includes('innvolt');

/**
 * Convierte un texto multilínea del cotizador en viñetas para el PDF.
 * Quita los "•" o "-" iniciales (el PDF pone su propio símbolo) y
 * descarta las líneas vacías.
 */
/**
 * Líneas de aclaraciones PRESERVANDO su estructura: no quita los prefijos
 * "1)" (títulos) ni "a." (cláusulas); solo aplica negrita por línea y descarta
 * líneas vacías. Se usa para el bloque editable de garantía/condiciones.
 */
const lineasClausula = (texto?: string): string[] =>
  boldPorLinea(texto || '')
    .split('\n')
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => l.trim() !== '');

// ─── Paleta INNVOLT (sobria: negro + blanco + gris, amarillo como único acento) ─
const INK      = '#1a1a1a';  // texto principal / bloques oscuros
const DARK      = '#232323';  // bloques rellenos (folio, tabla, total)
const SPARK    = '#ffc600';  // amarillo del logo — único acento
const WHITE     = '#ffffff';
const MUTED    = '#565656';  // texto secundario
const FAINT     = '#8a8a8a';  // texto terciario
const LINE      = '#e2e2e2';  // bordes/separadores suaves
const TINT      = '#f6f6f4';  // fondo tarjetas (gris cálido muy claro)
const TINT_ALT  = '#fbfbfa';  // fila alterna de tabla

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    backgroundColor: WHITE,
    color: INK,
    fontFamily: 'Helvetica',
    fontSize: 8.5,
    paddingTop: 24,
    paddingBottom: 44,
  },

  // ── Barra de acento superior (negro + remate amarillo, como el logo) ──
  accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, flexDirection: 'row' },
  accentDark: { flex: 1, backgroundColor: INK },
  accentSpark: { width: 80, backgroundColor: SPARK },

  // ── Header ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '4 32 14 32',
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  logoBlock: { flex: 1, paddingRight: 16 },
  logoImage: { width: 148, objectFit: 'contain', marginBottom: 8 },
  logoName: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: 0.5, marginBottom: 8 },
  companyName: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 3 },
  companyLine: { fontSize: 7.5, color: MUTED, marginBottom: 1.5, lineHeight: 1.3 },

  // Tarjeta de folio (negra)
  folioCard: { backgroundColor: DARK, borderRadius: 6, padding: '11 18', minWidth: 158, alignItems: 'center' },
  folioLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: SPARK, letterSpacing: 2.5, marginBottom: 4 },
  folioNum: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: WHITE },
  folioDivider: { height: 1, backgroundColor: '#454545', width: '100%', marginVertical: 6 },
  folioDate: { fontSize: 7.5, color: '#cfcfcf' },

  // ── Cliente / Descripción (tarjetas) ──
  card: {
    margin: '14 32 0 32',
    padding: '10 14',
    backgroundColor: TINT,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: SPARK,
  },
  cardLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: 2, marginBottom: 6 },
  parteNombre: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 3 },
  parteKey: { fontSize: 6.5, color: FAINT, letterSpacing: 0.5, marginBottom: 0.5, textTransform: 'uppercase' },
  parteVal: { fontSize: 8, color: INK, marginBottom: 4 },

  descText: { fontSize: 8, color: '#333333', lineHeight: 1.55 },
  descBulletRow: { flexDirection: 'row', marginBottom: 2 },
  descBullet: { fontSize: 8, color: MUTED, width: 10 },

  // ── Resumen por partida ──
  resRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 3.5, borderBottomWidth: 1, borderBottomColor: LINE },
  resNum: { width: 16, fontSize: 8, color: MUTED },
  resName: { flex: 1, fontSize: 8.5, color: INK, paddingRight: 8 },
  resVal: { width: 90, textAlign: 'right', fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: INK },
  resTotalRow: { flexDirection: 'row', paddingTop: 6, alignItems: 'center' },
  resTotalLabel: { flex: 1, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: INK, textAlign: 'right', paddingRight: 8 },
  resTotalVal: { width: 90, textAlign: 'right', fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: INK },

  // ── Título de sección de página (p. ej. "Detalle") ──
  pageTitle: {
    fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: 2,
    marginBottom: 8, paddingBottom: 5, borderBottomWidth: 1.5, borderBottomColor: INK,
  },

  // ── Tabla ──
  content: { padding: '2 32 0 32' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: DARK,
    padding: '6 8',
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  tableHeaderText: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: WHITE, letterSpacing: 0.8 },
  tableRow: {
    flexDirection: 'row',
    padding: '7 8',
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  tableRowAlt: { backgroundColor: TINT_ALT },
  tableCell: { fontSize: 8, color: INK },
  tableCellMuted: { fontSize: 7.5, color: MUTED },
  catBadge: { fontSize: 5.5, fontFamily: 'Helvetica-Bold', color: FAINT, letterSpacing: 1, marginTop: 2 },

  colNum: { width: 18, textAlign: 'center' },
  colServicio: { flex: 1, paddingRight: 6 },
  colUnidad: { width: 44, textAlign: 'center' },
  colQty: { width: 44, textAlign: 'center' },
  colValor: { width: 70, textAlign: 'right' },
  colTotal: { width: 76, textAlign: 'right' },

  // ── Inversión total (página 1): lo primero que mira el cliente ──
  inversionBox: {
    margin: '14 32 0 32',
    flexDirection: 'row',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: DARK,
  },
  inversionLeft: { flex: 1, backgroundColor: DARK, padding: '12 16', justifyContent: 'center' },
  inversionLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: SPARK, letterSpacing: 2.5, marginBottom: 4 },
  inversionTotal: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: WHITE },
  inversionSub: { fontSize: 7.5, color: '#cfcfcf', marginTop: 3 },
  inversionRight: { width: 190, backgroundColor: TINT, padding: '10 14', justifyContent: 'center' },
  inversionKey: { fontSize: 6.5, color: FAINT, letterSpacing: 0.5, textTransform: 'uppercase' },
  inversionVal: { fontSize: 8.5, color: INK, fontFamily: 'Helvetica-Bold', marginBottom: 5 },

  // ── Totales ──
  totalesBox: { marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-start' },
  composicionBox: { flex: 1, marginRight: 18, paddingTop: 2 },
  composicionTitulo: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: FAINT, letterSpacing: 1.5, marginBottom: 4 },
  composicionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5, borderBottomWidth: 0.5, borderBottomColor: LINE },
  composicionLabel: { fontSize: 7, color: MUTED },
  composicionVal: { fontSize: 7, color: INK },

  // ── Datos de pago / aceptación (página final) ──
  pagoBox: {
    margin: '16 32 0 32', padding: '10 14', borderRadius: 6,
    borderWidth: 1, borderColor: LINE, flexDirection: 'row',
  },
  pagoCol: { flex: 1, paddingRight: 10 },
  pagoTitulo: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: 2, marginBottom: 6 },
  pagoKey: { fontSize: 6.5, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.5 },
  pagoVal: { fontSize: 8, color: INK, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  aceptaText: { fontSize: 7.5, color: MUTED, lineHeight: 1.5 },

  // ── Registro fotográfico (2 por fila) ──
  fotosGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  fotoBox: { width: '48.5%', marginBottom: 12 },
  foto: { width: '100%', height: 185, objectFit: 'cover', borderRadius: 4 },
  fotoCaption: { fontSize: 7.5, color: MUTED, marginTop: 4 },
  totalesInner: { width: 240, borderWidth: 1, borderColor: LINE, borderRadius: 6, overflow: 'hidden' },
  totalesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: '5 12',
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  totalesLabel: { fontSize: 7.5, color: MUTED },
  totalesValue: { fontSize: 8, color: INK, fontFamily: 'Helvetica-Bold' },
  totalFinalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '9 12',
    backgroundColor: DARK,
    borderTopWidth: 2,
    borderTopColor: SPARK,
  },
  totalFinalLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: WHITE, letterSpacing: 1 },
  totalFinalValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: WHITE },

  // ── Importante ──
  importanteBox: {
    margin: '16 32 0 32',
    borderRadius: 6,
    padding: '10 14',
    backgroundColor: TINT,
    borderLeftWidth: 3,
    borderLeftColor: SPARK,
  },
  importanteLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    letterSpacing: 2,
    marginBottom: 5,
  },
  importanteText: { fontSize: 7.5, color: MUTED, lineHeight: 1.6 },

  // ── Secciones cláusulas ──
  seccionBox: { margin: '14 32 0 32' },
  seccionTitulo: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    letterSpacing: 0.5,
    marginBottom: 9,
    paddingBottom: 5,
    borderBottomWidth: 1.5,
    borderBottomColor: INK,
  },
  seccionSubtitulo: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    marginTop: 9,
    marginBottom: 4,
  },
  // Encabezado de bloque dentro de Aclaraciones (GARANTÍA / CONDICIONES COMERCIALES)
  bloqueHeader: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    letterSpacing: 0.8,
    marginTop: 11,
    marginBottom: 5,
    paddingBottom: 3,
    borderBottomWidth: 0.75,
    borderBottomColor: LINE,
  },
  clausulaRow: { flexDirection: 'row', marginBottom: 3.5 },
  clausulaLetra: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: MUTED, width: 14 },
  clausulaTexto: { fontSize: 7.5, color: '#333333', flex: 1, lineHeight: 1.55 },

  // ── Firma ── Fluye justo tras las cláusulas con un espacio fijo. No se usa
  // justifyContent/space-between ni marginTop:auto (eso "corría" la firma cuando
  // el texto era largo y saltaba de página).
  firmaContainer: {
    marginTop: 30,
    marginHorizontal: 32,
    marginBottom: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  firmaCol: { width: 220, alignItems: 'center' },
  firmaLinea: { width: '100%', borderTopWidth: 1, borderTopColor: INK, marginBottom: 8 },
  firmaNombreText: { color: INK, fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  firmaMutedText: { color: MUTED, fontSize: 7 },
  // Alto reservado sobre la línea: la firma digital del cliente (o un espacio igual en la
  // columna de la empresa, para que ambas líneas queden a la misma altura).
  firmaImagen: { height: 48, width: 170, objectFit: 'contain', marginBottom: 2 },
  firmaEspacio: { height: 50 },

  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: WHITE,
    padding: '8 32',
    borderTopWidth: 1,
    borderTopColor: LINE,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerBrand: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: SPARK },
  footerLeft: { fontSize: 6.5, color: MUTED, fontFamily: 'Helvetica-Bold' },
  footerRight: { fontSize: 6.5, color: FAINT },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', minimumFractionDigits: 0,
  }).format(n || 0);

/** Valor de la UF en pesos con sus 2 decimales ("$39.485,65"). */
const fmtValorUF = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const fmtUFn = (n: number) =>
  `UF ${new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)}`;

type Moneda = 'CLP' | 'UF';
/** Devuelve un formateador según la moneda de la cotización. */
const fmtMoneda = (moneda: Moneda) => (n: number) => (moneda === 'UF' ? fmtUFn(n) : fmtCLP(n));

/** Cantidad legible (máx. 2 decimales, formato chileno): 0.3333 → "0,33". */
const fmtCant = (n: number) =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(n || 0);


/** Divide un texto en segmentos según **negrita** (marcadores estilo markdown). */
const parseInline = (text: string): { t: string; b: boolean }[] => {
  const parts: { t: string; b: boolean }[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: text.slice(last, m.index), b: false });
    parts.push({ t: m[1], b: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: text.slice(last), b: false });
  return parts.length ? parts : [{ t: text, b: false }];
};

/** Texto con soporte de **negrita** para el PDF (Text con Text anidados). */
function RichText({ children, style }: { children: string; style?: React.ComponentProps<typeof View>['style'] }) {
  return (
    <Text style={style}>
      {parseInline(children).map((p, i) =>
        p.b
          ? <Text key={i} style={{ fontFamily: 'Helvetica-Bold' }}>{p.t}</Text>
          : <Text key={i}>{p.t}</Text>,
      )}
    </Text>
  );
}

/**
 * Una línea de aclaración, respetando su estructura:
 *  · "1) TÍTULO"  → subtítulo (negrita)
 *  · "a. texto"   → letra en su columna + texto (con **negrita**)
 *  · otra línea   → texto simple (con **negrita**)
 */
function FilaClausula({ linea }: { linea: string }) {
  const t = linea.trim();
  // Subsección numerada: "1. Título" o "1) Título"
  if (/^\d+[.)]\s/.test(t)) return <Text style={s.seccionSubtitulo}>{t}</Text>;
  // Viñeta con guion: "- texto" (lista anidada, con sangría)
  const md = t.match(/^[-–—]\s+([\s\S]*)$/);
  if (md) {
    return (
      <View style={[s.clausulaRow, { marginLeft: 12 }]} wrap={false}>
        <Text style={s.clausulaLetra}>•</Text>
        <RichText style={s.clausulaTexto}>{md[1]}</RichText>
      </View>
    );
  }
  // Cláusula con letra: "a. texto"
  const m = t.match(/^([a-zñ]\.)\s+([\s\S]*)$/i);
  if (m) {
    return (
      <View style={s.clausulaRow} wrap={false}>
        <Text style={s.clausulaLetra}>{m[1]}</Text>
        <RichText style={s.clausulaTexto}>{m[2]}</RichText>
      </View>
    );
  }
  // Texto normal (con **negrita**, ej. etiquetas "**Plazo:** …")
  return (
    <View style={s.clausulaRow} wrap={false}>
      <RichText style={s.clausulaTexto}>{t}</RichText>
    </View>
  );
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface EmpresaInfo {
  id?: string;
  nombre: string;
  slogan?: string;
  rut: string;
  giro?: string;
  email: string;
  telefono: string;
  direccion?: string;
  website?: string;
  logo_url?: string;
  banco?: string;
  tipo_cuenta?: string;
  cuenta_bancaria?: string;
  texto_importante?: string;
}

interface Props {
  cliente: Cliente;
  items: CotizacionItem[];
  totals: Totals;
  descuentoPorcentajeMO: number;
  folio: string;
  descripcionGeneral: string;
  garantia: string;
  condicionesComerciales: string;
  ocultarSuministros: boolean;
  empresa: EmpresaInfo;
  /** Moneda de la cotización (por defecto CLP). */
  moneda?: Moneda;
  /** Valor de la UF en CLP, para la línea de equivalencia (solo si moneda = UF). */
  valorUF?: number;
  /** Partidas de proyecto (agrupación comercial). Vacío = tabla clásica por ítems. */
  partidas?: Partida[];
  /** Si true, dentro de cada partida se listan sus materiales. */
  mostrarDetalle?: boolean;
  /**
   * Fecha de emisión real (created_at de la cotización). Antes el PDF ponía
   * SIEMPRE la fecha de hoy: una cotización de agosto descargada en septiembre
   * salía con fecha de septiembre. null/undefined = hoy (cotización nueva).
   */
  fechaEmision?: string | null;
  /** Fotos del levantamiento (URL firmada temporal + leyenda). Vacío = sin página de fotos. */
  fotos?: { url: string; caption: string }[];
  /** Aceptación online del cliente: llena el bloque de firma (nombre, RUT, fecha y firma). */
  aceptacion?: AceptacionPDF | null;
}

export interface AceptacionPDF {
  nombre: string;
  rut?: string | null;
  fecha: string;            // ISO de respondida_at
  firma?: string | null;    // PNG data URI
}

// ─── Componente fila de tabla (reutilizable) ──────────────────────────────────
function TablaFila({
  item,
  idx,
  catLabel,
  fmt,
}: {
  item: CotizacionItem;
  idx: number;
  catLabel: Record<string, string>;
  fmt: (n: number) => string;
}) {
  const subtotal = item.cantidad * item.precio;
  return (
    <View
      style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}
      wrap={false}
    >
      <Text style={[s.tableCell, s.colNum]}>{idx + 1}</Text>
      <View style={s.colServicio}>
        <Text style={s.tableCell}>{item.descripcion}</Text>
        <Text style={s.catBadge}>
          {catLabel[item.categoria] || item.categoria}
          {(item.descuento || 0) > 0 ? `  ·  DESCUENTO ${item.descuento}% (APLICADO EN EL TOTAL)` : ''}
        </Text>
      </View>
      <Text style={[s.tableCellMuted, s.colUnidad]}>{item.unidad}</Text>
      <Text style={[s.tableCell, s.colQty]}>{fmtCant(item.cantidad)}</Text>
      <Text style={[s.tableCell, s.colValor]}>{fmt(item.precio)}</Text>
      <Text style={[s.tableCell, s.colTotal]}>{fmt(subtotal)}</Text>
    </View>
  );
}

/** Subtotal bruto de una línea (precio × cantidad), igual que muestra TablaFila. */
const brutoItem = (it: CotizacionItem) => (it.precio || 0) * (it.cantidad || 0);

/** Fila comercial de una Partida de Proyecto (lo que ve el cliente). */
function FilaPartida({ partida, bruto, idx, fmt }: {
  partida: Partida; bruto: number; idx: number; fmt: (n: number) => string;
}) {
  const unit = partida.cantidad > 0 ? bruto / partida.cantidad : bruto;
  return (
    <View style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]} wrap={false}>
      <Text style={[s.tableCell, s.colNum]}>{idx + 1}</Text>
      <View style={s.colServicio}>
        <Text style={[s.tableCell, { fontFamily: 'Helvetica-Bold' }]}>{partida.nombre || 'Partida'}</Text>
        {partida.descripcion ? (
          <Text style={[s.tableCellMuted, { marginTop: 2, lineHeight: 1.4 }]}>{partida.descripcion}</Text>
        ) : null}
      </View>
      <Text style={[s.tableCellMuted, s.colUnidad]}>{partida.unidad}</Text>
      <Text style={[s.tableCell, s.colQty]}>{fmtCant(partida.cantidad)}</Text>
      <Text style={[s.tableCell, s.colValor]}>{fmt(unit)}</Text>
      <Text style={[s.tableCell, s.colTotal]}>{fmt(bruto)}</Text>
    </View>
  );
}

/** Sub-fila de detalle: un material dentro de una partida (solo con "mostrar detalle"). */
function FilaDetalle({ item }: { item: CotizacionItem }) {
  return (
    <View style={[s.tableRow, { borderBottomWidth: 0, paddingTop: 2, paddingBottom: 2 }]} wrap={false}>
      <Text style={[s.tableCellMuted, s.colNum]}> </Text>
      <View style={s.colServicio}>
        <Text style={[s.tableCellMuted, { paddingLeft: 10 }]}>· {item.descripcion}</Text>
      </View>
      <Text style={[s.tableCellMuted, s.colUnidad]}>{item.unidad}</Text>
      <Text style={[s.tableCellMuted, s.colQty]}>{fmtCant(item.cantidad)}</Text>
      <Text style={[s.tableCellMuted, s.colValor]}> </Text>
      <Text style={[s.tableCellMuted, s.colTotal]}> </Text>
    </View>
  );
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function PresupuestoPDF({
  cliente, items, totals,
  folio, descripcionGeneral, garantia, condicionesComerciales,
  ocultarSuministros, empresa, moneda = 'CLP', valorUF = 0,
  partidas = [], mostrarDetalle = false, fechaEmision, fotos = [], aceptacion = null,
}: Props) {

  // Formateador de moneda de todo el documento (CLP o UF).
  const fmt = fmtMoneda(moneda);
  const monedaLabel = moneda === 'UF' ? 'Unidad de Fomento (UF)' : 'Peso Chileno (CLP)';

  // Fechas: emisión real (o hoy si es nueva) y vigencia según las condiciones.
  const emisionISO = fechaEmision || fechaLocal();
  const validez = diasValidez(condicionesComerciales);
  const fechaEmisionTxt = formatDate(emisionISO);
  const validaHastaTxt = formatDate(sumarDias(emisionISO, validez));

  // Ítems sueltos (fuera de partidas) — a estos aplica "agrupar suministros".
  const sueltos = items.filter(i => !i.partidaId);
  const matSueltos = sueltos.filter(i => i.categoria === 'material');
  const netoMatSueltos = matSueltos.reduce((sum, i) => sum + brutoItem(i), 0);

  // La línea agrupada va en NETO como todas las demás de la tabla (antes se
  // sumaba el IVA y mezclaba un valor con IVA en una columna de valores netos).
  const sueltosDisplay: CotizacionItem[] = ocultarSuministros
    ? [
        ...sueltos.filter(i => i.categoria !== 'material'),
        ...(matSueltos.length > 0
          ? [{
              id: 'suministros',
              descripcion: 'Suministros y materiales',
              categoria: 'material' as const,
              cantidad: 1, unidad: 'global',
              costo: 0, imprevistos: 0, margen: 0,
              precio: netoMatSueltos,
              iva: 0,
            }]
          : []),
      ]
    : sueltos;

  // Subtotal = suma de la columna "Total" de la tabla (antes de descuento).
  const subtotalDetalle = items.reduce((sum, i) => sum + brutoItem(i), 0);

  // Cifras del cuadro de totales YA redondeadas a la moneda, con descuento e IVA
  // derivados de ellas: así lo impreso SIEMPRE suma exacto (Subtotal − Descuento
  // = Neto; Neto + IVA = Total) y el Total coincide con el guardado. Redondear
  // cada cifra por separado dejaba descuadres de $1 / UF 0,01.
  const red = (v: number) => (moneda === 'UF' ? Math.round(v * 100) / 100 : Math.round(v));
  const subtotalR  = red(subtotalDetalle);
  const netoR      = red(totals.netoGeneral);
  const totalR     = red(totals.total);
  const descuentoR = Math.max(0, red(subtotalR - netoR));
  const ivaR       = red(totalR - netoR);
  // IVA uniforme → "IVA (19%)"; si hay tasas distintas (ítems exentos) → "IVA".
  const tasasIva = Array.from(new Set(items.filter(i => brutoItem(i) > 0).map(i => i.iva || 0)));
  const ivaLabel = tasasIva.length === 1 && tasasIva[0] > 0 ? `IVA (${tasasIva[0]}%)` : 'IVA';

  // Composición informativa del neto por tipo (ya incluye los descuentos).
  const composicion = [
    { label: 'Materiales',        v: totals.porCategoria.material.neto },
    { label: 'Mano de obra',      v: totals.porCategoria.mano_obra.neto },
    { label: 'Servicios',         v: totals.porCategoria.servicio.neto },
    { label: 'Operación y otros', v: totals.porCategoria.operacion.neto },
  ].filter(c => c.v > 0);

  const tieneDatosPago = !!(empresa.banco || empresa.cuenta_bancaria);

  const catLabel: Record<string, string> = {
    material:  'MATERIAL',
    mano_obra: 'MANO DE OBRA',
    servicio:  'SERVICIO',
    operacion: 'OPERACIÓN',
  };

  // Filas de la tabla: primero las partidas (con detalle opcional), luego los
  // ítems sueltos. La numeración # es correlativa entre ambos.
  const filas: React.ReactElement[] = [];
  let numFila = 0;
  for (const p of partidas) {
    const its = items.filter(i => i.partidaId === p.id);
    const bruto = its.reduce((sum, i) => sum + brutoItem(i), 0);
    filas.push(<FilaPartida key={`p-${p.id}`} partida={p} bruto={bruto} idx={numFila++} fmt={fmt} />);
    if (mostrarDetalle) {
      for (const it of its) filas.push(<FilaDetalle key={`d-${it.id}`} item={it} />);
    }
  }
  for (const it of sueltosDisplay) {
    filas.push(<TablaFila key={`s-${it.id}`} item={it} idx={numFila++} catLabel={catLabel} fmt={fmt} />);
  }

  // El PDF se imprime sobre papel blanco: si la empresa no tiene logo propio,
  // se usa el de InnVolt con tinta oscura (la variante "claro").
  const logoPDF = empresa.logo_url ||
    (esInnVolt(empresa.nombre)
      ? (typeof window !== 'undefined' ? window.location.origin : '') + LOGO_PDF
      : '');

  const textoImportante =
    empresa.texto_importante ||
    `Todos los gastos o valores extraordinarios por factores externos a ${empresa.nombre} serán de total responsabilidad de quien contrate los servicios, por lo cual ${empresa.nombre} generará una cotización puntual al respecto.`;

  // ── Página 1: Header + Partes + Descripción + Tabla de ítems + Totales ──────
  // ── Página 2+: Inicia con <Page break> — Importante + Cláusulas + Firma ─────

  return (
    <Document>

      {/* ══════════════════════════════════════════════════════════════════════
          PÁGINA 1 — Datos del documento + tabla de ítems
      ══════════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={s.page}>

        {/* ── Barra de acento superior ── */}
        <View style={s.accentBar} fixed>
          <View style={s.accentDark} />
          <View style={s.accentSpark} />
        </View>

        {/* ── HEADER ── */}
        <View style={s.header}>
          <View style={s.logoBlock}>
            {logoPDF ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- <Image> de @react-pdf no admite alt
              <Image style={s.logoImage} src={logoPDF} />
            ) : (
              <Text style={s.logoName}>{empresa.nombre.toUpperCase()}</Text>
            )}
            <Text style={s.companyName}>{empresa.nombre}</Text>
            {empresa.rut && <Text style={s.companyLine}>RUT: {empresa.rut}</Text>}
            {empresa.giro && <Text style={s.companyLine}>Giro: {empresa.giro}</Text>}
            {empresa.direccion && <Text style={s.companyLine}>{empresa.direccion}</Text>}
            <Text style={s.companyLine}>{empresa.telefono}  ·  {empresa.email}</Text>
            {empresa.website && <Text style={s.companyLine}>{empresa.website}</Text>}
          </View>

          <View style={s.folioCard}>
            <Text style={s.folioLabel}>COTIZACIÓN</Text>
            <Text style={s.folioNum}>{folio}</Text>
            <View style={s.folioDivider} />
            <Text style={s.folioDate}>Emitida {fechaEmisionTxt}</Text>
            <Text style={[s.folioDate, { color: SPARK, marginTop: 2 }]}>Válida hasta {validaHastaTxt}</Text>
          </View>
        </View>

        {/* ── CLIENTE ── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>PREPARADO PARA</Text>
          <Text style={s.parteNombre}>{cliente.nombre_cliente}</Text>
          {cliente.contacto_nombre ? <Text style={[s.parteVal, { marginBottom: 0 }]}>Atención: {cliente.contacto_nombre}</Text> : null}
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            <View style={{ flex: 1 }}>
              {cliente.empresa && (<><Text style={s.parteKey}>Empresa</Text><Text style={s.parteVal}>{cliente.empresa}</Text></>)}
              <Text style={s.parteKey}>RUT</Text><Text style={s.parteVal}>{cliente.rut || '-'}</Text>
              <Text style={s.parteKey}>Teléfono</Text><Text style={s.parteVal}>{cliente.telefono || '-'}</Text>
            </View>
            <View style={{ flex: 1.2 }}>
              <Text style={s.parteKey}>Correo</Text><Text style={s.parteVal}>{cliente.email || '-'}</Text>
              <Text style={s.parteKey}>Dirección</Text><Text style={s.parteVal}>{cliente.direccion || '-'}</Text>
            </View>
          </View>
        </View>

        {/* ── DESCRIPCIÓN GENERAL ──
            Respeta los saltos de línea y líneas en blanco tal como se escriben,
            reconoce viñetas (-, •, *) y **negrita**. Cada línea es atómica (wrap=false). */}
        {descripcionGeneral && descripcionGeneral.trim() && (
          <View style={s.card}>
            <View wrap={false}>
              <Text style={s.cardLabel}>DESCRIPCIÓN DEL TRABAJO</Text>
            </View>
            {boldPorLinea(descripcionGeneral).split('\n').map((linea, i) => {
              const t = linea.replace(/\s+$/, '');
              // Línea en blanco → espacio (mantiene la separación de párrafos)
              if (t.trim() === '') return <View key={i} style={{ height: 5 }} />;
              // Viñeta
              if (/^\s*[-•*]\s+/.test(t)) {
                return (
                  <View key={i} style={s.descBulletRow} wrap={false}>
                    <Text style={s.descBullet}>•</Text>
                    <RichText style={[s.descText, { flex: 1 }]}>{t.replace(/^\s*[-•*]\s+/, '')}</RichText>
                  </View>
                );
              }
              // Párrafo normal (con negrita)
              return (
                <RichText key={i} style={[s.descText, { marginBottom: 2 }]}>{t}</RichText>
              );
            })}
          </View>
        )}

        {/* ── RESUMEN POR PARTIDA ── */}
        {partidas.length > 0 && (
          <View style={s.card} wrap={false}>
            <Text style={s.cardLabel}>RESUMEN POR PARTIDA</Text>
            {partidas.map((p, i) => {
              const nt = items.filter(it => it.partidaId === p.id).reduce((sm, it) => sm + brutoItem(it), 0);
              return (
                <View key={p.id} style={s.resRow}>
                  <Text style={s.resNum}>{i + 1}</Text>
                  <Text style={s.resName}>{p.nombre || 'Partida'}</Text>
                  <Text style={s.resVal}>{fmt(nt)}</Text>
                </View>
              );
            })}
            {sueltos.length > 0 && (
              <View style={s.resRow}>
                <Text style={s.resNum}> </Text>
                <Text style={s.resName}>Ítems adicionales</Text>
                <Text style={s.resVal}>{fmt(sueltos.reduce((sm, it) => sm + brutoItem(it), 0))}</Text>
              </View>
            )}
            <View style={s.resTotalRow}>
              <Text style={s.resTotalLabel}>Subtotal{descuentoR > 0 ? ' (antes de descuento)' : ''}</Text>
              <Text style={s.resTotalVal}>{fmt(subtotalR)}</Text>
            </View>
          </View>
        )}

        {/* ── INVERSIÓN TOTAL — el cliente ve el valor final en la primera página ── */}
        <View style={s.inversionBox} wrap={false}>
          <View style={s.inversionLeft}>
            <Text style={s.inversionLabel}>INVERSIÓN TOTAL</Text>
            <Text style={s.inversionTotal}>{fmt(totalR)}</Text>
            <Text style={s.inversionSub}>
              {ivaR > 0 ? `Neto ${fmt(netoR)} + ${ivaLabel} ${fmt(ivaR)}` : 'Valor neto (exento de IVA)'}
            </Text>
            {moneda === 'UF' && valorUF > 0 && (
              <Text style={s.inversionSub}>Equivale a {fmtCLP(totalR * valorUF)} (UF = {fmtValorUF(valorUF)})</Text>
            )}
          </View>
          <View style={s.inversionRight}>
            <Text style={s.inversionKey}>Válida hasta</Text>
            <Text style={s.inversionVal}>{validaHastaTxt} ({validez} días)</Text>
            <Text style={s.inversionKey}>Moneda</Text>
            <Text style={s.inversionVal}>{monedaLabel}</Text>
            {descuentoR > 0 && (
              <>
                <Text style={s.inversionKey}>Ahorro incluido</Text>
                <Text style={[s.inversionVal, { marginBottom: 0 }]}>{fmt(descuentoR)}</Text>
              </>
            )}
          </View>
        </View>

        {/* ── IMPORTANTE (completa la página 1) ── */}
        <View style={s.importanteBox} wrap={false}>
          <Text style={s.importanteLabel}>IMPORTANTE</Text>
          <RichText style={s.importanteText}>{textoImportante}</RichText>
        </View>

        {/* ── FOOTER página 1 ── */}
        <View style={s.footer} fixed>
          <View style={s.footerBrand}>
            <View style={s.footerDot} />
            <Text style={s.footerLeft}>{empresa.nombre}</Text>
          </View>
          <Text
            style={s.footerRight}
            render={({ pageNumber, totalPages }) =>
              `${folio} · Página ${pageNumber}/${totalPages}`
            }
          />
        </View>

      </Page>

      {/* ══════════════════════════════════════════════════════════════════════
          PÁGINA 2 — Detalle de ítems + Totales
      ══════════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={s.page}>

        {/* ── Barra de acento superior ── */}
        <View style={s.accentBar} fixed>
          <View style={s.accentDark} />
          <View style={s.accentSpark} />
        </View>

        <View style={{ padding: '4 32 0 32' }}>
          <Text style={s.pageTitle}>DETALLE DE LA COTIZACIÓN</Text>
        </View>

        {/* ── TABLA DE ÍTEMS ──
            El truco clave: envolver header + primera fila en wrap={false}
            para que nunca el header quede solo al final de una página. */}
        <View style={s.content}>

          {/* Header + primera fila — siempre juntos (evita header huérfano) */}
          <View wrap={false}>
            <View style={s.tableHeader}>
              <Text style={[s.tableHeaderText, s.colNum]}>#</Text>
              <Text style={[s.tableHeaderText, s.colServicio]}>Servicio / Producto</Text>
              <Text style={[s.tableHeaderText, s.colUnidad]}>Unidad</Text>
              <Text style={[s.tableHeaderText, s.colQty]}>Cant.</Text>
              <Text style={[s.tableHeaderText, s.colValor]}>Valor unit.</Text>
              <Text style={[s.tableHeaderText, s.colTotal]}>Total neto</Text>
            </View>
            {filas.length > 0 && filas[0]}
          </View>

          {/* Resto de filas */}
          {filas.slice(1)}

          {/* ── TOTALES — bloque completo sin corte ──
              Estructura estándar que CUADRA con la tabla:
              Subtotal (suma de la columna Total) − Descuento = Neto; + IVA = TOTAL.
              Antes se listaban netos por categoría (ya descontados) y además se
              restaba el descuento, y el "IVA total" solo salía si había materiales. */}
          <View wrap={false} style={{ marginBottom: 20 }}>
            <View style={s.totalesBox}>
              {/* Composición informativa del neto */}
              {composicion.length > 1 && (
                <View style={s.composicionBox}>
                  <Text style={s.composicionTitulo}>COMPOSICIÓN DEL NETO</Text>
                  {composicion.map(c => (
                    <View key={c.label} style={s.composicionRow}>
                      <Text style={s.composicionLabel}>{c.label}</Text>
                      <Text style={s.composicionVal}>{fmt(c.v)}</Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={s.totalesInner}>
                <View style={s.totalesRow}>
                  <Text style={s.totalesLabel}>Subtotal</Text>
                  <Text style={s.totalesValue}>{fmt(subtotalR)}</Text>
                </View>
                {descuentoR > 0 && (
                  <View style={s.totalesRow}>
                    <Text style={s.totalesLabel}>Descuento</Text>
                    <Text style={s.totalesValue}>- {fmt(descuentoR)}</Text>
                  </View>
                )}
                <View style={s.totalesRow}>
                  <Text style={s.totalesLabel}>Neto</Text>
                  <Text style={s.totalesValue}>{fmt(netoR)}</Text>
                </View>
                {ivaR > 0 && (
                  <View style={s.totalesRow}>
                    <Text style={s.totalesLabel}>{ivaLabel}</Text>
                    <Text style={s.totalesValue}>{fmt(ivaR)}</Text>
                  </View>
                )}
                <View style={s.totalFinalRow}>
                  <Text style={s.totalFinalLabel}>TOTAL</Text>
                  <Text style={s.totalFinalValue}>{fmt(totalR)}</Text>
                </View>
                {moneda === 'UF' && valorUF > 0 && (
                  <View style={s.totalesRow}>
                    <Text style={s.totalesLabel}>En pesos (UF = {fmtValorUF(valorUF)})</Text>
                    <Text style={s.totalesValue}>{fmtCLP(totalR * valorUF)}</Text>
                  </View>
                )}
                <View style={[s.totalesRow, { borderBottomWidth: 0 }]}>
                  <Text style={s.totalesLabel}>Moneda</Text>
                  <Text style={s.totalesValue}>{monedaLabel}</Text>
                </View>
              </View>
            </View>
          </View>

        </View>

        {/* ── FOOTER página 1 ── */}
        <View style={s.footer} fixed>
          <View style={s.footerBrand}>
            <View style={s.footerDot} />
            <Text style={s.footerLeft}>{empresa.nombre}</Text>
          </View>
          <Text
            style={s.footerRight}
            render={({ pageNumber, totalPages }) =>
              `${folio} · Página ${pageNumber}/${totalPages}`
            }
          />
        </View>

      </Page>

      {/* ══ REGISTRO FOTOGRÁFICO — fotos de la visita técnica (opcional) ══ */}
      {fotos.length > 0 && (
        <Page size="A4" style={s.page}>
          <View style={s.accentBar} fixed>
            <View style={s.accentDark} />
            <View style={s.accentSpark} />
          </View>
          <View style={{ padding: '4 32 0 32' }}>
            <Text style={s.pageTitle}>REGISTRO FOTOGRÁFICO DE LA VISITA TÉCNICA</Text>
            <View style={s.fotosGrid}>
              {fotos.map((f, i) => (
                <View key={i} style={s.fotoBox} wrap={false}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text -- <Image> de @react-pdf no admite alt */}
                  <Image src={f.url} style={s.foto} />
                  <Text style={s.fotoCaption}>{i + 1}. {f.caption || 'Registro de la visita'}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={s.footer} fixed>
            <View style={s.footerBrand}>
              <View style={s.footerDot} />
              <Text style={s.footerLeft}>{empresa.nombre}</Text>
            </View>
            <Text style={s.footerRight} render={({ pageNumber, totalPages }) => `${folio} · Página ${pageNumber}/${totalPages}`} />
          </View>
        </Page>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PÁGINA FINAL — Importante + Cláusulas + Firma al fondo
          Al usar una Page separada, TODO este contenido empieza en página nueva
          y la firma queda al fondo usando flexDirection + justifyContent.
      ══════════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={s.page}>
        {/* ── Barra de acento superior ── */}
        <View style={s.accentBar} fixed>
          <View style={s.accentDark} />
          <View style={s.accentSpark} />
        </View>

        {/* Contenido superior: Aclaraciones + Condiciones */}
        <View>

          {/* ── ACLARACIONES DE SERVICIOS Y GARANTÍAS (editable por cotización,
                 respetando su estructura "1) …" / "a. …") ── */}
          {(lineasClausula(garantia).length > 0 || lineasClausula(condicionesComerciales).length > 0) && (
            <View style={s.seccionBox}>
              {/* Título + encabezado GARANTÍA juntos (evita quedar huérfanos) */}
              <View wrap={false}>
                <Text style={s.seccionTitulo}>ACLARACIONES DE SERVICIOS Y GARANTÍAS</Text>
                {lineasClausula(garantia).length > 0 && <Text style={s.bloqueHeader}>GARANTÍA</Text>}
              </View>
              {lineasClausula(garantia).map((l, i) => (
                <FilaClausula key={`g-${i}`} linea={l} />
              ))}

              {/* Bloque de condiciones — claramente separado */}
              {lineasClausula(condicionesComerciales).length > 0 && (
                <View wrap={false}>
                  <Text style={s.bloqueHeader}>CONDICIONES COMERCIALES</Text>
                  {lineasClausula(condicionesComerciales).slice(0, 1).map((l, i) => (
                    <FilaClausula key={`c0-${i}`} linea={l} />
                  ))}
                </View>
              )}
              {lineasClausula(condicionesComerciales).slice(1).map((l, i) => (
                <FilaClausula key={`c-${i}`} linea={l} />
              ))}
            </View>
          )}
        </View>

        {/* ── CÓMO ACEPTAR + DATOS DE PAGO ──
            Cierra la venta: el cliente sabe cómo aceptar y dónde transferir.
            (Los datos bancarios estaban guardados en la empresa pero nunca se imprimían.) */}
        <View style={s.pagoBox} wrap={false}>
          <View style={s.pagoCol}>
            <Text style={s.pagoTitulo}>CÓMO ACEPTAR ESTA COTIZACIÓN</Text>
            <Text style={s.aceptaText}>
              Firme este documento y envíelo a {empresa.email || 'nuestro correo'}, o responda indicando el folio {folio}.
              {'\n'}Oferta válida hasta el {validaHastaTxt}.
            </Text>
          </View>
          {tieneDatosPago && (
            <View style={[s.pagoCol, { paddingRight: 0, borderLeftWidth: 1, borderLeftColor: LINE, paddingLeft: 12 }]}>
              <Text style={s.pagoTitulo}>DATOS PARA TRANSFERENCIA</Text>
              {empresa.banco ? (<><Text style={s.pagoKey}>Banco</Text><Text style={s.pagoVal}>{empresa.banco}</Text></>) : null}
              {empresa.tipo_cuenta || empresa.cuenta_bancaria ? (
                <><Text style={s.pagoKey}>{empresa.tipo_cuenta || 'Cuenta'}</Text><Text style={s.pagoVal}>{empresa.cuenta_bancaria || '—'}</Text></>
              ) : null}
              <Text style={s.pagoKey}>Titular · RUT</Text>
              <Text style={[s.pagoVal, { marginBottom: 0 }]}>{empresa.nombre} · {empresa.rut}</Text>
            </View>
          )}
        </View>

        {/* ── FIRMA — fluye tras las cláusulas con un espacio fijo (no se descoloca) ── */}
        <View style={s.firmaContainer} wrap={false}>

          {/* Firma Cliente (llena si aceptó online) */}
          {aceptacion ? (
            <View style={s.firmaCol}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- <Image> de @react-pdf no admite alt */}
              {aceptacion.firma ? <Image src={aceptacion.firma} style={s.firmaImagen} /> : <View style={s.firmaEspacio} />}
              <View style={s.firmaLinea} />
              <Text style={s.firmaNombreText}>{aceptacion.nombre}</Text>
              <Text style={s.firmaMutedText}>RUT: {aceptacion.rut || cliente.rut || '—'}</Text>
              <Text style={s.firmaMutedText}>Aceptada en línea el {formatDate(aceptacion.fecha)}</Text>
            </View>
          ) : (
            <View style={s.firmaCol}>
              <View style={s.firmaLinea} />
              <Text style={s.firmaNombreText}>{cliente.nombre_cliente}</Text>
              <Text style={s.firmaMutedText}>RUT: {cliente.rut || '________________'}</Text>
              <Text style={s.firmaMutedText}>Firma y fecha de aceptación: ____/____/______</Text>
            </View>
          )}

          {/* Firma Empresa */}
          <View style={s.firmaCol}>
            {aceptacion && <View style={s.firmaEspacio} />}
            <View style={s.firmaLinea} />
            <Text style={s.firmaNombreText}>{empresa.nombre}</Text>
            <Text style={s.firmaMutedText}>RUT: {empresa.rut}</Text>
            <Text style={s.firmaMutedText}>Representante Comercial</Text>
          </View>

        </View>

        {/* ── FOOTER página final ── */}
        <View style={s.footer} fixed>
          <View style={s.footerBrand}>
            <View style={s.footerDot} />
            <Text style={s.footerLeft}>{empresa.nombre}</Text>
          </View>
          <Text
            style={s.footerRight}
            render={({ pageNumber, totalPages }) =>
              `${folio} · Página ${pageNumber}/${totalPages}`
            }
          />
        </View>

      </Page>

    </Document>
  );
}
