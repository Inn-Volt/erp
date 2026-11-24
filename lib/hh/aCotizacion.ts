/**
 * Del anteproyecto al cotizador: un cálculo HH guardado se convierte en una cotización en
 * borrador, sin haber cotizado antes (anteproyecto → cotización → trabajo).
 *   · Una partida de instalación con cada trabajo como mano de obra: su precio es el del cálculo
 *     (ya con la urgencia) y su costo, las horas trabajadas × lo que cuesta de verdad la hora de su
 *     cargo (sueldo de mercado × costo empresa ÷ horas facturables). Así el cotizador muestra la
 *     utilidad real, también la que deja el multiplicador donde la IA acelera.
 *   · Los materiales, con su costo y el precio del cálculo (la misma utilidad).
 *   · Una partida de cargos operacionales: cada gasto de operación (se cobra tal cual) y la gestión
 *     de proyecto como % de la cotización (el cotizador la pone al día sola si cambian los montos).
 * Cálculo puro, con pruebas en tests/unit/hh.test.ts.
 */

import { nuevoId } from '@/lib/cotizador/calculo';
import { IVA, type Linea, type PartidaCot } from '@/lib/cotizador/tipos';
import { costoHoraCLP, type GastoOperacion, type ParametrosHH } from './calculo';

export interface LineaParaCotizar {
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  horas_reales: number;
  horas_apoyo: number;
  cargo_id: string;
  cargo_apoyo_id: string | null;
  /** Lo que se cobra por la línea, sin la urgencia. */
  subtotal: number;
}

export interface CalculoParaCotizar {
  nombre: string;
  fecha: string;
  urgencia: boolean;
  parametros: ParametrosHH;
  materiales_costo: number;
  materiales_venta: number;
  operacion: GastoOperacion[];
  gestion_pct: number;
  gestion_monto: number;
  lineas: LineaParaCotizar[];
}

const linea = (l: Partial<Linea> & Pick<Linea, 'partidaId' | 'descripcion' | 'categoria' | 'costo'>): Linea => ({
  id: nuevoId(), unidad: 'global', cantidad: 1, imprevistos: 0, margen: 0, precio: 0, iva: IVA, descuento: 0, fuera: true, ganancia: 0, ...l,
});

/** Una línea con su costo y su precio unitario: la ganancia sale de los dos (el precio queda exacto). */
function conPrecio(costo: number | null, precio: number) {
  const c = costo !== null && costo > 0 ? Math.max(1, Math.round(costo)) : null;
  return c ? { costo: c, ganancia: (precio / c - 1) * 100 } : { costo: precio, ganancia: 0 };
}

export function cotizacionDesdeCalculo(c: CalculoParaCotizar, sueldoDe: (cargoId: string) => number | null) {
  const p = c.parametros;
  const factor = c.urgencia ? 1 + (Number(p.recargo_urgencia) || 0) : 1;
  const costoHora = (cargoId: string | null) => (cargoId ? costoHoraCLP(sueldoDe(cargoId), p) : null);
  const obra: PartidaCot = { id: nuevoId(), nombre: c.nombre.trim() || 'Trabajo', cantidad: 1, unidad: 'global', tipo: 'instalacion' };
  const items: Linea[] = [];

  for (const l of c.lineas) {
    const cantidad = l.cantidad > 0 ? l.cantidad : 1;
    const precio = Math.round((l.subtotal * factor) / cantidad);
    const hPrincipal = costoHora(l.cargo_id);
    const hApoyo = costoHora(l.cargo_apoyo_id);
    const costo = hPrincipal === null ? null
      : (l.horas_reales * hPrincipal + (l.cargo_apoyo_id ? l.horas_apoyo * (hApoyo ?? 0) : 0));
    items.push(linea({
      partidaId: obra.id, descripcion: l.descripcion, categoria: 'mano_obra', unidad: l.unidad?.trim() || 'global', cantidad,
      ...conPrecio(costo, precio),
    }));
  }
  if (c.materiales_venta > 0) {
    items.push(linea({ partidaId: obra.id, descripcion: 'Materiales', categoria: 'material', ...conPrecio(c.materiales_costo, c.materiales_venta) }));
  }

  const partidas: PartidaCot[] = [obra];
  const gastos = c.operacion.filter(g => Number(g.monto) > 0);
  if (gastos.length || c.gestion_pct > 0) {
    const cargos: PartidaCot = { id: nuevoId(), nombre: 'Cargos operacionales', cantidad: 1, unidad: 'global', tipo: 'cargo' };
    partidas.push(cargos);
    for (const g of gastos) {
      items.push(linea({ partidaId: cargos.id, descripcion: g.descripcion.trim() || 'Gasto operacional', categoria: 'operacion', costo: Math.round(Number(g.monto)) }));
    }
    if (c.gestion_pct > 0) {
      items.push(linea({
        partidaId: cargos.id, descripcion: 'Gestión de proyecto y coordinación', categoria: 'operacion', costo: c.gestion_monto,
        cargo: { pct: Math.round(c.gestion_pct * 1000) / 10, base: 'total' },
      }));
    }
  }

  const [a, m, d] = c.fecha.slice(0, 10).split('-');
  return {
    titulo: c.nombre.trim(),
    descripcion_general: `Según el anteproyecto «${c.nombre.trim()}» (Calculadora HH, ${d}-${m}-${a}).`,
    partidas,
    items,
  };
}
