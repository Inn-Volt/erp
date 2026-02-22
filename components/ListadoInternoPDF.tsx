import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, backgroundColor: '#fff' },
  header: { marginBottom: 20, borderBottom: 2, borderColor: '#ffc600', paddingBottom: 10 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  empresaData: { fontSize: 10, marginTop: 5, color: '#64748b' },
  table: { marginTop: 20 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f1f5f9', padding: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#f1f5f9', padding: 8 },
  colCant: { width: '15%', fontSize: 10 },
  colDesc: { width: '85%', fontSize: 10, fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 30, left: 40, fontSize: 8, color: '#94a3b8' }
});

export const ListadoInternoPDF = ({ cliente, items, folio, fecha }: any) => {
  // Validación de seguridad para evitar el error del Call Stack
  const nombreEmpresa = cliente?.nombre || cliente?.nombre_cliente || "InnVolt SpA";
  const rutEmpresa = cliente?.rut || "78.299.986-9";
  const listaItems = Array.isArray(items) ? items : [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>LISTA DE MATERIALES</Text>
          <Text style={styles.empresaData}>
            {nombreEmpresa} | RUT: {rutEmpresa}
          </Text>
          <Text style={styles.empresaData}>
            Folio Asociado: #{folio || '---'} | Fecha: {fecha || new Date().toLocaleDateString('es-CL')}
          </Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colCant}>CANT.</Text>
            <Text style={styles.colDesc}>DESCRIPCIÓN TÉCNICA DEL MATERIAL</Text>
          </View>
          
          {listaItems.map((item: any, index: number) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colCant}>{item?.cantidad || 0}</Text>
              <Text style={styles.colDesc}>
                {(item?.descripcion || 'SIN DESCRIPCIÓN').toUpperCase()}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          Documento de uso interno para adquisiciones y bodega - InnVolt SpA
        </Text>
      </Page>
    </Document>
  );
};