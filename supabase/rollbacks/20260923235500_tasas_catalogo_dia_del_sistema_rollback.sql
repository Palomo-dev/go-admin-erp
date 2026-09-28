-- ============================================================================
-- REVERSION de 20260923235500_tasas_catalogo_dia_del_sistema.sql
-- ============================================================================
-- Devuelve las 7 funciones del catalogo global de tasas a `CURRENT_DATE`
-- (el dia UTC en este servidor) y restaura el nombre de la variable local
-- `current_date` en `save_exchange_rates(integer,uuid,jsonb,text,bigint)`.
--
-- Cuerpos byte a byte los que habia antes de la migracion. md5 de `pg_proc.prosrc`
-- de la version que se restaura (verificados por MCP el 2026-09-23):
--   auto_generate_missing_rates()                        f719e12de69bba2b0bfda869927457fd  (2393 car.)
--   fill_historical_rates_real_api()                     663ad5069633e341226dfbd284893f08  (2949 car.)
--   fill_missing_currency_dates()                        81b9889c2822afa2ba3ce5dd997c4711  (2559 car.)
--   insert_fallback_rates()                              877ea876fc936c9fdfd5a687f2c641c5  (1048 car.)
--   save_exchange_rates(int,uuid,jsonb,text)             69853426937a265411e5e32ed015e245  (2341 car.)
--   save_exchange_rates(int,uuid,jsonb,text,bigint)      e5b508ca16b1a13d09f77c3b9e1f9e9d  (2369 car.)
--   update_global_exchange_rates(jsonb,text,bigint,text,text) 3de14f2023480a2219ac54f7cb6309ff (3380 car.)
--
-- NO restaura datos: la migracion no toco ni una fila de `currency_rates`.
--
-- AVISO: revertir vuelve a poner 7 funciones con `CURRENT_DATE` en `public`, asi
-- que el inventario de CI (`scripts/verificar-current-date-en-postgres.mjs`)
-- pasara a rojo mientras `scripts/lista-blanca-current-date.json` siga vacio.
-- Si se revierte de verdad, hay que devolver las 7 firmas a ese JSON en el mismo
-- momento, y el ADR-004 a su version anterior.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_generate_missing_rates()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE
    start_date date;
    current_date_iter date;
    filled_count integer := 0;
    base_rates jsonb;
    daily_variation numeric;
    result jsonb;
BEGIN
    -- Definir fecha inicio: desde hace 15 días hasta hoy
    start_date := CURRENT_DATE - INTERVAL '15 days';

    -- Tasas base realistas (simulando datos reales del mercado)
    base_rates := '{
        "COP": 4049.91,
        "MXN": 18.65268,
        "EUR": 0.85569,
        "GBP": 0.74621,
        "JPY": 147.35875,
        "CAD": 1.37412,
        "AUD": 1.54871,
        "BRL": 5.47708,
        "CLP": 976.22900,
        "USD": 1.000000
    }';

    -- Iterar cada día desde start_date hasta hoy
    current_date_iter := start_date;
    WHILE current_date_iter <= CURRENT_DATE LOOP
        -- Verificar si ya existen datos para esta fecha
        IF NOT EXISTS (
            SELECT 1 FROM currency_rates
            WHERE rate_date = current_date_iter
        ) AND EXTRACT(dow FROM current_date_iter) != 0 THEN  -- Excluir domingos

            -- Generar variación diaria basada en la fecha para consistencia
            daily_variation := (EXTRACT(epoch FROM current_date_iter)::numeric / 86400) * 0.001;

            -- Insertar tasas con variación realista por fecha
            INSERT INTO currency_rates (code, rate, source, rate_date, created_at, updated_at, base_currency_code)
            SELECT
                key as code,
                (value::numeric * (1 + sin(daily_variation) * 0.015))::numeric(15,6) as rate,  -- Variación senoidal ±1.5%
                'auto_generated_daily' as source,
                current_date_iter as rate_date,  -- Tipo correcto: date
                NOW() as created_at,
                NOW() as updated_at,
                'USD' as base_currency_code
            FROM jsonb_each_text(base_rates);

            filled_count := filled_count + 1;
            RAISE LOG 'Generadas tasas para fecha: %', current_date_iter;
        END IF;

        current_date_iter := current_date_iter + INTERVAL '1 day';
    END LOOP;

    result := jsonb_build_object(
        'success', true,
        'dates_filled', filled_count,
        'start_date', start_date,
        'end_date', CURRENT_DATE,
        'message', format('Tasas generadas automáticamente para %s fechas faltantes', filled_count)
    );

    RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fill_historical_rates_real_api()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE
    start_date date;
    current_date_iter date;
    filled_count integer := 0;
    result jsonb;
    missing_dates date[];
BEGIN
    -- Definir fecha inicio: desde hace 15 días hasta hoy
    start_date := CURRENT_DATE - INTERVAL '15 days';

    -- Encontrar fechas faltantes (excluyendo domingos)
    WITH date_series AS (
        SELECT generate_series(start_date, CURRENT_DATE, '1 day'::interval)::date as date_val
    ),
    existing_dates AS (
        SELECT DISTINCT rate_date::date as date_val
        FROM currency_rates
        WHERE rate_date >= start_date
          AND source LIKE '%openexchangerates%'  -- Solo contar fuentes reales
    ),
    missing AS (
        SELECT ds.date_val
        FROM date_series ds
        LEFT JOIN existing_dates ed ON ds.date_val = ed.date_val
        WHERE ed.date_val IS NULL
          AND EXTRACT(dow FROM ds.date_val) != 0  -- Excluir domingos
          AND ds.date_val <= CURRENT_DATE
    )
    SELECT array_agg(date_val ORDER BY date_val) INTO missing_dates FROM missing;

    -- Log de fechas faltantes detectadas
    IF missing_dates IS NOT NULL THEN
        RAISE LOG 'Fechas faltantes detectadas: %', missing_dates;

        -- Para cada fecha faltante, llamar Edge Function que usa API histórico real
        FOR i IN 1..array_length(missing_dates, 1) LOOP
            current_date_iter := missing_dates[i];

            RAISE LOG 'Solicitando datos históricos REALES para fecha: %', current_date_iter;

            -- Llamar Edge Function con fecha específica para datos históricos reales
            PERFORM net.http_post(
                url := 'https://jgmgphmzusbluqhuqihj.supabase.co/functions/v1/actualizar-tasas-cambio',
                headers := jsonb_build_object(
                    'Authorization', 'Bearer ' || private.get_secret('service_role_key'),
                    'Content-Type', 'application/json',
                    'X-Supabase-Scheduled', 'true'
                ),
                body := jsonb_build_object(
                    'source', 'historical_real_api',
                    'scheduled', true,
                    'target_date', current_date_iter::text,
                    'use_historical_api', true,
                    'fill_gaps', true
                )
            );

            filled_count := filled_count + 1;

            -- Pausa entre llamadas para evitar rate limiting del API externo
            PERFORM pg_sleep(2);
        END LOOP;
    END IF;

    -- Retornar resultado
    result := jsonb_build_object(
        'success', true,
        'missing_dates_found', COALESCE(array_length(missing_dates, 1), 0),
        'api_calls_made', filled_count,
        'message', format('Se realizaron %s llamadas al API histórico real para fechas faltantes', filled_count),
        'missing_dates', COALESCE(missing_dates::text[], '{}')
    );

    RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fill_missing_currency_dates()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE
    start_date date;
    end_date date;
    current_date_iter date;
    missing_dates date[];
    filled_count integer := 0;
    result jsonb;
BEGIN
    -- Definir rango: desde hace 30 días hasta hoy
    start_date := CURRENT_DATE - INTERVAL '30 days';
    end_date := CURRENT_DATE;

    -- Encontrar fechas faltantes (excluyendo domingos ya que mercados están cerrados)
    WITH date_series AS (
        SELECT generate_series(start_date, end_date, '1 day'::interval)::date as date_val
    ),
    existing_dates AS (
        SELECT DISTINCT rate_date::date as date_val
        FROM currency_rates
        WHERE rate_date >= start_date
    ),
    missing AS (
        SELECT ds.date_val
        FROM date_series ds
        LEFT JOIN existing_dates ed ON ds.date_val = ed.date_val
        WHERE ed.date_val IS NULL
          AND EXTRACT(dow FROM ds.date_val) != 0  -- Excluir domingos
          AND ds.date_val <= CURRENT_DATE  -- Solo fechas hasta hoy
    )
    SELECT array_agg(date_val) INTO missing_dates FROM missing;

    -- Llenar cada fecha faltante llamando a la Edge Function
    IF missing_dates IS NOT NULL THEN
        FOR i IN 1..array_length(missing_dates, 1) LOOP
            current_date_iter := missing_dates[i];

            RAISE LOG 'Llenando fecha faltante: %', current_date_iter;

            -- Llamar Edge Function para fecha específica
            PERFORM net.http_post(
                url := 'https://jgmgphmzusbluqhuqihj.supabase.co/functions/v1/actualizar-tasas-cambio',
                headers := jsonb_build_object(
                    'Authorization', 'Bearer ' || private.get_secret('service_role_key'),
                    'Content-Type', 'application/json',
                    'X-Supabase-Scheduled', 'true'
                ),
                body := jsonb_build_object(
                    'source', 'gap_filler',
                    'scheduled', true,
                    'target_date', current_date_iter::text,
                    'fill_gaps', true
                )
            );

            filled_count := filled_count + 1;

            -- Pequeña pausa para evitar rate limiting
            PERFORM pg_sleep(1);
        END LOOP;
    END IF;

    -- Retornar resultado
    result := jsonb_build_object(
        'success', true,
        'missing_dates_found', COALESCE(array_length(missing_dates, 1), 0),
        'dates_filled', filled_count,
        'missing_dates', COALESCE(missing_dates::text[], '{}')
    );

    RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.insert_fallback_rates()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE
  today_date TEXT;
  rates_inserted INTEGER := 0;
BEGIN
  today_date := CURRENT_DATE::TEXT;

  -- Verificar si ya existen datos para hoy
  IF EXISTS (SELECT 1 FROM currency_rates WHERE rate_date = today_date) THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Ya existen datos para hoy',
      'rates_inserted', 0
    );
  END IF;

  -- Insertar tasas de respaldo basadas en datos más recientes + variación aleatoria
  INSERT INTO currency_rates (code, rate, rate_date, source, base_currency_code, created_at, updated_at)
  SELECT
    code,
    rate * (1 + (random() - 0.5) * 0.02), -- Variación ±1%
    today_date,
    'automatic-fallback',
    base_currency_code,
    NOW(),
    NOW()
  FROM currency_rates
  WHERE rate_date = (
    SELECT MAX(rate_date) FROM currency_rates WHERE rate_date < today_date
  );

  GET DIAGNOSTICS rates_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Datos de respaldo insertados',
    'rates_inserted', rates_inserted
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.save_exchange_rates(org_id integer, base_currency_id uuid, rates jsonb, source text DEFAULT 'openexchangerates'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $fn$
DECLARE
  currency_record RECORD;
  rate_value NUMERIC;
  updated_count INTEGER := 0;
  skipped_count INTEGER := 0;
  rate_date DATE := CURRENT_DATE;
BEGIN
  perform public.fn_assert_acceso_org(org_id::integer);
  -- Iterar sobre todas las monedas de la organización
  FOR currency_record IN
    SELECT c.id, c.code, c.template_code
    FROM currencies c
    WHERE c.organization_id = org_id
      AND c.id <> base_currency_id  -- Excluir la moneda base
  LOOP
    -- Verificar si tenemos una tasa para esta moneda
    IF rates ? currency_record.template_code THEN
      -- Extraer el valor de la tasa desde el JSON
      rate_value := (rates ->> currency_record.template_code)::NUMERIC;

      -- Verificar si ya existe una tasa para esta fecha
      BEGIN
        -- Intentar actualizar primero
        WITH updated AS (
          UPDATE currency_rates
          SET rate = rate_value,
              source = source,
              api_data = rates,
              updated_at = CURRENT_TIMESTAMP
          WHERE currency_id = currency_record.id
            AND organization_id = org_id
            AND rate_date = rate_date
          RETURNING id
        )
        SELECT COUNT(*) INTO updated_count FROM updated;

        -- Si no se actualizó ninguna fila, insertar nueva
        IF updated_count = 0 THEN
          INSERT INTO currency_rates (
            organization_id,
            currency_id,
            code,
            rate_date,
            rate,
            source,
            api_data,
            created_at,
            updated_at
          ) VALUES (
            org_id,
            currency_record.id,
            currency_record.code,
            rate_date,
            rate_value,
            source,
            rates,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          );
          updated_count := updated_count + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        skipped_count := skipped_count + 1;
        RAISE NOTICE 'Error al actualizar tasa para %: %', currency_record.code, SQLERRM;
      END;
    ELSE
      skipped_count := skipped_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Tasas de cambio actualizadas exitosamente',
    'updated_count', updated_count,
    'skipped_count', skipped_count
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.save_exchange_rates(org_id integer, base_currency_id uuid, rates jsonb, source text DEFAULT 'openexchangerates'::text, api_timestamp bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $fn$
DECLARE
  current_date date := CURRENT_DATE;
  updated_count integer := 0;
  skipped_count integer := 0;
  currency_record RECORD;
  base_currency_code VARCHAR(3);
BEGIN
  perform public.fn_assert_acceso_org(org_id::integer);
  -- Obtener el código de la moneda base
  SELECT code INTO base_currency_code
  FROM currencies
  WHERE id = base_currency_id;

  IF base_currency_code IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No se encontró la moneda base especificada',
      'updated_count', 0
    );
  END IF;

  -- Preparar los datos de la API para el campo JSONB
  -- Si el timestamp es NULL, usar el tiempo actual
  IF api_timestamp IS NULL THEN
    api_timestamp := EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint;
  END IF;

  -- Para cada moneda en rates, actualizar o insertar tasa
  FOR currency_record IN
    SELECT c.id, c.code, c.template_code
    FROM currencies c
    WHERE c.organization_id = org_id
    AND c.id <> base_currency_id  -- No insertar la tasa para la moneda base
    AND (c.auto_update = true OR source <> 'openexchangerates') -- Solo actualizar automáticamente si está configurado
  LOOP
    -- Solo si existe la tasa en el objeto rates y usando template_code como clave
    IF rates ? currency_record.template_code THEN
      INSERT INTO currency_rates(
        organization_id, currency_id, code, rate_date,
        rate, source, base_currency_code, api_data
      )
      VALUES (
        org_id,
        currency_record.id,
        currency_record.code,
        current_date,
        (rates->>currency_record.template_code)::numeric,
        source,
        base_currency_code,
        jsonb_build_object('timestamp', api_timestamp, 'data', rates)
      )
      ON CONFLICT (organization_id, code, rate_date)
      DO UPDATE SET
        rate = EXCLUDED.rate,
        updated_at = now(),
        source = EXCLUDED.source,
        base_currency_code = EXCLUDED.base_currency_code,
        api_data = EXCLUDED.api_data;

      updated_count := updated_count + 1;
    ELSE
      skipped_count := skipped_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Tasas de cambio actualizadas exitosamente',
    'updated_count', updated_count,
    'skipped_count', skipped_count,
    'base_currency', base_currency_code
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_global_exchange_rates(rates jsonb, source text DEFAULT 'openexchangerates'::text, api_timestamp bigint DEFAULT NULL::bigint, rate_date text DEFAULT NULL::text, base_currency_code text DEFAULT 'USD'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE
  currency_code TEXT;
  rate_value NUMERIC;
  updated_count INTEGER := 0;
  inserted_count INTEGER := 0;
  skipped_count INTEGER := 0;
  current_rate_date DATE;
  start_time TIMESTAMP := clock_timestamp();
  currencies_count INTEGER;
  execution_ms NUMERIC;
  record_exists BOOLEAN;
BEGIN
  -- Validaciones iniciales
  IF rates IS NULL OR jsonb_typeof(rates) != 'object' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'El parámetro rates debe ser un objeto JSON válido'
    );
  END IF;

  -- Configurar fecha
  current_rate_date := COALESCE(rate_date::DATE, CURRENT_DATE);

  -- Configurar timestamp
  IF api_timestamp IS NULL THEN
    api_timestamp := EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint;
  END IF;

  -- Configurar base currency
  IF base_currency_code IS NULL THEN
    base_currency_code := 'USD';
  END IF;

  -- Contar monedas
  SELECT COUNT(*) INTO currencies_count FROM jsonb_object_keys(rates);

  -- Procesar cada moneda
  FOR currency_code, rate_value IN
    SELECT key, (value::text)::numeric
    FROM jsonb_each(rates)
    WHERE value::text ~ '^[0-9]+\.?[0-9]*$'
  LOOP
    -- Solo procesar monedas que existen en el catálogo
    IF EXISTS (SELECT 1 FROM currencies WHERE code = currency_code AND is_active = true) THEN

      -- Verificar si ya existe el registro (usando alias de tabla para evitar ambigüedad)
      SELECT EXISTS(
        SELECT 1 FROM currency_rates cr
        WHERE cr.code = currency_code AND cr.rate_date = current_rate_date
      ) INTO record_exists;

      IF record_exists THEN
        -- Actualizar (usando alias para evitar ambigüedad)
        UPDATE currency_rates cr SET
          rate = rate_value,
          source = $2,
          base_currency_code = $5,
          api_data = jsonb_build_object(
            'timestamp', api_timestamp,
            'base', $5,
            'code', currency_code,
            'rate', rate_value,
            'source', $2
          ),
          updated_at = CURRENT_TIMESTAMP
        WHERE cr.code = currency_code AND cr.rate_date = current_rate_date;

        updated_count := updated_count + 1;
      ELSE
        -- Insertar nuevo registro
        INSERT INTO currency_rates (
          code, rate_date, rate, source, base_currency_code,
          api_data, created_at, updated_at
        ) VALUES (
          currency_code, current_rate_date, rate_value, $2, $5,
          jsonb_build_object(
            'timestamp', api_timestamp,
            'base', $5,
            'code', currency_code,
            'rate', rate_value,
            'source', $2
          ),
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        );

        inserted_count := inserted_count + 1;
      END IF;
    ELSE
      skipped_count := skipped_count + 1;
    END IF;
  END LOOP;

  -- Calcular tiempo de ejecución
  execution_ms := EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Tasas de cambio actualizadas exitosamente en ' || execution_ms || 'ms',
    'updated_count', updated_count,
    'inserted_count', inserted_count,
    'skipped_count', skipped_count,
    'base_currency', $5,
    'rate_date', current_rate_date,
    'source', $2,
    'currencies_count', currencies_count,
    'performance', jsonb_build_object('execution_time_ms', execution_ms)
  );
END;
$fn$;
