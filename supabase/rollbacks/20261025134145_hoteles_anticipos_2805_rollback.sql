-- Rollback de 20261025134145 (rehecha QA ROJO 8dc44d22). Revertir ANTES 134120. Octubre 2026 ABIERTO
-- (contraasiento con fn_revertir_asiento). Restaura fn_auto_journal_reservation y fn_auto_journal_folio_payment
-- tal como están en prod (md5 363e488b… / b3814c47…).
set constraints public.trg_chart_cuenta_titulo_configurada immediate;
CREATE OR REPLACE FUNCTION public.fn_auto_journal_reservation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_rule RECORD;
    v_amount numeric;
    v_event_type text;
    v_description text;
    v_branch_id integer;
BEGIN
    -- Solo actuar cuando el status cambia
    IF (NEW.status IS NOT DISTINCT FROM OLD.status) THEN
        RETURN NEW;
    END IF;

    -- Determinar event_type segun el nuevo status
    v_event_type := CASE NEW.status
        WHEN 'confirmed' THEN 'confirmed'
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'no_show' THEN 'no_show'
        ELSE NULL
    END;

    IF v_event_type IS NULL THEN
        RETURN NEW;
    END IF;

    -- Solo si hay monto estimado
    v_amount := COALESCE(NEW.total_estimated, 0);
    IF v_amount <= 0 THEN
        RETURN NEW;
    END IF;

    v_branch_id := COALESCE(NEW.branch_id, 0);

    -- Buscar regla contable
    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'reservation'
      AND event_type = v_event_type
      AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    v_description := CASE v_event_type
        WHEN 'confirmed' THEN 'Anticipo Reserva ' || NEW.id::text
        WHEN 'cancelled' THEN 'Reversa Cancelacion Reserva ' || NEW.id::text
        WHEN 'no_show' THEN 'Penalidad No-Show Reserva ' || NEW.id::text
    END;

    -- CORREGIDO: orden correcto de parámetros
    PERFORM fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := v_branch_id,
        p_entry_date := COALESCE(NEW.updated_at, now()),
        p_memo := v_description,
        p_source := 'reservation',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := v_amount
    );

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_auto_journal_folio_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_folio RECORD;
    v_reservation RECORD;
    v_amount numeric;
    v_description text;
    v_source_id_uuid uuid;
BEGIN
    -- Solo pagos vinculados a folios
    IF NEW.source IS DISTINCT FROM 'folio' THEN
        RETURN NEW;
    END IF;

    v_amount := COALESCE(NEW.amount, 0);
    IF v_amount <= 0 THEN
        RETURN NEW;
    END IF;

    -- Convertir source_id (text) a uuid de forma segura
    BEGIN
        v_source_id_uuid := NEW.source_id::uuid;
    EXCEPTION WHEN OTHERS THEN
        RETURN NEW;
    END;

    -- Obtener folio y reserva
    SELECT f.id, f.reservation_id INTO v_folio
    FROM folios f
    WHERE f.id = v_source_id_uuid
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT r.organization_id, r.branch_id INTO v_reservation
    FROM reservations r
    WHERE r.id = v_folio.reservation_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Buscar regla contable
    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = v_reservation.organization_id
      AND source_type = 'folio_payment'
      AND event_type = 'received'
      AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    v_description := 'Pago Folio ' || v_folio.id::text;

    -- Llamar con argumentos nombrados en el orden correcto
    PERFORM fn_create_journal_entry(
        p_organization_id := v_reservation.organization_id,
        p_branch_id := COALESCE(v_reservation.branch_id, 0),
        p_entry_date := NEW.created_at,
        p_memo := v_description,
        p_source := 'folio_payment',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := v_amount,
        p_created_by := NEW.created_by
    );

    RETURN NEW;
END;
$function$;

do $$
declare r record;
begin
  alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;
  for r in select * from public.p1_puc_bitacora where migracion = '134145' order by id desc loop
    if r.objeto = 'journal_entries' then
      if not exists (select 1 from public.journal_entries rv where rv.fact_key = 'reversal:' || r.clave) then
        perform public.fn_revertir_asiento(r.clave::integer, 'rollback-134145', 'puc_migracion');
      end if;
    elsif r.objeto = 'accounting_rules_nueva' then
      delete from public.accounting_rules where id::text = r.clave;
    elsif r.objeto = 'accounting_rules' and r.campo = 'is_active' then
      update public.accounting_rules set is_active = r.valor_anterior::boolean, updated_at = now() where id::text = r.clave;
    elsif r.objeto = 'accounting_rules' and r.campo = 'credit_account_code' then
      update public.accounting_rules set credit_account_code = r.valor_anterior, updated_at = now() where id::text = r.clave;
    elsif r.objeto = 'accounting_rules' and r.campo = 'debit_account_code' then
      update public.accounting_rules set debit_account_code = r.valor_anterior, updated_at = now() where id::text = r.clave;
    elsif r.objeto = 'cuenta_nueva' then
      if exists (select 1 from public.journal_lines l where l.organization_id = r.organization_id and l.account_code = r.clave) then
        raise exception 'rollback 134145: org % cuenta % ya tiene movimientos; revisar con el contador', r.organization_id, r.clave;
      end if;
      delete from public.chart_of_accounts where organization_id = r.organization_id and account_code = r.clave;
    end if;
  end loop;
  delete from public.p1_puc_bitacora where migracion = '134145';
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
end $$;

drop function if exists public.fn_reserva_cuenta_cartera(integer);
drop function if exists public.fn_reserva_cuenta_pago(integer, integer, text, integer, text);
drop function if exists public.fn_reserva_cuenta_anticipo(integer, uuid);
drop function if exists public.fn_reserva_cuenta_regla(integer, integer, text);
drop function if exists public.fn_reserva_anticipo(integer, uuid);

delete from supabase_migrations.schema_migrations where version = '20261025134145';
