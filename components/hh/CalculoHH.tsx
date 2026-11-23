'use client';

/**
 * Comercial → Calculadora HH (fase 23): el valor de la hora-hombre por cargo con la base en UF (o
 * en USD para software), para que las tarifas no se desvaloricen. Módulo independiente del
 * cotizador. Pestañas:
 *   · Calculadora (hh.ver): quién hace el trabajo, con cuál de sus cargos (o un trabajo tipo), las
 *     horas reales y el multiplicador según el tipo de tarea → precio neto en CLP y en UF.
 *   · Equipo HH: con hh.configurar, las personas y sus cargos (tarifa propia, predeterminado); sin
 *     él, «Mis cargos HH».
 *   · Cargos HH, Trabajos tipo y Parámetros (hh.configurar).
 * La UF y el dólar del día se muestran arriba, siempre con su fuente y su fecha.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { faltaFase23, hhService, mensajeHH, type CatalogoHH } from '@/services/hh';
import { formatoIndicador } from '@/lib/hh/calculo';
import { NOMBRE_FUENTE, hoyEnChile, type IndicadoresDia, type ValorIndicador } from '@/lib/hh/indicadores';
import { fechaCL } from './comun';
import Calculadora from './Calculadora';
import EquipoHH from './EquipoHH';
import CargosHH from './CargosHH';
import TrabajosTipoHH from './TrabajosTipoHH';
import ParametrosHH from './ParametrosHH';

type Pestana = 'calculadora' | 'equipo' | 'cargos' | 'trabajos' | 'parametros';

/** Sin respuesta de la ruta (sin red): el respaldo de los parámetros. */
function respaldoDia(cat: CatalogoHH): IndicadoresDia {
  const fecha = cat.parametros.updated_at ? hoyEnChile(new Date(cat.parametros.updated_at)) : hoyEnChile();
  return {
    uf: { valor: cat.parametros.uf_respaldo, fecha, fuente: 'respaldo', anterior: true },
    usd: { valor: cat.parametros.usd_respaldo, fecha, fuente: 'respaldo', anterior: true },
  };
}

function Indicador({ nombre, v }: { nombre: string; v: ValorIndicador }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
      <span className="label-muted">{nombre}</span>
      <b style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{formatoIndicador(v.valor)}</b>
      <span style={{ fontSize: '0.74rem', color: v.anterior ? 'var(--danger)' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {v.anterior && <AlertTriangle size={11} aria-hidden />}
        {NOMBRE_FUENTE[v.fuente]} · {fechaCL(v.fecha)}{v.anterior ? ' (no es de hoy)' : ''}
      </span>
    </span>
  );
}

export default function CalculoHH() {
  const { puede, perfil } = usePermisos();
  const { error: toastError } = useToast();
  const configura = puede('hh.configurar');
  const [cat, setCat] = useState<CatalogoHH | null>(null);
  const [ind, setInd] = useState<IndicadoresDia | null>(null);
  const [errInd, setErrInd] = useState('');
  const [leyendoInd, setLeyendoInd] = useState(false);
  const [falta, setFalta] = useState(false);
  const [pestana, setPestana] = useState<Pestana>('calculadora');

  const cargar = useCallback(async () => {
    try { setCat(await hhService.catalogo()); }
    catch (e) { if (faltaFase23(e)) setFalta(true); else toastError(mensajeHH(e, 'No se pudo cargar la calculadora.')); }
  }, [toastError]);
  const leerIndicadores = useCallback(async () => {
    try { setInd(await hhService.indicadores()); setErrInd(''); }
    catch (e) { setErrInd(e instanceof Error ? e.message : 'No se pudo leer la UF del día.'); }
    finally { setLeyendoInd(false); }
  }, []);
  useEffect(() => { cargar(); leerIndicadores(); }, [cargar, leerIndicadores]);

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Comercial" title="Calculadora HH" /><FaltaSQL archivo="supabase_fase23_calculo_hh.sql" /></div>;
  if (!cat) return <div className="skeleton" style={{ height: 260 }} />;

  const dia = ind ?? respaldoDia(cat);
  const valores = { uf: dia.uf.valor, usd: dia.usd.valor };
  const PESTANAS: [Pestana, string][] = [
    ['calculadora', 'Calculadora'],
    ['equipo', configura ? 'Equipo HH' : 'Mis cargos HH'],
    ...(configura ? [['cargos', 'Cargos HH'], ['trabajos', 'Trabajos tipo'], ['parametros', 'Parámetros'] ] as [Pestana, string][] : []),
  ];
  const props = { cat, valores, dia, onCambio: cargar };

  return (
    <div className="anim-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="Comercial" title="Calculadora HH"
        subtitle="El valor de la hora-hombre por cargo, en UF (o USD para software) para que no se desvalorice. Valores netos: el IVA va al final." />

      <div className="panel" style={{ padding: '0.65rem 1rem', display: 'flex', gap: '0.6rem 1.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <Indicador nombre="UF" v={dia.uf} />
        <Indicador nombre="Dólar" v={dia.usd} />
        <span style={{ flex: 1 }} />
        {errInd && <span style={{ fontSize: '0.76rem', color: 'var(--danger)' }}>{errInd}</span>}
        <button className="btn btn-ghost btn-xs" disabled={leyendoInd} onClick={() => { setLeyendoInd(true); leerIndicadores(); }} aria-label="Volver a leer la UF y el dólar">
          {leyendoInd ? <Loader2 size={12} className="iv-spin" /> : <RefreshCw size={12} />} Actualizar
        </button>
      </div>

      <div role="tablist" aria-label="Secciones de la calculadora HH" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {PESTANAS.map(([v, t]) => (
          <button key={v} role="tab" aria-selected={pestana === v} className="btn btn-sm" onClick={() => setPestana(v)}
            style={{ background: pestana === v ? 'var(--y-brand)' : 'var(--bg3)', color: pestana === v ? '#111' : 'var(--muted)' }}>{t}</button>
        ))}
      </div>

      {pestana === 'calculadora' && <Calculadora {...props} configura={configura} miId={perfil?.id ?? null} />}
      {pestana === 'equipo' && <EquipoHH {...props} configura={configura} miId={perfil?.id ?? null} />}
      {pestana === 'cargos' && configura && <CargosHH {...props} />}
      {pestana === 'trabajos' && configura && <TrabajosTipoHH {...props} />}
      {pestana === 'parametros' && configura && <ParametrosHH {...props} onIndicadores={() => { setLeyendoInd(true); leerIndicadores(); }} />}
    </div>
  );
}
