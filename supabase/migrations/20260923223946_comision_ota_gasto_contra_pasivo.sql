-- F-65 / ADR-CC-013 · La comisión de OTA es gasto contra una cuenta por pagar al canal
--
-- Decisión del dueño (2026-09-23): la comisión de Booking/Expedia se contabiliza
-- como gasto de comisiones (5235) contra cuentas por pagar al canal (2335, o su
-- equivalente en el plan de la organización). Si la OTA descuenta la comisión
-- del pago, el neto va a bancos.
--
-- Estado encontrado (después de 20260923223149, que arregló la llamada a
-- fn_create_journal_entry):
--   - orgs 1–115: regla ota_commission/confirmed 5205/2205;
--   - orgs 116–149: regla ota_commission/created 5105 (gastos de personal)
--     contra 1305 (clientes). La función solo buscaba 'confirmed', así que en
--     esas organizaciones salía sin asiento y sin dejar rastro;
--   - 2335 existe en 1 de 85 planes; 5235 en 83.
--   - 0 reservas de OTA hasta hoy: no hay asientos históricos que corregir.

-- ── 1. Cuentas 2335 y 5235 en todos los planes ──────────────────────────────
create or replace function public.fn_asegurar_cuentas_comision_ota(p_organization_id integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent text;
begin
  if not exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '2335') then
    if exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '23') then
      v_parent := '23';
    elsif exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '2') then
      v_parent := '2';
    else
      select parent_code into v_parent from chart_of_accounts
       where organization_id = p_organization_id and account_code in ('2205', '2105', '2370') and parent_code is not null
       order by account_code limit 1;
    end if;
    insert into chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description)
    values (p_organization_id, '2335', 'Costos y gastos por pagar', 'liability', v_parent, true,
            'Obligaciones por costos y gastos, entre ellas la comisión por pagar a los canales de venta (OTA)')
    on conflict (organization_id, account_code) do nothing;
  end if;

  if not exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '5235') then
    select parent_code into v_parent from chart_of_accounts
     where organization_id = p_organization_id and account_code in ('5205', '5105', '5195') and parent_code is not null
     order by account_code limit 1;
    insert into chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description)
    values (p_organization_id, '5235', 'Comisiones', 'expense', v_parent, true,
            'Gasto por comisiones, entre ellas las de los canales de venta (OTA)')
    on conflict (organization_id, account_code) do nothing;
  end if;
end;
$$;
revoke all on function public.fn_asegurar_cuentas_comision_ota(integer) from public, anon, authenticated;

select public.fn_asegurar_cuentas_comision_ota(o.id) from public.organizations o;

create or replace function public.trg_fn_asegurar_cuentas_comision_ota()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_asegurar_cuentas_comision_ota(new.id);
  return new;
exception when others then
  raise warning 'No se pudieron crear las cuentas 2335/5235 para la organización %: %', new.id, sqlerrm;
  return new;
end;
$$;
revoke all on function public.trg_fn_asegurar_cuentas_comision_ota() from public, anon, authenticated;

-- Mismo punto que la 2805: después de crear el plan de cuentas por defecto.
drop trigger if exists tr_auto_create_chart_of_accounts_zz_comision_ota on public.organizations;
create trigger tr_auto_create_chart_of_accounts_zz_comision_ota
  after insert on public.organizations
  for each row execute function public.trg_fn_asegurar_cuentas_comision_ota();

-- ── 2. Una sola regla por organización: confirmed, 5235 → 2335 ─────────────
update public.accounting_rules
   set event_type = 'confirmed',
       debit_account_code = '5235',
       credit_account_code = '2335',
       name = 'Comision OTA',
       description = 'Comisión del canal (Booking/Expedia): gasto contra cuenta por pagar al canal (ADR-CC-013)',
       updated_at = now()
 where source_type = 'ota_commission';

-- Organizaciones nuevas (plan COL): la misma regla.
do $$
declare
  v_def text;
  v_old text := $q$(org_id, 'Comision OTA', 'Comision de OTA', 'ota_commission', 'created', '5105', '1305', NULL, false, 30, true)$q$;
  v_new text := $q$(org_id, 'Comision OTA', 'Comisión del canal: gasto contra cuenta por pagar al canal (ADR-CC-013)', 'ota_commission', 'confirmed', '5235', '2335', NULL, false, 30, true)$q$;
begin
  v_def := pg_get_functiondef('public.fn_create_default_accounting_rules(integer, text)'::regprocedure);
  if position(v_old in v_def) = 0 then
    raise exception 'fn_create_default_accounting_rules cambió: no se encontró la regla OTA de COL a reemplazar';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- ── 3. El disparador busca la regla sin importar el evento y deja rastro ────
-- Cuerpo vigente (20260923223149, sesión de CRM) con dos cambios: acepta
-- cualquier regla activa de ota_commission y, si no hay, registra el rechazo
-- en journal_entry_failures (F-60) en vez de salir en silencio.
create or replace function public.fn_auto_journal_ota_commission()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_reservation RECORD;
    v_amount numeric;
    v_description text;
    v_channel text;
    v_priority smallint;
    v_branch_id integer;
    v_event_type text := 'confirmed';
    v_entry_id integer;
BEGIN
    v_amount := COALESCE(NEW.commission_amount, 0);
    IF v_amount <= 0 THEN
        RETURN NEW;
    END IF;

    v_channel := CASE TG_TABLE_NAME
        WHEN 'booking_reservation_details' THEN 'booking'
        WHEN 'expedia_reservation_details' THEN 'expedia'
        ELSE 'unknown'
    END;

    v_priority := CASE v_channel
        WHEN 'booking' THEN 10
        WHEN 'expedia' THEN 11
        ELSE 10
    END;

    SELECT r.organization_id, r.branch_id INTO v_reservation
    FROM reservations r
    WHERE r.id = NEW.reservation_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Regla del canal (por prioridad) y, si no, cualquier regla activa de
    -- comisión OTA de la organización, sea cual sea su evento.
    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = v_reservation.organization_id
      AND source_type = 'ota_commission'
      AND is_active = true
    ORDER BY (priority = v_priority) DESC, (event_type = v_event_type) DESC, priority
    LIMIT 1;

    IF NOT FOUND THEN
        PERFORM fn_log_journal_failure(
            v_reservation.organization_id, v_reservation.branch_id, COALESCE(NEW.updated_at, NEW.created_at, now()),
            'ota_commission', NEW.id::text || ':' || v_event_type, 'accrual:ota_commission:' || NEW.id::text,
            NULL, NULL, v_amount, 'no_rule', 'Sin regla contable activa de comisión OTA');
        RETURN NEW;
    END IF;

    -- La sucursal sale de la reserva si es de esta organizacion; si no, la
    -- principal de la organizacion. NUNCA la sucursal 0, que no existe.
    v_branch_id := NULL;

    IF v_reservation.branch_id IS NOT NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.id = v_reservation.branch_id
           AND b.organization_id = v_reservation.organization_id;
    END IF;

    IF v_branch_id IS NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.organization_id = v_reservation.organization_id
         ORDER BY (b.is_main IS TRUE) DESC, (b.is_active IS TRUE) DESC, b.id ASC
         LIMIT 1;
    END IF;

    IF v_branch_id IS NULL THEN
        RAISE WARNING 'fn_auto_journal_ota_commission: la organizacion % no tiene ninguna sucursal; no se crea el asiento de la reserva %',
              v_reservation.organization_id, NEW.reservation_id;
        RETURN NEW;
    END IF;

    v_description := 'Comision ' || v_channel || ' - Reserva ' || NEW.reservation_id::text;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := v_reservation.organization_id,
        p_branch_id       := v_branch_id,
        p_entry_date      := COALESCE(NEW.updated_at, NEW.created_at, now()),
        p_memo            := v_description,
        p_source          := 'ota_commission',
        p_source_id       := NEW.id::text || ':' || v_event_type,
        p_debit_account   := v_rule.debit_account_code,
        p_credit_account  := v_rule.credit_account_code,
        p_amount          := v_amount,
        p_fact_key        := 'accrual:ota_commission:' || NEW.id::text
    );

    RETURN NEW;
END;
$function$;

-- ── 4. El canal paga el neto: bancos por el neto, 2335 por la comisión ─────
-- Dr Bancos (bruto − comisión) · Dr 2335 (comisión) / Cr 1305 (bruto).
-- Salda la cuenta por cobrar de la reserva y el pasivo con el canal en un solo
-- hecho. Idempotente por fact_key settlement:ota_payout:{detalle}.
create or replace function public.fn_liquidar_pago_ota(
  p_canal text,
  p_detail_id uuid,
  p_monto_bruto numeric,
  p_bank_account_id integer default null,
  p_fecha timestamptz default now(),
  p_referencia text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_det record;
  v_res record;
  v_rule record;
  v_branch integer;
  v_banco text;
  v_neto numeric;
  v_entry integer;
  v_fk text := 'settlement:ota_payout:' || p_detail_id;
  v_memo text;
begin
  if p_canal = 'booking' then
    select id, reservation_id, commission_amount into v_det from public.booking_reservation_details where id = p_detail_id;
  elsif p_canal = 'expedia' then
    select id, reservation_id, commission_amount into v_det from public.expedia_reservation_details where id = p_detail_id;
  else
    raise exception 'CANAL_INVALIDO: %', p_canal using errcode = '22023';
  end if;
  if v_det.id is null then
    raise exception 'RESERVA_OTA_INEXISTENTE' using errcode = 'P0002';
  end if;

  select r.organization_id, r.branch_id into v_res from public.reservations r where r.id = v_det.reservation_id;
  perform public.fn_assert_acceso_org(v_res.organization_id);
  if v_uid is not null and not public.fn_tiene_permiso(v_res.organization_id, 'finance.create') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  select id into v_entry from public.journal_entries where organization_id = v_res.organization_id and fact_key = v_fk;
  if v_entry is not null then
    return v_entry;
  end if;

  if coalesce(p_monto_bruto, 0) <= coalesce(v_det.commission_amount, 0) then
    raise exception 'MONTO_INVALIDO: el bruto debe superar la comisión (%)', v_det.commission_amount using errcode = '22023';
  end if;

  select * into v_rule from public.accounting_rules
   where organization_id = v_res.organization_id and source_type = 'ota_commission' and is_active
   order by (event_type = 'confirmed') desc, priority limit 1;

  select b.id into v_branch from public.branches b
   where b.organization_id = v_res.organization_id
   order by (b.id = v_res.branch_id) desc, (b.is_main is true) desc, b.id limit 1;

  v_banco := coalesce(public.fn_money_account_code_pago(v_res.organization_id, v_branch, 'transfer', p_bank_account_id), '1110');
  v_neto := p_monto_bruto - coalesce(v_det.commission_amount, 0);
  v_memo := 'Pago neto ' || p_canal || ' - Reserva ' || v_det.reservation_id || coalesce(' - Ref: ' || p_referencia, '');

  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key)
  values (v_res.organization_id, v_branch, coalesce(p_fecha, now()), v_memo, 'ota_payout', p_detail_id::text, true, v_uid, v_fk)
  returning id into v_entry;

  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
  values (v_entry, v_banco, 'Neto recibido del canal', v_neto, 0);
  if coalesce(v_det.commission_amount, 0) > 0 then
    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry, coalesce(v_rule.credit_account_code, '2335'), 'Comisión descontada por el canal', v_det.commission_amount, 0);
  end if;
  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
  values (v_entry, '1305', 'Cobro de la reserva por el canal', 0, p_monto_bruto);

  return v_entry;
end;
$$;
revoke all on function public.fn_liquidar_pago_ota(text, uuid, numeric, integer, timestamptz, text) from public, anon;
grant execute on function public.fn_liquidar_pago_ota(text, uuid, numeric, integer, timestamptz, text) to authenticated, service_role;
