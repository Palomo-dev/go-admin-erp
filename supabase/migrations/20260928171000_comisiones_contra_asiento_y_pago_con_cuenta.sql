-- Comisiones · contra-asiento al cancelar y pago contra la cuenta de dinero elegida (2026-09-28).
--
-- Hallazgos verificados por MCP:
--   - fn_auto_journal_commission solo contabilizaba 'accrued' y 'paid'. Rechazar
--     (accrued → cancelled), clawback (paid → cancelled) o anular la venta del
--     POS (pos_anular_venta_v1 pone las devengadas en cancelled) dejaban vivo el
--     asiento del devengo y, en el clawback, también el del pago.
--   - El pago acreditaba siempre la cuenta fija de la regla (1110 en 77
--     organizaciones, 1101 en 12), sin saber de qué cuenta salió el dinero, y no
--     guardaba quién pagó.
--
-- Qué hace (ADR-CC-012: un asiento publicado no se edita ni se borra, se revierte):
--   1. Al pasar a 'cancelled' desde 'accrued' o 'paid', revierte con
--      fn_revertir_asiento_en_fecha (fecha de hoy, categoría 'anulacion_comision')
--      cada asiento publicado de la comisión que siga sin revertir: el devengo y,
--      si estaba pagada, el pago. Es idempotente (fact_key 'reversal:<id>').
--   2. El asiento del pago acredita la cuenta de dinero elegida
--      (metadata.bank_account_id / metadata.payment_method →
--      fn_money_account_code_pago, la misma resolución que los pagos). Sin
--      elección, la de la regla, como antes.
--   3. BEFORE UPDATE: estampa metadata.paid_by / cancelled_by con el usuario de la
--      sesión cuando la transición no lo trae (cubre la nómina y cualquier otra vía).
--
-- Egreso en tesorería: NO se crea fila en payments ni en bank_transactions. Motivo
-- (evidencia en docs/hallazgos/comisiones-e-impuestos-2026-09-28.md): payments no tiene dirección y tres
-- lectores cuentan como ingreso todo lo que no sea compra (CajasService.ts salesCash,
-- reportesService.getPaymentMethodsReport, kpiCards); y bank_transactions /
-- cash_movements generan su propio asiento con la regla genérica (doble crédito
-- a la cuenta de dinero). El movimiento de tesorería queda pendiente del rediseño
-- de tesorería en curso. El asiento del pago sí refleja ya la salida real.
--
-- Daño medido (2026-09-28): 232 comisiones, todas 'accrued' con su asiento de
-- devengo; 0 canceladas ni pagadas. Nada que corregir hacia atrás.

-- ── 1. Quién pagó / canceló ─────────────────────────────────────────────────
create or replace function public.fn_commission_estampar_actor()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or NEW.status is not distinct from OLD.status then
    return NEW;
  end if;
  if NEW.status = 'paid' and coalesce(NEW.metadata->>'paid_by', '') = '' then
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object('paid_by', v_uid);
  elsif NEW.status = 'cancelled' and coalesce(NEW.metadata->>'cancelled_by', '') = '' then
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object('cancelled_by', v_uid);
  end if;
  return NEW;
end;
$function$;

revoke all on function public.fn_commission_estampar_actor() from public, anon, authenticated;

drop trigger if exists trg_commission_estampar_actor on public.commissions;
create trigger trg_commission_estampar_actor
  before update of status on public.commissions
  for each row execute function public.fn_commission_estampar_actor();

-- ── 2. Asientos de la comisión ──────────────────────────────────────────────
create or replace function public.fn_auto_journal_commission()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_branch_id integer;
    v_event_type text;
    v_memo text;
    v_source_id text;
    v_credit text;
    v_je RECORD;
BEGIN
    IF NEW.status IS NULL THEN
        RETURN NEW;
    END IF;

    -- Cancelar (rechazo, clawback, anulación de la venta): contra-asiento de lo
    -- contabilizado. Nunca se borra ni se edita un asiento.
    IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled'
       AND OLD.status IN ('accrued', 'paid') THEN
        FOR v_je IN
            SELECT je.id
              FROM journal_entries je
             WHERE je.organization_id = NEW.organization_id
               AND je.source = 'commissions'
               AND je.source_id IN (NEW.id::text || ':accrued', NEW.id::text || ':paid')
               AND COALESCE(je.posted, false)
               AND NOT EXISTS (SELECT 1 FROM journal_entries r
                                WHERE r.organization_id = je.organization_id
                                  AND r.fact_key = 'reversal:' || je.id)
             ORDER BY je.id
        LOOP
            PERFORM fn_revertir_asiento_en_fecha(
                v_je.id, 'anulacion_comision', 'comision:' || NEW.id::text, now(), auth.uid());
        END LOOP;
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

    -- El pago sale de la cuenta de dinero elegida (misma resolución que payments);
    -- sin elección, la cuenta de la regla, como antes.
    v_credit := v_rule.credit_account_code;
    IF v_event_type = 'paid'
       AND (COALESCE(NEW.metadata->>'bank_account_id', '') <> '' OR COALESCE(NEW.metadata->>'payment_method', '') <> '') THEN
        v_credit := COALESCE(
            fn_money_account_code_pago(
                NEW.organization_id, v_branch_id,
                NULLIF(NEW.metadata->>'payment_method', ''),
                CASE WHEN COALESCE(NEW.metadata->>'bank_account_id', '') ~ '^[0-9]+$'
                     THEN (NEW.metadata->>'bank_account_id')::integer END),
            v_rule.credit_account_code);
    END IF;

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
        p_credit_account := v_credit,
        p_amount := NEW.commission_amount
    );

    RETURN NEW;
END;
$function$;

revoke all on function public.fn_auto_journal_commission() from public, anon, authenticated;

comment on function public.fn_auto_journal_commission() is
  'Asientos de commissions: devengo, pago (contra la cuenta de dinero elegida en metadata) y, al cancelar, contra-asiento del devengo y del pago (ADR-CC-012).';
