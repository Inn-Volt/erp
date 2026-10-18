-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 4: el cotizador de TecApp, adaptado a InnVolt
--
--   · Estados con sus botones: Borrador → Enviada → Aprobada / Rechazada / Anulada.
--     El estado ya no se cambia libre: solo con las funciones de abajo (y la
--     respuesta del cliente en el link). Solo un Borrador se edita.
--   · Revisión: una Enviada que vuelve a borrador sube su revisión; cada envío
--     guarda el PDF tal cual lo recibió el cliente.
--   · Historial de la cotización (quién, cuándo, motivo).
--   · Familias de precio: % de ganancia y redondeo; el precio del catálogo sale solo.
--   · Mano de obra ligada a cada producto (partidas de instalación).
--   · Plantillas con versión, «la de siempre», presentación (portada y secciones).
--   · Ajustes de cotización (validez, textos, mensajes).
--   · Recetas con preguntas (número, elegir producto, sí o no).
--
-- Ejecutar DESPUÉS de las fases 1, 2 y 3. Es idempotente. Convierte los datos que
-- ya existen: Pendiente → Borrador o Enviada; Aceptado/Realizado/Entregado → Aprobada;
-- Rechazado → Rechazada.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 1. Familias de precio y catálogo con precio ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.familias_precio (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  catalogo      TEXT NOT NULL DEFAULT 'bodega' CHECK (catalogo IN ('bodega','servicios')),
  nombre        TEXT NOT NULL,
  ganancia      NUMERIC(7,2) NOT NULL DEFAULT 30 CHECK (ganancia >= 0),   -- % sobre el costo (incluye imprevistos)
  redondeo      INTEGER NOT NULL DEFAULT 10 CHECK (redondeo IN (1,10,100,1000)),
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_motivo TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (catalogo, nombre)
);

ALTER TABLE public.catalogo_items ADD COLUMN IF NOT EXISTS familia_precio_id UUID REFERENCES public.familias_precio(id) ON DELETE SET NULL;
ALTER TABLE public.catalogo_items ADD COLUMN IF NOT EXISTS ganancia_propia   NUMERIC(7,2) CHECK (ganancia_propia IS NULL OR ganancia_propia >= 0);
ALTER TABLE public.catalogo_items ADD COLUMN IF NOT EXISTS marca             TEXT;
ALTER TABLE public.catalogo_items ADD COLUMN IF NOT EXISTS modelo            TEXT;
ALTER TABLE public.catalogo_items ADD COLUMN IF NOT EXISTS garantia          TEXT;
-- La mano de obra que necesita cada producto al instalarse («1 instalación de lector por lector»).
ALTER TABLE public.catalogo_items ADD COLUMN IF NOT EXISTS mano_obra_id      UUID REFERENCES public.catalogo_items(id) ON DELETE SET NULL;
ALTER TABLE public.catalogo_items ADD COLUMN IF NOT EXISTS mano_obra_por_unidad NUMERIC(10,3) NOT NULL DEFAULT 1;
ALTER TABLE public.catalogo_items ADD COLUMN IF NOT EXISTS ultimo_motivo     TEXT;
CREATE INDEX IF NOT EXISTS idx_catalogo_familia_precio ON public.catalogo_items(familia_precio_id);

-- Familias iniciales: una por cada familia que ya trae el catálogo (de la hoja), con la
-- ganancia que hoy dan los supuestos de su tipo, para que los precios no salten.
--   material  (imprevistos 20 %, margen 10 %) → 1,2 ÷ 0,9  − 1 ≈ 33 %
--   mano_obra (15 %, 40 %)                    → 1,15 ÷ 0,6 − 1 ≈ 92 %
--   servicio / operación (20 %, 15 %)          → 1,2 ÷ 0,85 − 1 ≈ 41 %
INSERT INTO public.familias_precio (catalogo, nombre, ganancia, redondeo)
SELECT DISTINCT
       CASE WHEN categoria = 'material' THEN 'bodega' ELSE 'servicios' END,
       COALESCE(NULLIF(trim(familia), ''),
                CASE categoria WHEN 'material' THEN 'Materiales' WHEN 'mano_obra' THEN 'Mano de obra'
                               WHEN 'servicio' THEN 'Servicios' ELSE 'Operación' END),
       CASE categoria WHEN 'material' THEN 33 WHEN 'mano_obra' THEN 92 ELSE 41 END,
       10
FROM public.catalogo_items
ON CONFLICT (catalogo, nombre) DO NOTHING;

UPDATE public.catalogo_items c
   SET familia_precio_id = f.id
  FROM public.familias_precio f
 WHERE c.familia_precio_id IS NULL
   AND f.catalogo = CASE WHEN c.categoria = 'material' THEN 'bodega' ELSE 'servicios' END
   AND f.nombre = COALESCE(NULLIF(trim(c.familia), ''),
                CASE c.categoria WHEN 'material' THEN 'Materiales' WHEN 'mano_obra' THEN 'Mano de obra'
                                 WHEN 'servicio' THEN 'Servicios' ELSE 'Operación' END);

-- Un producto nuevo (o que cambia de familia en la hoja) queda en la familia de precio de
-- su nombre; si no existe, se crea con la ganancia de su tipo. Así la sincronización con
-- Google Sheets no necesita nada más.
CREATE OR REPLACE FUNCTION public.catalogo_familia_precio()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cat TEXT; v_nombre TEXT; v_id UUID;
BEGIN
  IF NEW.familia_precio_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.familia IS NOT DISTINCT FROM OLD.familia) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.familia IS NOT DISTINCT FROM OLD.familia AND NEW.familia_precio_id IS NOT NULL THEN RETURN NEW; END IF;
  v_cat := CASE WHEN NEW.categoria = 'material' THEN 'bodega' ELSE 'servicios' END;
  v_nombre := COALESCE(NULLIF(trim(NEW.familia), ''),
    CASE NEW.categoria WHEN 'material' THEN 'Materiales' WHEN 'mano_obra' THEN 'Mano de obra' WHEN 'servicio' THEN 'Servicios' ELSE 'Operación' END);
  SELECT id INTO v_id FROM public.familias_precio WHERE catalogo = v_cat AND nombre = v_nombre;
  IF v_id IS NULL THEN
    INSERT INTO public.familias_precio (catalogo, nombre, ganancia, redondeo)
    VALUES (v_cat, v_nombre, CASE NEW.categoria WHEN 'material' THEN 33 WHEN 'mano_obra' THEN 92 ELSE 41 END, 10)
    ON CONFLICT (catalogo, nombre) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id INTO v_id;
  END IF;
  NEW.familia_precio_id := v_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_catalogo_familia_precio ON public.catalogo_items;
CREATE TRIGGER trg_catalogo_familia_precio BEFORE INSERT OR UPDATE OF familia, categoria ON public.catalogo_items
  FOR EACH ROW EXECUTE FUNCTION public.catalogo_familia_precio();

-- Precio de venta del catálogo: costo × (1 + ganancia) hacia arriba al redondeo.
-- La ganancia propia manda sobre la de la familia; sin ninguna, no tiene precio (NULL).
CREATE OR REPLACE FUNCTION public.precio_catalogo(p_costo NUMERIC, p_ganancia NUMERIC, p_redondeo INTEGER)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_ganancia IS NULL OR p_costo IS NULL THEN NULL
              ELSE ceil(p_costo * (1 + p_ganancia / 100) / COALESCE(NULLIF(p_redondeo, 0), 1)) * COALESCE(NULLIF(p_redondeo, 0), 1) END;
$$;

CREATE OR REPLACE VIEW public.catalogo_con_precio WITH (security_invoker = true) AS
SELECT c.*,
       f.nombre   AS familia_precio_nombre,
       COALESCE(c.ganancia_propia, f.ganancia) AS ganancia_efectiva,
       COALESCE(f.redondeo, 1) AS redondeo_efectivo,
       public.precio_catalogo(c.costo, COALESCE(c.ganancia_propia, f.ganancia), COALESCE(f.redondeo, 1)) AS precio_venta
FROM public.catalogo_items c
LEFT JOIN public.familias_precio f ON f.id = c.familia_precio_id;

-- ─── 2. Ajustes de cotización (una sola fila) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ajustes_cotizacion (
  id                 INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dias_validez       SMALLINT NOT NULL DEFAULT 15 CHECK (dias_validez BETWEEN 1 AND 365),
  aclaraciones       TEXT,       -- para una cotización «sin plantilla»
  importante         TEXT,       -- el texto «Importante» de la valorización
  correo_aceptar     TEXT,       -- «Cómo aceptar»: a qué correo responder
  usa_presentacion   BOOLEAN NOT NULL DEFAULT TRUE,
  responde_en_linea  BOOLEAN NOT NULL DEFAULT TRUE,
  asunto_correo      TEXT DEFAULT 'Cotización {numero} · {empresa}',
  mensaje_correo     TEXT DEFAULT 'Hola {cliente}:' || chr(10) || chr(10) || 'Te envío la cotización {numero}: {titulo}, por {total}. Puedes verla y responder aquí: {enlace}' || chr(10) || chr(10) || 'Quedo atento.' || chr(10) || '{vendedor}',
  mensaje_whatsapp   TEXT DEFAULT 'Hola {cliente}, te envío la cotización {numero}: {titulo}, por {total}. Puedes verla y aceptarla aquí: {enlace}',
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO public.ajustes_cotizacion (id, aclaraciones)
SELECT 1, NULLIF(concat_ws(chr(10) || chr(10), garantia_default, condiciones_default), '')
FROM (SELECT garantia_default, condiciones_default FROM public.configuracion_empresa ORDER BY id LIMIT 1) c
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.ajustes_cotizacion (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─── 3. Plantillas (amplía la tabla que ya existía) ──────────────────────────
ALTER TABLE public.plantillas_cotizacion ADD COLUMN IF NOT EXISTS para_que            TEXT;
ALTER TABLE public.plantillas_cotizacion ADD COLUMN IF NOT EXISTS aclaraciones        TEXT;
ALTER TABLE public.plantillas_cotizacion ADD COLUMN IF NOT EXISTS que_ve_cliente      TEXT NOT NULL DEFAULT 'partidas';
ALTER TABLE public.plantillas_cotizacion ADD COLUMN IF NOT EXISTS titulo_valorizacion TEXT;
ALTER TABLE public.plantillas_cotizacion ADD COLUMN IF NOT EXISTS secciones           JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.plantillas_cotizacion ADD COLUMN IF NOT EXISTS es_la_de_siempre    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.plantillas_cotizacion ADD COLUMN IF NOT EXISTS activa              BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.plantillas_cotizacion ADD COLUMN IF NOT EXISTS version             INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.plantillas_cotizacion ADD COLUMN IF NOT EXISTS actualizada_por     UUID;
UPDATE public.plantillas_cotizacion
   SET aclaraciones = NULLIF(concat_ws(chr(10) || chr(10), garantia, condiciones), '')
 WHERE aclaraciones IS NULL;
-- La primera queda como «la de siempre» si no hay ninguna.
UPDATE public.plantillas_cotizacion SET es_la_de_siempre = TRUE
 WHERE id = (SELECT id FROM public.plantillas_cotizacion ORDER BY created_at LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM public.plantillas_cotizacion WHERE es_la_de_siempre);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plantilla_de_siempre ON public.plantillas_cotizacion ((TRUE)) WHERE es_la_de_siempre;

-- La versión sube solo si cambia algo que se imprime.
CREATE OR REPLACE FUNCTION public.plantilla_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.descripcion, NEW.aclaraciones, NEW.que_ve_cliente, NEW.titulo_valorizacion, NEW.secciones)
     IS DISTINCT FROM (OLD.descripcion, OLD.aclaraciones, OLD.que_ve_cliente, OLD.titulo_valorizacion, OLD.secciones) THEN
    NEW.version := OLD.version + 1;
  END IF;
  IF OLD.es_la_de_siempre AND NOT NEW.activa THEN
    RAISE EXCEPTION 'La plantilla de siempre no se desactiva: marca otra primero.' USING ERRCODE = '23514';
  END IF;
  NEW.actualizada_por := COALESCE(auth.uid(), NEW.actualizada_por);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_plantilla_version ON public.plantillas_cotizacion;
CREATE TRIGGER trg_plantilla_version BEFORE UPDATE ON public.plantillas_cotizacion
  FOR EACH ROW EXECUTE FUNCTION public.plantilla_version();

-- Marcar «la de siempre» (desmarca la anterior en la misma operación).
CREATE OR REPLACE FUNCTION public.plantilla_de_siempre(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.tiene_permiso('cotizaciones.aprobar') THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar las plantillas.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.plantillas_cotizacion SET es_la_de_siempre = FALSE WHERE es_la_de_siempre AND id <> p_id;
  UPDATE public.plantillas_cotizacion SET es_la_de_siempre = TRUE, activa = TRUE WHERE id = p_id;
END $$;
GRANT EXECUTE ON FUNCTION public.plantilla_de_siempre(UUID) TO authenticated;

-- ─── 4. Recetas con preguntas ────────────────────────────────────────────────
-- preguntas: [{clave, tipo:'numero'|'producto'|'sino', texto, ayuda, minimo, maximo,
--              defecto, entero, unidad, opciones:[{item_id, etiqueta, defecto}]}]
ALTER TABLE public.recetas ADD COLUMN IF NOT EXISTS preguntas JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.recetas ADD COLUMN IF NOT EXISTS version   INTEGER NOT NULL DEFAULT 1;
-- regla de un componente (NULL = fijo, «cantidad» por cada unidad de la receta):
--   {elegido_en, modo:'fija'|'por_cada'|'uno_cada', por_pregunta, por_cada, fijo, cada,
--    si_pregunta, si_es, si_opcion, rango_pregunta, desde, hasta}
ALTER TABLE public.receta_componentes ADD COLUMN IF NOT EXISTS regla JSONB;
-- Lo de la fase 3 («¿Incluye …?» en un componente) pasa a una pregunta de sí o no.
DO $$
DECLARE r RECORD; v_clave TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receta_componentes' AND column_name = 'pregunta') THEN
    FOR r IN SELECT id, receta_id, pregunta FROM public.receta_componentes WHERE COALESCE(trim(pregunta), '') <> '' AND regla IS NULL LOOP
      v_clave := 'p' || substr(md5(r.id::TEXT), 1, 8);
      UPDATE public.recetas
         SET preguntas = preguntas || jsonb_build_array(jsonb_build_object('clave', v_clave, 'tipo', 'sino', 'texto', r.pregunta, 'defecto', TRUE))
       WHERE id = r.receta_id AND NOT (preguntas @> jsonb_build_array(jsonb_build_object('clave', v_clave)));
      UPDATE public.receta_componentes SET regla = jsonb_build_object('si_pregunta', v_clave, 'si_es', TRUE) WHERE id = r.id;
    END LOOP;
  END IF;
END $$;

-- ─── 5. Cotizaciones: lo nuevo ───────────────────────────────────────────────
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS titulo               TEXT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS plantilla_id         UUID REFERENCES public.plantillas_cotizacion(id) ON DELETE SET NULL;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS plantilla_version    INTEGER;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS titulo_valorizacion  TEXT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS que_ve_cliente       TEXT NOT NULL DEFAULT 'partidas';
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS aclaraciones         TEXT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS secciones            JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS fecha_emision        DATE;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS dias_validez         SMALLINT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS valida_hasta         DATE;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS valida_hasta_a_mano  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS fecha_valor_uf       DATE;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS sucursal_id          UUID REFERENCES public.cliente_sucursales(id) ON DELETE SET NULL;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS contacto_id          UUID REFERENCES public.cliente_contactos(id) ON DELETE SET NULL;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS origen_id            UUID REFERENCES public.cotizaciones(id) ON DELETE SET NULL;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS revision_aprobada    SMALLINT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS enviada_por          UUID;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS aprobada_como        TEXT;   -- «Juan Pérez, correo del 06-10»
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS documento_respuesta  TEXT;   -- correo u OC del cliente (Storage)
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS motivo_anulacion     TEXT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS costo_directo        NUMERIC(14,2);
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS utilidad             NUMERIC(14,2);

-- Textos: título desde la primera línea de la descripción; aclaraciones = garantía + condiciones.
UPDATE public.cotizaciones
   SET titulo = COALESCE(NULLIF(left(regexp_replace(split_part(COALESCE(descripcion_general, ''), E'\n', 1), '\*\*', '', 'g'), 200), ''), 'Cotización')
 WHERE titulo IS NULL;
UPDATE public.cotizaciones
   SET aclaraciones = NULLIF(concat_ws(chr(10) || chr(10), condiciones_servicio, condiciones_comerciales), '')
 WHERE aclaraciones IS NULL;
UPDATE public.cotizaciones SET que_ve_cliente = 'detalle' WHERE mostrar_detalle IS TRUE AND que_ve_cliente = 'partidas';
UPDATE public.cotizaciones SET fecha_emision = (COALESCE(enviada_at, created_at) AT TIME ZONE 'America/Santiago')::DATE WHERE fecha_emision IS NULL;
UPDATE public.cotizaciones SET dias_validez = 15 WHERE dias_validez IS NULL;
UPDATE public.cotizaciones SET valida_hasta = fecha_emision + dias_validez WHERE valida_hasta IS NULL;
-- La portada de la fase 3 pasa a ser una sección «portada».
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cotizaciones' AND column_name = 'incluir_portada') THEN
    UPDATE public.cotizaciones
       SET secciones = jsonb_build_array(jsonb_build_object('clave', 'portada', 'tipo', 'portada', 'titulo', '', 'subtitulo', '', 'texto', '', 'hoja_nueva', FALSE)) || secciones
     WHERE incluir_portada AND NOT (secciones @> '[{"tipo":"portada"}]');
  END IF;
END $$;

-- Estados: los de TecApp. Primero se suelta la regla vieja y se apagan los triggers
-- que reaccionan al estado, para convertir sin efectos (sin OT nuevas ni avisos).
ALTER TABLE public.cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_estado_check;
DROP TRIGGER IF EXISTS trg_cotizacion_revisar ON public.cotizaciones;   -- fase 3: reemplazado por «volver a borrador»
DROP TRIGGER IF EXISTS trg_cotizacion_estado ON public.cotizaciones;
DROP TRIGGER IF EXISTS trg_ot_desde_cotizacion ON public.cotizaciones;
DROP TRIGGER IF EXISTS trg_avisos_cotizacion ON public.cotizaciones;
DROP TRIGGER IF EXISTS trg_auditoria ON public.cotizaciones;
UPDATE public.cotizaciones SET estado = CASE
    WHEN estado = 'Pendiente' AND (enviada_at IS NOT NULL OR vista_at IS NOT NULL) THEN 'Enviada'
    WHEN estado = 'Pendiente' THEN 'Borrador'
    WHEN estado IN ('Aceptado','Realizado','Entregado') THEN 'Aprobada'
    WHEN estado = 'Rechazado' THEN 'Rechazada'
    ELSE estado END
 WHERE estado IN ('Pendiente','Aceptado','Realizado','Entregado','Rechazado');
UPDATE public.cotizaciones SET revision_aprobada = revision WHERE estado = 'Aprobada' AND revision_aprobada IS NULL;
ALTER TABLE public.cotizaciones ALTER COLUMN estado SET DEFAULT 'Borrador';
ALTER TABLE public.cotizaciones ADD CONSTRAINT cotizaciones_estado_check
  CHECK (estado IN ('Borrador','Enviada','Aprobada','Rechazada','Anulada'));
ALTER TABLE public.cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_que_ve_check;
ALTER TABLE public.cotizaciones ADD CONSTRAINT cotizaciones_que_ve_check CHECK (que_ve_cliente IN ('partidas','detalle','total'));

-- ─── 6. Historial y envíos ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cotizacion_eventos (
  id             BIGSERIAL PRIMARY KEY,
  cotizacion_id  UUID NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL,          -- creada · enviada · reenviada · aprobada · rechazada · borrador · anulada · clonada
  estado_antes   TEXT,
  estado_despues TEXT,
  revision       SMALLINT,
  motivo         TEXT,
  usuario_id     UUID,
  usuario_nombre TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cot_eventos ON public.cotizacion_eventos(cotizacion_id, created_at);

CREATE TABLE IF NOT EXISTS public.cotizacion_envios (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cotizacion_id  UUID NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  revision       SMALLINT NOT NULL,
  canal          TEXT NOT NULL DEFAULT 'descarga' CHECK (canal IN ('correo','whatsapp','ambos','descarga','enlace')),
  para           TEXT,
  pdf_path       TEXT,
  total          NUMERIC(14,2),
  moneda         TEXT,
  es_reenvio     BOOLEAN NOT NULL DEFAULT FALSE,
  enviada_por    UUID DEFAULT auth.uid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cot_envios ON public.cotizacion_envios(cotizacion_id, created_at);

-- Lo que ya había: un evento «creada» y, si se envió, su envío (sin PDF guardado).
INSERT INTO public.cotizacion_eventos (cotizacion_id, tipo, estado_despues, revision, usuario_id, created_at)
SELECT id, 'creada', 'Borrador', 0, vendedor_id, created_at FROM public.cotizaciones c
 WHERE NOT EXISTS (SELECT 1 FROM public.cotizacion_eventos e WHERE e.cotizacion_id = c.id);
INSERT INTO public.cotizacion_envios (cotizacion_id, revision, canal, total, moneda, enviada_por, created_at)
SELECT id, revision, 'enlace', total, moneda, vendedor_id, enviada_at FROM public.cotizaciones c
 WHERE enviada_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cotizacion_envios v WHERE v.cotizacion_id = c.id);

-- El historial se escribe solo con cada cambio de estado (también la respuesta del cliente).
CREATE OR REPLACE FUNCTION public.cotizacion_evento()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tipo TEXT; v_nombre TEXT;
BEGIN
  SELECT nombre INTO v_nombre FROM public.profiles WHERE id = auth.uid();
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.cotizacion_eventos (cotizacion_id, tipo, estado_despues, revision, motivo, usuario_id, usuario_nombre)
    VALUES (NEW.id, CASE WHEN NEW.origen_id IS NULL THEN 'creada' ELSE 'clonada' END, NEW.estado, NEW.revision,
            NULLIF(current_setting('innvolt.motivo', TRUE), ''), auth.uid(), v_nombre);
    RETURN NULL;
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    v_tipo := CASE NEW.estado WHEN 'Enviada' THEN 'enviada' WHEN 'Aprobada' THEN 'aprobada' WHEN 'Rechazada' THEN 'rechazada'
                              WHEN 'Borrador' THEN 'borrador' WHEN 'Anulada' THEN 'anulada' ELSE lower(NEW.estado) END;
    INSERT INTO public.cotizacion_eventos (cotizacion_id, tipo, estado_antes, estado_despues, revision, motivo, usuario_id, usuario_nombre)
    VALUES (NEW.id, v_tipo, OLD.estado, NEW.estado, NEW.revision,
            NULLIF(current_setting('innvolt.motivo', TRUE), ''), auth.uid(),
            COALESCE(v_nombre, CASE WHEN auth.uid() IS NULL THEN 'El cliente (enlace)' END));
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_cotizacion_evento ON public.cotizaciones;
CREATE TRIGGER trg_cotizacion_evento AFTER INSERT OR UPDATE OF estado ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.cotizacion_evento();

-- ─── 7. Reglas: el estado cambia solo con sus botones; solo un Borrador se edita ─
CREATE OR REPLACE FUNCTION public.cotizacion_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_transicion BOOLEAN := COALESCE(current_setting('innvolt.transicion', TRUE), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND NOT v_transicion THEN
      NEW.estado := 'Borrador';
      NEW.revision := 0;
      NEW.enviada_at := NULL; NEW.vista_at := NULL; NEW.respondida_at := NULL; NEW.aceptada_at := NULL;
    END IF;
    NEW.fecha_emision := COALESCE(NEW.fecha_emision, (NOW() AT TIME ZONE 'America/Santiago')::DATE);
    NEW.dias_validez  := COALESCE(NEW.dias_validez, (SELECT dias_validez FROM public.ajustes_cotizacion WHERE id = 1), 15);
    NEW.valida_hasta  := COALESCE(NEW.valida_hasta, NEW.fecha_emision + NEW.dias_validez);
    NEW.titulo        := COALESCE(NULLIF(trim(NEW.titulo), ''), 'Cotización');
    RETURN NEW;
  END IF;

  -- El servidor (link del cliente, SQL Editor) sigue sus propias reglas.
  IF auth.uid() IS NULL OR v_transicion THEN
    IF NEW.estado = 'Aprobada' THEN NEW.aceptada_at := COALESCE(NEW.aceptada_at, NEW.respondida_at, NOW()); END IF;
    IF NEW.estado <> 'Aprobada' THEN NEW.aceptada_at := NULL; END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    RAISE EXCEPTION 'El estado de una cotización cambia solo con sus botones (enviar, aprobar, rechazar, volver a borrador, anular).' USING ERRCODE = '42501';
  END IF;
  IF OLD.estado <> 'Borrador' AND (
       NEW.items, NEW.partidas, NEW.subtotal, NEW.iva, NEW.total, NEW.total_clp, NEW.descuento_global, NEW.moneda, NEW.valor_uf,
       NEW.titulo, NEW.descripcion_general, NEW.aclaraciones, NEW.condiciones_servicio, NEW.condiciones_comerciales,
       NEW.secciones, NEW.que_ve_cliente, NEW.titulo_valorizacion, NEW.cliente_id, NEW.empresa_id, NEW.revision,
       NEW.valida_hasta, NEW.fecha_emision, NEW.folio, NEW.ocultar_suministros, NEW.mostrar_detalle)
     IS DISTINCT FROM (
       OLD.items, OLD.partidas, OLD.subtotal, OLD.iva, OLD.total, OLD.total_clp, OLD.descuento_global, OLD.moneda, OLD.valor_uf,
       OLD.titulo, OLD.descripcion_general, OLD.aclaraciones, OLD.condiciones_servicio, OLD.condiciones_comerciales,
       OLD.secciones, OLD.que_ve_cliente, OLD.titulo_valorizacion, OLD.cliente_id, OLD.empresa_id, OLD.revision,
       OLD.valida_hasta, OLD.fecha_emision, OLD.folio, OLD.ocultar_suministros, OLD.mostrar_detalle) THEN
    RAISE EXCEPTION 'Solo un borrador se edita. Para cambiar una enviada: «Volver a borrador».' USING ERRCODE = '42501';
  END IF;
  IF NEW.folio IS DISTINCT FROM OLD.folio THEN
    RAISE EXCEPTION 'El N° de una cotización no se cambia.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cotizacion_reglas ON public.cotizaciones;
CREATE TRIGGER trg_cotizacion_reglas BEFORE INSERT OR UPDATE ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.cotizacion_reglas();
DROP FUNCTION IF EXISTS public.cotizacion_estado() CASCADE;
DROP FUNCTION IF EXISTS public.cotizacion_revisar() CASCADE;

-- Una cotización no se borra: se anula (con motivo).
DROP POLICY IF EXISTS cotizaciones_eliminar ON public.cotizaciones;

-- ─── 8. Las acciones (cada una exige su permiso y su estado) ─────────────────
CREATE OR REPLACE FUNCTION public._cot_transicion(p_motivo TEXT)
RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('innvolt.transicion', 'on', TRUE), set_config('innvolt.motivo', COALESCE(p_motivo, ''), TRUE);
$$;
REVOKE EXECUTE ON FUNCTION public._cot_transicion(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._cot_get(p_id UUID)
RETURNS public.cotizaciones LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cotizaciones;
BEGIN
  SELECT * INTO c FROM public.cotizaciones WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe esa cotización.' USING ERRCODE = 'P0002'; END IF;
  RETURN c;
END $$;
REVOKE EXECUTE ON FUNCTION public._cot_get(UUID) FROM PUBLIC, anon, authenticated;

-- Enviar: revisa lo que no deja enviar, fija la fecha (hoy) y la validez, pasa a Enviada
-- y anota el envío. Devuelve el id del envío (para subirle el PDF). Sirve también para
-- reenviar una Enviada (anota otro envío, no cambia nada más).
CREATE OR REPLACE FUNCTION public.cot_enviar(p_id UUID, p_canal TEXT DEFAULT 'descarga', p_para TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cotizaciones; v_hoy DATE := (NOW() AT TIME ZONE 'America/Santiago')::DATE; v_envio UUID;
BEGIN
  IF NOT public.tiene_permiso('cotizaciones.crear') THEN
    RAISE EXCEPTION 'No tienes permiso para enviar cotizaciones.' USING ERRCODE = '42501';
  END IF;
  c := public._cot_get(p_id);
  IF c.estado = 'Enviada' THEN
    INSERT INTO public.cotizacion_envios (cotizacion_id, revision, canal, para, total, moneda, es_reenvio)
    VALUES (c.id, c.revision, COALESCE(p_canal, 'descarga'), p_para, c.total, c.moneda, TRUE) RETURNING id INTO v_envio;
    PERFORM public._cot_transicion('reenviada');
    INSERT INTO public.cotizacion_eventos (cotizacion_id, tipo, estado_antes, estado_despues, revision, usuario_id, usuario_nombre)
    VALUES (c.id, 'reenviada', c.estado, c.estado, c.revision, auth.uid(), (SELECT nombre FROM public.profiles WHERE id = auth.uid()));
    RETURN v_envio;
  END IF;
  IF c.estado <> 'Borrador' THEN
    RAISE EXCEPTION 'Solo se envía un borrador.' USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(COALESCE(c.items, '[]'::JSONB)) = 0 THEN
    RAISE EXCEPTION 'La cotización no tiene ninguna línea.' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(c.total, 0) <= 0 THEN
    RAISE EXCEPTION 'El total da cero.' USING ERRCODE = '23514';
  END IF;
  IF c.moneda = 'UF' AND COALESCE(c.valor_uf, 0) <= 0 THEN
    RAISE EXCEPTION 'Está en UF y falta el valor de la UF.' USING ERRCODE = '23514';
  END IF;
  IF c.valida_hasta_a_mano AND c.valida_hasta < v_hoy THEN
    RAISE EXCEPTION 'La «válida hasta» escrita a mano ya pasó.' USING ERRCODE = '23514';
  END IF;
  PERFORM public._cot_transicion(NULL);
  UPDATE public.cotizaciones
     SET estado = 'Enviada', fecha_emision = v_hoy,
         valida_hasta = CASE WHEN valida_hasta_a_mano THEN valida_hasta ELSE v_hoy + COALESCE(dias_validez, 15) END,
         enviada_at = NOW(), enviada_por = auth.uid(),
         token_publico = COALESCE(token_publico, gen_random_uuid())
   WHERE id = c.id;
  INSERT INTO public.cotizacion_envios (cotizacion_id, revision, canal, para, total, moneda)
  VALUES (c.id, c.revision, COALESCE(p_canal, 'descarga'), p_para, c.total, c.moneda) RETURNING id INTO v_envio;
  RETURN v_envio;
END $$;

-- El PDF de un envío se sube después de enviar (lo arma el navegador con lo ya guardado).
CREATE OR REPLACE FUNCTION public.cot_envio_pdf(p_envio UUID, p_path TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.cotizacion_envios SET pdf_path = p_path
   WHERE id = p_envio AND pdf_path IS NULL AND enviada_por = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.cot_aprobar(p_id UUID, p_como TEXT, p_documento TEXT DEFAULT NULL, p_motivo TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cotizaciones;
BEGIN
  IF NOT public.tiene_permiso('cotizaciones.aprobar') THEN
    RAISE EXCEPTION 'No tienes permiso para anotar la respuesta del cliente.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(trim(p_como), '') = '' THEN
    RAISE EXCEPTION 'Indica quién aprobó del lado del cliente y cómo.' USING ERRCODE = '23514';
  END IF;
  c := public._cot_get(p_id);
  IF c.estado <> 'Enviada' THEN
    RAISE EXCEPTION 'Solo se aprueba una cotización enviada.' USING ERRCODE = '23514';
  END IF;
  IF c.valida_hasta < (NOW() AT TIME ZONE 'America/Santiago')::DATE AND COALESCE(trim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'Está vencida: indica el motivo para aprobarla igual.' USING ERRCODE = '23514';
  END IF;
  PERFORM public._cot_transicion(NULLIF(concat_ws(' · ', p_como, NULLIF(trim(p_motivo), '')), ''));
  UPDATE public.cotizaciones
     SET estado = 'Aprobada', aprobada_como = trim(p_como), documento_respuesta = COALESCE(p_documento, documento_respuesta),
         revision_aprobada = revision, aceptada_at = NOW(), motivo_perdida = NULL, motivo_perdida_nota = NULL
   WHERE id = c.id;
END $$;

CREATE OR REPLACE FUNCTION public.cot_rechazar(p_id UUID, p_motivo TEXT, p_nota TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cotizaciones;
BEGIN
  IF NOT public.tiene_permiso('cotizaciones.aprobar') THEN
    RAISE EXCEPTION 'No tienes permiso para anotar la respuesta del cliente.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(trim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'Elige el motivo.' USING ERRCODE = '23514';
  END IF;
  IF p_motivo = 'Otro' AND COALESCE(trim(p_nota), '') = '' THEN
    RAISE EXCEPTION 'Con «Otro», escribe una nota.' USING ERRCODE = '23514';
  END IF;
  c := public._cot_get(p_id);
  IF c.estado <> 'Enviada' THEN
    RAISE EXCEPTION 'Solo se rechaza una cotización enviada.' USING ERRCODE = '23514';
  END IF;
  PERFORM public._cot_transicion(concat_ws(' · ', p_motivo, NULLIF(trim(p_nota), '')));
  UPDATE public.cotizaciones SET estado = 'Rechazada', motivo_perdida = p_motivo, motivo_perdida_nota = NULLIF(trim(p_nota), '')
   WHERE id = c.id;
END $$;

CREATE OR REPLACE FUNCTION public.cot_volver_borrador(p_id UUID, p_motivo TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cotizaciones;
BEGIN
  IF NOT public.tiene_permiso('cotizaciones.crear') THEN
    RAISE EXCEPTION 'No tienes permiso para editar cotizaciones.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(trim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'Indica el motivo.' USING ERRCODE = '23514';
  END IF;
  c := public._cot_get(p_id);
  IF c.estado <> 'Enviada' THEN
    RAISE EXCEPTION 'Solo una cotización enviada vuelve a borrador. Una aprobada no: lo que falte se cotiza aparte.' USING ERRCODE = '23514';
  END IF;
  PERFORM public._cot_transicion(trim(p_motivo));
  -- La revisión sube ANTES del cambio de estado, para que el historial la anote.
  UPDATE public.cotizaciones SET revision = revision + 1, estado = 'Borrador',
         vista_at = NULL, respondida_at = NULL, respondida_por = NULL, respondida_rut = NULL
   WHERE id = c.id;
END $$;

CREATE OR REPLACE FUNCTION public.cot_anular(p_id UUID, p_motivo TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cotizaciones; v_ot TEXT;
BEGIN
  IF COALESCE(trim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'Indica el motivo.' USING ERRCODE = '23514';
  END IF;
  c := public._cot_get(p_id);
  IF c.estado IN ('Rechazada','Anulada') THEN
    RAISE EXCEPTION 'Esta cotización ya está cerrada.' USING ERRCODE = '23514';
  END IF;
  IF c.estado = 'Aprobada' THEN
    IF NOT (public.tiene_permiso('cotizaciones.crear') AND public.tiene_permiso('cotizaciones.aprobar')) THEN
      RAISE EXCEPTION 'Anular una aprobada exige «Crear» y «Aprobar» a la vez.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.por_facturar WHERE cotizacion_id = c.id AND etapa IN ('facturado','sin_cobro')) THEN
      RAISE EXCEPTION 'Su trabajo ya se facturó o quedó sin cobro: no se puede anular.' USING ERRCODE = '23514';
    END IF;
    SELECT 'OT-' || lpad(folio::TEXT, 4, '0') INTO v_ot FROM public.ordenes_trabajo
     WHERE cotizacion_id = c.id AND estado NOT IN ('anulada') LIMIT 1;
    IF v_ot IS NOT NULL THEN
      RAISE EXCEPTION 'Tiene la % viva: anúlala primero.', v_ot USING ERRCODE = '23514';
    END IF;
  ELSIF NOT public.tiene_permiso('cotizaciones.crear') THEN
    RAISE EXCEPTION 'No tienes permiso para anular cotizaciones.' USING ERRCODE = '42501';
  END IF;
  PERFORM public._cot_transicion(trim(p_motivo));
  UPDATE public.cotizaciones SET estado = 'Anulada', motivo_anulacion = trim(p_motivo) WHERE id = c.id;
END $$;

-- Clonar: copia nueva en Borrador, con otro N° y los mismos precios congelados.
CREATE OR REPLACE FUNCTION public.cot_clonar(p_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cotizaciones; v_id UUID := gen_random_uuid(); v_fila JSONB;
BEGIN
  IF NOT public.tiene_permiso('cotizaciones.crear') THEN
    RAISE EXCEPTION 'No tienes permiso para crear cotizaciones.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.cotizaciones WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe esa cotización.' USING ERRCODE = 'P0002'; END IF;
  -- Se sobrescriben (no se quitan): una clave ausente quedaría NULL y no tomaría su valor por omisión.
  v_fila := to_jsonb(c)
    || jsonb_build_object(
         'id', v_id, 'folio', nextval(pg_get_serial_sequence('public.cotizaciones', 'folio')),
         'created_at', NOW(), 'updated_at', NOW(), 'estado', 'Borrador', 'revision', 0, 'origen_id', c.id,
         'vendedor_id', auth.uid(), 'valida_hasta_a_mano', FALSE, 'token_publico', gen_random_uuid(),
         'enviada_at', NULL, 'enviada_por', NULL, 'vista_at', NULL, 'respondida_at', NULL, 'respondida_por', NULL,
         'respondida_rut', NULL, 'respuesta_comentario', NULL, 'respuesta_firma', NULL, 'aceptada_at', NULL,
         'motivo_perdida', NULL, 'motivo_perdida_nota', NULL, 'motivo_anulacion', NULL, 'aprobada_como', NULL,
         'documento_respuesta', NULL, 'revision_aprobada', NULL, 'seguimiento_at', NULL, 'seguimientos', 0,
         'fecha_emision', NULL, 'valida_hasta', NULL, 'valor_uf', NULL, 'fecha_valor_uf', NULL);
  INSERT INTO public.cotizaciones SELECT * FROM jsonb_populate_record(NULL::public.cotizaciones, v_fila);
  RETURN v_id;
END $$;

-- El próximo N° (con motivo; nunca baja del mayor que ya existe).
CREATE OR REPLACE FUNCTION public.cot_proximo_numero(p_numero INTEGER, p_motivo TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max INTEGER;
BEGIN
  IF NOT public.tiene_permiso('cotizaciones.aprobar') THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar los ajustes.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(trim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Indica el motivo.' USING ERRCODE = '23514'; END IF;
  SELECT COALESCE(MAX(folio), 0) INTO v_max FROM public.cotizaciones;
  IF p_numero <= v_max THEN
    RAISE EXCEPTION 'El próximo N° tiene que ser mayor que % (el último que existe).', v_max USING ERRCODE = '23514';
  END IF;
  PERFORM setval(pg_get_serial_sequence('public.cotizaciones', 'folio'), p_numero - 1, TRUE);
  INSERT INTO public.auditoria (tabla, registro_id, accion, cambios, usuario_id, usuario_nombre)
  VALUES ('ajustes_cotizacion', '1', 'editar', jsonb_build_object('proximo_numero', jsonb_build_object('despues', p_numero, 'motivo', p_motivo)),
          auth.uid(), (SELECT nombre FROM public.profiles WHERE id = auth.uid()));
END $$;

CREATE OR REPLACE FUNCTION public.cot_ultimo_numero()
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MAX(folio), 0) FROM public.cotizaciones;
$$;

GRANT EXECUTE ON FUNCTION public.cot_enviar(UUID, TEXT, TEXT), public.cot_envio_pdf(UUID, TEXT),
  public.cot_aprobar(UUID, TEXT, TEXT, TEXT), public.cot_rechazar(UUID, TEXT, TEXT),
  public.cot_volver_borrador(UUID, TEXT), public.cot_anular(UUID, TEXT), public.cot_clonar(UUID),
  public.cot_proximo_numero(INTEGER, TEXT), public.cot_ultimo_numero() TO authenticated;

-- ─── 9. Lo que reaccionaba a los estados viejos ──────────────────────────────
-- OT al aprobar.
CREATE OR REPLACE FUNCTION public.ot_desde_cotizacion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dir TEXT; v_id UUID; v_folio INT;
BEGIN
  IF NEW.estado = 'Aprobada' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'Aprobada')
     AND NOT EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE cotizacion_id = NEW.id) THEN
    SELECT COALESCE(s.direccion || COALESCE(', ' || s.comuna, ''), cl.direccion) INTO v_dir
      FROM public.clientes cl LEFT JOIN public.cliente_sucursales s ON s.id = NEW.sucursal_id
     WHERE cl.id = NEW.cliente_id;
    INSERT INTO public.ordenes_trabajo (cotizacion_id, cliente_id, solicitud_id, sucursal_id, titulo, descripcion, direccion, creado_por)
    VALUES (NEW.id, NEW.cliente_id, NEW.solicitud_id, NEW.sucursal_id,
            'IV-' || lpad(NEW.folio::TEXT, 4, '0') || ' · ' || left(COALESCE(NEW.titulo, 'Cotización'), 120),
            NEW.descripcion_general, v_dir, COALESCE(NEW.vendedor_id, auth.uid()))
    RETURNING id, folio INTO v_id, v_folio;
    PERFORM public.notificar('ot.ver', 'ot_nueva', 'Nueva OT-' || lpad(v_folio::TEXT, 4, '0'),
      'Nació de la cotización IV-' || lpad(NEW.folio::TEXT, 4, '0') || ' aprobada. Falta coordinarla.', '/ordenes/' || v_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ot_desde_cotizacion AFTER INSERT OR UPDATE OF estado ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.ot_desde_cotizacion();

-- Avisos: abrió, aprobó, rechazó (a quien la envió y a quienes ven cotizaciones).
CREATE OR REPLACE FUNCTION public.avisos_cotizacion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_folio TEXT := 'IV-' || lpad(NEW.folio::TEXT, 4, '0');
  v_url   TEXT := '/cotizador?edit=' || NEW.id;
  v_cli   TEXT;
BEGIN
  SELECT nombre_cliente INTO v_cli FROM public.clientes WHERE id = NEW.cliente_id;
  IF OLD.vista_at IS NULL AND NEW.vista_at IS NOT NULL THEN
    PERFORM public.notificar('cotizaciones.ver', 'cotizacion_vista', 'El cliente abrió ' || v_folio,
      COALESCE(v_cli, 'El cliente') || ' vio la cotización por primera vez.', v_url);
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado IN ('Aprobada','Rechazada') THEN
    IF NEW.estado = 'Aprobada' THEN
      PERFORM public.notificar('cotizaciones.ver', 'cotizacion_aceptada', v_folio || ' fue aprobada',
        COALESCE(NEW.respondida_por, NEW.aprobada_como, v_cli, 'El cliente') ||
        CASE WHEN auth.uid() IS NULL THEN ' la aceptó en línea.' ELSE ' (anotada en InnVolt).' END, v_url);
    ELSE
      PERFORM public.notificar('cotizaciones.ver', 'cotizacion_rechazada', v_folio || ' fue rechazada',
        'Motivo: ' || COALESCE(NEW.motivo_perdida, 'sin motivo') || '.', v_url);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_avisos_cotizacion AFTER UPDATE ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.avisos_cotizacion();

CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.auditar();

CREATE OR REPLACE FUNCTION public.get_kpis()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result JSON;
BEGIN
  IF NOT public.tiene_permiso('dashboard.ver') THEN
    RAISE EXCEPTION 'Sin permiso.' USING ERRCODE = '42501';
  END IF;
  SELECT json_build_object(
    'total_cotizaciones', COUNT(*) FILTER (WHERE estado <> 'Anulada'),
    'venta_acumulada',    COALESCE(SUM(COALESCE(total_clp, total)) FILTER (WHERE estado = 'Aprobada'), 0),
    'pendiente_pipeline', COALESCE(SUM(COALESCE(total_clp, total)) FILTER (WHERE estado = 'Enviada'), 0),
    'aceptadas',          COUNT(*) FILTER (WHERE estado = 'Aprobada')
  ) INTO result FROM public.cotizaciones;
  RETURN result;
END $$;

-- ─── 10. Archivos: PDF de cada envío y el correo u OC del cliente ────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('cotizaciones', 'cotizaciones', FALSE)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "cotarch_select" ON storage.objects;
CREATE POLICY "cotarch_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cotizaciones' AND (SELECT public.tiene_permiso('cotizaciones.ver')));
DROP POLICY IF EXISTS "cotarch_insert" ON storage.objects;
CREATE POLICY "cotarch_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cotizaciones' AND (SELECT public.tiene_alguno(ARRAY['cotizaciones.crear','cotizaciones.aprobar'])));

-- ─── 11. Acceso y reglas de las tablas nuevas ────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['familias_precio','ajustes_cotizacion','plantillas_cotizacion'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.auditar()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['familias_precio','ajustes_cotizacion'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.familias_precio, public.plantillas_cotizacion TO authenticated;
GRANT SELECT, UPDATE ON public.ajustes_cotizacion TO authenticated;
GRANT SELECT ON public.cotizacion_eventos, public.cotizacion_envios, public.catalogo_con_precio TO authenticated;
GRANT ALL ON public.familias_precio, public.ajustes_cotizacion, public.cotizacion_eventos, public.cotizacion_envios TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.cotizacion_eventos_id_seq TO service_role;

ALTER TABLE public.familias_precio     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajustes_cotizacion  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_eventos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_envios   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS familias_ver ON public.familias_precio;
CREATE POLICY familias_ver ON public.familias_precio FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['biblioteca.ver','cotizaciones.crear','cotizaciones.ver_costos'])));
DROP POLICY IF EXISTS familias_crear ON public.familias_precio;
CREATE POLICY familias_crear ON public.familias_precio FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('biblioteca.editar')));
DROP POLICY IF EXISTS familias_editar ON public.familias_precio;
CREATE POLICY familias_editar ON public.familias_precio FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('biblioteca.editar')));

DROP POLICY IF EXISTS ajustes_ver ON public.ajustes_cotizacion;
CREATE POLICY ajustes_ver ON public.ajustes_cotizacion FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['cotizaciones.ver','cotizaciones.crear'])));
DROP POLICY IF EXISTS ajustes_editar ON public.ajustes_cotizacion;
CREATE POLICY ajustes_editar ON public.ajustes_cotizacion FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('cotizaciones.aprobar')));

DROP POLICY IF EXISTS cot_eventos_ver ON public.cotizacion_eventos;
CREATE POLICY cot_eventos_ver ON public.cotizacion_eventos FOR SELECT TO authenticated
  USING ((SELECT public.tiene_permiso('cotizaciones.ver')));
DROP POLICY IF EXISTS cot_envios_ver ON public.cotizacion_envios;
CREATE POLICY cot_envios_ver ON public.cotizacion_envios FOR SELECT TO authenticated
  USING ((SELECT public.tiene_permiso('cotizaciones.ver')));

-- Plantillas: verlas con «Ver» o «Crear»; armarlas con «Aprobar». No se borran: se desactivan.
DROP POLICY IF EXISTS "plantillas_all" ON public.plantillas_cotizacion;
DROP POLICY IF EXISTS plantillas_ver ON public.plantillas_cotizacion;
DROP POLICY IF EXISTS plantillas_crear ON public.plantillas_cotizacion;
DROP POLICY IF EXISTS plantillas_editar ON public.plantillas_cotizacion;
DROP POLICY IF EXISTS plantillas_eliminar ON public.plantillas_cotizacion;
CREATE POLICY plantillas_ver ON public.plantillas_cotizacion FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['cotizaciones.ver','cotizaciones.crear','cotizaciones.aprobar'])));
CREATE POLICY plantillas_crear ON public.plantillas_cotizacion FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('cotizaciones.aprobar')));
CREATE POLICY plantillas_editar ON public.plantillas_cotizacion FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('cotizaciones.aprobar')));
