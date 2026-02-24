/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useMemo } from 'react';
import { 
  Zap, Ruler, ShieldAlert, Boxes, ArrowRightLeft, 
  Trash2, CheckSquare, ClipboardCheck, AlertCircle, 
  Gauge, FileText, Printer, CheckCircle2, Scale, 
  Lightbulb, Activity, ChevronRight, Info
} from 'lucide-react';

type CargaTipo = 'iluminacion' | 'uso_general' | 'motores' | 'transformadores';

export default function InnVoltMasterRIC() {
  const [activeTab, setActiveTab] = useState<'caida' | 'medicion' | 'checklist' | 'informe' | 'ductos' | 'ohm' | 'protecciones' | 'condensadores' | 'iluminacion' | 'awg'>('caida');
  
  // --- ESTADOS DE DATOS ---
  const [ohm, setOhm] = useState({ v: '', i: '', r: '', p: '' });
  const [calc, setCalc] = useState({ modo: 'W', fase: '1', valor: '', largo: '', vNominal: '220', seccion: '2.5', fp: '0.93' });
  const [prot, setProt] = useState({ valor: '', tipo: 'uso_general' as CargaTipo });
  const [resCaida, setResCaida] = useState<any>(null);
  const [resLux, setResLux] = useState<number | null>(null);
  const [resKvar, setResKvar] = useState<number | null>(null);
  const [ductos, setDuctos] = useState<{seccion: string, cantidad: number}[]>([]);
  const [medicion, setMedicion] = useState({ voltajeReal: '', amperajeReal: '', tierra: '', aislamiento: '' });
  const [checklist, setChecklist] = useState({
    visual_tableros: false,
    continuidad_pe: false,
    aislamiento_min: false,
    rotulacion_mcb: false,
    prueba_diferencial: false,
    curva_adecuada: false,
    orden_peinado: false
  });

  // --- TABLAS TÉCNICAS (Basadas en RIC 04 - Instalación al aire/ducto) ---
  const capacidadCables: Record<string, number> = { '1.5': 15, '2.5': 20, '4': 28, '6': 36, '10': 50, '16': 66, '25': 88, '35': 109 };
  const diametroExternoCable: Record<string, number> = { '1.5': 3.0, '2.5': 3.6, '4': 4.2, '6': 4.8, '10': 6.2, '16': 7.4, '25': 9.2, '35': 10.5 };
  const diametroInternoDucto: Record<string, number> = { '16mm': 13.0, '20mm': 16.2, '25mm': 20.4, '32mm': 27.2, '40mm': 35.0, '50mm': 44.0 };
  const tablaAWG = [
    { awg: '14', mm2: '2.08', amp: '15' }, { awg: '12', mm2: '3.31', amp: '20' },
    { awg: '10', mm2: '5.26', amp: '30' }, { awg: '8', mm2: '8.37', amp: '50' },
    { awg: '6', mm2: '13.3', amp: '65' }, { awg: '4', mm2: '21.2', amp: '85' }
  ];

  // --- LÓGICA DE CÁLCULOS ---
  const calcularCaida = () => {
    const V_IN = parseFloat(calc.valor); const L = parseFloat(calc.largo);
    const V = parseFloat(calc.vNominal); const S = parseFloat(calc.seccion);
    const FP = parseFloat(calc.fp); const rho = 0.0178;
    if (!V_IN || !L) return;

    let I = calc.modo === 'W' 
      ? (calc.fase === '1' ? V_IN / (V * FP) : V_IN / (Math.sqrt(3) * V * FP)) 
      : V_IN;

    let deltaV = calc.fase === '1' ? (2 * L * I * rho) / S : (Math.sqrt(3) * L * I * rho) / S;
    let porcentaje = (deltaV / V) * 100;
    
    const disyuntores = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];
    const sugerido = disyuntores.find(d => d >= I * 1.25) || 125;
    
    // Obtener capacidad del cable
    const ampacidadCable = capacidadCables[calc.seccion];
    const cableSoporta = I <= ampacidadCable;

    setResCaida({ 
      i: I.toFixed(2), 
      dv: deltaV.toFixed(2), 
      p: porcentaje.toFixed(2), 
      cumple: porcentaje <= 3 && cableSoporta, 
      cumpleVoltaje: porcentaje <= 3,
      cumpleAmpacidad: cableSoporta,
      ampacidadMax: ampacidadCable,
      mcb: sugerido, 
      seccion: S, 
      vFinal: (V - deltaV).toFixed(1) 
    });
  };

  const calcularOhm = (target: string) => {
    const v = parseFloat(ohm.v); const i = parseFloat(ohm.i); const r = parseFloat(ohm.r); const p = parseFloat(ohm.p);
    if (target === 'v') setOhm({...ohm, v: i && r ? (i * r).toFixed(2) : (p / i).toFixed(2)});
    if (target === 'i') setOhm({...ohm, i: v && r ? (v / r).toFixed(2) : (p / v).toFixed(2)});
    if (target === 'p') setOhm({...ohm, p: v && i ? (v * i).toFixed(2) : (Math.pow(i, 2) * r).toFixed(2)});
    if (target === 'r') setOhm({...ohm, r: v && i ? (v / i).toFixed(2) : (Math.pow(v, 2) / p).toFixed(2)});
  };

  const calculoProteccion = useMemo(() => {
    const val = parseFloat(prot.valor); if (!val) return null;
    const amperes = val > 150 ? val / (parseFloat(calc.vNominal) * 0.93) : val;
    const disyuntores = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];
    const sugerido = disyuntores.find(d => d >= amperes * 1.25) || 125;
    const curvas = {
      iluminacion: { letra: 'B', desc: 'Resistiva' },
      uso_general: { letra: 'C', desc: 'Estándar' },
      motores: { letra: 'D', desc: 'Alto Arranque' },
      transformadores: { letra: 'D', desc: 'Inductiva' }
    };
    return { i: amperes.toFixed(2), mcb: sugerido, curva: curvas[prot.tipo] };
  }, [prot, calc.vNominal]);

  const calcDucto = useMemo(() => {
    if (ductos.length === 0) return null;
    let areaTotal = 0;
    ductos.forEach(d => { areaTotal += (Math.PI * Math.pow(diametroExternoCable[d.seccion] / 2, 2)) * d.cantidad; });
    const ductoSugerido = Object.entries(diametroInternoDucto).find(([_, dInt]) => areaTotal <= (Math.PI * Math.pow(dInt / 2, 2) * 0.35));
    return { area: areaTotal.toFixed(2), sugerido: ductoSugerido ? ductoSugerido[0] : 'Excede 50mm' };
  }, [ductos, diametroExternoCable, diametroInternoDucto]);

  const inputStyle = "w-full bg-slate-50 p-4 rounded-2xl text-slate-900 font-black border-2 border-slate-200 focus:border-slate-900 outline-none transition-all text-lg";

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 pb-40">
      
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; border: none !important; }
          .no-print { display: none !important; }
        }
      `}} />

      {/* HEADER */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 no-print">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter italic uppercase">InnVolt <span className="text-[#ffc600]">Pro RIC</span></h1>
          <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">Estación Técnica de Ingeniería Eléctrica</p>
        </div>
        <button onClick={() => setActiveTab('informe')} className="w-full md:w-auto bg-slate-900 text-[#ffc600] px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-xl hover:scale-105 transition-all flex items-center justify-center gap-2">
          <FileText size={18}/> Ver Informe Consolidado
        </button>
      </div>

      {/* NAVEGACIÓN */}
      <div className="max-w-7xl mx-auto overflow-x-auto no-scrollbar mb-6 flex gap-2 pb-2 no-print">
        {[
          { id: 'caida', label: 'Alimentador', icon: <Scale size={14}/> },
          { id: 'medicion', label: 'Terreno', icon: <Gauge size={14}/> },
          { id: 'checklist', label: 'Checklist', icon: <ClipboardCheck size={14}/> },
          { id: 'ohm', label: 'Ley Ohm', icon: <Zap size={14}/> },
          { id: 'protecciones', label: 'Curvas', icon: <ShieldAlert size={14}/> },
          { id: 'ductos', label: 'Ductos', icon: <Boxes size={14}/> },
          { id: 'condensadores', label: 'Banco kVAr', icon: <Activity size={14}/> },
          { id: 'iluminacion', label: 'Luxes', icon: <Lightbulb size={14}/> },
          { id: 'awg', label: 'AWG', icon: <ArrowRightLeft size={14}/> },
        ].map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-black text-[10px] uppercase whitespace-nowrap transition-all ${activeTab === t.id ? 'bg-[#ffc600] text-slate-900 shadow-md' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <main className="max-w-7xl mx-auto bg-white rounded-[2.5rem] shadow-xl border border-slate-200 p-6 md:p-12 no-print">
        
        {activeTab === 'caida' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in fade-in">
            <div className="space-y-6">
              <h3 className="text-xl font-black text-slate-800 uppercase italic border-b-2 border-slate-100 pb-2">Memoria de Alimentadores</h3>
              <div className="space-y-4">
                <div className="flex bg-slate-100 p-1 rounded-2xl">
                  <button onClick={() => setCalc({...calc, modo: 'W'})} className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase transition-all ${calc.modo === 'W' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Watts (W)</button>
                  <button onClick={() => setCalc({...calc, modo: 'A'})} className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase transition-all ${calc.modo === 'A' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Amperes (A)</button>
                </div>

                <input type="number" placeholder={calc.modo === 'W' ? "Potencia Total (W)" : "Corriente Nominal (A)"} className={inputStyle} value={calc.valor} onChange={e => setCalc({...calc, valor: e.target.value})} />
                
                <div className="grid grid-cols-2 gap-4">
                  <input type="number" placeholder="Largo (m)" className={inputStyle} value={calc.largo} onChange={e => setCalc({...calc, largo: e.target.value})} />
                  <select className={inputStyle} value={calc.seccion} onChange={e => setCalc({...calc, seccion: e.target.value})}>
                    {Object.keys(capacidadCables).map(s => <option key={s} value={s}>{s} mm²</option>)}
                  </select>
                </div>

                <div className="flex gap-2">
                   <button onClick={() => setCalc({...calc, fase: '1', vNominal: '220'})} className={`flex-1 p-4 rounded-xl font-black text-[10px] uppercase border-2 transition-all ${calc.fase === '1' ? 'bg-slate-900 text-[#ffc600] border-slate-900' : 'bg-white text-slate-400 border-slate-100'}`}>1Φ (220V)</button>
                   <button onClick={() => setCalc({...calc, fase: '3', vNominal: '380'})} className={`flex-1 p-4 rounded-xl font-black text-[10px] uppercase border-2 transition-all ${calc.fase === '3' ? 'bg-slate-900 text-[#ffc600] border-slate-900' : 'bg-white text-slate-400 border-slate-100'}`}>3Φ (380V)</button>
                </div>
                <button onClick={calcularCaida} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-xs hover:bg-slate-800 shadow-lg transition-all">Calcular Parámetros RIC</button>
              </div>
            </div>
            {resCaida && (
              <div className="bg-slate-900 p-8 rounded-[2rem] text-white space-y-6 flex flex-col justify-center border-l-[12px] border-[#ffc600]">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Análisis RIC 18 & RIC 04</p>
                
                <div className="flex justify-between items-end border-b border-white/10 pb-4">
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase block">Pérdida de Voltaje</span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${resCaida.cumpleVoltaje ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-500'}`}>
                      {resCaida.cumpleVoltaje ? 'Cumple RIC' : 'Excede 3%'}
                    </span>
                  </div>
                  <span className={`text-5xl font-black ${resCaida.cumpleVoltaje ? 'text-emerald-400' : 'text-rose-500'}`}>{resCaida.p}%</span>
                </div>

                {/* NUEVO: CAPACIDAD DEL CABLE */}
                <div className="bg-white/5 p-6 rounded-2xl space-y-4 border border-white/5">
                  <div className="flex justify-between items-center">
                    <p className="text-[9px] uppercase text-slate-400 font-black">Capacidad Conductor {resCaida.seccion}mm²</p>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${resCaida.cumpleAmpacidad ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-500'}`}>
                      {resCaida.cumpleAmpacidad ? 'Seguro' : 'Sobrecarga'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-center flex-1">
                      <p className="text-[10px] text-slate-500 uppercase">Carga Real</p>
                      <p className="text-xl font-black text-white italic">{resCaida.i} A</p>
                    </div>
                    <div className="px-4 text-slate-700 font-black text-xl italic">/</div>
                    <div className="text-center flex-1">
                      <p className="text-[10px] text-slate-500 uppercase">Límite Térmico</p>
                      <p className="text-xl font-black text-[#ffc600] italic">{resCaida.ampacidadMax} A</p>
                    </div>
                  </div>
                  <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ${resCaida.cumpleAmpacidad ? 'bg-emerald-400' : 'bg-rose-500'}`} 
                      style={{ width: `${Math.min((parseFloat(resCaida.i) / resCaida.ampacidadMax) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-4 rounded-2xl"><p className="text-[9px] uppercase text-slate-400 font-black">Voltaje en Carga</p><p className="text-xl font-black italic">{resCaida.vFinal} V</p></div>
                  <div className="bg-white/5 p-4 rounded-2xl"><p className="text-[9px] uppercase text-slate-400 font-black">ITM Sugerido</p><p className="text-xl font-black text-[#ffc600] italic">{resCaida.mcb}A</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'medicion' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4">
            <div className="space-y-6">
              <h3 className="text-xl font-black text-slate-800 uppercase italic">Validación en Terreno</h3>
              <div className="space-y-4">
                <div><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Voltaje Real Medido (V)</label><input type="number" className={inputStyle} value={medicion.voltajeReal} onChange={e => setMedicion({...medicion, voltajeReal: e.target.value})} /></div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Puesta a Tierra (Ω)</label><input type="number" className={inputStyle} value={medicion.tierra} onChange={e => setMedicion({...medicion, tierra: e.target.value})} /></div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Aislamiento (MΩ)</label><input type="number" className={inputStyle} value={medicion.aislamiento} onChange={e => setMedicion({...medicion, aislamiento: e.target.value})} /></div>
              </div>
            </div>
            <div className="bg-yellow-50 p-8 rounded-3xl border-2 border-yellow-100 flex items-center justify-center">
              <div className="text-center space-y-4">
                <ShieldAlert className="mx-auto text-yellow-600" size={48} />
                <p className="text-xs font-bold text-yellow-800 uppercase leading-relaxed max-w-xs mx-auto">Estas mediciones alimentan automáticamente el protocolo de recepción final.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'checklist' && (
          <div className="space-y-4 animate-in fade-in">
            <h3 className="text-xl font-black text-slate-800 uppercase italic border-b pb-4">Inspección Visual (RIC 19)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(checklist).map(([k, v]) => (
                <button key={k} onClick={() => setChecklist({...checklist, [k]: !v})} className={`flex justify-between items-center p-6 rounded-2xl border-2 transition-all ${v ? 'bg-emerald-50 border-emerald-500 shadow-md' : 'bg-white border-slate-100'}`}>
                  <span className={`text-[10px] font-black uppercase ${v ? 'text-emerald-700' : 'text-slate-400'}`}>{k.replace(/_/g, ' ')}</span>
                  {v ? <CheckCircle2 className="text-emerald-600"/> : <div className="w-6 h-6 rounded-full border-2 border-slate-200"/>}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'ohm' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[{ id: 'v', label: 'Voltaje (V)' }, { id: 'i', label: 'Corriente (A)' }, { id: 'r', label: 'Resistencia (Ω)' }, { id: 'p', label: 'Potencia (W)' }].map((item) => (
              <div key={item.id} className="flex gap-2">
                <div className="flex-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">{item.label}</label><input type="number" value={(ohm as any)[item.id]} onChange={(e)=>setOhm({...ohm, [item.id]: e.target.value})} className={inputStyle} /></div>
                <button onClick={()=>calcularOhm(item.id)} className="mt-5 bg-slate-900 text-[#ffc600] px-6 rounded-2xl text-[10px] font-black uppercase">Calc</button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'protecciones' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in fade-in">
            <div className="space-y-6">
              <h3 className="text-xl font-black text-slate-800 uppercase italic">Curvas de Protección</h3>
              <input type="number" placeholder="Consumo (W o A)" className={inputStyle} onChange={e => setProt({...prot, valor: e.target.value})} />
              <div className="grid grid-cols-2 gap-2">
                {(['iluminacion', 'uso_general', 'motores', 'transformadores'] as CargaTipo[]).map(t => (
                  <button key={t} onClick={() => setProt({...prot, tipo: t})} className={`p-4 rounded-xl text-[9px] font-black uppercase border-2 transition-all ${prot.tipo === t ? 'bg-slate-900 text-[#ffc600] border-slate-900 shadow-lg' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-300'}`}>{t.replace('_', ' ')}</button>
                ))}
              </div>
            </div>
            {calculoProteccion && (
              <div className="bg-slate-900 p-8 rounded-[2rem] text-white flex flex-col justify-center border-l-[12px] border-[#ffc600]">
                 <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Automático Recomendado</p>
                 <h2 className="text-6xl font-black text-[#ffc600] italic mb-4">{calculoProteccion.mcb}A</h2>
                 <div className="bg-white/5 p-4 rounded-xl">
                   <p className="text-[10px] font-black uppercase text-slate-400">Curva {calculoProteccion.curva.letra}</p>
                   <p className="text-xs font-bold text-white italic">{calculoProteccion.curva.desc}</p>
                 </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ductos' && (
          <div className="space-y-8">
             <div className="flex flex-col md:flex-row gap-4">
                <select id="secDucto" className={`${inputStyle} md:w-2/3`}>{Object.keys(diametroExternoCable).map(s => <option key={s} value={s}>{s} mm²</option>)}</select>
                <button onClick={() => { const sec = (document.getElementById('secDucto') as HTMLSelectElement).value; setDuctos([...ductos, { seccion: sec, cantidad: 1 }]); }} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px]">Agregar Conductor</button>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {ductos.map((d, i) => (
                 <div key={i} className="flex justify-between items-center bg-slate-50 p-5 rounded-2xl border-2 border-slate-100">
                   <span className="font-black text-xs uppercase text-slate-500">{d.seccion} mm²</span>
                   <div className="flex items-center gap-4">
                     <input type="number" value={d.cantidad} onChange={(e) => { const n = [...ductos]; n[i].cantidad = parseInt(e.target.value) || 0; setDuctos(n); }} className="w-16 text-center font-black bg-white rounded-xl border-2 border-slate-200 p-2" />
                     <button onClick={() => setDuctos(ductos.filter((_, idx) => idx !== i))} className="text-rose-500 hover:scale-110 transition-all"><Trash2 size={24}/></button>
                   </div>
                 </div>
               ))}
             </div>
             {calcDucto && <div className="p-10 bg-slate-900 rounded-[2rem] text-white text-center"><p className="text-[10px] font-black uppercase text-slate-500 mb-2">Canalización Sugerida (RIC)</p><h3 className="text-5xl font-black italic text-[#ffc600]">{calcDucto.sugerido}</h3></div>}
          </div>
        )}

        {activeTab === 'condensadores' && (
          <div className="space-y-8">
            <h3 className="text-xl font-black text-slate-800 uppercase italic">Mejora de Cos φ</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input type="number" id="kw" className={inputStyle} placeholder="Potencia (kW)" />
              <input type="number" id="fi1" className={inputStyle} placeholder="Cos φ Act" />
              <input type="number" id="fi2" className={inputStyle} placeholder="Cos φ Meta" />
            </div>
            <button onClick={() => {
              const P = parseFloat((document.getElementById('kw') as HTMLInputElement).value);
              const f1 = parseFloat((document.getElementById('fi1') as HTMLInputElement).value);
              const f2 = parseFloat((document.getElementById('fi2') as HTMLInputElement).value);
              if (P && f1 && f2) setResKvar(P * (Math.tan(Math.acos(f1)) - Math.tan(Math.acos(f2))));
            }} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-xs">Calcular kVAr</button>
            {resKvar && <div className="p-10 bg-emerald-600 rounded-[2rem] text-white text-center"><p className="text-xs font-black uppercase mb-2">Banco de Condensadores Requerido</p><h3 className="text-5xl font-black italic">{resKvar.toFixed(2)} kVAr</h3></div>}
          </div>
        )}

        {activeTab === 'iluminacion' && (
          <div className="space-y-8">
            <h3 className="text-xl font-black text-slate-800 uppercase italic">Cálculo Lumínico</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="number" id="l" className={inputStyle} placeholder="Largo Recinto" />
              <input type="number" id="a" className={inputStyle} placeholder="Ancho Recinto" />
              <select id="lx" className={inputStyle}>
                <option value="100">Zonas de paso (100 lx)</option>
                <option value="300">Zonas de trabajo (300 lx)</option>
                <option value="500">Trabajo de precisión (500 lx)</option>
              </select>
              <input type="number" id="lm" className={inputStyle} placeholder="Lúmenes por Equipo" />
            </div>
            <button onClick={() => {
              const l = parseFloat((document.getElementById('l') as HTMLInputElement).value);
              const a = parseFloat((document.getElementById('a') as HTMLInputElement).value);
              const lx = parseFloat((document.getElementById('lx') as HTMLInputElement).value);
              const lm = parseFloat((document.getElementById('lm') as HTMLInputElement).value);
              if (l && a && lx && lm) setResLux(Math.ceil((l * a * lx) / (lm * 0.5)));
            }} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-xs">Calcular Cantidad de Equipos</button>
            {resLux && <div className="p-10 bg-indigo-600 rounded-[2rem] text-white text-center"><p className="text-xs font-black uppercase mb-2">Equipos Necesarios</p><h3 className="text-5xl font-black italic">{resLux} Unidades</h3></div>}
          </div>
        )}

        {activeTab === 'awg' && (
          <div className="space-y-4 animate-in zoom-in-95">
             <h3 className="text-xl font-black text-slate-800 uppercase italic">Conversión AWG a Métrico</h3>
             <div className="rounded-[2rem] border-2 border-slate-100 overflow-hidden shadow-sm">
                <table className="w-full text-center">
                  <thead className="bg-slate-900 text-[#ffc600] text-[10px] font-black uppercase">
                    <tr><th className="p-5">AWG / kcmil</th><th className="p-5">Equivalente mm²</th><th className="p-5">Ampacidad</th></tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-50 font-black italic text-slate-600">
                    {tablaAWG.map(x => <tr key={x.awg} className="hover:bg-slate-50"><td className="p-5">{x.awg}</td><td className="p-5 text-slate-900">{x.mm2}</td><td className="p-5 text-rose-500">{x.amp}A</td></tr>)}
                  </tbody>
                </table>
             </div>
          </div>
        )}

        {/* INFORME TÉCNICO */}
        {activeTab === 'informe' && (
          <div className="animate-in zoom-in-95 duration-500">
            <div id="print-area" className="border-[10px] border-slate-900 p-8 md:p-16 rounded-[4rem] bg-white text-slate-900 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10"><Zap size={200}/></div>
              
              <div className="flex flex-col md:flex-row justify-between items-start border-b-8 border-slate-900 pb-10 mb-12 gap-8">
                <div className="space-y-4">
                  <h2 className="text-6xl font-black uppercase italic tracking-tighter leading-[0.8]">Informe <br/>Técnico <br/><span className="text-[#ffc600]">RIC N°18/19</span></h2>
                  <p className="text-xs font-black uppercase bg-slate-900 text-white inline-block px-4 py-1">Memoria de Ingeniería Eléctrica</p>
                </div>
                <div className="md:text-right font-black italic space-y-1">
                  <p className="text-slate-400 text-[10px] uppercase not-italic">Proyecto</p>
                  <p className="text-3xl">INN-VOLT-2026</p>
                  <p className="text-slate-400 text-[10px] uppercase not-italic mt-4">Fecha de Emisión</p>
                  <p className="text-lg uppercase">{new Date().toLocaleDateString()}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                <section className="space-y-6">
                  <h4 className="flex items-center gap-3 text-sm font-black uppercase border-b-2 border-slate-900 pb-2"><Scale size={18}/> 01. Parámetros del Alimentador</h4>
                  <div className="space-y-3 text-[12px] font-bold uppercase text-slate-600 border-l-8 border-[#ffc600] pl-6">
                    <p>• Carga Declarada: <span className="text-slate-900">{calc.valor} {calc.modo}</span></p>
                    <p>• Corriente Calculada: <span className="text-slate-900">{resCaida?.i || '---'} A</span></p>
                    <p>• Sección Conductor: <span className="text-slate-900">{resCaida?.seccion || '---'} mm²</span></p>
                    <p>• Ampacidad Máx: <span className="text-slate-900">{resCaida?.ampacidadMax || '---'} A</span></p>
                    <p>• Caída Tensión: <span className={resCaida?.cumpleVoltaje ? 'text-emerald-600' : 'text-rose-600'}>{resCaida?.p || '0.00'} %</span></p>
                    <p>• ITM Recomendado: <span className="text-slate-900">{resCaida?.mcb || '---'} A</span></p>
                  </div>
                </section>

                <section className="space-y-6">
                  <h4 className="flex items-center gap-3 text-sm font-black uppercase border-b-2 border-slate-900 pb-2"><Gauge size={18}/> 02. Pruebas de Terreno</h4>
                  <div className="space-y-3 text-[12px] font-bold uppercase text-slate-600 border-l-8 border-[#ffc600] pl-6">
                    <p>• V. Medido: <span className="text-slate-900">{medicion.voltajeReal || '---'} V</span></p>
                    <p>• P. a Tierra: <span className="text-slate-900">{medicion.tierra || '---'} Ω</span></p>
                    <p>• Aislamiento: <span className="text-slate-900">{medicion.aislamiento || '---'} MΩ</span></p>
                  </div>
                </section>
              </div>

              <div className="mt-24 pt-10 border-t-8 border-slate-900 flex flex-col md:flex-row justify-between gap-12">
                <div className="flex-1 text-center">
                  <div className="h-1 bg-slate-900 mb-4 opacity-10"></div>
                  <p className="text-[10px] font-black uppercase italic tracking-widest">Responsable Técnico</p>
                </div>
                <div className="flex-1 text-center">
                  <div className="h-1 bg-slate-900 mb-4 opacity-10"></div>
                  <p className="text-[10px] font-black uppercase italic tracking-widest">Aprobación Cliente</p>
                </div>
              </div>
            </div>
            
            <button onClick={() => window.print()} className="w-full mt-10 bg-slate-900 text-white py-8 rounded-[2.5rem] font-black uppercase text-sm flex items-center justify-center gap-4 hover:scale-[1.02] transition-all shadow-2xl">
              <Printer /> Generar PDF / Imprimir
            </button>
          </div>
        )}

      </main>

      {/* DASHBOARD FLOTANTE */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] md:w-auto bg-slate-900/95 backdrop-blur-md text-white px-8 py-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex justify-around md:justify-between items-center gap-6 md:gap-12 border border-white/10 z-[100] no-print">
        <div className="flex flex-col"><span className="text-[7px] font-black text-slate-500 uppercase">RIC 19</span><span className="text-lg font-black italic text-[#ffc600]">{Object.values(checklist).filter(v => v).length}/7</span></div>
        <div className="flex flex-col border-l border-white/10 pl-6 md:pl-12"><span className="text-[7px] font-black text-slate-500 uppercase">ΔV %</span><span className={`text-lg font-black italic ${resCaida?.cumpleVoltaje ? 'text-emerald-400' : 'text-rose-400'}`}>{resCaida?.p || '0.0'}%</span></div>
        <div className="flex flex-col border-l border-white/10 pl-6 md:pl-12"><span className="text-[7px] font-black text-slate-500 uppercase">Estado Térmico</span><span className={`text-lg font-black italic ${resCaida?.cumpleAmpacidad ? 'text-emerald-400' : 'text-rose-400'}`}>{resCaida?.cumpleAmpacidad ? 'OK' : 'PELIGRO'}</span></div>
      </div>
    </div>
  );
}