-- F-65 — La comision de OTA vuelve a generar su asiento contable.
--
-- =========================================================================
-- AVISO: ESTE ARCHIVO YA NO ES LA VERSION VIGENTE DE LA FUNCION
-- =========================================================================
-- Este .sql es el registro de la migracion TAL COMO SE APLICO (2026-09-23) y
-- resuelve el 42883 de F-65: la llamada a `fn_create_journal_entry` pasa de
-- diez argumentos posicionales a argumentos CON NOMBRE.
--
-- Despues de aplicarla, la sesion de Finanzas modifico el cuerpo de
-- `public.fn_auto_journal_ota_commission()` por encima de esta migracion, con
-- la decision contable de **ADR-CC-013**:
--   - la regla de `ota_commission` pasa a 5235 (gasto) -> 2335 (por pagar);
--   - la busqueda de regla deja de exigir `event_type = 'confirmed'` y acepta
--     cualquier regla activa de `ota_commission` de la organizacion;
--   - si no hay regla, se registra el rechazo en `journal_entry_failures` en
--     vez de salir en silencio.
--
-- NO RECONSTRUYAS LA FUNCION DESDE ESTE ARCHIVO. El cuerpo vivo manda; este
-- .sql se conserva sin tocar como registro historico de F-65. Lo que sigue
-- siendo de esta migracion, y que ADR-CC-013 conserva literalmente, es la
-- llamada con argumentos con nombre, el `p_fact_key`
-- ('accrual:ota_commission:<uuid>') y el `SET search_path`.
--
-- =========================================================================
-- El defecto
-- =========================================================================
-- `public.fn_auto_journal_ota_commission()` llamaba a `fn_create_journal_entry`
-- con DIEZ argumentos posicionales. En `public` solo existe UNA
-- `fn_create_journal_entry`, y tiene CATORCE parametros con nombre:
--
--   p_organization_id integer, p_branch_id integer, p_entry_date timestamptz,
--   p_memo text, p_source text, p_source_id text,
--   p_debit_account text, p_credit_account text, p_amount numeric,
--   p_tax_account text DEFAULT NULL, p_tax_amount numeric DEFAULT 0,
--   p_created_by uuid DEFAULT NULL, p_tax_is_credit boolean DEFAULT false,
--   p_fact_key text DEFAULT NULL
--
-- PL/pgSQL resuelve los nombres de funcion EN EJECUCION, asi que el error no
-- salia al desplegar sino la primera vez que una reserva con comision pasaba
-- por el disparador. Comprobado en seco (transaccion abortada) antes de este
-- cambio:
--
--   42883: function fn_create_journal_entry(integer, integer, unknown,
--          unknown, text, numeric, text, text, text,
--          timestamp with time zone) does not exist
--
-- Como los dos disparadores son AFTER INSERT OR UPDATE en la misma
-- transaccion, lo que caia era la escritura entera: NO se podia guardar el
-- detalle de una reserva de Booking o de Expedia con `commission_amount > 0`,
-- y por tanto NINGUNA generaba asiento.
--
-- =========================================================================
-- Correspondencia argumento a argumento
-- =========================================================================
-- La llamada vieja encajaba con una firma anterior de la forma
-- (org, branch, source, event_type, source_id, amount, debit, credit,
--  description, fecha). Traducida a la firma viva, uno por uno:
--
--   1  v_reservation.organization_id   -> p_organization_id
--   2  v_branch_id                     -> p_branch_id
--   3  'ota_commission'                -> p_source
--   4  'confirmed'                     -> no existe parametro de evento en la
--                                         firma viva; se conserva dentro de
--                                         p_source_id, igual que hace la
--                                         hermana fn_auto_journal_commission
--   5  NEW.id::text                    -> p_source_id (con el sufijo del evento)
--   6  v_amount                        -> p_amount
--   7  v_rule.debit_account_code       -> p_debit_account
--   8  v_rule.credit_account_code      -> p_credit_account
--   9  v_description                   -> p_memo
--  10  COALESCE(NEW.updated_at, now()) -> p_entry_date
--
-- De los 14 parametros quedan SIN cubrir cuatro, todos con valor por defecto y
-- todos deliberadamente:
--   - p_tax_account  (DEFAULT NULL)  : la comision de OTA se asienta por su
--                                      importe bruto; la regla contable no
--                                      aporta base gravable en este flujo y la
--                                      llamada vieja tampoco pasaba impuesto.
--   - p_tax_amount   (DEFAULT 0)     : idem.
--   - p_tax_is_credit(DEFAULT false) : idem.
--   - p_created_by   (DEFAULT NULL)  : el asiento lo escribe un disparador, no
--                                      una persona. La hermana tampoco lo pasa.
-- Y se anade uno que la llamada vieja no tenia: p_fact_key (ver abajo).
--
-- =========================================================================
-- Decision 1 — que hecho identifica el asiento (p_source_id y p_fact_key)
-- =========================================================================
-- Comprobado en la base antes de decidir: sobre `journal_entries` NO hay
-- ninguna unicidad en (source, source_id). El unico indice que los toca es
--
--   idx_journal_entries_source  -- NO UNIQUE, (organization_id, source, source_id)
--
-- La unicidad real esta en
--
--   uq_journal_entries_fact_key -- UNIQUE (organization_id, fact_key)
--                                  WHERE fact_key IS NOT NULL
--
-- y `fn_create_journal_entry` la explota dos veces: busca el asiento por
-- fact_key ANTES de insertar y, si aun asi choca, captura el unique_violation
-- y devuelve el asiento que ya existia. Es decir: el source_id NO da
-- idempotencia por si solo; el fact_key SI. Por eso se pasan los dos:
--
--   p_source_id := NEW.id::text || ':' || v_event_type
--       — misma forma que la hermana (`NEW.id::text || ':' || v_event_type`).
--         Sirve para agrupar y auditar; deja sitio a un futuro evento
--         distinto de 'confirmed' sobre la misma fila de detalle.
--
--   p_fact_key := 'accrual:ota_commission:' || NEW.id::text
--       — la garantia. Sigue la convencion viva de la base
--         (`accrual:<entidad>:<uuid>`, como `accrual:invoice:<uuid>` o
--         `accrual:credit_note:<uuid>`). El hecho es "esta fila de detalle de
--         OTA devenga su comision": una fila, un asiento. `NEW.id` es un uuid
--         propio de la fila en las dos tablas de detalle, asi que identifica
--         tambien el canal sin necesidad de anadirlo.
--
-- Con esto, reprocesar la misma fila (el disparador es AFTER INSERT OR UPDATE
-- OF commission_amount, y puede dispararse varias veces) devuelve el asiento
-- que ya existe en vez de crear uno nuevo.
--
-- =========================================================================
-- Decision 2 — que instante es p_entry_date
-- =========================================================================
-- `journal_entries.entry_date` es `timestamptz`, asi que aqui NO interviene
-- `fn_today_for_org` ni ninguna regla de dia calendario: se guarda un
-- instante, no un dia.
--
-- El devengo de la comision es el instante en que la comision de la OTA pasa a
-- ser un hecho para esta reserva. Ninguna de las dos tablas de detalle tiene
-- un `accrued_at` (comprobado: `booking_reservation_details` tiene
-- `acknowledged_at`, `expedia_reservation_details` tiene `confirmed_at`; no
-- hay columna comun), y la funcion sirve a las dos, asi que no puede leer una
-- columna que solo exista en una.
--
-- Se elige `COALESCE(NEW.updated_at, NEW.created_at, now())`, que es la misma
-- forma que la hermana (`COALESCE(NEW.accrued_at, NEW.created_at, now())`) y
-- conserva la intencion del ultimo argumento de la llamada vieja:
--   - en el alta (el caso normal) `updated_at` y `created_at` valen los dos
--     `now()` por defecto, de modo que la fecha es la del alta del detalle;
--   - cuando la comision se fija despues (el disparador tambien escucha
--     UPDATE OF commission_amount), `updated_at` es justo el instante en que
--     la comision pasa a ser conocida, que es cuando se devenga.
-- Y como el fact_key hace idempotente la llamada, un reproceso posterior NO
-- vuelve a fechar el asiento: devuelve el que ya existe.
--
-- =========================================================================
-- Cambio deliberado adicional — search_path
-- =========================================================================
-- La funcion es SECURITY DEFINER y `pg_proc.proconfig` era NULL (aviso
-- `function_search_path_mutable` de get_advisors). Se le anade
-- `SET search_path TO 'public', 'pg_temp'`, el mismo que ya llevan
-- `fn_create_journal_entry`, `fn_log_journal_failure` y la hermana
-- `fn_auto_journal_commission`.
-- Comprobado antes de anadirlo: los seis objetos que usa el cuerpo
-- (`reservations`, `accounting_rules`, `branches` y, por transitividad,
-- `journal_entries`, `journal_lines`, `chart_of_accounts`) y las funciones
-- `fn_create_journal_entry`, `fn_log_journal_failure` y `fn_is_period_open`
-- existen UNICAMENTE en `public`: no hay ningun homonimo en otro esquema al
-- que fijar el search_path pudiera dejar de resolver.
--
-- =========================================================================
-- Contrato conservado
-- =========================================================================
-- `CREATE OR REPLACE`, jamas `DROP FUNCTION` (se llevaria por delante los dos
-- disparadores y la ACL). Se conservan firma `()`, tipo de retorno `trigger`,
-- lenguaje plpgsql, volatilidad VOLATILE, `SECURITY DEFINER`, owner (postgres)
-- y ACL ({postgres=X/postgres,service_role=X/postgres}). Los disparadores
-- `trg_auto_journal_ota_booking` y `trg_auto_journal_ota_expedia` siguen
-- intactos y habilitados. Cero UPDATE o DELETE sobre datos reales.

CREATE OR REPLACE FUNCTION public.fn_auto_journal_ota_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_reservation RECORD;
    v_amount numeric;
    v_description text;
    v_channel text;
    v_priority smallint;
    v_branch_id integer;
    v_event_type text := 'confirmed';
    v_entry_id integer;
BEGIN
    -- Determinar canal y monto de comision
    -- Funciona para booking_reservation_details y expedia_reservation_details
    v_amount := COALESCE(NEW.commission_amount, 0);
    IF v_amount <= 0 THEN
        RETURN NEW;
    END IF;

    -- Determinar canal segun la tabla (TG_TABLE_NAME)
    v_channel := CASE TG_TABLE_NAME
        WHEN 'booking_reservation_details' THEN 'booking'
        WHEN 'expedia_reservation_details' THEN 'expedia'
        ELSE 'unknown'
    END;

    v_priority := CASE v_channel
        WHEN 'booking' THEN 10
        WHEN 'expedia' THEN 11
        ELSE 10
    END;

    -- Obtener reserva
    SELECT r.organization_id, r.branch_id INTO v_reservation
    FROM reservations r
    WHERE r.id = NEW.reservation_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Buscar regla contable
    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = v_reservation.organization_id
      AND source_type = 'ota_commission'
      AND event_type = v_event_type
      AND priority = v_priority
      AND is_active = true
    LIMIT 1;

    -- Fallback: cualquier regla de ota_commission
    IF NOT FOUND THEN
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = v_reservation.organization_id
          AND source_type = 'ota_commission'
          AND event_type = v_event_type
          AND is_active = true
        LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- La sucursal sale de la reserva si es de esta organizacion; si no, la
    -- principal de la organizacion. NUNCA la sucursal 0, que no existe.
    v_branch_id := NULL;

    IF v_reservation.branch_id IS NOT NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.id = v_reservation.branch_id
           AND b.organization_id = v_reservation.organization_id;
    END IF;

    IF v_branch_id IS NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.organization_id = v_reservation.organization_id
         ORDER BY (b.is_main IS TRUE) DESC, (b.is_active IS TRUE) DESC, b.id ASC
         LIMIT 1;
    END IF;

    IF v_branch_id IS NULL THEN
        RAISE WARNING 'fn_auto_journal_ota_commission: la organizacion % no tiene ninguna sucursal; no se crea el asiento de la reserva %',
              v_reservation.organization_id, NEW.reservation_id;
        RETURN NEW;
    END IF;

    v_description := 'Comision ' || v_channel || ' - Reserva ' || NEW.reservation_id::text;

    -- Llamada con argumentos CON NOMBRE contra la unica firma existente.
    -- La forma posicional de 10 argumentos que habia aqui no correspondia a
    -- ninguna firma (42883). Ver la cabecera de esta migracion.
    v_entry_id := fn_create_journal_entry(
        p_organization_id := v_reservation.organization_id,
        p_branch_id       := v_branch_id,
        p_entry_date      := COALESCE(NEW.updated_at, NEW.created_at, now()),
        p_memo            := v_description,
        p_source          := 'ota_commission',
        p_source_id       := NEW.id::text || ':' || v_event_type,
        p_debit_account   := v_rule.debit_account_code,
        p_credit_account  := v_rule.credit_account_code,
        p_amount          := v_amount,
        p_fact_key        := 'accrual:ota_commission:' || NEW.id::text
    );

    RETURN NEW;
END;
$function$;
