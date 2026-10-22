'use client';

/**
 * Campo de texto con formato (como el de TecApp): barra con negrita, cursiva, subrayado,
 * tachado, título, subtítulo, viñetas, numeradas y deshacer. Se escribe como en un
 * procesador de texto y se guarda como texto con marcas simples (lib/textoFormato), que leen
 * el PDF y el enlace del cliente. Sin permiso para editar, muestra el texto con su formato.
 * Con `ia`, la barra trae «Mejorar con IA» (o «Escribir con IA» si está vacío): la IA propone un
 * texto con el mismo formato y se revisa antes de usarlo (Usar · Otra versión · Descartar);
 * usado, se deshace con Ctrl+Z.
 */

import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { Bold, Check, Heading1, Heading2, Italic, List, ListOrdered, Loader2, Redo2, RotateCcw, Sparkles, Strikethrough, Underline, Undo2, X } from 'lucide-react';
import { aDoc, aTexto } from '@/lib/textoFormato';
import { fetchConSesion } from '@/lib/fetchConSesion';
import { usePermisos } from '@/hooks/usePermisos';
import TextoFormato from './TextoFormato';

/** Para «Mejorar con IA»: qué texto es y, al pedirlo, el contexto (cliente, título, partidas…). */
export interface IAEditor {
  tipo: 'introduccion' | 'presentacion' | 'portada' | 'partida' | 'aclaraciones' | 'importante' | 'general';
  contexto?: () => string;
}

export default function EditorFormato({ valor, onCambiar, editable = true, placeholder, alto = 110, etiqueta, id, ia }: {
  valor: string;
  onCambiar: (texto: string) => void;
  editable?: boolean;
  placeholder?: string;
  /** Alto mínimo del área de escritura, en px. */
  alto?: number;
  /** Nombre del campo para el lector de pantalla. */
  etiqueta?: string;
  id?: string;
  /** Muestra «Mejorar con IA». */
  ia?: IAEditor;
}) {
  const { puede } = usePermisos();
  const conIA = !!ia && puede('ia.usar');
  const [iaAbierta, setIaAbierta] = useState(false);
  // Lo último que salió del editor: un `valor` igual no se vuelve a cargar (perdería el cursor).
  const ultimo = useRef(valor);
  const cambiar = useRef(onCambiar);
  useEffect(() => { cambiar.current = onCambiar; }, [onCambiar]);

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        code: false, codeBlock: false, blockquote: false, horizontalRule: false, link: false, hardBreak: false,
        heading: { levels: [1, 2] },
      }),
      Placeholder.configure({ placeholder: placeholder || '' }),
    ],
    content: aDoc(valor),
    editorProps: {
      attributes: {
        class: 'texto-formato tf-editor',
        style: `min-height:${alto}px`,
        ...(etiqueta ? { 'aria-label': etiqueta } : {}),
        ...(id ? { id } : {}),
      },
    },
    onUpdate: ({ editor: e }) => {
      const t = aTexto(e.getJSON());
      if (t === ultimo.current) return;
      ultimo.current = t;
      cambiar.current(t);
    },
  });

  // Un cambio que viene de afuera (una plantilla, deshacer, recargar) se carga en el editor.
  useEffect(() => {
    if (!editor || valor === ultimo.current) return;
    ultimo.current = valor;
    editor.commands.setContent(aDoc(valor), { emitUpdate: false });
  }, [valor, editor]);
  useEffect(() => { editor?.setEditable(editable); }, [editable, editor]);

  if (!editable) {
    return (
      <div className="tf-caja tf-solo-lectura" style={{ minHeight: Math.min(alto, 60) }}>
        <TextoFormato texto={valor} vacio="Sin texto." />
      </div>
    );
  }

  return (
    <div className="tf-caja">
      {editor ? <Barra editor={editor} ia={conIA ? { vacio: !valor.trim(), abierta: iaAbierta, alternar: () => setIaAbierta(a => !a) } : undefined} />
        : <div className="tf-barra" style={{ height: 37 }} />}
      {editor && conIA && iaAbierta && ia && (
        <PanelIA texto={valor} ia={ia} onCerrar={() => setIaAbierta(false)}
          onUsar={t => {
            editor.commands.setContent(aDoc(t), { emitUpdate: true });
            setIaAbierta(false);
            setTimeout(() => editor.commands.focus('end'), 0);
          }} />
      )}
      {editor ? <EditorContent editor={editor} /> : (
        <div className="texto-formato tf-editor" style={{ minHeight: alto }}><TextoFormato texto={valor} vacio="" /></div>
      )}
    </div>
  );
}

function Barra({ editor, ia }: { editor: Editor; ia?: { vacio: boolean; abierta: boolean; alternar: () => void } }) {
  const e = useEditorState({
    editor,
    selector: ({ editor: x }) => ({
      bold: x.isActive('bold'), italic: x.isActive('italic'), underline: x.isActive('underline'), strike: x.isActive('strike'),
      h1: x.isActive('heading', { level: 1 }), h2: x.isActive('heading', { level: 2 }),
      ul: x.isActive('bulletList'), ol: x.isActive('orderedList'),
      deshacer: x.can().undo(), rehacer: x.can().redo(),
    }),
  });
  const b = (titulo: string, icono: React.ReactNode, activo: boolean, accion: () => void, deshabilitado = false) => (
    <button type="button" title={titulo} aria-label={titulo} aria-pressed={activo} disabled={deshabilitado}
      className={`tf-boton${activo ? ' activo' : ''}`}
      // Sin perder la selección del texto al tocar el botón.
      onMouseDown={ev => ev.preventDefault()} onClick={accion}>{icono}</button>
  );
  const c = () => editor.chain().focus();
  return (
    <div className="tf-barra" role="toolbar" aria-label="Formato del texto">
      {b('Negrita (Ctrl+B)', <Bold size={15} />, e.bold, () => c().toggleBold().run())}
      {b('Cursiva (Ctrl+I)', <Italic size={15} />, e.italic, () => c().toggleItalic().run())}
      {b('Subrayado (Ctrl+U)', <Underline size={15} />, e.underline, () => c().toggleUnderline().run())}
      {b('Tachado', <Strikethrough size={15} />, e.strike, () => c().toggleStrike().run())}
      <span className="tf-sep" />
      {b('Título', <Heading1 size={16} />, e.h1, () => c().toggleHeading({ level: 1 }).run())}
      {b('Subtítulo', <Heading2 size={16} />, e.h2, () => c().toggleHeading({ level: 2 }).run())}
      <span className="tf-sep" />
      {b('Viñetas', <List size={16} />, e.ul, () => c().toggleBulletList().run())}
      {b('Lista numerada', <ListOrdered size={16} />, e.ol, () => c().toggleOrderedList().run())}
      <span className="tf-sep" />
      {b('Deshacer (Ctrl+Z)', <Undo2 size={15} />, false, () => c().undo().run(), !e.deshacer)}
      {b('Rehacer (Ctrl+Y)', <Redo2 size={15} />, false, () => c().redo().run(), !e.rehacer)}
      {ia && (
        <button type="button" onMouseDown={ev => ev.preventDefault()} onClick={ia.alternar} aria-pressed={ia.abierta}
          title={ia.vacio ? 'La IA escribe una propuesta con lo que tiene la cotización' : 'La IA propone una versión mejor redactada; la revisas antes de usarla'}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid var(--y-brand)', borderRadius: 6,
            background: ia.abierta ? 'var(--y-soft)' : 'transparent', color: 'var(--text)', fontSize: '0.74rem', fontWeight: 600, padding: '0.2rem 0.55rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Sparkles size={13} color="var(--y)" /> {ia.vacio ? 'Escribir con IA' : 'Mejorar con IA'}
        </button>
      )}
    </div>
  );
}

const SUGERENCIAS = ['Más corto', 'Más detallado', 'Más formal', 'Más cercano', 'Más técnico', 'Con viñetas'];

/** Pide a la IA una versión del texto y la muestra para revisarla antes de usarla. */
function PanelIA({ texto, ia, onUsar, onCerrar }: { texto: string; ia: IAEditor; onUsar: (t: string) => void; onCerrar: () => void }) {
  const [instruccion, setInstruccion] = useState('');
  const [cargando, setCargando] = useState(false);
  const [propuesta, setPropuesta] = useState<{ texto: string; cambios: string } | null>(null);
  const [error, setError] = useState('');
  const pedir = async (otra = false) => {
    setCargando(true); setError('');
    try {
      const res = await fetchConSesion('/api/mejorar-texto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, tipo: ia.tipo, contexto: ia.contexto?.() || '', instruccion: instruccion.trim(), anterior: otra ? propuesta?.texto : undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'No se pudo hablar con la IA.');
      setPropuesta({ texto: data.texto, cambios: data.cambios || '' });
    } catch (e) { setError(e instanceof Error ? e.message : 'Error de conexión'); }
    finally { setCargando(false); }
  };
  return (
    <div style={{ borderBottom: '1px solid var(--border2)', background: 'var(--bg3)', padding: '0.6rem 0.7rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!propuesta ? (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="input" value={instruccion} onChange={e => setInstruccion(e.target.value)} disabled={cargando}
              placeholder={texto.trim() ? 'Indicación opcional: más corto, más técnico, menciona la garantía…' : 'Qué quieres que diga (opcional)'}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); pedir(); } }}
              style={{ flex: '1 1 220px', minWidth: 0, fontSize: '0.84rem', padding: '0.35rem 0.6rem' }} />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => pedir()} disabled={cargando}>
              {cargando ? <Loader2 size={13} className="iv-spin" /> : <Sparkles size={13} />} {texto.trim() ? 'Mejorar' : 'Escribir'}</button>
            <button type="button" className="btn btn-ghost btn-xs" onClick={onCerrar} aria-label="Cerrar"><X size={13} /></button>
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {SUGERENCIAS.map(x => (
              <button key={x} type="button" disabled={cargando} onClick={() => setInstruccion(i => (i.trim() ? `${i.trim()}, ${x.toLowerCase()}` : x))}
                style={{ cursor: 'pointer', fontSize: '0.72rem', padding: '0.15rem 0.55rem', borderRadius: 999, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--muted)' }}>{x}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <span style={{ fontSize: '0.74rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Sparkles size={12} color="var(--y)" /> Propuesta de la IA{propuesta.cambios ? ` · ${propuesta.cambios}` : ''}</span>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--y-brand)', borderRadius: 8, padding: '0.6rem 0.75rem', maxHeight: 320, overflowY: 'auto' }}>
            <TextoFormato texto={propuesta.texto} style={{ fontSize: '0.88rem' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCerrar}><X size={13} /> Descartar</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => pedir(true)} disabled={cargando}>
              {cargando ? <Loader2 size={13} className="iv-spin" /> : <RotateCcw size={13} />} Otra versión</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onUsar(propuesta.texto)} disabled={cargando}><Check size={13} /> Usar este texto</button>
          </div>
        </>
      )}
      {error && <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}
