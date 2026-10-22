-- Restaura fn_cierre_ejercicio al cuerpo de fase6_cierre_y_reportes
-- (20261022024619). No borra asientos de cierre ni reabre periodos.
-- Si también se revierte esa migración, este rollback va primero: el otro
-- hace drop function.

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
  v_clave text;
  v_ya integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_anio < 2000 or p_anio > 2100 then
    raise exception 'anio_invalido' using errcode = '22023';
  end if;

  select fp.id into v_anual
    from public.fiscal_periods fp
   where fp.organization_id = p_organization_id
     and fp.year = p_anio
     and fp.period_type = 'yearly'
   limit 1;
  if v_anual is not null and exists (
    select 1 from public.fiscal_periods fp
     where fp.id = v_anual and fp.status <> 'open'
  ) then
    raise exception 'periodo_cerrado' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.chart_of_accounts c
     where c.organization_id = p_organization_id
       and c.account_code = '3605'
       and c.is_active is distinct from false
       and not public.fn_es_cuenta_de_titulo(p_organization_id, '3605')
  ) or not exists (
    select 1 from public.chart_of_accounts c
     where c.organization_id = p_organization_id
       and c.account_code = '3610'
       and c.is_active is distinct from false
       and not public.fn_es_cuenta_de_titulo(p_organization_id, '3610')
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
  select fp.start_date, fp.end_date into v_ini, v_fin
    from public.fiscal_periods fp
   where fp.id = v_anual;
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
    v_resultado := v_resultado + (v_cta.credito - v_cta.debito);
    v_clave := 'cierre-ejercicio:' || p_anio::text || ':' || v_cta.codigo;
    v_ya := null;
    select je.id into v_ya
      from public.journal_entries je
     where je.organization_id = p_organization_id
       and je.fact_key = v_clave
     limit 1;
    if v_ya is null then
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
    end if;
  end loop;

  if v_resultado < -0.01 then
    v_clave := 'cierre-ejercicio:' || p_anio::text || ':resultado';
    v_ya := null;
    select je.id into v_ya
      from public.journal_entries je
     where je.organization_id = p_organization_id
       and je.fact_key = v_clave
     limit 1;
    if v_ya is null then
      perform public.fn_create_journal_entry(
        p_organization_id := p_organization_id,
        p_branch_id := v_branch,
        p_entry_date := v_cuando,
        p_memo := 'Cierre de ejercicio ' || p_anio::text || ' perdida a 3610',
        p_source := 'cierre_ejercicio',
        p_source_id := p_anio::text,
        p_debit_account := '3610',
        p_credit_account := '3605',
        p_amount := abs(v_resultado),
        p_created_by := auth.uid(),
        p_fact_key := v_clave
      );
      v_n := v_n + 1;
    end if;
  end if;

  if v_anual is null then
    insert into public.fiscal_periods (
      organization_id, year, month, period_type, start_date, end_date, status, closed_by, closed_at, notes
    ) values (
      p_organization_id, p_anio, null, 'yearly', v_ini, v_fin, 'closed', auth.uid(), now(),
      'Cierre de ejercicio'
    );
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
