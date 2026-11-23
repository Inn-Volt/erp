/* eslint-disable jsx-a11y/alt-text -- <Image> de @react-pdf no admite alt */
/**
 * Cotización para el cliente desde la Calculadora HH (fase 23). PDF propio del módulo: no usa ni
 * cambia el de las cotizaciones del cotizador. Muestra los entregables con su precio (sin horas,
 * multiplicadores ni personas), el total neto en UF y en pesos, el IVA, el total, la UF de
 * referencia con su fecha y la validez.
 */

import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { EmpresaInfo } from '@/types';
import type { Entregable } from '@/lib/hh/calculo';

const INK = '#1a1813';
const MUTED = '#6b6b6b';
const LINE = '#dcdcdc';
const ZEBRA = '#f7f7f5';
const AMARILLO = '#f6c21c';

const s = StyleSheet.create({
  page: { backgroundColor: '#fff', color: INK, fontFamily: 'Helvetica', fontSize: 9, padding: '0 0 54 0' },
  franja: { height: 4, backgroundColor: AMARILLO },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: '22 36 12 36', borderBottomWidth: 1, borderBottomColor: LINE },
  logo: { height: 30, width: 130, objectFit: 'contain', objectPosition: 'left' },
  sub: { fontSize: 7.5, color: MUTED, marginTop: 3 },
  etiqueta: { fontSize: 6.8, color: MUTED, letterSpacing: 1.4, textTransform: 'uppercase' },
  grande: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  cuerpo: { padding: '16 36 0' },
  caja: { borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: '8 10', marginBottom: 14 },
  cajaVal: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  thFila: { flexDirection: 'row', backgroundColor: INK, padding: '6 8', borderRadius: 2 },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: 0.4 },
  fila: { flexDirection: 'row', padding: '7 8', borderBottomWidth: 1, borderBottomColor: '#efefef' },
  td: { fontSize: 8.6 },
  derecha: { textAlign: 'right' },
  totales: { marginTop: 12, marginLeft: 'auto', width: 250 },
  totalFila: { flexDirection: 'row', justifyContent: 'space-between', padding: '4 8' },
  totalFinal: { flexDirection: 'row', justifyContent: 'space-between', padding: '7 8', backgroundColor: AMARILLO, borderRadius: 3, marginTop: 3 },
  nota: { marginTop: 16, padding: '8 10', backgroundColor: ZEBRA, borderRadius: 3, fontSize: 7.8, color: INK, lineHeight: 1.45 },
  pie: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10 36', borderTopWidth: 1, borderTopColor: LINE, flexDirection: 'row', justifyContent: 'space-between' },
  pieTexto: { fontSize: 7, color: '#9a9a9a' },
});

export interface DatosCotizacionHH {
  titulo: string;
  cliente: string;
  /** AAAA-MM-DD */
  fecha: string;
  validezDias: number;
  entregables: Entregable[];
  netoCLP: number;
  netoUF: number;
  iva: number;
  ivaPct: number;
  total: number;
  uf: number;
  /** AAAA-MM-DD */
  ufFecha: string;
  urgencia: boolean;
}

const clp = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const uf = (v: number) => `${v.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`;
const cant = (v: number) => v.toLocaleString('es-CL', { maximumFractionDigits: 2 });
/** El valor de la UF en pesos, con sus decimales: «$41.350,42». */
const ufPesos = (v: number) => `$${v.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split('-'); return `${d}-${m}-${a}`; };
const masDias = (iso: string, dias: number) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Sin guiones de corte: una palabra no se parte entre líneas. */
const sinCortar = (palabra: string) => [palabra];

export default function CotizacionHHPDF({ datos, empresa }: { datos: DatosCotizacionHH; empresa: EmpresaInfo }) {
  const logo = empresa.logo_url || '';
  const contacto = [empresa.email, empresa.telefono, empresa.website].filter(Boolean).join(' · ');
  return (
    <Document title={`Cotización · ${datos.titulo}`} author={empresa.nombre}>
      <Page size="A4" style={s.page}>
        <View style={s.franja} fixed />
        <View style={s.header}>
          <View>
            {logo ? <Image src={logo} style={s.logo} /> : <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold' }}>{empresa.nombre}</Text>}
            <Text style={s.sub}>{[empresa.nombre, empresa.rut && `RUT ${empresa.rut}`].filter(Boolean).join(' · ')}</Text>
            {!!empresa.direccion && <Text style={s.sub}>{empresa.direccion}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end', maxWidth: 260 }}>
            <Text style={s.etiqueta}>Cotización</Text>
            <Text style={[s.grande, s.derecha]}>{datos.titulo}</Text>
            <Text style={s.sub}>{fecha(datos.fecha)}</Text>
          </View>
        </View>

        <View style={s.cuerpo}>
          {!!datos.cliente.trim() && (
            <View style={s.caja}>
              <Text style={s.etiqueta}>Cliente</Text>
              <Text style={s.cajaVal}>{datos.cliente}</Text>
            </View>
          )}

          <View style={s.thFila}>
            <Text style={[s.th, { width: 22 }]}>#</Text>
            <Text style={[s.th, { flex: 1 }]}>Entregable</Text>
            <Text style={[s.th, s.derecha, { width: 70 }]}>Cantidad</Text>
            <Text style={[s.th, s.derecha, { width: 78 }]}>Neto UF</Text>
            <Text style={[s.th, s.derecha, { width: 88 }]}>Neto CLP</Text>
          </View>
          {datos.entregables.map((e, i) => (
            <View key={i} style={[s.fila, i % 2 ? { backgroundColor: ZEBRA } : {}]} wrap={false}>
              <Text style={[s.td, { width: 22, color: MUTED }]}>{i + 1}</Text>
              <Text style={[s.td, { flex: 1, paddingRight: 8 }]} hyphenationCallback={sinCortar}>{e.descripcion}</Text>
              <Text style={[s.td, s.derecha, { width: 70 }]}>{cant(e.cantidad)}{e.unidad ? ` ${e.unidad}` : ''}</Text>
              <Text style={[s.td, s.derecha, { width: 78 }]}>{uf(e.uf)}</Text>
              <Text style={[s.td, s.derecha, { width: 88 }]}>{clp(e.clp)}</Text>
            </View>
          ))}

          <View style={s.totales} wrap={false}>
            <View style={s.totalFila}><Text>Total neto</Text><Text style={{ fontFamily: 'Helvetica-Bold' }}>{uf(datos.netoUF)}</Text></View>
            <View style={s.totalFila}><Text>Total neto en pesos</Text><Text>{clp(datos.netoCLP)}</Text></View>
            <View style={s.totalFila}><Text>IVA ({Math.round(datos.ivaPct * 100)} %)</Text><Text>{clp(datos.iva)}</Text></View>
            <View style={s.totalFinal}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Total</Text><Text style={{ fontFamily: 'Helvetica-Bold' }}>{clp(datos.total)}</Text></View>
          </View>

          <View style={s.nota} wrap={false}>
            <Text>Valores netos en UF. El monto en pesos se calculó con la UF de {ufPesos(datos.uf)} del {fecha(datos.ufFecha)}.</Text>
            <Text>Validez de la oferta: {datos.validezDias} días (hasta el {fecha(masDias(datos.fecha, datos.validezDias))}).</Text>
            {datos.urgencia && <Text>Incluye el recargo por atención urgente o en fin de semana.</Text>}
          </View>
        </View>

        <View style={s.pie} fixed>
          <Text style={s.pieTexto}>{contacto || empresa.nombre}</Text>
          <Text style={s.pieTexto} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
