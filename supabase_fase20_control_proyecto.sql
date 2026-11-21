-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 20: control de proyecto (presupuesto vs real, mano de obra y flujo de caja)
-- Hoy el trabajo dice si ganó o perdió plata; con esto dice DÓNDE y CUÁNDO:
--   · Gastos y compras pueden decir de qué partida de la cotización son (opcional; vacío =
--     «Sin partida»). Es el id de la partida en cotizaciones.partidas (JSON): la app revisa que
--     exista al guardar y la limpia si cambia el trabajo.
--   · Cada compra dice qué tipo de costo es (material, mano de obra, servicio u operación).
--   · Equipo: el personal interno con su sueldo LÍQUIDO y sus descuentos (AFP, salud, cesantía y
--     otros, los de cada uno) da el bruto; con los aportes del empleador y su jornada (horas,
--     colación, movilización…), el costo por día y por hora. Los externos y subcontratos, su valor
--     por jornada (líquido) y si dan boleta de honorarios (el costo incluye la retención del SII).
--   · Mano de obra del trabajo, día a día: horas de los internos y pagos a externos. El costo lo
--     calcula la base y queda fijo (si después cambia el sueldo, lo ya registrado no cambia).
--   · Al aprobar se puede fijar el primer pago (en $): el plan de cobro se ajusta solo.
--   · El trabajo guarda su plan de flujo de caja semanal (flujo_plan). Vacío = el plan por omisión.
--   · Una cotización copiada nace limpia (sin plan del flujo, sin «partió sin anticipo» y sin la
--     aprobación de descuento de la original).
-- El resultado del trabajo (cotizacion_resultado y proyecto_resumen) suma la mano de obra en una
-- columna nueva al final. Ejecutar DESPUÉS de las fases anteriores (necesita la 15). Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Partida de cada gasto y compra; tipo de costo de la compra ───────────
ALTER TABLE public.gastos  ADD COLUMN IF NOT EXISTS partida_id TEXT;   -- id en cotizaciones.partidas
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS partida_id TEXT;
CREATE INDEX IF NOT EXISTS idx_gastos_cot_partida  ON public.gastos(cotizacion_id, partida_id)  WHERE cotizacion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compras_cot_partida ON public.compras(cotizacion_id, partida_id) WHERE cotizacion_id IS NOT NULL;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS tipo_costo TEXT                 -- vacío = material
  CHECK (tipo_costo IN ('material','mano_obra','servicio','operacion'));

-- ─── 2. Plan del flujo de caja y cotizaciones copiadas ───────────────────────
-- { inicio: 'AAAA-MM-DD', semanas: n, distribucion: { <partidaId>: [% por semana, suma 100] },
--   hitos: { <nombre del hito>: semana } }. Lo cambia quien edita cotizaciones (regla de siempre),
-- también con el trabajo aprobado: cotizacion_reglas y cot_trabajo_reglas no lo miran.
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS flujo_plan JSONB
  CHECK (flujo_plan IS NULL OR jsonb_typeof(flujo_plan) = 'object');

CREATE OR REPLACE FUNCTION public.cot_nueva_limpia()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.flujo_plan := NULL;
  NEW.inicio_sin_anticipo := NULL;
  NEW.aprobacion_estado := NULL; NEW.aprobacion_nota := NULL; NEW.aprobacion_por := NULL; NEW.aprobacion_at := NULL;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.cot_nueva_limpia() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_cot_nueva_limpia ON public.cotizaciones;
CREATE TRIGGER trg_cot_nueva_limpia BEFORE INSERT ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.cot_nueva_limpia();

-- ─── 3. Equipo: personal interno y externos ──────────────────────────────────
-- Retención de la boleta de honorarios (%, la que va al SII): se fija en los ajustes.
ALTER TABLE public.ajustes_cotizacion ADD COLUMN IF NOT EXISTS retencion_honorarios NUMERIC(5,2) NOT NULL DEFAULT 15.25
  CHECK (retencion_honorarios >= 0 AND retencion_honorarios < 100);

CREATE TABLE IF NOT EXISTS public.trabajadores (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo             TEXT NOT NULL CHECK (tipo IN ('interno','externo')),
  nombre           TEXT NOT NULL CHECK (trim(nombre) <> ''),
  rut              TEXT,
  oficio           TEXT,                        -- cargo u oficio: maestro eléctrico, ayudante, subcontrato…
  usuario_id       UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,   -- si tiene cuenta (registra sus horas)
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  -- Interno: el sueldo líquido (sin colación ni movilización) y los descuentos de la persona dan el
  -- bruto: (líquido + otros descuentos) ÷ (1 − AFP − salud − cesantía). Costo del día = bruto ×
  -- (1 + aportes del empleador) ÷ días del mes + colación + movilización + otros.
  sueldo_liquido   NUMERIC(12,0) NOT NULL DEFAULT 0 CHECK (sueldo_liquido >= 0),
  afp_pct          NUMERIC(5,2)  NOT NULL DEFAULT 11.5 CHECK (afp_pct >= 0),       -- 10 % + comisión de su AFP
  salud_pct        NUMERIC(5,2)  NOT NULL DEFAULT 7 CHECK (salud_pct >= 0),        -- Fonasa o Isapre
  cesantia_pct     NUMERIC(5,2)  NOT NULL DEFAULT 0.6 CHECK (cesantia_pct >= 0),   -- 0,6 % indefinido; 0 a plazo fijo
  otros_descuentos NUMERIC(12,0) NOT NULL DEFAULT 0 CHECK (otros_descuentos >= 0), -- $ al mes: Isapre adicional, impuesto…
  aportes_pct      NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (aportes_pct >= 0 AND aportes_pct <= 100),
  dias_mes         NUMERIC(4,1)  NOT NULL DEFAULT 22 CHECK (dias_mes > 0 AND dias_mes <= 31),
  horas_dia        NUMERIC(4,2)  NOT NULL DEFAULT 9 CHECK (horas_dia > 0 AND horas_dia <= 24),
  colacion_dia     NUMERIC(10,0) NOT NULL DEFAULT 0 CHECK (colacion_dia >= 0),
  movilizacion_dia NUMERIC(10,0) NOT NULL DEFAULT 0 CHECK (movilizacion_dia >= 0),
  otros_dia        NUMERIC(10,0) NOT NULL DEFAULT 0 CHECK (otros_dia >= 0),
  -- Externo: lo que se le paga líquido por jornada y si da boleta de honorarios.
  valor_jornada    NUMERIC(12,0) NOT NULL DEFAULT 0 CHECK (valor_jornada >= 0),
  honorarios       BOOLEAN NOT NULL DEFAULT TRUE,
  nota             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.trabajadores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trabajadores FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trabajadores TO authenticated;
-- Los sueldos solo los ve quien paga o configura; los demás eligen a la persona con trabajadores_para_registrar().
DROP POLICY IF EXISTS trabajadores_todo ON public.trabajadores;
CREATE POLICY trabajadores_todo ON public.trabajadores FOR ALL TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['gastos.aprobar','configuracion.gestionar'])))
  WITH CHECK ((SELECT public.tiene_alguno(ARRAY['gastos.aprobar','configuracion.gestionar'])));
DROP TRIGGER IF EXISTS trg_trabajadores_updated ON public.trabajadores;
CREATE TRIGGER trg_trabajadores_updated BEFORE UPDATE ON public.trabajadores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Al día: las fichas de la primera versión de esta fase guardaban el sueldo bruto; ahora se guarda
-- el líquido y los descuentos de cada uno (el bruto se calcula).
ALTER TABLE public.trabajadores ADD COLUMN IF NOT EXISTS sueldo_liquido NUMERIC(12,0) NOT NULL DEFAULT 0 CHECK (sueldo_liquido >= 0);
ALTER TABLE public.trabajadores ADD COLUMN IF NOT EXISTS afp_pct NUMERIC(5,2) NOT NULL DEFAULT 11.5 CHECK (afp_pct >= 0);
ALTER TABLE public.trabajadores ADD COLUMN IF NOT EXISTS salud_pct NUMERIC(5,2) NOT NULL DEFAULT 7 CHECK (salud_pct >= 0);
ALTER TABLE public.trabajadores ADD COLUMN IF NOT EXISTS cesantia_pct NUMERIC(5,2) NOT NULL DEFAULT 0.6 CHECK (cesantia_pct >= 0);
ALTER TABLE public.trabajadores ADD COLUMN IF NOT EXISTS otros_descuentos NUMERIC(12,0) NOT NULL DEFAULT 0 CHECK (otros_descuentos >= 0);
ALTER TABLE public.trabajadores DROP COLUMN IF EXISTS sueldo_bruto;
ALTER TABLE public.trabajadores DROP CONSTRAINT IF EXISTS trabajadores_descuentos_check;
ALTER TABLE public.trabajadores ADD CONSTRAINT trabajadores_descuentos_check CHECK (afp_pct + salud_pct + cesantia_pct < 100);

/** Sueldo bruto del interno: su líquido más sus descuentos. */
CREATE OR REPLACE FUNCTION public.trabajador_sueldo_bruto(t public.trabajadores)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT round((t.sueldo_liquido + t.otros_descuentos) / (1 - (t.afp_pct + t.salud_pct + t.cesantia_pct) / 100));
$$;

/** Costo de un día del interno (en pesos). */
CREATE OR REPLACE FUNCTION public.trabajador_costo_dia(t public.trabajadores)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT round(public.trabajador_sueldo_bruto(t) * (1 + t.aportes_pct / 100) / t.dias_mes + t.colacion_dia + t.movilizacion_dia + t.otros_dia);
$$;

/** Quién es «yo» en el equipo (la ficha ligada a mi cuenta). */
CREATE OR REPLACE FUNCTION public.mi_trabajador()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.trabajadores WHERE usuario_id = auth.uid() AND activo;
$$;
GRANT EXECUTE ON FUNCTION public.mi_trabajador() TO authenticated;

/** El equipo para registrar mano de obra, sin los sueldos. El costo solo para quien ve costos;
 *  quien no registra para otros solo se ve a sí mismo. */
CREATE OR REPLACE FUNCTION public.trabajadores_para_registrar()
RETURNS TABLE (id UUID, tipo TEXT, nombre TEXT, oficio TEXT, horas_dia NUMERIC, valor_jornada NUMERIC, honorarios BOOLEAN,
               es_yo BOOLEAN, costo_dia NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.tipo, t.nombre, t.oficio, t.horas_dia, t.valor_jornada, t.honorarios, t.usuario_id = auth.uid(),
         CASE WHEN public.tiene_alguno(ARRAY['cotizaciones.ver_costos','gastos.aprobar']) AND t.tipo = 'interno'
              THEN public.trabajador_costo_dia(t) END
  FROM public.trabajadores t
  WHERE t.activo AND (t.usuario_id = auth.uid() OR public.tiene_alguno(ARRAY['gastos.aprobar','cotizaciones.crear']))
  ORDER BY t.tipo, t.nombre;
$$;
GRANT EXECUTE ON FUNCTION public.trabajadores_para_registrar() TO authenticated;

-- ─── 4. Mano de obra de cada trabajo, día a día ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.mano_obra (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cotizacion_id UUID REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  proyecto_id   UUID REFERENCES public.proyectos(id) ON DELETE CASCADE,
  partida_id    TEXT,
  fecha         DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'America/Santiago')::DATE),
  trabajador_id UUID REFERENCES public.trabajadores(id) ON DELETE SET NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('interno','externo')),
  nombre        TEXT NOT NULL DEFAULT '',     -- el de la ficha al registrar (o un externo sin ficha)
  horas         NUMERIC(5,2) CHECK (horas > 0 AND horas <= 24),   -- interno
  monto_liquido NUMERIC(12,0) CHECK (monto_liquido >= 0),         -- externo: lo que se le paga en mano
  honorarios    BOOLEAN NOT NULL DEFAULT FALSE,                   -- externo con boleta de honorarios
  retencion_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  costo         NUMERIC(12,0) NOT NULL DEFAULT 0,                 -- lo que suma al costo real (lo calcula la base)
  pagado        BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_pago    DATE,
  documento     TEXT,                                             -- N° de la boleta de honorarios
  nota          TEXT,
  created_by    UUID DEFAULT auth.uid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cotizacion_id IS NOT NULL OR proyecto_id IS NOT NULL),
  CHECK ((tipo = 'interno' AND horas IS NOT NULL) OR (tipo = 'externo' AND monto_liquido IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_mano_obra_cot ON public.mano_obra(cotizacion_id, fecha);
CREATE INDEX IF NOT EXISTS idx_mano_obra_trabajador ON public.mano_obra(trabajador_id, fecha DESC);
ALTER TABLE public.mano_obra ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mano_obra FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mano_obra TO authenticated;
DROP POLICY IF EXISTS mano_obra_ver ON public.mano_obra;
CREATE POLICY mano_obra_ver ON public.mano_obra FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['cotizaciones.ver_costos','gastos.aprobar','gastos.ver_todos']))
         OR trabajador_id = (SELECT public.mi_trabajador()));
DROP POLICY IF EXISTS mano_obra_crear ON public.mano_obra;
CREATE POLICY mano_obra_crear ON public.mano_obra FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_alguno(ARRAY['gastos.aprobar','cotizaciones.crear']))
              OR (trabajador_id = (SELECT public.mi_trabajador()) AND tipo = 'interno' AND NOT pagado));
DROP POLICY IF EXISTS mano_obra_cambiar ON public.mano_obra;
CREATE POLICY mano_obra_cambiar ON public.mano_obra FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['gastos.aprobar','cotizaciones.crear']))
         OR (trabajador_id = (SELECT public.mi_trabajador()) AND NOT pagado AND created_at > NOW() - INTERVAL '7 days'));
DROP POLICY IF EXISTS mano_obra_eliminar ON public.mano_obra;
CREATE POLICY mano_obra_eliminar ON public.mano_obra FOR DELETE TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['gastos.aprobar','cotizaciones.crear']))
         OR (trabajador_id = (SELECT public.mi_trabajador()) AND NOT pagado AND created_at > NOW() - INTERVAL '7 days'));

-- El costo: interno = costo del día × horas ÷ horas de su jornada; externo = lo líquido, o con
-- boleta de honorarios lo bruto (líquido ÷ (1 − retención)). Se calcula al registrar o al cambiar
-- las horas, el monto, la persona o la boleta; si no, queda como estaba.
CREATE OR REPLACE FUNCTION public.mano_obra_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.trabajadores;
BEGIN
  NEW.pagado := COALESCE(NEW.pagado, FALSE); NEW.honorarios := COALESCE(NEW.honorarios, FALSE);
  IF NEW.cotizacion_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.cotizacion_id IS DISTINCT FROM OLD.cotizacion_id)
     AND NOT EXISTS (SELECT 1 FROM public.cotizaciones WHERE id = NEW.cotizacion_id AND estado = 'Aprobada') THEN
    RAISE EXCEPTION 'La mano de obra va en una cotización aprobada (un trabajo).' USING ERRCODE = '23514';
  END IF;
  IF NEW.trabajador_id IS NOT NULL THEN
    SELECT * INTO t FROM public.trabajadores WHERE id = NEW.trabajador_id;
    IF FOUND THEN NEW.tipo := t.tipo; NEW.nombre := t.nombre; END IF;
  END IF;
  IF NEW.tipo = 'interno' AND t.id IS NULL THEN
    RAISE EXCEPTION 'Elige a la persona del equipo (las horas internas salen de su ficha).' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(trim(NEW.nombre), '') = '' THEN
    RAISE EXCEPTION 'Indica a quién se le paga.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.horas IS DISTINCT FROM OLD.horas OR NEW.monto_liquido IS DISTINCT FROM OLD.monto_liquido
     OR NEW.honorarios IS DISTINCT FROM OLD.honorarios OR NEW.trabajador_id IS DISTINCT FROM OLD.trabajador_id THEN
    IF NEW.tipo = 'interno' THEN
      NEW.monto_liquido := NULL; NEW.honorarios := FALSE; NEW.retencion_pct := 0;
      NEW.costo := round(public.trabajador_costo_dia(t) * NEW.horas / t.horas_dia);
    ELSE
      NEW.horas := NULL;
      NEW.retencion_pct := CASE WHEN NEW.honorarios
        THEN COALESCE((SELECT retencion_honorarios FROM public.ajustes_cotizacion WHERE id = 1), 15.25) ELSE 0 END;
      NEW.costo := round(NEW.monto_liquido / (1 - NEW.retencion_pct / 100));
    END IF;
  END IF;
  IF NEW.pagado THEN NEW.fecha_pago := COALESCE(NEW.fecha_pago, (NOW() AT TIME ZONE 'America/Santiago')::DATE);
  ELSE NEW.fecha_pago := NULL; END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.mano_obra_reglas() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_mano_obra_reglas ON public.mano_obra;
CREATE TRIGGER trg_mano_obra_reglas BEFORE INSERT OR UPDATE ON public.mano_obra
  FOR EACH ROW EXECUTE FUNCTION public.mano_obra_reglas();

-- ─── 5. Resultado del trabajo: la mano de obra al final ──────────────────────
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
  COALESCE((SELECT SUM(h.horas * h.costo_hora) FROM public.horas_trabajo h WHERE h.cotizacion_id = c.id), 0) AS costo_horas,
  COALESCE((SELECT SUM(m.costo) FROM public.mano_obra m WHERE m.cotizacion_id = c.id), 0) AS mano_obra
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
            WHERE h.proyecto_id = p.id OR h.cotizacion_id IN (SELECT id FROM public.cotizaciones WHERE proyecto_id = p.id)), 0) AS costo_horas,
  COALESCE((SELECT SUM(m.costo) FROM public.mano_obra m
            WHERE m.proyecto_id = p.id OR m.cotizacion_id IN (SELECT id FROM public.cotizaciones WHERE proyecto_id = p.id)), 0) AS mano_obra
FROM public.proyectos p;
GRANT SELECT ON public.proyecto_resumen TO authenticated;

-- ─── 6. Aprobar fijando el primer pago ───────────────────────────────────────
-- Igual que cot_aprobar, pero con el primer pago en pesos: el hito «al aprobar» pasa a ser ese
-- monto (en %) y los demás se reparten lo que queda en su misma proporción (si no hay, un «Saldo»
-- al terminar). El cobro nace exacto en Por facturar. Sin primer pago (NULL): como siempre.
CREATE OR REPLACE FUNCTION public.cot_aprobar_con_anticipo(p_id UUID, p_como TEXT, p_documento TEXT DEFAULT NULL,
                                                         p_motivo TEXT DEFAULT NULL, p_anticipo NUMERIC DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cotizaciones; v_plan JSONB; v_total NUMERIC; v_pct NUMERIC; v_resto NUMERIC; v_nombre TEXT; v_nuevo JSONB;
BEGIN
  IF p_anticipo IS NOT NULL THEN
    IF NOT public.tiene_permiso('cotizaciones.aprobar') THEN
      RAISE EXCEPTION 'No tienes permiso para anotar la respuesta del cliente.' USING ERRCODE = '42501';
    END IF;
    c := public._cot_get(p_id);
    IF c.estado <> 'Enviada' THEN RAISE EXCEPTION 'Solo se aprueba una cotización enviada.' USING ERRCODE = '23514'; END IF;
    v_total := COALESCE(c.total_clp, c.total, 0);
    IF p_anticipo < 0 OR p_anticipo > v_total THEN
      RAISE EXCEPTION 'El primer pago va entre $0 y el total de la cotización.' USING ERRCODE = '23514';
    END IF;
    v_plan := public._plan_cobro(c);
    v_pct := CASE WHEN v_total > 0 THEN round(p_anticipo, 0) * 100 / v_total ELSE 0 END;
    SELECT x->>'nombre' INTO v_nombre FROM jsonb_array_elements(v_plan) x WHERE x->>'cuando' = 'aprobar' LIMIT 1;
    SELECT COALESCE(SUM((x->>'porcentaje')::NUMERIC), 0) INTO v_resto FROM jsonb_array_elements(v_plan) x WHERE x->>'cuando' IS DISTINCT FROM 'aprobar';
    v_nuevo := CASE WHEN v_pct > 0 THEN jsonb_build_array(jsonb_build_object('nombre', COALESCE(v_nombre, 'Anticipo'), 'porcentaje', v_pct, 'cuando', 'aprobar'))
                    ELSE '[]'::JSONB END;
    IF v_pct < 100 THEN
      IF v_resto > 0 THEN
        v_nuevo := v_nuevo || (SELECT jsonb_agg(jsonb_build_object('nombre', x->>'nombre', 'porcentaje', (x->>'porcentaje')::NUMERIC * (100 - v_pct) / v_resto,
                                                                   'cuando', x->>'cuando') ORDER BY n)
                               FROM jsonb_array_elements(v_plan) WITH ORDINALITY AS e(x, n) WHERE x->>'cuando' IS DISTINCT FROM 'aprobar');
      ELSE
        v_nuevo := v_nuevo || jsonb_build_array(jsonb_build_object('nombre', 'Saldo', 'porcentaje', 100 - v_pct, 'cuando', 'terminar'));
      END IF;
    END IF;
    PERFORM public._cot_transicion(NULL);
    UPDATE public.cotizaciones SET plan_cobro = v_nuevo WHERE id = c.id;
  END IF;
  PERFORM public.cot_aprobar(p_id, p_como, p_documento, p_motivo);
END $$;
GRANT EXECUTE ON FUNCTION public.cot_aprobar_con_anticipo(UUID, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;
