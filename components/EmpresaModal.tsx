/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/**
 * EmpresaModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal para crear / editar una empresa emisora.
 * - Sube el logo a Supabase Storage (bucket: "logos")
 * - Guarda / actualiza en la tabla `empresas` de Supabase
 * - Devuelve el objeto EmpresaInfo actualizado vía onSave
 *
 * Tabla requerida en Supabase:
 * ┌──────────────────┬──────────┬──────────────────────────────┐
 * │ columna          │ tipo     │ notas                        │
 * ├──────────────────┼──────────┼──────────────────────────────┤
 * │ id               │ uuid PK  │ gen_random_uuid()            │
 * │ nombre           │ text     │ NOT NULL                     │
 * │ slogan           │ text     │                              │
 * │ rut              │ text     │                              │
 * │ giro             │ text     │                              │
 * │ email            │ text     │                              │
 * │ telefono         │ text     │                              │
 * │ direccion        │ text     │                              │
 * │ website          │ text     │                              │
 * │ logo_url         │ text     │ URL pública Storage          │
 * │ banco            │ text     │                              │
 * │ tipo_cuenta      │ text     │                              │
 * │ cuenta_bancaria  │ text     │                              │
 * │ texto_importante │ text     │                              │
 * │ created_at       │ timestamptz│ now()                      │
 * └──────────────────┴──────────┴──────────────────────────────┘
 *
 * Bucket Storage: "logos" (público)
 */

import { useState, useRef, useCallback } from 'react';
import { X, Upload, Building2, CreditCard, FileText, Loader2, Check, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';

// ─── Estilos ─────────────────────────────────────────────────────────────────
const panelStyle: React.CSSProperties = {
  background: 'var(--bg2)',
  border: '1px solid var(--border2)',
  borderTop: '2px solid var(--y-brand)',
  padding: '1rem',
  borderRadius: 'var(--r)',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: '0.58rem',
  letterSpacing: '0.3em',
  textTransform: 'uppercase' as const,
  color: 'var(--y)',
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  marginBottom: '0.75rem',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  color: 'var(--text)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.82rem',
  padding: '0.45rem 0.6rem',
  outline: 'none',
  width: '100%',
  borderRadius: 'var(--r)',
};

const fieldLabel: React.CSSProperties = {
  fontSize: '0.68rem',
  color: 'var(--muted)',
  marginBottom: '0.2rem',
  display: 'block',
  fontFamily: 'var(--font-display)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
};

const gridTwo: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '0.6rem',
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  empresa?: EmpresaInfo | null;      // null = crear nueva
  onSave: (empresa: EmpresaInfo) => void;
  onClose: () => void;
}

const EMPTY: EmpresaInfo = {
  nombre: '',
  slogan: '',
  rut: '',
  giro: '',
  email: '',
  telefono: '',
  direccion: '',
  website: '',
  logo_url: '',
  banco: '',
  tipo_cuenta: '',
  cuenta_bancaria: '',
  texto_importante: '',
};

// ─── Componente ───────────────────────────────────────────────────────────────
export default function EmpresaModal({ empresa, onSave, onClose }: Props) {
  const [form, setForm] = useState<EmpresaInfo>(empresa ? { ...empresa } : { ...EMPTY });
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string>(empresa?.logo_url || '');
  const [error, setError]         = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const set = useCallback((k: keyof EmpresaInfo, v: string) => {
    setForm(prev => ({ ...prev, [k]: v }));
  }, []);

  // ── Upload logo a Supabase Storage ──────────────────────────────────────────
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Solo se aceptan imágenes (PNG, JPG, SVG, WEBP)'); return; }
    if (file.size > 2 * 1024 * 1024)    { setError('El logo no puede superar 2 MB'); return; }

    setUploading(true);
    setError('');

    // Preview local inmediato
    const reader = new FileReader();
    reader.onload = ev => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const ext      = file.name.split('.').pop();
      const fileName = `logo_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('logos')
        .upload(fileName, file, { upsert: true, contentType: file.type });

      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from('logos')
        .getPublicUrl(fileName);

      set('logo_url', urlData.publicUrl);
    } catch (err: any) {
      setError(`Error al subir logo: ${err.message || 'Error desconocido'}`);
      setLogoPreview(form.logo_url || '');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeLogo = () => {
    setLogoPreview('');
    set('logo_url', '');
  };

  // ── Guardar empresa en Supabase ─────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre de la empresa es obligatorio'); return; }
    if (!form.rut.trim())    { setError('El RUT es obligatorio'); return; }
    setError('');
    setSaving(true);

    try {
      const payload = {
        nombre:           form.nombre.trim(),
        slogan:           form.slogan?.trim() || null,
        rut:              form.rut.trim(),
        giro:             form.giro?.trim() || null,
        email:            form.email.trim(),
        telefono:         form.telefono.trim(),
        direccion:        form.direccion?.trim() || null,
        website:          form.website?.trim() || null,
        logo_url:         form.logo_url || null,
        banco:            form.banco?.trim() || null,
        tipo_cuenta:      form.tipo_cuenta?.trim() || null,
        cuenta_bancaria:  form.cuenta_bancaria?.trim() || null,
        texto_importante: form.texto_importante?.trim() || null,
      };

      let result;
      if (form.id) {
        const { data, error: e } = await supabase
          .from('empresas')
          .update(payload)
          .eq('id', form.id)
          .select()
          .single();
        if (e) throw e;
        result = data;
      } else {
        const { data, error: e } = await supabase
          .from('empresas')
          .insert(payload)
          .select()
          .single();
        if (e) throw e;
        result = data;
      }

      onSave({ ...result });
    } catch (err: any) {
      setError(`Error al guardar: ${err.message || 'Error desconocido'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ zIndex: 200 }}
    >
      <div
        className="modal-box"
        style={{
          maxWidth: 620, width: '95%', maxHeight: '92vh',
          overflowY: 'auto', margin: '0 auto',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.1rem 1.5rem',
          borderBottom: '1px solid var(--border2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: 'var(--bg2)', zIndex: 10,
        }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>
            <Building2 size={13} />
            {form.id ? 'Editar Empresa' : 'Nueva Empresa Emisora'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* ── LOGO ── */}
          <div style={panelStyle}>
            <p style={labelStyle}><Upload size={12} /> Logo de la empresa</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              {/* Preview */}
              <div style={{
                width: 140, height: 60, border: '1px dashed var(--border2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--input-bg)', borderRadius: 'var(--r)', overflow: 'hidden', flexShrink: 0,
              }}>
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logo"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <span style={{ fontSize: '0.65rem', color: 'var(--muted)', textAlign: 'center', padding: '0.5rem' }}>
                    Sin logo
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleLogoUpload}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  style={{
                    background: 'var(--bg3)', border: '1px solid var(--border2)',
                    color: uploading ? 'var(--muted)' : 'var(--text)',
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    padding: '0.4rem 0.8rem', fontSize: '0.75rem',
                    fontFamily: 'var(--font-display)', fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    borderRadius: 'var(--r)',
                  }}
                >
                  {uploading
                    ? <><Loader2 size={12} className="iv-spin" /> Subiendo...</>
                    : <><Upload size={12} /> Subir Logo</>
                  }
                </button>

                {logoPreview && (
                  <button
                    onClick={removeLogo}
                    style={{
                      background: 'none', border: '1px solid rgba(248,113,113,0.3)',
                      color: 'var(--danger)', cursor: 'pointer',
                      padding: '0.4rem 0.8rem', fontSize: '0.7rem',
                      fontFamily: 'var(--font-display)', fontWeight: 700,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      display: 'flex', alignItems: 'center', gap: '0.4rem',
                      borderRadius: 'var(--r)',
                    }}
                  >
                    <Trash2 size={11} /> Quitar Logo
                  </button>
                )}

                <p style={{ fontSize: '0.65rem', color: 'var(--muted)', margin: 0 }}>
                  PNG, JPG, SVG — máx. 2 MB
                </p>
              </div>
            </div>
          </div>

          {/* ── DATOS PRINCIPALES ── */}
          <div style={panelStyle}>
            <p style={labelStyle}><Building2 size={12} /> Datos de la empresa</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div>
                <span style={fieldLabel}>Nombre / Razón Social *</span>
                <input
                  style={inputStyle}
                  value={form.nombre}
                  onChange={e => set('nombre', e.target.value)}
                  placeholder="InnVolt SpA"
                />
              </div>
              <div>
                <span style={fieldLabel}>Slogan / Subtítulo</span>
                <input
                  style={inputStyle}
                  value={form.slogan || ''}
                  onChange={e => set('slogan', e.target.value)}
                  placeholder="Servicios eléctricos y tecnológicos"
                />
              </div>
              <div style={gridTwo}>
                <div>
                  <span style={fieldLabel}>RUT *</span>
                  <input
                    style={inputStyle}
                    value={form.rut}
                    onChange={e => set('rut', e.target.value)}
                    placeholder="78.299.986-9"
                  />
                </div>
                <div>
                  <span style={fieldLabel}>Giro</span>
                  <input
                    style={inputStyle}
                    value={form.giro || ''}
                    onChange={e => set('giro', e.target.value)}
                    placeholder="Ingeniería eléctrica"
                  />
                </div>
              </div>
              <div style={gridTwo}>
                <div>
                  <span style={fieldLabel}>Correo</span>
                  <input
                    style={inputStyle}
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="inn-volt@outlook.cl"
                  />
                </div>
                <div>
                  <span style={fieldLabel}>Teléfono</span>
                  <input
                    style={inputStyle}
                    value={form.telefono}
                    onChange={e => set('telefono', e.target.value)}
                    placeholder="+56 9 8920 3902"
                  />
                </div>
              </div>
              <div>
                <span style={fieldLabel}>Dirección</span>
                <input
                  style={inputStyle}
                  value={form.direccion || ''}
                  onChange={e => set('direccion', e.target.value)}
                  placeholder="Santiago, Chile"
                />
              </div>
              <div>
                <span style={fieldLabel}>Sitio Web</span>
                <input
                  style={inputStyle}
                  value={form.website || ''}
                  onChange={e => set('website', e.target.value)}
                  placeholder="www.innvolt.cl"
                />
              </div>
            </div>
          </div>

          {/* ── DATOS BANCARIOS ── */}
          <div style={panelStyle}>
            <p style={labelStyle}><CreditCard size={12} /> Datos bancarios</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={gridTwo}>
                <div>
                  <span style={fieldLabel}>Banco</span>
                  <input
                    style={inputStyle}
                    value={form.banco || ''}
                    onChange={e => set('banco', e.target.value)}
                    placeholder="Santander / BCI / BancoEstado..."
                  />
                </div>
                <div>
                  <span style={fieldLabel}>Tipo de cuenta</span>
                  <input
                    style={inputStyle}
                    value={form.tipo_cuenta || ''}
                    onChange={e => set('tipo_cuenta', e.target.value)}
                    placeholder="Corriente / Vista / Ahorro"
                  />
                </div>
              </div>
              <div>
                <span style={fieldLabel}>Número de cuenta</span>
                <input
                  style={inputStyle}
                  value={form.cuenta_bancaria || ''}
                  onChange={e => set('cuenta_bancaria', e.target.value)}
                  placeholder="1234567890"
                />
              </div>
            </div>
          </div>

          {/* ── TEXTO IMPORTANTE (personalizable) ── */}
          <div style={panelStyle}>
            <p style={labelStyle}><FileText size={12} /> Texto &quot;Importante&quot; del PDF</p>
            <textarea
              style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.5 }}
              rows={3}
              value={form.texto_importante || ''}
              onChange={e => set('texto_importante', e.target.value)}
              placeholder={`Todos los gastos o valores extraordinarios por factores externos a ${form.nombre || 'la empresa'} serán de total responsabilidad de quien contrate los servicios...`}
            />
            <p style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: '0.3rem' }}>
              Déjalo vacío para usar el texto por defecto.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)',
              padding: '0.6rem 0.8rem', borderRadius: 'var(--r)',
            }}>
              <p style={{ color: 'var(--danger)', fontSize: '0.78rem', margin: 0 }}>{error}</p>
            </div>
          )}

          {/* Botones */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
            <button
              onClick={onClose}
              style={{
                background: 'var(--bg3)', border: '1px solid var(--border2)',
                color: 'var(--muted)', cursor: 'pointer',
                padding: '0 1.2rem', height: 40, borderRadius: 'var(--r)',
                fontFamily: 'var(--font-display)', fontWeight: 700,
                fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || uploading}
              style={{
                background: 'var(--y-brand)', color: 'var(--on-accent)', border: 'none',
                cursor: (saving || uploading) ? 'not-allowed' : 'pointer',
                padding: '0 1.5rem', height: 40, borderRadius: 'var(--r)',
                fontFamily: 'var(--font-display)', fontWeight: 900,
                fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                opacity: (saving || uploading) ? 0.6 : 1,
              }}
            >
              {saving
                ? <><Loader2 size={13} className="iv-spin" /> Guardando...</>
                : <><Check size={13} /> {form.id ? 'Actualizar' : 'Crear Empresa'}</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
