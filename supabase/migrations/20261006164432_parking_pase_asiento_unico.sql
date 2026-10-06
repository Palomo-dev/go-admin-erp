-- Aplicada el 2026-10-06 con apply_migration (versión 20261006164432).
-- Urgente parqueadero (abonados): el disparador contable de parking_passes asentaba ingreso de más.
--
-- fn_auto_journal_parking_pass (AFTER INSERT OR UPDATE OF status):
--  * 'suspended' se trataba como reversa y, como 93 de 94 organizaciones solo tienen la regla
--    parking_pass/paid, la reversa caía en esa regla y se asentaba OTRO ingreso. Suspender
--    un abonado sumaba ingreso, y reactivarlo sumaba otro.
--  * El sitio web crea el pase 'suspended' (pendiente de pago): un pase sin pagar ya quedaba
--    como ingreso, y si el pago fallaba ('cancelled') se asentaba un tercero.
--  * Sin fact_key: cualquier update que repitiera status volvía a asentar.
-- Ensayo antes del cambio (org 325, authenticated): alta activa=1 asiento, suspender=2,
-- reactivar=3, cancelar=4. Alta web suspendida (pendiente de pago)=1.
--
-- Además el sitio web, al confirmar el pago, primero activa el pase (asiento del pase) y luego
-- inserta el pago con source 'parking_pass' (fn_auto_journal_parking_payment asienta otra vez
-- para las organizaciones con regla parking_pass/paid, que son 94).
--
-- Cambio:
--  1. Pase: solo asienta cuando el estado CAMBIA. 'active' asienta el ingreso UNA vez por pase
--     (fact_key parking_pass:paid:<id>). 'suspended' no asienta (es una pausa, no dinero).
--     'cancelled' asienta la reversa solo si antes hubo ingreso, una vez
--     (fact_key parking_pass:reversed:<id>), y si no hay regla de reversa propia usa la de
--     ingreso con las cuentas invertidas.
--  2. Pago de pase: no asienta si el pase ya tiene su asiento de ingreso (el ingreso es uno).
-- Ambas funciones conservan SECURITY DEFINER y sus permisos (postgres, service_role).
set lock_timeout = '10s';

create or replace function public.fn_auto_journal_parking_pass()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
    v_rule record;
    v_entry_id integer;
    v_branch_id integer;
    v_debito text;
    v_credito text;
    v_clave_ingreso text := 'parking_pass:paid:' || new.id::text;
begin
    if new.status is null then return new; end if;

    -- Solo cuando el estado cambia.
    if tg_op = 'UPDATE' and old.status is not distinct from new.status then
        return new;
    end if;

    if new.status not in ('active', 'cancelled') then
        -- 'suspended' (pausa o pendiente de pago) y 'expired' no mueven dinero.
        return new;
    end if;

    select min(id) into v_branch_id from branches where organization_id = new.organization_id;

    if new.status = 'active' then
        select * into v_rule
          from accounting_rules
         where organization_id = new.organization_id
           and source_type = 'parking_pass'
           and event_type = 'paid'
           and is_active = true
         order by priority limit 1;

        if v_rule is null then
            select * into v_rule
              from accounting_rules
             where organization_id = new.organization_id
               and source_type = 'parking_pass'
               and is_active = true
             order by priority limit 1;
        end if;

        if v_rule is null then /* registro-sin-regla */ perform fn_log_journal_failure(new.organization_id, null, now(), tg_table_name, new.id::text, null, null, null, null, 'no_rule', 'Sin regla contable activa para ' || tg_table_name || ' (' || tg_op || ')'); return new; end if;

        v_entry_id := fn_create_journal_entry(
            p_organization_id := new.organization_id,
            p_branch_id := v_branch_id,
            p_entry_date := coalesce(new.updated_at, new.created_at, now()),
            p_memo := 'Pase Parqueadero - ' || coalesce(new.plan_name, new.id::text),
            p_source := 'parking_passes',
            p_source_id := new.id::text,
            p_debit_account := v_rule.debit_account_code,
            p_credit_account := v_rule.credit_account_code,
            p_amount := coalesce(new.price, 0),
            p_fact_key := v_clave_ingreso
        );
        return new;
    end if;

    -- 'cancelled': reversa solo si hubo ingreso.
    if not exists (
        select 1 from journal_entries
         where organization_id = new.organization_id
           and fact_key = v_clave_ingreso
    ) then
        return new;
    end if;

    select * into v_rule
      from accounting_rules
     where organization_id = new.organization_id
       and source_type = 'parking_pass'
       and event_type = 'reversed'
       and is_active = true
     order by priority limit 1;

    if v_rule is not null then
        v_debito := v_rule.debit_account_code;
        v_credito := v_rule.credit_account_code;
    else
        -- Sin regla de reversa: la de ingreso con las cuentas invertidas.
        select * into v_rule
          from accounting_rules
         where organization_id = new.organization_id
           and source_type = 'parking_pass'
           and event_type = 'paid'
           and is_active = true
         order by priority limit 1;
        if v_rule is null then /* registro-sin-regla */ perform fn_log_journal_failure(new.organization_id, null, now(), tg_table_name, new.id::text, null, null, null, null, 'no_rule', 'Sin regla contable activa para ' || tg_table_name || ' (' || tg_op || ')'); return new; end if;
        v_debito := v_rule.credit_account_code;
        v_credito := v_rule.debit_account_code;
    end if;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := new.organization_id,
        p_branch_id := v_branch_id,
        p_entry_date := coalesce(new.updated_at, now()),
        p_memo := 'Reversa Pase Parqueadero - ' || coalesce(new.plan_name, new.id::text),
        p_source := 'parking_passes',
        p_source_id := new.id::text,
        p_debit_account := v_debito,
        p_credit_account := v_credito,
        p_amount := coalesce(new.price, 0),
        p_fact_key := 'parking_pass:reversed:' || new.id::text
    );

    return new;
end;
$f$;

comment on function public.fn_auto_journal_parking_pass() is
  'Asiento del pase de parqueadero: ingreso una vez al quedar activo (fact_key parking_pass:paid:<id>), reversa una vez al cancelarse si hubo ingreso. Suspender no asienta.';

create or replace function public.fn_auto_journal_parking_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
    v_rule record;
    v_amount numeric;
    v_description text;
    v_org_id integer;
    v_branch_id integer;
    v_source_type text;
    v_event_type text;
    v_vehicle_plate text;
    v_has_invoice boolean;
    v_payment_method text;
begin
    -- Solo para pagos de parking
    if new.source not in ('parking_session', 'parking_pass') then
        return new;
    end if;

    -- Solo pagos completados
    if new.status != 'completed' then
        return new;
    end if;

    v_org_id := new.organization_id;
    v_branch_id := coalesce(new.branch_id, 0);
    v_amount := coalesce(new.amount, 0);
    v_payment_method := coalesce(new.method, 'cash');

    if v_amount <= 0 then
        return new;
    end if;

    -- Verificar si el pago ya tiene factura vinculada (reference = INV:xxx)
    -- Si tiene factura, trg_auto_journal_sale ya contabilizó el ingreso
    v_has_invoice := new.reference is not null and new.reference like 'INV:%';

    if v_has_invoice then
        return new;
    end if;

    -- El ingreso de un pase lo asienta fn_auto_journal_parking_pass al activarlo:
    -- el pago del mismo pase no lo asienta otra vez.
    if new.source = 'parking_pass' and exists (
        select 1 from journal_entries
         where organization_id = v_org_id
           and fact_key = 'parking_pass:paid:' || new.source_id
    ) then
        return new;
    end if;

    -- Determinar source_type y event_type
    if new.source = 'parking_session' then
        v_source_type := 'parking_session';

        select vehicle_plate into v_vehicle_plate
        from parking_sessions
        where id::text = new.source_id
        limit 1;

        if v_payment_method = 'credit' then
            v_event_type := 'paid_credit';
        else
            v_event_type := 'paid';
        end if;

        v_description := 'Parqueadero - Sesión ' || coalesce(v_vehicle_plate, new.source_id);
    else
        v_source_type := 'parking_pass';

        select plan_name into v_vehicle_plate
        from parking_passes
        where id::text = new.source_id
        limit 1;

        if v_payment_method = 'credit' then
            v_event_type := 'paid_credit';
        else
            v_event_type := 'paid';
        end if;

        v_description := 'Parqueadero - Pase ' || coalesce(v_vehicle_plate, new.source_id);
    end if;

    -- Buscar regla contable
    select * into v_rule
    from accounting_rules
    where organization_id = v_org_id
      and source_type = v_source_type
      and event_type = v_event_type
      and is_active = true
    order by priority
    limit 1;

    if not found then
        return new;
    end if;

    -- Crear asiento contable
    perform fn_create_journal_entry(
        v_org_id,
        v_branch_id,
        coalesce(new.created_at, now()),
        v_description,
        'parking_payment',
        new.id::text,
        v_rule.debit_account_code,
        v_rule.credit_account_code,
        v_amount,
        null,
        0,
        new.created_by
    );

    return new;
end;
$f$;
