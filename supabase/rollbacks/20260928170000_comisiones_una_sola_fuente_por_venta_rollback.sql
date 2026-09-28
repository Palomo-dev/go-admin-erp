-- Rollback de 20260928170000_comisiones_una_sola_fuente_por_venta.
-- Restaura los cuerpos anteriores (pg_get_functiondef del 2026-09-28) y el
-- disparador no diferido. ADVERTENCIA: los cuerpos restaurados llevan el cast
-- roto de payee_id (text → uuid) y el cálculo siempre por porcentaje: con ellos
-- un cobro del POS con vendedor vuelve a fallar. No borra comisiones creadas.

create or replace function public.fn_create_commission_on_sale()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
    v_commission_amount numeric;
    v_salesperson_name text;
BEGIN
    IF NEW.status != 'paid' THEN
        RETURN NEW;
    END IF;

    IF NEW.commission_type = 'none' OR NEW.commission_rate IS NULL OR NEW.commission_rate <= 0 THEN
        RETURN NEW;
    END IF;

    IF NEW.salesperson_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_commission_amount := ROUND(COALESCE(NEW.subtotal, NEW.total, 0) * NEW.commission_rate / 100.0, 2);

    IF v_commission_amount <= 0 THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email, 'Vendedor')
    INTO v_salesperson_name
    FROM auth.users
    WHERE id = NEW.salesperson_id;

    INSERT INTO commissions (
        organization_id, branch_id,
        commission_type, source_type, source_id,
        payee_type, payee_id, payee_name,
        base_amount, commission_rate, commission_amount,
        currency, status, notes
    ) VALUES (
        NEW.organization_id, NEW.branch_id,
        NEW.commission_type, 'sale', NEW.id::text,
        'employee', NEW.salesperson_id::text, v_salesperson_name,
        COALESCE(NEW.subtotal, NEW.total, 0), NEW.commission_rate, v_commission_amount,
        public.fn_moneda_base_organizacion(NEW.organization_id), 'accrued',
        'Comisión automática por venta - ' || COALESCE(NEW.id::text, 'N/A')
    );

    RETURN NEW;
END;
$function$;

drop trigger if exists trg_create_commission_on_sale on public.sales;
create trigger trg_create_commission_on_sale
  after insert or update of status on public.sales
  for each row execute function public.fn_create_commission_on_sale();

create or replace function public.fn_create_commission_on_invoice_sale()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
    v_commission_amount numeric;
    v_salesperson_name text;
    v_existing_commission_count integer;
BEGIN
    -- Solo si la factura pasa a 'paid' y tiene comisión configurada
    IF NEW.status != 'paid' THEN
        RETURN NEW;
    END IF;

    -- Solo si cambió el status (no re-procesar si ya estaba paid)
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    IF NEW.commission_type = 'none' OR NEW.commission_rate IS NULL OR NEW.commission_rate <= 0 THEN
        RETURN NEW;
    END IF;

    IF NEW.salesperson_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Evitar duplicados: si ya existe comisión para esta factura
    SELECT COUNT(*) INTO v_existing_commission_count
    FROM commissions
    WHERE source_type = 'invoice_sale' AND source_id = NEW.id::text;

    IF v_existing_commission_count > 0 THEN
        RETURN NEW;
    END IF;

    v_commission_amount := ROUND(COALESCE(NEW.subtotal, NEW.total, 0) * NEW.commission_rate / 100.0, 2);

    IF v_commission_amount <= 0 THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email, 'Vendedor')
    INTO v_salesperson_name
    FROM auth.users
    WHERE id = NEW.salesperson_id;

    INSERT INTO commissions (
        organization_id, branch_id,
        commission_type, source_type, source_id,
        payee_type, payee_id, payee_name,
        base_amount, commission_rate, commission_amount,
        currency, status, notes
    ) VALUES (
        NEW.organization_id, NEW.branch_id,
        NEW.commission_type, 'invoice_sale', NEW.id::text,
        'employee', NEW.salesperson_id::text, v_salesperson_name,
        COALESCE(NEW.subtotal, NEW.total, 0), NEW.commission_rate, v_commission_amount,
        COALESCE(NEW.currency, 'USD'), 'accrued',
        'Comisión por factura de venta - ' || COALESCE(NEW.number, NEW.id::text)
    );

    RETURN NEW;
END;
$function$;
