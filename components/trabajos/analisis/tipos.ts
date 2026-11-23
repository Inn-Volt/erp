/** Lo que comparten las pestañas del análisis de proyecto (fase 22). */

import type { LineaEntrada } from '@/lib/analisisProyecto';
import type { TipoCosto } from '@/lib/controlProyecto';

/** «Editar presupuesto»: las pestañas editan el mismo borrador en su propia tabla. */
export interface EdicionPresupuesto {
  activa: boolean;
  cambiar: (clave: string, cambios: Partial<LineaEntrada>) => void;
  agregar: (tipo: TipoCosto, partida: string | null) => void;
  quitar: (clave: string) => void;
}
