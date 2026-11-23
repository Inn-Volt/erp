-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 22: análisis de proyecto (una sola pantalla de costos por trabajo)
-- El presupuesto de ejecución (fase 21) y lo real se miran en un solo lugar, por tipo de costo:
--   · Mano de obra POR DÍA: la línea del presupuesto es personas × días × valor del día
--     (cantidad = personas × días; «personas» solo se muestra; el total sigue siendo
--     cantidad × costo_unitario).
--   · Servicios POR HORA (ingeniería, planos, ejecución…): horas × valor de la hora.
--   · Tres modalidades de pago, en el presupuesto y en lo registrado:
--       interno  → el costo sale de su ficha (trabajador_costo_dia);
--       externo  → se ingresa lo líquido; con boleta de honorarios el costo suma la retención;
--       liquido  → el monto tal cual, sin descuentos ni retención (los socios cuando no reciben
--                  sueldo). Sirve para cualquier persona, con o sin ficha.
--   · Cada registro de mano de obra puede decir a qué línea del presupuesto va (del mismo
--     trabajo); si no dice partida, toma la de la línea. Si se borra la línea, el registro queda
--     en su partida.
--   · El técnico elige dónde cargar sus horas con presupuesto_para_asignar (sin costos) y solo
--     registra horas internas: no puede crear pagos a externos ni líquidos, ni convertir sus
--     horas en uno.
-- cotizacion_resultado y proyecto_resumen no cambian (siguen sumando mano_obra.costo).
-- Ejecutar DESPUÉS de la fase 21. Es idempotente. Es compatible con la app anterior: se puede
-- correr antes de publicar la versión nueva.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Presupuesto: personas y modalidad de pago ────────────────────────────
ALTER TABLE public.presupuesto_lineas ADD COLUMN IF NOT EXISTS personas NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (personas > 0);
ALTER TABLE public.presupuesto_lineas ADD COLUMN IF NOT EXISTS modalidad TEXT CHECK (modalidad IN ('interno','externo','liquido'));
ALTER TABLE public.presupuesto_lineas ADD COLUMN IF NOT EXISTS honorarios BOOLEAN NOT NULL DEFAULT FALSE;   -- externo con boleta
ALTER TABLE public.presupuesto_lineas ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(12,0) CHECK (valor_liquido >= 0);   -- externo o líquido: por día u hora

-- ─── 2. Mano de obra: pagos líquidos, servicios por hora y línea del presupuesto ─
ALTER TABLE public.mano_obra ADD COLUMN IF NOT EXISTS clase TEXT NOT NULL DEFAULT 'mano_obra' CHECK (clase IN ('mano_obra','servicio'));
ALTER TABLE public.mano_obra ADD COLUMN IF NOT EXISTS jornadas NUMERIC(6,2) CHECK (jornadas > 0);   -- días trabajados (mano de obra por día)
ALTER TABLE public.mano_obra ADD COLUMN IF NOT EXISTS presupuesto_linea_id UUID REFERENCES public.presupuesto_lineas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_mano_obra_linea ON public.mano_obra(presupuesto_linea_id) WHERE presupuesto_linea_id IS NOT NULL;

-- Los CHECK de la fase 20 sobre el tipo no tienen nombre: se buscan por su definición (los que
-- hablan del tipo y todavía no conocen «liquido») y se reemplazan por dos con nombre.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.mano_obra'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) LIKE '%tipo%' AND pg_get_constraintdef(oid) NOT LIKE '%liquido%'
  LOOP
    EXECUTE format('ALTER TABLE public.mano_obra DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.mano_obra DROP CONSTRAINT IF EXISTS mano_obra_tipo_valido;
ALTER TABLE public.mano_obra ADD CONSTRAINT mano_obra_tipo_valido CHECK (tipo IN ('interno','externo','liquido'));
ALTER TABLE public.mano_obra DROP CONSTRAINT IF EXISTS mano_obra_datos_tipo;
ALTER TABLE public.mano_obra ADD CONSTRAINT mano_obra_datos_tipo
  CHECK ((tipo = 'interno' AND (horas IS NOT NULL OR jornadas IS NOT NULL)) OR (tipo IN ('externo','liquido') AND monto_liquido IS NOT NULL));

-- ─── 3. El costo de cada registro (reemplaza el de la fase 20) ───────────────
--   interno con jornadas → costo del día × jornadas
--   interno con horas    → costo del día × horas ÷ horas de su jornada
--   externo              → lo líquido; con boleta de honorarios, líquido ÷ (1 − retención)
--   liquido              → lo líquido, tal cual
-- Se calcula al registrar o al cambiar horas, jornadas, monto, boleta, persona o tipo; si no, queda
-- como estaba (si después cambia el sueldo, lo ya registrado no cambia). Un pago líquido con ficha
-- no toma el tipo de la ficha (sí su nombre).
CREATE OR REPLACE FUNCTION public.mano_obra_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.trabajadores;
  l public.presupuesto_lineas;
  v_recalcular BOOLEAN;
BEGIN
  NEW.pagado := COALESCE(NEW.pagado, FALSE); NEW.honorarios := COALESCE(NEW.honorarios, FALSE);
  NEW.clase := COALESCE(NEW.clase, 'mano_obra');
  IF NEW.cotizacion_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.cotizacion_id IS DISTINCT FROM OLD.cotizacion_id)
     AND NOT EXISTS (SELECT 1 FROM public.cotizaciones WHERE id = NEW.cotizacion_id AND estado = 'Aprobada') THEN
    RAISE EXCEPTION 'La mano de obra va en una cotización aprobada (un trabajo).' USING ERRCODE = '23514';
  END IF;

  -- La línea del presupuesto: tiene que ser del mismo trabajo; da la partida (si no viene) y la clase.
  IF NEW.presupuesto_linea_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.presupuesto_linea_id IS DISTINCT FROM OLD.presupuesto_linea_id OR NEW.cotizacion_id IS DISTINCT FROM OLD.cotizacion_id) THEN
    SELECT * INTO l FROM public.presupuesto_lineas WHERE id = NEW.presupuesto_linea_id;
    IF NOT FOUND OR l.cotizacion_id IS DISTINCT FROM NEW.cotizacion_id THEN
      RAISE EXCEPTION 'Esa línea del presupuesto no es de este trabajo.' USING ERRCODE = '23514';
    END IF;
    NEW.partida_id := COALESCE(NEW.partida_id, l.partida_id);
    IF l.tipo IN ('mano_obra','servicio') THEN NEW.clase := l.tipo; END IF;
  END IF;

  IF NEW.trabajador_id IS NOT NULL THEN
    SELECT * INTO t FROM public.trabajadores WHERE id = NEW.trabajador_id;
    IF FOUND THEN
      NEW.nombre := t.nombre;
      IF NEW.tipo IS DISTINCT FROM 'liquido' THEN NEW.tipo := t.tipo; END IF;
    END IF;
  END IF;

  -- Quien no paga ni edita cotizaciones solo registra horas internas (las suyas: lo exige la RLS).
  -- Sin sesión (el servidor, las migraciones) no se revisa.
  IF auth.uid() IS NOT NULL AND NEW.tipo <> 'interno'
     AND NOT public.tiene_alguno(ARRAY['gastos.aprobar','cotizaciones.crear']) THEN
    RAISE EXCEPTION 'Solo quien paga registra pagos a externos o pagos líquidos.' USING ERRCODE = '42501';
  END IF;

  v_recalcular := TG_OP = 'INSERT' OR NEW.horas IS DISTINCT FROM OLD.horas OR NEW.jornadas IS DISTINCT FROM OLD.jornadas
    OR NEW.monto_liquido IS DISTINCT FROM OLD.monto_liquido OR NEW.honorarios IS DISTINCT FROM OLD.honorarios
    OR NEW.trabajador_id IS DISTINCT FROM OLD.trabajador_id OR NEW.tipo IS DISTINCT FROM OLD.tipo;
  IF v_recalcular AND NEW.tipo = 'interno' AND t.id IS NULL THEN
    RAISE EXCEPTION 'Elige a la persona del equipo (las horas internas salen de su ficha).' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(trim(NEW.nombre), '') = '' THEN
    RAISE EXCEPTION 'Indica a quién se le paga.' USING ERRCODE = '23514';
  END IF;

  IF v_recalcular THEN
    IF NEW.tipo = 'interno' THEN
      NEW.monto_liquido := NULL; NEW.honorarios := FALSE; NEW.retencion_pct := 0;
      NEW.costo := CASE WHEN NEW.jornadas IS NOT NULL THEN round(public.trabajador_costo_dia(t) * NEW.jornadas)
                        ELSE round(public.trabajador_costo_dia(t) * NEW.horas / t.horas_dia) END;
    ELSIF NEW.tipo = 'externo' THEN
      NEW.retencion_pct := CASE WHEN NEW.honorarios
        THEN COALESCE((SELECT retencion_honorarios FROM public.ajustes_cotizacion WHERE id = 1), 15.25) ELSE 0 END;
      NEW.costo := round(NEW.monto_liquido / (1 - NEW.retencion_pct / 100));
    ELSE
      NEW.honorarios := FALSE; NEW.retencion_pct := 0;
      NEW.costo := round(NEW.monto_liquido);
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

-- ─── 4. Las líneas del presupuesto sin costos ────────────────────────────────
-- Para asignar lo comprado (quien rinde o ingresa compras) y para que el técnico elija dónde cargar
-- sus horas (quien tiene ficha en el equipo). Cambia lo que devuelve: se borra y se vuelve a crear.
DROP FUNCTION IF EXISTS public.presupuesto_para_asignar(UUID);
CREATE FUNCTION public.presupuesto_para_asignar(p_cot UUID)
RETURNS TABLE (id UUID, partida_id TEXT, tipo TEXT, descripcion TEXT, unidad TEXT, cantidad NUMERIC, personas NUMERIC, trabajador_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.partida_id, l.tipo, l.descripcion, l.unidad, l.cantidad, l.personas, l.trabajador_id
  FROM public.presupuesto_lineas l
  WHERE l.cotizacion_id = p_cot
    AND (public.tiene_alguno(ARRAY['gastos.crear','gastos.aprobar','compras.gestionar','cotizaciones.ver_costos'])
         OR public.mi_trabajador() IS NOT NULL)
  ORDER BY l.partida_id NULLS LAST, l.orden, l.descripcion;
$$;
GRANT EXECUTE ON FUNCTION public.presupuesto_para_asignar(UUID) TO authenticated;
