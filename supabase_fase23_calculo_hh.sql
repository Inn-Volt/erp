-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 23: Calculadora HH en UF (módulo independiente)
-- El valor de la hora-hombre por cargo con la base en UF (o en USD para los cargos de software),
-- para que las tarifas no se desvaloricen. Reemplaza el Excel «InnVolt – Tarifas HH».
--   · Cada persona del equipo tiene sus cargos HH (con tarifa propia opcional). Al calcular se elige
--     quién hace el trabajo y con cuál de sus cargos (o se parte de un trabajo tipo), se ingresan
--     las horas reales y el tipo de tarea sugiere un multiplicador (editable).
--   · Los cálculos guardados llevan una foto (snapshot) de la UF, del dólar, de los parámetros y de
--     cada tarifa: no cambian aunque después cambien.
--   · NO toca el cotizador ni ninguna tabla existente: todo va en tablas hh_, sin claves foráneas
--     hacia cotizaciones, clientes ni proyectos (el cliente es texto libre).
--   · Equipo por jerarquía: cada persona puede estar a cargo de otra (jefe_id). Quien usa la
--     calculadora trabaja con SUS HH y las de las personas a su cargo (y las de ellas, hacia abajo):
--     no ve ni usa las de quien está sobre él. Ej.: César → Joaquín → sus ayudantes.
-- Permisos (lib/permisos.ts):
--   hh.ver        → usar la calculadora con sus HH y las de su equipo hacia abajo; ver y guardar
--                   sus cálculos (y ver los de su equipo); elegir SUS cargos HH (entre los activos)
--                   sin cambiar su tarifa; agregar personas a su cargo y manejar sus cargos y tarifas.
--   hh.configurar → todo: cargos, tarifas, parámetros, trabajos tipo, multiplicadores y el equipo
--                   completo (incluidos sus cálculos).
--   Solo los tiene el Administrador ('*'): se dan a otros roles en Roles. No se agregan a las
--   plantillas de los roles base, porque lo que está en una plantilla ya no se puede quitar.
-- Ejecutar DESPUÉS de la fase 1 (usa tiene_permiso, tiene_alguno y auditar). Es idempotente: las
-- semillas no pisan lo que se haya cambiado desde la pantalla. Si ya se ejecutó una versión
-- anterior de este archivo, se vuelve a ejecutar entero (agrega el equipo por jerarquía).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Parámetros (una sola fila) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hh_parametros (
  id                    SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  horas_facturables_mes NUMERIC(6,1)  NOT NULL DEFAULT 140      CHECK (horas_facturables_mes > 0),
  factor_costo_empresa  NUMERIC(6,3)  NOT NULL DEFAULT 1.35     CHECK (factor_costo_empresa >= 1),     -- leyes sociales, seguros, EPP
  gastos_generales      NUMERIC(6,3)  NOT NULL DEFAULT 0.25     CHECK (gastos_generales >= 0),         -- vehículo, bencina, herramientas, software
  utilidad_minima       NUMERIC(6,3)  NOT NULL DEFAULT 0.30     CHECK (utilidad_minima >= 0),
  recargo_urgencia      NUMERIC(6,3)  NOT NULL DEFAULT 0.50     CHECK (recargo_urgencia >= 0),         -- urgencia o fin de semana
  iva                   NUMERIC(5,3)  NOT NULL DEFAULT 0.19     CHECK (iva >= 0 AND iva < 1),
  uf_respaldo           NUMERIC(12,2) NOT NULL DEFAULT 41350.42 CHECK (uf_respaldo BETWEEN 20000 AND 80000),
  usd_respaldo          NUMERIC(10,2) NOT NULL DEFAULT 1000     CHECK (usd_respaldo BETWEEN 500 AND 2000),
  redondeo_tarifa       INT           NOT NULL DEFAULT 100      CHECK (redondeo_tarifa >= 1),
  redondeo_total        INT           NOT NULL DEFAULT 1000     CHECK (redondeo_total >= 1),
  validez_dias          INT           NOT NULL DEFAULT 15       CHECK (validez_dias BETWEEN 1 AND 365),  -- de la cotización para el cliente
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.hh_parametros ADD COLUMN IF NOT EXISTS gestion_proyecto NUMERIC(5,3) NOT NULL DEFAULT 0.10
  CHECK (gestion_proyecto >= 0 AND gestion_proyecto <= 0.5);   -- gestión de proyecto y coordinación (0,10 = 10 %)
INSERT INTO public.hh_parametros (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.hh_parametros_cambio()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := NOW();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.hh_parametros_cambio() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hh_parametros_cambio ON public.hh_parametros;
CREATE TRIGGER trg_hh_parametros_cambio BEFORE UPDATE ON public.hh_parametros FOR EACH ROW EXECUTE FUNCTION public.hh_parametros_cambio();

-- ─── 2. Cargos HH ────────────────────────────────────────────────────────────
-- Un cargo usado (en un trabajo tipo o en un cálculo guardado) no se puede borrar: se desactiva.
CREATE TABLE IF NOT EXISTS public.hh_cargos (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre             TEXT NOT NULL UNIQUE CHECK (trim(nombre) <> ''),
  moneda_base        TEXT NOT NULL DEFAULT 'UF' CHECK (moneda_base IN ('UF','USD')),
  tarifa_base        NUMERIC(12,4) NOT NULL CHECK (tarifa_base > 0),          -- por hora, en la moneda base
  mercado_min        NUMERIC(12,4) CHECK (mercado_min >= 0),                  -- rango de mercado, en la moneda base
  mercado_max        NUMERIC(12,4) CHECK (mercado_max >= 0),
  sueldo_mercado_clp NUMERIC(12,0) CHECK (sueldo_mercado_clp >= 0),           -- para el piso según costos
  notas              TEXT,
  activo             BOOLEAN NOT NULL DEFAULT TRUE,
  orden              INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hh_cargos_rango CHECK (mercado_min IS NULL OR mercado_max IS NULL OR mercado_min <= mercado_max)
);

-- ─── 3. Tipos de tarea (multiplicador sugerido) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.hh_tipos_tarea (
  clave         TEXT PRIMARY KEY CHECK (clave ~ '^[a-z0-9_]+$'),
  nombre        TEXT NOT NULL CHECK (trim(nombre) <> ''),
  multiplicador NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (multiplicador > 0 AND multiplicador <= 20),
  descripcion   TEXT,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  orden         INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. Trabajos tipo ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hh_trabajos_tipo (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria          TEXT NOT NULL CHECK (trim(categoria) <> ''),
  nombre             TEXT NOT NULL CHECK (trim(nombre) <> ''),
  unidad             TEXT,
  hh_referencia      NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (hh_referencia >= 0),   -- HH de mercado por unidad (en software: sin IA)
  cargo_principal_id UUID NOT NULL REFERENCES public.hh_cargos(id) ON DELETE RESTRICT,
  cargo_apoyo_id     UUID REFERENCES public.hh_cargos(id) ON DELETE RESTRICT,
  hh_apoyo           NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (hh_apoyo >= 0),
  tipo_tarea_clave   TEXT REFERENCES public.hh_tipos_tarea(clave) ON UPDATE CASCADE ON DELETE SET NULL,
  precio_mercado_ref TEXT,
  duracion_equipo    TEXT,
  notas              TEXT,
  activo             BOOLEAN NOT NULL DEFAULT TRUE,
  orden              INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (categoria, nombre)
);
CREATE INDEX IF NOT EXISTS idx_hh_trabajos_principal ON public.hh_trabajos_tipo(cargo_principal_id);
CREATE INDEX IF NOT EXISTS idx_hh_trabajos_apoyo ON public.hh_trabajos_tipo(cargo_apoyo_id) WHERE cargo_apoyo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hh_trabajos_tipo_tarea ON public.hh_trabajos_tipo(tipo_tarea_clave) WHERE tipo_tarea_clave IS NOT NULL;

-- ─── 5. Personas (equipo por jerarquía) y sus cargos HH ──────────────────────
-- Una persona puede estar vinculada a su usuario (para usar la calculadora con sus HH) o ser un
-- colaborador externo sin usuario. Cada una puede estar a cargo de otra (jefe_id): quien usa la
-- calculadora trabaja con sus HH y las de su equipo hacia abajo. La referencia a profiles es solo de
-- lectura: esa tabla no cambia.
CREATE TABLE IF NOT EXISTS public.hh_personas (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre     TEXT NOT NULL UNIQUE CHECK (trim(nombre) <> ''),
  profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.hh_personas ADD COLUMN IF NOT EXISTS jefe_id UUID REFERENCES public.hh_personas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_hh_personas_jefe ON public.hh_personas(jefe_id) WHERE jefe_id IS NOT NULL;
ALTER TABLE public.hh_personas DROP CONSTRAINT IF EXISTS hh_personas_no_es_su_jefe;
ALTER TABLE public.hh_personas ADD CONSTRAINT hh_personas_no_es_su_jefe CHECK (jefe_id IS NULL OR jefe_id <> id);

CREATE TABLE IF NOT EXISTS public.hh_persona_cargos (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  persona_id         UUID NOT NULL REFERENCES public.hh_personas(id) ON DELETE CASCADE,
  cargo_id           UUID NOT NULL REFERENCES public.hh_cargos(id) ON DELETE CASCADE,
  tarifa_base_propia NUMERIC(12,4) CHECK (tarifa_base_propia > 0),   -- en la moneda del cargo; vacía = la del cargo
  predeterminado     BOOLEAN NOT NULL DEFAULT FALSE,                 -- el que se preselecciona en la calculadora
  activo             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (persona_id, cargo_id)
);
CREATE INDEX IF NOT EXISTS idx_hh_persona_cargos_cargo ON public.hh_persona_cargos(cargo_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hh_persona_predeterminado ON public.hh_persona_cargos(persona_id) WHERE predeterminado;

-- La persona del usuario conectado (null = no está vinculado).
CREATE OR REPLACE FUNCTION public.hh_mi_persona()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.hh_personas WHERE profile_id = auth.uid() AND activo;
$$;
-- Su persona y todo su equipo hacia abajo (las de su cargo, las del cargo de ellas, …).
CREATE OR REPLACE FUNCTION public.hh_personas_a_cargo()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE arbol(id) AS (
    SELECT id FROM public.hh_personas WHERE profile_id = auth.uid() AND activo
    UNION
    SELECT p.id FROM public.hh_personas p JOIN arbol a ON p.jefe_id = a.id
  )
  SELECT id FROM arbol;
$$;
-- ¿Puede trabajar con esa persona? (quien configura: con todas).
CREATE OR REPLACE FUNCTION public.hh_puede_usar_persona(p_persona UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.tiene_permiso('hh.configurar')
      OR (public.tiene_permiso('hh.ver') AND p_persona IN (SELECT public.hh_personas_a_cargo()));
$$;
REVOKE EXECUTE ON FUNCTION public.hh_mi_persona(), public.hh_personas_a_cargo(), public.hh_puede_usar_persona(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hh_mi_persona(), public.hh_personas_a_cargo(), public.hh_puede_usar_persona(UUID) TO authenticated;

-- Sin círculos en el equipo (A a cargo de B y B a cargo de A). Quien no configura no vincula
-- usuarios: eso lo hace quien configura.
CREATE OR REPLACE FUNCTION public.hh_personas_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.jefe_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.jefe_id IS DISTINCT FROM OLD.jefe_id) AND EXISTS (
       WITH RECURSIVE sube(id) AS (
         SELECT NEW.jefe_id
         UNION
         SELECT p.jefe_id FROM public.hh_personas p JOIN sube s ON p.id = s.id WHERE p.jefe_id IS NOT NULL
       ) SELECT 1 FROM sube WHERE id = NEW.id) THEN
    RAISE EXCEPTION 'Así quedaría un círculo en el equipo: % no puede quedar a cargo de alguien de su propio equipo.', NEW.nombre USING ERRCODE = '23514';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.tiene_permiso('hh.configurar')
     AND (TG_OP = 'INSERT' AND NEW.profile_id IS NOT NULL OR TG_OP = 'UPDATE' AND NEW.profile_id IS DISTINCT FROM OLD.profile_id) THEN
    RAISE EXCEPTION 'Vincular una persona con su usuario lo hace quien configura la calculadora.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.hh_personas_reglas() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hh_personas_reglas ON public.hh_personas;
CREATE TRIGGER trg_hh_personas_reglas BEFORE INSERT OR UPDATE ON public.hh_personas
  FOR EACH ROW EXECUTE FUNCTION public.hh_personas_reglas();

-- Los cargos de cada persona. Quien no configura la calculadora:
--   · los suyos: los elige (o quita) entre los activos, sin poner ni cambiar su tarifa;
--   · los de su equipo hacia abajo: los maneja entero (también la tarifa propia).
-- Nadie mueve una asignación a otra persona u otro cargo (se crea otra). Un cargo inactivo deja de
-- ser el predeterminado, y marcar uno desmarca el anterior.
CREATE OR REPLACE FUNCTION public.hh_persona_cargos_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_configura BOOLEAN := auth.uid() IS NULL OR public.tiene_permiso('hh.configurar');
  v_suyo BOOLEAN := NOT v_configura AND NEW.persona_id = public.hh_mi_persona();
BEGIN
  IF NOT NEW.activo THEN NEW.predeterminado := FALSE; END IF;
  IF NOT v_configura THEN
    IF TG_OP = 'UPDATE' AND (NEW.persona_id <> OLD.persona_id OR NEW.cargo_id <> OLD.cargo_id) THEN
      RAISE EXCEPTION 'Una asignación no se mueve a otra persona ni a otro cargo: crea otra.' USING ERRCODE = '42501';
    END IF;
    IF v_suyo AND (TG_OP = 'INSERT' AND NEW.tarifa_base_propia IS NOT NULL
                   OR TG_OP = 'UPDATE' AND NEW.tarifa_base_propia IS DISTINCT FROM OLD.tarifa_base_propia) THEN
      RAISE EXCEPTION 'Tus tarifas propias las cambia quien está sobre ti en el equipo HH o quien configura la calculadora.' USING ERRCODE = '42501';
    END IF;
    IF NEW.activo AND (TG_OP = 'INSERT' OR NOT OLD.activo)
       AND NOT EXISTS (SELECT 1 FROM public.hh_cargos WHERE id = NEW.cargo_id AND activo) THEN
      RAISE EXCEPTION 'Ese cargo HH no está activo.' USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.updated_at := NOW();
  IF NEW.predeterminado AND (TG_OP = 'INSERT' OR NOT OLD.predeterminado) THEN
    UPDATE public.hh_persona_cargos SET predeterminado = FALSE
     WHERE persona_id = NEW.persona_id AND predeterminado AND id <> NEW.id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.hh_persona_cargos_reglas() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hh_persona_cargos_reglas ON public.hh_persona_cargos;
CREATE TRIGGER trg_hh_persona_cargos_reglas BEFORE INSERT OR UPDATE ON public.hh_persona_cargos
  FOR EACH ROW EXECUTE FUNCTION public.hh_persona_cargos_reglas();

-- ─── 6. UF y dólar del día (caché) ───────────────────────────────────────────
-- Un valor por día. Los de internet (mindicador.cl o boostr.cl) los guarda el servidor
-- (/api/hh/indicadores, con la service role: nadie los puede inventar desde el navegador);
-- a mano, quien configura.
CREATE TABLE IF NOT EXISTS public.hh_indicadores (
  fecha      DATE PRIMARY KEY,
  uf         NUMERIC(12,2) NOT NULL CHECK (uf BETWEEN 20000 AND 80000),
  usd        NUMERIC(10,2) NOT NULL CHECK (usd BETWEEN 500 AND 2000),
  fuente     TEXT NOT NULL DEFAULT 'mindicador',
  created_by UUID DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- boostr.cl entró después como segunda fuente (mindicador.cl se cae): el CHECK se rehace.
ALTER TABLE public.hh_indicadores DROP CONSTRAINT IF EXISTS hh_indicadores_fuente_check;
ALTER TABLE public.hh_indicadores ADD CONSTRAINT hh_indicadores_fuente_check
  CHECK (fuente IN ('mindicador','boostr','respaldo','manual'));

-- ─── 7. Cálculos guardados ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hh_calculos (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre            TEXT NOT NULL CHECK (trim(nombre) <> ''),
  cliente_texto     TEXT,                                   -- texto libre: sin relación con clientes
  notas             TEXT,                                   -- internas (no van en el PDF)
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Foto de lo usado: la UF y el dólar (con su día y de dónde salieron) y los parámetros.
  uf_usada          NUMERIC(12,2) NOT NULL CHECK (uf_usada > 0),
  usd_usada         NUMERIC(10,2) NOT NULL CHECK (usd_usada > 0),
  uf_fecha          DATE,
  uf_fuente         TEXT,
  usd_fecha         DATE,
  usd_fuente        TEXT,
  parametros        JSONB NOT NULL DEFAULT '{}'::JSONB,
  urgencia          BOOLEAN NOT NULL DEFAULT FALSE,
  traslado_uf       NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (traslado_uf >= 0),
  materiales_clp    NUMERIC(14,0) NOT NULL DEFAULT 0 CHECK (materiales_clp >= 0),
  margen_materiales NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (margen_materiales >= 0),
  validez_dias      INT NOT NULL DEFAULT 15 CHECK (validez_dias BETWEEN 1 AND 365),
  neto_clp          NUMERIC(14,0) NOT NULL DEFAULT 0,
  neto_uf           NUMERIC(12,2) NOT NULL DEFAULT 0,
  iva_clp           NUMERIC(14,0) NOT NULL DEFAULT 0,
  total_clp         NUMERIC(14,0) NOT NULL DEFAULT 0,
  created_by        UUID DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Materiales: margen_materiales es la utilidad sobre el precio (como el cotizador); si se fija el
-- precio de venta, va en materiales_venta_clp y la utilidad real sale de él. La operación (traslado,
-- peajes, estacionamiento…) va como lista de gastos que se cobran tal cual; traslado_uf queda solo
-- para los cálculos de antes. gestion_pct: gestión de proyecto (0 = no se suma).
ALTER TABLE public.hh_calculos ADD COLUMN IF NOT EXISTS materiales_venta_clp NUMERIC(14,0) CHECK (materiales_venta_clp >= 0);
ALTER TABLE public.hh_calculos ADD COLUMN IF NOT EXISTS operacion JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.hh_calculos ADD COLUMN IF NOT EXISTS gestion_pct NUMERIC(5,3) NOT NULL DEFAULT 0 CHECK (gestion_pct >= 0 AND gestion_pct <= 0.5);
CREATE INDEX IF NOT EXISTS idx_hh_calculos_fecha ON public.hh_calculos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hh_calculos_autor ON public.hh_calculos(created_by);

CREATE TABLE IF NOT EXISTS public.hh_calculo_lineas (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  calculo_id              UUID NOT NULL REFERENCES public.hh_calculos(id) ON DELETE CASCADE,
  orden                   INT NOT NULL DEFAULT 0,
  descripcion             TEXT NOT NULL CHECK (trim(descripcion) <> ''),   -- el entregable
  unidad                  TEXT,
  persona_id              UUID REFERENCES public.hh_personas(id) ON DELETE SET NULL,
  persona_nombre          TEXT,                                            -- vacío = tarifa general del cargo
  cargo_id                UUID NOT NULL REFERENCES public.hh_cargos(id) ON DELETE RESTRICT,
  cargo_nombre            TEXT NOT NULL,
  cargo_moneda            TEXT NOT NULL CHECK (cargo_moneda IN ('UF','USD')),
  cargo_tarifa_base       NUMERIC(12,4) NOT NULL,                          -- la efectiva (propia o del cargo)
  cargo_tarifa_clp        NUMERIC(12,0) NOT NULL,
  trabajo_tipo_id         UUID REFERENCES public.hh_trabajos_tipo(id) ON DELETE SET NULL,
  hh_referencia           NUMERIC(8,2),
  tipo_tarea_clave        TEXT,
  multiplicador           NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (multiplicador > 0),
  multiplicador_editado   BOOLEAN NOT NULL DEFAULT FALSE,
  cantidad                NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  horas_reales            NUMERIC(14,6) NOT NULL CHECK (horas_reales > 0),     -- por unidad (con IA puede ser 25 ÷ 3)
  horas_cobradas          NUMERIC(12,2) NOT NULL,
  cargo_apoyo_id          UUID REFERENCES public.hh_cargos(id) ON DELETE RESTRICT,
  cargo_apoyo_nombre      TEXT,
  cargo_apoyo_moneda      TEXT CHECK (cargo_apoyo_moneda IN ('UF','USD')),
  cargo_apoyo_tarifa_base NUMERIC(12,4),
  cargo_apoyo_tarifa_clp  NUMERIC(12,0),
  horas_apoyo             NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (horas_apoyo >= 0),   -- por unidad, sin multiplicador
  subtotal_clp            NUMERIC(14,0) NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Las horas llevan 6 decimales: 25 HH de mercado con multiplicador 3 son 8,333333 h y se cobran 25 exactas.
ALTER TABLE public.hh_calculo_lineas ALTER COLUMN horas_reales TYPE NUMERIC(14,6);
CREATE INDEX IF NOT EXISTS idx_hh_lineas_calculo ON public.hh_calculo_lineas(calculo_id, orden);
CREATE INDEX IF NOT EXISTS idx_hh_lineas_cargo ON public.hh_calculo_lineas(cargo_id);
CREATE INDEX IF NOT EXISTS idx_hh_lineas_apoyo ON public.hh_calculo_lineas(cargo_apoyo_id) WHERE cargo_apoyo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hh_lineas_persona ON public.hh_calculo_lineas(persona_id) WHERE persona_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hh_lineas_trabajo ON public.hh_calculo_lineas(trabajo_tipo_id) WHERE trabajo_tipo_id IS NOT NULL;

-- Guardar un cálculo con sus líneas en una sola transacción (sin quedar a medias). Corre con los
-- permisos de quien llama: la RLS decide si puede crear o cambiar ese cálculo.
CREATE OR REPLACE FUNCTION public.hh_guardar_calculo(p_calculo JSONB, p_lineas JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := NULLIF(p_calculo->>'id', '')::UUID;
  c public.hh_calculos := jsonb_populate_record(NULL::public.hh_calculos, p_calculo);
BEGIN
  IF v_id IS NULL THEN
    INSERT INTO public.hh_calculos (nombre, cliente_texto, notas, fecha, uf_usada, usd_usada, uf_fecha, uf_fuente,
      usd_fecha, usd_fuente, parametros, urgencia, traslado_uf, materiales_clp, margen_materiales, validez_dias,
      neto_clp, neto_uf, iva_clp, total_clp, materiales_venta_clp, operacion, gestion_pct, created_by)
    VALUES (c.nombre, c.cliente_texto, c.notas, COALESCE(c.fecha, CURRENT_DATE), c.uf_usada, c.usd_usada, c.uf_fecha, c.uf_fuente,
      c.usd_fecha, c.usd_fuente, COALESCE(c.parametros, '{}'::JSONB), COALESCE(c.urgencia, FALSE), COALESCE(c.traslado_uf, 0),
      COALESCE(c.materiales_clp, 0), COALESCE(c.margen_materiales, 0), COALESCE(c.validez_dias, 15),
      COALESCE(c.neto_clp, 0), COALESCE(c.neto_uf, 0), COALESCE(c.iva_clp, 0), COALESCE(c.total_clp, 0),
      c.materiales_venta_clp, COALESCE(c.operacion, '[]'::JSONB), COALESCE(c.gestion_pct, 0), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.hh_calculos SET nombre = c.nombre, cliente_texto = c.cliente_texto, notas = c.notas,
      fecha = COALESCE(c.fecha, fecha), uf_usada = c.uf_usada, usd_usada = c.usd_usada, uf_fecha = c.uf_fecha,
      uf_fuente = c.uf_fuente, usd_fecha = c.usd_fecha, usd_fuente = c.usd_fuente,
      parametros = COALESCE(c.parametros, '{}'::JSONB), urgencia = COALESCE(c.urgencia, FALSE),
      traslado_uf = COALESCE(c.traslado_uf, 0), materiales_clp = COALESCE(c.materiales_clp, 0),
      margen_materiales = COALESCE(c.margen_materiales, 0), validez_dias = COALESCE(c.validez_dias, 15),
      neto_clp = COALESCE(c.neto_clp, 0), neto_uf = COALESCE(c.neto_uf, 0), iva_clp = COALESCE(c.iva_clp, 0),
      total_clp = COALESCE(c.total_clp, 0), materiales_venta_clp = c.materiales_venta_clp,
      operacion = COALESCE(c.operacion, '[]'::JSONB), gestion_pct = COALESCE(c.gestion_pct, 0), updated_at = NOW()
    WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No puedes cambiar ese cálculo: es de otra persona (puedes duplicarlo).' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.hh_calculo_lineas WHERE calculo_id = v_id;
  END IF;
  INSERT INTO public.hh_calculo_lineas (calculo_id, orden, descripcion, unidad, persona_id, persona_nombre, cargo_id,
    cargo_nombre, cargo_moneda, cargo_tarifa_base, cargo_tarifa_clp, trabajo_tipo_id, hh_referencia, tipo_tarea_clave,
    multiplicador, multiplicador_editado, cantidad, horas_reales, horas_cobradas, cargo_apoyo_id, cargo_apoyo_nombre,
    cargo_apoyo_moneda, cargo_apoyo_tarifa_base, cargo_apoyo_tarifa_clp, horas_apoyo, subtotal_clp)
  SELECT v_id, (x.n - 1)::INT, l.descripcion, l.unidad, l.persona_id, l.persona_nombre, l.cargo_id,
    l.cargo_nombre, l.cargo_moneda, l.cargo_tarifa_base, l.cargo_tarifa_clp, l.trabajo_tipo_id, l.hh_referencia, l.tipo_tarea_clave,
    COALESCE(l.multiplicador, 1), COALESCE(l.multiplicador_editado, FALSE), COALESCE(l.cantidad, 1), l.horas_reales, l.horas_cobradas,
    l.cargo_apoyo_id, l.cargo_apoyo_nombre, l.cargo_apoyo_moneda, l.cargo_apoyo_tarifa_base, l.cargo_apoyo_tarifa_clp,
    COALESCE(l.horas_apoyo, 0), COALESCE(l.subtotal_clp, 0)
  FROM jsonb_array_elements(COALESCE(p_lineas, '[]'::JSONB)) WITH ORDINALITY AS x(j, n)
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.hh_calculo_lineas, x.j) AS l;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.hh_guardar_calculo(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hh_guardar_calculo(JSONB, JSONB) TO authenticated;

-- Cada uno calcula con sus HH y las de su equipo hacia abajo (quien configura, con todas).
CREATE OR REPLACE FUNCTION public.hh_lineas_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.persona_id IS NOT NULL AND auth.uid() IS NOT NULL AND NOT public.hh_puede_usar_persona(NEW.persona_id) THEN
    RAISE EXCEPTION 'Solo puedes calcular con tus HH y las de tu equipo: % no está en tu equipo.', COALESCE(NEW.persona_nombre, 'esa persona')
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.hh_lineas_reglas() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hh_lineas_reglas ON public.hh_calculo_lineas;
CREATE TRIGGER trg_hh_lineas_reglas BEFORE INSERT OR UPDATE OF persona_id ON public.hh_calculo_lineas
  FOR EACH ROW EXECUTE FUNCTION public.hh_lineas_reglas();

-- Los usuarios a los que se puede vincular una persona (solo para quien configura).
CREATE OR REPLACE FUNCTION public.hh_usuarios_para_vincular()
RETURNS TABLE (id UUID, nombre TEXT, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, COALESCE(NULLIF(trim(p.nombre), ''), p.email), p.email
  FROM public.profiles p
  WHERE public.tiene_permiso('hh.configurar') AND COALESCE(p.activo, TRUE)
  ORDER BY 2;
$$;
REVOKE EXECUTE ON FUNCTION public.hh_usuarios_para_vincular() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hh_usuarios_para_vincular() TO authenticated;

-- ─── 8. Fechas de cambio y auditoría ─────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['hh_cargos','hh_tipos_tarea','hh_trabajos_tipo','hh_personas'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
  -- Quién cambió tarifas, parámetros y multiplicadores (Mi empresa → Auditoría).
  FOREACH t IN ARRAY ARRAY['hh_parametros','hh_cargos','hh_tipos_tarea','hh_trabajos_tipo','hh_personas','hh_persona_cargos'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.auditar()', t);
  END LOOP;
END $$;

-- ─── 9. Seguridad (RLS) ──────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['hh_parametros','hh_cargos','hh_tipos_tarea','hh_trabajos_tipo','hh_personas',
                           'hh_persona_cargos','hh_indicadores','hh_calculos','hh_calculo_lineas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS hh_ver ON public.%I', t);
  END LOOP;
  -- El catálogo (parámetros, cargos, tipos de tarea, trabajos tipo y la UF): lo ve quien usa o
  -- configura la calculadora.
  FOREACH t IN ARRAY ARRAY['hh_parametros','hh_cargos','hh_tipos_tarea','hh_trabajos_tipo','hh_indicadores'] LOOP
    EXECUTE format('CREATE POLICY hh_ver ON public.%I FOR SELECT TO authenticated
                    USING ((SELECT public.tiene_alguno(ARRAY[''hh.ver'',''hh.configurar''])))', t);
  END LOOP;
  -- Quien configura: todo el catálogo y el equipo completo.
  FOREACH t IN ARRAY ARRAY['hh_parametros','hh_cargos','hh_tipos_tarea','hh_trabajos_tipo','hh_personas','hh_persona_cargos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS hh_configurar ON public.%I', t);
    EXECUTE format('CREATE POLICY hh_configurar ON public.%I FOR ALL TO authenticated
                    USING ((SELECT public.tiene_permiso(''hh.configurar'')))
                    WITH CHECK ((SELECT public.tiene_permiso(''hh.configurar'')))', t);
  END LOOP;
END $$;

-- Equipo: cada uno ve su persona y su equipo hacia abajo (no a quien está sobre él). Agrega
-- personas a su cargo (sin usuario: eso lo vincula quien configura) y cambia las de su equipo, no
-- la suya (no se puede sacar de su jefe). No se borran: se desactivan.
DROP POLICY IF EXISTS hh_equipo_ver ON public.hh_personas;
CREATE POLICY hh_equipo_ver ON public.hh_personas FOR SELECT TO authenticated
  USING ((SELECT public.tiene_permiso('hh.ver')) AND id IN (SELECT public.hh_personas_a_cargo()));
DROP POLICY IF EXISTS hh_equipo_crear ON public.hh_personas;
CREATE POLICY hh_equipo_crear ON public.hh_personas FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('hh.ver')) AND profile_id IS NULL AND jefe_id IN (SELECT public.hh_personas_a_cargo()));
DROP POLICY IF EXISTS hh_equipo_cambiar ON public.hh_personas;
CREATE POLICY hh_equipo_cambiar ON public.hh_personas FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('hh.ver')) AND id IN (SELECT public.hh_personas_a_cargo()) AND id IS DISTINCT FROM (SELECT public.hh_mi_persona()))
  WITH CHECK ((SELECT public.tiene_permiso('hh.ver')) AND id IS DISTINCT FROM (SELECT public.hh_mi_persona()) AND jefe_id IN (SELECT public.hh_personas_a_cargo()));

-- Cargos de cada persona: los suyos y los de su equipo hacia abajo (el trigger no le deja cambiar
-- su propia tarifa). Borra los de su equipo; los suyos los quita desactivándolos, así no pierde la
-- tarifa propia que le hayan puesto.
DROP POLICY IF EXISTS hh_mis_cargos_crear ON public.hh_persona_cargos;
DROP POLICY IF EXISTS hh_mis_cargos_cambiar ON public.hh_persona_cargos;
DROP POLICY IF EXISTS hh_equipo_cargos_ver ON public.hh_persona_cargos;
CREATE POLICY hh_equipo_cargos_ver ON public.hh_persona_cargos FOR SELECT TO authenticated
  USING ((SELECT public.tiene_permiso('hh.ver')) AND persona_id IN (SELECT public.hh_personas_a_cargo()));
DROP POLICY IF EXISTS hh_equipo_cargos_crear ON public.hh_persona_cargos;
CREATE POLICY hh_equipo_cargos_crear ON public.hh_persona_cargos FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('hh.ver')) AND persona_id IN (SELECT public.hh_personas_a_cargo()));
DROP POLICY IF EXISTS hh_equipo_cargos_cambiar ON public.hh_persona_cargos;
CREATE POLICY hh_equipo_cargos_cambiar ON public.hh_persona_cargos FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('hh.ver')) AND persona_id IN (SELECT public.hh_personas_a_cargo()))
  WITH CHECK ((SELECT public.tiene_permiso('hh.ver')) AND persona_id IN (SELECT public.hh_personas_a_cargo()));
DROP POLICY IF EXISTS hh_equipo_cargos_borrar ON public.hh_persona_cargos;
CREATE POLICY hh_equipo_cargos_borrar ON public.hh_persona_cargos FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('hh.ver')) AND persona_id IN (SELECT public.hh_personas_a_cargo())
         AND persona_id IS DISTINCT FROM (SELECT public.hh_mi_persona()));

-- UF y dólar: a mano solo quien configura (los de internet los guarda el servidor).
DROP POLICY IF EXISTS hh_indicador_manual ON public.hh_indicadores;
CREATE POLICY hh_indicador_manual ON public.hh_indicadores FOR ALL TO authenticated
  USING ((SELECT public.tiene_permiso('hh.configurar')))
  WITH CHECK ((SELECT public.tiene_permiso('hh.configurar')) AND fuente = 'manual');

-- Cálculos: cada uno ve los suyos y los de su equipo hacia abajo (quien configura, todos); los
-- crea quien usa la calculadora; los cambia o borra quien lo hizo (o quien configura).
DROP POLICY IF EXISTS hh_calculo_ver ON public.hh_calculos;
CREATE POLICY hh_calculo_ver ON public.hh_calculos FOR SELECT TO authenticated
  USING ((SELECT public.tiene_permiso('hh.configurar'))
      OR ((SELECT public.tiene_permiso('hh.ver')) AND (created_by = (SELECT auth.uid())
          OR created_by IN (SELECT p.profile_id FROM public.hh_personas p
                            WHERE p.profile_id IS NOT NULL AND p.id IN (SELECT public.hh_personas_a_cargo())))));
DROP POLICY IF EXISTS hh_calculo_crear ON public.hh_calculos;
CREATE POLICY hh_calculo_crear ON public.hh_calculos FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_alguno(ARRAY['hh.ver','hh.configurar'])) AND created_by = (SELECT auth.uid()));
DROP POLICY IF EXISTS hh_calculo_cambiar ON public.hh_calculos;
CREATE POLICY hh_calculo_cambiar ON public.hh_calculos FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['hh.ver','hh.configurar']))
    AND (created_by = (SELECT auth.uid()) OR (SELECT public.tiene_permiso('hh.configurar'))))
  WITH CHECK ((SELECT public.tiene_alguno(ARRAY['hh.ver','hh.configurar']))
    AND (created_by = (SELECT auth.uid()) OR (SELECT public.tiene_permiso('hh.configurar'))));
DROP POLICY IF EXISTS hh_calculo_borrar ON public.hh_calculos;
CREATE POLICY hh_calculo_borrar ON public.hh_calculos FOR DELETE TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['hh.ver','hh.configurar']))
    AND (created_by = (SELECT auth.uid()) OR (SELECT public.tiene_permiso('hh.configurar'))));
-- Las líneas se ven con su cálculo; se escriben si se puede cambiar el cálculo.
DROP POLICY IF EXISTS hh_lineas_ver ON public.hh_calculo_lineas;
CREATE POLICY hh_lineas_ver ON public.hh_calculo_lineas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hh_calculos c WHERE c.id = calculo_id));
DROP POLICY IF EXISTS hh_lineas_escribir ON public.hh_calculo_lineas;
CREATE POLICY hh_lineas_escribir ON public.hh_calculo_lineas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hh_calculos c WHERE c.id = calculo_id
    AND (SELECT public.tiene_alguno(ARRAY['hh.ver','hh.configurar']))
    AND (c.created_by = (SELECT auth.uid()) OR (SELECT public.tiene_permiso('hh.configurar')))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.hh_calculos c WHERE c.id = calculo_id
    AND (SELECT public.tiene_alguno(ARRAY['hh.ver','hh.configurar']))
    AND (c.created_by = (SELECT auth.uid()) OR (SELECT public.tiene_permiso('hh.configurar')))));

-- ─── 10. Semillas (del Excel «InnVolt – Tarifas HH») ─────────────────────────
-- ON CONFLICT DO NOTHING: volver a correr el archivo no pisa lo cambiado desde la pantalla.
-- Si se corrió la versión que lo renombró a «(domótica)», el cargo vuelve a su nombre: InnVolt
-- también hace pantallas.
UPDATE public.hh_cargos SET nombre = 'Técnico integración (domótica / pantallas)'
 WHERE nombre = 'Técnico integración (domótica)' AND NOT EXISTS (SELECT 1 FROM public.hh_cargos WHERE nombre = 'Técnico integración (domótica / pantallas)');
INSERT INTO public.hh_cargos (orden, nombre, moneda_base, tarifa_base, mercado_min, mercado_max, sueldo_mercado_clp, notas) VALUES
  (1,  'Ayudante eléctrico', 'UF', 0.3, 0.1, 0.3, 650000, 'Va siempre junto a un maestro; no se cobra solo.'),
  (2,  'Maestro electricista', 'UF', 0.5, 0.3, 1.0, 800000, 'Para trabajos de varios días. En visitas cortas cobra como mínimo una «primera hora» de ~1 UF (precio medio en Chile ~$40.000/h según Cronoshare).'),
  (3,  'Instalador eléctrico SEC (declara TE1/TE4)', 'UF', 0.7, 0.48, 1.21, 1200000, 'La licencia SEC vale: no la cobres igual que un maestro.'),
  (4,  'Técnico instalador solar FV', 'UF', 0.5, 0.44, 0.97, 1000000, 'Trabajo en altura y especializado.'),
  (5,  'Técnico CCTV / control de acceso', 'UF', 0.5, 0.36, 0.85, 850000, 'La configuración (NVR, app, usuarios) se cobra aparte del montaje.'),
  (6,  'Técnico redes y cableado estructurado', 'UF', 0.5, 0.36, 0.85, 850000, 'Mejor cotizar por punto de red que por hora.'),
  (7,  'Técnico integración (domótica / pantallas)', 'UF', 0.5, 0.44, 0.97, 850000, 'Combina electricidad + configuración de software.'),
  (8,  'Desarrollador full stack', 'USD', 35.0, 27.0, 48.0, 2000000, 'Mediana senior US$35/h; nivel medio US$27/h; senior fuerte US$48/h (lemon.io, Q3 2026).'),
  (9,  'Integración de sistemas / arquitectura', 'USD', 45.0, 35.0, 60.0, 2500000, 'APIs de terceros + hardware + software (ej. VSX). Lo más especializado que haces. Rango estimado sobre la base de lemon.io.'),
  (10, 'Diseño UI / UX (dashboards, web)', 'USD', 30.0, 20.0, 45.0, 1600000, 'Rango estimado.'),
  (11, 'Gestión de proyecto / administración', 'UF', 0.7, 0.44, 0.97, 1200000, 'Reuniones, coordinación, cotizaciones y trámites. Súmalo siempre: 10–15% del proyecto.')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.hh_tipos_tarea (orden, clave, nombre, multiplicador, descripcion) VALUES
  (1, 'terreno', 'Ejecución en terreno', 1.0, 'Instalación, canalización, montaje: la IA no acelera'),
  (2, 'coordinacion', 'Reuniones, levantamiento, pruebas, puesta en marcha', 1.0, 'Tiempo presencial'),
  (3, 'interfaz', 'Interfaces, CRUD, formularios, PDFs', 3.0, 'La IA acelera mucho'),
  (4, 'logica', 'Modelo de datos, lógica de negocio, reportes', 2.0, 'La IA acelera bastante'),
  (5, 'integracion', 'Integración con APIs o hardware, depuración', 1.3, 'La IA acelera poco')
ON CONFLICT (clave) DO NOTHING;

-- Los cargos se buscan por nombre: si alguno se renombró o borró, ese trabajo simplemente no se
-- siembra (y un tipo de tarea borrado queda vacío).
INSERT INTO public.hh_trabajos_tipo (orden, categoria, nombre, unidad, hh_referencia, cargo_principal_id, cargo_apoyo_id,
  hh_apoyo, tipo_tarea_clave, precio_mercado_ref, duracion_equipo, notas)
SELECT v.orden, v.categoria, v.nombre, v.unidad, v.hh, p.id, a.id, v.hh_apoyo,
       (SELECT t.clave FROM public.hh_tipos_tarea t WHERE t.clave = v.tipo),
       NULLIF(v.ref, ''), NULLIF(v.dur, ''), NULLIF(v.nota, '')
FROM (VALUES
  (1,  'Electricidad', 'Visita técnica / diagnóstico', 'visita', 2.0, 'Maestro electricista', '', 0.0, 'coordinacion', '$20.000–50.000 evaluación (academiaxray)', '1 técnico', 'Cóbrala y abónala al trabajo si te contratan.'),
  (2,  'Electricidad', 'Urgencia eléctrica (falla, sin luz)', 'servicio', 4.0, 'Maestro electricista', '', 0.0, 'terreno', '~$40.000/h promedio en Chile (Cronoshare)', '1 técnico', 'Activa el recargo de urgencia en la calculadora.'),
  (3,  'Electricidad', 'Punto nuevo enchufe/interruptor a la vista', 'punto', 1.0, 'Maestro electricista', 'Ayudante eléctrico', 1.0, 'terreno', '', '1 maestro', 'Canalización sobrepuesta.'),
  (4,  'Electricidad', 'Punto nuevo embutido en muro', 'punto', 2.0, 'Maestro electricista', 'Ayudante eléctrico', 2.0, 'terreno', '', '1 maestro', 'Incluye picado y retape básico; la terminación va aparte.'),
  (5,  'Electricidad', 'Instalación luminaria / foco LED', 'unidad', 1.0, 'Maestro electricista', '', 0.0, 'terreno', '', '1 maestro', 'Sobre un punto existente.'),
  (6,  'Electricidad', 'Cambio tablero domiciliario (hasta 12 circuitos)', 'tablero', 8.0, 'Instalador eléctrico SEC (declara TE1/TE4)', 'Ayudante eléctrico', 6.0, 'terreno', '', 'Instalador + ayudante, 1 día', ''),
  (7,  'Electricidad', 'Normalización tablero + rotulado', 'tablero', 6.0, 'Instalador eléctrico SEC (declara TE1/TE4)', '', 0.0, 'terreno', '', '1 instalador', ''),
  (8,  'Electricidad', 'Mantención preventiva tablero comercio', 'tablero', 4.0, 'Instalador eléctrico SEC (declara TE1/TE4)', 'Ayudante eléctrico', 4.0, 'terreno', '', '1 instalador', 'Reapriete, mediciones, termografía e informe. Ideal como plan recurrente en UF.'),
  (9,  'Electricidad', 'Regularización + declaración TE1 (sin obras)', 'proyecto', 5.0, 'Instalador eléctrico SEC (declara TE1/TE4)', '', 0.0, 'terreno', '$100.000–170.000 (Cronoshare)', '1 instalador', 'Inspección, mediciones, plano y declaración.'),
  (10, 'Electricidad', 'TE1 tras reforma con adecuaciones menores', 'proyecto', 10.0, 'Instalador eléctrico SEC (declara TE1/TE4)', '', 0.0, 'terreno', '$180.000–300.000 (Cronoshare)', '1 instalador', ''),
  (11, 'Electricidad', 'Recableado casa ~80 m²', 'casa', 56.0, 'Maestro electricista', 'Ayudante eléctrico', 56.0, 'terreno', '', '2 personas × 3–4 días', 'La tarifa de maestro sirve como promedio entre maestro y ayudante. Suma la TE1 aparte.'),
  (12, 'Electricidad', 'Aumento de capacidad de empalme', 'servicio', 10.0, 'Instalador eléctrico SEC (declara TE1/TE4)', '', 0.0, 'terreno', '', '1 instalador + gestión', 'Incluye la gestión con la distribuidora; sus cargos van aparte.'),
  (13, 'Electricidad', 'Cargador auto eléctrico domiciliario (sin equipo)', 'unidad', 14.0, 'Instalador eléctrico SEC (declara TE1/TE4)', '', 0.0, 'terreno', 'Instalación $400.000–800.000; compleja hasta $1.200.000 (academiaxray)', '1–2 días', 'El equipo va aparte: de $200.000 a más de $1.000.000.'),
  (14, 'Solar', 'Sistema on-grid 3 kWp', 'sistema', 28.0, 'Técnico instalador solar FV', 'Ayudante eléctrico', 28.0, 'terreno', 'Sistema completo 2–3 kWp desde ~$2.500.000 (cuantomecuesta)', '2 personas × 1,5 días', 'Solo mano de obra; paneles, inversor y estructura van aparte.'),
  (15, 'Solar', 'Sistema on-grid 5 kWp', 'sistema', 40.0, 'Técnico instalador solar FV', 'Ayudante eléctrico', 40.0, 'terreno', 'Sistema 4–5 kWp ~$4.500.000 con inversor híbrido (cuantomecuesta)', '2 personas × 2–2,5 días', 'Solo mano de obra.'),
  (16, 'Solar', 'Sistema híbrido 5 kWp + batería', 'sistema', 52.0, 'Técnico instalador solar FV', 'Ayudante eléctrico', 52.0, 'terreno', 'Sistemas 8–10 kWp con baterías hasta ~$10.000.000 (cuantomecuesta)', '2 personas × 3 días', 'Solo mano de obra.'),
  (17, 'Solar', 'Declaración TE4 / net billing', 'proyecto', 8.0, 'Instalador eléctrico SEC (declara TE1/TE4)', '', 0.0, 'terreno', '', '1 instalador', 'Ingeniería, planos y trámite con la SEC y la distribuidora.'),
  (18, 'Solar', 'Batería de respaldo (sin paneles)', 'sistema', 12.0, 'Técnico instalador solar FV', 'Ayudante eléctrico', 12.0, 'terreno', '', '1 día', ''),
  (19, 'Solar', 'Mantención / limpieza paneles + revisión inversor', 'visita', 3.0, 'Técnico instalador solar FV', 'Ayudante eléctrico', 3.0, 'terreno', '', '1–2 personas', 'Véndela como plan anual en UF (1–2 visitas).'),
  (20, 'CCTV y acceso', 'Cámara IP cableada (canalización + montaje)', 'cámara', 3.0, 'Técnico CCTV / control de acceso', 'Ayudante eléctrico', 3.0, 'terreno', 'Kits de 4 cámaras instaladas desde ~$360.000 en avisos (gama baja)', '1 técnico', ''),
  (21, 'CCTV y acceso', 'Configuración NVR + app + usuarios', 'sistema', 2.0, 'Técnico CCTV / control de acceso', 'Ayudante eléctrico', 2.0, 'coordinacion', '', '1 técnico', ''),
  (22, 'CCTV y acceso', 'Kit 4 cámaras completo', 'sistema', 12.0, 'Técnico CCTV / control de acceso', 'Ayudante eléctrico', 12.0, 'terreno', '', 'Técnico + ayudante, 1 día', ''),
  (23, 'CCTV y acceso', 'Control de acceso 1 puerta (lector + cerradura + fuente)', 'puerta', 7.0, 'Técnico CCTV / control de acceso', 'Ayudante eléctrico', 7.0, 'terreno', '', '1 técnico', ''),
  (24, 'CCTV y acceso', 'Videoportero / citófono', 'unidad', 4.0, 'Técnico CCTV / control de acceso', 'Ayudante eléctrico', 4.0, 'terreno', '', '1 técnico', ''),
  (25, 'Redes', 'Punto de red Cat6 (tendido + ponchado + prueba)', 'punto', 1.25, 'Técnico redes y cableado estructurado', 'Ayudante eléctrico', 1.25, 'terreno', '', '1 técnico', 'Si pasa de 30 m o es de alta complejidad, aumenta las HH.'),
  (26, 'Redes', 'Rack / gabinete + patch panel + ordenamiento', 'rack', 6.0, 'Técnico redes y cableado estructurado', '', 0.0, 'terreno', '', '1 técnico', ''),
  (27, 'Redes', 'Access point WiFi instalado y configurado', 'unidad', 1.5, 'Técnico redes y cableado estructurado', '', 0.0, 'terreno', '', '1 técnico', ''),
  (28, 'Redes', 'Configuración router / switch / VLAN pyme', 'servicio', 4.0, 'Técnico redes y cableado estructurado', '', 0.0, 'terreno', '', '1 técnico', ''),
  (29, 'Domótica', 'Interruptor / enchufe inteligente', 'unidad', 0.75, 'Técnico integración (domótica / pantallas)', '', 0.0, 'terreno', '', '1 técnico', ''),
  (30, 'Domótica', 'Configuración app, escenas y automatizaciones', 'casa', 4.0, 'Técnico integración (domótica / pantallas)', '', 0.0, 'terreno', '', '1 técnico', ''),
  (31, 'Pantallas LED', 'Montaje pantalla LED / TV comercial', 'unidad', 4.0, 'Técnico integración (domótica / pantallas)', '', 0.0, 'terreno', '', '2 personas', ''),
  (32, 'Pantallas LED', 'Configuración software de contenidos', 'pantalla', 3.0, 'Integración de sistemas / arquitectura', '', 0.0, 'integracion', '', 'Remoto', ''),
  (33, 'Software', 'Landing page (1 página)', 'proyecto', 25.0, 'Desarrollador full stack', '', 0.0, 'interfaz', '', '1–2 semanas', 'Horas equivalentes sin IA.'),
  (34, 'Software', 'Sitio corporativo 5–7 páginas', 'proyecto', 60.0, 'Desarrollador full stack', '', 0.0, 'interfaz', '', '3–4 semanas', 'Horas equivalentes sin IA.'),
  (35, 'Software', 'Diseño UI de dashboard', 'proyecto', 30.0, 'Diseño UI / UX (dashboards, web)', '', 0.0, 'interfaz', '', '1–2 semanas', ''),
  (36, 'Software', 'Dashboard web (datos, gráficos, filtros, login)', 'proyecto', 80.0, 'Desarrollador full stack', '', 0.0, 'logica', '', '4–6 semanas', 'Horas equivalentes sin IA.'),
  (37, 'Software', 'Integración con API externa', 'integración', 40.0, 'Integración de sistemas / arquitectura', '', 0.0, 'integracion', '', '2–3 semanas', 'Depende de qué tan bien documentada esté la API.'),
  (38, 'Software', 'App web a medida (MVP)', 'proyecto', 220.0, 'Desarrollador full stack', '', 0.0, 'logica', '', '2–4 meses', 'Horas equivalentes sin IA.'),
  (39, 'Software', 'Soporte y mantención mensual', 'mes', 8.0, 'Desarrollador full stack', '', 0.0, 'logica', '', 'Mensual', 'Ingreso recurrente: cóbralo como plan mensual en UF.'),
  (40, 'Gestión', 'Levantamiento técnico + cotización compleja', 'proyecto', 4.0, 'Gestión de proyecto / administración', 'Ayudante eléctrico', 4.0, 'coordinacion', '', '1 persona', 'En proyectos grandes, cóbralo o inclúyelo explícitamente en la propuesta.'),
  (41, 'Software', 'Integración audio pantallas', 'proyecto', 4.0, 'Técnico integración (domótica / pantallas)', '', 0.0, 'integracion', '', '', '')
) AS v(orden, categoria, nombre, unidad, hh, principal, apoyo, hh_apoyo, tipo, ref, dur, nota)
JOIN public.hh_cargos p ON p.nombre = v.principal
LEFT JOIN public.hh_cargos a ON a.nombre = NULLIF(v.apoyo, '')
ON CONFLICT (categoria, nombre) DO NOTHING;

-- César y Joaquín, sin cargos: se asignan (y se vinculan a su usuario) desde «Equipo».
INSERT INTO public.hh_personas (nombre) VALUES ('César'), ('Joaquín') ON CONFLICT (nombre) DO NOTHING;
-- Joaquín queda a cargo de César (si todavía no está a cargo de nadie).
UPDATE public.hh_personas j SET jefe_id = c.id FROM public.hh_personas c
 WHERE j.nombre = 'Joaquín' AND c.nombre = 'César' AND j.jefe_id IS NULL AND c.jefe_id IS DISTINCT FROM j.id;
