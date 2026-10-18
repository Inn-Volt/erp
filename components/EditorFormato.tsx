'use client';

/**
 * Campo de texto con formato (como el de TecApp): barra con negrita, cursiva, subrayado,
 * tachado, título, subtítulo, viñetas, numeradas y deshacer. Se escribe como en un
 * procesador de texto y se guarda como texto con marcas simples (lib/textoFormato), que leen
 * el PDF y el enlace del cliente. Sin permiso para editar, muestra el texto con su formato.
 */

import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { Bold, Heading1, Heading2, Italic, List, ListOrdered, Redo2, Strikethrough, Underline, Undo2 } from 'lucide-react';
import { aDoc, aTexto } from '@/lib/textoFormato';
import TextoFormato from './TextoFormato';

export default function EditorFormato({ valor, onCambiar, editable = true, placeholder, alto = 110, etiqueta, id }: {
  valor: string;
  onCambiar: (texto: string) => void;
  editable?: boolean;
  placeholder?: string;
  /** Alto mínimo del área de escritura, en px. */
  alto?: number;
  /** Nombre del campo para el lector de pantalla. */
  etiqueta?: string;
  id?: string;
}) {
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
      {editor ? <Barra editor={editor} /> : <div className="tf-barra" style={{ height: 37 }} />}
      {editor ? <EditorContent editor={editor} /> : (
        <div className="texto-formato tf-editor" style={{ minHeight: alto }}><TextoFormato texto={valor} vacio="" /></div>
      )}
    </div>
  );
}

function Barra({ editor }: { editor: Editor }) {
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
    </div>
  );
}
