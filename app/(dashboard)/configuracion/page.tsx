'use client';

import { useState, useEffect } from 'react';
import { Settings, Save, Loader2, Building2, Percent, Hash } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/useToast';
import { INNVOLT_INFO } from '@/types';

interface Config {
  nombre: string;
  rut: string;
  giro: string;
  direccion: string;
  telefono: string;
  email: string;
  web: string;
  iva_porcentaje: number;
  moneda: string;
  proximo_folio: number;
  condiciones_default: string;
  garantia_default: string;
}

const DEFAULTS: Config = {
  nombre: INNVOLT_INFO.nombre,
  rut: INNVOLT_INFO.rut,
  giro: INNVOLT_INFO.giro,
  direccion: INNVOLT_INFO.direccion,
  telefono: INNVOLT_INFO.telefono,
  email: INNVOLT_INFO.email,
  web: INNVOLT_INFO.web || '',
  iva_porcentaje: 19,
  moneda: 'CLP',
  proximo_folio: 1,
  condiciones_default: '• Validez de la oferta: 15 días corridos.\n• Forma de Pago: 50% anticipo al inicio y 50% al finalizar.\n• Medios de pago: Transferencia electrónica o efectivo.',
  garantia_default: '• Garantía: 6 meses sobre la mano de obra instalada.\n• La garantía no cubre fallas por mal uso o intervención de terceros.',
};

export default function ConfiguracionPage() {
  const { success, error: toastError } = useToast();
  const [config, setConfig] = useState<Config>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    const { data } = await supabase.from('configuracion_empresa').select('*').limit(1).single();
    if (data) {
      setConfig({
        nombre: data.nombre || DEFAULTS.nombre,
        rut: data.rut || DEFAULTS.rut,
        giro: data.giro || DEFAULTS.giro,
        direccion: data.direccion || DEFAULTS.direccion,
        telefono: data.telefono || DEFAULTS.telefono,
        email: data.email || DEFAULTS.email,
        web: data.web || DEFAULTS.web,
        iva_porcentaje: data.iva_porcentaje ?? 19,
        moneda: data.moneda || 'CLP',
        proximo_folio: data.proximo_folio ?? 1,
        condiciones_default: data.condiciones_default || DEFAULTS.condiciones_default,
        garantia_default: data.garantia_default || DEFAULTS.garantia_default,
      });
    }
    setLoading(false);
  }

  const set = (k: keyof Config) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const val = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
    setConfig(p => ({ ...p, [k]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: existing } = await supabase.from('configuracion_empresa').select('id').limit(1).single();
      if (existing) {
        await supabase.from('configuracion_empresa').update({ ...config, updated_at: new Date().toISOString() }).eq('id', existing.id);
      } else {
        await supabase.from('configuracion_empresa').insert([config]);
      }
      success('Configuración guardada correctamente');
    } catch (e: unknown) {
      toastError('Error al guardar: ' + (e instanceof Error ? e.message : 'Error'));
    } finally {
      setSaving(false);
    }
  };

  const sectionLabel: React.CSSProperties = {
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.58rem',
    letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--y)',
    display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem',
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh' }}>
        <Loader2 size={24} color="var(--y)" className="iv-spin" />
      </div>
    );
  }

  return (
    <div className="anim-in">
      <div className="iv-page-header">
        <div>
          <p className="label-muted" style={{ marginBottom: '0.35rem', letterSpacing: '0.4em' }}>Preferencias del sistema</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(2rem,5vw,3.2rem)', textTransform: 'uppercase', lineHeight: 0.9, color: '#fff' }}>
            CONFI<span style={{ color: 'var(--y)' }}>GURACIÓN</span>
          </h1>
        </div>
        <div className="iv-header-actions">
          <button onClick={handleSave} disabled={saving} style={{ background: 'var(--y)', color: '#000', border: 'none', cursor: 'pointer', padding: '0 1.25rem', height: 36, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', opacity: saving ? 0.5 : 1 }}>
            {saving ? <Loader2 size={13} className="iv-spin" /> : <Save size={13} />}
            Guardar cambios
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2px' }}>

        {/* Datos empresa */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderTop: '2px solid var(--y)', padding: '1.5rem' }}>
          <p style={sectionLabel}><Building2 size={13} /> Datos de la empresa</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {[
              { label: 'Razón social', key: 'nombre', placeholder: 'InnVolt SpA' },
              { label: 'RUT', key: 'rut', placeholder: '78.299.986-9' },
              { label: 'Giro', key: 'giro', placeholder: 'Servicios Eléctricos' },
              { label: 'Dirección', key: 'direccion', placeholder: 'Santiago, Chile' },
              { label: 'Teléfono', key: 'telefono', placeholder: '+56 9 XXXX XXXX' },
              { label: 'Email', key: 'email', placeholder: 'contacto@empresa.cl' },
              { label: 'Sitio web', key: 'web', placeholder: 'www.empresa.cl' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.55rem' }}>{label}</label>
                <input
                  className="input input-sm"
                  value={(config as unknown as Record<string, string>)[key] || ''}
                  onChange={set(key as keyof Config)}
                  placeholder={placeholder}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Config fiscal */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderTop: '2px solid var(--y)', padding: '1.5rem' }}>
            <p style={sectionLabel}><Percent size={13} /> Configuración fiscal</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.55rem' }}>IVA (%)</label>
                <input type="number" min="0" max="99" step="1" className="input input-sm" value={config.iva_porcentaje} onChange={set('iva_porcentaje')} />
              </div>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.55rem' }}>Moneda</label>
                <select className="input input-sm" value={config.moneda} onChange={set('moneda')}>
                  <option value="CLP">CLP — Peso Chileno</option>
                  <option value="USD">USD — Dólar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="UF">UF — Unidad de Fomento</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', padding: '1.5rem' }}>
            <p style={sectionLabel}><Hash size={13} /> Numeración de folios</p>
            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.55rem' }}>Próximo folio</label>
              <input type="number" min="1" step="1" className="input input-sm" value={config.proximo_folio} onChange={set('proximo_folio')} />
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.4rem' }}>
                La siguiente cotización será <strong style={{ color: 'var(--y)' }}>IV-{String(config.proximo_folio).padStart(4, '0')}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Textos por defecto */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', padding: '1.5rem', gridColumn: '1 / -1' }}>
          <p style={sectionLabel}><Settings size={13} /> Textos por defecto</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.55rem' }}>Condiciones comerciales por defecto</label>
              <textarea className="input" value={config.condiciones_default} onChange={set('condiciones_default')} rows={5} style={{ resize: 'vertical', fontSize: '0.82rem', lineHeight: 1.6 }} />
            </div>
            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.55rem' }}>Garantía por defecto</label>
              <textarea className="input" value={config.garantia_default} onChange={set('garantia_default')} rows={5} style={{ resize: 'vertical', fontSize: '0.82rem', lineHeight: 1.6 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
