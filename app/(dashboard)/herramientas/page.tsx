'use client';

import { useState, useMemo } from 'react';
import { 
  Zap, Ruler, ShieldAlert, Cpu, ChevronRight, 
  Info, RefreshCcw, Activity, Lightbulb, 
  CheckCircle2, AlertTriangle, Gauge, ArrowRightLeft, Boxes,
  ZapOff, Waves, HardHat, Zap as IconOhm
} from 'lucide-react';

type CargaTipo = 'iluminacion' | 'uso_general' | 'motores' | 'transformadores';

export default function HerramientasProInnVolt() {
  const [activeTab, setActiveTab] = useState<'caida' | 'ohm' | 'protecciones' | 'iluminacion' | 'condensadores'>('caida');
  
  const [ohm, setOhm] = useState({ v: '', i: '', r: '', p: '' });
  const [calc, setCalc] = useState({ modo: 'W', fase: '1', valor: '', largo: '', vNominal: '220', seccion: '2.5', fp: '0.93' });
  const [prot, setProt] = useState({ valor: '', tipo: 'uso_general' as CargaTipo });
  const [resCaida, setResCaida] = useState<any>(null);
  const [resLux, setResLux] = useState<number | null>(null);
  const [resKvar, setResKvar] = useState<number | null>(null);

  const capacidadCables: Record<string, number> = {
    '1.5': 15, '2.5': 20, '4': 28, '6': 36, '10': 50, '16': 66, '25': 88, '35': 109
  };

  const calculoProteccion = useMemo(() => {
    const val = parseFloat(prot.valor);
    if (!val) return null;
    const amperes = val > 150 ? val / (parseFloat(calc.vNominal) * 0.93) : val;
    const disyuntores = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];
    const sugerido = disyuntores.find(d => d >= amperes * 1.25) || 125;

    const curvas = {
      iluminacion: { letra: 'B', desc: 'Resistiva/Cargas rápidas', color: 'text-blue-400', bg: 'bg-blue-500/10' },
      uso_general: { letra: 'C', desc: 'Cargas mixtas estándar', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
      motores: { letra: 'D', desc: 'Alto arranque (Motores)', color: 'text-red-400', bg: 'bg-red-500/10' },
      transformadores: { letra: 'D', desc: 'Picos inductivos altos', color: 'text-red-400', bg: 'bg-red-500/10' }
    };

    return {
      i: amperes.toFixed(2),
      mcb: sugerido,
      curva: curvas[prot.tipo],
      diferencial: sugerido <= 25 ? 25 : (sugerido <= 40 ? 40 : 63)
    };
  }, [prot, calc.vNominal]);

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
    
    setResCaida({
      i: I.toFixed(2), dv: deltaV.toFixed(2), p: porcentaje.toFixed(2),
      cumple: porcentaje <= 3, ampMax: capacidadCables[calc.seccion],
      proteccion: sugerido,
      diferencial: sugerido <= 25 ? 25 : (sugerido <= 40 ? 40 : 63)
    });
  };

  const calcularOhm = (target: string) => {
    const v = parseFloat(ohm.v); const i = parseFloat(ohm.i); 
    const r = parseFloat(ohm.r); const p = parseFloat(ohm.p);
    if (target === 'v') setOhm({...ohm, v: i && r ? (i * r).toFixed(2) : (p / i).toFixed(2)});
    if (target === 'i') setOhm({...ohm, i: v && r ? (v / r).toFixed(2) : (p / v).toFixed(2)});
    if (target === 'p') setOhm({...ohm, p: v && i ? (v * i).toFixed(2) : (Math.pow(i, 2) * r).toFixed(2)});
    if (target === 'r') setOhm({...ohm, r: v && i ? (v / i).toFixed(2) : (Math.pow(v, 2) / p).toFixed(2)});
  };

  // ESTILO DE INPUT CON ALTO CONTRASTE PARA ESCRITURA
  const inputStyle = "w-full bg-slate-100 p-4 rounded-2xl text-slate-900 text-lg sm:text-2xl font-black outline-none border-2 border-slate-200 focus:border-slate-900 focus:bg-white placeholder-slate-400 transition-all";

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-4 bg-slate-50 min-h-screen">
      
      {/* NAVEGACIÓN */}
      <div className="bg-[#1e293b] p-2 rounded-2xl shadow-2xl sticky top-2 z-50">
        <div className="flex overflow-x-auto no-scrollbar gap-1">
          {[
            { id: 'caida', label: 'Cálculo RIC', icon: <Ruler size={14}/> },
            { id: 'ohm', label: 'Ohm', icon: <IconOhm size={14}/> },
            { id: 'protecciones', label: 'Protec.', icon: <ShieldAlert size={14}/> },
            { id: 'condensadores', label: 'Coseno φ', icon: <Gauge size={14}/> },
            { id: 'iluminacion', label: 'Luz', icon: <Lightbulb size={14}/> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase whitespace-nowrap flex-1 justify-center ${activeTab === tab.id ? 'bg-[#ffc600] text-[#1e293b]' : 'text-slate-400'}`}
            >
              {tab.icon} <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        <div className="lg:col-span-8 bg-white p-6 sm:p-10 rounded-[2.5rem] shadow-sm border border-slate-200">
          
          {activeTab === 'caida' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 gap-4">
                <h2 className="font-black text-xl text-slate-800 uppercase italic">Memoria de Alimentadores</h2>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
                  {['W', 'A'].map(m => (
                    <button key={m} onClick={() => setCalc({...calc, modo: m})} className={`flex-1 px-4 py-2 rounded-lg text-[10px] font-black transition-all ${calc.modo === m ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>{m === 'W' ? 'WATTS' : 'AMPERES'}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 italic">Valor ({calc.modo})</label>
                  <input type="number" value={calc.valor} onChange={(e)=>setCalc({...calc, valor: e.target.value})} className={inputStyle} placeholder="0.00" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 italic">Sección mm²</label>
                  <select value={calc.seccion} onChange={(e)=>setCalc({...calc, seccion: e.target.value})} className="w-full bg-[#1e293b] text-[#ffc600] p-4 rounded-2xl text-xl font-black appearance-none border-2 border-transparent">
                    {Object.keys(capacidadCables).map(s => <option key={s} value={s}>{s} mm² ({capacidadCables[s]}A)</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 italic">Largo (m)</label>
                  <input type="number" value={calc.largo} onChange={(e)=>setCalc({...calc, largo: e.target.value})} className={inputStyle} placeholder="0" />
                </div>
                <div className="flex gap-2 pt-4">
                  <button onClick={() => setCalc({...calc, fase: '1', vNominal: '220'})} className={`flex-1 p-4 rounded-xl font-black text-[10px] uppercase border-2 transition-all ${calc.fase === '1' ? 'border-[#ffc600] bg-yellow-50 text-slate-900' : 'border-slate-100 text-slate-400'}`}>220V</button>
                  <button onClick={() => setCalc({...calc, fase: '3', vNominal: '380'})} className={`flex-1 p-4 rounded-xl font-black text-[10px] uppercase border-2 transition-all ${calc.fase === '3' ? 'border-[#ffc600] bg-yellow-50 text-slate-900' : 'border-slate-100 text-slate-400'}`}>380V</button>
                </div>
              </div>
              <button onClick={calcularCaida} className="w-full bg-[#ffc600] text-[#1e293b] py-5 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all">Generar Cálculo de Tensión</button>
            </div>
          )}

          {activeTab === 'ohm' && (
            <div className="space-y-6 animate-in fade-in">
              <h2 className="font-black text-xl text-slate-800 uppercase italic border-b pb-4">Ley de Ohm</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[
                  { id: 'v', label: 'Voltaje (V)' }, { id: 'i', label: 'Corriente (A)' },
                  { id: 'r', label: 'Resistencia (Ω)' }, { id: 'p', label: 'Potencia (W)' },
                ].map((item) => (
                  <div key={item.id} className="space-y-1">
                    <label className="text-[12px] font-black text-slate-400 uppercase ml-2">{item.label}</label>
                    <div className="flex gap-2">
                      <input type="number" value={(ohm as any)[item.id]} onChange={(e)=>setOhm({...ohm, [item.id]: e.target.value})} className={inputStyle} placeholder="0.00" />
                      <button onClick={()=>calcularOhm(item.id)} className="bg-slate-900 text-[#ffc600] px-6 rounded-2xl text-[12px] font-black shadow-lg">CALC</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'protecciones' && (
            <div className="space-y-6 animate-in fade-in">
              <h2 className="font-black text-xl text-slate-800 uppercase italic border-b pb-4">Curvas de Protección</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 italic">Carga de Consumo</label>
                  <input type="number" className={inputStyle} onChange={(e) => setProt({...prot, valor: e.target.value})} placeholder="Watts o Amperes" />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-2 italic">Tipo Aplicación</label>
                   <div className="grid grid-cols-2 gap-2">
                      {(['iluminacion', 'uso_general', 'motores', 'transformadores'] as CargaTipo[]).map(t => (
                        <button key={t} onClick={() => setProt({...prot, tipo: t})} className={`p-3 rounded-xl text-[9px] font-black uppercase border-2 transition-all ${prot.tipo === t ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-100 text-slate-400'}`}>{t.replace('_', ' ')}</button>
                      ))}
                   </div>
                </div>
              </div>
              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-[11px] font-bold text-blue-800 flex gap-4 items-center">
                <Info className="text-blue-500 shrink-0" size={20} />
                <p>El disyuntor se dimensiona a 1.25x la corriente nominal según RIC.</p>
              </div>
            </div>
          )}

          {activeTab === 'condensadores' && (
            <div className="space-y-6 animate-in fade-in">
              <h2 className="font-black text-xl text-slate-800 uppercase italic border-b pb-4">Factor de Potencia</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">kW</label><input type="number" id="kw" className={inputStyle} placeholder="0" /></div>
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">cos φ Actual</label><input type="number" id="fi1" className={inputStyle} placeholder="0.8" /></div>
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">cos φ Meta</label><input type="number" id="fi2" className={inputStyle} placeholder="0.95" /></div>
              </div>
              <button onClick={() => {
                const P = parseFloat((document.getElementById('kw') as HTMLInputElement).value);
                const f1 = parseFloat((document.getElementById('fi1') as HTMLInputElement).value);
                const f2 = parseFloat((document.getElementById('fi2') as HTMLInputElement).value);
                if (P && f1 && f2) setResKvar(P * (Math.tan(Math.acos(f1)) - Math.tan(Math.acos(f2))));
              }} className="w-full bg-slate-900 text-[#ffc600] py-4 rounded-2xl font-black uppercase shadow-xl">Calcular Banco kVAr</button>
            </div>
          )}

          {activeTab === 'iluminacion' && (
            <div className="space-y-6 animate-in fade-in">
              <h2 className="font-black text-xl text-slate-800 uppercase italic border-b pb-4">Iluminación</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Largo (m)</label><input type="number" id="l" className={inputStyle} /></div>
                  <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Ancho (m)</label><input type="number" id="a" className={inputStyle} /></div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase">Lux Requerido</label>
                  <select id="lx" className="w-full bg-[#1e293b] text-[#ffc600] p-4 rounded-xl text-lg font-black outline-none appearance-none">
                    <option value="100">Pasillos (100 lx)</option>
                    <option value="300">Oficinas (300 lx)</option>
                    <option value="500">Talleres (500 lx)</option>
                  </select>
                </div>
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Flujo Lámpara (lm)</label><input type="number" id="lm" className={inputStyle} /></div>
                <button onClick={() => {
                  const l = parseFloat((document.getElementById('l') as HTMLInputElement).value);
                  const a = parseFloat((document.getElementById('a') as HTMLInputElement).value);
                  const lx = parseFloat((document.getElementById('lx') as HTMLInputElement).value);
                  const lm = parseFloat((document.getElementById('lm') as HTMLInputElement).value);
                  if (l && a && lx && lm) setResLux(Math.ceil((l * a * lx) / (lm * 0.5)));
                }} className="bg-[#ffc600] text-[#1e293b] rounded-2xl font-black uppercase shadow-lg h-[68px] mt-auto active:scale-95 transition-all">Calcular Unidades</button>
              </div>
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA: RESULTADOS Y MEMORIA */}
        <div className="lg:col-span-4 space-y-6">
          
          {activeTab === 'caida' && resCaida && (
            <div className={`p-8 rounded-[2.5rem] shadow-2xl transition-all ${parseFloat(resCaida.p) > 3 ? 'bg-red-600' : 'bg-emerald-600'} text-white`}>
              <p className="text-[10px] font-black uppercase opacity-60 mb-2">Caída de Tensión</p>
              <h2 className="text-6xl font-black tracking-tighter mb-6">{resCaida.p}%</h2>
              <div className="space-y-3 font-bold text-[10px]">
                <div className="bg-black/10 p-3 rounded-xl flex justify-between"><span>Disyuntor</span><span className="text-yellow-300">{resCaida.proteccion}A</span></div>
                <div className="bg-black/10 p-3 rounded-xl flex justify-between"><span>V Perdido</span><span>{resCaida.dv} V</span></div>
              </div>
            </div>
          )}

          {activeTab === 'protecciones' && calculoProteccion && (
            <div className={`p-8 rounded-[2.5rem] shadow-2xl bg-[#1e293b] text-white border-t-[10px] ${calculoProteccion.curva.letra === 'B' ? 'border-blue-500' : (calculoProteccion.curva.letra === 'C' ? 'border-yellow-500' : 'border-red-500')}`}>
                <div className="flex justify-between items-start mb-4">
                  <p className="text-[9px] font-black uppercase opacity-60">Resultado MCB</p>
                  <div className={`${calculoProteccion.curva.bg} ${calculoProteccion.curva.color} px-3 py-1 rounded-full text-[9px] font-black italic`}>Curva {calculoProteccion.curva.letra}</div>
                </div>
                <h2 className="text-6xl font-black tracking-tighter mb-2">{calculoProteccion.mcb}A</h2>
                <p className="text-[10px] font-bold text-slate-400 mb-6">{calculoProteccion.curva.desc}</p>
                <div className="space-y-2 font-bold text-[10px]">
                  <div className="bg-white/5 p-3 rounded-xl flex justify-between"><span>Diferencial</span><span>{calculoProteccion.diferencial}A</span></div>
                  <div className="bg-white/5 p-3 rounded-xl flex justify-between"><span>Corriente</span><span>{calculoProteccion.i} A</span></div>
                </div>
            </div>
          )}

          {activeTab === 'ohm' && (
            <div className="bg-[#1e293b] p-8 rounded-[2.5rem] text-white shadow-2xl">
               <h3 className="text-xl font-black uppercase italic mb-6">Valores <span className="text-[#ffc600]">Calculados</span></h3>
               <div className="grid grid-cols-1 gap-2 font-mono">
                  {[
                    { l: 'Voltaje (V)', v: ohm.v }, { l: 'Corriente (I)', v: ohm.i },
                    { l: 'Resistencia (R)', v: ohm.r }, { l: 'Potencia (P)', v: ohm.p }
                  ].map(x => (
                    <div key={x.l} className="flex justify-between border-b border-white/10 pb-2 text-[11px]"><span>{x.l}:</span><span className="text-[#ffc600] font-bold">{x.v || '---'}</span></div>
                  ))}
               </div>
            </div>
          )}

          {activeTab === 'condensadores' && resKvar !== null && (
            <div className="bg-gradient-to-br from-indigo-600 to-blue-900 p-8 rounded-3xl text-white shadow-2xl">
               <p className="text-[9px] font-black uppercase opacity-60 mb-1">Banco Reactivo</p>
               <h2 className="text-5xl font-black mb-4">{resKvar.toFixed(2)} <span className="text-sm">kVAr</span></h2>
            </div>
          )}

          {activeTab === 'iluminacion' && resLux !== null && (
            <div className="bg-[#ffc600] p-8 rounded-3xl text-slate-900 shadow-2xl">
               <p className="text-[9px] font-black uppercase opacity-60 mb-1">Luminarias</p>
               <h2 className="text-6xl font-black mb-4">{resLux}</h2>
            </div>
          )}

          {/* MEMORIA DE CÁLCULO VARIABLE */}
          <div className="bg-white p-6 rounded-3xl space-y-3 border border-slate-200">
             <h4 className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-2"><HardHat size={16}/> Memoria Técnica</h4>
             <div className="font-mono text-[10px] text-slate-600 space-y-2">
                {activeTab === 'caida' && (
                  <div className="space-y-1">
                    <p className="text-blue-600 font-bold">ΔV% = (k·L·I·ρ / S·V) · 100</p>
                    <p className="text-[9px]">Monofásico: k=2 | Trifásico: k=√3</p>
                    <p className="text-[9px]">ρ Cobre = 0.0178 (Norma RIC)</p>
                  </div>
                )}
                {activeTab === 'protecciones' && (
                  <div className="space-y-1">
                    <p className="text-blue-600 font-bold">In = P / (V·cosφ)</p>
                    <p className="text-blue-600 font-bold">MCB ≥ In · 1.25</p>
                    <p className="text-[9px]">Capacidad máxima cable según sección.</p>
                  </div>
                )}
                {activeTab === 'condensadores' && (
                  <div className="space-y-1 text-[9px]">
                    <p className="text-blue-600 font-bold text-[10px]">Qc = P · (tan φ1 - tan φ2)</p>
                    <p>φ1 = acos(cos φ actual)</p>
                    <p>φ2 = acos(cos φ meta)</p>
                  </div>
                )}
                <div className="pt-2 mt-2 border-t border-slate-100 opacity-50 italic text-[9px]">
                  Cálculos basados en Pliego Técnico Normativo RIC 2026.
                </div>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}