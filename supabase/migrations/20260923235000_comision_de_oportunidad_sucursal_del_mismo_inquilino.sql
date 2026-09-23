-- La sucursal de una comision sale SIEMPRE de la misma organizacion.
--
-- =========================================================================
-- Defecto 1 (critico) — fn_create_commission_on_opportunity_won
-- =========================================================================
-- El cuerpo anterior elegia la sucursal asi:
--
--   SELECT id INTO v_branch_id FROM branches WHERE organization_id = NEW.organization_id LIMIT 1;
--   IF v_branch_id IS NULL THEN
--       v_branch_id := 1;
--   END IF;
--
-- Dos fallos en tres lineas:
--
--   a) El literal `1` NO esta filtrado por organizacion. `branches.id` es una
--      secuencia global compartida por todos los inquilinos, asi que la
--      sucursal 1 pertenece a la organizacion que sea. Hoy la sucursal 1 no
--      existe (el id mas bajo vivo es el 2), de modo que el sintoma visible
--      no es el cruce sino un ABORTO: ganar una oportunidad en una
--      organizacion sin sucursales revienta con
--
--        23503: insert or update on table "commissions" violates foreign key
--               constraint "commissions_branch_id_fkey"
--
--      y como el disparador es AFTER UPDATE en la misma transaccion, lo que
--      cae es el UPDATE entero: esa organizacion NO PUEDE marcar ninguna
--      oportunidad como ganada. El dia que alguien cree o restaure una
--      sucursal con id 1, el aborto se convierte en silencio y la comision
--      se carga a la contabilidad de otro inquilino.
--
--   b) El `LIMIT 1` sin `ORDER BY` es no determinista, y ademas ignoraba
--      `opportunities.branch_id`. Comprobado en seco: una oportunidad que
--      declara la sucursal 160 (secundaria) generaba la comision en la 161
--      (principal), sin que nada lo pidiera.
--
-- Correccion, en este orden:
--   1. La sucursal de la propia oportunidad, si la trae Y es de esta
--      organizacion. Si apunta a otro inquilino se descarta y se avisa.
--   2. Si no, la principal de la organizacion (`is_main`), luego activa,
--      luego el id menor — siempre con el filtro `organization_id`, y con un
--      ORDER BY completo para que el resultado sea reproducible.
--   3. Si la organizacion no tiene NINGUNA sucursal, se inserta NULL.
--      `commissions.branch_id` es NULLABLE (FK a branches ON DELETE SET NULL),
--      asi que la comision se registra igualmente y la oportunidad se puede
--      ganar. Queda un WARNING en el log; no se inventa una sucursal.
--
-- =========================================================================
-- Defecto 2 — fn_auto_journal_commission
-- =========================================================================
-- NO tiene el literal `1`: su respaldo ya era `MIN(id)` filtrado por
-- organizacion. Lo que le faltaba era comprobar que `NEW.branch_id` —el valor
-- que copia tal cual— sea de la misma organizacion que la comision. Hoy hay
-- 18 filas de `commissions` con la sucursal de otro inquilino (de origen
-- `invoice_sale`/`invoice_purchase`, no de oportunidades), y esta funcion las
-- arrastraba al asiento contable, moviendo dinero al libro de otro tenant.
-- Se le pone la misma guarda y el mismo orden que a la anterior; ademas, si
-- la organizacion no tiene sucursal, en vez de pasar NULL a
-- `journal_entries.branch_id` —que es NOT NULL— se registra el fallo por
-- `fn_log_journal_failure`, igual que ya hace con `no_rule`.
--
-- El cambio de `MIN(id)` a `is_main` es neutro con los datos de hoy:
-- verificado que las 85 organizaciones tienen exactamente una sucursal
-- `is_main` y que en las 3 con varias sucursales esa `is_main` es justo el
-- `MIN(id)` (0 organizaciones donde difieran).
--
-- =========================================================================
-- Defecto 3 (parcial) — fn_auto_journal_ota_commission
-- =========================================================================
-- Usaba `COALESCE(v_reservation.branch_id, 0)`: la sucursal 0 NO EXISTE
-- (verificado) y `journal_entries.branch_id` es NOT NULL con FK, asi que ese
-- respaldo solo podia producir una violacion de clave ajena. Se sustituye por
-- la misma cascada con filtro de inquilino.
--
-- ATENCION — esta funcion sigue rota por otra razon, documentada aparte en
-- docs/hallazgos/F-65.md y NO corregida aqui: su llamada posicional de 10
-- argumentos a `fn_create_journal_entry` no corresponde a ninguna firma
-- existente (solo hay una, de 14 parametros con nombre). Comprobado en seco:
--
--   42883: function fn_create_journal_entry(integer, integer, unknown,
--          unknown, unknown, numeric, unknown, unknown, unknown,
--          timestamp with time zone) does not exist
--
-- Reordenar esos argumentos es una decision contable (que hecho identifica
-- `p_source_id`, que fecha es `p_entry_date`) y se deja al dueno. Esta
-- migracion solo quita la sucursal inventada.
--
-- =========================================================================
-- Contrato conservado en las tres
-- =========================================================================
-- `CREATE OR REPLACE`, sin `DROP FUNCTION` (se llevaria por delante los
-- disparadores y la ACL). Se conservan firma, volatilidad (VOLATILE),
-- `SECURITY DEFINER`, `search_path` tal como estaba en cada una
-- (`public` / `public, pg_temp` / ninguno), owner (postgres) y ACL
-- ({postgres=X/postgres,service_role=X/postgres}). Cero UPDATE o DELETE sobre
-- datos existentes: la reparacion de las filas historicas se propone en el
-- informe y la decide el dueno.

-- -------------------------------------------------------------------------
-- 1. fn_create_commission_on_opportunity_won
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_commission_on_opportunity_won()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_commission_amount numeric;
    v_payee_name text;
    v_existing_commission_count integer;
    v_branch_id integer;
BEGIN
    IF NEW.status <> 'won' THEN
        RETURN NEW;
    END IF;

    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    IF NEW.commission_type = 'none' OR NEW.commission_rate IS NULL OR NEW.commission_rate <= 0 THEN
        RETURN NEW;
    END IF;

    IF NEW.salesperson_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_existing_commission_count
    FROM commissions
    WHERE source_type = 'opportunity' AND source_id = NEW.id::text;

    IF v_existing_commission_count > 0 THEN
        RETURN NEW;
    END IF;

    v_commission_amount := ROUND(COALESCE(NEW.amount, 0) * NEW.commission_rate / 100.0, 2);

    IF v_commission_amount <= 0 THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email, 'Vendedor')
    INTO v_payee_name
    FROM auth.users
    WHERE id = NEW.salesperson_id;

    v_payee_name := COALESCE(v_payee_name, 'Vendedor');

    -- Sucursal: la de la oportunidad si es de este inquilino.
    v_branch_id := NULL;

    IF NEW.branch_id IS NOT NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.id::bigint = NEW.branch_id
           AND b.organization_id = NEW.organization_id;

        IF v_branch_id IS NULL THEN
            RAISE WARNING 'fn_create_commission_on_opportunity_won: la oportunidad % declara la sucursal %, que no pertenece a la organizacion %; se descarta',
                  NEW.id, NEW.branch_id, NEW.organization_id;
        END IF;
    END IF;

    -- Respaldo: la principal de ESTA organizacion, con orden reproducible.
    IF v_branch_id IS NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.organization_id = NEW.organization_id
         ORDER BY (b.is_main IS TRUE) DESC, (b.is_active IS TRUE) DESC, b.id ASC
         LIMIT 1;
    END IF;

    -- Sin sucursales no se inventa ninguna: NULL y constancia en el log.
    IF v_branch_id IS NULL THEN
        RAISE WARNING 'fn_create_commission_on_opportunity_won: la organizacion % no tiene ninguna sucursal; la comision de la oportunidad % queda sin sucursal',
              NEW.organization_id, NEW.id;
    END IF;

    INSERT INTO commissions (
        organization_id, branch_id,
        commission_type, source_type, source_id,
        payee_type, payee_id, payee_name,
        base_amount, commission_rate, commission_amount,
        currency, status, notes
    ) VALUES (
        NEW.organization_id, v_branch_id,
        NEW.commission_type, 'opportunity', NEW.id::text,
        'employee', NEW.salesperson_id, v_payee_name,   -- uuid, sin ::text (era el bug)
        COALESCE(NEW.amount, 0), NEW.commission_rate, v_commission_amount,
        COALESCE(NEW.currency, 'USD'), 'accrued',
        'Comisión por oportunidad ganada - ' || NEW.name
    );

    RETURN NEW;
END;
$function$;

-- -------------------------------------------------------------------------
-- 2. fn_auto_journal_commission
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_auto_journal_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_branch_id integer;
    v_event_type text;
    v_memo text;
    v_source_id text;
BEGIN
    IF NEW.status IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'accrued' AND (OLD.status IS DISTINCT FROM NEW.status OR TG_OP = 'INSERT') THEN
        v_event_type := 'accrued';
    ELSIF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
        v_event_type := 'paid';
    ELSE
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.commission_amount, 0) <= 0 THEN
        RETURN NEW;
    END IF;

    IF v_event_type = 'paid' AND NEW.metadata ? 'payroll_slip_id' THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'commission'
      AND event_type = v_event_type
      AND is_active = true
    ORDER BY priority LIMIT 1;

    IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure((to_jsonb(NEW)->>'organization_id')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')'); RETURN NEW;
    END IF;

    -- La sucursal del asiento tiene que ser de la MISMA organizacion que la
    -- comision. Antes se copiaba NEW.branch_id sin comprobarlo.
    v_branch_id := NULL;

    IF NEW.branch_id IS NOT NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.id = NEW.branch_id
           AND b.organization_id = NEW.organization_id;

        IF v_branch_id IS NULL THEN
            RAISE WARNING 'fn_auto_journal_commission: la comision % apunta a la sucursal %, que no pertenece a la organizacion %; se descarta',
                  NEW.id, NEW.branch_id, NEW.organization_id;
        END IF;
    END IF;

    IF v_branch_id IS NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.organization_id = NEW.organization_id
         ORDER BY (b.is_main IS TRUE) DESC, (b.is_active IS TRUE) DESC, b.id ASC
         LIMIT 1;
    END IF;

    -- journal_entries.branch_id es NOT NULL: sin sucursal no hay asiento, pero
    -- tampoco se inventa una. Se deja registrado igual que el caso 'no_rule'.
    IF v_branch_id IS NULL THEN
        PERFORM fn_log_journal_failure((to_jsonb(NEW)->>'organization_id')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_branch', 'La organizacion no tiene ninguna sucursal propia y journal_entries.branch_id es NOT NULL');
        RETURN NEW;
    END IF;

    v_memo := CASE NEW.commission_type
        WHEN 'salesperson' THEN 'Comisión Vendedor - ' || COALESCE(NEW.payee_name, NEW.payee_id::text, 'N/A')
        WHEN 'intermediation_sale' THEN 'Comisión Intermediación Venta - ' || COALESCE(NEW.payee_name, NEW.source_id)
        WHEN 'intermediation_purchase' THEN 'Comisión Intermediación Compra - ' || COALESCE(NEW.payee_name, NEW.source_id)
        ELSE 'Comisión - ' || COALESCE(NEW.payee_name, 'N/A')
    END;

    v_source_id := NEW.id::text || ':' || v_event_type;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := v_branch_id,
        p_entry_date := CASE v_event_type
            WHEN 'accrued' THEN COALESCE(NEW.accrued_at, NEW.created_at, now())
            WHEN 'paid' THEN COALESCE(NEW.paid_at, NEW.updated_at, now())
        END,
        p_memo := v_memo,
        p_source := 'commissions',
        p_source_id := v_source_id,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.commission_amount
    );

    RETURN NEW;
END;
$function$;

-- -------------------------------------------------------------------------
-- 3. fn_auto_journal_ota_commission  (solo la sucursal; ver F-65)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_auto_journal_ota_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_rule RECORD;
    v_reservation RECORD;
    v_amount numeric;
    v_description text;
    v_channel text;
    v_priority smallint;
    v_branch_id integer;
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
      AND event_type = 'confirmed'
      AND priority = v_priority
      AND is_active = true
    LIMIT 1;

    -- Fallback: cualquier regla de ota_commission
    IF NOT FOUND THEN
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = v_reservation.organization_id
          AND source_type = 'ota_commission'
          AND event_type = 'confirmed'
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

    PERFORM fn_create_journal_entry(
        v_reservation.organization_id,
        v_branch_id,
        'ota_commission',
        'confirmed',
        NEW.id::text,
        v_amount,
        v_rule.debit_account_code,
        v_rule.credit_account_code,
        v_description,
        COALESCE(NEW.updated_at, now())
    );

    RETURN NEW;
END;
$function$;
