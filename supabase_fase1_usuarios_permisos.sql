-- ══════════════════════════════════════════════════════════════════════════════
-- INNVOLT ERP — Fase 1: usuarios, roles y permisos · auditoría · avisos
-- Ejecutar en Supabase > SQL Editor DESPUÉS de supabase_schema.sql,
-- supabase_solicitudes.sql, supabase_agenda.sql y supabase_mejoras_comerciales.sql.
-- Se puede ejecutar varias veces.
--
-- Qué hace (modelo de permisos de TecApp adaptado a InnVolt):
--  1. Roles con permisos `modulo.accion`. Cada usuario tiene uno o más roles que se
--     activan y desactivan, y el usuario mismo se puede desactivar.
--  2. La BASE DE DATOS exige el permiso en cada tabla (RLS), no solo la pantalla.
--  3. Nadie pierde acceso: la primera vez, todos los usuarios que ya existen quedan
--     como Administrador. Los usuarios nuevos no tienen permisos hasta que se les
--     asigna un rol.
--  4. Siempre queda al menos un Administrador activo; el rol Administrador no se
--     puede cambiar; nadie se desactiva a sí mismo.
--  5. Auditoría: quién creó, cambió o borró qué y cuándo.
--  6. Avisos (campana) cuando el cliente abre, acepta o rechaza una cotización.
--  7. Cotizaciones: cambiar el estado exige el permiso «Aprobar»; se guarda la
--     fecha de aceptación (las ventas se cuentan por esa fecha, no por la creación).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 1. Usuarios (tabla profiles existente) ──────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS activo   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo    TEXT;

-- Quién cotiza: cada usuario cotiza con SU empresa emisora y sus datos (nombre,
-- cargo, teléfono, correo); cada cotización guarda quién la hizo (automático).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS vendedor_id UUID DEFAULT auth.uid()
  REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cotizaciones_vendedor ON public.cotizaciones(vendedor_id);

-- Perfil para usuarios creados antes de que existiera el trigger.
INSERT INTO public.profiles (id, email, nombre)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'nombre', split_part(u.email, '@', 1))
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Roles y roles por usuario ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roles (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clave       TEXT UNIQUE,                         -- rol base (admin, comercial…); NULL = rol propio
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  permisos    TEXT[] NOT NULL DEFAULT '{}',
  protegido   BOOLEAN NOT NULL DEFAULT FALSE,      -- Administrador: todos los permisos, no se cambia
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.usuario_roles (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rol_id      UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,       -- el rol se activa / desactiva por usuario
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (usuario_id, rol_id)
);
CREATE INDEX IF NOT EXISTS idx_usuario_roles_usuario ON public.usuario_roles(usuario_id);

DROP TRIGGER IF EXISTS trg_roles_updated ON public.roles;
CREATE TRIGGER trg_roles_updated BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_usuario_roles_updated ON public.usuario_roles;
CREATE TRIGGER trg_usuario_roles_updated BEFORE UPDATE ON public.usuario_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Roles base. Al volver a ejecutar este archivo, un rol base GANA los permisos
-- nuevos de su plantilla (como «poner al día» de TecApp), pero no pierde los que
-- se le agregaron a mano. El Administrador siempre tiene todo ('*').
INSERT INTO public.roles (clave, nombre, descripcion, permisos, protegido) VALUES
  ('admin', 'Administrador', 'Todos los permisos. No se puede modificar.', ARRAY['*'], TRUE),
  ('comercial', 'Comercial', 'Solicitudes, cotizaciones, clientes y seguimiento de ventas.', ARRAY[
     'solicitudes.ver','solicitudes.crear','cotizaciones.ver','cotizaciones.crear','cotizaciones.aprobar',
     'cotizaciones.ver_costos','clientes.ver','clientes.crear','plantillas.gestionar','agenda.ver',
     'agenda.gestionar','levantamientos.ver','dashboard.ver','biblioteca.ver','ia.usar'], FALSE),
  ('administrativo', 'Administrativo', 'Clientes, cotizaciones, precios y administración.', ARRAY[
     'solicitudes.ver','solicitudes.crear','cotizaciones.ver','cotizaciones.crear','cotizaciones.aprobar',
     'cotizaciones.ver_costos','clientes.ver','clientes.crear','agenda.ver','dashboard.ver',
     'biblioteca.ver','biblioteca.editar','plantillas.gestionar','ia.usar'], FALSE),
  ('tecnico', 'Técnico', 'Terreno: agenda, levantamientos y consulta de trabajos. No ve costos ni márgenes.', ARRAY[
     'solicitudes.ver','cotizaciones.ver','clientes.ver','agenda.ver','agenda.gestionar',
     'levantamientos.ver','levantamientos.crear','biblioteca.ver'], FALSE),
  ('solo_lectura', 'Solo lectura', 'Ve todo lo operativo y comercial, sin cambiar nada ni ver costos.', ARRAY[
     'solicitudes.ver','cotizaciones.ver','clientes.ver','agenda.ver','levantamientos.ver',
     'biblioteca.ver','dashboard.ver'], FALSE)
ON CONFLICT (clave) DO UPDATE SET
  permisos = CASE WHEN public.roles.protegido THEN ARRAY['*']
                  ELSE ARRAY(SELECT DISTINCT unnest(public.roles.permisos || EXCLUDED.permisos)) END;

-- ─── 3. Funciones de permisos ────────────────────────────────────────────────
-- Permisos del usuario actual: roles ACTIVOS del usuario ACTIVO. '*' = todos.
CREATE OR REPLACE FUNCTION public.mis_permisos()
RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT unnest(r.permisos)
    FROM public.profiles pf
    JOIN public.usuario_roles ur ON ur.usuario_id = pf.id AND ur.activo
    JOIN public.roles r ON r.id = ur.rol_id AND r.activo
    WHERE pf.id = auth.uid() AND pf.activo
  ), '{}'::TEXT[]);
$$;

CREATE OR REPLACE FUNCTION public.tiene_permiso(p TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pf
    JOIN public.usuario_roles ur ON ur.usuario_id = pf.id AND ur.activo
    JOIN public.roles r ON r.id = ur.rol_id AND r.activo
    WHERE pf.id = auth.uid() AND pf.activo
      AND ('*' = ANY(r.permisos) OR p = ANY(r.permisos))
  );
$$;

-- Tiene AL MENOS UNO de los permisos (para lecturas que usan varios módulos).
CREATE OR REPLACE FUNCTION public.tiene_alguno(ps TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pf
    JOIN public.usuario_roles ur ON ur.usuario_id = pf.id AND ur.activo
    JOIN public.roles r ON r.id = ur.rol_id AND r.activo
    WHERE pf.id = auth.uid() AND pf.activo
      AND ('*' = ANY(r.permisos) OR r.permisos && ps)
  );
$$;

GRANT EXECUTE ON FUNCTION public.mis_permisos()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.tiene_permiso(TEXT)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.tiene_alguno(TEXT[])   TO authenticated;

-- ─── 4. Primera vez: los usuarios que ya existen quedan como Administrador ─────
DO $$
DECLARE v_admin UUID;
BEGIN
  SELECT id INTO v_admin FROM public.roles WHERE clave = 'admin';
  IF NOT EXISTS (SELECT 1 FROM public.usuario_roles) THEN
    INSERT INTO public.usuario_roles (usuario_id, rol_id)
    SELECT id, v_admin FROM public.profiles;
  END IF;
END $$;

-- Usuario nuevo: crea su perfil (como antes) SIN permisos, salvo que no exista
-- ningún Administrador activo (instalación nueva): ahí queda como Administrador.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nombre)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pf
    JOIN public.usuario_roles ur ON ur.usuario_id = pf.id AND ur.activo
    JOIN public.roles r ON r.id = ur.rol_id AND r.activo AND r.protegido
    WHERE pf.activo AND pf.id <> NEW.id
  ) THEN
    INSERT INTO public.usuario_roles (usuario_id, rol_id)
    SELECT NEW.id, id FROM public.roles WHERE clave = 'admin'
    ON CONFLICT (usuario_id, rol_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

-- ─── 5. Resguardos ───────────────────────────────────────────────────────────
-- 5a. Roles: el Administrador no se cambia; la clave de un rol base no cambia; un
--     rol con usuarios no se desactiva; los roles no se borran (se desactivan).
CREATE OR REPLACE FUNCTION public.roles_resguardo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los roles no se eliminan: desactívalo.' USING ERRCODE = '42501';
  END IF;
  IF OLD.protegido AND (NEW.permisos IS DISTINCT FROM OLD.permisos OR NEW.activo IS DISTINCT FROM OLD.activo
      OR NEW.protegido IS DISTINCT FROM OLD.protegido) THEN
    RAISE EXCEPTION 'El rol Administrador no se puede modificar.' USING ERRCODE = '42501';
  END IF;
  IF NEW.clave IS DISTINCT FROM OLD.clave THEN
    RAISE EXCEPTION 'La clave de un rol no se puede cambiar.' USING ERRCODE = '42501';
  END IF;
  IF NEW.protegido AND NOT OLD.protegido THEN
    RAISE EXCEPTION 'Un rol no puede pasar a ser protegido.' USING ERRCODE = '42501';
  END IF;
  IF OLD.activo AND NOT NEW.activo AND EXISTS (
      SELECT 1 FROM public.usuario_roles ur JOIN public.profiles pf ON pf.id = ur.usuario_id
      WHERE ur.rol_id = OLD.id AND ur.activo AND pf.activo) THEN
    RAISE EXCEPTION 'Quita este rol a sus usuarios antes de desactivarlo.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_roles_resguardo ON public.roles;
CREATE TRIGGER trg_roles_resguardo BEFORE UPDATE OR DELETE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.roles_resguardo();

-- Los roles nuevos nunca nacen protegidos ni con clave de rol base.
CREATE OR REPLACE FUNCTION public.roles_nuevo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.protegido := FALSE;
    NEW.clave := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_roles_nuevo ON public.roles;
CREATE TRIGGER trg_roles_nuevo BEFORE INSERT ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.roles_nuevo();

-- 5b. Siempre debe quedar al menos un Administrador activo.
CREATE OR REPLACE FUNCTION public.resguardo_ultimo_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pf
    JOIN public.usuario_roles ur ON ur.usuario_id = pf.id AND ur.activo
    JOIN public.roles r ON r.id = ur.rol_id AND r.activo AND r.protegido
    WHERE pf.activo
  ) THEN
    RAISE EXCEPTION 'Debe quedar al menos un Administrador activo.' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_ultimo_admin_ur ON public.usuario_roles;
CREATE TRIGGER trg_ultimo_admin_ur AFTER UPDATE OR DELETE ON public.usuario_roles
  FOR EACH STATEMENT EXECUTE FUNCTION public.resguardo_ultimo_admin();
DROP TRIGGER IF EXISTS trg_ultimo_admin_pf ON public.profiles;
CREATE TRIGGER trg_ultimo_admin_pf AFTER UPDATE ON public.profiles
  FOR EACH STATEMENT EXECUTE FUNCTION public.resguardo_ultimo_admin();

-- 5c. Usuarios: activar/desactivar y el correo solo con «Gestionar usuarios»;
--     nadie se desactiva a sí mismo. Cada uno puede editar su nombre y teléfono.
CREATE OR REPLACE FUNCTION public.profiles_resguardo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;  -- servidor (service role) o SQL Editor
  IF (NEW.activo IS DISTINCT FROM OLD.activo OR NEW.email IS DISTINCT FROM OLD.email OR NEW.rol IS DISTINCT FROM OLD.rol)
     AND NOT public.tiene_permiso('usuarios.gestionar') THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar este usuario.' USING ERRCODE = '42501';
  END IF;
  IF NEW.id = auth.uid() AND OLD.activo AND NOT NEW.activo THEN
    RAISE EXCEPTION 'No puedes desactivar tu propio usuario.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profiles_resguardo ON public.profiles;
CREATE TRIGGER trg_profiles_resguardo BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_resguardo();

-- 5d. Cotizaciones: cambiar el estado exige «Aprobar»; se guarda la fecha de
--     aceptación (las ventas se cuentan por ella).
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS aceptada_at TIMESTAMPTZ;
UPDATE public.cotizaciones
   SET aceptada_at = COALESCE(respondida_at, updated_at, created_at)
 WHERE aceptada_at IS NULL AND estado IN ('Aceptado','Realizado','Entregado');

CREATE OR REPLACE FUNCTION public.cotizacion_estado()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado
     AND auth.uid() IS NOT NULL AND NOT public.tiene_permiso('cotizaciones.aprobar') THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar el estado de una cotización.' USING ERRCODE = '42501';
  END IF;
  IF NEW.estado IN ('Aceptado','Realizado','Entregado') THEN
    NEW.aceptada_at := COALESCE(NEW.aceptada_at, NEW.respondida_at, NOW());
  ELSE
    NEW.aceptada_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cotizacion_estado ON public.cotizaciones;
CREATE TRIGGER trg_cotizacion_estado BEFORE INSERT OR UPDATE ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.cotizacion_estado();
CREATE INDEX IF NOT EXISTS idx_cotizaciones_aceptada ON public.cotizaciones(aceptada_at DESC);

-- 5e. El KPI de servidor (si se usa) también exige permiso.
CREATE OR REPLACE FUNCTION public.get_kpis()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result JSON;
BEGIN
  IF NOT public.tiene_permiso('dashboard.ver') THEN
    RAISE EXCEPTION 'Sin permiso.' USING ERRCODE = '42501';
  END IF;
  SELECT json_build_object(
    'total_cotizaciones', COUNT(*),
    'venta_acumulada',    COALESCE(SUM(COALESCE(total_clp, total)) FILTER (WHERE estado != 'Rechazado'), 0),
    'pendiente_pipeline', COALESCE(SUM(COALESCE(total_clp, total)) FILTER (WHERE estado = 'Pendiente'), 0),
    'aceptadas',          COUNT(*) FILTER (WHERE estado IN ('Aceptado','Realizado','Entregado'))
  ) INTO result FROM public.cotizaciones;
  RETURN result;
END $$;

-- ─── 6. Auditoría ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auditoria (
  id              BIGSERIAL PRIMARY KEY,
  tabla           TEXT NOT NULL,
  registro_id     TEXT,
  accion          TEXT NOT NULL CHECK (accion IN ('crear','editar','eliminar')),
  cambios         JSONB,            -- editar: {campo: {antes, despues}} · crear/eliminar: la fila
  usuario_id      UUID,
  usuario_nombre  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_registro ON public.auditoria(tabla, registro_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha    ON public.auditoria(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario  ON public.auditoria(usuario_id);

-- Un valor grande (los ítems de una cotización, los datos de un levantamiento) no
-- se copia entero: solo se anota que cambió.
CREATE OR REPLACE FUNCTION public.auditoria_valor(v JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v IS NULL THEN NULL
              WHEN length(v::TEXT) > 300 THEN to_jsonb('[contenido extenso]'::TEXT)
              ELSE v END;
$$;

CREATE OR REPLACE FUNCTION public.auditoria_fila(f JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(jsonb_object_agg(k, public.auditoria_valor(v)), '{}'::JSONB)
  FROM jsonb_each(f) AS e(k, v)
  WHERE k NOT IN ('created_at','updated_at') AND v IS NOT NULL AND v <> 'null'::JSONB;
$$;

CREATE OR REPLACE FUNCTION public.auditar()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old JSONB; v_new JSONB; v_cambios JSONB := '{}'::JSONB; k TEXT;
  v_uid UUID := auth.uid(); v_nombre TEXT;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP IN ('UPDATE','INSERT') THEN v_new := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      CONTINUE WHEN k IN ('updated_at');
      IF (v_old -> k) IS DISTINCT FROM (v_new -> k) THEN
        v_cambios := v_cambios || jsonb_build_object(k, jsonb_build_object(
          'antes', public.auditoria_valor(v_old -> k), 'despues', public.auditoria_valor(v_new -> k)));
      END IF;
    END LOOP;
    IF v_cambios = '{}'::JSONB THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'INSERT' THEN
    v_cambios := public.auditoria_fila(v_new);
  ELSE
    v_cambios := public.auditoria_fila(v_old);
  END IF;
  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(NULLIF(nombre, ''), email) INTO v_nombre FROM public.profiles WHERE id = v_uid;
  END IF;
  INSERT INTO public.auditoria (tabla, registro_id, accion, cambios, usuario_id, usuario_nombre)
  VALUES (TG_TABLE_NAME, COALESCE(v_new, v_old) ->> 'id',
          CASE TG_OP WHEN 'INSERT' THEN 'crear' WHEN 'UPDATE' THEN 'editar' ELSE 'eliminar' END,
          v_cambios, v_uid, COALESCE(v_nombre, CASE WHEN v_uid IS NULL THEN 'Sistema o cliente (enlace)' END));
  RETURN COALESCE(NEW, OLD);
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','roles','usuario_roles','clientes','cotizaciones','solicitudes',
    'agendamientos','levantamientos','catalogo_items','recetas','receta_componentes','empresas',
    'configuracion_empresa','plantillas_cotizacion'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.auditar()', t);
  END LOOP;
END $$;

-- ─── 7. Avisos (campana) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,
  titulo      TEXT NOT NULL,
  cuerpo      TEXT,
  url         TEXT,
  leida_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON public.notificaciones(usuario_id, created_at DESC);

-- Avisa a cada usuario activo que tenga el permiso.
CREATE OR REPLACE FUNCTION public.notificar(p TEXT, p_tipo TEXT, p_titulo TEXT, p_cuerpo TEXT, p_url TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notificaciones (usuario_id, tipo, titulo, cuerpo, url)
  SELECT DISTINCT pf.id, p_tipo, p_titulo, p_cuerpo, p_url
  FROM public.profiles pf
  JOIN public.usuario_roles ur ON ur.usuario_id = pf.id AND ur.activo
  JOIN public.roles r ON r.id = ur.rol_id AND r.activo
  WHERE pf.activo AND ('*' = ANY(r.permisos) OR p = ANY(r.permisos));
$$;
REVOKE EXECUTE ON FUNCTION public.notificar(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

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
  IF OLD.respondida_at IS NULL AND NEW.respondida_at IS NOT NULL THEN
    IF NEW.estado = 'Aceptado' THEN
      PERFORM public.notificar('cotizaciones.ver', 'cotizacion_aceptada', v_folio || ' fue aceptada',
        COALESCE(NEW.respondida_por, v_cli, 'El cliente') || ' la aceptó en línea.', v_url);
    ELSIF NEW.estado = 'Rechazado' THEN
      PERFORM public.notificar('cotizaciones.ver', 'cotizacion_rechazada', v_folio || ' fue rechazada',
        'Motivo: ' || COALESCE(NEW.motivo_perdida, 'sin motivo') || '.', v_url);
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_avisos_cotizacion ON public.cotizaciones;
CREATE TRIGGER trg_avisos_cotizacion AFTER UPDATE ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.avisos_cotizacion();

-- Tiempo real: la campana se entera al instante (si el proyecto tiene Realtime).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notificaciones') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
  END IF;
END $$;

-- Acceso de la API a las tablas nuevas (los proyectos nuevos de Supabase ya no lo
-- dan solo). Lo que cada uno puede ver o cambiar lo deciden las reglas de abajo.
GRANT SELECT, INSERT, UPDATE ON public.roles, public.usuario_roles TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.notificaciones TO authenticated;
GRANT SELECT ON public.auditoria TO authenticated;
GRANT ALL ON public.roles, public.usuario_roles, public.notificaciones, public.auditoria TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.auditoria_id_seq TO service_role;

-- ─── 8. Permisos en la base de datos (RLS) ───────────────────────────────────
-- Se borran TODAS las reglas anteriores de estas tablas (algunas daban acceso a
-- cualquiera con sesión) y se crean las nuevas, una por operación.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN ('profiles','roles','usuario_roles','clientes',
             'cotizaciones','solicitudes','agendamientos','levantamientos','catalogo_items','recetas',
             'receta_componentes','empresas','configuracion_empresa','plantillas_cotizacion','auditoria',
             'notificaciones') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizaciones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitudes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamientos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levantamientos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recetas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receta_componentes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plantillas_cotizacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones        ENABLE ROW LEVEL SECURITY;

-- (SELECT …) hace que Postgres evalúe el permiso una vez por consulta, no por fila.

-- Usuarios: todos los usuarios con sesión ven los nombres del equipo (asignar,
-- agenda); cada uno edita lo suyo; «Gestionar usuarios» edita a todos.
CREATE POLICY profiles_ver ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_editar ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT public.tiene_permiso('usuarios.gestionar')));

-- Roles
CREATE POLICY roles_ver ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY roles_crear ON public.roles FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('roles.gestionar')));
CREATE POLICY roles_editar ON public.roles FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('roles.gestionar')));

CREATE POLICY usuario_roles_ver ON public.usuario_roles FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()) OR (SELECT public.tiene_alguno(ARRAY['usuarios.ver','usuarios.gestionar'])));
CREATE POLICY usuario_roles_crear ON public.usuario_roles FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('usuarios.gestionar')));
CREATE POLICY usuario_roles_editar ON public.usuario_roles FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('usuarios.gestionar')));

-- Clientes (los ven también quienes trabajan con cotizaciones, solicitudes, agenda o levantamientos)
CREATE POLICY clientes_ver ON public.clientes FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['clientes.ver','cotizaciones.ver','solicitudes.ver','agenda.ver','levantamientos.ver'])));
CREATE POLICY clientes_crear ON public.clientes FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_alguno(ARRAY['clientes.crear','cotizaciones.crear','solicitudes.crear'])));
CREATE POLICY clientes_editar ON public.clientes FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('clientes.crear')));
CREATE POLICY clientes_eliminar ON public.clientes FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('clientes.anular')));

-- Cotizaciones (cambiar el estado, además, exige «Aprobar»: trigger cotizacion_estado)
CREATE POLICY cotizaciones_ver ON public.cotizaciones FOR SELECT TO authenticated
  USING ((SELECT public.tiene_permiso('cotizaciones.ver')));
CREATE POLICY cotizaciones_crear ON public.cotizaciones FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('cotizaciones.crear')));
CREATE POLICY cotizaciones_editar ON public.cotizaciones FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['cotizaciones.crear','cotizaciones.aprobar'])));
CREATE POLICY cotizaciones_eliminar ON public.cotizaciones FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('cotizaciones.anular')));

-- Solicitudes
CREATE POLICY solicitudes_ver ON public.solicitudes FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['solicitudes.ver','cotizaciones.crear'])));
CREATE POLICY solicitudes_crear ON public.solicitudes FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('solicitudes.crear')));
CREATE POLICY solicitudes_editar ON public.solicitudes FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['solicitudes.crear','cotizaciones.crear','cotizaciones.aprobar'])));
CREATE POLICY solicitudes_eliminar ON public.solicitudes FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('solicitudes.anular')));

-- Agenda
CREATE POLICY agenda_ver ON public.agendamientos FOR SELECT TO authenticated
  USING ((SELECT public.tiene_permiso('agenda.ver')));
CREATE POLICY agenda_crear ON public.agendamientos FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('agenda.gestionar')));
CREATE POLICY agenda_editar ON public.agendamientos FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('agenda.gestionar')));
CREATE POLICY agenda_eliminar ON public.agendamientos FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('agenda.gestionar')));

-- Levantamientos (el cotizador los lee para traer fotos y alcance)
CREATE POLICY levantamientos_ver ON public.levantamientos FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['levantamientos.ver','cotizaciones.crear'])));
CREATE POLICY levantamientos_crear ON public.levantamientos FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('levantamientos.crear')));
CREATE POLICY levantamientos_editar ON public.levantamientos FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('levantamientos.crear')));
CREATE POLICY levantamientos_eliminar ON public.levantamientos FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('levantamientos.anular')));

-- Biblioteca de precios (el cotizador la consulta)
CREATE POLICY catalogo_ver ON public.catalogo_items FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['biblioteca.ver','cotizaciones.crear'])));
CREATE POLICY catalogo_crear ON public.catalogo_items FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('biblioteca.editar')));
CREATE POLICY catalogo_editar ON public.catalogo_items FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('biblioteca.editar')));
CREATE POLICY catalogo_eliminar ON public.catalogo_items FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('biblioteca.editar')));

CREATE POLICY recetas_ver ON public.recetas FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['biblioteca.ver','cotizaciones.crear'])));
CREATE POLICY recetas_crear ON public.recetas FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('biblioteca.editar')));
CREATE POLICY recetas_editar ON public.recetas FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('biblioteca.editar')));
CREATE POLICY recetas_eliminar ON public.recetas FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('biblioteca.editar')));

CREATE POLICY receta_comp_ver ON public.receta_componentes FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['biblioteca.ver','cotizaciones.crear'])));
CREATE POLICY receta_comp_crear ON public.receta_componentes FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('biblioteca.editar')));
CREATE POLICY receta_comp_editar ON public.receta_componentes FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('biblioteca.editar')));
CREATE POLICY receta_comp_eliminar ON public.receta_componentes FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('biblioteca.editar')));

-- Empresas emisoras (el cotizador las elige y edita al cotizar)
CREATE POLICY empresas_ver ON public.empresas FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['cotizaciones.ver','levantamientos.ver','configuracion.gestionar'])));
CREATE POLICY empresas_crear ON public.empresas FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_alguno(ARRAY['configuracion.gestionar','cotizaciones.crear'])));
CREATE POLICY empresas_editar ON public.empresas FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['configuracion.gestionar','cotizaciones.crear'])));
CREATE POLICY empresas_eliminar ON public.empresas FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('configuracion.gestionar')));

-- Configuración (los textos por omisión los lee el cotizador)
CREATE POLICY config_ver ON public.configuracion_empresa FOR SELECT TO authenticated USING (true);
CREATE POLICY config_crear ON public.configuracion_empresa FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('configuracion.gestionar')));
CREATE POLICY config_editar ON public.configuracion_empresa FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('configuracion.gestionar')));

-- Plantillas de cotización («Guardar como plantilla» desde la cotización: Aprobar)
CREATE POLICY plantillas_ver ON public.plantillas_cotizacion FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['cotizaciones.crear','plantillas.gestionar'])));
CREATE POLICY plantillas_crear ON public.plantillas_cotizacion FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_alguno(ARRAY['plantillas.gestionar','cotizaciones.aprobar'])));
CREATE POLICY plantillas_editar ON public.plantillas_cotizacion FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('plantillas.gestionar')));
CREATE POLICY plantillas_eliminar ON public.plantillas_cotizacion FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('plantillas.gestionar')));

-- Auditoría: solo lectura y solo con permiso (la escriben los triggers)
CREATE POLICY auditoria_ver ON public.auditoria FOR SELECT TO authenticated
  USING ((SELECT public.tiene_permiso('auditoria.ver')));

-- Avisos: cada uno ve, marca y limpia los suyos
CREATE POLICY notificaciones_ver ON public.notificaciones FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()));
CREATE POLICY notificaciones_editar ON public.notificaciones FOR UPDATE TO authenticated
  USING (usuario_id = (SELECT auth.uid()));
CREATE POLICY notificaciones_eliminar ON public.notificaciones FOR DELETE TO authenticated
  USING (usuario_id = (SELECT auth.uid()));

-- ─── 9. Archivos (Storage) ───────────────────────────────────────────────────
-- Logos: lectura pública (van en el PDF); subirlos, quien configura o cotiza.
DROP POLICY IF EXISTS "logos_auth_insert" ON storage.objects;
CREATE POLICY "logos_auth_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logos' AND (SELECT public.tiene_alguno(ARRAY['configuracion.gestionar','cotizaciones.crear'])));
DROP POLICY IF EXISTS "logos_auth_update" ON storage.objects;
CREATE POLICY "logos_auth_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'logos' AND (SELECT public.tiene_alguno(ARRAY['configuracion.gestionar','cotizaciones.crear'])));
DROP POLICY IF EXISTS "logos_auth_delete" ON storage.objects;
CREATE POLICY "logos_auth_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'logos' AND (SELECT public.tiene_alguno(ARRAY['configuracion.gestionar','cotizaciones.crear'])));

-- Fotos de levantamientos: privadas; las ve quien ve levantamientos o cotizaciones
-- (van en el PDF de la cotización); las sube quien hace levantamientos.
DROP POLICY IF EXISTS "levfotos_auth_select" ON storage.objects;
CREATE POLICY "levfotos_auth_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'levantamientos-fotos' AND (SELECT public.tiene_alguno(ARRAY['levantamientos.ver','cotizaciones.ver'])));
DROP POLICY IF EXISTS "levfotos_auth_insert" ON storage.objects;
CREATE POLICY "levfotos_auth_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'levantamientos-fotos' AND (SELECT public.tiene_permiso('levantamientos.crear')));
DROP POLICY IF EXISTS "levfotos_auth_update" ON storage.objects;
CREATE POLICY "levfotos_auth_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'levantamientos-fotos' AND (SELECT public.tiene_permiso('levantamientos.crear')));
DROP POLICY IF EXISTS "levfotos_auth_delete" ON storage.objects;
CREATE POLICY "levfotos_auth_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'levantamientos-fotos' AND (SELECT public.tiene_permiso('levantamientos.crear')));
