-- Rollback de 20260928212000_comision_oportunidad_una_sola_fuente.
-- Quita la RPC. Antes de aplicarlo, el código debe volver a la versión previa
-- de crm/paymentService.ts y crm/commissionService.ts (que insertaban desde
-- Node/navegador), o el pago de facturas CRM y el cierre «ganada» dejan de
-- devengar comisión de oportunidad. No toca datos: las comisiones que la RPC
-- haya creado se quedan (con sus asientos).

drop function if exists public.fn_comision_oportunidad_devengar(integer, uuid, uuid, uuid);

-- Disparador de «ganada»: cuerpo anterior EXACTO (pg_get_functiondef el
-- 2026-09-28, md5 1bce9d1585cc2cf1fa7b795497391e2d; verificado en una
-- transacción que se deshace).
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
