/* eslint-disable jsx-a11y/alt-text -- <Image> de @react-pdf no admite alt */
/**
 * Solicitud de precios a proveedor (del cotizador de antes): los materiales de la cotización, con
 * el mismo producto de varias partidas en una sola fila, y las columnas de precio en blanco para
 * que el proveedor las llene. No lleva el nombre del cliente (solo la referencia IV-…): el
 * proveedor no necesita saber para quién es.
 */

import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import type { MaterialPedido } from '@/lib/cotizador/herramientas';
import { cantidadLegible } from '@/lib/cotizador/calculo';
import { logoDocumento } from '@/lib/logoMarca';

const INK = '#1a1813';
const MUTED = '#6b6b6b';
const LINE = '#dcdcdc';
const LINE2 = '#efefef';
const ZEBRA = '#f7f7f5';
const AMARILLO = '#f6c21c';

const s = StyleSheet.create({
  page: { backgroundColor: '#ffffff', color: INK, fontFamily: 'Helvetica', fontSize: 9, padding: '0 0 50 0' },
  franja: { height: 4, backgroundColor: AMARILLO },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: '22 34 12 34', borderBottomWidth: 1, borderBottomColor: LINE },
  logo: { height: 30, width: 130, objectFit: 'contain', objectPosition: 'left' },
  marca: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  sub: { fontSize: 7.5, color: MUTED, marginTop: 2 },
  derecha: { alignItems: 'flex-end' },
  etiqueta: { fontSize: 6.8, color: MUTED, letterSpacing: 1.4, textTransform: 'uppercase' },
  folio: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  titulo: { fontSize: 11, fontFamily: 'Helvetica-Bold', padding: '14 34 0', letterSpacing: 0.5 },
  cuerpo: { padding: '10 34 0' },
  cajas: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  caja: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: '8 10' },
  cajaVal: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  thFila: { flexDirection: 'row', backgroundColor: INK, padding: '6 8', borderRadius: 3 },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 0.6 },
  fila: { flexDirection: 'row', padding: '6 8', borderBottomWidth: 1, borderBottomColor: LINE2, alignItems: 'center' },
  td: { fontSize: 8.5 },
  tdMuted: { fontSize: 8, color: MUTED },
  cN: { width: 20 },
  cCod: { width: 62, paddingRight: 4 },
  cDesc: { flex: 1, paddingRight: 6 },
  cCant: { width: 44, textAlign: 'right' },
  cUn: { width: 40, textAlign: 'center' },
  cPlata: { width: 62, textAlign: 'right' },
  nota: { marginTop: 16, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 11 },
  notaTit: { fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 5 },
  notaItem: { fontSize: 8, color: MUTED, marginBottom: 2 },
  pie: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10 34', borderTopWidth: 1, borderTopColor: LINE, flexDirection: 'row', justifyContent: 'space-between' },
  pieTexto: { fontSize: 7, color: '#9a9a9a' },
});

const hoy = () => new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });

export default function ListadoMaterialesPDF({ materiales, folio, titulo, empresa, contacto }: {
  materiales: MaterialPedido[];
  /** «IV-0012»: la referencia para que el proveedor responda. */
  folio: string;
  titulo?: string | null;
  empresa: EmpresaInfo;
  /** A quién se le responde (quien cotiza). */
  contacto?: { nombre: string; email?: string | null; telefono?: string | null } | null;
}) {
  const logo = logoDocumento(empresa, { absoluto: true });
  const conCodigo = materiales.some(m => m.codigo);
  return (
    <Document title={`Solicitud de precios ${folio}`}>
      <Page size="A4" style={s.page}>
        <View style={s.franja} fixed />
        <View style={s.header}>
          <View>
            {logo ? <Image src={logo} style={s.logo} /> : <Text style={s.marca}>{empresa.nombre}</Text>}
            <Text style={s.sub}>{[empresa.nombre, empresa.rut && `RUT ${empresa.rut}`].filter(Boolean).join(' · ')}</Text>
            {empresa.email ? <Text style={s.sub}>{empresa.email}</Text> : null}
          </View>
          <View style={s.derecha}>
            <Text style={s.etiqueta}>Solicitud de precios</Text>
            <Text style={s.folio}>{folio}</Text>
            <Text style={s.sub}>{hoy()}</Text>
          </View>
        </View>

        <Text style={s.titulo}>SOLICITUD DE COTIZACIÓN DE MATERIALES</Text>
        <View style={s.cuerpo}>
          <View style={s.cajas}>
            <View style={s.caja}>
              <Text style={s.etiqueta}>Referencia</Text>
              <Text style={s.cajaVal}>{folio}{titulo ? ` · ${titulo}` : ''}</Text>
            </View>
            <View style={s.caja}>
              <Text style={s.etiqueta}>Responder a</Text>
              <Text style={s.cajaVal}>{contacto?.nombre || empresa.nombre}</Text>
              <Text style={s.sub}>{[contacto?.email || empresa.email, contacto?.telefono || empresa.telefono].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>

          <View style={s.thFila} fixed>
            <Text style={[s.th, s.cN]}>#</Text>
            {conCodigo && <Text style={[s.th, s.cCod]}>CÓDIGO</Text>}
            <Text style={[s.th, s.cDesc]}>DESCRIPCIÓN</Text>
            <Text style={[s.th, s.cCant]}>CANT.</Text>
            <Text style={[s.th, s.cUn]}>UNID.</Text>
            <Text style={[s.th, s.cPlata]}>P. UNIT.</Text>
            <Text style={[s.th, s.cPlata]}>TOTAL</Text>
          </View>
          {materiales.map((m, i) => (
            <View key={i} wrap={false} style={[s.fila, i % 2 === 1 ? { backgroundColor: ZEBRA } : {}]}>
              <Text style={[s.tdMuted, s.cN]}>{i + 1}</Text>
              {conCodigo && <Text style={[s.tdMuted, s.cCod]}>{m.codigo || ''}</Text>}
              <Text style={[s.td, s.cDesc]}>{m.descripcion}</Text>
              <Text style={[s.td, s.cCant]}>{cantidadLegible(m.cantidad)}</Text>
              <Text style={[s.tdMuted, s.cUn]}>{m.unidad}</Text>
              <Text style={[s.tdMuted, s.cPlata]}> </Text>
              <Text style={[s.tdMuted, s.cPlata]}> </Text>
            </View>
          ))}

          <View wrap={false} style={s.nota}>
            <Text style={s.notaTit}>Favor indicar en su respuesta:</Text>
            <Text style={s.notaItem}>• Precio unitario neto y total por ítem (o equivalente que proponga)</Text>
            <Text style={s.notaItem}>• Disponibilidad de stock y plazo de entrega</Text>
            <Text style={s.notaItem}>• Validez de la oferta y condiciones de pago</Text>
            <Text style={s.notaItem}>• Referencia: {folio}</Text>
          </View>
        </View>

        <View style={s.pie} fixed>
          <Text style={s.pieTexto}>{empresa.nombre} · Solicitud de precios {folio}</Text>
          <Text style={s.pieTexto} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
