/* eslint-disable jsx-a11y/alt-text -- <Image> de @react-pdf no admite alt */
/**
 * PDF de un informe hecho con plantilla: el informe técnico de la visita o el acta de entrega.
 * Fase 11 (estándar de informe técnico):
 *   · Ficha: cliente, ubicación, fecha y hora, técnico responsable, plantilla y versión.
 *   · Objetivo del levantamiento e introducción.
 *   · Riesgos destacados al comienzo (respuestas marcadas como alerta).
 *   · Secciones numeradas; cada dato con su origen (medido, observado, declarado por el
 *     cliente, estimado). Listas como tablas (o como fichas si tienen muchas columnas).
 *   · Fotos numeradas con su descripción y de qué parte del informe son.
 *   · Sin bloques vacíos, sin preguntas internas, sin precios.
 *   · Nota de alcance: un levantamiento no es una certificación ni un ensayo normativo.
 */

import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import {
  alertasDe, seccionesDe, tipoDe, valorLegible, vacio,
  type CampoInforme, type FilaLista, type FotoInforme, type InformeLleno,
} from '@/services/informes';
import { aDoc, esLista, type NodoTexto } from '@/lib/textoFormato';
import { formatDate } from '@/utils';

const INK = '#1a1a1a', MUTED = '#5a5a5a', LINE = '#e2e2e2', TINT = '#f6f6f4', ROJO = '#b91c1c';
const s = StyleSheet.create({
  page: { padding: 32, paddingBottom: 46, fontSize: 9, fontFamily: 'Helvetica', color: INK },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: LINE, paddingBottom: 12, marginBottom: 12 },
  logo: { width: 155, objectFit: 'contain', marginBottom: 6 },
  empresa: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  linea: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  folio: { backgroundColor: '#232323', borderRadius: 6, padding: '9 14', alignItems: 'center', minWidth: 160 },
  folioNum: { fontSize: 15, color: '#fff', fontFamily: 'Helvetica-Bold', marginTop: 2 },
  folioFecha: { fontSize: 7.5, color: '#cfcfcf', marginTop: 3 },
  titulo: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  tarjeta: { backgroundColor: TINT, borderRadius: 6, padding: '9 12', marginBottom: 10, borderLeftWidth: 3 },
  fila: { flexDirection: 'row', marginBottom: 2 },
  k: { width: 110, color: MUTED },
  v: { flex: 1 },
  texto: { lineHeight: 1.5 },
  h2: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginBottom: 5, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: LINE },
  tr: { flexDirection: 'row', padding: '4 6', borderBottomWidth: 1, borderBottomColor: LINE },
  et: { width: 190, color: MUTED, paddingRight: 8 },
  tag: { fontSize: 6.5, color: MUTED, marginTop: 1 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  td: { fontSize: 8 },
  alerta: { borderWidth: 1, borderColor: ROJO, borderRadius: 6, padding: '8 10', marginBottom: 10, backgroundColor: '#fdf2f2' },
  fotos: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  fotoBox: { width: '48.5%', marginBottom: 12 },
  foto: { width: '100%', height: 175, objectFit: 'cover', borderRadius: 4 },
  firmaZona: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  firmaCol: { width: 220, alignItems: 'center' },
  firmaImg: { height: 50, width: 170, objectFit: 'contain' },
  firmaEsp: { height: 52 },
  firmaLinea: { width: '100%', borderTopWidth: 1, borderTopColor: INK, marginBottom: 5 },
  firmaNombre: { fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  firmaMut: { color: MUTED, fontSize: 7 },
  nota: { fontSize: 7, color: MUTED, lineHeight: 1.45, marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: LINE },
  pie: { position: 'absolute', bottom: 18, left: 32, right: 32, textAlign: 'center', fontSize: 7, color: '#8a8a8a' },
});

const NATURALEZA: Record<string, string> = { medido: 'Medido', observado: 'Observado', declarado: 'Declarado por el cliente', estimado: 'Estimado / inferido' };
// Lo que ya está en la ficha no se repite.
const EN_FICHA = new Set(['cliente', 'direccion', 'fecha', 'tecnico']);

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
  hora?: string | null;
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
  /** Links de las fotos, archivos y firmas que van dentro de las preguntas. */
  urls?: Record<string, string>;
  estadoInforme?: string | null;
  completadoAt?: string | null;
}

interface FotoNum { n: number; url: string; caption: string }

export default function InformeGeneralPDF(p: InformeGeneralPDFProps) {
  const color = p.color || '#f6c21c';
  const titulo = p.tipo === 'visita' ? 'INFORME TÉCNICO DE VISITA' : 'ACTA DE ENTREGA';
  const logo = p.empresa.logo_url || (/innvolt/i.test(p.empresa.nombre) ? '/InnVolt-transparente-claro.png' : '');
  const urls = p.urls || {};
  const inf = p.informe;
  const borrador = p.tipo === 'visita' && p.estadoInforme === 'borrador';

  // Fotos numeradas en el orden en que aparecen en el informe.
  const fotos: FotoNum[] = [];
  const numerar = (lista: FotoInforme[] | undefined, origen: string): number[] => (lista || []).flatMap(f => {
    const url = urls[f.path];
    if (!url) return [];
    const n = fotos.length + 1;
    fotos.push({ n, url, caption: [f.caption, origen].filter(Boolean).join(' · ') });
    return [n];
  });

  const visible = (c: CampoInforme) => !c.interno && !(c.precarga && EN_FICHA.has(c.precarga)) && !vacio(inf.respuestas?.[c.clave]);
  const secciones = seccionesDe(inf).map(sec => ({ ...sec, campos: sec.campos.filter(visible) })).filter(sec => sec.campos.length);
  const alertas = alertasDe(inf);
  const pie = `${p.empresa.nombre} · ${p.folio}${borrador ? ' · BORRADOR' : ''}`;

  const valorCampo = (c: CampoInforme, seccion: string) => {
    const v = inf.respuestas[c.clave];
    const t = tipoDe(c);
    if (t === 'foto') {
      const ns = numerar(v as FotoInforme[], c.etiqueta || seccion);
      return ns.length ? `Ver foto${ns.length > 1 ? 's' : ''} ${ns.join(', ')}` : valorLegible(c, v);
    }
    if (t === 'archivo') return ((v as FotoInforme[]) || []).map(a => a.nombre || a.path.split('/').pop()).join(', ');
    return valorLegible(c, v);
  };

  const lista = (c: CampoInforme) => {
    const sub = c.subcampos || [];
    const filas = (inf.respuestas[c.clave] as FilaLista[]) || [];
    // Solo las columnas que tienen algo en alguna fila.
    const cols = sub.filter(x => tipoDe(x) !== 'foto' && filas.some(f => !vacio(f[x.clave])));
    const colFoto = sub.find(x => tipoDe(x) === 'foto' && filas.some(f => (f[x.clave] as FotoInforme[] | undefined)?.some(ft => urls[ft.path])));
    const fotosFila = filas.map((f, i) => {
      if (!colFoto) return [];
      const nombre = cols[0] && typeof f[cols[0].clave] === 'string' ? ` (${f[cols[0].clave]})` : '';
      return numerar(f[colFoto.clave] as FotoInforme[], `${c.etiqueta} ${i + 1}${nombre}`);
    });
    const celda = (x: CampoInforme, f: FilaLista) => (vacio(f[x.clave]) ? '' : valorLegible(x, f[x.clave]));
    const cabecera = (
      <View style={{ marginBottom: 3 }}>
        <Text style={{ fontFamily: 'Helvetica-Bold' }}>{c.etiqueta}{filas.length > 1 ? ` (${filas.length})` : ''}</Text>
        {c.naturaleza ? <Text style={s.tag}>{NATURALEZA[c.naturaleza]}</Text> : null}
      </View>
    );
    // Muchas columnas: una ficha por fila (una tabla de 10 columnas no se lee en A4).
    if (cols.length > 6) {
      return (
        <View key={c.clave} style={{ marginBottom: 8 }}>
          {cabecera}
          {filas.map((f, i) => (
            <View key={i} style={{ borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: '5 7', marginBottom: 5 }} wrap={false}>
              <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8.5, marginBottom: 3 }}>{c.etiqueta} {i + 1}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {cols.filter(x => celda(x, f)).map(x => (
                  <Text key={x.clave} style={{ width: '50%', fontSize: 8, marginBottom: 2 }}><Text style={{ color: MUTED }}>{x.etiqueta}: </Text>{celda(x, f)}</Text>
                ))}
              </View>
              {fotosFila[i].length ? <Text style={{ fontSize: 7.5, color: MUTED }}>Fotos {fotosFila[i].join(', ')}</Text> : null}
            </View>
          ))}
        </View>
      );
    }
    return (
      <View key={c.clave} style={{ marginBottom: 8 }}>
        {cabecera}
        <View style={{ flexDirection: 'row', backgroundColor: TINT, padding: '4 6' }} wrap={false}>
          <Text style={[s.th, { width: 16 }]}>#</Text>
          {cols.map(x => <Text key={x.clave} style={[s.th, { flex: 1, paddingRight: 4 }]}>{x.etiqueta}</Text>)}
          {colFoto ? <Text style={[s.th, { width: 42 }]}>Fotos</Text> : null}
        </View>
        {filas.map((f, i) => (
          <View key={i} style={{ flexDirection: 'row', padding: '4 6', borderBottomWidth: 1, borderBottomColor: LINE }} wrap={false}>
            <Text style={[s.td, { width: 16 }]}>{i + 1}</Text>
            {cols.map(x => {
              const v = f[x.clave];
              const al = typeof v === 'string' && (!!x.alerta?.includes(v) || !!c.alerta?.includes(v));
              return <Text key={x.clave} style={[s.td, { flex: 1, paddingRight: 4 }, al ? { color: ROJO, fontFamily: 'Helvetica-Bold' } : {}]}>{celda(x, f)}</Text>;
            })}
            {colFoto ? <Text style={[s.td, { width: 42 }]}>{fotosFila[i].join(', ')}</Text> : null}
          </View>
        ))}
      </View>
    );
  };

  // Se arma antes de dibujar para que la numeración de fotos quede en orden.
  const cuerpo = secciones.map((sec, si) => (
    <View key={sec.clave} style={{ marginBottom: 10 }}>
      <Text style={s.h2} minPresenceAhead={90}>{si + 1}. {sec.clave === '_general' ? (p.tipo === 'visita' ? 'Lo observado' : 'Datos') : sec.titulo}</Text>
      {sec.campos.map(c => {
        const t = tipoDe(c);
        if (t === 'lista') return lista(c);
        if (t === 'firma') {
          const u = urls[inf.respuestas[c.clave] as string];
          return (
            <View key={c.clave} style={s.tr} wrap={false}>
              <Text style={s.et}>{c.etiqueta}</Text>
              {u ? <Image src={u} style={{ height: 40, width: 140, objectFit: 'contain' }} /> : <Text style={s.v}>Firmado</Text>}
            </View>
          );
        }
        const valor = valorCampo(c, sec.titulo);
        const al = alertas.some(a => a.etiqueta === c.etiqueta);
        const largo = t === 'parrafo';
        return (
          <View key={c.clave} style={largo ? { padding: '4 6', borderBottomWidth: 1, borderBottomColor: LINE } : s.tr} wrap={largo}>
            <View style={largo ? { marginBottom: 2 } : { width: 190, paddingRight: 8 }}>
              <Text style={{ color: MUTED }}>{c.etiqueta}</Text>
              {c.naturaleza ? <Text style={s.tag}>{NATURALEZA[c.naturaleza]}</Text> : null}
            </View>
            <Text style={[largo ? s.texto : s.v, al ? { color: ROJO, fontFamily: 'Helvetica-Bold' } : {}]}>{valor}</Text>
          </View>
        );
      })}
    </View>
  ));
  const fotosTodas: FotoNum[] = [...fotos, ...p.fotos.map((f, i) => ({ n: fotos.length + i + 1, url: f.url, caption: f.caption }))];

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
            <Text style={{ fontSize: 6.5, color, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5 }}>{titulo}</Text>
            <Text style={s.folioNum}>{p.folio}</Text>
            <Text style={s.folioFecha}>{formatDate(p.fecha)}{p.hora ? ` · ${p.hora}` : ''}</Text>
            {borrador ? <Text style={{ fontSize: 7, color: '#ffb4b4', marginTop: 3, fontFamily: 'Helvetica-Bold' }}>BORRADOR</Text> : null}
          </View>
        </View>

        {inf.plantilla_nombre ? (
          <View style={{ marginBottom: 8 }}>
            <Text style={s.titulo}>{inf.plantilla_nombre}</Text>
            {inf.plantilla_codigo ? <Text style={{ fontSize: 7.5, color: MUTED }}>Plantilla {inf.plantilla_codigo}{inf.plantilla_version ? ` · versión ${inf.plantilla_version}` : ''}</Text> : null}
          </View>
        ) : null}

        <View style={[s.tarjeta, { borderLeftColor: color }]}>
          <View style={s.fila}><Text style={s.k}>Cliente</Text><Text style={s.v}>{p.cliente.nombre}{p.cliente.rut ? ` · RUT ${p.cliente.rut}` : ''}</Text></View>
          {p.cliente.direccion ? <View style={s.fila}><Text style={s.k}>Ubicación</Text><Text style={s.v}>{p.cliente.direccion}</Text></View> : null}
          {p.referencia ? <View style={s.fila}><Text style={s.k}>{p.tipo === 'visita' ? 'Visita' : 'Trabajo'}</Text><Text style={s.v}>{p.referencia}</Text></View> : null}
          <View style={s.fila}><Text style={s.k}>Fecha</Text><Text style={s.v}>{formatDate(p.fecha)}{p.hora ? ` a las ${p.hora}` : ''}</Text></View>
          {p.responsable ? <View style={s.fila}><Text style={s.k}>Técnico responsable</Text><Text style={s.v}>{p.responsable}</Text></View> : null}
          {p.completadoAt ? <View style={s.fila}><Text style={s.k}>Informe cerrado</Text><Text style={s.v}>{formatDate(p.completadoAt)}</Text></View> : null}
        </View>

        {inf.objetivo?.trim() ? <View style={{ marginBottom: 8 }}><Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>Objetivo</Text><Text style={s.texto}>{inf.objetivo}</Text></View> : null}
        {inf.intro?.trim() ? <View style={{ marginBottom: 10 }}><Formato texto={inf.intro} /></View> : null}

        {alertas.length > 0 && (
          <View style={s.alerta} wrap={false}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: ROJO, marginBottom: 4 }}>RIESGOS Y OBSERVACIONES DESTACADAS</Text>
            {alertas.map((a, i) => (
              <Text key={i} style={{ marginBottom: 2 }}>•  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{a.etiqueta}:</Text> {a.detalle || a.valor}</Text>
            ))}
          </View>
        )}

        {cuerpo}

        {p.trabajos?.trim() ? <View style={{ marginBottom: 10 }}><Text style={s.h2}>Trabajos realizados</Text><Text style={s.texto}>{p.trabajos}</Text></View> : null}

        {inf.checklist.length > 0 && (
          <View style={{ marginBottom: 10 }} wrap={false}>
            <Text style={s.h2}>Checklist de cierre</Text>
            {inf.checklist.map((c, i) => (
              <View key={i} style={s.fila}><Text style={{ width: 22, fontFamily: 'Helvetica-Bold', color: c.ok ? '#15803d' : ROJO }}>{c.ok ? 'OK' : 'NO'}</Text><Text style={s.v}>{c.texto}</Text></View>
            ))}
          </View>
        )}

        {p.observaciones?.trim() ? <View style={{ marginBottom: 10 }}><Text style={s.h2}>Observaciones</Text><Text style={s.texto}>{p.observaciones}</Text></View> : null}

        {p.tipo === 'entrega' ? (
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
        ) : (
          <View wrap={false}>
            <View style={{ marginTop: 18, width: 220 }}>
              <View style={s.firmaEsp} />
              <View style={s.firmaLinea} />
              <Text style={s.firmaNombre}>{p.responsable || 'Técnico responsable'}</Text>
              <Text style={s.firmaMut}>Responsable técnico · {p.empresa.nombre}</Text>
            </View>
            <Text style={s.nota}>
              Este informe registra un levantamiento técnico en terreno para preparar la propuesta de trabajos. Los datos indicados como
              «Medido» se obtuvieron con instrumento; los demás corresponden a observación visual, a lo declarado por el cliente o a
              estimaciones del técnico, y pueden requerir verificación. No constituye una certificación, un ensayo normativo ni una
              declaración ante la Superintendencia de Electricidad y Combustibles (SEC). No incluye precios.
            </Text>
          </View>
        )}
        <Text style={s.pie} fixed render={({ pageNumber, totalPages }) => `${pie} · página ${pageNumber} de ${totalPages}`} />
      </Page>

      {fotosTodas.length > 0 && (
        <Page size="A4" style={s.page}>
          <Text style={[s.h2, { marginBottom: 10 }]}>Registro fotográfico</Text>
          <View style={s.fotos}>
            {fotosTodas.map(f => (
              <View key={f.n} style={s.fotoBox} wrap={false}>
                <Image src={f.url} style={s.foto} />
                <Text style={{ fontSize: 7.5, marginTop: 3 }}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Foto {f.n}.</Text> <Text style={{ color: MUTED }}>{f.caption}</Text></Text>
              </View>
            ))}
          </View>
          <Text style={s.pie} fixed render={({ pageNumber, totalPages }) => `${pie} · página ${pageNumber} de ${totalPages}`} />
        </Page>
      )}
    </Document>
  );
}
