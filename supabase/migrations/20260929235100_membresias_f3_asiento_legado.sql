-- Membresías — fase 3, R4: el asiento contable viejo de membresías (docs/design/MEMBRESIAS-FASE-1-2.md §11.2).
--
-- Evidencia (2026-09-29, solo conteos):
--   · memberships: 1 fila, source='manual_legacy' (la sale de fn_auto_journal_membership desde 20260929001000).
--     Filas legadas SIN source ni sale_item_id: 0.
--   · payments con source='membership': 0 en toda la historia. membership_payments: 0.
--   · journal_entries con source 'membership' o 'membership_payment': 0 en toda la historia.
--   · accounting_rules source_type='membership': 94 filas en 89 organizaciones; el evento 'created' de 88 de
--     ellas debita 1105 (Caja) y acredita 4250: un alta sin cobro del módulo gym viejo (master) registraría
--     dinero en caja que ningún turno de caja recibió, y si además se cobraba por el POS, ingreso doble.
--   · goadmin-websites no llega a disparar ninguno: su alta de membresía usa status 'pending_payment' (la
--     CHECK la rechaza) y sus pagos entran con status 'paid' (fn_auto_journal_membership_payment solo mira
--     'completed').
--   · El modelo nuevo (fases 1-2) ya se contabiliza por la venta: trg_auto_journal_sale_pos (sales),
--     trg_auto_journal_sale (invoice_sales) y trg_auto_journal_payment (payments source invoice_sales/sale).
--
-- Decisión: se DESACTIVAN trg_auto_journal_membership (memberships) y trg_auto_journal_membership_payment
-- (payments). No hay pagos ni membresías legadas que los necesiten y lo único que aún podrían contabilizar
-- es un ingreso sin cobro. Desactivar no lanza errores en master (sus insert siguen funcionando).
-- Además fn_auto_journal_membership deja de leer membership_plans.price (P9: precio vigente del producto)
-- y de unir member_branches por el id de la membresía (error: siempre caía a sucursal 0; ahora usa
-- memberships.branch_id), para que reactivarla —si algún día hiciera falta— no reintroduzca los errores.
-- Se revierte con el rollback (vuelve a activar ambos y reinstala la función anterior).

set local lock_timeout = '5s';

create or replace function public.fn_auto_journal_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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

    -- Membresías (20260929235100): precio vigente del producto del plan (P9), no membership_plans.price.
    SELECT mp.name, public.fn_membresias_int_precio_vigente(mp.product_id)
      INTO v_plan_name, v_plan_price
      FROM membership_plans mp
     WHERE mp.id = NEW.membership_plan_id
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

    -- Membresías (20260929235100): la sucursal es la de la membresía (antes unía member_branches por
    -- el id de la membresía y siempre caía a 0).
    v_branch_id := COALESCE(NEW.branch_id, 0);

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
revoke all on function public.fn_auto_journal_membership() from public, anon;

alter table public.memberships disable trigger trg_auto_journal_membership;
alter table public.payments disable trigger trg_auto_journal_membership_payment;

comment on function public.fn_auto_journal_membership() is
  'Legado (módulo gym viejo). Su disparador trg_auto_journal_membership está DESACTIVADO desde 20260929235100: '
  'las membresías del modelo nuevo se contabilizan por su venta/factura/pago. Ver docs/design/MEMBRESIAS-FASE-1-2.md §11.2.';
comment on function public.fn_auto_journal_membership_payment() is
  'Legado (módulo gym viejo). Su disparador trg_auto_journal_membership_payment está DESACTIVADO desde 20260929235100: '
  '0 pagos con source=membership en la historia. Ver docs/design/MEMBRESIAS-FASE-1-2.md §11.2.';
comment on trigger trg_auto_journal_membership on public.memberships is
  'DESACTIVADO (20260929235100, R4): el ingreso de una membresía lo contabiliza su venta o factura.';
comment on trigger trg_auto_journal_membership_payment on public.payments is
  'DESACTIVADO (20260929235100, R4): 0 pagos con source=membership; el cobro lo contabiliza trg_auto_journal_payment.';
