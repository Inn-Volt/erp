'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Save, Printer, ArrowLeft, AlertTriangle, CheckCircle, Camera } from 'lucide-react';
import { levantamientosService } from '@/services/levantamientos';
import { clientesService } from '@/services/clientes';
import type { Cliente } from '@/types';
import type { TableroRow, CircuitoRow, LevantamientoData } from '@/types/levantamiento';
import {
  emptyLevantamiento, CHECKLIST_CRITICO, TIPOS_PROYECTO, TIPOS_EMPALME,
  ESTADOS_GEN, TIPOS_TABLERO, TIPOS_CABLE, TIPOS_CANAL, TIPOS_LUM, SISTEMAS_ELEC,
} from '@/types/levantamiento';
import { newId } from '@/utils';

// ─── Micro-components aligned to InnVolt design system ───────────────────────

const FieldLabel = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <p className="label-muted" style={{ marginBottom: 5, fontSize: '0.55rem', letterSpacing: '0.3em' }}>
    {children}{required && <span style={{ color: 'var(--y)', marginLeft: 3 }}>★</span>}
  </p>
);

const IVInput = ({
  label, required, fullWidth, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; required?: boolean; fullWidth?: boolean }) => (
  <div style={{ marginBottom: 14, ...(fullWidth ? { gridColumn: '1/-1' } : {}) }}>
    {label && <FieldLabel required={required}>{label}</FieldLabel>}
    <input
      {...props}
      style={{
        width: '100%', background: 'var(--bg2)', border: '1px solid var(--border2)',
        color: 'var(--text)', padding: '9px 12px', fontSize: '0.82rem',
        fontFamily: 'var(--font-body)', outline: 'none',
        transition: 'border-color .15s', ...props.style,
      }}
      onFocus={e => (e.target.style.borderColor = 'var(--y)')}
      onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.06)')}
    />
  </div>
);

const IVTextarea = ({
  label, required, rows = 3, fullWidth, ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; required?: boolean; fullWidth?: boolean }) => (
  <div style={{ marginBottom: 14, ...(fullWidth ? { gridColumn: '1/-1' } : {}) }}>
    {label && <FieldLabel required={required}>{label}</FieldLabel>}
    <textarea
      rows={rows}
      {...props}
      style={{
        width: '100%', background: 'var(--bg2)', border: '1px solid var(--border2)',
        color: 'var(--text)', padding: '9px 12px', fontSize: '0.82rem',
        fontFamily: 'var(--font-body)', outline: 'none', resize: 'vertical',
        transition: 'border-color .15s',
      }}
      onFocus={e => (e.target.style.borderColor = 'var(--y)')}
      onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.06)')}
    />
  </div>
);

const IVSelect = ({
  label, required, options = [], fullWidth, ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; required?: boolean; options?: string[]; fullWidth?: boolean }) => (
  <div style={{ marginBottom: 14, ...(fullWidth ? { gridColumn: '1/-1' } : {}) }}>
    {label && <FieldLabel required={required}>{label}</FieldLabel>}
    <div style={{ position: 'relative' }}>
      <select
        {...props}
        style={{
          width: '100%', background: 'var(--bg2)', border: '1px solid var(--border2)',
          color: props.value ? 'var(--text)' : 'var(--muted)',
          padding: '9px 32px 9px 12px', fontSize: '0.82rem',
          fontFamily: 'var(--font-body)', outline: 'none', appearance: 'none',
          transition: 'border-color .15s', cursor: 'pointer',
        }}
        onFocus={e => (e.target.style.borderColor = 'var(--y)')}
        onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.06)')}
      >
        <option value="">— Seleccionar —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none', fontSize: '0.6rem' }}>▼</span>
    </div>
  </div>
);

const IVToggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: 'pointer' }}
    onClick={() => onChange(!checked)}>
    <div style={{
      width: 40, height: 22, background: checked ? 'var(--y)' : 'var(--bg3)',
      border: `1px solid ${checked ? 'var(--y)' : 'var(--border2)'}`,
      position: 'relative', transition: 'all .2s', flexShrink: 0, cursor: 'pointer',
    }}>
      <div style={{
        position: 'absolute', top: 2, left: checked ? 20 : 2,
        width: 16, height: 16, background: checked ? '#000' : 'var(--dim)',
        transition: 'left .2s',
      }} />
    </div>
    <span style={{ fontSize: '0.8rem', color: checked ? 'var(--y)' : 'var(--muted)', userSelect: 'none' }}>{label}</span>
  </div>
);

const IVRadioGroup = ({ label, options, value, onChange }: {
  label?: string; options: string[]; value: string; onChange: (v: string) => void;
}) => (
  <div style={{ marginBottom: 14 }}>
    {label && <FieldLabel>{label}</FieldLabel>}
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)} style={{
          padding: '5px 14px', fontSize: '0.72rem',
          fontFamily: 'var(--font-display)', fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          border: `1px solid ${value === o ? 'var(--y)' : 'var(--border2)'}`,
          background: value === o ? 'rgba(255,198,0,0.1)' : 'transparent',
          color: value === o ? 'var(--y)' : 'var(--muted)',
          cursor: 'pointer', transition: 'all .15s',
        }}>{o}</button>
      ))}
    </div>
  </div>
);

const Grid = ({ cols = 2, children }: { cols?: number; children: React.ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '0 16px' }}>
    {children}
  </div>
);

interface SectionProps { id: string; num: string; title: string; icon: React.ReactNode; children: React.ReactNode; }
const Section = ({ id, num, title, icon, children }: SectionProps) => (
  <div id={id} style={{ background: 'var(--bg)', border: '1px solid var(--border2)', marginBottom: 16 }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 20px', borderBottom: '1px solid var(--border2)',
      background: 'linear-gradient(90deg, var(--bg2) 0%, var(--bg) 100%)',
    }}>
      <div style={{
        width: 28, height: 28, background: 'rgba(255,198,0,0.08)',
        border: '1px solid rgba(255,198,0,0.2)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0,
      }}>{icon}</div>
      <div>
        <p className="label" style={{ fontSize: '0.5rem', letterSpacing: '0.35em', marginBottom: 1 }}>Sección {num}</p>
        <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fff' }}>{title}</p>
      </div>
    </div>
    <div style={{ padding: '18px 20px' }}>{children}</div>
  </div>
);

// ─── Dynamic table ────────────────────────────────────────────────────────────
interface ColDef { key: string; label: string; type?: 'select'; options?: string[]; placeholder?: string; w?: number; }

function DynTable<T extends { _id: string }>({
  columns, rows, onAdd, onRemove, onUpdate, addLabel,
}: {
  columns: ColDef[]; rows: T[]; addLabel: string;
  onAdd: () => void; onRemove: (i: number) => void;
  onUpdate: (i: number, k: string, v: string) => void;
}) {
  return (
    <div>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border2)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg2)' }}>
              {columns.map(c => (
                <th key={c.key} style={{
                  padding: '7px 10px', textAlign: 'left', whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.55rem',
                  letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--y)',
                  borderBottom: '1px solid var(--border2)', ...(c.w ? { width: c.w } : {}),
                }}>{c.label}</th>
              ))}
              <th style={{ width: 32, borderBottom: '1px solid var(--border2)' }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row._id} style={{ borderBottom: '1px solid var(--border2)', background: ri % 2 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                {columns.map(c => (
                  <td key={c.key} style={{ padding: '5px 6px' }}>
                    {c.type === 'select' ? (
                      <select value={(row as Record<string,string>)[c.key] || ''} onChange={e => onUpdate(ri, c.key, e.target.value)}
                        style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)', padding: '4px 6px', fontSize: '0.72rem', width: '100%', outline: 'none', fontFamily: 'var(--font-body)' }}>
                        <option value="">—</option>
                        {(c.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input value={(row as Record<string,string>)[c.key] || ''} onChange={e => onUpdate(ri, c.key, e.target.value)}
                        placeholder={c.placeholder || ''}
                        style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)', padding: '4px 6px', fontSize: '0.72rem', width: '100%', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} />
                    )}
                  </td>
                ))}
                <td style={{ padding: '4px', textAlign: 'center' }}>
                  <button onClick={() => onRemove(ri)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem' }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={onAdd} className="btn" style={{
        marginTop: 8, padding: '6px 14px', border: '1px dashed rgba(255,198,0,0.3)',
        background: 'transparent', color: 'var(--y)', fontSize: '0.7rem',
        letterSpacing: '0.1em',
      }}
      onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,198,0,0.05)')}
      onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
      >+ {addLabel}</button>
    </div>
  );
}

// ─── Photo slot ───────────────────────────────────────────────────────────────
function PhotoSlot({ label, photo, onPhoto }: { label: string; photo: string | null; onPhoto: (d: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div onClick={() => ref.current?.click()} style={{
        height: 110, border: '1px dashed var(--border)', background: 'var(--bg2)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', transition: 'border-color .15s',
      }}
      onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--y)')}
      onMouseOut={e => (e.currentTarget.style.borderColor = 'rgba(255,198,0,0.12)')}>
        {photo
          ? <img src={photo} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
              <Camera size={20} style={{ margin: '0 auto 6px' }} />
              <p style={{ fontSize: '0.65rem' }}>Adjuntar</p>
            </div>
        }
      </div>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]; if (!f) return;
          const r = new FileReader(); r.onload = ev => onPhoto(ev.target?.result as string); r.readAsDataURL(f);
        }} />
    </div>
  );
}

// ─── Signature canvas ─────────────────────────────────────────────────────────
function SignatureCanvas({ label }: { label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    drawing.current = true;
    const c = ref.current!; const ctx = c.getContext('2d')!;
    const r = c.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - r.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - r.top;
    ctx.beginPath(); ctx.moveTo(x * (c.width / r.width), y * (c.height / r.height));
  };
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return; e.preventDefault();
    const c = ref.current!; const ctx = c.getContext('2d')!;
    const r = c.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - r.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - r.top;
    ctx.lineWidth = 2; ctx.strokeStyle = 'var(--y)'; ctx.lineCap = 'round';
    ctx.lineTo(x * (c.width / r.width), y * (c.height / r.height)); ctx.stroke();
  };
  const end = () => { drawing.current = false; };
  const clear = () => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <FieldLabel>{label}</FieldLabel>
        <button onClick={clear} className="btn btn-ghost btn-sm" style={{ fontSize: '0.6rem' }}>Borrar</button>
      </div>
      <canvas ref={ref} width={600} height={110}
        style={{ width: '100%', height: 110, background: 'var(--bg2)', border: '1px solid var(--border2)', cursor: 'crosshair', touchAction: 'none', display: 'block' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
const NAV = [
  { id: 's1',  label: '01 Info'       },
  { id: 's2',  label: '02 Eléctrica'  },
  { id: 's3',  label: '03 Tableros'   },
  { id: 's4',  label: '04 Circuitos'  },
  { id: 's5',  label: '05 Ilum.'      },
  { id: 's6',  label: '06 Enchufes'   },
  { id: 's7',  label: '07 Canal.'     },
  { id: 's8',  label: '08 Crítico'    },
  { id: 's9',  label: '09 Medic.'     },
  { id: 's10', label: '10 Fotos'      },
  { id: 's11', label: '11 Recom.'     },
  { id: 's12', label: '12 Alcance'    },
  { id: 's13', label: '13 Firma'      },
];

export default function LevantamientoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams?.get('id');

  const [data, setData] = useState<LevantamientoData>(emptyLevantamiento());
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<string>('');
  const [estado, setEstado] = useState<string>('Borrador');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeNav, setActiveNav] = useState('s1');

  const set = useCallback(<K extends keyof LevantamientoData>(k: K, v: LevantamientoData[K]) =>
    setData(d => ({ ...d, [k]: v })), []);

  // Load clientes
  useEffect(() => {
    clientesService.getAll().then(setClientes).catch(console.error);
  }, []);

  // Load existing if editing
  useEffect(() => {
    if (editId) {
      levantamientosService.getById(editId).then(lev => {
        if (lev) { setData(lev.data); setClienteId(lev.cliente_id || ''); setEstado(lev.estado); }
      });
    }
  }, [editId]);

  // Scroll spy
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActiveNav(e.target.id); });
    }, { threshold: 0.3 });
    NAV.forEach(n => { const el = document.getElementById(n.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { cliente_id: clienteId || null, data, estado: estado as any };
      if (editId) await levantamientosService.update(editId, payload);
      else {
        const created = await levantamientosService.create(payload);
        router.replace(`/levantamiento?id=${created.id}`);
      }
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { console.error(e); alert('Error al guardar'); }
    setSaving(false);
  };

  // Tableros helpers
  const newTablero = (): TableroRow => ({ _id: newId(), nombre:'', tipo:'', ubicacion:'', marca:'', circuitos:'', proteccion:'', estado:'', espacio:'', obs:'' });
  const newCircuito = (): CircuitoRow => ({ _id: newId(), circuito:'', proteccion:'', cableado:'', canalizacion:'', uso:'', estado:'', obs:'' });

  const updTablero = (i: number, k: string, v: string) => setData(d => {
    const t = [...d.tableros]; t[i] = { ...t[i], [k]: v }; return { ...d, tableros: t };
  });
  const updCircuito = (i: number, k: string, v: string) => setData(d => {
    const c = [...d.circuitos]; c[i] = { ...c[i], [k]: v }; return { ...d, circuitos: c };
  });

  const criticalCount = Object.values(data.checklist).filter(Boolean).length;

  return (
    <div className="anim-in">
      {/* ── Page header ── */}
      <div className="iv-page-header">
        <div>
          <p className="label-muted" style={{ marginBottom: '0.35rem', letterSpacing: '0.4em' }}>Módulo técnico</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(1.6rem,4vw,2.8rem)', textTransform: 'uppercase', lineHeight: 0.9, color: '#fff' }}>
            LEVANTA<span style={{ color: 'var(--y)' }}>MIENTO</span>
          </h1>
        </div>
        <div className="iv-header-actions">
          <button onClick={() => router.push('/levantamiento/historial')} className="btn btn-ghost btn-sm">
            <ArrowLeft size={13} /> Historial
          </button>
          <IVSelect
            options={['Borrador', 'Completado', 'Enviado', 'Archivado']}
            value={estado} onChange={e => setEstado(e.target.value)}
            style={{ marginBottom: 0, minWidth: 130 }}
          />
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            <Save size={13} /> {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar'}
          </button>
          <button onClick={() => window.print()} className="btn btn-ghost btn-sm">
            <Printer size={13} /> PDF
          </button>
        </div>
      </div>

      {/* ── Section nav ── */}
      <div style={{ overflowX: 'auto', display: 'flex', gap: 2, marginBottom: 20, paddingBottom: 4 }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => { document.getElementById(n.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActiveNav(n.id); }}
            className="btn" style={{
              padding: '4px 10px', fontSize: '0.6rem', letterSpacing: '0.1em', whiteSpace: 'nowrap',
              border: `1px solid ${activeNav === n.id ? 'var(--y)' : 'var(--border2)'}`,
              background: activeNav === n.id ? 'rgba(255,198,0,0.1)' : 'transparent',
              color: activeNav === n.id ? 'var(--y)' : 'var(--muted)',
            }}>{n.label}</button>
        ))}
      </div>

      {/* ── Critical alert ── */}
      {criticalCount > 0 && (
        <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} color="#f87171" />
          <span style={{ fontSize: '0.78rem', color: '#fca5a5' }}>
            <strong>{criticalCount}</strong> observación{criticalCount > 1 ? 'es' : ''} crítica{criticalCount > 1 ? 's' : ''} marcada{criticalCount > 1 ? 's' : ''} — revisar Sección 08
          </span>
        </div>
      )}

      {/* ══ S1: INFO GENERAL ══ */}
      <Section id="s1" num="01" title="Información General" icon="📋">
        <Grid cols={2}>
          <IVInput label="Nombre cliente" required value={data.cliente_nombre}
            onChange={e => set('cliente_nombre', e.target.value)} placeholder="Juan Pérez" />
          <IVInput label="Empresa" value={data.empresa}
            onChange={e => set('empresa', e.target.value)} placeholder="Empresa S.A." />
        </Grid>
        {/* Vincular a cliente DB */}
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Vincular a cliente CRM (opcional)</FieldLabel>
          <div style={{ position: 'relative' }}>
            <select value={clienteId} onChange={e => {
              setClienteId(e.target.value);
              const c = clientes.find(cl => cl.id === e.target.value);
              if (c) { set('cliente_nombre', c.nombre_cliente); set('empresa', c.empresa || ''); set('telefono', c.telefono || ''); set('correo', c.email || ''); set('direccion', c.direccion || ''); }
            }} style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border2)', color: clienteId ? 'var(--text)' : 'var(--muted)', padding: '9px 32px 9px 12px', fontSize: '0.82rem', fontFamily: 'var(--font-body)', outline: 'none', appearance: 'none' }}>
              <option value="">— Sin vincular —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre_cliente}{c.empresa ? ` — ${c.empresa}` : ''}</option>)}
            </select>
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none', fontSize: '0.6rem' }}>▼</span>
          </div>
        </div>
        <IVInput label="Dirección" required fullWidth value={data.direccion}
          onChange={e => set('direccion', e.target.value)} placeholder="Av. Providencia 123, Santiago" />
        <Grid cols={2}>
          <IVInput label="Fecha" required type="date" value={data.fecha} onChange={e => set('fecha', e.target.value)} />
          <IVInput label="Hora" type="time" value={data.hora} onChange={e => set('hora', e.target.value)} />
        </Grid>
        <Grid cols={2}>
          <IVInput label="Contacto" value={data.contacto} onChange={e => set('contacto', e.target.value)} placeholder="Nombre de contacto" />
          <IVInput label="Teléfono" type="tel" value={data.telefono} onChange={e => set('telefono', e.target.value)} placeholder="+56 9 XXXX XXXX" />
        </Grid>
        <Grid cols={2}>
          <IVInput label="Correo" type="email" value={data.correo} onChange={e => set('correo', e.target.value)} placeholder="contacto@empresa.cl" />
          <IVInput label="Técnico responsable" required value={data.tecnico} onChange={e => set('tecnico', e.target.value)} placeholder="Nombre técnico InnVolt" />
        </Grid>
        <IVSelect label="Tipo de proyecto" required options={TIPOS_PROYECTO}
          value={data.tipo_proyecto} onChange={e => set('tipo_proyecto', e.target.value)} />
        <IVTextarea label="Observaciones generales" value={data.obs_generales}
          onChange={e => set('obs_generales', e.target.value)}
          placeholder="Descripción del proyecto y condiciones encontradas en terreno…" />
      </Section>

      {/* ══ S2: ELÉCTRICA GENERAL ══ */}
      <Section id="s2" num="02" title="Información Eléctrica General" icon="⚡">
        <IVRadioGroup label="Sistema eléctrico" options={SISTEMAS_ELEC} value={data.sistema} onChange={v => set('sistema', v)} />
        <Grid cols={2}>
          <IVSelect label="Voltaje nominal" required options={['220V','380V','220/380V','110V','Otro']}
            value={data.voltaje} onChange={e => set('voltaje', e.target.value)} />
          <IVSelect label="Tipo empalme" options={TIPOS_EMPALME}
            value={data.tipo_empalme} onChange={e => set('tipo_empalme', e.target.value)} />
        </Grid>
        <Grid cols={2}>
          <IVInput label="Capacidad empalme (A)" type="number" value={data.capacidad_empalme}
            onChange={e => set('capacidad_empalme', e.target.value)} placeholder="63" />
          <IVSelect label="Estado empalme" options={ESTADOS_GEN}
            value={data.estado_empalme} onChange={e => set('estado_empalme', e.target.value)} />
        </Grid>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0 16px' }}>
          <IVToggle label="Tierra física" checked={data.tierra} onChange={v => set('tierra', v)} />
          <IVToggle label="Grupo electrógeno" checked={data.grupo_electrogeno} onChange={v => set('grupo_electrogeno', v)} />
          <IVToggle label="UPS" checked={data.ups} onChange={v => set('ups', v)} />
        </div>
        <IVTextarea label="Observaciones" value={data.obs_electrica} onChange={e => set('obs_electrica', e.target.value)} rows={2} />
      </Section>

      {/* ══ S3: TABLEROS ══ */}
      <Section id="s3" num="03" title="Tableros Eléctricos" icon="🗃️">
        <DynTable
          columns={[
            { key:'nombre', label:'Nombre', placeholder:'TG-01' },
            { key:'tipo', label:'Tipo', type:'select', options:TIPOS_TABLERO, w:90 },
            { key:'ubicacion', label:'Ubicación', placeholder:'Bodega' },
            { key:'marca', label:'Marca', placeholder:'ABB' },
            { key:'circuitos', label:'N°Circ', placeholder:'12', w:60 },
            { key:'proteccion', label:'Prot.Gral', placeholder:'63A' },
            { key:'estado', label:'Estado', type:'select', options:ESTADOS_GEN, w:100 },
            { key:'espacio', label:'Espacio', type:'select', options:['Sí','No','Parcial'], w:80 },
            { key:'obs', label:'Obs.', placeholder:'…' },
          ]}
          rows={data.tableros}
          onAdd={() => setData(d => ({ ...d, tableros: [...d.tableros, newTablero()] }))}
          onRemove={i => setData(d => ({ ...d, tableros: d.tableros.filter((_,ri) => ri !== i) }))}
          onUpdate={updTablero}
          addLabel="Agregar tablero"
        />
      </Section>

      {/* ══ S4: CIRCUITOS ══ */}
      <Section id="s4" num="04" title="Circuitos" icon="🔌">
        <DynTable
          columns={[
            { key:'circuito', label:'Circuito', placeholder:'C1' },
            { key:'proteccion', label:'Protección', placeholder:'16A' },
            { key:'cableado', label:'Cableado', type:'select', options:TIPOS_CABLE },
            { key:'canalizacion', label:'Canalización', type:'select', options:TIPOS_CANAL },
            { key:'uso', label:'Uso', placeholder:'Iluminación' },
            { key:'estado', label:'Estado', type:'select', options:ESTADOS_GEN, w:100 },
            { key:'obs', label:'Obs.', placeholder:'…' },
          ]}
          rows={data.circuitos}
          onAdd={() => setData(d => ({ ...d, circuitos: [...d.circuitos, newCircuito()] }))}
          onRemove={i => setData(d => ({ ...d, circuitos: d.circuitos.filter((_,ri) => ri !== i) }))}
          onUpdate={updCircuito}
          addLabel="Agregar circuito"
        />
      </Section>

      {/* ══ S5: ILUMINACIÓN ══ */}
      <Section id="s5" num="05" title="Iluminación" icon="💡">
        <Grid cols={2}>
          <IVSelect label="Tipo luminarias" options={TIPOS_LUM} value={data.ilum_tipo} onChange={e => set('ilum_tipo', e.target.value)} />
          <IVInput label="Cantidad" type="number" value={data.ilum_cantidad} onChange={e => set('ilum_cantidad', e.target.value)} placeholder="24" />
        </Grid>
        <Grid cols={2}>
          <IVSelect label="Estado" options={ESTADOS_GEN} value={data.ilum_estado} onChange={e => set('ilum_estado', e.target.value)} />
          <div style={{ paddingTop: 22 }}>
            <IVToggle label="Iluminación de emergencia" checked={data.ilum_emergencia} onChange={v => set('ilum_emergencia', v)} />
          </div>
        </Grid>
        <IVTextarea label="Observaciones" value={data.ilum_obs} onChange={e => set('ilum_obs', e.target.value)} rows={2} />
      </Section>

      {/* ══ S6: ENCHUFES ══ */}
      <Section id="s6" num="06" title="Enchufes y Fuerza" icon="🔋">
        <Grid cols={2}>
          <IVInput label="Cantidad enchufes" type="number" value={data.enchufes_cantidad} onChange={e => set('enchufes_cantidad', e.target.value)} placeholder="30" />
          <IVSelect label="Tipo" options={['Schuko 220V','2P+T','Industrial CEE','Bipolar','Mixto']}
            value={data.enchufes_tipo} onChange={e => set('enchufes_tipo', e.target.value)} />
        </Grid>
        <Grid cols={2}>
          <IVSelect label="Estado" options={ESTADOS_GEN} value={data.enchufes_estado} onChange={e => set('enchufes_estado', e.target.value)} />
          <div style={{ paddingTop: 22 }}>
            <IVToggle label="Circuitos de fuerza" checked={data.enchufes_fuerza} onChange={v => set('enchufes_fuerza', v)} />
          </div>
        </Grid>
        <IVTextarea label="Equipos conectados relevantes" value={data.enchufes_equipos}
          onChange={e => set('enchufes_equipos', e.target.value)} placeholder="Compresor 5HP, UPS 3kVA…" rows={2} />
        <IVTextarea label="Observaciones" value={data.enchufes_obs} onChange={e => set('enchufes_obs', e.target.value)} rows={2} />
      </Section>

      {/* ══ S7: CANALIZACIONES ══ */}
      <Section id="s7" num="07" title="Canalizaciones" icon="📦">
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Tipos presentes</FieldLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['canal_emt','canal_pvc','canal_bandeja','canal_escalerilla'] as const).map(k => {
              const lbl = k.replace('canal_','').toUpperCase();
              return (
                <button key={k} onClick={() => set(k, !data[k])} className="btn" style={{
                  padding: '5px 14px', border: `1px solid ${data[k] ? 'var(--y)' : 'var(--border2)'}`,
                  background: data[k] ? 'rgba(255,198,0,0.08)' : 'transparent',
                  color: data[k] ? 'var(--y)' : 'var(--muted)', fontSize: '0.7rem',
                }}>{lbl}</button>
              );
            })}
          </div>
        </div>
        <Grid cols={2}>
          <IVSelect label="Estado general" options={ESTADOS_GEN} value={data.canal_estado} onChange={e => set('canal_estado', e.target.value)} />
          <IVSelect label="Saturación" options={['<50%','50–75%','75–90%','>90% (crítico)']}
            value={data.canal_saturacion} onChange={e => set('canal_saturacion', e.target.value)} />
        </Grid>
        <IVTextarea label="Observaciones" value={data.canal_obs} onChange={e => set('canal_obs', e.target.value)} rows={2} />
      </Section>

      {/* ══ S8: CRÍTICO ══ */}
      <Section id="s8" num="08" title="Observaciones Técnicas Críticas" icon="⚠️">
        <div style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)', padding: 16 }}>
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.2em', color: '#f87171', textTransform: 'uppercase', marginBottom: 14 }}>
            ⚠ Marcar todo lo detectado en terreno
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
            {CHECKLIST_CRITICO.map(item => {
              const checked = !!data.checklist[item.id];
              return (
                <div key={item.id} onClick={() => setData(d => ({ ...d, checklist: { ...d.checklist, [item.id]: !d.checklist[item.id] } }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    padding: '8px 12px', border: `1px solid ${checked ? 'rgba(248,113,113,0.4)' : 'var(--border2)'}`,
                    background: checked ? 'rgba(248,113,113,0.08)' : 'transparent', transition: 'all .15s',
                  }}>
                  <div style={{
                    width: 18, height: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: checked ? '#ef4444' : 'var(--bg3)', border: `1px solid ${checked ? '#ef4444' : 'var(--border2)'}`,
                    fontSize: '0.65rem', color: '#fff',
                  }}>{checked && '✓'}</div>
                  <span style={{ fontSize: '0.77rem', color: checked ? '#fca5a5' : 'var(--muted)' }}>{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* ══ S9: MEDICIONES ══ */}
      <Section id="s9" num="09" title="Mediciones" icon="📊">
        <div style={{ marginBottom: 4 }}><FieldLabel>Voltaje por fase (V)</FieldLabel></div>
        <Grid cols={3}>
          <IVInput placeholder="Fase R" type="number" value={data.med_v_r} onChange={e => set('med_v_r', e.target.value)} />
          <IVInput placeholder="Fase S" type="number" value={data.med_v_s} onChange={e => set('med_v_s', e.target.value)} />
          <IVInput placeholder="Fase T" type="number" value={data.med_v_t} onChange={e => set('med_v_t', e.target.value)} />
        </Grid>
        <div style={{ marginBottom: 4 }}><FieldLabel>Corriente por fase (A)</FieldLabel></div>
        <Grid cols={3}>
          <IVInput placeholder="Fase R" type="number" value={data.med_i_r} onChange={e => set('med_i_r', e.target.value)} />
          <IVInput placeholder="Fase S" type="number" value={data.med_i_s} onChange={e => set('med_i_s', e.target.value)} />
          <IVInput placeholder="Fase T" type="number" value={data.med_i_t} onChange={e => set('med_i_t', e.target.value)} />
        </Grid>
        <Grid cols={3}>
          <IVSelect label="Balance fases" options={['Balanceado','Desbalanceado leve','Desbalanceado crítico']}
            value={data.med_balance} onChange={e => set('med_balance', e.target.value)} />
          <IVSelect label="Continuidad tierra" options={['OK','Deficiente','Sin tierra']}
            value={data.med_tierra} onChange={e => set('med_tierra', e.target.value)} />
          <IVInput label="Temp. máx (°C)" type="number" value={data.med_temp} onChange={e => set('med_temp', e.target.value)} placeholder="45" />
        </Grid>
        <IVTextarea label="Observaciones" value={data.med_obs} onChange={e => set('med_obs', e.target.value)} rows={2} />
      </Section>

      {/* ══ S10: FOTOS ══ */}
      <Section id="s10" num="10" title="Material Fotográfico" icon="📷">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))', gap: 12 }}>
          {[
            { key: 'tablero',     label: 'Tablero eléctrico' },
            { key: 'empalme',     label: 'Empalme'           },
            { key: 'dano',        label: 'Daños detectados'  },
            { key: 'canalizacion',label: 'Canalizaciones'    },
            { key: 'critico',     label: 'Punto crítico'     },
          ].map(f => (
            <PhotoSlot key={f.key} label={f.label}
              photo={(data.fotos[f.key] as string | null) || null}
              onPhoto={p => setData(d => ({ ...d, fotos: { ...d.fotos, [f.key]: p } }))} />
          ))}
        </div>
      </Section>

      {/* ══ S11: RECOMENDACIONES ══ */}
      <Section id="s11" num="11" title="Recomendaciones Técnicas" icon="📝">
        <IVTextarea label="Recomendaciones del técnico" required rows={6}
          value={data.recomendaciones} onChange={e => set('recomendaciones', e.target.value)}
          placeholder={'1. Reemplazar diferencial circuito C3.\n2. Instalar SPD en tablero general.\n3. Rotular todos los circuitos.\n…'} />
      </Section>

      {/* ══ S12: ALCANCE ══ */}
      <Section id="s12" num="12" title="Alcance Preliminar" icon="🏗️">
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', padding: '10px 14px', marginBottom: 14, fontSize: '0.75rem', color: 'var(--muted)' }}>
          Esta sección se convierte en la base para la cotización formal en el módulo Cotizador.
        </div>
        <IVTextarea label="Posibles trabajos a ejecutar" rows={3} value={data.alcance_trabajos}
          onChange={e => set('alcance_trabajos', e.target.value)} placeholder="Renovación tablero general, 8 circuitos nuevos…" />
        <IVTextarea label="Mejoras recomendadas" rows={2} value={data.alcance_mejoras}
          onChange={e => set('alcance_mejoras', e.target.value)} placeholder="Automatización, domótica, medición inteligente…" />
        <IVTextarea label="Mantenciones sugeridas" rows={2} value={data.alcance_mantenciones}
          onChange={e => set('alcance_mantenciones', e.target.value)} placeholder="Mantención preventiva semestral…" />
        <IVTextarea label="Observaciones comerciales" rows={2} value={data.alcance_obs_comerciales}
          onChange={e => set('alcance_obs_comerciales', e.target.value)} placeholder="Cliente interesado en contrato de mantención…" />
      </Section>

      {/* ══ S13: FIRMA ══ */}
      <Section id="s13" num="13" title="Firmas" icon="✍️">
        <SignatureCanvas label="Técnico InnVolt" />
        <SignatureCanvas label="Conforme cliente" />
      </Section>

      {/* ── Footer actions ── */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
          <Save size={14} /> {saving ? 'Guardando…' : 'Guardar levantamiento'}
        </button>
        <button onClick={() => window.print()} className="btn btn-ghost btn-sm">
          <Printer size={14} /> Imprimir
        </button>
      </div>

      {/* Saved toast */}
      {saved && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--bg2)', border: '1px solid rgba(74,222,128,0.4)', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 999 }}>
          <CheckCircle size={16} color="#4ade80" />
          <span style={{ fontSize: '0.8rem', color: '#4ade80' }}>Levantamiento guardado</span>
        </div>
      )}
    </div>
  );
}
