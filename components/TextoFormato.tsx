/**
 * Visor de un texto con formato (lib/textoFormato): arma elementos de React, nunca HTML
 * crudo, así que nada de lo escrito se lee como marcado. Lo usan el editor sin permiso de
 * edición y el enlace del cliente.
 */

import type { CSSProperties, ReactNode } from 'react';
import { aDoc, esLista, esTituloDeAntes, type Bloque, type Lista, type NodoTexto } from '@/lib/textoFormato';

function enLinea(nodos: NodoTexto[] | undefined): ReactNode[] {
  return (nodos || []).map((n, k) => {
    const ms = (n.marks || []).map(m => m.type);
    let el: ReactNode = n.text;
    if (ms.includes('strike')) el = <s>{el}</s>;
    if (ms.includes('underline')) el = <u>{el}</u>;
    if (ms.includes('italic')) el = <em>{el}</em>;
    if (ms.includes('bold')) el = <strong>{el}</strong>;
    return <span key={k}>{el}</span>;
  });
}

function lista(l: Lista, k: number): ReactNode {
  const items = (l.content || []).map((it, j) => (
    <li key={j}>{(it.content || []).map((b, i) => bloque(b as Bloque, i))}</li>
  ));
  return l.type === 'orderedList' ? <ol key={k} start={l.attrs?.start}>{items}</ol> : <ul key={k}>{items}</ul>;
}

function bloque(b: Bloque, k: number): ReactNode {
  if (b.type === 'heading') return b.attrs.level === 1 ? <h3 key={k} className="tf-h1">{enLinea(b.content)}</h3> : <h4 key={k} className="tf-h2">{enLinea(b.content)}</h4>;
  if (esLista(b)) return lista(b, k);
  if (esTituloDeAntes(b)) return <p key={k}><strong>{b.content[0].text}</strong></p>;
  const c = enLinea(b.content);
  return <p key={k}>{c.length ? c : <br />}</p>;
}

export default function TextoFormato({ texto, vacio, className = '', style }: {
  texto: string | null | undefined; vacio?: string; className?: string; style?: CSSProperties;
}) {
  if (!(texto || '').trim()) return vacio ? <p className={`tf-vacio ${className}`} style={style}>{vacio}</p> : null;
  return <div className={`texto-formato ${className}`} style={style}>{aDoc(texto).content.map(bloque)}</div>;
}
