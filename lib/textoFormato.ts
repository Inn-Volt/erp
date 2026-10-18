/**
 * Texto con formato del cotizador (como los de TecApp), guardado como texto con marcas
 * simples, para que lo de antes se lea igual y no haya que cambiar la base:
 *
 *   **negrita**   _cursiva_   ++subrayado++   ~~tachado~~
 *   # Título      ## Subtítulo
 *   - viñeta      1. numerada      (dos espacios de sangría por nivel)
 *
 * Cada línea es un párrafo; una línea vacía es un párrafo vacío. «1) Cobertura» NO es lista:
 * así escribían los títulos de las aclaraciones y el PDF los sigue poniendo en negrita.
 * Lo escribe el editor (components/EditorFormato) y lo leen el visor, el enlace del cliente y el PDF.
 */

export type Marca = 'bold' | 'italic' | 'underline' | 'strike';
export interface NodoTexto { type: 'text'; text: string; marks?: { type: Marca }[] }
export interface Parrafo { type: 'paragraph'; content?: NodoTexto[] }
export interface Titulo { type: 'heading'; attrs: { level: 1 | 2 }; content?: NodoTexto[] }
export interface ItemLista { type: 'listItem'; content: (Parrafo | Lista)[] }
export interface Lista { type: 'bulletList' | 'orderedList'; attrs?: { start?: number }; content: ItemLista[] }
export type Bloque = Parrafo | Titulo | Lista;
export interface DocFormato { type: 'doc'; content: Bloque[] }

export const esLista = (b: { type: string }): b is Lista => b.type === 'bulletList' || b.type === 'orderedList';

const MARCAS: { m: Marca; s: string }[] = [
  { m: 'bold', s: '**' }, { m: 'underline', s: '++' }, { m: 'strike', s: '~~' }, { m: 'italic', s: '_' },
];
const PUNTUACION = /[\s.,;:!?¡¿()[\]{}"'«»\-—/]/;
const borde = (c: string | undefined) => c === undefined || PUNTUACION.test(c);

// ── Texto en línea ──────────────────────────────────────────────

function cierre(s: string, desde: number, marca: string): number {
  for (let j = desde; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (!s.startsWith(marca, j)) continue;
    if (marca === '_') {
      // Cursiva solo en el borde de una palabra: «juan_perez» no es cursiva.
      if (j === desde || s[j - 1] === ' ' || !borde(s[j + 1])) continue;
    } else if (j === desde) continue;
    return j;
  }
  return -1;
}

/** Las marcas de una línea, como nodos de texto con sus formatos. */
export function enLinea(s: string, activas: Marca[] = []): NodoTexto[] {
  const out: NodoTexto[] = [];
  let buf = '';
  const soltar = () => {
    if (!buf) return;
    out.push(activas.length ? { type: 'text', text: buf, marks: activas.map(type => ({ type })) } : { type: 'text', text: buf });
    buf = '';
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) { buf += s[i + 1]; i += 2; continue; }
    const m = MARCAS.find(x => s.startsWith(x.s, i) && !activas.includes(x.m)
      && (x.s !== '_' || (borde(s[i - 1]) && s[i + 1] !== undefined && s[i + 1] !== ' ')));
    if (m) {
      const j = cierre(s, i + m.s.length, m.s);
      if (j > 0) {
        soltar();
        out.push(...enLinea(s.slice(i + m.s.length, j), [...activas, m.m]));
        i = j + m.s.length;
        continue;
      }
    }
    buf += c;
    i++;
  }
  soltar();
  // Junta los pedazos seguidos con las mismas marcas.
  const junto: NodoTexto[] = [];
  for (const n of out) {
    const prev = junto[junto.length - 1];
    if (prev && JSON.stringify(prev.marks || []) === JSON.stringify(n.marks || [])) prev.text += n.text;
    else junto.push({ ...n });
  }
  return junto;
}

function escapar(t: string): string {
  let o = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\\') o += '\\\\';
    else if ((c === '*' || c === '+' || c === '~') && (t[i + 1] === c || t[i - 1] === c)) o += '\\' + c;
    else if (c === '_' && (borde(t[i - 1]) || borde(t[i + 1]))) o += '\\_';
    else o += c;
  }
  return o;
}

function lineaDe(nodos: NodoTexto[] | undefined): string {
  return (nodos || []).map(n => {
    const ms = new Set((n.marks || []).map(m => m.type));
    // Los espacios de los bordes quedan fuera de las marcas («** hola**» no se leería).
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(n.text)!;
    if (!m[2]) return n.text;
    let t = escapar(m[2]);
    for (const x of [...MARCAS].reverse()) if (ms.has(x.m)) t = x.s + t + x.s;
    return m[1] + t + m[3];
  }).join('');
}

// ── Bloques ─────────────────────────────────────────────────────

type Fila =
  | { k: 'item'; ordenada: boolean; nivel: number; n: number; texto: string }
  | { k: 'bloque'; b: Parrafo | Titulo };

function filaDe(l: string): Fila {
  const t = /^(\s*)([-•*])\s+(.*)$/.exec(l);
  if (t) return { k: 'item', ordenada: false, nivel: Math.floor(t[1].replace(/\t/g, '  ').length / 2), n: 1, texto: t[3] };
  const o = /^(\s*)(\d{1,3})\.\s+(.*)$/.exec(l);
  if (o) return { k: 'item', ordenada: true, nivel: Math.floor(o[1].replace(/\t/g, '  ').length / 2), n: Number(o[2]), texto: o[3] };
  const h = /^(#{1,2})\s+(.*)$/.exec(l);
  if (h) return { k: 'bloque', b: { type: 'heading', attrs: { level: h[1].length as 1 | 2 }, content: enLinea(h[2]) } };
  const c = enLinea(l);
  return { k: 'bloque', b: c.length ? { type: 'paragraph', content: c } : { type: 'paragraph' } };
}

function armarLista(filas: Fila[], i: number, nivel: number): [Lista, number] {
  const primera = filas[i] as Extract<Fila, { k: 'item' }>;
  const lista: Lista = { type: primera.ordenada ? 'orderedList' : 'bulletList', content: [] };
  if (primera.ordenada && primera.n !== 1) lista.attrs = { start: primera.n };
  while (i < filas.length) {
    const f = filas[i];
    if (f.k !== 'item' || f.nivel < nivel) break;
    if (f.nivel > nivel) {
      const ultimo = lista.content[lista.content.length - 1];
      const [sub, j] = armarLista(filas, i, f.nivel);
      if (ultimo) ultimo.content.push(sub); else lista.content.push({ type: 'listItem', content: [{ type: 'paragraph' }, sub] });
      i = j;
      continue;
    }
    if (f.ordenada !== primera.ordenada) break;
    const c = enLinea(f.texto);
    lista.content.push({ type: 'listItem', content: [c.length ? { type: 'paragraph', content: c } : { type: 'paragraph' }] });
    i++;
  }
  return [lista, i];
}

/** Del texto guardado al documento (lo que muestra el editor). */
export function aDoc(texto: string | null | undefined): DocFormato {
  const filas = (texto || '').replace(/\r\n?/g, '\n').split('\n').map(filaDe);
  const content: Bloque[] = [];
  let i = 0;
  while (i < filas.length) {
    const f = filas[i];
    if (f.k === 'item') { const [l, j] = armarLista(filas, i, f.nivel); content.push(l); i = j; }
    else { content.push(f.b); i++; }
  }
  // Un texto vacío es un párrafo vacío; las líneas vacías del final no cuentan.
  while (content.length > 1 && content[content.length - 1].type === 'paragraph' && !(content[content.length - 1] as Parrafo).content?.length) content.pop();
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

function listaATexto(l: Lista, nivel: number): string[] {
  const sangria = '  '.repeat(nivel);
  let n = l.attrs?.start ?? 1;
  const out: string[] = [];
  for (const it of l.content || []) {
    const vineta = l.type === 'orderedList' ? `${n++}. ` : '- ';
    let primera = true;
    for (const b of it.content || []) {
      if (esLista(b)) { out.push(...listaATexto(b, nivel + 1)); continue; }
      out.push(primera ? sangria + vineta + lineaDe(b.content) : sangria + '  ' + lineaDe(b.content));
      primera = false;
    }
    if (primera) out.push(sangria + vineta.trimEnd());
  }
  return out;
}

/** Del documento del editor al texto que se guarda. */
export function aTexto(doc: { content?: unknown[] } | null | undefined): string {
  const out: string[] = [];
  for (const b of (doc?.content || []) as Bloque[]) {
    if (b.type === 'heading') out.push(`${'#'.repeat(b.attrs?.level === 1 ? 1 : 2)} ${lineaDe(b.content)}`);
    else if (b.type === 'bulletList' || b.type === 'orderedList') out.push(...listaATexto(b, 0));
    else {
      const t = lineaDe((b as Parrafo).content);
      // Un párrafo que empieza como una lista o un título se escapa para que siga siendo párrafo.
      out.push(/^(\s*([-•*]|\d{1,3}\.)\s|#{1,2}\s)/.test(t) ? '\\' + t.replace(/^\s+/, '') : t);
    }
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join('\n');
}

/** El texto sin marcas (para resúmenes de una línea). */
export function textoPlano(texto: string | null | undefined): string {
  const partes: string[] = [];
  const recorrer = (n: { text?: string; content?: unknown[] }) => {
    if (typeof n.text === 'string') partes.push(n.text);
    (n.content || []).forEach(h => recorrer(h as { text?: string; content?: unknown[] }));
    if (!n.text) partes.push(' ');
  };
  recorrer(aDoc(texto));
  return partes.join('').replace(/\s+/g, ' ').trim();
}

/** «1) Cobertura»: un título de las aclaraciones de antes (corto, sin marcas): va en negrita. */
export const esTituloDeAntes = (b: Bloque): b is Parrafo & { content: NodoTexto[] } =>
  b.type === 'paragraph' && (b.content || []).length === 1 && !(b.content![0].marks || []).length
  && /^\s*\d+\)\s+\S/.test(b.content![0].text) && b.content![0].text.trim().length <= 70;

/**
 * Un título corto a partir de un texto largo (la descripción de una solicitud): la primera
 * oración, sin marcas y, si es larga, cortada en una palabra entera (nunca «El siste…»).
 */
export function tituloCorto(texto: string | null | undefined, max = 70): string {
  const plano = textoPlano(texto);
  const oracion = (plano.split(/(?<=[.!?])\s|\n/)[0] || plano).replace(/[.!?:;,\s]+$/, '').trim();
  if (oracion.length <= max) return oracion;
  const corte = oracion.slice(0, max + 1);
  const espacio = corte.lastIndexOf(' ');
  return (espacio > max * 0.5 ? corte.slice(0, espacio) : corte.slice(0, max)).replace(/[,;:\s]+$/, '');
}

/** ¿El título solo repite el comienzo de la introducción? (entonces el PDF no lo pone encima). */
export function tituloRepiteIntro(titulo: string | null | undefined, intro: string | null | undefined): boolean {
  const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const t = n(titulo || ''), i = n(textoPlano(intro));
  return t.length >= 25 && i.startsWith(t);
}
