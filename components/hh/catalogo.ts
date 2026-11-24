/**
 * Calculadora HH (fase 23): consultas al catálogo cargado (cargos, equipo, tipos de tarea,
 * trabajos tipo) y los cambios de una línea al elegir trabajo, persona, cargo, tipo de tarea o
 * apoyo. Sin React: funciones puras sobre los datos. Sin hh.configurar, el catálogo ya trae solo la
 * persona del usuario y su equipo hacia abajo (lo filtra la base).
 */

import { tarifaEfectiva } from '@/lib/hh/calculo';
import type { LineaHH } from '@/lib/hh/lineas';
import type { CatalogoHH, PersonaCargoHH, PersonaHH } from '@/services/hh';

export function ayudasCatalogo(cat: CatalogoHH, miId: string | null) {
  const cargo = new Map(cat.cargos.map(c => [c.id, c]));
  const tipo = new Map(cat.tipos.map(t => [t.clave, t]));
  const persona = new Map(cat.personas.map(p => [p.id, p]));
  const trabajo = new Map(cat.trabajos.map(t => [t.id, t]));
  /** Los cargos activos de una persona (el cargo y la asignación activos). */
  const asignaciones = (personaId: string): PersonaCargoHH[] =>
    cat.personaCargos.filter(pc => pc.persona_id === personaId && pc.activo && cargo.get(pc.cargo_id)?.activo);
  const asignacion = (personaId: string | null, cargoId: string) =>
    (personaId ? cat.personaCargos.find(pc => pc.persona_id === personaId && pc.cargo_id === cargoId) : undefined);
  const miPersona = miId ? cat.personas.find(p => p.profile_id === miId && p.activo) ?? null : null;

  // El equipo en orden de jerarquía (cada uno seguido de las personas a su cargo).
  const hijos = new Map<string | null, PersonaHH[]>();
  for (const p of cat.personas) {
    const jefe = p.jefe_id && persona.has(p.jefe_id) ? p.jefe_id : null;
    hijos.set(jefe, [...(hijos.get(jefe) || []), p]);
  }
  const arbol: { p: PersonaHH; nivel: number }[] = [];
  const visitados = new Set<string>();
  const recorrer = (jefe: string | null, nivel: number) => {
    const grupo = (hijos.get(jefe) || []).slice().sort((a, b) => (a.id === miPersona?.id ? -1 : b.id === miPersona?.id ? 1 : a.nombre.localeCompare(b.nombre, 'es')));
    for (const p of grupo) {
      if (visitados.has(p.id)) continue;
      visitados.add(p.id);
      arbol.push({ p, nivel });
      recorrer(p.id, nivel + 1);
    }
  };
  recorrer(null, 0);
  const personasActivas = arbol.map(x => x.p).filter(p => p.activo);
  const personasCon = (cargoId: string) => personasActivas.filter(p => asignaciones(p.id).some(a => a.cargo_id === cargoId));
  /** La tarifa base de esa persona en ese cargo (la propia o la del cargo). */
  const tarifaBase = (personaId: string | null, cargoId: string) => {
    const c = cargo.get(cargoId);
    return c ? tarifaEfectiva(c, asignacion(personaId, cargoId)?.tarifa_base_propia) : 0;
  };
  /** El cargo con que se preselecciona a una persona: el pedido si lo tiene, si no su predeterminado. */
  const cargoDe = (personaId: string, preferido?: string | null) => {
    const suyos = asignaciones(personaId);
    if (preferido && suyos.some(a => a.cargo_id === preferido)) return preferido;
    return (suyos.find(a => a.predeterminado) ?? suyos[0])?.cargo_id ?? null;
  };
  return { cargo, tipo, persona, trabajo, asignaciones, asignacion, personasActivas, personasCon, miPersona, tarifaBase, cargoDe, arbol };
}

export type Ayudas = ReturnType<typeof ayudasCatalogo>;

/** El cargo (con la tarifa de la persona). */
export function conCargo(l: LineaHH, cargoId: string, ay: Ayudas): LineaHH {
  const c = ay.cargo.get(cargoId);
  if (!c) return { ...l, cargo_id: '', cargo_nombre: '', cargo_tarifa_base: 0 };
  return { ...l, cargo_id: c.id, cargo_nombre: c.nombre, cargo_moneda: c.moneda_base, cargo_tarifa_base: ay.tarifaBase(l.persona_id, c.id) };
}

/**
 * Quién hace el trabajo (null = tarifa general del cargo). Si tiene el cargo de la línea, se queda
 * con ese (con su tarifa); si no, se preselecciona su cargo predeterminado (o el primero).
 */
export function conPersona(l: LineaHH, personaId: string | null, ay: Ayudas): LineaHH {
  const p = personaId ? ay.persona.get(personaId) : undefined;
  const base: LineaHH = { ...l, persona_id: p?.id ?? null, persona_nombre: p?.nombre ?? null };
  const cargoId = p ? ay.cargoDe(p.id, l.cargo_id) ?? l.cargo_id : l.cargo_id;
  return cargoId ? conCargo(base, cargoId, ay) : base;
}

/** El tipo de tarea con su multiplicador sugerido. */
export function conTipo(l: LineaHH, clave: string | null, ay: Ayudas): LineaHH {
  const t = clave ? ay.tipo.get(clave) : undefined;
  return { ...l, tipo_tarea_clave: t?.clave ?? null, multiplicador: t ? t.multiplicador : 1, multiplicador_editado: false };
}

/** Un multiplicador escrito a mano: «editado» si no es el sugerido. */
export function conMultiplicador(l: LineaHH, m: number, ay: Ayudas): LineaHH {
  const sugerido = l.tipo_tarea_clave ? ay.tipo.get(l.tipo_tarea_clave)?.multiplicador ?? 1 : 1;
  return { ...l, multiplicador: m, multiplicador_editado: m !== sugerido };
}

/** El apoyo (tarifa general del cargo, sin multiplicador). */
export function conApoyo(l: LineaHH, cargoId: string | null, ay: Ayudas, horas?: number): LineaHH {
  const c = cargoId ? ay.cargo.get(cargoId) : undefined;
  if (!c) return { ...l, cargo_apoyo_id: null, cargo_apoyo_nombre: null, cargo_apoyo_moneda: null, cargo_apoyo_tarifa_base: null, horas_apoyo: 0 };
  return {
    ...l, cargo_apoyo_id: c.id, cargo_apoyo_nombre: c.nombre, cargo_apoyo_moneda: c.moneda_base, cargo_apoyo_tarifa_base: c.tarifa_base,
    horas_apoyo: horas ?? l.horas_apoyo,
  };
}

/**
 * Las horas reales por unidad que equivalen a la referencia de mercado: con multiplicador 1 son las
 * mismas; donde la IA acelera (multiplicador 3) te toma un tercio y se cobran las de mercado.
 */
export const horasDeReferencia = (l: Pick<LineaHH, 'hh_referencia' | 'multiplicador'>) =>
  (l.hh_referencia && l.multiplicador > 0 ? Math.round((l.hh_referencia / l.multiplicador) * 1e6) / 1e6 : null);

/**
 * Partir de un trabajo tipo: precarga el entregable, la unidad, las horas (las de la referencia de
 * mercado), el tipo de tarea, el cargo y el apoyo. Lo hace quien tenga ese cargo (yo primero); si
 * nadie lo tiene, queda con la tarifa general del cargo.
 */
export function conTrabajo(l: LineaHH, trabajoId: string | null, ay: Ayudas, personaId?: string | null): LineaHH {
  const t = trabajoId ? ay.trabajo.get(trabajoId) : undefined;
  if (!t) return { ...l, trabajo_tipo_id: null, hh_referencia: null };
  const con = ay.personasCon(t.cargo_principal_id);
  const quien = (personaId !== undefined ? (personaId ? ay.persona.get(personaId) : null)
    : con.find(p => p.id === ay.miPersona?.id) ?? con[0]) ?? null;
  let r: LineaHH = { ...l, trabajo_tipo_id: t.id, hh_referencia: t.hh_referencia || null, descripcion: t.nombre, unidad: t.unidad || '' };
  r = conTipo(r, t.tipo_tarea_clave, ay);
  r = { ...r, persona_id: quien?.id ?? null, persona_nombre: quien?.nombre ?? null };
  r = conCargo(r, quien ? ay.cargoDe(quien.id, t.cargo_principal_id) ?? t.cargo_principal_id : t.cargo_principal_id, ay);
  r = conApoyo(r, t.cargo_apoyo_id, ay, t.hh_apoyo);
  return { ...r, horas_reales: horasDeReferencia(r) };
}

/** Lleva la línea a las tarifas de hoy (si el cargo sigue existiendo); si no, queda con su foto. */
export function conTarifasDeHoy(l: LineaHH, ay: Ayudas): LineaHH {
  let r = l;
  if (l.cargo_id && ay.cargo.get(l.cargo_id)) r = conCargo(r, l.cargo_id, ay);
  if (l.cargo_apoyo_id && ay.cargo.get(l.cargo_apoyo_id)) r = conApoyo(r, l.cargo_apoyo_id, ay);
  return r;
}

/** Iniciales para el avatar: «Joaquín Pérez» → «JP». */
export const iniciales = (nombre: string) =>
  nombre.trim().split(/\s+/).filter(x => /^[\p{L}]/u.test(x)).slice(0, 2).map(x => x[0]!.toUpperCase()).join('') || '?';
