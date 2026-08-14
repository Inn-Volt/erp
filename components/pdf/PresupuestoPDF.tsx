import React from 'react';
import {
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer';
import type { CotizacionItem, Cliente, Partida } from '@/types';
import type { Totals } from '@/utils';

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
const lineasTexto = (texto?: string): string[] =>
  (texto || '')
    .split('\n')
    .map(l => l.replace(/^\s*[•\-*]\s*/, '').trim())
    .filter(Boolean);

/** Sufijo con el descuento promedio de una categoría (ej. " (desc. prom. 12%)"). */
const descTxt = (promedio: number): string =>
  promedio > 0 ? ` (desc. prom. ${Math.round(promedio)}%)` : '';

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
  colServicio: { flex: 1 },
  colDesc: { width: 96 },
  colQty: { width: 36, textAlign: 'center' },
  colValor: { width: 64, textAlign: 'right' },
  colTotal: { width: 68, textAlign: 'right' },

  // ── Totales ──
  totalesBox: { marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end' },
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
  clausulaRow: { flexDirection: 'row', marginBottom: 3.5 },
  clausulaLetra: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: MUTED, width: 14 },
  clausulaTexto: { fontSize: 7.5, color: '#333333', flex: 1, lineHeight: 1.55 },

  // ── Firma ──
  firmaContainer: {
    margin: '24 32 18 32',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  firmaCol: { width: 220, alignItems: 'center' },
  firmaLinea: { width: '100%', borderTopWidth: 1, borderTopColor: INK, marginBottom: 8 },
  firmaNombreText: { color: INK, fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  firmaMutedText: { color: MUTED, fontSize: 7 },

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

const fmtUFn = (n: number) =>
  `UF ${new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)}`;

type Moneda = 'CLP' | 'UF';
/** Devuelve un formateador según la moneda de la cotización. */
const fmtMoneda = (moneda: Moneda) => (n: number) => (moneda === 'UF' ? fmtUFn(n) : fmtCLP(n));

const today = () =>
  new Date().toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

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
}

// ─── Cláusulas ───────────────────────────────────────────────────────────────
const buildGarantiasEquipos = (empresa: EmpresaInfo) => {
  const nombre = empresa.nombre?.trim() || 'la empresa';
  return [
    { l: 'a.', t: 'Garantía de instalación y mano de obra: 6 meses desde la fecha de entrega o puesta en servicio, salvo que la propuesta indique expresamente un plazo distinto.' },
    { l: 'b.', t: 'Los equipos, componentes y materiales suministrados cuentan con la garantía otorgada por sus respectivos fabricantes o distribuidores autorizados.' },
    { l: 'c.', t: `La garantía cubre exclusivamente defectos atribuibles a errores de instalación, montaje o configuración realizados por personal de ${nombre}.` },
    { l: 'd.', t: 'La garantía no cubre daños provocados por manipulación de terceros, modificaciones no autorizadas, vandalismo, robo, incendios, inundaciones, humedad, sobretensiones, descargas atmosféricas, catástrofes naturales, fallas de suministro eléctrico o uso indebido.' },
    { l: 'e.', t: `Equipos, materiales o instalaciones preexistentes propiedad del cliente y no suministrados por ${nombre} quedan expresamente excluidos de cualquier garantía.` },
    { l: 'f.', t: 'Toda intervención realizada por terceros no autorizados dejará sin efecto la garantía sobre el elemento intervenido.' },
  ];
};

const GARANTIAS_SERVICIOS = [
  { l: 'a.', t: 'Los servicios cotizados consideran únicamente las actividades expresamente indicadas en el alcance de esta propuesta.' },
  { l: 'b.', t: 'Materiales, equipos, obras civiles, canalizaciones, habilitaciones eléctricas, certificaciones o trabajos adicionales no especificados se considerarán partidas extraordinarias y serán cotizados por separado.' },
  { l: 'c.', t: 'La programación de los trabajos estará sujeta a disponibilidad operativa y a la recepción conforme del pago inicial acordado.' },
  { l: 'd.', t: 'Los plazos de ejecución podrán variar por causas de fuerza mayor, condiciones climáticas adversas, restricciones de acceso, retrasos de proveedores o situaciones ajenas al control de la empresa.' },
  { l: 'e.', t: 'Los servicios de soporte técnico se prestan en horario hábil de lunes a viernes entre las 09:00 y las 18:00 horas, salvo contratación de cobertura especial.' },
  { l: 'f.', t: 'Los trabajos ejecutados fuera de la Región Metropolitana podrán considerar costos adicionales por traslado, alojamiento, alimentación y logística.' },
];

const VALIDEZ_PAGO = [
  { l: 'a.', t: 'La presente cotización tendrá una vigencia de 15 días corridos contados desde su fecha de emisión.' },
  { l: 'b.', t: 'La aceptación de esta propuesta implica la conformidad del cliente con el alcance técnico, condiciones comerciales y cláusulas descritas en el presente documento.' },
  { l: 'c.', t: 'Para proyectos superiores a UF 10 se establece un anticipo mínimo del 50% y saldo contra entrega o según cronograma de avance acordado.' },
  { l: 'd.', t: 'Para proyectos iguales o inferiores a UF 10 se podrá requerir pago total anticipado previo al inicio de los trabajos.' },
  { l: 'e.', t: 'Los materiales especiales, equipos importados o productos fabricados a pedido podrán requerir pago anticipado del 100%.' },
  { l: 'f.', t: 'Toda modificación de alcance solicitada por el cliente después de aprobada la propuesta será evaluada y presupuestada mediante orden de cambio.' },
  { l: 'g.', t: 'Gastos extraordinarios no considerados originalmente, tales como traslados adicionales, visitas técnicas extraordinarias, permisos, certificaciones o materiales imprevistos, serán cotizados y facturados por separado.' },
];

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
        <Text style={s.catBadge}>{catLabel[item.categoria] || item.categoria}</Text>
      </View>
      <Text style={[s.tableCellMuted, s.colDesc]}>{item.unidad}</Text>
      <Text style={[s.tableCell, s.colQty]}>{item.cantidad}</Text>
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
      <Text style={[s.tableCellMuted, s.colDesc]}>{partida.unidad}</Text>
      <Text style={[s.tableCell, s.colQty]}>{partida.cantidad}</Text>
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
      <Text style={[s.tableCellMuted, s.colDesc]}>{item.unidad}</Text>
      <Text style={[s.tableCellMuted, s.colQty]}>{item.cantidad}</Text>
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
  partidas = [], mostrarDetalle = false,
}: Props) {

  // Formateador de moneda de todo el documento (CLP o UF).
  const fmt = fmtMoneda(moneda);
  const monedaLabel = moneda === 'UF' ? 'Unidad de Fomento (UF)' : 'Peso Chileno (CLP)';

  // Ítems sueltos (fuera de partidas) — a estos aplica "agrupar suministros".
  const sueltos = items.filter(i => !i.partidaId);
  const matSueltos = sueltos.filter(i => i.categoria === 'material');
  const netoMatSueltos = matSueltos.reduce((sum, i) => sum + brutoItem(i), 0);
  const ivaMatSueltos = matSueltos.reduce((sum, i) => sum + brutoItem(i) * (i.iva || 0) / 100, 0);

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
              precio: netoMatSueltos + ivaMatSueltos,
              iva: 0,
            }]
          : []),
      ]
    : sueltos;

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

  const garantiasEquipos = buildGarantiasEquipos(empresa);

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
            <Text style={s.folioDate}>{today()}</Text>
          </View>
        </View>

        {/* ── CLIENTE ── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>PREPARADO PARA</Text>
          <Text style={s.parteNombre}>{cliente.nombre_cliente}</Text>
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
            {descripcionGeneral.split('\n').map((linea, i) => {
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

        {/* ── IMPORTANTE (completa la página 1) ── */}
        <View style={s.importanteBox} wrap={false}>
          <Text style={s.importanteLabel}>IMPORTANTE</Text>
          <Text style={s.importanteText}>{textoImportante}</Text>
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
              <Text style={[s.tableHeaderText, s.colDesc]}>Descripción</Text>
              <Text style={[s.tableHeaderText, s.colQty]}>Cantidad</Text>
              <Text style={[s.tableHeaderText, s.colValor]}>Valor</Text>
              <Text style={[s.tableHeaderText, s.colTotal]}>Total</Text>
            </View>
            {filas.length > 0 && filas[0]}
          </View>

          {/* Resto de filas */}
          {filas.slice(1)}

          {/* ── TOTALES — bloque completo sin corte ── */}
          <View wrap={false} style={{ marginBottom: 20 }}>
            <View style={s.totalesBox}>
              <View style={s.totalesInner}>
                <View style={s.totalesRow}>
                  <Text style={s.totalesLabel}>Moneda</Text>
                  <Text style={s.totalesValue}>{monedaLabel}</Text>
                </View>
                {totals.netoMateriales > 0 && (
                  <View style={s.totalesRow}>
                    <Text style={s.totalesLabel}>Neto Materiales{descTxt(totals.porCategoria.material.descuentoPromedio)}</Text>
                    <Text style={s.totalesValue}>{fmt(totals.netoMateriales)}</Text>
                  </View>
                )}
                {totals.ivaMateriales > 0 && (
                  <View style={s.totalesRow}>
                    <Text style={s.totalesLabel}>IVA Materiales</Text>
                    <Text style={s.totalesValue}>{fmt(totals.ivaMateriales)}</Text>
                  </View>
                )}
                {totals.netoMO > 0 && (
                  <View style={s.totalesRow}>
                    <Text style={s.totalesLabel}>Mano de Obra{descTxt(totals.porCategoria.mano_obra.descuentoPromedio)}</Text>
                    <Text style={s.totalesValue}>{fmt(totals.netoMO)}</Text>
                  </View>
                )}
                {totals.netoServicios > 0 && (
                  <View style={s.totalesRow}>
                    <Text style={s.totalesLabel}>Servicios{descTxt(totals.porCategoria.servicio.descuentoPromedio)}</Text>
                    <Text style={s.totalesValue}>{fmt(totals.netoServicios)}</Text>
                  </View>
                )}
                {totals.netoOperacion > 0 && (
                  <View style={s.totalesRow}>
                    <Text style={s.totalesLabel}>Operación y Extras{descTxt(totals.porCategoria.operacion.descuentoPromedio)}</Text>
                    <Text style={s.totalesValue}>{fmt(totals.netoOperacion)}</Text>
                  </View>
                )}
                {totals.montoDescuentoTotal > 0 && (
                  <View style={s.totalesRow}>
                    <Text style={s.totalesLabel}>Descuento aplicado</Text>
                    <Text style={s.totalesValue}>- {fmt(totals.montoDescuentoTotal)}</Text>
                  </View>
                )}
                <View style={s.totalesRow}>
                  <Text style={s.totalesLabel}>Neto</Text>
                  <Text style={s.totalesValue}>{fmt(totals.netoGeneral)}</Text>
                </View>
                <View style={s.totalesRow}>
                  <Text style={s.totalesLabel}>IVA</Text>
                  <Text style={s.totalesValue}>{fmt(totals.ivaGeneral)}</Text>
                </View>
                <View style={s.totalFinalRow}>
                  <Text style={s.totalFinalLabel}>TOTAL</Text>
                  <Text style={s.totalFinalValue}>{fmt(totals.total)}</Text>
                </View>
                {moneda === 'UF' && valorUF > 0 && (
                  <View style={s.totalesRow}>
                    <Text style={s.totalesLabel}>Equivalente en CLP (UF {fmtCLP(valorUF)})</Text>
                    <Text style={s.totalesValue}>{fmtCLP(totals.total * valorUF)}</Text>
                  </View>
                )}
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

      {/* ══════════════════════════════════════════════════════════════════════
          PÁGINA FINAL — Importante + Cláusulas + Firma al fondo
          Al usar una Page separada, TODO este contenido empieza en página nueva
          y la firma queda al fondo usando flexDirection + justifyContent.
      ══════════════════════════════════════════════════════════════════════ */}
      <Page
        size="A4"
        style={[
          s.page,
          {
            // flex column con space-between: empuja la firma al fondo
            flexDirection: 'column',
            justifyContent: 'space-between',
          },
        ]}
      >
        {/* ── Barra de acento superior ── */}
        <View style={s.accentBar} fixed>
          <View style={s.accentDark} />
          <View style={s.accentSpark} />
        </View>

        {/* Contenido superior: Aclaraciones + Condiciones */}
        <View>

          {/* ── ACLARACIONES ── */}
          <View style={s.seccionBox}>

            {/* Título principal + primer subtítulo juntos */}
            <View wrap={false}>
              <Text style={s.seccionTitulo}>ACLARACIONES DE SERVICIOS Y GARANTÍAS</Text>
              <Text style={s.seccionSubtitulo}>1) DE LAS INSTALACIONES Y MANO DE OBRA:</Text>
              {garantiasEquipos.slice(0, 1).map(c => (
                <View key={c.l} style={s.clausulaRow}>
                  <Text style={s.clausulaLetra}>{c.l}</Text>
                  <Text style={s.clausulaTexto}>{c.t}</Text>
                </View>
              ))}
            </View>
            {garantiasEquipos.slice(1).map(c => (
              <View key={c.l} style={s.clausulaRow} wrap={false}>
                <Text style={s.clausulaLetra}>{c.l}</Text>
                <Text style={s.clausulaTexto}>{c.t}</Text>
              </View>
            ))}

            {/* Subtítulo 2 + primera cláusula juntos */}
            <View wrap={false}>
              <Text style={s.seccionSubtitulo}>2) DE LOS SERVICIOS:</Text>
              {GARANTIAS_SERVICIOS.slice(0, 1).map(c => (
                <View key={c.l} style={s.clausulaRow}>
                  <Text style={s.clausulaLetra}>{c.l}</Text>
                  <Text style={s.clausulaTexto}>{c.t}</Text>
                </View>
              ))}
            </View>
            {GARANTIAS_SERVICIOS.slice(1).map(c => (
              <View key={c.l} style={s.clausulaRow} wrap={false}>
                <Text style={s.clausulaLetra}>{c.l}</Text>
                <Text style={s.clausulaTexto}>{c.t}</Text>
              </View>
            ))}

            {/* Subtítulo 3 + primera cláusula juntos */}
            <View wrap={false}>
              <Text style={s.seccionSubtitulo}>3) VALIDEZ Y FORMAS DE PAGO:</Text>
              {VALIDEZ_PAGO.slice(0, 1).map(c => (
                <View key={c.l} style={s.clausulaRow}>
                  <Text style={s.clausulaLetra}>{c.l}</Text>
                  <Text style={s.clausulaTexto}>{c.t}</Text>
                </View>
              ))}
            </View>
            {VALIDEZ_PAGO.slice(1).map(c => (
              <View key={c.l} style={s.clausulaRow} wrap={false}>
                <Text style={s.clausulaLetra}>{c.l}</Text>
                <Text style={s.clausulaTexto}>{c.t}</Text>
              </View>
            ))}

          </View>

          {/* ── CONDICIONES PARTICULARES (lo que se escribe en el cotizador) ──
              Antes estos textos se editaban en la app pero nunca se imprimían. */}
          {(lineasTexto(garantia).length > 0 || lineasTexto(condicionesComerciales).length > 0) && (
            <View style={s.seccionBox}>
              <Text style={s.seccionTitulo}>CONDICIONES PARTICULARES DE ESTA COTIZACIÓN</Text>

              {lineasTexto(garantia).length > 0 && (
                <>
                  <Text style={s.seccionSubtitulo}>GARANTÍA</Text>
                  {lineasTexto(garantia).map((t, i) => (
                    <View key={`gar-${i}`} style={s.clausulaRow} wrap={false}>
                      <Text style={s.clausulaLetra}>•</Text>
                      <RichText style={s.clausulaTexto}>{t}</RichText>
                    </View>
                  ))}
                </>
              )}

              {lineasTexto(condicionesComerciales).length > 0 && (
                <>
                  <Text style={s.seccionSubtitulo}>CONDICIONES COMERCIALES</Text>
                  {lineasTexto(condicionesComerciales).map((t, i) => (
                    <View key={`con-${i}`} style={s.clausulaRow} wrap={false}>
                      <Text style={s.clausulaLetra}>•</Text>
                      <RichText style={s.clausulaTexto}>{t}</RichText>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}
        </View>

        {/* ── FIRMA — al fondo gracias a justifyContent: space-between ── */}
        <View style={s.firmaContainer} wrap={false}>

          {/* Firma Cliente */}
          <View style={s.firmaCol}>
            <View style={s.firmaLinea} />
            <Text style={s.firmaNombreText}>{cliente.nombre_cliente}</Text>
            <Text style={s.firmaMutedText}>RUT: {cliente.rut || '________________'}</Text>
            <Text style={s.firmaMutedText}>Firma Cliente</Text>
          </View>

          {/* Firma Empresa */}
          <View style={s.firmaCol}>
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
