-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 19: fondos por persona (las «Rendiciones 2.0» de TecApp)
-- La plata que entrega la empresa ya no es un anticipo suelto: va al FONDO de la persona, que
-- sigue vivo entre trabajos y días. Cada gasto dice «¿con qué pagaste?»: sale del fondo y, si no
-- alcanza, el resto lo puso la persona y se le debe. Ningún fondo queda negativo.
--   · Movimientos (no se editan, se revierten con motivo): entrega (+ fondo), devolución (− fondo;
--     la declara la persona con su comprobante y la confirma quien paga, o la registra quien paga),
--     pago (lo que se le debía, por transferencia), compensación (lo que se le debía, descontado de
--     su fondo) y reversa (deshace otro, con motivo).
--   · Gastos: la boleta es obligatoria salvo «no me dieron boleta»; quien paga puede «observar» un
--     gasto (con motivo): no se paga hasta que la persona lo corrige. Sigue sin aprobar ni rechazar.
--   · Tarjeta de la empresa: solo quien paga las rendiciones (gastos.aprobar); no toca ningún fondo.
-- Lo de antes pasa solo, sin cambiar ningún saldo: cada anticipo no anulado es una entrega, cada
-- gasto toma del fondo lo que alcanza (por persona, del más antiguo al más nuevo) y lo ya
-- reembolsado queda como pagado.
-- Ejecutar DESPUÉS de las fases anteriores. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Movimientos del fondo ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fondo_movimientos (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  folio            SERIAL UNIQUE,
  usuario_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,   -- la persona del fondo
  tipo             TEXT NOT NULL CHECK (tipo IN ('entrega','devolucion','pago','compensacion','reversa')),
  monto            NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha            DATE NOT NULL DEFAULT CURRENT_DATE,
  estado           TEXT NOT NULL DEFAULT 'confirmado' CHECK (estado IN ('confirmado','por_confirmar','descartado')),
  nota             TEXT,                 -- para qué, N° de operación…
  motivo           TEXT,                 -- de la reversa, del descarte o de la devolución recibida en mano
  comprobante_path TEXT,
  revierte_id      UUID REFERENCES public.fondo_movimientos(id),
  revertido        BOOLEAN NOT NULL DEFAULT FALSE,
  anticipo_id      UUID REFERENCES public.anticipos(id) ON DELETE SET NULL,          -- de qué anticipo vino (lo de antes)
  creado_por       UUID DEFAULT auth.uid(),
  confirmado_por   UUID,
  confirmado_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fondo_mov_usuario ON public.fondo_movimientos(usuario_id, fecha DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fondo_reversa ON public.fondo_movimientos(revierte_id) WHERE revierte_id IS NOT NULL;
ALTER TABLE public.fondo_movimientos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fondo_movimientos FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.fondo_movimientos TO authenticated;
GRANT USAGE ON SEQUENCE public.fondo_movimientos_folio_seq TO authenticated;

DROP POLICY IF EXISTS fondo_mov_ver ON public.fondo_movimientos;
CREATE POLICY fondo_mov_ver ON public.fondo_movimientos FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()) OR (SELECT public.tiene_alguno(ARRAY['gastos.ver_todos','gastos.aprobar'])));
DROP POLICY IF EXISTS fondo_mov_crear ON public.fondo_movimientos;
CREATE POLICY fondo_mov_crear ON public.fondo_movimientos FOR INSERT TO authenticated
  WITH CHECK ((usuario_id = (SELECT auth.uid()) AND tipo = 'devolucion') OR (SELECT public.tiene_permiso('gastos.aprobar')));
DROP POLICY IF EXISTS fondo_mov_cambiar ON public.fondo_movimientos;
CREATE POLICY fondo_mov_cambiar ON public.fondo_movimientos FOR UPDATE TO authenticated
  USING (usuario_id = (SELECT auth.uid()) OR (SELECT public.tiene_permiso('gastos.aprobar')));

-- ─── 2. Gastos: con qué se pagó, boleta obligatoria y «observado» ────────────
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS pagado_con   TEXT;           -- fondo | mixto | propio | empresa
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS monto_fondo  NUMERIC(12,2);  -- lo que salió del fondo
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS monto_propio NUMERIC(12,2);  -- lo que puso la persona (se le debe)
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS sin_boleta   BOOLEAN NOT NULL DEFAULT FALSE;
DO $$ BEGIN
  ALTER TABLE public.gastos ADD CONSTRAINT gastos_pagado_con_check CHECK (pagado_con IS NULL OR pagado_con IN ('fondo','mixto','propio','empresa'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS gastos_estado_check;
ALTER TABLE public.gastos ADD CONSTRAINT gastos_estado_check CHECK (estado IN ('rendido','reembolsado','rechazado','observado'));

-- La persona corrige lo observado (y borra lo suyo mientras no esté pagado).
DROP POLICY IF EXISTS gastos_editar ON public.gastos;
CREATE POLICY gastos_editar ON public.gastos FOR UPDATE TO authenticated
  USING ((usuario_id = (SELECT auth.uid()) AND estado IN ('rendido','observado')) OR (SELECT public.tiene_permiso('gastos.aprobar')));
DROP POLICY IF EXISTS gastos_eliminar ON public.gastos;
CREATE POLICY gastos_eliminar ON public.gastos FOR DELETE TO authenticated
  USING (usuario_id = (SELECT auth.uid()) AND estado IN ('rendido','observado'));

-- ─── 3. Las cuentas de una persona ───────────────────────────────────────────
-- en_fondo   = entregas − devoluciones − compensaciones (confirmadas, con sus reversas) − lo gastado del fondo
-- disponible = en_fondo − las devoluciones por confirmar (quedan reservadas)
-- debemos    = lo que puso de su bolsillo (sin lo observado) − pagos − compensaciones
-- en_revision = lo que puso de su bolsillo en gastos observados (se paga al corregirlos)
CREATE OR REPLACE FUNCTION public.fondo_cuentas(p_uid UUID)
RETURNS TABLE (en_fondo NUMERIC, disponible NUMERIC, por_confirmar NUMERIC, debemos NUMERIC, en_revision NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH m AS (
    SELECT x.monto, x.estado, x.tipo,
           CASE WHEN x.tipo = 'reversa' THEN -1 ELSE 1 END AS signo, COALESCE(r.tipo, x.tipo) AS clase
    FROM public.fondo_movimientos x LEFT JOIN public.fondo_movimientos r ON r.id = x.revierte_id
    WHERE x.usuario_id = p_uid AND x.estado <> 'descartado'
  ), mov AS (
    SELECT
      COALESCE(SUM(CASE WHEN estado = 'confirmado' THEN signo * CASE clase WHEN 'entrega' THEN monto WHEN 'devolucion' THEN -monto WHEN 'compensacion' THEN -monto ELSE 0 END END), 0) AS fondo,
      COALESCE(SUM(CASE WHEN estado = 'confirmado' THEN signo * CASE clase WHEN 'pago' THEN -monto WHEN 'compensacion' THEN -monto ELSE 0 END END), 0) AS deuda,
      COALESCE(SUM(CASE WHEN estado = 'por_confirmar' AND tipo = 'devolucion' THEN monto END), 0) AS reservado
    FROM m
  ), g AS (
    SELECT COALESCE(SUM(COALESCE(monto_fondo, 0)), 0) AS del_fondo,
           COALESCE(SUM(CASE WHEN estado <> 'observado' THEN COALESCE(monto_propio, 0) END), 0) AS propio,
           COALESCE(SUM(CASE WHEN estado = 'observado' THEN COALESCE(monto_propio, 0) END), 0) AS observado
    FROM public.gastos WHERE usuario_id = p_uid AND estado <> 'rechazado'
  )
  SELECT mov.fondo - g.del_fondo, mov.fondo - g.del_fondo - mov.reservado, mov.reservado,
         GREATEST(g.propio + mov.deuda, 0), g.observado
  FROM mov, g;
$$;
REVOKE EXECUTE ON FUNCTION public.fondo_cuentas(UUID) FROM PUBLIC, anon, authenticated;

-- Para la pantalla: lo propio, o el de cualquiera si ve todas las rendiciones.
CREATE OR REPLACE FUNCTION public.fondo_situacion(p_uid UUID DEFAULT NULL)
RETURNS TABLE (usuario_id UUID, en_fondo NUMERIC, disponible NUMERIC, por_confirmar NUMERIC, debemos NUMERIC, en_revision NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := COALESCE(p_uid, auth.uid());
BEGIN
  IF v_uid IS DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL AND NOT public.tiene_alguno(ARRAY['gastos.ver_todos','gastos.aprobar']) THEN
    RAISE EXCEPTION 'Solo ves tu propio fondo.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT v_uid, c.* FROM public.fondo_cuentas(v_uid) c;
END $$;
GRANT EXECUTE ON FUNCTION public.fondo_situacion(UUID) TO authenticated;

-- Todo el equipo (quien ve todas las rendiciones): una fila por persona con fondo o deuda.
CREATE OR REPLACE FUNCTION public.fondos_equipo()
RETURNS TABLE (usuario_id UUID, en_fondo NUMERIC, disponible NUMERIC, por_confirmar NUMERIC, debemos NUMERIC, en_revision NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.tiene_alguno(ARRAY['gastos.ver_todos','gastos.aprobar']) THEN
    RAISE EXCEPTION 'Solo para quien ve todas las rendiciones.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, c.* FROM public.profiles p, LATERAL public.fondo_cuentas(p.id) c
  WHERE EXISTS (SELECT 1 FROM public.fondo_movimientos m WHERE m.usuario_id = p.id)
     OR EXISTS (SELECT 1 FROM public.gastos g WHERE g.usuario_id = p.id AND COALESCE(g.monto_propio, 0) > 0 AND g.estado <> 'rechazado');
END $$;
GRANT EXECUTE ON FUNCTION public.fondos_equipo() TO authenticated;

-- ─── 4. Reglas de los movimientos ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fondo_movimientos_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; o public.fondo_movimientos; v_paga BOOLEAN; v_efecto NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;           -- la migración y el servidor
  v_paga := public.tiene_permiso('gastos.aprobar');
  -- Todo lo que mueve la plata de una persona, de a uno.
  PERFORM pg_advisory_xact_lock(hashtext('fondo:' || NEW.usuario_id::TEXT));

  IF TG_OP = 'UPDATE' THEN
    IF current_setting('innvolt.fondo_reversa', true) = 'on' AND NEW.revertido AND NOT OLD.revertido THEN RETURN NEW; END IF;
    IF NEW.monto IS DISTINCT FROM OLD.monto OR NEW.tipo IS DISTINCT FROM OLD.tipo OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
       OR NEW.fecha IS DISTINCT FROM OLD.fecha OR NEW.revierte_id IS DISTINCT FROM OLD.revierte_id OR NEW.revertido IS DISTINCT FROM OLD.revertido
       OR OLD.estado <> 'por_confirmar' OR NEW.estado = 'por_confirmar' THEN
      RAISE EXCEPTION 'Los movimientos del fondo no se editan: se revierten, con motivo.' USING ERRCODE = '42501';
    END IF;
    -- Una devolución declarada: la confirma o la descarta quien paga; quien la declaró puede retirarla.
    IF NEW.estado = 'confirmado' AND NOT v_paga THEN
      RAISE EXCEPTION 'Solo quien paga las rendiciones confirma una devolución.' USING ERRCODE = '42501';
    END IF;
    IF NEW.estado = 'descartado' AND NOT v_paga AND OLD.usuario_id <> auth.uid() THEN
      RAISE EXCEPTION 'Solo quien paga las rendiciones descarta una devolución.' USING ERRCODE = '42501';
    END IF;
    IF NEW.estado = 'descartado' AND v_paga AND OLD.usuario_id <> auth.uid() AND COALESCE(trim(NEW.motivo), '') = '' THEN
      RAISE EXCEPTION 'Di por qué no llegó la devolución.' USING ERRCODE = '23514';
    END IF;
    NEW.confirmado_por := auth.uid(); NEW.confirmado_at := NOW();
    RETURN NEW;
  END IF;

  -- INSERT
  NEW.creado_por := auth.uid(); NEW.revertido := FALSE; NEW.anticipo_id := NULL;
  SELECT * INTO c FROM public.fondo_cuentas(NEW.usuario_id);
  IF NEW.tipo = 'devolucion' THEN
    IF NEW.monto > c.disponible THEN
      RAISE EXCEPTION 'La devolución pasa lo disponible del fondo (%).', to_char(c.disponible, 'FM$999G999G999') USING ERRCODE = '23514';
    END IF;
    IF v_paga AND NEW.estado IS DISTINCT FROM 'por_confirmar' THEN
      -- La recibe quien paga (en mano o la vio en la cuenta): queda confirmada, con motivo.
      IF COALESCE(trim(NEW.motivo), '') = '' THEN RAISE EXCEPTION 'Di cómo se recibió la devolución.' USING ERRCODE = '23514'; END IF;
      NEW.estado := 'confirmado'; NEW.confirmado_por := auth.uid(); NEW.confirmado_at := NOW();
    ELSE
      IF NEW.usuario_id <> auth.uid() THEN RAISE EXCEPTION 'Solo declaras devoluciones de tu propio fondo.' USING ERRCODE = '42501'; END IF;
      IF COALESCE(NEW.comprobante_path, '') = '' THEN RAISE EXCEPTION 'Adjunta el comprobante de la devolución.' USING ERRCODE = '23514'; END IF;
      NEW.estado := 'por_confirmar'; NEW.confirmado_por := NULL; NEW.confirmado_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT v_paga THEN RAISE EXCEPTION 'Solo quien paga las rendiciones mueve el fondo de una persona.' USING ERRCODE = '42501'; END IF;
  NEW.estado := 'confirmado'; NEW.confirmado_por := auth.uid(); NEW.confirmado_at := NOW();
  IF NEW.tipo = 'pago' AND NEW.monto > c.debemos THEN
    RAISE EXCEPTION 'El pago pasa lo que se le debe (%).', to_char(c.debemos, 'FM$999G999G999') USING ERRCODE = '23514';
  ELSIF NEW.tipo = 'compensacion' AND NEW.monto > LEAST(c.debemos, c.disponible) THEN
    RAISE EXCEPTION 'Para descontarlo del fondo, el monto no puede pasar lo que se le debe ni lo disponible (%).',
      to_char(LEAST(c.debemos, c.disponible), 'FM$999G999G999') USING ERRCODE = '23514';
  ELSIF NEW.tipo = 'reversa' THEN
    SELECT * INTO o FROM public.fondo_movimientos WHERE id = NEW.revierte_id FOR UPDATE;
    IF NOT FOUND OR o.usuario_id <> NEW.usuario_id THEN RAISE EXCEPTION 'No existe el movimiento a revertir.' USING ERRCODE = '23514'; END IF;
    IF o.tipo = 'reversa' OR o.revertido OR o.estado <> 'confirmado' THEN
      RAISE EXCEPTION 'Ese movimiento no se puede revertir (ya revertido, por confirmar o es una reversa).' USING ERRCODE = '23514';
    END IF;
    IF COALESCE(trim(NEW.motivo), '') = '' THEN RAISE EXCEPTION 'Di por qué se revierte.' USING ERRCODE = '23514'; END IF;
    NEW.monto := o.monto;
    -- Lo que la reversa le quita al fondo no puede dejarlo negativo.
    v_efecto := CASE o.tipo WHEN 'entrega' THEN -o.monto WHEN 'devolucion' THEN o.monto WHEN 'compensacion' THEN o.monto ELSE 0 END;
    IF c.disponible + v_efecto < 0 THEN
      RAISE EXCEPTION 'Revertirlo dejaría el fondo en negativo (disponible %).', to_char(c.disponible, 'FM$999G999G999') USING ERRCODE = '23514';
    END IF;
    PERFORM set_config('innvolt.fondo_reversa', 'on', true);
    UPDATE public.fondo_movimientos SET revertido = TRUE WHERE id = o.id;
    PERFORM set_config('innvolt.fondo_reversa', 'off', true);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fondo_movimientos_reglas ON public.fondo_movimientos;
CREATE TRIGGER trg_fondo_movimientos_reglas BEFORE INSERT OR UPDATE ON public.fondo_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.fondo_movimientos_reglas();

-- Pagado lo que se le debía: sus gastos quedan «reembolsados»; y los avisos.
CREATE OR REPLACE FUNCTION public.fondo_movimientos_despues()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_quien TEXT; v_m TEXT := to_char(NEW.monto, 'FM$999G999G999'); c RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(nombre, email) INTO v_quien FROM public.profiles WHERE id = NEW.usuario_id;
  IF TG_OP = 'INSERT' THEN
    IF NEW.tipo IN ('pago','compensacion') THEN
      SELECT * INTO c FROM public.fondo_cuentas(NEW.usuario_id);
      IF c.debemos <= 0 THEN
        PERFORM set_config('innvolt.pago_fondo', 'on', true);
        UPDATE public.gastos SET estado = 'reembolsado'
        WHERE usuario_id = NEW.usuario_id AND estado = 'rendido' AND COALESCE(monto_propio, 0) > 0;
        PERFORM set_config('innvolt.pago_fondo', 'off', true);
      END IF;
    END IF;
    IF NEW.tipo = 'entrega' THEN
      PERFORM public.notificar_usuario(NEW.usuario_id, 'fondo_entrega', 'Te entregaron ' || v_m || ' para tu fondo', COALESCE(NEW.nota, 'Para los gastos del día a día'), '/gastos');
    ELSIF NEW.tipo = 'pago' THEN
      PERFORM public.notificar_usuario(NEW.usuario_id, 'fondo_pago', 'Te pagaron ' || v_m, 'Lo que pusiste de tu bolsillo' || COALESCE(' · ' || NEW.nota, ''), '/gastos');
    ELSIF NEW.tipo = 'compensacion' THEN
      PERFORM public.notificar_usuario(NEW.usuario_id, 'fondo_pago', 'Se descontó de tu fondo lo que se te debía (' || v_m || ')', COALESCE(NEW.nota, 'Queda pagado con lo que tenías en el fondo'), '/gastos');
    ELSIF NEW.tipo = 'devolucion' AND NEW.estado = 'por_confirmar' THEN
      PERFORM public.notificar('gastos.aprobar', 'fondo_devolucion', COALESCE(v_quien, 'Alguien') || ' declaró una devolución de ' || v_m, 'Confírmala cuando la veas en la cuenta', '/gastos');
    ELSIF NEW.tipo = 'reversa' THEN
      PERFORM public.notificar_usuario(NEW.usuario_id, 'fondo_reversa', 'Se revirtió un movimiento de tu fondo (' || v_m || ')', NEW.motivo, '/gastos');
    END IF;
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.tipo = 'devolucion' AND NEW.confirmado_por IS DISTINCT FROM NEW.usuario_id THEN
    PERFORM public.notificar_usuario(NEW.usuario_id, 'fondo_devolucion',
      CASE NEW.estado WHEN 'confirmado' THEN 'Se confirmó tu devolución de ' || v_m ELSE 'Tu devolución de ' || v_m || ' no llegó' END,
      COALESCE(NEW.motivo, 'Ya está fuera de tu fondo'), '/gastos');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_fondo_movimientos_despues ON public.fondo_movimientos;
CREATE TRIGGER trg_fondo_movimientos_despues AFTER INSERT OR UPDATE ON public.fondo_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.fondo_movimientos_despues();

-- ─── 5. Reglas de los gastos (las de la fase 7, más el fondo) ────────────────
CREATE OR REPLACE FUNCTION public.gastos_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; v_disp NUMERIC; v_paga BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  v_paga := public.tiene_permiso('gastos.aprobar');
  IF TG_OP = 'INSERT' THEN
    NEW.estado := 'rendido'; NEW.revisado_por := NULL; NEW.revisado_at := NULL; NEW.motivo_rechazo := NULL;
    -- La foto de la boleta, salvo que no la hayan dado.
    IF COALESCE(NEW.boleta_path, '') = '' AND NOT COALESCE(NEW.sin_boleta, FALSE) THEN
      RAISE EXCEPTION 'Agrega la foto de la boleta (o marca que no te la dieron).' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.cotizacion_id IS NULL AND NEW.proyecto_id IS NULL AND NEW.ot_id IS NULL THEN
    RAISE EXCEPTION 'Elige el trabajo (cotización aprobada) o el proyecto del gasto.' USING ERRCODE = '23514';
  END IF;
  IF NEW.cotizacion_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.cotizacion_id IS DISTINCT FROM OLD.cotizacion_id)
     AND NOT EXISTS (SELECT 1 FROM public.cotizaciones WHERE id = NEW.cotizacion_id AND estado = 'Aprobada') THEN
    RAISE EXCEPTION 'Los gastos van en una cotización aprobada (un trabajo).' USING ERRCODE = '23514';
  END IF;

  -- ¿Con qué se pagó? Del fondo lo que alcance; el resto lo puso la persona. La tarjeta de la empresa no toca el fondo.
  IF TG_OP = 'INSERT' OR NEW.monto IS DISTINCT FROM OLD.monto OR NEW.pagado_con IS DISTINCT FROM OLD.pagado_con THEN
    IF NEW.pagado_con = 'empresa' THEN
      IF NOT v_paga THEN RAISE EXCEPTION 'Solo quien paga las rendiciones usa la tarjeta de la empresa.' USING ERRCODE = '42501'; END IF;
      NEW.monto_fondo := 0; NEW.monto_propio := 0;
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('fondo:' || NEW.usuario_id::TEXT));
      SELECT * INTO c FROM public.fondo_cuentas(NEW.usuario_id);
      v_disp := GREATEST(c.disponible + CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.monto_fondo, 0) ELSE 0 END, 0);
      NEW.monto_fondo := LEAST(v_disp, NEW.monto);
      NEW.monto_propio := NEW.monto - NEW.monto_fondo;
      NEW.pagado_con := CASE WHEN NEW.monto_propio = 0 THEN 'fondo' WHEN NEW.monto_fondo = 0 THEN 'propio' ELSE 'mixto' END;
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado = 'observado' THEN
      IF NOT v_paga THEN RAISE EXCEPTION 'Solo quien paga las rendiciones observa un gasto.' USING ERRCODE = '42501'; END IF;
      IF OLD.estado <> 'rendido' THEN RAISE EXCEPTION 'Solo se observa un gasto rendido (no uno ya pagado).' USING ERRCODE = '23514'; END IF;
      IF COALESCE(trim(NEW.motivo_rechazo), '') = '' THEN RAISE EXCEPTION 'Di qué hay que corregir.' USING ERRCODE = '23514'; END IF;
      NEW.revisado_por := auth.uid(); NEW.revisado_at := NOW();
      PERFORM public.notificar_usuario(NEW.usuario_id, 'gasto_observado', 'Observaron un gasto tuyo (' || to_char(NEW.monto, 'FM$999G999G999') || ')',
        NEW.motivo_rechazo, '/gastos');
      RETURN NEW;
    END IF;
    IF NOT v_paga AND NOT (OLD.estado = 'observado' AND NEW.estado = 'rendido' AND OLD.usuario_id = auth.uid()) THEN
      RAISE EXCEPTION 'Solo quien paga las rendiciones marca un gasto como reembolsado.' USING ERRCODE = '42501';
    END IF;
    IF NEW.estado NOT IN ('rendido','reembolsado') THEN
      RAISE EXCEPTION 'Las rendiciones no se aprueban ni se rechazan: quedan rendidas, observadas o reembolsadas.' USING ERRCODE = '23514';
    END IF;
    NEW.revisado_por := auth.uid(); NEW.revisado_at := NOW();
    IF NEW.estado = 'reembolsado' AND COALESCE(current_setting('innvolt.pago_fondo', true), '') <> 'on' THEN
      PERFORM public.notificar_usuario(NEW.usuario_id, 'gasto_reembolsado', 'Te reembolsaron un gasto',
        to_char(NEW.monto, 'FM$999G999G999') || COALESCE(' · ' || NEW.descripcion, ''), '/gastos');
    END IF;
  ELSIF OLD.estado = 'observado' AND OLD.usuario_id = auth.uid() THEN
    -- La persona corrigió lo observado: vuelve a «rendido».
    NEW.estado := 'rendido'; NEW.motivo_rechazo := NULL;
  ELSIF OLD.estado NOT IN ('rendido','observado') AND NOT v_paga THEN
    RAISE EXCEPTION 'Un gasto ya reembolsado no se cambia.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_gastos_reglas ON public.gastos;
CREATE TRIGGER trg_gastos_reglas BEFORE INSERT OR UPDATE ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.gastos_reglas();

-- El aviso de un gasto rendido dice cuánto salió del fondo y cuánto puso.
CREATE OR REPLACE FUNCTION public.aviso_gasto_rendido()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_quien TEXT; v_donde TEXT;
BEGIN
  SELECT COALESCE(nombre, email) INTO v_quien FROM public.profiles WHERE id = NEW.usuario_id;
  SELECT COALESCE((SELECT 'IV-' || lpad(folio::TEXT, 4, '0') FROM public.cotizaciones WHERE id = NEW.cotizacion_id),
                  (SELECT 'PR-' || lpad(folio::TEXT, 4, '0') FROM public.proyectos WHERE id = NEW.proyecto_id), 'Sin trabajo') INTO v_donde;
  PERFORM public.notificar('gastos.aprobar', 'gasto_rendido', COALESCE(v_quien, 'Alguien') || ' rindió ' || to_char(NEW.monto, 'FM$999G999G999'),
    v_donde || COALESCE(' · ' || NEW.descripcion, '') || CASE NEW.pagado_con
      WHEN 'fondo' THEN ' · de su fondo' WHEN 'empresa' THEN ' · con la tarjeta de la empresa'
      WHEN 'mixto' THEN ' · puso ' || to_char(NEW.monto_propio, 'FM$999G999G999') || ' de su bolsillo'
      WHEN 'propio' THEN ' · lo puso de su bolsillo'
      ELSE CASE WHEN NEW.anticipo_id IS NOT NULL THEN ' · contra anticipo' ELSE '' END END
    || CASE WHEN NEW.sin_boleta THEN ' · sin boleta' ELSE '' END, '/gastos');
  RETURN NULL;
END $$;

-- ─── 6. Lo de antes pasa a fondos (una sola vez, sin cambiar ningún saldo) ───
DO $$
DECLARE p RECORD; g RECORD; v_resto NUMERIC; v_pagado NUMERIC; v_fecha DATE;
BEGIN
  IF EXISTS (SELECT 1 FROM public.fondo_movimientos) THEN RETURN; END IF;
  -- Cada anticipo no anulado es una entrega a su fondo.
  INSERT INTO public.fondo_movimientos (usuario_id, tipo, monto, fecha, nota, anticipo_id, creado_por, confirmado_por, confirmado_at, created_at)
  SELECT a.usuario_id, 'entrega', a.monto, a.fecha, COALESCE(a.motivo, 'Anticipo AN-' || lpad(a.folio::TEXT, 4, '0')), a.id,
         a.entregado_por, a.entregado_por, a.created_at, a.created_at
  FROM public.anticipos a WHERE a.estado <> 'anulado';
  -- Por persona, del más antiguo al más nuevo: cada gasto toma del fondo lo que alcance.
  FOR p IN SELECT DISTINCT usuario_id FROM public.gastos LOOP
    SELECT COALESCE(SUM(monto), 0) INTO v_resto FROM public.fondo_movimientos WHERE usuario_id = p.usuario_id AND tipo = 'entrega';
    v_pagado := 0; v_fecha := NULL;
    FOR g IN SELECT * FROM public.gastos WHERE usuario_id = p.usuario_id ORDER BY fecha, created_at LOOP
      IF g.estado = 'rechazado' THEN
        UPDATE public.gastos SET monto_fondo = 0, monto_propio = 0 WHERE id = g.id;
      ELSIF g.estado = 'reembolsado' THEN
        -- Ya se le pagó: lo puso de su bolsillo y está pagado.
        UPDATE public.gastos SET monto_fondo = 0, monto_propio = g.monto, pagado_con = 'propio' WHERE id = g.id;
        v_pagado := v_pagado + g.monto; v_fecha := GREATEST(COALESCE(v_fecha, g.fecha), COALESCE(g.revisado_at::DATE, g.fecha));
      ELSE
        UPDATE public.gastos SET monto_fondo = LEAST(v_resto, g.monto), monto_propio = g.monto - LEAST(v_resto, g.monto),
          pagado_con = CASE WHEN v_resto >= g.monto THEN 'fondo' WHEN v_resto > 0 THEN 'mixto' ELSE 'propio' END
        WHERE id = g.id;
        v_resto := v_resto - LEAST(v_resto, g.monto);
      END IF;
    END LOOP;
    IF v_pagado > 0 THEN
      INSERT INTO public.fondo_movimientos (usuario_id, tipo, monto, fecha, nota, created_at)
      VALUES (p.usuario_id, 'pago', v_pagado, COALESCE(v_fecha, CURRENT_DATE), 'Lo que se le reembolsó antes de los fondos', NOW());
    END IF;
  END LOOP;
END $$;
