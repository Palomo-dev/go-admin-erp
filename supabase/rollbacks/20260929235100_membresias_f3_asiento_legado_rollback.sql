-- Rollback de 20260929235100_membresias_f3_asiento_legado.sql
-- Vuelve a ACTIVAR trg_auto_journal_membership y trg_auto_journal_membership_payment y reinstala
-- fn_auto_journal_membership tal como estaba (versión de 20260929001000: lee membership_plans.price y
-- une member_branches por el id de la membresía). No hay datos que restaurar: mientras estuvieron
-- desactivados no se dejó de crear ningún asiento que antes se creara (0 en toda la historia).
-- OJO: si ya se aplicó el DROP de membership_plans.price, NO reinstales esta función.

set local lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_auto_journal_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_rule RECORD;
    v_amount numeric;
    v_description text;
    v_org_id integer;
    v_branch_id integer;
    v_plan_name text;
    v_plan_price numeric;
    v_event_type text;
    v_customer_name text;
    v_existing_entry integer;
BEGIN
    -- Membresías (20260929001000): las del modelo nuevo las contabiliza su venta o factura.
    IF NEW.source IS NOT NULL OR NEW.sale_item_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_org_id := NEW.organization_id;

    -- Obtener datos del plan
    SELECT name, price INTO v_plan_name, v_plan_price
    FROM membership_plans
    WHERE id = NEW.membership_plan_id
    LIMIT 1;

    v_amount := COALESCE(v_plan_price, 0);
    IF v_amount <= 0 THEN
        RETURN NEW;
    END IF;

    -- Obtener nombre del cliente para descripción
    SELECT (first_name || ' ' || last_name) INTO v_customer_name
    FROM customers
    WHERE id = NEW.customer_id
    LIMIT 1;

    -- Obtener branch_id desde member_branches (primera sucursal del miembro)
    SELECT mb.branch_id INTO v_branch_id
    FROM member_branches mb
    WHERE mb.organization_member_id = NEW.id
    LIMIT 1;

    v_branch_id := COALESCE(v_branch_id, 0);

    -- =====================================================
    -- INSERT: Nueva membresía
    -- =====================================================
    IF TG_OP = 'INSERT' THEN
        -- Si tiene sale_id, la venta ya fue contabilizada por trg_auto_journal_sale
        IF NEW.sale_id IS NOT NULL THEN
            RETURN NEW;
        END IF;

        -- Verificar si ya existe asiento para esta membresía
        SELECT je.id INTO v_existing_entry
        FROM journal_entries je
        WHERE je.source = 'membership'
          AND je.source_id = NEW.id::text
          AND je.organization_id = v_org_id
        LIMIT 1;

        IF v_existing_entry IS NOT NULL THEN
            RETURN NEW;
        END IF;

        -- Determinar evento: created (contado) o created_credit (crédito)
        -- Por defecto asumimos contado al crear membresía
        v_event_type := 'created';

        v_description := 'Membresía Gym - ' || COALESCE(v_plan_name, 'Plan') || ' - ' || COALESCE(v_customer_name, 'Cliente');

        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = v_org_id
          AND source_type = 'membership'
          AND event_type = v_event_type
          AND is_active = true
        ORDER BY priority
        LIMIT 1;

        IF FOUND THEN
            PERFORM fn_create_journal_entry(
                v_org_id,
                v_branch_id,
                COALESCE(NEW.created_at, now()),
                v_description,
                'membership',
                NEW.id::text,
                v_rule.debit_account_code,
                v_rule.credit_account_code,
                v_amount
            );
        END IF;

        RETURN NEW;
    END IF;

    -- =====================================================
    -- UPDATE: Cambio de status
    -- =====================================================
    IF TG_OP = 'UPDATE' AND (NEW.status IS DISTINCT FROM OLD.status) THEN

        -- RENOVACIÓN: status vuelve a active desde expired/cancelled
        IF NEW.status = 'active' AND OLD.status IN ('expired', 'cancelled') THEN
            -- Si tiene sale_id, la venta ya contabiliza
            IF NEW.sale_id IS NOT NULL THEN
                RETURN NEW;
            END IF;

            -- Verificar asiento de renovación existente
            SELECT je.id INTO v_existing_entry
            FROM journal_entries je
            WHERE je.source = 'membership'
              AND je.source_id = NEW.id::text
              AND je.organization_id = v_org_id
              AND je.memo LIKE '%Renovación%'
            LIMIT 1;

            IF v_existing_entry IS NOT NULL THEN
                RETURN NEW;
            END IF;

            v_event_type := 'renewed';
            v_description := 'Renovación Membresía Gym - ' || COALESCE(v_plan_name, 'Plan') || ' - ' || COALESCE(v_customer_name, 'Cliente');

            SELECT * INTO v_rule
            FROM accounting_rules
            WHERE organization_id = v_org_id
              AND source_type = 'membership'
              AND event_type = v_event_type
              AND is_active = true
            ORDER BY priority
            LIMIT 1;

            IF FOUND THEN
                PERFORM fn_create_journal_entry(
                    v_org_id,
                    v_branch_id,
                    COALESCE(NEW.updated_at, now()),
                    v_description,
                    'membership',
                    NEW.id::text,
                    v_rule.debit_account_code,
                    v_rule.credit_account_code,
                    v_amount
                );
            END IF;

        -- CANCELACIÓN: de active a cancelled
        ELSIF NEW.status = 'cancelled' AND OLD.status = 'active' THEN
            -- Solo reversar si no tiene sale_id (la venta maneja su propia reversa)
            IF NEW.sale_id IS NOT NULL THEN
                RETURN NEW;
            END IF;

            v_event_type := 'cancelled';
            v_description := 'Reversa Cancelación Membresía - ' || COALESCE(v_plan_name, 'Plan') || ' - ' || COALESCE(v_customer_name, 'Cliente');

            SELECT * INTO v_rule
            FROM accounting_rules
            WHERE organization_id = v_org_id
              AND source_type = 'membership'
              AND event_type = v_event_type
              AND is_active = true
            ORDER BY priority
            LIMIT 1;

            IF FOUND THEN
                PERFORM fn_create_journal_entry(
                    v_org_id,
                    v_branch_id,
                    COALESCE(NEW.updated_at, now()),
                    v_description,
                    'membership',
                    NEW.id::text,
                    v_rule.debit_account_code,
                    v_rule.credit_account_code,
                    v_amount
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

alter table public.memberships enable trigger trg_auto_journal_membership;
alter table public.payments enable trigger trg_auto_journal_membership_payment;

comment on function public.fn_auto_journal_membership() is null;
comment on function public.fn_auto_journal_membership_payment() is null;
comment on trigger trg_auto_journal_membership on public.memberships is null;
comment on trigger trg_auto_journal_membership_payment on public.payments is null;
