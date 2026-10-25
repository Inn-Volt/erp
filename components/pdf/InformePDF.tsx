/* eslint-disable jsx-a11y/alt-text -- <Image> de @react-pdf no admite alt */
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import { formatDate } from '@/utils';
import { logoDocumento } from '@/lib/logoMarca';

/** Informe técnico de una OT (traído de TecApp): trabajos, checklist, materiales, fotos y firma. */

const INK = '#1a1813', MUTED = '#5f5b50', LINE = '#e3dfd4', SPARK = '#f6c21c', TINT = '#f6f4ee';
const s = StyleSheet.create({
  page: { padding: 32, paddingBottom: 44, fontSize: 9, fontFamily: 'Helvetica', color: INK },
  barra: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, flexDirection: 'row' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: LINE, paddingBottom: 12, marginBottom: 12 },
  logo: { width: 155, objectFit: 'contain', marginBottom: 6 },
  empresa: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  linea: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  folio: { backgroundColor: '#232323', borderRadius: 6, padding: '9 14', alignItems: 'center', minWidth: 140 },
  folioLbl: { fontSize: 6.5, color: SPARK, fontFamily: 'Helvetica-Bold', letterSpacing: 2 },
  folioNum: { fontSize: 17, color: '#fff', fontFamily: 'Helvetica-Bold', marginTop: 2 },
  folioFecha: { fontSize: 7.5, color: '#cfcfcf', marginTop: 3 },
  tarjeta: { backgroundColor: TINT, borderRadius: 6, padding: '9 12', marginBottom: 10, borderLeftWidth: 3, borderLeftColor: SPARK },
  rotulo: { fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, marginBottom: 5 },
  fila: { flexDirection: 'row', marginBottom: 2 },
  k: { width: 90, color: MUTED },
  v: { flex: 1 },
  texto: { lineHeight: 1.5 },
  tablaCab: { flexDirection: 'row', backgroundColor: '#232323', padding: '5 8', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  th: { color: '#fff', fontSize: 7, fontFamily: 'Helvetica-Bold' },
  tr: { flexDirection: 'row', padding: '5 8', borderBottomWidth: 1, borderBottomColor: LINE },
  fotos: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  fotoBox: { width: '48.5%', marginBottom: 10 },
  foto: { width: '100%', height: 170, objectFit: 'cover', borderRadius: 4 },
  firmaZona: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  firmaCol: { width: 220, alignItems: 'center' },
  firmaImg: { height: 50, width: 170, objectFit: 'contain' },
  firmaEsp: { height: 52 },
  firmaLinea: { width: '100%', borderTopWidth: 1, borderTopColor: INK, marginBottom: 5 },
  firmaNombre: { fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  firmaMut: { color: MUTED, fontSize: 7 },
  pie: { position: 'absolute', bottom: 18, left: 32, right: 32, textAlign: 'center', fontSize: 7, color: '#8a8a8a' },
});

export interface InformePDFProps {
  empresa: EmpresaInfo;
  folioOT: string;
  folioInforme: string;
  fecha: string;
  cliente: { nombre: string; rut?: string | null; direccion?: string | null };
  tituloOT: string;
  tecnico: string;
  resultado: string;
  trabajos: string;
  fallaObservada?: string | null;
  pendiente?: string | null;
  /** Internas: no van en el PDF del cliente (se aceptan para no romper llamadas de antes). */
  observaciones?: string | null;
  checklist: { texto: string; ok: boolean }[];
  materiales: { descripcion: string; cantidad: number; unidad: string; serie?: string | null }[];
  fotos: { url: string; caption: string }[];
  recibidoPor?: string | null;
  recibidoRut?: string | null;
  firmaUrl?: string | null;
  firmadoAt?: string | null;
}

export default function InformePDF(p: InformePDFProps) {
  const logo = logoDocumento(p.empresa);
  return (
    <Document title={`Informe ${p.folioInforme} — ${p.folioOT}`}>
      <Page size="A4" style={s.page}>
        <View style={s.barra} fixed><View style={{ flex: 1, backgroundColor: INK }} /><View style={{ width: 80, backgroundColor: SPARK }} /></View>
        <View style={s.header}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            {logo ? <Image src={logo} style={s.logo} /> : null}
            <Text style={s.empresa}>{p.empresa.nombre}</Text>
            {p.empresa.rut ? <Text style={s.linea}>RUT: {p.empresa.rut}</Text> : null}
            <Text style={s.linea}>{[p.empresa.telefono, p.empresa.email].filter(Boolean).join('  ·  ')}</Text>
          </View>
          <View style={s.folio}>
            <Text style={s.folioLbl}>INFORME TÉCNICO</Text>
            <Text style={s.folioNum}>{p.folioInforme}</Text>
            <Text style={s.folioFecha}>{p.folioOT} · {formatDate(p.fecha)}</Text>
          </View>
        </View>

        <View style={s.tarjeta}>
          <Text style={s.rotulo}>TRABAJO</Text>
          <View style={s.fila}><Text style={s.k}>Cliente</Text><Text style={s.v}>{p.cliente.nombre}{p.cliente.rut ? ` · RUT ${p.cliente.rut}` : ''}</Text></View>
          {p.cliente.direccion ? <View style={s.fila}><Text style={s.k}>Dirección</Text><Text style={s.v}>{p.cliente.direccion}</Text></View> : null}
          <View style={s.fila}><Text style={s.k}>Orden de trabajo</Text><Text style={s.v}>{p.folioOT} · {p.tituloOT}</Text></View>
          <View style={s.fila}><Text style={s.k}>Técnico</Text><Text style={s.v}>{p.tecnico}</Text></View>
          <View style={s.fila}><Text style={s.k}>Resultado</Text><Text style={[s.v, { fontFamily: 'Helvetica-Bold' }]}>{p.resultado}</Text></View>
        </View>

        <View style={{ marginBottom: 10 }}>
          {p.fallaObservada ? <><Text style={s.rotulo}>FALLA OBSERVADA</Text><Text style={[s.texto, { marginBottom: 8 }]}>{p.fallaObservada}</Text></> : null}
          <Text style={s.rotulo}>TRABAJOS REALIZADOS</Text>
          <Text style={s.texto}>{p.trabajos || '—'}</Text>
          {p.pendiente ? <><Text style={[s.rotulo, { marginTop: 8 }]}>PENDIENTE</Text><Text style={s.texto}>{p.pendiente}</Text></> : null}
        </View>

        {p.checklist.length > 0 && (
          <View style={{ marginBottom: 10 }} wrap={false}>
            <Text style={s.rotulo}>VERIFICACIONES</Text>
            {p.checklist.map((c, i) => (
              <View key={i} style={s.fila}><Text style={{ width: 16, fontFamily: 'Helvetica-Bold', color: c.ok ? '#15803d' : '#b91c1c' }}>{c.ok ? 'OK' : 'NO'}</Text><Text style={s.v}>{c.texto}</Text></View>
            ))}
          </View>
        )}

        {p.materiales.length > 0 && (
          <View style={{ marginBottom: 10 }}>
            <Text style={s.rotulo}>MATERIALES UTILIZADOS</Text>
            <View style={s.tablaCab}><Text style={[s.th, { flex: 1 }]}>DESCRIPCIÓN</Text><Text style={[s.th, { width: 70, textAlign: 'right' }]}>CANTIDAD</Text></View>
            {p.materiales.map((m, i) => (
              <View key={i} style={s.tr}><Text style={{ flex: 1 }}>{m.descripcion}{m.serie ? `  ·  S/N ${m.serie}` : ''}</Text><Text style={{ width: 70, textAlign: 'right' }}>{m.cantidad} {m.unidad}</Text></View>
            ))}
          </View>
        )}

        <View style={s.firmaZona} wrap={false}>
          <View style={s.firmaCol}>
            {p.firmaUrl ? <Image src={p.firmaUrl} style={s.firmaImg} /> : <View style={s.firmaEsp} />}
            <View style={s.firmaLinea} />
            <Text style={s.firmaNombre}>{p.recibidoPor || 'Recibe conforme'}</Text>
            <Text style={s.firmaMut}>{p.recibidoRut ? `RUT ${p.recibidoRut}` : 'RUT: ________________'}</Text>
            <Text style={s.firmaMut}>{p.firmadoAt ? `Firmado el ${formatDate(p.firmadoAt)}` : 'Fecha: ____/____/______'}</Text>
          </View>
          <View style={s.firmaCol}>
            <View style={s.firmaEsp} />
            <View style={s.firmaLinea} />
            <Text style={s.firmaNombre}>{p.tecnico}</Text>
            <Text style={s.firmaMut}>Técnico · {p.empresa.nombre}</Text>
          </View>
        </View>

        <Text style={s.pie} fixed render={({ pageNumber, totalPages }) => `${p.empresa.nombre} · ${p.folioInforme} · página ${pageNumber} de ${totalPages}`} />
      </Page>

      {p.fotos.length > 0 && (
        <Page size="A4" style={s.page}>
          <Text style={[s.rotulo, { marginBottom: 10 }]}>REGISTRO FOTOGRÁFICO</Text>
          <View style={s.fotos}>
            {p.fotos.map((f, i) => (
              <View key={i} style={s.fotoBox} wrap={false}>
                <Image src={f.url} style={s.foto} />
                {f.caption ? <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 3 }}>{f.caption}</Text> : null}
              </View>
            ))}
          </View>
          <Text style={s.pie} fixed render={({ pageNumber, totalPages }) => `${p.empresa.nombre} · ${p.folioInforme} · página ${pageNumber} de ${totalPages}`} />
        </Page>
      )}
    </Document>
  );
}
