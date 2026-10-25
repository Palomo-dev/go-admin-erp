-- Rollback de 20261025134100: restaura la función y el trigger vivos al 25-oct y quita el CHECK.
alter table public.commissions drop constraint if exists commissions_no_factura_compra;

CREATE OR REPLACE FUNCTION public.fn_create_commission_on_invoice_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_commission_amount numeric;
    v_payee_name text;
    v_existing_commission_count integer;
BEGIN
    -- Solo si la factura pasa a 'paid' y tiene comisión configurada
    IF NEW.status != 'paid' THEN
        RETURN NEW;
    END IF;

    -- Solo si cambió el status
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    IF NEW.commission_type = 'none' OR NEW.commission_rate IS NULL OR NEW.commission_rate <= 0 THEN
        RETURN NEW;
    END IF;

    IF NEW.salesperson_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Evitar duplicados
    SELECT COUNT(*) INTO v_existing_commission_count
    FROM commissions
    WHERE source_type = 'invoice_purchase' AND source_id = NEW.id::text;

    IF v_existing_commission_count > 0 THEN
        RETURN NEW;
    END IF;

    v_commission_amount := ROUND(COALESCE(NEW.subtotal, NEW.total, 0) * NEW.commission_rate / 100.0, 2);

    IF v_commission_amount <= 0 THEN
        RETURN NEW;
    END IF;

    -- Obtener nombre del beneficiario (puede ser usuario o proveedor)
    SELECT COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email, 'Comisionista')
    INTO v_payee_name
    FROM auth.users
    WHERE id = NEW.salesperson_id;

    -- Si no encuentra en auth.users, buscar en suppliers
    IF v_payee_name IS NULL THEN
        SELECT name INTO v_payee_name
        FROM suppliers
        WHERE id::text = NEW.salesperson_id::text;
    END IF;

    v_payee_name := COALESCE(v_payee_name, 'Comisionista');

    INSERT INTO commissions (
        organization_id, branch_id,
        commission_type, source_type, source_id,
        payee_type, payee_id, payee_name,
        base_amount, commission_rate, commission_amount,
        currency, status, notes
    ) VALUES (
        NEW.organization_id, NEW.branch_id,
        NEW.commission_type, 'invoice_purchase', NEW.id::text,
        'employee', NEW.salesperson_id::text, v_payee_name,
        COALESCE(NEW.subtotal, NEW.total, 0), NEW.commission_rate, v_commission_amount,
        COALESCE(NEW.currency, 'USD'), 'accrued',
        'Comisión por factura de compra - ' || COALESCE(NEW.number_ext, NEW.id::text)
    );

    RETURN NEW;
END;
$function$
;

drop trigger if exists trg_create_commission_on_invoice_purchase on public.invoice_purchase;
CREATE TRIGGER trg_create_commission_on_invoice_purchase AFTER UPDATE OF status ON public.invoice_purchase FOR EACH ROW EXECUTE FUNCTION fn_create_commission_on_invoice_purchase();
