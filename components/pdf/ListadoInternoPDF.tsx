import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { CotizacionItem } from '@/types';

/**
 * ListadoInternoPDF — Solicitud de materiales a proveedor.
 * Documento en BLANCO (para impresión / envío al proveedor). Sirve de registro
 * de las compras a realizar para una cotización: lista los materiales con
 * columnas de precio en blanco para que el proveedor las complete.
 */

const INK   = '#1a1a1a';
const MUTED  = '#6b6b6b';
const FAINT  = '#9a9a9a';
const LINE   = '#dcdcdc';
const LINE2  = '#efefef';
const ACCENT = '#111111';   // negro sobrio para títulos/encabezado de tabla
const ZEBRA  = '#f7f7f7';

const s = StyleSheet.create({
  page: { backgroundColor: '#ffffff', color: INK, fontFamily: 'Helvetica', fontSize: 9, paddingBottom: 46 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '26 34 14 34', borderBottomWidth: 2, borderBottomColor: ACCENT,
  },
  brand: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: 0.3 },
  brandSub: { fontSize: 8, color: MUTED, marginTop: 3 },
  right: { alignItems: 'flex-end' },
  docLabel: { fontSize: 7, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' },
  folio: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 2 },
  fecha: { fontSize: 8, color: MUTED, marginTop: 3 },

  titulo: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, padding: '14 34 0', letterSpacing: 0.5 },

  content: { padding: '10 34 0' },

  infoRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  infoBox: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: '8 10' },
  infoLabel: { fontSize: 6.5, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 },
  infoVal: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK },
  infoSub: { fontSize: 7.5, color: MUTED, marginTop: 2 },

  tHead: { flexDirection: 'row', backgroundColor: ACCENT, padding: '6 8', borderRadius: 3 },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 0.6 },
  row: { flexDirection: 'row', padding: '6 8', borderBottomWidth: 1, borderBottomColor: LINE2, alignItems: 'center' },
  rowAlt: { backgroundColor: ZEBRA },
  td: { fontSize: 8.5, color: INK },
  tdMuted: { fontSize: 8, color: MUTED },

  colN:    { width: 22 },
  colDesc: { flex: 1, paddingRight: 6 },
  colProv: { width: 90, paddingRight: 6 },
  colQty:  { width: 46, textAlign: 'center' },
  colUnit: { width: 42, textAlign: 'center' },
  colMoney:{ width: 66, textAlign: 'right' },

  nota: { marginTop: 16, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 11 },
  notaTit: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 5, letterSpacing: 0.4 },
  notaItem: { fontSize: 8, color: MUTED, marginBottom: 2 },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: '10 34', borderTopWidth: 1, borderTopColor: LINE,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  footerText: { fontSize: 7, color: FAINT },
});

const today = () => new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });

interface Props {
  items: CotizacionItem[];
  folio: string;
  clienteNombre: string;
  descripcion?: string;
  empresa?: { nombre: string; rut?: string; email?: string; telefono?: string };
}

export default function ListadoInternoPDF({ items, folio, clienteNombre, descripcion, empresa }: Props) {
  const emisor = {
    nombre:   empresa?.nombre   || 'InnVolt SpA',
    rut:      empresa?.rut      || '78.299.986-9',
    email:    empresa?.email    || 'innvolt.cl@gmail.com',
    telefono: empresa?.telefono || '',
  };

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Encabezado */}
        <View style={s.header}>
          <View>
            <Text style={s.brand}>{emisor.nombre}</Text>
            {emisor.rut ? <Text style={s.brandSub}>RUT: {emisor.rut}</Text> : null}
            {emisor.email ? <Text style={s.brandSub}>{emisor.email}</Text> : null}
            {emisor.telefono ? <Text style={s.brandSub}>{emisor.telefono}</Text> : null}
          </View>
          <View style={s.right}>
            <Text style={s.docLabel}>Solicitud de materiales</Text>
            <Text style={s.folio}>{folio}</Text>
            <Text style={s.fecha}>{today()}</Text>
          </View>
        </View>

        <Text style={s.titulo}>SOLICITUD DE COTIZACIÓN A PROVEEDOR</Text>

        <View style={s.content}>
          <View style={s.infoRow}>
            <View style={s.infoBox}>
              <Text style={s.infoLabel}>Proyecto / Cliente</Text>
              <Text style={s.infoVal}>{clienteNombre}</Text>
              {descripcion ? <Text style={s.infoSub}>{descripcion}</Text> : null}
            </View>
            <View style={s.infoBox}>
              <Text style={s.infoLabel}>Resumen</Text>
              <Text style={s.infoVal}>{items.length} materiales</Text>
              <Text style={s.infoSub}>Registro de compras de la cotización</Text>
            </View>
          </View>

          {/* Tabla */}
          <View style={s.tHead}>
            <Text style={[s.th, s.colN]}>#</Text>
            <Text style={[s.th, s.colDesc]}>DESCRIPCIÓN</Text>
            <Text style={[s.th, s.colQty]}>CANT.</Text>
            <Text style={[s.th, s.colUnit]}>UNID.</Text>
            <Text style={[s.th, s.colMoney]}>P. UNIT.</Text>
            <Text style={[s.th, s.colMoney]}>TOTAL</Text>
          </View>

          {items.map((item, idx) => (
            <View key={item.id} wrap={false} style={[s.row, idx % 2 === 1 ? s.rowAlt : {}]}>
              <Text style={[s.tdMuted, s.colN]}>{idx + 1}</Text>
              <Text style={[s.td, s.colDesc]}>{item.descripcion}</Text>
              <Text style={[s.td, s.colQty]}>{item.cantidad}</Text>
              <Text style={[s.tdMuted, s.colUnit]}>{item.unidad}</Text>
              <Text style={[s.tdMuted, s.colMoney]}>—</Text>
              <Text style={[s.tdMuted, s.colMoney]}>—</Text>
            </View>
          ))}

          {/* Nota para el proveedor */}
          <View wrap={false} style={s.nota}>
            <Text style={s.notaTit}>Favor indicar en su respuesta:</Text>
            <Text style={s.notaItem}>• Precio unitario y total por ítem</Text>
            <Text style={s.notaItem}>• Disponibilidad de stock</Text>
            <Text style={s.notaItem}>• Tiempo de entrega</Text>
            <Text style={s.notaItem}>• Condiciones comerciales y de pago</Text>
          </View>
        </View>

        {/* Pie */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{emisor.nombre}</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${folio} · ${today()} · Pág. ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
