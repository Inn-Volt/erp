'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Save, Printer, ArrowLeft, AlertTriangle, CheckCircle, FileDown } from 'lucide-react';
import { levantamientosService } from '@/services/levantamientos';
import { clientesService } from '@/services/clientes';
import type { Cliente } from '@/types';
import type { TableroRow, CircuitoRow, LevantamientoData, EstadoLevantamiento } from '@/types/levantamiento';
import {
  emptyLevantamiento, CHECKLIST_CRITICO, TIPOS_PROYECTO, TIPOS_EMPALME,
  ESTADOS_GEN, TIPOS_TABLERO, TIPOS_CABLE, TIPOS_CANAL, TIPOS_LUM, SISTEMAS_ELEC,
} from '@/types/levantamiento';
import { newId } from '@/utils';

// Importación del componente de renderizado de PDF estructurado analizado previamente
import { PDFDownloadLink } from '@react-pdf/renderer';
import LevantamientoPDF from '@/components/pdf/LevantamientoPDF';

// ─── FIELD COMPONENTS ────────────────────────────────────────────────────────

const FL = ({ children, req }: { children: React.ReactNode; req?: boolean }) => (
  <p style={{
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.6rem',
    letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--y)',
    marginBottom: 5,
  }}>
    {children}{req && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>★</span>}
  </p>
);

const inputBase: React.CSSProperties = {
  width: '100%', background: 'var(--bg3)', border: '1px solid var(--border2)',
  color: 'var(--text)', padding: '11px 14px', fontSize: '0.92rem',
  fontFamily: 'var(--font-body)', outline: 'none', transition: 'border-color .15s',
  boxSizing: 'border-box',
};

const F = ({
  label, req, span, type = 'text', ...p
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; req?: boolean; span?: number }) => (
  <div style={{ marginBottom: 16, ...(span ? { gridColumn: `span ${span}` } : {}) }}>
    {label && <FL req={req}>{label}</FL>}
    <input type={type} {...p} style={{ ...inputBase, ...p.style }}
      onFocus={e => (e.target.style.borderColor = 'var(--y)')}
      onBlur={e => (e.target.style.borderColor = 'var(--border2)')} />
  </div>
);

const T = ({
  label, req, rows = 3, span, ...p
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; req?: boolean; span?: number }) => (
  <div style={{ marginBottom: 16, ...(span ? { gridColumn: `span ${span}` } : {}) }}>
    {label && <FL req={req}>{label}</FL>}
    <textarea rows={rows} {...p} style={{
      ...inputBase, resize: 'vertical', ...p.style,
    } as React.CSSProperties}
      onFocus={e => (e.target.style.borderColor = 'var(--y)')}
      onBlur={e => (e.target.style.borderColor = 'var(--border2)')} />
  </div>
);

const S = ({
  label, req, options = [], span, ...p
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; req?: boolean; options?: string[]; span?: number }) => (
  <div style={{ marginBottom: 16, ...(span ? { gridColumn: `span ${span}` } : {}) }}>
    {label && <FL req={req}>{label}</FL>}
    <div style={{ position: 'relative' }}>
      <select {...p} style={{
        ...inputBase, appearance: 'none', paddingRight: 32, cursor: 'pointer',
        color: p.value ? 'var(--text)' : 'var(--muted)', ...p.style,
      } as React.CSSProperties}
        onFocus={e => (e.target.style.borderColor = 'var(--y)')}
        onBlur={e => (e.target.style.borderColor = 'var(--border2)')}>
        <option value="">— Seleccionar —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none', fontSize: '0.65rem' }}>▼</span>
    </div>
  </div>
);

const Radio = ({ label, options, value, onChange }: {
  label?: string; options: string[]; value: string; onChange: (v: string) => void;
}) => (
  <div style={{ marginBottom: 16 }}>
    {label && <FL>{label}</FL>}
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)} type="button" style={{
          padding: '8px 16px', fontSize: '0.78rem',
          fontFamily: 'var(--font-display)', fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          border: `1px solid ${value === o ? 'var(--y)' : 'var(--border2)'}`,
          background: value === o ? 'var(--y-soft)' : 'transparent',
          color: value === o ? 'var(--y)' : 'var(--muted)',
          cursor: 'pointer', transition: 'all .15s',
        }}>{o}</button>
      ))}
    </div>
  </div>
);

const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <div onClick={() => onChange(!checked)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: 'pointer', userSelect: 'none' }}>
    <div style={{
      width: 44, height: 24, background: checked ? 'var(--y-brand)' : 'var(--bg3)',
      border: `1px solid ${checked ? 'var(--y)' : 'var(--border2)'}`,
      position: 'relative', transition: 'all .2s', flexShrink: 0,
    }}>
      <div style={{ position: 'absolute', top: 3, left: checked ? 22 : 3, width: 16, height: 16, background: checked ? 'var(--on-accent)' : 'var(--muted)', transition: 'left .2s' }} />
    </div>
    <span style={{ fontSize: '0.88rem', color: checked ? 'var(--y)' : 'var(--muted)' }}>{label}</span>
  </div>
);

// ─── GRID ─────────────────────────────────────────────────────────────────────
const G = ({ cols = 2, mob = 1, children }: { cols?: number; mob?: number; children: React.ReactNode }) => (
  <div className={`lev-grid lev-grid-${cols} lev-mob-${mob}`}>{children}</div>
);

// ─── SECTION ──────────────────────────────────────────────────────────────────
const Sec = ({ id, num, title, icon, children }: { id: string; num: string; title: string; icon: string; children: React.ReactNode }) => (
  <div id={id} className="lev-section">
    <div className="lev-sec-head">
      <div className="lev-sec-icon">{icon}</div>
      <div>
        <p className="lev-sec-num">Sección {num}</p>
        <p className="lev-sec-title">{title}</p>
      </div>
    </div>
    <div className="lev-sec-body">{children}</div>
  </div>
);

// ─── DYNAMIC TABLE ────────────────────────────────────────────────────────────
interface ColDef { key: string; label: string; type?: 'select'; options?: string[]; ph?: string; w?: number; }

function DynTable<T extends { _id: string }>({
  cols, rows, onAdd, onRemove, onUpd, addLabel,
}: { cols: ColDef[]; rows: T[]; addLabel: string; onAdd: () => void; onRemove: (i: number) => void; onUpd: (i: number, k: string, v: string) => void; }) {
  return (
    <div className="lev-dyntable-wrap">
      <div style={{ overflowX: 'auto' }}>
        <table className="lev-dyntable">
          <thead>
            <tr>
              {cols.map(c => <th key={c.key} style={c.w ? { width: c.w } : {}}>{c.label}</th>)}
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row._id}>
                {cols.map(c => (
                  <td key={c.key}>
                    {c.type === 'select' ? (
                      <select value={(row as Record<string,string>)[c.key] || ''} onChange={e => onUpd(ri, c.key, e.target.value)} className="lev-cell-select">
                        <option value="">—</option>
                        {(c.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input value={(row as Record<string,string>)[c.key] || ''} onChange={e => onUpd(ri, c.key, e.target.value)} placeholder={c.ph || ''} className="lev-cell-input" />
                    )}
                  </td>
                ))}
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => onRemove(ri)} className="lev-del-btn">×</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={cols.length + 1} style={{ textAlign: 'center', color: 'var(--muted)', padding: '16px', fontSize: '0.78rem' }}>Sin registros — usa el botón para agregar</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <button onClick={onAdd} className="lev-add-btn">+ {addLabel}</button>
    </div>
  );
}

// ─── NAV ──────────────────────────────────────────────────────────────────────
const NAV = [
  { id:'s1',  short:'01 Info'      }, { id:'s2',  short:'02 Eléctrica' },
  { id:'s3',  short:'03 Tableros'  }, { id:'s4',  short:'04 Circuitos' },
  { id:'s5',  short:'05 Ilum.'     }, { id:'s6',  short:'06 Enchufes'  },
  { id:'s7',  short:'07 Canal.'    }, { id:'s8',  short:'08 Crítico'   },
  { id:'s9',  short:'09 Medic.'    }, { id:'s10', short:'10 Recom.'    },
  { id:'s11', short:'11 Alcance'   },
];

// ─── PRINT HANDLER ────────────────────────────────────────────────────────────
function triggerPrint() { window.print(); }

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function LevantamientoPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const editId       = searchParams?.get('id');
  const [data,     setData]     = useState<LevantamientoData>(emptyLevantamiento());
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId,setClienteId]= useState('');
  const [estado,   setEstado]   = useState<EstadoLevantamiento>('Borrador');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [activeNav,setActiveNav]= useState('s1');

  const set = useCallback(<K extends keyof LevantamientoData>(k: K, v: LevantamientoData[K]) =>
    setData(d => ({ ...d, [k]: v })), []);

  useEffect(() => { clientesService.getAll().then(setClientes).catch(console.error); }, []);

  useEffect(() => {
    if (editId) levantamientosService.getById(editId).then(lev => {
      if (lev) { setData(lev.data); setClienteId(lev.cliente_id || ''); setEstado(lev.estado); }
    });
  }, [editId]);

  useEffect(() => {
    const obs = new IntersectionObserver(entries =>
      entries.forEach(e => { if (e.isIntersecting) setActiveNav(e.target.id); }), { threshold: 0.25 });
    NAV.forEach(n => { const el = document.getElementById(n.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { cliente_id: clienteId || null, data, estado };
      if (editId) await levantamientosService.update(editId, payload);
      else {
        const created = await levantamientosService.create(payload);
        router.replace(`/levantamiento?id=${created.id}`);
      }
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch { alert('Error al guardar');
    }
    setSaving(false);
  };

  // Tables helpers
  const newTablero  = (): TableroRow  => ({ _id:newId(), nombre:'', tipo:'', ubicacion:'', marca:'', circuitos:'', proteccion:'', estado:'', espacio:'', obs:'' });
  const newCircuito = (): CircuitoRow => ({ _id:newId(), circuito:'', proteccion:'', cableado:'', canalizacion:'', uso:'', estado:'', obs:'' });
  const updT = (i:number,k:string,v:string) => setData(d=>{ const t=[...d.tableros]; t[i]={...t[i],[k]:v}; return{...d,tableros:t}; });
  const updC = (i:number,k:string,v:string) => setData(d=>{ const c=[...d.circuitos]; c[i]={...c[i],[k]:v}; return{...d,circuitos:c}; });

  const critCount = Object.values(data.checklist).filter(Boolean).length;

  return (
    <>
      {/* ── Inline styles (print + responsive) ── */}
      <style>{`
        /* ── Responsive grid ────────────────── */
        .lev-grid { display:grid; gap:0 16px; }
        .lev-grid-2 { grid-template-columns:1fr 1fr; }
        .lev-grid-3 { grid-template-columns:1fr 1fr 1fr; }
        @media(max-width:640px){
          .lev-grid-2,.lev-grid-3{ grid-template-columns:1fr !important; }
        }

        /* ── Section ─────────────────────────── */
        .lev-section{
          background:var(--bg);
          border:1px solid var(--border2);
          margin-bottom:18px;
        }
        .lev-sec-head{
          display:flex; align-items:center; gap:12px;
          padding:13px 20px; border-bottom:1px solid var(--border-soft);
          background:linear-gradient(90deg,var(--bg2) 0%,var(--bg) 100%);
        }
        .lev-sec-icon{
          width:30px; height:30px; background:var(--y-soft);
          border:1px solid var(--border);
          display:flex; align-items:center; justify-content:center; font-size:.9rem; flex-shrink:0;
        }
        .lev-sec-num{
          font-family:var(--font-display);
          font-weight:700;
          font-size:.5rem; letter-spacing:.35em; text-transform:uppercase;
          color:var(--y); margin-bottom:2px;
        }
        .lev-sec-title{
          font-family:var(--font-display);
          font-weight:900;
          font-size:.88rem; letter-spacing:.1em; text-transform:uppercase; color:var(--text);
        }
        .lev-sec-body{ padding:20px 20px 6px; }

        /* ── Table ───────────────────────────── */
        .lev-dyntable-wrap{ margin-bottom:4px; }
        .lev-dyntable{ width:100%; border-collapse:collapse; font-size:.78rem; }
        .lev-dyntable th{
          padding:7px 9px;
          text-align:left; white-space:nowrap;
          font-family:var(--font-display); font-weight:700;
          font-size:.52rem; letter-spacing:.2em; text-transform:uppercase;
          color:var(--y); background:var(--bg2); border-bottom:1px solid var(--border-soft);
        }
        .lev-dyntable td{ padding:5px 5px; border-bottom:1px solid var(--border-soft); }
        .lev-dyntable tr:nth-child(even) td{ background:var(--hover-bg); }
        .lev-cell-input,.lev-cell-select{
          width:100%; background:var(--bg3);
          border:1px solid var(--border2);
          color:var(--text); padding:6px 8px; font-size:.8rem;
          font-family:var(--font-body); outline:none; box-sizing:border-box;
        }
        .lev-cell-select{ appearance:none; cursor:pointer; }
        .lev-del-btn{
          background:none;
          border:none; color:var(--muted);
          cursor:pointer; font-size:1.1rem; line-height:1; padding:2px 6px;
        }
        .lev-del-btn:hover{ color:var(--danger); }
        .lev-add-btn{
          margin-top:8px;
          padding:7px 16px;
          border:1px dashed var(--border); background:transparent;
          color:var(--y); font-family:var(--font-display); font-weight:700;
          font-size:.65rem; letter-spacing:.12em; text-transform:uppercase;
          cursor:pointer; transition:background .15s;
        }
        .lev-add-btn:hover{ background:var(--y-soft); }

        /* ── Nav pills ───────────────────────── */
        .lev-nav{
          display:flex;
          gap:3px; overflow-x:auto; margin-bottom:18px;
          padding-bottom:4px; -webkit-overflow-scrolling:touch;
        }
        .lev-nav::-webkit-scrollbar{ height:2px; }
        .lev-nav button{
          flex-shrink:0;
          padding:6px 12px; font-family:var(--font-display);
          font-weight:700; font-size:.6rem; letter-spacing:.1em; text-transform:uppercase;
          border:1px solid var(--border2); background:transparent;
          color:var(--muted); cursor:pointer; transition:all .15s; white-space:nowrap;
        }
        .lev-nav button.active{
          border-color:var(--y);
          background:var(--y-soft); color:var(--y);
        }

        /* ── Checklist ───────────────────────── */
        .lev-checklist{
          display:grid;
          grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
          gap:8px;
        }
        @media(max-width:480px){ .lev-checklist{ grid-template-columns:1fr; } }
        .lev-check-item{
          display:flex;
          align-items:center; gap:10px; cursor:pointer;
          padding:10px 12px;
          border:1px solid var(--border2);
          background:transparent; transition:all .15s;
        }
        .lev-check-item.on{
          border-color:rgba(248,113,113,.4);
          background:rgba(248,113,113,.07);
        }
        .lev-check-box{
          width:20px; height:20px;
          flex-shrink:0;
          display:flex; align-items:center; justify-content:center;
          background:var(--bg3); border:1px solid var(--border2);
          font-size:.7rem; color:#fff; transition:all .15s;
        }
        .lev-check-box.on{ background:#ef4444; border-color:#ef4444; }
        .lev-check-label{ font-size:.82rem; color:var(--muted); transition:color .15s; }
        .lev-check-label.on{ color:#fca5a5; }

        /* ── Saved toast ─────────────────────── */
        .lev-toast{
          position:fixed;
          bottom:24px; right:24px; z-index:999;
          background:var(--bg2); border:1px solid rgba(74,222,128,.4);
          padding:10px 20px; display:flex; align-items:center; gap:8px;
          animation:fadeInUp .3s ease;
        }
        @keyframes fadeInUp{
          from{ opacity:0; transform:translateY(8px); }
          to{ opacity:1; transform:translateY(0); }
        }

        /* ── Print styles fallback ── */
        @media print {
          body, html { background:#fff !important; color:#000 !important; }
          body * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
          .lev-nav, .lev-add-btn, .lev-del-btn, .iv-header-actions, .iv-page-header button, aside, header, .lev-toast, [data-no-print] { display:none !important; }
          body { overflow:visible !important; }
          #__next { overflow:visible !important; }
          main { padding:0 !important; overflow:visible !important; }
          .lev-section, .lev-sec-head, .lev-sec-body { background:#fff !important; border:1px solid #ddd !important; }
          .lev-sec-head { background:#f5f5f5 !important; border-bottom:1px solid #ddd !important; padding:10px 16px !important; }
          .lev-sec-num { color:#c9a800 !important; font-size:.55rem !important; }
          .lev-sec-title { color:#000 !important; font-size:1rem !important; }
          .lev-sec-icon { background:#fff3cc !important; border:1px solid #e6c200 !important; }
          input, textarea, select { background:#fafafa !important; border:1px solid #ccc !important; color:#000 !important; font-size:10pt !important; -webkit-appearance:none !important; }
          select { padding-right:8px !important; }
          .lev-grid-2 { grid-template-columns:1fr 1fr !important; }
          .lev-grid-3 { grid-template-columns:1fr 1fr 1fr !important; }
          .lev-sec-num, p[style*="letter-spacing"] { color:#666 !important; }
          .lev-dyntable th { background:#f0f0f0 !important; color:#555 !important; border-bottom:1px solid #bbb !important; font-size:7pt !important; }
          .lev-dyntable td { border-bottom:1px solid #e8e8e8 !important; }
          .lev-dyntable tr:nth-child(even) td { background:#f9f9f9 !important; }
          .lev-cell-input, .lev-cell-select { background:#fafafa !important; border:1px solid #ddd !important; color:#000 !important; font-size:8.5pt !important; }
          .lev-check-item { border:1px solid #ddd !important; background:#fff !important; }
          .lev-check-item.on { background:var(--danger-soft) !important; border-color:var(--danger) !important; }
          .lev-check-box { background:#f0f0f0 !important; border:1px solid #ccc !important; color:#000 !important; }
          .lev-check-box.on { background:#ef4444 !important; color:#fff !important; border-color:#ef4444 !important; }
          .lev-check-label { color:#333 !important; }
          .lev-check-label.on { color:var(--danger) !important; }
          button { display:none !important; }
          .lev-radio-print { display:block !important; font-size:10pt !important; color:#000 !important; padding:8px 0 !important; }
          .lev-crit-alert { background:var(--danger-soft) !important; border:1px solid var(--danger) !important; color:var(--danger) !important; }
          .lev-section { page-break-inside:avoid; break-inside:avoid; margin-bottom:12px !important; }
          #s3, #s4, #s8, #s11 { page-break-before:auto; }
          .lev-print-header { display:flex !important; }
          @page { size:A4; margin:15mm 12mm 15mm 12mm; }
          body { font-size:10pt !important; line-height:1.4 !important; }
        }
        .lev-print-header { display:none; }
        .lev-radio-print  { display:none; }
      `}</style>

      <div className="anim-in">

        {/* ── Print-only header ── */}
        <div className="lev-print-header" style={{
          alignItems:'center', justifyContent:'space-between',
          paddingBottom:12, borderBottom:'2px solid #c9a800', marginBottom:16,
        }}>
          <div>
            <p style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.4rem', letterSpacing:'-0.02em', textTransform:'uppercase', color:'#000' }}>
              Inn<span style={{ color:'#c9a800' }}>Volt</span> SpA
            </p>
            <p style={{ fontSize:'8pt', color:'#666', letterSpacing:'0.15em', textTransform:'uppercase' }}>Levantamiento Técnico Eléctrico</p>
          </div>
          <div style={{ textAlign:'right', fontSize:'8pt', color:'#555', lineHeight:1.6 }}>
            <p>Folio: LV-{data.cliente_nombre ? '—' : '—'}</p>
            <p>Fecha: {data.fecha}</p>
            <p>Técnico: {data.tecnico || '—'}</p>
            <p>Estado: {estado}</p>
          </div>
        </div>

        {/* ── Page header (screen) ── */}
        <div className="iv-page-header" data-no-print>
          <div>
            <p className="label-muted" style={{ marginBottom:'0.35rem', letterSpacing:'0.4em' }}>Módulo técnico</p>
            <h1 style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'clamp(1.6rem,4vw,2.8rem)', textTransform:'uppercase', lineHeight:0.9, color:'var(--text)' }}>
              LEVANTA<span style={{ color:'var(--y)' }}>MIENTO</span>
            </h1>
          </div>
          <div className="iv-header-actions">
            <button onClick={() => router.push('/levantamiento/historial')} className="btn btn-ghost btn-sm">
              <ArrowLeft size={13} /> Historial
            </button>
            <div style={{ position:'relative' }}>
              <select value={estado} onChange={e => setEstado(e.target.value as EstadoLevantamiento)} style={{
                background:'var(--bg2)', border:'1px solid var(--border2)',
                color:'var(--text)', padding:'8px 28px 8px 12px', fontSize:'0.8rem',
                fontFamily:'var(--font-display)', fontWeight:700, letterSpacing:'0.1em',
                textTransform:'uppercase', outline:'none', appearance:'none', cursor:'pointer',
              }}>
                {['Borrador','Completado','Enviado','Archivado'].map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', color:'var(--muted)', pointerEvents:'none', fontSize:'.6rem' }}>▼</span>
            </div>
      
            <button onClick={handleSave} disabled={saving} className="btn btn-primary">
              <Save size={13} /> {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={triggerPrint} className="btn btn-ghost btn-sm">
              <Printer size={13} /> Imprimir
            </button>
            
            {/* Componente Asíncrono para descarga directa estructurada de PDF */}
            <PDFDownloadLink 
              document={<LevantamientoPDF data={data} estado={estado} />}
              fileName={`Levantamiento_${data.cliente_nombre || 'Sin_Nombre'}.pdf`}
              className="btn btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {({ loading }) => (
                <>
                  <FileDown size={13} />
                  {loading ? 'Generando...' : 'Descargar PDF'}
                </>
              )}
            </PDFDownloadLink>
          </div>
        </div>

        {/* ── Section nav ── */}
        <div className="lev-nav" data-no-print>
          {NAV.map(n => (
            <button key={n.id}
              className={activeNav === n.id ? 'active' : ''}
              onClick={() => { document.getElementById(n.id)?.scrollIntoView({ behavior:'smooth', block:'start' }); setActiveNav(n.id); }}>
              {n.short}
            </button>
          ))}
        </div>

        {/* ── Critical alert (screen) ── */}
        {critCount > 0 && (
          <div data-no-print style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.3)', padding:'10px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
            <AlertTriangle size={16} color="var(--danger)" />
            <span style={{ fontSize:'0.82rem', color:'#fca5a5' }}>
              <strong>{critCount}</strong> observación{critCount>1?'es':''} crítica{critCount>1?'s':''} detectada{critCount>1?'s':''} — ver Sección 08
            </span>
          </div>
        )}

        {/* ════ S1: INFO GENERAL ════ */}
        <Sec id="s1" num="01" title="Información General" icon="📋">
          <G cols={2}>
            <F label="Nombre cliente" req value={data.cliente_nombre} onChange={e=>set('cliente_nombre',e.target.value)} placeholder="Juan Pérez" />
            <F label="Empresa" value={data.empresa} onChange={e=>set('empresa',e.target.value)} placeholder="Empresa S.A." />
          </G>

          {/* Vincular CRM */}
          <div style={{ marginBottom:16 }}>
            <FL>Vincular a cliente CRM (opcional)</FL>
            <div style={{ position:'relative' }}>
              <select value={clienteId} onChange={e=>{
                setClienteId(e.target.value);
                const c=clientes.find(cl=>cl.id===e.target.value);
                if(c){ set('cliente_nombre',c.nombre_cliente); set('empresa',c.empresa||''); set('telefono',c.telefono||''); set('correo',c.email||''); set('direccion',c.direccion||''); }
              }} style={{ ...inputBase, appearance:'none', paddingRight:32, color:clienteId?'var(--text)':'var(--muted)', cursor:'pointer' } as React.CSSProperties}>
                <option value="">— Sin vincular —</option>
                {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre_cliente}{c.empresa?` — ${c.empresa}`:''}</option>)}
              </select>
              <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color:'var(--muted)', pointerEvents:'none', fontSize:'.65rem' }}>▼</span>
            </div>
          </div>

          <F label="Dirección" req span={2} value={data.direccion} onChange={e=>set('direccion',e.target.value)} placeholder="Av. Providencia 123, Santiago" />
          <G cols={2}>
            <F label="Fecha" req type="date" value={data.fecha} onChange={e=>set('fecha',e.target.value)} />
            <F label="Hora" type="time" value={data.hora} onChange={e=>set('hora',e.target.value)} />
          </G>
          <G cols={2}>
            <F label="Contacto" value={data.contacto} onChange={e=>set('contacto',e.target.value)} placeholder="Nombre de contacto" />
            <F label="Teléfono" type="tel" value={data.telefono} onChange={e=>set('telefono',e.target.value)} placeholder="+56 9 XXXX XXXX" />
          </G>
          <G cols={2}>
            <F label="Correo" type="email" value={data.correo} onChange={e=>set('correo',e.target.value)} placeholder="contacto@empresa.cl" />
            <F label="Técnico responsable" req value={data.tecnico} onChange={e=>set('tecnico',e.target.value)} placeholder="Nombre técnico InnVolt" />
          </G>
          <S label="Tipo de proyecto" req options={TIPOS_PROYECTO} value={data.tipo_proyecto} onChange={e=>set('tipo_proyecto',e.target.value)} />
          <T label="Observaciones generales" rows={3} value={data.obs_generales} onChange={e=>set('obs_generales',e.target.value)} placeholder="Descripción del proyecto y condiciones generales encontradas en terreno…" />
        </Sec>

        {/* ════ S2: ELÉCTRICA ════ */}
        <Sec id="s2" num="02" title="Información Eléctrica General" icon="⚡">
          <Radio label="Sistema eléctrico" options={SISTEMAS_ELEC} value={data.sistema} onChange={v=>set('sistema',v)} />
          <p className="lev-radio-print">Sistema eléctrico: <strong>{data.sistema||'—'}</strong></p>

          <G cols={2}>
            <S label="Voltaje nominal" req options={['220V','380V','220/380V','110V','Otro']} value={data.voltaje} onChange={e=>set('voltaje',e.target.value)} />
            <S label="Tipo empalme" options={TIPOS_EMPALME} value={data.tipo_empalme} onChange={e=>set('tipo_empalme',e.target.value)} />
          </G>
          <G cols={2}>
            <F label="Capacidad empalme (A)" type="number" value={data.capacidad_empalme} onChange={e=>set('capacidad_empalme',e.target.value)} placeholder="63" />
            <S label="Estado empalme" options={ESTADOS_GEN} value={data.estado_empalme} onChange={e=>set('estado_empalme',e.target.value)} />
          </G>
          <G cols={3} mob={1}>
            <Toggle label="Tierra física" checked={data.tierra} onChange={v=>set('tierra',v)} />
            <Toggle label="Grupo electrógeno" checked={data.grupo_electrogeno} onChange={v=>set('grupo_electrogeno',v)} />
            <Toggle label="UPS" checked={data.ups} onChange={v=>set('ups',v)} />
          </G>
          <p className="lev-radio-print">
            Tierra física: <strong>{data.tierra?'Sí':'No'}</strong> &nbsp;|&nbsp;
            Grupo electrógeno: <strong>{data.grupo_electrogeno?'Sí':'No'}</strong> &nbsp;|&nbsp;
            UPS: <strong>{data.ups?'Sí':'No'}</strong>
          </p>
          <T label="Observaciones" rows={2} value={data.obs_electrica} onChange={e=>set('obs_electrica',e.target.value)} />
        </Sec>

        {/* ════ S3: TABLEROS ════ */}
        <Sec id="s3" num="03" title="Tableros Eléctricos" icon="🗃️">
          <DynTable
            cols={[
              {key:'nombre',label:'Nombre',ph:'TG-01'},
              {key:'tipo',label:'Tipo',type:'select',options:TIPOS_TABLERO,w:90},
              {key:'ubicacion',label:'Ubicación',ph:'Bodega'},
              {key:'marca',label:'Marca',ph:'ABB'},
              {key:'circuitos',label:'N°Circ',ph:'12',w:65},
              {key:'proteccion',label:'Prot.Gral',ph:'63A'},
              {key:'estado',label:'Estado',type:'select',options:ESTADOS_GEN,w:100},
              {key:'espacio',label:'Espacio',type:'select',options:['Sí','No','Parcial'],w:80},
              {key:'obs',label:'Obs.'},
            ]}
            rows={data.tableros}
            onAdd={()=>setData(d=>({...d,tableros:[...d.tableros,newTablero()]}))}
            onRemove={i=>setData(d=>({...d,tableros:d.tableros.filter((_,ri)=>ri!==i)}))}
            onUpd={updT}
            addLabel="Agregar tablero"
          />
        </Sec>

        {/* ════ S4: CIRCUITOS ════ */}
        <Sec id="s4" num="04" title="Circuitos" icon="🔌">
          <DynTable
            cols={[
              {key:'circuito',label:'Circuito',ph:'C1',w:70},
              {key:'proteccion',label:'Protección',ph:'16A'},
              {key:'cableado',label:'Cableado',type:'select',options:TIPOS_CABLE},
              {key:'canalizacion',label:'Canalización',type:'select',options:TIPOS_CANAL},
              {key:'uso',label:'Uso',ph:'Iluminación'},
              {key:'estado',label:'Estado',type:'select',options:ESTADOS_GEN,w:100},
              {key:'obs',label:'Obs.'},
            ]}
            rows={data.circuitos}
            onAdd={()=>setData(d=>({...d,circuitos:[...d.circuitos,newCircuito()]}))}
            onRemove={i=>setData(d=>({...d,circuitos:d.circuitos.filter((_,ri)=>ri!==i)}))}
            onUpd={updC}
            addLabel="Agregar circuito"
          />
        </Sec>

        {/* ════ S5: ILUMINACIÓN ════ */}
        <Sec id="s5" num="05" title="Iluminación" icon="💡">
          <G cols={2}>
            <S label="Tipo luminarias" options={TIPOS_LUM} value={data.ilum_tipo} onChange={e=>set('ilum_tipo',e.target.value)} />
            <F label="Cantidad" type="number" value={data.ilum_cantidad} onChange={e=>set('ilum_cantidad',e.target.value)} placeholder="24" />
          </G>
          <G cols={2}>
            <S label="Estado general" options={ESTADOS_GEN} value={data.ilum_estado} onChange={e=>set('ilum_estado',e.target.value)} />
            <div style={{ paddingTop:22 }}>
              <Toggle label="Iluminación de emergencia" checked={data.ilum_emergencia} onChange={v=>set('ilum_emergencia',v)} />
              <p className="lev-radio-print">Emergencia: <strong>{data.ilum_emergencia?'Sí':'No'}</strong></p>
            </div>
          </G>
          <T label="Observaciones" rows={2} value={data.ilum_obs} onChange={e=>set('ilum_obs',e.target.value)} />
        </Sec>

        {/* ════ S6: ENCHUFES ════ */}
        <Sec id="s6" num="06" title="Enchufes y Fuerza" icon="🔋">
          <G cols={2}>
            <F label="Cantidad enchufes" type="number" value={data.enchufes_cantidad} onChange={e=>set('enchufes_cantidad',e.target.value)} placeholder="30" />
            <S label="Tipo" options={['Schuko 220V','2P+T','Industrial CEE','Bipolar','Mixto']} value={data.enchufes_tipo} onChange={e=>set('enchufes_tipo',e.target.value)} />
          </G>
          <G cols={2}>
            <S label="Estado" options={ESTADOS_GEN} value={data.enchufes_estado} onChange={e=>set('enchufes_estado',e.target.value)} />
            <div style={{ paddingTop:22 }}>
              <Toggle label="Circuitos de fuerza presentes" checked={data.enchufes_fuerza} onChange={v=>set('enchufes_fuerza',v)} />
              <p className="lev-radio-print">Circuitos de fuerza: <strong>{data.enchufes_fuerza?'Sí':'No'}</strong></p>
            </div>
          </G>
          <T label="Equipos conectados relevantes" rows={2} value={data.enchufes_equipos} onChange={e=>set('enchufes_equipos',e.target.value)} placeholder="Compresor 5HP, UPS 3kVA, Horno industrial…" />
          <T label="Observaciones" rows={2} value={data.enchufes_obs} onChange={e=>set('enchufes_obs',e.target.value)} />
        </Sec>

        {/* ════ S7: CANALIZACIONES ════ */}
        <Sec id="s7" num="07" title="Canalizaciones" icon="📦">
          <div style={{ marginBottom:16 }}>
            <FL>Tipos presentes</FL>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }} data-no-print>
              {(['canal_emt','canal_pvc','canal_bandeja','canal_escalerilla'] as const).map(k=>{
                const lbl = k.replace('canal_','').toUpperCase();
                return (
                  <button key={k} type="button" onClick={()=>set(k,!data[k])} style={{
                    padding:'8px 18px', fontSize:'.78rem',
                    fontFamily:'var(--font-display)', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase',
                    border:`1px solid ${data[k]?'var(--y)':'var(--border2)'}`,
                    background:data[k]?'var(--y-soft)':'transparent',
                    color:data[k]?'var(--y)':'var(--muted)', cursor:'pointer', transition:'all .15s',
                  }}>{lbl}</button>
                );
              })}
            </div>
            <p className="lev-radio-print">
              Tipos: {[data.canal_emt&&'EMT',data.canal_pvc&&'PVC',data.canal_bandeja&&'Bandeja',data.canal_escalerilla&&'Escalerilla'].filter(Boolean).join(', ')||'—'}
            </p>
          </div>
          <G cols={2}>
            <S label="Estado general" options={ESTADOS_GEN} value={data.canal_estado} onChange={e=>set('canal_estado',e.target.value)} />
            <S label="Nivel de saturación" options={['<50%','50–75%','75–90%','>90% (crítico)']} value={data.canal_saturacion} onChange={e=>set('canal_saturacion',e.target.value)} />
          </G>
          <T label="Observaciones" rows={2} value={data.canal_obs} onChange={e=>set('canal_obs',e.target.value)} />
        </Sec>

        {/* ════ S8: CRÍTICO ════ */}
        <Sec id="s8" num="08" title="Observaciones Técnicas Críticas" icon="⚠️">
          <div style={{ background:'rgba(248,113,113,0.05)', border:'1px solid rgba(248,113,113,0.18)', padding:16, marginBottom:4 }} className="lev-crit-alert">
            <p style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'.58rem', letterSpacing:'.2em', color:'var(--danger)', textTransform:'uppercase', marginBottom:12 }}>
              ⚠ Marcar todo lo detectado en terreno
            </p>
            <div className="lev-checklist">
              {CHECKLIST_CRITICO.map(item=>{
                const on = !!data.checklist[item.id];
                return (
                  <div key={item.id} className={`lev-check-item${on?' on':''}`}
                    onClick={()=>setData(d=>({...d,checklist:{...d.checklist,[item.id]:!d.checklist[item.id]}}))}>
                    <div className={`lev-check-box${on?' on':''}`}>{on&&'✓'}</div>
                    <span className={`lev-check-label${on?' on':''}`}>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Sec>

        {/* ════ S9: MEDICIONES ════ */}
        <Sec id="s9" num="09" title="Mediciones" icon="📊">
          <FL>Voltaje por fase (V)</FL>
          <G cols={3} mob={3}>
            <F placeholder="Fase R" type="number" value={data.med_v_r} onChange={e=>set('med_v_r',e.target.value)} />
            <F placeholder="Fase S" type="number" value={data.med_v_s} onChange={e=>set('med_v_s',e.target.value)} />
            <F placeholder="Fase T" type="number" value={data.med_v_t} onChange={e=>set('med_v_t',e.target.value)} />
          </G>
          <FL>Corriente por fase (A)</FL>
          <G cols={3} mob={3}>
            <F placeholder="Fase R" type="number" value={data.med_i_r} onChange={e=>set('med_i_r',e.target.value)} />
            <F placeholder="Fase S" type="number" value={data.med_i_s} onChange={e=>set('med_i_s',e.target.value)} />
            <F placeholder="Fase T" type="number" value={data.med_i_t} onChange={e=>set('med_i_t',e.target.value)} />
          </G>
          <G cols={3}>
            <S label="Balance fases" options={['Balanceado','Desbalanceado leve','Desbalanceado crítico']} value={data.med_balance} onChange={e=>set('med_balance',e.target.value)} />
            <S label="Continuidad tierra" options={['OK','Deficiente','Sin tierra']} value={data.med_tierra} onChange={e=>set('med_tierra',e.target.value)} />
            <F label="Temp. máx (°C)" type="number" value={data.med_temp} onChange={e=>set('med_temp',e.target.value)} placeholder="45" />
          </G>
          <T label="Observaciones de mediciones" rows={2} value={data.med_obs} onChange={e=>set('med_obs',e.target.value)} />
        </Sec>

        {/* ════ S10: RECOMENDACIONES ════ */}
        <Sec id="s10" num="10" title="Recomendaciones Técnicas" icon="📝">
          <T label="Recomendaciones del técnico" req rows={6}
            value={data.recomendaciones} onChange={e=>set('recomendaciones',e.target.value)}
            placeholder={'1. Reemplazar diferencial circuito C3 (sin disparo).\n2. Instalar SPD en tablero general.\n3. Rotular todos los circuitos.\n4. Revisar empalme — cable deteriorado en tramo exterior.\n…'} />
        </Sec>

        {/* ════ S11: ALCANCE ════ */}
        <Sec id="s11" num="11" title="Alcance Preliminar" icon="🏗️">
          <div style={{ background:'var(--bg2)', border:'1px solid var(--border2)', padding:'10px 14px', marginBottom:16, fontSize:'.78rem', color:'var(--muted)' }}>
            Esta sección se convierte en la base para la cotización formal.
          </div>
          <T label="Posibles trabajos a ejecutar" rows={3} value={data.alcance_trabajos} onChange={e=>set('alcance_trabajos',e.target.value)} placeholder="Renovación tablero general, instalación de 8 circuitos nuevos…" />
          <T label="Mejoras recomendadas" rows={2} value={data.alcance_mejoras} onChange={e=>set('alcance_mejoras',e.target.value)} placeholder="Automatización, domótica, medición inteligente…" />
          <T label="Mantenciones sugeridas" rows={2} value={data.alcance_mantenciones} onChange={e=>set('alcance_mantenciones',e.target.value)} placeholder="Mantención preventiva semestral, ajuste de bornes…" />
          <T label="Observaciones comerciales" rows={2} value={data.alcance_obs_comerciales} onChange={e=>set('alcance_obs_comerciales',e.target.value)} placeholder="Cliente interesado en contrato de mantención…" />
        </Sec>

        {/* ── Footer actions ── */}
        <div data-no-print style={{ display:'flex', gap:10, paddingTop:8, flexWrap:'wrap' }}>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex:1, minWidth:160, justifyContent:'center' }}>
            <Save size={14} /> {saving?'Guardando…':'Guardar levantamiento'}
          </button>
          <button onClick={triggerPrint} className="btn btn-ghost btn-sm">
            <Printer size={14} /> Vista de Impresión (CSS)
          </button>
          
          {/* Duplicado del componente de descarga en la botonera inferior */}
          <PDFDownloadLink 
            document={<LevantamientoPDF data={data} estado={estado} />} 
            fileName={`Levantamiento_${data.cliente_nombre || 'Sin_Nombre'}.pdf`}
            className="btn btn-ghost btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {({ loading }) => (
              <>
                <FileDown size={14} />
                {loading ? 'Generando...' : 'Exportar PDF Estructurado'}
              </>
            )}
          </PDFDownloadLink>
        </div>

        {/* Saved toast */}
        {saved && (
          <div className="lev-toast">
            <CheckCircle size={16} color="var(--success)" />
            <span style={{ fontSize:'.82rem', color:'var(--success)' }}>Levantamiento guardado correctamente</span>
          </div>
        )}
      </div>
    </>
  );
}
