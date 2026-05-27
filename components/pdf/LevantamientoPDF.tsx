import React from 'react';

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet
} from '@react-pdf/renderer';

import type { LevantamientoData } from '@/types/levantamiento';

interface Props {
  data: LevantamientoData;
  estado: string;
}

const styles = StyleSheet.create({

  page:{
    padding:30,
    fontSize:9,
    fontFamily:'Helvetica'
  },

  header:{
    marginBottom:20,
    borderBottom:'2 solid #FFC600',
    paddingBottom:10
  },

  logo:{
    fontSize:22,
    fontWeight:'bold'
  },

  title:{
    fontSize:16,
    marginTop:6,
    fontWeight:'bold'
  },

  section:{
    marginBottom:15
  },

  sectionTitle:{
    backgroundColor:'#FFC600',
    color:'#000',
    padding:6,
    fontSize:11,
    fontWeight:'bold',
    marginBottom:6
  },

  row:{
    flexDirection:'row',
    marginBottom:4
  },

  col:{
    flex:1
  },

  label:{
    fontWeight:'bold'
  },

  table:{
    border:'1 solid #ccc'
  },

  tableHeader:{
    flexDirection:'row',
    backgroundColor:'#efefef'
  },

  th:{
    flex:1,
    padding:4,
    borderRight:'1 solid #ccc',
    fontWeight:'bold'
  },

  tr:{
    flexDirection:'row'
  },

  td:{
    flex:1,
    padding:4,
    borderTop:'1 solid #ddd',
    borderRight:'1 solid #ddd'
  },

  footer:{
    position:'absolute',
    bottom:20,
    left:30,
    right:30,
    textAlign:'center',
    color:'#666',
    fontSize:8
  }
});

export default function LevantamientoPDF({
  data,
  estado
}: Props) {

  return (

    <Document>

      <Page size="A4" style={styles.page}>

        {/* HEADER */}

        <View style={styles.header}>

          <Text style={styles.logo}>
            INNVOLT SPA
          </Text>

          <Text style={styles.title}>
            LEVANTAMIENTO TÉCNICO ELÉCTRICO
          </Text>

        </View>

        {/* INFORMACIÓN GENERAL */}

        <View style={styles.section}>

          <Text style={styles.sectionTitle}>
            01. INFORMACIÓN GENERAL
          </Text>

          <View style={styles.row}>
            <Text style={styles.col}>
              Cliente: {data.cliente_nombre}
            </Text>

            <Text style={styles.col}>
              Empresa: {data.empresa}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.col}>
              Dirección: {data.direccion}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.col}>
              Fecha: {data.fecha}
            </Text>

            <Text style={styles.col}>
              Hora: {data.hora}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.col}>
              Técnico: {data.tecnico}
            </Text>

            <Text style={styles.col}>
              Estado: {estado}
            </Text>
          </View>

        </View>

        {/* DATOS ELÉCTRICOS */}

        <View style={styles.section}>

          <Text style={styles.sectionTitle}>
            02. INFORMACIÓN ELÉCTRICA
          </Text>

          <Text>
            Sistema: {data.sistema}
          </Text>

          <Text>
            Voltaje: {data.voltaje}
          </Text>

          <Text>
            Empalme: {data.tipo_empalme}
          </Text>

          <Text>
            Capacidad: {data.capacidad_empalme} A
          </Text>

          <Text>
            Estado Empalme: {data.estado_empalme}
          </Text>

        </View>

        {/* TABLEROS */}

        <View style={styles.section}>

          <Text style={styles.sectionTitle}>
            03. TABLEROS ELÉCTRICOS
          </Text>

          <View style={styles.table}>

            <View style={styles.tableHeader}>
              <Text style={styles.th}>Nombre</Text>
              <Text style={styles.th}>Tipo</Text>
              <Text style={styles.th}>Ubicación</Text>
              <Text style={styles.th}>Estado</Text>
            </View>

            {data.tableros.map(tablero => (

              <View
                key={tablero._id}
                style={styles.tr}
              >

                <Text style={styles.td}>
                  {tablero.nombre}
                </Text>

                <Text style={styles.td}>
                  {tablero.tipo}
                </Text>

                <Text style={styles.td}>
                  {tablero.ubicacion}
                </Text>

                <Text style={styles.td}>
                  {tablero.estado}
                </Text>

              </View>

            ))}

          </View>

        </View>

        {/* CIRCUITOS */}

        <View style={styles.section}>

          <Text style={styles.sectionTitle}>
            04. CIRCUITOS
          </Text>

          {data.circuitos.map(c => (

            <View
              key={c._id}
              style={{
                marginBottom:6,
                paddingBottom:4,
                borderBottom:'1 solid #ddd'
              }}
            >

              <Text>
                {c.circuito}
              </Text>

              <Text>
                Protección: {c.proteccion}
              </Text>

              <Text>
                Uso: {c.uso}
              </Text>

              <Text>
                Estado: {c.estado}
              </Text>

            </View>

          ))}

        </View>

        {/* MEDICIONES */}

        <View style={styles.section}>

          <Text style={styles.sectionTitle}>
            09. MEDICIONES
          </Text>

          <Text>
            Voltajes:
            R={data.med_v_r}V
            S={data.med_v_s}V
            T={data.med_v_t}V
          </Text>

          <Text>
            Corrientes:
            R={data.med_i_r}A
            S={data.med_i_s}A
            T={data.med_i_t}A
          </Text>

          <Text>
            Balance:
            {data.med_balance}
          </Text>

          <Text>
            Tierra:
            {data.med_tierra}
          </Text>

        </View>

        {/* RECOMENDACIONES */}

        <View style={styles.section}>

          <Text style={styles.sectionTitle}>
            10. RECOMENDACIONES
          </Text>

          <Text>
            {data.recomendaciones}
          </Text>

        </View>

        {/* ALCANCE */}

        <View style={styles.section}>

          <Text style={styles.sectionTitle}>
            11. ALCANCE PRELIMINAR
          </Text>

          <Text>
            {data.alcance_trabajos}
          </Text>

        </View>

        <Text
          fixed
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Página ${pageNumber} de ${totalPages}`
          }
        />

      </Page>

    </Document>
  );
}
