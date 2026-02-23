/* eslint-disable jsx-a11y/alt-text */
'use client';
import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image } from '@react-pdf/renderer';
import logoInnvolt from './logo-innvolt.png'; 

const styles = StyleSheet.create({
  page: { 
    padding: 50, 
    fontFamily: 'Helvetica', 
    fontSize: 10, 
    color: '#334155', 
    lineHeight: 1.5 
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start',
    marginBottom: 30, 
    borderBottomWidth: 2, 
    borderBottomColor: '#ffc600', 
    borderBottomStyle: 'solid',
    paddingBottom: 10 
  },
  logoSection: { 
    flexDirection: 'column',
    maxWidth: '70%', 
  },
  logoImage: {
    width: 120,      
    height: 'auto', 
    marginBottom: 8  
  },
  subtitle: { 
    fontSize: 10, 
    fontWeight: 'bold', 
    color: '#1e293b',
    lineHeight: 1.2,
    marginBottom: 4 
  },
  contactInfo: { 
    fontSize: 8, 
    color: '#64748b',
    lineHeight: 1.4 
  },
  folioBox: { 
    textAlign: 'right', 
    backgroundColor: '#f8fafc', 
    padding: 10, 
    borderRadius: 5, 
    borderWidth: 1, 
    borderStyle: 'solid', 
    borderColor: '#e2e8f0' 
  },
  title: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    textAlign: 'center', 
    color: '#1e293b', 
    marginBottom: 20, 
    textDecoration: 'underline' 
  },
  sectionTitle: { 
    fontSize: 12, 
    fontWeight: 'bold', 
    color: '#000000', 
    marginTop: 15, 
    marginBottom: 10, 
    borderBottomWidth: 1, 
    borderBottomColor: '#e2e8f0', 
    borderBottomStyle: 'solid',
    paddingBottom: 2 
  },
  tableHeader: { 
    flexDirection: 'row', 
    backgroundColor: '#1e293b', 
    color: 'white', 
    padding: 6, 
    fontWeight: 'bold' 
  },
  tableRow: { 
    flexDirection: 'row', 
    borderBottomWidth: 1, 
    borderBottomColor: '#f1f5f9', 
    borderBottomStyle: 'solid',
    padding: 6 
  },
  colDesc: { width: '60%' },
  colQty: { width: '10%', textAlign: 'center' },
  colPrice: { width: '15%', textAlign: 'right' },
  colTotal: { width: '15%', textAlign: 'right' },
  totalsArea: { 
    marginTop: 20, 
    flexDirection: 'row', 
    justifyContent: 'flex-end' 
  },
  totalBox: { width: 180 },
  totalRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingVertical: 2 
  },
  grandTotal: { 
    backgroundColor: '#1e293b', 
    color: 'white', 
    padding: 6, 
    marginTop: 5, 
    fontWeight: 'bold', 
    borderRadius: 2 
  },
  legalText: { 
    fontSize: 8, 
    color: '#475569', 
    textAlign: 'justify', 
    marginBottom: 8 
  },
  signatureSection: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginTop: 50 
  },
  signatureBox: { 
    width: '45%', 
    borderTopWidth: 1, 
    borderTopColor: '#1e293b', 
    borderTopStyle: 'solid',
    textAlign: 'center', 
    paddingTop: 5 
  },
});

export const PresupuestoPDF = ({ items = [], subtotal, iva, total, cliente, folio, descripcionGeneral, condiciones }: any) => {
  // Formateador de moneda CL
  const f = (v: any) => {
    const num = isNaN(parseFloat(v)) ? 0 : parseFloat(v);
    return `$ ${Math.round(num).toLocaleString('es-CL')}`;
  };

  const logoPath = (logoInnvolt as any)?.src || logoInnvolt;

  return (
    <Document title={`Presupuesto ${folio}`}>
      {/* PÁGINA 1: DETALLE Y COSTOS */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.logoSection}>
            <Image src={logoPath} style={styles.logoImage} />
            <Text style={styles.subtitle}>Soluciones Eléctricas y Automatización</Text>
            <Text style={styles.contactInfo}>inn-volt@outlook.cl | www.innvolt.cl</Text>
          </View>
          <View style={styles.folioBox}>
            <Text style={{ fontWeight: 'bold', color: '#000000' }}>
               PRESUPUESTO N° {folio ? String(folio).padStart(5, '0') : '---'}
            </Text>
            <Text style={styles.contactInfo}>Fecha: {new Date().toLocaleDateString('es-CL')}</Text>
          </View>
        </View>

        <View style={{ marginBottom: 20 }}>
          <Text style={styles.sectionTitle}>Datos del Cliente / Proyecto</Text>
          <Text>Nombre: {cliente?.nombre_cliente || '---'}</Text>
          <Text>RUT: {cliente?.rut || '---'}</Text>
          <Text>Ubicación: {cliente?.direccion || '---'}</Text>
        </View>

        <Text style={styles.title}>PRESUPUESTO DE OBRA</Text>

        <Text style={styles.sectionTitle}>1. Descripción General del Servicio</Text>
        <Text style={{ fontSize: 9, marginBottom: 15, textAlign: 'justify' }}>
          {descripcionGeneral || "Servicio técnico eléctrico integral según requerimientos técnicos conversados con el mandante."}
        </Text>

        <Text style={styles.sectionTitle}>2. Detalle de Costos (Mano de Obra y Materiales)</Text>
        <View style={styles.tableHeader}>
          <Text style={styles.colDesc}>Descripción</Text>
          <Text style={styles.colQty}>Cant.</Text>
          <Text style={styles.colPrice}>Unit.</Text>
          <Text style={styles.colTotal}>Total</Text>
        </View>
        
        {items.map((item: any, i: number) => {
          const desc = item.descripcion || 'Sin descripción';
          const cant = Number(item.cantidad) || 0;
          const precio = Number(item.precio) || 0;
          const totalItem = cant * precio;

          return (
            <View key={i} style={styles.tableRow} wrap={false}>
              <Text style={styles.colDesc}>{desc}</Text>
              <Text style={styles.colQty}>{cant}</Text>
              <Text style={styles.colPrice}>{f(precio)}</Text>
              <Text style={styles.colTotal}>{f(totalItem)}</Text>
            </View>
          );
        })}

        <View style={styles.totalsArea}>
          <View style={styles.totalBox}>
            <View style={styles.totalRow}>
              <Text>Neto:</Text>
              <Text>{f(subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>IVA (19%):</Text>
              <Text>{f(iva)}</Text>
            </View>
            <View style={[styles.totalRow, styles.grandTotal]}>
              <Text>TOTAL:</Text>
              <Text>{f(total)}</Text>
            </View>
          </View>
        </View>
      </Page>

      {/* PÁGINA 2: CONDICIONES Y FIRMAS */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Condiciones de Servicio y Garantía</Text>
        <Text style={styles.legalText}>
          • Garantía: 6 meses sobre la mano de obra. La garantía no cubre fallas por mal uso o intervención de terceros.{"\n"}
          • Materiales: La garantía de los materiales es responsabilidad del fabricante.{"\n"}
          • Modificaciones: Cualquier trabajo adicional no presupuestado será valorizado por separado.
        </Text>

        <Text style={styles.sectionTitle}>Condiciones Comerciales</Text>
        <Text style={styles.legalText}>
          • Validez de la oferta: 15 días corridos.{"\n"}
          • Forma de Pago: 50% de anticipo para el inicio de los trabajos y 50% restante al finalizar y entregar la obra conforme.{"\n"}
          • El retraso en los pagos facultará la suspensión de los trabajos.{"\n"}
          • Formas de pago: Transferencia electrónica o efectivo a la cuenta de InnVolt SpA.
        </Text>

        {/* --- NUEVA SECCIÓN DINÁMICA --- */}
        {condiciones && (
          <>
            <Text style={styles.sectionTitle}>Notas Adicionales</Text>
            <Text style={styles.legalText}>{condiciones}</Text>
          </>
        )}

        <View style={{ marginTop: 80 }}>
          <View style={styles.signatureSection}>
            <View style={styles.signatureBox}>
              <Text style={{ fontWeight: 'bold' }}>InnVolt SpA</Text>
              <Text style={styles.contactInfo}>Firma y Timbre</Text>
            </View>
            <View style={styles.signatureBox}>
              <Text style={{ fontWeight: 'bold' }}>{cliente?.nombre_cliente || 'Aceptación Cliente'}</Text>
              <Text style={styles.contactInfo}>Firma, Nombre y RUT</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};