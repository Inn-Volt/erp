import { estadoOT } from '@/services/operacion';

/** Etiqueta de color con el estado de una orden de trabajo. */
export default function ChipEstadoOT({ estado }: { estado: string }) {
  const e = estadoOT(estado);
  return <span className="badge" style={{ background: e.color + '1f', color: e.color, fontWeight: 600 }}>{e.nombre}</span>;
}
