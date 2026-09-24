'use client';

/**
 * Fotos del levantamiento: tomar con la cámara del celular o subir desde la
 * galería, ponerles una leyenda y eliminarlas. Se comprimen antes de subir y la
 * lista se guarda automáticamente en el levantamiento (no se pierden fotos
 * aunque no se pulse "Guardar").
 */

import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, Loader2 } from 'lucide-react';
import { fotosService, type FotoLevantamiento } from '@/services/fotos';
import { useToast } from '@/hooks/useToast';

export default function FotosLevantamiento({ fotos, asegurarId, onChange }: {
  fotos: FotoLevantamiento[];
  /** Devuelve el id del levantamiento, guardándolo primero si es nuevo. */
  asegurarId: () => Promise<string | null>;
  /** Persiste la nueva lista de fotos. */
  onChange: (fotos: FotoLevantamiento[]) => Promise<void> | void;
}) {
  const { error: toastError, success } = useToast();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [subiendo, setSubiendo] = useState(0);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  // Links firmados para las miniaturas (solo de las fotos que aún no tienen).
  useEffect(() => {
    const faltan = fotos.map(f => f.path).filter(p => !urls[p]);
    if (!faltan.length) return;
    fotosService.urls(faltan).then(m => setUrls(u => ({ ...u, ...m })));
  }, [fotos, urls]);

  const subir = async (files: FileList | null) => {
    if (!files?.length) return;
    const id = await asegurarId();
    if (!id) return;
    let lista = [...fotos];
    setSubiendo(files.length);
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        const path = await fotosService.subir(id, f);
        lista = [...lista, { path, caption: '' }];
        await onChange(lista);
        ok++;
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'No se pudo subir una foto');
      } finally {
        setSubiendo(n => n - 1);
      }
    }
    if (ok) success(`${ok} foto${ok > 1 ? 's' : ''} agregada${ok > 1 ? 's' : ''}`);
    if (camRef.current) camRef.current.value = '';
    if (galRef.current) galRef.current.value = '';
  };

  const eliminar = async (path: string) => {
    if (!confirm('¿Eliminar esta foto?')) return;
    await fotosService.eliminar(path);
    await onChange(fotos.filter(f => f.path !== path));
  };

  const guardarCaption = (path: string) => {
    const nueva = captions[path];
    if (nueva === undefined) return;
    const actual = fotos.find(f => f.path === path)?.caption || '';
    if (nueva === actual) return;
    onChange(fotos.map(f => (f.path === path ? { ...f, caption: nueva } : f)));
  };

  const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" style={{ ...btn, background: 'var(--y-brand)', color: 'var(--on-accent)', borderColor: 'transparent' }} onClick={() => camRef.current?.click()}>
          <Camera size={16} /> Tomar foto
        </button>
        <button type="button" style={btn} onClick={() => galRef.current?.click()}>
          <ImagePlus size={16} /> Subir desde galería
        </button>
        {subiendo > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: '0.8rem' }}><Loader2 size={14} className="iv-spin" /> Subiendo {subiendo}…</span>}
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={e => subir(e.target.files)} />
        <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={e => subir(e.target.files)} />
      </div>

      {fotos.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          Sin fotos. Registra tableros, canalizaciones y puntos críticos: las fotos pueden ir en el PDF del levantamiento y de la cotización.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {fotos.map((f, i) => (
            <div key={f.path} style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--bg3)' }}>
                {urls[f.path]
                  ? <img src={urls[f.path]} alt={f.caption || `Foto ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <Loader2 size={16} className="iv-spin" style={{ position: 'absolute', inset: 0, margin: 'auto', color: 'var(--muted)' }} />}
                <button type="button" onClick={() => eliminar(f.path)} title="Eliminar foto"
                  style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                value={captions[f.path] ?? f.caption}
                onChange={e => setCaptions(c => ({ ...c, [f.path]: e.target.value }))}
                onBlur={() => guardarCaption(f.path)}
                placeholder={`${i + 1}. Descripción (ej: tablero general)`}
                style={{ width: '100%', border: 'none', borderTop: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', padding: '8px 10px', fontSize: '0.8rem', outline: 'none' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
