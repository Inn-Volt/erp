/* eslint-disable jsx-a11y/alt-text -- <Image> de @react-pdf no admite alt */
/**
 * El PDF de la cotización con el orden de TecApp, en el estilo de InnVolt:
 *   1. Hoja 1: empresa, tarjeta con N°/revisión/fechas, «PREPARADO PARA» y el título
 *      (o la portada, si la primera sección es una portada).
 *   2. INTRODUCCIÓN y las secciones de la presentación.
 *   3. VALORIZACIÓN, a continuación y entera en una hoja (si no cabe donde va, pasa completa
 *      a la siguiente): resumen por partida, inversión total, forma de pago e «Importante».
 *   4. DETALLE DE LA COTIZACIÓN (hoja nueva) según «Qué ve el cliente», y el cuadro de
 *      totales, que siempre va con las últimas filas (nunca solo en una hoja).
 *   5. A continuación: aclaraciones y garantías; «Cómo aceptar», datos para transferir y
 *      firmas van juntos.
 *   6. Registro fotográfico (si viene de un levantamiento con fotos).
 * Nunca imprime costos, márgenes ni el tipo de cada línea. Marca en diagonal: BORRADOR,
 * ANULADA o EJEMPLO.
 */

import React from 'react';
import { aDoc, esLista, esTituloDeAntes, tituloRepiteIntro, type Lista, type NodoTexto } from '@/lib/textoFormato';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { Cliente, Vendedor } from '@/types';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import type { CotizacionDoc, Linea, PartidaCot, Seccion } from '@/lib/cotizador/tipos';
import { planEnPalabras, TITULO_VALORIZACION, type HitoCobro } from '@/lib/cotizador/tipos';
import { calcular, cantidadLegible, filasDelCliente, formatMonto, type Resultado } from '@/lib/cotizador/calculo';
import { formatDate } from '@/utils';

const INK = '#1a1a1a', DARK = '#232323', SPARK = '#ffc600', WHITE = '#ffffff', MUTED = '#565656', FAINT = '#8a8a8a', LINE = '#e2e2e2', TINT = '#f6f6f4';

const s = StyleSheet.create({
  page: { backgroundColor: WHITE, color: INK, fontFamily: 'Helvetica', fontSize: 8.5, paddingTop: 26, paddingBottom: 46, paddingHorizontal: 32 },
  barra: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, flexDirection: 'row' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: LINE, paddingBottom: 12, marginBottom: 12 },
  logo: { width: 140, objectFit: 'contain', marginBottom: 6 },
  empresa: { fontSize: 11.5, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  linea: { fontSize: 7.5, color: MUTED, marginBottom: 1.2 },
  folio: { backgroundColor: DARK, borderRadius: 6, padding: '10 16', minWidth: 160, alignItems: 'center' },
  folioLbl: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: SPARK, letterSpacing: 2.5, marginBottom: 3 },
  folioNum: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: WHITE },
  folioSub: { fontSize: 7.5, color: '#cfcfcf', marginTop: 2 },
  rotulo: { fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 2, color: INK, marginBottom: 6 },
  card: { backgroundColor: TINT, borderRadius: 6, padding: '9 12', borderLeftWidth: 3, borderLeftColor: SPARK, marginBottom: 12 },
  fila: { flexDirection: 'row', marginBottom: 2 },
  k: { width: 78, fontSize: 7.5, color: FAINT },
  v: { flex: 1, fontSize: 8 },
  titulo: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 10, lineHeight: 1.3 },
  texto: { fontSize: 8.3, color: '#333', lineHeight: 1.55 },
  seccionTitulo: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 4 },
  bloqueTitulo: { fontSize: 11, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, marginBottom: 10, paddingBottom: 5, borderBottomWidth: 2, borderBottomColor: SPARK },
  resRow: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: LINE },
  resNum: { width: 18, fontSize: 8, color: MUTED },
  resNom: { flex: 1, fontSize: 8.5, paddingRight: 8 },
  resVal: { width: 96, textAlign: 'right', fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  inv: { flexDirection: 'row', borderRadius: 6, overflow: 'hidden', marginTop: 14, marginBottom: 12 },
  invIzq: { flex: 1, backgroundColor: DARK, padding: '12 16' },
  invLbl: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: SPARK, letterSpacing: 2.5, marginBottom: 4 },
  invTotal: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: WHITE },
  invSub: { fontSize: 7.5, color: '#cfcfcf', marginTop: 3 },
  invDer: { width: 200, backgroundColor: TINT, padding: '10 14', justifyContent: 'center' },
  invK: { fontSize: 6.5, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.5 },
  invV: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', marginBottom: 5 },
  importante: { borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: '9 12', marginTop: 4 },
  thRow: { flexDirection: 'row', backgroundColor: DARK, padding: '5 8', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  th: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: WHITE, letterSpacing: 0.6 },
  tr: { flexDirection: 'row', padding: '5 8', borderBottomWidth: 1, borderBottomColor: LINE, alignItems: 'flex-start' },
  td: { fontSize: 8 },
  partidaCab: { flexDirection: 'row', backgroundColor: TINT, padding: '6 8', marginTop: 8, borderLeftWidth: 3, borderLeftColor: SPARK },
  totales: { alignSelf: 'flex-end', width: 250, marginTop: 12, borderWidth: 1, borderColor: LINE, borderRadius: 6, overflow: 'hidden' },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', padding: '5 10', borderBottomWidth: 1, borderBottomColor: LINE },
  totFinal: { flexDirection: 'row', justifyContent: 'space-between', padding: '8 10', backgroundColor: DARK },
  firmas: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
  firmaCol: { width: 220, alignItems: 'center' },
  firmaImg: { height: 52, width: 170, objectFit: 'contain' },
  firmaLinea: { width: '100%', borderTopWidth: 1, borderTopColor: INK, marginBottom: 4 },
  pie: { position: 'absolute', bottom: 18, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: FAINT },
  marca: { position: 'absolute', top: 330, left: 40, right: 40, textAlign: 'center', fontSize: 92, fontFamily: 'Helvetica-Bold', color: '#000', opacity: 0.06, transform: 'rotate(-35deg)' },
  fotos: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  fotoBox: { width: '48.5%', marginBottom: 12 },
  foto: { width: '100%', height: 185, objectFit: 'cover', borderRadius: 4 },
});

/** Texto con formato (lib/textoFormato): negrita, cursiva, subrayado, tachado, títulos y listas. */
function TextoFormato({ texto, estilo = s.texto, antes }: {
  texto?: string | null; estilo?: typeof s.texto;
  /** Título del bloque: va pegado al primer párrafo (no queda solo al pie de una hoja). */
  antes?: React.ReactNode;
}) {
  if (!(texto || '').trim()) return null;
  const linea = (nodos: NodoTexto[] | undefined) => (nodos || []).map((n, i) => {
    const ms = (n.marks || []).map(m => m.type);
    const negrita = ms.includes('bold');
    const cursiva = ms.includes('italic');
    const deco = [ms.includes('underline') ? 'underline' : '', ms.includes('strike') ? 'line-through' : ''].filter(Boolean).join(' ');
    const fuente = negrita && cursiva ? 'Helvetica-BoldOblique' : negrita ? 'Helvetica-Bold' : cursiva ? 'Helvetica-Oblique' : undefined;
    return <Text key={i} style={{ ...(fuente ? { fontFamily: fuente } : {}), ...(deco ? { textDecoration: deco as 'underline' } : {}) }}>{n.text}</Text>;
  });
  const lista = (l: Lista, nivel: number, k: number): React.ReactNode => {
    let n = l.attrs?.start ?? 1;
    return (
      <View key={k} style={{ marginLeft: nivel ? 12 : 0 }}>
        {(l.content || []).map((it, j) => {
          const marca = l.type === 'orderedList' ? `${n++}.` : nivel % 2 ? '–' : '•';
          return (
            <View key={j} style={{ flexDirection: 'row', marginBottom: 1.5 }}>
              <Text style={[estilo, { width: 13, color: MUTED }]}>{marca}</Text>
              <View style={{ flex: 1 }}>
                {(it.content || []).map((b, i) => (esLista(b) ? lista(b, nivel + 1, i)
                  : <Text key={i} style={estilo}>{linea((b as { content?: NodoTexto[] }).content)}</Text>))}
              </View>
            </View>
          );
        })}
      </View>
    );
  };
  const tam = (estilo as { fontSize?: number }).fontSize || 9;
  const bloques = aDoc(texto).content;
  const bloque = (b: (typeof bloques)[number], i: number): React.ReactNode => {
    if (b.type === 'heading') {
      return <Text key={i} style={[estilo, { fontFamily: 'Helvetica-Bold', fontSize: b.attrs.level === 1 ? tam + 2.5 : tam + 1, color: INK, marginTop: i ? 6 : 0, marginBottom: 2 }]}>{linea(b.content)}</Text>;
    }
    if (esLista(b)) return lista(b, 0, i);
    if (!(b.content || []).length) return <View key={i} style={{ height: 5 }} />;
    // «1) Cobertura»: un título de las aclaraciones de antes, en negrita.
    if (esTituloDeAntes(b)) return <Text key={i} style={[estilo, { fontFamily: 'Helvetica-Bold', marginTop: i ? 5 : 0 }]}>{b.content[0].text.trim()}</Text>;
    return <Text key={i} style={estilo}>{linea(b.content)}</Text>;
  };
  const esTitulo = (b: (typeof bloques)[number] | undefined) => !!b && (b.type === 'heading' || (!esLista(b) && esTituloDeAntes(b)));
  const largo = (b: unknown) => JSON.stringify(b).length;
  const out: React.ReactNode[] = [];
  for (let i = 0; i < bloques.length; i++) {
    const b = bloques[i], sig = bloques[i + 1];
    // Un título no queda solo al pie de una hoja: va pegado a lo que sigue (si no es muy largo).
    if (esTitulo(b) && sig && !esTitulo(sig) && largo(sig) < 2500) {
      out.push(<View key={`t${i}`} wrap={false}>{bloque(b, i)}{bloque(sig, i + 1)}</View>);
      i++;
    } else out.push(bloque(b, i));
  }
  if (antes) out[0] = <View key="antes" wrap={false}>{antes}{out[0]}</View>;
  return <View>{out}</View>;
}

/** Diseño del PDF (ajustes_cotizacion.pdf_diseno, fase 8). */
export interface DisenoPDF {
  color?: string; titulo?: string; pie?: string;
  mostrar_forma_pago?: boolean; mostrar_importante?: boolean; mostrar_como_aceptar?: boolean; mostrar_banco?: boolean; mostrar_firmas?: boolean;
}

export interface CotizacionPDFProps {
  diseno?: DisenoPDF | null;
  /** Fase 7: cómo se cobra (hitos); se imprime como «Forma de pago». */
  planCobro?: HitoCobro[] | null;
  doc: CotizacionDoc;
  cliente: Cliente | null;
  empresa: EmpresaInfo;
  vendedor?: Vendedor | null;
  sucursal?: { nombre: string; direccion?: string | null; comuna?: string | null } | null;
  contacto?: { nombre: string; email?: string | null; telefono?: string | null } | null;
  importante?: string | null;
  correoAceptar?: string | null;
  enlace?: string | null;
  marca?: 'BORRADOR' | 'ANULADA' | 'EJEMPLO' | null;
  fotos?: { url: string; caption: string }[];
  aceptacion?: { nombre: string; rut?: string | null; fecha: string; firma?: string | null } | null;
}

export default function CotizacionPDF(p: CotizacionPDFProps) {
  const { doc, empresa, cliente } = p;
  const m = doc.moneda;
  const r: Resultado = calcular(doc.items, doc.partidas, m, doc.valor_uf);
  const fmt = (v: number | null | undefined, u = false) => formatMonto(v, m, u);
  const folio = `IV-${String(doc.folio || 0).padStart(4, '0')}`;
  const nombreArchivo = doc.revision > 0 ? `${folio} · Revisión ${doc.revision}` : folio;
  const emision = doc.fecha_emision || doc.created_at;
  const logo = empresa.logo_url || (/innvolt/i.test(empresa.nombre) && typeof window !== 'undefined' ? window.location.origin + '/InnVolt-transparente-claro.png' : '');

  const secciones = (doc.secciones || []).filter(x => x.tipo === 'portada' || (x.texto || '').trim() || (x.titulo || '').trim());
  const portada: Seccion | null = secciones[0]?.tipo === 'portada' ? secciones[0] : null;
  const textos = secciones.filter(x => x.tipo !== 'portada');
  const hayIntro = !!doc.descripcion_general?.trim();
  const algoAntes = !!portada || hayIntro || textos.length > 0;
  const tituloVal = (doc.titulo_valorizacion || '').trim() || TITULO_VALORIZACION;
  // Diseño del PDF (Ajustes → Diseño del PDF). Lo que no se elige queda como siempre.
  const dz = p.diseno || {};
  const acento = /^#[0-9a-f]{6}$/i.test(dz.color || '') ? dz.color! : SPARK;
  const tituloDoc = (dz.titulo || '').trim().toUpperCase() || 'COTIZACIÓN';
  const ver = (k: keyof DisenoPDF) => dz[k] !== false;

  const partidas = doc.partidas || [];
  const lineasDe = (pid: string) => doc.items.filter(l => l.partidaId === pid);
  const sueltas = doc.items.filter(l => !l.partidaId || !partidas.some(x => x.id === l.partidaId));
  const conDescuento = r.totales.descuento > 0;
  const enPesos = m === 'UF' && r.totales.totalClp !== null;

  const Pie = () => (
    <View style={s.pie} fixed>
      <Text>{(dz.pie || '').trim() || `${empresa.nombre} · Cotización ${nombreArchivo}`}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
  const Marca = () => (p.marca ? <Text style={s.marca} fixed>{p.marca}</Text> : null);
  const Barra = () => (
    <View style={s.barra} fixed><View style={{ flex: 1, backgroundColor: INK }} /><View style={{ width: 80, backgroundColor: acento }} /></View>
  );

  const Encabezado = () => (
    <View style={s.header}>
      <View style={{ flex: 1, paddingRight: 14 }}>
        {logo ? <Image src={logo} style={s.logo} /> : <Text style={[s.empresa, { fontSize: 18 }]}>{empresa.nombre.toUpperCase()}</Text>}
        <Text style={s.empresa}>{empresa.nombre}</Text>
        {empresa.rut ? <Text style={s.linea}>RUT: {empresa.rut}</Text> : null}
        {empresa.giro ? <Text style={s.linea}>Giro: {empresa.giro}</Text> : null}
        {empresa.direccion ? <Text style={s.linea}>{empresa.direccion}</Text> : null}
        {/* La empresa: solo correo y web. El teléfono va una vez, con el responsable (el de la
            empresa si el responsable no tiene uno). */}
        {empresa.email || empresa.website ? <Text style={s.linea}>{[empresa.email, empresa.website].filter(Boolean).join('  ·  ')}</Text> : null}
        {p.vendedor?.nombre ? <>
          <Text style={[s.linea, { color: INK, marginTop: 3 }]}>Responsable: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{p.vendedor.nombre}</Text>{p.vendedor.cargo ? `  ·  ${p.vendedor.cargo}` : ''}</Text>
          {(() => {
            const datos = [p.vendedor.telefono || empresa.telefono, p.vendedor.email && p.vendedor.email !== empresa.email ? p.vendedor.email : null].filter(Boolean);
            return datos.length ? <Text style={[s.linea, { color: INK }]}>{datos.join('  ·  ')}</Text> : null;
          })()}
        </> : empresa.telefono ? <Text style={s.linea}>{empresa.telefono}</Text> : null}
      </View>
      <View style={s.folio}>
        <Text style={[s.folioLbl, { color: acento }]}>{tituloDoc}</Text>
        <Text style={s.folioNum}>{folio}</Text>
        {doc.revision > 0 ? <Text style={[s.folioSub, { color: acento }]}>Revisión {doc.revision}</Text> : null}
        <Text style={s.folioSub}>Emitida {formatDate(emision)}</Text>
        {doc.valida_hasta ? <Text style={[s.folioSub, { color: acento }]}>Válida hasta {formatDate(doc.valida_hasta)}</Text> : null}
      </View>
    </View>
  );

  const PreparadoPara = () => (
    <View style={[s.card, { borderLeftColor: acento }]}>
      <Text style={s.rotulo}>PREPARADO PARA</Text>
      <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>{cliente?.empresa || cliente?.nombre_cliente || 'Cliente'}</Text>
      {(p.contacto?.nombre || (cliente?.empresa && cliente?.nombre_cliente)) ? <View style={s.fila}><Text style={s.k}>Atención</Text><Text style={s.v}>{p.contacto?.nombre || cliente?.nombre_cliente}</Text></View> : null}
      {cliente?.rut ? <View style={s.fila}><Text style={s.k}>RUT</Text><Text style={s.v}>{cliente.rut}</Text></View> : null}
      {(p.contacto?.telefono || cliente?.telefono) ? <View style={s.fila}><Text style={s.k}>Teléfono</Text><Text style={s.v}>{p.contacto?.telefono || cliente?.telefono}</Text></View> : null}
      {(p.contacto?.email || cliente?.email) ? <View style={s.fila}><Text style={s.k}>Correo</Text><Text style={s.v}>{p.contacto?.email || cliente?.email}</Text></View> : null}
      {p.sucursal ? <View style={s.fila}><Text style={s.k}>Lugar</Text><Text style={s.v}>{p.sucursal.nombre}{p.sucursal.direccion ? ` · ${p.sucursal.direccion}${p.sucursal.comuna ? ', ' + p.sucursal.comuna : ''}` : ''}</Text></View>
        : cliente?.direccion ? <View style={s.fila}><Text style={s.k}>Dirección</Text><Text style={s.v}>{cliente.direccion}</Text></View> : null}
    </View>
  );

  const Presentacion = () => (
    <View>
      {hayIntro && <View wrap>
        <TextoFormato texto={doc.descripcion_general} antes={<Text style={[s.rotulo, { marginTop: 4 }]}>INTRODUCCIÓN</Text>} />
      </View>}
      {textos.map(x => (
        <View key={x.clave} break={!!x.hoja_nueva}>
          {(x.texto || '').trim() ? <TextoFormato texto={x.texto} antes={x.titulo || x.subtitulo ? <>
            {x.titulo ? <Text style={s.seccionTitulo}>{x.titulo}</Text> : null}
            {x.subtitulo ? <Text style={[s.texto, { color: MUTED, marginBottom: 4 }]}>{x.subtitulo}</Text> : null}
          </> : undefined} /> : <>
            {x.titulo ? <Text style={s.seccionTitulo}>{x.titulo}</Text> : null}
            {x.subtitulo ? <Text style={[s.texto, { color: MUTED, marginBottom: 4 }]}>{x.subtitulo}</Text> : null}
          </>}
        </View>
      ))}
    </View>
  );

  // La valorización va entera en una hoja; solo si tiene demasiadas partidas se deja cortar.
  const valorizacionCabe = partidas.length + (sueltas.length ? 1 : 0) <= 24;
  const Valorizacion = () => (
    <View wrap={!valorizacionCabe}>
      {algoAntes && <Text style={[s.bloqueTitulo, { borderBottomColor: acento }]}>{tituloVal}</Text>}
      {(partidas.length > 0) && <>
        <Text style={s.rotulo}>RESUMEN POR PARTIDA</Text>
        {partidas.map((pt, i) => (
          <View key={pt.id} style={s.resRow} wrap={false}>
            <Text style={s.resNum}>{i + 1}</Text>
            <Text style={s.resNom}>{pt.nombre || 'Partida'}</Text>
            {doc.que_ve_cliente !== 'total' && <Text style={s.resVal}>{fmt(r.partidas.get(pt.id)?.subtotal)}</Text>}
          </View>
        ))}
        {sueltas.length > 0 && (
          <View style={s.resRow}><Text style={s.resNum}>{partidas.length + 1}</Text><Text style={s.resNom}>Ítems adicionales</Text>
            {doc.que_ve_cliente !== 'total' && <Text style={s.resVal}>{fmt(sueltas.reduce((a, l) => a + (r.lineas.get(l.id)?.subtotal || 0), 0))}</Text>}</View>
        )}
      </>}
      <View style={s.inv} wrap={false}>
        <View style={s.invIzq}>
          <Text style={[s.invLbl, { color: acento }]}>INVERSIÓN TOTAL</Text>
          <Text style={s.invTotal}>{fmt(r.totales.total)}</Text>
          <Text style={s.invSub}>IVA incluido ({fmt(r.totales.iva)}){conDescuento ? ` · Ahorro incluido: ${fmt(r.totales.descuento)}` : ''}</Text>
          {enPesos ? <Text style={s.invSub}>Equivalente a {formatMonto(r.totales.totalClp, 'CLP')} (UF {doc.valor_uf?.toLocaleString('es-CL')}{doc.fecha_valor_uf ? ` al ${formatDate(doc.fecha_valor_uf)}` : ''})</Text> : null}
        </View>
        <View style={s.invDer}>
          <Text style={s.invK}>Válida hasta</Text><Text style={s.invV}>{doc.valida_hasta ? formatDate(doc.valida_hasta) : '—'}</Text>
          <Text style={s.invK}>Moneda</Text><Text style={s.invV}>{m === 'UF' ? 'Unidad de Fomento (UF)' : 'Peso chileno (CLP)'}</Text>
          <Text style={s.invK}>Neto</Text><Text style={[s.invV, { marginBottom: 0 }]}>{fmt(r.totales.neto)}</Text>
        </View>
      </View>
      {ver('mostrar_forma_pago') && (p.planCobro || []).some(h => h.porcentaje > 0) ? (
        <View style={[s.importante, { marginBottom: 4 }]} wrap={false}>
          <Text style={s.rotulo}>FORMA DE PAGO</Text>
          <Text style={{ ...s.texto, fontSize: 7.8 }}>{planEnPalabras(p.planCobro || [])[0].toUpperCase() + planEnPalabras(p.planCobro || []).slice(1)}.</Text>
        </View>
      ) : null}
      {ver('mostrar_importante') && <View style={s.importante} wrap={false}>
        <Text style={s.rotulo}>IMPORTANTE</Text>
        <TextoFormato estilo={{ ...s.texto, fontSize: 7.6, color: MUTED }} texto={(p.importante || empresa.texto_importante || '').trim() ||
          `Todos los gastos o valores extraordinarios por factores externos a ${empresa.nombre} serán de responsabilidad de quien contrate los servicios; ${empresa.nombre} hará una cotización aparte por ellos.`} />
      </View>}
    </View>
  );

  const ColsVenta = () => (
    <View style={s.thRow}>
      <Text style={[s.th, { width: 40 }]}>CANT.</Text><Text style={[s.th, { flex: 1 }]}>DESCRIPCIÓN</Text>
      <Text style={[s.th, { width: 74, textAlign: 'right' }]}>VALOR UNIT.</Text>
      {conDescuento && <Text style={[s.th, { width: 40, textAlign: 'right' }]}>DESC.</Text>}
      <Text style={[s.th, { width: 80, textAlign: 'right' }]}>TOTAL</Text>
    </View>
  );
  const ColsInstalacion = () => (
    <View style={s.thRow}>
      <Text style={[s.th, { width: 40 }]}>CANT.</Text><Text style={[s.th, { flex: 1 }]}>DESCRIPCIÓN</Text>
      <Text style={[s.th, { width: 66, textAlign: 'right' }]}>EQUIPO</Text><Text style={[s.th, { width: 66, textAlign: 'right' }]}>INSTALACIÓN (HH)</Text>
      {conDescuento && <Text style={[s.th, { width: 40, textAlign: 'right' }]}>DESC.</Text>}
      <Text style={[s.th, { width: 80, textAlign: 'right' }]}>TOTAL</Text>
    </View>
  );

  /** Encabezado de columnas y filas de unas líneas (cada fila, un bloque que no se corta). */
  const filasDe = (lineas: Linea[], pt?: PartidaCot): { cols: React.ReactNode; filas: React.ReactNode[] } => {
    const instalacion = (pt?.tipo || 'instalacion') === 'instalacion';
    if (instalacion) {
      return {
        cols: <ColsInstalacion />,
        filas: filasDelCliente(lineas, r).map(f => (
          <View key={f.principal.id} style={s.tr} wrap={false}>
            <Text style={[s.td, { width: 40 }]}>{cantidadLegible(f.cantidad)} {f.unidad}</Text>
            <Text style={[s.td, { flex: 1, paddingRight: 6 }]}>{f.descripcion}</Text>
            <Text style={[s.td, { width: 66, textAlign: 'right' }]}>{f.equipo === null ? '' : f.equipoUnitario !== null ? fmt(f.equipoUnitario, true) : '—'}</Text>
            <Text style={[s.td, { width: 66, textAlign: 'right' }]}>{f.hh === null ? '' : f.hhUnitario !== null ? fmt(f.hhUnitario, true) : '—'}</Text>
            {conDescuento && <Text style={[s.td, { width: 40, textAlign: 'right' }]}>{f.descuentoPct ? `${f.descuentoPct} %` : f.descuento ? fmt(f.descuento) : ''}</Text>}
            <Text style={[s.td, { width: 80, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{fmt(f.subtotal)}</Text>
          </View>
        )),
      };
    }
    return {
      cols: <ColsVenta />,
      filas: lineas.map(l => {
        const c = r.lineas.get(l.id)!;
        return (
          <View key={l.id} style={s.tr} wrap={false}>
            <Text style={[s.td, { width: 40 }]}>{cantidadLegible(l.cantidad)} {l.unidad}</Text>
            <Text style={[s.td, { flex: 1, paddingRight: 6 }]}>{l.descripcion}</Text>
            <Text style={[s.td, { width: 74, textAlign: 'right' }]}>{fmt(c.precio, true)}</Text>
            {conDescuento && <Text style={[s.td, { width: 40, textAlign: 'right' }]}>{l.descuento ? `${l.descuento} %` : ''}</Text>}
            <Text style={[s.td, { width: 80, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{fmt(c.subtotal)}</Text>
          </View>
        );
      }),
    };
  };

  /**
   * El detalle como bloques hermanos que no se cortan: la cabecera de cada partida va con su
   * primera fila (no queda sola al pie de una hoja).
   */
  const bloquesDetalle = (): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    if (doc.que_ve_cliente === 'detalle') {
      const grupo = (clave: string, cab: React.ReactNode, lineas: Linea[], pt: PartidaCot) => {
        const { cols, filas } = filasDe(lineas, pt);
        out.push(<View key={`${clave}-cab`} wrap={false}>{cab}{cols}{filas[0]}</View>, ...filas.slice(1));
      };
      partidas.forEach((pt, i) => grupo(pt.id, <>
        <View style={[s.partidaCab, { borderLeftColor: acento }]}>
          <Text style={{ fontSize: 8.8, fontFamily: 'Helvetica-Bold', flex: 1 }}>{i + 1}. {pt.nombre || 'Partida'}</Text>
          <Text style={{ fontSize: 8.8, fontFamily: 'Helvetica-Bold' }}>{fmt(r.partidas.get(pt.id)?.subtotal)}</Text>
        </View>
        {pt.descripcion ? <View style={{ padding: '4 8' }}><TextoFormato estilo={{ ...s.texto, fontSize: 7.8 }} texto={pt.descripcion} /></View> : null}
      </>, lineasDe(pt.id), pt));
      if (sueltas.length > 0) {
        grupo('sueltas', <View style={[s.partidaCab, { borderLeftColor: acento }]}><Text style={{ fontSize: 8.8, fontFamily: 'Helvetica-Bold' }}>Ítems adicionales</Text></View>,
          sueltas, { id: '', nombre: '', cantidad: 1, unidad: 'global', tipo: 'venta' });
      }
      return out;
    }
    const cols = (
          <View style={s.thRow}>
            <Text style={[s.th, { width: 18 }]}>#</Text><Text style={[s.th, { flex: 1 }]}>SERVICIO O PRODUCTO</Text>
            {doc.que_ve_cliente === 'partidas' && <>
              <Text style={[s.th, { width: 56, textAlign: 'center' }]}>CANTIDAD</Text>
              <Text style={[s.th, { width: 80, textAlign: 'right' }]}>VALOR UNIT.</Text>
              <Text style={[s.th, { width: 84, textAlign: 'right' }]}>TOTAL</Text>
            </>}
          </View>
    );
    const filas: React.ReactNode[] = [
          ...partidas.map((pt, i) => {
            const pc = r.partidas.get(pt.id);
            const exacto = pc?.valorUnitario !== null && pc?.valorUnitario !== undefined;
            return (
              <View key={pt.id} style={s.tr} wrap={false}>
                <Text style={[s.td, { width: 18, color: MUTED }]}>{i + 1}</Text>
                <View style={{ flex: 1, paddingRight: 6 }}>
                  <Text style={[s.td, { fontFamily: 'Helvetica-Bold' }]}>{pt.nombre || 'Partida'}</Text>
                  {pt.descripcion ? <TextoFormato estilo={{ ...s.texto, fontSize: 7.5, color: MUTED }} texto={pt.descripcion} /> : null}
                </View>
                {doc.que_ve_cliente === 'partidas' && <>
                  <Text style={[s.td, { width: 56, textAlign: 'center' }]}>{cantidadLegible(pt.cantidad)} {pt.unidad}</Text>
                  <Text style={[s.td, { width: 80, textAlign: 'right' }]}>{exacto ? fmt(pc!.valorUnitario, true) : '—'}</Text>
                  <Text style={[s.td, { width: 84, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{fmt(pc?.subtotal)}</Text>
                </>}
              </View>
            );
          }),
          ...sueltas.map((l, i) => {
            const c = r.lineas.get(l.id)!;
            return (
              <View key={l.id} style={s.tr} wrap={false}>
                <Text style={[s.td, { width: 18, color: MUTED }]}>{partidas.length + i + 1}</Text>
                <Text style={[s.td, { flex: 1 }]}>{l.descripcion}</Text>
                {doc.que_ve_cliente === 'partidas' && <>
                  <Text style={[s.td, { width: 56, textAlign: 'center' }]}>{cantidadLegible(l.cantidad)} {l.unidad}</Text>
                  <Text style={[s.td, { width: 80, textAlign: 'right' }]}>{fmt(c.precio, true)}</Text>
                  <Text style={[s.td, { width: 84, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{fmt(c.subtotal)}</Text>
                </>}
              </View>
            );
          }),
    ];
    out.push(<View key="cols" wrap={false}>{cols}{filas[0]}</View>, ...filas.slice(1));
    return out;
  };

  const Totales = () => (
      <View style={s.totales} wrap={false}>
        <View style={s.totRow}><Text style={{ fontSize: 7.8, color: MUTED }}>Subtotal</Text><Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>{fmt(r.totales.subtotal)}</Text></View>
        {conDescuento && <View style={s.totRow}><Text style={{ fontSize: 7.8, color: MUTED }}>Descuento</Text><Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>− {fmt(r.totales.descuento)}</Text></View>}
        {r.totales.exento > 0 ? <>
          <View style={s.totRow}><Text style={{ fontSize: 7.8, color: MUTED }}>Neto afecto</Text><Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>{fmt(r.totales.afecto)}</Text></View>
          <View style={s.totRow}><Text style={{ fontSize: 7.8, color: MUTED }}>Exento (sin IVA)</Text><Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>{fmt(r.totales.exento)}</Text></View>
        </> : <View style={s.totRow}><Text style={{ fontSize: 7.8, color: MUTED }}>Neto</Text><Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>{fmt(r.totales.neto)}</Text></View>}
        <View style={s.totRow}><Text style={{ fontSize: 7.8, color: MUTED }}>IVA 19 %</Text><Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>{fmt(r.totales.iva)}</Text></View>
        <View style={s.totFinal}><Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: WHITE, letterSpacing: 1 }}>TOTAL</Text><Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: WHITE }}>{fmt(r.totales.total)}</Text></View>
        {enPesos && <View style={[s.totRow, { borderBottomWidth: 0 }]}><Text style={{ fontSize: 7.5, color: MUTED }}>En pesos (al valor UF)</Text><Text style={{ fontSize: 8 }}>{formatMonto(r.totales.totalClp, 'CLP')}</Text></View>}
      </View>
  );

  // El cuadro de totales va con las dos últimas filas: nunca queda solo en una hoja.
  const Detalle = () => {
    const bloques = bloquesDetalle();
    const cola = Math.min(2, bloques.length);
    return (
      <View>
        <Text style={[s.bloqueTitulo, { borderBottomColor: acento }]}>DETALLE DE LA COTIZACIÓN</Text>
        {bloques.slice(0, bloques.length - cola)}
        <View wrap={false}>{bloques.slice(bloques.length - cola)}<Totales /></View>
      </View>
    );
  };

  const HojaFinal = () => (
    <View>
      {doc.aclaraciones?.trim() ? (<View style={{ marginBottom: 14 }}>
        <TextoFormato texto={doc.aclaraciones} antes={<Text style={[s.bloqueTitulo, { borderBottomColor: acento }]}>ACLARACIONES Y GARANTÍAS</Text>} />
      </View>) : null}
      {/* «Cómo aceptar», la transferencia y las firmas van juntos: las firmas nunca quedan solas. */}
      <View wrap={false}>
      <View style={{ flexDirection: 'row' }}>
        {ver('mostrar_como_aceptar') && <View style={[s.card, { borderLeftColor: acento, flex: 1, marginRight: 12 }]}>
          <Text style={s.rotulo}>CÓMO ACEPTAR</Text>
          <Text style={[s.texto, { fontSize: 7.8 }]}>
            {p.enlace ? 'Acepta en línea desde el enlace que te enviamos' : 'Responde aceptando esta cotización'}
            {(p.correoAceptar || empresa.email) ? ` o escribe a ${p.correoAceptar || empresa.email}` : ''}, indicando el N° {folio}.
          </Text>
          {p.enlace ? <Text style={[s.texto, { fontSize: 7.2, color: MUTED, marginTop: 3 }]}>{p.enlace}</Text> : null}
        </View>}
        {ver('mostrar_banco') && (empresa.banco || empresa.cuenta_bancaria) ? (
          <View style={[s.card, { borderLeftColor: acento, flex: 1 }]}>
            <Text style={s.rotulo}>DATOS PARA TRANSFERENCIA</Text>
            <View style={s.fila}><Text style={s.k}>Titular</Text><Text style={s.v}>{empresa.nombre}</Text></View>
            {empresa.rut ? <View style={s.fila}><Text style={s.k}>RUT</Text><Text style={s.v}>{empresa.rut}</Text></View> : null}
            {empresa.banco ? <View style={s.fila}><Text style={s.k}>Banco</Text><Text style={s.v}>{empresa.banco}</Text></View> : null}
            {empresa.tipo_cuenta ? <View style={s.fila}><Text style={s.k}>Tipo</Text><Text style={s.v}>{empresa.tipo_cuenta}</Text></View> : null}
            {empresa.cuenta_bancaria ? <View style={s.fila}><Text style={s.k}>N° de cuenta</Text><Text style={s.v}>{empresa.cuenta_bancaria}</Text></View> : null}
            {empresa.email ? <View style={s.fila}><Text style={s.k}>Correo</Text><Text style={s.v}>{empresa.email}</Text></View> : null}
          </View>
        ) : null}
      </View>
      {ver('mostrar_firmas') && <View style={s.firmas} wrap={false}>
        <View style={s.firmaCol}>
          {p.aceptacion?.firma ? <Image src={p.aceptacion.firma} style={s.firmaImg} /> : <View style={{ height: 44 }} />}
          <View style={s.firmaLinea} />
          <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold' }}>{p.aceptacion?.nombre || 'Acepta el cliente'}</Text>
          <Text style={{ fontSize: 7, color: MUTED }}>{p.aceptacion ? `${p.aceptacion.rut ? `RUT ${p.aceptacion.rut} · ` : ''}aceptó en línea el ${formatDate(p.aceptacion.fecha)}` : 'Nombre, RUT y fecha'}</Text>
        </View>
        <View style={s.firmaCol}>
          <View style={{ height: p.aceptacion?.firma ? 52 : 44 }} />
          <View style={s.firmaLinea} />
          <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold' }}>{p.vendedor?.nombre || empresa.nombre}</Text>
          <Text style={{ fontSize: 7, color: MUTED }}>{p.vendedor?.nombre ? `${p.vendedor.cargo || 'Representante comercial'} · ${empresa.nombre}` : 'Representante comercial'}</Text>
        </View>
      </View>}
      </View>
    </View>
  );

  return (
    <Document title={`Cotización ${nombreArchivo}`} author={empresa.nombre}>
      <Page size="A4" style={s.page}>
        <Barra /><Marca />
        <Encabezado />
        <PreparadoPara />
        {portada ? (
          <View style={{ marginTop: 50, marginBottom: 40 }}>
            <View style={{ width: 60, height: 4, backgroundColor: acento, marginBottom: 16 }} />
            <Text style={{ fontSize: 26, fontFamily: 'Helvetica-Bold', lineHeight: 1.25, marginBottom: 10 }}>{portada.titulo?.trim() || doc.titulo}</Text>
            {portada.subtitulo ? <Text style={{ fontSize: 13, color: MUTED }}>{portada.subtitulo}</Text> : null}
            {portada.texto?.trim() ? <View style={{ marginTop: 14 }}><TextoFormato texto={portada.texto} /></View> : null}
          </View>
        ) : (
          <>
            {/* El título va corto, como nombre del proyecto; si solo repite el comienzo de la
                introducción (títulos de antes armados con ella), no se imprime dos veces. */}
            {doc.titulo && !tituloRepiteIntro(doc.titulo, doc.descripcion_general) ? <Text style={s.titulo}>{doc.titulo}</Text> : null}
            <Presentacion />
          </>
        )}
        {portada && (hayIntro || textos.length > 0) && <View break><Presentacion /></View>}
        {/* Todo lo de antes del detalle, junto: la valorización sigue a la introducción. Solo una
            portada sin más texto queda sola en su hoja. */}
        <View break={!!portada && !hayIntro && textos.length === 0} style={{ marginTop: algoAntes ? 10 : 0 }}><Valorizacion /></View>
        <View break><Detalle /></View>
        <View style={{ marginTop: 18 }}><HojaFinal /></View>
        <Pie />
      </Page>
      {(p.fotos || []).length > 0 && (
        <Page size="A4" style={s.page}>
          <Barra /><Marca />
          <Text style={[s.bloqueTitulo, { borderBottomColor: acento }]}>REGISTRO FOTOGRÁFICO</Text>
          <View style={s.fotos}>
            {(p.fotos || []).map((f, i) => (
              <View key={i} style={s.fotoBox} wrap={false}>
                <Image src={f.url} style={s.foto} />
                {f.caption ? <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 3 }}>{f.caption}</Text> : null}
              </View>
            ))}
          </View>
          <Pie />
        </Page>
      )}
    </Document>
  );
}

export const nombrePDF = (doc: Pick<CotizacionDoc, 'folio' | 'revision'>, cliente?: string | null) =>
  `Cotizacion_IV-${String(doc.folio).padStart(4, '0')}${doc.revision > 0 ? `-rev${doc.revision}` : ''}${cliente ? '_' + cliente.replace(/[^\w]+/g, '_').slice(0, 40) : ''}.pdf`;
