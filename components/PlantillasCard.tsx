'use client';

/** Administrar plantillas de textos por tipo de servicio (Configuración). */

import { useEffect, useState, useCallback } from 'react';
import { LayoutTemplate, Plus, Trash2, Save, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { plantillasService } from '@/services/plantillas';
import { useToast } from '@/hooks/useToast';
import type { PlantillaCotizacion } from '@/types';
import { TIPO_SERVICIO_OPCIONES } from '@/types/solicitud';

const ta: React.CSSProperties = { width: '100%', resize: 'vertical', fontSize: '0.8rem', lineHeight: 1.5 };

export default function PlantillasCard() {
  const { success, error: toastError } = useToast();
  const [lista, setLista] = useState<PlantillaCotizacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinTabla, setSinTabla] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [edit, setEdit] = useState<PlantillaCotizacion | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setLista(await plantillasService.getAll()); setSinTabla(false); }
    catch { setSinTabla(true); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const abrir = (p: PlantillaCotizacion) => {
    if (abierta === p.id) { setAbierta(null); setEdit(null); return; }
    setAbierta(p.id); setEdit({ ...p });
  };

  const nueva = async () => {
    try {
      const p = await plantillasService.create({ nombre: 'Nueva plantilla', tipo_servicio: null, descripcion: '', garantia: '', condiciones: '' });
      setLista(l => [...l, p]);
      setAbierta(p.id); setEdit({ ...p });
    } catch { toastError('No se pudo crear la plantilla'); }
  };

  const guardar = async () => {
    if (!edit) return;
    if (!edit.nombre.trim()) { toastError('La plantilla necesita un nombre'); return; }
    setGuardando(true);
    try {
      await plantillasService.update(edit.id, {
        nombre: edit.nombre.trim(), tipo_servicio: edit.tipo_servicio || null,
        descripcion: edit.descripcion, garantia: edit.garantia, condiciones: edit.condiciones,
      });
      setLista(l => l.map(x => (x.id === edit.id ? edit : x)));
      success('Plantilla guardada');
    } catch { toastError('No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  const eliminar = async (p: PlantillaCotizacion) => {
    if (!confirm(`¿Eliminar la plantilla "${p.nombre}"?`)) return;
    try {
      await plantillasService.delete(p.id);
      setLista(l => l.filter(x => x.id !== p.id));
      if (abierta === p.id) { setAbierta(null); setEdit(null); }
      success('Plantilla eliminada');
    } catch { toastError('No se pudo eliminar'); }
  };

  const set = (k: keyof PlantillaCotizacion) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setEdit(p => (p ? { ...p, [k]: e.target.value } : p));

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', padding: '1.5rem', gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', gap: '0.5rem', flexWrap: 'wrap' }}>
        <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.78rem', color: 'var(--y)', margin: 0 }}>
          <LayoutTemplate size={13} /> Plantillas por tipo de servicio
        </p>
        {!sinTabla && <button onClick={nueva} className="btn btn-ghost btn-sm"><Plus size={13} /> Nueva plantilla</button>}
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '1rem' }}>
        Textos listos de descripción, garantía y condiciones. En el cotizador: <b>Descripción y condiciones → Usar una plantilla</b>.
      </p>

      {cargando && <Loader2 size={18} className="iv-spin" style={{ color: 'var(--y)' }} />}
      {sinTabla && <p style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>Ejecuta <code>supabase_mejoras_comerciales.sql</code> en Supabase para habilitar las plantillas.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {lista.map(p => (
          <div key={p.id} style={{ border: '1px solid var(--border2)', borderRadius: 'var(--r)', background: 'var(--bg3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.8rem', cursor: 'pointer' }} onClick={() => abrir(p)}>
              <span style={{ flex: 1, fontWeight: 600, color: 'var(--text)', fontSize: '0.86rem' }}>{p.nombre}</span>
              {p.tipo_servicio && <span style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>{TIPO_SERVICIO_OPCIONES.find(t => t.key === p.tipo_servicio)?.label || p.tipo_servicio}</span>}
              {abierta === p.id ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
            </div>
            {abierta === p.id && edit && (
              <div style={{ padding: '0 0.8rem 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.6rem' }}>
                  <div>
                    <label className="label-muted" style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.55rem' }}>Nombre</label>
                    <input className="input input-sm" value={edit.nombre} onChange={set('nombre')} />
                  </div>
                  <div>
                    <label className="label-muted" style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.55rem' }}>Tipo de servicio</label>
                    <select className="input input-sm" value={edit.tipo_servicio || ''} onChange={set('tipo_servicio')}>
                      <option value="">— General —</option>
                      {TIPO_SERVICIO_OPCIONES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                {(['descripcion', 'garantia', 'condiciones'] as const).map(k => (
                  <div key={k}>
                    <label className="label-muted" style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.55rem' }}>
                      {k === 'descripcion' ? 'Descripción del trabajo' : k === 'garantia' ? 'Garantía' : 'Condiciones comerciales'}
                    </label>
                    <textarea className="input" rows={4} value={edit[k] || ''} onChange={set(k)} style={ta} />
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <button onClick={() => eliminar(p)} className="btn btn-danger btn-sm"><Trash2 size={12} /> Eliminar</button>
                  <button onClick={guardar} disabled={guardando} className="btn btn-primary btn-sm">
                    {guardando ? <Loader2 size={12} className="iv-spin" /> : <Save size={12} />} Guardar plantilla
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
