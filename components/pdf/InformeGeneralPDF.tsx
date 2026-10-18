/* eslint-disable jsx-a11y/alt-text -- <Image> de @react-pdf no admite alt */
/**
 * PDF de un informe hecho con plantilla (fase 8): el informe de la visita o el acta de
 * entrega del trabajo. Introducción, respuestas, checklist, qué se hizo, fotos y la
 * recepción conforme con la firma del cliente.
 */

import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import { seccionesDe, tipoDe, valorLegible, vacio, type FilaLista, type FotoInforme, type InformeLleno } from '@/services/informes';
import { aDoc, esLista, type NodoTexto } from '@/lib/textoFormato';
import { formatDate } from '@/utils';

const INK = '#1a1a1a', MUTED = '#5a5a5a', LINE = '#e2e2e2', TINT = '#f6f6f4';
const s = StyleSheet.create({
  page: { padding: 32, paddingBottom: 44, fontSize: 9, fontFamily: 'Helvetica', color: INK },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: LINE, paddingBottom: 12, marginBottom: 12 },
  logo: { width: 130, objectFit: 'contain', marginBottom: 6 },
  empresa: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  linea: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  folio: { backgroundColor: '#232323', borderRadius: 6, padding: '9 14', alignItems: 'center', minWidth: 150 },
  folioNum: { fontSize: 15, color: '#fff', fontFamily: 'Helvetica-Bold', marginTop: 2 },
  folioFecha: { fontSize: 7.5, color: '#cfcfcf', marginTop: 3 },
  tarjeta: { backgroundColor: TINT, borderRadius: 6, padding: '9 12', marginBottom: 10, borderLeftWidth: 3 },
  rotulo: { fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, marginBottom: 5 },
  fila: { flexDirection: 'row', marginBottom: 2 },
  k: { width: 110, color: MUTED },
  v: { flex: 1 },
  texto: { lineHeight: 1.5 },
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

/** Texto con formato, en simple (negrita y viñetas). */
function Formato({ texto }: { texto?: string | null }) {
  if (!(texto || '').trim()) return null;
  const linea = (n: NodoTexto[] | undefined) => (n || []).map((x, i) => (
    <Text key={i} style={(x.marks || []).some(m => m.type === 'bold') ? { fontFamily: 'Helvetica-Bold' } : {}}>{x.text}</Text>));
  return (
    <View>
      {aDoc(texto).content.map((b, i) => esLista(b)
        ? <View key={i}>{b.content.map((it, j) => <Text key={j} style={s.texto}>•  {linea((it.content[0] as { content?: NodoTexto[] })?.content)}</Text>)}</View>
        : <Text key={i} style={[s.texto, b.type === 'heading' ? { fontFamily: 'Helvetica-Bold', fontSize: 10 } : {}]}>{linea((b as { content?: NodoTexto[] }).content)}</Text>)}
    </View>
  );
}

export interface InformeGeneralPDFProps {
  empresa: EmpresaInfo;
  tipo: 'visita' | 'entrega';
  folio: string;
  fecha: string;
  cliente: { nombre: string; rut?: string | null; direccion?: string | null };
  referencia?: string | null;      // «IV-0012 · Tablero nuevo» o el título de la visita
  responsable?: string | null;
  informe: InformeLleno;
  trabajos?: string | null;
  observaciones?: string | null;
  fotos: { url: string; caption: string }[];
  recibidoPor?: string | null;
  recibidoRut?: string | null;
  firmaUrl?: string | null;
  firmadoAt?: string | null;
  color?: string;
  /** Links de las fotos y firmas que van dentro de las preguntas. */
  urls?: Record<string, string>;
}

export default function InformeGeneralPDF(p: InformeGeneralPDFProps) {
  const color = p.color || '#ffc600';
  const titulo = p.tipo === 'visita' ? 'INFORME DE VISITA' : 'ACTA DE ENTREGA';
  const logo = p.empresa.logo_url || (/innvolt/i.test(p.empresa.nombre) ? '/InnVolt-transparente-claro.png' : '');
  const urls = p.urls || {};
  const secciones = seccionesDe(p.informe).map(sec => ({ ...sec, campos: sec.campos.filter(c => !vacio(p.informe.respuestas?.[c.clave])) })).filter(sec => sec.campos.length);
  // Las fotos de las preguntas van al registro fotográfico, con el nombre de la pregunta.
  const fotosCampos = seccionesDe(p.informe).flatMap(sec => sec.campos).filter(c => tipoDe(c) === 'foto')
    .flatMap(c => ((p.informe.respuestas?.[c.clave] as FotoInforme[]) || []).map(f => ({ url: urls[f.path], caption: f.caption ? `${c.etiqueta} · ${f.caption}` : c.etiqueta })))
    .filter(f => f.url);
  const todasFotos = [...fotosCampos, ...p.fotos];
  const pie = `${p.empresa.nombre} · ${p.folio}`;
  return (
    <Document title={`${titulo} ${p.folio}`}>
      <Page size="A4" style={s.page}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, flexDirection: 'row' }} fixed>
          <View style={{ flex: 1, backgroundColor: INK }} /><View style={{ width: 80, backgroundColor: color }} />
        </View>
        <View style={s.header}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            {logo ? <Image src={logo} style={s.logo} /> : null}
            <Text style={s.empresa}>{p.empresa.nombre}</Text>
            {p.empresa.rut ? <Text style={s.linea}>RUT: {p.empresa.rut}</Text> : null}
            <Text style={s.linea}>{[p.empresa.telefono, p.empresa.email].filter(Boolean).join('  ·  ')}</Text>
          </View>
          <View style={s.folio}>
            <Text style={{ fontSize: 6.5, color, fontFamily: 'Helvetica-Bold', letterSpacing: 2 }}>{titulo}</Text>
            <Text style={s.folioNum}>{p.folio}</Text>
            <Text style={s.folioFecha}>{formatDate(p.fecha)}</Text>
          </View>
        </View>

        <View style={[s.tarjeta, { borderLeftColor: color }]}>
          <View style={s.fila}><Text style={s.k}>Cliente</Text><Text style={s.v}>{p.cliente.nombre}{p.cliente.rut ? ` · RUT ${p.cliente.rut}` : ''}</Text></View>
          {p.cliente.direccion ? <View style={s.fila}><Text style={s.k}>Dirección</Text><Text style={s.v}>{p.cliente.direccion}</Text></View> : null}
          {p.referencia ? <View style={s.fila}><Text style={s.k}>{p.tipo === 'visita' ? 'Visita' : 'Trabajo'}</Text><Text style={s.v}>{p.referencia}</Text></View> : null}
          {p.responsable ? <View style={s.fila}><Text style={s.k}>Responsable</Text><Text style={s.v}>{p.responsable}</Text></View> : null}
          {p.informe.plantilla_nombre ? <View style={s.fila}><Text style={s.k}>Formulario</Text><Text style={s.v}>{p.informe.plantilla_nombre}</Text></View> : null}
        </View>

        {p.informe.intro?.trim() ? <View style={{ marginBottom: 10 }}><Formato texto={p.informe.intro} /></View> : null}

        {secciones.map(sec => (
          <View key={sec.clave} style={{ marginBottom: 10 }}>
            <Text style={[s.rotulo, { color: INK }]} minPresenceAhead={40}>{(sec.clave === '_general' ? (p.tipo === 'visita' ? 'Lo que se vio' : 'Datos') : sec.titulo).toUpperCase()}</Text>
            {sec.campos.map(c => {
              const v = p.informe.respuestas[c.clave];
              const t = tipoDe(c);
              if (t === 'lista') {
                const sub = c.subcampos || [];
                const filas = (v as FilaLista[]) || [];
                return (
                  <View key={c.clave} style={{ marginBottom: 6 }}>
                    <Text style={{ color: MUTED, marginBottom: 3 }}>{c.etiqueta}</Text>
                    <View style={{ flexDirection: 'row', backgroundColor: TINT, padding: '4 6' }} wrap={false}>
                      <Text style={{ width: 16, fontFamily: 'Helvetica-Bold', fontSize: 7.5 }}>#</Text>
                      {sub.map(x => <Text key={x.clave} style={{ flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 7.5 }}>{x.etiqueta}</Text>)}
                    </View>
                    {filas.map((f, i) => (
                      <View key={i} style={{ flexDirection: 'row', padding: '4 6', borderBottomWidth: 1, borderBottomColor: LINE }} wrap={false}>
                        <Text style={{ width: 16, fontSize: 8 }}>{i + 1}</Text>
                        {sub.map(x => <Text key={x.clave} style={{ flex: 1, fontSize: 8 }}>{vacio(f[x.clave]) ? '' : valorLegible(x, f[x.clave])}</Text>)}
                      </View>
                    ))}
                  </View>
                );
              }
              if (t === 'firma') {
                const u = urls[v as string];
                return (
                  <View key={c.clave} style={s.tr} wrap={false}>
                    <Text style={{ width: 200, color: MUTED }}>{c.etiqueta}</Text>
                    {u ? <Image src={u} style={{ height: 40, width: 140, objectFit: 'contain' }} /> : <Text style={{ flex: 1 }}>Firmado</Text>}
                  </View>
                );
              }
              return (
                <View key={c.clave} style={s.tr} wrap={false}>
                  <Text style={{ width: 200, color: MUTED }}>{c.etiqueta}</Text><Text style={{ flex: 1 }}>{valorLegible(c, v)}</Text>
                </View>
              );
            })}
          </View>
        ))}

        {p.trabajos?.trim() ? <View style={{ marginBottom: 10 }}><Text style={s.rotulo}>TRABAJOS REALIZADOS</Text><Text style={s.texto}>{p.trabajos}</Text></View> : null}

        {p.informe.checklist.length > 0 && (
          <View style={{ marginBottom: 10 }} wrap={false}>
            <Text style={s.rotulo}>CHECKLIST</Text>
            {p.informe.checklist.map((c, i) => (
              <View key={i} style={s.fila}><Text style={{ width: 18, fontFamily: 'Helvetica-Bold', color: c.ok ? '#15803d' : '#b91c1c' }}>{c.ok ? 'OK' : 'NO'}</Text><Text style={s.v}>{c.texto}</Text></View>
            ))}
          </View>
        )}

        {p.observaciones?.trim() ? <View style={{ marginBottom: 10 }}><Text style={s.rotulo}>OBSERVACIONES</Text><Text style={s.texto}>{p.observaciones}</Text></View> : null}

        {p.tipo === 'entrega' && (
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
              <Text style={s.firmaNombre}>{p.responsable || p.empresa.nombre}</Text>
              <Text style={s.firmaMut}>{p.empresa.nombre}</Text>
            </View>
          </View>
        )}
        <Text style={s.pie} fixed render={({ pageNumber, totalPages }) => `${pie} · página ${pageNumber} de ${totalPages}`} />
      </Page>

      {todasFotos.length > 0 && (
        <Page size="A4" style={s.page}>
          <Text style={[s.rotulo, { marginBottom: 10 }]}>REGISTRO FOTOGRÁFICO</Text>
          <View style={s.fotos}>
            {todasFotos.map((f, i) => (
              <View key={i} style={s.fotoBox} wrap={false}>
                <Image src={f.url} style={s.foto} />
                {f.caption ? <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 3 }}>{f.caption}</Text> : null}
              </View>
            ))}
          </View>
          <Text style={s.pie} fixed render={({ pageNumber, totalPages }) => `${pie} · página ${pageNumber} de ${totalPages}`} />
        </Page>
      )}
    </Document>
  );
}
