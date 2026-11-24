'use client';

/**
 * Comercial → Calculadora HH (fase 23): el valor de la hora-hombre por cargo con la base en UF (o
 * en USD para software), para que las tarifas no se desvaloricen. Módulo independiente del
 * cotizador. Pestañas:
 *   · Calcular (hh.ver): qué trabajo, quién lo hace y cuánto → precio neto en pesos y en UF.
 *   · Equipo: con hh.configurar, todo el equipo por jerarquía (cargos, tarifas, quién está a cargo
 *     de quién); sin él, «Mi equipo»: tus cargos y las personas a tu cargo hacia abajo.
 *   · Cargos, Trabajos tipo y Ajustes (hh.configurar).
 * La UF y el dólar del día se muestran arriba, siempre con su fuente y su fecha. La calculadora
 * queda montada al cambiar de pestaña: lo que se está calculando no se pierde.
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
import s from './hh.module.css';

type Pestana = 'calcular' | 'equipo' | 'cargos' | 'trabajos' | 'ajustes';

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
    <span className={s.indicador}>
      <span className="label-muted">{nombre}</span>
      <span className={s.indicadorValor}>{formatoIndicador(v.valor)}</span>
      <span className={`${s.indicadorFuente} ${v.anterior ? s.indicadorAviso : ''}`} title={v.anterior ? 'No es el valor de hoy' : undefined}>
        {v.anterior && <AlertTriangle size={11} aria-hidden />}
        {NOMBRE_FUENTE[v.fuente]} · {fechaCL(v.fecha)}
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
  const [pestana, setPestana] = useState<Pestana>('calcular');

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
    ['calcular', 'Calcular'],
    ['equipo', configura ? 'Equipo' : 'Mi equipo'],
    ...(configura ? [['cargos', 'Cargos'], ['trabajos', 'Trabajos tipo'], ['ajustes', 'Ajustes']] as [Pestana, string][] : []),
  ];
  const props = { cat, valores, dia, onCambio: cargar };
  const miId = perfil?.id ?? null;

  return (
    <div className={`anim-in ${s.pagina}`}>
      <PageHeader eyebrow="Comercial" title="Calculadora HH"
        subtitle="Cuánto cobrar por un trabajo según quién lo hace y cuánto toma. En UF (o USD para software), valores netos: el IVA va al final." />

      <div className={`panel ${s.indicadores}`}>
        <Indicador nombre="UF" v={dia.uf} />
        <Indicador nombre="Dólar" v={dia.usd} />
        <span style={{ flex: 1 }} />
        {errInd && <span style={{ fontSize: '0.74rem', color: 'var(--danger)' }}>{errInd}</span>}
        <button className="btn btn-ghost btn-xs" disabled={leyendoInd} onClick={() => { setLeyendoInd(true); leerIndicadores(); }} aria-label="Volver a leer la UF y el dólar">
          {leyendoInd ? <Loader2 size={12} className="iv-spin" /> : <RefreshCw size={12} />} Actualizar
        </button>
      </div>

      <div role="tablist" aria-label="Secciones de la calculadora HH" className={s.pestanas}>
        {PESTANAS.map(([v, t]) => (
          <button key={v} role="tab" aria-selected={pestana === v} className={s.pestana} onClick={() => setPestana(v)}>{t}</button>
        ))}
      </div>

      <div hidden={pestana !== 'calcular'}><Calculadora {...props} configura={configura} puedeCotizar={puede('cotizaciones.crear')} miId={miId} /></div>
      {pestana === 'equipo' && <EquipoHH {...props} configura={configura} miId={miId} />}
      {pestana === 'cargos' && configura && <CargosHH {...props} />}
      {pestana === 'trabajos' && configura && <TrabajosTipoHH {...props} />}
      {pestana === 'ajustes' && configura && <ParametrosHH {...props} onIndicadores={() => { setLeyendoInd(true); leerIndicadores(); }} />}
    </div>
  );
}
