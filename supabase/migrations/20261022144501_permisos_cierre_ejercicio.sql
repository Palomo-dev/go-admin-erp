create or replace function public.fn_cierre_ejercicio(
  p_organization_id integer,
  p_anio integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_branch integer;
  v_tz text;
  v_ini date;
  v_fin date;
  v_anual uuid;
  v_cuando timestamptz;
  v_cta record;
  v_neto numeric;
  v_resultado numeric := 0;
  v_n integer := 0;
  v_base text;
  v_clave text;
  v_intento integer;
  v_ya integer;
  v_d3605 numeric;
  v_c3605 numeric;
  v_d3610 numeric;
  v_c3610 numeric;
  v_u numeric;
  v_p numeric;
  v_monto numeric;
  v_lado_debito text;
  v_lado_credito text;
  v_abiertos uuid[];
begin
  perform public.fn_exigir_permiso_contable(p_organization_id, 'accounting.fiscal_year.close');
  if p_anio < 2000 or p_anio > 2100 then
    raise exception 'anio_invalido' using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.fiscal_periods fp
     where fp.organization_id = p_organization_id
       and fp.year = p_anio
       and fp.period_type = 'yearly'
       and fp.status <> 'open'
  ) then
    raise exception 'periodo_cerrado' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.chart_of_accounts c
     where c.organization_id = p_organization_id
       and c.account_code = '3605'
       and c.is_active is distinct from false
       and not public.fn_es_cuenta_de_titulo(p_organization_id, '3605')
  ) then
    raise exception 'faltan_cuentas_cierre' using errcode = '23514';
  end if;

  select b.id into v_branch
    from public.branches b
   where b.organization_id = p_organization_id
   order by b.id
   limit 1;
  if v_branch is null then
    raise exception 'sin_sucursal' using errcode = '23514';
  end if;

  v_tz := public.fn_timezone_for(p_organization_id, v_branch);
  select fp.id, fp.start_date, fp.end_date
    into v_anual, v_ini, v_fin
    from public.fiscal_periods fp
   where fp.organization_id = p_organization_id
     and fp.year = p_anio
     and fp.period_type = 'yearly'
     and fp.status = 'open'
   order by fp.id
   limit 1;
  if v_ini is null then
    v_ini := make_date(p_anio, 1, 1);
    v_fin := make_date(p_anio, 12, 31);
  end if;
  v_cuando := make_timestamptz(
    extract(year from v_fin)::int,
    extract(month from v_fin)::int,
    extract(day from v_fin)::int,
    12, 0, 0, v_tz
  );

  if not public.fn_is_period_open(p_organization_id, v_fin) then
    raise exception 'periodo_cerrado' using errcode = '23514';
  end if;

  for v_cta in
    select c.account_code as codigo,
           coalesce(sum(jl.debit), 0) as debito,
           coalesce(sum(jl.credit), 0) as credito
      from public.chart_of_accounts c
      join public.journal_lines jl
        on jl.organization_id = c.organization_id
       and jl.account_code = c.account_code
      join public.journal_entries je
        on je.id = jl.journal_entry_id
       and je.organization_id = c.organization_id
     where c.organization_id = p_organization_id
       and left(c.account_code, 1) in ('4', '5', '6', '7')
       and c.is_active is distinct from false
       and c.es_movimiento is distinct from false
       and not public.fn_es_cuenta_de_titulo(p_organization_id, c.account_code)
       and je.posted is true
       and (je.entry_date at time zone v_tz)::date between v_ini and v_fin
     group by c.account_code
    having abs(coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0)) >= 0.01
  loop
    v_neto := v_cta.debito - v_cta.credito;
    v_base := 'cierre-ejercicio:' || p_anio::text || ':' || v_cta.codigo;
    v_clave := v_base;
    v_intento := 1;
    loop
      v_ya := null;
      select je.id into v_ya
        from public.journal_entries je
       where je.organization_id = p_organization_id
         and je.fact_key = v_clave
       limit 1;
      exit when v_ya is null;
      v_intento := v_intento + 1;
      if v_intento > 12 then
        raise exception 'cierre_reintentos' using errcode = '23514';
      end if;
      v_clave := v_base || ':' || v_intento::text;
    end loop;

    if v_neto > 0 then
      perform public.fn_create_journal_entry(
        p_organization_id := p_organization_id,
        p_branch_id := v_branch,
        p_entry_date := v_cuando,
        p_memo := 'Cierre de ejercicio ' || p_anio::text || ' ' || v_cta.codigo,
        p_source := 'cierre_ejercicio',
        p_source_id := p_anio::text,
        p_debit_account := '3605',
        p_credit_account := v_cta.codigo,
        p_amount := abs(v_neto),
        p_created_by := auth.uid(),
        p_fact_key := v_clave
      );
    else
      perform public.fn_create_journal_entry(
        p_organization_id := p_organization_id,
        p_branch_id := v_branch,
        p_entry_date := v_cuando,
        p_memo := 'Cierre de ejercicio ' || p_anio::text || ' ' || v_cta.codigo,
        p_source := 'cierre_ejercicio',
        p_source_id := p_anio::text,
        p_debit_account := v_cta.codigo,
        p_credit_account := '3605',
        p_amount := abs(v_neto),
        p_created_by := auth.uid(),
        p_fact_key := v_clave
      );
    end if;
    v_n := v_n + 1;
  end loop;

  select
    coalesce(sum(jl.debit) filter (where jl.account_code = '3605'), 0),
    coalesce(sum(jl.credit) filter (where jl.account_code = '3605'), 0),
    coalesce(sum(jl.debit) filter (where jl.account_code = '3610'), 0),
    coalesce(sum(jl.credit) filter (where jl.account_code = '3610'), 0)
    into v_d3605, v_c3605, v_d3610, v_c3610
    from public.journal_lines jl
    join public.journal_entries je
      on je.id = jl.journal_entry_id
     and je.organization_id = p_organization_id
   where jl.organization_id = p_organization_id
     and jl.account_code in ('3605', '3610')
     and je.posted is true
     and (je.entry_date at time zone v_tz)::date between v_ini and v_fin;

  v_u := v_c3605 - v_d3605;
  v_p := v_d3610 - v_c3610;
  v_resultado := v_u - v_p;
  v_monto := null;
  v_lado_debito := null;
  v_lado_credito := null;

  if v_resultado >= -0.01 then
    if v_p > 0.01 then
      v_monto := v_p;
      v_lado_debito := '3605';
      v_lado_credito := '3610';
    end if;
  elsif v_u > 0.01 then
    v_monto := v_u;
    v_lado_debito := '3605';
    v_lado_credito := '3610';
  elsif v_u < -0.01 then
    v_monto := abs(v_u);
    v_lado_debito := '3610';
    v_lado_credito := '3605';
  end if;

  if v_monto is not null then
    if not exists (
      select 1 from public.chart_of_accounts c
       where c.organization_id = p_organization_id
         and c.account_code = '3610'
         and c.is_active is distinct from false
         and not public.fn_es_cuenta_de_titulo(p_organization_id, '3610')
    ) then
      raise exception 'faltan_cuentas_cierre' using errcode = '23514';
    end if;

    v_base := 'cierre-ejercicio:' || p_anio::text || ':resultado';
    v_clave := v_base;
    v_intento := 1;
    loop
      v_ya := null;
      select je.id into v_ya
        from public.journal_entries je
       where je.organization_id = p_organization_id
         and je.fact_key = v_clave
       limit 1;
      exit when v_ya is null;
      v_intento := v_intento + 1;
      if v_intento > 12 then
        raise exception 'cierre_reintentos' using errcode = '23514';
      end if;
      v_clave := v_base || ':' || v_intento::text;
    end loop;

    perform public.fn_create_journal_entry(
      p_organization_id := p_organization_id,
      p_branch_id := v_branch,
      p_entry_date := v_cuando,
      p_memo := 'Cierre de ejercicio ' || p_anio::text || ' resultado',
      p_source := 'cierre_ejercicio',
      p_source_id := p_anio::text,
      p_debit_account := v_lado_debito,
      p_credit_account := v_lado_credito,
      p_amount := v_monto,
      p_created_by := auth.uid(),
      p_fact_key := v_clave
    );
    v_n := v_n + 1;
  end if;

  select coalesce(array_agg(fp.id), array[]::uuid[])
    into v_abiertos
    from public.fiscal_periods fp
   where fp.organization_id = p_organization_id
     and fp.year = p_anio
     and fp.status = 'open';

  perform set_config('finanzas.cierre_autorizado', '1', true);

  if v_anual is null then
    insert into public.fiscal_periods (
      organization_id, year, month, period_type, start_date, end_date, status, closed_by, closed_at, notes
    ) values (
      p_organization_id, p_anio, null, 'yearly', v_ini, v_fin, 'closed', auth.uid(), now(),
      'Cierre de ejercicio'
    )
    returning id into v_anual;
  else
    update public.fiscal_periods
       set status = 'closed', closed_by = auth.uid(), closed_at = now(), updated_at = now()
     where id = v_anual and status = 'open';
  end if;

  update public.fiscal_periods
     set status = 'closed', closed_by = auth.uid(), closed_at = now(), updated_at = now()
   where organization_id = p_organization_id
     and year = p_anio
     and status = 'open';

  if v_anual is not null then
    perform public.fn_auditar_cierre_contable(
      p_organization_id,
      'fiscal_year',
      v_anual::text,
      'close',
      jsonb_build_object('anio', p_anio, 'origen', 'fn_cierre_ejercicio', 'asientos', v_n)
    );
  end if;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff)
  select p_organization_id,
         'fiscal_period',
         fp.id::text,
         'close',
         auth.uid(),
         jsonb_build_object('anio', fp.year, 'period_type', fp.period_type, 'origen', 'fn_cierre_ejercicio')
    from public.fiscal_periods fp
   where fp.id = any (v_abiertos)
      or fp.id = v_anual;

  return jsonb_build_object(
    'anio', p_anio,
    'asientos', v_n,
    'resultado', v_resultado,
    'cuenta_resultado', case when v_resultado < -0.01 then '3610' else '3605' end
  );
end;
$fn$;

revoke all on function public.fn_cierre_ejercicio(integer, integer) from public, anon;
grant execute on function public.fn_cierre_ejercicio(integer, integer) to authenticated;
