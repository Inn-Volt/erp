\set ON_ERROR_STOP 0
\set QUIET 1
CREATE TEMP TABLE r (n SERIAL, ok BOOLEAN, txt TEXT);
SELECT set_config('request.jwt.claim.sub', '', false);

-- 1. Sin fijar, no hay imprevistos
INSERT INTO r (ok, txt) SELECT imprevistos_por_tipo IS NULL, 'Sin fijar: sin imprevistos (todo sigue igual)' FROM public.ajustes_cotizacion WHERE id = 1;

-- 2. Se guardan por tipo
UPDATE public.ajustes_cotizacion SET imprevistos_por_tipo = '{"material": 5, "mano_obra": 10}' WHERE id = 1;
INSERT INTO r (ok, txt) SELECT (imprevistos_por_tipo->>'mano_obra')::NUMERIC = 10, 'Se guardan los imprevistos por tipo' FROM public.ajustes_cotizacion WHERE id = 1;

-- 3. Solo un objeto
DO $$ BEGIN
  UPDATE public.ajustes_cotizacion SET imprevistos_por_tipo = '[5, 10]' WHERE id = 1;
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Rechaza algo que no es un objeto');
EXCEPTION WHEN check_violation THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'Rechaza algo que no es un objeto');
END $$;
UPDATE public.ajustes_cotizacion SET imprevistos_por_tipo = NULL WHERE id = 1;

SELECT CASE WHEN ok THEN 'OK   ' ELSE 'FALLA' END || ' ' || n || '. ' || txt FROM r ORDER BY n;
SELECT count(*) FILTER (WHERE ok) || ' OK / ' || count(*) FILTER (WHERE NOT ok) || ' fallas' FROM r;
