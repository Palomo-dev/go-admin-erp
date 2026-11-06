-- Reversión de 20261107132000_nomina_asiento_sin_titulo_ni_doble_costo.sql
-- Devuelve las dos funciones a su cuerpo anterior (leído de producción con pg_get_functiondef).
-- Advertencia: el cuerpo anterior carga 5195, que es de título: aprobar una colilla vuelve a
-- fallar. No revierte asientos ya contabilizados ni pendientes ya registrados.

CREATE OR REPLACE FUNCTION public.fn_auto_journal_payroll()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_run RECORD;
    v_org_id integer;
    v_branch_id integer;
    v_event_type text;
    v_memo text;
    v_source_id text;
    v_total_debit numeric := 0;
    v_country_code text;
BEGIN
    IF NEW.status IS NULL THEN
        RETURN NEW;
    END IF;

    -- Disparar cuando el slip cambia a 'approved' (devengo) o 'paid' (pago)
    IF (NEW.status = 'approved' OR NEW.status = 'paid')
       AND (OLD.status IS DISTINCT FROM NEW.status) THEN

        SELECT * INTO v_run
        FROM payroll_runs
        WHERE id = NEW.payroll_run_id;

        IF v_run IS NULL THEN
            RETURN NEW;
        END IF;

        SELECT organization_id INTO v_org_id
        FROM payroll_periods
        WHERE id = v_run.payroll_period_id;

        IF v_org_id IS NULL THEN
            RETURN NEW;
        END IF;

        v_event_type := CASE NEW.status
            WHEN 'approved' THEN 'created'
            WHEN 'paid' THEN 'paid'
        END;

        -- Buscar regla contable
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = v_org_id
          AND source_type = 'payroll'
          AND event_type = v_event_type
          AND is_active = true
        ORDER BY priority LIMIT 1;

        IF v_rule IS NULL THEN
            SELECT * INTO v_rule
            FROM accounting_rules
            WHERE organization_id = v_org_id
              AND source_type = 'payroll'
              AND is_active = true
            ORDER BY priority LIMIT 1;
        END IF;

        IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure(coalesce((to_jsonb(NEW)->>'organization_id')::integer, v_org_id), NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')'); RETURN NEW;
        END IF;

        SELECT MIN(id) INTO v_branch_id FROM branches WHERE organization_id = v_org_id;
        SELECT country_code INTO v_country_code FROM organizations WHERE id = v_org_id;

        v_memo := 'Nómina - Slip: ' || NEW.id::text || ' (' || v_event_type || ')';
        v_source_id := NEW.id::text || ':' || v_event_type;

        IF v_event_type = 'paid' THEN
            -- Pago: asiento simple pasivo → banco
            v_entry_id := fn_create_journal_entry(
                p_organization_id := v_org_id,
                p_branch_id := v_branch_id,
                p_entry_date := COALESCE(NEW.paid_at, NEW.updated_at, now()),
                p_memo := v_memo,
                p_source := 'payroll_slips',
                p_source_id := v_source_id,
                p_debit_account := v_rule.debit_account_code,
                p_credit_account := v_rule.credit_account_code,
                p_amount := NEW.net_pay
            );
        ELSE
            -- Devengo: asiento multi-línea con provisiones
            -- Solo si el país tiene plan PUC (COL), usar cuentas detalladas
            -- Para otros países, usar fn_create_journal_entry simple
            IF v_country_code = 'COL' THEN
                -- Crear cabecera
                INSERT INTO journal_entries (
                    organization_id, branch_id, entry_date, memo,
                    source, source_id, posted
                ) VALUES (
                    v_org_id, v_branch_id,
                    COALESCE(NEW.updated_at, now()),
                    v_memo, 'payroll_slips', v_source_id, true
                ) RETURNING id INTO v_entry_id;

                -- 1. Gasto salario base (5105)
                IF COALESCE(NEW.gross_pay, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5105', 'Salario base', NEW.gross_pay, 0);
                    v_total_debit := v_total_debit + NEW.gross_pay;
                END IF;

                -- 2. Salud patronal (5195) → pasivo (2370)
                IF COALESCE(NEW.employer_health, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5195', 'Salud patronal', NEW.employer_health, 0);
                    v_total_debit := v_total_debit + NEW.employer_health;
                END IF;

                -- 3. Pensión patronal (5195) → pasivo (2370)
                IF COALESCE(NEW.employer_pension, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5195', 'Pensión patronal', NEW.employer_pension, 0);
                    v_total_debit := v_total_debit + NEW.employer_pension;
                END IF;

                -- 4. ARL (5195)
                IF COALESCE(NEW.employer_arl, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5195', 'ARL patronal', NEW.employer_arl, 0);
                    v_total_debit := v_total_debit + NEW.employer_arl;
                END IF;

                -- 5. Parafiscales (5195)
                IF COALESCE(NEW.employer_parafiscales, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5195', 'Parafiscales', NEW.employer_parafiscales, 0);
                    v_total_debit := v_total_debit + NEW.employer_parafiscales;
                END IF;

                -- 6. Cesantías (5195)
                IF COALESCE(NEW.employer_severance, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5195', 'Provisión cesantías', NEW.employer_severance, 0);
                    v_total_debit := v_total_debit + NEW.employer_severance;
                END IF;

                -- 7. Interés cesantías (5195)
                IF COALESCE(NEW.employer_severance_interest, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5195', 'Interés cesantías', NEW.employer_severance_interest, 0);
                    v_total_debit := v_total_debit + NEW.employer_severance_interest;
                END IF;

                -- 8. Provisión vacaciones (5195)
                IF COALESCE(NEW.employer_vacation_provision, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5195', 'Provisión vacaciones', NEW.employer_vacation_provision, 0);
                    v_total_debit := v_total_debit + NEW.employer_vacation_provision;
                END IF;

                -- 9. Provisión prima (5195)
                IF COALESCE(NEW.employer_bonus_provision, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5195', 'Provisión prima', NEW.employer_bonus_provision, 0);
                    v_total_debit := v_total_debit + NEW.employer_bonus_provision;
                END IF;

                -- Línea de crédito: pasivo nómina por pagar (clave nomina_por_pagar → 25050501; 2505 es título, contador 25-oct-2026)
                -- Total = net_pay (al empleado) + todas las provisiones patronales
                INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                VALUES (v_entry_id, v_org_id,
                        coalesce(public.fn_cuenta_por_clave(v_org_id, v_branch_id, 'nomina_por_pagar'), '25050501'),
                        'Nómina por pagar', 0, v_total_debit);

            ELSE
                -- Para otros países, asiento simple con gross_pay
                v_entry_id := fn_create_journal_entry(
                    p_organization_id := v_org_id,
                    p_branch_id := v_branch_id,
                    p_entry_date := COALESCE(NEW.updated_at, now()),
                    p_memo := v_memo,
                    p_source := 'payroll_slips',
                    p_source_id := v_source_id,
                    p_debit_account := v_rule.debit_account_code,
                    p_credit_account := v_rule.credit_account_code,
                    p_amount := NEW.net_pay
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_auto_journal_payroll_period()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_branch_id integer;
    v_event_type text;
    v_amount numeric;
BEGIN
    IF NEW.status IS NULL THEN
        RETURN NEW;
    END IF;

    -- 'approved' → event_type 'created' (provisionar costo patronal)
    -- 'paid' → event_type 'paid' (pagar obligaciones patronales)
    IF (NEW.status = 'approved' OR NEW.status = 'paid')
       AND (OLD.status IS DISTINCT FROM NEW.status) THEN

        v_event_type := CASE NEW.status
            WHEN 'approved' THEN 'created'
            WHEN 'paid' THEN 'paid'
        END;

        -- Monto = costo patronal (no duplica slips que usan net_pay)
        v_amount := COALESCE(NEW.total_employer_cost, 0);
        IF v_amount <= 0 THEN
            RETURN NEW;
        END IF;

        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = 'payroll_period'
          AND event_type = v_event_type
          AND is_active = true
        ORDER BY priority LIMIT 1;

        IF v_rule IS NULL THEN
            SELECT * INTO v_rule
            FROM accounting_rules
            WHERE organization_id = NEW.organization_id
              AND source_type = 'payroll_period'
              AND is_active = true
            ORDER BY priority LIMIT 1;
        END IF;

        IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure((to_jsonb(NEW)->>'organization_id')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')'); RETURN NEW;
        END IF;

        SELECT MIN(id) INTO v_branch_id FROM branches WHERE organization_id = NEW.organization_id;

        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := v_branch_id,
            p_entry_date := COALESCE(NEW.payment_date, NEW.approved_at, NEW.updated_at, now()),
            p_memo := 'Cierre Período Nómina - ' || COALESCE(NEW.name, NEW.id::text) || ' (' || v_event_type || ')',
            p_source := 'payroll_periods',
            p_source_id := NEW.id::text || ':' || v_event_type,
            p_debit_account := v_rule.debit_account_code,
            p_credit_account := v_rule.credit_account_code,
            p_amount := v_amount
        );
    END IF;

    RETURN NEW;
END;
$function$;

revoke all on function public.fn_auto_journal_payroll() from public, anon, authenticated;
revoke all on function public.fn_auto_journal_payroll_period() from public, anon, authenticated;
grant execute on function public.fn_auto_journal_payroll() to service_role;
grant execute on function public.fn_auto_journal_payroll_period() to service_role;
