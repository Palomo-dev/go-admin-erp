-- Reversión de 20261116074847_hrm_f3_03_nomina_cierre_pago.
-- Restaura las versiones anteriores de fn_hr_aprobacion_al_cerrar (20261116071722), fn_auto_journal_payroll,
-- fn_auto_journal_payroll_period, fn_auto_journal_loan_installment, fn_recibo_serie_pago y las políticas de lectura
-- de payroll_slips y payroll_items (20261115042215).
-- ADVERTENCIA: no revierte datos. Los asientos publicados, los pagos y los cierres hechos quedan como están
-- (un asiento publicado se revierte con un contra-asiento, nunca borrándolo).

drop policy if exists payroll_slips_select on public.payroll_slips;
create policy payroll_slips_select on public.payroll_slips
  for select to authenticated
  using ((payroll_run_id in (select pr.id from public.payroll_runs pr join public.payroll_periods pp on pp.id = pr.payroll_period_id
                              where pp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.view'))))
         or ((status = any (array['approved'::text, 'paid'::text])) and (employment_id in (select public.fn_hr_mis_empleos()))));

drop policy if exists payroll_items_select on public.payroll_items;
create policy payroll_items_select on public.payroll_items
  for select to authenticated
  using ((payroll_slip_id in (select ps.id from public.payroll_slips ps
                                join public.payroll_runs pr on pr.id = ps.payroll_run_id
                                join public.payroll_periods pp on pp.id = pr.payroll_period_id
                               where pp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.view'))))
         or (payroll_slip_id in (select ps.id from public.payroll_slips ps
                                  where ps.status = any (array['approved'::text, 'paid'::text])
                                    and ps.employment_id in (select public.fn_hr_mis_empleos()))));

drop function if exists public.fn_hr_nomina_mis_colillas();
drop function if exists public.fn_hr_nomina_archivo_banco(uuid, integer, uuid, text, text, text);
drop function if exists public.fn_hr_nomina_ajuste_cerrar(uuid, integer, uuid);
drop function if exists public.fn_hr_nomina_ajuste_guardar(uuid, integer, uuid, jsonb, text);
drop function if exists public.fn_hr_nomina_ajuste_insumos(uuid, integer, uuid, text, text, text);
drop function if exists public.fn_hr_nomina_contabilizar(uuid, integer, uuid);
drop function if exists public.fn_hr_nomina_pagar(uuid, integer, uuid, integer, date, text);
drop function if exists public.fn_hr_nomina_cerrar(uuid, integer, uuid);
drop function if exists public.fn_hr_nomina_enviar_revision(uuid, integer, uuid);
drop function if exists public.fn_hr_nomina_bloqueos(integer, uuid);

create or replace function public.fn_recibo_serie_pago(p_source text)
returns text
language sql immutable parallel safe
set search_path to 'public', 'pg_temp'
as $function$
  select case when p_source in ('invoice_purchase', 'account_payable') then 'CE' else 'RC' end
$function$;

create or replace function public.fn_auto_journal_loan_installment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_loan RECORD;
    v_org_id integer;
    v_default_branch integer;
    v_memo text;
BEGIN
    -- Solo cuotas pagadas y solo cuando cambia el estado
    IF NEW.status NOT IN ('paid', 'completed') THEN
        RETURN NEW;
    END IF;

    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.amount, 0) <= 0 THEN
        RETURN NEW;
    END IF;

    -- Obtener organización desde employee_loans
    SELECT * INTO v_loan FROM employee_loans WHERE id = NEW.loan_id;
    IF v_loan IS NULL THEN
        RETURN NEW;
    END IF;

    v_org_id := v_loan.organization_id;
    SELECT MIN(id) INTO v_default_branch FROM branches WHERE organization_id = v_org_id;

    -- Buscar regla específica de installment/paid
    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = v_org_id
      AND source_type = 'installment'
      AND event_type = 'paid'
      AND is_active = true
    ORDER BY priority LIMIT 1;

    -- Fallback: cualquier regla de installment activa
    IF v_rule IS NULL THEN
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = v_org_id
          AND source_type = 'installment'
          AND is_active = true
        ORDER BY priority LIMIT 1;
    END IF;

    -- Fallback final: regla de loan/paid
    IF v_rule IS NULL THEN
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = v_org_id
          AND source_type = 'loan'
          AND event_type = 'paid'
          AND is_active = true
        ORDER BY priority LIMIT 1;
    END IF;

    IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure(coalesce((to_jsonb(NEW)->>'organization_id')::integer, v_org_id), NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')'); RETURN NEW;
    END IF;

    -- Memo diferenciado según loan_type
    v_memo := CASE v_loan.loan_type
        WHEN 'advance' THEN 'Descuento Anticipo N°' || NEW.installment_number::text || ' - ' || COALESCE(v_loan.loan_number, v_loan.id::text)
        ELSE 'Cuota préstamo N°' || NEW.installment_number::text || ' - ' || COALESCE(v_loan.loan_number, v_loan.id::text)
    END;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := v_org_id,
        p_branch_id := v_default_branch,
        p_entry_date := COALESCE(NEW.paid_at, NEW.updated_at, now()),
        p_memo := v_memo,
        p_source := 'loan_installments',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.amount
    );

    RETURN NEW;
END;
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

drop function if exists public.fn_hr_nomina_asentar(public.payroll_slips, text, integer, integer);

create or replace function public.fn_hr_aprobacion_al_cerrar(p_inst uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_inst public.hr_approval_instances;
  v_ultimo uuid;
  v_ev uuid;
  v_estado text;
  v_nov public.hr_attendance_novelties;
begin
  select * into v_inst from public.hr_approval_instances where id = p_inst;
  if not found or v_inst.status = 'pendiente' then return; end if;
  v_estado := case v_inst.status when 'aprobada' then 'aprobado' when 'rechazada' then 'rechazado' else 'anulado' end;
  select s.decided_by into v_ultimo from public.hr_approval_steps s
   where s.instance_id = p_inst and s.status in ('aprobado','rechazado')
   order by s.step_order desc limit 1;
  if v_inst.subject_table = 'hr_employment_events' then
    -- Todos los eventos de la solicitud (cargo + salario enlazados): juntos.
    update public.hr_employment_events ev
       set status = v_estado,
           approved_by = case when v_inst.status = 'aprobada' then v_ultimo else ev.approved_by end,
           approved_at = case when v_inst.status = 'aprobada' then now() else ev.approved_at end
     where ev.approval_instance_id = p_inst and ev.status = 'pendiente';
    if v_inst.status = 'aprobada' then
      for v_ev in select ev.id from public.hr_employment_events ev where ev.approval_instance_id = p_inst order by ev.created_at loop
        perform public.fn_hr_aplicar_evento(v_ev);
      end loop;
    end if;
  elsif v_inst.subject_table = 'hr_bank_account_requests' then
    update public.hr_bank_account_requests set status = v_estado
     where id = v_inst.subject_id and approval_instance_id = p_inst and status = 'pendiente';
    if v_inst.status = 'aprobada' then
      perform public.fn_hr_banco_aplicar_solicitud(v_inst.subject_id);
    end if;
  elsif v_inst.subject_table = 'hr_attendance_novelties' then
    -- ADR-002 §4: horas extra se pagan; tardanza, salida o ausencia quedan justificadas; el cambio de turno se aplica.
    update public.hr_attendance_novelties n
       set status = case v_inst.status when 'aprobada' then 'aprobada' when 'rechazada' then 'rechazada' else 'anulada' end,
           decided_at = now()
     where n.id = v_inst.subject_id and n.approval_instance_id = p_inst and n.status = 'pendiente'
     returning * into v_nov;
    if v_nov.id is not null and v_nov.kind = 'cambio_turno' and v_inst.status = 'aprobada' then
      perform public.fn_hr_cambio_turno_aplicar(v_nov.id, v_ultimo);
    end if;
  elsif v_inst.subject_table = 'timesheet_adjustments' then
    -- Ajuste de marca (Figma 20.10.6): aprobado, se agrega la marca manual con la hora pedida.
    update public.timesheet_adjustments a
       set status = case v_inst.status when 'aprobada' then 'approved' else 'rejected' end,
           approved_by = case when v_inst.status = 'aprobada' then v_ultimo else a.approved_by end,
           approved_at = now()
     where a.id = v_inst.subject_id and a.approval_instance_id = p_inst and a.status = 'pending';
    if v_inst.status = 'aprobada' then
      -- Sin sesión (service role) se aplica ya; con sesión lo aplica la ruta o el job.
      perform public.fn_hr_ajustes_aplicar_interno(v_inst.organization_id);
    end if;
  elsif v_inst.subject_table = 'leave_requests' then
    -- ADR-002 §5 y §6: vacaciones, licencias e incapacidades.
    update public.leave_requests
       set status = case v_inst.status when 'aprobada' then 'approved' when 'rechazada' then 'rejected' else 'cancelled' end,
           reviewed_by = v_ultimo, reviewed_at = now()
     where id = v_inst.subject_id and approval_instance_id = p_inst and status = 'requested';
  end if;
end;
$function$;
