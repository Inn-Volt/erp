'use client';

/**
 * El cotizador de TecApp, adaptado a InnVolt.
 *   Encabezado: N°, estado, revisión y los botones del estado (uno solo en rojo/amarillo).
 *   Izquierda: título, plantilla, bloques plegables (cliente, cotización, introducción,
 *   presentación), la valorización con sus partidas y las aclaraciones.
 *   Derecha: lo que paga el cliente, lo interno (con «Ver costos»), «Antes de enviar»
 *   y agregar partida.
 * Solo un Borrador se edita; el estado cambia solo con sus botones (lo exige la base).
 */

import { fotosDeInforme, resumenInforme, type InformeLleno } from '@/services/informes';
import DesdeLevantamiento, { type TextosLevantamiento } from '@/components/cotizador/DesdeLevantamiento';
import TrabajoPanel from '@/components/trabajos/TrabajoPanel';
import PlanCobro from './PlanCobro';
import NumeroInput from '@/components/NumeroInput';
import { textoPlano, tituloCorto } from '@/lib/textoFormato';
import { gananciaPorOmision } from '@/lib/cotizador/utilidad';
import EditorFormato from '@/components/EditorFormato';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import {
  Copy, Eye, FileDown, History, Link2, Loader2, Plus, RotateCcw, Save, Search, Send, Sparkles, XCircle, ClipboardList, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import FaltaSQL from '@/components/FaltaSQL';
import CotizarIAConversa, { type VistaPrevia } from '@/components/cotizador/CotizarIAConversa';
import CotizacionPDF, { nombrePDF } from '@/components/pdf/CotizacionPDF';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import TarjetaPartida, { type AccionesLinea } from './TarjetaPartida';
import AsistenteReceta from './AsistenteReceta';
import EditorReceta from './EditorReceta';
import TrasladoModal from './TrasladoModal';
import { proyectosService, folioProyecto, type Proyecto } from '@/services/fase5';
import { BloquePlegable, EstadoPill, MenuAcciones, opcionMenu, PedirMotivo, etiqueta } from './ui';
import { AprobarModal, HistorialModal, RechazarModal, RevisarYEnviar, type Canal } from './Modales';
import {
  IVA, PLAN_COBRO_BASE, QUE_VE, UNIDADES_ITEM, VERSION_COTIZADOR, TITULO_VALORIZACION,
  type AjustesCot, type ArticuloCatalogo, type CotizacionDoc, type EnvioCot, type Linea, type Moneda, type PartidaCot,
  type HitoCobro, type Plantilla, type Seccion, type TipoPartida,
} from '@/lib/cotizador/tipos';
import {
  aMoneda, calcular, formatMonto, precioDeLinea, lineaFuera, lineasDeArticulo, nuevoId, porcentaje, q, sinDescuentoGlobal,
} from '@/lib/cotizador/calculo';
import { revisar, llenarMensaje } from '@/lib/cotizador/revision';
import type { RecetaCompleta, Respuestas } from '@/lib/cotizador/recetas';
import {
  ajustesService, catalogoCotService, cotizadorService, faltaFase4, plantillasCotService, recetasCotService,
} from '@/services/cotizador';
import { clientesService } from '@/services/clientes';
import { archivosOT, folioOT, informesService, otService, sucursalesService, type Contacto, type InformeOT, type Sucursal } from '@/services/operacion';
import { solicitudesService } from '@/services/solicitudes';
import { levantamientosService } from '@/services/levantamientos';
import { fotosService } from '@/services/fotos';
import { vendedoresService, firmaVendedor } from '@/services/vendedores';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { marcarSinGuardar } from '@/hooks/useSinGuardar';
import { linkPublico } from '@/services/cotizaciones';
import { CATEGORIA_COLORS, CATEGORIA_LABELS, type CatalogoItem, type Cliente, type PartidaIAResuelta, type Vendedor } from '@/types';
import { fechaLocal, formatDate, sumarDias, borradorDesdeAnalisis, mejorMatchCatalogo } from '@/utils';

const VER_COSTOS = 'innvolt-cotizacion-ver-costos';
const folioDe = (n: number) => `IV-${String(n || 0).padStart(4, '0')}`;

type Bloque = 'cliente' | 'cotizacion' | 'descripcion' | 'presentacion' | 'aclaraciones';

function docVacio(): CotizacionDoc {
  return {
    id: '', folio: 0, estado: 'Borrador', revision: 0, titulo: '', cliente_id: null, items: [], partidas: [],
    moneda: 'CLP', que_ve_cliente: 'partidas', descripcion_general: '', aclaraciones: '', secciones: [],
    subtotal: 0, iva: 0, total: 0, created_at: new Date().toISOString(), valida_hasta_a_mano: false,
  };
}

/** Lo que importa para saber si hay cambios sin guardar. */
const huella = (d: CotizacionDoc) => JSON.stringify([
  d.titulo, d.cliente_id, d.sucursal_id, d.contacto_id, d.empresa_id, d.plantilla_id, d.items, d.partidas, d.moneda, d.valor_uf,
  d.fecha_valor_uf, d.que_ve_cliente, d.titulo_valorizacion, d.descripcion_general, d.aclaraciones, d.secciones, d.valida_hasta,
  d.valida_hasta_a_mano, d.incluir_fotos, d.proyecto_id,
]);

export default function EditorCotizacion({ id, clonarDe, clienteInicial, solicitudInicial, otInicial, visitaInicial, proyectoInicial }: {
  id: string | null; clonarDe?: string | null; clienteInicial?: string | null; solicitudInicial?: string | null; otInicial?: string | null; visitaInicial?: string | null; proyectoInicial?: string | null;
}) {
  const router = useRouter();
  const { perfil, puede } = usePermisos();
  const { success, error: toastError, warning } = useToast();
  const puedeEditar = puede('cotizaciones.crear');
  const puedeAprobar = puede('cotizaciones.aprobar');
  const puedeCostos = puede('cotizaciones.ver_costos') || puedeEditar;

  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  const [cot, setCot] = useState<CotizacionDoc | null>(null);      // lo guardado
  const [d, setD] = useState<CotizacionDoc>(docVacio);             // lo que se edita
  const [guardadaHuella, setGuardadaHuella] = useState(huella(docVacio()));
  const guardadas = useRef<Set<string>>(new Set());                // líneas ya guardadas: su precio quedó congelado
  const [guardando, setGuardando] = useState(false);

  const [catalogo, setCatalogo] = useState<ArticuloCatalogo[]>([]);
  const [recetas, setRecetas] = useState<RecetaCompleta[]>([]);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [ajustes, setAjustes] = useState<AjustesCot | null>(null);
  const [empresas, setEmpresas] = useState<EmpresaInfo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [sitios, setSitios] = useState<Sucursal[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [equipo, setEquipo] = useState<Record<string, Vendedor>>({});
  const [envios, setEnvios] = useState<EnvioCot[]>([]);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [verCostos, setVerCostos] = useState(false);
  const [abierto, setAbierto] = useState<Record<Bloque, boolean>>({ cliente: true, cotizacion: false, descripcion: true, presentacion: false, aclaraciones: false });

  const [modal, setModal] = useState<null | 'revisar' | 'reenviar' | 'aprobar' | 'rechazar' | 'historial' | 'volver' | 'anular' | 'ia' | 'levantamiento'>(null);
  const [asistente, setAsistente] = useState<{ receta: RecetaCompleta; partidaId: string } | null>(null);
  // Receta nueva armada desde una partida (para usarla solo aquí o guardarla en la biblioteca).
  const [recetaNuevaPara, setRecetaNuevaPara] = useState<string | null>(null);
  const recordadas = useRef<Map<string, Respuestas>>(new Map());
  const [recetaAgregada, setRecetaAgregada] = useState<{ partidaId: string; nombre: string; cuantas: number; antes: Linea[]; ids: string[] } | null>(null);
  const [recienCreada, setRecienCreada] = useState<string | null>(null);
  const [deshacerPlantilla, setDeshacerPlantilla] = useState<{ texto: string; antes: CotizacionDoc } | null>(null);
  const [cambioMoneda, setCambioMoneda] = useState<Moneda | null>(null);
  const [trayendoUF, setTrayendoUF] = useState(false);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [trasladoPara, setTrasladoPara] = useState<string | null>(null);
  useEffect(() => { proyectosService.listar().then(setProyectos).catch(() => setProyectos([])); }, []);

  const editable = puedeEditar && d.estado === 'Borrador';
  const sucio = editable && huella(d) !== guardadaHuella;
  const set = useCallback((patch: Partial<CotizacionDoc>) => setD(x => ({ ...x, ...patch })), []);

  useEffect(() => { try { setVerCostos(localStorage.getItem(VER_COSTOS) === '1'); } catch { /* sin almacenamiento */ } }, []);
  useEffect(() => { marcarSinGuardar(sucio); return () => marcarSinGuardar(false); }, [sucio]);
  useEffect(() => {
    if (!sucio) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [sucio]);

  const catMap = useMemo(() => new Map(catalogo.map(a => [a.id, a])), [catalogo]);
  const calc = useMemo(() => calcular(d.items, d.partidas, d.moneda, d.valor_uf), [d.items, d.partidas, d.moneda, d.valor_uf]);
  const cliente = useMemo(() => clientes.find(c => c.id === d.cliente_id) || d.clientes || null, [clientes, d.cliente_id, d.clientes]);
  const empresa = useMemo(() => empresas.find(e => e.id === d.empresa_id) || empresas.find(e => e.id === perfil?.empresa_id) || empresas[0] || null,
    [empresas, d.empresa_id, perfil?.empresa_id]);
  const vendedor: Vendedor | null = useMemo(() => {
    const vid = d.vendedor_id || perfil?.id;
    return (vid && equipo[vid]) || null;
  }, [d.vendedor_id, perfil?.id, equipo]);
  const contacto = contactos.find(c => c.id === d.contacto_id) || null;
  const sucursal = sitios.find(s => s.id === d.sucursal_id) || null;
  const hoy = fechaLocal();
  const vencida = d.estado === 'Enviada' && !!d.valida_hasta && d.valida_hasta < hoy;
  const diasDeSiempre = ajustes?.dias_validez || 15;

  // ── Carga ──
  const cargarDoc = useCallback(async (cid: string) => {
    const doc = await cotizadorService.get(cid);
    if (!doc) { toastError('No existe esa cotización o no tienes acceso.'); return null; }
    const lineas = doc.estado === 'Borrador' ? sinDescuentoGlobal(doc.items, doc.descuento_global) : doc.items;
    const limpio = { ...doc, items: lineas, descuento_global: 0, partidas: doc.partidas.map(p => ({ ...p, tipo: p.tipo || 'instalacion' })) };
    guardadas.current = new Set(doc.items.map(l => l.id));
    setCot(doc); setD(limpio); setGuardadaHuella(huella(limpio));
    cotizadorService.envios(cid).then(setEnvios).catch(() => setEnvios([]));
    return limpio;
  }, [toastError]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [aj, cat, rec, pls, emp, cls, eq] = await Promise.all([
          ajustesService.get(), catalogoCotService.todos(), recetasCotService.listar(), plantillasCotService.listar(),
          supabase.from('empresas').select('*').order('nombre').then(r => (r.data || []) as EmpresaInfo[]),
          clientesService.getAll(), vendedoresService.mapa(),
        ]);
        if (!vivo) return;
        setAjustes(aj); setCatalogo(cat); setRecetas(rec); setPlantillas(pls); setEmpresas(emp); setClientes(cls); setEquipo(eq);
        if (clonarDe) {
          const nuevo = await cotizadorService.clonar(clonarDe);
          router.replace(`/cotizador?edit=${nuevo}`);
          return;
        }
        if (id) { await cargarDoc(id); return; }
        // Nueva: la plantilla de siempre trae los textos; parte con una partida de instalación vacía.
        const pl = pls.find(p => p.es_la_de_siempre) || null;
        const pid = nuevoId();
        const nuevo: CotizacionDoc = {
          ...docVacio(),
          empresa_id: emp.find(e => e.id === perfil?.empresa_id)?.id || emp[0]?.id || null,
          plantilla_id: pl?.id || null, plantilla_version: pl?.version || null,
          descripcion_general: pl?.descripcion || '',
          // Las aclaraciones y garantías son las mismas para todas: las de los ajustes.
          aclaraciones: aj.aclaraciones || '',
          que_ve_cliente: pl?.que_ve_cliente || 'partidas',
          titulo_valorizacion: pl?.titulo_valorizacion || null,
          secciones: aj.usa_presentacion ? (pl?.secciones || []) : [],
          dias_validez: aj.dias_validez,
          valida_hasta: sumarDias(fechaLocal(), aj.dias_validez),
          plan_cobro: (pl?.plan_cobro && pl.plan_cobro.length ? pl.plan_cobro : aj.plan_cobro) ? (pl?.plan_cobro && pl.plan_cobro.length ? pl.plan_cobro : aj.plan_cobro!).map(h => ({ ...h })) : null,
          partidas: [{ id: pid, nombre: '', cantidad: 1, unidad: 'global', tipo: 'instalacion' }],
          cliente_id: clienteInicial || null,
          proyecto_id: proyectoInicial || null,
        };
        if (otInicial) {
          // Cotizar desde una OT (la visita técnica): el cliente, el lugar, lo que vio el técnico y sus fotos.
          const [o, infs] = await Promise.all([otService.get(otInicial).catch(() => null), informesService.deOT(otInicial).catch(() => [] as InformeOT[])]);
          if (o) {
            const ultimo = [...infs].reverse().find(x => x.falla_observada || x.trabajos || x.pendiente);
            const partes = [`Según la visita técnica ${folioOT(o.folio)}${ultimo?.fecha ? ` del ${formatDate(ultimo.fecha)}` : ''}${o.direccion ? `, en ${o.direccion}` : ''}.`];
            if (ultimo?.falla_observada?.trim()) partes.push(`**Lo que encontramos:**\n${ultimo.falla_observada.trim()}`);
            if (ultimo?.pendiente?.trim()) partes.push(`**Lo que proponemos:**\n${ultimo.pendiente.trim()}`);
            Object.assign(nuevo, {
              ot_id: o.id, cliente_id: o.cliente_id || nuevo.cliente_id, sucursal_id: o.sucursal_id || null, solicitud_id: o.solicitud_id || null,
              proyecto_id: o.proyecto_id || nuevo.proyecto_id, incluir_fotos: infs.some(x => x.fotos.length > 0),
              descripcion_general: partes.join('\n\n'), titulo: tituloCorto(o.titulo),
            });
          }
        }
        if (solicitudInicial) {
          const sol = await solicitudesService.getById(solicitudInicial).catch(() => null);
          if (sol) {
            nuevo.solicitud_id = sol.id;
            nuevo.cliente_id = sol.cliente_id || nuevo.cliente_id;
            nuevo.titulo = tituloCorto(sol.analisis_ia?.necesidades?.[0]?.titulo || sol.descripcion);
            const an = sol.analisis_ia;
            if (an?.items_sugeridos?.length) {
              const borr = borradorDesdeAnalisis(an, cat.map(a => ({ ...a, codigo: a.codigo || undefined, familia: a.familia || undefined, proveedor: a.proveedor || undefined }) as unknown as CatalogoItem), an.necesidades?.[0]?.titulo || 'Propuesta técnica');
              const conv = convertirIA(borr, cat, 'CLP', null);
              nuevo.partidas = conv.partidas; nuevo.items = conv.items;
              if (an.resumen) nuevo.descripcion_general = an.resumen;
            }
          }
        }
        // La visita (agenda): la pedida, o la última realizada de la solicitud. Lo que se vio va a la
        // introducción y sus fotos, al PDF.
        let visita: { id: string; fecha: string; direccion: string | null; titulo: string; cliente_id: string | null; notas_visita?: string | null; fotos?: { path: string }[]; informe?: InformeLleno | null } | null = null;
        if (visitaInicial) {
          visita = (await supabase.from('agendamientos').select('*').eq('id', visitaInicial).maybeSingle()).data;
        } else if (solicitudInicial) {
          visita = (await supabase.from('agendamientos').select('*').eq('solicitud_id', solicitudInicial).eq('estado', 'Realizada')
            .order('fecha', { ascending: false }).limit(1).maybeSingle()).data;
        }
        if (visita && ('notas_visita' in visita || 'fotos' in visita)) {
          const partes = [`Según la visita técnica del ${formatDate(visita.fecha)}${visita.direccion ? `, en ${visita.direccion}` : ''}.`];
          // Fase 9: todos los informes de la visita (si aún no está, el único de la fase 8).
          const { data: infs, error: eInf } = await supabase.from('informes_visita').select('*').eq('agendamiento_id', visita.id).order('folio');
          const informes = ((eInf ? [visita.informe] : infs) || []).filter(Boolean) as InformeLleno[];
          const respuestas = informes.map(i => resumenInforme(i)).filter(Boolean).join('\n');
          if (respuestas || visita.notas_visita?.trim()) partes.push(['**Lo que vimos:**', respuestas, visita.notas_visita?.trim()].filter(Boolean).join('\n'));
          Object.assign(nuevo, {
            agendamiento_id: visita.id, cliente_id: nuevo.cliente_id || visita.cliente_id, incluir_fotos: (visita.fotos || []).length > 0,
            descripcion_general: nuevo.descripcion_general?.trim() ? `${partes.join('\n\n')}\n\n${nuevo.descripcion_general}` : partes.join('\n\n'),
            titulo: nuevo.titulo || tituloCorto(visita.titulo),
          });
        }
        setD(nuevo); setGuardadaHuella(huella({ ...nuevo, partidas: [] }));
      } catch (e) {
        if (faltaFase4(e)) setFalta(true); else toastError('No se pudo abrir el cotizador: ' + (e instanceof Error ? e.message : ''));
      } finally { if (vivo) setCargando(false); }
    })();
    return () => { vivo = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, clonarDe]);

  // Sucursales y contactos del cliente
  useEffect(() => {
    setSitios([]); setContactos([]);
    if (!d.cliente_id) return;
    sucursalesService.deCliente(d.cliente_id).then(r => { setSitios(r.sucursales); setContactos(r.contactos); }).catch(() => {});
  }, [d.cliente_id]);

  // ── Líneas y partidas ──
  const setItems = useCallback((f: (items: Linea[]) => Linea[]) => setD(x => ({ ...x, items: f(x.items) })), []);
  const setPartidas = useCallback((f: (p: PartidaCot[]) => PartidaCot[]) => setD(x => ({ ...x, partidas: f(x.partidas) })), []);

  const agregarPartida = (tipo: TipoPartida, despuesDe?: string | null) => {
    const p: PartidaCot = { id: nuevoId(), nombre: '', cantidad: 1, unidad: 'global', tipo };
    setPartidas(ps => {
      const i = despuesDe ? ps.findIndex(x => x.id === despuesDe) : -1;
      return i < 0 ? [...ps, p] : [...ps.slice(0, i + 1), p, ...ps.slice(i + 1)];
    });
    setRecienCreada(p.id);
    setTimeout(() => document.getElementById(`cot-partida-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  const cambiarTipo = (pid: string, tipo: TipoPartida) => {
    const suyas = d.items.filter(l => l.partidaId === pid);
    if (tipo === 'venta') {
      const ligadas = suyas.filter(l => l.ligadoA);
      if (ligadas.length && !confirm(`Pasar a venta quita la mano de obra ligada a los productos (${ligadas.length} línea${ligadas.length === 1 ? '' : 's'}). ¿Seguir?`)) return;
      setItems(items => items.filter(l => !(l.partidaId === pid && l.ligadoA)));
    } else {
      // Instalación: cada producto del catálogo vuelve a traer su mano de obra.
      const nuevas: Linea[] = [];
      for (const l of suyas) {
        if (l.ligadoA || l.categoria !== 'material' || !l.itemId) continue;
        if (suyas.some(x => x.ligadoA === l.id)) continue;
        const a = catMap.get(l.itemId);
        if (!a?.mano_obra_id) continue;
        const sus = lineasDeArticulo(a, Number(l.cantidad) || 1, { id: pid, tipo: 'instalacion' }, catMap, d.moneda, d.valor_uf);
        if (sus[1]) nuevas.push({ ...sus[1], ligadoA: l.id });
      }
      setItems(items => {
        const out: Linea[] = [];
        for (const l of items) { out.push(l); out.push(...nuevas.filter(n => n.ligadoA === l.id)); }
        return out;
      });
    }
    setPartidas(ps => ps.map(p => (p.id === pid ? { ...p, tipo } : p)));
  };

  const agregarLineas = (pid: string, nuevas: Linea[]) => {
    setItems(items => {
      // Al final de su partida (para que queden juntas en el orden del documento).
      let ultima = -1;
      items.forEach((l, i) => { if (l.partidaId === pid) ultima = i; });
      return ultima < 0 ? [...items, ...nuevas] : [...items.slice(0, ultima + 1), ...nuevas, ...items.slice(ultima + 1)];
    });
  };

  const lineaAcc: AccionesLinea = {
    cambiar: (lid, patch) => setItems(items => items.map(l => (l.id === lid ? { ...l, ...patch } : l))),
    // Cambiar el costo o la ganancia de algo del catálogo: queda «ajustada» en esta cotización
    // (se calcula desde su costo y su ganancia) y la biblioteca no se toca. Parte de la ganancia
    // que hoy tiene, para que el precio no salte hasta que se cambie algo.
    ajustar: (lid, patch) => setItems(items => items.map(l => {
      if (l.id !== lid) return l;
      if (l.fuera) return { ...l, ...patch };
      const ci = (l.costo || 0) * (1 + (l.imprevistos || 0) / 100);
      const precio = precioDeLinea(l, d.moneda);
      return { ...l, fuera: true, ajustada: true, ganancia: ci > 0 ? (precio / ci - 1) * 100 : 0, ...patch };
    })),
    alCatalogo: lid => setItems(items => items.map(l => {
      const a = l.id === lid && l.itemId ? catMap.get(l.itemId) : undefined;
      if (!a || a.precio_venta === null) return l;
      return { ...l, fuera: false, ajustada: false, ganancia: null,
        costo: aMoneda(a.costo || 0, d.moneda, d.valor_uf, true), precio: aMoneda(a.precio_venta, d.moneda, d.valor_uf) };
    })),
    cantidad: (lid, v) => setItems(items => {
      const l = items.find(x => x.id === lid);
      if (!l) return items;
      if (l.ligadoA) return items.map(x => (x.id === lid ? { ...x, cantidad: v, cantidadAMano: true } : x));
      // La mano de obra que no se tocó sigue la cantidad de su producto.
      return items.map(x => (x.id === lid ? { ...x, cantidad: v }
        : x.ligadoA === lid && !x.cantidadAMano ? { ...x, cantidad: q(v * (x.porUnidad || 1), 0.001) } : x));
    }),
    quitar: lid => setItems(items => items.filter(l => l.id !== lid && l.ligadoA !== lid)),
    mover: (lid, dir) => setItems(items => {
      const l = items.find(x => x.id === lid)!;
      const grupo = (x: Linea) => x.id === lid || x.ligadoA === lid;
      const delGrupo = items.filter(grupo);
      const resto = items.filter(x => !grupo(x));
      const hermanas = resto.filter(x => x.partidaId === l.partidaId && !x.ligadoA);
      const idx = items.filter(x => x.partidaId === l.partidaId && !x.ligadoA).findIndex(x => x.id === lid);
      const destino = hermanas[idx + dir + (dir === 1 ? -1 : 0)];
      if (!destino) return items;
      const pos = resto.findIndex(x => x.id === destino.id);
      let corte = dir === -1 ? pos : pos + 1;
      if (dir === 1) while (corte < resto.length && resto[corte].ligadoA === destino.id) corte++;
      return [...resto.slice(0, corte), ...delGrupo, ...resto.slice(corte)];
    }),
    moverA: (lid, pid) => setItems(items => {
      const grupo = items.filter(x => x.id === lid || x.ligadoA === lid).map(x => ({ ...x, partidaId: pid }));
      const resto = items.filter(x => x.id !== lid && x.ligadoA !== lid);
      let ultima = -1;
      resto.forEach((x, i) => { if (x.partidaId === pid) ultima = i; });
      return ultima < 0 ? [...resto, ...grupo] : [...resto.slice(0, ultima + 1), ...grupo, ...resto.slice(ultima + 1)];
    }),
    religar: lid => setItems(items => {
      const l = items.find(x => x.id === lid);
      const prod = items.find(x => x.id === l?.ligadoA);
      return items.map(x => (x.id === lid && prod ? { ...x, cantidadAMano: false, cantidad: q((Number(prod.cantidad) || 0) * (x.porUnidad || 1), 0.001) } : x));
    }),
  };

  const agregarArticulo = (p: PartidaCot, a: ArticuloCatalogo) => {
    if (d.moneda === 'UF' && !(Number(d.valor_uf) > 0)) { warning('Está en UF: escribe el valor de la UF antes de agregar.'); return; }
    agregarLineas(p.id, lineasDeArticulo(a, 1, p, catMap, d.moneda, d.valor_uf));
  };

  // ── IA → partidas (lo del catálogo con su precio; lo demás fuera del catálogo con su costo estimado) ──
  function convertirIA(partidasIA: PartidaIAResuelta[], cat: ArticuloCatalogo[], moneda: Moneda, valorUf: number | null | undefined) {
    const mapa = new Map(cat.map(a => [a.id, a]));
    const porCodigo = new Map(cat.filter(a => a.codigo).map(a => [String(a.codigo).toLowerCase(), a]));
    const partidas: PartidaCot[] = [];
    const items: Linea[] = [];
    for (const pIA of partidasIA) {
      const p: PartidaCot = { id: nuevoId(), nombre: pIA.nombre, descripcion: pIA.descripcion, cantidad: pIA.cantidad || 1, unidad: pIA.unidad || 'global', tipo: 'instalacion' };
      partidas.push(p);
      for (const c of pIA.componentes) {
        const a = (c.itemId && mapa.get(c.itemId)) || (c.codigo && porCodigo.get(c.codigo.toLowerCase())) ||
          (c.matched ? mejorMatchCatalogo(c.descripcion, c.categoria, cat.map(x => ({ ...x, familia: x.familia || undefined }))) : null);
        const art = a ? mapa.get(a.id) : null;
        if (art && art.precio_venta !== null) {
          // En una de instalación la mano de obra que la IA ya trae va suelta: no se duplica.
          items.push(...lineasDeArticulo(art, c.cantidad ?? 1, { id: p.id, tipo: 'venta' }, mapa, moneda, valorUf));
        } else {
          items.push({
            id: nuevoId(), partidaId: p.id, descripcion: c.descripcion, categoria: c.categoria, unidad: c.unidad || 'un',
            cantidad: c.cantidad ?? 1, costo: aMoneda(c.costo || 0, moneda, valorUf, true), imprevistos: 0, margen: 0, precio: 0,
            iva: IVA, descuento: 0, fuera: true, ganancia: gananciaPorOmision(ajustes?.utilidad_por_tipo, c.categoria),
          });
        }
      }
    }
    return { partidas, items };
  }

  const insertarIA = (partidasIA: PartidaIAResuelta[]) => {
    if (d.moneda === 'UF' && !(Number(d.valor_uf) > 0)) { warning('Está en UF: escribe el valor de la UF antes de insertar.'); return; }
    const conv = convertirIA(partidasIA, catalogo, d.moneda, d.valor_uf);
    setD(x => ({
      ...x,
      // Las partidas vacías que había (la inicial) se reemplazan.
      partidas: [...x.partidas.filter(p => x.items.some(l => l.partidaId === p.id) || p.nombre.trim()), ...conv.partidas],
      items: [...x.items, ...conv.items],
    }));
    setModal(null);
    success(`${conv.partidas.length} partida${conv.partidas.length === 1 ? '' : 's'} de la IA. Revisa precios y cantidades.`);
  };

  // Cotizar con IA conversando: cómo quedaría la cotización (sin tocarla) y agregar lo aprobado.
  const previsualizarIA = useCallback((partidasIA: PartidaIAResuelta[]): VistaPrevia => {
    const conv = convertirIA(partidasIA, catalogo, d.moneda, d.valor_uf);
    const r = calcular(conv.items, conv.partidas, d.moneda, d.valor_uf);
    return { neto: r.totales.neto, iva: r.totales.iva, total: r.totales.total, porPartida: conv.partidas.map(p => r.partidas.get(p.id)?.neto || 0) };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- convertirIA se rehace en cada render; depende de lo que se lista
  }, [catalogo, d.moneda, d.valor_uf, ajustes]);
  const insertarConversa = (partidasIA: PartidaIAResuelta[], supuestos: string[]) => {
    insertarIA(partidasIA);
    if (supuestos.length) {
      const bloque = `**Consideraciones:**\n${supuestos.map(s => `- ${s}`).join('\n')}`;
      setD(x => ({ ...x, descripcion_general: [x.descripcion_general?.trim(), bloque].filter(Boolean).join('\n\n') }));
    }
  };

  // Fase 11: lo aprobado en «Del levantamiento a la cotización».
  const insertarLevantamiento = (partidasIA: PartidaIAResuelta[], textos: TextosLevantamiento | null) => {
    if (partidasIA.length) insertarIA(partidasIA); else setModal(null);
    if (textos) {
      const bloques = ([['Condiciones de montaje', textos.montaje], ['Exclusiones', textos.exclusiones], ['Pendiente de confirmar', textos.pendientes]] as [string, string][])
        .filter(([, t]) => t.trim()).map(([k, t]) => `**${k}:**\n${t.trim()}`);
      if (bloques.length) setD(x => ({ ...x, descripcion_general: [x.descripcion_general?.trim(), ...bloques].filter(Boolean).join('\n\n') }));
    }
  };

  // ── Guardar ──
  const filaParaGuardar = (x: CotizacionDoc) => {
    // Lo del catálogo que todavía no se guardaba toma el precio de hoy (y queda congelado).
    const items = x.items.map(l => {
      const c = calc.lineas.get(l.id);
      let linea = { ...l };
      if (l.itemId && !l.fuera && !guardadas.current.has(l.id)) {
        const a = catMap.get(l.itemId);
        if (a && a.precio_venta !== null) linea = { ...linea, costo: aMoneda(a.costo || 0, x.moneda, x.valor_uf, true), precio: aMoneda(a.precio_venta, x.moneda, x.valor_uf) };
      } else if (c) {
        linea.precio = precioDeLinea(l, x.moneda);
      }
      return linea;
    });
    const r = calcular(items, x.partidas, x.moneda, x.valor_uf);
    return {
      titulo: x.titulo.trim() || 'Cotización', cliente_id: x.cliente_id, sucursal_id: x.sucursal_id || null, contacto_id: x.contacto_id || null,
      empresa_id: x.empresa_id || empresa?.id || null, plantilla_id: x.plantilla_id || null, plantilla_version: x.plantilla_version || null,
      items, partidas: x.partidas, moneda: x.moneda, valor_uf: x.moneda === 'UF' ? x.valor_uf || null : null,
      fecha_valor_uf: x.moneda === 'UF' ? x.fecha_valor_uf || null : null,
      que_ve_cliente: x.que_ve_cliente, mostrar_detalle: x.que_ve_cliente === 'detalle', titulo_valorizacion: x.titulo_valorizacion || null,
      descripcion_general: x.descripcion_general, aclaraciones: x.aclaraciones, condiciones_servicio: x.aclaraciones, condiciones_comerciales: '',
      secciones: x.secciones, valida_hasta: x.valida_hasta, valida_hasta_a_mano: !!x.valida_hasta_a_mano, dias_validez: x.dias_validez || diasDeSiempre,
      subtotal: r.totales.neto, iva: r.totales.iva, total: r.totales.total, total_clp: r.totales.totalClp, descuento_global: 0,
      costo_directo: r.internos.costoConImprevistos, utilidad: r.internos.utilidad,
      solicitud_id: x.solicitud_id || null, levantamiento_id: x.levantamiento_id || null, incluir_fotos: !!x.incluir_fotos,
      ...(x.ot_id ? { ot_id: x.ot_id } : {}),
      ...(x.agendamiento_id ? { agendamiento_id: x.agendamiento_id } : {}),
      ...(ajustes && 'plan_cobro' in ajustes ? { plan_cobro: x.plan_cobro ?? ajustes.plan_cobro ?? null } : {}),
      ...(proyectos.length || x.proyecto_id ? { proyecto_id: x.proyecto_id || null } : {}),
    };
  };

  const guardar = async (silencioso = false): Promise<CotizacionDoc | null> => {
    if (!d.titulo.trim()) { toastError('Ponle un título a la cotización: sin él no se puede guardar.'); document.getElementById('cot-titulo')?.focus(); return null; }
    if (!d.cliente_id) { toastError('Elige el cliente: sin él no se puede guardar.'); setAbierto(a => ({ ...a, cliente: true })); return null; }
    setGuardando(true);
    try {
      const fila = filaParaGuardar(d);
      if (cot?.id) {
        await cotizadorService.guardar(cot.id, fila);
        const nuevo = await cargarDoc(cot.id);
        if (!silencioso) success('Cotización guardada');
        return nuevo;
      }
      const creada = await cotizadorService.crear(fila);
      if (d.solicitud_id) {
        solicitudesService.getById(d.solicitud_id).then(sol => sol && solicitudesService.vincularCotizacion(sol.id, creada.id, creada.folio, sol.historial)).catch(() => {});
      }
      if (!silencioso) success(`Cotización ${folioDe(creada.folio)} creada`);
      marcarSinGuardar(false);
      router.replace(`/cotizador?edit=${creada.id}`);
      return creada;
    } catch (e) {
      toastError('No se pudo guardar: ' + (e instanceof Error ? e.message : ''));
      return null;
    } finally { setGuardando(false); }
  };

  /** El plan de cobro de la cotización, o el de los ajustes, o un solo cobro al terminar. */
  const planDe = (x: Pick<CotizacionDoc, 'plan_cobro'>): HitoCobro[] =>
    (x.plan_cobro && x.plan_cobro.length ? x.plan_cobro : ajustes?.plan_cobro && ajustes.plan_cobro.length ? ajustes.plan_cobro : PLAN_COBRO_BASE);

  // ── PDF ──
  const armarPDF = async (doc: CotizacionDoc, marca: 'BORRADOR' | 'ANULADA' | null) => {
    if (!empresa) throw new Error('Falta la empresa emisora.');
    let fotos: { url: string; caption: string }[] = [];
    if (doc.incluir_fotos && doc.agendamiento_id) {
      const v = (await supabase.from('agendamientos').select('fotos').eq('id', doc.agendamiento_id).maybeSingle()).data as { fotos?: { path: string; caption: string }[] } | null;
      // Más las fotos de los informes de la visita (fase 11).
      const infs = ((await supabase.from('informes_visita').select('*').eq('agendamiento_id', doc.agendamiento_id).order('folio')).data || []) as InformeLleno[];
      fotos = await fotosService.paraPDF([...(v?.fotos || []), ...infs.flatMap(fotosDeInforme)].slice(0, 24)).catch(() => []);
    } else if (doc.incluir_fotos && doc.ot_id) {
      // Las fotos de los informes de visita de la OT, con su descripción.
      const infs = await informesService.deOT(doc.ot_id).catch(() => [] as InformeOT[]);
      const lista = infs.flatMap(x => x.fotos).slice(0, 24);
      const urls = await archivosOT.urls(lista.map(f => f.path)).catch(() => ({} as Record<string, string>));
      fotos = lista.map(f => ({ url: urls[f.path] || '', caption: f.caption || '' })).filter(f => f.url);
    } else if (doc.incluir_fotos && doc.levantamiento_id) {
      // Cotizaciones de antes, hechas desde un levantamiento.
      const lev = await levantamientosService.getById(doc.levantamiento_id).catch(() => null);
      fotos = await fotosService.paraPDF(lev?.data.fotos).catch(() => []);
    }
    const cli = clientes.find(c => c.id === doc.cliente_id) || doc.clientes || null;
    return pdf(
      <CotizacionPDF doc={doc} cliente={cli} empresa={empresa} vendedor={vendedor}
        sucursal={sitios.find(s => s.id === doc.sucursal_id) || null}
        contacto={contactos.find(c => c.id === doc.contacto_id) || null}
        importante={ajustes?.importante} correoAceptar={ajustes?.correo_aceptar}
        enlace={doc.token_publico && doc.estado !== 'Borrador' ? linkPublico(doc.token_publico) : null}
        marca={marca} fotos={fotos} planCobro={planDe(doc)} diseno={ajustes?.pdf_diseno}
        aceptacion={doc.estado === 'Aprobada' && doc.respondida_por && doc.respondida_at
          ? { nombre: doc.respondida_por, rut: doc.respondida_rut, fecha: doc.respondida_at, firma: doc.respuesta_firma } : null} />,
    ).toBlob();
  };

  const verPDF = async () => {
    try {
      if (d.estado === 'Borrador') {
        const doc = sucio || !cot ? await guardar(true) : cot;
        if (!doc) return;
        const blob = await armarPDF(doc, 'BORRADOR');
        window.open(URL.createObjectURL(blob), '_blank');
        return;
      }
      // Enviada/Aprobada/Rechazada: el PDF guardado al enviar, tal cual lo recibió el cliente.
      const ultimo = envios.find(e => e.pdf_path && e.revision === d.revision) || envios.find(e => e.pdf_path);
      if (ultimo?.pdf_path && d.estado !== 'Aprobada') {
        const url = await cotizadorService.urlArchivo(ultimo.pdf_path);
        if (url) { window.open(url, '_blank'); return; }
      }
      const blob = await armarPDF(d, d.estado === 'Anulada' && !envios.length ? 'ANULADA' : null);
      saveAs(blob, nombrePDF(d, cliente?.nombre_cliente));
    } catch (e) { toastError('No se pudo generar el PDF: ' + (e instanceof Error ? e.message : '')); }
  };

  // ── Revisar y enviar ──
  const avisos = useMemo(() => revisar(d, calc, cliente, {
    hoy, diasDeSiempre, correoContacto: contacto?.email, importante: ajustes?.importante, esQuienCotiza: puedeCostos,
  }), [d, calc, cliente, hoy, diasDeSiempre, contacto?.email, ajustes?.importante, puedeCostos]);

  const datosMensaje = (doc: CotizacionDoc) => ({
    cliente: contacto?.nombre || cliente?.nombre_cliente || '',
    numero: folioDe(doc.folio), titulo: doc.titulo,
    total: formatMonto(doc.total, doc.moneda),
    enlace: doc.token_publico ? linkPublico(doc.token_publico) : '',
    vendedor: firmaVendedor(vendedor, empresa?.nombre || 'InnVolt'),
    empresa: empresa?.nombre || 'InnVolt',
  });

  const abrirRevisar = async () => {
    if (sucio || !cot) { const g = await guardar(true); if (!g) return; }
    setModal('revisar');
  };

  const enviar = async (canal: Canal, datos: { para: string; telefono: string; mensajeWhatsapp: string; asunto: string; mensajeCorreo: string }) => {
    if (!cot) return;
    try {
      const envioId = await cotizadorService.enviar(cot.id, canal, canal === 'whatsapp' ? datos.telefono : datos.para || datos.telefono);
      const doc = await cargarDoc(cot.id);
      if (!doc) return;
      const blob = await armarPDF(doc, null);
      try { await cotizadorService.pdfDelEnvio(envioId, blob, doc.id, nombrePDF(doc)); } catch { warning('Quedó enviada, pero no se pudo guardar la copia del PDF.'); }
      saveAs(blob, nombrePDF(doc, cliente?.nombre_cliente));
      const m = datosMensaje(doc);
      if (canal === 'whatsapp' || canal === 'ambos') {
        const tel = datos.telefono.replace(/[^\d]/g, '');
        window.open(`https://wa.me/${tel}?text=${encodeURIComponent(llenarMensaje(datos.mensajeWhatsapp, m))}`, '_blank');
      }
      if (canal === 'correo' || canal === 'ambos') {
        window.location.href = `mailto:${encodeURIComponent(datos.para)}?subject=${encodeURIComponent(llenarMensaje(datos.asunto, m))}&body=${encodeURIComponent(llenarMensaje(datos.mensajeCorreo, m))}`;
      }
      setModal(null);
      cotizadorService.envios(cot.id).then(setEnvios).catch(() => {});
      success(modal === 'reenviar' ? 'Reenvío anotado' : `${folioDe(doc.folio)} enviada`);
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo enviar'); }
  };

  const recargar = async () => { if (cot) await cargarDoc(cot.id); setModal(null); };

  // ── Plantilla ──
  const elegirPlantilla = (pid: string) => {
    const pl = plantillas.find(p => p.id === pid) || null;
    // Las aclaraciones no dependen de la plantilla (son las de los ajustes): solo se ponen las de
    // los ajustes si las que hay vinieron de una plantilla de antes; si se escribieron a mano, se respetan.
    const base = ajustes?.aclaraciones || '';
    const deUnaPlantilla = !!d.aclaraciones.trim() && d.aclaraciones.trim() !== base.trim()
      && plantillas.some(x => (x.aclaraciones || '').trim() === d.aclaraciones.trim());
    const aclaraciones = !d.aclaraciones.trim() || deUnaPlantilla ? base : d.aclaraciones;
    const escritos = [d.descripcion_general.trim() && 'la introducción', d.secciones.length && 'las secciones'].filter(Boolean);
    if (escritos.length && !confirm(`Cambiar de plantilla reemplaza ${escritos.join(', ')} por los de «${pl?.nombre || 'Sin plantilla'}». ¿Seguir? (puedes deshacer hasta guardar)`)) return;
    setDeshacerPlantilla({ texto: `Se usó «${pl?.nombre || 'Sin plantilla'}».`, antes: d });
    if (!pl) set({ plantilla_id: null, plantilla_version: null, aclaraciones });
    else set({
      plantilla_id: pl.id, plantilla_version: pl.version, descripcion_general: pl.descripcion || '', aclaraciones,
      que_ve_cliente: pl.que_ve_cliente, titulo_valorizacion: pl.titulo_valorizacion,
      secciones: ajustes?.usa_presentacion ? pl.secciones || [] : d.secciones,
      ...(pl.plan_cobro && pl.plan_cobro.length ? { plan_cobro: pl.plan_cobro.map(h => ({ ...h })) } : {}),
    });
  };
  const plantillaActual = plantillas.find(p => p.id === d.plantilla_id);
  const versionNueva = editable && plantillaActual && d.plantilla_version && plantillaActual.version > d.plantilla_version ? plantillaActual : null;

  // ── Moneda ──
  const traerUF = async () => {
    setTrayendoUF(true);
    try {
      const res = await fetch('https://mindicador.cl/api/uf');
      const data = await res.json();
      const v = Number(data?.serie?.[0]?.valor || 0);
      if (v > 0) set({ valor_uf: Math.round(v * 100) / 100, fecha_valor_uf: fechaLocal() });
      else warning('No se pudo obtener la UF; escríbela a mano.');
    } catch { warning('No se pudo obtener la UF; escríbela a mano.'); }
    finally { setTrayendoUF(false); }
  };
  const convertir = (a: Moneda) => {
    const uf = Number(d.valor_uf) || 0;
    if (!(uf > 0)) { warning('Escribe el valor de la UF.'); return; }
    const conv = (v: number, costo: boolean) => (a === 'UF' ? q(v / uf, costo ? 0.000001 : 0.0001) : q(v * uf, 1));
    setD(x => ({
      ...x, moneda: a, fecha_valor_uf: x.fecha_valor_uf || fechaLocal(),
      items: x.items.map(l => ({ ...l, costo: conv(l.costo || 0, true), precio: l.fuera ? l.precio : conv(l.precio || 0, false) })),
    }));
    setCambioMoneda(null);
  };

  // ── Secciones de la presentación ──
  const setSecciones = (f: (s: Seccion[]) => Seccion[]) => setD(x => ({ ...x, secciones: f(x.secciones) }));
  const conPresentacion = !!ajustes?.usa_presentacion || d.secciones.length > 0;

  // ── Receta: agregar y deshacer ──
  const agregarReceta = (lineas: Linea[], resp: Respuestas) => {
    if (!asistente) return;
    const { receta, partidaId } = asistente;
    recordadas.current.set(receta.id, resp);
    const antes = d.items;
    agregarLineas(partidaId, lineas);
    setPartidas(ps => ps.map(p => (p.id === partidaId && !p.nombre.trim() ? { ...p, nombre: receta.nombre } : p)));
    setRecetaAgregada({ partidaId, nombre: receta.nombre, cuantas: lineas.length, antes, ids: lineas.map(l => l.id) });
    setAsistente(null);
  };
  // «Deshacer» vale mientras la partida siga como quedó.
  useEffect(() => {
    if (!recetaAgregada) return;
    const siguen = recetaAgregada.ids.every(i => d.items.some(l => l.id === i));
    if (!siguen) setRecetaAgregada(null);
  }, [d.items, recetaAgregada]);

  if (falta) return <div className="anim-in"><FaltaSQL /><p style={{ color: 'var(--muted)' }}>El cotizador nuevo necesita <b>supabase_fase4_cotizador_tecapp.sql</b>.</p></div>;
  if (cargando) return <div className="anim-in"><div className="skeleton" style={{ height: 420 }} /></div>;

  const resumenCliente = cliente ? [cliente.nombre_cliente, sucursal?.nombre, contacto?.nombre && `At. ${contacto.nombre}`].filter(Boolean).join(' · ') : 'Sin cliente';
  const resumenCot = `${d.moneda === 'UF' ? 'UF' : 'Pesos'} · ${QUE_VE.find(x => x.valor === d.que_ve_cliente)?.nombre} · válida hasta ${d.valida_hasta ? formatDate(d.valida_hasta) : '—'}`;
  const sueltas = d.items.filter(l => !l.partidaId || !d.partidas.some(p => p.id === l.partidaId));
  const clientesF = buscaCliente.trim()
    ? clientes.filter(c => `${c.nombre_cliente} ${c.empresa || ''} ${c.rut || ''}`.toLowerCase().includes(buscaCliente.trim().toLowerCase())).slice(0, 8) : [];

  const menuMas: { texto: string; hacer: () => void; peligro?: boolean }[] = [];
  if (cot && d.estado === 'Enviada' && puedeEditar) {
    menuMas.push({ texto: 'Reenviar', hacer: () => setModal('reenviar') });
    menuMas.push({ texto: 'Volver a borrador', hacer: () => setModal('volver') });
  }
  if (cot && d.token_publico && d.estado !== 'Borrador') {
    menuMas.push({ texto: 'Copiar el enlace del cliente', hacer: () => { navigator.clipboard?.writeText(linkPublico(d.token_publico!)); success('Enlace copiado'); } });
  }
  if (cot && ['Borrador', 'Enviada'].includes(d.estado) && puedeEditar) menuMas.push({ texto: 'Anular', hacer: () => setModal('anular'), peligro: true });
  if (cot && d.estado === 'Aprobada' && puedeEditar && puedeAprobar) menuMas.push({ texto: 'Anular la aprobada', hacer: () => setModal('anular'), peligro: true });

  const bloqueResumen = (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 12, alignSelf: 'start' }}>
      <div className="panel-y" style={{ padding: '1rem' }}>
        <p className="section-label" style={{ marginTop: 0 }}>Lo que paga el cliente</p>
        {[['Subtotal', calc.totales.subtotal], ...(calc.totales.descuento ? [['Descuento', -calc.totales.descuento]] : []), ['Neto', calc.totales.neto],
          ...(calc.totales.exento ? [['Exento', calc.totales.exento]] : []), ['IVA 19 %', calc.totales.iva]].map(([t, v]) => (
          <div key={t as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', padding: '0.2rem 0', color: 'var(--text)' }}>
            <span style={{ color: 'var(--muted)' }}>{t}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMonto(v as number, d.moneda)}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.15rem', fontWeight: 800, padding: '0.5rem 0 0', borderTop: '1px solid var(--border2)', marginTop: 4, color: 'var(--text)' }}>
          <span>Total</span><span>{formatMonto(calc.totales.total, d.moneda)}</span>
        </div>
        {d.moneda === 'UF' && <p style={{ fontSize: '0.76rem', color: 'var(--muted)', margin: '6px 0 0' }}>
          {calc.totales.totalClp !== null ? <>En pesos: {formatMonto(calc.totales.totalClp, 'CLP')} (UF {Number(d.valor_uf).toLocaleString('es-CL')})</> : 'Falta el valor de la UF.'}</p>}
      </div>
      {puedeCostos && verCostos && (
        <div className="panel-y" style={{ padding: '1rem' }}>
          <p className="section-label" style={{ marginTop: 0 }}>Interno (no sale en el PDF)</p>
          {calc.internos.porCategoria.map(c => (
            <div key={c.categoria} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.15rem 0', color: 'var(--text)' }}>
              <span style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: CATEGORIA_COLORS[c.categoria] }} />{CATEGORIA_LABELS[c.categoria]}</span>
              <span>{formatMonto(c.costoConImprevistos, d.moneda)} → {formatMonto(c.utilidad, d.moneda)}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--border2)', marginTop: 6, paddingTop: 6, fontSize: '0.84rem', color: 'var(--text)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Costo</span><b>{formatMonto(calc.internos.costoConImprevistos, d.moneda)}</b></div>
            {calc.internos.imprevistos > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}><span>de eso, imprevistos</span><span>{formatMonto(calc.internos.imprevistos, d.moneda)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Utilidad</span>
              <b style={{ color: calc.internos.utilidad < 0 ? 'var(--danger)' : 'var(--success)' }}>{formatMonto(calc.internos.utilidad, d.moneda)} ({porcentaje(calc.internos.margen)})</b></div>
          </div>
        </div>
      )}
      {editable && avisos.length > 0 && (
        <div className="panel-y" style={{ padding: '1rem' }}>
          <p className="section-label" style={{ marginTop: 0 }}>Antes de enviar</p>
          {avisos.slice(0, 8).map((a, i) => (
            <button key={i} type="button" onClick={() => a.ir && irA(a.ir)}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '0.2rem 0', cursor: a.ir ? 'pointer' : 'default', fontSize: '0.78rem', color: a.nivel === 'rojo' ? 'var(--danger)' : '#d97706' }}>
              • {a.texto}</button>
          ))}
          {avisos.length > 8 && <p style={{ fontSize: '0.74rem', color: 'var(--muted)', margin: 0 }}>y {avisos.length - 8} más.</p>}
        </div>
      )}
      <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {editable && <>
          <p className="section-label" style={{ margin: 0 }}>Agregar partida</p>
          <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={() => agregarPartida('instalacion')} title="Cada producto trae su mano de obra, ligada a él"><Plus size={14} /> Partida de instalación</button>
          <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={() => agregarPartida('venta')} title="Venta de producto: solo el producto, sin mano de obra"><Plus size={14} /> Partida de venta</button>
          <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={() => setModal('ia')}><Sparkles size={14} /> Cotizar con IA</button>
          {d.agendamiento_id && <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', borderColor: 'var(--y-brand)' }} onClick={() => setModal('levantamiento')}
            title="Revisa lo detectado en los informes de la visita y créalo como partidas"><ClipboardList size={14} /> Desde el levantamiento</button>}
        </>}
        {puedeCostos && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem', color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={verCostos} style={{ accentColor: 'var(--y-brand)', width: 16, height: 16 }}
              onChange={e => { setVerCostos(e.target.checked); try { localStorage.setItem(VER_COSTOS, e.target.checked ? '1' : '0'); } catch { /* opcional */ } }} />
            Ver costos <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>(no salen en el PDF)</span>
          </label>
        )}
      </div>
    </aside>
  );

  function irA(elId: string) {
    const bloque = elId.replace('cot-bloque-', '') as Bloque;
    if (elId.startsWith('cot-bloque-')) setAbierto(a => ({ ...a, [bloque]: true }));
    setTimeout(() => document.getElementById(elId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  }

  return (
    <div className="anim-in">
      {/* Encabezado: N°, estado y los botones del estado. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <p className="pg-eyebrow"><Link href="/cotizador/historial">Comercial · Cotizaciones</Link> <span style={{ color: 'var(--muted)' }}>· Cotizador {VERSION_COTIZADOR}</span></p>
          <h1 className="pg-title" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            {cot ? `Cotización ${folioDe(cot.folio)}` : 'Nueva cotización'}
            {cot && <EstadoPill estado={d.estado} vencida={vencida} />}
            {d.revision > 0 && <span className="badge" style={{ background: 'var(--bg3)', color: 'var(--muted)', fontSize: '0.72rem' }}>Revisión {d.revision}</span>}
          </h1>
          <p className="pg-subtitle">
            {cot ? [cliente?.nombre_cliente, `creada el ${formatDate(cot.created_at)}${vendedor ? ` por ${vendedor.nombre}` : ''}`, cot.origen_id ? 'copia de otra cotización' : ''].filter(Boolean).join(' · ')
              : 'Todavía no tiene N°: lo toma al guardarla por primera vez.'}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {cot && <button className="btn btn-ghost" onClick={() => setModal('historial')}><History size={14} /> Historial</button>}
          {cot && puedeEditar && <button className="btn btn-ghost" onClick={async () => {
            if (sucio && !confirm('Hay cambios sin guardar que no van en la copia. ¿Clonar igual?')) return;
            try { const nuevo = await cotizadorService.clonar(cot.id); success('Copia creada'); router.push(`/cotizador?edit=${nuevo}`); }
            catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo clonar'); }
          }}><Copy size={14} /> Clonar</button>}
          {editable ? (<>
            <button className="btn btn-ghost" onClick={verPDF} disabled={guardando}><Eye size={14} /> Vista previa del PDF</button>
            <button className="btn btn-ghost" onClick={() => guardar()} disabled={guardando || (!sucio && !!cot)}>
              {guardando ? <Loader2 size={14} className="iv-spin" /> : <Save size={14} />} Guardar
              {sucio && !guardando && <span aria-label="Hay cambios sin guardar" style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--danger)', display: 'inline-block', marginLeft: 4 }} />}
            </button>
            <button className="btn btn-primary" onClick={abrirRevisar} disabled={guardando}><Send size={14} /> Revisar y enviar</button>
          </>) : cot && (<>
            <button className="btn btn-ghost" onClick={verPDF}><FileDown size={14} /> PDF</button>
            {d.estado === 'Enviada' && puedeAprobar && <button className="btn btn-ghost" onClick={() => setModal('rechazar')}><XCircle size={14} /> Rechazada</button>}
            {d.estado === 'Enviada' && puedeAprobar && <button className="btn btn-primary" onClick={() => setModal('aprobar')}><CheckCircle2 size={14} /> Aprobada por el cliente</button>}
          </>)}
          {menuMas.length > 0 && (
            <MenuAcciones etiqueta="Más acciones" ancho={240}>
              {cerrar => menuMas.map(m => (
                <button key={m.texto} type="button" style={{ ...opcionMenu, color: m.peligro ? 'var(--danger)' : 'var(--text)' }} onClick={() => { cerrar(); m.hacer(); }}>{m.texto}</button>
              ))}
            </MenuAcciones>
          )}
        </div>
      </div>

      {cot && d.estado === 'Aprobada' && 'trabajo_estado' in cot && (
        <TrabajoPanel cot={{ id: cot.id, folio: cot.folio, titulo: d.titulo, total: Number(cot.total_clp ?? cot.total ?? 0), trabajo_estado: cot.trabajo_estado,
          trabajo_inicio: cot.trabajo_inicio, trabajo_termino: cot.trabajo_termino }} plan={planDe(cot)} onCambio={() => cargarDoc(cot.id)}
          cliente={(() => { const c = clientes.find(x => x.id === cot.cliente_id) || cot.clientes; return c ? { nombre: c.nombre_cliente, rut: c.rut, direccion: sitios.find(s => s.id === cot.sucursal_id)?.direccion || c.direccion } : undefined; })()}
          responsable={vendedor?.nombre || null} />
      )}
      {cot && d.estado !== 'Borrador' && <EstadoActual d={d} envios={envios} equipo={equipo} onAbrir={async p => { const u = await cotizadorService.urlArchivo(p); if (u) window.open(u, '_blank'); }} />}
      {!puedeEditar && <p style={{ fontSize: '0.84rem', color: 'var(--muted)', marginBottom: 10 }}>Solo lectura: no tienes permiso para editar cotizaciones.</p>}

      <div className="cot-grid" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr)', alignItems: 'start' }}>
        <style>{`@media (min-width: 1200px) { .cot-grid { grid-template-columns: minmax(0,1fr) 18rem !important; } }`}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {/* Título */}
          <fieldset disabled={!editable} style={{ border: 'none', margin: 0, padding: 0 }}>
            <label htmlFor="cot-titulo" style={etiqueta}>Título de la cotización (lo lee el cliente)</label>
            <input id="cot-titulo" className="input" value={d.titulo} maxLength={200} onChange={e => set({ titulo: e.target.value })}
              placeholder="Por ejemplo: Normalización eléctrica, salas de tableros pisos 17, 22 y 23"
              style={{ fontSize: '1.05rem', fontWeight: 700, padding: '0.75rem 1rem' }} />
          </fieldset>

          {/* Plantilla */}
          <section className="panel-y" style={{ padding: '0.6rem 1rem', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <span className="pg-eyebrow" style={{ margin: 0 }}>Plantilla</span>
            <select className="input" style={{ maxWidth: 320 }} disabled={!editable} value={d.plantilla_id || ''} onChange={e => elegirPlantilla(e.target.value)}>
              <option value="">Sin plantilla</option>
              {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.es_la_de_siempre ? ' · la de siempre' : ''}</option>)}
            </select>
            {d.plantilla_version ? <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>versión {d.plantilla_version}</span> : null}
            {versionNueva && <button type="button" className="btn btn-ghost btn-xs" onClick={() => elegirPlantilla(versionNueva.id)} style={{ color: '#d97706' }}>
              La plantilla cambió (versión {d.plantilla_version} → {versionNueva.version}): traer la nueva</button>}
            {puedeAprobar && <Link href="/cotizador/plantillas" style={{ marginLeft: 'auto', fontSize: '0.78rem' }}>Administrar plantillas</Link>}
            {deshacerPlantilla && (
              <div style={{ width: '100%', display: 'flex', gap: 10, fontSize: '0.84rem', background: 'var(--bg3)', borderRadius: 8, padding: '0.4rem 0.7rem' }}>
                <span style={{ flex: 1 }}>{deshacerPlantilla.texto}</span>
                <button type="button" onClick={() => { setD(deshacerPlantilla.antes); setDeshacerPlantilla(null); }} style={{ background: 'none', border: 'none', color: 'var(--y)', textDecoration: 'underline', cursor: 'pointer' }}>Deshacer</button>
                <button type="button" onClick={() => setDeshacerPlantilla(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
              </div>
            )}
          </section>

          {cliente?.estado_pago && cliente.estado_pago !== 'al_dia' && (
            <p role="alert" style={{ margin: 0, borderRadius: 10, padding: '0.6rem 0.8rem', fontSize: '0.86rem', fontWeight: 600,
              background: cliente.estado_pago === 'bloqueado' ? 'rgba(220,38,38,.1)' : 'rgba(217,119,6,.1)', color: cliente.estado_pago === 'bloqueado' ? 'var(--danger)' : '#d97706' }}>
              {cliente.estado_pago === 'bloqueado' ? '⛔ El cliente está bloqueado por pagos pendientes: no se le puede enviar.' : '⚠ El cliente no está al día con sus pagos.'}
              {cliente.nota_pago ? ` ${cliente.nota_pago}` : ''}
            </p>
          )}

          {/* 1. Cliente */}
          <BloquePlegable id="cot-bloque-cliente" titulo="Cliente" resumen={resumenCliente} abierto={abierto.cliente}
            onAlternar={() => setAbierto(a => ({ ...a, cliente: !a.cliente }))} marcado={!d.cliente_id && !!cot}>
            <fieldset disabled={!editable} style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1', position: 'relative' }}>
                <span style={etiqueta}>Cliente *</span>
                {cliente && !buscaCliente ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b style={{ color: 'var(--text)' }}>{cliente.nombre_cliente}</b>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{cliente.empresa ? `${cliente.empresa} · ` : ''}{cliente.rut ? `RUT ${cliente.rut}` : 'Sin RUT'}{cliente.email ? ` · ${cliente.email}` : ''}</span>
                    {editable && <button type="button" className="btn btn-ghost btn-xs" onClick={() => setBuscaCliente(' ')}>Cambiar</button>}
                  </div>
                ) : (
                  <>
                    <div style={{ position: 'relative' }}>
                      <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                      <input className="input" autoFocus={!!buscaCliente} value={buscaCliente.trimStart()} onChange={e => setBuscaCliente(e.target.value)} placeholder="Buscar por nombre, empresa o RUT…" style={{ paddingLeft: '2rem' }} />
                    </div>
                    {clientesF.length > 0 && (
                      <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, marginTop: 4, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, overflow: 'hidden' }}>
                        {clientesF.map(c => (
                          <button key={c.id} type="button" onClick={() => { set({ cliente_id: c.id, clientes: c, sucursal_id: null, contacto_id: null }); setBuscaCliente(''); }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', background: 'none', border: 'none', borderBottom: '1px solid var(--border2)', cursor: 'pointer', color: 'var(--text)', fontSize: '0.86rem' }}>
                            <b>{c.nombre_cliente}</b> <span style={{ color: 'var(--muted)', fontSize: '0.76rem' }}>{c.empresa || ''} {c.rut || ''}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {cliente && <button type="button" className="btn btn-ghost btn-xs" style={{ marginTop: 6 }} onClick={() => setBuscaCliente('')}>Mantener {cliente.nombre_cliente}</button>}
                  </>
                )}
              </div>
              <label><span style={etiqueta}>Sucursal (dónde se hace el trabajo)</span>
                <select className="input" disabled={!d.cliente_id || !editable} value={d.sucursal_id || ''} onChange={e => set({ sucursal_id: e.target.value || null })}>
                  <option value="">{sitios.length ? 'Sin sucursal' : 'El cliente no tiene sucursales'}</option>
                  {sitios.map(s => <option key={s.id} value={s.id}>{s.nombre}{s.comuna ? ` · ${s.comuna}` : ''}</option>)}
                </select></label>
              <label><span style={etiqueta}>Atención</span>
                <select className="input" disabled={!d.cliente_id || !editable} value={d.contacto_id || ''} onChange={e => set({ contacto_id: e.target.value || null })}>
                  <option value="">{contactos.length ? 'Sin contacto' : 'El cliente no tiene contactos'}</option>
                  {contactos.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.email ? ` · ${c.email}` : ' · sin correo'}</option>)}
                </select></label>
              <label><span style={etiqueta}>Cotiza (empresa emisora)</span>
                <select className="input" disabled={!editable} value={empresa?.id || ''} onChange={e => set({ empresa_id: e.target.value || null })}>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
                {vendedor && <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Firma: {firmaVendedor(vendedor, empresa?.nombre || '')}</span>}
              </label>
              {(proyectos.length > 0 || d.proyecto_id) && (
                <label><span style={etiqueta}>Proyecto</span>
                  <select className="input" disabled={!editable} value={d.proyecto_id || ''} onChange={e => set({ proyecto_id: e.target.value || null })}>
                    <option value="">Sin proyecto</option>
                    {proyectos.filter(p => !d.cliente_id || !p.cliente_id || p.cliente_id === d.cliente_id || p.id === d.proyecto_id).map(p => <option key={p.id} value={p.id}>{folioProyecto(p.folio)} · {p.nombre}</option>)}
                  </select></label>
              )}
              {(d.solicitud_id || d.levantamiento_id || d.ot_id || d.agendamiento_id) && (
                <div style={{ fontSize: '0.82rem', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={etiqueta}>Origen</span>
                  {d.ot_id && <Link href={`/ordenes/${d.ot_id}`}>Viene de una OT: al aprobarse, el trabajo sigue en ella</Link>}
                  {d.solicitud_id && <Link href="/solicitudes">Viene de una solicitud</Link>}
                  {d.agendamiento_id && <Link href="/agenda">Viene de una visita de la agenda</Link>}
                  {(d.levantamiento_id || d.ot_id || d.agendamiento_id) && (
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text)' }}>
                      <input type="checkbox" checked={!!d.incluir_fotos} onChange={e => set({ incluir_fotos: e.target.checked })} style={{ accentColor: 'var(--y-brand)' }} />
                      {d.ot_id || d.agendamiento_id ? 'Incluir las fotos de la visita en el PDF' : 'Incluir las fotos del levantamiento en el PDF'}
                    </label>
                  )}
                </div>
              )}
            </fieldset>
          </BloquePlegable>

          {/* 2. Cotización */}
          <BloquePlegable id="cot-bloque-cotizacion" titulo="Cotización" resumen={resumenCot} abierto={abierto.cotizacion}
            onAlternar={() => setAbierto(a => ({ ...a, cotizacion: !a.cotizacion }))}>
            <fieldset disabled={!editable} style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 12 }}>
              <div>
                <span style={etiqueta}>Válida hasta</span>
                <input className="input" type="date" value={d.valida_hasta || ''} onChange={e => set({ valida_hasta: e.target.value, valida_hasta_a_mano: true })} style={{ maxWidth: 180 }} />
                {editable && <p style={{ fontSize: '0.74rem', color: 'var(--muted)', margin: '4px 0 0' }}>
                  {d.valida_hasta_a_mano
                    ? <>Escrita a mano: al enviarla se respeta. <button type="button" onClick={() => set({ valida_hasta: sumarDias(hoy, diasDeSiempre), valida_hasta_a_mano: false })} style={{ background: 'none', border: 'none', color: 'var(--y)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.74rem' }}>Contarla desde el envío</button></>
                    : `Al enviarla se cuenta desde ese día: ${diasDeSiempre} días.`}</p>}
              </div>
              <div>
                <span style={etiqueta}>Moneda</span>
                <div style={{ display: 'inline-flex', border: '1px solid var(--border2)', borderRadius: 8, padding: 2 }}>
                  {(['CLP', 'UF'] as const).map(m => (
                    <button key={m} type="button" onClick={() => { if (m === d.moneda) { setCambioMoneda(null); return; } if (!d.items.length) set({ moneda: m }); else setCambioMoneda(m); }}
                      className="btn btn-sm" style={{ background: (cambioMoneda ?? d.moneda) === m ? 'var(--y-brand)' : 'transparent', color: (cambioMoneda ?? d.moneda) === m ? '#111' : 'var(--muted)' }}>
                      {m === 'CLP' ? 'Pesos (CLP)' : 'UF'}</button>
                  ))}
                </div>
              </div>
              {(d.moneda === 'UF' || cambioMoneda) && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', background: 'var(--bg3)', borderRadius: 10, padding: '0.7rem' }}>
                  <label><span style={etiqueta}>Valor de la UF</span>
                    <NumeroInput className="input" min={0} prefijo="$" value={d.valor_uf} onChange={v => set({ valor_uf: v || null })} onVacio={() => set({ valor_uf: null })} envoltura={{ width: 150 }} /></label>
                  <label><span style={etiqueta}>Al día</span>
                    <input className="input" type="date" value={d.fecha_valor_uf || ''} onChange={e => set({ fecha_valor_uf: e.target.value })} /></label>
                  <button type="button" className="btn btn-ghost" onClick={traerUF} disabled={trayendoUF}>{trayendoUF ? <Loader2 size={14} className="iv-spin" /> : <RotateCcw size={14} />} UF de hoy</button>
                  {cambioMoneda && <>
                    <button type="button" className="btn btn-ghost" onClick={() => setCambioMoneda(null)}>Cancelar</button>
                    <button type="button" className="btn btn-primary" disabled={!(Number(d.valor_uf) > 0)} onClick={() => convertir(cambioMoneda)}>Convertir a {cambioMoneda === 'UF' ? 'UF' : 'pesos'}</button>
                    <p style={{ width: '100%', fontSize: '0.74rem', color: 'var(--muted)', margin: 0 }}>Los costos y los precios se convierten con este valor; las utilidades no cambian. La vuelta no es exacta.</p>
                  </>}
                </div>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={etiqueta}>Qué ve el cliente en el PDF</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 8 }}>
                  {QUE_VE.map(o => (
                    <label key={o.valor} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', border: `1px solid ${d.que_ve_cliente === o.valor ? 'var(--y-brand)' : 'var(--border2)'}`, background: d.que_ve_cliente === o.valor ? 'var(--y-soft)' : 'transparent', borderRadius: 10, padding: '0.6rem', cursor: 'pointer' }}>
                      <input type="radio" name="que-ve" checked={d.que_ve_cliente === o.valor} onChange={() => set({ que_ve_cliente: o.valor })} style={{ accentColor: 'var(--y-brand)', marginTop: 3 }} />
                      <span><b style={{ display: 'block', fontSize: '0.86rem', color: 'var(--text)' }}>{o.nombre}</b><span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{o.ayuda}</span></span>
                    </label>
                  ))}
                </div>
              </div>
              {ajustes && 'plan_cobro' in ajustes && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={etiqueta}>Forma de pago (cobros por hitos: cada uno cae en «Por facturar» cuando corresponde)</span>
                  <PlanCobro plan={planDe(d)} editable={editable} onCambiar={p => set({ plan_cobro: p })} />
                </div>
              )}
            </fieldset>
          </BloquePlegable>

          {/* 3. Introducción */}
          <BloquePlegable id="cot-bloque-descripcion" titulo="Introducción" resumen={textoPlano(d.descripcion_general).slice(0, 100) || 'Sin introducción'}
            abierto={abierto.descripcion} onAlternar={() => setAbierto(a => ({ ...a, descripcion: !a.descripcion }))}>
            <span style={etiqueta}>Introducción (la lee el cliente al comienzo, antes de la valorización)</span>
            <EditorFormato valor={d.descripcion_general} editable={editable} onCambiar={t => set({ descripcion_general: t })} alto={130} etiqueta="Introducción"
              placeholder="De qué trata el trabajo: qué necesita el cliente, qué proponemos y qué resultado tendrá." />
          </BloquePlegable>

          {/* 4. Presentación */}
          {conPresentacion && (
            <BloquePlegable id="cot-bloque-presentacion" titulo="Presentación" resumen={d.secciones.length ? `${d.secciones.length} sección${d.secciones.length === 1 ? '' : 'es'}${d.secciones[0]?.tipo === 'portada' ? ' · con portada' : ''}` : 'Sin portada ni secciones'}
              abierto={abierto.presentacion} onAlternar={() => setAbierto(a => ({ ...a, presentacion: !a.presentacion }))}>
              <p style={{ fontSize: '0.76rem', color: 'var(--muted)', margin: '0 0 10px' }}>
                {d.secciones[0]?.tipo === 'portada' ? 'La portada es la hoja 1, con el N°; las secciones siguen a la introducción y la valorización empieza en una hoja nueva.'
                  : 'Las secciones siguen a la introducción; la valorización empieza en una hoja nueva.'}
                {!ajustes?.usa_presentacion && ' La presentación está apagada: estas secciones se conservan y se imprimen, pero no se agregan otras.'}
              </p>
              <EditorSecciones secciones={d.secciones} editable={editable} puedeAgregar={!!ajustes?.usa_presentacion} tituloCot={d.titulo} onCambiar={setSecciones} />
            </BloquePlegable>
          )}

          {/* 5. Valorización */}
          <div id="cot-valorizacion" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '0.4rem 0' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border2)' }} />
            <span className="pg-eyebrow" style={{ margin: 0 }}>Valorización · título en el PDF</span>
            <input className="input" value={d.titulo_valorizacion || ''} disabled={!editable} maxLength={80} onChange={e => set({ titulo_valorizacion: e.target.value })}
              placeholder={TITULO_VALORIZACION} style={{ width: 240, fontWeight: 700 }} />
            <span style={{ flex: 1, height: 1, background: 'var(--border2)' }} />
          </div>

          {/* 6. Presupuesto */}
          <section id="cot-presupuesto" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {d.partidas.length === 0 && d.items.length === 0 && (
              <p style={{ border: '1px dashed var(--border2)', borderRadius: 12, padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', margin: 0 }}>
                {editable ? 'Empieza con una partida: lo que el cliente lee como una línea con precio, por ejemplo «Tablero piso 2».' : 'Esta cotización no tiene líneas.'}
              </p>
            )}
            {d.partidas.map((p, i) => (
              <TarjetaPartida key={p.id} partida={p} indice={i} total={d.partidas.length} lineas={d.items.filter(l => l.partidaId === p.id)}
                calc={calc} moneda={d.moneda} valorUf={d.valor_uf} queVe={d.que_ve_cliente} verCostos={puedeCostos && verCostos} editable={editable}
                catalogo={catalogo} recetas={recetas} partidas={d.partidas} recienCreada={recienCreada === p.id}
                recetaAgregada={recetaAgregada?.partidaId === p.id ? recetaAgregada : null}
                lineaAcc={lineaAcc}
                acciones={{
                  onCambiar: patch => setPartidas(ps => ps.map(x => (x.id === p.id ? { ...x, ...patch } : x))),
                  onTipo: t => cambiarTipo(p.id, t),
                  onQuitar: () => {
                    const n = d.items.filter(l => l.partidaId === p.id).length;
                    if (n && !confirm(`¿Quitar la partida «${p.nombre || 'sin nombre'}» con sus ${n} línea${n === 1 ? '' : 's'}?`)) return;
                    setD(x => ({ ...x, partidas: x.partidas.filter(y => y.id !== p.id), items: x.items.filter(l => l.partidaId !== p.id) }));
                  },
                  onMover: dir => setPartidas(ps => {
                    const j = i + dir; if (j < 0 || j >= ps.length) return ps;
                    const out = [...ps]; [out[i], out[j]] = [out[j], out[i]]; return out;
                  }),
                  onAgregarDebajo: t => agregarPartida(t, p.id),
                  onArticulo: a => agregarArticulo(p, a),
                  onFuera: texto => agregarLineas(p.id, [{ ...lineaFuera(texto, p.id), ganancia: gananciaPorOmision(ajustes?.utilidad_por_tipo, 'material') }]),
                  onReceta: r => {
                    if (d.moneda === 'UF' && !(Number(d.valor_uf) > 0)) { warning('Está en UF: escribe el valor de la UF antes de agregar.'); return; }
                    setAsistente({ receta: r, partidaId: p.id });
                  },
                  onRecetaNueva: () => {
                    if (d.moneda === 'UF' && !(Number(d.valor_uf) > 0)) { warning('Está en UF: escribe el valor de la UF antes de agregar.'); return; }
                    setRecetaNuevaPara(p.id);
                  },
                  onDescuento: pct => setItems(items => items.map(l => (l.partidaId === p.id ? { ...l, descuento: pct } : l))),
                  onDeshacerReceta: () => { if (recetaAgregada) { setItems(() => recetaAgregada.antes); setRecetaAgregada(null); } },
                  onTraslado: () => setTrasladoPara(p.id),
                }} />
            ))}
            {sueltas.length > 0 && (
              <div style={{ border: '1px solid var(--border2)', borderLeft: '4px solid var(--muted)', borderRadius: 12, padding: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                  <b style={{ fontSize: '0.9rem', color: 'var(--text)' }}>Líneas sin partida</b>
                  <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>De antes: salen con su precio en el PDF. Pásalas a una partida.</span>
                </div>
                {sueltas.map(l => (
                  <div key={l.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '0.4rem 0', borderTop: '1px solid var(--border2)', fontSize: '0.86rem' }}>
                    <span style={{ flex: 1, minWidth: 180, color: 'var(--text)' }}>{l.descripcion || 'Sin descripción'}</span>
                    <span style={{ color: 'var(--muted)' }}>{Number(l.cantidad).toLocaleString('es-CL')} {l.unidad} × {formatMonto(calc.lineas.get(l.id)?.precio, d.moneda, true)}</span>
                    <b style={{ width: 110, textAlign: 'right' }}>{formatMonto(calc.lineas.get(l.id)?.neto, d.moneda)}</b>
                    {editable && d.partidas.length > 0 && (
                      <select className="input" style={{ width: 150, padding: '0.25rem' }} value="" onChange={e => e.target.value && lineaAcc.moverA(l.id, e.target.value)}>
                        <option value="">Pasar a…</option>
                        {d.partidas.map((p, i) => <option key={p.id} value={p.id}>{i + 1}. {p.nombre || 'Sin nombre'}</option>)}
                      </select>
                    )}
                    {editable && <button type="button" className="btn btn-ghost btn-xs" onClick={() => lineaAcc.quitar(l.id)} aria-label="Quitar">✕</button>}
                  </div>
                ))}
              </div>
            )}
            {editable && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-ghost" onClick={() => agregarPartida('instalacion')}><Plus size={14} /> Partida de instalación</button>
                <button className="btn btn-ghost" onClick={() => agregarPartida('venta')}><Plus size={14} /> Partida de venta</button>
                <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>En una de instalación, cada producto trae su mano de obra; en una de venta, solo el producto.</span>
              </div>
            )}
            <datalist id="unidades-de-item">{UNIDADES_ITEM.map(u => <option key={u} value={u} />)}</datalist>
          </section>

          {/* 7. Aclaraciones */}
          <BloquePlegable id="cot-bloque-aclaraciones" titulo="Aclaraciones y garantías" resumen={textoPlano(d.aclaraciones).slice(0, 100) || 'Sin aclaraciones'}
            abierto={abierto.aclaraciones} onAlternar={() => setAbierto(a => ({ ...a, aclaraciones: !a.aclaraciones }))}>
            <span style={etiqueta}>Aclaraciones y garantías (las lee el cliente al final, antes de la firma)</span>
            <EditorFormato valor={d.aclaraciones} editable={editable} onCambiar={t => set({ aclaraciones: t })} alto={170} etiqueta="Aclaraciones y garantías"
              placeholder="La garantía de los equipos y de la mano de obra, lo que no incluye, los horarios, la forma de pago." />
            {editable && <p style={{ fontSize: '0.74rem', color: 'var(--muted)', margin: '6px 0 0' }}>
              Aquí se cambian solo para esta cotización. {plantillaActual ? `La plantilla «${plantillaActual.nombre}» trae las suyas al elegirla.` : '«Sin plantilla» trae las de los Ajustes.'} Los datos para transferir no van aquí: el PDF los imprime solos al final.
            </p>}
          </BloquePlegable>
        </div>
        {bloqueResumen}
      </div>

      {modal === 'levantamiento' && d.agendamiento_id && <DesdeLevantamiento agendaId={d.agendamiento_id} catalogo={catalogo} onInsertar={insertarLevantamiento} onClose={() => setModal(null)} />}
      {modal === 'ia' && <CotizarIAConversa moneda={d.moneda} catalogo={catalogo} recetas={recetas} previsualizar={previsualizarIA} onInsertar={insertarConversa} onClose={() => setModal(null)} guardarComo={id || 'nueva'}
        contexto={[d.titulo?.trim(), textoPlano(d.descripcion_general).trim()].filter(Boolean).join('. ').slice(0, 1500)} />}
      {(modal === 'revisar' || modal === 'reenviar') && cot && (
        <RevisarYEnviar avisos={modal === 'reenviar' ? [] : avisos} reenvio={modal === 'reenviar'}
          para={contacto?.email || cliente?.email || ''} telefono={contacto?.telefono || cliente?.telefono || ''}
          mensajeWhatsapp={ajustes?.mensaje_whatsapp || 'Hola {cliente}, te envío la cotización {numero}: {titulo}, por {total}. Puedes verla y aceptarla aquí: {enlace}'}
          asunto={ajustes?.asunto_correo || 'Cotización {numero} · {empresa}'}
          mensajeCorreo={ajustes?.mensaje_correo || 'Hola {cliente}:\n\nTe envío la cotización {numero}: {titulo}, por {total}. Puedes verla y responder aquí: {enlace}\n\n{vendedor}'}
          onIrA={irA} onCerrar={() => setModal(null)} onEnviar={enviar} />
      )}
      {modal === 'aprobar' && cot && <AprobarModal cot={d} vencida={vencida} onCerrar={() => setModal(null)} onListo={() => { success('Aprobada: nació su orden de trabajo'); recargar(); }} />}
      {modal === 'rechazar' && cot && <RechazarModal cot={d} onCerrar={() => setModal(null)} onListo={() => { success('Marcada como rechazada'); recargar(); }} />}
      {modal === 'historial' && cot && <HistorialModal cot={d} onCerrar={() => setModal(null)} />}
      {modal === 'volver' && cot && (
        <PedirMotivo titulo="Volver a borrador" accion="Volver a borrador" onCerrar={() => setModal(null)}
          ayuda={`Queda como «Revisión ${d.revision + 1}» para corregirla y volver a enviarla. El PDF que el cliente ya tiene queda guardado en los envíos.`}
          onConfirmar={async m => { try { await cotizadorService.volverABorrador(cot.id, m); success(`Revisión ${d.revision + 1} en borrador`); await recargar(); } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); } }} />
      )}
      {modal === 'anular' && cot && (
        <PedirMotivo titulo={`Anular ${folioDe(cot.folio)}`} accion="Anular" peligro onCerrar={() => setModal(null)}
          ayuda="Queda Anulada y no vuelve; conserva su N°. Para cotizar de nuevo, clónala."
          onConfirmar={async m => { try { await cotizadorService.anular(cot.id, m); success('Cotización anulada'); await recargar(); } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); } }} />
      )}
      {trasladoPara && (
        <TrasladoModal onCerrar={() => setTrasladoPara(null)} onAgregar={(t, visitas) => {
          if (d.moneda === 'UF' && !(Number(d.valor_uf) > 0)) { warning('Está en UF: escribe el valor de la UF antes de agregar.'); return; }
          agregarLineas(trasladoPara, [{
            id: nuevoId(), partidaId: trasladoPara, descripcion: `Traslado a ${t.comuna}${t.desde_otra_base ? ` (desde ${t.sale_desde})` : ''}`,
            categoria: 'operacion', unidad: 'visita', cantidad: visitas, costo: aMoneda(t.total, d.moneda, d.valor_uf, true),
            imprevistos: 0, margen: 0, precio: 0, iva: IVA, descuento: 0, fuera: true, ganancia: 0,
          }]);
          setTrasladoPara(null);
          success('Traslado agregado');
        }} />
      )}
      {recetaNuevaPara && (
        <EditorReceta receta={null} catalogo={catalogo} puedeGuardar={puede('biblioteca.editar')}
          onCerrar={() => setRecetaNuevaPara(null)}
          onUsarAqui={r => { setAsistente({ receta: r, partidaId: recetaNuevaPara }); setRecetaNuevaPara(null); }}
          onGuardada={async id => {
            const pid = recetaNuevaPara;
            setRecetaNuevaPara(null);
            const lista = await recetasCotService.listar().catch(() => recetas);
            setRecetas(lista);
            const r = lista.find(x => x.id === id);
            if (r) setAsistente({ receta: r, partidaId: pid });
          }} />
      )}
      {asistente && (
        <AsistenteReceta receta={asistente.receta} partida={d.partidas.find(p => p.id === asistente.partidaId)!} catalogo={catMap}
          moneda={d.moneda} valorUf={d.valor_uf} recordadas={recordadas.current.get(asistente.receta.id)}
          onAgregar={agregarReceta} onCerrar={() => setAsistente(null)} />
      )}
    </div>
  );
}

function EstadoActual({ d, envios, equipo, onAbrir }: { d: CotizacionDoc; envios: EnvioCot[]; equipo: Record<string, Vendedor>; onAbrir: (path: string) => void }) {
  const enlace = d.token_publico ? linkPublico(d.token_publico) : null;
  return (
    <div className="panel-y" style={{ padding: '0.8rem 1rem', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.86rem', color: 'var(--text)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 1.2rem' }}>
        {d.enviada_at && <span><span style={{ color: 'var(--muted)' }}>Enviada:</span> {new Date(d.enviada_at).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
        {d.vista_at && <span><span style={{ color: 'var(--muted)' }}>El cliente la abrió:</span> {formatDate(d.vista_at)}</span>}
        {d.valida_hasta && <span><span style={{ color: 'var(--muted)' }}>Válida hasta:</span> {formatDate(d.valida_hasta)}</span>}
        {d.estado === 'Aprobada' && <span style={{ color: 'var(--success)' }}>Aprobada{d.revision_aprobada !== null && d.revision_aprobada !== undefined ? ` (revisión ${d.revision_aprobada})` : ''}{d.aprobada_como ? `: ${d.aprobada_como}` : d.respondida_por ? `: ${d.respondida_por} en línea` : ''}</span>}
        {d.estado === 'Rechazada' && <span style={{ color: 'var(--danger)' }}>Rechazada: {d.motivo_perdida}{d.motivo_perdida_nota ? ` · ${d.motivo_perdida_nota}` : ''}</span>}
        {d.estado === 'Anulada' && <span style={{ color: 'var(--muted)' }}>Anulada: {d.motivo_anulacion}</span>}
        {d.documento_respuesta && <button type="button" onClick={() => onAbrir(d.documento_respuesta!)} style={{ background: 'none', border: 'none', color: 'var(--y)', textDecoration: 'underline', cursor: 'pointer' }}>Ver correo u OC del cliente</button>}
      </div>
      {enlace && d.estado === 'Enviada' && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--muted)' }}>
          <Link2 size={13} /> <a href={enlace} target="_blank" rel="noopener noreferrer">{enlace}</a>
        </span>
      )}
      {envios.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--muted)' }}>Envíos ({envios.length})</summary>
          {envios.map(e => (
            <div key={e.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: '0.8rem', padding: '0.3rem 0', borderTop: '1px solid var(--border2)' }}>
              <span>Revisión {e.revision}{e.es_reenvio ? ' · reenvío' : ''}</span>
              <span style={{ color: 'var(--muted)' }}>{e.canal}{e.para ? ` a ${e.para}` : ''}</span>
              <span style={{ color: 'var(--muted)' }}>{new Date(e.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}{e.enviada_por && equipo[e.enviada_por] ? ` · ${equipo[e.enviada_por].nombre}` : ''}</span>
              {e.pdf_path && <button type="button" onClick={() => onAbrir(e.pdf_path!)} style={{ background: 'none', border: 'none', color: 'var(--y)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.8rem' }}>PDF que recibió</button>}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

function EditorSecciones({ secciones, editable, puedeAgregar, tituloCot, onCambiar }: {
  secciones: Seccion[]; editable: boolean; puedeAgregar: boolean; tituloCot: string; onCambiar: (f: (s: Seccion[]) => Seccion[]) => void;
}) {
  const cambiar = (clave: string, patch: Partial<Seccion>) => onCambiar(ss => ss.map(s => (s.clave === clave ? { ...s, ...patch } : s)));
  const mover = (i: number, dir: -1 | 1) => onCambiar(ss => {
    const j = i + dir;
    if (j < 0 || j >= ss.length || ss[j].tipo === 'portada' || ss[i].tipo === 'portada') return ss;
    const out = [...ss]; [out[i], out[j]] = [out[j], out[i]]; return out;
  });
  const conPortada = secciones[0]?.tipo === 'portada';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {secciones.map((s, i) => (
        <div key={s.clave} style={{ border: '1px solid var(--border2)', borderRadius: 10, padding: '0.7rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="badge" style={{ background: 'var(--bg3)', color: 'var(--muted)' }}>{s.tipo === 'portada' ? 'Portada' : `Sección ${conPortada ? i : i + 1}`}</span>
            <input className="input" disabled={!editable} value={s.titulo} onChange={e => cambiar(s.clave, { titulo: e.target.value })}
              placeholder={s.tipo === 'portada' ? `Vacío: «${tituloCot || 'el título de la cotización'}»` : 'Título de la sección'} style={{ flex: 1 }} />
            {editable && s.tipo !== 'portada' && <>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => mover(i, -1)} disabled={i === 0 || (conPortada && i === 1)}>↑</button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => mover(i, 1)} disabled={i === secciones.length - 1}>↓</button>
            </>}
            {editable && <button type="button" className="btn btn-ghost btn-xs" onClick={() => onCambiar(ss => ss.filter(x => x.clave !== s.clave))} aria-label="Quitar">✕</button>}
          </div>
          {s.tipo === 'portada' && <input className="input" disabled={!editable} value={s.subtitulo || ''} onChange={e => cambiar(s.clave, { subtitulo: e.target.value })} placeholder="Subtítulo (opcional)" />}
          <EditorFormato valor={s.texto} editable={editable} onCambiar={t => cambiar(s.clave, { texto: t })} alto={s.tipo === 'portada' ? 60 : 100}
            etiqueta={s.titulo || 'Texto de la sección'}
            placeholder={s.tipo === 'portada' ? 'Texto de la portada (opcional)' : 'Quiénes somos, el alcance, la metodología, la experiencia…'} />
          {s.tipo !== 'portada' && (
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', color: 'var(--text)' }}>
              <input type="checkbox" disabled={!editable} checked={!!s.hoja_nueva} onChange={e => cambiar(s.clave, { hoja_nueva: e.target.checked })} style={{ accentColor: 'var(--y-brand)' }} /> Empieza en una hoja nueva
            </label>
          )}
        </div>
      ))}
      {editable && puedeAgregar && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!conPortada && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCambiar(ss => [{ clave: nuevoId(), tipo: 'portada', titulo: '', subtitulo: '', texto: '' }, ...ss])}><Plus size={13} /> Portada</button>}
          {secciones.length < 21 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCambiar(ss => [...ss, { clave: nuevoId(), tipo: 'texto', titulo: '', texto: '', hoja_nueva: false }])}><Plus size={13} /> Sección</button>}
        </div>
      )}
    </div>
  );
}
