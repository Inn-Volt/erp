import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { cleanNumber } from '@/utils';
import type { CategoriaItem } from '@/types';

// Ruta dinámica (no cachear): siempre trae la versión actual del Google Sheet.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** ID del Google Sheet fuente del catálogo (editable por variable de entorno). */
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '13bjrrkiQpf4eEatEVQQClOWLEZvcC2-xY7GbYbdS3V4';

/**
 * Mapea el nombre de la pestaña a la categoría de costeo de la app.
 * Todo lo que no sea mano de obra / servicio / gasto operacional es material.
 */
function categoriaDeTab(tab: string): CategoriaItem {
  const t = tab.trim().toLowerCase();
  if (t.includes('mano de obra')) return 'mano_obra';
  if (t.includes('servicio')) return 'servicio';
  if (t.includes('gasto') || t.includes('operacional')) return 'operacion';
  return 'material';
}

/** Lee un campo de la fila tolerando variantes de nombre (acentos, mayúsculas, espacios). */
function campo(row: Record<string, unknown>, ...nombres: string[]): unknown {
  const norm = (s: string) => s.trim().toLowerCase();
  const mapa: Record<string, unknown> = {};
  for (const k of Object.keys(row)) mapa[norm(k)] = row[k];
  for (const n of nombres) {
    const v = mapa[norm(n)];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}

export async function GET() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json(
        { error: `No se pudo leer el Google Sheet (HTTP ${res.status}). Revisa que esté compartido como "cualquiera con el enlace".` },
        { status: 502 },
      );
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });

    const esTabRecetas = (n: string) => n.trim().toLowerCase().includes('receta');

    // ── Catálogo (todas las pestañas menos la de recetas) ──
    const items: Array<Record<string, unknown>> = [];
    for (const tab of wb.SheetNames) {
      if (esTabRecetas(tab)) continue;
      const categoria = categoriaDeTab(tab);
      const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[tab], { defval: '' });
      for (const row of filas) {
        const descripcion = String(campo(row, 'Descripcion', 'Descripción') ?? '').trim();
        if (!descripcion) continue; // salta filas vacías

        const codigo = String(campo(row, 'Codigo', 'Código') ?? '').trim() || undefined;
        const costoRaw = campo(row, 'Costo');
        const costo = typeof costoRaw === 'number' ? costoRaw : cleanNumber(costoRaw);
        const unidad = String(campo(row, 'Unidad') ?? 'un').trim() || 'un';
        const proveedor = String(campo(row, 'Proveedor') ?? '').trim() || undefined;
        const link = String(campo(row, 'Link') ?? '').trim() || undefined;
        const familia = String(campo(row, 'Categoria', 'Categoría') ?? tab).trim() || tab;

        items.push({ codigo, descripcion, categoria, unidad, costo, proveedor, link, familia, activo: true });
      }
    }

    // ── Recetas (pestaña "Recetas", formato largo: 1 fila por componente) ──
    //   Nivel receta:     Receta | UnidadReceta (o Unidad) | DescripcionReceta (opc.)
    //   Nivel componente: Componente (desc.) | Categoria | UnidadComp | Costo | Cantidad
    //   (o, en vez de Componente, un Codigo que enlaza al catálogo)
    type CompSheet = { codigo?: string; descripcion?: string; categoria?: string; unidad?: string; costo?: number; cantidad: number };
    type RecetaSheet = { nombre: string; descripcion: string; unidad: string; componentes: CompSheet[] };
    const numOrUndef = (v: unknown) => (v === undefined || v === '' ? undefined : (typeof v === 'number' ? v : cleanNumber(v)));
    const recetasMap = new Map<string, RecetaSheet>();
    const tabRec = wb.SheetNames.find(esTabRecetas);
    if (tabRec) {
      const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[tabRec], { defval: '' });
      for (const row of filas) {
        const nombre = String(campo(row, 'Receta', 'Nombre', 'Partida') ?? '').trim();
        if (!nombre) continue;
        const codigo = String(campo(row, 'Codigo', 'Código') ?? '').trim();
        const descComp = String(campo(row, 'Componente', 'Item', 'Material', 'Descripcion Componente') ?? '').trim();
        if (!codigo && !descComp) continue; // fila sin componente

        const key = nombre.toLowerCase();
        let r = recetasMap.get(key);
        if (!r) { r = { nombre, descripcion: '', unidad: '', componentes: [] }; recetasMap.set(key, r); }

        const uniReceta = String(campo(row, 'UnidadReceta', 'Unidad Receta', 'Unidad') ?? '').trim();
        const descReceta = String(campo(row, 'DescripcionReceta', 'Descripcion Receta', 'Descripcion') ?? '').trim();
        if (uniReceta && !r.unidad) r.unidad = uniReceta;
        if (descReceta && !r.descripcion) r.descripcion = descReceta;

        r.componentes.push({
          codigo: codigo || undefined,
          descripcion: descComp || undefined,
          categoria: String(campo(row, 'Categoria', 'Categoría') ?? '').trim() || undefined,
          unidad: String(campo(row, 'UnidadComp', 'Unidad Comp', 'Unidad Componente') ?? '').trim() || undefined,
          costo: numOrUndef(campo(row, 'Costo')),
          cantidad: Number(cleanNumber(campo(row, 'Cantidad', 'Cant'))) || 0,
        });
      }
    }
    const recetas = [...recetasMap.values()].map(r => ({ ...r, unidad: r.unidad || 'un' }));

    return NextResponse.json({ ok: true, tabs: wb.SheetNames.length, total: items.length, items, recetas });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: 'Error al sincronizar: ' + (e instanceof Error ? e.message : 'desconocido') },
      { status: 500 },
    );
  }
}
