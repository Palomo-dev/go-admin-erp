-- ============================================================
-- ROLLBACK de 20260909045617_crm_v4_f00_32_fix_commission_payee_id_uuid
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Restaura el cuerpo ANTERIOR de fn_create_commission_on_opportunity_won: la
-- migración afirma que solo cambió el cast (NEW.salesperson_id::text -> uuid), así
-- que la versión previa es este mismo cuerpo con el ::text. No se hace DROP (el
-- trigger trg_create_commission_on_opportunity_won sigue apuntando aquí).
-- ADVERTENCIA: la versión anterior falla con ERROR 42804 en la PRIMERA
-- oportunidad con comisión que se cierre como ganada, y como corre dentro de la
-- transacción del cambio de etapa, hace fallar ese cambio completo. Solo tiene
-- sentido ejecutar este rollback para una reversión byte a byte.
--
-- SOBRE LOS DATOS: no toca datos.
-- ============================================================

begin;
create or replace function public.fn_create_commission_on_opportunity_won()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
DECLARE
    v_commission_amount numeric;
    v_payee_name text;
    v_existing_commission_count integer;
    v_branch_id integer;
BEGIN
    IF NEW.status <> 'won' THEN RETURN NEW; END IF;
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    IF NEW.commission_type = 'none' OR NEW.commission_rate IS NULL OR NEW.commission_rate <= 0 THEN RETURN NEW; END IF;
    IF NEW.salesperson_id IS NULL THEN RETURN NEW; END IF;
    SELECT COUNT(*) INTO v_existing_commission_count FROM commissions WHERE source_type = 'opportunity' AND source_id = NEW.id::text;
    IF v_existing_commission_count > 0 THEN RETURN NEW; END IF;
    v_commission_amount := ROUND(COALESCE(NEW.amount, 0) * NEW.commission_rate / 100.0, 2);
    IF v_commission_amount <= 0 THEN RETURN NEW; END IF;
    SELECT COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email, 'Vendedor') INTO v_payee_name
      FROM auth.users WHERE id = NEW.salesperson_id;
    v_payee_name := COALESCE(v_payee_name, 'Vendedor');
    SELECT id INTO v_branch_id FROM branches WHERE organization_id = NEW.organization_id LIMIT 1;
    IF v_branch_id IS NULL THEN v_branch_id := 1; END IF;
    INSERT INTO commissions (
        organization_id, branch_id, commission_type, source_type, source_id,
        payee_type, payee_id, payee_name, base_amount, commission_rate, commission_amount,
        currency, status, notes
    ) VALUES (
        NEW.organization_id, v_branch_id, NEW.commission_type, 'opportunity', NEW.id::text,
        'employee', NEW.salesperson_id::text, v_payee_name,   -- versión anterior (bug 42804)
        COALESCE(NEW.amount, 0), NEW.commission_rate, v_commission_amount,
        COALESCE(NEW.currency, 'USD'), 'accrued',
        'Comisión por oportunidad ganada - ' || NEW.name
    );
    RETURN NEW;
END;
$function$;
commit;
