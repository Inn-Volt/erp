import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { LevantamientoData } from '@/types/levantamiento';

const COLORS = {
  primary: '#FFC600',
  secondary: '#333333',
  bgLight: '#F4F4F4',
  danger: '#FF0000',
  border: '#CCCCCC'
};

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 9, fontFamily: 'Helvetica' },
  header: { marginBottom: 20, borderBottom: `2 solid ${COLORS.primary}`, paddingBottom: 10 },
  logo: { fontSize: 22, fontWeight: 'bold' },
  title: { fontSize: 16, marginTop: 6, fontWeight: 'bold' },
  section: { marginBottom: 15 },
  sectionTitle: { backgroundColor: COLORS.primary, padding: 6, fontSize: 11, fontWeight: 'bold', marginBottom: 6 },
  row: { flexDirection: 'row', marginBottom: 4 },
  col: { flex: 1 },
  label: { fontWeight: 'bold', marginRight: 4 },
  table: { border: `1 solid ${COLORS.border}`, marginBottom: 10 },
  tableHeader: { flexDirection: 'row', backgroundColor: COLORS.bgLight },
  th: { flex: 1, padding: 4, borderRight: `1 solid ${COLORS.border}`, fontWeight: 'bold' },
  tr: { flexDirection: 'row' },
  td: { flex: 1, padding: 4, borderTop: `1 solid #ddd`, borderRight: `1 solid #ddd` },
  footer: { position: 'absolute', bottom: 20, left: 30, right: 30, textAlign: 'center', color: '#666', fontSize: 8 },
  critical: { color: COLORS.danger, fontWeight: 'bold', marginBottom: 2 }
});

interface Props {
  data: LevantamientoData;
  estado: string;
}

export default function LevantamientoPDF({ data, estado }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.logo}>INNVOLT SPA</Text>
          <Text style={styles.title}>LEVANTAMIENTO TÉCNICO ELÉCTRICO</Text>
        </View>

        {/* 01. INFO GENERAL */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>01. INFORMACIÓN GENERAL</Text>
          <View style={styles.row}><Text style={styles.col}><Text style={styles.label}>Cliente:</Text>{data.cliente_nombre}</Text><Text style={styles.col}><Text style={styles.label}>Empresa:</Text>{data.empresa}</Text></View>
          <View style={styles.row}><Text style={styles.col}><Text style={styles.label}>Dirección:</Text>{data.direccion}</Text><Text style={styles.col}><Text style={styles.label}>Técnico:</Text>{data.tecnico}</Text></View>
        </View>

        {/* 02. INFO ELÉCTRICA */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>02. INFORMACIÓN ELÉCTRICA GENERAL</Text>
          <Text>Sistema: {data.sistema} | Voltaje: {data.voltaje} | Empalme: {data.tipo_empalme} ({data.estado_empalme})</Text>
        </View>

        {/* 03. TABLEROS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>03. TABLEROS ELÉCTRICOS</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}><Text style={styles.th}>Nombre</Text><Text style={styles.th}>Tipo</Text><Text style={styles.th}>Ubicación</Text><Text style={styles.th}>Estado</Text></View>
            {data.tableros.map(t => (
              <View key={t._id} style={styles.tr}><Text style={styles.td}>{t.nombre}</Text><Text style={styles.td}>{t.tipo}</Text><Text style={styles.td}>{t.ubicacion}</Text><Text style={styles.td}>{t.estado}</Text></View>
            ))}
          </View>
        </View>

        {/* 09. MEDICIONES */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>09. MEDICIONES</Text>
          <Text>Voltajes (R-S-T): {data.med_v_r}V, {data.med_v_s}V, {data.med_v_t}V</Text>
          <Text>Corrientes (R-S-T): {data.med_i_r}A, {data.med_i_s}A, {data.med_i_t}A</Text>
        </View>

        {/* 10 y 11. RECOMENDACIONES Y ALCANCE */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>10. RECOMENDACIONES TÉCNICAS</Text>
          <Text>{data.recomendaciones}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>11. ALCANCE PRELIMINAR</Text>
          <Text>{data.alcance_trabajos}</Text>
        </View>

        <Text fixed style={styles.footer} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
      </Page>
    </Document>
  );
}
