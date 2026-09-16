-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_32_fix_commission_payee_id_uuid`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 21322fcf8deaecac328d188f8ea522aa). No reformatear.
-- F0 r4 · Tarea 2c: al certificar la coherencia de
-- trg_create_commission_on_opportunity_won tras el cambio de
-- fn_sync_status_from_stage apareció un error de tipos latente:
--   commissions.payee_id es UUID y la función insertaba NEW.salesperson_id::text
--   -> ERROR 42804 "column payee_id is of type uuid but expression is of type text".
-- Como el trigger corre dentro de la misma transacción del cambio de etapa, la
-- PRIMERA oportunidad con comisión configurada que se cerrara como ganada habría
-- hecho fallar el cambio de etapa completo. Hoy no hay ninguna oportunidad con
-- commission_type<>'none' + commission_rate>0 + salesperson_id (0 filas) y
-- commissions no tiene ninguna fila con source_type='opportunity', por lo que el
-- camino nunca se había ejecutado con éxito.
-- Se corrige solo el cast (source_id sí es text y se deja como está).
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

    SELECT id INTO v_branch_id FROM branches WHERE organization_id = NEW.organization_id LIMIT 1;
    IF v_branch_id IS NULL THEN
        v_branch_id := 1;
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