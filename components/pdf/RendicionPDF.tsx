/* eslint-disable jsx-a11y/alt-text -- <Image> de @react-pdf no admite alt */
/**
 * La rendición de una persona en un período (TecApp 3.8.0, adaptada a los fondos de la fase 19):
 * el fondo al empezar y al terminar, lo entregado y lo devuelto, cada gasto con lo que salió del
 * fondo y lo que puso de su bolsillo, lo que se le debe, la declaración de quien rinde y un
 * recuadro para contabilidad. Al final, una hoja por boleta, con la foto grande.
 */

import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import { folioMovimiento, NOMBRE_MOVIMIENTO, type MovimientoFondo } from '@/lib/fondos';

const INK = '#1a1813';
const MUTED = '#6b6b6b';
const LINE = '#dcdcdc';
const ZEBRA = '#f7f7f5';
const AMARILLO = '#f6c21c';

const s = StyleSheet.create({
  page: { backgroundColor: '#fff', color: INK, fontFamily: 'Helvetica', fontSize: 8.5, padding: '0 0 46 0' },
  franja: { height: 4, backgroundColor: AMARILLO },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: '20 32 10 32', borderBottomWidth: 1, borderBottomColor: LINE },
  logo: { height: 28, width: 120, objectFit: 'contain', objectPosition: 'left' },
  sub: { fontSize: 7.5, color: MUTED, marginTop: 2 },
  etiqueta: { fontSize: 6.8, color: MUTED, letterSpacing: 1.4, textTransform: 'uppercase' },
  grande: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  cuerpo: { padding: '12 32 0' },
  seccion: { fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 12, marginBottom: 5 },
  cajas: { flexDirection: 'row', gap: 8 },
  caja: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: '7 9' },
  cajaVal: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  thFila: { flexDirection: 'row', backgroundColor: INK, padding: '5 6', borderRadius: 2 },
  th: { fontSize: 6.8, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: 0.4 },
  fila: { flexDirection: 'row', padding: '5 6', borderBottomWidth: 1, borderBottomColor: '#efefef' },
  td: { fontSize: 8 },
  muted: { fontSize: 7.5, color: MUTED },
  derecha: { textAlign: 'right' },
  aviso: { marginTop: 8, padding: '6 8', backgroundColor: '#fff7d6', borderRadius: 3, fontSize: 7.8 },
  firma: { flexDirection: 'row', gap: 14, marginTop: 18 },
  firmaCaja: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: '8 10', minHeight: 70 },
  pie: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: '9 32', borderTopWidth: 1, borderTopColor: LINE, flexDirection: 'row', justifyContent: 'space-between' },
  pieTexto: { fontSize: 7, color: '#9a9a9a' },
  boleta: { marginTop: 10, width: '100%', height: 640, objectFit: 'contain' },
});

export interface GastoRendido {
  id: string; fecha: string; categoria: string; descripcion: string | null; destino: string;
  monto: number; delFondo: number; propio: number; empresa: boolean; observado: boolean; sinBoleta: boolean;
  /** URL firmada de la foto de la boleta (o null). */
  boleta: string | null;
}
export interface DatosRendicion {
  persona: string; desde: string; hasta: string; generada: string;
  fondoInicio: number; fondoFin: number; deudaInicio: number; deudaFin: number;
  movimientos: MovimientoFondo[]; gastos: GastoRendido[];
}

const clp = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
/** Sin guiones de corte: una palabra no se parte entre líneas. */
const sinCortar = (palabra: string) => [palabra];
const fecha = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split('-'); return `${d}-${m}-${a}`; };

export default function RendicionPDF({ datos, empresa }: { datos: DatosRendicion; empresa: EmpresaInfo }) {
  const logo = empresa.logo_url || '';
  const conBoleta = datos.gastos.filter(g => g.boleta);
  const pagBoleta = new Map(conBoleta.map((g, i) => [g.id, i + 2]));   // la hoja 1 es el resumen
  const suma = (k: 'monto' | 'delFondo' | 'propio') => datos.gastos.reduce((t, g) => t + g[k], 0);
  const signo = (m: MovimientoFondo) => (m.tipo === 'entrega' ? 1 : m.tipo === 'devolucion' || m.tipo === 'compensacion' ? -1 : 0);
  const titulo = `Rendición de ${datos.persona} · ${fecha(datos.desde)} al ${fecha(datos.hasta)}`;
  // Lo que cuadra los saldos del período (entregas menos devoluciones, y lo pagado de lo que puso).
  const netoFondo = datos.fondoFin - datos.fondoInicio + suma('delFondo');
  const pagado = datos.deudaInicio + datos.gastos.filter(g => !g.observado).reduce((t, g) => t + g.propio, 0) - datos.deudaFin;
  const Pie = () => (
    <View style={s.pie} fixed>
      <Text style={s.pieTexto}>{empresa.nombre} · {titulo}</Text>
      <Text style={s.pieTexto} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
  return (
    <Document title={titulo}>
      <Page size="A4" style={s.page}>
        <View style={s.franja} fixed />
        <View style={s.header}>
          <View>
            {logo ? <Image src={logo} style={s.logo} /> : <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold' }}>{empresa.nombre}</Text>}
            <Text style={s.sub}>{[empresa.nombre, empresa.rut && `RUT ${empresa.rut}`].filter(Boolean).join(' · ')}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.etiqueta}>Rendición de gastos</Text>
            <Text style={s.grande}>{datos.persona}</Text>
            <Text style={s.sub}>Del {fecha(datos.desde)} al {fecha(datos.hasta)} · emitida el {fecha(datos.generada)}</Text>
          </View>
        </View>
        <View style={s.cuerpo}>
          <View style={s.cajas}>
            <View style={s.caja}><Text style={s.etiqueta}>Fondo al empezar</Text><Text style={s.cajaVal}>{clp(datos.fondoInicio)}</Text></View>
            <View style={s.caja}><Text style={s.etiqueta}>Gastado del fondo</Text><Text style={s.cajaVal}>{clp(suma('delFondo'))}</Text></View>
            <View style={s.caja}><Text style={s.etiqueta}>Fondo al terminar</Text><Text style={s.cajaVal}>{clp(datos.fondoFin)}</Text></View>
            <View style={s.caja}><Text style={s.etiqueta} hyphenationCallback={sinCortar}>Se le debe al final</Text><Text style={s.cajaVal}>{clp(datos.deudaFin)}</Text></View>
          </View>
          {datos.gastos.some(g => g.observado) && <Text style={s.aviso}>Hay gastos observados: no se pagan hasta corregirlos.</Text>}

          <Text style={s.seccion}>Dinero entregado y devuelto</Text>
          {datos.movimientos.length === 0 ? <Text style={s.muted}>Sin movimientos en el período.</Text> : <>
            <View style={s.thFila}>
              <Text style={[s.th, { width: 52 }]}>FECHA</Text><Text style={[s.th, { width: 52 }]}>N°</Text>
              <Text style={[s.th, { flex: 1 }]}>MOVIMIENTO</Text><Text style={[s.th, { width: 70 }, s.derecha]}>MONTO</Text>
            </View>
            {datos.movimientos.map((m, i) => (
              <View key={m.id} wrap={false} style={[s.fila, i % 2 ? { backgroundColor: ZEBRA } : {}]}>
                <Text style={[s.td, { width: 52 }]}>{fecha(m.fecha)}</Text>
                <Text style={[s.muted, { width: 52 }]}>{folioMovimiento(m.folio)}</Text>
                <Text style={[s.td, { flex: 1 }]}>{NOMBRE_MOVIMIENTO[m.tipo]}{m.nota ? ` · ${m.nota}` : ''}{m.motivo ? ` · ${m.motivo}` : ''}{m.estado === 'por_confirmar' ? ' · por confirmar' : ''}{m.revertido ? ' · revertido' : ''}</Text>
                <Text style={[s.td, { width: 70 }, s.derecha]}>{signo(m) ? `${signo(m) > 0 ? '+' : '-'} ${clp(m.monto)}` : clp(m.monto)}</Text>
              </View>
            ))}
          </>}

          <Text style={s.seccion}>Gastos ({datos.gastos.length})</Text>
          {datos.gastos.length === 0 ? <Text style={s.muted}>Sin gastos en el período.</Text> : <>
            <View style={s.thFila} fixed>
              <Text style={[s.th, { width: 18 }]}>#</Text><Text style={[s.th, { width: 48 }]}>FECHA</Text>
              <Text style={[s.th, { flex: 1 }]}>DETALLE</Text><Text style={[s.th, { width: 58 }]}>TRABAJO</Text>
              <Text style={[s.th, { width: 40 }]}>BOLETA</Text>
              <Text style={[s.th, { width: 56 }, s.derecha]}>DEL FONDO</Text><Text style={[s.th, { width: 56 }, s.derecha]}>PUSO</Text>
              <Text style={[s.th, { width: 58 }, s.derecha]}>TOTAL</Text>
            </View>
            {datos.gastos.map((g, i) => (
              <View key={g.id} wrap={false} style={[s.fila, i % 2 ? { backgroundColor: ZEBRA } : {}]}>
                <Text style={[s.muted, { width: 18 }]}>{i + 1}</Text>
                <Text style={[s.td, { width: 48 }]}>{fecha(g.fecha)}</Text>
                <Text style={[s.td, { flex: 1 }]} hyphenationCallback={sinCortar}>{g.categoria}{g.descripcion ? ` · ${g.descripcion}` : ''}{g.empresa ? ' · tarjeta de la empresa' : ''}{g.observado ? ' · OBSERVADO' : ''}</Text>
                <Text style={[s.muted, { width: 58 }]}>{g.destino}</Text>
                <Text style={[s.muted, { width: 40 }]}>{g.boleta ? `pág. ${pagBoleta.get(g.id)}` : g.sinBoleta ? 'sin boleta' : '—'}</Text>
                <Text style={[s.td, { width: 56 }, s.derecha]}>{g.delFondo ? clp(g.delFondo) : ''}</Text>
                <Text style={[s.td, { width: 56 }, s.derecha]}>{g.propio ? clp(g.propio) : ''}</Text>
                <Text style={[s.td, { width: 58, fontFamily: 'Helvetica-Bold' }, s.derecha]}>{clp(g.monto)}</Text>
              </View>
            ))}
            <View wrap={false} style={[s.fila, { borderBottomWidth: 0 }]}>
              <Text style={[s.td, { flex: 1, fontFamily: 'Helvetica-Bold' }]}>Total del período</Text>
              <Text style={[s.td, { width: 56, fontFamily: 'Helvetica-Bold' }, s.derecha]}>{clp(suma('delFondo'))}</Text>
              <Text style={[s.td, { width: 56, fontFamily: 'Helvetica-Bold' }, s.derecha]}>{clp(suma('propio'))}</Text>
              <Text style={[s.td, { width: 58, fontFamily: 'Helvetica-Bold' }, s.derecha]}>{clp(suma('monto'))}</Text>
            </View>
          </>}

          <View wrap={false}>
            <Text style={s.seccion}>Cuadre</Text>
            <Text style={s.td}>Fondo: {clp(datos.fondoInicio)} al empezar + {clp(netoFondo)} entregado (menos lo devuelto) - {clp(suma('delFondo'))} gastado del fondo = {clp(datos.fondoFin)} al terminar.</Text>
            <Text style={[s.td, { marginTop: 2 }]}>Lo que puso: se le debían {clp(datos.deudaInicio)} al empezar + {clp(suma('propio'))} que puso en el período - {clp(pagado)} que se le pagó = se le deben {clp(datos.deudaFin)} al terminar.</Text>
            <View style={s.firma}>
              <View style={s.firmaCaja}>
                <Text style={s.etiqueta}>Declaración de quien rinde</Text>
                <Text style={[s.td, { marginTop: 4 }]}>Declaro que los gastos de esta rendición son reales, del trabajo indicado y que los respaldos son los originales.</Text>
                <Text style={[s.muted, { marginTop: 18 }]}>Firma: ____________________   {datos.persona}</Text>
              </View>
              <View style={s.firmaCaja}>
                <Text style={s.etiqueta}>Para uso de contabilidad</Text>
                <Text style={[s.muted, { marginTop: 6 }]}>Revisado por: ____________________</Text>
                <Text style={[s.muted, { marginTop: 6 }]}>Fecha: ____ / ____ / ________</Text>
                <Text style={[s.muted, { marginTop: 6 }]}>Observaciones: ____________________</Text>
              </View>
            </View>
          </View>
        </View>
        <Pie />
      </Page>
      {conBoleta.map((g, i) => (
        <Page key={g.id} size="A4" style={s.page}>
          <View style={s.franja} fixed />
          <View style={s.cuerpo}>
            <Text style={s.etiqueta}>Respaldo del gasto {datos.gastos.indexOf(g) + 1} de {datos.gastos.length}</Text>
            <Text style={[s.grande, { fontSize: 11 }]}>{fecha(g.fecha)} · {clp(g.monto)} · {g.categoria}{g.descripcion ? ` · ${g.descripcion}` : ''}</Text>
            <Text style={s.sub}>{g.destino}{g.empresa ? ' · tarjeta de la empresa' : g.propio && g.delFondo ? ` · ${clp(g.delFondo)} del fondo y ${clp(g.propio)} de su bolsillo` : g.propio ? ' · de su bolsillo' : ' · del fondo'} · boleta {i + 1} de {conBoleta.length}</Text>
            <Image src={g.boleta!} style={s.boleta} />
          </View>
          <Pie />
        </Page>
      ))}
    </Document>
  );
}
