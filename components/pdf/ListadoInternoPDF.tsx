import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { CotizacionItem } from '@/types';

const Y     = '#ffc600';
const BLACK = '#000000';
const DARK  = '#0d0d0d';
const GRAY1 = '#1a1a1a';
const GRAY2 = '#2a2a2a';
const MUTED = '#666666';
const WHITE = '#ffffff';

const s = StyleSheet.create({
  page: { backgroundColor: BLACK, color: WHITE, fontFamily: 'Helvetica', fontSize: 8, padding: 0 },
  header: {
    backgroundColor: DARK, padding: '18 28 14 28',
    borderBottomWidth: 2, borderBottomColor: Y,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: WHITE, letterSpacing: 1 },
  titleY: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: Y, letterSpacing: 1 },
  sub: { fontSize: 6, color: MUTED, letterSpacing: 2, marginTop: 3 },
  right: { alignItems: 'flex-end' },
  folioLabel: { fontSize: 6, color: Y, letterSpacing: 3, marginBottom: 3 },
  folioVal: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: WHITE },
  fecha: { fontSize: 6.5, color: MUTED, marginTop: 3 },
  content: { padding: '16 28 20 28' },
  infoRow: {
    flexDirection: 'row', gap: 8, marginBottom: 12,
  },
  infoBox: { flex: 1, backgroundColor: GRAY1, padding: '7 10', borderLeftWidth: 2, borderLeftColor: Y },
  infoLabel: { fontSize: 5.5, color: Y, letterSpacing: 2.5, marginBottom: 4 },
  infoVal: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: WHITE, marginBottom: 1 },
  infoSub: { fontSize: 6.5, color: MUTED },
  tableHeader: { flexDirection: 'row', backgroundColor: Y, padding: '4 8' },
  th: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: BLACK, letterSpacing: 1.5 },
  row: { flexDirection: 'row', padding: '5 8', borderBottomWidth: 1, borderBottomColor: GRAY2 },
  rowAlt: { backgroundColor: '#080808' },
  td: { fontSize: 7.5, color: '#dddddd' },
  tdMuted: { fontSize: 7, color: MUTED },
  colN:     { width: 20 },
  colDesc: {
  flex: 1,
},

colQty: {
  width: 60,
  textAlign: 'center',
},

colUnit: {
  width: 70,
  textAlign: 'center',
},
  footer: {
    backgroundColor: DARK, padding: '8 28',
    borderTopWidth: 1, borderTopColor: GRAY2,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  footerText: { fontSize: 6, color: MUTED },
  totBox: {
    marginTop: 10, flexDirection: 'row', justifyContent: 'flex-end',
  },
  totInner: {
    width: 200, backgroundColor: GRAY1, padding: '8 10', borderTopWidth: 2, borderTopColor: Y,
  },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totLabel: { fontSize: 7, color: MUTED },
  totVal: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: WHITE },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 6, paddingTop: 5, borderTopWidth: 1, borderTopColor: GRAY2,
  },
  totalLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: Y, letterSpacing: 1 },
  totalVal: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: Y },
  warningBox: {
    backgroundColor: '#1a1000', borderLeftWidth: 2, borderLeftColor: Y,
    padding: '6 10', marginBottom: 12,
  },
  warningText: { fontSize: 7, color: '#ccaa00' },
});

const today = () => new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });

interface Props {
  items: CotizacionItem[];
  folio: string;
  clienteNombre: string;
  descripcion?: string;
  /** Empresa que emite la solicitud (antes iba fija a InnVolt). */
  empresa?: { nombre: string; rut?: string; email?: string; telefono?: string };
}

export default function ListadoInternoPDF({ items, folio, clienteNombre, descripcion, empresa }: Props) {
  const emisor = {
    nombre:   empresa?.nombre   || 'INNVOLT SpA',
    rut:      empresa?.rut      || '78.299.986-9',
    email:    empresa?.email    || 'innvolt.cl@gmail.com',
    telefono: empresa?.telefono || '',
  };

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
  <View>
    <View style={{ flexDirection: 'row' }}>
  <Text style={s.title}>SOLICITUD DE</Text>
  <Text style={s.titleY}> COTIZACIÓN</Text>
</View>

    <Text style={s.sub}>{emisor.nombre}</Text>

    {emisor.rut ? <Text style={s.sub}>RUT: {emisor.rut}</Text> : null}

    {emisor.email ? <Text style={s.sub}>Correo: {emisor.email}</Text> : null}

    {emisor.telefono ? <Text style={s.sub}>Contacto: {emisor.telefono}</Text> : null}

  </View>

  <View style={s.right}>
    <Text style={s.folioLabel}>SOLICITUD N°</Text>
    <Text style={s.folioVal}>{folio}</Text>
    <Text style={s.fecha}>{today()}</Text>
  </View>
</View>
        {/* Content */}
        <View style={s.content}>

          {/* Info */}
          <View style={s.infoRow}>

  <View style={s.infoBox}>
    <Text style={s.infoLabel}>PROYECTO</Text>
    <Text style={s.infoVal}>{clienteNombre}</Text>

    {descripcion && (
      <Text style={s.infoSub}>
        {descripcion}
      </Text>
    )}
  </View>

  <View style={s.infoBox}>
    <Text style={s.infoLabel}>RESUMEN</Text>
    <Text style={s.infoVal}>
      {items.length} materiales
    </Text>

    <Text style={s.infoSub}>
      Solicitud para cotización comercial
    </Text>
  </View>

</View>

<View style={s.tableHeader} >
  <Text style={[s.th, s.colN]}>#</Text>
  <Text style={[s.th, s.colDesc]}>DESCRIPCIÓN</Text>
  <Text style={[s.th, s.colQty]}>CANTIDAD</Text>
  <Text style={[s.th, s.colUnit]}>UNIDAD</Text>
</View>

          {items.map((item, idx) => (

  <View
    key={item.id}
    wrap={false}
    style={[
      s.row,
      idx % 2 === 1 ? s.rowAlt : {}
    ]}
  >
    <Text style={[s.tdMuted, s.colN]}>
      {idx + 1}
    </Text>

    <Text style={[s.td, s.colDesc]}>
      {item.descripcion}
    </Text>

    <Text style={[s.td, s.colQty]}>
      {item.cantidad}
    </Text>

    <Text style={[s.tdMuted, s.colUnit]}>
      {item.unidad}
    </Text>

  </View>

))}

<View
  wrap={false}
  style={{
    marginTop: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: '#444',
  }}
>
  <Text
    style={{
      fontSize: 8,
      fontFamily: 'Helvetica-Bold',
      marginBottom: 6,
    }}
  >
    FAVOR INDICAR EN SU RESPUESTA:
  </Text>

  <Text style={{ fontSize: 7 }}>
    • Precio unitario
  </Text>

  <Text style={{ fontSize: 7 }}>
    • Precio total
  </Text>

  <Text style={{ fontSize: 7 }}>
    • Disponibilidad de stock
  </Text>

  <Text style={{ fontSize: 7 }}>
    • Tiempo de entrega
  </Text>

  <Text style={{ fontSize: 7 }}>
    • Condiciones comerciales
  </Text>
</View>
</View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>InnVolt SpA</Text>
          <Text style={s.footerText}>{folio} · {today()}</Text>
        </View>
      </Page>
    </Document>
  );
}
