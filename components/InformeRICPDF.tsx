/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { Page, Text, View, Document, StyleSheet } from '@react-pdf/renderer';

// Configuración de estilos para el motor de PDF
const styles = StyleSheet.create({
  page: {
    padding: 40,
    backgroundColor: '#FFFFFF',
    fontFamily: 'Helvetica',
  },
  borderContainer: {
    border: '8pt solid #0f172a',
    height: '100%',
    padding: 30,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '3pt solid #0f172a',
    paddingBottom: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  subtitle: {
    fontSize: 10,
    marginTop: 4,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 8,
    color: '#94a3b8',
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  infoValue: {
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 2,
  },
  grid: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 20,
  },
  card: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 15,
    border: '1pt solid #e2e8f0',
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 10,
    borderBottom: '1pt solid #cbd5e1',
    paddingBottom: 5,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    borderBottom: '0.5pt solid #f1f5f9',
    paddingBottom: 2,
  },
  dataLabel: {
    fontSize: 8,
    color: '#64748b',
  },
  dataValue: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  checklistTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    borderBottom: '2pt solid #0f172a',
    paddingBottom: 5,
    marginBottom: 10,
  },
  checkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  checkItem: {
    width: '48%',
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkText: {
    fontSize: 7,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: '#475569',
  },
  badge: {
    fontSize: 7,
    padding: '2 5',
    borderRadius: 4,
    color: '#ffffff',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTop: '1pt solid #e2e8f0',
    paddingTop: 20,
  },
  signatureLine: {
    width: 150,
    borderTop: '1pt solid #0f172a',
    marginTop: 10,
    textAlign: 'center',
  },
});

interface Props {
  calc: any;
  resCaida: any;
  medicion: any;
  checklist: any;
}

// COMPONENTE DOCUMENTO (Este es el que se descarga)
export const InformeRICDocument = ({ calc, resCaida, medicion, checklist }: Props) => {
  const fecha = new Date().toLocaleDateString('es-CL', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.borderContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>PROTOCOLO RIC</Text>
              <Text style={styles.subtitle}>Informe de Verificación Técnica</Text>
            </View>
            <View style={{ textAlign: 'right' }}>
              <Text style={{ fontSize: 9, fontWeight: 'bold', backgroundColor: '#0f172a', color: '#fff', padding: 4 }}>
                INNVOLT OFFICIAL
              </Text>
              <Text style={{ fontSize: 8, marginTop: 5, color: '#64748b' }}>{fecha}</Text>
            </View>
          </View>

          {/* Info Bar */}
          <View style={styles.infoBar}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Fecha Inspección</Text>
              <Text style={styles.infoValue}>{fecha}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Ubicación</Text>
              <Text style={styles.infoValue}>Instalación Terreno</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Sistema</Text>
              <Text style={styles.infoValue}>InnVolt Pro ERP</Text>
            </View>
          </View>

          {/* Grid de Datos */}
          <View style={styles.grid}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Memoria Alimentador</Text>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Potencia/Carga:</Text>
                <Text style={styles.dataValue}>{calc?.valor || '0'} {calc?.modo}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Conductor:</Text>
                <Text style={styles.dataValue}>{calc?.seccion || '0'} mm²</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Caída V:</Text>
                <Text style={[styles.dataValue, { color: resCaida?.cumpleVoltaje ? '#10b981' : '#f43f5e' }]}>
                  {resCaida?.p || '0.0'}%
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Mediciones Terreno</Text>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Tensión Real:</Text>
                <Text style={styles.dataValue}>{medicion?.voltajeReal || '--'} V</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Resistencia Tierra:</Text>
                <Text style={styles.dataValue}>{medicion?.tierra || '--'} Ohms</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Aislamiento:</Text>
                <Text style={styles.dataValue}>{medicion?.aislamiento || '--'} Mohms</Text>
              </View>
            </View>
          </View>

          {/* Checklist */}
          <View style={{ marginTop: 10 }}>
            <Text style={styles.checklistTitle}>Cumplimiento RIC 19</Text>
            <View style={styles.checkGrid}>
              {checklist && Object.entries(checklist).map(([key, value]: any) => (
                <View key={key} style={styles.checkItem}>
                  <Text style={styles.checkText}>{key.replace(/_/g, ' ')}</Text>
                  <Text style={[styles.badge, { backgroundColor: value ? '#10b981' : '#f43f5e' }]}>
                    {value ? 'CUMPLE' : 'PEND'}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <View>
              <View style={styles.signatureLine} />
              <Text style={{ fontSize: 8, marginTop: 5, color: '#64748b' }}>Nombre y Firma Responsable Técnico</Text>
              <Text style={{ fontSize: 7, color: '#94a3b8' }}>Instalador Autorizado SEC</Text>
            </View>
            <View style={{ textAlign: 'right' }}>
              <Text style={{ fontSize: 7, color: '#94a3b8' }}>Verificado por Motor de Cálculo InnVolt Pro</Text>
              <Text style={{ fontSize: 7, fontWeight: 'bold', color: '#0f172a' }}>ERP INNVOLT V2 - 2026</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};