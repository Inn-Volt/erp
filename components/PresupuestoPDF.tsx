/* eslint-disable jsx-a11y/alt-text */
'use client';
import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Link } from '@react-pdf/renderer';
import logoInnvolt from './logo-innvolt.png'; 

const styles = StyleSheet.create({
  page: { 
    padding: 45, 
    fontFamily: 'Helvetica', 
    fontSize: 9, 
    color: '#334155', 
    lineHeight: 1.6 
  },
  pageBody: {
    flexGrow: 1,
    flexDirection: 'column',
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 20, 
    borderBottomWidth: 2, 
    borderBottomColor: '#ffc600', 
    paddingBottom: 15 
  },
  logoImage: { width: 130, height: 'auto' },
  companyInfo: { textAlign: 'right' },
  folioBox: { 
    marginTop: 8,
    backgroundColor: '#1e293b', 
    color: '#ffffff',
    padding: 6, 
    borderRadius: 4, 
    textAlign: 'center' 
  },
  sectionTitle: { 
    fontSize: 10, 
    fontWeight: 'bold', 
    color: '#0f172a', 
    marginTop: 18, 
    marginBottom: 8, 
    textTransform: 'uppercase',
    borderLeftWidth: 3,
    borderLeftColor: '#ffc600',
    paddingLeft: 8
  },
  descriptionContainer: {
    backgroundColor: '#f8fafc',
    padding: 15,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10
  },
  descriptionText: { 
    fontSize: 9.5, 
    color: '#1e293b',
    textAlign: 'justify', 
    lineHeight: 1.6,
    letterSpacing: 0.1,
    margin: 20
  },
  clientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingLeft: 10,
    gap: 10
  },
  clientItem: {
    width: '48%', 
    marginBottom: 4
  },
  label: {
    fontWeight: 'bold',
    color: '#64748b',
    fontSize: 8,
    textTransform: 'uppercase'
  },
  valueText: {
    color: '#1e293b',
    fontSize: 9
  },
  // Estilo para enlaces que no parecen enlaces (como el logo o dirección)
  interactiveLink: {
    textDecoration: 'none',
    color: 'inherit'
  },
  // Estilo para destacar que algo es cliqueable (opcional para email/tel)
  blueLink: {
    color: '#2563eb',
    textDecoration: 'none'
  },
  tableHeader: { 
    flexDirection: 'row', 
    backgroundColor: '#1e293b', 
    color: 'white', 
    padding: 8, 
    fontWeight: 'bold',
    marginTop: 5
  },
  tableRow: { 
    flexDirection: 'row', 
    borderBottomWidth: 1, 
    borderBottomColor: '#f1f5f9', 
    padding: 8 
  },
  colDesc: { width: '65%' },
  colQty: { width: '10%', textAlign: 'center' },
  colPrice: { width: '12.5%', textAlign: 'right' },
  colTotal: { width: '12.5%', textAlign: 'right' },
  totalsArea: { 
    marginTop: 15, 
    flexDirection: 'row', 
    justifyContent: 'flex-end' 
  },
  totalBox: { 
    width: 210, 
    backgroundColor: '#f8fafc', 
    padding: 8, 
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  totalRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between',
    paddingVertical: 2
  },
  categoryLabel: {
    fontSize: 8,
    color: '#64748b',
    fontStyle: 'italic'
  },
  grandTotal: { 
    marginTop: 4, 
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#ffc600',
    fontWeight: 'bold', 
    fontSize: 10,
    color: '#0f172a'
  },
  signatureWrapper: {
    marginTop: 'auto',
    paddingTop: 20,
    marginBottom: 20,
  },
  signatureSection: { 
    flexDirection: 'row', 
    justifyContent: 'space-between',
  },
  signatureBox: { 
    width: '42%', 
    borderTopWidth: 1, 
    borderTopColor: '#1e293b', 
    textAlign: 'center', 
    paddingTop: 8 
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 45,
    right: 45,
    textAlign: 'center',
    fontSize: 7,
    color: '#94a3b8',
    borderTopWidth: 0.5,
    borderTopColor: '#e2e8f0',
    paddingTop: 8
  }
});

export const PresupuestoPDF = ({ 
  items = [], subtotal, iva, total, cliente, folio, descripcionGeneral, garantia, condicionesComerciales 
}: any) => {
  const f = (v: any) => `$ ${Math.round(v || 0).toLocaleString('es-CL')}`;
  const logoPath = (logoInnvolt as any)?.src || logoInnvolt;

  // Lógica de separación de ítems
  const materiales = items.filter((i: any) => i.esMaterial);
  const moItems = items.filter((i: any) => !i.esMaterial);
  const totalSumaMateriales = materiales.reduce((acc: number, curr: any) => acc + (curr.precio * curr.cantidad), 0);
  const totalSumaMO = moItems.reduce((acc: number, curr: any) => acc + (curr.precio * curr.cantidad), 0);

  const itemsParaMostrar = [
    ...moItems,
    ...(totalSumaMateriales > 0 ? [{
      descripcion: "SUMINISTROS Y MATERIALES ELÉCTRICOS SEGÚN PROYECTO",
      cantidad: 1,
      precio: totalSumaMateriales
    }] : [])
  ];

  // Limpieza de teléfono para WhatsApp (solo números)
  const wspNumber = cliente?.telefono?.replace(/\D/g, '');

  return (
    <Document title={`Presupuesto ${folio}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* Logo con enlace a la web */}
          <Link src="https://www.innvolt.cl" style={styles.interactiveLink}>
            <Image src={logoPath} style={styles.logoImage} />
          </Link>
          <View style={styles.companyInfo}>
            <Text style={{ fontWeight: 'bold' }}>InnVolt SpA</Text>
            <Text style={{ fontSize: 8 }}>inn-volt@outlook.cl | www.innvolt.cl</Text>
            <View style={styles.folioBox}>
              <Text style={{ fontSize: 9, fontWeight: 'bold' }}>PRESUPUESTO {folio}</Text>
            </View>
          </View>
        </View>

        <View style={{ marginBottom: 15 }}>
          <Text style={styles.sectionTitle}>Información del Proyecto / Cliente</Text>
          <View style={styles.clientGrid}>
            <View style={styles.clientItem}>
              <Text style={styles.label}>Cliente / Razón Social:</Text>
              <Text style={styles.valueText}>{cliente?.nombre_cliente || '---'}</Text>
            </View>
            <View style={styles.clientItem}>
              <Text style={styles.label}>RUT:</Text>
              <Text style={styles.valueText}>{cliente?.rut || '---'}</Text>
            </View>
            <View style={styles.clientItem}>
              <Text style={styles.label}>Ubicación de Obra:</Text>
              {/* Enlace a Google Maps */}
              <Link src={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cliente?.direccion || '')}`} style={styles.interactiveLink}>
                <Text style={[styles.valueText, { color: '#2563eb', textDecoration: 'underline' }]}>
                  {cliente?.direccion || '---'}
                </Text>
              </Link>
            </View>
            <View style={styles.clientItem}>
              <Text style={styles.label}>Contacto (Email | Tel/Cel):</Text>
              <View style={{ flexDirection: 'row', gap: 5 }}>
                {/* Enlace a Email */}
                <Link src={`mailto:${cliente?.email}`} style={styles.blueLink}>
                  <Text style={styles.valueText}>{cliente?.email || '---'}</Text>
                </Link>
                <Text style={styles.valueText}>|</Text>
                {/* Enlace a WhatsApp */}
                <Link src={`https://wa.me/${wspNumber}`} style={styles.blueLink}>
                  <Text style={styles.valueText}>{cliente?.telefono || '---'}</Text>
                </Link>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>1. Alcance Técnico del Servicio</Text>
        <View style={styles.descriptionContainer}>
          <Text style={styles.descriptionText}>
            {descripcionGeneral || "Servicios técnicos eléctricos especializados."}
          </Text>
        </View>

        <Text break style={styles.sectionTitle}>2. Detalle de Presupuesto</Text>
        <View style={styles.tableHeader}>
          <Text style={styles.colDesc}>Descripción de Partida</Text>
          <Text style={styles.colQty}>Cant.</Text>
          <Text style={styles.colPrice}>Unitario</Text>
          <Text style={styles.colTotal}>Total</Text>
        </View>
        
        {itemsParaMostrar.map((item: any, i: number) => (
          <View key={i} style={styles.tableRow} wrap={false}>
            <Text style={styles.colDesc}>{item.descripcion}</Text>
            <Text style={styles.colQty}>{item.cantidad}</Text>
            <Text style={styles.colPrice}>{f(item.precio)}</Text>
            <Text style={styles.colTotal}>{f(item.cantidad * item.precio)}</Text>
          </View>
        ))}

        <View style={styles.totalsArea}>
          <View style={styles.totalBox}>
            <View style={styles.totalRow}>
              <Text style={styles.categoryLabel}>Total Materiales:</Text>
              <Text style={styles.categoryLabel}>{f(totalSumaMateriales)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.categoryLabel}>Total Mano de Obra:</Text>
              <Text style={styles.categoryLabel}>{f(totalSumaMO)}</Text>
            </View>
            <View style={[styles.totalRow, { marginTop: 4, borderTopWidth: 0.5, borderTopColor: '#cbd5e1', paddingTop: 2 }]}>
              <Text style={{ fontWeight: 'bold' }}>Monto Neto:</Text>
              <Text style={{ fontWeight: 'bold' }}>{f(subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>IVA (19%):</Text>
              <Text>{f(iva)}</Text>
            </View>
            <View style={[styles.totalRow, styles.grandTotal]}>
              <Text>TOTAL PRESUPUESTO:</Text>
              <Text>{f(total)}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.footer}>InnVolt SpA - Montajes Eléctricos e Ingeniería NCh Elec. 4/2003</Text>
      </Page>

      <Page size="A4" style={styles.page}>
        <View style={styles.pageBody}>
          <View style={styles.header}>
            <Link src="https://www.innvolt.cl" style={styles.interactiveLink}>
                <Image src={logoPath} style={styles.logoImage} />
            </Link>
            <Text style={{ fontSize: 8, color: '#64748b' }}>Ref. Folio: {folio}</Text>
          </View>

          <Text style={styles.sectionTitle}>3. Garantía y Responsabilidad</Text>
          <View style={styles.descriptionContainer}>
              <Text style={styles.descriptionText}>
                {garantia}
              </Text>
          </View>

          <Text break style={styles.sectionTitle}>4. Términos y Condiciones Comerciales</Text>
          <View style={styles.descriptionContainer}>
              <Text style={styles.descriptionText}>
                {condicionesComerciales}
              </Text>
          </View>

          <View wrap={false} style={styles.signatureWrapper}>
            <View style={styles.signatureSection}>
              <View style={styles.signatureBox}>
                <Text style={{ fontWeight: 'bold' }}>InnVolt SpA</Text>
                <Text style={{ fontSize: 7, color: '#64748b' }}>Firma</Text>
              </View>
              <View style={styles.signatureBox}>
                <Text style={{ fontWeight: 'bold' }}>{cliente?.nombre_cliente || 'Aceptación Cliente'}</Text>
                <Text style={{ fontSize: 7, color: '#64748b' }}>Firma, Nombre y RUT</Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>InnVolt SpA - www.innvolt.cl | Especialistas en Automatización e Instalaciones</Text>
      </Page>
    </Document>
  );
};