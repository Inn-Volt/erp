-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 15: de la captación a la factura, sin perder dinero
-- Todo es aditivo: no borra datos, columnas ni funciones. Lo nuevo que controla (anticipo,
-- aprobación de descuentos) parte con una salida (motivo o umbral vacío) para no trabar nada.
--   1. Captación: la solicitud guarda origen, teléfono, correo y dirección; estado «Visita
--      agendada»; la solicitud avanza sola con la agenda (agendada → realizada → por cotizar).
--   2. Ficha tributaria del cliente (giro, comuna, correo DTE, persona o empresa) y «cliente de
--      confianza» (puede partir sin anticipo). Contacto en sitio en la visita.
--   3. Trabajo: no parte con el anticipo impago, salvo que se diga por qué (queda registrado).
--   4. Cobros: el N° de factura no se repite entre trabajos; «Por facturar» le llega también a
--      quien terminó el trabajo.
--   5. Avisos por rol: lo comercial a quien vende; el técnico recibe lo suyo.
--   6. Compras a proveedores con neto, IVA y centro de costo (libro de compras e IVA crédito).
--   7. Horas por trabajo con costo hora; materiales del trabajo (comprado, en obra, usado, sobrante).
--   8. Resultado real del trabajo = gastos + compras netas + horas.
--   9. Seguimiento automático de cotizaciones (tarea a los 3 días sin respuesta, aviso por vencer).
--  10. Aprobación del gerente para descuentos o utilidad fuera de rango (si se fijan los umbrales).
--  11. Conciliación bancaria (movimientos de la cartola) y errores de la app.
--  12. Plantilla «Protocolo de pruebas eléctricas» (entrega) y campos para la factura del SII.
-- Ejecutar DESPUÉS de las fases anteriores (1 a 14). Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 0. Permisos nuevos ──────────────────────────────────────────────────────
--   compras.ver · compras.gestionar · cotizaciones.autorizar (el Administrador los tiene todos).
UPDATE public.roles SET permisos = ARRAY(SELECT DISTINCT unnest(permisos || ARRAY['compras.ver','compras.gestionar']))
 WHERE clave = 'administrativo';
UPDATE public.roles SET permisos = ARRAY(SELECT DISTINCT unnest(permisos || ARRAY['compras.ver']))
 WHERE clave = 'solo_lectura';

-- Aviso a todos los que tienen el permiso, incluida la persona que hizo la acción (para
-- recordatorios de trabajo pendiente, como «Por facturar»).
CREATE OR REPLACE FUNCTION public.notificar_todos(p TEXT, p_tipo TEXT, p_titulo TEXT, p_cuerpo TEXT, p_url TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notificaciones (usuario_id, tipo, titulo, cuerpo, url)
  SELECT DISTINCT pf.id, p_tipo, p_titulo, p_cuerpo, p_url
  FROM public.profiles pf
  JOIN public.usuario_roles ur ON ur.usuario_id = pf.id AND ur.activo
  JOIN public.roles r ON r.id = ur.rol_id AND r.activo
  WHERE pf.activo AND ('*' = ANY(r.permisos) OR p = ANY(r.permisos));
$$;
REVOKE EXECUTE ON FUNCTION public.notificar_todos(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Pesos chilenos con punto de miles («$1.202.983»), sin depender del idioma de la base.
CREATE OR REPLACE FUNCTION public.clp(n NUMERIC)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN n < 0 THEN '-' ELSE '' END || '$' || replace(to_char(abs(round(COALESCE(n, 0))), 'FM999,999,999,990'), ',', '.');
$$;

-- RUT chileno válido (módulo 11). Acepta puntos, guion y K.
CREATE OR REPLACE FUNCTION public.rut_valido(p TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s TEXT := upper(regexp_replace(COALESCE(p, ''), '[^0-9kK]', '', 'g')); cuerpo TEXT; dv TEXT;
        suma INT := 0; mult INT := 2; i INT; r INT; esperado TEXT;
BEGIN
  IF length(s) < 2 THEN RETURN FALSE; END IF;
  cuerpo := left(s, length(s) - 1); dv := right(s, 1);
  IF cuerpo !~ '^[0-9]+$' THEN RETURN FALSE; END IF;
  FOR i IN REVERSE length(cuerpo)..1 LOOP
    suma := suma + substr(cuerpo, i, 1)::INT * mult;
    mult := CASE WHEN mult = 7 THEN 2 ELSE mult + 1 END;
  END LOOP;
  r := 11 - (suma % 11);
  esperado := CASE r WHEN 11 THEN '0' WHEN 10 THEN 'K' ELSE r::TEXT END;
  RETURN dv = esperado;
END $$;

-- ─── 1. Captación ────────────────────────────────────────────────────────────
ALTER TABLE public.solicitudes ADD COLUMN IF NOT EXISTS origen            TEXT;
ALTER TABLE public.solicitudes ADD COLUMN IF NOT EXISTS contacto_telefono TEXT;
ALTER TABLE public.solicitudes ADD COLUMN IF NOT EXISTS contacto_email    TEXT;
ALTER TABLE public.solicitudes ADD COLUMN IF NOT EXISTS direccion         TEXT;
ALTER TABLE public.solicitudes DROP CONSTRAINT IF EXISTS solicitudes_estado_check;
ALTER TABLE public.solicitudes ADD CONSTRAINT solicitudes_estado_check CHECK (estado IN (
  'NUEVA','EN_REVISION','ANALIZADA_IA','PENDIENTE_INFO','VISITA_AGENDADA','LISTA_COTIZAR',
  'COTIZACION_GENERADA','CERRADA','CANCELADA','NO_VIABLE'));

ALTER TABLE public.agendamientos ADD COLUMN IF NOT EXISTS contacto_sitio TEXT;
ALTER TABLE public.agendamientos ADD COLUMN IF NOT EXISTS telefono_sitio TEXT;

-- La solicitud avanza sola con su visita: agendada → «Visita agendada»; realizada → «Lista para
-- cotizar». Nunca retrocede una solicitud ya cotizada, cerrada o descartada.
CREATE OR REPLACE FUNCTION public.solicitud_sigue_agenda()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.solicitudes; v_nuevo TEXT; v_texto TEXT;
BEGIN
  IF NEW.solicitud_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO s FROM public.solicitudes WHERE id = NEW.solicitud_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NEW.estado = 'Realizada' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'Realizada')
     AND s.estado IN ('NUEVA','EN_REVISION','ANALIZADA_IA','PENDIENTE_INFO','VISITA_AGENDADA') THEN
    v_nuevo := 'LISTA_COTIZAR'; v_texto := 'Visita realizada: lista para cotizar.';
  ELSIF NEW.estado IN ('Agendada','Confirmada','Reprogramada')
     AND (TG_OP = 'INSERT' OR OLD.fecha IS DISTINCT FROM NEW.fecha OR OLD.estado IS DISTINCT FROM NEW.estado)
     AND s.estado IN ('NUEVA','EN_REVISION','ANALIZADA_IA','PENDIENTE_INFO','VISITA_AGENDADA') THEN
    v_nuevo := 'VISITA_AGENDADA'; v_texto := 'Visita agendada para el ' || to_char(NEW.fecha, 'DD-MM-YYYY') || '.';
  END IF;
  IF v_nuevo IS NOT NULL THEN
    UPDATE public.solicitudes
       SET estado = v_nuevo, updated_at = NOW(),
           historial = COALESCE(historial, '[]'::JSONB) || jsonb_build_array(jsonb_build_object(
             'fecha', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'texto', v_texto))
     WHERE id = s.id AND (estado IS DISTINCT FROM v_nuevo OR v_nuevo = 'VISITA_AGENDADA');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_solicitud_sigue_agenda ON public.agendamientos;
CREATE TRIGGER trg_solicitud_sigue_agenda AFTER INSERT OR UPDATE OF estado, fecha ON public.agendamientos
  FOR EACH ROW EXECUTE FUNCTION public.solicitud_sigue_agenda();

-- Cerrar la visita sin informe completado: queda el motivo en las notas de la visita.
-- (La de la fase 10, visita_realizada, sigue igual.)
CREATE OR REPLACE FUNCTION public.visita_cerrar(p_agenda UUID, p_motivo TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.tiene_permiso('agenda.gestionar') OR public.es_tecnico_de(p_agenda)) THEN
    RAISE EXCEPTION 'No tienes permiso para cerrar esta visita';
  END IF;
  UPDATE public.agendamientos
     SET estado = 'Realizada',
         notas_visita = CASE WHEN NULLIF(btrim(p_motivo), '') IS NULL THEN notas_visita
                             ELSE concat_ws(E'\n\n', NULLIF(notas_visita, ''), 'Cerrada sin informe: ' || btrim(p_motivo)) END
   WHERE id = p_agenda AND estado <> 'Cancelada';
END $$;
REVOKE EXECUTE ON FUNCTION public.visita_cerrar(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visita_cerrar(UUID, TEXT) TO authenticated;

-- ─── 2. Ficha del cliente ────────────────────────────────────────────────────
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS giro         TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS comuna       TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS ciudad       TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS correo_dte   TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS tipo_persona TEXT;   -- empresa | persona
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS origen       TEXT;   -- cómo llegó
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS sin_anticipo BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── 3. El trabajo no parte con el anticipo impago (salvo motivo) ────────────
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS inicio_sin_anticipo TEXT;   -- por qué se partió igual
ALTER TABLE public.ajustes_cotizacion ADD COLUMN IF NOT EXISTS exigir_anticipo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.ajustes_cotizacion ADD COLUMN IF NOT EXISTS costo_hora      NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.ajustes_cotizacion ADD COLUMN IF NOT EXISTS descuento_max   NUMERIC(6,2);   -- % de descuento sobre el que se pide aprobación
ALTER TABLE public.ajustes_cotizacion ADD COLUMN IF NOT EXISTS utilidad_min    NUMERIC(6,2);   -- % de utilidad bajo el que se pide aprobación
-- Costo por hora de cada persona (sueldo + leyes ÷ horas). Va aparte de profiles porque los
-- perfiles los lee todo el equipo y este dato no: solo quien ve costos o gestiona usuarios.
CREATE TABLE IF NOT EXISTS public.costos_hora (
  usuario_id     UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  costo_hora     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (costo_hora >= 0),
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.costos_hora ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.costos_hora TO authenticated;
DROP POLICY IF EXISTS costos_hora_ver ON public.costos_hora;
CREATE POLICY costos_hora_ver ON public.costos_hora FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['usuarios.gestionar','cotizaciones.ver_costos','gastos.aprobar'])));
DROP POLICY IF EXISTS costos_hora_gestionar ON public.costos_hora;
CREATE POLICY costos_hora_gestionar ON public.costos_hora FOR ALL TO authenticated
  USING ((SELECT public.tiene_permiso('usuarios.gestionar')))
  WITH CHECK ((SELECT public.tiene_permiso('usuarios.gestionar')));

-- Lo que falta pagar de los cobros «al aprobar» (el anticipo) de una cotización.
CREATE OR REPLACE FUNCTION public.anticipo_pendiente(p_cot UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(GREATEST(f.monto - COALESCE(f.monto_pagado, 0), 0)), 0)
  FROM public.por_facturar f
  JOIN public.cotizaciones c ON c.id = f.cotizacion_id
  WHERE f.cotizacion_id = p_cot AND f.etapa <> 'sin_cobro' AND f.hito IS NOT NULL
    AND f.hito IN (SELECT x->>'nombre' FROM jsonb_array_elements(public._plan_cobro(c)) x WHERE x->>'cuando' = 'aprobar');
$$;
GRANT EXECUTE ON FUNCTION public.anticipo_pendiente(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.cot_trabajo_anticipo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exigir BOOLEAN; v_confianza BOOLEAN; v_pend NUMERIC;
BEGIN
  IF NEW.trabajo_estado = 'en_ejecucion' AND OLD.trabajo_estado = 'por_iniciar'
     AND COALESCE(trim(NEW.inicio_sin_anticipo), '') = '' AND auth.uid() IS NOT NULL THEN
    SELECT exigir_anticipo INTO v_exigir FROM public.ajustes_cotizacion WHERE id = 1;
    SELECT sin_anticipo INTO v_confianza FROM public.clientes WHERE id = NEW.cliente_id;
    IF COALESCE(v_exigir, TRUE) AND NOT COALESCE(v_confianza, FALSE) THEN
      v_pend := public.anticipo_pendiente(NEW.id);
      IF v_pend > 0 THEN
        RAISE EXCEPTION 'ANTICIPO_PENDIENTE: falta pagar % del anticipo. Indica por qué se parte igual.',
          public.clp(v_pend) USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cot_trabajo_anticipo ON public.cotizaciones;
CREATE TRIGGER trg_cot_trabajo_anticipo BEFORE UPDATE OF trabajo_estado ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.cot_trabajo_anticipo();

-- ─── 4. Cobros ───────────────────────────────────────────────────────────────
-- Un N° de factura no se repite entre trabajos distintos (una factura sí puede cubrir varios
-- cobros del mismo trabajo). Los repetidos que ya existan no se tocan.
CREATE OR REPLACE FUNCTION public.por_facturar_factura_unica()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(trim(NEW.numero_factura), '') <> ''
     AND (TG_OP = 'INSERT' OR NEW.numero_factura IS DISTINCT FROM OLD.numero_factura) THEN
    IF EXISTS (SELECT 1 FROM public.por_facturar f
                WHERE f.id <> NEW.id AND upper(trim(f.numero_factura)) = upper(trim(NEW.numero_factura))
                  AND f.cotizacion_id IS DISTINCT FROM NEW.cotizacion_id) THEN
      RAISE EXCEPTION 'La factura N° % ya está registrada en otro trabajo.', trim(NEW.numero_factura) USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_por_facturar_factura_unica ON public.por_facturar;
CREATE TRIGGER trg_por_facturar_factura_unica BEFORE INSERT OR UPDATE OF numero_factura ON public.por_facturar
  FOR EACH ROW EXECUTE FUNCTION public.por_facturar_factura_unica();

-- Factura electrónica (SII): lo que devuelve el proveedor de documentos tributarios.
ALTER TABLE public.por_facturar ADD COLUMN IF NOT EXISTS dte_tipo       INT;    -- 33 factura, 34 exenta
ALTER TABLE public.por_facturar ADD COLUMN IF NOT EXISTS dte_folio      TEXT;
ALTER TABLE public.por_facturar ADD COLUMN IF NOT EXISTS dte_estado     TEXT;
ALTER TABLE public.por_facturar ADD COLUMN IF NOT EXISTS dte_pdf        TEXT;
ALTER TABLE public.por_facturar ADD COLUMN IF NOT EXISTS dte_emitido_at TIMESTAMPTZ;

-- Configuración del proveedor de factura electrónica: solo la leen la base y el servidor.
CREATE TABLE IF NOT EXISTS public.dte_config (
  id           BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  proveedor    TEXT,                 -- openfactura
  api_key      TEXT,
  ambiente     TEXT NOT NULL DEFAULT 'prueba' CHECK (ambiente IN ('prueba','produccion')),
  actualizado_at TIMESTAMPTZ
);
-- Datos del emisor que pide el SII y no están en «Mi empresa».
ALTER TABLE public.dte_config ADD COLUMN IF NOT EXISTS emisor_acteco   TEXT;   -- código de actividad económica
ALTER TABLE public.dte_config ADD COLUMN IF NOT EXISTS emisor_comuna   TEXT;
ALTER TABLE public.dte_config ADD COLUMN IF NOT EXISTS emisor_sucursal TEXT;   -- código de sucursal SII (opcional)
-- El PDF de cada factura emitida (lo sube el servidor; lo ve facturación).
INSERT INTO storage.buckets (id, name, public) VALUES ('dte', 'dte', FALSE) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "dte_pdf_ver" ON storage.objects;
CREATE POLICY "dte_pdf_ver" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dte' AND (SELECT public.tiene_alguno(ARRAY['facturacion.ver','facturacion.gestionar'])));
ALTER TABLE public.dte_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dte_config FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.dte_config TO service_role;
INSERT INTO public.dte_config (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

-- «Por facturar» le llega a todos los de facturación, incluso a quien terminó el trabajo
-- (es un recordatorio de algo pendiente). Mismo cálculo de siempre.
CREATE OR REPLACE FUNCTION public._cot_generar_cobros(p_cot UUID, p_cuando TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cotizaciones; v_total NUMERIC; h RECORD; v_monto NUMERIC; v_iv TEXT;
BEGIN
  SELECT * INTO c FROM public.cotizaciones WHERE id = p_cot;
  v_total := COALESCE(c.total_clp, c.total, 0);
  v_iv := 'IV-' || lpad(c.folio::TEXT, 4, '0');
  FOR h IN
    SELECT x.nombre, x.porcentaje, x.cuando,
           SUM(x.porcentaje) OVER (ORDER BY x.n) AS acum, SUM(x.porcentaje) OVER (ORDER BY x.n) - x.porcentaje AS antes
    FROM ROWS FROM (jsonb_to_recordset(public._plan_cobro(c)) AS (nombre TEXT, porcentaje NUMERIC, cuando TEXT))
         WITH ORDINALITY AS x(nombre, porcentaje, cuando, n)
  LOOP
    CONTINUE WHEN h.cuando IS DISTINCT FROM p_cuando OR COALESCE(h.porcentaje, 0) <= 0;
    v_monto := round(v_total * h.acum / 100) - round(v_total * h.antes / 100);
    INSERT INTO public.por_facturar (cotizacion_id, cliente_id, descripcion, monto, hito, porcentaje)
    VALUES (c.id, c.cliente_id, v_iv || ' · ' || h.nombre || ' (' || trim(to_char(h.porcentaje, 'FM990D##')) || ' %) · ' || left(COALESCE(c.titulo, 'Cotización'), 100),
            v_monto, h.nombre, h.porcentaje)
    ON CONFLICT (cotizacion_id, hito) WHERE hito IS NOT NULL DO NOTHING;
    IF FOUND THEN
      PERFORM public.notificar_todos('facturacion.gestionar', 'por_facturar', 'Por facturar: ' || v_iv || ' · ' || h.nombre,
        public.clp(v_monto) || ' · ' || left(COALESCE(c.titulo, ''), 100), '/facturacion');
    END IF;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public._cot_generar_cobros(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Aviso de pago, con los pesos a la chilena (mismo aviso de la fase 7).
CREATE OR REPLACE FUNCTION public.aviso_pago()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.monto > 0 AND NEW.monto_pagado >= NEW.monto AND COALESCE(OLD.monto_pagado, 0) < NEW.monto THEN
    PERFORM public.notificar('facturacion.ver', 'pago_recibido', 'Pagado: ' || left(COALESCE(NEW.descripcion, 'un cobro'), 80),
      public.clp(NEW.monto_pagado) || COALESCE(' · factura ' || NEW.numero_factura, ''), '/facturacion');
  END IF;
  RETURN NULL;
END $$;

-- ─── 5. Avisos por rol: lo comercial a quien vende ───────────────────────────
-- (antes «cotizaciones.ver» / «solicitudes.ver», que también tiene el técnico)
CREATE OR REPLACE FUNCTION public.avisos_cotizacion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_folio TEXT := 'IV-' || lpad(NEW.folio::TEXT, 4, '0');
  v_url   TEXT := '/cotizador?edit=' || NEW.id;
  v_cli   TEXT;
BEGIN
  SELECT nombre_cliente INTO v_cli FROM public.clientes WHERE id = NEW.cliente_id;
  IF OLD.vista_at IS NULL AND NEW.vista_at IS NOT NULL THEN
    PERFORM public.notificar('cotizaciones.crear', 'cotizacion_vista', 'El cliente abrió ' || v_folio,
      COALESCE(v_cli, 'El cliente') || ' vio la cotización por primera vez.', v_url);
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado IN ('Aprobada','Rechazada') THEN
    IF NEW.estado = 'Aprobada' THEN
      PERFORM public.notificar('cotizaciones.crear', 'cotizacion_aceptada', v_folio || ' fue aprobada',
        COALESCE(NEW.respondida_por, NEW.aprobada_como, v_cli, 'El cliente') ||
        CASE WHEN auth.uid() IS NULL THEN ' la aceptó en línea.' ELSE ' (anotada en InnVolt).' END, v_url);
    ELSE
      PERFORM public.notificar('cotizaciones.crear', 'cotizacion_rechazada', v_folio || ' fue rechazada',
        'Motivo: ' || COALESCE(NEW.motivo_perdida, 'sin motivo') || '.', v_url);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.aviso_solicitud()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cli TEXT;
BEGIN
  SELECT nombre_cliente INTO v_cli FROM public.clientes WHERE id = NEW.cliente_id;
  PERFORM public.notificar('solicitudes.crear', 'solicitud_nueva',
    'Nueva solicitud' || CASE WHEN NEW.prioridad IN ('Alta','Urgente') THEN ' (' || lower(NEW.prioridad) || ')' ELSE '' END || COALESCE(' · ' || v_cli, ''),
    left(NEW.descripcion, 140), '/solicitudes');
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.cot_trabajo_avisos()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_iv TEXT := 'IV-' || lpad(NEW.folio::TEXT, 4, '0'); v_url TEXT := '/cotizador?edit=' || NEW.id;
BEGIN
  IF NEW.estado = 'Aprobada' AND OLD.estado IS DISTINCT FROM 'Aprobada' THEN
    PERFORM public._cot_generar_cobros(NEW.id, 'aprobar');
  END IF;
  IF NEW.trabajo_estado IS DISTINCT FROM OLD.trabajo_estado AND NEW.estado = 'Aprobada' THEN
    IF NEW.trabajo_estado = 'en_ejecucion' THEN
      PERFORM public.notificar('cotizaciones.crear', 'trabajo_iniciado', 'Trabajo iniciado: ' || v_iv, left(COALESCE(NEW.titulo, ''), 120), v_url);
    ELSIF NEW.trabajo_estado = 'terminado' THEN
      PERFORM public._cot_generar_cobros(NEW.id, 'terminar');
      PERFORM public.notificar('cotizaciones.crear', 'trabajo_terminado', 'Trabajo terminado: ' || v_iv, left(COALESCE(NEW.titulo, ''), 120), v_url);
    END IF;
  END IF;
  RETURN NULL;
END $$;

-- ─── 6. Compras a proveedores ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.compras (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha            DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'America/Santiago')::DATE),
  tipo_doc         TEXT NOT NULL DEFAULT 'factura' CHECK (tipo_doc IN ('factura','factura_exenta','boleta','nota_credito','otro')),
  folio            TEXT,
  proveedor_rut    TEXT,
  proveedor_nombre TEXT NOT NULL,
  neto             NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (neto >= 0),
  exento           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (exento >= 0),
  iva              NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (iva >= 0),
  total            NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  categoria        TEXT,
  descripcion      TEXT,
  cotizacion_id    UUID REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  proyecto_id      UUID REFERENCES public.proyectos(id) ON DELETE SET NULL,
  pagada           BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_pago       DATE,
  vencimiento      DATE,
  archivo_path     TEXT,
  created_by       UUID DEFAULT auth.uid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compras_fecha ON public.compras(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_compras_cot ON public.compras(cotizacion_id);
-- Un mismo documento de un proveedor no se ingresa dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS uq_compras_documento ON public.compras
  (upper(regexp_replace(COALESCE(proveedor_rut, proveedor_nombre), '[^0-9kK]', '', 'g')), tipo_doc, upper(trim(folio)))
  WHERE folio IS NOT NULL AND trim(folio) <> '';
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compras TO authenticated;
DROP POLICY IF EXISTS compras_ver ON public.compras;
CREATE POLICY compras_ver ON public.compras FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['compras.ver','compras.gestionar'])));
DROP POLICY IF EXISTS compras_crear ON public.compras;
CREATE POLICY compras_crear ON public.compras FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('compras.gestionar')));
DROP POLICY IF EXISTS compras_editar ON public.compras;
CREATE POLICY compras_editar ON public.compras FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('compras.gestionar')));
DROP POLICY IF EXISTS compras_eliminar ON public.compras;
CREATE POLICY compras_eliminar ON public.compras FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('compras.gestionar')));
DROP TRIGGER IF EXISTS trg_compras_updated ON public.compras;
CREATE TRIGGER trg_compras_updated BEFORE UPDATE ON public.compras FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Respaldo (foto o PDF) de cada compra.
INSERT INTO storage.buckets (id, name, public) VALUES ('compras', 'compras', FALSE) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "compras_archivo_ver" ON storage.objects;
CREATE POLICY "compras_archivo_ver" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'compras' AND (SELECT public.tiene_alguno(ARRAY['compras.ver','compras.gestionar'])));
DROP POLICY IF EXISTS "compras_archivo_subir" ON storage.objects;
CREATE POLICY "compras_archivo_subir" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'compras' AND (SELECT public.tiene_permiso('compras.gestionar')));
DROP POLICY IF EXISTS "compras_archivo_borrar" ON storage.objects;
CREATE POLICY "compras_archivo_borrar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'compras' AND (SELECT public.tiene_permiso('compras.gestionar')));

-- ─── 7. Horas y materiales del trabajo ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.horas_trabajo (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cotizacion_id UUID REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  proyecto_id   UUID REFERENCES public.proyectos(id) ON DELETE CASCADE,
  usuario_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  fecha         DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'America/Santiago')::DATE),
  horas         NUMERIC(6,2) NOT NULL CHECK (horas > 0 AND horas <= 24),
  costo_hora    NUMERIC(12,2) NOT NULL DEFAULT 0,
  nota          TEXT,
  created_by    UUID DEFAULT auth.uid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cotizacion_id IS NOT NULL OR proyecto_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_horas_cot ON public.horas_trabajo(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_horas_usuario ON public.horas_trabajo(usuario_id, fecha DESC);
ALTER TABLE public.horas_trabajo ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.horas_trabajo TO authenticated;
DROP POLICY IF EXISTS horas_ver ON public.horas_trabajo;
CREATE POLICY horas_ver ON public.horas_trabajo FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()) OR (SELECT public.tiene_alguno(ARRAY['gastos.ver_todos','cotizaciones.ver_costos'])));
DROP POLICY IF EXISTS horas_crear ON public.horas_trabajo;
CREATE POLICY horas_crear ON public.horas_trabajo FOR INSERT TO authenticated
  WITH CHECK ((usuario_id = (SELECT auth.uid()) AND (SELECT public.tiene_alguno(ARRAY['gastos.crear','agenda.gestionar','cotizaciones.crear'])))
              OR (SELECT public.tiene_permiso('gastos.aprobar')));
DROP POLICY IF EXISTS horas_editar ON public.horas_trabajo;
CREATE POLICY horas_editar ON public.horas_trabajo FOR UPDATE TO authenticated
  USING ((usuario_id = (SELECT auth.uid()) AND created_at > NOW() - INTERVAL '7 days') OR (SELECT public.tiene_permiso('gastos.aprobar')));
DROP POLICY IF EXISTS horas_eliminar ON public.horas_trabajo;
CREATE POLICY horas_eliminar ON public.horas_trabajo FOR DELETE TO authenticated
  USING ((usuario_id = (SELECT auth.uid()) AND created_at > NOW() - INTERVAL '7 days') OR (SELECT public.tiene_permiso('gastos.aprobar')));

-- El costo de la hora queda fijo al registrarla: el de la persona, o el general de los ajustes.
CREATE OR REPLACE FUNCTION public.horas_costo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.costo_hora, 0) <= 0 OR NOT public.tiene_permiso('gastos.aprobar') THEN
    NEW.costo_hora := COALESCE((SELECT NULLIF(costo_hora, 0) FROM public.costos_hora WHERE usuario_id = NEW.usuario_id),
                               (SELECT NULLIF(costo_hora, 0) FROM public.ajustes_cotizacion WHERE id = 1), 0);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_horas_costo ON public.horas_trabajo;
CREATE TRIGGER trg_horas_costo BEFORE INSERT ON public.horas_trabajo FOR EACH ROW EXECUTE FUNCTION public.horas_costo();

CREATE TABLE IF NOT EXISTS public.trabajo_materiales (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cotizacion_id UUID NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  linea_id      TEXT NOT NULL,
  descripcion   TEXT NOT NULL,
  unidad        TEXT,
  cantidad      NUMERIC(12,3) NOT NULL DEFAULT 0,
  estado        TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','comprado','en_obra','instalado')),
  usado         NUMERIC(12,3),
  sobrante      NUMERIC(12,3),
  nota          TEXT,
  updated_by    UUID DEFAULT auth.uid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cotizacion_id, linea_id)
);
ALTER TABLE public.trabajo_materiales ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trabajo_materiales TO authenticated;
DROP POLICY IF EXISTS materiales_ver ON public.trabajo_materiales;
CREATE POLICY materiales_ver ON public.trabajo_materiales FOR SELECT TO authenticated
  USING ((SELECT public.tiene_permiso('cotizaciones.ver')));
DROP POLICY IF EXISTS materiales_escribir ON public.trabajo_materiales;
CREATE POLICY materiales_escribir ON public.trabajo_materiales FOR ALL TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['cotizaciones.crear','gastos.crear','agenda.gestionar'])))
  WITH CHECK ((SELECT public.tiene_alguno(ARRAY['cotizaciones.crear','gastos.crear','agenda.gestionar'])));
DROP TRIGGER IF EXISTS trg_materiales_updated ON public.trabajo_materiales;
CREATE TRIGGER trg_materiales_updated BEFORE UPDATE ON public.trabajo_materiales FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 8. Resultado real del trabajo (columnas nuevas al final) ────────────────
-- Costo de una compra para el trabajo: con factura, el neto (el IVA se recupera); con boleta, el total.
CREATE OR REPLACE FUNCTION public.costo_compra(c public.compras)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE WHEN c.tipo_doc = 'nota_credito' THEN -1 ELSE 1 END) *
         (CASE WHEN c.tipo_doc IN ('factura','factura_exenta','nota_credito') THEN c.neto + c.exento ELSE c.total END);
$$;

CREATE OR REPLACE VIEW public.cotizacion_resultado WITH (security_invoker = true) AS
SELECT c.id AS cotizacion_id,
  CASE WHEN c.moneda = 'UF' THEN round(COALESCE(c.subtotal, 0) * COALESCE(c.valor_uf, 0)) ELSE COALESCE(c.subtotal, 0) END AS venta_neta,
  CASE WHEN c.moneda = 'UF' THEN round(COALESCE(c.costo_directo, 0) * COALESCE(c.valor_uf, 0)) ELSE COALESCE(c.costo_directo, 0) END AS costo_cotizado,
  COALESCE((SELECT SUM(g.monto) FROM public.gastos g WHERE g.cotizacion_id = c.id AND g.estado <> 'rechazado'), 0) AS gastos,
  COALESCE((SELECT SUM(f.monto) FROM public.por_facturar f WHERE f.cotizacion_id = c.id AND f.etapa = 'facturado'), 0) AS facturado,
  COALESCE((SELECT SUM(f.monto_pagado) FROM public.por_facturar f WHERE f.cotizacion_id = c.id), 0) AS cobrado,
  COALESCE((SELECT SUM(f.monto) FROM public.por_facturar f WHERE f.cotizacion_id = c.id AND f.etapa <> 'sin_cobro'), 0) AS por_cobrar_total,
  COALESCE((SELECT SUM(public.costo_compra(k)) FROM public.compras k WHERE k.cotizacion_id = c.id), 0) AS compras,
  COALESCE((SELECT SUM(h.horas) FROM public.horas_trabajo h WHERE h.cotizacion_id = c.id), 0) AS horas,
  COALESCE((SELECT SUM(h.horas * h.costo_hora) FROM public.horas_trabajo h WHERE h.cotizacion_id = c.id), 0) AS costo_horas
FROM public.cotizaciones c
WHERE c.estado = 'Aprobada';
GRANT SELECT ON public.cotizacion_resultado TO authenticated;

CREATE OR REPLACE VIEW public.proyecto_resumen WITH (security_invoker = true) AS
SELECT p.id AS proyecto_id,
  COALESCE((SELECT SUM(COALESCE(c.total_clp, c.total)) FROM public.cotizaciones c WHERE c.proyecto_id = p.id AND c.estado = 'Aprobada'), 0) AS venta,
  COALESCE((SELECT SUM(COALESCE(c.total_clp, c.total)) FROM public.cotizaciones c WHERE c.proyecto_id = p.id AND c.estado = 'Enviada'), 0) AS por_aprobar,
  COALESCE((SELECT SUM(CASE m.tipo WHEN 'salida' THEN 1 ELSE -1 END * m.cantidad * COALESCE(m.costo_unitario, 0))
            FROM public.movimientos_bodega m JOIN public.ordenes_trabajo o ON o.id = m.ot_id
            WHERE o.proyecto_id = p.id AND m.tipo IN ('salida','entrada') AND m.ot_id IS NOT NULL), 0) AS costo_materiales,
  COALESCE((SELECT SUM(g.monto) FROM public.gastos g
            WHERE g.estado <> 'rechazado' AND (g.proyecto_id = p.id
               OR g.cotizacion_id IN (SELECT id FROM public.cotizaciones WHERE proyecto_id = p.id)
               OR g.ot_id IN (SELECT id FROM public.ordenes_trabajo WHERE proyecto_id = p.id))), 0) AS gastos,
  (SELECT COUNT(*) FROM public.ordenes_trabajo o WHERE o.proyecto_id = p.id AND o.estado <> 'anulada') AS ots,
  (SELECT COUNT(*) FROM public.ordenes_trabajo o WHERE o.proyecto_id = p.id AND o.estado IN ('ejecutada','cerrada')) AS ots_terminadas,
  COALESCE((SELECT SUM(r.venta_neta) FROM public.cotizacion_resultado r JOIN public.cotizaciones c ON c.id = r.cotizacion_id WHERE c.proyecto_id = p.id), 0) AS venta_neta,
  COALESCE((SELECT SUM(r.costo_cotizado) FROM public.cotizacion_resultado r JOIN public.cotizaciones c ON c.id = r.cotizacion_id WHERE c.proyecto_id = p.id), 0) AS costo_cotizado,
  COALESCE((SELECT SUM(r.cobrado) FROM public.cotizacion_resultado r JOIN public.cotizaciones c ON c.id = r.cotizacion_id WHERE c.proyecto_id = p.id), 0) AS cobrado,
  (SELECT COUNT(*) FROM public.cotizaciones c WHERE c.proyecto_id = p.id AND c.estado = 'Aprobada') AS trabajos,
  (SELECT COUNT(*) FROM public.cotizaciones c WHERE c.proyecto_id = p.id AND c.trabajo_estado = 'terminado') AS trabajos_terminados,
  COALESCE((SELECT SUM(public.costo_compra(k)) FROM public.compras k
            WHERE k.proyecto_id = p.id OR k.cotizacion_id IN (SELECT id FROM public.cotizaciones WHERE proyecto_id = p.id)), 0) AS compras,
  COALESCE((SELECT SUM(h.horas * h.costo_hora) FROM public.horas_trabajo h
            WHERE h.proyecto_id = p.id OR h.cotizacion_id IN (SELECT id FROM public.cotizaciones WHERE proyecto_id = p.id)), 0) AS costo_horas
FROM public.proyectos p;
GRANT SELECT ON public.proyecto_resumen TO authenticated;

-- ─── 9. Seguimiento automático de cotizaciones ───────────────────────────────
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS seguimiento_at TIMESTAMPTZ;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS aviso_vence_at TIMESTAMPTZ;

-- Al reenviar una cotización, sus recordatorios vuelven a programarse.
CREATE OR REPLACE FUNCTION public.cot_seguimiento_reprogramar()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.enviada_at IS DISTINCT FROM OLD.enviada_at THEN NEW.seguimiento_at := NULL; END IF;
  IF NEW.enviada_at IS DISTINCT FROM OLD.enviada_at OR NEW.valida_hasta IS DISTINCT FROM OLD.valida_hasta THEN NEW.aviso_vence_at := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cot_seguimiento_reprogramar ON public.cotizaciones;
CREATE TRIGGER trg_cot_seguimiento_reprogramar BEFORE UPDATE OF enviada_at, valida_hasta ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.cot_seguimiento_reprogramar();

-- Una vez al día: (a) enviada hace 3 días o más sin respuesta → tarea «Llamar» al responsable;
-- (b) vence en 2 días o menos → aviso al responsable. Cada cosa, una sola vez por envío.
CREATE OR REPLACE FUNCTION public.seguimiento_cotizaciones(p_ahora TIMESTAMPTZ DEFAULT NOW())
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; n INT := 0; v_hoy DATE := (p_ahora AT TIME ZONE 'America/Santiago')::DATE; v_cli TEXT; v_iv TEXT;
BEGIN
  FOR c IN SELECT * FROM public.cotizaciones
            WHERE estado = 'Enviada' AND respondida_at IS NULL AND seguimiento_at IS NULL
              AND enviada_at IS NOT NULL AND enviada_at <= p_ahora - INTERVAL '3 days' AND vendedor_id IS NOT NULL LOOP
    SELECT nombre_cliente INTO v_cli FROM public.clientes WHERE id = c.cliente_id;
    v_iv := 'IV-' || lpad(c.folio::TEXT, 4, '0');
    INSERT INTO public.tareas (titulo, descripcion, asignado_id, fecha_limite, prioridad, estado, cliente_id, proyecto_id)
    VALUES ('Llamar a ' || COALESCE(v_cli, 'el cliente') || ' por ' || v_iv,
            CASE WHEN c.vista_at IS NOT NULL THEN 'El cliente abrió la cotización el ' || to_char(c.vista_at AT TIME ZONE 'America/Santiago', 'DD-MM') || ' y no ha respondido.'
                 ELSE 'Se envió hace 3 días y el cliente aún no la abre.' END
              || ' Pregunta si tiene dudas o qué le falta para decidir. /cotizador?edit=' || c.id,
            c.vendedor_id, v_hoy + 1, 'Media', 'pendiente', c.cliente_id, c.proyecto_id);
    UPDATE public.cotizaciones SET seguimiento_at = p_ahora WHERE id = c.id;
    n := n + 1;
  END LOOP;
  FOR c IN SELECT * FROM public.cotizaciones
            WHERE estado = 'Enviada' AND respondida_at IS NULL AND aviso_vence_at IS NULL AND vendedor_id IS NOT NULL
              AND valida_hasta IS NOT NULL AND valida_hasta BETWEEN v_hoy AND v_hoy + 2 LOOP
    SELECT nombre_cliente INTO v_cli FROM public.clientes WHERE id = c.cliente_id;
    v_iv := 'IV-' || lpad(c.folio::TEXT, 4, '0');
    INSERT INTO public.notificaciones (usuario_id, tipo, titulo, cuerpo, url)
    SELECT c.vendedor_id, 'cotizacion_por_vencer', v_iv || ' vence ' ||
           CASE WHEN c.valida_hasta = v_hoy THEN 'hoy' WHEN c.valida_hasta = v_hoy + 1 THEN 'mañana' ELSE 'en 2 días' END,
           COALESCE(v_cli, 'El cliente') || ' aún no responde. Llámalo o extiende la validez.', '/cotizador?edit=' || c.id
    FROM public.profiles WHERE id = c.vendedor_id AND activo;
    UPDATE public.cotizaciones SET aviso_vence_at = p_ahora WHERE id = c.id;
    n := n + 1;
  END LOOP;
  -- Limpieza: los errores de la app se guardan 60 días.
  DELETE FROM public.errores_app WHERE created_at < p_ahora - INTERVAL '60 days';
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.seguimiento_cotizaciones(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- ─── 10. Aprobación del gerente ──────────────────────────────────────────────
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS aprobacion_estado TEXT;   -- pendiente | aprobada | rechazada
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS aprobacion_motivo TEXT;   -- por qué se pide
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS aprobacion_nota   TEXT;   -- lo que respondió quien autoriza
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS aprobacion_por    UUID;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS aprobacion_at     TIMESTAMPTZ;
DO $$ BEGIN
  ALTER TABLE public.cotizaciones ADD CONSTRAINT cotizaciones_aprobacion_check CHECK (aprobacion_estado IN ('pendiente','aprobada','rechazada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Si la cotización necesita aprobación, por qué (NULL = no la necesita). Sin umbrales, nunca.
CREATE OR REPLACE FUNCTION public.cot_motivo_aprobacion(c public.cotizaciones)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.ajustes_cotizacion; v_desc NUMERIC; v_util NUMERIC; v_motivos TEXT[] := '{}';
BEGIN
  SELECT * INTO a FROM public.ajustes_cotizacion WHERE id = 1;
  IF a.descuento_max IS NOT NULL THEN
    SELECT GREATEST(COALESCE(MAX(NULLIF(x->>'descuento', '')::NUMERIC), 0), COALESCE(c.descuento_global, 0)) INTO v_desc
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.items) = 'array' THEN c.items ELSE '[]'::JSONB END) x;
    IF v_desc > a.descuento_max THEN
      v_motivos := v_motivos || ('Descuento de ' || trim(to_char(v_desc, 'FM990D#')) || ' % (máximo sin aprobación: ' || trim(to_char(a.descuento_max, 'FM990D#')) || ' %)');
    END IF;
  END IF;
  IF a.utilidad_min IS NOT NULL AND COALESCE(c.subtotal, 0) > 0 AND COALESCE(c.costo_directo, 0) > 0 THEN
    v_util := round((c.subtotal - c.costo_directo) / c.subtotal * 100, 1);
    IF v_util < a.utilidad_min THEN
      v_motivos := v_motivos || ('Utilidad de ' || trim(to_char(v_util, 'FM990D#')) || ' % (mínimo sin aprobación: ' || trim(to_char(a.utilidad_min, 'FM990D#')) || ' %)');
    END IF;
  END IF;
  RETURN NULLIF(array_to_string(v_motivos, ' · '), '');
END $$;
GRANT EXECUTE ON FUNCTION public.cot_motivo_aprobacion(public.cotizaciones) TO authenticated;

CREATE OR REPLACE FUNCTION public.cot_aprobacion_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_motivo TEXT;
BEGIN
  -- Cambió lo que se aprobó: hay que volver a pedirla.
  IF OLD.aprobacion_estado = 'aprobada' AND NEW.estado = 'Borrador'
     AND (NEW.items IS DISTINCT FROM OLD.items OR NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.descuento_global IS DISTINCT FROM OLD.descuento_global)
     AND NEW.aprobacion_estado IS NOT DISTINCT FROM OLD.aprobacion_estado THEN
    NEW.aprobacion_estado := NULL; NEW.aprobacion_nota := NULL; NEW.aprobacion_por := NULL; NEW.aprobacion_at := NULL;
  END IF;
  -- Solo quien autoriza aprueba o rechaza.
  IF NEW.aprobacion_estado IS DISTINCT FROM OLD.aprobacion_estado AND NEW.aprobacion_estado IN ('aprobada','rechazada') THEN
    IF auth.uid() IS NOT NULL AND NOT public.tiene_permiso('cotizaciones.autorizar') THEN
      RAISE EXCEPTION 'Solo quien autoriza descuentos puede aprobar o rechazar.' USING ERRCODE = '42501';
    END IF;
    NEW.aprobacion_por := auth.uid(); NEW.aprobacion_at := NOW();
  END IF;
  -- Enviar: si necesita aprobación y no la tiene, no sale.
  IF NEW.estado = 'Enviada' AND OLD.estado = 'Borrador' AND auth.uid() IS NOT NULL
     AND NOT public.tiene_permiso('cotizaciones.autorizar') AND COALESCE(NEW.aprobacion_estado, '') <> 'aprobada' THEN
    v_motivo := public.cot_motivo_aprobacion(NEW);
    IF v_motivo IS NOT NULL THEN
      RAISE EXCEPTION 'APROBACION_REQUERIDA: %', v_motivo USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cot_aprobacion_reglas ON public.cotizaciones;
CREATE TRIGGER trg_cot_aprobacion_reglas BEFORE UPDATE ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.cot_aprobacion_reglas();

CREATE OR REPLACE FUNCTION public.cot_aprobacion_avisos()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_iv TEXT := 'IV-' || lpad(NEW.folio::TEXT, 4, '0'); v_url TEXT := '/cotizador?edit=' || NEW.id;
BEGIN
  IF NEW.aprobacion_estado IS DISTINCT FROM OLD.aprobacion_estado THEN
    IF NEW.aprobacion_estado = 'pendiente' THEN
      PERFORM public.notificar('cotizaciones.autorizar', 'aprobacion_pedida', 'Aprobar ' || v_iv || ' antes de enviarla',
        COALESCE(NEW.aprobacion_motivo, 'Pide tu aprobación.'), v_url);
    ELSIF NEW.aprobacion_estado IN ('aprobada','rechazada') AND NEW.vendedor_id IS NOT NULL THEN
      PERFORM public.notificar_usuario(NEW.vendedor_id, 'aprobacion_respuesta',
        v_iv || CASE WHEN NEW.aprobacion_estado = 'aprobada' THEN ': aprobada, ya puedes enviarla' ELSE ': no se aprobó' END,
        COALESCE(NEW.aprobacion_nota, ''), v_url);
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_cot_aprobacion_avisos ON public.cotizaciones;
CREATE TRIGGER trg_cot_aprobacion_avisos AFTER UPDATE OF aprobacion_estado ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.cot_aprobacion_avisos();

-- ─── 11. Conciliación bancaria y errores de la app ───────────────────────────
CREATE TABLE IF NOT EXISTS public.movimientos_banco (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha           DATE NOT NULL,
  descripcion     TEXT,
  monto           NUMERIC(14,2) NOT NULL,          -- + abono · − cargo
  referencia      TEXT,
  huella          TEXT NOT NULL UNIQUE,            -- evita importar dos veces la misma línea
  por_facturar_id UUID REFERENCES public.por_facturar(id) ON DELETE SET NULL,
  compra_id       UUID REFERENCES public.compras(id) ON DELETE SET NULL,
  ignorado        BOOLEAN NOT NULL DEFAULT FALSE,
  conciliado_at   TIMESTAMPTZ,
  conciliado_por  UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_movbanco_fecha ON public.movimientos_banco(fecha DESC);
ALTER TABLE public.movimientos_banco ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos_banco TO authenticated;
DROP POLICY IF EXISTS movbanco_ver ON public.movimientos_banco;
CREATE POLICY movbanco_ver ON public.movimientos_banco FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['facturacion.ver','facturacion.gestionar'])));
DROP POLICY IF EXISTS movbanco_gestionar ON public.movimientos_banco;
CREATE POLICY movbanco_gestionar ON public.movimientos_banco FOR ALL TO authenticated
  USING ((SELECT public.tiene_permiso('facturacion.gestionar')))
  WITH CHECK ((SELECT public.tiene_permiso('facturacion.gestionar')));

CREATE TABLE IF NOT EXISTS public.errores_app (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario_id UUID DEFAULT auth.uid(),
  url        TEXT,
  mensaje    TEXT NOT NULL,
  detalle    TEXT,
  navegador  TEXT
);
CREATE INDEX IF NOT EXISTS idx_errores_fecha ON public.errores_app(created_at DESC);
ALTER TABLE public.errores_app ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.errores_app TO authenticated;
DROP POLICY IF EXISTS errores_crear ON public.errores_app;
CREATE POLICY errores_crear ON public.errores_app FOR INSERT TO authenticated
  WITH CHECK (usuario_id = (SELECT auth.uid()) AND length(mensaje) <= 2000 AND length(COALESCE(detalle, '')) <= 8000);
DROP POLICY IF EXISTS errores_ver ON public.errores_app;
CREATE POLICY errores_ver ON public.errores_app FOR SELECT TO authenticated
  USING ((SELECT public.tiene_permiso('configuracion.gestionar')));
DROP POLICY IF EXISTS errores_borrar ON public.errores_app;
CREATE POLICY errores_borrar ON public.errores_app FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('configuracion.gestionar')));

-- Seguimiento de cotizaciones y limpieza: todos los días a las 9:00 de Chile (12:00 UTC aprox.).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'innvolt-seguimiento-cotizaciones';
  PERFORM cron.schedule('innvolt-seguimiento-cotizaciones', '0 12 * * *', 'SELECT public.seguimiento_cotizaciones()');
  RAISE NOTICE 'Seguimiento de cotizaciones programado (todos los días).';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron no está disponible (%): actívalo en Supabase → Database → Extensions y vuelve a correr este archivo.', SQLERRM;
END $$;

-- ─── 12. Plantilla «Protocolo de pruebas eléctricas» (la genera scripts/plantilla_protocolo.py) ─
-- @@PROTOCOLO@@
INSERT INTO public.informe_plantillas (codigo, nombre, tipo, tipo_servicio, descripcion, objetivo, instrucciones, intro, campos, checklist, estado, version)
VALUES ($t$PROT-PRU$t$, $t$Protocolo de pruebas eléctricas$t$, $t$entrega$t$, $t$electricidad$t$, $t$Mediciones de entrega: aislación, continuidad de tierras, puesta a tierra, diferenciales, tensiones y corrientes.$t$,
  $t$Dejar constancia medida de que la instalación entregada funciona y es segura; respalda la garantía y la declaración TE1.$t$, $t$Anota lo que mediste, con el instrumento usado. Si algo no se pudo medir, elige «No medido»: nunca escribas un valor que no mediste. Saca foto de la pantalla del instrumento en las mediciones clave.$t$, $t$Protocolo de pruebas eléctricas de la instalación entregada.$t$,
  $j$[{"clave": "s_datos", "etiqueta": "Instalación e instrumento", "tipo": "seccion"}, {"clave": "cliente", "etiqueta": "Cliente", "tipo": "texto", "precarga": "cliente"}, {"clave": "direccion", "etiqueta": "Dirección", "tipo": "texto", "precarga": "direccion"}, {"clave": "sistema", "etiqueta": "Sistema", "tipo": "seleccion", "opciones": ["Monofásico", "Trifásico"], "requerido": true}, {"clave": "tension_nominal", "etiqueta": "Tensión nominal", "tipo": "numero", "unidad": "V", "placeholder": "220 / 380"}, {"clave": "tablero", "etiqueta": "Tablero ensayado", "tipo": "texto", "placeholder": "TDA piso 2, TG…"}, {"clave": "instrumento", "etiqueta": "Instrumento (marca, modelo y N° de serie)", "tipo": "texto", "requerido": true}, {"clave": "calibracion", "etiqueta": "Fecha de la última calibración", "tipo": "fecha"}, {"clave": "s_aislacion", "etiqueta": "Resistencia de aislación", "tipo": "seccion"}, {"clave": "aislacion", "etiqueta": "Circuito", "tipo": "lista", "subcampos": [{"clave": "circuito", "etiqueta": "Circuito", "tipo": "texto"}, {"clave": "tension_ensayo", "etiqueta": "Tensión de ensayo", "tipo": "seleccion", "opciones": ["250 V", "500 V", "1000 V"]}, {"clave": "resistencia", "etiqueta": "Resistencia", "tipo": "numero", "unidad": "MΩ"}, {"clave": "resultado", "etiqueta": "Resultado", "tipo": "seleccion", "opciones": ["Cumple", "No cumple", "No medido"]}], "naturaleza": "medido", "alerta": ["No cumple"], "cotizacion": ["evidencia"], "ayuda": "Con el circuito desenergizado y las cargas desconectadas. Referencia habitual en BT: ≥ 0,5 MΩ ensayando a 500 V CC (revisa el pliego vigente)."}, {"clave": "s_continuidad", "etiqueta": "Continuidad de conductores de protección", "tipo": "seccion"}, {"clave": "continuidad", "etiqueta": "Punto", "tipo": "lista", "subcampos": [{"clave": "punto", "etiqueta": "Punto / circuito", "tipo": "texto"}, {"clave": "resistencia", "etiqueta": "Resistencia", "tipo": "numero", "unidad": "Ω"}, {"clave": "resultado", "etiqueta": "Resultado", "tipo": "seleccion", "opciones": ["Cumple", "No cumple", "No medido"]}], "naturaleza": "medido", "alerta": ["No cumple"], "ayuda": "Entre la barra de tierra del tablero y cada punto (enchufes, carcasas)."}, {"clave": "s_tierra", "etiqueta": "Puesta a tierra", "tipo": "seccion"}, {"clave": "tierra_metodo", "etiqueta": "Método", "tipo": "seleccion", "opciones": ["Caída de potencial (3 puntos)", "Pinza de tierra", "Otro"]}, {"clave": "tierra_resistencia", "etiqueta": "Resistencia medida", "tipo": "numero", "unidad": "Ω", "naturaleza": "medido"}, {"clave": "tierra_maximo", "etiqueta": "Valor máximo exigido para esta instalación", "tipo": "numero", "unidad": "Ω"}, {"clave": "tierra_resultado", "etiqueta": "Resultado", "tipo": "seleccion", "opciones": ["Cumple", "No cumple", "No medido"], "alerta": ["No cumple"], "naturaleza": "medido"}, {"clave": "tierra_foto", "etiqueta": "Foto del instrumento (puesta a tierra)", "tipo": "foto"}, {"clave": "s_diferenciales", "etiqueta": "Protecciones diferenciales", "tipo": "seccion"}, {"clave": "diferenciales", "etiqueta": "Diferencial", "tipo": "lista", "subcampos": [{"clave": "circuito", "etiqueta": "Circuito / ubicación", "tipo": "texto"}, {"clave": "sensibilidad", "etiqueta": "Sensibilidad IΔn", "tipo": "seleccion", "opciones": ["30 mA", "300 mA", "Otra"]}, {"clave": "tiempo", "etiqueta": "Tiempo de disparo a IΔn", "tipo": "numero", "unidad": "ms"}, {"clave": "boton", "etiqueta": "Botón de prueba", "tipo": "seleccion", "opciones": ["Opera", "No opera"]}, {"clave": "resultado", "etiqueta": "Resultado", "tipo": "seleccion", "opciones": ["Cumple", "No cumple", "No medido"]}], "naturaleza": "medido", "alerta": ["No cumple", "No opera"], "ayuda": "Con instrumento de prueba de diferenciales. Referencia habitual: dispara en ≤ 300 ms a IΔn."}, {"clave": "s_tensiones", "etiqueta": "Tensiones y corrientes", "tipo": "seccion"}, {"clave": "v_l1n", "etiqueta": "Tensión L1-N", "tipo": "numero", "unidad": "V", "naturaleza": "medido"}, {"clave": "v_l2n", "etiqueta": "Tensión L2-N", "tipo": "numero", "unidad": "V", "naturaleza": "medido", "mostrarSi": {"campo": "sistema", "op": "=", "valor": "Trifásico"}}, {"clave": "v_l3n", "etiqueta": "Tensión L3-N", "tipo": "numero", "unidad": "V", "naturaleza": "medido", "mostrarSi": {"campo": "sistema", "op": "=", "valor": "Trifásico"}}, {"clave": "v_ll", "etiqueta": "Tensión entre fases", "tipo": "numero", "unidad": "V", "naturaleza": "medido", "mostrarSi": {"campo": "sistema", "op": "=", "valor": "Trifásico"}}, {"clave": "v_nt", "etiqueta": "Tensión neutro-tierra", "tipo": "numero", "unidad": "V", "naturaleza": "medido"}, {"clave": "i_l1", "etiqueta": "Corriente L1", "tipo": "numero", "unidad": "A", "naturaleza": "medido"}, {"clave": "i_l2", "etiqueta": "Corriente L2", "tipo": "numero", "unidad": "A", "naturaleza": "medido", "mostrarSi": {"campo": "sistema", "op": "=", "valor": "Trifásico"}}, {"clave": "i_l3", "etiqueta": "Corriente L3", "tipo": "numero", "unidad": "A", "naturaleza": "medido", "mostrarSi": {"campo": "sistema", "op": "=", "valor": "Trifásico"}}, {"clave": "polaridad", "etiqueta": "Polaridad de enchufes verificada", "tipo": "si_no_na"}, {"clave": "s_resultado", "etiqueta": "Resultado", "tipo": "seccion"}, {"clave": "resultado_general", "etiqueta": "Resultado general", "tipo": "seleccion", "opciones": ["Conforme", "Conforme con observaciones", "No conforme"], "requerido": true, "alerta": ["No conforme"]}, {"clave": "observaciones", "etiqueta": "Observaciones y correcciones pendientes", "tipo": "parrafo", "cotizacion": ["pendiente"]}, {"clave": "firma_tecnico", "etiqueta": "Firma del técnico", "tipo": "firma"}, {"clave": "firma_cliente", "etiqueta": "Firma de quien recibe", "tipo": "firma"}]$j$::JSONB,
  $j$[{"texto": "Se desenergizó antes de medir aislación"}, {"texto": "Se reconectaron las cargas y se probó todo"}, {"texto": "Se dejaron rotulados los circuitos"}, {"texto": "Se entregó copia al cliente"}]$j$::JSONB, 'activa', 1)
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO NOTHING;
-- @@FIN@@
