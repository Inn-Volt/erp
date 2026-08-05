-- ══════════════════════════════════════════════════════════════════════════════
-- INNVOLT ERP — Esquema Supabase completo
-- Ejecutar en Supabase > SQL Editor
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── Extensiones ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 1. PROFILES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre      TEXT,
  email       TEXT,
  rol         TEXT DEFAULT 'admin' CHECK (rol IN ('admin', 'viewer')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: crear perfil al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nombre)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 2. CLIENTES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clientes (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nombre_cliente   TEXT NOT NULL,
  empresa          TEXT,
  rut              TEXT DEFAULT '',
  email            TEXT,
  telefono         TEXT,
  direccion        TEXT,
  contacto_nombre  TEXT,
  notas            TEXT,
  estado           TEXT DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Índices clientes
CREATE INDEX IF NOT EXISTS idx_clientes_nombre  ON public.clientes(nombre_cliente);
CREATE INDEX IF NOT EXISTS idx_clientes_rut     ON public.clientes(rut);
CREATE INDEX IF NOT EXISTS idx_clientes_estado  ON public.clientes(estado);

-- ─── 3. COTIZACIONES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cotizaciones (
  id                     UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  folio                  SERIAL UNIQUE NOT NULL,
  cliente_id             UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  items                  JSONB DEFAULT '[]'::JSONB,
  -- Supuestos globales del Excel (margen / imprevistos / IVA por categoría)
  supuestos              JSONB DEFAULT '{}'::JSONB,
  subtotal               NUMERIC(12,2) DEFAULT 0,
  iva                    NUMERIC(12,2) DEFAULT 0,
  total                  NUMERIC(12,2) DEFAULT 0,
  descuento_global       NUMERIC(5,2)  DEFAULT 0,   -- % descuento sobre MO
  descripcion_general    TEXT,
  condiciones_servicio   TEXT,
  condiciones_comerciales TEXT,
  ocultar_suministros    BOOLEAN DEFAULT FALSE,
  estado                 TEXT DEFAULT 'Pendiente'
                         CHECK (estado IN ('Pendiente','Aceptado','Realizado','Rechazado','Entregado')),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Índices cotizaciones
CREATE INDEX IF NOT EXISTS idx_cotizaciones_folio     ON public.cotizaciones(folio DESC);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente   ON public.cotizaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado    ON public.cotizaciones(estado);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_created   ON public.cotizaciones(created_at DESC);

-- ─── 4. CONFIGURACION EMPRESA ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.configuracion_empresa (
  id                   SERIAL PRIMARY KEY,
  nombre               TEXT DEFAULT 'InnVolt SpA',
  rut                  TEXT DEFAULT '78.299.986-9',
  giro                 TEXT DEFAULT 'Servicios Eléctricos y Tecnológicos',
  direccion            TEXT DEFAULT 'Santiago, Chile',
  telefono             TEXT DEFAULT '+56 9 8920 3902',
  email                TEXT DEFAULT 'inn-volt@outlook.cl',
  web                  TEXT DEFAULT 'www.innvolt.cl',
  iva_porcentaje       NUMERIC(4,2) DEFAULT 19,
  moneda               TEXT DEFAULT 'CLP',
  proximo_folio        INTEGER DEFAULT 1,
  condiciones_default  TEXT DEFAULT '• Validez oferta: 15 días.' || chr(10) || '• Pago: 50% anticipo + 50% al finalizar.',
  garantia_default     TEXT DEFAULT '• Garantía: 6 meses mano de obra.',
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar config por defecto si no existe
INSERT INTO public.configuracion_empresa (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ─── 5. TRIGGERS updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_updated ON public.clientes;
CREATE TRIGGER trg_clientes_updated
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_cotizaciones_updated ON public.cotizaciones;
CREATE TRIGGER trg_cotizaciones_updated
  BEFORE UPDATE ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_config_updated ON public.configuracion_empresa;
CREATE TRIGGER trg_config_updated
  BEFORE UPDATE ON public.configuracion_empresa
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 6. RPC: get_kpis ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_kpis()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  -- Se usa COALESCE(total_clp, total): las cotizaciones en UF guardan total_clp
  -- (total convertido a pesos) para no mezclar monedas en los KPIs.
  SELECT json_build_object(
    'total_cotizaciones', COUNT(*),
    'venta_acumulada',    COALESCE(SUM(COALESCE(total_clp, total)) FILTER (WHERE estado != 'Rechazado'), 0),
    'pendiente_pipeline', COALESCE(SUM(COALESCE(total_clp, total)) FILTER (WHERE estado = 'Pendiente'), 0),
    'aceptadas',          COUNT(*) FILTER (WHERE estado IN ('Aceptado','Realizado','Entregado'))
  )
  INTO result
  FROM public.cotizaciones;
  RETURN result;
END;
$$;

-- ─── 7. ROW LEVEL SECURITY ───────────────────────────────────────────────────

ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizaciones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion_empresa ENABLE ROW LEVEL SECURITY;

-- Profiles: solo ver/editar el propio
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Clientes: usuarios autenticados ven/editan todos
DROP POLICY IF EXISTS "clientes_all" ON public.clientes;
CREATE POLICY "clientes_all" ON public.clientes
  FOR ALL USING (auth.role() = 'authenticated');

-- Cotizaciones: usuarios autenticados ven/editan todos
DROP POLICY IF EXISTS "cotizaciones_all" ON public.cotizaciones;
CREATE POLICY "cotizaciones_all" ON public.cotizaciones
  FOR ALL USING (auth.role() = 'authenticated');

-- Configuración: usuarios autenticados
DROP POLICY IF EXISTS "config_all" ON public.configuracion_empresa;
CREATE POLICY "config_all" ON public.configuracion_empresa
  FOR ALL USING (auth.role() = 'authenticated');

-- ─── 8. EMPRESAS EMISORAS ────────────────────────────────────────────────────
-- Empresas que emiten cotizaciones (multi-empresa). Usada por el Cotizador,
-- el Historial y el EmpresaModal. Antes faltaba en el schema.
CREATE TABLE IF NOT EXISTS public.empresas (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre            TEXT NOT NULL,
  slogan            TEXT,
  rut               TEXT DEFAULT '',
  giro              TEXT,
  email             TEXT,
  telefono          TEXT,
  direccion         TEXT,
  website           TEXT,
  logo_url          TEXT,
  banco             TEXT,
  tipo_cuenta       TEXT,
  cuenta_bancaria   TEXT,
  texto_importante  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_empresas_nombre ON public.empresas(nombre);

DROP TRIGGER IF EXISTS trg_empresas_updated ON public.empresas;
CREATE TRIGGER trg_empresas_updated
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed: empresa InnVolt por defecto (solo si la tabla está vacía)
INSERT INTO public.empresas (nombre, slogan, rut, giro, email, telefono, direccion, website)
SELECT 'InnVolt SpA', 'Servicios Eléctricos y Tecnológicos', '78.299.986-9',
       'Ingeniería Eléctrica', 'inn-volt@outlook.cl', '+56 9 8920 3902',
       'Santiago, Chile', 'www.innvolt.cl'
WHERE NOT EXISTS (SELECT 1 FROM public.empresas);

-- ─── 9. LEVANTAMIENTOS TÉCNICOS ──────────────────────────────────────────────
-- Levantamiento técnico eléctrico en terreno. Todo el detalle va en JSONB `data`.
CREATE TABLE IF NOT EXISTS public.levantamientos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  folio       SERIAL UNIQUE NOT NULL,
  cliente_id  UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  data        JSONB DEFAULT '{}'::JSONB,
  estado      TEXT DEFAULT 'Borrador'
              CHECK (estado IN ('Borrador','Completado','Enviado','Archivado')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_levantamientos_folio   ON public.levantamientos(folio DESC);
CREATE INDEX IF NOT EXISTS idx_levantamientos_cliente ON public.levantamientos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_levantamientos_estado  ON public.levantamientos(estado);
CREATE INDEX IF NOT EXISTS idx_levantamientos_created ON public.levantamientos(created_at DESC);

DROP TRIGGER IF EXISTS trg_levantamientos_updated ON public.levantamientos;
CREATE TRIGGER trg_levantamientos_updated
  BEFORE UPDATE ON public.levantamientos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 10. RLS de las tablas nuevas ────────────────────────────────────────────
ALTER TABLE public.empresas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levantamientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "empresas_all" ON public.empresas;
CREATE POLICY "empresas_all" ON public.empresas
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "levantamientos_all" ON public.levantamientos;
CREATE POLICY "levantamientos_all" ON public.levantamientos
  FOR ALL USING (auth.role() = 'authenticated');

-- ─── 11. STORAGE: bucket "logos" (público) ───────────────────────────────────
-- Usado por EmpresaModal para subir el logo de cada empresa emisora.
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Lectura pública de logos
DROP POLICY IF EXISTS "logos_public_read" ON storage.objects;
CREATE POLICY "logos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'logos');

-- Subir / actualizar / borrar logos: solo autenticados
DROP POLICY IF EXISTS "logos_auth_insert" ON storage.objects;
CREATE POLICY "logos_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'logos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "logos_auth_update" ON storage.objects;
CREATE POLICY "logos_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'logos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "logos_auth_delete" ON storage.objects;
CREATE POLICY "logos_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'logos' AND auth.role() = 'authenticated');

-- ══════════════════════════════════════════════════════════════════════════════
-- FASE 3 — BIBLIOTECA (CATÁLOGO) Y RECETAS (ENSAMBLES)
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 12. CATÁLOGO DE ÍTEMS ───────────────────────────────────────────────────
-- Biblioteca reutilizable de materiales / mano de obra / servicios / operación.
-- Es la fuente de precios: se edita en un solo lugar y las recetas lo usan.
CREATE TABLE IF NOT EXISTS public.catalogo_items (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo      TEXT,                       -- opcional, ej "MAT-001"
  descripcion TEXT NOT NULL,
  categoria   TEXT NOT NULL DEFAULT 'material'
              CHECK (categoria IN ('material','mano_obra','servicio','operacion')),
  unidad      TEXT NOT NULL DEFAULT 'un',
  costo       NUMERIC(12,2) NOT NULL DEFAULT 0,   -- costo unitario interno
  proveedor   TEXT,                               -- de dónde se compra
  link        TEXT,                               -- URL del producto
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
-- Por si la tabla ya existía sin estas columnas:
ALTER TABLE public.catalogo_items ADD COLUMN IF NOT EXISTS proveedor TEXT;
ALTER TABLE public.catalogo_items ADD COLUMN IF NOT EXISTS link TEXT;

CREATE INDEX IF NOT EXISTS idx_catalogo_categoria ON public.catalogo_items(categoria);
CREATE INDEX IF NOT EXISTS idx_catalogo_activo    ON public.catalogo_items(activo);
CREATE INDEX IF NOT EXISTS idx_catalogo_desc      ON public.catalogo_items(descripcion);

DROP TRIGGER IF EXISTS trg_catalogo_updated ON public.catalogo_items;
CREATE TRIGGER trg_catalogo_updated
  BEFORE UPDATE ON public.catalogo_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 13. RECETAS (ENSAMBLES) ─────────────────────────────────────────────────
-- Una receta ("punto eléctrico") agrupa varios ítems del catálogo con su
-- cantidad. Al cotizar se EXPANDE en líneas editables.
CREATE TABLE IF NOT EXISTS public.recetas (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  categoria   TEXT,                       -- agrupador libre, ej "Enchufes"
  unidad      TEXT NOT NULL DEFAULT 'un', -- unidad de la receta (1 punto, 1 m²…)
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recetas_nombre ON public.recetas(nombre);
CREATE INDEX IF NOT EXISTS idx_recetas_activo ON public.recetas(activo);

DROP TRIGGER IF EXISTS trg_recetas_updated ON public.recetas;
CREATE TRIGGER trg_recetas_updated
  BEFORE UPDATE ON public.recetas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Componentes de cada receta: referencian un ítem del catálogo (precio vivo).
-- Se guarda un snapshot de descripción/categoría/unidad/costo para que la
-- receta siga funcionando aunque el ítem del catálogo se elimine.
CREATE TABLE IF NOT EXISTS public.receta_componentes (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  receta_id    UUID NOT NULL REFERENCES public.recetas(id) ON DELETE CASCADE,
  item_id      UUID REFERENCES public.catalogo_items(id) ON DELETE SET NULL,
  descripcion  TEXT NOT NULL,
  categoria    TEXT NOT NULL DEFAULT 'material'
               CHECK (categoria IN ('material','mano_obra','servicio','operacion')),
  unidad       TEXT NOT NULL DEFAULT 'un',
  costo        NUMERIC(12,2) NOT NULL DEFAULT 0,   -- snapshot del costo
  cantidad     NUMERIC(12,3) NOT NULL DEFAULT 1,   -- por 1 unidad de receta
  orden        INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receta_comp_receta ON public.receta_componentes(receta_id);

-- ─── 14. RLS del catálogo y recetas ──────────────────────────────────────────
ALTER TABLE public.catalogo_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recetas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receta_componentes  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalogo_all" ON public.catalogo_items;
CREATE POLICY "catalogo_all" ON public.catalogo_items
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "recetas_all" ON public.recetas;
CREATE POLICY "recetas_all" ON public.recetas
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "receta_comp_all" ON public.receta_componentes;
CREATE POLICY "receta_comp_all" ON public.receta_componentes
  FOR ALL USING (auth.role() = 'authenticated');

-- ─── 15. MIGRACIONES SOBRE TABLAS EXISTENTES ─────────────────────────────────
-- CREATE TABLE ... IF NOT EXISTS no altera tablas ya creadas, así que las
-- columnas nuevas se agregan explícitamente aquí.
ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS supuestos JSONB DEFAULT '{}'::JSONB;

-- Empresa emisora de la cotización. Sin esto, al reabrir una cotización o
-- generar su PDF desde el historial siempre se usaba la primera empresa.
ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cotizaciones_empresa ON public.cotizaciones(empresa_id);

-- Moneda de la cotización (CLP por defecto) + soporte UF.
--   moneda    : 'CLP' | 'UF'
--   valor_uf  : valor de la UF en CLP al momento de cotizar (solo si moneda = UF)
--   total_clp : total convertido a CLP, para KPIs/dashboard sin mezclar monedas
ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS moneda TEXT DEFAULT 'CLP';
ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS valor_uf NUMERIC;
ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS total_clp NUMERIC;

-- La tabla `empresas` pudo crearse antes sin columnas de fecha, pero el trigger
-- trg_empresas_updated escribe NEW.updated_at → "record new has no field
-- updated_at" al guardar. Se garantizan aquí ambas columnas.
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Mismo resguardo para clientes/levantamientos por si vienen de versiones viejas.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.levantamientos
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ─── 16. DATOS DE PRUEBA (opcional) ──────────────────────────────────────────
-- Descomenta para insertar datos de demo
/*
INSERT INTO public.clientes (nombre_cliente, empresa, rut, email, telefono, direccion) VALUES
  ('Juan Pérez González', 'Constructora JPC Ltda.', '12.345.678-9', 'jperez@jpc.cl', '+56 9 8888 1111', 'Av. Las Condes 1234, Santiago'),
  ('María López Silva', 'Edificios ML SpA', '98.765.432-1', 'mlopez@ml.cl', '+56 9 7777 2222', 'Providencia 567, Santiago'),
  ('Carlos Rojas Fuentes', 'Inmobiliaria Rojas', '11.222.333-4', 'crojas@rojas.cl', '+56 9 6666 3333', 'Ñuñoa 890, Santiago'),
  ('Locales Palermo', 'Palermo Comercial S.A.', '77.888.999-0', 'contacto@palermo.cl', '+56 2 2345 6789', 'Mall Palermo, Santiago');
*/
