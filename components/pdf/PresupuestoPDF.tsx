import React from 'react';
import {
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer';
import type { CotizacionItem, Cliente } from '@/types';
import type { Totals } from '@/utils';

// ─── Paleta INNVOLT ───────────────────────────────────────────────────────────
const Y      = '#000000';
const BLACK  = '#000000';
const WHITE  = '#ffffff';
const MUTED  = '#000000';
const GRAY2  = '#000000';
const GRIS   = '#aaaaaa';

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    backgroundColor: WHITE,
    color: BLACK,
    fontFamily: 'Helvetica',
    fontSize: 8,
    paddingTop: 40,
    paddingBottom: 60,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: '0 32 20 32',
    borderBottomWidth: 2,
    borderBottomColor: Y,
  },
  logoBlock: {
    width: '30%',
    justifyContent: 'center',
  },
  infoBlock: {
    width: '40%',
    paddingLeft: 15,
    borderLeftWidth: 1,
    borderLeftColor: Y,
  },
  headerRight: {
    width: '30%',
    alignItems: 'flex-end',
  },
  folioBox: {
    borderWidth: 1,
    borderColor: GRAY2,
    padding: '8 12',
    width: '100%',
    alignItems: 'center',
  },
  fechaBox: {
    borderWidth: 1,
    borderColor: GRAY2,
    borderTopWidth: 0,
    padding: '4 12',
    width: '100%',
    alignItems: 'center',
  },
  logoImage: {
    width: 150,
    objectFit: 'contain',
  },
  logoName: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: BLACK,
    letterSpacing: 1,
  },
  logoInfo: { fontSize: 7, color: MUTED, marginTop: 2 },
  folioLabel: { fontSize: 7, color: BLACK, letterSpacing: 2.5, marginBottom: 4 },
  folioNum: { fontSize: 26, fontFamily: 'Helvetica-Bold', color: BLACK },
  fechaText: { fontSize: 7, color: MUTED, marginTop: 6 },

  // ── Partes ──
  partesOuter: {
    margin: '14 32 0 32',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: GRAY2,
  },
  parteCellLast: { flex: 1, padding: '9 12' },
  parteLabel: { fontSize: 10, color: BLACK, letterSpacing: 2.5, marginBottom: 5 },
  parteNombre: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: BLACK, marginBottom: 2 },
  parteSub: { fontSize: 7, color: MUTED, marginBottom: 1.5 },

  // ── Descripción general ──
  descBox: {
    margin: '12 32 0 32',
    padding: '8 12',
    backgroundColor: GRIS,
    borderLeftWidth: 2,
    borderLeftColor: Y,
  },
  descLabel: { fontSize: 6, color: MUTED, letterSpacing: 2, marginBottom: 4 },
  descText: { fontSize: 7.5, color: BLACK, lineHeight: 1.5 },

  // ── Tabla ──
  content: { padding: '12 32 0 32' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Y,
    padding: '5 8',
  },
  tableHeaderText: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: WHITE,
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: 'row',
    padding: '6 8',
    borderBottomWidth: 1,
    borderBottomColor: GRAY2,
  },
  tableRowAlt: { backgroundColor: '#dddddd' },
  tableCell: { fontSize: 7.5, color: '#000000' },
  tableCellMuted: { fontSize: 7, color: MUTED },
  catBadge: { fontSize: 5.5, color: Y, letterSpacing: 1.5, marginTop: 1 },

  colNum: { width: 18, textAlign: 'center' },
  colServicio: { flex: 1 },
  colDesc: { width: 110 },
  colQty: { width: 36, textAlign: 'center' },
  colValor: { width: 62, textAlign: 'right' },
  colTotal: { width: 68, textAlign: 'right' },

  // ── Totales ──
  totalesBox: { marginTop: 10, flexDirection: 'row', justifyContent: 'flex-end' },
  totalesInner: { width: 230 },
  totalesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: '4 10',
    borderBottomWidth: 1,
    borderBottomColor: GRAY2,
  },
  totalesLabel: { fontSize: 7, color: BLACK },
  totalesValue: { fontSize: 7.5, color: BLACK, fontFamily: 'Helvetica-Bold' },
  totalFinalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: '7 10',
    backgroundColor: '#000000',
  },
  totalFinalLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: WHITE, letterSpacing: 1 },
  totalFinalValue: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: WHITE },

  // ── Importante ──
  importanteBox: {
    margin: '14 32 0 32',
    borderWidth: 1,
    borderColor: GRAY2,
    padding: '9 12',
    backgroundColor: GRIS,
  },
  importanteLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: BLACK,
    letterSpacing: 1.5,
    marginBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: GRAY2,
    paddingBottom: 4,
  },
  importanteText: { fontSize: 7, color: MUTED, lineHeight: 1.6 },

  // ── Secciones cláusulas ──
  seccionBox: { margin: '10 32 0 32' },
  seccionTitulo: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: BLACK,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Y,
    paddingBottom: 5,
  },
  seccionSubtitulo: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: Y,
    marginTop: 8,
    marginBottom: 4,
  },
  clausulaRow: { flexDirection: 'row', marginBottom: 3 },
  clausulaLetra: { fontSize: 7, color: Y, width: 14 },
  clausulaTexto: { fontSize: 7, color: MUTED, flex: 1, lineHeight: 1.6 },

  // ── Firma ──
  // La firma va al final de la última página usando flex en la Page
  firmaContainer: {
    margin: '20 32 16 32',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  firmaCol: {
    width: 220,
    alignItems: 'center',
  },
  firmaLinea: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: Y,
    marginBottom: 8,
  },
  firmaNombreText: {
    color: BLACK,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  firmaMutedText: {
    color: MUTED,
    fontSize: 7,
  },

  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: WHITE,
    padding: '8 32',
    borderTopWidth: 1,
    borderTopColor: GRAY2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLeft: { fontSize: 6.5, color: MUTED },
  footerRight: { fontSize: 6.5, color: MUTED },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', minimumFractionDigits: 0,
  }).format(n || 0);

const today = () =>
  new Date().toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

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
}

// ─── Cláusulas ───────────────────────────────────────────────────────────────
const buildGarantiasEquipos = (empresa: EmpresaInfo) => [
  { l: 'a.', t: 'Garantía de instalación y mano de obra: 6 meses desde la fecha de entrega o puesta en servicio, salvo que la propuesta indique expresamente un plazo distinto.' },
  { l: 'b.', t: 'Los equipos, componentes y materiales suministrados cuentan con la garantía otorgada por sus respectivos fabricantes o distribuidores autorizados.' },
  { l: 'c.', t: 'La garantía cubre exclusivamente defectos atribuibles a errores de instalación, montaje o configuración realizados por personal de la empresa.' },
  { l: 'd.', t: 'La garantía no cubre daños provocados por manipulación de terceros, modificaciones no autorizadas, vandalismo, robo, incendios, inundaciones, humedad, sobretensiones, descargas atmosféricas, catástrofes naturales, fallas de suministro eléctrico o uso indebido.' },
  { l: 'e.', t: 'Equipos, materiales o instalaciones preexistentes propiedad del cliente y no suministrados por la empresa quedan expresamente excluidos de cualquier garantía.' },
  { l: 'f.', t: 'Toda intervención realizada por terceros no autorizados dejará sin efecto la garantía sobre el elemento intervenido.' },
];

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
}: {
  item: CotizacionItem;
  idx: number;
  catLabel: Record<string, string>;
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
      <Text style={[s.tableCell, s.colValor]}>{fmtCLP(item.precio)}</Text>
      <Text style={[s.tableCell, s.colTotal]}>{fmtCLP(subtotal)}</Text>
    </View>
  );
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function PresupuestoPDF({
  cliente, items, totals, descuentoPorcentajeMO,
  folio, descripcionGeneral, garantia, condicionesComerciales,
  ocultarSuministros, empresa,
}: Props) {

  const itemsDisplay: CotizacionItem[] = ocultarSuministros
    ? [
        ...items.filter(i => i.categoria !== 'material'),
        ...(items.some(i => i.categoria === 'material')
          ? [{
              id: 'suministros',
              descripcion: 'Suministros y materiales',
              categoria: 'material' as const,
              cantidad: 1, unidad: 'global',
              costo: 0, margen: 0,
              precio: totals.netoMateriales + totals.ivaMateriales,
              iva_incluido: true,
              esMaterial: true,
            }]
          : []),
      ]
    : items;

  const catLabel: Record<string, string> = {
    material:  'MATERIAL',
    mano_obra: 'MANO DE OBRA',
    servicio:  'SERVICIO',
  };

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

        {/* ── HEADER ── */}
        <View style={s.header}>
          <View style={s.logoBlock}>
            {empresa.logo_url ? (
              <Image style={s.logoImage} src={empresa.logo_url} />
            ) : (
              <Text style={s.logoName}>{empresa.nombre.toUpperCase()}</Text>
            )}
          </View>

          <View style={s.infoBlock}>
            <Text style={[s.logoName, { fontSize: 14, marginBottom: 4 }]}>{empresa.nombre}</Text>
            <Text style={s.logoInfo}>Correo: {empresa.email}</Text>
            <Text style={s.logoInfo}>Teléfono: {empresa.telefono}</Text>
            {empresa.direccion && <Text style={s.logoInfo}>Dirección: {empresa.direccion}</Text>}
            {empresa.giro && <Text style={s.logoInfo}>Giro: {empresa.giro}</Text>}
            <Text style={s.logoInfo}>RUT: {empresa.rut}</Text>
            {empresa.website && <Text style={s.logoInfo}>{empresa.website}</Text>}
          </View>

          <View style={s.headerRight}>
            <View style={s.folioBox}>
              <Text style={s.folioLabel}>N° COTIZACIÓN</Text>
              <Text style={s.folioNum}>{folio}</Text>
            </View>
            <View style={s.fechaBox}>
              <Text style={[s.fechaText, { marginTop: 0 }]}>Fecha: {today()}</Text>
            </View>
          </View>
        </View>

        {/* ── PARTES (Cliente) ── */}
        <View style={s.partesOuter}>
          <View style={s.parteCellLast}>
            <Text style={s.parteLabel}>CLIENTE</Text>
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.parteSub}>Nombre</Text>
                <Text style={s.parteNombre}>{cliente.nombre_cliente}</Text>
                <Text style={s.parteSub}>Empresa</Text>
                <Text style={s.parteSub}>{cliente.empresa || '-'}</Text>
                <Text style={s.parteSub}>RUT</Text>
                <Text style={s.parteSub}>{cliente.rut || '-'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.parteSub}>Teléfono</Text>
                <Text style={s.parteSub}>{cliente.telefono || '-'}</Text>
                <Text style={s.parteSub}>Correo</Text>
                <Text style={s.parteSub}>{cliente.email || '-'}</Text>
                <Text style={s.parteSub}>Dirección</Text>
                <Text style={s.parteSub}>{cliente.direccion || '-'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── DESCRIPCIÓN GENERAL ──
            wrap={true} para que si es muy larga pueda paginar.
            minPresenceAhead={60} para que no quede solo el título al fondo. */}
        {descripcionGeneral && (
          <View style={s.descBox} minPresenceAhead={60}>
            <Text style={s.descLabel}>DESCRIPCIÓN DEL TRABAJO</Text>
            <Text style={s.descText}>{descripcionGeneral}</Text>
          </View>
        )}

        {/* ── TABLA DE ÍTEMS ──
            El truco clave: envolver header + primera fila en wrap={false}
            para que nunca el header quede solo al final de una página. */}
        <View style={s.content}>

          {/* Header + primera fila — siempre juntos */}
          <View wrap={false}>
            <View style={s.tableHeader}>
              <Text style={[s.tableHeaderText, s.colNum]}>#</Text>
              <Text style={[s.tableHeaderText, s.colServicio]}>Servicio / Producto</Text>
              <Text style={[s.tableHeaderText, s.colDesc]}>Descripción</Text>
              <Text style={[s.tableHeaderText, s.colQty]}>Cantidad</Text>
              <Text style={[s.tableHeaderText, s.colValor]}>Valor</Text>
              <Text style={[s.tableHeaderText, s.colTotal]}>Total</Text>
            </View>
            {itemsDisplay.length > 0 && (
              <TablaFila item={itemsDisplay[0]} idx={0} catLabel={catLabel} />
            )}
          </View>

          {/* Resto de filas — cada una no se parte internamente */}
          {itemsDisplay.slice(1).map((item, idx) => (
            <TablaFila key={item.id} item={item} idx={idx + 1} catLabel={catLabel} />
          ))}

          {/* ── TOTALES — bloque completo sin corte ── */}
          <View wrap={false} style={{ marginBottom: 20 }}>
            <View style={s.totalesBox}>
              <View style={s.totalesInner}>
                <View style={s.totalesRow}>
                  <Text style={s.totalesLabel}>Moneda</Text>
                  <Text style={s.totalesValue}>Peso Chileno</Text>
                </View>
                {totals.netoMateriales > 0 && (
                  <View style={s.totalesRow}>
                    <Text style={s.totalesLabel}>Neto Materiales</Text>
                    <Text style={s.totalesValue}>{fmtCLP(totals.netoMateriales)}</Text>
                  </View>
                )}
                {totals.ivaMateriales > 0 && (
                  <View style={s.totalesRow}>
                    <Text style={s.totalesLabel}>IVA Materiales (19%)</Text>
                    <Text style={s.totalesValue}>{fmtCLP(totals.ivaMateriales)}</Text>
                  </View>
                )}
                {totals.netoMO > 0 && (
                  <View style={s.totalesRow}>
                    <Text style={s.totalesLabel}>
                      Mano de Obra{descuentoPorcentajeMO > 0 ? ` (-${descuentoPorcentajeMO}%)` : ''}
                    </Text>
                    <Text style={s.totalesValue}>{fmtCLP(totals.netoMO)}</Text>
                  </View>
                )}
                {totals.netoServicios > 0 && (
                  <View style={s.totalesRow}>
                    <Text style={s.totalesLabel}>Servicios</Text>
                    <Text style={s.totalesValue}>{fmtCLP(totals.netoServicios)}</Text>
                  </View>
                )}
                <View style={s.totalesRow}>
                  <Text style={s.totalesLabel}>Neto</Text>
                  <Text style={s.totalesValue}>{fmtCLP(totals.netoGeneral)}</Text>
                </View>
                <View style={s.totalesRow}>
                  <Text style={s.totalesLabel}>IVA (19%)</Text>
                  <Text style={s.totalesValue}>{fmtCLP(totals.ivaGeneral)}</Text>
                </View>
                <View style={s.totalFinalRow}>
                  <Text style={s.totalFinalLabel}>TOTAL</Text>
                  <Text style={s.totalFinalValue}>{fmtCLP(totals.total)}</Text>
                </View>
              </View>
            </View>
          </View>

        </View>

        {/* ── FOOTER página 1 ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerLeft}>{empresa.nombre}</Text>
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
        {/* Contenido superior: Importante + Cláusulas */}
        <View>

          {/* ── IMPORTANTE ── */}
          <View style={s.importanteBox} wrap={false}>
            <Text style={s.importanteLabel}>IMPORTANTE</Text>
            <Text style={s.importanteText}>{textoImportante}</Text>
          </View>

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
          <Text style={s.footerLeft}>{empresa.nombre}</Text>
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
