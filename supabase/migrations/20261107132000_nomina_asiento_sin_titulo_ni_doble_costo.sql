-- Asientos de nómina: sin cuenta de título y sin costo patronal doble (hallazgo 9).
--
-- fn_auto_journal_payroll cargaba a 5195 el costo patronal. 5195 es de título en las 33
-- organizaciones y zz_trg_puc_linea_solo_movimiento rechaza la línea, así que aprobar una
-- colilla con aportes fallaba con una excepción y la colilla no se aprobaba. Las líneas van
-- a la cuenta de gasto que la organización ya tiene en su regla de nómina (5105, Gastos de
-- personal, en las 33). No hay cuenta nueva.
--
-- fn_auto_journal_payroll_period cargaba otra vez el costo patronal al aprobar el periodo:
-- el devengo de la colilla ya lo trae. Hoy no se veía porque payrollCalculationService
-- grababa total_employer_cost = 0 con un TODO. El periodo deja de devengar cuando las
-- colillas devengan.
--
-- Queda pendiente del Contador, sin tocar aquí:
--  * Hoy todo el devengo se abona a nómina por pagar. Separar aportes (2370), prestaciones
--    (25xx o 26xx) y retención (23650501) es criterio contable.
--  * El pago del periodo cargaba 2370, que el devengo de la colilla no abona. Ese pago no
--    se contabiliza: queda en la bandeja de pendientes con su importe.
--
-- También:
--  * Cada asiento lleva fact_key: volver a aprobar no duplica.
--  * Cuenta o periodo inválidos dejan un pendiente en lugar de tumbar la aprobación.
--  * Las líneas van en pesos enteros, como el resto de asientos.
--
-- payroll_slips y payroll_periods estaban vacías al aplicar: no hay asientos históricos.
--
-- Rollback: supabase/rollbacks/20261107132000_nomina_asiento_sin_titulo_ni_doble_costo_rollback.sql

create or replace function public.fn_auto_journal_payroll()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rule record;
  v_entry_id integer;
  v_run record;
  v_org_id integer;
  v_branch_id integer;
  v_event_type text;
  v_memo text;
  v_source_id text;
  v_fact_key text;
  v_total numeric := 0;
  v_country_code text;
  v_fecha timestamptz;
  v_gasto text;
  v_pasivo text;
  v_cuenta_mala text;
  v_linea record;
begin
  if new.status is null then
    return new;
  end if;

  if (new.status = 'approved' or new.status = 'paid')
     and (old.status is distinct from new.status) then

    select * into v_run from public.payroll_runs where id = new.payroll_run_id;
    if v_run is null then
      return new;
    end if;

    select organization_id into v_org_id
      from public.payroll_periods
     where id = v_run.payroll_period_id;
    if v_org_id is null then
      return new;
    end if;

    v_event_type := case new.status when 'approved' then 'created' when 'paid' then 'paid' end;

    select * into v_rule
      from public.accounting_rules
     where organization_id = v_org_id
       and source_type = 'payroll'
       and event_type = v_event_type
       and is_active = true
     order by priority limit 1;

    if v_rule is null then
      select * into v_rule
        from public.accounting_rules
       where organization_id = v_org_id
         and source_type = 'payroll'
         and is_active = true
       order by priority limit 1;
    end if;

    select min(id) into v_branch_id from public.branches where organization_id = v_org_id;
    select country_code into v_country_code from public.organizations where id = v_org_id;

    v_memo := 'Nómina - Slip: ' || new.id::text || ' (' || v_event_type || ')';
    v_source_id := new.id::text || ':' || v_event_type;
    v_fact_key := 'payroll_slip:' || new.id::text || ':' || v_event_type;

    if v_rule is null then
      perform public.fn_log_journal_failure(v_org_id, v_branch_id, now(), 'payroll_slips', v_source_id,
        v_fact_key, null, null, new.gross_pay, 'no_rule', 'Sin regla contable activa de nómina');
      return new;
    end if;

    if v_event_type = 'paid' then
      v_entry_id := public.fn_create_journal_entry(
        p_organization_id := v_org_id,
        p_branch_id := v_branch_id,
        p_entry_date := coalesce(new.paid_at, new.updated_at, now()),
        p_memo := v_memo,
        p_source := 'payroll_slips',
        p_source_id := v_source_id,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := new.net_pay,
        p_fact_key := v_fact_key
      );
      return new;
    end if;

    if v_country_code is distinct from 'COL' then
      v_entry_id := public.fn_create_journal_entry(
        p_organization_id := v_org_id,
        p_branch_id := v_branch_id,
        p_entry_date := coalesce(new.updated_at, now()),
        p_memo := v_memo,
        p_source := 'payroll_slips',
        p_source_id := v_source_id,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := new.net_pay,
        p_fact_key := v_fact_key
      );
      return new;
    end if;

    -- Devengo en Colombia: varias líneas de gasto contra nómina por pagar.
    if exists (select 1 from public.journal_entries e
                where e.organization_id = v_org_id and e.fact_key = v_fact_key) then
      return new;
    end if;

    v_fecha := coalesce(new.updated_at, now());
    v_gasto := v_rule.debit_account_code;
    v_pasivo := coalesce(public.fn_cuenta_por_clave(v_org_id, v_branch_id, 'nomina_por_pagar'), '25050501');

    select sum(round(coalesce(x.monto, 0), 0)) into v_total
      from unnest(array[new.gross_pay, new.employer_health, new.employer_pension, new.employer_arl,
                        new.employer_parafiscales, new.employer_severance, new.employer_severance_interest,
                        new.employer_vacation_provision, new.employer_bonus_provision]) as x(monto);
    if coalesce(v_total, 0) <= 0 then
      return new;
    end if;

    select c.cuenta into v_cuenta_mala
      from unnest(array[v_gasto, v_pasivo]) as c(cuenta)
     where not exists (
       select 1 from public.chart_of_accounts a
        where a.organization_id = v_org_id and a.account_code = c.cuenta
          and a.es_movimiento is true and coalesce(a.is_active, true)
     )
     limit 1;
    if v_cuenta_mala is not null then
      perform public.fn_log_journal_failure(v_org_id, v_branch_id, v_fecha, 'payroll_slips', v_source_id,
        v_fact_key, v_gasto, v_pasivo, v_total, 'cuenta_no_es_de_movimiento',
        'La cuenta ' || v_cuenta_mala || ' no existe o es de título');
      return new;
    end if;

    if not public.fn_is_period_open(v_org_id, (v_fecha at time zone public.fn_timezone_for(v_org_id, v_branch_id))::date) then
      perform public.fn_log_journal_failure(v_org_id, v_branch_id, v_fecha, 'payroll_slips', v_source_id,
        v_fact_key, v_gasto, v_pasivo, v_total, 'period_closed', 'Periodo contable cerrado');
      return new;
    end if;

    insert into public.journal_entries (
      organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key
    ) values (
      v_org_id, v_branch_id, v_fecha, v_memo, 'payroll_slips', v_source_id, true, v_fact_key
    ) returning id into v_entry_id;

    for v_linea in
      select d.descripcion, round(coalesce(d.monto, 0), 0) as monto
        from (values
          (1, 'Salario base', new.gross_pay),
          (2, 'Salud patronal', new.employer_health),
          (3, 'Pensión patronal', new.employer_pension),
          (4, 'ARL patronal', new.employer_arl),
          (5, 'Parafiscales', new.employer_parafiscales),
          (6, 'Provisión cesantías', new.employer_severance),
          (7, 'Interés cesantías', new.employer_severance_interest),
          (8, 'Provisión vacaciones', new.employer_vacation_provision),
          (9, 'Provisión prima', new.employer_bonus_provision)
        ) as d(orden, descripcion, monto)
       where round(coalesce(d.monto, 0), 0) > 0
       order by d.orden
    loop
      insert into public.journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
      values (v_entry_id, v_org_id, v_gasto, v_linea.descripcion, v_linea.monto, 0);
    end loop;

    insert into public.journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
    values (v_entry_id, v_org_id, v_pasivo, 'Nómina por pagar', 0, v_total);
  end if;

  return new;
end;
$function$;

create or replace function public.fn_auto_journal_payroll_period()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rule record;
  v_entry_id integer;
  v_branch_id integer;
  v_event_type text;
  v_amount numeric;
  v_country_code text;
  v_fecha timestamptz;
begin
  if new.status is null then
    return new;
  end if;

  if (new.status = 'approved' or new.status = 'paid')
     and (old.status is distinct from new.status) then

    v_event_type := case new.status when 'approved' then 'created' when 'paid' then 'paid' end;

    -- total_employer_cost trae el devengado más los aportes y provisiones: el periodo solo
    -- responde por el costo patronal.
    v_amount := greatest(coalesce(new.total_employer_cost, 0) - coalesce(new.total_gross, 0), 0);
    if v_amount <= 0 then
      return new;
    end if;

    select country_code into v_country_code from public.organizations where id = new.organization_id;
    select min(id) into v_branch_id from public.branches where organization_id = new.organization_id;
    v_fecha := coalesce(new.payment_date::timestamptz, new.approved_at, new.updated_at, now());

    if v_country_code = 'COL' then
      -- Las colillas ya devengaron este costo. Devengarlo aquí lo contaría dos veces.
      if v_event_type = 'created' then
        return new;
      end if;
      -- Pagar aportes y provisiones contra 2370 no cuadra con un devengo que abona nómina
      -- por pagar. Queda a la vista hasta que el Contador defina el destino.
      perform public.fn_log_journal_failure(new.organization_id, v_branch_id, v_fecha, 'payroll_periods',
        new.id::text || ':paid', 'payroll_period:' || new.id::text || ':paid', null, null, v_amount,
        'criterio_contador', 'Pago de aportes y provisiones del periodo sin destino contable definido');
      return new;
    end if;

    select * into v_rule
      from public.accounting_rules
     where organization_id = new.organization_id
       and source_type = 'payroll_period'
       and event_type = v_event_type
       and is_active = true
     order by priority limit 1;

    if v_rule is null then
      select * into v_rule
        from public.accounting_rules
       where organization_id = new.organization_id
         and source_type = 'payroll_period'
         and is_active = true
       order by priority limit 1;
    end if;

    if v_rule is null then
      perform public.fn_log_journal_failure(new.organization_id, v_branch_id, v_fecha, 'payroll_periods',
        new.id::text || ':' || v_event_type, 'payroll_period:' || new.id::text || ':' || v_event_type,
        null, null, v_amount, 'no_rule', 'Sin regla contable activa de periodo de nómina');
      return new;
    end if;

    v_entry_id := public.fn_create_journal_entry(
      p_organization_id := new.organization_id,
      p_branch_id := v_branch_id,
      p_entry_date := v_fecha,
      p_memo := 'Cierre Período Nómina - ' || coalesce(new.name, new.id::text) || ' (' || v_event_type || ')',
      p_source := 'payroll_periods',
      p_source_id := new.id::text || ':' || v_event_type,
      p_debit_account := v_rule.debit_account_code,
      p_credit_account := v_rule.credit_account_code,
      p_amount := v_amount,
      p_fact_key := 'payroll_period:' || new.id::text || ':' || v_event_type
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.fn_auto_journal_payroll() from public, anon, authenticated;
revoke all on function public.fn_auto_journal_payroll_period() from public, anon, authenticated;
grant execute on function public.fn_auto_journal_payroll() to service_role;
grant execute on function public.fn_auto_journal_payroll_period() to service_role;
